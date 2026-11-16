// Kiln Yard, an original map of a brickworks, drawn in text: one character per 2 m cell.
// Cinder Cell attacks from the clay yard (south), Halcyon Watch defends from the office (north).
// Site A is the kiln hall (west), B the loading dock (east); A Long, Mid and B Yard run between.
//   #  brick wall   C  tall crates   c  waist-high crate   =  barrier   K  kiln
//   a / b  plant zones   T / D  spawns and buy zones   .  floor

export const ROWS = [
	'########################################',
	'#............C..DDDDDDDD...............#',
	'#.c.............DDDDDDDD..C...Cbbbbbb..#',
	'#..aaaaaa.C.####DDDDDDDD####..Cbbbbbb.c#',
	'#..aaaaaa.C.######....######...bbcbbb..#',
	'#..aacaaa...######....######...bbbbbb..#',
	'#..aaaaaa...######.............bbbbbb..#',
	'#..aaaaaa.c.........................CC.#',
	'#.......KK............######.c.........#',
	'#..=....KK..######....######...........#',
	'#...........######CCC.###########.....##',
	'##.....###########....###########.....##',
	'##.....###########.##############.....##',
	'##.....########..........########...c.##',
	'##c....########..c....C..########.....##',
	'##.....########..C....c..########.C...##',
	'##...C.########..........########.....##',
	'##.....###########....................##',
	'##.....###########........c...........##',
	'##....................###########.....##',
	'##...........c........###########.....##',
	'##.c...###########....###########....c##',
	'##.....###########.==.###########.....##',
	'##.....###########c...###########.....##',
	'##.....###########....###########.....##',
	'##....................................##',
	'##.............TTTTTTTTTT.............##',
	'##......c......TTTTTTTTTT......c......##',
	'##.............TTTTTTTTTT.............##',
	'###############TTTTTTTTTT###############',
	'###############TTTTTTTTTT###############',
	'########################################',
];

// Solid cell kinds: height of the box (m), inset from the cell edge (m) and what it is made of.
export const KINDS = {
	'#': { top: 5.2, inset: 0, mat: 'wall' },
	'C': { top: 2.3, inset: 0.12, mat: 'crateTall' },
	'c': { top: 1.1, inset: 0.2, mat: 'crate' },
	'=': { top: 0.95, inset: 0.3, mat: 'barrier' },
	'K': { top: 3.4, inset: 0.04, mat: 'kiln' },
};

// Named places, in cell units (x east, z south). Bots route between them and the HUD calls them out.
export const POINTS = {
	tSpawn: [20, 27.5], dSpawn: [20, 2],
	aLongLow: [4.5, 23.5], aLongHigh: [4.5, 13], aMain: [4.5, 10.5],
	underpass: [12, 19.5], midLow: [20, 24], midCourt: [20, 15.5], midHigh: [20, 7.5],
	kilnDoor: [15, 7.5], catwalk: [25, 6.5], garage: [27, 17.5],
	bYardLow: [35.5, 23.5], bYardHigh: [35.5, 12], bMain: [35.5, 10],
	aSite: [6.5, 4.5], bSite: [34, 4.5],
};

// Callout regions for the HUD's location line: [name, x0, z0, x1, z1] in cells, first match wins.
export const CALLOUTS = [
	['Kiln Hall (A)', 1, 1, 12, 11], ['Loading Dock (B)', 28, 1, 39, 10], ['Watch Office', 12, 1, 28, 4],
	['Kiln Passage', 12, 7, 18, 9], ['Catwalk', 22, 6, 28, 8], ['Mid', 18, 4, 22, 25], ['Courtyard', 15, 13, 25, 17],
	['A Long', 2, 11, 7, 25], ['B Yard', 33, 10, 38, 25], ['Underpass', 7, 19, 18, 21], ['Garage', 22, 17, 33, 19],
	['Clay Yard', 2, 25, 38, 31],
];

// Per site: where the charge goes and the main way in, where defenders hold (and the lane they
// watch), where attackers sit after the plant, and the utility each staging group throws.
export const SITES = {
	A: {
		zone: 'a', center: POINTS.aSite, plant: [6.5, 4.2], entry: POINTS.aMain,
		holds: [
			{ at: [1.5, 1.5], look: [4.5, 11] },
			{ at: [10.5, 5.5], look: [12, 7.5] },
			{ at: [6.5, 1.5], look: [4.5, 11] },
			{ at: [10.5, 9.5], look: [4.5, 11.5] },
		],
		post: [
			{ at: [3.5, 10.2], look: [12, 1.5] },
			{ at: [11, 10.5], look: [11, 1.5] },
			{ at: [1.5, 6.5], look: [12, 2] },
		],
		utility: {
			aLongHigh: { smoke: [8, 2.5], flash: [4.5, 8.5] },
			kilnDoor: { smoke: [7, 9.5], flash: [10, 6.5] },
		},
	},
	B: {
		zone: 'b', center: POINTS.bSite, plant: [35.5, 3.5], entry: POINTS.bMain,
		holds: [
			{ at: [37.5, 1.5], look: [35.5, 10] },
			{ at: [30.5, 8.7], look: [27.5, 6.5] },
			{ at: [31.5, 9], look: [35.5, 10.5] },
			{ at: [29, 1.5], look: [34, 9.5] },
		],
		post: [
			{ at: [29.5, 9], look: [27, 1.5] },
			{ at: [37.5, 8.5], look: [27.5, 1.8] },
			{ at: [32, 1.5], look: [28, 6.5] },
		],
		utility: {
			bYardHigh: { smoke: [36, 3], flash: [35.5, 7.5] },
			catwalk: { smoke: [32, 8], flash: [30, 6] },
		},
	},
};

export const MID_HOLDS = [
	{ at: [20.5, 4.5], look: [20, 20] },
	{ at: [21.5, 7.5], look: [19, 16] },
];

// Attack plans: each group walks its waypoints and waits at the last one (its staging point)
// until the team executes onto the site together.
export const PLANS = [
	{ site: 'A', name: 'A split', groups: [['aLongLow', 'aLongHigh'], ['midLow', 'midCourt', 'midHigh', 'kilnDoor']] },
	{ site: 'A', name: 'A Long hit', groups: [['aLongLow', 'aLongHigh']] },
	{ site: 'A', name: 'Underpass to A', groups: [['midLow', 'underpass', 'aLongHigh'], ['aLongLow', 'aLongHigh']] },
	{ site: 'B', name: 'B split', groups: [['bYardLow', 'bYardHigh'], ['midLow', 'midCourt', 'midHigh', 'catwalk']] },
	{ site: 'B', name: 'B Yard hit', groups: [['bYardLow', 'bYardHigh']] },
	{ site: 'B', name: 'Garage to B', groups: [['midLow', 'garage', 'bYardHigh'], ['bYardLow', 'bYardHigh']] },
];
