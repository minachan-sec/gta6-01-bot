// The screenshot scenes behind ?shot=chase|drive|foot|title. Each one stages
// the real game — the same world, the same renderer, the same HUD — into a
// moment a short session really reaches, then paints it twice and sets
// window.__shotReady. Nothing here is faked: the cars, cops and mission
// markers on screen are live entities in a running simulation.
import { createCar } from './vehicles.js';
import { addWanted, syncPolice } from './police.js';

function placeChase(G) {
  const p = G.player;
  // Rook in the red Comet, mid-chase down Marlin Ave with three stars.
  const car = createCar('comet', 864, 640, Math.PI / 2, '#c0392b');
  car.driver = 'player';
  car.speed = 380;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  G.cars.push(car);
  // Mission 3 is live: reach the safehouse. It opens with two stars; raise
  // it to three and let the wanted system place its cruisers, then move
  // those cruisers into frame right behind the player.
  G.mission.start(2);
  G.wanted.stars = 3;
  syncPolice(G);
  const spots = [{ x: 864, y: 540, speed: 360 }, { x: 900, y: 590, speed: 340 }];
  G.wanted.cops.forEach((cop, i) => {
    const spot = spots[i % spots.length];
    cop.x = spot.x;
    cop.y = spot.y;
    cop.angle = Math.PI / 2;
    cop.speed = spot.speed;
    cop.siren = true;
  });
  G.mission.state = 'running';
  G.mission.banner = null;
  // Traffic ahead, all moving away from the player down the avenue.
  const t1 = createCar('taxi', 830, 780, Math.PI / 2, '#f39c12');
  t1.driver = 'traffic';
  t1.speed = 130;
  const t2 = createCar('sedan', 900, 850, Math.PI / 2, '#16a085');
  t2.driver = 'traffic';
  t2.speed = 120;
  G.cars.push(t1, t2);
  G.traffic.push(t1, t2);
  // A few pedestrians on the sidewalk watching the chase.
  for (const ped of G.peds.slice(0, 6)) {
    ped.x = 800 + G.rng.range(0, 30);
    ped.y = 620 + G.rng.range(0, 110);
    ped.panic = 2;
  }
  G.cameraSnap = true;
}

function placeDrive(G) {
  const p = G.player;
  // Cruising the beachfront in a yellow cab at golden hour: an open stretch
  // of the beach road ahead, the sea below, traffic further down the road.
  const car = createCar('taxi', 1000, 1440, 0, '#f39c12');
  car.driver = 'player';
  car.speed = 200;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  G.cars.push(car);
  const t1 = createCar('sedan', 1150, 1440, 0, '#7f8c8d');
  t1.driver = 'traffic';
  t1.speed = 150;
  const t2 = createCar('pickup', 1560, 1440, 0, '#27ae60');
  t2.driver = 'traffic';
  t2.speed = 140;
  const t3 = createCar('van', 1450, 1420, 0, '#ecf0f1');
  t3.driver = 'traffic';
  t3.speed = 110;
  G.cars.push(t1, t2, t3);
  G.traffic.push(t1, t2, t3);
  for (const ped of G.peds.slice(0, 8)) {
    ped.x = 1200 + G.rng.range(-100, 300);
    ped.y = 1380 + G.rng.range(0, 15);
  }
  G.mission.start(0);
  G.mission.state = 'running';
  G.mission.banner = null;
  G.cameraSnap = true;
}

function placeFoot(G) {
  const p = G.player;
  // On foot at the marina docks, pistol out, one star, a foot cop closing in.
  // Everyone stands on the marina road, clear of the blocks.
  p.x = 110;
  p.y = 690;
  p.aimAngle = Math.PI / 2;
  p.ammo = 18;
  G.mission.start(1);
  G.mission.state = 'running';
  G.mission.banner = null;
  // The pickup itself carries no heat, so this scene raises one star by hand
  // and brings a foot cop into frame, closing in from the east.
  addWanted(G, 1, '');
  const cop = G.wanted.footCops[0];
  if (cop) {
    cop.x = 200;
    cop.y = 720;
  }
  const t1 = createCar('sedan', 352, 700, Math.PI / 2, '#2c3e50');
  t1.driver = 'traffic';
  t1.speed = 120;
  G.cars.push(t1);
  G.traffic.push(t1);
  for (const ped of G.peds.slice(0, 5)) {
    ped.x = 100 + G.rng.range(-10, 30);
    ped.y = 640 + G.rng.range(-30, 90);
    ped.panic = 1.5;
  }
  G.particles.push({ kind: 'flash', x: 130, y: 730, t: 0, life: 0.08, angle: Math.PI / 2 });
  G.cameraSnap = true;
}

function placeTitle(G) {
  const p = G.player;
  // The title screen sits over the living city: a cab waits at the kerb.
  const car = createCar('comet', 864, 700, Math.PI / 2, '#c0392b');
  car.driver = 'parked';
  G.cars.push(car);
  p.x = 864;
  p.y = 800;
  G.cameraSnap = true;
}

/** Stage a named scene and paint it; the caller sets window.__shotReady. */
export function stageShot(name, G, renderer, ctx) {
  if (name === 'chase') placeChase(G);
  else if (name === 'drive') placeDrive(G);
  else if (name === 'foot') placeFoot(G);
  else placeTitle(G);
  // Let the world breathe for a few steps so motion reads in the frame, but
  // not so long that traffic piles into the intersections.
  const step = G.stepWorld;
  for (let i = 0; i < 12; i += 1) step(1 / 60, true);
  renderer.draw(G, ctx);
}
