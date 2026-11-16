// Thrown utility: grenades fly and bounce off the map, then a frag bursts (falloff, blocked by
// cover), a flash blinds whoever faces it, and a smoke grows into a sphere sight cannot cross.
import { MOVE, NADES } from '../config.js';
import { aimVector, eyeHeight } from './soldier.js';
import { applyDamage } from './combat.js';

const dir = { x: 0, y: 0, z: 0 };

export function createNadePools() {
	const nades = [], smokes = [];
	for (let i = 0; i < 10; i++) nades.push({ active: false, type: '', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, born: 0, owner: null, rest: false });
	for (let i = 0; i < 6; i++) smokes.push({ active: false, x: 0, y: 0, z: 0, born: 0 });
	return { nades, smokes };
}

export function throwNade(sim, s, type) {
	const n = sim.nades.find((g) => !g.active);
	if (!n) return;
	aimVector(s.yaw, s.pitch + 0.08, dir);
	n.active = true; n.type = type; n.owner = s; n.born = sim.time; n.rest = false;
	n.x = s.pos.x + dir.x * 0.4; n.y = eyeHeight(s) - 0.1; n.z = s.pos.z + dir.z * 0.4;
	n.vx = dir.x * NADES.throwSpeed + s.vel.x * 0.6;
	n.vy = dir.y * NADES.throwSpeed + 1.2;
	n.vz = dir.z * NADES.throwSpeed + s.vel.z * 0.6;
	sim.events.emit('throw', s, type);
}

// Is a point inside a box of the map?
function solidAt(grid, x, y, z) {
	const c = grid.atWorld(x, z);
	if (!c) return true;
	return c.top > y && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ;
}

function groundAt(grid, x, y, z) {
	const c = grid.atWorld(x, z);
	if (c && c.top > 0 && c.top <= y + 0.05 && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ) return c.top;
	return 0;
}

export function updateNades(sim, dt) {
	const g = sim.grid;
	for (const n of sim.nades) {
		if (!n.active) continue;
		const age = sim.time - n.born;
		if (!n.rest) {
			n.vy -= MOVE.gravity * dt;
			let bounced = false;
			const nx = n.x + n.vx * dt;
			if (solidAt(g, nx, n.y, n.z)) { n.vx *= -NADES.restitution; bounced = true; } else n.x = nx;
			const nz = n.z + n.vz * dt;
			if (solidAt(g, n.x, n.y, nz)) { n.vz *= -NADES.restitution; bounced = true; } else n.z = nz;
			const floor = groundAt(g, n.x, n.y, n.z);
			const ny = n.y + n.vy * dt;
			if (ny <= floor + 0.05) {
				n.y = floor + 0.05;
				if (Math.abs(n.vy) > 1.2) bounced = true;
				n.vy = -n.vy * NADES.restitution;
				n.vx *= 0.7; n.vz *= 0.7;
				if (Math.abs(n.vy) < 1 && Math.hypot(n.vx, n.vz) < 0.5) n.rest = true;
			} else n.y = ny;
			if (bounced) place(sim.events.emit('bounce', null, n.type), n);
		}
		if (n.type === 'frag' && age >= NADES.fragFuse) explode(sim, n);
		else if (n.type === 'flash' && age >= NADES.flashFuse) pop(sim, n);
		else if (n.type === 'smoke' && ((n.rest && age > 0.8) || age > 3)) deploySmoke(sim, n);
	}
	for (const m of sim.smokes) if (m.active && sim.time - m.born > NADES.smokeLife) m.active = false;
}

function place(e, n) {
	e.x = n.x; e.y = n.y; e.z = n.z;
	return e;
}

function explode(sim, n) {
	n.active = false;
	place(sim.events.emit('explode', n.owner, 'frag'), n);
	sim.noises.add(n.x, n.z, n.owner.squad, 45, sim.time);
	for (const v of sim.soldiers) {
		if (!v.alive || (v.squad === n.owner.squad && v !== n.owner)) continue;
		const cy = v.pos.y + v.height * 0.6;
		const d = Math.hypot(v.pos.x - n.x, cy - n.y, v.pos.z - n.z);
		if (d > NADES.fragRadius || !sim.grid.clearSight(n.x, n.y + 0.2, n.z, v.pos.x, cy, v.pos.z)) continue;
		applyDamage(sim, v, n.owner, NADES.fragDamage * (1 - d / NADES.fragRadius), 'chest', 'frag', 0.5, v.pos.x, cy, v.pos.z);
	}
}

function pop(sim, n) {
	n.active = false;
	place(sim.events.emit('flash', n.owner, 'flash'), n);
	for (const v of sim.soldiers) {
		if (!v.alive) continue;
		const ey = eyeHeight(v);
		const dx = n.x - v.pos.x, dy = n.y - ey, dz = n.z - v.pos.z;
		const d = Math.hypot(dx, dy, dz);
		if (d > NADES.flashRange || !sim.grid.clearSight(v.pos.x, ey, v.pos.z, n.x, n.y + 0.1, n.z)) continue;
		if (smokeBlocks(sim, v.pos.x, ey, v.pos.z, n.x, n.y, n.z)) continue;
		aimVector(v.yaw, v.pitch, dir);
		const facing = (dir.x * dx + dir.y * dy + dir.z * dz) / d;
		const strength = facing > 0.55 ? 1 : facing > 0 ? 0.55 : 0.18;
		v.flash = Math.max(v.flash, NADES.flashMax * strength * (1 - (0.6 * d) / NADES.flashRange));
	}
}

function deploySmoke(sim, n) {
	n.active = false;
	const m = sim.smokes.find((k) => !k.active) ?? sim.smokes[0];
	m.active = true; m.x = n.x; m.y = n.y; m.z = n.z; m.born = sim.time;
	place(sim.events.emit('smoke', n.owner, 'smoke'), n);
}

// A smoke's radius: it blooms over a second and thins out in its last two.
export function smokeRadius(sim, m) {
	const age = sim.time - m.born;
	const grow = Math.min(1, age / 1.1);
	const fade = Math.min(1, (NADES.smokeLife - age) / 2);
	return NADES.smokeRadius * grow * Math.max(0, fade);
}

// Does any smoke cover the segment a→b? (Closest point of the segment to each smoke centre.)
export function smokeBlocks(sim, ax, ay, az, bx, by, bz) {
	for (const m of sim.smokes) {
		if (!m.active) continue;
		const r = smokeRadius(sim, m) * 0.9;
		if (r <= 0.2) continue;
		const dx = bx - ax, dy = by - ay, dz = bz - az;
		const len2 = dx * dx + dy * dy + dz * dz;
		let t = len2 > 0 ? ((m.x - ax) * dx + (m.y + 1 - ay) * dy + (m.z - az) * dz) / len2 : 0;
		t = Math.max(0, Math.min(1, t));
		const px = ax + dx * t - m.x, py = ay + dy * t - (m.y + 1), pz = az + dz * t - m.z;
		if (px * px + py * py + pz * pz < r * r) return true;
	}
	return false;
}
