// The buy rules shared by player and bots: what each side may buy, where and when, and what a
// purchase does to a soldier's kit and wallet.
import { MATCH } from '../config.js';
import { WEAPONS } from './weapons.js';
import { giveWeapon } from './combat.js';
import { nadeCount } from './soldier.js';

export const CATALOG = [
	{ id: 'anvil', group: 'Sidearms', name: WEAPONS.anvil.name, price: WEAPONS.anvil.price, note: 'one-tap to the head' },
	{ id: 'wasp', group: 'Sidearms', name: WEAPONS.wasp.name, price: WEAPONS.wasp.price, note: 'spare sidearm' },
	{ id: 'hornet', group: 'Primaries', name: WEAPONS.hornet.name, price: WEAPONS.hornet.price, note: '$600 kill bonus' },
	{ id: 'breaker', group: 'Primaries', name: WEAPONS.breaker.name, price: WEAPONS.breaker.price, note: 'close quarters' },
	{ id: 'kestrel', group: 'Primaries', name: WEAPONS.kestrel.name, price: WEAPONS.kestrel.price, note: 'the all-rounder' },
	{ id: 'longreach', group: 'Primaries', name: WEAPONS.longreach.name, price: WEAPONS.longreach.price, note: 'bolt rifle, scoped' },
	{ id: 'vest', group: 'Gear', name: 'Plate vest', price: 650, note: '100 armour' },
	{ id: 'helmet', group: 'Gear', name: 'Vest + helmet', price: 1000, note: 'protects the head' },
	{ id: 'kit', group: 'Gear', name: 'Defuse kit', price: 400, note: 'Halcyon only: 3 s defuse', side: 'def' },
	{ id: 'frag', group: 'Grenades', name: 'Frag', price: 300, note: 'max 1' },
	{ id: 'flash', group: 'Grenades', name: 'Flash', price: 200, note: 'max 2' },
	{ id: 'smoke', group: 'Grenades', name: 'Smoke', price: 300, note: 'max 1' },
];

const NADE_LIMIT = { frag: 1, flash: 2, smoke: 1 };

export const buyOpen = (sim) => sim.round.phase === 'freeze' || (sim.round.phase === 'live' && sim.round.elapsed < MATCH.buyWindow);
export const inBuyZone = (sim, s) => sim.grid.spawnAt(s.pos.x, s.pos.z) === s.side;

export function priceFor(s, item) {
	if (item.id === 'helmet' && s.armor >= 100 && !s.helmet) return 350;
	return item.price;
}

// Why the item cannot be bought right now, or '' if it can.
export function refusal(sim, s, item) {
	if (!s.alive) return 'dead';
	if (!buyOpen(sim)) return 'buy time is over';
	if (!inBuyZone(sim, s)) return 'not in the buy zone';
	if (item.side && item.side !== s.side) return 'wrong side';
	if (priceFor(s, item) > s.money) return 'not enough money';
	if (item.id === 'vest' && s.armor >= 100) return 'already armoured';
	if (item.id === 'helmet' && s.armor >= 100 && s.helmet) return 'already armoured';
	if (item.id === 'kit' && s.kit) return 'already carried';
	if (NADE_LIMIT[item.id] !== undefined && (s.nades[item.id] >= NADE_LIMIT[item.id] || nadeCount(s) >= 3)) return 'carrying the limit';
	const w = WEAPONS[item.id];
	if (w && ((w.slot === 'primary' && s.primary?.def.id === w.id) || (w.slot === 'secondary' && s.secondary?.def.id === w.id))) return 'already carried';
	return '';
}

export function buy(sim, s, id) {
	const item = CATALOG.find((i) => i.id === id);
	if (!item || refusal(sim, s, item)) return false;
	s.money -= priceFor(s, item);
	if (WEAPONS[id]) giveWeapon(sim, s, id);
	else if (id === 'vest') s.armor = 100;
	else if (id === 'helmet') { s.armor = 100; s.helmet = true; }
	else if (id === 'kit') s.kit = true;
	else s.nades[id]++;
	sim.events.emit('buy', s, id);
	return true;
}
