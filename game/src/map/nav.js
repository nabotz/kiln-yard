// Bot routing: A* over walkable cells (8-connected, no corner cutting), then string-pulled so
// bots walk straight lines between corners. Search buffers are allocated once.
import { CELL } from '../config.js';

const SQRT2 = Math.SQRT2;
const NEIGHBOURS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQRT2], [1, -1, SQRT2], [-1, 1, SQRT2], [-1, -1, SQRT2]];

export function createNav(grid) {
	const { width, depth } = grid;
	const size = width * depth;
	const cost = new Float32Array(size);
	const score = new Float32Array(size);
	const parent = new Int32Array(size);
	const seen = new Int32Array(size);
	const done = new Int32Array(size);
	const heap = new Int32Array(size * 8);
	let heapSize = 0;
	let search = 0;

	function push(i) {
		let k = heapSize++;
		heap[k] = i;
		while (k > 0) {
			const p = (k - 1) >> 1;
			if (score[heap[p]] <= score[heap[k]]) break;
			const t = heap[p]; heap[p] = heap[k]; heap[k] = t;
			k = p;
		}
	}
	function pop() {
		const top = heap[0];
		heap[0] = heap[--heapSize];
		let k = 0;
		for (;;) {
			const l = 2 * k + 1, r = l + 1;
			let m = k;
			if (l < heapSize && score[heap[l]] < score[heap[m]]) m = l;
			if (r < heapSize && score[heap[r]] < score[heap[m]]) m = r;
			if (m === k) break;
			const t = heap[m]; heap[m] = heap[k]; heap[k] = t;
			k = m;
		}
		return top;
	}

	// The walkable cell nearest a world point (a bot pressed against a crate stands half in it).
	function nearestWalkable(wx, wz) {
		const cx = Math.floor(wx / CELL), cz = Math.floor(wz / CELL);
		if (grid.walkable(cx, cz)) return cz * width + cx;
		for (let r = 1; r < 4; r++) {
			for (let dz = -r; dz <= r; dz++) {
				for (let dx = -r; dx <= r; dx++) if (grid.walkable(cx + dx, cz + dz)) return (cz + dz) * width + cx + dx;
			}
		}
		return -1;
	}

	// Fills `out` with world-space waypoints {x, z} from (ax, az) to (bx, bz); returns false if none.
	function findPath(ax, az, bx, bz, out) {
		out.length = 0;
		const start = nearestWalkable(ax, az), goal = nearestWalkable(bx, bz);
		if (start < 0 || goal < 0) return false;
		search++;
		heapSize = 0;
		const gx = goal % width, gz = (goal / width) | 0;
		const h = (i) => {
			const dx = Math.abs((i % width) - gx), dz = Math.abs(((i / width) | 0) - gz);
			return Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz);
		};
		cost[start] = 0; score[start] = h(start); parent[start] = -1; seen[start] = search;
		push(start);
		let found = false;
		while (heapSize > 0) {
			const i = pop();
			if (done[i] === search) continue;
			done[i] = search;
			if (i === goal) { found = true; break; }
			const x = i % width, z = (i / width) | 0;
			for (const [dx, dz, step] of NEIGHBOURS) {
				const nx = x + dx, nz = z + dz;
				if (!grid.walkable(nx, nz)) continue;
				if (dx !== 0 && dz !== 0 && (!grid.walkable(x + dx, z) || !grid.walkable(x, z + dz))) continue;
				const j = nz * width + nx;
				const c = cost[i] + step;
				if (seen[j] === search && c >= cost[j]) continue;
				seen[j] = search; cost[j] = c; score[j] = c + h(j); parent[j] = i;
				push(j);
			}
		}
		if (!found) return false;

		const cellsBack = [];
		for (let i = goal; i !== -1; i = parent[i]) cellsBack.push(i);
		const raw = [];
		for (let k = cellsBack.length - 2; k >= 0; k--) {
			const i = cellsBack[k];
			raw.push({ x: ((i % width) + 0.5) * CELL, z: (((i / width) | 0) + 0.5) * CELL });
		}
		if (raw.length > 0) raw[raw.length - 1] = { x: bx, z: bz };
		else raw.push({ x: bx, z: bz });

		// String pulling: from each anchor, jump to the furthest waypoint still in a clear line.
		let fromX = ax, fromZ = az, k = 0;
		while (k < raw.length) {
			let far = k;
			for (let m = raw.length - 1; m > k; m--) {
				if (grid.clearWalk(fromX, fromZ, raw[m].x, raw[m].z, 0.42)) { far = m; break; }
			}
			out.push(raw[far]);
			fromX = raw[far].x; fromZ = raw[far].z;
			k = far + 1;
		}
		return true;
	}

	return { findPath };
}
