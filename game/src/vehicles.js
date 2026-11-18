// Cars: arcade driving physics, damage, and the enter/exit helpers.
// A car is plain data; its mesh lives in car.mesh and is synced separately.
import { CFG, VEHICLES } from './config.js';
import { isSolid, pushOut } from './city.js';

let nextId = 1;

export function makeCar(type, x, z, heading, color) {
  const def = VEHICLES[type] || VEHICLES.sedan;
  return {
    id: nextId++,
    type,
    name: def.label,
    x, z, heading,
    speed: 0,
    health: def.health,
    maxHealth: def.health,
    dead: false,
    driver: 'parked', // parked | traffic | player | cop
    color: color ?? def.colors[0],
    len: def.len,
    wid: def.wid,
    driftScore: 0,
    drifting: false,
    nearMissT: 0,
    mesh: null,
    r: def.len / 2,
  };
}

// One physics step. Returns true when the car hit something hard.
export function driveCar(car, throttle, steer, dt, city, cars, opts = {}) {
  if (car.dead) {
    car.speed *= Math.max(0, 1 - dt * 2);
    return false;
  }
  const def = VEHICLES[car.type] || VEHICLES.sedan;
  const top = def.topSpeed * (opts.nitro ? 1.35 : 1);
  // Accelerate / brake / reverse.
  if (throttle > 0) car.speed += def.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 1) car.speed -= def.accel * 1.6 * dt; // brake
    else car.speed = Math.max(-10, car.speed + def.accel * 0.5 * throttle * dt); // reverse
  } else {
    car.speed *= Math.max(0, 1 - dt * 0.5); // drag
  }
  car.speed = Math.max(-10, Math.min(top, car.speed));
  // Handbrake: sharp turn, heavy drag, drift.
  const handbrake = !!opts.handbrake;
  const grip = handbrake ? def.grip * 1.9 : def.grip;
  const spd = Math.abs(car.speed);
  const turnRate = grip * Math.min(1, spd / 8) * (car.speed < 0 ? -1 : 1);
  car.heading += steer * turnRate * dt * (handbrake ? 1.4 : 1);
  car.drifting = handbrake && spd > 14;
  if (car.drifting) car.driftScore += dt * spd * 0.06;
  else if (car.driftScore > 0) car.driftScore = Math.max(0, car.driftScore - dt * 2);

  const nx = car.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.z + Math.cos(car.heading) * car.speed * dt;
  let crashed = false;
  // Buildings stop the car.
  if (!isSolid(city, nx, nz, car.wid / 2 + 0.4)) {
    car.x = nx;
    car.z = nz;
  } else {
    if (spd > CFG.driving.collisionSpeed) crashed = true;
    car.speed *= -0.25;
    pushOut(city, car);
  }
  // Car-to-car bumps: push apart, both slow down. Parked cars are dead
  // weight — they never move and never pick up speed.
  for (const other of cars) {
    if (other === car || other.dead) continue;
    const dx = car.x - other.x;
    const dz = car.z - other.z;
    const minD = (car.len + other.len) / 2 - 0.6;
    const d2 = dx * dx + dz * dz;
    if (d2 < minD * minD && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      const push = (minD - d) / 2;
      const px = (dx / d) * push;
      const pz = (dz / d) * push;
      const otherParked = other.driver === 'parked';
      if (!otherParked) {
        other.x -= px;
        other.z -= pz;
      }
      car.x += px;
      car.z += pz;
      if (spd > CFG.driving.collisionSpeed) crashed = true;
      car.speed *= 0.55;
      if (!otherParked) other.speed *= 0.55;
    }
  }
  return crashed;
}

// Sync the Three.js mesh to the car's physics state.
export function syncCarMesh(car, dt) {
  if (!car.mesh) return;
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  // A wrecked car sits lower and tilts.
  const wreck = car.dead ? 1 : 0;
  car.mesh.position.y = -0.15 * wreck;
  car.mesh.rotation.z = 0.06 * wreck;
  // Cop light bars flash.
  if (car.mesh.userData.lightBar) {
    const on = Math.floor(performance.now() / 260) % 2 === 0;
    car.mesh.userData.lightBar.material.color.set(on ? 0x2244ff : 0xff2222);
  }
  void dt;
}

export function damageCar(W, car, amount) {
  if (car.dead) return;
  car.health -= amount;
  if (car.health <= 0) {
    car.health = 0;
    car.dead = true;
    car.speed = 0;
    if (W && W.renderer) {
      W.renderer.spawnSparks(car.x, 1, car.z);
      W.renderer.spawnSmoke(car.x, 1.4, car.z);
      W.renderer.addShake(5);
    }
    if (W && W.audio) W.audio.crash();
    // The driver bails out of a wreck.
    if (W && W.player && W.player.car === car) {
      W.player.car = null;
      if (W.player.mesh) W.player.mesh.visible = true;
    }
  }
}

export function nearestCar(cars, x, z, range, extra) {
  let best = null;
  let bd = range;
  const list = extra ? [...cars, extra] : cars;
  for (const car of list) {
    if (car.dead) continue;
    const d = Math.hypot(car.x - x, car.z - z);
    if (d < bd) { bd = d; best = car; }
  }
  return best;
}
