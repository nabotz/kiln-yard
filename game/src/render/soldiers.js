// Third-person bodies in their side's colours that walk, crouch, aim, show armour, helmet and
// the carried charge, and fall when killed. Interpolated between simulation steps.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { activeWeapon } from '../sim/soldier.js';

const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const GEO = {
	thigh: box(0.17, 0.46, 0.19), shin: box(0.15, 0.44, 0.17), knee: box(0.17, 0.1, 0.06), boot: box(0.17, 0.11, 0.27),
	belt: box(0.46, 0.09, 0.27), chest: box(0.44, 0.5, 0.25), plate: box(0.48, 0.34, 0.3), pack: box(0.34, 0.36, 0.14),
	pad: box(0.15, 0.08, 0.18), head: box(0.21, 0.24, 0.22), visor: box(0.19, 0.05, 0.02), pouch: box(0.1, 0.12, 0.05),
	helmet: new THREE.SphereGeometry(0.16, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap: new THREE.SphereGeometry(0.128, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2),
	limb: box(0.1, 0.1, 1), glove: box(0.09, 0.09, 0.1), gun: box(0.07, 0.11, 1), charge: box(0.26, 0.16, 0.08),
};
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const DIR = new THREE.Vector3();

function sideMaterials(main, dark) {
	const std = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
	return {
		jacket: std(main), pants: std(dark), gear: std(new THREE.Color(main).multiplyScalar(0.62).getHex(), 0.7),
		helmet: std(new THREE.Color(main).multiplyScalar(0.55).getHex(), 0.6),
		visor: new THREE.MeshBasicMaterial({ color: new THREE.Color(main).multiplyScalar(1.3) }),
	};
}

const SHARED = {
	skin: new THREE.MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.8 }),
	glove: new THREE.MeshStandardMaterial({ color: PALETTE.soot, roughness: 0.9 }),
	gun: new THREE.MeshStandardMaterial({ color: PALETTE.gunmetal, roughness: 0.45, metalness: 0.6 }),
	charge: new THREE.MeshStandardMaterial({ color: PALETTE.soot, emissive: PALETTE.ember, emissiveIntensity: 0.6 }),
};

// One figure, facing -z with its feet at the origin. `tint` lists every mesh painted in a side
// colour, so a half-time side swap only swaps materials.
function buildFigure(soldier, mats) {
	const m = mats[soldier.side];
	const tint = [];
	const part = (geo, key, x, y, z, parent) => {
		const mesh = new THREE.Mesh(geo, m[key] ?? SHARED[key]);
		mesh.position.set(x, y, z);
		mesh.castShadow = true;
		parent.add(mesh);
		if (m[key]) tint.push([mesh, key]);
		return mesh;
	};
	// A limb as a box stretched between two points of its parent's space.
	const limb = (a, b, parent) => {
		const mesh = part(GEO.limb, 'jacket', (a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2, parent);
		DIR.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
		mesh.scale.z = DIR.length();
		mesh.quaternion.setFromUnitVectors(Z_AXIS, DIR.normalize());
	};
	const joint = (parent, x, y) => {
		const g = new THREE.Group();
		g.position.set(x, y, 0);
		parent.add(g);
		return g;
	};
	const root = new THREE.Group();
	root.rotation.order = 'YXZ';
	const hips = joint(root, 0, 0.92);
	const leg = (x) => {
		const hip = joint(hips, x, 0);
		part(GEO.thigh, 'pants', 0, -0.23, 0, hip);
		const knee = joint(hip, 0, -0.46);
		part(GEO.knee, 'gear', 0, 0, -0.1, knee);
		part(GEO.shin, 'pants', 0, -0.22, 0, knee);
		part(GEO.boot, 'gear', 0, -0.44, -0.04, knee);
		return { hip, knee };
	};
	const legL = leg(-0.12), legR = leg(0.12);
	const torso = joint(hips, 0, 0);
	part(GEO.belt, 'gear', 0, 0.03, 0, torso);
	part(GEO.chest, 'jacket', 0, 0.29, 0, torso);
	const plate = part(GEO.plate, 'gear', 0, 0.33, 0, torso);
	for (const x of [-0.13, 0, 0.13]) part(GEO.pouch, 'helmet', x, -0.08, -0.17, plate);
	part(GEO.pack, 'gear', 0, 0.3, 0.19, torso);
	const charge = part(GEO.charge, 'charge', 0, 0.33, 0.29, torso);
	for (const x of [-0.25, 0.25]) part(GEO.pad, 'gear', x, 0.5, 0, torso);
	const neck = joint(torso, 0, 0.62);
	part(GEO.head, 'skin', 0, 0.02, 0, neck);
	// A soft cap in the side's colour, or a steel helmet once one is bought.
	const cap = part(GEO.cap, 'jacket', 0, 0.1, 0.01, neck);
	const helmet = part(GEO.helmet, 'helmet', 0, 0.08, 0.01, neck);
	part(GEO.visor, 'visor', 0, 0.05, -0.115, neck);
	// Rifle at the ready: right hand on the grip, left hand under the fore-end.
	const arms = joint(torso, 0, 0.46);
	limb([0.25, 0, 0.02], [0.21, -0.2, -0.1], arms);
	limb([0.21, -0.2, -0.1], [0.07, -0.1, -0.3], arms);
	limb([-0.25, 0, 0.02], [-0.2, -0.2, -0.16], arms);
	limb([-0.2, -0.2, -0.16], [0.02, -0.09, -0.52], arms);
	part(GEO.glove, 'glove', 0.07, -0.1, -0.32, arms);
	part(GEO.glove, 'glove', 0.02, -0.08, -0.54, arms);
	const gun = part(GEO.gun, 'gun', 0.05, -0.04, -0.45, arms);
	return { soldier, root, hips, torso, neck, arms, gun, plate, helmet, cap, charge, legL, legR, side: soldier.side, phase: 0, tint };
}

function retint(view, mats) {
	const m = mats[view.soldier.side];
	for (const [mesh, key] of view.tint) mesh.material = m[key];
	view.side = view.soldier.side;
}

export function createSoldierViews(scene, sim) {
	const mats = { atk: sideMaterials(PALETTE.attack, PALETTE.attackDark), def: sideMaterials(PALETTE.defend, PALETTE.defendDark) };
	const views = sim.soldiers.map((s) => buildFigure(s, mats));
	for (const v of views) scene.add(v.root);

	function pose(v, alpha, dt) {
		const s = v.soldier;
		if (v.side !== s.side) retint(v, mats);
		v.root.position.set(
			s.prev.x + (s.pos.x - s.prev.x) * alpha,
			s.prev.y + (s.pos.y - s.prev.y) * alpha,
			s.prev.z + (s.pos.z - s.prev.z) * alpha,
		);
		v.root.rotation.y = s.yaw;
		// The dead fall backwards over half a second and lie straight; the living walk and crouch.
		const fall = s.alive ? 0 : Math.min(1, (sim.time - s.diedAt) / 0.45);
		v.root.rotation.x = fall * fall * 1.52;
		v.root.position.y -= 0.1 * fall;
		const speed = s.alive ? Math.hypot(s.vel.x, s.vel.z) : 0;
		v.phase += speed * dt * 1.8;
		const swing = Math.sin(v.phase) * Math.min(1, speed / 5) * 0.7;
		const k = s.alive ? s.crouch : 0;
		v.hips.position.y = 0.92 - 0.36 * k;
		v.legL.hip.rotation.x = swing - 1.1 * k;
		v.legR.hip.rotation.x = -swing - 0.7 * k;
		v.legL.knee.rotation.x = 1.7 * k + Math.max(0, -swing) * 0.6;
		v.legR.knee.rotation.x = 1.3 * k + Math.max(0, swing) * 0.6;
		v.torso.rotation.x = -0.25 * k;
		v.arms.rotation.x = s.alive ? s.pitch + 0.25 * k : -1.2;
		v.neck.rotation.x = s.alive ? s.pitch * 0.6 + 0.25 * k : 0;
		v.gun.visible = s.alive;
		v.plate.visible = s.armor > 0;
		v.helmet.visible = s.helmet;
		v.cap.visible = !s.helmet;
		v.charge.visible = s.hasCharge;
		const w = activeWeapon(s);
		const length = !w ? 0.15 : w.def.slot === 'primary' ? 0.78 : 0.26;
		v.gun.scale.z = length;
		v.gun.position.z = -0.3 - length / 2;
	}

	return {
		views,
		update(alpha, dt, viewer) {
			for (const v of views) {
				v.root.visible = !(v.soldier === viewer && viewer.alive);
				if (v.root.visible) pose(v, alpha, dt);
			}
		},
	};
}
