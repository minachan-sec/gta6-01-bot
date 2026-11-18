// The screenshot scenes behind ?shot=chase|drive|foot|title. Each one stages
// the real game — the same world, the same renderer, the same HUD — into a
// moment a short session really reaches, then lets the loop run so motion
// reads in the frame. Nothing here is faked: the cars, cops, enemies and
// mission markers on screen are live entities in a running simulation.
import { createCar } from './vehicles.js';
import { addWanted, syncPolice } from './police.js';
import { createEnemy } from './combat.js';

function placeChase(G) {
  const p = G.player;
  // Rook in the red Comet, mid-chase up the Downtown avenue with three stars.
  const car = createCar('comet', 40, 120, Math.PI, 0xc0392b);
  car.driver = 'player';
  car.speed = 30;
  car.mesh = G.renderer.makeCarMesh('comet', 0xc0392b);
  car.mesh.userData.hitRef = { kind: 'car', ref: car };
  G.renderer.scene.add(car.mesh);
  p.car = car;
  p.x = car.x;
  p.z = car.z;
  G.cars.push(car);
  // Mission 5 is live: escape to the safehouse. Three stars, heli overhead.
  G.mission.start(4);
  G.mission.advanceDialogue();
  G.mission.advanceDialogue();
  G.mission.advanceDialogue();
  G.mission.step = 1; // escape stage
  G.wanted.stars = 3;
  syncPolice(G);
  const spots = [
    { x: 44, z: 75, speed: 24 }, // one cruiser ahead, in frame, siren on
    { x: 36, z: 158, speed: 26 },
    { x: 44, z: 140, speed: 27 },
  ];
  G.wanted.cops.forEach((cop, i) => {
    const spot = spots[i % spots.length];
    cop.x = spot.x;
    cop.z = spot.z;
    cop.heading = Math.PI;
    cop.speed = spot.speed;
    cop.siren = true;
  });
  G.mission.state = 'running';
  G.mission.banner = null;
  // Traffic ahead, all moving away from the player up the avenue.
  const t1 = createCar('taxi', 36, 60, Math.PI, 0xf39c12);
  t1.driver = 'traffic';
  t1.speed = 12;
  t1.mesh = G.renderer.makeCarMesh('taxi', 0xf39c12);
  G.renderer.scene.add(t1.mesh);
  const t2 = createCar('sedan', 44, 20, Math.PI, 0x16a085);
  t2.driver = 'traffic';
  t2.speed = 11;
  t2.mesh = G.renderer.makeCarMesh('sedan', 0x16a085);
  G.renderer.scene.add(t2.mesh);
  G.cars.push(t1, t2);
  G.traffic.push(t1, t2);
  G.camYaw = Math.PI;
  G.cameraSnap = true;
}

function placeDrive(G) {
  const p = G.player;
  // Cruising the beachfront in a yellow cab at golden hour: the sea to the
  // left, palms along the road, traffic further down the beach road.
  const car = createCar('taxi', -120, 280, Math.PI / 2, 0xf39c12);
  car.driver = 'player';
  car.speed = 20;
  car.mesh = G.renderer.makeCarMesh('taxi', 0xf39c12);
  car.mesh.userData.hitRef = { kind: 'car', ref: car };
  G.renderer.scene.add(car.mesh);
  p.car = car;
  p.x = car.x;
  p.z = car.z;
  G.cars.push(car);
  const t1 = createCar('sedan', -40, 280, Math.PI / 2, 0x7f8c8d);
  t1.driver = 'traffic';
  t1.speed = 14;
  t1.mesh = G.renderer.makeCarMesh('sedan', 0x7f8c8d);
  G.renderer.scene.add(t1.mesh);
  const t2 = createCar('pickup', 60, 280, Math.PI / 2, 0x27ae60);
  t2.driver = 'traffic';
  t2.speed = 13;
  t2.mesh = G.renderer.makeCarMesh('pickup', 0x27ae60);
  G.renderer.scene.add(t2.mesh);
  G.cars.push(t1, t2);
  G.traffic.push(t1, t2);
  G.mission.start(0);
  G.mission.advanceDialogue();
  G.mission.advanceDialogue();
  G.mission.advanceDialogue();
  G.mission.state = 'running';
  G.mission.banner = null;
  G.camYaw = Math.PI / 2;
  G.cameraSnap = true;
}

function placeFoot(G) {
  const p = G.player;
  // On foot at Bayfront Plaza, pistol out, Marisol on the line, two of Kade's
  // crew closing in and a foot cop a block away. Dialogue + combat + HUD.
  p.x = 80;
  p.z = 8;
  p.heading = Math.PI;
  p.weapon = 'pistol';
  p.ammo.pistol = 12;
  G.camYaw = Math.PI;
  G.mission.start(2);
  G.mission.advanceDialogue();
  G.mission.advanceDialogue();
  G.mission.advanceDialogue();
  G.mission.step = 1; // kill stage
  G.mission.state = 'running';
  G.mission.banner = null;
  // Hold Marisol's line on screen for the shot.
  G.mission.dialogue = { lines: [{ who: 'marisol', text: 'Clear them out, Rook — and take the SMG from the stash first. It is yours now.' }], at: 0 };
  G.showStagedDialogue = true;
  const e1 = createEnemy(G, 88, -12, { health: 60 });
  const e2 = createEnemy(G, 70, -6, { health: 60 });
  e1.heading = Math.atan2(p.x - e1.x, p.z - e1.z);
  e2.heading = Math.atan2(p.x - e2.x, p.z - e2.z);
  addWanted(G, 1, '');
  const cop = G.wanted.footCops[0];
  if (cop) {
    cop.x = 96;
    cop.z = 26;
  }
  G.renderer.spawnFlash(p.x + 1, 1.45, p.z - 1);
  G.cameraSnap = true;
}

function placeTitle(G) {
  const p = G.player;
  // The title screen sits over the living city: a cab waits at the kerb.
  const car = createCar('comet', 40, 60, Math.PI, 0xc0392b);
  car.driver = 'parked';
  car.mesh = G.renderer.makeCarMesh('comet', 0xc0392b);
  G.renderer.scene.add(car.mesh);
  G.cars.push(car);
  p.x = 40;
  p.z = 80;
  p.heading = Math.PI;
  G.camYaw = Math.PI;
  G.cameraSnap = true;
}

/** Stage a named scene; the caller runs the loop and sets window.__shotReady. */
export function stageShot(name, G) {
  if (name === 'chase') placeChase(G);
  else if (name === 'drive') placeDrive(G);
  else if (name === 'foot') placeFoot(G);
  else placeTitle(G);
  G.screen = name === 'title' ? 'title' : 'play';
}
