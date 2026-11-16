// The radar: the map painted once, then smokes, the charge, teammates, freshly spotted enemies
// and the viewer drawn over it twenty times a second.
import { CELL } from '../config.js';
import { PALETTE } from '../palette.js';

const css = (n, a = 1) => `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;

export function createRadar(canvas, grid) {
	const g = canvas.getContext('2d');
	const scale = Math.min(canvas.width / grid.width, canvas.height / grid.depth);
	const ox = (canvas.width - grid.width * scale) / 2, oy = (canvas.height - grid.depth * scale) / 2;
	const base = document.createElement('canvas');
	base.width = canvas.width; base.height = canvas.height;
	const b = base.getContext('2d');
	b.fillStyle = 'rgba(16,13,12,0.72)';
	b.fillRect(0, 0, base.width, base.height);
	for (const c of grid.cells) {
		let color = null;
		if (c.ch === '#') color = css(PALETTE.brickDark, 0.95);
		else if (c.top > 0) color = css(PALETTE.timber, 0.75);
		else if (c.zone) color = css(PALETTE.hazard, 0.35);
		else if (c.spawn) color = css(c.spawn === 'atk' ? PALETTE.attack : PALETTE.defend, 0.22);
		else color = css(PALETTE.clay, 0.45);
		b.fillStyle = color;
		b.fillRect(ox + c.x * scale, oy + c.z * scale, scale + 0.5, scale + 0.5);
	}
	b.fillStyle = css(PALETTE.hazard);
	b.font = `bold ${Math.round(scale * 2.6)}px sans-serif`;
	b.textAlign = 'center'; b.textBaseline = 'middle';
	for (const [letter, zone] of [['A', 'A'], ['B', 'B']]) {
		const cells = grid.cells.filter((c) => c.zone === zone);
		const cx = cells.reduce((s, c) => s + c.x + 0.5, 0) / cells.length, cz = cells.reduce((s, c) => s + c.z + 0.5, 0) / cells.length;
		b.fillText(letter, ox + cx * scale, oy + cz * scale);
	}

	const px = (x) => ox + (x / CELL) * scale, pz = (z) => oy + (z / CELL) * scale;
	let next = 0;

	function dot(x, z, color, r) {
		g.fillStyle = color;
		g.beginPath();
		g.arc(px(x), pz(z), r, 0, Math.PI * 2);
		g.fill();
	}

	return {
		draw(sim, viewer, now) {
			if (now < next) return;
			next = now + 0.05;
			g.clearRect(0, 0, canvas.width, canvas.height);
			g.drawImage(base, 0, 0);
			for (const m of sim.smokes) if (m.active) dot(m.x, m.z, 'rgba(220,215,205,0.55)', (4.3 / CELL) * scale);
			const c = sim.charge;
			if (c.state === 'planted' || (c.state === 'dropped' && viewer.side === 'atk')) dot(c.x, c.z, now % 0.6 < 0.3 ? '#ff4a2a' : '#ffd0a0', 3.5);
			const intel = sim.intel[viewer.squad];
			for (const s of sim.soldiers) {
				if (!s.alive || s === viewer) continue;
				if (s.squad === viewer.squad) dot(s.pos.x, s.pos.z, css(s.side === 'atk' ? PALETTE.attack : PALETTE.defend), 3);
				else if (sim.time - intel[s.id].time < 0.8) dot(s.pos.x, s.pos.z, '#ff3b30', 3);
			}
			if (!viewer.alive) return;
			g.save();
			g.translate(px(viewer.pos.x), pz(viewer.pos.z));
			g.rotate(-viewer.yaw);
			g.fillStyle = '#fff4e4';
			g.beginPath();
			g.moveTo(0, -6); g.lineTo(4.2, 4.5); g.lineTo(0, 2.4); g.lineTo(-4.2, 4.5);
			g.closePath();
			g.fill();
			g.restore();
		},
	};
}
