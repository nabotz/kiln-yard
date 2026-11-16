// Set dressing that tells a player where they are and makes the works look lived in: painted
// signs on the walls, lane names painted on the floor, corrugated roofs over the two passages and
// water tanks and vents on the building roofs. None of it touches the simulation.
import * as THREE from 'three';
import { CELL } from '../config.js';
import { PALETTE } from '../palette.js';
import { KINDS } from '../map/layout.js';
import { createRng } from '../rng.js';
import { painted, rgb } from './textures.js';

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
}
