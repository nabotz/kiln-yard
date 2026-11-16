// The whole simulation as one state object and one fixed-step update. Nothing here touches
// three.js or the page: renderer, audio and HUD only read the state and its events.
import { STEP, MATCH } from '../config.js';
import { createRng } from '../rng.js';
import { createGrid } from '../map/grid.js';
import { createNav } from '../map/nav.js';
import { createSoldier } from './soldier.js';
import { createEvents, createNoises } from './events.js';
import { moveSoldier, separate } from './movement.js';
import { updateArms, updatePickups } from './combat.js';
import { createNadePools, updateNades } from './grenades.js';
import { createCharge, updateCharge } from './charge.js';
import { createRoundState, startRound, updateRound } from './round.js';
import { createIntel } from '../ai/perception.js';
import { createBrain, think } from '../ai/bot.js';
import { createTactics, roundStart, updateTactics } from '../ai/tactics.js';

const NAMES = [['You', 'Rook', 'Vesper', 'Moss', 'Tallow'], ['Hex', 'Sable', 'Quill', 'Brand', 'Juno']];

export function createSim({ seed = 1, skill = 'normal', autopilot = false } = {}) {
	const grid = createGrid();
	const soldiers = [];
	for (let squad = 0; squad < 2; squad++) {
		for (let i = 0; i < MATCH.teamSize; i++) {
			const isPlayer = squad === 0 && i === 0;
			const s = createSoldier(soldiers.length, NAMES[squad][i], squad, isPlayer);
			if (!isPlayer || autopilot) s.brain = createBrain(skill, (soldiers.length % 6) * STEP);
			soldiers.push(s);
		}
	}
	const { nades, smokes } = createNadePools();
	const sim = {
		time: 0,
		grid,
		nav: createNav(grid),
		rng: createRng(seed),
		events: createEvents(),
		noises: createNoises(),
		soldiers,
		player: soldiers[0],
		nades, smokes,
		pickups: Array.from({ length: 12 }, () => ({ weapon: null, x: 0, y: 0, z: 0, yaw: 0 })),
		charge: createCharge(),
		intel: createIntel(soldiers.length),
		tactics: createTactics(),
		...createRoundState(),
	};
	beginRound(sim);
	return sim;
}

function beginRound(sim) {
	startRound(sim);
	roundStart(sim);
}

export function stepSim(sim) {
	const dt = STEP;
	sim.time += dt;
	const frozen = sim.round.phase === 'freeze';
	const over = sim.round.phase === 'matchover';

	updateTactics(sim);
	for (const s of sim.soldiers) {
		s.prev.x = s.pos.x; s.prev.y = s.pos.y; s.prev.z = s.pos.z;
		if (s.brain) think(sim, s, dt);
		if (!s.alive) continue;
		s.yaw = s.cmd.yaw;
		s.pitch = Math.max(-1.45, Math.min(1.45, s.cmd.pitch));
		s.flash = Math.max(0, s.flash - dt);
		moveSoldier(sim, s, dt, frozen || over);
		if (!frozen && !over) updateArms(sim, s, dt);
	}
	separate(sim.soldiers, dt);
	updateNades(sim, dt);
	updatePickups(sim);
	updateCharge(sim, dt);

	const roundBefore = sim.round.number;
	updateRound(sim, dt);
	if (sim.round.number !== roundBefore) roundStart(sim);
}

