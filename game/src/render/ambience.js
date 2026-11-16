// The works breathing: smoke plumes drifting off every chimney and embers rising from the kiln's
// firebox. Purely visual and driven by the simulation clock, so a screenshot frame repeats exactly.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

const WIND_X = 0.55, WIND_Z = -0.35;
const PUFFS = 9, EMBERS = 70;

export function createAmbience(scene, tex, stacks, firebox) {
	const smoke = new THREE.SpriteMaterial({ map: tex.smoke, color: 0x3c3432, transparent: true, depthWrite: false, fog: false });
	const plumes = [];
	for (const top of stacks) {
		for (let i = 0; i < PUFFS; i++) {
			const s = new THREE.Sprite(smoke.clone());
			scene.add(s);
			plumes.push({ s, top, phase: i / PUFFS });
		}
	}

	const positions = new Float32Array(EMBERS * 3);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
	const embers = new THREE.Points(geo, new THREE.PointsMaterial({
		map: tex.glow, color: PALETTE.ember, size: 0.045, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false,
	}));
	embers.frustumCulled = false;
	scene.add(embers);

	return {
		update(time) {
			for (const p of plumes) {
				const age = (time * 0.05 + p.phase) % 1;
				p.s.position.set(p.top.x + age * 16 * WIND_X, p.top.y + 1 + age * 14, p.top.z + age * 16 * WIND_Z);
				p.s.scale.setScalar(2.5 + age * 9);
				p.s.material.opacity = 0.8 * Math.sin(Math.PI * Math.min(1, age * 1.4));
			}
			// Each ember loops: out of the firebox, up and drifting, gone after a few metres.
			for (let i = 0; i < EMBERS; i++) {
				const k = (time * 0.18 + i * 0.618) % 1;
				positions[i * 3] = firebox.x + Math.sin(i * 7.1 + time * 0.9) * (0.4 + k * 1.6);
				positions[i * 3 + 1] = firebox.y + k * 4.5;
				positions[i * 3 + 2] = firebox.z + Math.cos(i * 3.7 + time * 0.7) * (0.4 + k * 1.6) - k * 1.5;
			}
			geo.attributes.position.needsUpdate = true;
		},
	};
}
