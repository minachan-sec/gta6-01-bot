// Solara Bay — every tuning number, colour and name in one place.
// The world is a fixed 2048x1536 logical area; the renderer scales it to the
// window, so no rule below depends on the screen size.
export const WORLD = { width: 2048, height: 1536 };

/** Road centrelines. Roads are 64 wide; blocks sit between them. */
export const ROADS_X = [96, 352, 608, 864, 1120, 1376, 1632, 1888];
export const ROADS_Y = [96, 320, 544, 768, 992, 1216, 1440];
export const ROAD_W = 64;
export const LANE = 15;

export const STEP = 1 / 60;
export const VIEW = { width: 1280, height: 720 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 170,
  sprintSpeed: 265,
  health: 100,
  punchDamage: 12,
  pistolDamage: 34,
  pistolRange: 420,
  pistolAmmoStart: 24,
  maxAmmo: 120,
};

export const CAR = {
  radius: 17,
  enterRange: 46,
  maxHealth: 100,
};

export const CAR_TYPES = {
  comet: { name: 'Comet GT', length: 52, width: 26, accel: 340, topSpeed: 560, turn: 2.9, grip: 7.5, colors: ['#c0392b', '#e67e22', '#f1c40f'] },
  sedan: { name: 'Marlin Sedan', length: 50, width: 25, accel: 260, topSpeed: 430, turn: 2.6, grip: 7.0, colors: ['#7f8c8d', '#2c3e50', '#16a085', '#8e44ad'] },
  taxi: { name: 'Bay Cab', length: 50, width: 25, accel: 250, topSpeed: 420, turn: 2.6, grip: 7.0, colors: ['#f39c12'] },
  pickup: { name: 'Rancho Pickup', length: 54, width: 27, accel: 240, topSpeed: 400, turn: 2.4, grip: 6.5, colors: ['#27ae60', '#7f8c8d', '#c0392b'] },
  van: { name: 'Courier Van', length: 58, width: 28, accel: 200, topSpeed: 340, turn: 2.1, grip: 6.0, colors: ['#ecf0f1', '#3498db', '#95a5a6'] },
  truck: { name: 'Hauler Truck', length: 66, width: 30, accel: 170, topSpeed: 300, turn: 1.9, grip: 5.5, colors: ['#e67e22', '#95a5a6'] },
  cruiser: { name: 'SBPD Cruiser', length: 52, width: 26, accel: 300, topSpeed: 520, turn: 2.8, grip: 7.8, colors: ['#1a1a2e'] },
  armored: { name: 'Vault Van', length: 62, width: 30, accel: 210, topSpeed: 360, turn: 2.0, grip: 6.2, colors: ['#5d6d7e'] },
};

export const PED = {
  radius: 11,
  walkSpeed: 55,
  panicSpeed: 150,
  count: 42,
};

export const TRAFFIC_COUNT = 26;

export const WANTED = {
  maxStars: 5,
  decayDelay: 12,
  decayInterval: 8,
  bustRange: 52,
  bustSeconds: 2.2,
  copCarPerStar: [0, 0, 1, 2, 3, 4],
  footCopPerStar: [0, 1, 2, 2, 3, 4],
};

/** District names, used on the HUD and in mission text. */
export const DISTRICTS = [
  { name: 'Marina', x0: 0, y0: 0, x1: 224, y1: 1536 },
  { name: 'Old Town', x0: 224, y0: 0, x1: 736, y1: 640 },
  { name: 'Downtown', x0: 736, y0: 0, x1: 1504, y1: 896 },
  { name: 'The Hills', x0: 1504, y0: 0, x1: 2048, y1: 896 },
  { name: 'Little Havana', x0: 224, y0: 640, x1: 992, y1: 1536 },
  { name: 'Beachfront', x0: 992, y0: 896, x1: 2048, y1: 1536 },
];

export function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Solara Bay';
}

/** Sun-soaked late afternoon palette: warm asphalt, pale concrete, terracotta. */
export const PALETTE = {
  grass: '#7fae5a',
  grassDark: '#6d9c4c',
  parkPath: '#d9c9a3',
  sand: '#e8d5a4',
  water: '#3d8fb5',
  waterDeep: '#2f7396',
  asphalt: '#3a3f46',
  asphaltDark: '#33373d',
  sidewalk: '#b9b3a4',
  curb: '#9a9484',
  laneMark: '#e8d44d',
  crosswalk: '#e8e4d8',
  buildingSide: '#8a7f70',
  roofColors: ['#b5543c', '#c97e4a', '#7d8a99', '#a89a6f', '#8e6f7a', '#5d7a6a', '#d9c9a3'],
  roofEdge: '#6e6258',
  tree: '#4e7d3a',
  treeDark: '#3c6130',
  hudBg: 'rgba(12, 14, 18, 0.72)',
  hudLine: 'rgba(255, 255, 255, 0.16)',
  accent: '#f5b942',
  accentDark: '#c98f1b',
  danger: '#e74c3c',
  police: '#4a90d9',
  mission: '#f5b942',
  text: '#f2efe8',
  textDim: '#b9b3a4',
};

export const SAVE_KEY = 'solara-bay-save-v1';
export const BEST_KEY = 'solara-bay-best-v1';
