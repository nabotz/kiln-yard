// The buy menu: the shop by group with prices and why an item is unavailable. Click an item,
// or press its group's number and then its own.
import { CATALOG, refusal, priceFor, buyOpen, inBuyZone } from '../sim/shop.js';

const GROUPS = ['Sidearms', 'Primaries', 'Gear', 'Grenades'];

export function createBuyMenu(root, onBuy) {
	const columns = GROUPS.map((group, gi) => {
		const col = document.createElement('div');
		col.className = 'buy-col';
		col.innerHTML = `<h3><kbd>${gi + 1}</kbd>${group}</h3>`;
		const items = CATALOG.filter((i) => i.group === group).map((item, ii) => {
			const btn = document.createElement('button');
			btn.type = 'button';
			btn.className = 'buy-item';
			btn.innerHTML = `<kbd>${ii + 1}</kbd><span class="n">${item.name}</span><span class="p"></span><span class="why"></span>`;
			btn.addEventListener('click', () => onBuy(item.id));
			col.appendChild(btn);
			return { item, btn, price: btn.querySelector('.p'), why: btn.querySelector('.why') };
		});
		root.querySelector('.buy-grid').appendChild(col);
		return { col, items };
	});
	const status = root.querySelector('.buy-status');
	let group = -1;
	let open = false;

	return {
		get open() { return open; },
		show(on) {
			open = on;
			root.hidden = !on;
			group = -1;
			for (const c of columns) c.col.classList.remove('picked');
		},
		// A digit picks a group, the next digit an item in it.
		key(code) {
			const n = code.startsWith('Digit') ? Number(code.slice(5)) : -1;
			if (n < 1) return;
			if (group < 0) {
				if (n <= GROUPS.length) {
					group = n - 1;
					columns[group].col.classList.add('picked');
				}
				return;
			}
			const entry = columns[group].items[n - 1];
			columns[group].col.classList.remove('picked');
			group = -1;
			if (entry) onBuy(entry.item.id);
		},
		refresh(sim, s) {
			if (!open) return;
			status.textContent = !buyOpen(sim) ? 'Buy time is over' : !inBuyZone(sim, s) ? 'Return to your spawn to buy' : `$${s.money} to spend`;
			for (const c of columns) {
				for (const e of c.items) {
					const why = refusal(sim, s, e.item);
					e.btn.disabled = why !== '';
					e.price.textContent = `$${priceFor(s, e.item)}`;
					e.why.textContent = why && why !== 'not enough money' ? why : e.item.note;
				}
			}
		},
	};
}
