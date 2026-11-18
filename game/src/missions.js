// The story: six jobs for the fixer Marisol Vega, run in order. Each job
// opens with dialogue (portrait + typewriter lines), then a chain of
// stages: drive somewhere, steal a motor, fight, race checkpoints, escape
// the law. Failing returns the hero to the job's start to try again.
import { ARSENAL } from './config.js';
import { spawnVehicle } from './vehicles.js';
import { raiseHeat } from './police.js';
import { spawnFoe, clearFoes } from './combat.js';

export const CAST = {
  rook: { name: 'Rook', color: '#f5b942', initials: 'RK' },
  marisol: { name: 'Marisol Vega', color: '#2dd4bf', initials: 'MV' },
  rosa: { name: 'Rosa', color: '#f472b6', initials: 'RO' },
  kade: { name: 'Kade Morozov', color: '#ef4444', initials: 'KM' },
};

export const JOBS = [
  {
    key: 'back-in-town',
    name: 'Back in Town',
    from: 'Marisol Vega',
    open: [
      { who: 'marisol', text: 'Rook. You are back in Solara Bay and broke. Good — broke men work hard.' },
      { who: 'rook', text: 'Nice to see you too, Marisol. What is the job?' },
      { who: 'marisol', text: 'First, wheels. Get yourself to my garage. There is a car waiting — do not scratch it.' },
    ],
    close: [{ who: 'marisol', text: 'There you are. The Bay missed you. The work starts now.' }],
    pay: 300,
    fame: 100,
    stages: [
      { key: 'garage', brief: 'Drive to Marisol\u2019s Garage', type: 'goto', x: -56, z: 98, range: 14 },
    ],
  },
  {
    key: 'hot-wheels',
    name: 'Hot Wheels',
    from: 'Marisol Vega',
    open: [
      { who: 'marisol', text: 'A red Comet GT is parked at Bayfront Plaza. The owner owes me. Take it.' },
      { who: 'rook', text: 'Steal a car in the middle of the plaza? In daylight?' },
      { who: 'marisol', text: 'That is why I pay you. Bring it to the paint shop — and lose the cops if they notice.' },
    ],
    close: [{ who: 'marisol', text: 'Beautiful. New plates by morning, new paint by noon.' }],
    pay: 500,
    fame: 150,
    stages: [
      { key: 'steal', brief: 'Steal the red Comet GT at Bayfront Plaza', type: 'car', motor: 'comet', tint: 0xc0392b, x: 40, z: 8, range: 12 },
      { key: 'deliver', brief: 'Drive the Comet to Solara Paint & Body', type: 'goto', x: 160, z: -58, range: 14, needsRide: true },
    ],
  },
  {
    key: 'payback',
    name: 'Payback at the Marina',
    from: 'Marisol Vega',
    open: [
      { who: 'marisol', text: 'Kade\u2019s crew took my shipment at the marina. Five of them, counting on us to stay quiet.' },
      { who: 'rook', text: 'We are not staying quiet.' },
      { who: 'marisol', text: 'No. We are not. Clear them out — and take the SMG from the stash first. It is yours now.' },
    ],
    close: [{ who: 'marisol', text: 'Shipment recovered. Kade will hear about this — good. Let him.' }],
    pay: 700,
    fame: 250,
    gift: 'smg',
    stages: [
      { key: 'marina', brief: 'Go to the Marina Docks', type: 'goto', x: -280, z: 120, range: 16 },
      { key: 'clear', brief: 'Clear out Kade\u2019s crew (0/5)', type: 'kill', count: 5, x: -280, z: 120, range: 40 },
    ],
  },
  {
    key: 'night-run',
    name: 'Night Run',
    from: 'Rosa',
    open: [
      { who: 'rosa', text: 'Rook! The street racers run the loop tonight. Five checkpoints, two and a half minutes.' },
      { who: 'rook', text: 'And if I beat their time?' },
      { who: 'rosa', text: 'Then everybody in Solara Bay knows your name. Drive like you stole it — because you did.' },
    ],
    close: [{ who: 'rosa', text: 'That was unreal! The whole Bay is talking about you now.' }],
    pay: 600,
    fame: 200,
    clock: 150,
    stages: [
      { key: 'cp1', brief: 'Checkpoint 1/5 — Old Town', type: 'goto', x: -200, z: -200, range: 14, needsRide: true },
      { key: 'cp2', brief: 'Checkpoint 2/5 — Downtown', type: 'goto', x: 200, z: -200, range: 14, needsRide: true },
      { key: 'cp3', brief: 'Checkpoint 3/5 — Beachfront', type: 'goto', x: 200, z: 200, range: 14, needsRide: true },
      { key: 'cp4', brief: 'Checkpoint 4/5 — Little Havana', type: 'goto', x: -200, z: 200, range: 14, needsRide: true },
      { key: 'cp5', brief: 'Checkpoint 5/5 — Finish at the beach', type: 'goto', x: 0, z: 280, range: 14, needsRide: true },
    ],
  },
  {
    key: 'the-getaway',
    name: 'The Getaway',
    from: 'Marisol Vega',
    open: [
      { who: 'marisol', text: 'Rosa is pinned at the Bay Union Bank. The SBPD is all over it. Get her out.' },
      { who: 'rosa', text: 'Rook, hurry! They have the whole street blocked!' },
      { who: 'marisol', text: 'Bring her to the safehouse in the Hills. Three stars, minimum. Do not get caught.' },
    ],
    close: [{ who: 'rosa', text: 'We made it! You drive like a maniac, Rook. Never change.' }],
    pay: 900,
    fame: 300,
    gift: 'shotgun',
    stages: [
      { key: 'pickup', brief: 'Pick up Rosa at the bank (E)', type: 'interact', x: 80, z: -178, range: 10 },
      { key: 'escape', brief: 'Escape to the Safehouse in the Hills', type: 'goto', x: 260, z: -238, range: 14 },
    ],
  },
  {
    key: 'king-of-solara',
    name: 'King of Solara',
    from: 'Marisol Vega',
    open: [
      { who: 'kade', text: 'Rook Calloway. You have been a thorn in my side all week. That ends tonight.' },
      { who: 'marisol', text: 'Kade brought his whole crew to the plaza. End this, Rook — and the Bay is yours.' },
      { who: 'rook', text: 'Time to collect. For all of us.' },
    ],
    close: [{ who: 'marisol', text: 'It is done. Solara Bay finally knows the name Rook Calloway.' }],
    pay: 1500,
    fame: 600,
    gift: 'rifle',
    stages: [
      { key: 'wave1', brief: 'Defeat Kade\u2019s crew — wave 1 (0/4)', type: 'kill', count: 4, x: 80, z: 0, range: 45 },
      { key: 'wave2', brief: 'Defeat Kade and his last crew (0/5)', type: 'kill', count: 5, x: 80, z: 0, range: 45, chief: true },
    ],
  },
];

export function newJobRunner(W) {
  const runner = {
    index: 0,
    stage: 0,
    live: false,
    timer: 0,
    state: 'idle', // idle | dialogue | running | passed | failed | done
    banner: null,
    bannerT: 0,
    markerCar: null,
    finished: [],
    dialogue: null, // { lines, at }
    downCount: 0,

    get job() { return JOBS[runner.index] || null; },
    get stageDef() {
      const j = runner.job;
      return j ? j.stages[runner.stage] : null;
    },

    start(index) {
      runner.index = index;
      runner.stage = 0;
      runner.live = true;
      runner.timer = 0;
      runner.downCount = 0;
      W.jobWaiting = false; // the waiting job is starting now, not waiting
      const j = runner.job;
      runner.dialogue = { lines: j.open, at: 0 };
      runner.state = 'dialogue';
      runner.banner = null;
      clearFoes(W);
      prepareStage(W);
    },

    /** Advance the dialogue; returns true when the dialogue finished. */
    nextLine() {
      if (runner.state !== 'dialogue' || !runner.dialogue) return true;
      runner.dialogue.at += 1;
      if (runner.dialogue.at >= runner.dialogue.lines.length) {
        runner.dialogue = null;
        runner.state = 'running';
        const j = runner.job;
        runner.banner = { title: j.name, sub: `JOB ${runner.index + 1} OF ${JOBS.length} · ${j.from}`, text: '', kind: 'intro' };
        runner.bannerT = 0;
        return true;
      }
      return false;
    },

    update(dt) {
      if (runner.state === 'dialogue') return;
      if (runner.state !== 'running') return;
      const j = runner.job;
      const s = runner.stageDef;
      if (!s) return;
      if (j.clock) {
        runner.timer += dt;
        if (runner.timer > j.clock) {
          runner.fail('time');
          return;
        }
      }
      const hero = W.hero;
      if (s.type === 'car') {
        if (runner.markerCar && runner.markerCar.dead) {
          W.note = 'Your job car was wrecked.';
          W.noteT = 3;
          runner.fail('car-lost');
          return;
        }
        if (hero.car && runner.markerCar && hero.car === runner.markerCar) {
          if (j.key === 'hot-wheels') raiseHeat(W, 1, 'Someone called the cops on the theft.');
          nextStage(W);
        }
        return;
      }
      if (s.type === 'kill') {
        if (runner.downCount >= s.count) nextStage(W);
        return;
      }
      if (s.type === 'interact') {
        const d = Math.hypot(hero.x - s.x, hero.z - s.z);
        if (d < s.range && !hero.car && W.useInteract) {
          W.useInteract = false;
          if (j.key === 'the-getaway' && s.key === 'pickup') {
            raiseHeat(W, 3, 'The SBPD is all over you — run!');
          }
          nextStage(W);
        }
        return;
      }
      // Plain goto.
      const px = hero.car ? hero.car.x : hero.x;
      const pz = hero.car ? hero.car.z : hero.z;
      if (s.needsRide && !hero.car) return;
      if (s.needsWalk && hero.car) return;
      if (Math.hypot(px - s.x, pz - s.z) < s.range) nextStage(W);
    },

    onFoeDown() {
      if (runner.state !== 'running') return;
      const s = runner.stageDef;
      if (s && s.type === 'kill') {
        runner.downCount += 1;
        if (s.key === 'clear') s.brief = `Clear out Kade\u2019s crew (${runner.downCount}/5)`;
        else if (s.key === 'wave1') s.brief = `Defeat Kade\u2019s crew — wave 1 (${runner.downCount}/4)`;
        else if (s.key === 'wave2') s.brief = `Defeat Kade and his last crew (${runner.downCount}/5)`;
      }
    },

    fail(reason) {
      if (runner.state !== 'running' && runner.state !== 'dialogue') return;
      runner.state = 'failed';
      runner.live = false;
      W.screen = 'failed';
      W.whyFailed = reason;
      if (W.sound) W.sound.fail();
      clearMarkerCar(W);
      clearFoes(W);
    },

    retry() {
      clearMarkerCar(W);
      clearFoes(W);
      if (W.resetHeat) W.resetHeat();
      // Reset mutable stage text (kill counters).
      for (const j of JOBS) {
        for (const s of j.stages) {
          if (s.key === 'clear') s.brief = 'Clear out Kade\u2019s crew (0/5)';
          if (s.key === 'wave1') s.brief = 'Defeat Kade\u2019s crew — wave 1 (0/4)';
          if (s.key === 'wave2') s.brief = 'Defeat Kade and his last crew (0/5)';
        }
      }
      runner.start(runner.index);
      W.screen = 'play';
    },
  };
  return runner;
}

function prepareStage(W) {
  const runner = W.jobs;
  const s = runner.stageDef;
  if (!s) return;
  runner.downCount = 0;
  if (s.type === 'car') {
    clearMarkerCar(W);
    const car = spawnVehicle(s.motor, s.x, s.z, Math.PI / 2, s.tint);
    car.driver = 'parked';
    car.mesh = W.view.buildVehicleMesh(s.motor, s.tint);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.facing;
    W.view.scene.add(car.mesh);
    runner.markerCar = car;
    W.motors.push(car);
    return;
  }
  if (s.type === 'kill') {
    clearFoes(W);
    const n = s.count;
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + W.dice.between(-0.4, 0.4);
      const r = 10 + W.dice.between(0, 16);
      const x = s.x + Math.sin(a) * r;
      const z = s.z + Math.cos(a) * r;
      const boss = s.chief && i === n - 1;
      spawnFoe(W, x, z, {
        health: boss ? 220 : 60,
        damage: boss ? 14 : 9,
        accuracy: boss ? 0.55 : 0.42,
        shirt: boss ? 0x8a1f2b : 0x7a1f2b,
        boss,
      });
    }
  }
}

function clearMarkerCar(W) {
  if (!W.jobs) return;
  const car = W.jobs.markerCar;
  if (!car) return;
  if (car.driver === 'hero') {
    // The hero is driving the job car when the job ends: keep the car
    // (it is theirs now), just drop the marker. Removing it would leave
    // the hero in an invisible car they can never re-enter.
    W.jobs.markerCar = null;
    return;
  }
  const i = W.motors.indexOf(car);
  if (i !== -1) W.motors.splice(i, 1);
  if (car.mesh) {
    W.view.scene.remove(car.mesh);
    car.mesh = null;
  }
  W.jobs.markerCar = null;
}

function nextStage(W) {
  const runner = W.jobs;
  const j = runner.job;
  if (W.sound) W.sound.pickup();
  runner.stage += 1;
  if (runner.stage >= j.stages.length) {
    // Job complete.
    runner.state = 'passed';
    runner.live = false;
    runner.finished.push(j.key);
    W.hero.cash += j.pay;
    W.hero.rep += j.fame;
    W.tally.cashEarned += j.pay;
    W.tally.missionsDone += 1;
    if (j.gift && !W.hero.owned.includes(j.gift)) {
      W.hero.owned.push(j.gift);
      W.hero.ammo[j.gift] = ARSENAL[j.gift].clip;
      W.note = `${ARSENAL[j.gift].label} unlocked!`;
      W.noteT = 4;
    }
    runner.banner = { title: 'MISSION PASSED', sub: j.name, text: `+$${j.pay} · +${j.fame} REP`, kind: 'passed' };
    runner.bannerT = 0;
    if (W.sound) W.sound.pass();
    clearMarkerCar(W);
    clearFoes(W);
    if (runner.index + 1 < JOBS.length) {
      runner.index += 1;
      runner.stage = 0;
      W.jobWaiting = true;
    } else {
      runner.state = 'done';
      W.screen = 'ending';
    }
    W.saveGame();
    return;
  }
  prepareStage(W);
}
