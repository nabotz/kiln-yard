// Sound synthesised with WebAudio, placed in 3D around the listener: gunfire per weapon,
// footsteps (an enemy's run is audible), reloads, grenades, the charge's quickening beep, cues.

const GUNS = {
	wasp: { crack: 2600, body: 170, dur: 0.14, gain: 0.7 },
	anvil: { crack: 1500, body: 95, dur: 0.3, gain: 1 },
	hornet: { crack: 3000, body: 190, dur: 0.11, gain: 0.6 },
	breaker: { crack: 900, body: 70, dur: 0.38, gain: 1.1 },
	kestrel: { crack: 2000, body: 120, dur: 0.18, gain: 0.85 },
	longreach: { crack: 1200, body: 60, dur: 0.55, gain: 1.2 },
};

export function createAudio() {
	let ctx = null, out = null, noise = null;
	let viewer = null;

	function start() {
		if (ctx) { ctx.resume(); return; }
		ctx = new AudioContext();
		const comp = ctx.createDynamicsCompressor();
		comp.threshold.value = -16;
		comp.connect(ctx.destination);
		out = ctx.createGain();
		out.gain.value = 0.6;
		out.connect(comp);
		noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
		const data = noise.getChannelData(0);
		let seed = 1;
		for (let i = 0; i < data.length; i++) {
			seed = (seed * 16807) % 2147483647;
			data[i] = (seed / 2147483647) * 2 - 1;
		}
	}

	// A destination for one sound: placed in the world, or straight to the ears for your own.
	function at(x, y, z, own) {
		if (own) return out;
		const p = ctx.createPanner();
		p.panningModel = 'HRTF';
		p.distanceModel = 'inverse';
		p.refDistance = 2.5;
		p.rolloffFactor = 1.1;
		p.positionX.value = x; p.positionY.value = y; p.positionZ.value = z;
		p.connect(out);
		return p;
	}

	function burst(dest, t, dur, filter, freq, q, gain) {
		const src = ctx.createBufferSource();
		src.buffer = noise;
		const f = ctx.createBiquadFilter();
		f.type = filter; f.frequency.value = freq; f.Q.value = q;
		const g = ctx.createGain();
		g.gain.setValueAtTime(gain, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + dur);
		src.connect(f).connect(g).connect(dest);
		src.start(t, Math.random() * 0.5, dur + 0.05);
	}

	function tone(dest, t, dur, freq, freqEnd, gain, type = 'sine') {
		const o = ctx.createOscillator();
		o.type = type;
		o.frequency.setValueAtTime(freq, t);
		o.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur);
		const g = ctx.createGain();
		g.gain.setValueAtTime(gain, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + dur);
		o.connect(g).connect(dest);
		o.start(t);
		o.stop(t + dur + 0.05);
	}

	function gun(id, dest, t, own) {
		const v = GUNS[id] ?? GUNS.wasp;
		const k = own ? 0.55 : 1;
		burst(dest, t, v.dur * 0.35, 'bandpass', v.crack, 0.9, v.gain * k);
		burst(dest, t, v.dur, 'lowpass', v.crack * 0.4, 0.7, v.gain * 0.9 * k);
		tone(dest, t, v.dur * 0.8, v.body * 1.8, v.body * 0.6, v.gain * 0.7 * k, 'triangle');
	}

	function chord(t, freqs, dur, gain) {
		for (const f of freqs) tone(out, t, dur, f, f, gain, 'triangle');
	}

	return {
		start,
		get running() { return ctx !== null && ctx.state === 'running'; },

		listen(camera, who) {
			viewer = who;
			if (!ctx) return;
			const l = ctx.listener, p = camera.position;
			const fx = -Math.sin(camera.rotation.y), fz = -Math.cos(camera.rotation.y);
			if (l.positionX) {
				l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z;
				l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz;
				l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0;
			}
		},

		play(e) {
			if (!ctx || ctx.state !== 'running') return;
			const t = ctx.currentTime;
			const own = e.s !== null && e.s === viewer;
			const y = e.y + 1.4;
			switch (e.type) {
				case 'shot': gun(e.id, at(e.x, e.y, e.z, own), t, own); break;
				case 'step': {
					const loud = e.id === 'loud';
					burst(at(e.x, e.y, e.z, own), t, 0.07, 'lowpass', loud ? 700 : 420, 1.2, own ? 0.12 : loud ? 0.5 : 0.12);
					break;
				}
				case 'land': burst(at(e.x, e.y, e.z, own), t, 0.1, 'lowpass', 300, 1, 0.4); break;
				case 'reload': {
					const d = at(e.x, y, e.z, own);
					for (const dt of [0.1, 0.9, 1.6]) burst(d, t + dt, 0.04, 'highpass', 2500, 2, 0.35);
					break;
				}
				case 'dry': burst(at(e.x, y, e.z, own), t, 0.03, 'highpass', 3500, 3, 0.3); break;
				case 'deploy': burst(at(e.x, y, e.z, own), t + 0.05, 0.05, 'bandpass', 1800, 2, 0.15); break;
				case 'scope': tone(out, t, 0.05, 900, 600, own ? 0.1 : 0); break;
				case 'throw': burst(at(e.x, y, e.z, own), t, 0.18, 'bandpass', 900, 0.8, 0.25); break;
				case 'bounce': tone(at(e.x, e.y, e.z, false), t, 0.08, 1400, 900, 0.25, 'square'); break;
				case 'explode':
					burst(at(e.x, e.y, e.z, false), t, 1.1, 'lowpass', 500, 0.7, 1.4);
					tone(at(e.x, e.y, e.z, false), t, 0.7, 90, 30, 1.2);
					break;
				case 'flash':
					burst(at(e.x, e.y, e.z, false), t, 0.25, 'highpass', 1800, 0.7, 0.9);
					if (viewer && viewer.flash > 1) tone(out, t + 0.05, Math.min(3, viewer.flash), 3800, 3600, 0.08);
					break;
				case 'smoke': burst(at(e.x, e.y, e.z, false), t, 2.5, 'bandpass', 2200, 0.5, 0.35); break;
				case 'beep': tone(at(e.x, e.y + 0.3, e.z, false), t, 0.09, 1900, 1900, 0.4, 'square'); break;
				case 'plantStart': case 'defuseStart':
					for (let i = 0; i < 4; i++) tone(at(e.x, y, e.z, own), t + i * 0.35, 0.05, 2200, 2200, 0.15, 'square');
					break;
				case 'planted': chord(t, [440, 554, 659], 0.9, 0.12); break;
				case 'defused': chord(t, [523, 659, 784], 0.8, 0.14); break;
				case 'detonate':
					burst(at(e.x, e.y, e.z, false), t, 2.5, 'lowpass', 380, 0.7, 2.5);
					tone(out, t, 1.8, 70, 22, 1.2);
					break;
				case 'hit':
					if (e.o === viewer && e.s !== viewer) tone(out, t, 0.05, e.id === 'head' ? 3600 : 1700, e.id === 'head' ? 3000 : 1500, e.id === 'head' ? 0.35 : 0.18, 'square');
					if (e.s === viewer) burst(out, t, 0.12, 'lowpass', 260, 1, 0.8);
					break;
				case 'kill': if (e.o === viewer && e.s !== viewer) tone(out, t + 0.06, 0.18, 880, 1320, 0.16, 'triangle'); break;
				case 'live': chord(t, [330, 494], 0.5, 0.1); break;
				case 'roundEnd': {
					const won = viewer && e.n === viewer.squad;
					chord(t, won ? [392, 494, 587, 784] : [330, 392, 466], 1.4, 0.12);
					break;
				}
				case 'buy': if (own) burst(out, t, 0.06, 'bandpass', 2600, 4, 0.25); break;
				default: break;
			}
		},
	};
}
