// The HUD: reads the simulation each frame and writes the DOM only where a value changed. The
// crosshair gap is the weapon's true inaccuracy at that moment.
import { MOVE } from '../config.js';
import { SIDE_NAME } from '../palette.js';
import { activeWeapon } from '../sim/soldier.js';
import { inaccuracy, NADE_NAMES, WEAPONS } from '../sim/weapons.js';
import { buyOpen, inBuyZone } from '../sim/shop.js';
import { sideOf } from '../sim/round.js';

const $ = (id) => document.getElementById(id);
const REASONS = { elimination: 'all enemies down', time: 'time ran out', detonation: 'the charge went off', defuse: 'the charge was defused' };
const clock = (t) => `${Math.floor(Math.max(0, t) / 60)}:${String(Math.floor(Math.max(0, t) % 60)).padStart(2, '0')}`;

export function createHud() {
	const el = {};
	for (const id of ['callout', 'money', 'timer', 'phase', 'feed', 'crosshair', 'hitmarker', 'hp', 'armor', 'weapon-name', 'mag', 'reserve',
		'nades', 'action', 'action-label', 'action-fill', 'hint', 'banner', 'banner-title', 'banner-sub', 'spectate', 'damage', 'flashbang', 'scope',
		'board', 'board-body', 'clock']) el[id] = $(id);
	const teams = [0, 1].map((i) => ({ root: $(`team${i}`), name: $(`team${i}`).querySelector('.name'), score: $(`team${i}`).querySelector('.score'), pips: $(`team${i}`).querySelector('.pips') }));
	const cache = new Map();
	const set = (key, node, value, prop = 'textContent') => {
		if (cache.get(key) === value) return;
		cache.set(key, value);
		node[prop] = value;
	};
	const toggle = (key, node, name, on) => {
		if (cache.get(key) === on) return;
		cache.set(key, on);
		node.classList.toggle(name, on);
	};

	const feed = [];
	let bannerUntil = 0, hitUntil = 0, hurt = 0, boardAt = 0;

	function banner(title, sub, now, seconds) {
		el['banner-title'].textContent = title;
		el['banner-sub'].textContent = sub;
		bannerUntil = now + seconds;
	}

	function pushFeed(killer, victim, weapon, head, viewer, now) {
		const li = document.createElement('li');
		const name = (s) => `<span class="${s.side}">${s.name}</span>`;
		const label = WEAPONS[weapon]?.name ?? (weapon === 'frag' ? 'Frag' : 'Charge');
		li.innerHTML = killer === victim ? `<em>${label}</em> ${name(victim)}` : `${name(killer)} <em>${label}${head ? ' ◉' : ''}</em> ${name(victim)}`;
		if (killer === viewer || victim === viewer) li.className = 'mine';
		el.feed.prepend(li);
		feed.unshift({ li, until: now + 6 });
		while (feed.length > 5) feed.pop().li.remove();
	}

	return {
		event(e, sim, viewer) {
			const now = sim.time;
			if (e.type === 'kill') pushFeed(e.o, e.s, e.id, e.n === 1, viewer, now);
			else if (e.type === 'hit') {
				if (e.o === viewer && e.s !== viewer) { hitUntil = now + 0.12; toggle('headhit', el.hitmarker, 'head', e.id === 'head'); }
				if (e.s === viewer) hurt = Math.min(1, hurt + e.n / 60);
			} else if (e.type === 'roundStart') {
				const side = sideOf(sim, viewer.squad);
				banner(`Round ${e.n}`, side === 'atk' ? `You attack with ${SIDE_NAME.atk}: plant the charge on A or B.` : `You defend with ${SIDE_NAME.def}: hold both sites.`, now, 3.5);
			} else if (e.type === 'live') banner('Go', '', now, 0.9);
			else if (e.type === 'planted') banner('Charge armed', `Site ${e.id}`, now, 2.2);
			else if (e.type === 'roundEnd') {
				const won = e.n === viewer.squad;
				banner(won ? 'Round won' : 'Round lost', `${SIDE_NAME[sideOf(sim, e.n)]} win: ${REASONS[e.id]}.`, now, 4.5);
			} else if (e.type === 'halftime') banner('Half-time', 'Sides swap. Money resets to $800.', now, 4);
		},

		update(sim, viewer, me, camera, dt) {
			const now = sim.time;
			const r = sim.round;
			for (let i = 0; i < 2; i++) {
				const side = sideOf(sim, i);
				set(`tn${i}`, teams[i].name, i === me.squad ? `You · ${SIDE_NAME[side]}` : SIDE_NAME[side]);
				set(`ts${i}`, teams[i].score, String(sim.match.scores[i]));
				set(`tc${i}`, teams[i].root, `team ${side}`, 'className');
				let pips = '';
				for (const s of sim.soldiers) if (s.squad === i) pips += s.alive ? '●' : '○';
				set(`tp${i}`, teams[i].pips, pips);
			}
			const planted = sim.charge.state === 'planted';
			set('timer', el.timer, clock(Math.ceil(r.timer)));
			set('phase', el.phase, r.phase === 'freeze' ? 'Buy phase' : planted ? 'Charge armed' : r.phase === 'over' ? 'Round over' : `Round ${r.number}`);
			toggle('armed', el.clock, 'armed', planted);

			const w = activeWeapon(viewer);
			set('hp', el.hp, String(Math.max(0, Math.ceil(viewer.hp))));
			set('armor', el.armor, viewer.armor > 0 ? `${Math.ceil(viewer.armor)}${viewer.helmet ? ' H' : ''}` : '0');
			set('money', el.money, `$${viewer.money}`);
			set('callout', el.callout, sim.grid.calloutAt(viewer.pos.x, viewer.pos.z));
			set('wname', el['weapon-name'], w ? w.def.name : NADE_NAMES[viewer.nadeType]);
			set('mag', el.mag, w ? String(w.mag) : String(viewer.nades[viewer.nadeType]));
			set('reserve', el.reserve, w ? `/ ${w.reserve}` : '');
			toggle('empty', el.mag, 'empty', w !== null && w.mag === 0);
			const n = viewer.nades;
			const nadeKey = n.frag * 100 + n.flash * 10 + n.smoke;
			if (cache.get('nades') !== nadeKey) {
				cache.set('nades', nadeKey);
				el.nades.innerHTML = '<i class="frag"></i>'.repeat(n.frag) + '<i class="flash"></i>'.repeat(n.flash) + '<i class="smoke"></i>'.repeat(n.smoke);
			}

			// Plant / defuse progress and context hints.
			const c = sim.charge;
			const working = c.worker === viewer && c.progress > 0;
			toggle('action', el.action, 'on', working);
			if (working) {
				const total = c.state === 'planted' ? (viewer.kit ? 3 : 6) : 3.2;
				set('alabel', el['action-label'], c.state === 'planted' ? 'Defusing' : 'Planting');
				el['action-fill'].style.width = `${Math.min(100, (c.progress / total) * 100)}%`;
			}
			let hint = '';
			if (viewer.alive && me === viewer && !working) {
				const zone = sim.grid.zoneAt(viewer.pos.x, viewer.pos.z);
				if (viewer.hasCharge && zone) hint = 'Hold E to plant the charge';
				else if (viewer.hasCharge && r.phase === 'live') hint = 'You carry the charge: take it to site A or B';
				else if (planted && viewer.side === 'def' && Math.hypot(viewer.pos.x - c.x, viewer.pos.z - c.z) < 1.5) hint = 'Hold E to defuse';
				else if (buyOpen(sim) && inBuyZone(sim, viewer)) hint = 'B  buy menu';
			}
			set('hint', el.hint, hint);
			set('spectate', el.spectate, viewer !== me ? `Spectating ${viewer.name}  ·  click for next` : '');

			// Crosshair gap from the true cone; hit marker; overlays.
			const f = window.innerHeight / 2 / Math.tan((camera.fov * Math.PI) / 360);
			const gap = w ? 3 + Math.tan(inaccuracy(viewer, w, MOVE.runSpeed)) * f : 6;
			const gapPx = `${Math.min(60, gap).toFixed(1)}px`;
			if (cache.get('gap') !== gapPx) { cache.set('gap', gapPx); el.crosshair.style.setProperty('--gap', gapPx); }
			toggle('xhide', el.crosshair, 'hidden', viewer.scoped || !viewer.alive);
			toggle('hit', el.hitmarker, 'on', now < hitUntil);
			hurt = Math.max(0, hurt - dt * 1.6);
			set('hurt', el.damage.style, hurt.toFixed(2), 'opacity');
			set('blind', el.flashbang.style, Math.min(1, viewer.flash / 1.6).toFixed(2), 'opacity');
			toggle('scope', el.scope, 'on', viewer.scoped && viewer.alive);
			toggle('banner', el.banner, 'on', now < bannerUntil);
			for (let i = feed.length - 1; i >= 0; i--) if (now > feed[i].until) feed.splice(i, 1)[0].li.remove();
		},

		board(sim, me, show) {
			el.board.hidden = !show;
			if (!show || performance.now() < boardAt) return;
			boardAt = performance.now() + 250;
			const rows = sim.soldiers.slice().sort((a, b) => a.squad - b.squad || b.kills - a.kills);
			el['board-body'].innerHTML = rows.map((s) => `<tr class="${s.side}${s === me ? ' me' : ''}${s.alive ? '' : ' dead'}">`
				+ `<td>${s.name}</td><td>${SIDE_NAME[s.side]}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.damageDealt}</td><td>$${s.money}</td></tr>`).join('');
		},
	};
}
