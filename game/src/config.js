// Solara Bay: Neon Tide — tuning, palette and world constants (round 2, 3D).
// One unit is one metre. The city is a road grid with a beach on the south edge.
// Dusk-first palette: the whole game is graded sunset -> night ("neon tide").

export const CFG = {
  world: {
    size: 640, // playable square, -320..320 on x and z
    roadSpacing: 80,
    roadWidth: 16,
    sidewalk: 3,
    beachZ: 296, // z beyond this is sand, then sea
    seaZ: 332,
  },
  player: {
    walkSpeed: 5.4,
    sprintSpeed: 8.8,
    accel: 42,
    radius: 0.55,
    maxHealth: 100,
    maxArmor: 100,
    maxStamina: 100,
    staminaDrain: 16,
    staminaRegen: 14,
    punchRange: 2.4,
    enterCarRange: 4.4,
  },
  camera: {
    footDist: 7.5,
    footHeight: 3.1,
    carDist: 10.5,
    carHeight: 4.4,
    fov: 62,
    fovNitro: 74,
    pitchMin: -0.12,
    pitchMax: 0.85,
  },
  driving: {
    nitroBoost: 1.32,
    nitroDrain: 26, // per second, 0..100 tank
    nitroRegen: 9,
    driftGrip: 0.42, // lateral grip kept while handbraking
    nearMissDist: 3.6,
    nearMissMinSpeed: 18,
    collisionDamage: 0.5, // car health lost per m/s of impact over threshold
    collisionSpeedThreshold: 9,
  },
  police: {
    maxCopCars: 6,
    footCops: 2,
    heliStars: 3,
    decayDelay: 6, // seconds with no cop near before stars drop
    decayInterval: 4,
    bustRange: 3.2,
    bustTime: 2.0,
    sightRange: 70,
  },
  traffic: { cars: 14, peds: 22, despawnDist: 230, spawnDist: 170 },
  time: {
    startHour: 19.0, // 19:00 Friday, golden dusk
    minutesPerSecond: 0.4, // a full day in 60 real minutes
    dayNames: ['FRI', 'SAT', 'SUN', 'MON', 'TUE', 'WED', 'THU'],
  },
  saveKey: 'solara-bay-neon-tide-save-v1',
};

// Dusk -> night lighting presets, keyed by game hour. Render lerps between them.
export const SKY_PRESETS = [
  { hour: 17.0, top: 0x2b4a7a, horizon: 0xffb36b, fog: 0x8a6a72, sun: 0xffd9a0, sunI: 2.4, hemi: 0.55, ambient: 0x8a7a9a, lamp: 0.0 },
  { hour: 19.0, top: 0x1b2a4a, horizon: 0xff7a5c, fog: 0x54405a, sun: 0xff9a6b, sunI: 1.9, hemi: 0.45, ambient: 0x6a5a8a, lamp: 0.35 },
  { hour: 20.5, top: 0x0d1530, horizon: 0xd94f70, fog: 0x2a2438, sun: 0xff6b8a, sunI: 1.1, hemi: 0.34, ambient: 0x4a3a6a, lamp: 0.8 },
  { hour: 22.0, top: 0x070b1e, horizon: 0x1a2340, fog: 0x141428, sun: 0x8a9aff, sunI: 0.5, hemi: 0.26, ambient: 0x30305a, lamp: 1.0 },
  { hour: 24.0, top: 0x070b1e, horizon: 0x1a2340, fog: 0x141428, sun: 0x8a9aff, sunI: 0.5, hemi: 0.26, ambient: 0x30305a, lamp: 1.0 },
];

export const PALETTE = {
  road: 0x23232e,
  roadLine: 0xd8c86a,
  sidewalk: 0x3a3a48,
  ground: 0x2c2c3a,
  sand: 0xc2a878,
  sea: 0x0e4a6b,
  building: [0x2e3440, 0x4a3b52, 0x37455c, 0x54423a, 0x3a2f4a, 0x2c4a44, 0x41364e],
  windowLit: 0xffd27a,
  windowDark: 0x1a2233,
  neon: [0xff2d78, 0x00e5ff, 0xffe600, 0xff6b35, 0x7c5cff],
  carColors: [0xc0392b, 0x2980b9, 0xf39c12, 0x16a085, 0x8e44ad, 0xecf0f1, 0x2c3e50, 0x27ae60, 0xe74c3c, 0x3498db],
};

export const WEAPONS = {
  fists: { name: 'Fists', slot: 1, kind: 'melee', damage: 12, rate: 2.4, range: 2.4, mag: Infinity, auto: true },
  bat: { name: 'Bat', slot: 2, kind: 'melee', damage: 26, rate: 1.7, range: 2.9, mag: Infinity, auto: true },
  pistol: { name: 'Pistol', slot: 3, kind: 'gun', damage: 18, rate: 3.2, range: 90, mag: 12, spread: 0.018, kick: 0.011, auto: false },
  smg: { name: 'SMG', slot: 4, kind: 'gun', damage: 11, rate: 9.5, range: 70, mag: 30, spread: 0.055, kick: 0.006, auto: true },
  shotgun: { name: 'Shotgun', slot: 5, kind: 'gun', damage: 9, pellets: 6, rate: 1.15, range: 42, mag: 6, spread: 0.11, kick: 0.05, auto: false },
  rifle: { name: 'Rifle', slot: 6, kind: 'gun', damage: 34, rate: 5.2, range: 140, mag: 24, spread: 0.012, kick: 0.02, auto: true },
};

export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'smg', 'shotgun', 'rifle'];

export const CAR_TYPES = {
  sedan: { name: 'Marlin Sedan', top: 38, accel: 13, grip: 1.0, len: 4.4, wid: 1.9, hgt: 1.45 },
  taxi: { name: 'Bay Cab', top: 36, accel: 12, grip: 1.0, len: 4.4, wid: 1.9, hgt: 1.45 },
  pickup: { name: 'Rancho Pickup', top: 33, accel: 11, grip: 0.95, len: 4.9, wid: 2.0, hgt: 1.7 },
  van: { name: 'Courier Van', top: 30, accel: 9.5, grip: 0.9, len: 5.0, wid: 2.0, hgt: 2.1 },
  comet: { name: 'Comet GT', top: 55, accel: 19, grip: 1.12, len: 4.2, wid: 1.9, hgt: 1.25 },
  cop: { name: 'SBPD Cruiser', top: 48, accel: 16, grip: 1.05, len: 4.5, wid: 1.9, hgt: 1.45 },
};

export const RANKS = [
  { rep: 0, name: 'HUSTLER' },
  { rep: 500, name: 'WHEELMAN' },
  { rep: 1500, name: 'STREET BOSS' },
  { rep: 3000, name: 'KING OF SOLARA' },
];

export function rankFor(rep) {
  let r = RANKS[0];
  for (const cand of RANKS) if (rep >= cand.rep) r = cand;
  return r.name;
}

/** Districts for the HUD readout, in x/z metres. */
export const DISTRICTS = [
  { name: 'Marina', x0: -320, z0: -320, x1: -160, z1: 320 },
  { name: 'Old Town', x0: -160, z0: -320, x1: 40, z1: -40 },
  { name: 'Downtown', x0: 40, z0: -320, x1: 240, z1: 40 },
  { name: 'The Hills', x0: 240, z0: -320, x1: 320, z1: 40 },
  { name: 'Little Havana', x0: -160, z0: -40, x1: 40, z1: 320 },
  { name: 'Beachfront', x0: 40, z0: 40, x1: 320, z1: 320 },
];

export function districtAt(x, z) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && z >= d.z0 && z < d.z1) return d.name;
  }
  return 'Solara Bay';
}
