// Team play. Each squad buys as a team (full buy, save, pistol round) and plans: attackers walk
// groups to staging points, execute with smokes and flashes, plant, hold post-plant spots;
// defenders spread over sites and mid, rotate on intel, retake and defuse.
import { CELL, MATCH } from '../config.js';
import { POINTS, SITES, MID_HOLDS, PLANS } from '../map/layout.js';
import { buy } from '../sim/shop.js';
import { sideOf } from '../sim/round.js';
import { intelNear } from './perception.js';
import { setTask } from './bot.js';
import { radio } from '../sim/events.js';

const DEFENCE_SETUPS = [
	['A', 'A', 'mid', 'B', 'B'], ['A', 'B', 'B', 'mid', 'A'], ['A', 'A', 'B', 'B', 'B'], ['B', 'A', 'A', 'mid', 'A'],
];

const world = (p) => ({ x: p[0] * CELL, z: p[1] * CELL });
const CENTERS = { A: world(SITES.A.center), B: world(SITES.B.center) };

// Per squad: its bots (fixed for the match), the living ones (refilled each step) and the plan.
export function createTactics(soldiers) {
	return [0, 1].map((squad) => ({
		roster: soldiers.filter((s) => s.squad === squad && s.brain !== null), alive: [],
		plan: null, executed: false, rushed: false, planted: false, pressure: '', defuser: null, calledAt: -99,
	}));
}

export function roundStart(sim) {
	for (let squad = 0; squad < 2; squad++) {
		const st = sim.tactics[squad];
		st.executed = false; st.rushed = false; st.planted = false; st.pressure = ''; st.defuser = null;
		teamBuy(sim, squad, st.roster);
		if (sideOf(sim, squad) === 'atk') planAttack(sim, st, st.roster);
		else planDefence(sim, st.roster);
	}
}

// Full buy when the squad can afford rifles, a save when it cannot (so the next round can),
// and on pistol rounds a mix of armour and utility.
function teamBuy(sim, squad, bots) {
	const team = sim.soldiers.filter((s) => s.squad === squad);
	const average = team.reduce((sum, s) => sum + s.money, 0) / team.length;
	const pistolRound = sim.round.number === 1 || sim.round.number === MATCH.halftimeAfter + 1;
	const save = !pistolRound && average < 2600;
	for (const s of bots) {
		if (pistolRound) {
			if (sim.rng.chance(0.5)) buy(sim, s, 'vest');
			else if (sim.rng.chance(0.5)) buy(sim, s, 'anvil');
			buy(sim, s, sim.rng.chance(0.5) ? 'flash' : 'smoke');
			continue;
		}
		if (!s.primary && !save) {
			if (s.money >= 3700) {
				buy(sim, s, s.money >= 6400 && sim.rng.chance(0.25) ? 'longreach' : 'kestrel');
			} else if (s.money >= 2000) buy(sim, s, sim.rng.chance(0.65) ? 'hornet' : 'breaker');
		}
		if (s.primary || s.money > 3000) buy(sim, s, s.money >= 1000 ? 'helmet' : 'vest');
		if (s.primary) {
			if (s.side === 'def') buy(sim, s, 'kit');
			for (const n of ['smoke', 'flash', 'frag']) if (s.money >= 500) buy(sim, s, n);
		} else if (save && s.money >= 1200 && sim.rng.chance(0.3)) buy(sim, s, 'anvil');
	}
}

function planAttack(sim, st, bots) {
	st.plan = sim.rng.pick(PLANS);
	const groups = st.plan.groups;
	const site = SITES[st.plan.site];
	// The carrier walks with the first group; the rest are dealt round-robin.
	const order = bots.slice().sort((a, b) => (b.hasCharge ? 1 : 0) - (a.hasCharge ? 1 : 0));
	order.forEach((bot, i) => {
		const group = groups[i % groups.length];
		const points = group.map((name) => spread(sim, world(POINTS[name]), i));
		const look = world(site.center);
		setTask(bot, 'route', points, look.x, look.z);
		bot.brain.stage = group[group.length - 1];
	});
}

function planDefence(sim, bots) {
	const setup = sim.rng.pick(DEFENCE_SETUPS);
	const used = new Set();
	bots.forEach((bot, i) => {
		const where = setup[i % setup.length];
		const list = where === 'mid' ? MID_HOLDS : SITES[where].holds;
		const hold = list.find((h) => !used.has(h)) ?? list[0];
		used.add(hold);
		const look = world(hold.look);
		setTask(bot, 'hold', [world(hold.at)], look.x, look.z);
		bot.brain.post = where;
	});
}

// Spread bots sharing a waypoint a little apart, staying on walkable floor.
function spread(sim, p, i) {
	const ox = ((i % 3) - 1) * 0.9, oz = (((i / 3) | 0) % 2) * 0.9;
	const x = p.x + ox, z = p.z + oz;
	const c = sim.grid.atWorld(x, z);
	return c && c.top === 0 ? { x, z } : p;
}

export function updateTactics(sim) {
	if (sim.round.phase !== 'live') return;
	for (let squad = 0; squad < 2; squad++) {
		const st = sim.tactics[squad];
		st.alive.length = 0;
		for (const b of st.roster) if (b.alive) st.alive.push(b);
		if (st.alive.length === 0) continue;
		if (sideOf(sim, squad) === 'atk') attack(sim, st, st.alive);
		else defend(sim, st, st.alive);
	}
}

function attack(sim, st, bots) {
	const charge = sim.charge;
	if (charge.state === 'planted') {
		if (!st.planted) {
			st.planted = true;
			radio(sim, bots[0], `Charge is down on ${charge.site}, hold the site`);
			const site = SITES[charge.site];
			bots.forEach((bot, i) => {
				const spot = site.post[i % site.post.length];
				const look = world(spot.look);
				setTask(bot, 'hold', [world(spot.at)], look.x, look.z);
			});
		}
		return;
	}
	if (charge.state === 'dropped') {
		const fetcher = nearest(bots, charge.x, charge.z);
		if (fetcher.brain.task?.kind !== 'fetch') setTask(fetcher, 'fetch', [{ x: charge.x, z: charge.z }], charge.x, charge.z);
	} else if (st.executed && charge.carrier?.brain && charge.carrier.brain.task?.kind !== 'plant') plantTask(charge.carrier, SITES[st.plan.site]);
	let contact = false, ready = true;
	for (const b of bots) {
		if (sim.time - b.brain.lastContact < 1.5) contact = true;
		if (!b.brain.arrived && b.brain.task?.kind === 'route') ready = false;
	}
	if (!st.executed && (ready || sim.round.elapsed > 32 || (contact && sim.round.elapsed > 14))) execute(sim, st, bots);
	if (!st.rushed && sim.round.timer < 22) {
		st.rushed = true;
		execute(sim, st, bots);
	}
}

// Everyone onto the site: the carrier to plant, the others to clear the defenders' spots,
// each group's utility thrown from its staging point first.
function execute(sim, st, bots) {
	st.executed = true;
	radio(sim, bots[0], st.rushed ? `Out of time, everyone ${st.plan.site}!` : `Go ${st.plan.site}, go!`);
	const site = SITES[st.plan.site];
	const thrown = new Set();
	bots.forEach((bot, i) => {
		const center = world(site.center);
		if (bot.hasCharge) {
			plantTask(bot, site);
			return;
		}
		if (bot.brain.task?.kind === 'fetch') return;
		const hold = site.holds[i % site.holds.length];
		const look = world(hold.look);
		let toss = null;
		const kit = site.utility[bot.brain.stage];
		if (kit && !thrown.has(bot.brain.stage)) {
			const type = bot.nades.smoke > 0 ? 'smoke' : bot.nades.flash > 0 ? 'flash' : '';
			if (type) {
				const p = world(kit[type]);
				toss = { type, x: p.x, y: 0.3, z: p.z };
				thrown.add(bot.brain.stage);
			}
		}
		setTask(bot, 'hold', [center, world(hold.at)], look.x, look.z, toss);
	});
}

// The carrier walks to the site's plant spot and arms the charge facing the main way in.
function plantTask(bot, site) {
	const spot = world(site.plant), door = world(site.entry);
	setTask(bot, 'plant', [spot], door.x, door.z);
}

function defend(sim, st, bots) {
	const charge = sim.charge;
	if (charge.state === 'planted') {
		const site = SITES[charge.site];
		if (!st.planted) {
			st.planted = true;
			radio(sim, bots[0], `Charge on ${charge.site}, retake!`);
			bots.forEach((bot, i) => {
				const hold = site.holds[i % site.holds.length];
				setTask(bot, 'hold', [world(hold.at)], charge.x, charge.z);
			});
		}
		// One defender goes for the charge once the site looks clear, or when time is short.
		const threat = intelNear(sim, bots[0].squad, charge.x, charge.z, 14, 2.5);
		const urgent = sim.round.timer < 11;
		if ((!st.defuser || !st.defuser.alive) && (!threat || urgent)) {
			st.defuser = bots.find((b) => b.kit && Math.hypot(b.pos.x - charge.x, b.pos.z - charge.z) < 25) ?? nearest(bots, charge.x, charge.z);
			setTask(st.defuser, 'defuse', [{ x: charge.x + 0.4, z: charge.z + 0.4 }], charge.x, charge.z);
			radio(sim, st.defuser, 'On the charge, cover me');
		}
		return;
	}
	// Rotate everyone to a site the team has seen two or more attackers on.
	for (const key of ['A', 'B']) {
		if (st.pressure === key) continue;
		const c = CENTERS[key];
		let seen = 0;
		for (const m of sim.intel[bots[0].squad]) if (sim.time - m.time < 3 && Math.hypot(m.x - c.x, m.z - c.z) < 18) seen++;
		if (seen >= 2) {
			st.pressure = key;
			radio(sim, bots[0], `They're on ${key}, rotating`);
			bots.forEach((bot, i) => {
				if (bot.brain.post === key) return;
				const hold = SITES[key].holds[(i + 1) % SITES[key].holds.length];
				const look = world(hold.look);
				setTask(bot, 'hold', [world(hold.at)], look.x, look.z);
				bot.brain.post = key;
			});
		}
	}
}

function nearest(list, x, z) {
	let best = list[0], bestD = Infinity;
	for (const s of list) {
		const d = Math.hypot(s.pos.x - x, s.pos.z - z);
		if (d < bestD) { bestD = d; best = s; }
	}
	return best;
}
