// The first-person weapon: a small model per gun and grenade in gloved hands. It bobs with the
// stride, sways against the mouse, kicks per shot, dips for reloads and rises on deploy.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { activeWeapon } from '../sim/soldier.js';
import { WEAPONS } from '../sim/weapons.js';

// [width, height, length] of receiver, barrel length, magazine, stock, and extras per gun.
const SHAPES = {
	wasp: { body: [0.04, 0.055, 0.17], barrel: 0.02, mag: [0.032, 0.1, 0.045], grip: 0.09, hold: [0.15, -0.15, -0.38] },
	anvil: { body: [0.05, 0.07, 0.23], barrel: 0.05, mag: [0.036, 0.1, 0.05], grip: 0.1, hold: [0.16, -0.16, -0.4] },
	hornet: { body: [0.055, 0.085, 0.3], barrel: 0.12, rail: true, mag: [0.036, 0.17, 0.05], stock: [0.035, 0.05, 0.16], grip: 0.09, hold: [0.17, -0.17, -0.44] },
	breaker: { body: [0.06, 0.075, 0.3], barrel: 0.42, pump: true, stock: [0.05, 0.09, 0.24], grip: 0.09, hold: [0.17, -0.18, -0.46] },
	kestrel: { body: [0.058, 0.095, 0.36], barrel: 0.22, mag: [0.042, 0.17, 0.07], stock: [0.05, 0.09, 0.24], rail: true, grip: 0.1, hold: [0.17, -0.18, -0.46] },
	longreach: { body: [0.058, 0.085, 0.42], barrel: 0.42, mag: [0.04, 0.07, 0.08], stock: [0.055, 0.11, 0.28], scope: true, grip: 0.1, hold: [0.17, -0.17, -0.48] },
};
const NADE_COLORS = { frag: 0x4c5a3a, flash: 0xb8b2a4, smoke: 0x6a6e72 };

function mesh(geo, mat, x, y, z, parent) {
	const m = new THREE.Mesh(geo, mat);
	m.position.set(x, y, z);
	parent.add(m);
	return m;
}

// Gloved hands on the grip and the fore-end, forearms angled down and out of frame.
function hands(group, sleeve, glove, nearZ, farZ) {
	const forearm = new THREE.BoxGeometry(0.055, 0.055, 0.22);
	const fist = new THREE.BoxGeometry(0.058, 0.062, 0.095);
	mesh(fist, glove, 0, -0.065, nearZ, group);
	mesh(forearm, sleeve, 0.03, -0.15, nearZ + 0.12, group).rotation.set(0.75, 0.15, 0);
	mesh(fist, glove, -0.005, -0.05, farZ, group);
	mesh(forearm, sleeve, -0.07, -0.14, farZ + 0.08, group).rotation.set(0.8, -0.7, 0);
}

function gunModel(shape, mats) {
	const g = new THREE.Group();
	const [w, h, l] = shape.body;
	mesh(new THREE.BoxGeometry(w, h, l), mats.metal, 0, 0, 0, g);
	if (shape.barrel) {
		const barrel = mesh(new THREE.CylinderGeometry(0.012, 0.012, shape.barrel, 8), mats.metal, 0, h * 0.18, -l / 2 - shape.barrel / 2, g);
		barrel.rotation.x = Math.PI / 2;
	}
	let mag = null;
	if (shape.mag) {
		const [mw, mh, ml] = shape.mag;
		mag = mesh(new THREE.BoxGeometry(mw, mh, ml), mats.trim, 0, -h / 2 - mh / 2 + 0.01, -l * 0.12, g);
		if (shape.stock) mag.rotation.x = 0.18;
	}
	if (shape.stock) {
		const [sw, sh, sl] = shape.stock;
		mesh(new THREE.BoxGeometry(sw, sh, sl), mats.wood, 0, -0.01, l / 2 + sl / 2, g);
	}
	if (shape.pump) {
		mesh(new THREE.BoxGeometry(0.066, 0.06, 0.16), mats.wood, 0, -0.035, -l / 2 - 0.12, g);
		const tube = mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.4, 8), mats.metal, 0, -0.03, -l / 2 - 0.2, g);
		tube.rotation.x = Math.PI / 2;
	}
	if (shape.rail) {
		// Rifle furniture: a ribbed handguard round the barrel, a sight post and the charging handle.
		mesh(new THREE.BoxGeometry(0.024, 0.02, l * 0.8), mats.trim, 0, h / 2 + 0.01, 0, g);
		mesh(new THREE.BoxGeometry(w * 1.05, h * 0.7, shape.barrel * 0.85), mats.wood, 0, h * 0.05, -l / 2 - shape.barrel * 0.42, g);
		mesh(new THREE.BoxGeometry(0.012, 0.045, 0.012), mats.metal, 0, h / 2 + 0.02, -l / 2 - shape.barrel * 0.8, g);
		mesh(new THREE.BoxGeometry(0.03, 0.015, 0.02), mats.trim, w / 2 + 0.01, h * 0.25, l * 0.25, g);
	}
	if (shape.scope) {
		const scope = mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.26, 12), mats.trim, 0, h / 2 + 0.035, -0.02, g);
		scope.rotation.x = Math.PI / 2;
	}
	mesh(new THREE.BoxGeometry(w * 0.8, shape.grip, 0.045), mats.trim, 0, -h / 2 - shape.grip / 2 + 0.01, l * 0.28, g).rotation.x = -0.25;
	const muzzle = new THREE.Object3D();
	muzzle.position.set(0, h * 0.18, -l / 2 - (shape.barrel ?? 0) - 0.02);
	g.add(muzzle);
	return { group: g, mag, magY: mag ? mag.position.y : 0, muzzle };
}

export function createViewmodel(vmScene, tex) {
	const mats = {
		metal: new THREE.MeshStandardMaterial({ color: PALETTE.gunmetal, roughness: 0.4, metalness: 0.7 }),
		trim: new THREE.MeshStandardMaterial({ color: PALETTE.gunTrim, roughness: 0.45, metalness: 0.4 }),
		wood: new THREE.MeshStandardMaterial({ color: PALETTE.timberDark, roughness: 0.7 }),
		glove: new THREE.MeshStandardMaterial({ color: 0x7a5a40, roughness: 0.8 }),
		sleeve: { atk: new THREE.MeshStandardMaterial({ color: PALETTE.attack, roughness: 0.85 }), def: new THREE.MeshStandardMaterial({ color: PALETTE.defend, roughness: 0.85 }) },
	};
	const rig = new THREE.Group();
	vmScene.add(rig);
	const models = {};
	const sleeves = [];
	for (const id of Object.keys(WEAPONS)) {
		const shape = SHAPES[id];
		const m = gunModel(shape, mats);
		const holder = new THREE.Group();
		holder.add(m.group);
		const arm = new THREE.Group();
		hands(arm, mats.sleeve.atk, mats.glove, shape.body[2] * 0.28, -shape.body[2] * 0.45 - (shape.pump ? 0.1 : 0));
		holder.add(arm);
		sleeves.push(arm);
		holder.visible = false;
		holder.scale.setScalar(0.74);
		rig.add(holder);
		models[id] = { ...m, holder, hold: shape.hold };
	}
	for (const [type, color] of Object.entries(NADE_COLORS)) {
		const holder = new THREE.Group();
		const body = new THREE.Mesh(type === 'frag' ? new THREE.SphereGeometry(0.04, 14, 10) : new THREE.CylinderGeometry(0.032, 0.032, 0.11, 12), new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.3 }));
		holder.add(body);
		const arm = new THREE.Group();
		hands(arm, mats.sleeve.atk, mats.glove, 0.03, 0.2);
		holder.add(arm);
		sleeves.push(arm);
		holder.visible = false;
		rig.add(holder);
		models['nade:' + type] = { group: body, holder, mag: null, magY: 0, muzzle: body, hold: [0.14, -0.14, -0.3] };
	}

	const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, color: 0xffd9a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
	flash.scale.setScalar(0.5);
	flash.visible = false;

	const anim = { kick: 0, swayX: 0, swayY: 0, phase: 0, flashUntil: 0, side: 'atk', current: null };
	const muzzleWorld = new THREE.Vector3();

	function setSide(side) {
		anim.side = side;
		for (const arm of sleeves) arm.traverse((o) => { if (o.material === mats.sleeve.atk || o.material === mats.sleeve.def) o.material = mats.sleeve[side]; });
	}

	return {
		// The world position of the player's muzzle, for tracers that start at the gun.
		// The weapon scene's camera sits at its origin, so the muzzle's position there is a position
		// in the player's view space: carry it into the world through the main camera.
		muzzle(camera, out) {
			if (!anim.current) return out.copy(camera.position);
			anim.current.muzzle.getWorldPosition(muzzleWorld);
			return out.copy(muzzleWorld).applyMatrix4(camera.matrixWorld);
		},
		shot(time) {
			anim.kick = 1;
			anim.flashUntil = time + 0.045;
		},
		update(sim, s, dt, lookX, lookY) {
			if (s.side !== anim.side) setSide(s.side);
			const w = activeWeapon(s);
			const key = w ? w.def.id : 'nade:' + s.nadeType;
			const model = models[key];
			if (anim.current !== model) {
				if (anim.current) anim.current.holder.visible = false;
				anim.current = model;
				model.holder.visible = true;
				model.muzzle.add(flash);
			}
			rig.visible = !s.scoped && s.alive;

			const now = sim.time;
			const deploy = Math.min(1, Math.max(0, 1 - (s.deployUntil - now) / 0.5));
			const speed = Math.hypot(s.vel.x, s.vel.z);
			anim.phase += speed * dt * 1.7;
			const bob = Math.min(1, speed / 6) * (s.onGround ? 1 : 0.3);
			anim.kick *= Math.exp(-16 * dt);
			anim.swayX += (-lookX * 0.0009 - anim.swayX) * Math.min(1, dt * 10);
			anim.swayY += (lookY * 0.0009 - anim.swayY) * Math.min(1, dt * 10);
			let reload = 0;
			if (w && w.reloadUntil > 0) reload = Math.sin(Math.PI * Math.min(1, 1 - (w.reloadUntil - now) / w.def.reload));
			const throwing = s.throwAt > 0 ? 1 - Math.min(1, (s.throwAt - now) / 0.45) : 0;

			const [hx, hy, hz] = model.hold;
			model.holder.position.set(
				hx + Math.sin(anim.phase) * 0.012 * bob + anim.swayX,
				hy - (1 - deploy) ** 2 * 0.28 - Math.abs(Math.cos(anim.phase)) * 0.012 * bob - 0.07 * reload - 0.02 * s.crouch + anim.swayY - throwing * 0.2,
				hz + anim.kick * 0.055,
			);
			model.holder.rotation.set(anim.kick * 0.09 + reload * 0.2 + throwing * 0.9, 0.06 + anim.swayX * 2, reload * 0.55);
			if (model.mag) model.mag.position.y = model.magY - 0.22 * Math.max(0, reload - 0.35);
			flash.visible = now < anim.flashUntil;
			flash.material.rotation = now * 37;
		},
	};
}
