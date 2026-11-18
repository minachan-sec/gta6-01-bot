// The story: five jobs for the fixer Marisol Vega, run in order. Each mission
// is a list of steps; a step is done when the player reaches its marker (on
// foot or in a car, as the step says), and the runner handles the banner,
// the reward, the timer and the fail states. Failing returns the player to
// the mission's start to try again.
import { CAR_TYPES } from './config.js';
import { createCar } from './vehicles.js';
import { addWanted } from './police.js';

export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    giver: 'Marisol Vega',
    intro: 'Rook, you are back in Solara Bay and broke. Steal the red Comet GT parked outside the diner on Marlin Ave, then bring it to Solara Paint & Body. No cops, no fuss.',
    reward: 300,
    steps: [
      { id: 'steal', text: 'Steal the red Comet GT on Marlin Ave', marker: null, kind: 'car', carType: 'comet', carColor: '#c0392b', x: 864, y: 640, radius: 60 },
      { id: 'deliver', text: 'Drive the Comet to Solara Paint & Body', marker: 'paintShop', x: 1120, y: 738, radius: 70, needsCar: true },
    ],
  },
  {
    id: 'the-pickup',
    title: 'The Pickup',
    giver: 'Marisol Vega',
    intro: 'A package is waiting at the marina docks. Go get it — on foot, the docks are tight — and bring it back to my garage. The Tide Kings want that package too, so do not dawdle.',
    reward: 500,
    steps: [
      { id: 'goto-docks', text: 'Go to the marina docks', marker: 'docks', x: 96, y: 700, radius: 60 },
      { id: 'grab', text: 'Pick up the package (E)', marker: 'docks', x: 96, y: 700, radius: 46, needsFoot: true, interact: true },
      { id: 'return', text: 'Bring the package to the garage', marker: 'garage', x: 760, y: 955, radius: 70 },
    ],
  },
  {
    id: 'hot-pursuit',
    title: 'Hot Pursuit',
    giver: 'Marisol Vega',
    intro: 'The SBPD found our stash car. They are coming for you the moment you touch it. Lose them — or at least reach the safehouse in the Hills before they box you in. You have 90 seconds.',
    reward: 800,
    timeLimit: 90,
    steps: [
      { id: 'getaway', text: 'Reach the safehouse in the Hills', marker: 'hideout', x: 1888, y: 1340, radius: 70 },
    ],
  },
  {
    id: 'the-collection',
    title: 'The Collection',
    giver: 'Marisol Vega',
    intro: 'Three drops, three corners of the city, one afternoon. The Tide Kings are watching the streets, so keep moving. Collect every drop before the clock runs out.',
    reward: 1200,
    timeLimit: 150,
    steps: [
      { id: 'drop1', text: 'Collect the drop in Old Town', marker: 'drop1', x: 352, y: 200, radius: 46, needsFoot: true, interact: true },
      { id: 'drop2', text: 'Collect the drop in Downtown', marker: 'drop2', x: 1376, y: 420, radius: 46, needsFoot: true, interact: true },
      { id: 'drop3', text: 'Collect the drop on the Beachfront', marker: 'drop3', x: 1632, y: 1330, radius: 46, needsFoot: true, interact: true },
    ],
  },
  {
    id: 'the-big-score',
    title: 'The Big Score',
    giver: 'Marisol Vega',
    intro: 'The Bay Union Bank moves its weekend take in a Vault Van at dusk. Take the van, drive it to the marina, and we are done — rich, and out of this life. The whole SBPD will be on you. Make it count.',
    reward: 2500,
    steps: [
      { id: 'take-van', text: 'Take the Vault Van outside the bank', marker: null, kind: 'car', carType: 'armored', carColor: '#5d6d7e', x: 1000, y: 540, radius: 60 },
      { id: 'deliver-van', text: 'Drive the Vault Van to the marina', marker: 'marina', x: 96, y: 1100, radius: 80, needsCar: true },
    ],
  },
];

export function createMissionRunner(G) {
  const runner = {
    index: 0, // which mission is active
    step: 0,
    active: false,
    timer: 0,
    state: 'idle', // idle | intro | running | passed | failed | done
    banner: null,
    bannerT: 0,
    markerCar: null,
    completed: [],

    get mission() { return MISSIONS[runner.index] || null; },
    get stepDef() {
      const m = runner.mission;
      return m ? m.steps[runner.step] : null;
    },

    start(index) {
      runner.index = index;
      runner.step = 0;
      runner.active = true;
      runner.state = 'intro';
      runner.timer = 0;
      const m = runner.mission;
      runner.banner = { title: m.title, sub: m.giver, text: m.intro, kind: 'intro' };
      runner.bannerT = 0;
      // Mission 3 opens with the heat already on.
      if (m.id === 'hot-pursuit') addWanted(G, 2, 'The SBPD is onto you!');
      if (m.id === 'the-collection') addWanted(G, 1, 'The Tide Kings tipped off the cops.');
      if (m.id === 'the-big-score') addWanted(G, 1, 'The bank called the cops.');
      setupStepCar(G);
      G.message = '';
    },

    update(dt) {
      if (runner.state === 'intro') {
        runner.bannerT += dt;
        if (runner.bannerT > 5.5) {
          runner.state = 'running';
          runner.banner = null;
        }
        return;
      }
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
      // Step kind 'car': the step completes when the player drives the marked car.
      if (s.kind === 'car') {
        if (runner.markerCar && runner.markerCar.dead) {
          G.message = 'Your mission car was wrecked.';
          runner.fail('car-lost');
          return;
        }
        if (p.car && runner.markerCar && p.car === runner.markerCar) {
          advance(G);
          return;
        }
        return;
      }
      // Marker steps: reach the marker (in a car, on foot, or either).
      const px = p.car ? p.car.x : p.x;
      const py = p.car ? p.car.y : p.y;
      const d = Math.hypot(px - s.x, py - s.y);
      if (s.interact) {
        if (d < s.radius && s.needsFoot && !p.car) {
          if (G.consumeInteract) {
            G.consumeInteract = false;
            advance(G);
          }
        } else if (d < s.radius && !s.needsFoot) {
          advance(G);
        }
        return;
      }
      if (s.needsCar && !p.car) return;
      if (s.needsFoot && p.car) return;
      if (d < s.radius) advance(G);
    },

    fail(reason) {
      if (runner.state !== 'running' && runner.state !== 'intro') return;
      runner.state = 'failed';
      runner.active = false;
      G.screen = 'failed';
      G.failReason = reason;
      if (G.audio) G.audio.fail();
      cleanupStepCar(G);
    },

    retry() {
      cleanupStepCar(G);
      if (G.resetWanted) G.resetWanted();
      runner.start(runner.index);
      G.screen = 'play';
    },
  };
  return runner;
}

function setupStepCar(G) {
  const s = G.mission.stepDef;
  if (!s || s.kind !== 'car') return;
  // Remove any earlier marker car, then park the fresh one at its spot.
  cleanupStepCar(G);
  const angle = Math.PI / 2;
  const car = createCar(s.carType, s.x, s.y, angle, s.carColor);
  car.driver = 'parked';
  G.mission.markerCar = car;
  G.cars.push(car);
}

function cleanupStepCar(G) {
  if (!G.mission) return;
  const car = G.mission.markerCar;
  if (car) {
    const i = G.cars.indexOf(car);
    if (i !== -1) G.cars.splice(i, 1);
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
    G.stats.cashEarned += m.reward;
    runner.banner = { title: 'MISSION PASSED', sub: m.title, text: `+$${m.reward}`, kind: 'passed' };
    runner.bannerT = 0;
    if (G.audio) G.audio.pass();
    cleanupStepCar(G);
    if (runner.index + 1 < MISSIONS.length) {
      runner.index += 1;
      runner.step = 0;
      // The next job waits at the garage: the player starts it by driving there.
      G.nextMissionReady = true;
    } else {
      runner.state = 'done';
      G.screen = 'ending';
    }
    // Save after the index moves, so Continue resumes at the next job.
    G.saveGame();
    return;
  }
  setupStepCar(G);
}
