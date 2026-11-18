// Solara Bay: Neon Tide — boot and the one loop. Input is read every frame,
// the world advances in fixed 1/60 s steps, and the renderer paints what is
// there. Screens: title, play, paused, wasted, busted, mission failed and
// the ending. ?seed=N fixes the city. ?shot=chase|drive|foot|title stages
// that scene, runs the loop briefly and sets window.__shotReady.
import { TUNE, ARSENAL, ARSENAL_ORDER } from './config.js';
import { Seeded } from './rng.js';
import { generateTown, isSolid, pushOut } from './city.js';
import { buildSound } from './audio.js';
import { bindInput } from './input.js';
import { spawnVehicle, steerVehicle, refreshVehicleMesh, closestBoardable, harmVehicle } from './vehicles.js';
import { seedPopulation, stepFlow, stepWalkers } from './traffic.js';
import { newHeat, raiseHeat, matchForce, stepHeat, killPlayer } from './police.js';
import { fireWeapon, startReload, completeReload, swingMelee, stepFoes, clearFoes } from './combat.js';
import { newJobRunner, JOBS } from './missions.js';
import { buildRenderer } from './render.js';
import { buildHud } from './hud.js';
import { loadProgress, storeProgress, wipeProgress } from './save.js';
import { frameShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const status = document.getElementById('status');
function say(message) {
  if (status) status.textContent = message;
}

function assembleWorld(seedValue) {
  const dice = new Seeded(seedValue);
  const town = generateTown(dice);
  const sound = buildSound();
  const view = buildRenderer(document.getElementById('scene'));
  const solidHit = view.buildTownMeshes(town);

  const W = {
    dice, town, sound, view, solidHit,
    clock: 0,
    hour: TUNE.clock.firstHour,
    screen: 'title',
    note: '',
    noteT: 0,
    hint: '',
    useInteract: false,
    jobWaiting: false,
    whyFailed: '',
    snapCam: false,
    yaw: Math.PI,
    tiltTarget: 0.32,
    painFlash: 0,
    stagedTalk: false,
    tally: { cashEarned: 0, carsStolen: 0, missionsDone: 0, kills: 0 },
    hero: {
      // On Marlin Ave (road x=-40) just south of the garage: open asphalt.
      x: -40, z: 120, facing: Math.PI,
      health: 100, armor: 0, stamina: 100,
      cash: 250, rep: 0,
      car: null, moving: false, invuln: 0, r: TUNE.hero.girth,
      owned: ['fists', 'bat', 'pistol'],
      weapon: 'pistol',
      ammo: { fists: Infinity, bat: Infinity, pistol: 12, smg: 0, shotgun: 0, rifle: 0 },
      fireT: 0, reloadT: 0,
      mesh: null,
      velX: 0, velZ: 0,
      walkPhase: 0,
    },
    motors: [],
    flow: [],
    walkers: [],
    foes: [],
    heat: newHeat(),
    jobs: null,
  };
  W.jobs = newJobRunner(W);
  const pop = seedPopulation(dice, town, view);
  W.flow = pop.flow;
  W.walkers = pop.walkers;
  W.motors = [...pop.flow];
  for (const car of W.flow) {
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
  }
  for (const walker of W.walkers) {
    walker.mesh.userData.hitRef = { kind: 'ped', ref: walker };
  }

  // Rook himself: red shirt, dark jeans.
  const pm = view.buildPersonMesh(0xc0392b, 0x2c3e50, 0xe8b98a, { weapon: true, hair: 0x2a1a12 });
  view.scene.add(pm);
  W.hero.mesh = pm;

  // Parked cars around the city, free for the taking — all parked on roads.
  const parked = [
    ['sedan', -40, 40, Math.PI, 0x8e44ad],
    ['pickup', 40, -120, Math.PI / 2, 0x27ae60],
    ['sedan', 120, -40, 0, 0x2c3e50],
    ['van', -120, 200, Math.PI, 0xecf0f1],
    ['comet', 200, 40, Math.PI / 2, 0xe67e22],
    ['sedan', -40, 240, 0, 0x16a085],
    ['taxi', 120, 120, Math.PI, 0xf39c12],
  ];
  for (const [kind, x, z, facing, tint] of parked) {
    const car = spawnVehicle(kind, x, z, facing, tint);
    car.driver = 'parked';
    car.mesh = view.buildVehicleMesh(kind, tint);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = facing;
    view.scene.add(car.mesh);
    W.motors.push(car);
  }

  W.saveGame = () => storeProgress(W);
  W.resetHeat = () => {
    W.heat.stars = 0;
    W.heat.grabTimer = 0;
    matchForce(W);
  };
  W.onWasted = () => killPlayer(W);

  // One fixed step of the simulation. `auto` skips the hero's input (used
  // by the title screen background and the screenshot scenes).
  W.stepWorld = (dt, auto) => {
    W.clock += dt;
    W.hour += (dt * TUNE.clock.minsPerSec) / 60;
    if (W.hour >= 24 * 7) W.hour -= 24 * 7;
    if (W.noteT > 0) W.noteT -= dt;
    stepFlow(W, dt);
    stepWalkers(W, dt);
    stepHeat(W, dt);
    stepFoes(W, dt);
    if (W.jobs) W.jobs.update(dt);
    if (auto && W.hero.car) {
      steerVehicle(W.hero.car, 0.45, 0, dt, W.town, W.motors);
      refreshVehicleMesh(W.hero.car, dt);
      // The hero rides inside the car: keep their position on it, so the
      // chopper, the cops and the mission stages track the moving car —
      // not the spot where the hero got in (that left the chopper parked
      // behind while the car drove on).
      W.hero.x = W.hero.car.x;
      W.hero.z = W.hero.car.z;
    }
    // Engine smoke from wrecked cars.
    for (const car of W.motors) {
      if (!car.dead && car.health < 40 && Math.random() < 0.25) {
        W.view.spawnSmoke(car.x - Math.sin(car.facing) * car.long / 2, 1.2, car.z - Math.cos(car.facing) * car.long / 2);
      }
    }
    // Near-miss + drift bonuses for the hero's driving.
    const h = W.hero;
    if (h.car && !h.car.dead) {
      const car = h.car;
      for (const other of W.flow) {
        if (other.dead) continue;
        other.nearMissT = Math.max(0, (other.nearMissT || 0) - dt);
        if (other.nearMissT > 0) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < TUNE.wheels.closeCallDist + 1 && Math.abs(car.speed) > TUNE.wheels.closeCallSpeed) {
          other.nearMissT = 5;
          h.rep += 25;
          h.cash += 10;
          W.note = 'NEAR MISS +25 REP';
          W.noteT = 2;
          if (W.sound) W.sound.nearMiss();
        }
      }
      if (!car.sliding && car.slideScore > 1.5) {
        const bonus = Math.round(car.slideScore) * 15;
        h.cash += bonus;
        h.rep += Math.round(car.slideScore) * 10;
        W.note = `DRIFT +$${bonus}`;
        W.noteT = 2;
        car.slideScore = 0;
      } else if (!car.sliding) car.slideScore = 0;
    }
  };
  return W;
}

const W = assembleWorld(seed);
const keys = bindInput(W.view.renderer.domElement);
const face = buildHud(W);
W.keys = keys;
W.face = face;

function boardCar(car) {
  const h = W.hero;
  if (car.driver === 'flow') {
    const idx = W.flow.indexOf(car);
    if (idx !== -1) W.flow.splice(idx, 1);
    // The driver becomes a panicking pedestrian.
    const walker = {
      x: car.x - Math.cos(car.facing) * 2, z: car.z + Math.sin(car.facing) * 2,
      facing: car.facing + Math.PI / 2, speed: 0, target: null, state: 'walk',
      panic: 4, r: 0.55, walkPhase: 0, cop: false, mesh: null,
    };
    walker.mesh = W.view.buildPersonMesh(0xe74c3c, 0x2c3e50, 0xe8b98a);
    walker.mesh.userData.hitRef = { kind: 'ped', ref: walker };
    W.view.scene.add(walker.mesh);
    W.walkers.push(walker);
    W.tally.carsStolen += 1;
    raiseHeat(W, 1, 'You stole a car in broad daylight.');
  }
  car.driver = 'hero';
  h.car = car;
  h.x = car.x;
  h.z = car.z;
  h.mesh.visible = false;
  W.sound.ensure();
}

function leaveCar() {
  const h = W.hero;
  const car = h.car;
  if (!car) return;
  // Step out on the driver's side.
  const sideX = -Math.cos(car.facing);
  const sideZ = Math.sin(car.facing);
  h.x = car.x + sideX * 2.4;
  h.z = car.z + sideZ * 2.4;
  h.facing = car.facing;
  car.driver = 'parked';
  car.speed *= 0.3;
  h.car = null;
  h.mesh.visible = true;
  pushOut(W.town, h);
}

function syncHeroMesh(dt) {
  const h = W.hero;
  const m = h.mesh;
  if (!m) return;
  m.visible = !h.car;
  if (h.car) return;
  m.position.set(h.x, 0, h.z);
  // Face the movement direction, or the camera when aiming a gun.
  const aiming = ARSENAL[h.weapon].style === 'gun' && (keys.mouse.held || keys.mouse.rightHeld);
  const targetFacing = aiming ? W.yaw : h.facing;
  let diff = targetFacing - m.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  m.rotation.y += diff * Math.min(1, dt * 12);
  const u = m.userData;
  if (u.gun) u.gun.visible = ARSENAL[h.weapon].style === 'gun';
  if (u.legL) {
    if (h.moving) {
      h.walkPhase += dt * 11;
      const s = Math.sin(h.walkPhase) * 0.6;
      u.legL.rotation.x = s;
      u.legR.rotation.x = -s;
      u.armL.rotation.x = -s * 0.6;
      u.armR.rotation.x = aiming ? -1.2 : s * 0.6;
    } else {
      u.legL.rotation.x *= 0.8;
      u.legR.rotation.x *= 0.8;
      u.armL.rotation.x *= 0.8;
      u.armR.rotation.x = aiming ? -1.2 : u.armR.rotation.x * 0.8;
    }
  }
}

function stepHero(dt, actions) {
  const h = W.hero;
  if (h.invuln > 0) h.invuln -= dt;
  if (h.fireT > 0) h.fireT -= dt;
  if (h.reloadT > 0) {
    h.reloadT -= dt;
    if (h.reloadT <= 0) completeReload(W);
  }
  // Mouse-look.
  const look = keys.grabLook();
  W.yaw -= look.dx * 0.0023;
  W.tiltTarget = Math.max(TUNE.lens.tiltLow, Math.min(TUNE.lens.tiltHigh, W.tiltTarget + look.dy * 0.002));
  // While driving, the camera swings behind the car unless the player is
  // looking around with the mouse — otherwise the lens points wherever the
  // mouse last left it while the car drives elsewhere (and the police
  // chopper, which flies ahead of the car, ends up off-screen to the side).
  if (h.car && look.dx === 0) {
    let diff = h.car.facing - W.yaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    W.yaw += diff * Math.min(1, dt * 2.2);
  }
  W.view.camState.yaw = W.yaw;

  if (actions.weapon) {
    const key = ARSENAL_ORDER[actions.weapon - 1];
    if (key && h.owned.includes(key) && h.weapon !== key) {
      h.weapon = key;
      h.reloadT = 0;
      if (W.sound) W.sound.click();
    }
  }
  if (actions.reload) startReload(W);

  if (h.car) {
    const car = h.car;
    const throttle = keys.advance();
    const steer = -keys.strafe();
    const smashed = steerVehicle(car, throttle, steer, dt, W.town, W.motors, {
      handbrake: keys.brake,
      nitro: keys.boost,
    });
    refreshVehicleMesh(car, dt);
    if (smashed) {
      const impact = Math.abs(car.speed);
      if (impact > TUNE.wheels.smashAt) {
        harmVehicle(W, car, (impact - TUNE.wheels.smashAt) * TUNE.wheels.smashDamage * 3);
        W.view.addShake(6);
        W.sound.crash();
      }
    }
    W.sound.engine(Math.abs(car.speed) / 55, Math.abs(throttle));
    h.x = car.x;
    h.z = car.z;
    if (actions.interact) {
      if (W.jobWaiting && Math.hypot(car.x - (W.town.spots.garage.x + 24), car.z - (W.town.spots.garage.z + 18)) < 16) {
        W.jobWaiting = false;
        W.jobs.start(W.jobs.index);
      } else {
        leaveCar();
      }
    }
    return;
  }

  W.sound.engine(0, 0);

  // On foot: WASD relative to the camera, sprint with Shift.
  const mx = keys.strafe();
  const my = keys.advance();
  const len = Math.hypot(mx, my);
  h.moving = len > 0;
  const sprinting = keys.running && h.stamina > 0 && len > 0;
  const speed = sprinting ? TUNE.hero.dash : TUNE.hero.stroll;
  if (sprinting) h.stamina = Math.max(0, h.stamina - TUNE.hero.windUse * dt);
  else h.stamina = Math.min(100, h.stamina + TUNE.hero.windBack * dt);
  if (len > 0) {
    const f = { x: Math.sin(W.yaw), z: Math.cos(W.yaw) };
    const r = { x: -Math.cos(W.yaw), z: Math.sin(W.yaw) };
    const dx = (f.x * my + r.x * mx) / len;
    const dz = (f.z * my + r.z * mx) / len;
    h.velX += (dx * speed - h.velX) * Math.min(1, dt * 10);
    h.velZ += (dz * speed - h.velZ) * Math.min(1, dt * 10);
    h.facing = Math.atan2(dx, dz);
  } else {
    h.velX *= Math.max(0, 1 - dt * 10);
    h.velZ *= Math.max(0, 1 - dt * 10);
  }
  const nx = h.x + h.velX * dt;
  const nz = h.z + h.velZ * dt;
  if (!isSolid(W.town, nx, h.z, h.r)) h.x = nx;
  if (!isSolid(W.town, h.x, nz, h.r)) h.z = nz;
  pushOut(W.town, h);

  // Slow health regen when the heat is off.
  if (W.heat.stars === 0 && h.health < 100) h.health = Math.min(100, h.health + 1.5 * dt);

  // Shooting: autos fire while held, semi-autos fire per click.
  const def = ARSENAL[h.weapon];
  if (def.style === 'gun') {
    if (def.hold ? keys.mouse.held : actions.shootClick) fireWeapon(W);
  } else if (actions.shootClick) {
    swingMelee(W, def);
  }
  if (actions.punch) swingMelee(W, ARSENAL.fists);

  if (actions.interact) {
    const s = W.jobs.state === 'running' ? W.jobs.stageDef : null;
    if (s && s.type === 'interact' && Math.hypot(h.x - s.x, h.z - s.z) < s.range) {
      W.useInteract = true;
      return;
    }
    if (W.jobWaiting && Math.hypot(h.x - (W.town.spots.garage.x + 24), h.z - (W.town.spots.garage.z + 18)) < 16) {
      W.jobWaiting = false;
      W.jobs.start(W.jobs.index);
      return;
    }
    const car = closestBoardable(W.motors, W.jobs.markerCar, h.x, h.z, TUNE.hero.boardReach);
    if (car) boardCar(car);
  }
}

function refreshHint() {
  const h = W.hero;
  W.hint = '';
  if (W.screen !== 'play') return;
  const gx = W.town.spots.garage.x + 24;
  const gz = W.town.spots.garage.z + 18;
  if (W.jobWaiting && Math.hypot(h.x - gx, h.z - gz) < 16) {
    W.hint = `E — Start job: ${W.jobs.job.name}`;
    return;
  }
  if (h.car) return;
  const s = W.jobs.state === 'running' ? W.jobs.stageDef : null;
  if (s && s.type === 'interact' && Math.hypot(h.x - s.x, h.z - s.z) < s.range) {
    W.hint = 'E — Pick up Rosa';
    return;
  }
  const car = closestBoardable(W.motors, W.jobs.markerCar, h.x, h.z, TUNE.hero.boardReach);
  if (car) {
    W.hint = car.driver === 'flow' ? `E — Steal the ${car.label}` : `E — Get in the ${car.label}`;
  }
}

function refreshBeacon() {
  const beacon = W.beacon;
  if (!beacon) return;
  const s = W.jobs && W.jobs.state === 'running' ? W.jobs.stageDef : null;
  let tx = null;
  let tz = null;
  if (s) {
    if (s.type === 'car' && W.jobs.markerCar) {
      tx = W.jobs.markerCar.x;
      tz = W.jobs.markerCar.z;
    } else if (s.x !== undefined) {
      tx = s.x;
      tz = s.z;
    }
  } else if (W.jobWaiting) {
    tx = W.town.spots.garage.x + 24;
    tz = W.town.spots.garage.z + 18;
  }
  if (tx === null) {
    beacon.visible = false;
    return;
  }
  beacon.visible = true;
  beacon.position.set(tx, 0, tz);
  const u = beacon.userData;
  u.diamond.position.y = 6 + Math.sin(W.clock * 2.4) * 0.8;
  u.diamond.rotation.y += 0.02;
  const pulse = 1 + Math.sin(W.clock * 2.4) * 0.08;
  u.ring.scale.set(pulse, pulse, pulse);
}

function resetForFreshGame() {
  const h = W.hero;
  h.x = -40;
  h.z = 120;
  h.facing = Math.PI;
  h.health = 100;
  h.armor = 0;
  h.stamina = 100;
  h.cash = 250;
  h.rep = 0;
  h.owned = ['fists', 'bat', 'pistol'];
  h.weapon = 'pistol';
  h.ammo = { fists: Infinity, bat: Infinity, pistol: 12, smg: 0, shotgun: 0, rifle: 0 };
  h.fireT = 0;
  h.reloadT = 0;
  if (h.car) {
    h.car.driver = 'parked';
    h.car = null;
  }
  h.mesh.visible = true;
  W.heat.stars = 0;
  W.heat.grabTimer = 0;
  matchForce(W);
  clearFoes(W);
  W.jobs.index = 0;
  W.jobs.stage = 0;
  W.jobs.finished = [];
  W.jobs.state = 'idle';
  W.jobs.live = false;
  W.jobs.banner = null;
  W.jobs.bannerT = 0;
  W.jobs.dialogue = null;
  W.jobWaiting = false;
  W.tally = { cashEarned: 0, carsStolen: 0, missionsDone: 0, kills: 0 };
  W.hour = TUNE.clock.firstHour;
  W.yaw = Math.PI;
  W.snapCam = true;
  wipeProgress();
}

function beginFreshGame() {
  resetForFreshGame();
  W.screen = 'play';
  W.sound.ensure();
  W.sound.startMusic();
  W.jobs.start(0);
  say('Playing. First job: Back in Town.');
}

function resumeGame(save) {
  const h = W.hero;
  h.cash = save.cash;
  h.rep = save.rep || 0;
  h.x = save.x;
  h.z = save.z;
  h.facing = save.facing || 0;
  h.health = save.health;
  h.armor = save.armor || 0;
  h.owned = save.owned || ['fists', 'bat', 'pistol'];
  if (!h.owned.includes(h.weapon)) h.weapon = 'pistol';
  h.ammo = { fists: Infinity, bat: Infinity, pistol: 12, smg: 30, shotgun: 6, rifle: 24 };
  W.jobs.index = save.jobIndex;
  W.jobs.finished = save.finished || [];
  W.tally = save.tally || W.tally;
  W.hour = save.hour || TUNE.clock.firstHour;
  W.jobWaiting = true;
  W.yaw = h.facing;
  W.screen = 'play';
  W.snapCam = true;
  W.sound.ensure();
  W.sound.startMusic();
  say('Playing. Head to the garage for your next job.');
}

W.beacon = W.view.buildBeacon();

function runScene(name) {
  frameShot(name, W);
  face.setSplashVisible(name === 'title');
  face.setHudVisible(name !== 'title');
  let frames = 0;
  const t0 = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    frames += 1;
    if (name === 'title') {
      W.yaw += 0.0006;
      W.view.camState.yaw = W.yaw;
    }
    // Step the world several times per rendered frame so the scene settles
    // in the same amount of game time even on a slow software renderer.
    for (let i = 0; i < 3; i += 1) W.stepWorld(STEP, true);
    // Snap the camera every frame: at ~2 fps the lerp would trail metres
    // behind a fast car and the player's own car would leave the frame.
    W.view.camState.yaw = W.yaw;
    W.snapCam = true;
    W.view.refreshCamera(W, STEP);
    W.view.refreshSky(W.hour);
    W.view.stepParticles(STEP);
    refreshBeacon();
    if (W.stagedTalk && W.jobs.dialogue) {
      face.showChat(W.jobs.dialogue.lines[0]);
      face.finishChat();
    }
    face.refresh(STEP);
    syncHeroMesh(STEP);
    for (const car of W.motors) if (!car.dead) refreshVehicleMesh(car, STEP);
    W.view.render();
    // Ready after ~2 s of game time, or 12 s of wall time on slow renderers
    // (SwiftShader manages ~2 fps, so a frame count alone would take a minute).
    if (frames >= 40 || performance.now() - t0 > 12000) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

function runLoop() {
  let screen = 'title';
  let titleSelected = 0;
  let pauseSelected = 0;
  let accumulator = 0;
  let last = performance.now();
  const save = loadProgress();
  const hasSave = !!save;
  const titleBtns = [face.el.continueBtn, face.el.newGameBtn].filter(Boolean);

  function setScreen(next) {
    screen = next;
    W.screen = next;
    face.setSplashVisible(next === 'title');
    face.setHudVisible(next !== 'title');
    face.setPauseVisible(next === 'pause');
    if (next !== 'wasted' && next !== 'busted' && next !== 'failed' && next !== 'ending') face.hideEnd();
    if (next === 'wasted' || next === 'busted' || next === 'failed' || next === 'ending') {
      face.showEnd(next);
    }
  }

  function paintTitleSelection() {
    titleBtns.forEach((b, i) => b.classList.toggle('selected', i === titleSelected));
  }
  paintTitleSelection();

  function startFromTitle() {
    if (hasSave && titleSelected === 0) resumeGame(save);
    else {
      wipeProgress();
      beginFreshGame();
    }
    setScreen('play');
  }

  if (face.el.continueBtn) {
    face.el.continueBtn.style.display = hasSave ? 'block' : 'none';
    face.el.continueBtn.addEventListener('click', () => {
      titleSelected = 0;
      W.sound.click();
      startFromTitle();
    });
  }
  if (face.el.newGameBtn) {
    face.el.newGameBtn.addEventListener('click', () => {
      titleSelected = hasSave ? 1 : 0;
      W.sound.click();
      startFromTitle();
    });
  }
  const pauseBtns = [document.getElementById('btn-resume'), document.getElementById('btn-savequit'), document.getElementById('btn-restart')];
  function paintPauseSelection() {
    pauseBtns.forEach((b, i) => b && b.classList.toggle('selected', i === pauseSelected));
  }
  function pauseAction(i) {
    if (i === 0) setScreen('play');
    else if (i === 1) {
      storeProgress(W);
      setScreen('title');
    } else if (i === 2) {
      W.jobs.retry();
      setScreen('play');
    }
  }
  pauseBtns.forEach((b, i) => b && b.addEventListener('click', () => {
    W.sound.click();
    pauseAction(i);
  }));
  if (face.el.endBtn) {
    face.el.endBtn.addEventListener('click', () => {
      W.sound.click();
      if (screen === 'ending') setScreen('play');
      else {
        W.jobs.retry();
        setScreen('play');
      }
    });
  }

  setScreen('title');

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (W.screen !== screen) setScreen(W.screen);

    function handleMute(actions) {
      if (actions.mute) {
        const muted = W.sound.toggleMute();
        W.note = muted ? 'Muted (M to unmute)' : 'Sound on';
        W.noteT = 2;
      }
    }

    if (screen === 'title') {
      const actions = keys.grabActions();
      handleMute(actions);
      const options = hasSave ? 2 : 1;
      if (keys.tapped('ArrowUp') || keys.tapped('w')) {
        titleSelected = (titleSelected + options - 1) % options;
        paintTitleSelection();
      }
      if (keys.tapped('ArrowDown') || keys.tapped('s')) {
        titleSelected = (titleSelected + 1) % options;
        paintTitleSelection();
      }
      if (actions.confirm) startFromTitle();
      while (accumulator >= STEP) {
        W.yaw += STEP * 0.03;
        W.stepWorld(STEP, true);
        accumulator -= STEP;
      }
      accumulator = 0;
      W.view.camState.yaw = W.yaw;
      W.view.refreshCamera(W, STEP);
      W.view.refreshSky(W.hour);
      W.view.stepParticles(STEP);
      W.view.render();
      return;
    }

    if (screen === 'pause') {
      const actions = keys.grabActions();
      handleMute(actions);
      if (actions.pause) setScreen('play');
      if (actions.confirm) pauseAction(pauseSelected);
      if (keys.tapped('ArrowUp') || keys.tapped('w')) {
        pauseSelected = (pauseSelected + 2) % 3;
        paintPauseSelection();
      }
      if (keys.tapped('ArrowDown') || keys.tapped('s')) {
        pauseSelected = (pauseSelected + 1) % 3;
        paintPauseSelection();
      }
      W.view.render();
      return;
    }

    if (screen === 'wasted' || screen === 'busted' || screen === 'failed') {
      const actions = keys.grabActions();
      handleMute(actions);
      if (actions.retry || actions.confirm) {
        W.jobs.retry();
        setScreen('play');
        say('Playing. Try the job again.');
      }
      W.view.render();
      return;
    }

    if (screen === 'ending') {
      const actions = keys.grabActions();
      handleMute(actions);
      if (actions.confirm) {
        setScreen('play');
        say('Free roam. Solara Bay is yours.');
      }
      W.view.render();
      return;
    }

    // Play screen.
    if (accumulator < STEP) {
      W.view.refreshCamera(W, 1 / 60);
      W.view.render();
      face.refresh(1 / 60);
      return;
    }
    const actions = keys.grabActions();
    handleMute(actions);
    if (actions.pause) {
      setScreen('pause');
      say('Paused.');
      return;
    }
    // Dialogue: confirm advances; the world keeps moving behind it.
    if (W.jobs.state === 'dialogue' && W.jobs.dialogue) {
      const line = W.jobs.dialogue.lines[W.jobs.dialogue.at];
      face.showChat(line);
      if (actions.confirm || actions.interact) {
        W.sound.click();
        W.jobs.nextLine();
        if (W.jobs.state !== 'dialogue') face.hideChat();
      }
    } else if (!W.stagedTalk) {
      face.hideChat();
    }
    if (W.jobs.banner) {
      W.jobs.bannerT += 1 / 60;
      if (W.jobs.bannerT > 4) W.jobs.banner = null;
    }

    while (accumulator >= STEP) {
      if (W.jobs.state !== 'dialogue') stepHero(STEP, actions);
      else keys.grabLook();
      W.stepWorld(STEP, false);
      refreshHint();
      accumulator -= STEP;
      actions.interact = false;
      actions.shootClick = false;
      actions.punch = false;
      actions.confirm = false;
    }

    refreshBeacon();
    syncHeroMesh(1 / 60);
    for (const car of W.motors) if (!car.dead) refreshVehicleMesh(car, 1 / 60);
    W.view.refreshCamera(W, 1 / 60);
    W.view.refreshSky(W.hour);
    W.view.stepParticles(1 / 60);
    W.view.render();
    face.refresh(1 / 60);
  }

  say('Solara Bay: Neon Tide. Press Enter to start.');
  requestAnimationFrame(frame);
}

// Debug and test handle: playtests drive the game through this.
window.__solara = {
  W,
  version: '3.0.0',
  startMission(i) { W.jobs.start(i); W.screen = 'play'; },
  setWanted(n) { W.heat.stars = n; matchForce(W); },
  blocked(x, z, r) { return isSolid(W.town, x, z, r); },
  teleport(x, z) {
    W.hero.x = x;
    W.hero.z = z;
    if (W.hero.car) {
      W.hero.car.x = x;
      W.hero.car.z = z;
    }
    W.snapCam = true;
  },
  state() {
    const h = W.hero;
    return {
      screen: W.screen,
      x: Math.round(h.x), z: Math.round(h.z),
      health: Math.round(h.health), armor: Math.round(h.armor), cash: h.cash, rep: h.rep,
      weapon: h.weapon, ammo: h.ammo[h.weapon],
      inCar: !!h.car, carSpeed: h.car ? Math.round(h.car.speed * 2.237) : 0,
      wanted: W.heat.stars,
      cops: W.heat.cruisers.length, footCops: W.heat.beat.length, heli: !!W.heat.chopper,
      mission: W.jobs.job ? W.jobs.job.key : null,
      missionState: W.jobs.state,
      missionStep: W.jobs.stage,
      killsDone: W.jobs.downCount,
      traffic: W.flow.length, peds: W.walkers.length, enemies: W.foes.length,
      cars: W.motors.length, hour: W.hour.toFixed(2),
    };
  },
};

if (shot) runScene(shot);
else runLoop();
