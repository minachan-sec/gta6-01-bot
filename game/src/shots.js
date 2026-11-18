// The screenshot scenes behind ?shot=chase|drive|foot|title. Each one stages
// the real game — the same world, the same renderer, the same HUD — into a
// moment a short session really reaches, then lets the loop run so motion
// reads in the frame. Nothing here is faked: the cars, cops, enemies and
// mission markers on screen are live entities in a running simulation.
import { spawnVehicle } from './vehicles.js';
import { raiseHeat, matchForce } from './police.js';
import { spawnFoe } from './combat.js';

function setChase(W) {
  const h = W.hero;
  // Rook in the red Comet, mid-chase up the Downtown avenue with three stars.
  const car = spawnVehicle('comet', 40, 120, Math.PI, 0xc0392b);
  car.driver = 'hero';
  car.speed = 30;
  car.mesh = W.view.buildVehicleMesh('comet', 0xc0392b);
  car.mesh.userData.hitRef = { kind: 'car', ref: car };
  W.view.scene.add(car.mesh);
  h.car = car;
  h.x = car.x;
  h.z = car.z;
  W.motors.push(car);
  // Mission 5 is live: escape to the safehouse. Three stars, heli ahead.
  W.jobs.start(4);
  W.jobs.nextLine();
  W.jobs.nextLine();
  W.jobs.nextLine();
  W.jobs.stage = 1; // escape stage
  W.heat.stars = 3;
  matchForce(W);
  const spots = [
    { x: 44, z: 75, speed: 24 }, // one cruiser ahead, in frame, siren on
    { x: 36, z: 158, speed: 26 },
    { x: 44, z: 140, speed: 27 },
  ];
  W.heat.cruisers.forEach((cop, i) => {
    const spot = spots[i % spots.length];
    cop.x = spot.x;
    cop.z = spot.z;
    cop.facing = Math.PI;
    cop.speed = spot.speed;
    cop.siren = true;
  });
  W.jobs.state = 'running';
  W.jobs.banner = null;
  // Traffic ahead, all moving away from the player up the avenue.
  const t1 = spawnVehicle('taxi', 36, 60, Math.PI, 0xf39c12);
  t1.driver = 'flow';
  t1.speed = 12;
  t1.mesh = W.view.buildVehicleMesh('taxi', 0xf39c12);
  W.view.scene.add(t1.mesh);
  const t2 = spawnVehicle('sedan', 44, 20, Math.PI, 0x16a085);
  t2.driver = 'flow';
  t2.speed = 11;
  t2.mesh = W.view.buildVehicleMesh('sedan', 0x16a085);
  W.view.scene.add(t2.mesh);
  W.motors.push(t1, t2);
  W.flow.push(t1, t2);
  W.yaw = Math.PI;
  W.snapCam = true;
}

function setDrive(W) {
  const h = W.hero;
  // Cruising the beachfront in a yellow cab at golden hour: the sea to the
  // left, palms along the road, traffic further down the beach road.
  const car = spawnVehicle('taxi', -120, 280, Math.PI / 2, 0xf39c12);
  car.driver = 'hero';
  car.speed = 20;
  car.mesh = W.view.buildVehicleMesh('taxi', 0xf39c12);
  car.mesh.userData.hitRef = { kind: 'car', ref: car };
  W.view.scene.add(car.mesh);
  h.car = car;
  h.x = car.x;
  h.z = car.z;
  W.motors.push(car);
  const t1 = spawnVehicle('sedan', -40, 280, Math.PI / 2, 0x7f8c8d);
  t1.driver = 'flow';
  t1.speed = 14;
  t1.mesh = W.view.buildVehicleMesh('sedan', 0x7f8c8d);
  W.view.scene.add(t1.mesh);
  const t2 = spawnVehicle('pickup', 60, 280, Math.PI / 2, 0x27ae60);
  t2.driver = 'flow';
  t2.speed = 13;
  t2.mesh = W.view.buildVehicleMesh('pickup', 0x27ae60);
  W.view.scene.add(t2.mesh);
  W.motors.push(t1, t2);
  W.flow.push(t1, t2);
  W.jobs.start(0);
  W.jobs.nextLine();
  W.jobs.nextLine();
  W.jobs.nextLine();
  W.jobs.state = 'running';
  W.jobs.banner = null;
  W.yaw = Math.PI / 2;
  W.snapCam = true;
}

function setFoot(W) {
  const h = W.hero;
  // On foot at Bayfront Plaza, pistol out, Marisol on the line, two of Kade's
  // crew closing in and a foot cop a block away. Dialogue + combat + HUD.
  h.x = 80;
  h.z = 8;
  h.facing = Math.PI;
  h.weapon = 'pistol';
  h.ammo.pistol = 12;
  W.yaw = Math.PI;
  W.jobs.start(2);
  W.jobs.nextLine();
  W.jobs.nextLine();
  W.jobs.nextLine();
  W.jobs.stage = 1; // kill stage
  W.jobs.state = 'running';
  W.jobs.banner = null;
  // Hold Marisol's line on screen for the shot.
  W.jobs.dialogue = { lines: [{ who: 'marisol', text: 'Clear them out, Rook — and take the SMG from the stash first. It is yours now.' }], at: 0 };
  W.stagedTalk = true;
  const e1 = spawnFoe(W, 88, -12, { health: 60 });
  const e2 = spawnFoe(W, 70, -6, { health: 60 });
  e1.facing = Math.atan2(h.x - e1.x, h.z - e1.z);
  e2.facing = Math.atan2(h.x - e2.x, h.z - e2.z);
  raiseHeat(W, 1, '');
  const cop = W.heat.beat[0];
  if (cop) {
    cop.x = 96;
    cop.z = 26;
  }
  W.view.spawnFlash(h.x + 1, 1.45, h.z - 1);
  W.snapCam = true;
}

function setTitle(W) {
  const h = W.hero;
  // The title screen sits over the living city: a cab waits at the kerb.
  const car = spawnVehicle('comet', 40, 60, Math.PI, 0xc0392b);
  car.driver = 'parked';
  car.mesh = W.view.buildVehicleMesh('comet', 0xc0392b);
  W.view.scene.add(car.mesh);
  W.motors.push(car);
  h.x = 40;
  h.z = 80;
  h.facing = Math.PI;
  W.yaw = Math.PI;
  W.snapCam = true;
}

/** Stage a named scene; the caller runs the loop and sets window.__shotReady. */
export function frameShot(name, W) {
  if (name === 'chase') setChase(W);
  else if (name === 'drive') setDrive(W);
  else if (name === 'foot') setFoot(W);
  else setTitle(W);
  W.screen = name === 'title' ? 'title' : 'play';
}
