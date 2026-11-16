// Keyboard and mouse to the player's command. Mouse look applies as it arrives; one-shot keys are
// latched until a step consumes them. Where pointer lock is refused, free look takes over.
const SENSITIVITY = 0.0022;
const ONE_SHOTS = ['Space', 'KeyR', 'Digit1', 'Digit2', 'Digit4', 'KeyG', 'KeyQ'];

export function createInput(canvas, onLock) {
	const held = new Set();
	const latched = new Set();
	const typed = [];
	const look = { yaw: 0, pitch: 0, dx: 0, dy: 0, scale: 1 };
	let fireHeld = false, firePressed = false, scopePressed = false;
	let locked = false; // the game has the mouse: pointer lock, or free look where lock is refused
	let free = false;   // pointer lock refused (a frame without the permission, an automated browser)
	let wheel = 0;

	const isLocked = () => document.pointerLockElement === canvas;
	const setActive = (on) => {
		if (locked === on) return;
		locked = on;
		if (!on) { held.clear(); fireHeld = false; }
		onLock(on);
	};
	const goFree = () => { free = true; setActive(true); };
	document.addEventListener('pointerlockchange', () => { if (!free) setActive(isLocked()); });
	document.addEventListener('pointerlockerror', goFree);
	document.addEventListener('mousemove', (e) => {
		if (!locked) return;
		look.yaw -= e.movementX * SENSITIVITY * look.scale;
		look.pitch = Math.max(-1.45, Math.min(1.45, look.pitch - e.movementY * SENSITIVITY * look.scale));
		look.dx += e.movementX;
		look.dy += e.movementY;
	});
	document.addEventListener('mousedown', (e) => {
		if (!locked) return;
		if (e.button === 0) { fireHeld = true; firePressed = true; }
		if (e.button === 2) scopePressed = true;
	});
	document.addEventListener('mouseup', (e) => { if (e.button === 0) fireHeld = false; });
	document.addEventListener('contextmenu', (e) => e.preventDefault());
	document.addEventListener('wheel', (e) => { if (locked) wheel += Math.sign(e.deltaY); }, { passive: true });
	window.addEventListener('keydown', (e) => {
		if (e.code === 'Tab' || (locked && e.code.startsWith('Digit'))) e.preventDefault();
		if (e.repeat) return;
		if (free && locked && e.code === 'Escape') { setActive(false); return; }
		held.add(e.code);
		latched.add(e.code);
		typed.push(e.code);
	});
	window.addEventListener('keyup', (e) => held.delete(e.code));
	window.addEventListener('blur', () => { held.clear(); fireHeld = false; });

	const press = (code) => latched.has(code);
	const down = (code) => held.has(code);

	return {
		look,
		get locked() { return locked; },
		requestLock() {
			if (free) { setActive(true); return; }
			const request = canvas.requestPointerLock();
			if (request && request.catch) request.catch(goFree);
		},
		release() {
			if (isLocked()) document.exitPointerLock();
			else if (free) setActive(false);
		},
		held: (code) => held.has(code),
		// Keys pressed since the last call, for the page (menus, scoreboard), then forgotten.
		takeTyped(out) {
			out.length = 0;
			for (const code of typed) out.push(code);
			typed.length = 0;
			return out;
		},
		// Fill the player's command for one simulation step.
		fill(c, menuOpen) {
			c.forward = (down('KeyW') ? 1 : 0) - (down('KeyS') ? 1 : 0);
			c.strafe = (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0);
			c.walk = down('ShiftLeft') || down('ShiftRight');
			c.crouch = down('ControlLeft') || down('KeyC');
			c.jump = press('Space');
			c.use = down('KeyE');
			c.fire = fireHeld && !menuOpen;
			c.firePressed = firePressed && !menuOpen;
			c.scope = scopePressed;
			c.reload = press('KeyR');
			c.slot = '';
			c.nade = '';
			if (!menuOpen) {
				if (press('Digit1')) c.slot = 'primary';
				else if (press('Digit2')) c.slot = 'secondary';
				else if (press('Digit4') || press('KeyG')) c.slot = 'nade';
				else if (press('KeyQ')) c.slot = 'last';
				else if (wheel !== 0) c.slot = wheel > 0 ? 'secondary' : 'primary';
			}
			c.yaw = look.yaw;
			c.pitch = look.pitch;
			firePressed = false; scopePressed = false; wheel = 0;
			for (const code of ONE_SHOTS) latched.delete(code);
		},
	};
}
