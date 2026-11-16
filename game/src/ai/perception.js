// What a bot knows: enemies it can see (view cone, range, no cover or smoke, not flashed) and
// noises it hears. Every sighting becomes team intel, the bots' callouts.
import { SENSES } from '../config.js';
import { eyeHeight } from '../sim/soldier.js';
import { smokeBlocks } from '../sim/grenades.js';
import { radio } from '../sim/events.js';

const COS_HALF_FOV = Math.cos(SENSES.fov / 2);

export function createIntel(count) {
	const make = () => Array.from({ length: count }, () => ({ x: 0, z: 0, time: -99 }));
	return [make(), make()];
}

function canSee(sim, bot, enemy) {
	if (bot.flash > 0.6) return false;
	const ex = bot.pos.x, ey = eyeHeight(bot), ez = bot.pos.z;
	const dx = enemy.pos.x - ex, dz = enemy.pos.z - ez;
	const dist = Math.hypot(dx, dz);
	if (dist > SENSES.sightRange) return false;
	if (dist > 2.5) {
		const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
		if ((fx * dx + fz * dz) / dist < COS_HALF_FOV) return false;
	}
	return lineOpen(sim, ex, ey, ez, enemy.pos.x, enemy.pos.y + enemy.height - 0.15, enemy.pos.z)
		|| lineOpen(sim, ex, ey, ez, enemy.pos.x, enemy.pos.y + enemy.height * 0.65, enemy.pos.z);
}

const lineOpen = (sim, ax, ay, az, bx, by, bz) => sim.grid.clearSight(ax, ay, az, bx, by, bz) && !smokeBlocks(sim, ax, ay, az, bx, by, bz);

// Refreshes the bot's view of the fight. Runs ten times a second per bot, staggered.
export function perceive(sim, bot) {
	const b = bot.brain;
	const intel = sim.intel[bot.squad];
	let best = null, bestScore = Infinity;
	for (const e of sim.soldiers) {
		if (!e.alive || e.squad === bot.squad) continue;
		if (!canSee(sim, bot, e)) continue;
		const memo = intel[e.id];
		memo.x = e.pos.x; memo.z = e.pos.z; memo.time = sim.time;
		const dist = Math.hypot(e.pos.x - bot.pos.x, e.pos.z - bot.pos.z);
		const toward = Math.atan2(-(e.pos.x - bot.pos.x), -(e.pos.z - bot.pos.z));
		const off = Math.abs(angleDiff(toward, bot.yaw));
		const score = dist * (0.4 + off) * (e === b.target ? 0.6 : 1);
		if (score < bestScore) { bestScore = score; best = e; }
	}
	if (best && best !== b.target) {
		b.reactAt = sim.time + b.skill.reaction * (b.target ? 0.5 : 1);
		b.aimPart = sim.rng.chance(b.skill.headChance) ? 'head' : 'chest';
		const miss = b.skill.spray * (0.5 + sim.rng.next());
		b.errYaw = (sim.rng.next() - 0.5) * miss;
		b.errPitch = (sim.rng.next() - 0.5) * miss * 0.6;
		const team = sim.tactics[bot.squad];
		if (sim.time - team.calledAt > 4) {
			team.calledAt = sim.time;
			radio(sim, bot, `Contact, ${sim.grid.calloutAt(best.pos.x, best.pos.z) || 'close'}`);
		}
	}
	if (best) b.lastContact = sim.time;
	if (b.target && !best) { b.lostX = b.target.pos.x; b.lostZ = b.target.pos.z; b.lostAt = sim.time; }
	b.target = best;

	for (const n of sim.noises.ring) {
		if (n.time <= b.heardAt || n.squad === bot.squad || n.squad < 0) continue;
		const d = Math.hypot(n.x - bot.pos.x, n.z - bot.pos.z);
		if (d > n.radius) continue;
		b.heardAt = n.time; b.heardX = n.x; b.heardZ = n.z;
	}
}

export function angleDiff(a, b) {
	let d = a - b;
	while (d > Math.PI) d -= Math.PI * 2;
	while (d < -Math.PI) d += Math.PI * 2;
	return d;
}

// Freshest intel the squad has on any enemy within `radius` of a point, or null.
export function intelNear(sim, squad, x, z, radius, maxAge) {
	let best = null;
	for (const m of sim.intel[squad]) {
		if (sim.time - m.time > maxAge) continue;
		if (Math.hypot(m.x - x, m.z - z) <= radius && (!best || m.time > best.time)) best = m;
	}
	return best;
}
