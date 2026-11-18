// Cars: what they are, how they drive, and how they crash. One physics model
// serves the player, traffic and the police — arcade handling with drift and
// nitro, so a car feels weighty without a real tyre model. Heading is radians;
// forward is (sin h, 0, cos h), matching the mesh (built facing +z).
import { CFG, CAR_TYPES } from './config.js';
import { isBlocked, resolveCollision } from './city.js';

let nextId = 1;

export function createCar(type, x, z, heading, color) {
  const def = CAR_TYPES[type];
  return {
    id: nextId++,
    type,
    name: def.name,
    x, z,
    heading,
    speed: 0, // m/s, forward positive
    velX: 0, velZ: 0, // world velocity (drift slides sideways)
    steer: 0,
    len: def.len,
    wid: def.wid,
    r: Math.max(def.len, def.wid) * 0.44,
    color: color ?? def.color ?? 0x888888,
    driver: null, // 'player' | 'traffic' | 'police' | 'parked'
    health: 100,
    smoke: 0,
    brakeLight: false,
    nitro: 100,
    nitroOn: false,
    drifting: false,
    driftScore: 0,
    siren: false,
    dead: false,
    mesh: null,
    stuckTimer: 0,
    honk: 0,
  };
}

/** Arcade car physics with a velocity vector, so handbrake drifts slide. */
export function driveCar(car, throttle, steerInput, dt, city, others, opts = {}) {
  const def = CAR_TYPES[car.type];
  const handbrake = !!opts.handbrake;
  const nitro = !!opts.nitro && car.nitro > 0 && throttle > 0;
  car.nitroOn = nitro;
  if (nitro) car.nitro = Math.max(0, car.nitro - CFG.driving.nitroDrain * dt);
  else car.nitro = Math.min(100, car.nitro + CFG.driving.nitroRegen * dt);

  const top = def.top * (nitro ? CFG.driving.nitroBoost : 1);
  if (throttle > 0) car.speed += def.accel * throttle * dt * (nitro ? 1.35 : 1);
  else if (throttle < 0) {
    if (car.speed > 4) car.speed -= def.accel * 1.7 * dt; // brake
    else car.speed -= def.accel * 0.55 * dt; // reverse
  } else {
    car.speed -= car.speed * 1.1 * dt; // rolling drag
  }
  if (handbrake) car.speed -= car.speed * 1.8 * dt;
  if (car.speed > top) car.speed = top;
  if (car.speed < -top * 0.45) car.speed = -top * 0.45;
  if (Math.abs(car.speed) < 0.4 && throttle === 0) car.speed = 0;

  const speedSign = car.speed >= 0 ? 1 : -1;
  const authority = Math.min(1, Math.abs(car.speed) / 8);
  const turnRate = 2.1 * def.grip * (1 - Math.min(0.55, Math.abs(car.speed) / top * 0.55));
  car.steer += (steerInput - car.steer) * Math.min(1, dt * 9);
  car.heading += car.steer * turnRate * authority * speedSign * dt * (Math.abs(car.speed) > 0.5 ? 1 : 0);
  car.brakeLight = throttle < 0 && car.speed > 4;

  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  // Velocity: forward speed plus a sideways slide that decays by grip.
  const fSpeed = car.velX * fx + car.velZ * fz;
  const sSpeed = car.velX * fz - car.velZ * fx;
  const grip = handbrake ? CFG.driving.driftGrip : def.grip;
  const newSSpeed = sSpeed * Math.max(0, 1 - grip * 7 * dt);
  car.drifting = handbrake && Math.abs(car.speed) > 10 && Math.abs(newSSpeed) > 2;
  if (car.drifting) car.driftScore += dt;
  const newFSpeed = car.speed;
  car.velX = fx * newFSpeed + fz * newSSpeed;
  car.velZ = fz * newFSpeed - fx * newSSpeed;

  const nx = car.x + car.velX * dt;
  const nz = car.z + car.velZ * dt;
  const impact = Math.abs(fSpeed);
  let crashed = false;
  if (isBlocked(city, nx, nz, car.r * 0.72)) {
    // Slide along the wall: try each axis alone.
    if (!isBlocked(city, nx, car.z, car.r * 0.72)) {
      car.x = nx;
      car.velZ *= 0.4;
    } else if (!isBlocked(city, car.x, nz, car.r * 0.72)) {
      car.z = nz;
      car.velX *= 0.4;
    } else {
      car.speed *= -0.22;
      car.velX *= -0.25;
      car.velZ *= -0.25;
      crashed = impact > CFG.driving.collisionSpeedThreshold;
    }
  } else {
    car.x = nx;
    car.z = nz;
  }
  resolveCollision(city, car);

  // Soft push against other cars (circle vs circle).
  for (const other of others) {
    if (other === car || other.dead) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const min = car.r * 0.8 + other.r * 0.8;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.01 && d2 < min * min) {
      const d = Math.sqrt(d2);
      const overlap = min - d;
      const shove = Math.abs(car.speed) > Math.abs(other.speed) ? 0.7 : 0.3;
      car.x += (dx / d) * overlap * (1 - shove);
      car.z += (dz / d) * overlap * (1 - shove);
      other.x -= (dx / d) * overlap * shove;
      other.z -= (dz / d) * overlap * shove;
      // Only trade speed when the cars are closing on each other. Cars
      // merely touching while separating keep their speed — otherwise a
      // stopped car resting against the player pins them to a crawl
      // (the exchange re-fires every step while they stay in contact).
      const closing = (car.velX - other.velX) * (dx / d) + (car.velZ - other.velZ) * (dz / d);
      if (closing < 0) {
        const exchange = car.speed * 0.55;
        car.speed = other.speed * 0.35 + car.speed * 0.45;
        other.speed = exchange;
      }
      if (impact > CFG.driving.collisionSpeedThreshold * 1.4) crashed = true;
    }
  }
  return crashed;
}

/** Push mesh transform from physics state; spin + steer the wheels. */
export function syncCarMesh(car, dt) {
  const m = car.mesh;
  if (!m) return;
  m.position.set(car.x, 0, car.z);
  m.rotation.y = car.heading;
  const u = m.userData;
  if (u.wheels) {
    const spin = (car.speed / 0.36) * dt;
    for (const w of u.wheels) w.rotation.x += spin;
    // Front wheels yaw with steering (visual only).
    u.wheels[0].rotation.y = car.steer * 0.4;
    u.wheels[1].rotation.y = car.steer * 0.4;
  }
  if (u.tailMat) u.tailMat.emissiveIntensity = car.brakeLight ? 2.4 : 0.7;
  if (u.lightBar && car.siren) {
    const on = Math.floor(performance.now() / 180) % 2 === 0;
    u.lightBar.userData.red.material.emissiveIntensity = on ? 3 : 0.3;
    u.lightBar.userData.blue.material.emissiveIntensity = on ? 0.3 : 3;
  }
  m.visible = !car.dead;
}

/** Damage from a crash or gunfire; returns true when the car just died. */
export function damageCar(G, car, amount) {
  if (car.dead) return false;
  car.health -= amount;
  if (car.health <= 40) car.smoke = 1;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.speed = 0;
    if (car.mesh) car.mesh.visible = false;
    if (G.renderer) G.renderer.spawnExplosion(car.x, 1, car.z);
    if (G.audio) G.audio.explosion();
    if (G.renderer) G.renderer.addShake(12);
    if (car.driver === 'player') {
      G.player.car = null;
      G.message = 'Your car is wrecked.';
      G.messageT = 3;
    }
    return true;
  }
  return false;
}

export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.z - z);
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
export function nearestEnterableCar(cars, markerCar, x, z, maxDist) {
  if (markerCar && !markerCar.dead && Math.hypot(markerCar.x - x, markerCar.z - z) < maxDist) return markerCar;
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    if (car.dead || car.driver === 'traffic') continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (best) return best;
  return nearestCar(cars, x, z, maxDist);
}
