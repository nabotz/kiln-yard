// The map as collision geometry: cells holding at most one box each, and the queries physics,
// bullets and bots make of it (nearby boxes, first ray hit by grid walk, clear sight, clear walk).
import { CELL } from '../config.js';
import { ROWS, KINDS, CALLOUTS } from './layout.js';

export function createGrid() {
	const depth = ROWS.length;
	const width = ROWS[0].length;
	const cells = [];
	const spawns = { atk: [], def: [] };

	for (let z = 0; z < depth; z++) {
		for (let x = 0; x < width; x++) {
			const ch = ROWS[z][x];
			const kind = KINDS[ch];
			const inset = kind ? kind.inset : 0;
			const cell = {
				x, z, ch,
				top: kind ? kind.top : 0,
				mat: kind ? kind.mat : 'floor',
				minX: x * CELL + inset, maxX: (x + 1) * CELL - inset,
				minZ: z * CELL + inset, maxZ: (z + 1) * CELL - inset,
				zone: ch === 'a' ? 'A' : ch === 'b' ? 'B' : null,
				spawn: ch === 'T' ? 'atk' : ch === 'D' ? 'def' : null,
			};
			cells.push(cell);
			if (cell.spawn) spawns[cell.spawn].push(cell);
		}
	}

	const at = (cx, cz) => (cx < 0 || cz < 0 || cx >= width || cz >= depth ? null : cells[cz * width + cx]);
	const open = (cx, cz) => at(cx, cz) !== null && at(cx, cz).ch !== '#';
	for (const c of cells) {
		if (c.ch !== '#') continue;
		let exposed = false;
		for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (open(c.x + dx, c.z + dz)) exposed = true;
		if (!exposed) c.top = KINDS['#'].core;
	}
	const atWorld = (wx, wz) => at(Math.floor(wx / CELL), Math.floor(wz / CELL));
	const walkable = (cx, cz) => {
		const c = at(cx, cz);
		return c !== null && c.top === 0;
	};

	// Fills `out` with every solid cell whose box overlaps the given world rectangle. The map is
	// walled all round, so a query never needs the cells beyond its edge.
	function collectBoxes(minX, minZ, maxX, maxZ, out) {
		out.length = 0;
		const x0 = Math.floor(minX / CELL), x1 = Math.floor(maxX / CELL);
		const z0 = Math.floor(minZ / CELL), z1 = Math.floor(maxZ / CELL);
		for (let z = z0; z <= z1; z++) {
			for (let x = x0; x <= x1; x++) {
				const c = at(x, z);
				if (c !== null && c.top > 0 && c.maxX > minX && c.minX < maxX && c.maxZ > minZ && c.minZ < maxZ) out.push(c);
			}
		}
		return out;
	}

	// A ray that leaves the map stops at its edge as if at a tall wall; one scratch cell serves.
	const outside = { x: 0, z: 0, top: 50, minX: 0, maxX: 0, minZ: 0, maxZ: 0, mat: 'wall' };
	function outsideAt(x, z) {
		outside.minX = x * CELL; outside.maxX = (x + 1) * CELL;
		outside.minZ = z * CELL; outside.maxZ = (z + 1) * CELL;
		return outside;
	}

	// Ray against one cell's box (slab test): narrow the ray's [min, max] span by one axis at a
	// time, remembering which axis it entered through for the surface normal.
	const span = { min: 0, max: 0, axis: -1, sign: 0 };
	function clip(o, d, lo, hi, axis) {
		if (d === 0) return o >= lo && o <= hi;
		let t1 = (lo - o) / d, t2 = (hi - o) / d, s = -1;
		if (t1 > t2) { const k = t1; t1 = t2; t2 = k; s = 1; }
		if (t1 > span.min) { span.min = t1; span.axis = axis; span.sign = s; }
		if (t2 < span.max) span.max = t2;
		return true;
	}
	function slab(c, ox, oy, oz, dx, dy, dz, hit) {
		span.min = 0; span.max = Infinity; span.axis = -1;
		if (!clip(ox, dx, c.minX, c.maxX, 0) || !clip(oy, dy, 0, c.top, 1) || !clip(oz, dz, c.minZ, c.maxZ, 2)) return Infinity;
		if (span.max < span.min || span.axis < 0) return Infinity;
		hit.nx = span.axis === 0 ? span.sign : 0;
		hit.ny = span.axis === 1 ? span.sign : 0;
		hit.nz = span.axis === 2 ? span.sign : 0;
		return span.min;
	}

	// First thing a ray meets within maxDist: a box, the floor or the map's edge. Fills `hit`
	// ({ t, exit, nx, ny, nz, cell }; exit is where the ray leaves a box) and returns t (Infinity for nothing). Direction must be unit length.
	function raycast(ox, oy, oz, dx, dy, dz, maxDist, hit) {
		let limit = maxDist;
		let floorHit = false;
		if (dy < 0) {
			const tf = -oy / dy;
			if (tf < limit) { limit = tf; floorHit = true; }
		}
		let cx = Math.floor(ox / CELL), cz = Math.floor(oz / CELL);
		const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
		const tDeltaX = dx !== 0 ? Math.abs(CELL / dx) : Infinity;
		const tDeltaZ = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
		let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * CELL - ox : ox - cx * CELL) / Math.abs(dx) : Infinity;
		let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * CELL - oz : oz - cz * CELL) / Math.abs(dz) : Infinity;
		let t = 0;
		while (t <= limit) {
			const c = at(cx, cz) ?? outsideAt(cx, cz);
			if (c.top > 0) {
				const th = slab(c, ox, oy, oz, dx, dy, dz, hit);
				if (th <= limit) {
					hit.t = th;
					hit.exit = span.max;
					hit.cell = c;
					return th;
				}
			}
			if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; cx += stepX; }
			else { t = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
		}
		hit.cell = null;
		if (floorHit) {
			hit.nx = 0; hit.ny = 1; hit.nz = 0;
			hit.t = limit;
			return limit;
		}
		hit.t = Infinity;
		return Infinity;
	}

	const scratch = { t: 0, exit: 0, nx: 0, ny: 0, nz: 0, cell: null };
	// True when nothing solid lies between two points (bots' sight, grenade damage).
	function clearSight(ax, ay, az, bx, by, bz) {
		const dx = bx - ax, dy = by - ay, dz = bz - az;
		const len = Math.hypot(dx, dy, dz);
		if (len < 1e-4) return true;
		return raycast(ax, ay, az, dx / len, dy / len, dz / len, len, scratch) >= len - 0.05;
	}

	// True when a body of the given radius can walk the straight line between two floor points.
	function clearWalk(ax, az, bx, bz, radius) {
		const len = Math.hypot(bx - ax, bz - az);
		const n = Math.max(1, Math.ceil(len / 0.4));
		for (let i = 0; i <= n; i++) {
			const x = ax + ((bx - ax) * i) / n, z = az + ((bz - az) * i) / n;
			if (!walkableAtWorld(x - radius, z - radius) || !walkableAtWorld(x + radius, z - radius)
				|| !walkableAtWorld(x - radius, z + radius) || !walkableAtWorld(x + radius, z + radius)) return false;
		}
		return true;
	}
	const walkableAtWorld = (wx, wz) => walkable(Math.floor(wx / CELL), Math.floor(wz / CELL));

	function calloutAt(wx, wz) {
		const cx = wx / CELL, cz = wz / CELL;
		for (const [name, x0, z0, x1, z1] of CALLOUTS) if (cx >= x0 && cx < x1 && cz >= z0 && cz < z1) return name;
		return '';
	}

	return {
		width, depth, cells, spawns,
		at, atWorld, walkable, collectBoxes, raycast, clearSight, clearWalk, calloutAt,
		zoneAt: (wx, wz) => atWorld(wx, wz)?.zone ?? null,
		spawnAt: (wx, wz) => atWorld(wx, wz)?.spawn ?? null,
	};
}
