// Third-person bodies in their side's colours that walk, crouch, aim, show armour, helmet and
// the carried charge, and fall when killed. Interpolated between simulation steps.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { activeWeapon } from '../sim/soldier.js';

const GEO = {
	thigh: new THREE.BoxGeometry(0.16, 0.46, 0.18),
	shin: new THREE.BoxGeometry(0.14, 0.44, 0.16),
	boot: new THREE.BoxGeometry(0.16, 0.1, 0.26),
	chest: new THREE.BoxGeometry(0.44, 0.52, 0.26),
	plate: new THREE.BoxGeometry(0.48, 0.34, 0.31),
	head: new THREE.BoxGeometry(0.22, 0.25, 0.23),
	helmet: new THREE.BoxGeometry(0.27, 0.12, 0.28),
	visor: new THREE.BoxGeometry(0.2, 0.05, 0.02),
	arm: new THREE.BoxGeometry(0.11, 0.11, 0.42),
	gun: new THREE.BoxGeometry(0.07, 0.11, 1),
	pack: new THREE.BoxGeometry(0.3, 0.22, 0.12),
};

function sideMaterials(main, dark) {
	const std = (color, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
	return {
		jacket: std(main), pants: std(dark), gear: std(new THREE.Color(dark).multiplyScalar(1.4).getHex(), 0.7),
		helmet: std(new THREE.Color(main).multiplyScalar(0.55).getHex(), 0.6),
		visor: new THREE.MeshBasicMaterial({ color: new THREE.Color(main).multiplyScalar(1.3) }),
	};
}

const SHARED = {
	skin: new THREE.MeshStandardMaterial({ color: PALETTE.skin, roughness: 0.8 }),
	gun: new THREE.MeshStandardMaterial({ color: PALETTE.gunmetal, roughness: 0.45, metalness: 0.6 }),
	charge: new THREE.MeshStandardMaterial({ color: PALETTE.soot, emissive: PALETTE.ember, emissiveIntensity: 0.6 }),
};

function part(geo, material, x, y, z, parent) {
	const m = new THREE.Mesh(geo, material);
	m.position.set(x, y, z);
	m.castShadow = true;
	parent.add(m);
	return m;
}

function leg(x, mats, parent) {
	const hip = new THREE.Group();
	hip.position.x = x;
	parent.add(hip);
	const thigh = part(GEO.thigh, mats.pants, 0, -0.23, 0, hip);
	const knee = new THREE.Group();
	knee.position.y = -0.46;
	hip.add(knee);
	const shin = part(GEO.shin, mats.pants, 0, -0.22, 0, knee);
	const boot = part(GEO.boot, mats.gear, 0, -0.44, -0.04, knee);
	return { hip, knee, meshes: [thigh, shin, boot] };
}

function buildFigure(soldier, mats) {
	const m = mats[soldier.side];
	const root = new THREE.Group();
	root.rotation.order = 'YXZ';
	const hips = new THREE.Group();
	hips.position.y = 0.92;
	root.add(hips);
	const legL = leg(-0.12, m, hips), legR = leg(0.12, m, hips);
	const torso = new THREE.Group();
	hips.add(torso);
	const chest = part(GEO.chest, m.jacket, 0, 0.27, 0, torso);
	const plate = part(GEO.plate, m.gear, 0, 0.32, 0, torso);
	const pack = part(GEO.pack, SHARED.charge, 0, 0.32, 0.2, torso);
	const neck = new THREE.Group();
	neck.position.y = 0.62;
	torso.add(neck);
	part(GEO.head, SHARED.skin, 0, 0.02, 0, neck);
	const helmet = part(GEO.helmet, m.helmet, 0, 0.14, 0, neck);
	const visor = part(GEO.visor, m.visor, 0, 0.05, -0.12, neck);
	const arms = new THREE.Group();
	arms.position.y = 0.46;
	torso.add(arms);
	const armL = part(GEO.arm, m.jacket, -0.17, -0.06, -0.2, arms);
	const armR = part(GEO.arm, m.jacket, 0.17, -0.06, -0.2, arms);
	armL.rotation.y = 0.35; armR.rotation.y = -0.2;
	const gun = part(GEO.gun, SHARED.gun, 0.05, -0.04, -0.45, arms);
	return {
		soldier, root, hips, torso, neck, arms, gun, plate, helmet, pack, legL, legR,
		side: soldier.side, phase: 0,
		tinted: { jacket: [chest, armL, armR], pants: [...legL.meshes.slice(0, 2), ...legR.meshes.slice(0, 2)], gear: [plate, legL.meshes[2], legR.meshes[2]], helmet: [helmet], visor: [visor] },
	};
}

function retint(view, mats) {
	const m = mats[view.soldier.side];
	for (const key of Object.keys(view.tinted)) for (const mesh of view.tinted[key]) mesh.material = m[key];
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
		v.pack.visible = s.hasCharge;
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
