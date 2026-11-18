// The heat system: stars for crimes, cruisers and beat cops who respond
// to them, a chopper at three stars, and the busted/wasted endings. Cops
// chase hard while they can see the hero and lose interest when the heat
// dies down. The chopper hovers LOW and AHEAD of the hero (round 3 fix) so
// it actually shows in the driving camera — round 2 flew it at 34 m
// overhead, where the lens never caught it.
import { TUNE } from './config.js';
import { pickStreetSpot, pickCurbSpot } from './city.js';
import { spawnVehicle, steerVehicle, refreshVehicleMesh, harmVehicle } from './vehicles.js';
import { refreshWalkerMesh } from './traffic.js';

const CHOPPER_HEIGHT = 14;
const CHOPPER_AHEAD = 40;

export function newHeat() {
  return {
    stars: 0,
    since: 0,
    coolTimer: 0,
    grabTimer: 0,
    cruisers: [], // police motors, in W.motors with driver 'police'
    beat: [],
    chopper: null,
  };
}

export function raiseHeat(W, stars, why) {
  const h = W.heat;
  h.stars = Math.min(5, h.stars + stars);
  h.since = 0;
  h.coolTimer = 0;
  if (why) {
    W.note = why;
    W.noteT = 3.5;
  }
  matchForce(W);
}

function cruisersFor(stars) {
  return [0, 1, 2, 3, 4, 5][stars] || 0;
}

function beatFor(stars) {
  return [0, 1, 2, 2, 2, 2][stars] || 0;
}

/** Keep the number of police on the street matched to the heat level. */
export function matchForce(W) {
  const h = W.heat;
  const wantMotors = cruisersFor(h.stars);
  const wantBeat = beatFor(h.stars);
  while (h.cruisers.length > wantMotors) {
    const car = h.cruisers.pop();
    car.dead = true;
    if (car.mesh) {
      W.view.scene.remove(car.mesh);
      car.mesh = null;
    }
    const i = W.motors.indexOf(car);
    if (i !== -1) W.motors.splice(i, 1);
  }
  while (h.beat.length > wantBeat) {
    const cop = h.beat.pop();
    const i = W.walkers.indexOf(cop);
    if (i !== -1) W.walkers.splice(i, 1);
    if (cop.mesh) {
      W.view.scene.remove(cop.mesh);
      cop.mesh = null;
    }
  }
  while (h.cruisers.length < wantMotors) {
    let p = pickStreetSpot(W.dice);
    let tries = 0;
    while (Math.hypot(p.x - W.hero.x, p.z - W.hero.z) < 90 && tries < 8) {
      p = pickStreetSpot(W.dice);
      tries += 1;
    }
    const car = spawnVehicle('cop', p.x, p.z, p.vertical ? 0 : Math.PI / 2, 0x1a1a2e);
    car.driver = 'police';
    car.siren = true;
    car.speed = 16;
    car.mesh = W.view.buildVehicleMesh('cop', 0x1a1a2e);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    W.view.scene.add(car.mesh);
    h.cruisers.push(car);
    W.motors.push(car);
  }
  while (h.beat.length < wantBeat) {
    const p = pickCurbSpot(W.dice);
    const mesh = W.view.buildPersonMesh(0x2c4a7a, 0x1a1a2e, 0xe8b98a, { cap: 0x1a1a2e, weapon: true });
    const cop = {
      x: p.x, z: p.z, facing: 0, speed: 0, target: null, state: 'cop',
      panic: 0, r: 0.55, walkPhase: 0, cop: true, mesh,
    };
    mesh.userData.hitRef = { kind: 'ped', ref: cop };
    W.view.scene.add(mesh);
    h.beat.push(cop);
    W.walkers.push(cop);
  }
  // Chopper at three stars and up — low and ahead, in the camera's view.
  if (h.stars >= TUNE.heat.chopperAt && !h.chopper) {
    const mesh = W.view.buildChopperMesh();
    const fx = Math.sin(W.hero.facing);
    const fz = Math.cos(W.hero.facing);
    mesh.position.set(W.hero.x + fx * CHOPPER_AHEAD, CHOPPER_HEIGHT, W.hero.z + fz * CHOPPER_AHEAD);
    W.view.scene.add(mesh);
    h.chopper = { mesh, x: mesh.position.x, z: mesh.position.z, y: CHOPPER_HEIGHT };
  } else if (h.stars < TUNE.heat.chopperAt && h.chopper) {
    W.view.scene.remove(h.chopper.mesh);
    h.chopper = null;
  }
}

function turnDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function chaseDrive(W, car, dt) {
  const hero = W.hero;
  const tx = hero.car ? hero.car.x : hero.x;
  const tz = hero.car ? hero.car.z : hero.z;
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  const wheel = Math.max(-1, Math.min(1, turnDiff(want, car.facing) * 2.4));
  let gas = 1;
  if (dist < 9) gas = 0.35;
  if (car.stuckFor > 0) {
    car.stuckFor -= dt;
    gas = -0.7;
  }
  const before = { x: car.x, z: car.z };
  const smashed = steerVehicle(car, gas, wheel, dt, W.town, W.motors);
  const moved = Math.hypot(car.x - before.x, car.z - before.z);
  if (moved < Math.abs(car.speed) * dt * 0.35 && Math.abs(car.speed) > 5) {
    car.stuckFor = 0.7;
  }
  if (smashed && W.sound) W.sound.crash();
  refreshVehicleMesh(car, dt);
  // Touching the hero's car hard damages it (a nudge, not a wrecking ball).
  if (hero.car && dist < car.r + hero.car.r * 0.9 && Math.abs(car.speed) > 8) {
    harmVehicle(W, hero.car, 1.2 * dt * 10);
  }
}

export function stepHeat(W, dt) {
  const h = W.heat;
  const hero = W.hero;
  h.since += dt;
  // Heat cools only while no cop can see the hero.
  const spotted = h.cruisers.some((c) => Math.hypot(c.x - hero.x, c.z - hero.z) < TUNE.heat.eyeRange) ||
    h.beat.some((c) => Math.hypot(c.x - hero.x, c.z - hero.z) < 45) ||
    !!h.chopper;
  if (h.stars > 0 && !spotted) {
    h.coolTimer += dt;
    if (h.coolTimer > TUNE.heat.coolDelay + TUNE.heat.coolStep) {
      h.coolTimer = TUNE.heat.coolDelay;
      h.stars -= 1;
      matchForce(W);
      if (h.stars === 0) {
        W.note = 'You lost the cops.';
        W.noteT = 3;
      }
    }
  } else {
    h.coolTimer = 0;
  }

  for (const car of h.cruisers) {
    if (car.dead) continue;
    chaseDrive(W, car, dt);
  }
  // Beat cops run at the hero on foot; they give up when the heat dies.
  for (const cop of h.beat) {
    const dist = Math.hypot(hero.x - cop.x, hero.z - cop.z);
    if (h.stars > 0 && !hero.car) {
      cop.facing = Math.atan2(hero.x - cop.x, hero.z - cop.z);
      cop.speed = 6.4;
      const nx = cop.x + Math.sin(cop.facing) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.facing) * cop.speed * dt;
      cop.x = nx;
      cop.z = nz;
      cop.walkPhase += dt * 10;
      if (dist < TUNE.heat.grabDist) {
        h.grabTimer += dt;
        W.note = 'The cops are grabbing you…';
        W.noteT = 1;
        if (h.grabTimer > TUNE.heat.grabTime) arrestPlayer(W);
      } else {
        h.grabTimer = Math.max(0, h.grabTimer - dt * 2);
      }
    } else {
      cop.speed = 1.6;
    }
    refreshWalkerMesh(cop, dt);
  }
  // A cruiser pinning the hero's car at low speed also busts them — but
  // only when the car is genuinely stopped (a car merely crawling in
  // traffic, or shoved against a wall for a second, is not pinned), and
  // the timer decays when the pin breaks so partial pins do not add up
  // forever across the whole chase.
  if (hero.car && h.stars > 0) {
    const pinned = h.cruisers.some((c) => !c.dead && Math.hypot(c.x - hero.car.x, c.z - hero.car.z) < 8 && Math.abs(hero.car.speed) < 2.5);
    if (pinned) {
      h.grabTimer += dt;
      W.note = 'Pinned by the police…';
      W.noteT = 1;
      if (h.grabTimer > TUNE.heat.grabTime * 1.5) arrestPlayer(W);
    } else {
      h.grabTimer = Math.max(0, h.grabTimer - dt * 2);
    }
  }
  // Chopper hovers low and ahead of the hero, rotor spinning, spotlight
  // sweeping — in the driving camera's frame, not overhead.
  if (h.chopper) {
    const ch = h.chopper;
    const face = hero.car ? hero.car.facing : hero.facing;
    const tx = hero.x + Math.sin(face) * CHOPPER_AHEAD;
    const tz = hero.z + Math.cos(face) * CHOPPER_AHEAD;
    ch.x += (tx - ch.x) * Math.min(1, dt * 3.0);
    ch.z += (tz - ch.z) * Math.min(1, dt * 3.0);
    ch.mesh.position.set(ch.x, CHOPPER_HEIGHT + Math.sin(W.clock * 0.7) * 1.2, ch.z);
    ch.mesh.rotation.y = Math.atan2(hero.x - ch.x, hero.z - ch.z);
    ch.mesh.userData.rotor.rotation.y += dt * 22;
  }
  if (W.sound) W.sound.siren(h.stars > 0, dt);
}

function sendToGarage(W) {
  const g = W.town.spots.garage;
  const hero = W.hero;
  hero.x = g.x + 24;
  hero.z = g.z + 18;
  hero.facing = Math.PI;
  hero.health = 100;
  hero.armor = 0;
  W.snapCam = true;
}

export function arrestPlayer(W) {
  const hero = W.hero;
  const fine = Math.min(hero.cash, 150);
  hero.cash -= fine;
  W.heat.stars = 0;
  W.heat.grabTimer = 0;
  matchForce(W);
  if (hero.car) {
    hero.car.driver = 'parked';
    hero.car = null;
  }
  sendToGarage(W);
  if (W.sound) W.sound.busted();
  W.jobs.fail('busted');
  W.screen = 'busted';
}

export function killPlayer(W) {
  const hero = W.hero;
  const lost = Math.min(hero.cash, 100);
  hero.cash -= lost;
  W.heat.stars = 0;
  matchForce(W);
  if (hero.car) {
    hero.car.driver = 'parked';
    hero.car = null;
  }
  sendToGarage(W);
  if (W.sound) W.sound.fail();
  W.jobs.fail('wasted');
  W.screen = 'wasted';
}
