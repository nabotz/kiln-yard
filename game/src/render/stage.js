// The renderer, the world scene in dusk light (low sun with shadows, sky fill, haze), the camera,
// and a small second scene for the first-person weapon, drawn on cleared depth so it never clips.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';

export function createStage(container, textures, width, depth) {
	const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.setSize(window.innerWidth, window.innerHeight);
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFShadowMap;
	renderer.autoClear = false;
	container.appendChild(renderer.domElement);

	const scene = new THREE.Scene();
	scene.background = textures.sky;
	scene.fog = new THREE.Fog(PALETTE.haze, 34, 150);
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromEquirectangular(textures.sky).texture;
	scene.environmentIntensity = 0.35;
	pmrem.dispose();

	scene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.15));
	// The sun sits where the sky texture paints its glow: low, to the south-east.
	const sun = new THREE.DirectionalLight(PALETTE.sun, 2.9);
	const cx = width / 2, cz = depth / 2;
	sun.position.set(cx + 62, 24, cz + 62);
	sun.target.position.set(cx, 0, cz);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	const reach = Math.hypot(width, depth) / 2 + 4;
	Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 10, far: 200 });
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.04;
	scene.add(sun, sun.target);

	const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 320);
	scene.add(camera);

	const vmScene = new THREE.Scene();
	const vmCamera = new THREE.PerspectiveCamera(56, window.innerWidth / window.innerHeight, 0.01, 4);
	vmScene.add(new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 1.4));
	const vmSun = new THREE.DirectionalLight(PALETTE.sun, 2.2);
	vmSun.position.set(1, 1.5, 0.6);
	vmScene.add(vmSun);
	vmScene.environment = scene.environment;

	window.addEventListener('resize', () => {
		renderer.setSize(window.innerWidth, window.innerHeight);
		for (const c of [camera, vmCamera]) {
			c.aspect = window.innerWidth / window.innerHeight;
			c.updateProjectionMatrix();
		}
	});

	return {
		renderer, scene, camera, vmScene, vmCamera,
		render(showViewmodel) {
			renderer.clear();
			renderer.render(scene, camera);
			if (showViewmodel) {
				renderer.clearDepth();
				renderer.render(vmScene, vmCamera);
			}
		},
	};
}
