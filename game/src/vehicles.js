// Cars: what they are, how they drive, and how they crash. One physics model
// serves the player, traffic and the police — arcade handling with a little
// drift, so a car feels weighty without needing a real tyre model.
import { CAR_TYPES } from './config.js';
import { isBlocked, resolveCollision } from './city.js';

let nextId = 1;

export function createCar(type, x, y, angle, color) {
  const def = CAR_TYPES[type];
  return {
    id: nextId,
    type,
    name: def.name,
    x, y,
    angle,
    speed: 0,
    steer: 0,
    length: def.length,
    width: def.width,
    r: Math.max(def.length, def.width) * 0.42,
    color: color || def.colors[0],
    driver: null, // 'player' | 'traffic' | 'police' | 'parked'
    health: 100,
    smoke: 0,
    skid: 0,
    brakeLight: false,
    siren: false,
    dead: false,
    honk: 0,
  };
}

/** Arcade car physics: throttle, steering that bites harder at low speed, drift. */
export function driveCar(car, throttle, steerInput, dt, city, others) {
  const def = CAR_TYPES[car.type];
  const forward = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const speedSign = car.speed >= 0 ? 1 : -1;

  if (throttle > 0) car.speed += def.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 5) car.speed -= def.accel * 1.6 * dt; // brake
    else car.speed -= def.accel * 0.55 * dt; // reverse
  } else {
    car.speed -= car.speed * 1.4 * dt; // rolling drag
  }
  if (car.speed > def.topSpeed) car.speed = def.topSpeed;
  if (car.speed < -def.topSpeed * 0.45) car.speed = -def.topSpeed * 0.45;
  if (Math.abs(car.speed) < 2 && throttle === 0) car.speed = 0;

  const steerAuthority = Math.min(1, Math.abs(car.speed) / 120);
  car.steer += (steerInput * def.turn * steerAuthority * speedSign - car.steer) * Math.min(1, dt * 10);
  car.angle += car.steer * dt * (Math.abs(car.speed) > 1 ? 1 : 0);
  car.brakeLight = throttle < 0 && car.speed > 5;

  const nx = car.x + forward.x * car.speed * dt;
  const ny = car.y + forward.y * car.speed * dt;
  const wasBlocked = isBlocked(city, nx, ny, car.r * 0.72);
  if (wasBlocked) {
    // Slide along the wall instead of stopping dead: try each axis alone.
    if (!isBlocked(city, nx, car.y, car.r * 0.72)) {
      car.x = nx;
    } else if (!isBlocked(city, car.x, ny, car.r * 0.72)) {
      car.y = ny;
    } else {
      car.speed *= -0.25; // bounce off
      return true; // crashed
    }
  } else {
    car.x = nx;
    car.y = ny;
  }

  // Soft push against other cars (circle vs circle). The faster car shoves
  // the slower one out of the way, so a queue can be pushed through instead
  // of freezing both cars in place.
  for (const other of others) {
    if (other === car || other.dead) continue;
    const dx = car.x - other.x;
    const dy = car.y - other.y;
    const min = car.r * 0.8 + other.r * 0.8;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0.01 && d2 < min * min) {
      const d = Math.sqrt(d2);
      const overlap = min - d;
      const shove = Math.abs(car.speed) > Math.abs(other.speed) ? 0.7 : 0.3;
      car.x += (dx / d) * overlap * (1 - shove);
      car.y += (dy / d) * overlap * (1 - shove);
      other.x -= (dx / d) * overlap * shove;
      other.y -= (dy / d) * overlap * shove;
      const exchange = car.speed * 0.55;
      car.speed = other.speed * 0.35 + car.speed * 0.45;
      other.speed = exchange;
      if (Math.abs(car.speed) > 120) return true;
    }
  }
  return false;
}

/** A parked car's door side: where the player stands to get in. */
export function nearestCar(cars, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** The car E should enter: the mission's marked car first, then a parked
 * car, then a traffic car — so a passing cab never steals the mission's
 * Comet out from under the player. */
export function nearestEnterableCar(cars, markerCar, x, y, maxDist) {
  if (markerCar && !markerCar.dead && Math.hypot(markerCar.x - x, markerCar.y - y) < maxDist) return markerCar;
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead || car.driver === 'traffic') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (best) return best;
  return nearestCar(cars, x, y, maxDist);
}

export { resolveCollision };
