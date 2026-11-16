// One bot's decisions, written into the same command the keyboard writes. In a fight: react after
// a delay, aim with a settling error, stop (or strafe up close), burst by range. Otherwise: pre-aim
// the last contact, turn to noises, and carry out the team task (route, hold, plant, defuse, throw).
import { MOVE, NADES } from '../config.js';
import { activeWeapon, eyeHeight } from '../sim/soldier.js';
import { maxSpeed } from '../sim/movement.js';
import { perceive, angleDiff } from './perception.js';

const SKILLS = {
	easy: { reaction: 0.65, turn: 4, settle: 1.9, spray: 0.2, headChance: 0.12, discipline: 0.35 },
	normal: { reaction: 0.45, turn: 6, settle: 2.7, spray: 0.14, headChance: 0.22, discipline: 0.55 },
	hard: { reaction: 0.26, turn: 10, settle: 4.8, spray: 0.07, headChance: 0.42, discipline: 0.85 },
};

export function createBrain(level, offset) {
	return {
		skill: SKILLS[level] ?? SKILLS.normal,
		task: null,
		path: [], pathIndex: 0, pathX: NaN, pathZ: NaN, repathAt: 0,
		target: null, reactAt: 0, aimPart: 'chest', errYaw: 0, errPitch: 0,
		lastContact: -99, lostX: 0, lostZ: 0, lostAt: -99,
		heardAt: -99, heardX: 0, heardZ: 0,
		nextThink: offset, pauseUntil: 0, strafe: 1, strafeUntil: 0, crouchUntil: 0,
		stuckX: 0, stuckZ: 0, stuckAt: 0, jitterUntil: 0,
		arrived: false, wantYaw: 0, wantPitch: 0, throwing: null, fragAt: -99,
	};
}

// A task: walk `points` in order, then hold looking at (lookX, lookZ); 'plant' and 'defuse'
// hold E on arrival. `toss` is utility to throw on the way, from where the bot then stands.
export function setTask(bot, kind, points, lookX, lookZ, toss = null) {
	const b = bot.brain;
	b.task = { kind, points, index: 0, lookX, lookZ };
	b.arrived = false;
	b.throwing = toss && bot.nades[toss.type] > 0 ? toss : null;
}

function clearCommand(c) {
	c.forward = 0; c.strafe = 0;
	c.walk = false; c.crouch = false; c.jump = false; c.fire = false; c.use = false;
	c.firePressed = false; c.reload = false; c.scope = false; c.slot = ''; c.nade = '';
}

export function think(sim, bot, dt) {
	const b = bot.brain, c = bot.cmd;
	clearCommand(c);
	if (!bot.alive) return;
	if (sim.time >= b.nextThink) {
		b.nextThink = sim.time + 0.1;
		perceive(sim, bot);
	}
	if (sim.round.phase === 'freeze') {
		b.wantYaw = bot.yaw;
		b.wantPitch = 0;
	} else if (b.target) fight(sim, bot, b.target, dt);
	else if (b.throwing) aimThrow(sim, bot, b.throwing);
	else {
		if (bot.primary && bot.slot === 'secondary') c.slot = 'primary';
		calm(sim, bot);
	}
	turn(bot, b, dt);
}

function turn(bot, b, dt) {
	const max = b.skill.turn * dt;
	const dy = angleDiff(b.wantYaw, bot.cmd.yaw);
	bot.cmd.yaw += Math.max(-max, Math.min(max, dy));
	bot.cmd.pitch += Math.max(-max, Math.min(max, b.wantPitch - bot.cmd.pitch));
}

function fight(sim, bot, t, dt) {
	const b = bot.brain, c = bot.cmd;
	const w = activeWeapon(bot);
	if (!w) { c.slot = bot.primary ? 'primary' : 'secondary'; return; }
	const ex = bot.pos.x, ey = eyeHeight(bot), ez = bot.pos.z;
	const aimY = b.aimPart === 'head' ? t.pos.y + t.height - 0.16 : t.pos.y + t.height * 0.68;
	const dx = t.pos.x - ex, dy = aimY - ey, dz = t.pos.z - ez;
	const flat = Math.hypot(dx, dz);
	const yawTo = Math.atan2(-dx, -dz);
	const pitchTo = Math.atan2(dy, flat);

	// Aim error settles while the bot tracks; a strafing target keeps it from settling fully.
	const settle = Math.exp(-b.skill.settle * dt);
	const lateral = Math.abs(t.vel.x * dz - t.vel.z * dx) / Math.max(flat, 1);
	b.errYaw = b.errYaw * settle + (sim.rng.next() - 0.5) * lateral * 0.004;
	b.errPitch *= settle;
	b.wantYaw = yawTo + b.errYaw - bot.recoilYaw * b.skill.discipline;
	b.wantPitch = pitchTo + b.errPitch - bot.recoilPitch * b.skill.discipline;

	const closeWeapon = w.def.id === 'hornet' || w.def.id === 'breaker' || w.def.id === 'wasp';
	const close = flat < 8 || (closeWeapon && flat < 14);
	if (close) {
		if (sim.time >= b.strafeUntil) {
			b.strafe = -b.strafe;
			b.strafeUntil = sim.time + 0.35 + sim.rng.next() * 0.45;
		}
		c.strafe = b.strafe;
	} else if (flat > 16 && sim.time < b.crouchUntil) c.crouch = true;
	if (sim.time < b.reactAt) {
		if (flat > 16 && sim.rng.chance(0.02)) b.crouchUntil = sim.time + 2.5;
		return;
	}

	if (w.mag === 0) {
		if (w.reserve > 0) c.reload = true;
		else c.slot = bot.slot === 'primary' ? 'secondary' : 'primary';
		return;
	}
	if (w.def.scope && !bot.scoped && flat > 5) { c.scope = true; return; }

	const errYaw = Math.abs(angleDiff(bot.yaw + bot.recoilYaw, yawTo));
	const errPitch = Math.abs(bot.pitch + bot.recoilPitch - pitchTo);
	const tolerance = Math.max(0.01, Math.atan(0.34 / Math.max(flat, 0.5))) * 2.2;
	const steady = close || Math.hypot(bot.vel.x, bot.vel.z) < maxSpeed(bot) * 0.36;
	if (errYaw > tolerance || errPitch > tolerance || !steady || sim.time < b.pauseUntil) return;

	if (w.def.auto) {
		// Burst by range: taps far away, short bursts at mid range, a spray up close.
		const limit = flat > 26 ? 1 : flat > 13 ? 4 : 10;
		if (w.spray >= limit) b.pauseUntil = sim.time + (flat > 26 ? 0.3 : 0.32);
		else c.fire = true;
	} else if (sim.time >= w.nextFire) {
		c.firePressed = true;
		b.pauseUntil = sim.time + (flat > 18 ? 0.3 : 0.05);
	}
}

// No enemy in sight: pre-aim the last contact, glance at noises, otherwise do the task.
function calm(sim, bot) {
	const b = bot.brain, c = bot.cmd;
	const w = activeWeapon(bot);
	if (w && w.mag < w.def.mag * 0.4 && w.reserve > 0 && sim.time - b.lastContact > 1.5) c.reload = true;

	const sinceLost = sim.time - b.lostAt;
	const task = b.task;
	const objective = task && (task.kind === 'plant' || task.kind === 'defuse');
	if (!objective && sinceLost < 2.2) {
		lookAt(bot, b.lostX, 1.4, b.lostZ);
		if (bot.nades.frag > 0 && sim.time - b.fragAt > 8 && sim.rng.chance(0.015)) {
			const d = Math.hypot(b.lostX - bot.pos.x, b.lostZ - bot.pos.z);
			if (d > 7 && d < 26) b.throwing = { type: 'frag', x: b.lostX, y: 0.5, z: b.lostZ };
		}
		return;
	}
	if (!objective && sinceLost < 5 && bot.side === 'atk' && Math.hypot(b.lostX - bot.pos.x, b.lostZ - bot.pos.z) < 14) {
		navigate(sim, bot, b.lostX, b.lostZ, true);
		lookAt(bot, b.lostX, 1.4, b.lostZ);
		return;
	}
	if (!task) return;

	const goal = task.points[task.index];
	const there = navigate(sim, bot, goal.x, goal.z, false);
	if (there && task.index < task.points.length - 1) task.index++;
	b.arrived = there && task.index === task.points.length - 1;
	const near = Math.hypot(goal.x - bot.pos.x, goal.z - bot.pos.z) < 7 && task.index === task.points.length - 1;

	if (b.arrived && objective) {
		c.use = true;
		c.crouch = true;
		lookAt(bot, task.lookX, 0.7, task.lookZ);
	} else if (sim.time - b.heardAt < 1.6) {
		lookAt(bot, b.heardX, 1.4, b.heardZ);
		c.walk = !b.arrived && bot.side === 'atk';
	} else if (near || b.arrived) lookAt(bot, task.lookX, 1.4, task.lookZ);
	else lookAlongPath(bot);
}

function lookAt(bot, x, y, z) {
	const b = bot.brain;
	const dx = x - bot.pos.x, dz = z - bot.pos.z;
	b.wantYaw = Math.atan2(-dx, -dz);
	b.wantPitch = Math.atan2(y - eyeHeight(bot), Math.hypot(dx, dz)) * 0.8;
}

function lookAlongPath(bot) {
	const b = bot.brain;
	const p = b.path[Math.min(b.pathIndex + 1, b.path.length - 1)];
	if (p) lookAt(bot, p.x, 1.5, p.z);
}

// Walks toward (tx, tz) along a nav path; true once standing on it.
function navigate(sim, bot, tx, tz, careful) {
	const b = bot.brain, c = bot.cmd;
	if (tx !== b.pathX || tz !== b.pathZ || sim.time >= b.repathAt) {
		sim.nav.findPath(bot.pos.x, bot.pos.z, tx, tz, b.path);
		b.pathIndex = 0; b.pathX = tx; b.pathZ = tz;
		b.repathAt = sim.time + 3;
	}
	if (Math.hypot(tx - bot.pos.x, tz - bot.pos.z) < 0.5 || b.path.length === 0) return true;
	let p = b.path[b.pathIndex];
	if (Math.hypot(p.x - bot.pos.x, p.z - bot.pos.z) < 0.55 && b.pathIndex < b.path.length - 1) p = b.path[++b.pathIndex];

	let mx = p.x - bot.pos.x, mz = p.z - bot.pos.z;
	const len = Math.hypot(mx, mz) || 1;
	mx /= len; mz /= len;
	for (const o of sim.soldiers) {
		if (o === bot || !o.alive || o.squad !== bot.squad) continue;
		const ox = bot.pos.x - o.pos.x, oz = bot.pos.z - o.pos.z;
		const d = Math.hypot(ox, oz);
		if (d < 1.3 && d > 1e-3) { mx += (ox / d) * (1.3 - d); mz += (oz / d) * (1.3 - d); }
	}

	// Stuck: barely moved for a second while trying. Re-plan and side-step.
	if (sim.time - b.stuckAt > 1) {
		if (Math.hypot(bot.pos.x - b.stuckX, bot.pos.z - b.stuckZ) < 0.35) {
			b.repathAt = 0;
			b.jitterUntil = sim.time + 0.5;
			b.strafe = sim.rng.chance(0.5) ? 1 : -1;
		}
		b.stuckX = bot.pos.x; b.stuckZ = bot.pos.z; b.stuckAt = sim.time;
	}

	const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
	c.forward = mx * fx + mz * fz;
	c.strafe = mx * -fz + mz * fx;
	if (sim.time < b.jitterUntil) c.strafe = b.strafe;
	c.walk = careful;
	return false;
}

// Utility: switch to the grenade, aim along a ballistic arc at the target, release.
function aimThrow(sim, bot, toss) {
	const b = bot.brain, c = bot.cmd;
	if (bot.nades[toss.type] <= 0) { b.throwing = null; return; }
	if (bot.slot !== 'nade' || bot.nadeType !== toss.type) {
		c.slot = 'nade';
		c.nade = toss.type;
	}
	const dx = toss.x - bot.pos.x, dz = toss.z - bot.pos.z;
	const d = Math.hypot(dx, dz);
	const h = toss.y - eyeHeight(bot);
	const v = NADES.throwSpeed, g = MOVE.gravity;
	const disc = v ** 4 - g * (g * d * d + 2 * h * v * v);
	const launch = disc > 0 ? Math.atan((v * v - Math.sqrt(disc)) / (g * d)) : Math.PI / 4;
	b.wantYaw = Math.atan2(-dx, -dz);
	b.wantPitch = launch - 0.14;
	const aligned = Math.abs(angleDiff(bot.yaw, b.wantYaw)) < 0.04 && Math.abs(bot.pitch - b.wantPitch) < 0.04;
	if (bot.slot === 'nade' && aligned && sim.time >= bot.deployUntil && bot.throwAt === 0) {
		c.firePressed = true;
		if (toss.type === 'frag') b.fragAt = sim.time;
		b.throwing = null;
	}
}

export function setSkill(sim, level) {
	for (const s of sim.soldiers) if (s.brain) s.brain.skill = SKILLS[level] ?? SKILLS.normal;
}
