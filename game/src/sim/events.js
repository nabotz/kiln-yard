// Pooled per-frame events (shots, hits, kills, steps, round results) the simulation writes and
// the renderer, audio and HUD read once; and the ring of recent noises bots can hear.
// Fields: `s` the soldier, `o` another soldier, `id` weapon/part/reason, `x y z`, `x2 y2 z2`, `n`.

const CAPACITY = 384;

export function createEvents() {
	const pool = [];
	for (let i = 0; i < CAPACITY; i++) pool.push({ type: '', s: null, o: null, id: '', n: 0, x: 0, y: 0, z: 0, x2: 0, y2: 0, z2: 0 });
	let count = 0;

	return {
		emit(type, s = null, id = '') {
			const e = pool[count < CAPACITY ? count++ : CAPACITY - 1];
			e.type = type; e.s = s; e.o = null; e.id = id; e.n = 0;
			if (s) { e.x = s.pos.x; e.y = s.pos.y; e.z = s.pos.z; }
			return e;
		},
		forEach(fn) {
			for (let i = 0; i < count; i++) fn(pool[i]);
		},
		clear() { count = 0; },
	};
}

// Sounds the bots can hear: a small ring of recent noises with their reach.
export function createNoises() {
	const ring = [];
	for (let i = 0; i < 32; i++) ring.push({ x: 0, z: 0, squad: -1, radius: 0, time: -99 });
	let head = 0;
	return {
		ring,
		add(x, z, squad, radius, time) {
			const n = ring[head];
			head = (head + 1) % ring.length;
			n.x = x; n.z = z; n.squad = squad; n.radius = radius; n.time = time;
		},
		clear() { for (const n of ring) n.time = -99; },
	};
}
