// Body physics: ground friction and acceleration toward the wished velocity, weak air control,
// crouch, jump, stepping onto low boxes, sliding along walls. Stopping takes a moment, so a
// shooter who counter-strafes before firing is rewarded; running feet make noise.
import { MOVE, SENSES } from '../config.js';
import { activeWeapon } from './soldier.js';

const near = [];

export function maxSpeed(s) {
	const w = activeWeapon(s);
	const mobility = w ? w.def.mobility : 1;
	const scope = s.scoped ? 0.55 : 1;
	const walk = s.cmd.walk ? MOVE.walkScale : 1;
	const crouch = 1 + (MOVE.crouchScale - 1) * s.crouch;
	const tagged = s.tag > 0 ? 0.5 : 1; // a hit staggers: being shot slows you for a moment
	return MOVE.runSpeed * mobility * scope * walk * crouch * tagged;
}

function accelerate(v, wx, wz, wishSpeed, accel, dt) {
	const current = v.x * wx + v.z * wz;
	const add = wishSpeed - current;
	if (add <= 0) return;
	const gain = Math.min(accel * wishSpeed * dt, add);
	v.x += wx * gain;
	v.z += wz * gain;
}

export function moveSoldier(sim, s, dt, frozen) {
	const c = s.cmd;
	const v = s.vel;
	s.tag = Math.max(0, s.tag - dt);

	const wantCrouch = c.crouch ? 1 : 0;
	s.crouch += Math.max(-MOVE.crouchRate * dt, Math.min(MOVE.crouchRate * dt, wantCrouch - s.crouch));
	s.height = MOVE.standHeight + (MOVE.crouchHeight - MOVE.standHeight) * s.crouch;

	// Wished direction in world space from the body's yaw.
	const sin = Math.sin(s.yaw), cos = Math.cos(s.yaw);
	let wx = -sin * c.forward + cos * c.strafe;
	let wz = -cos * c.forward - sin * c.strafe;
	const len = Math.hypot(wx, wz);
	if (len > 1e-3) { wx /= len; wz /= len; }
	const wishSpeed = frozen || s.busy ? 0 : maxSpeed(s) * Math.min(1, len);

	if (s.onGround) {
		const speed = Math.hypot(v.x, v.z);
		if (speed > 1e-4) {
			const drop = Math.max(speed, MOVE.stopSpeed) * MOVE.friction * dt;
			const k = Math.max(0, speed - drop) / speed;
			v.x *= k; v.z *= k;
		}
		accelerate(v, wx, wz, wishSpeed, MOVE.accelerate, dt);
		if (c.jump && !frozen && !s.busy) {
			v.y = MOVE.jumpSpeed;
			s.onGround = false;
			sim.events.emit('jump', s);
		}
	} else {
		accelerate(v, wx, wz, Math.min(wishSpeed, MOVE.airSpeedCap), MOVE.airAccelerate * 10, dt);
	}
	v.y -= MOVE.gravity * dt;

	const p = s.pos;
	const r = MOVE.radius;
	const px = p.x, pz = p.z;

	// Horizontal axes one at a time, so a body slides along whatever it meets.
	p.x = sweepAxis(sim.grid, p, p.x + v.x * dt, p.z, r, true, v);
	p.z = sweepAxis(sim.grid, p, p.x, p.z + v.z * dt, r, false, v);

	// Vertical: land on the floor or on the highest box top under the feet.
	let ground = 0;
	sim.grid.collectBoxes(p.x - r, p.z - r, p.x + r, p.z + r, near);
	for (const b of near) if (b.top <= p.y + MOVE.stepHeight + 1e-3 && b.top > ground) ground = b.top;
	const ny = p.y + v.y * dt;
	if (ny <= ground) {
		if (!s.onGround && v.y < -4) sim.events.emit('land', s);
		p.y = ground;
		v.y = 0;
		s.onGround = true;
	} else {
		p.y = ny;
		s.onGround = false;
	}

	// Footsteps: running is loud and the enemy hears it; walking and crouching are silent.
	if (s.onGround) {
		s.stride += Math.hypot(p.x - px, p.z - pz);
		if (s.stride > MOVE.footstepStride) {
			s.stride = 0;
			const loud = !c.walk && s.crouch < 0.5 && Math.hypot(v.x, v.z) > MOVE.runSpeed * 0.55;
			sim.events.emit('step', s, loud ? 'loud' : 'soft');
			if (loud) sim.noises.add(p.x, p.z, s.squad, SENSES.footstepRadius, sim.time);
		}
	}
}

// Moves one axis to `target`, stopping flush against any box taller than a step.
function sweepAxis(grid, p, nx, nz, r, alongX, v) {
	grid.collectBoxes(nx - r, nz - r, nx + r, nz + r, near);
	let out = alongX ? nx : nz;
	for (const b of near) {
		if (b.top <= p.y + MOVE.stepHeight) continue;
		if (alongX) {
			out = v.x > 0 ? Math.min(out, b.minX - r - 1e-4) : Math.max(out, b.maxX + r + 1e-4);
			v.x = 0;
		} else {
			out = v.z > 0 ? Math.min(out, b.minZ - r - 1e-4) : Math.max(out, b.maxZ + r + 1e-4);
			v.z = 0;
		}
	}
	return out;
}

// Soldiers do not overlap: nudge apart any two bodies closer than two radii.
export function separate(soldiers, dt) {
	const min = MOVE.radius * 2.1;
	for (let i = 0; i < soldiers.length; i++) {
		const a = soldiers[i];
		if (!a.alive) continue;
		for (let j = i + 1; j < soldiers.length; j++) {
			const b = soldiers[j];
			if (!b.alive) continue;
			const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
			const d2 = dx * dx + dz * dz;
			if (d2 >= min * min || d2 < 1e-8 || Math.abs(a.pos.y - b.pos.y) > 1.5) continue;
			const d = Math.sqrt(d2);
			const push = ((min - d) / d) * 6 * dt;
			a.vel.x -= dx * push; a.vel.z -= dz * push;
			b.vel.x += dx * push; b.vel.z += dz * push;
		}
	}
}
