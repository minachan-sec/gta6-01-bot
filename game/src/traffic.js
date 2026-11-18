// Traffic cars and pedestrians: simple road-following AI and sidewalk
// walkers. They make the city feel alive and give the player something
// to dodge, steal from, and (if wanted) anger.
import { CFG } from './config.js';
import { makeCar, driveCar, syncCarMesh } from './vehicles.js';
import { isSolid, nearestRoad, roadCoords } from './city.js';

const PED_SHIRTS = [0xe74c3c, 0x3498db, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xecf0f1, 0xe67e22];
const PED_PANTS = [0x2c3e50, 0x34495e, 0x7f8c8d, 0x1a1a2e];
const PED_SKINS = [0xe8b98a, 0xc68642, 0x8d5524, 0xffdbac];

export function spawnPopulation(rng, city, renderer) {
  const traffic = [];
  const peds = [];
  const roads = roadCoords();
  const types = ['sedan', 'taxi', 'van', 'pickup', 'classic'];

  // Traffic: cars driving along random roads.
  for (let i = 0; i < 16; i += 1) {
    const vertical = rng.chance(0.5);
    const road = rng.pick(roads);
    const along = rng.range(-300, 300);
    const dir = rng.chance(0.5) ? 1 : -1;
    const type = rng.pick(types);
    const car = makeCar(type, vertical ? road : along, vertical ? along : road, vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2), undefined);
    car.driver = 'traffic';
    car.cruise = rng.range(9, 14);
    car.vertical = vertical;
    car.dir = dir;
    car.mesh = renderer.makeCarMesh(type, car.color);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    renderer.scene.add(car.mesh);
    traffic.push(car);
  }

  // Pedestrians: walkers on the sidewalks.
  for (let i = 0; i < 22; i += 1) {
    const road = rng.pick(roads);
    const along = rng.range(-300, 300);
    const side = rng.chance(0.5) ? 1 : -1;
    const vertical = rng.chance(0.5);
    const ped = {
      x: vertical ? road + side * (CFG.world.roadHalf + 2) : along,
      z: vertical ? along : road + side * (CFG.world.roadHalf + 2),
      heading: rng.range(0, Math.PI * 2),
      speed: rng.range(1.2, 2.2),
      state: 'walk',
      panic: 0,
      r: 0.55,
      walkPhase: rng.range(0, 6),
      mesh: null,
    };
    ped.mesh = renderer.makePersonMesh(rng.pick(PED_SHIRTS), rng.pick(PED_PANTS), rng.pick(PED_SKINS));
    ped.mesh.userData.hitRef = { kind: 'ped', ref: ped };
    renderer.scene.add(ped.mesh);
    peds.push(ped);
  }
  return { traffic, peds };
}

export function updateTraffic(W, dt) {
  const player = W.player;
  for (const car of W.traffic) {
    if (car.dead) continue;
    // Slow down for the car ahead (or the player's car).
    let throttle = 0.6;
    const aheadX = car.x + Math.sin(car.heading) * 10;
    const aheadZ = car.z + Math.cos(car.heading) * 10;
    for (const other of W.cars) {
      if (other === car || other.dead) continue;
      if (Math.hypot(other.x - aheadX, other.z - aheadZ) < 5) { throttle = 0; break; }
    }
    // Panic: flee from a nearby crime scene.
    if (W.panicAt && Math.hypot(car.x - W.panicAt.x, car.z - W.panicAt.z) < 40) throttle = 1;
    // At an intersection, sometimes turn onto the crossing road.
    const onX = nearestRoad(car.x);
    const onZ = nearestRoad(car.z);
    if (Math.abs(car.x - onX) < 2 && Math.abs(car.z - onZ) < 2 && Math.random() < dt * 0.25) {
      car.vertical = !car.vertical;
      car.dir = Math.random() < 0.5 ? 1 : -1;
    }
    // Steer back onto the road centreline.
    const targetRoad = car.vertical ? onX : onZ;
    const off = car.vertical ? car.x - targetRoad : car.z - targetRoad;
    const wantHeading = car.vertical ? (car.dir > 0 ? 0 : Math.PI) : (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    let diff = wantHeading - car.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2 - off * 0.05));
    driveCar(car, throttle, steer, dt, W.city, W.cars);
    // Traffic never goes faster than its cruise speed.
    if (Math.abs(car.speed) > car.cruise) car.speed = Math.sign(car.speed) * car.cruise;
    syncCarMesh(car, dt);
    void player;
  }
}

export function updatePeds(W, dt) {
  for (const ped of W.peds) {
    if (ped.panic > 0) {
      ped.panic -= dt;
      ped.state = 'run';
    } else {
      ped.state = 'walk';
    }
    const speed = ped.state === 'run' ? 5.5 : ped.speed;
    // Occasionally pick a new direction.
    if (Math.random() < dt * 0.08) ped.heading += (Math.random() - 0.5) * 1.2;
    const nx = ped.x + Math.sin(ped.heading) * speed * dt;
    const nz = ped.z + Math.cos(ped.heading) * speed * dt;
    if (!isSolid(W.city, nx, ped.z, ped.r)) ped.x = nx;
    if (!isSolid(W.city, ped.x, nz, ped.r)) ped.z = nz;
    // Bounce off buildings by turning.
    if (isSolid(W.city, ped.x, ped.z, ped.r)) ped.heading += Math.PI / 2;
    syncPedMesh(ped, dt, speed > 0.1);
  }
}

export function syncPedMesh(ped, dt, moving) {
  if (!ped.mesh) return;
  ped.mesh.position.set(ped.x, 0, ped.z);
  let diff = ped.heading - ped.mesh.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  ped.mesh.rotation.y += diff * Math.min(1, dt * 8);
  const u = ped.mesh.userData;
  if (u.legL) {
    if (moving) {
      ped.walkPhase += dt * 10;
      const s = Math.sin(ped.walkPhase) * 0.55;
      u.legL.rotation.x = s;
      u.legR.rotation.x = -s;
      u.armL.rotation.x = -s * 0.5;
      u.armR.rotation.x = s * 0.5;
    } else {
      u.legL.rotation.x *= 0.8;
      u.legR.rotation.x *= 0.8;
      u.armL.rotation.x *= 0.8;
      u.armR.rotation.x *= 0.8;
    }
  }
}

// Everyone nearby panics: peds run, traffic flees.
export function scarePeds(W, x, z, radius) {
  W.panicAt = { x, z };
  W.panicT = 4;
  for (const ped of W.peds) {
    if (Math.hypot(ped.x - x, ped.z - z) < radius) {
      ped.panic = 4;
      ped.heading = Math.atan2(ped.x - x, ped.z - z);
    }
  }
}
