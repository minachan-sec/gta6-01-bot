// The wanted system: stars, pursuit cars, foot cops and the helicopter.
// The helicopter flies AHEAD of the player's car so it stays visible in
// the driving camera — never behind, never directly overhead.
import { CFG } from './config.js';
import { makeCar, driveCar, syncCarMesh } from './vehicles.js';
import { nearestRoad } from './city.js';

export function createWanted() {
  return {
    stars: 0,
    bustT: 0, // continuous seconds the bust condition has held
    loseT: 0, // seconds since any cop last saw the player
    decayT: 0, // seconds since the last star decayed
    cops: [],
    footCops: [],
    heli: null, // { mesh, x, y, z, orbitA }
    sirenOn: false,
  };
}

export function addWanted(W, n, why) {
  // No heat from incidental crimes while a story mission is running: the
  // missions are the game, and a stray bullet clipping a parked car
  // shouldn't end one. (M5 sets its 3 stars directly, not via this.)
  if (W.mission && W.mission.state === 'running') return;
  const w = W.wanted;
  const before = w.stars;
  w.stars = Math.min(5, w.stars + n);
  w.loseT = 0;
  w.decayT = 0;
  if (w.stars > before && why) {
    W.message = why;
    W.messageT = 2.5;
  }
  syncPolice(W);
}

function spawnCopCar(W) {
  const p = W.player;
  // Spawn on a road 100-140 m away: far enough that the player gets a
  // few seconds to accelerate when a chase starts (they spawn at 40 m/s
  // and would otherwise be on top of a standing start instantly).
  const angle = Math.random() * Math.PI * 2;
  const dist = 100 + Math.random() * 40;
  let x = p.x + Math.sin(angle) * dist;
  let z = p.z + Math.cos(angle) * dist;
  x = nearestRoad(x);
  z = Math.max(-320, Math.min(320, z));
  const car = makeCar('sedan', x, z, Math.atan2(p.x - x, p.z - z), 0x1a2f4a);
  car.driver = 'cop';
  car.mesh = W.renderer.makeCarMesh('cop', 0x1a2f4a);
  car.mesh.userData.hitRef = { kind: 'car', ref: car };
  W.renderer.scene.add(car.mesh);
  W.cars.push(car);
  W.wanted.cops.push(car);
  return car;
}

function spawnFootCop(W) {
  const p = W.player;
  const angle = Math.random() * Math.PI * 2;
  const dist = 25 + Math.random() * 20;
  const cop = {
    x: p.x + Math.sin(angle) * dist,
    z: p.z + Math.cos(angle) * dist,
    heading: 0,
    speed: 7.5,
    r: 0.55,
    walkPhase: 0,
    mesh: null,
  };
  cop.mesh = W.renderer.makePersonMesh(0x2244aa, 0x1a1a2e, 0xe8b98a, { weapon: true });
  cop.mesh.userData.hitRef = { kind: 'cop', ref: cop };
  W.renderer.scene.add(cop.mesh);
  W.wanted.footCops.push(cop);
  return cop;
}

function spawnHeli(W) {
  const mesh = W.renderer.makeHeliMesh();
  W.renderer.scene.add(mesh);
  const p = W.player;
  W.wanted.heli = {
    mesh,
    x: p.x, y: CFG.heli.altitude, z: p.z - 40,
    orbitA: 0,
  };
}

function removeHeli(W) {
  if (!W.wanted.heli) return;
  W.renderer.scene.remove(W.wanted.heli.mesh);
  W.wanted.heli = null;
}

// Match the deployed force to the current star count.
export function syncPolice(W) {
  const w = W.wanted;
  const wantCars = w.stars === 0 ? 0 : Math.min(CFG.police.maxCopCars, 1 + w.stars);
  const wantFoot = w.stars >= CFG.police.footCopsAtStars ? Math.min(CFG.police.maxFootCops, w.stars) : 0;
  while (w.cops.length < wantCars) spawnCopCar(W);
  while (w.cops.length > wantCars) {
    const car = w.cops.pop();
    W.renderer.scene.remove(car.mesh);
    const idx = W.cars.indexOf(car);
    if (idx !== -1) W.cars.splice(idx, 1);
  }
  while (w.footCops.length < wantFoot) spawnFootCop(W);
  while (w.footCops.length > wantFoot) {
    const cop = w.footCops.pop();
    W.renderer.scene.remove(cop.mesh);
  }
  if (w.stars >= CFG.police.heliAtStars && !w.heli) spawnHeli(W);
  if (w.stars < CFG.police.heliAtStars && w.heli) removeHeli(W);
  w.sirenOn = w.stars > 0;
}

export function updateWanted(W, dt) {
  const w = W.wanted;
  const p = W.player;
  if (w.stars === 0) {
    w.sirenOn = false;
    return;
  }
  const px = p.car ? p.car.x : p.x;
  const pz = p.car ? p.car.z : p.z;

  // --- Cop cars: pursue and ram. ---
  for (const cop of w.cops) {
    if (cop.dead) continue;
    // Aim slightly ahead of a moving target.
    const lead = p.car ? 1.2 : 0.4;
    const tx = px + (p.car ? Math.sin(p.car.heading) * p.car.speed * lead : 0);
    const tz = pz + (p.car ? Math.cos(p.car.heading) * p.car.speed * lead : 0);
    const wantHeading = Math.atan2(tx - cop.x, tz - cop.z);
    let diff = wantHeading - cop.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const dist = Math.hypot(tx - cop.x, tz - cop.z);
    const steer = Math.max(-1, Math.min(1, diff * 2.5));
    // Full throttle unless right on top of the player (then brake to block).
    const throttle = dist < 6 ? -0.5 : 1;
    driveCar(cop, throttle, steer, dt, W.city, W.cars);
    if (Math.abs(cop.speed) > 34) cop.speed = Math.sign(cop.speed) * 34;
    syncCarMesh(cop, dt);
    if (cop.health < CFG.driving.smokeBelow && Math.random() < dt * 2) {
      W.renderer.spawnSmoke(cop.x, 1.2, cop.z);
    }
  }

  // --- Foot cops: run the player down on foot. ---
  for (const cop of w.footCops) {
    if (p.car) {
      // A foot cop cannot catch a car: hold position, watch.
      continue;
    }
    const dx = p.x - cop.x;
    const dz = p.z - cop.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.5) {
      cop.heading = Math.atan2(dx, dz);
      const step = cop.speed * dt;
      cop.x += Math.sin(cop.heading) * step;
      cop.z += Math.cos(cop.heading) * step;
    }
    if (cop.mesh) {
      cop.mesh.position.set(cop.x, 0, cop.z);
      cop.mesh.rotation.y = cop.heading;
      cop.walkPhase += dt * 11;
      const s = Math.sin(cop.walkPhase) * 0.6;
      const u = cop.mesh.userData;
      if (u.legL) {
        u.legL.rotation.x = s;
        u.legR.rotation.x = -s;
      }
    }
  }

  // --- Helicopter: stay AHEAD of the car, low enough to see. ---
  if (w.heli) {
    const h = w.heli;
    let tx; let tz; let ty;
    if (p.car) {
      tx = p.car.x + Math.sin(p.car.heading) * CFG.heli.ahead;
      tz = p.car.z + Math.cos(p.car.heading) * CFG.heli.ahead;
      ty = CFG.heli.altitude;
    } else {
      h.orbitA += dt * 0.5;
      tx = p.x + Math.sin(h.orbitA) * CFG.heli.orbitRadius;
      tz = p.z + Math.cos(h.orbitA) * CFG.heli.orbitRadius;
      ty = CFG.heli.orbitHeight;
    }
    const k = Math.min(1, dt * CFG.heli.followRate);
    h.x += (tx - h.x) * k;
    h.y += (ty - h.y) * k;
    h.z += (tz - h.z) * k;
    h.mesh.position.set(h.x, h.y, h.z);
    h.mesh.rotation.y = Math.atan2(px - h.x, pz - h.z);
    h.mesh.userData.rotor.rotation.y += dt * 22;
    // Gentle bob so it reads as flying, not hovering on a pole.
    h.mesh.position.y = h.y + Math.sin(W.time * 1.7) * 0.35;
  }

  // --- Busted? Only on a sustained, unambiguous pin. ---
  let pinning = false;
  if (p.car) {
    const stopped = Math.abs(p.car.speed) < CFG.police.bustCarSpeed;
    if (stopped) {
      for (const cop of w.cops) {
        // A pin counts only if the cop is stopped too: a cruiser ramming
        // past at speed hasn't got you boxed in yet.
        if (!cop.dead && Math.abs(cop.speed) < 2
          && Math.hypot(cop.x - p.car.x, cop.z - p.car.z) < CFG.police.bustCarDist) {
          pinning = true;
          break;
        }
      }
    }
    if (pinning) {
      w.bustT += dt;
      if (w.bustT >= CFG.police.bustCarTime) busted(W);
    } else {
      w.bustT = Math.max(0, w.bustT - dt * 2);
    }
  } else {
    for (const cop of w.footCops) {
      if (Math.hypot(cop.x - p.x, cop.z - p.z) < CFG.police.bustOnFootDist) {
        pinning = true;
        break;
      }
    }
    if (pinning) {
      w.bustT += dt;
      if (w.bustT >= CFG.police.bustOnFootTime) busted(W);
    } else {
      w.bustT = Math.max(0, w.bustT - dt * 2);
    }
  }

  // --- Losing the heat: out of sight long enough, stars decay. ---
  let nearest = Infinity;
  for (const cop of w.cops) {
    if (cop.dead) continue;
    nearest = Math.min(nearest, Math.hypot(cop.x - px, cop.z - pz));
  }
  for (const cop of w.footCops) {
    nearest = Math.min(nearest, Math.hypot(cop.x - px, cop.z - pz));
  }
  if (nearest > CFG.police.loseSightDist) {
    w.loseT += dt;
    if (w.loseT > CFG.police.loseSightTime) {
      w.decayT += dt;
      if (w.decayT >= CFG.police.starDecayTime) {
        w.decayT = 0;
        w.stars = Math.max(0, w.stars - 1);
        syncPolice(W);
      }
    }
  } else {
    w.loseT = 0;
    w.decayT = 0;
  }
}

export function busted(W) {
  if (W.screen !== 'play') return;
  W.screen = 'busted';
  W.wanted.stars = 0;
  W.wanted.bustT = 0;
  syncPolice(W);
  if (W.audio) W.audio.busted();
}

// Drop the heat entirely (mission start): remove all cops and the heli.
export function clearWanted(W) {
  const w = W.wanted;
  w.stars = 0;
  w.bustT = 0;
  w.loseT = 0;
  w.decayT = 0;
  for (const c of w.cops) if (c.mesh) W.renderer.scene.remove(c.mesh);
  for (const c of w.footCops) if (c.mesh) W.renderer.scene.remove(c.mesh);
  w.cops = [];
  w.footCops = [];
  if (w.heli) {
    W.renderer.scene.remove(w.heli.mesh);
    w.heli = null;
  }
  w.sirenOn = false;
  if (W.audio) W.audio.siren(false);
}

export function wasted(W) {
  if (W.screen !== 'play') return;
  W.screen = 'wasted';
  W.wanted.stars = 0;
  syncPolice(W);
}
