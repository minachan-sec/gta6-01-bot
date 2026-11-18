// The town's ambient population: traffic motors that follow the street
// grid and stop at red lights, and walkers who stroll the curbs and scatter
// when a gun goes off or a car bears down on them. Neither knows about
// jobs; both make the town feel alive.
import { TUNE, MOTORS, PAINT } from './config.js';
import { STREETS, pickStreetSpot, pickCurbSpot, isSolid, pushOut } from './city.js';
import { spawnVehicle, steerVehicle, refreshVehicleMesh } from './vehicles.js';

const SIGNAL_CYCLE = 9; // seconds of green per axis

/** 0 = north-south green, 1 = east-west green, from the clock. */
export function signalPhase(clock) {
  return Math.floor(clock / SIGNAL_CYCLE) % 2;
}

const SHIRT_TONES = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c];
const PANTS_TONES = [0x2c3e50, 0x34495e, 0x1a1a1a, 0x5d4037];
const SKIN_TONES = [0xe8b98a, 0xc68642, 0x8d5524, 0xf1c27d];

export function seedPopulation(dice, town, view) {
  const flow = [];
  const walkers = [];
  const kinds = ['sedan', 'sedan', 'taxi', 'pickup', 'van', 'sedan', 'comet'];
  for (let i = 0; i < TUNE.crowd.motors; i += 1) {
    const p = pickStreetSpot(dice);
    const kind = dice.choose(kinds);
    const car = spawnVehicle(kind, p.x, p.z, p.vertical ? 0 : Math.PI / 2, dice.choose(PAINT.motors));
    car.driver = 'flow';
    car.speed = dice.between(8, 14);
    car.route = planRoute(dice, p);
    car.mesh = view.buildVehicleMesh(kind, car.tint);
    view.scene.add(car.mesh);
    flow.push(car);
  }
  for (let i = 0; i < TUNE.crowd.walkers; i += 1) {
    const p = pickCurbSpot(dice);
    const walker = {
      x: p.x, z: p.z,
      facing: dice.between(0, Math.PI * 2),
      speed: 0,
      target: null,
      state: 'walk',
      panic: 0,
      r: 0.55,
      walkPhase: dice.between(0, Math.PI * 2),
      mesh: null,
      cop: false,
    };
    walker.mesh = view.buildPersonMesh(dice.choose(SHIRT_TONES), dice.choose(PANTS_TONES), dice.choose(SKIN_TONES));
    view.scene.add(walker.mesh);
    walkers.push(walker);
  }
  return { flow, walkers };
}

/** A route is a list of waypoints along streets; the motor follows them in order. */
function planRoute(dice, from) {
  const points = [];
  let x = from.x;
  let z = from.z;
  let vertical = from.vertical;
  for (let i = 0; i < 4; i += 1) {
    if (vertical) {
      z = dice.choose(STREETS);
      points.push({ x, z });
      x = dice.choose(STREETS);
      points.push({ x, z });
      vertical = false;
    } else {
      x = dice.choose(STREETS);
      points.push({ x, z });
      z = dice.choose(STREETS);
      points.push({ x, z });
      vertical = true;
    }
  }
  return points;
}

function turnDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function steerToward(car, tx, tz, dt, town, others, clock) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 6) return true;
  const want = Math.atan2(dx, dz);
  const wheel = Math.max(-1, Math.min(1, turnDiff(want, car.facing) * 2.2));
  let gas = 0.55;
  // Stop at a red light when approaching a junction on a red axis.
  const vertical = Math.abs(Math.cos(car.facing)) > 0.7;
  let jx = 0;
  let jz = 0;
  let nearestCross = Infinity;
  for (const rx of STREETS) {
    for (const rz of STREETS) {
      const d = Math.hypot(car.x - rx, car.z - rz);
      if (d < nearestCross) {
        nearestCross = d;
        jx = rx;
        jz = rz;
      }
    }
  }
  const toJx = jx - car.x;
  const toJz = jz - car.z;
  const aheadDot = (toJx * Math.sin(car.facing) + toJz * Math.cos(car.facing)) / (nearestCross || 1);
  const redForMe = (vertical && signalPhase(clock) === 1) || (!vertical && signalPhase(clock) === 0);
  if (redForMe && aheadDot > 0.5 && nearestCross < 30 && nearestCross > 11) {
    gas = car.speed > 3 ? -1 : 0;
  }
  steerVehicle(car, gas, wheel, dt, town, others);
  return dist < 7;
}

export function stepFlow(W, dt) {
  for (const car of W.flow) {
    if (car.dead) continue;
    // Follow the motor ahead: match its speed, stop only when it is stopped
    // and close. A queue flows instead of freezing bumper to bumper.
    let cap = Infinity;
    for (const other of W.motors) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * Math.sin(car.facing) + dz * Math.cos(car.facing);
      const side = Math.abs(dx * Math.cos(car.facing) - dz * Math.sin(car.facing));
      if (ahead > 0 && ahead < 18 && side < 4) {
        cap = Math.min(cap, other.speed + 2);
        if (ahead < 8 && other.speed < 2) cap = 0;
      }
    }
    const target = car.route && car.route[0];
    if (!target) {
      car.route = planRoute(W.dice, { x: car.x, z: car.z, vertical: Math.abs(Math.cos(car.facing)) > 0.7 });
      continue;
    }
    if (steerToward(car, target.x, target.z, dt, W.town, W.motors, W.clock)) {
      car.route.shift();
      if (car.route.length === 0) car.route = planRoute(W.dice, { x: car.x, z: car.z, vertical: Math.abs(Math.cos(car.facing)) > 0.7 });
    }
    if (car.speed > cap) car.speed = Math.max(cap, car.speed - 40 * dt);
    refreshVehicleMesh(car, dt);
    // Wandered far from the action: respawn on a street near the hero.
    if (Math.hypot(car.x - W.hero.x, car.z - W.hero.z) > TUNE.crowd.vanishDist) {
      const p = pickStreetSpot(W.dice);
      car.x = p.x;
      car.z = p.z;
      car.facing = p.vertical ? 0 : Math.PI / 2;
      car.speed = 10;
      car.route = planRoute(W.dice, p);
    }
  }
}

export function refreshWalkerMesh(walker, dt) {
  const m = walker.mesh;
  if (!m) return;
  m.position.set(walker.x, 0, walker.z);
  m.rotation.y = walker.facing;
  const u = m.userData;
  if (u.legL && walker.speed > 0.5) {
    walker.walkPhase += dt * walker.speed * 1.6;
    const s = Math.sin(walker.walkPhase) * 0.55;
    u.legL.rotation.x = s;
    u.legR.rotation.x = -s;
    u.armL.rotation.x = -s * 0.7;
    u.armR.rotation.x = s * 0.7;
  } else if (u.legL) {
    u.legL.rotation.x *= 0.8;
    u.legR.rotation.x *= 0.8;
    u.armL.rotation.x *= 0.8;
    u.armR.rotation.x *= 0.8;
  }
  m.visible = walker.state !== 'down';
}

export function stepWalkers(W, dt) {
  for (const walker of W.walkers) {
    if (walker.state === 'down' || walker.cop) continue; // cops are driven by police.js
    if (walker.panic > 0) {
      walker.panic -= dt;
      walker.facing = Math.atan2(walker.x - W.hero.x, walker.z - W.hero.z);
      walker.speed = 6.5;
    } else if (walker.state === 'walk') {
      walker.speed = 1.6;
      if (!walker.target || Math.hypot(walker.target.x - walker.x, walker.target.z - walker.z) < 3) {
        walker.target = pickCurbSpot(W.dice);
      }
      const want = Math.atan2(walker.target.x - walker.x, walker.target.z - walker.z);
      walker.facing += Math.max(-3 * dt, Math.min(3 * dt, turnDiff(want, walker.facing)));
    }
    const nx = walker.x + Math.sin(walker.facing) * walker.speed * dt;
    const nz = walker.z + Math.cos(walker.facing) * walker.speed * dt;
    if (!isSolid(W.town, nx, nz, walker.r)) {
      walker.x = nx;
      walker.z = nz;
    } else {
      walker.facing += Math.PI / 2;
      walker.target = null;
    }
    pushOut(W.town, walker);
    // Too far from the action: quietly relocate near the hero.
    if (Math.hypot(walker.x - W.hero.x, walker.z - W.hero.z) > 260) {
      const near = pickCurbSpot(W.dice);
      walker.x = Math.max(-300, Math.min(300, W.hero.x + near.x * 0.3));
      walker.z = Math.max(-300, Math.min(300, W.hero.z + near.z * 0.3));
    }
    refreshWalkerMesh(walker, dt);
  }
}

/** Every walker who can hear the shot runs from it. */
export function panicWalkers(W, x, z, radius) {
  for (const walker of W.walkers) {
    if (walker.cop || walker.state === 'down') continue;
    if (Math.hypot(walker.x - x, walker.z - z) < radius) walker.panic = 3 + W.dice.between(0, 2);
  }
}
