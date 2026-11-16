// Every tunable rule of the match in one place: timings, economy, movement, senses, grenades.

export const STEP = 1 / 60;  // fixed simulation step, seconds
export const CELL = 2;  // metres per map cell

export const MATCH = {
	teamSize: 5,
	roundsToWin: 5,  // first to 5
	halftimeAfter: 4,  // sides swap after round 4
	freezeTime: 6,  // seconds of buy time before the doors open
	firstFreezeTime: 9,  // longer on the opening round of each half
	roundTime: 115,
	buyWindow: 20,  // seconds after the doors open that the buy zone stays open
	roundEndTime: 5,
	chargeTimer: 40,
	plantTime: 3.2,
	defuseTime: 6,
	defuseTimeKit: 3,
	defuseRange: 1.5,
};

export const ECON = {
	start: 800,
	max: 16000,
	winElimination: 3250,
	winObjective: 3500,
	lossBase: 1400,
	lossStep: 500,
	lossMax: 3400,
	plantBonus: 800,  // the attackers' consolation when the charge was down
	plantReward: 300,  // to the planter
	defuseReward: 300,
};

export const MOVE = {
	runSpeed: 6.2,
	walkScale: 0.52,
	crouchScale: 0.34,
	accelerate: 5.6,
	airAccelerate: 1.1,
	airSpeedCap: 0.9,
	friction: 5.4,
	stopSpeed: 2.2,
	gravity: 20,
	jumpSpeed: 6.1,
	stepHeight: 0.36,
	radius: 0.32,
	standHeight: 1.8,
	crouchHeight: 1.22,
	standEye: 1.64,
	crouchEye: 1.1,
	crouchRate: 7,
	footstepStride: 2.3,
};

export const SENSES = {
	fov: 0.58 * Math.PI,  // bots' vision cone, radians
	sightRange: 70,
	gunshotRadius: 42,
	footstepRadius: 13,
	memory: 6,  // seconds a sighting stays useful to the team
};

export const NADES = {
	throwSpeed: 15.5,
	restitution: 0.42,
	fragFuse: 1.6,
	fragRadius: 6.5,
	fragDamage: 98,
	smokeRadius: 4.3,
	smokeLife: 15,
	flashFuse: 1.4,
	flashRange: 26,
	flashMax: 3.2,
	chargeRadius: 20,
	chargeDamage: 450,
};
