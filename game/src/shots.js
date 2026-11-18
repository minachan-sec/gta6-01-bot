// Screenshot staging: puts the game into a photogenic state for each of
// the four dossier shots, then lets the main loop run it briefly so the
// scene settles before the capture. Driven by ?shot=<name>&seed=<n>.
import { LANDMARKS } from './city.js';
import { makeCar } from './vehicles.js';
import { spawnEnemies } from './combat.js';
import { syncPolice } from './police.js';

export function stageShot(name, W) {
  const p = W.player;
  if (name === 'chase') {
    // Mission 5 in full flight: the Comet at speed, three stars, the
    // helicopter ahead in frame, cop cars behind.
    const car = makeCar('comet', 0, 120, Math.PI, 0xe74c3c);
    car.driver = 'player';
    car.speed = 40;
    car.mesh = W.renderer.makeCarMesh('comet', car.color);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    W.renderer.scene.add(car.mesh);
    W.cars.push(car);
    p.car = car;
    p.x = car.x;
    p.z = car.z;
    p.mesh.visible = false;
    W.wanted.stars = 3;
    syncPolice(W);
    // Two cop cars tucked in behind.
    for (const dz of [-16, -28]) {
      const cop = makeCar('sedan', 2, car.z + dz, Math.PI, 0x1a2f4a);
      cop.driver = 'cop';
      cop.speed = 38;
      cop.mesh = W.renderer.makeCarMesh('cop', 0x1a2f4a);
      cop.mesh.userData.hitRef = { kind: 'car', ref: cop };
      W.renderer.scene.add(cop.mesh);
      W.cars.push(cop);
      W.wanted.cops.push(cop);
    }
    // Point the mission at the getaway so the objective reads on the HUD.
    W.mission.index = 4;
    W.mission.mission = { id: 'the-getaway', title: 'The Getaway' };
    W.mission.state = 'running';
    W.mission.stepDef = { kind: 'goto', text: 'Escape to the safehouse in the hills', x: LANDMARKS.safehouse.x, z: LANDMARKS.safehouse.z };
    W.mission.step = 2;
    W.camYaw = Math.PI;
    W.cameraSnap = true;
  } else if (name === 'drive') {
    // A calm evening drive: the taxi through Little Havana at dusk.
    const car = makeCar('taxi', -160, 120, 0, 0xf39c12);
    car.driver = 'player';
    car.speed = 30;
    car.mesh = W.renderer.makeCarMesh('taxi', car.color);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    W.renderer.scene.add(car.mesh);
    W.cars.push(car);
    p.car = car;
    p.x = car.x;
    p.z = car.z;
    p.mesh.visible = false;
    W.gameHour = 18.5;
    W.mission.state = 'idle';
    W.camYaw = Math.PI;
    W.cameraSnap = true;
  } else if (name === 'foot') {
    // Mission 3 on foot: Rook in the plaza, dialogue up, crew in view.
    p.x = LANDMARKS.plaza.x;
    p.z = LANDMARKS.plaza.z + 18;
    p.heading = Math.PI;
    W.camYaw = Math.PI;
    spawnEnemies(W, [
      { x: LANDMARKS.plaza.x - 8, z: LANDMARKS.plaza.z - 6 },
      { x: LANDMARKS.plaza.x + 8, z: LANDMARKS.plaza.z - 10 },
    ]);
    W.mission.index = 2;
    W.mission.mission = { id: 'payback', title: 'Payback' };
    W.mission.state = 'dialogue';
    W.mission.dialogue = {
      lines: [{ who: 'Marisol Vega', text: "Kade's crew took over Vega Plaza. They think it belongs to them now." }],
      at: 0,
    };
    W.mission.stepDef = { kind: 'kill', text: "Clear out Kade's crew (0/5)", x: LANDMARKS.plaza.x, z: LANDMARKS.plaza.z };
    W.mission.killsDone = 0;
    W.mission.killsTarget = 5;
    W.showStagedDialogue = true;
    W.cameraSnap = true;
  } else {
    // 'title': nothing to stage — the title screen is the shot.
    W.camYaw = Math.PI * 0.75;
    W.cameraSnap = true;
  }
}
