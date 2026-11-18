// The six story jobs: definitions, dialogue, objectives and rewards.
// A mission is a list of steps; the runner advances through them and pays
// out when the last one completes. Missions run in order, 0 to 5.
import { LANDMARKS } from './city.js';
import { makeCar } from './vehicles.js';
import { spawnEnemies, clearEnemies } from './combat.js';
import { addWanted, syncPolice, clearWanted } from './police.js';

export const MISSION_DEFS = [
  {
    id: 'back-in-town',
    title: 'Back in Town',
    reward: 300,
    unlock: null,
    dialogue: [
      { who: 'Marisol Vega', text: 'Rook. You came back. And broke, from the look of you.' },
      { who: 'Rook Calloway', text: 'I need work, Marisol. Not a lecture.' },
      { who: 'Marisol Vega', text: 'Take the sedan down the road. Bring it to my garage. Try not to scratch it.' },
    ],
    steps: [
      { kind: 'car', text: 'Get in the sedan', carAt: { x: 0, z: 40 }, carType: 'sedan' },
      { kind: 'goto', text: 'Drive to the garage', x: LANDMARKS.garage.x, z: LANDMARKS.garage.z, radius: 16, inCar: true },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    reward: 500,
    unlock: null,
    dialogue: [
      { who: 'Marisol Vega', text: 'A Comet GT is sitting by the docks. I already have a buyer.' },
      { who: 'Rook Calloway', text: 'Stealing it is the easy part.' },
      { who: 'Marisol Vega', text: 'Then drive it to the drop point. Fast. The buyer does not wait.' },
    ],
    steps: [
      { kind: 'car', text: 'Steal the Comet GT', carAt: { x: LANDMARKS.cometSpot.x, z: LANDMARKS.cometSpot.z }, carType: 'comet', steal: true },
      { kind: 'goto', text: 'Drive to the drop point', x: LANDMARKS.dropPoint.x, z: LANDMARKS.dropPoint.z, radius: 16, inCar: true },
    ],
  },
  {
    id: 'payback',
    title: 'Payback',
    reward: 700,
    unlock: 'smg',
    dialogue: [
      { who: 'Marisol Vega', text: "Kade's crew took over Vega Plaza. They think it belongs to them now." },
      { who: 'Rook Calloway', text: 'How many?' },
      { who: 'Marisol Vega', text: 'Five. Clear them out. The SMG in my stash is yours after.' },
    ],
    steps: [
      { kind: 'goto', text: 'Go to Vega Plaza', x: LANDMARKS.plaza.x, z: LANDMARKS.plaza.z, radius: 22 },
      {
        kind: 'kill', text: "Clear out Kade's crew", count: 5,
        spawn: [
          { x: -168, z: -88 }, { x: -152, z: -72 }, { x: -160, z: -64 },
          { x: -144, z: -88 }, { x: -176, z: -72 },
        ],
      },
    ],
  },
  {
    id: 'night-run',
    title: 'Night Run',
    reward: 600,
    unlock: null,
    timeLimit: 150,
    dialogue: [
      { who: 'Marisol Vega', text: 'Night run. Five checkpoints, across the whole city. Beat the clock.' },
      { who: 'Rook Calloway', text: 'How much time?' },
      { who: 'Marisol Vega', text: 'Two and a half minutes. Do not be late.' },
    ],
    steps: [
      { kind: 'goto', text: 'Checkpoint 1 of 5', x: 0, z: 0, radius: 14, inCar: true },
      { kind: 'goto', text: 'Checkpoint 2 of 5', x: 160, z: 0, radius: 14, inCar: true },
      { kind: 'goto', text: 'Checkpoint 3 of 5', x: 160, z: 160, radius: 14, inCar: true },
      { kind: 'goto', text: 'Checkpoint 4 of 5', x: -160, z: 160, radius: 14, inCar: true },
      { kind: 'goto', text: 'Checkpoint 5 of 5', x: -160, z: -160, radius: 14, inCar: true },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    reward: 900,
    unlock: 'shotgun',
    dialogue: [
      { who: 'Rosa', text: "Rook! Kade's people are coming for me!" },
      { who: 'Rook Calloway', text: 'Get in the car. We are going to the hills.' },
      { who: 'Marisol Vega', text: 'The cops are already on you. Three stars. Lose them at the safehouse.' },
    ],
    steps: [
      { kind: 'goto', text: 'Reach Rosa', x: LANDMARKS.rosaSpot.x, z: LANDMARKS.rosaSpot.z, radius: 12 },
      { kind: 'interact', text: 'Pick up Rosa (E)', x: LANDMARKS.rosaSpot.x, z: LANDMARKS.rosaSpot.z, radius: 6 },
      { kind: 'goto', text: 'Escape to the safehouse in the hills', x: LANDMARKS.safehouse.x, z: LANDMARKS.safehouse.z, radius: 18, inCar: true },
    ],
  },
  {
    id: 'king-of-solara',
    title: 'King of Solara',
    reward: 1500,
    unlock: 'rifle',
    dialogue: [
      { who: 'Marisol Vega', text: 'Kade is at the docks with his whole crew. End it tonight.' },
      { who: 'Rook Calloway', text: 'This is for everything he took from me.' },
      { who: 'Kade Morozov', text: 'You should have stayed gone, Rook.' },
    ],
    steps: [
      { kind: 'goto', text: 'Go to the docks', x: LANDMARKS.docks.x, z: LANDMARKS.docks.z, radius: 24 },
      {
        kind: 'kill', text: 'Take down the first wave', count: 4,
        spawn: [
          { x: 320, z: 32 }, { x: 320, z: 48 }, { x: 328, z: 24 }, { x: 328, z: 56 },
        ],
      },
      {
        kind: 'kill', text: 'Take down Kade and his crew', count: 5,
        spawn: [
          { x: 320, z: 40, hp: 220, boss: true },
          { x: 320, z: 24 }, { x: 328, z: 40 }, { x: 320, z: 56 }, { x: 336, z: 32 },
        ],
      },
    ],
  },
];

export function createMissions(W) {
  const M = {
    index: 0,
    step: 0,
    state: 'idle', // idle | dialogue | running | done
    completed: [],
    mission: null,
    stepDef: null,
    dialogue: null,
    banner: null,
    bannerT: 0,
    killsDone: 0,
    killsTarget: 0,
    timer: 0,
    markerCar: null,
    rosa: null,

    start(i) {
      clearEnemies(W);
      M.index = i;
      M.step = 0;
      M.killsDone = 0;
      M.killsTarget = 0;
      M.mission = MISSION_DEFS[i];
      M.timer = M.mission.timeLimit || 0;
      M.markerCar = null;
      M.state = 'dialogue';
      M.dialogue = { lines: M.mission.dialogue, at: 0 };
      M.banner = M.mission.title;
      M.bannerT = 0;
      M.stepDef = M.mission.steps[0];
      if (W.hud) W.hud.showDialogue(M.dialogue.lines[0]);
    },

    advanceDialogue() {
      if (!M.dialogue) return;
      M.dialogue.at += 1;
      if (M.dialogue.at >= M.dialogue.lines.length) {
        M.dialogue = null;
        M.state = 'running';
        // Missions start clean: drop any heat from free roam so a cop
        // tailing the player can't bust them mid-mission.
        clearWanted(W);
        if (W.hud) W.hud.hideDialogue();
        M.enterStep();
      } else if (W.hud) {
        W.hud.showDialogue(M.dialogue.lines[M.dialogue.at]);
      }
    },

    enterStep() {
      const s = M.mission.steps[M.step];
      M.stepDef = s;
      if (!s) return;
      if (s.kind === 'car') {
        // The mission car: parked at the given spot, facing up the road
        // (+z) so the first leg never needs a U-turn off the asphalt.
        const car = makeCar(s.carType, s.carAt.x, s.carAt.z, 0, undefined);
        car.driver = 'parked';
        car.mesh = W.renderer.makeCarMesh(s.carType, car.color);
        car.mesh.userData.hitRef = { kind: 'car', ref: car };
        W.renderer.scene.add(car.mesh);
        W.cars.push(car);
        M.markerCar = car;
      } else if (s.kind === 'kill') {
        M.killsDone = 0;
        M.killsTarget = s.count;
        spawnEnemies(W, s.spawn);
      }
    },

    update(dt) {
      if (M.state === 'dialogue') return;
      if (M.state !== 'running') return;
      if (M.timer > 0) {
        M.timer -= dt;
        if (M.timer <= 0) {
          M.fail('Out of time.');
          return;
        }
      }
      const s = M.stepDef;
      if (!s) return;
      const p = W.player;
      let done = false;
      if (s.kind === 'car') {
        done = p.car === M.markerCar;
      } else if (s.kind === 'goto') {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        done = d < s.radius && (!s.inCar || !!p.car);
      } else if (s.kind === 'interact') {
        if (W.consumeInteract) {
          W.consumeInteract = false;
          const d = Math.hypot(p.x - s.x, p.z - s.z);
          if (d < s.radius) {
            done = true;
            // Rosa hops in: the heat jumps to three stars.
            if (M.mission.id === 'the-getaway') {
              W.wanted.stars = 3;
              syncPolice(W);
              W.message = 'Rosa is with you. Three stars — run!';
              W.messageT = 3;
            }
          }
        }
      } else if (s.kind === 'kill') {
        done = M.killsDone >= M.killsTarget;
      }
      if (done) M.advance();
    },

    advance() {
      if (W.audio) W.audio.pickup();
      M.step += 1;
      if (M.step >= M.mission.steps.length) {
        M.complete();
      } else {
        M.enterStep();
      }
    },

    complete() {
      const m = M.mission;
      M.state = 'done';
      M.stepDef = null;
      M.completed.push(m.id);
      W.player.cash += m.reward;
      W.stats.earned += m.reward;
      W.stats.done += 1;
      if (m.unlock && !W.player.weapons.includes(m.unlock)) {
        W.player.weapons.push(m.unlock);
        W.player.ammo[m.unlock] = 30;
        W.message = `Job done: +$${m.reward}. New weapon: ${m.unlock.toUpperCase()}.`;
      } else {
        W.message = `Job done: +$${m.reward}.`;
      }
      W.messageT = 4;
      if (W.audio) W.audio.missionDone();
      // Finishing a job cools the heat off (the safehouse, the drop, the
      // crew scattered — nobody's chasing you anymore).
      clearWanted(W);
      W.saveGame();
      if (M.index >= MISSION_DEFS.length - 1) {
        // The story is over: ending screen, then free roam.
        W.screen = 'ending';
      } else {
        M.index += 1;
        W.nextReady = true;
      }
    },

    fail(reason) {
      M.state = 'idle';
      M.stepDef = null;
      clearEnemies(W);
      W.failReason = reason;
      W.screen = 'failed';
    },

    retry() {
      const p = W.player;
      p.health = 100;
      p.armor = 0;
      if (p.car) {
        p.car.driver = 'parked';
        p.car = null;
        if (p.mesh) p.mesh.visible = true;
      }
      p.x = LANDMARKS.playerStart.x;
      p.z = LANDMARKS.playerStart.z;
      p.heading = LANDMARKS.playerStart.heading;
      W.wanted.stars = 0;
      W.wanted.bustT = 0;
      syncPolice(W);
      clearEnemies(W);
      W.cameraSnap = true;
      M.start(M.index);
      W.screen = 'play';
    },
  };
  return M;
}
