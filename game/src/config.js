// Solara Bay: Neon Tide — tuning, palette and world constants (round 3).
// One unit is one metre. The city is a road grid with a beach on the south
// edge. The whole game is graded sunset -> night ("neon tide").

export const TUNE = {
  map: {
    span: 640, // playable square, -320..320 on x and z
    streetGap: 80,
    streetWide: 16,
    curb: 3,
    sandZ: 296, // z beyond this is sand, then sea
    waterZ: 332,
  },
  hero: {
    stroll: 5.4,
    dash: 8.8,
    push: 42,
    girth: 0.55,
    hpMax: 100,
    vestMax: 100,
    windMax: 100,
    windUse: 16,
    windBack: 14,
    fistReach: 2.4,
    boardReach: 4.4,
  },
  lens: {
    walkBack: 7.5,
    walkUp: 3.1,
    rideBack: 10.5,
    rideUp: 4.4,
    view: 62,
    viewBoost: 74,
    tiltLow: -0.12,
    tiltHigh: 0.85,
  },
  wheels: {
    boostMult: 1.32,
    boostUse: 26, // per second, 0..100 tank
    boostBack: 9,
    slideGrip: 0.42, // lateral grip kept while handbraking
    closeCallDist: 3.6,
    closeCallSpeed: 18,
    smashDamage: 0.5, // car health lost per m/s of impact over threshold
    smashAt: 9,
  },
  heat: {
    maxCruisers: 6,
    beatCops: 2,
    chopperAt: 3,
    coolDelay: 6, // seconds with no cop near before stars drop
    coolStep: 4,
    grabDist: 3.2,
    grabTime: 2.0,
    eyeRange: 70,
  },
  crowd: { motors: 14, walkers: 22, vanishDist: 230, appearDist: 170 },
  clock: {
    firstHour: 19.0, // 19:00 Friday, golden dusk
    minsPerSec: 0.4, // a full day in 60 real minutes
    weekDays: ['FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU'],
  },
  storeKey: 'solara-bay-neon-tide-save-v1',
};

// Dusk -> night lighting presets, keyed by game hour. The renderer lerps
// between neighbouring presets as the clock moves.
export const SKY_STOPS = [
  { hour: 17.0, zenith: 0x2b4a7a, edge: 0xffb36b, haze: 0x8a6a72, light: 0xffd9a0, lightI: 2.4, sky: 0.55, fill: 0x8a7a9a, street: 0.0 },
  { hour: 19.0, zenith: 0x1b2a4a, edge: 0xff7a5c, haze: 0x54405a, light: 0xff9a6b, lightI: 1.9, sky: 0.45, fill: 0x6a5a8a, street: 0.35 },
  { hour: 20.5, zenith: 0x0d1530, edge: 0xd94f70, haze: 0x2a2438, light: 0xff6b8a, lightI: 1.1, sky: 0.34, fill: 0x4a3a6a, street: 0.8 },
  { hour: 22.0, zenith: 0x070b1e, edge: 0x1a2340, haze: 0x141428, light: 0x8a9aff, lightI: 0.5, sky: 0.26, fill: 0x30305a, street: 1.0 },
  { hour: 24.0, zenith: 0x070b1e, edge: 0x1a2340, haze: 0x141428, light: 0x8a9aff, lightI: 0.5, sky: 0.26, fill: 0x30305a, street: 1.0 },
];

export const PAINT = {
  asphalt: 0x23232e,
  centreLine: 0xd8c86a,
  pavement: 0x3a3a48,
  dirt: 0x2c2c3a,
  beachSand: 0xc2a878,
  ocean: 0x0e4a6b,
  towers: [0x2e3440, 0x4a3b52, 0x37455c, 0x54423a, 0x3a2f4a, 0x2c4a44, 0x41364e],
  litPane: 0xffd27a,
  darkPane: 0x1a2233,
  glow: [0xff2d78, 0x00e5ff, 0xffe600, 0xff6b35, 0x7c5cff],
  motors: [0xc0392b, 0x2980b9, 0xf39c12, 0x16a085, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0x27ae60, 0xe74c3c, 0x3498db],
};

export const ARSENAL = {
  fists: { label: 'Fists', slot: 1, style: 'melee', hurt: 12, pace: 2.4, reach: 2.4, clip: Infinity, hold: true },
  bat: { label: 'Bat', slot: 2, style: 'melee', hurt: 26, pace: 1.7, reach: 2.9, clip: Infinity, hold: true },
  pistol: { label: 'Pistol', slot: 3, style: 'gun', hurt: 18, pace: 3.2, reach: 90, clip: 12, wobble: 0.018, jolt: 0.011, hold: false },
  smg: { label: 'SMG', slot: 4, style: 'gun', hurt: 11, pace: 9.5, reach: 70, clip: 30, wobble: 0.055, jolt: 0.006, hold: true },
  shotgun: { label: 'Shotgun', slot: 5, style: 'gun', hurt: 9, shot: 6, pace: 1.15, reach: 42, clip: 6, wobble: 0.11, jolt: 0.05, hold: false },
  rifle: { label: 'Rifle', slot: 6, style: 'gun', hurt: 34, pace: 5.2, reach: 140, clip: 24, wobble: 0.012, jolt: 0.02, hold: true },
};

export const ARSENAL_ORDER = ['fists', 'bat', 'pistol', 'smg', 'shotgun', 'rifle'];

export const MOTORS = {
  sedan: { label: 'Marlin Sedan', fast: 38, pull: 13, hold: 1.0, long: 4.4, wide: 1.9, tall: 1.45 },
  taxi: { label: 'Bay Cab', fast: 36, pull: 12, hold: 1.0, long: 4.4, wide: 1.9, tall: 1.45 },
  pickup: { label: 'Rancho Pickup', fast: 33, pull: 11, hold: 0.95, long: 4.9, wide: 2.0, tall: 1.7 },
  van: { label: 'Courier Van', fast: 30, pull: 9.5, hold: 0.9, long: 5.0, wide: 2.0, tall: 2.1 },
  comet: { label: 'Comet GT', fast: 55, pull: 19, hold: 1.12, long: 4.2, wide: 1.9, tall: 1.25 },
  cop: { label: 'SBPD Cruiser', fast: 48, pull: 16, hold: 1.05, long: 4.5, wide: 1.9, tall: 1.45 },
};

export const TITLES = [
  { rep: 0, label: 'HUSTLER' },
  { rep: 500, label: 'WHEELMAN' },
  { rep: 1500, label: 'STREET BOSS' },
  { rep: 3000, label: 'KING OF SOLARA' },
];

export function titleForRep(rep) {
  let found = TITLES[0];
  for (const cand of TITLES) if (rep >= cand.rep) found = cand;
  return found.label;
}

/** Named districts for the HUD readout, in x/z metres. */
export const ZONES = [
  { label: 'Marina', x0: -320, z0: -320, x1: -160, z1: 320 },
  { label: 'Old Town', x0: -160, z0: -320, x1: 40, z1: -40 },
  { label: 'Downtown', x0: 40, z0: -320, x1: 240, z1: 40 },
  { label: 'The Hills', x0: 240, z0: -320, x1: 320, z1: 40 },
  { label: 'Little Havana', x0: -160, z0: -40, x1: 40, z1: 320 },
  { label: 'Beachfront', x0: 40, z0: 40, x1: 320, z1: 320 },
];

export function zoneAt(x, z) {
  for (const zone of ZONES) {
    if (x >= zone.x0 && x < zone.x1 && z >= zone.z0 && z < zone.z1) return zone.label;
  }
  return 'Solara Bay';
}
