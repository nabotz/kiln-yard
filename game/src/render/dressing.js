// Set dressing that tells a player where they are and makes the works look lived in: painted
// signs on the walls, lane names painted on the floor, roofs over the two passages, tanks and
// vents on the building roofs, work lamps, and chimneys and sheds beyond the walls. None of it
// touches the simulation.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { PALETTE } from '../palette.js';
import { KINDS } from '../map/layout.js';
import { createRng } from '../rng.js';
import { painted, rgb } from './textures.js';
import { createBuilder, box, toMesh } from './level.js';

// Wall signs: [text, arrow, x, y, z, facing yaw] in metres.
const SIGNS = [
	['A', true, 13.98, 2.8, 23, -Math.PI / 2], ['B', true, 66.02, 2.8, 22, Math.PI / 2],
	['KILN  A', false, 30, 3.4, 14.02, 0], ['DOCK  B', false, 50, 3.4, 12.02, 0],
	['MID', false, 40, 3.2, 47.98, Math.PI], ['WATCH', false, 40, 3.6, 0.02, 0],
];
// Lane names on the floor: [text, x, z, turn] in metres, read walking north (turn 0) or east.
const FLOOR = [
	['A LONG', 9, 37, 0], ['B YARD', 71, 37, 0], ['MID', 40, 42, 0],
	['UNDERPASS', 22, 40, -Math.PI / 2], ['GARAGE', 54, 36, -Math.PI / 2], ['COURTYARD', 40, 31, 0],
];
// Corrugated roofs over the Kiln Passage and the Catwalk [x0, x1, z0, z1], resting on their walls.
const ROOFS = [[24, 36, 13.9, 18.1], [44, 56, 11.9, 16.1]];

const decal = (map) => new THREE.MeshStandardMaterial({ map, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });

// A dark board with a hazard edge, the text and an optional arrow.
const board = (text, arrow) => painted(512, 256, (g) => {
	g.fillStyle = rgb(PALETTE.soot, 0.9);
	g.fillRect(8, 8, 496, 240);
	g.strokeStyle = rgb(PALETTE.hazard);
	g.lineWidth = 10;
	g.strokeRect(14, 14, 484, 228);
	g.fillStyle = g.strokeStyle = rgb(PALETTE.sandstone, 1.05);
	g.font = `900 ${text.length === 1 ? 190 : 84}px Impact, "Arial Black", sans-serif`;
	g.textAlign = 'center'; g.textBaseline = 'middle';
	g.fillText(text, arrow ? 190 : 256, 134);
	if (arrow) {
		g.beginPath();
		g.moveTo(330, 90); g.lineTo(430, 128); g.lineTo(330, 166);
		g.lineWidth = 26;
		g.stroke();
	}
});

// Road paint, worn through in a scatter of spots.
const lanePaint = (text, rng) => painted(512, 128, (g) => {
	g.fillStyle = 'rgba(236,226,206,0.78)';
	g.font = '900 96px Impact, "Arial Black", sans-serif';
	g.textAlign = 'center'; g.textBaseline = 'middle';
	g.fillText(text, 256, 68);
	g.globalCompositeOperation = 'destination-out';
	for (let i = 0; i < 260; i++) g.fillRect(rng.next() * 512, rng.next() * 128, 2 + rng.next() * 7, 2 + rng.next() * 4);
});

export function dress(scene, grid, tex) {
	const rng = createRng(31);
	const W = grid.width * CELL, D = grid.depth * CELL;
	const stacks = chimneys(W, D);
	scene.add(skyline(W, D, stacks, tex), ...lamps());
	for (const [text, arrow, x, y, z, yaw] of SIGNS) {
		const m = new THREE.Mesh(new THREE.PlaneGeometry(arrow ? 3 : 4, arrow ? 1.5 : 2), decal(board(text, arrow)));
		m.position.set(x, y, z);
		m.rotation.y = yaw;
		scene.add(m);
	}
	for (const [text, x, z, turn] of FLOOR) {
		const m = new THREE.Mesh(new THREE.PlaneGeometry(text.length * 0.62, 1.25), decal(lanePaint(text, rng)));
		m.rotation.set(-Math.PI / 2, 0, turn);
		m.position.set(x, 0.015, z);
		m.receiveShadow = true;
		scene.add(m);
	}
	const steel = new THREE.MeshStandardMaterial({ map: tex.steel, roughness: 0.55, metalness: 0.35 });
	const concrete = new THREE.MeshStandardMaterial({ map: tex.concrete, roughness: 0.9 });
	for (const [x0, x1, z0, z1] of ROOFS) {
		const roof = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.1, z1 - z0), steel);
		roof.position.set((x0 + x1) / 2, 4.6, (z0 + z1) / 2);
		roof.castShadow = true;
		scene.add(roof);
	}
	// Water tanks and vent housings where a building core is surrounded by building on every side.
	const tank = new THREE.CylinderGeometry(0.85, 0.85, 1.7, 14), stand = new THREE.BoxGeometry(1.5, 0.9, 1.5), vent = new THREE.BoxGeometry(1.4, 0.8, 1.1);
	for (const c of grid.cells) {
		if (c.top <= KINDS['#'].top || !rng.chance(0.16)) continue;
		let deep = true;
		for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if ((grid.at(c.x + dx, c.z + dz)?.top ?? 0) < c.top) deep = false;
		if (!deep) continue;
		const parts = rng.chance(0.5) ? [[stand, concrete, 0.45], [tank, steel, 1.75]] : [[vent, concrete, 0.4]];
		for (const [geo, material, y] of parts) {
			const m = new THREE.Mesh(geo, material);
			m.position.set((c.x + 0.5) * CELL, c.top + y, (c.z + 0.5) * CELL);
			m.castShadow = true;
			scene.add(m);
		}
	}
	return { stacks: stacks.map(([x, z, h]) => ({ x, y: h, z })) };
}

// Chimneys beyond the walls [x, z, height], and the sheds around them, so the yard sits inside a
// works and not in a void.
const chimneys = (W, D) => [[-14, 24, 34], [W + 16, 44, 40], [36, -18, 30], [58, D + 20, 36], [W + 10, D + 14, 28]];

// Sheds around the chimneys beyond the walls, so the yard sits inside a works and not in a void.
function skyline(W, D, stacks, tex) {
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
	const sheds = toMesh(b, new THREE.MeshStandardMaterial({ map: tex.brick, color: 0x9a8a80, roughness: 1 }));
	sheds.castShadow = false;
	g.add(sheds);
	const stackMat = new THREE.MeshStandardMaterial({ map: tex.brick.clone(), roughness: 0.92 });
	stackMat.map.repeat.set(2, 6);
	stackMat.map.needsUpdate = true;
	for (const [x, z, h] of stacks) {
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
