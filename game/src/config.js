// Solara Bay: Neon Tide — every tuning number in one place.
// Nothing here is code the game cannot run without: change a number, change the feel.
export const CFG = {
  world: {
    roadGap: 80, // distance between parallel road centrelines
    roadHalf: 7, // half the width of the asphalt
    cityHalf: 360, // playable area runs -360..360 on both axes
    seaAt: 330, // the beach and the water start past this z
  },
  time: {
    startHour: 18.5, // the game opens at golden hour
    minutesPerSecond: 0.5, // in-game clock speed
  },
  player: {
    radius: 0.6,
    walkSpeed: 6,
    sprintSpeed: 10.5,
    staminaDrain: 22,
    staminaRegen: 16,
    healthRegen: 1.5, // per second while no heat
    enterCarRange: 4.5,
  },
  driving: {
    nearMissDist: 4.5,
    nearMissMinSpeed: 18,
    nearMissRep: 25,
    nearMissCash: 10,
    driftBonusPerPoint: 15,
    collisionSpeed: 12, // above this, a crash hurts the car
    collisionDamage: 1.6,
    smokeBelow: 40, // health under this: the engine smokes
  },
  camera: {
    driveDist: 11,
    driveHeight: 4.6,
    footDist: 7,
    footHeight: 3.2,
    pitchMin: -0.15,
    pitchMax: 0.9,
    lookSpeed: 0.0023,
  },
  police: {
    heliAtStars: 3,
    footCopsAtStars: 2,
    maxCopCars: 6,
    maxFootCops: 6,
    bustOnFootDist: 2.2,
    bustOnFootTime: 1.5,
    bustCarSpeed: 1.0, // the car must be (almost) fully stopped
    bustCarDist: 8,
    bustCarTime: 5.0, // a pinned car gets five seconds to break free
    loseSightDist: 85,
    loseSightTime: 10,
    starDecayTime: 8,
  },
  heli: {
    ahead: 42, // metres in front of the car, along its heading
    altitude: 14, // low enough to stay inside the driving camera's frame
    followRate: 3.2, // how fast it catches up, per second
    orbitRadius: 26, // when the player is on foot
    orbitHeight: 19,
  },
  combat: {
    meleeRange: 2.4,
    meleeArc: 1.1, // radians of half-angle
    enemySight: 42,
    enemyShootRange: 34,
    enemyAccuracy: 0.32, // chance a shot that would hit actually lands
  },
};

// Weapons, in the order the 1-6 keys select them.
export const WEAPON_ORDER = ['fists', 'bat', 'pistol', 'smg', 'shotgun', 'rifle'];
export const WEAPONS = {
  fists: { label: 'Fists', kind: 'melee', damage: 12, rate: 0.45, range: 2.4, mag: Infinity, auto: false },
  bat: { label: 'Bat', kind: 'melee', damage: 26, rate: 0.6, range: 2.8, mag: Infinity, auto: false },
  pistol: { label: 'Pistol', kind: 'gun', damage: 30, rate: 0.32, range: 60, mag: 12, reload: 1.2, auto: false, spread: 0.012 },
  smg: { label: 'SMG', kind: 'gun', damage: 14, rate: 0.09, range: 48, mag: 30, reload: 1.6, auto: true, spread: 0.03 },
  shotgun: { label: 'Shotgun', kind: 'gun', damage: 16, rate: 0.85, range: 26, mag: 6, reload: 2.0, auto: false, spread: 0.09, pellets: 6 },
  rifle: { label: 'Rifle', kind: 'gun', damage: 40, rate: 0.22, range: 90, mag: 24, reload: 1.8, auto: true, spread: 0.008 },
};

// Six vehicle types. topSpeed is m/s; the HUD converts to mph.
export const VEHICLES = {
  sedan: { label: 'Sedan', topSpeed: 34, accel: 14, grip: 2.6, health: 100, len: 4.4, wid: 2.0, colors: [0x8e44ad, 0x2c3e50, 0x16a085, 0xc0392b] },
  taxi: { label: 'Taxi', topSpeed: 36, accel: 15, grip: 2.7, health: 100, len: 4.4, wid: 2.0, colors: [0xf39c12] },
  van: { label: 'Van', topSpeed: 28, accel: 10, grip: 2.1, health: 140, len: 5.2, wid: 2.2, colors: [0xecf0f1, 0x7f8c8d] },
  pickup: { label: 'Pickup', topSpeed: 32, accel: 12, grip: 2.4, health: 120, len: 4.9, wid: 2.1, colors: [0x27ae60, 0x8b4513] },
  comet: { label: 'Comet GT', topSpeed: 48, accel: 22, grip: 3.4, health: 85, len: 4.2, wid: 1.9, colors: [0xe67e22, 0xe74c3c, 0x9b59b6] },
  classic: { label: 'Classic', topSpeed: 30, accel: 11, grip: 2.2, health: 110, len: 4.6, wid: 2.0, colors: [0x1abc9c, 0xf1c40f] },
};

// District names by region, for the HUD's location readout.
export function districtAt(x, z) {
  if (z > 200) return 'Beachfront';
  if (x < -200) return 'Little Havana';
  if (x > 240) return 'The Docks';
  if (z < -240) return 'The Hills';
  if (Math.abs(x) < 80 && Math.abs(z) < 80) return 'Downtown';
  if (x < 0) return 'West Solara';
  return 'East Solara';
}

export const PALETTE = {
  skyDay: 0x87b5d6,
  skyDusk: 0xe8835a,
  skyNight: 0x1a2340,
  sunDusk: 0xffb27a,
  ground: 0x2f3a2e,
  asphalt: 0x23272e,
  sidewalk: 0x6b6f75,
  sea: 0x1d6f8a,
};
