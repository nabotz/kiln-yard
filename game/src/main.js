// Boot and the loop: a fixed 60 Hz simulation fed by the keyboard, rendering at display rate with
// interpolation, events sent once to effects, audio and HUD. The camera rides the player or a
// living teammate. ?shot=1&seed=S&t=T&pov=P replays a seeded bot match to second T through
// soldier P's eyes and freezes there, for reproducible screenshots.
import { STEP, CELL } from './config.js';
import { createSim, stepSim } from './sim/game.js';
import { eyeHeight } from './sim/soldier.js';
import { buy, buyOpen, inBuyZone } from './sim/shop.js';
import { setSkill } from './ai/bot.js';
import { createInput } from './input.js';
import { createTextures } from './render/textures.js';
import { createStage } from './render/stage.js';
import { buildLevel } from './render/level.js';
import { createSoldierViews } from './render/soldiers.js';
import { createViewmodel } from './render/viewmodel.js';
import { createEffects } from './render/effects.js';
import { createHud } from './ui/hud.js';
import { createRadar } from './ui/radar.js';
import { createBuyMenu } from './ui/buymenu.js';
import { createAudio } from './audio.js';

const params = new URLSearchParams(window.location.search);
const shot = params.has('shot')
	? { seed: Number(params.get('seed')) || 1, t: Number(params.get('t')) || 30, pov: Number(params.get('pov') ?? 0), buy: params.has('buy'), board: params.has('board') }
	: null;

const sim = createSim({ seed: shot ? shot.seed : 1 + (Date.now() % 99991), autopilot: shot !== null });
const me = shot ? sim.soldiers[shot.pov] : sim.player;

const textures = createTextures();
const stage = createStage(document.getElementById('game'), textures, sim.grid.width * CELL, sim.grid.depth * CELL);
const { camera } = stage;
const level = buildLevel(stage.scene, sim.grid, textures);
const bodies = createSoldierViews(stage.scene, sim);
const viewmodel = createViewmodel(stage.vmScene, textures);
const effects = createEffects(stage.scene, textures);
const hud = createHud();
const radar = createRadar(document.getElementById('radar'), sim.grid);
const audio = createAudio();
const menu = createBuyMenu(document.getElementById('buy'), (id) => buy(sim, me, id));
const input = createInput(stage.renderer.domElement, onLock);
const overlay = document.getElementById('overlay');

let paused = true;
let spectateIndex = 0;
let viewer = me;
let menuRefreshAt = 0;
let accumulator = 0;
let last = performance.now();
const typed = [];
const muzzleOf = (out) => viewmodel.muzzle(camera, out);
const lerp = (a, b, t) => a + (b - a) * t;

function handleEvent(e) {
	effects.handle(e, sim, viewer, muzzleOf);
	audio.play(e);
	hud.event(e, sim, me);
	if (e.type === 'shot' && e.s === viewer) viewmodel.shot(sim.time);
	else if (e.type === 'beep') effects.beep(sim.time);
	else if (e.type === 'roundStart' && !shot) {
		input.look.yaw = me.yaw;
		input.look.pitch = 0;
		if (menu.open) closeMenu(true);
	} else if (e.type === 'matchEnd' && !shot) showMatchEnd();
}

function drainEvents() {
	sim.events.forEach(handleEvent);
	sim.events.clear();
}

// The player, or once they are down (after a moment on the body) a living teammate.
function pickViewer() {
	if (shot || me.alive || sim.time - me.diedAt < 2.5) return me;
	let count = 0;
	for (const s of sim.soldiers) if (s.alive && s.squad === me.squad) count++;
	if (count === 0) return me;
	let k = spectateIndex % count;
	for (const s of sim.soldiers) if (s.alive && s.squad === me.squad && k-- === 0) return s;
	return me;
}

function placeCamera(alpha) {
	const s = viewer;
	const x = lerp(s.prev.x, s.pos.x, alpha), z = lerp(s.prev.z, s.pos.z, alpha);
	const y = lerp(s.prev.y, s.pos.y, alpha) + (eyeHeight(s) - s.pos.y);
	const live = s === me && !shot;
	const yaw = live ? input.look.yaw : s.yaw;
	const pitch = live ? input.look.pitch : s.pitch;
	if (s.alive) {
		camera.position.set(x, y, z);
		camera.rotation.set(pitch + s.recoilPitch * 0.5, yaw + s.recoilYaw * 0.5, 0, 'YXZ');
	} else {
		const t = Math.min(1, (sim.time - s.diedAt) / 0.6);
		camera.position.set(x, 1.6 - t * 1.25, z);
		camera.rotation.set(pitch * (1 - t) - t * 0.35, yaw, t * 0.5, 'YXZ');
	}
	const fov = s.scoped && s.alive ? s.primary.def.scope : 74;
	if (camera.fov !== fov) {
		camera.fov = fov;
		camera.updateProjectionMatrix();
	}
	input.look.scale = s.scoped ? 0.35 : 1;
}

function render(alpha, dt) {
	viewer = pickViewer();
	placeCamera(alpha);
	level.update(sim.time);
	bodies.update(alpha, dt, viewer);
	effects.update(sim, dt);
	viewmodel.update(sim, viewer, dt, input.look.dx, input.look.dy);
	input.look.dx = 0;
	input.look.dy = 0;
	hud.update(sim, viewer, me, camera, dt);
	radar.draw(sim, viewer, sim.time);
	if (sim.time > menuRefreshAt) {
		menu.refresh(sim, me);
		menuRefreshAt = sim.time + 0.2;
	}
	audio.listen(camera, viewer);
	stage.render(viewer.alive && !viewer.scoped);
}

function openMenu() {
	if (!me.alive || !buyOpen(sim) || !inBuyZone(sim, me)) return;
	menu.show(true);
	menu.refresh(sim, me);
	input.release();
}

function closeMenu(relock) {
	menu.show(false);
	if (relock) input.requestLock();
}

function handleKeys() {
	for (const code of input.takeTyped(typed)) {
		if (code === 'KeyB') {
			if (menu.open) closeMenu(true);
			else if (input.locked) openMenu();
		} else if (code === 'Escape' && menu.open) {
			closeMenu(false);
			pause();
		} else if (menu.open) menu.key(code);
	}
	if (menu.open && (!buyOpen(sim) || !inBuyZone(sim, me))) closeMenu(true);
	hud.board(sim, me, input.held('Tab') || sim.round.phase === 'matchover');
}

function pause() {
	paused = true;
	overlay.hidden = false;
	document.getElementById('overlay-title').innerHTML = 'Paused';
	document.getElementById('play').textContent = 'Resume';
}

function onLock(locked) {
	if (locked) {
		paused = false;
		overlay.hidden = true;
	} else if (!menu.open && sim.round.phase !== 'matchover') pause();
}

function showMatchEnd() {
	const m = sim.match;
	const won = m.winner === me.squad;
	input.release();
	overlay.hidden = false;
	document.getElementById('overlay-title').innerHTML = won ? 'Match <span>won</span>' : 'Match <span>lost</span>';
	document.getElementById('overlay-copy').textContent = `${m.scores[me.squad]} – ${m.scores[1 - me.squad]}. Most valuable: ${m.mvp.name} (${m.mvp.kills} kills, ${m.mvp.damageDealt} damage). You: ${me.kills} kills, ${me.deaths} deaths.`;
	const play = document.getElementById('play');
	play.textContent = 'Play again';
	play.onclick = () => window.location.reload();
}

function frame(now) {
	requestAnimationFrame(frame);
	const dt = Math.min(0.1, (now - last) / 1000);
	last = now;
	handleKeys();
	if (!paused && sim.round.phase !== 'matchover') {
		accumulator += dt;
		while (accumulator >= STEP) {
			input.fill(me.cmd, menu.open);
			stepSim(sim);
			drainEvents();
			accumulator -= STEP;
		}
	}
	render(paused ? 1 : accumulator / STEP, dt);
}

function bootPlay() {
	document.getElementById('play').addEventListener('click', () => {
		audio.start();
		input.requestLock();
	});
	for (const b of document.querySelectorAll('.skill')) {
		b.addEventListener('click', () => {
			setSkill(sim, b.dataset.skill);
			for (const o of document.querySelectorAll('.skill')) o.setAttribute('aria-pressed', String(o === b));
		});
	}
	document.addEventListener('mousedown', () => { if (input.locked && !me.alive) spectateIndex++; });
	input.look.yaw = me.yaw;
	requestAnimationFrame(frame);
}

// Screenshot mode: play the seeded match to the chosen second, feeding the last moments'
// events to the HUD and effects so the frame carries its kill feed, tracers and bullet holes.
function bootShot() {
	overlay.hidden = true;
	const steps = Math.round(shot.t / STEP);
	for (let i = 0; i < steps; i++) {
		stepSim(sim);
		if (i > steps - 6 / STEP) drainEvents();
		else sim.events.clear();
	}
	if (shot.buy) {
		menu.show(true);
		menu.refresh(sim, me);
	}
	let frames = 0;
	const still = () => {
		render(1, STEP);
		if (shot.board) hud.board(sim, me, true);
		if (++frames < 4) requestAnimationFrame(still);
		else window.__shotReady = true;
	};
	requestAnimationFrame(still);
}

if (shot) bootShot();
else bootPlay();
