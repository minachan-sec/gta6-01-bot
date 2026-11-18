// Vehicles: what they are, how they drive, and how they crash. One physics
// model serves the hero, traffic and the police — arcade handling with drift
// and nitro, so a car feels weighty without a real tyre model. Facing is
// radians; forward is (sin f, 0, cos f), matching the mesh (built facing +z).
import { TUNE, MOTORS } from './config.js';
import { isSolid, pushOut } from './city.js';

let nextPlate = 1;

export function spawnVehicle(kind, x, z, facing, tint) {
  const spec = MOTORS[kind];
  return {
    plate: nextPlate++,
    kind,
    label: spec.label,
    x, z,
    facing,
    speed: 0, // m/s, forward positive
    velX: 0, velZ: 0, // world velocity (drift slides sideways)
    turn: 0,
    long: spec.long,
    wide: spec.wide,
    r: Math.max(spec.long, spec.wide) * 0.44,
    tint: tint ?? 0x888888,
    driver: null, // 'hero' | 'flow' | 'police' | 'parked'
    health: 100,
    smoking: 0,
    braking: false,
    boost: 100,
    boostOn: false,
    sliding: false,
    slideScore: 0,
    siren: false,
    dead: false,
    mesh: null,
    stuckFor: 0,
    horn: 0,
  };
}

/** Arcade driving with a velocity vector, so handbrake drifts slide. */
export function steerVehicle(car, gas, wheel, dt, town, others, opts = {}) {
  const spec = MOTORS[car.kind];
  const brake = !!opts.handbrake;
  const boost = !!opts.nitro && car.boost > 0 && gas > 0;
  car.boostOn = boost;
  if (boost) car.boost = Math.max(0, car.boost - TUNE.wheels.boostUse * dt);
  else car.boost = Math.min(100, car.boost + TUNE.wheels.boostBack * dt);

  const ceiling = spec.fast * (boost ? TUNE.wheels.boostMult : 1);
  if (gas > 0) car.speed += spec.pull * gas * dt * (boost ? 1.35 : 1);
  else if (gas < 0) {
    if (car.speed > 4) car.speed -= spec.pull * 1.7 * dt; // brake
    else car.speed -= spec.pull * 0.55 * dt; // reverse
  } else {
    car.speed -= car.speed * 1.1 * dt; // rolling drag
  }
  if (brake) car.speed -= car.speed * 1.8 * dt;
  if (car.speed > ceiling) car.speed = ceiling;
  if (car.speed < -ceiling * 0.45) car.speed = -ceiling * 0.45;
  if (Math.abs(car.speed) < 0.4 && gas === 0) car.speed = 0;

  const dir = car.speed >= 0 ? 1 : -1;
  const gripAtSpeed = Math.min(1, Math.abs(car.speed) / 8);
  const swing = 2.1 * spec.hold * (1 - Math.min(0.55, (Math.abs(car.speed) / ceiling) * 0.55));
  car.turn += (wheel - car.turn) * Math.min(1, dt * 9);
  car.facing += car.turn * swing * gripAtSpeed * dir * dt * (Math.abs(car.speed) > 0.5 ? 1 : 0);
  car.braking = gas < 0 && car.speed > 4;

  const fx = Math.sin(car.facing);
  const fz = Math.cos(car.facing);
  // Velocity: forward speed plus a sideways slide that decays by grip.
  const along = car.velX * fx + car.velZ * fz;
  const across = car.velX * fz - car.velZ * fx;
  const hold = brake ? TUNE.wheels.slideGrip : spec.hold;
  const acrossNext = across * Math.max(0, 1 - hold * 7 * dt);
  car.sliding = brake && Math.abs(car.speed) > 10 && Math.abs(acrossNext) > 2;
  if (car.sliding) car.slideScore += dt;
  car.velX = fx * car.speed + fz * acrossNext;
  car.velZ = fz * car.speed - fx * acrossNext;

  const nx = car.x + car.velX * dt;
  const nz = car.z + car.velZ * dt;
  const impact = Math.abs(along);
  let smashed = false;
  if (isSolid(town, nx, nz, car.r * 0.72)) {
    // Slide along the wall: try each axis alone.
    if (!isSolid(town, nx, car.z, car.r * 0.72)) {
      car.x = nx;
      car.velZ *= 0.4;
    } else if (!isSolid(town, car.x, nz, car.r * 0.72)) {
      car.z = nz;
      car.velX *= 0.4;
    } else {
      car.speed *= -0.22;
      car.velX *= -0.25;
      car.velZ *= -0.25;
      smashed = impact > TUNE.wheels.smashAt;
    }
  } else {
    car.x = nx;
    car.z = nz;
  }
  pushOut(town, car);

  // Soft push against other vehicles (circle vs circle).
  for (const other of others) {
    if (other === car || other.dead) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const min = car.r * 0.8 + other.r * 0.8;
    const d2 = dx * dx + dz * dz;
    if (d2 > 0.01 && d2 < min * min) {
      const d = Math.sqrt(d2);
      const overlap = min - d;
      // A parked car is dead weight: it does not move and takes no speed,
      // so traffic cannot shove the city's parked cars all over the map
      // (and the player can still find one where they left it).
      const weight = other.driver === 'parked' ? 0 : Math.abs(car.speed) > Math.abs(other.speed) ? 0.7 : 0.3;
      car.x += (dx / d) * overlap * (1 - weight);
      car.z += (dz / d) * overlap * (1 - weight);
      other.x -= (dx / d) * overlap * weight;
      other.z -= (dz / d) * overlap * weight;
      // Only trade speed when the vehicles are closing on each other. Cars
      // merely touching while separating keep their speed — otherwise a
      // stopped car resting against the hero pins them to a crawl (the
      // exchange re-fires every step while they stay in contact).
      const closing = (car.velX - other.velX) * (dx / d) + (car.velZ - other.velZ) * (dz / d);
      if (closing < 0 && other.driver !== 'parked') {
        const swap = car.speed * 0.55;
        car.speed = other.speed * 0.35 + car.speed * 0.45;
        other.speed = swap;
      }
      if (impact > TUNE.wheels.smashAt * 1.4) smashed = true;
    }
  }
  return smashed;
}

/** Push mesh transform from physics state; spin + steer the wheels. */
export function refreshVehicleMesh(car, dt) {
  const m = car.mesh;
  if (!m) return;
  m.position.set(car.x, 0, car.z);
  m.rotation.y = car.facing;
  const u = m.userData;
  if (u.wheels) {
    const spin = (car.speed / 0.36) * dt;
    for (const w of u.wheels) w.rotation.x += spin;
    // Front wheels yaw with steering (visual only).
    u.wheels[0].rotation.y = car.turn * 0.4;
    u.wheels[1].rotation.y = car.turn * 0.4;
  }
  if (u.tailMat) u.tailMat.emissiveIntensity = car.braking ? 2.4 : 0.7;
  if (u.lightBar && car.siren) {
    const on = Math.floor(performance.now() / 180) % 2 === 0;
    u.lightBar.userData.red.material.emissiveIntensity = on ? 3 : 0.3;
    u.lightBar.userData.blue.material.emissiveIntensity = on ? 0.3 : 3;
  }
  m.visible = !car.dead;
}

/** Damage from a crash or gunfire; returns true when the vehicle just died. */
export function harmVehicle(W, car, amount) {
  if (car.dead) return false;
  car.health -= amount;
  if (car.health <= 40) car.smoking = 1;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.speed = 0;
    if (car.mesh) car.mesh.visible = false;
    if (W.view) W.view.spawnBlast(car.x, 1, car.z);
    if (W.sound) W.sound.explosion();
    if (W.view) W.view.addShake(12);
    if (car.driver === 'hero') {
      W.hero.car = null;
      W.note = 'Your car is wrecked.';
      W.noteT = 3;
    }
    return true;
  }
  return false;
}

export function closestVehicle(motors, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of motors) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** The vehicle E should enter: the job's marked car first, then a parked
 * car, then a traffic car — so a passing cab never steals the job's Comet
 * out from under the hero. */
export function closestBoardable(motors, markerCar, x, z, maxDist) {
  if (markerCar && !markerCar.dead && Math.hypot(markerCar.x - x, markerCar.z - z) < maxDist) return markerCar;
  let best = null;
  let bestD = maxDist;
  for (const car of motors) {
    if (car.dead || car.driver === 'flow') continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  if (best) return best;
  return closestVehicle(motors, x, z, maxDist);
}
