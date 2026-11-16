// The map's look, built from the grid the physics uses: merged brick faces (only those facing
// open floor), merged crates and barriers, the kiln, site markings, signs and a skyline beyond
// the walls. One draw call per material.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { PALETTE } from '../palette.js';
import { createRng } from '../rng.js';
import { KINDS, PAVED } from '../map/layout.js';

function createBuilder() {
	return { pos: [], nor: [], uv: [], idx: [] };
}

// A quad from corner a along edges u and v (u x v is the facing normal).
function quad(b, a, u, v, n, u0, v0, u1, v1) {
	const i = b.pos.length / 3;
	b.pos.push(a[0], a[1], a[2], a[0] + u[0], a[1] + u[1], a[2] + u[2],
		a[0] + u[0] + v[0], a[1] + u[1] + v[1], a[2] + u[2] + v[2], a[0] + v[0], a[1] + v[1], a[2] + v[2]);
	for (let k = 0; k < 4; k++) b.nor.push(n[0], n[1], n[2]);
	b.uv.push(u0, v0, u1, v0, u1, v1, u0, v1);
	b.idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
}

// The four side faces of a box and its top. `tile` is either [u, v] metres per texture repeat
// (tiled in world units, so neighbouring boxes line up) or a number: one repeat across each face
// and that many up it (a crate shows its whole frame on every side).
function box(b, x0, y0, z0, x1, y1, z1, tile, top = true) {
	const w = x1 - x0, h = y1 - y0, d = z1 - z0;
	const uv = (along, len) => (Array.isArray(tile)
		? [along / tile[0], y0 / tile[1], (along + len) / tile[0], y1 / tile[1]]
		: [0, 0, 1, tile]);
	let q = uv(-z1, d); quad(b, [x1, y0, z1], [0, 0, -d], [0, h, 0], [1, 0, 0], q[0], q[1], q[2], q[3]);
	q = uv(z0, d); quad(b, [x0, y0, z0], [0, 0, d], [0, h, 0], [-1, 0, 0], q[0], q[1], q[2], q[3]);
	q = uv(x0, w); quad(b, [x0, y0, z1], [w, 0, 0], [0, h, 0], [0, 0, 1], q[0], q[1], q[2], q[3]);
	q = uv(-x1, w); quad(b, [x1, y0, z0], [-w, 0, 0], [0, h, 0], [0, 0, -1], q[0], q[1], q[2], q[3]);
	if (top) quad(b, [x0, y1, z1], [w, 0, 0], [0, 0, -d], [0, 1, 0], 0, 0, 1, 1);
}

const SIDES = [[1, 0], [-1, 0], [0, 1], [0, -1]];

// One side of a wall cell between heights y0 and y1: 4 m texture tiles along it, one tile of
// `tall` metres up it from `base`.
function wallFace(b, c, dx, dz, y0, y1, tall, base) {
	const h = y1 - y0, v0 = (y0 - base) / tall, v1 = (y1 - base) / tall;
	if (dx === 1) quad(b, [c.maxX, y0, c.maxZ], [0, 0, -CELL], [0, h, 0], [1, 0, 0], -c.maxZ / 4, v0, -c.minZ / 4, v1);
	else if (dx === -1) quad(b, [c.minX, y0, c.minZ], [0, 0, CELL], [0, h, 0], [-1, 0, 0], c.minZ / 4, v0, c.maxZ / 4, v1);
	else if (dz === 1) quad(b, [c.minX, y0, c.maxZ], [CELL, 0, 0], [0, h, 0], [0, 0, 1], c.minX / 4, v0, c.maxX / 4, v1);
	else quad(b, [c.maxX, y0, c.minZ], [-CELL, 0, 0], [0, h, 0], [0, 0, -1], -c.maxX / 4, v0, -c.minX / 4, v1);
}

function toMesh(b, material) {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
	g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
	g.setIndex(b.idx);
	g.computeBoundingSphere();
	const m = new THREE.Mesh(g, material);
	m.castShadow = true;
	m.receiveShadow = true;
	return m;
}

export function buildLevel(scene, grid, tex) {
	const W = grid.width * CELL, D = grid.depth * CELL;
	const mat = {
		wall: new THREE.MeshStandardMaterial({ map: tex.brick, roughness: 0.92 }),
		floor: new THREE.MeshStandardMaterial({ map: tex.clay, roughness: 0.96 }),
		paved: new THREE.MeshStandardMaterial({ map: tex.slabs, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -1 }),
		crate: new THREE.MeshStandardMaterial({ map: tex.crate, roughness: 0.85 }),
		crateTall: new THREE.MeshStandardMaterial({ map: tex.steel, roughness: 0.55, metalness: 0.35 }),
		barrier: new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.9 }),
		facade: new THREE.MeshStandardMaterial({ map: tex.facade, emissiveMap: tex.facadeGlow, emissive: 0xffb873, emissiveIntensity: 0.95, roughness: 0.9 }),
		shed: new THREE.MeshStandardMaterial({ map: tex.brick, color: 0x9a8a80, roughness: 1 }),
	};

	const floor = createBuilder();
	quad(floor, [0, 0, D], [W, 0, 0], [0, 0, -D], [0, 1, 0], 0, -D / 4, W / 4, 0);
	const paved = createBuilder();
	for (const [x0, z0, x1, z1] of PAVED) {
		const w = (x1 - x0) * CELL, d = (z1 - z0) * CELL;
		quad(paved, [x0 * CELL, 0, z1 * CELL], [w, 0, 0], [0, 0, -d], [0, 1, 0], x0 * CELL / 4, -z1 * CELL / 4, x1 * CELL / 4, -z0 * CELL / 4);
	}
	for (const m of [toMesh(floor, mat.floor), toMesh(paved, mat.paved)]) {
		m.castShadow = false;
		scene.add(m);
	}

	// Walls: a face is built only where a cell rises above its neighbour, so the merged meshes stay
	// small. Brick runs up to the yard walls' height; the building cores above show a facade.
	const walls = createBuilder(), facades = createBuilder();
	const yardTop = KINDS['#'].top;
	for (const c of grid.cells) {
		if (c.ch !== '#') continue;
		for (const [dx, dz] of SIDES) {
			const n = grid.at(c.x + dx, c.z + dz);
			if (n === null) continue;
			const from = n.ch === '#' ? n.top : 0;
			if (from < yardTop) wallFace(walls, c, dx, dz, from, Math.min(c.top, yardTop), yardTop, 0);
			if (c.top > yardTop && from < c.top) wallFace(facades, c, dx, dz, Math.max(from, yardTop), c.top, c.top - yardTop, yardTop);
		}
	}
	scene.add(toMesh(walls, mat.wall), toMesh(facades, mat.facade));

	const crates = createBuilder(), tall = createBuilder(), barriers = createBuilder();
	for (const c of grid.cells) {
		if (c.mat === 'crate') box(crates, c.minX, 0, c.minZ, c.maxX, c.top, c.maxZ, 1);
		else if (c.mat === 'crateTall') box(tall, c.minX, 0, c.minZ, c.maxX, c.top, c.maxZ, 2);
		else if (c.mat === 'barrier') box(barriers, c.minX, 0, c.minZ, c.maxX, c.top, c.maxZ, 1);
	}
	scene.add(toMesh(crates, mat.crate), toMesh(tall, mat.crateTall), toMesh(barriers, mat.barrier));

	const kiln = buildKiln(grid, mat.wall);
	scene.add(kiln.group);
	for (const [zone, map] of [['A', tex.zoneA], ['B', tex.zoneB]]) scene.add(zoneMarking(grid, zone, map));
	for (const s of SIGNS) scene.add(wallSign(tex, s));
	scene.add(skyline(W, D, mat.shed, mat.wall), ...lamps());

	return {
		update(time) {
			kiln.light.intensity = 9 + Math.sin(time * 7.3) * 1.6 + Math.sin(time * 17.1) * 0.9;
		},
	};
}

// The kiln: a brick drum and dome with a chimney, its firebox glowing through an arch.
function buildKiln(grid, brick) {
	const cells = grid.cells.filter((c) => c.ch === 'K');
	const x = cells.reduce((s, c) => s + c.x + 0.5, 0) / cells.length * CELL;
	const z = cells.reduce((s, c) => s + c.z + 0.5, 0) / cells.length * CELL;
	const group = new THREE.Group();
	group.position.set(x, 0, z);
	const material = brick.clone();
	material.map = brick.map.clone();
	material.map.repeat.set(3, 0.5);
	const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.95, 2.05, 2.1, 28, 1, true), material);
	drum.position.y = 1.05;
	const dome = new THREE.Mesh(new THREE.SphereGeometry(1.95, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2), material);
	dome.position.y = 2.1;
	const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.4, 2.6, 12), material);
	stack.position.y = 4.9;
	const mouth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.1), new THREE.MeshBasicMaterial({ color: PALETTE.ember }));
	mouth.position.set(0, 0.6, -2.02);
	mouth.rotation.y = Math.PI;
	for (const m of [drum, dome, stack]) { m.castShadow = true; m.receiveShadow = true; }
	const light = new THREE.PointLight(PALETTE.ember, 9, 9, 1.6);
	light.position.set(0, 0.8, -2.6);
	group.add(drum, dome, stack, mouth, light);
	return { group, light };
}

function zoneMarking(grid, zone, map) {
	let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
	for (const c of grid.cells) {
		if (c.zone !== zone) continue;
		x0 = Math.min(x0, c.x); z0 = Math.min(z0, c.z); x1 = Math.max(x1, c.x + 1); z1 = Math.max(z1, c.z + 1);
	}
	const m = new THREE.Mesh(
		new THREE.PlaneGeometry((x1 - x0) * CELL, (z1 - z0) * CELL),
		new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2 }),
	);
	m.rotation.x = -Math.PI / 2;
	m.position.set(((x0 + x1) / 2) * CELL, 0.01, ((z0 + z1) / 2) * CELL);
	m.receiveShadow = true;
	return m;
}

// Stencilled signs: [text, arrow, x, y, z, facing yaw] in metres.
const SIGNS = [
	['A', true, 13.98, 2.8, 23, -Math.PI / 2],
	['B', true, 66.02, 2.8, 22, Math.PI / 2],
	['KILN  A', false, 30, 3.4, 14.02, 0],
	['DOCK  B', false, 50, 3.4, 12.02, 0],
	['MID', false, 40, 3.2, 47.98, Math.PI],
	['WATCH', false, 40, 3.6, 0.02, 0],
];

function wallSign(tex, [text, arrow, x, y, z, yaw]) {
	const m = new THREE.Mesh(
		new THREE.PlaneGeometry(arrow ? 2.6 : 3.6, arrow ? 1.3 : 1.8),
		new THREE.MeshStandardMaterial({ map: tex.sign(text, arrow), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 }),
	);
	m.position.set(x, y, z);
	m.rotation.y = yaw;
	return m;
}

// Sheds and chimneys beyond the walls, so the yard sits inside a works and not in a void.
function skyline(W, D, shedMat, brick) {
	const g = new THREE.Group();
	const rng = createRng(11);
	const b = createBuilder();
	for (let i = 0; i < 16; i++) {
		const side = i % 4;
		const t = (Math.floor(i / 4) + 0.5) / 4;
		const h = 8 + rng.next() * 9, len = 14 + rng.next() * 10, deep = 10 + rng.next() * 8, gap = 6 + rng.next() * 10;
		const along = (side < 2 ? W : D) * t - len / 2;
		const out = side % 2 === 0 ? -gap - deep : (side < 2 ? D : W) + gap;
		if (side < 2) box(b, along, 0, out, along + len, h, out + deep, [4, 5.2]);
		else box(b, out, 0, along, out + deep, h, along + len, [4, 5.2]);
	}
	const sheds = toMesh(b, shedMat);
	sheds.castShadow = false;
	g.add(sheds);
	const stackMat = brick.clone();
	stackMat.map = brick.map.clone();
	stackMat.map.repeat.set(2, 6);
	for (const [x, z, h] of [[-14, 24, 34], [W + 16, 44, 40], [36, -18, 30], [58, D + 20, 36], [W + 10, D + 14, 28]]) {
		const stack = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 2.3, h, 18), stackMat);
		stack.position.set(x, h / 2, z);
		const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.55, 0.8, 18), new THREE.MeshBasicMaterial({ color: PALETTE.ember }));
		rim.position.set(x, h, z);
		g.add(stack, rim);
	}
	return g;
}

// Work lamps over the sites and mid: an emissive shade and a warm point light each.
function lamps() {
	const out = [];
	const shade = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
	for (const [x, z] of [[12, 9], [67, 9], [40, 30], [40, 56]]) {
		const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.12, 0.35), shade);
		lamp.position.set(x, 4.9, z);
		const light = new THREE.PointLight(0xffc98a, 14, 16, 1.5);
		light.position.set(x, 4.6, z);
		out.push(lamp, light);
	}
	return out;
}
