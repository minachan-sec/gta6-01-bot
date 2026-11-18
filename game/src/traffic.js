// The city's ambient population: traffic cars that follow the road grid and
// stop at red lights, and pedestrians who stroll the sidewalks and scatter
// when a gun goes off or a car bears down on them. Neither knows about
// missions; both make the city feel alive.
import { ROADS_X, ROADS_Y, ROAD_W, LANE, PED, TRAFFIC_COUNT, CAR_TYPES } from './config.js';
import { randomRoadPoint, randomSidewalkPoint, isBlocked } from './city.js';
import { createCar, driveCar } from './vehicles.js';

const LIGHT_CYCLE = 9; // seconds of green per axis

/** 0 = north-south green, 1 = east-west green, from the clock. */
export function lightPhase(time) {
  return Math.floor(time / LIGHT_CYCLE) % 2;
}

export function createPopulation(rng, city) {
  const traffic = [];
  const peds = [];
  const types = ['sedan', 'sedan', 'taxi', 'pickup', 'van', 'sedan', 'comet'];
  for (let i = 0; i < TRAFFIC_COUNT; i += 1) {
    const p = randomRoadPoint(rng);
    const type = rng.pick(types);
    const car = createCar(type, p.x, p.y, p.vertical ? Math.PI / 2 : 0, rng.pick(CAR_TYPES[type].colors));
    car.driver = 'traffic';
    car.speed = rng.range(90, 170);
    car.route = pickRoute(rng, p);
    traffic.push(car);
  }
  for (let i = 0; i < PED.count; i += 1) {
    const p = randomSidewalkPoint(rng);
    peds.push({
      x: p.x, y: p.y,
      angle: rng.range(0, Math.PI * 2),
      speed: 0,
      target: null,
      state: 'walk',
      panic: 0,
      color: rng.pick(['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1', '#1abc9c']),
      shirt: rng.pick(['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#ecf0f1']),
      walkPhase: rng.range(0, Math.PI * 2),
      r: PED.radius,
    });
  }
  return { traffic, peds };
}

/** A route is a list of waypoints along roads; the car follows them in order. */
function pickRoute(rng, from) {
  const points = [];
  let x = from.x;
  let y = from.y;
  let vertical = from.vertical;
  for (let i = 0; i < 4; i += 1) {
    if (vertical) {
      y = rng.pick(ROADS_Y);
      points.push({ x, y });
      x = rng.pick(ROADS_X);
      points.push({ x, y });
      vertical = false;
    } else {
      x = rng.pick(ROADS_X);
      points.push({ x, y });
      y = rng.pick(ROADS_Y);
      points.push({ x, y });
      vertical = true;
    }
  }
  return points;
}

function driveTo(car, tx, ty, dt, city, others, time) {
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 26) return true;
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.2));
  // Stop at a red light when approaching an intersection on a red axis:
  // brake hard, then hold at the stop line — never creep into the crossing.
  let throttle = 0.55;
  const vertical = Math.abs(Math.sin(car.angle)) > 0.7;
  let jx = 0;
  let jy = 0;
  let nearestJunction = Infinity;
  for (const rx of ROADS_X) {
    for (const ry of ROADS_Y) {
      const d = Math.hypot(car.x - rx, car.y - ry);
      if (d < nearestJunction) {
        nearestJunction = d;
        jx = rx;
        jy = ry;
      }
    }
  }
  const toJunctionX = jx - car.x;
  const toJunctionY = jy - car.y;
  const heading = (toJunctionX * Math.cos(car.angle) + toJunctionY * Math.sin(car.angle)) / (nearestJunction || 1);
  const redForMe = (vertical && lightPhase(time) === 1) || (!vertical && lightPhase(time) === 0);
  if (redForMe && heading > 0.5 && nearestJunction < 120 && nearestJunction > 45) {
    throttle = car.speed > 30 ? -1 : 0;
  }
  driveCar(car, throttle, steer, dt, city, others);
  return dist < 30;
}

export function updateTraffic(G, dt) {
  const { traffic } = G;
  for (const car of traffic) {
    if (car.dead) continue;
    // Follow the car ahead: match its speed, stop only when it is stopped
    // and close. A queue flows instead of freezing bumper to bumper.
    let followCap = Infinity;
    for (const other of G.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < 80 && side < 28) {
        followCap = Math.min(followCap, other.speed + 30);
        if (ahead < 42 && other.speed < 25) followCap = 0;
      }
    }
    const target = car.route && car.route[0];
    if (!target) {
      // Cars staged without a route (screenshots, spawns) get one here.
      car.route = pickRoute(G.rng, { x: car.x, y: car.y, vertical: Math.abs(Math.sin(car.angle)) > 0.7 });
      continue;
    }
    if (driveTo(car, target.x, target.y, dt, G.city, G.cars, G.time)) {
      car.route.shift();
      if (car.route.length === 0) car.route = pickRoute(G.rng, { x: car.x, y: car.y, vertical: Math.abs(Math.sin(car.angle)) > 0.7 });
    }
    if (car.speed > followCap) car.speed = Math.max(followCap, car.speed - 500 * dt);
    // Wandered off the grid (pushed by a crash): respawn on a road far away.
    if (Math.hypot(car.x - G.player.x, car.y - G.player.y) > 1400) {
      const p = randomRoadPoint(G.rng);
      car.x = p.x;
      car.y = p.y;
      car.angle = p.vertical ? Math.PI / 2 : 0;
      car.speed = 120;
      car.route = pickRoute(G.rng, p);
    }
  }
}

export function updatePeds(G, dt) {
  for (const ped of G.peds) {
    ped.walkPhase += dt * 8;
    // Panic: a gunshot nearby or a fast car heading at them.
    if (ped.panic > 0) {
      ped.panic -= dt;
      const away = Math.atan2(ped.y - G.player.y, ped.x - G.player.x);
      ped.angle = away;
      ped.speed = PED.panicSpeed;
    } else if (ped.state === 'walk') {
      ped.speed = PED.walkSpeed;
      if (!ped.target || Math.hypot(ped.target.x - ped.x, ped.target.y - ped.y) < 18) {
        ped.target = randomSidewalkPoint(G.rng);
      }
      const want = Math.atan2(ped.target.y - ped.y, ped.target.x - ped.x);
      let diff = want - ped.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      ped.angle += Math.max(-3 * dt, Math.min(3 * dt, diff));
    }
    const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
    const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
    if (!isBlocked(G.city, nx, ny, ped.r)) {
      ped.x = nx;
      ped.y = ny;
    } else {
      ped.angle += Math.PI / 2;
      ped.target = null;
    }
    // Too far from the action: quietly relocate near the player.
    if (Math.hypot(ped.x - G.player.x, ped.y - G.player.y) > 1200) {
      const near = randomSidewalkPoint(G.rng);
      ped.x = Math.max(90, Math.min(1950, G.player.x + (near.x - 1024)));
      ped.y = Math.max(90, Math.min(1470, G.player.y + (near.y - 768)));
    }
  }
}

/** Every pedestrian who can hear the shot runs from it. */
export function scarePeds(G, x, y, radius) {
  for (const ped of G.peds) {
    if (Math.hypot(ped.x - x, ped.y - y) < radius) ped.panic = 3 + G.rng.range(0, 2);
  }
}
