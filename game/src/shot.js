// Screenshot mode (?shot=1&seed=S&t=T&pov=P, optionally &buy or &board), loaded only when asked
// for: play the seeded bot match to second T, feeding the last six seconds of events to the HUD
// and effects so the frame carries its kill feed, radio, tracers and bullet holes, then render it
// through soldier P's eyes and freeze there for tools/shoot.ts to capture.
import { STEP } from './config.js';
import { stepSim } from './sim/game.js';

export function runShot(game, shot) {
	const { sim, me, camera, menu, hud } = game;
	game.overlay.hidden = true;
	const steps = Math.round(shot.t / STEP);
	for (let i = 0; i < steps; i++) {
		stepSim(sim);
		if (i > steps - 6 / STEP) {
			game.placeCamera(1);
			camera.updateMatrixWorld();
			game.drainEvents();
		} else sim.events.clear();
	}
	if (shot.buy) {
		menu.show(true);
		menu.refresh(sim, me);
	}
	let frames = 0;
	const still = () => {
		game.render(1, STEP);
		if (shot.board) hud.board(sim, me, true);
		if (++frames < 4) requestAnimationFrame(still);
		else window.__shotReady = true;
	};
	requestAnimationFrame(still);
}
