// One combatant's state, the same for the player and every bot, and the command its controller
// (keyboard or bot brain) writes each step.
import { MOVE, ECON } from '../config.js';
import { makeWeapon } from './weapons.js';

function createCommand() {
	return {
		forward: 0, strafe: 0, yaw: 0, pitch: 0,
		walk: false, crouch: false, jump: false, fire: false, use: false,
		firePressed: false, reload: false, scope: false, slot: '', nade: '',
	};
}

export function createSoldier(id, name, squad, isPlayer) {
	return {
		id, name, squad, isPlayer, side: 'atk',
		alive: true, hp: 100, armor: 0, helmet: false, kit: false, money: ECON.start,
		pos: { x: 0, y: 0, z: 0 }, prev: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 },
		yaw: 0, pitch: 0, onGround: true, crouch: 0, height: MOVE.standHeight,
		primary: null, secondary: makeWeapon('wasp'),
		nades: { frag: 0, smoke: 0, flash: 0 }, nadeType: 'frag',
		slot: 'secondary', lastSlot: 'secondary', deployUntil: 0, throwAt: 0, scoped: false,
		recoilPitch: 0, recoilYaw: 0, flash: 0, stride: 0, busy: false,
		hasCharge: false, kills: 0, deaths: 0, damageDealt: 0, diedAt: -99,
		cmd: createCommand(), brain: null,
	};
}

// Strip a soldier to the pistol-round kit (a death, or the half-time reset).
export function resetLoadout(s) {
	s.primary = null;
	s.secondary = makeWeapon('wasp');
	s.nades.frag = 0; s.nades.smoke = 0; s.nades.flash = 0;
	s.armor = 0; s.helmet = false; s.kit = false;
	s.slot = 'secondary'; s.lastSlot = 'secondary';
}

export function activeWeapon(s) {
	if (s.slot === 'primary') return s.primary;
	if (s.slot === 'secondary') return s.secondary;
	return null;
}

export const eyeHeight = (s) => s.pos.y + MOVE.standEye + (MOVE.crouchEye - MOVE.standEye) * s.crouch;

// Unit aim vector from yaw and pitch (yaw 0 looks toward -z, pitch up is positive).
export function aimVector(yaw, pitch, out) {
	const cp = Math.cos(pitch);
	out.x = -Math.sin(yaw) * cp;
	out.y = Math.sin(pitch);
	out.z = -Math.cos(yaw) * cp;
	return out;
}

export const nadeCount = (s) => s.nades.frag + s.nades.smoke + s.nades.flash;
