// The objective: an attacker carries the charge, holds E in a plant zone to arm it, and it
// detonates unless a defender holds E over it long enough. Dropped on death, picked up by walking over.
import { MATCH, NADES, ECON } from '../config.js';
import { applyDamage } from './combat.js';

export function createCharge() {
	return {
		state: 'carried', carrier: null, x: 0, y: 0, z: 0, site: '',
		progress: 0, worker: null, plantedAt: 0, nextBeep: 0,
	};
}

export function assignCharge(sim, carrier) {
	const c = sim.charge;
	c.state = 'carried'; c.carrier = carrier; c.site = ''; c.progress = 0; c.worker = null;
	for (const s of sim.soldiers) s.hasCharge = s === carrier;
}

export function dropCharge(sim, s) {
	const c = sim.charge;
	s.hasCharge = false;
	c.state = 'dropped'; c.carrier = null; c.progress = 0; c.worker = null;
	c.x = s.pos.x; c.y = s.pos.y; c.z = s.pos.z;
	sim.events.emit('chargeDrop', s);
}

export const chargeTimeLeft = (sim) => MATCH.chargeTimer - (sim.time - sim.charge.plantedAt);

export function updateCharge(sim, dt) {
	const c = sim.charge;
	for (const s of sim.soldiers) s.busy = false;

	if (c.state === 'carried') {
		const s = c.carrier;
		const zone = sim.grid.zoneAt(s.pos.x, s.pos.z);
		const still = Math.hypot(s.vel.x, s.vel.z) < 0.8;
		if (s.cmd.use && zone && s.onGround && still && sim.round.phase === 'live') {
			if (c.progress === 0) sim.events.emit('plantStart', s);
			c.progress += dt;
			c.worker = s;
			s.busy = true;
			if (c.progress >= MATCH.plantTime) plant(sim, s, zone);
		} else {
			c.progress = 0;
			c.worker = null;
		}
	} else if (c.state === 'dropped') {
		for (const s of sim.soldiers) {
			if (!s.alive || s.side !== 'atk') continue;
			if (Math.abs(s.pos.x - c.x) < 1 && Math.abs(s.pos.z - c.z) < 1) {
				assignCharge(sim, s);
				sim.events.emit('chargePickup', s);
				break;
			}
		}
	} else if (c.state === 'planted') {
		const left = chargeTimeLeft(sim);
		if (sim.time >= c.nextBeep) {
			c.nextBeep = sim.time + Math.max(0.12, 1.1 * (left / MATCH.chargeTimer));
			const e = sim.events.emit('beep', null);
			e.x = c.x; e.y = c.y; e.z = c.z;
		}
		updateDefuse(sim, c, dt);
		if (left <= 0) detonate(sim, c);
	}
}

function plant(sim, s, zone) {
	const c = sim.charge;
	c.state = 'planted'; c.site = zone; c.carrier = null; c.worker = null; c.progress = 0;
	c.x = s.pos.x; c.y = s.pos.y; c.z = s.pos.z;
	c.plantedAt = sim.time;
	c.nextBeep = sim.time;
	s.hasCharge = false;
	s.money = Math.min(ECON.max, s.money + ECON.plantReward);
	sim.events.emit('planted', s, zone);
	sim.noises.add(c.x, c.z, s.squad, 60, sim.time);
}

// One defender at a time; letting go of E (or moving off it) loses the progress.
function updateDefuse(sim, c, dt) {
	let worker = null;
	for (const s of sim.soldiers) {
		if (!s.alive || s.side !== 'def' || !s.cmd.use || !s.onGround) continue;
		if (Math.hypot(s.pos.x - c.x, s.pos.z - c.z) > MATCH.defuseRange) continue;
		if (c.worker === s) { worker = s; break; }
		if (!worker) worker = s;
	}
	if (!worker) {
		c.worker = null;
		c.progress = 0;
		return;
	}
	if (c.worker !== worker) {
		c.worker = worker;
		c.progress = 0;
		sim.events.emit('defuseStart', worker);
		sim.noises.add(c.x, c.z, worker.squad, 18, sim.time);
	}
	worker.busy = true;
	c.progress += dt;
	if (c.progress >= (worker.kit ? MATCH.defuseTimeKit : MATCH.defuseTime)) {
		c.state = 'defused';
		c.worker = null;
		worker.money = Math.min(ECON.max, worker.money + ECON.defuseReward);
		sim.events.emit('defused', worker);
	}
}

function detonate(sim, c) {
	c.state = 'detonated';
	c.worker = null;
	const e = sim.events.emit('detonate', null);
	e.x = c.x; e.y = c.y; e.z = c.z;
	for (const v of sim.soldiers) {
		if (!v.alive) continue;
		const d = Math.hypot(v.pos.x - c.x, v.pos.z - c.z);
		if (d < NADES.chargeRadius) {
			applyDamage(sim, v, v, NADES.chargeDamage * (1 - d / NADES.chargeRadius) ** 2, 'chest', 'charge', 1, v.pos.x, v.pos.y + 1, v.pos.z);
		}
	}
}
