// Pooled short-lived visuals: tracers, muzzle flashes, bullet holes, dust and sparks, blood,
// grenades in flight, smoke clouds, blasts, the charge and dropped weapons.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { smokeRadius } from '../sim/grenades.js';

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();
const tmpN = new THREE.Vector3();

function pool(count, make) {
	const items = Array.from({ length: count }, make);
	let next = 0;
	return { items, take: () => items[(next = (next + 1) % count)] };
}

export function createEffects(scene, tex) {
	// Lights stay in the scene at zero intensity: toggling their visibility would recompile shaders.
	const added = (o) => { scene.add(o); return o; };
	const hidden = (o) => { o.visible = false; return added(o); };
	const additive = (color, map) => new THREE.SpriteMaterial({ map, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });

	const tracerGeo = new THREE.BoxGeometry(0.018, 0.018, 1);
	tracerGeo.translate(0, 0, -0.5);
	const tracerMat = new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
	const tracers = pool(32, () => ({ mesh: hidden(new THREE.Mesh(tracerGeo, tracerMat)), until: 0 }));

	const holeGeo = new THREE.PlaneGeometry(0.09, 0.09);
	const holeMat = new THREE.MeshBasicMaterial({ color: 0x1a1210, transparent: true, opacity: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
	const holes = pool(120, () => hidden(new THREE.Mesh(holeGeo, holeMat)));

	const puffs = pool(40, () => ({
		sprite: hidden(new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.dust, transparent: true, depthWrite: false }))),
		born: 0, life: 0, size: 0, rise: 0,
	}));

	const flashes = pool(12, () => ({ sprite: hidden(new THREE.Sprite(additive(0xffd090, tex.flare))), until: 0 }));
	const flashLight = added(new THREE.PointLight(0xffb060, 0, 7, 2));
	let lightUntil = 0;

	const blasts = pool(4, () => ({
		sprite: hidden(new THREE.Sprite(additive(0xffa050, tex.glow))),
		light: added(new THREE.PointLight(0xff9040, 0, 22, 1.6)),
		born: 0, size: 0, life: 0,
	}));

	// Spent brass, thrown out to the right of the gun. Its arc is a function of its age, so a frozen
	// screenshot frame shows the same casings in the same places.
	const brass = new THREE.MeshStandardMaterial({ color: 0xc8963c, metalness: 0.8, roughness: 0.35 });
	const casingGeo = new THREE.BoxGeometry(0.012, 0.012, 0.034);
	let casingCount = 0;
	const casings = pool(48, () => ({ mesh: hidden(new THREE.Mesh(casingGeo, brass)), born: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, land: 0 }));
	function eject(e, now) {
		const c = casings.take(), k = (casingCount++ * 0.618) % 1;
		const sin = Math.sin(e.s.yaw), cos = Math.cos(e.s.yaw), out = 1.5 + k * 0.8;
		c.x = e.x - sin * 0.35 + cos * 0.12; c.y = e.y - 0.18; c.z = e.z - cos * 0.35 - sin * 0.12;
		c.vx = cos * out + sin * 0.3; c.vy = 1.7 + k * 0.6; c.vz = -sin * out + cos * 0.3;
		c.land = (c.vy + Math.sqrt(c.vy * c.vy + 19.6 * (c.y - 0.01))) / 9.8;
		c.born = now;
		c.mesh.visible = true;
	}

	const nadeGeo = new THREE.SphereGeometry(0.05, 10, 8);
	const nadeMat = new THREE.MeshStandardMaterial({ color: 0x55604a, roughness: 0.6 });
	const nadeMeshes = Array.from({ length: 10 }, () => hidden(new THREE.Mesh(nadeGeo, nadeMat)));

	const smokeMat = new THREE.SpriteMaterial({ map: tex.smoke, color: 0xd8d0c6, transparent: true, depthWrite: false, opacity: 0.9 });
	const smokeClouds = Array.from({ length: 6 }, (_, k) => {
		const g = new THREE.Group();
		const puffsInCloud = [];
		for (let i = 0; i < 22; i++) {
			const s = new THREE.Sprite(smokeMat);
			const a = i * 2.39996 + k, r = Math.sqrt((i + 0.5) / 22);
			s.userData.offset = new THREE.Vector3(Math.cos(a) * r * 0.8, 0.25 + ((i * 7) % 11) / 11 * 0.75, Math.sin(a) * r * 0.8);
			g.add(s);
			puffsInCloud.push(s);
		}
		g.visible = false;
		scene.add(g);
		return { group: g, puffs: puffsInCloud };
	});

	const chargeMesh = new THREE.Group();
	const chargeBody = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.24), new THREE.MeshStandardMaterial({ color: PALETTE.soot, roughness: 0.6 }));
	chargeBody.position.y = 0.08;
	chargeBody.castShadow = true;
	const led = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.06), new THREE.MeshBasicMaterial({ color: 0xff3a20 }));
	led.position.set(0.08, 0.175, 0);
	const ledLight = new THREE.PointLight(0xff3a20, 0, 3, 2);
	ledLight.position.set(0, 0.35, 0);
	chargeMesh.add(chargeBody, led, ledLight);
	chargeMesh.visible = false;
	scene.add(chargeMesh);
	let ledUntil = 0;

	const dropGeo = new THREE.BoxGeometry(0.08, 0.1, 0.8);
	const dropMat = new THREE.MeshStandardMaterial({ color: PALETTE.gunmetal, roughness: 0.5, metalness: 0.5 });
	const drops = Array.from({ length: 12 }, () => hidden(new THREE.Mesh(dropGeo, dropMat)));

	function spawnPuff(x, y, z, color, size, life, rise) {
		const p = puffs.take();
		p.sprite.position.set(x, y, z);
		p.sprite.material.color.setHex(color);
		p.sprite.visible = true;
		p.born = clock; p.life = life; p.size = size; p.rise = rise;
	}

	function tracer(from, to, now) {
		const t = tracers.take();
		const len = from.distanceTo(to);
		if (len < 1.5) return;
		t.mesh.position.copy(from);
		t.mesh.lookAt(to);
		t.mesh.scale.set(1, 1, len);
		t.mesh.visible = true;
		t.until = now + 0.05;
	}

	// A flash at a third-person muzzle and a flicker of light on its surroundings; the viewer's own
	// gun draws its flash in the weapon scene, so for it only the light is placed.
	function muzzleFlash(x, y, z, now, own) {
		if (!own) {
			const f = flashes.take();
			f.sprite.position.set(x, y, z);
			f.sprite.scale.setScalar(0.45);
			f.sprite.material.rotation = now * 31;
			f.sprite.visible = true;
			f.until = now + 0.05;
		}
		flashLight.position.set(x, y, z);
		flashLight.intensity = 6;
		lightUntil = now + 0.05;
	}

	function blast(x, y, z, size, now, life) {
		const b = blasts.take();
		b.sprite.position.set(x, y + 0.5, z);
		b.sprite.visible = true;
		b.light.position.set(x, y + 1, z);
		b.born = now; b.size = size; b.life = life;
		for (let i = 0; i < 6; i++) spawnPuff(x + Math.sin(i * 2.1) * size * 0.15, y + 0.4 + i * 0.12, z + Math.cos(i * 2.1) * size * 0.15, 0x6a5a50, size * 0.4, 1.6, 0.6);
	}

	let clock = 0;

	return {
		// React to this frame's simulation events. `viewer` is the soldier the camera rides in.
		handle(e, sim, viewer, muzzleOf) {
			const now = sim.time;
			if (e.type === 'shot') {
				const from = e.s === viewer && viewer.alive ? muzzleOf(tmpA) : tmpA.set(
					e.x - Math.sin(e.s.yaw) * 0.75, e.y - 0.22, e.z - Math.cos(e.s.yaw) * 0.75);
				muzzleFlash(from.x, from.y, from.z, now, e.s === viewer && viewer.alive);
				tracer(from, tmpB.set(e.x2, e.y2, e.z2), now);
				eject(e, now);
			} else if (e.type === 'impact') {
				const h = holes.take();
				tmpN.set(e.x2, e.y2, e.z2);
				h.position.set(e.x + e.x2 * 0.01, e.y + e.y2 * 0.01, e.z + e.z2 * 0.01);
				h.lookAt(tmpA.copy(h.position).add(tmpN));
				h.visible = true;
				const spark = e.id === 'crateTall' || e.id === 'barrier';
				spawnPuff(e.x + e.x2 * 0.1, e.y + e.y2 * 0.1, e.z + e.z2 * 0.1, spark ? 0xffd2a0 : 0xc8a888, spark ? 0.18 : 0.35, spark ? 0.18 : 0.5, 0.3);
			} else if (e.type === 'hit') {
				spawnPuff(e.x, e.y, e.z, 0x8a1c14, 0.32, 0.35, 0.1);
			} else if (e.type === 'explode') {
				blast(e.x, e.y, e.z, 5, now, 0.5);
			} else if (e.type === 'detonate') {
				blast(e.x, e.y, e.z, 16, now, 1.2);
			} else if (e.type === 'flash') {
				blast(e.x, e.y, e.z, 2.5, now, 0.2);
			}
		},

		update(sim, dt) {
			const now = sim.time;
			clock = now;
			for (const t of tracers.items) if (t.mesh.visible && now > t.until) t.mesh.visible = false;
			for (const c of casings.items) {
				if (!c.mesh.visible) continue;
				const age = now - c.born, t = Math.min(age, c.land);
				if (age > 3) { c.mesh.visible = false; continue; }
				c.mesh.position.set(c.x + c.vx * t, Math.max(0.01, c.y + c.vy * t - 4.9 * t * t), c.z + c.vz * t);
				c.mesh.rotation.set(t * 17, t * 11, 0);
			}
			for (const f of flashes.items) if (f.sprite.visible && now > f.until) f.sprite.visible = false;
			if (now > lightUntil) flashLight.intensity = 0;
			for (const p of puffs.items) {
				if (!p.sprite.visible) continue;
				const k = (now - p.born) / p.life;
				if (k >= 1) { p.sprite.visible = false; continue; }
				p.sprite.scale.setScalar(p.size * (0.5 + k));
				p.sprite.material.opacity = 0.8 * (1 - k);
				p.sprite.position.y += p.rise * dt;
			}
			for (const b of blasts.items) {
				if (!b.sprite.visible) continue;
				const k = (now - b.born) / b.life;
				if (k >= 1) { b.sprite.visible = false; b.light.intensity = 0; continue; }
				b.sprite.scale.setScalar(b.size * (0.4 + k));
				b.sprite.material.opacity = 1 - k;
				b.light.intensity = 60 * (1 - k);
			}
			for (let i = 0; i < sim.nades.length; i++) {
				const n = sim.nades[i], m = nadeMeshes[i];
				m.visible = n.active;
				if (n.active) m.position.set(n.x, n.y, n.z);
			}
			for (let i = 0; i < sim.smokes.length; i++) {
				const s = sim.smokes[i], cloud = smokeClouds[i];
				cloud.group.visible = s.active;
				if (!s.active) continue;
				const r = smokeRadius(sim, s);
				cloud.group.position.set(s.x, s.y, s.z);
				for (const p of cloud.puffs) {
					p.position.copy(p.userData.offset).multiplyScalar(r * 1.05);
					p.position.y = p.userData.offset.y * r * 1.4;
					p.scale.setScalar(r * 1.15);
					p.material.rotation = now * 0.05;
				}
			}

			const c = sim.charge;
			chargeMesh.visible = c.state === 'dropped' || c.state === 'planted' || c.state === 'defused';
			if (chargeMesh.visible) {
				chargeMesh.position.set(c.x, c.y, c.z);
				if (c.state === 'planted') {
					led.visible = now < ledUntil;
					ledLight.intensity = led.visible ? 3 : 0;
				} else { led.visible = false; ledLight.intensity = 0; }
			}

			for (let i = 0; i < sim.pickups.length; i++) {
				const p = sim.pickups[i], m = drops[i];
				m.visible = p.weapon !== null;
				if (m.visible) {
					m.position.set(p.x, p.y + 0.06, p.z);
					m.rotation.set(0, p.yaw + 0.7, Math.PI / 2);
				}
			}
		},

		beep(now) {
			ledUntil = now + 0.1;
		},
	};
}
