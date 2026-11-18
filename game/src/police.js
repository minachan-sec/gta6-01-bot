// The wanted system: stars for crimes, police cars and foot cops who respond
// to them, a helicopter at three stars, and the busted/wasted endings. Cops
// chase hard while they can see the player and lose interest when the heat
// dies down.
import { CFG } from './config.js';
import { randomRoadPoint, randomSidewalkPoint } from './city.js';
import { createCar, driveCar, syncCarMesh, damageCar } from './vehicles.js';
import { syncPedMesh } from './traffic.js';

export function createWanted() {
  return {
    stars: 0,
    heat: 0,
    decayTimer: 0,
    bustTimer: 0,
    cops: [], // police cars, in G.cars with driver 'police'
    footCops: [],
    heli: null,
  };
}

export function addWanted(G, stars, reason) {
  const w = G.wanted;
  w.stars = Math.min(5, w.stars + stars);
  w.heat = 0;
  w.decayTimer = 0;
  if (reason) {
    G.message = reason;
    G.messageT = 3.5;
  }
  syncPolice(G);
}

function copCarsFor(stars) {
  return [0, 1, 2, 3, 4, 5][stars] || 0;
}

function footCopsFor(stars) {
  return [0, 1, 2, 2, 2, 2][stars] || 0;
}

/** Keep the number of police on the street matched to the wanted level. */
export function syncPolice(G) {
  const w = G.wanted;
  const wantCars = copCarsFor(w.stars);
  const wantFoot = footCopsFor(w.stars);
  while (w.cops.length > wantCars) {
    const car = w.cops.pop();
    car.dead = true;
    if (car.mesh) {
      G.renderer.scene.remove(car.mesh);
      car.mesh = null;
    }
    const i = G.cars.indexOf(car);
    if (i !== -1) G.cars.splice(i, 1);
  }
  while (w.footCops.length > wantFoot) {
    const cop = w.footCops.pop();
    const i = G.peds.indexOf(cop);
    if (i !== -1) G.peds.splice(i, 1);
    if (cop.mesh) {
      G.renderer.scene.remove(cop.mesh);
      cop.mesh = null;
    }
  }
  while (w.cops.length < wantCars) {
    let p = randomRoadPoint(G.rng);
    let tries = 0;
    while (Math.hypot(p.x - G.player.x, p.z - G.player.z) < 90 && tries < 8) {
      p = randomRoadPoint(G.rng);
      tries += 1;
    }
    const car = createCar('cop', p.x, p.z, p.vertical ? 0 : Math.PI / 2, 0x1a1a2e);
    car.driver = 'police';
    car.siren = true;
    car.speed = 16;
    car.mesh = G.renderer.makeCarMesh('cop', 0x1a1a2e);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    G.renderer.scene.add(car.mesh);
    w.cops.push(car);
    G.cars.push(car);
  }
  while (w.footCops.length < wantFoot) {
    const p = randomSidewalkPoint(G.rng);
    const mesh = G.renderer.makePersonMesh(0x2c4a7a, 0x1a1a2e, 0xe8b98a, { cap: 0x1a1a2e, weapon: true });
    const cop = {
      x: p.x, z: p.z, heading: 0, speed: 0, target: null, state: 'cop',
      panic: 0, r: 0.55, walkPhase: 0, cop: true, mesh,
    };
    mesh.userData.hitRef = { kind: 'ped', ref: cop };
    G.renderer.scene.add(mesh);
    w.footCops.push(cop);
    G.peds.push(cop);
  }
  // Helicopter at three stars and up.
  if (w.stars >= CFG.police.heliStars && !w.heli) {
    const mesh = G.renderer.makeHelicopterMesh();
    mesh.position.set(G.player.x + 30, 34, G.player.z - 30);
    G.renderer.scene.add(mesh);
    w.heli = { mesh, x: mesh.position.x, z: mesh.position.z, y: 34 };
  } else if (w.stars < CFG.police.heliStars && w.heli) {
    G.renderer.scene.remove(w.heli.mesh);
    w.heli = null;
  }
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function policeDrive(G, car, dt) {
  const p = G.player;
  const tx = p.car ? p.car.x : p.x;
  const tz = p.car ? p.car.z : p.z;
  const dx = tx - car.x;
  const dz = tz - car.z;
  const dist = Math.hypot(dx, dz);
  const want = Math.atan2(dx, dz);
  const steer = Math.max(-1, Math.min(1, angleDiff(want, car.heading) * 2.4));
  let throttle = 1;
  if (dist < 9) throttle = 0.35;
  if (car.stuckTimer > 0) {
    car.stuckTimer -= dt;
    throttle = -0.7;
  }
  const before = { x: car.x, z: car.z };
  const crashed = driveCar(car, throttle, steer, dt, G.city, G.cars);
  const moved = Math.hypot(car.x - before.x, car.z - before.z);
  if (moved < Math.abs(car.speed) * dt * 0.35 && Math.abs(car.speed) > 5) {
    car.stuckTimer = 0.7;
  }
  if (crashed && G.audio) G.audio.crash();
  syncCarMesh(car, dt);
  // Touching the player's car hard damages it (a nudge, not a wrecking ball).
  if (p.car && dist < car.r + p.car.r * 0.9 && Math.abs(car.speed) > 8) {
    damageCar(G, p.car, 1.2 * dt * 10);
  }
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  const p = G.player;
  w.heat += dt;
  // Heat decays only while no cop can see the player.
  const seen = w.cops.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < CFG.police.sightRange) ||
    w.footCops.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < 45) ||
    !!w.heli;
  if (w.stars > 0 && !seen) {
    w.decayTimer += dt;
    if (w.decayTimer > CFG.police.decayDelay + CFG.police.decayInterval) {
      w.decayTimer = CFG.police.decayDelay;
      w.stars -= 1;
      syncPolice(G);
      if (w.stars === 0) {
        G.message = 'You lost the cops.';
        G.messageT = 3;
      }
    }
  } else {
    w.decayTimer = 0;
  }

  for (const car of w.cops) {
    if (car.dead) continue;
    policeDrive(G, car, dt);
  }
  // Foot cops run at the player on foot; they give up when the heat dies.
  for (const cop of w.footCops) {
    const dist = Math.hypot(p.x - cop.x, p.z - cop.z);
    if (w.stars > 0 && !p.car) {
      cop.heading = Math.atan2(p.x - cop.x, p.z - cop.z);
      cop.speed = 6.4;
      const nx = cop.x + Math.sin(cop.heading) * cop.speed * dt;
      const nz = cop.z + Math.cos(cop.heading) * cop.speed * dt;
      cop.x = nx;
      cop.z = nz;
      cop.walkPhase += dt * 10;
      if (dist < CFG.police.bustRange) {
        w.bustTimer += dt;
        G.message = 'The cops are grabbing you…';
        G.messageT = 1;
        if (w.bustTimer > CFG.police.bustTime) busted(G);
      } else {
        w.bustTimer = Math.max(0, w.bustTimer - dt * 2);
      }
    } else if (p.car && dist < 12) {
      w.bustTimer += dt * 0.6;
      if (w.bustTimer > CFG.police.bustTime * 1.6) busted(G);
    } else {
      cop.speed = 1.6;
    }
    syncPedMesh(cop, dt);
  }
  // A police car pinning the player's car at low speed also busts them.
  if (p.car && w.stars > 0) {
    const close = w.cops.some((c) => !c.dead && Math.hypot(c.x - p.car.x, c.z - p.car.z) < 9 && Math.abs(p.car.speed) < 4);
    if (close) {
      w.bustTimer += dt;
      G.message = 'Pinned by the police…';
      G.messageT = 1;
      if (w.bustTimer > CFG.police.bustTime) busted(G);
    }
  }
  // Helicopter hovers above the player, rotor spinning, spotlight sweeping.
  if (w.heli) {
    const h = w.heli;
    const tx = p.x + 6;
    const tz = p.z - 6;
    h.x += (tx - h.x) * Math.min(1, dt * 0.9);
    h.z += (tz - h.z) * Math.min(1, dt * 0.9);
    h.mesh.position.set(h.x, 34 + Math.sin(G.time * 0.7) * 1.2, h.z);
    h.mesh.rotation.y = Math.atan2(p.x - h.x, p.z - h.z);
    h.mesh.userData.rotor.rotation.y += dt * 22;
  }
  if (G.audio) G.audio.siren(w.stars > 0, dt);
}

function respawnAtGarage(G) {
  const g = G.city.landmarks.garage;
  const p = G.player;
  p.x = g.x + 24;
  p.z = g.z + 18;
  p.heading = Math.PI;
  p.health = 100;
  p.armor = 0;
  G.cameraSnap = true;
}

export function busted(G) {
  const p = G.player;
  const fine = Math.min(p.cash, 150);
  p.cash -= fine;
  G.wanted.stars = 0;
  G.wanted.bustTimer = 0;
  syncPolice(G);
  if (p.car) {
    p.car.driver = 'parked';
    p.car = null;
  }
  respawnAtGarage(G);
  if (G.audio) G.audio.busted();
  G.mission.fail('busted');
  G.screen = 'busted';
}

export function wasted(G) {
  const p = G.player;
  const lost = Math.min(p.cash, 100);
  p.cash -= lost;
  G.wanted.stars = 0;
  syncPolice(G);
  if (p.car) {
    p.car.driver = 'parked';
    p.car = null;
  }
  respawnAtGarage(G);
  if (G.audio) G.audio.fail();
  G.mission.fail('wasted');
  G.screen = 'wasted';
}
