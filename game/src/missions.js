// The story: six jobs for the fixer Marisol Vega, run in order. Each mission
// opens with dialogue (portrait + typewriter lines), then a chain of steps:
// drive somewhere, steal a car, fight, race checkpoints, escape the law.
// Failing returns the player to the mission's start to try again.
import { WEAPONS } from './config.js';
import { createCar } from './vehicles.js';
import { addWanted } from './police.js';
import { createEnemy, clearEnemies } from './combat.js';

export const CHARACTERS = {
  rook: { name: 'Rook', color: '#f5b942', initials: 'RK' },
  marisol: { name: 'Marisol Vega', color: '#2dd4bf', initials: 'MV' },
  rosa: { name: 'Rosa', color: '#f472b6', initials: 'RO' },
  kade: { name: 'Kade Morozov', color: '#ef4444', initials: 'KM' },
};

export const MISSIONS = [
  {
    id: 'back-in-town',
    title: 'Back in Town',
    giver: 'Marisol Vega',
    intro: [
      { who: 'marisol', text: 'Rook. You are back in Solara Bay and broke. Good — broke men work hard.' },
      { who: 'rook', text: 'Nice to see you too, Marisol. What is the job?' },
      { who: 'marisol', text: 'First, wheels. Get yourself to my garage. There is a car waiting — do not scratch it.' },
    ],
    outro: [{ who: 'marisol', text: 'There you are. The Bay missed you. The work starts now.' }],
    reward: 300,
    rep: 100,
    steps: [
      { id: 'garage', text: 'Drive to Marisol\u2019s Garage', kind: 'goto', x: -56, z: 98, radius: 14 },
    ],
  },
  {
    id: 'hot-wheels',
    title: 'Hot Wheels',
    giver: 'Marisol Vega',
    intro: [
      { who: 'marisol', text: 'A red Comet GT is parked at Bayfront Plaza. The owner owes me. Take it.' },
      { who: 'rook', text: 'Steal a car in the middle of the plaza? In daylight?' },
      { who: 'marisol', text: 'That is why I pay you. Bring it to the paint shop — and lose the cops if they notice.' },
    ],
    outro: [{ who: 'marisol', text: 'Beautiful. New plates by morning, new paint by noon.' }],
    reward: 500,
    rep: 150,
    steps: [
      { id: 'steal', text: 'Steal the red Comet GT at Bayfront Plaza', kind: 'car', carType: 'comet', carColor: 0xc0392b, x: 40, z: 8, radius: 12 },
      { id: 'deliver', text: 'Drive the Comet to Solara Paint & Body', kind: 'goto', x: 160, z: -58, radius: 14, needsCar: true },
    ],
  },
  {
    id: 'payback',
    title: 'Payback at the Marina',
    giver: 'Marisol Vega',
    intro: [
      { who: 'marisol', text: 'Kade\u2019s crew took my shipment at the marina. Five of them, counting on us to stay quiet.' },
      { who: 'rook', text: 'We are not staying quiet.' },
      { who: 'marisol', text: 'No. We are not. Clear them out — and take the SMG from the stash first. It is yours now.' },
    ],
    outro: [{ who: 'marisol', text: 'Shipment recovered. Kade will hear about this — good. Let him.' }],
    reward: 700,
    rep: 250,
    unlock: 'smg',
    steps: [
      { id: 'marina', text: 'Go to the Marina Docks', kind: 'goto', x: -280, z: 120, radius: 16 },
      { id: 'clear', text: 'Clear out Kade\u2019s crew (0/5)', kind: 'kill', kills: 5, x: -280, z: 120, radius: 40 },
    ],
  },
  {
    id: 'night-run',
    title: 'Night Run',
    giver: 'Rosa',
    intro: [
      { who: 'rosa', text: 'Rook! The street racers run the loop tonight. Five checkpoints, two and a half minutes.' },
      { who: 'rook', text: 'And if I beat their time?' },
      { who: 'rosa', text: 'Then everybody in Solara Bay knows your name. Drive like you stole it — because you did.' },
    ],
    outro: [{ who: 'rosa', text: 'That was unreal! The whole Bay is talking about you now.' }],
    reward: 600,
    rep: 200,
    timeLimit: 150,
    steps: [
      { id: 'cp1', text: 'Checkpoint 1/5 — Old Town', kind: 'goto', x: -200, z: -200, radius: 14, needsCar: true },
      { id: 'cp2', text: 'Checkpoint 2/5 — Downtown', kind: 'goto', x: 200, z: -200, radius: 14, needsCar: true },
      { id: 'cp3', text: 'Checkpoint 3/5 — Beachfront', kind: 'goto', x: 200, z: 200, radius: 14, needsCar: true },
      { id: 'cp4', text: 'Checkpoint 4/5 — Little Havana', kind: 'goto', x: -200, z: 200, radius: 14, needsCar: true },
      { id: 'cp5', text: 'Checkpoint 5/5 — Finish at the beach', kind: 'goto', x: 0, z: 280, radius: 14, needsCar: true },
    ],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    giver: 'Marisol Vega',
    intro: [
      { who: 'marisol', text: 'Rosa is pinned at the Bay Union Bank. The SBPD is all over it. Get her out.' },
      { who: 'rosa', text: 'Rook, hurry! They have the whole street blocked!' },
      { who: 'marisol', text: 'Bring her to the safehouse in the Hills. Three stars, minimum. Do not get caught.' },
    ],
    outro: [{ who: 'rosa', text: 'We made it! You drive like a maniac, Rook. Never change.' }],
    reward: 900,
    rep: 300,
    unlock: 'shotgun',
    steps: [
      { id: 'pickup', text: 'Pick up Rosa at the bank (E)', kind: 'interact', x: 80, z: -178, radius: 10 },
      { id: 'escape', text: 'Escape to the Safehouse in the Hills', kind: 'goto', x: 260, z: -238, radius: 14 },
    ],
  },
  {
    id: 'king-of-solara',
    title: 'King of Solara',
    giver: 'Marisol Vega',
    intro: [
      { who: 'kade', text: 'Rook Calloway. You have been a thorn in my side all week. That ends tonight.' },
      { who: 'marisol', text: 'Kade brought his whole crew to the plaza. End this, Rook — and the Bay is yours.' },
      { who: 'rook', text: 'Time to collect. For all of us.' },
    ],
    outro: [{ who: 'marisol', text: 'It is done. Solara Bay finally knows the name Rook Calloway.' }],
    reward: 1500,
    rep: 600,
    unlock: 'rifle',
    steps: [
      { id: 'wave1', text: 'Defeat Kade\u2019s crew — wave 1 (0/4)', kind: 'kill', kills: 4, x: 80, z: 0, radius: 45 },
      { id: 'wave2', text: 'Defeat Kade and his last crew (0/5)', kind: 'kill', kills: 5, x: 80, z: 0, radius: 45, boss: true },
    ],
  },
];

export function createMissionRunner(G) {
  const runner = {
    index: 0,
    step: 0,
    active: false,
    timer: 0,
    state: 'idle', // idle | dialogue | running | passed | failed | done
    banner: null,
    bannerT: 0,
    markerCar: null,
    completed: [],
    dialogue: null, // { lines, at }
    killsDone: 0,

    get mission() { return MISSIONS[runner.index] || null; },
    get stepDef() {
      const m = runner.mission;
      return m ? m.steps[runner.step] : null;
    },

    start(index) {
      runner.index = index;
      runner.step = 0;
      runner.active = true;
      runner.timer = 0;
      runner.killsDone = 0;
      const m = runner.mission;
      runner.dialogue = { lines: m.intro, at: 0 };
      runner.state = 'dialogue';
      runner.banner = null;
      clearEnemies(G);
      setupStep(G);
    },

    /** Advance the dialogue; returns true when the dialogue finished. */
    advanceDialogue() {
      if (runner.state !== 'dialogue' || !runner.dialogue) return true;
      runner.dialogue.at += 1;
      if (runner.dialogue.at >= runner.dialogue.lines.length) {
        runner.dialogue = null;
        runner.state = 'running';
        const m = runner.mission;
        runner.banner = { title: m.title, sub: `JOB ${runner.index + 1} OF ${MISSIONS.length} · ${m.giver}`, text: '', kind: 'intro' };
        runner.bannerT = 0;
        return true;
      }
      return false;
    },

    update(dt) {
      if (runner.state === 'dialogue') return;
      if (runner.state !== 'running') return;
      const m = runner.mission;
      const s = runner.stepDef;
      if (!s) return;
      if (m.timeLimit) {
        runner.timer += dt;
        if (runner.timer > m.timeLimit) {
          runner.fail('time');
          return;
        }
      }
      const p = G.player;
      if (s.kind === 'car') {
        if (runner.markerCar && runner.markerCar.dead) {
          G.message = 'Your mission car was wrecked.';
          G.messageT = 3;
          runner.fail('car-lost');
          return;
        }
        if (p.car && runner.markerCar && p.car === runner.markerCar) {
          if (m.id === 'hot-wheels') addWanted(G, 1, 'Someone called the cops on the theft.');
          advance(G);
        }
        return;
      }
      if (s.kind === 'kill') {
        if (runner.killsDone >= s.kills) advance(G);
        return;
      }
      if (s.kind === 'interact') {
        const d = Math.hypot(p.x - s.x, p.z - s.z);
        if (d < s.radius && !p.car && G.consumeInteract) {
          G.consumeInteract = false;
          if (m.id === 'the-getaway' && s.id === 'pickup') {
            addWanted(G, 3, 'The SBPD is all over you — run!');
          }
          advance(G);
        }
        return;
      }
      // Plain goto.
      const px = p.car ? p.car.x : p.x;
      const pz = p.car ? p.car.z : p.z;
      if (s.needsCar && !p.car) return;
      if (s.needsFoot && p.car) return;
      if (Math.hypot(px - s.x, pz - s.z) < s.radius) advance(G);
    },

    onEnemyDown() {
      if (runner.state !== 'running') return;
      const s = runner.stepDef;
      if (s && s.kind === 'kill') {
        runner.killsDone += 1;
        const m = runner.mission;
        const label = s.id === 'wave1' ? 'wave 1' : s.id === 'wave2' ? 'wave 2' : '';
        if (s.id === 'clear') s.text = `Clear out Kade\u2019s crew (${runner.killsDone}/5)`;
        else if (s.id === 'wave1') s.text = `Defeat Kade\u2019s crew — wave 1 (${runner.killsDone}/4)`;
        else if (s.id === 'wave2') s.text = `Defeat Kade and his last crew (${runner.killsDone}/5)`;
      }
    },

    fail(reason) {
      if (runner.state !== 'running' && runner.state !== 'dialogue') return;
      runner.state = 'failed';
      runner.active = false;
      G.screen = 'failed';
      G.failReason = reason;
      if (G.audio) G.audio.fail();
      cleanupStepCar(G);
      clearEnemies(G);
    },

    retry() {
      cleanupStepCar(G);
      clearEnemies(G);
      if (G.resetWanted) G.resetWanted();
      // Reset mutable step text (kill counters).
      for (const m of MISSIONS) {
        for (const s of m.steps) {
          if (s.id === 'clear') s.text = 'Clear out Kade\u2019s crew (0/5)';
          if (s.id === 'wave1') s.text = 'Defeat Kade\u2019s crew — wave 1 (0/4)';
          if (s.id === 'wave2') s.text = 'Defeat Kade and his last crew (0/5)';
        }
      }
      runner.start(runner.index);
      G.screen = 'play';
    },
  };
  return runner;
}

function setupStep(G) {
  const runner = G.mission;
  const s = runner.stepDef;
  if (!s) return;
  runner.killsDone = 0;
  if (s.kind === 'car') {
    cleanupStepCar(G);
    const car = createCar(s.carType, s.x, s.z, Math.PI / 2, s.carColor);
    car.driver = 'parked';
    car.mesh = G.renderer.makeCarMesh(s.carType, s.carColor);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    G.renderer.scene.add(car.mesh);
    runner.markerCar = car;
    G.cars.push(car);
    return;
  }
  if (s.kind === 'kill') {
    clearEnemies(G);
    const n = s.kills;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + G.rng.range(-0.4, 0.4);
      const r = 10 + G.rng.range(0, 16);
      const x = s.x + Math.sin(a) * r;
      const z = s.z + Math.cos(a) * r;
      const boss = s.boss && i === n - 1;
      createEnemy(G, x, z, {
        health: boss ? 220 : 60,
        damage: boss ? 14 : 9,
        accuracy: boss ? 0.55 : 0.42,
        shirt: boss ? 0x8a1f2b : 0x7a1f2b,
        boss,
      });
    }
  }
}

function cleanupStepCar(G) {
  if (!G.mission) return;
  const car = G.mission.markerCar;
  if (car) {
    const i = G.cars.indexOf(car);
    if (i !== -1) G.cars.splice(i, 1);
    if (car.mesh) {
      G.renderer.scene.remove(car.mesh);
      car.mesh = null;
    }
    G.mission.markerCar = null;
  }
}

function advance(G) {
  const runner = G.mission;
  const m = runner.mission;
  if (G.audio) G.audio.pickup();
  runner.step += 1;
  if (runner.step >= m.steps.length) {
    // Mission complete.
    runner.state = 'passed';
    runner.active = false;
    runner.completed.push(m.id);
    G.player.cash += m.reward;
    G.player.rep += m.rep;
    G.stats.cashEarned += m.reward;
    G.stats.missionsDone += 1;
    if (m.unlock && !G.player.weapons.includes(m.unlock)) {
      G.player.weapons.push(m.unlock);
      G.player.ammo[m.unlock] = WEAPONS[m.unlock].mag;
      G.message = `${WEAPONS[m.unlock].name} unlocked!`;
      G.messageT = 4;
    }
    runner.banner = { title: 'MISSION PASSED', sub: m.title, text: `+$${m.reward} · +${m.rep} REP`, kind: 'passed' };
    runner.bannerT = 0;
    if (G.audio) G.audio.pass();
    cleanupStepCar(G);
    clearEnemies(G);
    if (runner.index + 1 < MISSIONS.length) {
      runner.index += 1;
      runner.step = 0;
      G.nextMissionReady = true;
    } else {
      runner.state = 'done';
      G.screen = 'ending';
    }
    G.saveGame();
    return;
  }
  setupStep(G);
}
