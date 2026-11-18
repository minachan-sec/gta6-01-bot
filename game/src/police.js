// The wanted system: stars for crimes, police cars and foot cops who respond
// to them, and the busted/wasted endings. Cops chase hard while they can see
// the player and lose interest when the heat dies down.
import { WANTED, CAR_TYPES } from './config.js';
import { randomRoadPoint, randomSidewalkPoint } from './city.js';
import { createCar, driveCar } from './vehicles.js';

export function createWanted() {
  return {
    stars: 0,
    heat: 0, // seconds since the last crime
    decayTimer: 0,
    bustTimer: 0,
    cops: [], // police cars, in G.cars with driver 'police'
    footCops: [],
  };
}

export function addWanted(G, stars, reason) {
  const w = G.wanted;
  w.stars = Math.min(WANTED.maxStars, w.stars + stars);
  w.heat = 0;
  w.decayTimer = 0;
  if (reason) G.message = reason;
  syncPolice(G);
}

/** Keep the number of police on the street matched to the wanted level. */
export function syncPolice(G) {
  const w = G.wanted;
  const wantCars = WANTED.copCarPerStar[w.stars];
  const wantFoot = WANTED.footCopPerStar[w.stars];
  // Remove the surplus first.
  while (w.cops.length > wantCars) {
    const car = w.cops.pop();
    car.driver = 'parked';
    car.siren = false;
    car.dead = true;
    const i = G.cars.indexOf(car);
    if (i !== -1) G.cars.splice(i, 1);
  }
  while (w.footCops.length > wantFoot) {
    const cop = w.footCops.pop();
    const i = G.peds.indexOf(cop);
    if (i !== -1) G.peds.splice(i, 1);
  }
  // Spawn what is missing, on a road at a distance, out of the player's face.
  while (w.cops.length < wantCars) {
    let p = randomRoadPoint(G.rng);
    let tries = 0;
    while (Math.hypot(p.x - G.player.x, p.y - G.player.y) < 420 && tries < 8) {
      p = randomRoadPoint(G.rng);
      tries += 1;
    }
    const car = createCar('cruiser', p.x, p.y, p.vertical ? Math.PI / 2 : 0, '#1a1a2e');
    car.driver = 'police';
    car.siren = true;
    car.speed = 200;
    w.cops.push(car);
    G.cars.push(car);
  }
  while (w.footCops.length < wantFoot) {
    const p = randomSidewalkPoint(G.rng);
    const cop = {
      x: p.x, y: p.y, angle: 0, speed: 0, target: null, state: 'cop',
      panic: 0, color: '#1a1a2e', shirt: '#2c4a7a', walkPhase: 0, r: 11, cop: true,
    };
    w.footCops.push(cop);
    G.peds.push(cop);
  }
}

function policeDrive(G, car, dt) {
  const p = G.player;
  const tx = p.car ? p.car.x : p.x;
  const ty = p.car ? p.car.y : p.y;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const dist = Math.hypot(dx, dy);
  const want = Math.atan2(dy, dx);
  let diff = want - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const steer = Math.max(-1, Math.min(1, diff * 2.4));
  // Ram the player's car; back off and re-aim when stuck against a wall.
  let throttle = 1;
  if (dist < 60) throttle = 0.35;
  if (car.stuckTimer > 0) {
    car.stuckTimer -= dt;
    throttle = -0.7;
  }
  const before = { x: car.x, y: car.y };
  const crashed = driveCar(car, throttle, steer, dt, G.city, G.cars);
  const moved = Math.hypot(car.x - before.x, car.y - before.y);
  // Stuck means the car moved far less than its speed promised (a wall, a
  // queue it cannot push through): reverse briefly and re-aim.
  if (moved < Math.abs(car.speed) * dt * 0.35 && Math.abs(car.speed) > 40) {
    car.stuckTimer = 0.7;
  }
  if (crashed && G.audio) G.audio.crash();
  // Touching the player's car hard damages it (a nudge, not a wrecking ball).
  if (p.car && dist < car.r + p.car.r * 0.9 && Math.abs(car.speed) > 60) {
    damageCar(G, p.car, 2.5 * dt * 10);
  }
}

export function damageCar(G, car, amount) {
  car.health -= amount;
  if (car.health <= 40) car.smoke = 1;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    G.particles.push({ kind: 'explosion', x: car.x, y: car.y, t: 0, life: 0.9 });
    if (G.audio) G.audio.crash();
    G.shake = 14;
    if (car.driver === 'player') {
      G.player.car = null;
      G.message = 'Your car is wrecked.';
    }
  }
}

export function updateWanted(G, dt) {
  const w = G.wanted;
  const p = G.player;
  w.heat += dt;
  // Heat decays only while no cop can see the player.
  const seen = w.cops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 520) ||
    w.footCops.some((c) => Math.hypot(c.x - p.x, c.y - p.y) < 320);
  if (w.stars > 0 && !seen) {
    w.decayTimer += dt;
    if (w.decayTimer > WANTED.decayDelay + WANTED.decayInterval) {
      w.decayTimer = WANTED.decayDelay;
      w.stars -= 1;
      syncPolice(G);
      if (w.stars === 0) G.message = 'You lost the cops.';
    }
  } else {
    w.decayTimer = 0;
  }

  for (const car of w.cops) {
    if (car.dead) continue;
    policeDrive(G, car, dt);
  }
  // Foot cops run at the player on foot; they give up and walk off when the heat dies.
  for (const cop of w.footCops) {
    const dist = Math.hypot(p.x - cop.x, p.y - cop.y);
    if (w.stars > 0 && !p.car) {
      const want = Math.atan2(p.y - cop.y, p.x - cop.x);
      cop.angle = want;
      cop.speed = 185;
      const nx = cop.x + Math.cos(cop.angle) * cop.speed * dt;
      const ny = cop.y + Math.sin(cop.angle) * cop.speed * dt;
      cop.x = nx;
      cop.y = ny;
      cop.walkPhase += dt * 10;
      if (dist < WANTED.bustRange) {
        w.bustTimer += dt;
        G.message = 'The cops are grabbing you…';
        if (w.bustTimer > WANTED.bustSeconds) busted(G);
      } else {
        w.bustTimer = Math.max(0, w.bustTimer - dt * 2);
      }
    } else if (p.car && dist < 90) {
      // A foot cop next to the player's car tries to drag them out.
      w.bustTimer += dt * 0.6;
      if (w.bustTimer > WANTED.bustSeconds * 1.6) busted(G);
    } else {
      cop.speed = 60;
      cop.walkPhase += dt * 6;
    }
  }
  // A police car pinning the player's car at low speed also busts them.
  if (p.car && w.stars > 0) {
    const close = w.cops.some((c) => !c.dead && Math.hypot(c.x - p.car.x, c.y - p.car.y) < 70 && Math.abs(p.car.speed) < 30);
    if (close) {
      w.bustTimer += dt;
      G.message = 'Pinned by the police…';
      if (w.bustTimer > WANTED.bustSeconds) busted(G);
    }
  }
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
  p.x = G.city.landmarks.garage.x + 140;
  p.y = G.city.landmarks.garage.y + 60;
  p.health = 100;
  if (G.audio) G.audio.busted();
  // The mission fails first (it may set the screen to 'failed'); the busted
  // screen then wins, so the player sees why they are back at the garage.
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
  p.x = G.city.landmarks.garage.x + 140;
  p.y = G.city.landmarks.garage.y + 60;
  p.health = 100;
  p.ammo = Math.max(p.ammo, 12);
  if (G.audio) G.audio.fail();
  // Same ordering as busted(): the mission fails, then the wasted screen wins.
  G.mission.fail('wasted');
  G.screen = 'wasted';
}
