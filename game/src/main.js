// Solara Bay — boot and the one loop. Input is read every frame, the world
// advances in fixed 1/60 s steps, and the renderer paints what is there.
// The game moves between screens: title, play, paused, wasted, busted,
// mission failed and the ending. ?seed=N fixes the city. ?shot=chase|drive|
// foot|title stages that scene instead of running the loop, paints it and
// sets window.__shotReady for a screenshot.
import { STEP, VIEW, PLAYER, CAR, WORLD } from './config.js';
import { createRandom } from './rng.js';
import { buildCity, isBlocked, resolveCollision, onRoad } from './city.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createCar, driveCar, nearestEnterableCar } from './vehicles.js';
import { createPopulation, updateTraffic, updatePeds, scarePeds } from './traffic.js';
import { createWanted, addWanted, syncPolice, updateWanted, busted, wasted } from './police.js';
import { updateBullets, shoot, punch, hurtPlayer } from './combat.js';
import { createMissionRunner, MISSIONS } from './missions.js';
import { createRenderer } from './render.js';
import { drawHUD, drawBanner, drawTitle, drawPause, drawEnd } from './hud.js';
import { readSave, writeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const status = document.getElementById('status');
canvas.width = VIEW.width;
canvas.height = VIEW.height;

function buildGame(seedValue) {
  const rng = createRandom(seedValue);
  const city = buildCity(rng);
  const audio = createAudio();
  const renderer = createRenderer();
  renderer.ensureStatic(city);

  const G = {
    rng, city, audio, renderer,
    time: 0,
    shake: 0,
    screen: 'title',
    message: '',
    messageT: 0,
    interactPrompt: '',
    consumeInteract: false,
    nextMissionReady: false,
    failReason: '',
    cameraSnap: false,
    stats: { cashEarned: 0, carsStolen: 0, missionsDone: 0 },
    player: {
      // On Marlin Ave (road x=864) just south of the garage: open asphalt,
      // never inside a building.
      x: 760, y: 990, aimAngle: 0, health: 100, cash: 0, ammo: PLAYER.pistolAmmoStart,
      car: null, moving: false, invulnerable: 0, r: PLAYER.radius,
    },
    cars: [],
    traffic: [],
    peds: [],
    bullets: [],
    particles: [],
    wanted: createWanted(),
    mission: null,
  };
  G.mission = createMissionRunner(G);
  const pop = createPopulation(rng, city);
  G.traffic = pop.traffic;
  G.peds = pop.peds;
  G.cars = [...pop.traffic];

  // A few parked cars around the city, free for the taking — all parked on
  // roads, never inside a block where a building could swallow them.
  const parked = [
    ['sedan', 864, 500, Math.PI / 2, '#8e44ad'],
    ['pickup', 1120, 830, 0, '#27ae60'],
    ['sedan', 1376, 560, Math.PI, '#2c3e50'],
    ['van', 352, 1100, Math.PI / 2, '#ecf0f1'],
    ['comet', 1632, 900, 0, '#e67e22'],
    ['sedan', 864, 1300, Math.PI / 2, '#16a085'],
  ];
  for (const [type, x, y, angle, color] of parked) {
    const car = createCar(type, x, y, angle, color);
    car.driver = 'parked';
    G.cars.push(car);
  }

  G.saveGame = () => writeSave(G);
  G.resetWanted = () => {
    G.wanted.stars = 0;
    G.wanted.bustTimer = 0;
    syncPolice(G);
  };
  G.onWasted = () => wasted(G);

  // One fixed step of the simulation. `auto` skips the player's input (used
  // by the screenshot scenes, where the moment is staged, not played).
  G.stepWorld = (dt, auto) => {
    G.time += dt;
    if (G.messageT > 0) G.messageT -= dt;
    updateTraffic(G, dt);
    updatePeds(G, dt);
    updateWanted(G, dt);
    updateBullets(G, dt);
    if (G.mission) G.mission.update(dt);
    // The player's car keeps rolling in staged scenes.
    if (auto && G.player.car) {
      driveCar(G.player.car, 0.45, 0, dt, G.city, G.cars);
    }
    // Engine smoke.
    for (const car of G.cars) {
      if (!car.dead && car.health < 40 && Math.random() < 0.3) {
        G.particles.push({ kind: 'smoke', x: car.x - Math.cos(car.angle) * car.length / 2, y: car.y - Math.sin(car.angle) * car.length / 2, t: 0, life: 0.7 });
      }
    }
    // Camera follows the player (or their car), with a look-ahead while driving.
    const p = G.player;
    const target = p.car ? { x: p.car.x, y: p.car.y } : { x: p.x, y: p.y };
    const look = p.car ? { x: Math.cos(p.car.angle) * p.car.speed * 0.22, y: Math.sin(p.car.angle) * p.car.speed * 0.22 } : { x: 0, y: 0 };
    if (G.cameraSnap) {
      renderer.camera.x = Math.max(-40, Math.min(WORLD.width - VIEW.width + 40, target.x + look.x - VIEW.width / 2));
      renderer.camera.y = Math.max(-40, Math.min(WORLD.height - VIEW.height + 40, target.y + look.y - VIEW.height / 2));
      G.cameraSnap = false;
    } else {
      renderer.updateCamera(target, dt, look);
    }
  };
  return G;
}

let G = buildGame(seed);
const input = createInput(canvas);

function announce(message) {
  status.textContent = message;
}

function mouseWorld() {
  const rect = canvas.getBoundingClientRect();
  const sx = VIEW.width / rect.width;
  const sy = VIEW.height / rect.height;
  return {
    x: G.renderer.camera.x + input.mouse.x * sx,
    y: G.renderer.camera.y + input.mouse.y * sy,
  };
}

function enterCar(car) {
  const p = G.player;
  if (car.driver === 'traffic') {
    // Pull the driver out: they become a panicking pedestrian.
    const idx = G.traffic.indexOf(car);
    if (idx !== -1) G.traffic.splice(idx, 1);
    G.peds.push({
      x: car.x - Math.cos(car.angle) * 30, y: car.y - Math.sin(car.angle) * 30,
      angle: car.angle + Math.PI / 2, speed: 0, target: null, state: 'walk',
      panic: 4, color: '#e74c3c', shirt: '#e74c3c', walkPhase: 0, r: 11,
    });
    G.stats.carsStolen += 1;
    addWanted(G, 1, 'You stole a car in broad daylight.');
  }
  car.driver = 'player';
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  G.audio.ensure();
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  const side = { x: -Math.sin(car.angle), y: Math.cos(car.angle) };
  p.x = car.x + side.x * 34;
  p.y = car.y + side.y * 34;
  p.aimAngle = car.angle;
  car.driver = 'parked';
  car.speed *= 0.3;
  p.car = null;
}

function updatePlayer(dt, actions) {
  const p = G.player;
  if (p.invulnerable > 0) p.invulnerable -= dt;
  // Aim follows the mouse.
  const mw = mouseWorld();
  p.aimAngle = Math.atan2(mw.y - p.y, mw.x - p.x);

  if (p.car) {
    const car = p.car;
    const throttle = -input.driveY();
    const steer = input.driveX();
    const crashed = driveCar(car, throttle, steer, dt, G.city, G.cars);
    if (crashed) {
      const impact = Math.abs(car.speed);
      if (impact > 140) {
        car.health -= 8;
        G.shake = 10;
        G.audio.crash();
        if (car.health <= 0) {
          car.dead = true;
          G.particles.push({ kind: 'explosion', x: car.x, y: car.y, t: 0, life: 0.9 });
          p.car = null;
          G.message = 'Your car is wrecked.';
        }
      }
    }
    // Skid marks on hard turns at speed.
    if (Math.abs(steer) > 0.7 && Math.abs(car.speed) > 240 && Math.random() < 0.6) {
      G.particles.push({
        kind: 'skid', x: car.x - Math.cos(car.angle) * car.length / 2, y: car.y - Math.sin(car.angle) * car.length / 2,
        dx: -Math.cos(car.angle) * 10, dy: -Math.sin(car.angle) * 10, t: 0, life: 0.8,
      });
    }
    G.audio.engine(Math.abs(car.speed) / 560, Math.abs(throttle));
    G.audio.siren(G.wanted.stars > 0, dt);
    p.x = car.x;
    p.y = car.y;
    if (actions.interact) {
      // A waiting job at the garage can be started from the car too.
      if (G.nextMissionReady && Math.hypot(car.x - 760, car.y - 955) < 80) {
        G.nextMissionReady = false;
        G.mission.start(G.mission.index);
      } else {
        exitCar();
      }
    }
    return;
  }

  G.audio.engine(0, 0);
  G.audio.siren(G.wanted.stars > 0, dt);

  // On foot: WASD, sprint with Shift, slide along walls.
  const mx = input.driveX();
  const my = input.driveY();
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  if (len > 0) {
    const vx = (mx / len) * speed;
    const vy = (my / len) * speed;
    if (!isBlocked(G.city, p.x + vx * dt, p.y, p.r)) p.x += vx * dt;
    if (!isBlocked(G.city, p.x, p.y + vy * dt, p.r)) p.y += vy * dt;
    // Aim always follows the mouse, even while moving.
    p.aimAngle = Math.atan2(mw.y - p.y, mw.x - p.x);
  }
  resolveCollision(G.city, p);

  // Slow health regen when the heat is off.
  if (G.wanted.stars === 0 && p.health < 100) p.health = Math.min(100, p.health + 1.5 * dt);

  if (actions.shoot) shoot(G, p.aimAngle);
  if (actions.punch) punch(G);

  if (actions.interact) {
    const s = G.mission.state === 'running' ? G.mission.stepDef : null;
    const px = p.x;
    const py = p.y;
    // Mission pickup first.
    if (s && s.interact && Math.hypot(px - s.x, py - s.y) < s.radius) {
      G.consumeInteract = true;
      return;
    }
    // A waiting job at the garage (the kerb south of it, clear of the building).
    if (G.nextMissionReady && Math.hypot(px - 760, py - 955) < 80) {
      G.nextMissionReady = false;
      G.mission.start(G.mission.index);
      return;
    }
    // Otherwise: get in the nearest car (mission car first).
    const car = nearestEnterableCar(G.cars, G.mission.markerCar, px, py, CAR.enterRange);
    if (car) enterCar(car);
  }
}

function updateInteractPrompt() {
  const p = G.player;
  G.interactPrompt = '';
  if (G.screen !== 'play' || p.car) return;
  const s = G.mission.state === 'running' ? G.mission.stepDef : null;
  if (s && s.interact && Math.hypot(p.x - s.x, p.y - s.y) < s.radius) {
    G.interactPrompt = 'E — Pick it up';
    return;
  }
  if (G.nextMissionReady && Math.hypot(p.x - 760, p.y - 955) < 80) {
    G.interactPrompt = `E — Start job: ${G.mission.mission.title}`;
    return;
  }
  const car = nearestEnterableCar(G.cars, G.mission.markerCar, p.x, p.y, CAR.enterRange);
  if (car) {
    G.interactPrompt = car.driver === 'traffic' ? `E — Steal the ${car.name}` : `E — Get in the ${car.name}`;
  }
}

function startNewGame() {
  // A fresh world for a fresh run: rebuild the whole game state rather than
  // patching the old one, so every closure (mission runner, step function)
  // belongs to the new state. The old audio is stopped first.
  G.audio.stopMusic();
  G = buildGame(Math.floor(Math.random() * 4294967296));
  window.__solara.G = G;
  G.screen = 'play';
  G.cameraSnap = true;
  G.audio.ensure();
  G.audio.startMusic();
  G.mission.start(0);
  announce('Playing. First job: First Wheels.');
}

function continueGame(save) {
  G.player.cash = save.cash;
  G.player.x = save.x;
  G.player.y = save.y;
  G.player.health = save.health;
  G.player.ammo = save.ammo;
  G.mission.index = save.missionIndex;
  G.mission.completed = save.completed || [];
  G.stats = save.stats || G.stats;
  G.nextMissionReady = true;
  G.screen = 'play';
  G.cameraSnap = true;
  G.audio.ensure();
  G.audio.startMusic();
  announce('Playing. Head to the garage for your next job.');
}

function runShot(name) {
  G.screen = name === 'title' ? 'title' : 'play';
  stageShot(name, G, G.renderer, ctx);
  // The banner and HUD paint over the staged world, like the real game; the
  // title shot paints the title menu instead.
  if (name === 'title') {
    drawTitle(ctx, G, 0, false, VIEW.width, VIEW.height);
  } else {
    drawHUD(ctx, G, VIEW.width, VIEW.height);
  }
  window.__shotReady = true;
}

function runGame() {
  const inputLocal = input;
  let screen = 'title';
  let titleSelected = 0;
  let pauseSelected = 0;
  let accumulator = 0;
  let last = performance.now();
  const save = readSave();
  const hasSave = !!save;

  function setScreen(next) {
    screen = next;
    G.screen = next;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // End states (failed, wasted, busted, ending) are raised by the
    // simulation itself, which only knows G.screen: adopt them here, so the
    // right screen shows and its keys (R to retry) work.
    if (G.screen !== screen) setScreen(G.screen);

    function handleMute(actions) {
      if (actions.mute) {
        const muted = G.audio.toggleMute();
        G.message = muted ? 'Muted (M to unmute)' : 'Sound on';
        G.messageT = 2;
      }
    }

    if (screen === 'title') {
      const actions = inputLocal.takeActions();
      handleMute(actions);
      const options = hasSave ? ['Continue', 'New game'] : ['New game'];
      if (inputLocal.wasPressed('ArrowUp') || inputLocal.wasPressed('w')) titleSelected = (titleSelected + options.length - 1) % options.length;
      if (inputLocal.wasPressed('ArrowDown') || inputLocal.wasPressed('s')) titleSelected = (titleSelected + 1) % options.length;
      if (actions.confirm) {
        if (hasSave && titleSelected === 0) continueGame(save);
        else if (hasSave && titleSelected === 1) {
          clearSave();
          startNewGame();
        } else startNewGame();
        setScreen('play');
      }
      // The city lives behind the title.
      while (accumulator >= STEP) {
        G.stepWorld(STEP, true);
        accumulator -= STEP;
      }
      accumulator = 0;
      G.renderer.draw(G, ctx);
      drawTitle(ctx, G, titleSelected, hasSave, VIEW.width, VIEW.height);
      return;
    }

    if (screen === 'pause') {
      const actions = inputLocal.takeActions();
      handleMute(actions);
      if (actions.pause || actions.confirm) {
        if (actions.confirm) {
          if (pauseSelected === 0) setScreen('play');
          else if (pauseSelected === 1) {
            writeSave(G);
            setScreen('title');
          } else if (pauseSelected === 2) {
            G.mission.retry();
            setScreen('play');
          }
        } else setScreen('play');
      }
      if (inputLocal.wasPressed('ArrowUp') || inputLocal.wasPressed('w')) pauseSelected = (pauseSelected + 2) % 3;
      if (inputLocal.wasPressed('ArrowDown') || inputLocal.wasPressed('s')) pauseSelected = (pauseSelected + 1) % 3;
      G.renderer.draw(G, ctx);
      drawPause(ctx, pauseSelected, VIEW.width, VIEW.height);
      return;
    }

    if (screen === 'wasted' || screen === 'busted' || screen === 'failed') {
      const actions = inputLocal.takeActions();
      handleMute(actions);
      if (actions.retry || actions.confirm) {
        G.mission.retry();
        setScreen('play');
        announce('Playing. Try the job again.');
      }
      G.renderer.draw(G, ctx);
      drawHUD(ctx, G, VIEW.width, VIEW.height);
      drawEnd(ctx, screen, VIEW.width, VIEW.height);
      return;
    }

    if (screen === 'ending') {
      const actions = inputLocal.takeActions();
      handleMute(actions);
      if (actions.confirm) {
        setScreen('play');
        announce('Free roam. Solara Bay is yours.');
      }
      G.renderer.draw(G, ctx);
      drawHUD(ctx, G, VIEW.width, VIEW.height);
      drawEnd(ctx, 'ending', VIEW.width, VIEW.height);
      return;
    }

    // Play screen. Edge actions are read only when a simulation step will
    // run this frame, so a quick press is never swallowed by a step-less
    // frame; the press stays buffered for the next frame instead.
    if (accumulator < STEP) {
      G.renderer.draw(G, ctx);
      drawHUD(ctx, G, VIEW.width, VIEW.height);
      if (G.mission.banner) drawBanner(ctx, G.mission.banner, G.mission.bannerT, VIEW.width, VIEW.height);
      return;
    }
    const actions = inputLocal.takeActions();
    handleMute(actions);
    if (actions.pause) {
      setScreen('pause');
      announce('Paused.');
      return;
    }
    // Skip the mission intro card.
    if (G.mission.state === 'intro' && actions.confirm) {
      G.mission.state = 'running';
      G.mission.banner = null;
    }
    // Clear a passed banner after a few seconds.
    if (G.mission.state === 'passed') {
      G.mission.bannerT += 1 / 60;
      if (G.mission.bannerT > 3.5) G.mission.banner = null;
    }
    if (G.mission.banner && G.mission.state === 'intro') G.mission.bannerT += 1 / 60;

    while (accumulator >= STEP) {
      updatePlayer(STEP, actions);
      G.stepWorld(STEP, false);
      updateInteractPrompt();
      accumulator -= STEP;
      // Consume the frame's edge actions once.
      actions.interact = false;
      actions.shoot = false;
      actions.punch = false;
      actions.confirm = false;
    }

    G.renderer.draw(G, ctx);
    drawHUD(ctx, G, VIEW.width, VIEW.height);
    if (G.mission.banner) drawBanner(ctx, G.mission.banner, G.mission.bannerT, VIEW.width, VIEW.height);
  }

  announce('Solara Bay. Press Enter to start.');
  requestAnimationFrame(frame);
}

// Debug and test handle: playtests drive the game through this.
window.__solara = {
  G,
  version: '1.0.0',
  startMission(i) { G.mission.start(i); G.screen = 'play'; },
  setWanted(n) { G.wanted.stars = n; syncPolice(G); },
  blocked(x, y, r) { return isBlocked(G.city, x, y, r); },
  teleport(x, y) {
    G.player.x = x;
    G.player.y = y;
    if (G.player.car) {
      G.player.car.x = x;
      G.player.car.y = y;
    }
    G.cameraSnap = true;
  },
  state() {
    const p = G.player;
    return {
      screen: G.screen,
      x: Math.round(p.x), y: Math.round(p.y),
      health: Math.round(p.health), cash: p.cash, ammo: p.ammo,
      inCar: !!p.car, carSpeed: p.car ? Math.round(p.car.speed) : 0,
      wanted: G.wanted.stars,
      cops: G.wanted.cops.length, footCops: G.wanted.footCops.length,
      mission: G.mission.mission ? G.mission.mission.id : null,
      missionState: G.mission.state,
      missionStep: G.mission.step,
      traffic: G.traffic.length, peds: G.peds.length,
      cars: G.cars.length, bullets: G.bullets.length,
    };
  },
};

if (shot) runShot(shot);
else runGame();
