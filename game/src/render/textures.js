// Procedural surface art painted once on canvases: brick, clay pavers, crates, ribbed steel,
// concrete, site markings, the dusk sky and soft sprites. Nothing is downloaded.
import * as THREE from 'three';
import { PALETTE } from '../palette.js';
import { createRng } from '../rng.js';

const rgb = (n, k = 1) => {
	const r = Math.min(255, ((n >> 16) & 255) * k), g = Math.min(255, ((n >> 8) & 255) * k), b = Math.min(255, (n & 255) * k);
	return `rgb(${r | 0},${g | 0},${b | 0})`;
};

function surface(w, h) {
	const c = document.createElement('canvas');
	c.width = w; c.height = h;
	return [c, c.getContext('2d')];
}

function texture(canvas, srgb = true) {
	const t = new THREE.CanvasTexture(canvas);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	if (srgb) t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

function grain(g, w, h, rng, alpha, count) {
	for (let i = 0; i < count; i++) {
		g.fillStyle = rng.chance(0.5) ? `rgba(0,0,0,${alpha * rng.next()})` : `rgba(255,240,220,${alpha * rng.next() * 0.6})`;
		g.fillRect(rng.next() * w, rng.next() * h, 1 + rng.next() * 2, 1 + rng.next() * 2);
	}
}

// One tile spans 4 m of wall and its full 5.2 m height: grime at the foot, coping at the top.
function brick(rng) {
	const [c, g] = surface(512, 512);
	g.fillStyle = rgb(PALETTE.mortar, 0.85);
	g.fillRect(0, 0, 512, 512);
	const rows = 64, bw = 32, bh = 512 / rows;
	for (let r = 4; r < rows; r++) {
		const off = r % 2 ? bw / 2 : 0;
		for (let x = -bw; x < 512 + bw; x += bw) {
			const k = 0.78 + rng.next() * 0.34;
			g.fillStyle = rng.chance(0.08) ? rgb(PALETTE.brickDark, k) : rgb(PALETTE.brick, k);
			g.fillRect(x + off + 1, r * bh + 1, bw - 2, bh - 1.6);
		}
	}
	g.fillStyle = rgb(PALETTE.sandstone, 0.9);
	g.fillRect(0, 0, 512, 4 * bh - 1);
	g.fillStyle = 'rgba(0,0,0,0.25)';
	g.fillRect(0, 4 * bh - 3, 512, 3);
	const foot = g.createLinearGradient(0, 380, 0, 512);
	foot.addColorStop(0, 'rgba(30,20,18,0)');
	foot.addColorStop(1, 'rgba(30,20,18,0.55)');
	g.fillStyle = foot;
	g.fillRect(0, 380, 512, 132);
	for (let i = 0; i < 7; i++) {
		const x = rng.next() * 512, w = 6 + rng.next() * 24;
		const streak = g.createLinearGradient(0, 30, 0, 300);
		streak.addColorStop(0, 'rgba(20,15,15,0.35)');
		streak.addColorStop(1, 'rgba(20,15,15,0)');
		g.fillStyle = streak;
		g.fillRect(x, 30, w, 270);
	}
	grain(g, 512, 512, rng, 0.25, 5000);
	return texture(c);
}

// 4 m of floor per tile: 1 m clay pavers with joints, wear and a few cracks.
function clay(rng) {
	const [c, g] = surface(512, 512);
	g.fillStyle = rgb(PALETTE.clayDark);
	g.fillRect(0, 0, 512, 512);
	for (let y = 0; y < 4; y++) {
		for (let x = 0; x < 4; x++) {
			const k = 0.85 + rng.next() * 0.25;
			g.fillStyle = rgb(PALETTE.clay, k);
			g.fillRect(x * 128 + 2, y * 128 + 2, 124, 124);
		}
	}
	grain(g, 512, 512, rng, 0.3, 9000);
	g.strokeStyle = 'rgba(40,25,18,0.5)';
	for (let i = 0; i < 9; i++) {
		g.beginPath();
		let x = rng.next() * 512, y = rng.next() * 512;
		g.moveTo(x, y);
		for (let k = 0; k < 5; k++) { x += (rng.next() - 0.5) * 40; y += (rng.next() - 0.5) * 40; g.lineTo(x, y); }
		g.stroke();
	}
	return texture(c);
}

function crate(rng) {
	const [c, g] = surface(256, 256);
	for (let i = 0; i < 6; i++) {
		g.fillStyle = rgb(PALETTE.timber, 0.82 + rng.next() * 0.3);
		g.fillRect(0, i * 43, 256, 42);
	}
	g.fillStyle = rgb(PALETTE.timberDark);
	g.fillRect(0, 0, 256, 22); g.fillRect(0, 234, 256, 22);
	g.fillRect(0, 0, 22, 256); g.fillRect(234, 0, 22, 256);
	g.save();
	g.translate(128, 128); g.rotate(Math.PI / 4);
	g.fillRect(-170, -11, 340, 22);
	g.restore();
	g.fillStyle = 'rgba(30,20,10,0.55)';
	g.font = 'bold 22px monospace';
	g.fillText('KY-07', 150, 214);
	grain(g, 256, 256, rng, 0.3, 2500);
	return texture(c);
}

function steel(rng) {
	const [c, g] = surface(256, 256);
	g.fillStyle = rgb(PALETTE.steel);
	g.fillRect(0, 0, 256, 256);
	for (let x = 0; x < 256; x += 16) {
		g.fillStyle = rgb(PALETTE.steelDark, 1.05);
		g.fillRect(x, 0, 5, 256);
		g.fillStyle = 'rgba(255,255,255,0.08)';
		g.fillRect(x + 6, 0, 2, 256);
	}
	for (let i = 0; i < 30; i++) {
		g.fillStyle = `rgba(140,70,35,${0.15 + rng.next() * 0.3})`;
		g.beginPath();
		g.arc(rng.next() * 256, rng.next() * 256, 2 + rng.next() * 10, 0, Math.PI * 2);
		g.fill();
	}
	g.fillStyle = rgb(PALETTE.steelDark, 0.8);
	g.fillRect(0, 0, 256, 10); g.fillRect(0, 246, 256, 10);
	grain(g, 256, 256, rng, 0.2, 2000);
	return texture(c);
}

function concrete(rng) {
	const [c, g] = surface(256, 256);
	g.fillStyle = rgb(PALETTE.concrete);
	g.fillRect(0, 0, 256, 256);
	grain(g, 256, 256, rng, 0.35, 5000);
	for (let x = -256; x < 256; x += 48) {
		g.fillStyle = rgb(PALETTE.hazard);
		g.beginPath();
		g.moveTo(x, 0); g.lineTo(x + 24, 0); g.lineTo(x + 48, 34); g.lineTo(x + 24, 34);
		g.fill();
	}
	g.fillStyle = rgb(PALETTE.soot, 1.4);
	g.fillRect(0, 34, 256, 6);
	return texture(c);
}

// The plant zone's floor marking: a hazard-striped border and the site letter, on transparency.
function zoneMark(letter) {
	const [c, g] = surface(512, 512);
	g.strokeStyle = rgb(PALETTE.hazard, 0.95);
	g.lineWidth = 18;
	g.setLineDash([40, 26]);
	g.strokeRect(14, 14, 484, 484);
	g.setLineDash([]);
	g.fillStyle = 'rgba(232,178,58,0.75)';
	g.font = '900 300px Impact, "Arial Black", sans-serif';
	g.textAlign = 'center'; g.textBaseline = 'middle';
	g.fillText(letter, 256, 270);
	return texture(c);
}

// A stencilled wall sign: the site letter with an arrow, or a lane name.
function sign(text, arrow) {
	const [c, g] = surface(512, 256);
	g.fillStyle = 'rgba(0,0,0,0)';
	g.fillRect(0, 0, 512, 256);
	g.fillStyle = rgb(PALETTE.sandstone, 1.05);
	g.font = text.length === 1 ? '900 210px Impact, "Arial Black", sans-serif' : '900 92px Impact, "Arial Black", sans-serif';
	g.textAlign = 'center'; g.textBaseline = 'middle';
	g.fillText(text, arrow ? 190 : 256, 138);
	if (arrow) {
		g.beginPath();
		g.moveTo(330, 90); g.lineTo(430, 128); g.lineTo(330, 166);
		g.lineWidth = 26; g.strokeStyle = rgb(PALETTE.sandstone, 1.05);
		g.stroke();
	}
	return texture(c);
}

function sprite(inner, outer) {
	const [c, g] = surface(128, 128);
	const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grad.addColorStop(0, inner);
	grad.addColorStop(0.45, outer);
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	return texture(c);
}

// A dusk sky as an equirectangular gradient with the sun's glow low in the west.
function sky() {
	const [c, g] = surface(1024, 512);
	const grad = g.createLinearGradient(0, 0, 0, 512);
	grad.addColorStop(0, rgb(PALETTE.skyTop, 0.8));
	grad.addColorStop(0.36, rgb(PALETTE.skyTop, 1.25));
	grad.addColorStop(0.5, rgb(PALETTE.skyHorizon));
	grad.addColorStop(0.56, rgb(PALETTE.haze, 0.8));
	grad.addColorStop(1, rgb(PALETTE.brickDark, 0.5));
	g.fillStyle = grad;
	g.fillRect(0, 0, 1024, 512);
	const sun = g.createRadialGradient(640, 232, 0, 640, 232, 220);
	sun.addColorStop(0, 'rgba(255,236,200,1)');
	sun.addColorStop(0.06, 'rgba(255,214,150,0.95)');
	sun.addColorStop(0.3, 'rgba(255,170,90,0.35)');
	sun.addColorStop(1, 'rgba(255,150,80,0)');
	g.fillStyle = sun;
	g.fillRect(0, 0, 1024, 512);
	const t = texture(c);
	t.mapping = THREE.EquirectangularReflectionMapping;
	return t;
}

export function createTextures() {
	const rng = createRng(7);
	return {
		brick: brick(rng),
		clay: clay(rng),
		crate: crate(rng),
		steel: steel(rng),
		concrete: concrete(rng),
		zoneA: zoneMark('A'),
		zoneB: zoneMark('B'),
		sign,
		smoke: sprite('rgba(235,228,218,0.95)', 'rgba(215,205,195,0.55)'),
		dust: sprite('rgba(200,170,140,0.8)', 'rgba(180,150,120,0.3)'),
		glow: sprite('rgba(255,220,170,1)', 'rgba(255,140,60,0.4)'),
		sky: sky(),
	};
}
