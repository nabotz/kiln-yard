// The match clock: freeze-time buying, the live round and its win conditions (elimination, time,
// detonation, defuse), round money, half-time side swap and the end of the match.
import { CELL, MATCH, ECON } from '../config.js';
import { resetLoadout } from './soldier.js';
import { assignCharge, chargeTimeLeft } from './charge.js';

export function createRoundState() {
	return {
		round: { number: 0, phase: 'freeze', timer: 0, elapsed: 0, winner: -1 },
		match: { attackSquad: 0, scores: [0, 0], lossStreak: [0, 0], winner: -1, mvp: null },
	};
}

export const sideOf = (sim, squad) => (squad === sim.match.attackSquad ? 'atk' : 'def');
const squadOf = (sim, side) => (side === 'atk' ? sim.match.attackSquad : 1 - sim.match.attackSquad);

function aliveCount(sim, side) {
	let n = 0;
	for (const s of sim.soldiers) if (s.alive && s.side === side) n++;
	return n;
}

export function startRound(sim) {
	const r = sim.round;
	r.number++;
	const firstOfHalf = r.number === 1 || r.number === MATCH.halftimeAfter + 1;
	r.phase = 'freeze';
	r.timer = firstOfHalf ? MATCH.firstFreezeTime : MATCH.freezeTime;
	r.elapsed = 0;
	r.winner = -1;

	for (const s of sim.soldiers) {
		s.side = sideOf(sim, s.squad);
		if (!s.alive) resetLoadout(s);
		if (s.side === 'atk') s.kit = false;
		s.alive = true; s.hp = 100; s.flash = 0; s.busy = false; s.scoped = false;
		s.vel.x = 0; s.vel.y = 0; s.vel.z = 0; s.crouch = 0;
		s.recoilPitch = 0; s.recoilYaw = 0; s.deployUntil = 0; s.throwAt = 0;
		if (s.slot === 'nade' || (s.slot === 'primary' && !s.primary)) s.slot = s.primary ? 'primary' : 'secondary';
		for (const w of [s.primary, s.secondary]) if (w) { w.reloadUntil = 0; w.spray = 0; w.bloom = 0; w.nextFire = 0; }
	}
	placeAtSpawns(sim, 'atk', 0);
	placeAtSpawns(sim, 'def', Math.PI);

	for (const n of sim.nades) n.active = false;
	for (const m of sim.smokes) m.active = false;
	for (const p of sim.pickups) p.weapon = null;
	sim.noises.clear();

	const attackers = sim.soldiers.filter((s) => s.side === 'atk');
	assignCharge(sim, attackers[sim.rng.int(attackers.length)]);
	sim.events.emit('roundStart', null).n = r.number;
}

function placeAtSpawns(sim, side, yaw) {
	const cells = sim.grid.spawns[side].slice();
	for (let i = cells.length - 1; i > 0; i--) {
		const j = sim.rng.int(i + 1);
		const t = cells[i]; cells[i] = cells[j]; cells[j] = t;
	}
	let k = 0;
	for (const s of sim.soldiers) {
		if (s.side !== side) continue;
		const c = cells[k++ % cells.length];
		s.pos.x = (c.x + 0.5) * CELL; s.pos.y = 0; s.pos.z = (c.z + 0.5) * CELL;
		s.prev.x = s.pos.x; s.prev.y = 0; s.prev.z = s.pos.z;
		s.yaw = yaw; s.pitch = 0;
		s.cmd.yaw = yaw; s.cmd.pitch = 0;
	}
}

export function updateRound(sim, dt) {
	const r = sim.round;
	if (r.phase === 'matchover') return;
	r.timer -= dt;

	if (r.phase === 'freeze') {
		if (r.timer <= 0) {
			r.phase = 'live';
			r.timer = MATCH.roundTime;
			sim.events.emit('live', null);
		}
		return;
	}

	if (r.phase === 'live') {
		r.elapsed += dt;
		const c = sim.charge;
		const atk = aliveCount(sim, 'atk'), def = aliveCount(sim, 'def');
		if (c.state === 'planted') {
			r.timer = Math.max(0, chargeTimeLeft(sim));
			if (def === 0) endRound(sim, 'atk', 'elimination');
		} else if (c.state === 'detonated') endRound(sim, 'atk', 'detonation');
		else if (c.state === 'defused') endRound(sim, 'def', 'defuse');
		else if (atk === 0) endRound(sim, 'def', 'elimination');
		else if (def === 0) endRound(sim, 'atk', 'elimination');
		else if (r.timer <= 0) endRound(sim, 'def', 'time');
		return;
	}

	if (r.phase === 'over' && r.timer <= 0) {
		if (sim.match.winner >= 0) {
			r.phase = 'matchover';
			sim.events.emit('matchEnd', null).n = sim.match.winner;
			return;
		}
		if (r.number === MATCH.halftimeAfter) halftime(sim);
		startRound(sim);
	}
}

function endRound(sim, side, reason) {
	const r = sim.round, m = sim.match;
	const win = squadOf(sim, side), lose = 1 - win;
	r.phase = 'over';
	r.timer = MATCH.roundEndTime;
	r.winner = win;
	m.scores[win]++;
	m.lossStreak[win] = 0;
	m.lossStreak[lose] = Math.min(5, m.lossStreak[lose] + 1);

	const winPay = reason === 'detonation' || reason === 'defuse' ? ECON.winObjective : ECON.winElimination;
	const losePay = Math.min(ECON.lossMax, ECON.lossBase + ECON.lossStep * (m.lossStreak[lose] - 1));
	const plantBonus = side === 'def' && sim.charge.state !== 'carried' && sim.charge.state !== 'dropped' ? ECON.plantBonus : 0;
	for (const s of sim.soldiers) {
		const pay = s.squad === win ? winPay : losePay + (s.side === 'atk' ? plantBonus : 0);
		s.money = Math.min(ECON.max, s.money + pay);
	}
	if (m.scores[win] >= MATCH.roundsToWin) {
		m.winner = win;
		m.mvp = sim.soldiers.reduce((best, s) => (s.kills * 100 + s.damageDealt > best.kills * 100 + best.damageDealt ? s : best));
	}
	const e = sim.events.emit('roundEnd', null, reason);
	e.n = win;
}

function halftime(sim) {
	sim.match.attackSquad = 1 - sim.match.attackSquad;
	sim.match.lossStreak[0] = 0;
	sim.match.lossStreak[1] = 0;
	for (const s of sim.soldiers) {
		resetLoadout(s);
		s.money = ECON.start;
	}
	sim.events.emit('halftime', null);
}
