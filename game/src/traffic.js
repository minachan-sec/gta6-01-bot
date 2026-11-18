// The city's ambient population: traffic cars that follow the road grid and
// stop at red lights, and pedestrians who stroll the sidewalks and scatter
// when a gun goes off or a car bears down on them. Neither knows about
// missions; both make the city feel alive.
import { CFG, CAR_TYPES, PALETTE } from './config.js';
import { ROADS, randomRoadPoint, randomSidewalkPoint, isBlocked, resolveCollision } from './city.js';
import { createCar, driveCar, syncCarMesh } from './vehicles.js';

const LIGHT_CYCLE = 9; // seconds of green per axis

/** 0 = north-south green, 1 = east-west green, from the clock. */
export function lightPhase(time) {
  return Math.floor(time / LIGHT_CYCLE) % 2;
}

const PED_SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf39c12, 0x9b59b6, 0xecf0f1, 0x1abc9c];
const PED_PANTS = [0x2c3e50, 0x34495e, 0x1a1a1a, 0x5d4037];
const PED_SKIN = [0xe8b98a, 0xc68642, 0x8d5524, 0xf1c27d];

export function createPopulation(rng, city, renderer) {
  const traffic = [];
  const peds = [];
  const types = ['sedan', 'sedan', 'taxi', 'pickup', 'van', 'sedan', 'comet'];
  for (let i = 0; i < CFG.traffic.cars; i += 1) {
    const p = randomRoadPoint(rng);
    const type = rng.pick(types);
    const car = createCar(type, p.x, p.z, p.vertical ? 0 : Math.PI / 2, rng.pick(PALETTE.carColors));
    car.driver = 'traffic';
    car.speed = rng.range(8, 14);
    car.route = pickRoute(rng, p);
    car.mesh = renderer.makeCarMesh(type, car.color);
    renderer.scene.add(car.mesh);
    traffic.push(car);
  }
  for (let i = 0; i < CFG.traffic.peds; i += 1) {
    const p = randomSidewalkPoint(rng);
    const ped = {
      x: p.x, z: p.z,
      heading: rng.range(0, Math.PI * 2),
      speed: 0,
      target: null,
      state: 'walk',
      panic: 0,
      r: 0.55,
      walkPhase: rng.range(0, Math.PI * 2),
      mesh: null,
      cop: false,
    };
    ped.mesh = renderer.makePersonMesh(rng.pick(PED_SHIRTS), rng.pick(PED_PANTS), rng.pick(PED_SKIN));
    renderer.scene.add(ped.mesh);
    peds.push(ped);
  }
  return { traffic, peds };
}

/** A route is a list of waypoints along roads; the car follows them in order. */
function pickRoute(rng, from) {
  const points = [];
  let x = from.x;
  let z = from.z;
  let vertical = from.vertical;
  for (let i = 0; i < 4; i += 1) {
    if (vertical) {
      z = rng.pick(ROADS);
      points.push({ x, z });
      x = rng.pick(ROADS);
      points.push({ x, z });
      vertical = false;
    } else {
      x = rng.pick(ROADS);
      points.push({ x, z });
      z = rng.pick(ROADS);
      points.push({ x, z });
      vertical = true;
    }
  }
  return points;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function driveTo(car, tx, tz, dt, city, others, time) {
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 6) return true;
  const want = Math.atan2(dx, dz);
  const steer = Math.max(-1, Math.min(1, angleDiff(want, car.heading) * 2.2));
  let throttle = 0.55;
  // Stop at a red light when approaching an intersection on a red axis.
  const vertical = Math.abs(Math.cos(car.heading)) > 0.7;
  let jx = 0;
  let jz = 0;
  let nearestJunction = Infinity;
  for (const rx of ROADS) {
    for (const rz of ROADS) {
      const d = Math.hypot(car.x - rx, car.z - rz);
      if (d < nearestJunction) {
        nearestJunction = d;
        jx = rx;
        jz = rz;
      }
    }
  }
  const toJx = jx - car.x;
  const toJz = jz - car.z;
  const headingDot = (toJx * Math.sin(car.heading) + toJz * Math.cos(car.heading)) / (nearestJunction || 1);
  const redForMe = (vertical && lightPhase(time) === 1) || (!vertical && lightPhase(time) === 0);
  if (redForMe && headingDot > 0.5 && nearestJunction < 30 && nearestJunction > 11) {
    throttle = car.speed > 3 ? -1 : 0;
  }
  driveCar(car, throttle, steer, dt, city, others);
  return dist < 7;
}

export function updateTraffic(G, dt) {
  for (const car of G.traffic) {
    if (car.dead) continue;
    // Follow the car ahead: match its speed, stop only when it is stopped
    // and close. A queue flows instead of freezing bumper to bumper.
    let followCap = Infinity;
    for (const other of G.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dz = other.z - car.z;
      const ahead = dx * Math.sin(car.heading) + dz * Math.cos(car.heading);
      const side = Math.abs(dx * Math.cos(car.heading) - dz * Math.sin(car.heading));
      if (ahead > 0 && ahead < 18 && side < 4) {
        followCap = Math.min(followCap, other.speed + 2);
        if (ahead < 8 && other.speed < 2) followCap = 0;
      }
    }
    const target = car.route && car.route[0];
    if (!target) {
      car.route = pickRoute(G.rng, { x: car.x, z: car.z, vertical: Math.abs(Math.cos(car.heading)) > 0.7 });
      continue;
    }
    if (driveTo(car, target.x, target.z, dt, G.city, G.cars, G.time)) {
      car.route.shift();
      if (car.route.length === 0) car.route = pickRoute(G.rng, { x: car.x, z: car.z, vertical: Math.abs(Math.cos(car.heading)) > 0.7 });
    }
    if (car.speed > followCap) car.speed = Math.max(followCap, car.speed - 40 * dt);
    syncCarMesh(car, dt);
    // Wandered far from the action: respawn on a road near the player.
    if (Math.hypot(car.x - G.player.x, car.z - G.player.z) > CFG.traffic.despawnDist) {
      const p = randomRoadPoint(G.rng);
      car.x = p.x;
      car.z = p.z;
      car.heading = p.vertical ? 0 : Math.PI / 2;
      car.speed = 10;
      car.route = pickRoute(G.rng, p);
    }
  }
}

export function syncPedMesh(ped, dt) {
  const m = ped.mesh;
  if (!m) return;
  m.position.set(ped.x, 0, ped.z);
  m.rotation.y = ped.heading;
  const u = m.userData;
  if (u.legL && ped.speed > 0.5) {
    ped.walkPhase += dt * ped.speed * 1.6;
    const s = Math.sin(ped.walkPhase) * 0.55;
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
  m.visible = ped.state !== 'down';
}

export function updatePeds(G, dt) {
  for (const ped of G.peds) {
    if (ped.state === 'down' || ped.cop) continue; // cops are driven by police.js
    if (ped.panic > 0) {
      ped.panic -= dt;
      ped.heading = Math.atan2(ped.x - G.player.x, ped.z - G.player.z);
      ped.speed = 6.5;
    } else if (ped.state === 'walk') {
      ped.speed = 1.6;
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.z - ped.z) < 3) {
        ped.target = randomSidewalkPoint(G.rng);
      }
      const want = Math.atan2(ped.target.x - ped.x, ped.target.z - ped.z);
      ped.heading += Math.max(-3 * dt, Math.min(3 * dt, angleDiff(want, ped.heading)));
    }
    const nx = ped.x + Math.sin(ped.heading) * ped.speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * ped.speed * dt;
    if (!isBlocked(G.city, nx, nz, ped.r)) {
      ped.x = nx;
      ped.z = nz;
    } else {
      ped.heading += Math.PI / 2;
      ped.target = null;
    }
    resolveCollision(G.city, ped);
    // Too far from the action: quietly relocate near the player.
    if (Math.hypot(ped.x - G.player.x, ped.z - G.player.z) > 260) {
      const near = randomSidewalkPoint(G.rng);
      ped.x = Math.max(-300, Math.min(300, G.player.x + (near.x - 0) * 0.3));
      ped.z = Math.max(-300, Math.min(300, G.player.z + (near.z - 0) * 0.3));
    }
    syncPedMesh(ped, dt);
  }
}

/** Every pedestrian who can hear the shot runs from it. */
export function scarePeds(G, x, z, radius) {
  for (const ped of G.peds) {
    if (ped.cop || ped.state === 'down') continue;
    if (Math.hypot(ped.x - x, ped.z - z) < radius) ped.panic = 3 + G.rng.range(0, 2);
  }
}
