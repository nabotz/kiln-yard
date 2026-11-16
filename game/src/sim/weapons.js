// The arsenal as data, and the two rules every gun obeys: inaccuracy (stance, speed, air, bloom;
// milliradians) and recoil (a climb easing into a sideways sway; degrees per shot).

const MRAD = 0.001;
const DEG = Math.PI / 180;

// Most guns share these; each entry below states only what sets it apart.
const BASE = { head: 4, pellets: 1, auto: false, mobility: 1, kill: 300, scope: 0 };
const gun = (id, name, slot, stats) => ({ ...BASE, id, name, slot, ...stats });

export const WEAPONS = {
	wasp: gun('wasp', 'Wasp-9', 'secondary', {
		price: 200, mag: 13, reserve: 52, interval: 0.14, reload: 2.1, damage: 31, pen: 0.5, falloff: 0.88,
		spread: { stand: 4, crouch: 3, move: 22, air: 70, bloom: 10, recover: 6 }, recoil: { climb: 1.5, cap: 4, sway: 0.25 },
	}),
	anvil: gun('anvil', 'Anvil .50', 'secondary', {
		price: 700, mag: 7, reserve: 35, interval: 0.34, reload: 2.3, damage: 58, pen: 0.93, falloff: 0.81, mobility: 0.95,
		spread: { stand: 3.5, crouch: 2.5, move: 45, air: 100, bloom: 32, recover: 4 }, recoil: { climb: 5, cap: 2, sway: 0.8 },
	}),
	hornet: gun('hornet', 'Hornet SMG', 'primary', {
		price: 1250, mag: 30, reserve: 120, interval: 0.075, reload: 2.4, damage: 26, pen: 0.6, falloff: 0.84, auto: true, mobility: 0.96, kill: 600,
		spread: { stand: 7, crouch: 5.5, move: 12, air: 45, bloom: 3, recover: 8 }, recoil: { climb: 0.55, cap: 12, sway: 0.45 },
	}),
	breaker: gun('breaker', 'Breaker 12', 'primary', {
		price: 1100, mag: 7, reserve: 28, interval: 0.88, reload: 3.1, damage: 20, pen: 0.5, falloff: 0.5, head: 2.5, pellets: 9, mobility: 0.9, kill: 900,
		spread: { stand: 42, crouch: 40, move: 52, air: 70, bloom: 0, recover: 6 }, recoil: { climb: 4.5, cap: 1, sway: 0.6 },
	}),
	kestrel: gun('kestrel', 'Kestrel AR', 'primary', {
		price: 2700, mag: 30, reserve: 90, interval: 0.1, reload: 2.5, damage: 34, pen: 0.78, falloff: 0.96, auto: true, mobility: 0.86,
		spread: { stand: 1.2, crouch: 0.9, move: 60, air: 130, bloom: 5.5, recover: 5 }, recoil: { climb: 1.05, cap: 9, sway: 0.7 },
	}),
	longreach: gun('longreach', 'Longreach', 'primary', {
		price: 4750, mag: 5, reserve: 30, interval: 1.45, reload: 3.6, damage: 112, pen: 0.97, falloff: 0.99, mobility: 0.8, kill: 100, scope: 26,
		spread: { stand: 0.5, crouch: 0.35, move: 95, air: 220, bloom: 0, recover: 6, unscoped: 70 }, recoil: { climb: 2.2, cap: 1, sway: 0.2 },
	}),
};

export const NADE_NAMES = { frag: 'Frag', smoke: 'Smoke', flash: 'Flash' };

export function makeWeapon(id) {
	const def = WEAPONS[id];
	return { def, mag: def.mag, reserve: def.reserve, bloom: 0, spray: 0, nextFire: 0, lastShot: -9, reloadUntil: 0 };
}

// Cone half-angle, radians, that the next shot may stray from the aim line. Standing still and
// crouching are rewarded; running and jumping are punished; bloom grows with each shot.
export function inaccuracy(s, w, runSpeed) {
	const sp = w.def.spread;
	const speed = Math.hypot(s.vel.x, s.vel.z);
	const moving = Math.min(1, Math.max(0, (speed / (runSpeed * w.def.mobility) - 0.34) / 0.66));
	let base = s.crouch > 0.5 ? sp.crouch : sp.stand;
	if (w.def.scope && !s.scoped) base = sp.unscoped;
	return (base + sp.move * moving + (s.onGround ? 0 : sp.air) + w.bloom) * MRAD;
}

// Recoil of the n-th shot of a spray: a fast vertical climb easing into a plateau, then a
// side-to-side sway that the shooter must pull against. Writes radians into `out`.
export function recoilKick(def, n, jitter, out) {
	const r = def.recoil;
	const climb = n < r.cap ? r.climb * (1 + (0.6 * n) / r.cap) : r.climb * 0.22;
	const sway = n < 4 ? 0 : Math.sin((n - 4) * 0.5) * r.sway;
	out.pitch = climb * DEG;
	out.yaw = (sway + jitter * r.sway * 0.4) * DEG;
	return out;
}

export function damageAt(def, distance) {
	return def.damage * Math.pow(def.falloff, distance / 10);
}
