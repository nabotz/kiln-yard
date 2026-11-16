// Gunplay: deploy, reload, scope, fire; hitscan against the map and each body's head, chest,
// stomach and legs; damage with range falloff and armour; kills, rewards and dropped weapons.
import { MOVE, SENSES, ECON } from '../config.js';
import { WEAPONS, makeWeapon, inaccuracy, recoilKick, damageAt } from './weapons.js';
import { activeWeapon, aimVector, eyeHeight } from './soldier.js';
import { throwNade } from './grenades.js';
import { dropCharge } from './charge.js';

const PART_SCALE = { head: 1, chest: 1, stomach: 1.25, legs: 0.75 };
const dir = { x: 0, y: 0, z: 0 };
const kick = { pitch: 0, yaw: 0 };
const worldHit = { t: 0, nx: 0, ny: 0, nz: 0, cell: null };
const bodyHit = { t: Infinity, soldier: null, part: '' };

// Per step: weapon switching, reloading, scoping, firing or throwing, recoil recovery.
export function updateArms(sim, s, dt) {
	const c = s.cmd;
	const now = sim.time;
	if (c.slot) selectSlot(sim, s, c.slot, c.nade);

	const w = activeWeapon(s);
	if (w) {
		recover(s, w, now, dt);
		if (w.reloadUntil > 0 && now >= w.reloadUntil) finishReload(w);
		if (c.reload && w.reloadUntil === 0 && w.mag < w.def.mag && w.reserve > 0) startReload(sim, s, w);
		if (c.scope && w.def.scope && w.reloadUntil === 0) {
			s.scoped = !s.scoped;
			sim.events.emit('scope', s);
		}
		const trigger = w.def.auto ? c.fire : c.firePressed;
		if (trigger && !s.busy && now >= s.deployUntil && now >= w.nextFire && w.reloadUntil === 0) {
			if (w.mag > 0) fire(sim, s, w);
			else if (c.firePressed) {
				sim.events.emit('dry', s);
				if (w.reserve > 0) startReload(sim, s, w);
			}
		}
	} else if (s.slot === 'nade') {
		s.recoilPitch *= Math.exp(-8 * dt);
		s.recoilYaw *= Math.exp(-8 * dt);
		if (s.throwAt > 0 && now >= s.throwAt) {
			s.throwAt = 0;
			selectSlot(sim, s, s.primary ? 'primary' : 'secondary', '');
		} else if (c.firePressed && s.throwAt === 0 && now >= s.deployUntil && s.nades[s.nadeType] > 0) {
			s.nades[s.nadeType]--;
			throwNade(sim, s, s.nadeType);
			s.throwAt = now + 0.45;
		}
	}
}

function selectSlot(sim, s, slot, nade) {
	if (slot === 'last') slot = s.lastSlot;
	if (slot === 'primary' && !s.primary) return;
	if (slot === 'nade') {
		const type = nade || nextNade(s);
		if (!type || s.nades[type] <= 0) return;
		if (s.slot === 'nade' && s.nadeType === type) return;
		s.nadeType = type;
	} else if (slot === s.slot) return;
	const w = activeWeapon(s);
	if (w) w.reloadUntil = 0;
	if (s.slot !== 'nade') s.lastSlot = s.slot;
	s.slot = slot;
	s.scoped = false;
	s.throwAt = 0;
	s.deployUntil = sim.time + (slot === 'nade' ? 0.3 : 0.5);
	sim.events.emit('deploy', s, slot === 'nade' ? s.nadeType : activeWeapon(s).def.id);
}

// Cycles through the grenades carried, starting after the one in hand.
function nextNade(s) {
	const order = ['frag', 'flash', 'smoke'];
	const start = s.slot === 'nade' ? order.indexOf(s.nadeType) + 1 : 0;
	for (let i = 0; i < order.length; i++) {
		const t = order[(start + i) % order.length];
		if (s.nades[t] > 0) return t;
	}
	return '';
}

function startReload(sim, s, w) {
	w.reloadUntil = sim.time + w.def.reload;
	s.scoped = false;
	sim.events.emit('reload', s, w.def.id);
}

function finishReload(w) {
	const take = Math.min(w.def.mag - w.mag, w.reserve);
	w.mag += take;
	w.reserve -= take;
	w.reloadUntil = 0;
}

function recover(s, w, now, dt) {
	const sp = w.def.spread;
	w.bloom *= Math.exp(-sp.recover * dt);
	const resting = now - w.lastShot > w.def.interval * 1.6;
	if (resting) w.spray = Math.max(0, w.spray - dt * 16);
	const k = Math.exp(-(resting ? 7 : 1.6) * dt);
	s.recoilPitch *= k;
	s.recoilYaw *= k;
}

function fire(sim, s, w) {
	const d = w.def;
	const now = sim.time;
	w.mag--;
	w.nextFire = now + d.interval;
	w.lastShot = now;

	const spread = inaccuracy(s, w, MOVE.runSpeed);
	const ox = s.pos.x, oy = eyeHeight(s), oz = s.pos.z;
	const e = sim.events.emit('shot', s, d.id);
	for (let p = 0; p < d.pellets; p++) {
		const r = spread * sim.rng.next();
		const a = sim.rng.next() * Math.PI * 2;
		aimVector(s.yaw + s.recoilYaw + Math.cos(a) * r, s.pitch + s.recoilPitch + Math.sin(a) * r, dir);
		const tWorld = sim.grid.raycast(ox, oy, oz, dir.x, dir.y, dir.z, 120, worldHit);
		traceBodies(sim, s, ox, oy, oz, dir, tWorld);
		const t = Math.min(tWorld, bodyHit.t, 120);
		if (p === 0) {
			e.x = ox; e.y = oy; e.z = oz;
			e.x2 = ox + dir.x * t; e.y2 = oy + dir.y * t; e.z2 = oz + dir.z * t;
		}
		if (bodyHit.soldier) {
			const amount = damageAt(d, bodyHit.t) * (bodyHit.part === 'head' ? d.head : PART_SCALE[bodyHit.part]);
			applyDamage(sim, bodyHit.soldier, s, amount, bodyHit.part, d.id, d.pen, ox + dir.x * t, oy + dir.y * t, oz + dir.z * t);
		} else if (tWorld < 120) {
			const hit = sim.events.emit('impact', null, worldHit.cell ? worldHit.cell.mat : 'floor');
			hit.x = ox + dir.x * tWorld; hit.y = oy + dir.y * tWorld; hit.z = oz + dir.z * tWorld;
			hit.x2 = worldHit.nx; hit.y2 = worldHit.ny; hit.z2 = worldHit.nz;
		}
	}

	recoilKick(d, Math.floor(w.spray), sim.rng.next() - 0.5, kick);
	s.recoilPitch += kick.pitch;
	s.recoilYaw += kick.yaw;
	w.spray += 1;
	w.bloom += d.spread.bloom;
	if (d.scope) s.scoped = false;
	sim.noises.add(ox, oz, s.squad, SENSES.gunshotRadius, now);
}

// Nearest enemy body part along the ray, closer than the wall at tWorld. Friendly fire is off.
function traceBodies(sim, shooter, ox, oy, oz, d, tWorld) {
	bodyHit.t = tWorld;
	bodyHit.soldier = null;
	for (const v of sim.soldiers) {
		if (!v.alive || v.squad === shooter.squad) continue;
		const cx = v.pos.x, cz = v.pos.z, h = v.height, base = v.pos.y;
		// Cheap reject: the ray's closest approach to the body's axis.
		const along = (cx - ox) * d.x + (cz - oz) * d.z;
		if (along < 0) continue;
		const px = ox + d.x * along - cx, pz = oz + d.z * along - cz;
		if (px * px + pz * pz > 0.9) continue;
		testSphere(v, ox, oy, oz, d, cx, base + h - 0.16, cz, 0.16, 'head');
		testCylinder(v, ox, oy, oz, d, cx, cz, 0.27, base + h * 0.56, base + h * 0.84, 'chest');
		testCylinder(v, ox, oy, oz, d, cx, cz, 0.25, base + h * 0.42, base + h * 0.56, 'stomach');
		testCylinder(v, ox, oy, oz, d, cx, cz, 0.22, base, base + h * 0.42, 'legs');
	}
}

function testSphere(v, ox, oy, oz, d, cx, cy, cz, r, part) {
	const lx = ox - cx, ly = oy - cy, lz = oz - cz;
	const b = lx * d.x + ly * d.y + lz * d.z;
	const c = lx * lx + ly * ly + lz * lz - r * r;
	const disc = b * b - c;
	if (disc < 0) return;
	const t = -b - Math.sqrt(disc);
	if (t > 0 && t < bodyHit.t) { bodyHit.t = t; bodyHit.soldier = v; bodyHit.part = part; }
}

function testCylinder(v, ox, oy, oz, d, cx, cz, r, y0, y1, part) {
	const a = d.x * d.x + d.z * d.z;
	if (a < 1e-6) return;
	const lx = ox - cx, lz = oz - cz;
	const b = lx * d.x + lz * d.z;
	const c = lx * lx + lz * lz - r * r;
	const disc = b * b - a * c;
	if (disc < 0) return;
	const t = (-b - Math.sqrt(disc)) / a;
	if (t <= 0 || t >= bodyHit.t) return;
	const y = oy + d.y * t;
	if (y >= y0 && y <= y1) { bodyHit.t = t; bodyHit.soldier = v; bodyHit.part = part; }
}

// Armour soaks body and (with a helmet) head damage at the weapon's penetration ratio.
export function applyDamage(sim, victim, attacker, amount, part, weaponId, pen, hx, hy, hz) {
	if (!victim.alive) return;
	let hp = amount;
	const covered = victim.armor > 0 && part !== 'legs' && (part !== 'head' || victim.helmet);
	if (covered) {
		hp = amount * pen;
		victim.armor = Math.max(0, victim.armor - (amount - hp) * 0.5);
	}
	hp = Math.min(victim.hp, Math.round(hp));
	victim.hp -= hp;
	if (attacker !== victim) attacker.damageDealt += hp;
	const e = sim.events.emit('hit', victim, part);
	e.o = attacker; e.n = hp; e.x = hx; e.y = hy; e.z = hz;
	if (victim.hp <= 0) kill(sim, victim, attacker, weaponId, part === 'head');
}

function kill(sim, victim, killer, weaponId, headshot) {
	victim.alive = false;
	victim.hp = 0;
	victim.deaths++;
	victim.diedAt = sim.time;
	victim.scoped = false;
	if (killer !== victim && killer.squad !== victim.squad) {
		killer.kills++;
		killer.money = Math.min(ECON.max, killer.money + (WEAPONS[weaponId] ? WEAPONS[weaponId].kill : 300));
	}
	const e = sim.events.emit('kill', victim, weaponId);
	e.o = killer; e.n = headshot ? 1 : 0;
	if (victim.hasCharge) dropCharge(sim, victim);
	if (victim.primary) dropWeapon(sim, victim, victim.primary);
	victim.primary = null;
}

// A dead soldier's long gun stays where they fell; anyone without one picks it up by walking over it.
function dropWeapon(sim, s, weapon) {
	const slot = sim.pickups.find((p) => !p.weapon) ?? sim.pickups[0];
	slot.weapon = weapon;
	slot.x = s.pos.x; slot.y = s.pos.y; slot.z = s.pos.z;
	slot.yaw = s.yaw;
	weapon.reloadUntil = 0;
}

export function updatePickups(sim) {
	for (const p of sim.pickups) {
		if (!p.weapon) continue;
		for (const s of sim.soldiers) {
			if (!s.alive || s.primary) continue;
			if (Math.abs(s.pos.x - p.x) < 0.9 && Math.abs(s.pos.z - p.z) < 0.9 && Math.abs(s.pos.y - p.y) < 1.2) {
				s.primary = p.weapon;
				p.weapon = null;
				sim.events.emit('pickup', s, s.primary.def.id);
				if (s.isPlayer || s.slot === 'secondary') selectSlot(sim, s, 'primary', '');
				break;
			}
		}
	}
}

export function giveWeapon(sim, s, id) {
	const w = makeWeapon(id);
	if (w.def.slot === 'primary') {
		if (s.primary) dropWeapon(sim, s, s.primary);
		s.primary = w;
	} else s.secondary = w;
	if (s.slot !== w.def.slot) selectSlot(sim, s, w.def.slot, '');
	else {
		s.deployUntil = sim.time + 0.5;
		s.scoped = false;
		sim.events.emit('deploy', s, id);
	}
}
