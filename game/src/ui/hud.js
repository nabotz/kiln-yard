// The HUD: reads the simulation each frame and writes the DOM only where a value changed. The
// crosshair gap is the weapon's true inaccuracy at that moment.
import { MOVE, MATCH } from '../config.js';
import { SIDE_NAME } from '../palette.js';
import { activeWeapon } from '../sim/soldier.js';
import { inaccuracy, NADE_NAMES, WEAPONS } from '../sim/weapons.js';
import { buyOpen, inBuyZone } from '../sim/shop.js';
import { sideOf } from '../sim/round.js';

const $ = (id) => document.getElementById(id);
const REASONS = { elimination: 'all enemies down', time: 'time ran out', detonation: 'the charge went off', defuse: 'the charge was defused' };
// Formats for values the HUD caches as numbers (or constant strings), so a steady frame builds
// no new strings: text is only made when a value changes.
const clock = (t) => `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
const phaseLabel = (n) => (n === -1 ? 'Buy phase' : n === -2 ? 'Round over' : n === -3 ? 'Charge armed' : `Round ${n}`);
const armorLabel = (v) => (v < 2 ? '0' : `${v >> 1}${v & 1 ? ' H' : ''}`);
const reserveLabel = (v) => (v < 0 ? '' : `/ ${v}`);
const percent = (v) => `${v}%`;
const dollars = (v) => `$${v}`;
const fiftieths = (v) => String(v / 50);
const turned = (v) => `rotate(${v}deg)`;
const spectating = (s) => (s ? `Spectating ${s.name}  ·  click for next` : '');

export function createHud() {
	const el = {};
	for (const id of ['callout', 'money', 'timer', 'phase', 'feed', 'crosshair', 'hitmarker', 'hp', 'armor', 'weapon-name', 'mag', 'reserve',
		'action', 'action-label', 'action-fill', 'hint', 'banner', 'banner-title', 'banner-sub', 'spectate', 'damage', 'flashbang', 'scope',
		'board', 'board-body', 'clock', 'radio', 'slots', 'hp-bar', 'armor-bar', 'hitdir']) el[id] = $(id);
	const teams = [0, 1].map((i) => ({ root: $(`team${i}`), name: $(`team${i}`).querySelector('.name'), score: $(`team${i}`).querySelector('.score'), pips: $(`team${i}`).querySelector('.pips') }));
	const cache = new Map();
	const show = (key, value, node, format = String, prop = 'textContent') => {
		if (cache.get(key) === value) return;
		cache.set(key, value);
		node[prop] = format(value);
	};
	const toggle = (key, node, name, on) => {
		if (cache.get(key) === on) return;
		cache.set(key, on);
		node.classList.toggle(name, on);
	};

	const feed = [], calls = [];
	const slots = { primary: null, secondary: null, slot: '', nades: -1 };
	let bannerUntil = 0, hitUntil = 0, hurt = 0, boardAt = 0, shotAt = -9, shotFrom = 0;

	function banner(title, sub, now, seconds) {
		el['banner-title'].textContent = title;
		el['banner-sub'].textContent = sub;
		bannerUntil = now + seconds;
	}

	// A timed line at the top of a list (the kill feed, the radio); the oldest goes past `max`.
	function pushLine(lines, root, html, className, until, max) {
		const li = document.createElement('li');
		li.innerHTML = html;
		li.className = className;
		root.prepend(li);
		lines.unshift({ li, until });
		while (lines.length > max) lines.pop().li.remove();
	}
	const expire = (lines, now) => {
		for (let i = lines.length - 1; i >= 0; i--) if (now > lines[i].until) lines.splice(i, 1)[0].li.remove();
	};
	const tag = (s) => `<span class="${s.side}">${s.name}</span>`;

	function pushKill(killer, victim, weapon, head, viewer, now) {
		const label = WEAPONS[weapon]?.name ?? (weapon === 'frag' ? 'Frag' : 'Charge');
		const html = killer === victim ? `<em>${label}</em> ${tag(victim)}` : `${tag(killer)} <em>${label}${head ? ' ◉' : ''}</em> ${tag(victim)}`;
		pushLine(feed, el.feed, html, killer === viewer || victim === viewer ? 'mine' : '', now + 6, 5);
	}

	return {
		event(e, sim, viewer) {
			const now = sim.time;
			if (e.type === 'kill') pushKill(e.o, e.s, e.id, e.n === 1, viewer, now);
			else if (e.type === 'radio' && e.s.squad === viewer.squad) pushLine(calls, el.radio, `${tag(e.s)} ${e.id}`, '', now + 5, 4);
			else if (e.type === 'hit') {
				if (e.o === viewer && e.s !== viewer) { hitUntil = now + 0.12; toggle('headhit', el.hitmarker, 'head', e.id === 'head'); }
				if (e.s === viewer) hurt = Math.min(1, hurt + e.n / 60);
				if (e.s === viewer && e.o !== viewer) {
					shotAt = now;
					shotFrom = Math.atan2(-(e.o.pos.x - viewer.pos.x), -(e.o.pos.z - viewer.pos.z));
				}
			} else if (e.type === 'roundStart') {
				const side = sideOf(sim, viewer.squad);
				banner(`Round ${e.n}`, side === 'atk' ? `You attack with ${SIDE_NAME.atk}: plant the charge on A or B.` : `You defend with ${SIDE_NAME.def}: hold both sites.`, now, 3.5);
			} else if (e.type === 'live') banner('Go', '', now, 0.9);
			else if (e.type === 'planted') banner('Charge armed', `Site ${e.id}`, now, 2.2);
			else if (e.type === 'roundEnd') {
				const won = e.n === viewer.squad;
				const what = sim.match.winner >= 0 ? 'Match' : 'Round';
				banner(`${what} ${won ? 'won' : 'lost'}`, `${SIDE_NAME[sideOf(sim, e.n)]} win: ${REASONS[e.id]}.`, now, 4.5);
			} else if (e.type === 'halftime') banner('Half-time', 'Sides swap. Money resets to $800.', now, 4);
		},

		update(sim, viewer, me, camera, dt) {
			const now = sim.time;
			const r = sim.round;
			for (let i = 0; i < 2; i++) {
				let alive = 0;
				for (const s of sim.soldiers) if (s.squad === i && s.alive) alive++;
				const side = sideOf(sim, i), t = teams[i];
				const key = sim.match.scores[i] * 100 + alive * 2 + (side === 'atk' ? 1 : 0);
				if (t.key === key) continue;
				t.key = key;
				t.name.textContent = i === me.squad ? `You · ${SIDE_NAME[side]}` : SIDE_NAME[side];
				t.score.textContent = String(sim.match.scores[i]);
				t.root.className = `team panel ${side}`;
				t.pips.textContent = '●'.repeat(alive) + '○'.repeat(MATCH.teamSize - alive);
			}
			const planted = sim.charge.state === 'planted';
			show('timer', Math.max(0, Math.ceil(r.timer)), el.timer, clock);
			show('phase', r.phase === 'freeze' ? -1 : r.phase !== 'live' ? -2 : planted ? -3 : r.number, el.phase, phaseLabel);
			toggle('armed', el.clock, 'armed', planted && r.phase === 'live');

			const w = activeWeapon(viewer);
			const hp = Math.max(0, Math.ceil(viewer.hp)), armor = Math.ceil(viewer.armor);
			show('hp', hp, el.hp);
			show('hpbar', hp, el['hp-bar'].style, percent, 'width');
			show('armor', armor * 2 + (viewer.helmet ? 1 : 0), el.armor, armorLabel);
			show('armorbar', armor, el['armor-bar'].style, percent, 'width');
			show('money', viewer.money, el.money, dollars);
			show('callout', sim.grid.calloutAt(viewer.pos.x, viewer.pos.z), el.callout);
			show('wname', w ? w.def.name : NADE_NAMES[viewer.nadeType], el['weapon-name']);
			show('mag', w ? w.mag : viewer.nades[viewer.nadeType], el.mag);
			show('reserve', w ? w.reserve : -1, el.reserve, reserveLabel);
			toggle('empty', el.mag, 'empty', w !== null && w.mag === 0);

			// The loadout strip: what keys 1, 2 and 4 hold, the one in hand lit.
			const n = viewer.nades, held = n.frag + n.flash + n.smoke;
			if (slots.primary !== viewer.primary || slots.secondary !== viewer.secondary || slots.slot !== viewer.slot || slots.nades !== held) {
				Object.assign(slots, { primary: viewer.primary, secondary: viewer.secondary, slot: viewer.slot, nades: held });
				const item = (key, slot, label) => `<i${viewer.slot === slot ? ' class="on"' : ''}>${key} ${label}</i>`;
				const nades = ['frag', 'flash', 'smoke'].filter((t) => n[t] > 0).map((t) => (n[t] > 1 ? `${NADE_NAMES[t]} ×${n[t]}` : NADE_NAMES[t]));
				el.slots.innerHTML = (viewer.primary ? item(1, 'primary', viewer.primary.def.name) : '')
					+ item(2, 'secondary', viewer.secondary.def.name) + (held > 0 ? item(4, 'nade', nades.join(' · ')) : '');
			}

			// Plant / defuse progress and context hints.
			const c = sim.charge;
			const working = c.worker === viewer && c.progress > 0;
			toggle('action', el.action, 'on', working);
			if (working) {
				const defusing = c.state === 'planted';
				show('alabel', defusing ? 'Defusing' : 'Planting', el['action-label']);
				show('afill', Math.min(100, Math.round((c.progress / (defusing ? (viewer.kit ? 3 : 6) : 3.2)) * 100)), el['action-fill'].style, percent, 'width');
			}
			let hint = '';
			if (viewer.alive && me === viewer && !working) {
				const zone = sim.grid.zoneAt(viewer.pos.x, viewer.pos.z);
				if (viewer.hasCharge && zone) hint = 'Hold E to plant the charge';
				else if (viewer.hasCharge && r.phase === 'live') hint = 'You carry the charge: take it to site A or B';
				else if (planted && viewer.side === 'def' && Math.hypot(viewer.pos.x - c.x, viewer.pos.z - c.z) < 1.5) hint = 'Hold E to defuse';
				else if (buyOpen(sim) && inBuyZone(sim, viewer)) hint = 'B  buy menu';
			}
			show('hint', hint, el.hint);
			show('spectate', viewer === me ? null : viewer, el.spectate, spectating);

			// Crosshair gap (half pixels) from the true cone; hit marker; overlays.
			const f = window.innerHeight / 2 / Math.tan((camera.fov * Math.PI) / 360);
			const gap = Math.round(Math.min(60, w ? 3 + Math.tan(inaccuracy(viewer, w, MOVE.runSpeed)) * f : 6) * 2);
			if (cache.get('gap') !== gap) { cache.set('gap', gap); el.crosshair.style.setProperty('--gap', `${gap / 2}px`); }
			toggle('xhide', el.crosshair, 'hidden', viewer.scoped || !viewer.alive);
			toggle('hit', el.hitmarker, 'on', now < hitUntil);
			hurt = Math.max(0, hurt - dt * 1.6);
			show('hurt', Math.round(hurt * 50), el.damage.style, fiftieths, 'opacity');
			show('blind', Math.round(Math.min(1, viewer.flash / 1.6) * 50), el.flashbang.style, fiftieths, 'opacity');
			toggle('scope', el.scope, 'on', viewer.scoped && viewer.alive);
			// Where the last hit came from: an arc round the crosshair, turned toward the shooter.
			const since = viewer === me ? now - shotAt : 9;
			show('hitdirA', since < 1.2 ? Math.round((1 - since / 1.2) * 50) : 0, el.hitdir.style, fiftieths, 'opacity');
			if (since < 1.2) show('hitdirR', Math.round(((viewer.yaw - shotFrom) * 180) / Math.PI), el.hitdir.style, turned, 'transform');
			toggle('banner', el.banner, 'on', now < bannerUntil);
			expire(feed, now);
			expire(calls, now);
		},

		board(sim, me, visible) {
			el.board.hidden = !visible;
			if (!visible || performance.now() < boardAt) return;
			boardAt = performance.now() + 250;
			const rows = sim.soldiers.slice().sort((a, b) => a.squad - b.squad || b.kills - a.kills);
			el['board-body'].innerHTML = rows.map((s) => `<tr class="${s.side}${s === me ? ' me' : ''}${s.alive ? '' : ' dead'}">`
				+ `<td>${s.name}</td><td>${SIDE_NAME[s.side]}</td><td>${s.kills}</td><td>${s.deaths}</td><td>${s.damageDealt}</td><td>$${s.money}</td></tr>`).join('');
		},
	};
}
