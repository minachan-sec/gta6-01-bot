// Solara Bay: Neon Tide — boot, the main loop, and the glue between every
// module. The world object W is built here and handed to each system.
import { CFG, WEAPONS, WEAPON_ORDER } from './config.js';
import { Rng } from './rng.js';
import { generateCity, isSolid, pushOut, LANDMARKS } from './city.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { makeCar, driveCar, syncCarMesh, nearestCar, damageCar } from './vehicles.js';
import { spawnPopulation, updateTraffic, updatePeds, scarePeds, syncPedMesh } from './traffic.js';
import { createWanted, addWanted, syncPolice, updateWanted } from './police.js';
import { shoot, reload, finishReload, melee, updateEnemies, clearEnemies } from './combat.js';
import { createMissions, MISSION_DEFS } from './missions.js';
import { createRenderer } from './render.js';
import { createHUD } from './hud.js';
import { readSave, writeSave, clearSave } from './save.js';
import { stageShot } from './shots.js';

const STEP = 1 / 60;
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const statusEl = document.getElementById('status');
function announce(message) {
  if (statusEl) statusEl.textContent = message;
}

function buildWorld(seedValue) {
  const rng = new Rng(seedValue);
  const city = generateCity(rng);
  const audio = createAudio();
  const renderer = createRenderer(document.getElementById('scene'));
  renderer.buildCityMeshes(city);

  const W = {
    rng, city, audio, renderer,
    time: 0,
    gameHour: CFG.time.startHour,
    screen: 'title',
    message: '',
    messageT: 0,
    interactPrompt: '',
    consumeInteract: false,
    nextReady: false,
    failReason: '',
    cameraSnap: true,
    camYaw: Math.PI,
    camPitch: 0.32,
    hudFlash: 0,
    showStagedDialogue: false,
    panicAt: null,
    panicT: 0,
    stats: { earned: 0, stolen: 0, done: 0, kills: 0 },
    player: {
      x: LANDMARKS.playerStart.x,
      z: LANDMARKS.playerStart.z,
      heading: LANDMARKS.playerStart.heading,
      health: 100, armor: 0, stamina: 100,
      cash: 250, rep: 0,
      car: null, moving: false, invuln: 0, r: CFG.player.radius,
      weapons: ['fists', 'bat', 'pistol'],
      weapon: 'pistol',
      ammo: { fists: Infinity, bat: Infinity, pistol: 12, smg: 0, shotgun: 0, rifle: 0 },
      fireT: 0, reloadT: 0,
      mesh: null,
      velX: 0, velZ: 0, walkPhase: 0,
    },
    cars: [],
    traffic: [],
    peds: [],
    enemies: [],
    wanted: createWanted(),
    mission: null,
  };
  W.mission = createMissions(W);
  const pop = spawnPopulation(rng, city, renderer);
  W.traffic = pop.traffic;
  W.peds = pop.peds;
  W.cars = [...pop.traffic];

  // Rook himself.
  const pm = renderer.makePersonMesh(0xc0392b, 0x2c3e50, 0xe8b98a, { weapon: true, hair: 0x2a1a12 });
  renderer.scene.add(pm);
  W.player.mesh = pm;

  // Parked cars around the city, free for the taking — all parked on roads,
  // and none on a mission driving line (M4 races down x=160, M5 flees up
  // x=-80 — a parked car on either would block the route).
  const parked = [
    ['sedan', -80, -320, Math.PI, 0x8e44ad],
    ['pickup', 80, -120, Math.PI / 2, 0x27ae60],
    ['sedan', 160, -40, 0, 0x2c3e50],
    ['van', -160, 200, Math.PI, 0xecf0f1],
    ['comet', -240, 120, Math.PI / 2, 0xe67e22],
    ['sedan', 0, 240, 0, 0x16a085],
    ['taxi', 160, 200, Math.PI, 0xf39c12],
  ];
  for (const [type, x, z, heading, color] of parked) {
    const car = makeCar(type, x, z, heading, color);
    car.driver = 'parked';
    car.mesh = renderer.makeCarMesh(type, color);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    renderer.scene.add(car.mesh);
    W.cars.push(car);
  }

  W.saveGame = () => writeSave(W);
  W.resetWanted = () => {
    W.wanted.stars = 0;
    W.wanted.bustT = 0;
    syncPolice(W);
  };

  // One fixed step of the simulation. `auto` skips the player's input (used
  // by the title screen background and the screenshot scenes).
  W.stepWorld = (dt, auto) => {
    W.time += dt;
    W.gameHour += (dt * CFG.time.minutesPerSecond) / 60;
    if (W.gameHour >= 24 * 7) W.gameHour -= 24 * 7;
    if (W.messageT > 0) W.messageT -= dt;
    if (W.panicT > 0) {
      W.panicT -= dt;
      if (W.panicT <= 0) W.panicAt = null;
    }
    if (W.mission.banner) {
      W.mission.bannerT += dt;
      if (W.mission.bannerT > 4) W.mission.banner = null;
    }
    updateTraffic(W, dt);
    updatePeds(W, dt);
    updateWanted(W, dt);
    updateEnemies(W, dt);
    if (W.mission) W.mission.update(dt);
    if (auto && W.player.car) {
      driveCar(W.player.car, 0.45, 0, dt, W.city, W.cars);
      syncCarMesh(W.player.car, dt);
      W.player.x = W.player.car.x;
      W.player.z = W.player.car.z;
    }
    // Engine smoke from wrecked cars.
    for (const car of W.cars) {
      if (!car.dead && car.health < CFG.driving.smokeBelow && Math.random() < dt * 2) {
        W.renderer.spawnSmoke(car.x - Math.sin(car.heading) * car.len / 2, 1.2, car.z - Math.cos(car.heading) * car.len / 2);
      }
    }
    // Near-miss + drift bonuses for the player's driving.
    const p = W.player;
    if (p.car && !p.car.dead) {
      const car = p.car;
      for (const other of W.traffic) {
        if (other.dead) continue;
        other.nearMissT = Math.max(0, (other.nearMissT || 0) - dt);
        if (other.nearMissT > 0) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < CFG.driving.nearMissDist + 1 && Math.abs(car.speed) > CFG.driving.nearMissMinSpeed) {
          other.nearMissT = 5;
          p.rep += CFG.driving.nearMissRep;
          p.cash += CFG.driving.nearMissCash;
          W.message = `NEAR MISS +${CFG.driving.nearMissRep} REP`;
          W.messageT = 2;
          if (W.audio) W.audio.nearMiss();
        }
      }
      if (!car.drifting && car.driftScore > 1.5) {
        const bonus = Math.round(car.driftScore) * CFG.driving.driftBonusPerPoint;
        p.cash += bonus;
        p.rep += Math.round(car.driftScore) * 10;
        W.message = `DRIFT +$${bonus}`;
        W.messageT = 2;
        car.driftScore = 0;
      } else if (!car.drifting) {
        car.driftScore = 0;
      }
    }
  };
  return W;
}

const W = buildWorld(seed);
const input = createInput(W.renderer.renderer.domElement);
const hud = createHUD(W);
W.input = input;
W.hud = hud;
W.markerMesh = W.renderer.makeMarker();

function enterCar(car) {
  const p = W.player;
  if (car.driver === 'traffic') {
    const idx = W.traffic.indexOf(car);
    if (idx !== -1) W.traffic.splice(idx, 1);
    // The driver becomes a panicking pedestrian.
    const ped = {
      x: car.x - Math.cos(car.heading) * 2, z: car.z + Math.sin(car.heading) * 2,
      heading: car.heading + Math.PI / 2, speed: 2, state: 'walk',
      panic: 4, r: 0.55, walkPhase: 0, mesh: null,
    };
    ped.mesh = W.renderer.makePersonMesh(0xe74c3c, 0x2c3e50, 0xe8b98a);
    ped.mesh.userData.hitRef = { kind: 'ped', ref: ped };
    W.renderer.scene.add(ped.mesh);
    W.peds.push(ped);
    W.stats.stolen += 1;
    addWanted(W, 1, 'You stole a car in broad daylight.');
    scarePeds(W, car.x, car.z, 20);
  }
  car.driver = 'player';
  p.car = car;
  p.x = car.x;
  p.z = car.z;
  p.mesh.visible = false;
  W.audio.ensure();
}

function exitCar() {
  const p = W.player;
  const car = p.car;
  if (!car) return;
  const sideX = -Math.cos(car.heading);
  const sideZ = Math.sin(car.heading);
  p.x = car.x + sideX * 2.4;
  p.z = car.z + sideZ * 2.4;
  p.heading = car.heading;
  car.driver = 'parked';
  car.speed *= 0.3;
  p.car = null;
  p.mesh.visible = true;
  pushOut(W.city, p);
}

function syncPlayerMesh(dt) {
  const p = W.player;
  const m = p.mesh;
  if (!m) return;
  m.visible = !p.car;
  if (p.car) return;
  m.position.set(p.x, 0, p.z);
  const aiming = WEAPONS[p.weapon].kind === 'gun' && (input.mouse.down || input.mouse.rightDown);
  const targetHeading = aiming ? W.camYaw : p.heading;
  let diff = targetHeading - m.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  m.rotation.y += diff * Math.min(1, dt * 12);
  const u = m.userData;
  if (u.gun) u.gun.visible = WEAPONS[p.weapon].kind === 'gun';
  if (u.legL) {
    if (p.moving) {
      p.walkPhase += dt * 11;
      const s = Math.sin(p.walkPhase) * 0.6;
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

function garagePoint() {
  // The garage itself, on road x=0 — the mission-start trigger.
  return { x: W.city.landmarks.garage.x, z: W.city.landmarks.garage.z };
}

function updatePlayer(dt, actions) {
  const p = W.player;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.fireT > 0) p.fireT -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) finishReload(W);
  }
  // Mouse-look.
  const look = input.takeLook();
  W.camYaw -= look.dx * CFG.camera.lookSpeed;
  W.camPitch = Math.max(CFG.camera.pitchMin, Math.min(CFG.camera.pitchMax, W.camPitch + look.dy * 0.002));
  W.renderer.camState.yaw = W.camYaw;
  W.renderer.camState.pitch = W.camPitch;

  if (actions.weapon) {
    const key = WEAPON_ORDER[actions.weapon - 1];
    if (key && p.weapons.includes(key) && p.weapon !== key) {
      p.weapon = key;
      p.reloadT = 0;
      if (W.audio) W.audio.click();
    }
  }
  if (actions.reload) reload(W);

  if (p.car) {
    const car = p.car;
    const throttle = input.moveY();
    const steer = -input.moveX();
    const crashed = driveCar(car, throttle, steer, dt, W.city, W.cars, {
      handbrake: input.handbrake,
      nitro: input.nitro,
    });
    syncCarMesh(car, dt);
    if (crashed) {
      const impact = Math.abs(car.speed);
      if (impact > CFG.driving.collisionSpeed) {
        damageCar(W, car, (impact - CFG.driving.collisionSpeed) * CFG.driving.collisionDamage * 3);
        W.renderer.addShake(6);
        W.audio.crash();
      }
    }
    W.audio.engine(Math.abs(car.speed) / 55, Math.abs(throttle));
    p.x = car.x;
    p.z = car.z;
    if (actions.interact) {
      const g = garagePoint();
      if (W.nextReady && Math.hypot(car.x - g.x, car.z - g.z) < 16) {
        W.nextReady = false;
        W.mission.start(W.mission.index);
      } else {
        exitCar();
      }
    }
    return;
  }

  W.audio.engine(0, 0);

  // On foot: WASD relative to the camera, sprint with Shift.
  const mx = input.moveX();
  const my = input.moveY();
  const len = Math.hypot(mx, my);
  p.moving = len > 0;
  const sprinting = input.sprint && p.stamina > 0 && len > 0;
  const speed = sprinting ? CFG.player.sprintSpeed : CFG.player.walkSpeed;
  if (sprinting) p.stamina = Math.max(0, p.stamina - CFG.player.staminaDrain * dt);
  else p.stamina = Math.min(100, p.stamina + CFG.player.staminaRegen * dt);
  if (len > 0) {
    const f = { x: Math.sin(W.camYaw), z: Math.cos(W.camYaw) };
    const r = { x: -Math.cos(W.camYaw), z: Math.sin(W.camYaw) };
    const dx = (f.x * my + r.x * mx) / len;
    const dz = (f.z * my + r.z * mx) / len;
    p.velX += (dx * speed - p.velX) * Math.min(1, dt * 10);
    p.velZ += (dz * speed - p.velZ) * Math.min(1, dt * 10);
    p.heading = Math.atan2(dx, dz);
  } else {
    p.velX *= Math.max(0, 1 - dt * 10);
    p.velZ *= Math.max(0, 1 - dt * 10);
  }
  const nx = p.x + p.velX * dt;
  const nz = p.z + p.velZ * dt;
  if (!isSolid(W.city, nx, p.z, p.r)) p.x = nx;
  if (!isSolid(W.city, p.x, nz, p.r)) p.z = nz;
  pushOut(W.city, p);

  // Slow health regen when the heat is off.
  if (W.wanted.stars === 0 && p.health < 100) p.health = Math.min(100, p.health + CFG.player.healthRegen * dt);

  // Shooting: autos fire while held, semi-autos fire per click.
  const def = WEAPONS[p.weapon];
  if (def.kind === 'gun') {
    if (def.auto ? input.mouse.down : actions.shootClick) shoot(W);
  } else if (actions.shootClick) {
    melee(W, def);
  }
  if (actions.punch) melee(W, WEAPONS.fists);

  if (actions.interact) {
    const s = W.mission.state === 'running' ? W.mission.stepDef : null;
    if (s && s.kind === 'interact' && Math.hypot(p.x - s.x, p.z - s.z) < s.radius) {
      W.consumeInteract = true;
      return;
    }
    const g = garagePoint();
    if (W.nextReady && Math.hypot(p.x - g.x, p.z - g.z) < 16) {
      W.nextReady = false;
      W.mission.start(W.mission.index);
      return;
    }
    const car = nearestCar(W.cars, p.x, p.z, CFG.player.enterCarRange, W.mission.markerCar);
    if (car) enterCar(car);
  }
}

function updateInteractPrompt() {
  const p = W.player;
  W.interactPrompt = '';
  if (W.screen !== 'play') return;
  const g = garagePoint();
  if (W.nextReady && Math.hypot(p.x - g.x, p.z - g.z) < 16) {
    W.interactPrompt = `E — Start job: ${W.mission.mission ? W.mission.mission.title : MISSION_DEFS[W.mission.index].title}`;
    return;
  }
  if (p.car) return;
  const s = W.mission.state === 'running' ? W.mission.stepDef : null;
  if (s && s.kind === 'interact' && Math.hypot(p.x - s.x, p.z - s.z) < s.radius) {
    W.interactPrompt = 'E — Pick up Rosa';
    return;
  }
  const car = nearestCar(W.cars, p.x, p.z, CFG.player.enterCarRange, W.mission.markerCar);
  if (car) {
    W.interactPrompt = car.driver === 'traffic' ? `E — Steal the ${car.name}` : `E — Get in the ${car.name}`;
  }
}

function updateMarker() {
  const marker = W.markerMesh;
  if (!marker) return;
  const s = W.mission && W.mission.state === 'running' ? W.mission.stepDef : null;
  let tx = null;
  let tz = null;
  if (s) {
    if (s.kind === 'car' && W.mission.markerCar) {
      tx = W.mission.markerCar.x;
      tz = W.mission.markerCar.z;
    } else if (s.x !== undefined) {
      tx = s.x;
      tz = s.z;
    }
  } else if (W.nextReady) {
    const g = garagePoint();
    tx = g.x;
    tz = g.z;
  }
  if (tx === null) {
    marker.visible = false;
    return;
  }
  marker.visible = true;
  marker.position.set(tx, 0, tz);
  const u = marker.userData;
  u.diamond.position.y = 6 + Math.sin(W.time * 2.4) * 0.8;
  u.diamond.rotation.y += 0.02;
  const pulse = 1 + Math.sin(W.time * 2.4) * 0.08;
  u.ring.scale.set(pulse, pulse, pulse);
}

function resetForNewGame() {
  const p = W.player;
  p.x = LANDMARKS.playerStart.x;
  p.z = LANDMARKS.playerStart.z;
  p.heading = LANDMARKS.playerStart.heading;
  p.health = 100;
  p.armor = 0;
  p.stamina = 100;
  p.cash = 250;
  p.rep = 0;
  p.weapons = ['fists', 'bat', 'pistol'];
  p.weapon = 'pistol';
  p.ammo = { fists: Infinity, bat: Infinity, pistol: 12, smg: 0, shotgun: 0, rifle: 0 };
  p.fireT = 0;
  p.reloadT = 0;
  if (p.car) {
    p.car.driver = 'parked';
    p.car = null;
  }
  p.mesh.visible = true;
  W.wanted.stars = 0;
  W.wanted.bustT = 0;
  syncPolice(W);
  clearEnemies(W);
  W.mission.index = 0;
  W.mission.step = 0;
  W.mission.completed = [];
  W.mission.state = 'idle';
  W.nextReady = false;
  W.stats = { earned: 0, stolen: 0, done: 0, kills: 0 };
  W.gameHour = CFG.time.startHour;
  W.camYaw = Math.PI;
  W.cameraSnap = true;
  clearSave();
}

function startNewGame() {
  resetForNewGame();
  W.screen = 'play';
  W.audio.ensure();
  W.audio.startMusic();
  W.mission.start(0);
  announce('Playing. First job: Back in Town.');
}

function continueGame(save) {
  const p = W.player;
  p.cash = save.cash;
  p.rep = save.rep || 0;
  p.x = save.x;
  p.z = save.z;
  p.heading = save.heading || 0;
  p.health = save.health;
  p.armor = save.armor || 0;
  p.weapons = save.weapons || ['fists', 'bat', 'pistol'];
  if (!p.weapons.includes(p.weapon)) p.weapon = 'pistol';
  p.ammo = { fists: Infinity, bat: Infinity, pistol: 12, smg: 30, shotgun: 6, rifle: 24 };
  W.mission.index = save.missionIndex;
  W.mission.completed = save.completed || [];
  W.stats = save.stats || W.stats;
  W.gameHour = save.hour || CFG.time.startHour;
  W.nextReady = true;
  W.camYaw = p.heading;
  W.screen = 'play';
  W.cameraSnap = true;
  W.audio.ensure();
  W.audio.startMusic();
  announce('Playing. Head to the garage for your next job.');
}

function runShot(name) {
  stageShot(name, W);
  hud.setTitleVisible(name === 'title');
  hud.setHudVisible(name !== 'title');
  let frames = 0;
  const t0 = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    frames += 1;
    if (name === 'title') {
      W.camYaw += 0.0006;
      W.renderer.camState.yaw = W.camYaw;
    }
    // Step the world several times per rendered frame so the scene settles
    // in the same amount of game time even on a slow software renderer.
    for (let i = 0; i < 3; i += 1) W.stepWorld(STEP, true);
    // Snap the camera every frame: at ~2 fps the lerp would trail metres
    // behind a fast car and the player's own car would leave the frame.
    W.renderer.camState.yaw = W.camYaw;
    W.cameraSnap = true;
    W.renderer.updateCamera(W, STEP);
    W.renderer.updateSky(W.gameHour);
    W.renderer.updateParticles(STEP);
    updateMarker();
    if (W.showStagedDialogue && W.mission.dialogue) {
      hud.showDialogue(W.mission.dialogue.lines[0]);
    }
    hud.update(STEP);
    syncPlayerMesh(STEP);
    for (const car of W.cars) if (!car.dead) syncCarMesh(car, STEP);
    W.renderer.render();
    // Ready after ~2 s of game time, or 12 s of wall time on slow renderers.
    if (frames >= 40 || performance.now() - t0 > 12000) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}

function runGame() {
  let screen = 'title';
  let titleSelected = 0;
  let pauseSelected = 0;
  let accumulator = 0;
  let last = performance.now();
  const save = readSave();
  const hasSave = !!save;
  const titleBtns = [hud.el.continueBtn, hud.el.newGameBtn].filter(Boolean);

  function setScreen(next) {
    screen = next;
    W.screen = next;
    hud.setTitleVisible(next === 'title');
    hud.setHudVisible(next !== 'title');
    hud.setPauseVisible(next === 'pause');
    if (next !== 'wasted' && next !== 'busted' && next !== 'failed' && next !== 'ending') hud.hideEnd();
    if (next === 'wasted' || next === 'busted' || next === 'failed' || next === 'ending') {
      hud.showEnd(next);
    }
  }

  function paintTitleSelection() {
    titleBtns.forEach((b, i) => b.classList.toggle('selected', i === titleSelected));
  }
  paintTitleSelection();

  function startFromTitle() {
    if (hasSave && titleSelected === 0) continueGame(save);
    else {
      clearSave();
      startNewGame();
    }
    setScreen('play');
  }

  if (hud.el.continueBtn) {
    hud.el.continueBtn.style.display = hasSave ? 'block' : 'none';
    hud.el.continueBtn.addEventListener('click', () => {
      titleSelected = 0;
      W.audio.click();
      startFromTitle();
    });
  }
  if (hud.el.newGameBtn) {
    hud.el.newGameBtn.addEventListener('click', () => {
      titleSelected = hasSave ? 1 : 0;
      W.audio.click();
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
      writeSave(W);
      setScreen('title');
    } else if (i === 2) {
      W.mission.retry();
      setScreen('play');
    }
  }
  pauseBtns.forEach((b, i) => b && b.addEventListener('click', () => {
    W.audio.click();
    pauseAction(i);
  }));
  if (hud.el.endBtn) {
    hud.el.endBtn.addEventListener('click', () => {
      W.audio.click();
      if (screen === 'ending') setScreen('play');
      else {
        W.mission.retry();
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
        const muted = W.audio.toggleMute();
        W.message = muted ? 'Muted (M to unmute)' : 'Sound on';
        W.messageT = 2;
      }
    }

    if (screen === 'title') {
      const actions = input.takeActions();
      handleMute(actions);
      const options = hasSave ? 2 : 1;
      if (input.wasPressed('ArrowUp') || input.wasPressed('w')) {
        titleSelected = (titleSelected + options - 1) % options;
        paintTitleSelection();
      }
      if (input.wasPressed('ArrowDown') || input.wasPressed('s')) {
        titleSelected = (titleSelected + 1) % options;
        paintTitleSelection();
      }
      if (actions.confirm) startFromTitle();
      while (accumulator >= STEP) {
        W.camYaw += STEP * 0.03;
        W.stepWorld(STEP, true);
        accumulator -= STEP;
      }
      accumulator = 0;
      W.renderer.camState.yaw = W.camYaw;
      W.renderer.updateCamera(W, STEP);
      W.renderer.updateSky(W.gameHour);
      W.renderer.updateParticles(STEP);
      W.renderer.render();
      return;
    }

    if (screen === 'pause') {
      const actions = input.takeActions();
      handleMute(actions);
      if (actions.pause) setScreen('play');
      if (actions.confirm) pauseAction(pauseSelected);
      if (input.wasPressed('ArrowUp') || input.wasPressed('w')) {
        pauseSelected = (pauseSelected + 2) % 3;
        paintPauseSelection();
      }
      if (input.wasPressed('ArrowDown') || input.wasPressed('s')) {
        pauseSelected = (pauseSelected + 1) % 3;
        paintPauseSelection();
      }
      W.renderer.render();
      return;
    }

    if (screen === 'wasted' || screen === 'busted' || screen === 'failed') {
      const actions = input.takeActions();
      handleMute(actions);
      if (actions.retry || actions.confirm) {
        W.mission.retry();
        setScreen('play');
        announce('Playing. Try the job again.');
      }
      W.renderer.render();
      return;
    }

    if (screen === 'ending') {
      const actions = input.takeActions();
      handleMute(actions);
      if (actions.confirm) {
        setScreen('play');
        announce('Free roam. Solara Bay is yours.');
      }
      W.renderer.render();
      return;
    }

    // Play screen.
    if (accumulator < STEP) {
      W.renderer.updateCamera(W, 1 / 60);
      W.renderer.render();
      hud.update(1 / 60);
      return;
    }
    const actions = input.takeActions();
    handleMute(actions);
    if (actions.pause) {
      setScreen('pause');
      announce('Paused.');
      return;
    }
    // Dialogue: confirm advances; the world keeps moving behind it.
    if (W.mission.state === 'dialogue' && W.mission.dialogue) {
      const line = W.mission.dialogue.lines[W.mission.dialogue.at];
      hud.showDialogue(line);
      if (actions.confirm || actions.interact) {
        W.audio.click();
        W.mission.advanceDialogue();
        if (W.mission.state !== 'dialogue') hud.hideDialogue();
      }
    } else if (!W.showStagedDialogue) {
      hud.hideDialogue();
    }
    if (W.mission.banner) {
      W.mission.bannerT += 1 / 60;
      if (W.mission.bannerT > 4) W.mission.banner = null;
    }

    while (accumulator >= STEP) {
      if (W.mission.state !== 'dialogue') updatePlayer(STEP, actions);
      else input.takeLook();
      W.stepWorld(STEP, false);
      updateInteractPrompt();
      accumulator -= STEP;
      actions.interact = false;
      actions.shootClick = false;
      actions.punch = false;
      actions.confirm = false;
    }

    updateMarker();
    syncPlayerMesh(1 / 60);
    for (const car of W.cars) if (!car.dead) syncCarMesh(car, 1 / 60);
    W.renderer.updateCamera(W, 1 / 60);
    W.renderer.updateSky(W.gameHour);
    W.renderer.updateParticles(1 / 60);
    W.renderer.render();
    hud.update(1 / 60);
    W.audio.siren(W.wanted.sirenOn);
  }

  announce('Solara Bay: Neon Tide. Press Enter to start.');
  requestAnimationFrame(frame);
}

// Debug and test handle: playtests drive the game through this.
window.__neonTide = {
  W,
  version: '3.0.0-cleanroom',
  startMission(i) { W.mission.start(i); W.screen = 'play'; },
  setWanted(n) { W.wanted.stars = n; syncPolice(W); },
  teleport(x, z) {
    W.player.x = x;
    W.player.z = z;
    if (W.player.car) {
      W.player.car.x = x;
      W.player.car.z = z;
    }
    W.cameraSnap = true;
  },
  state() {
    const p = W.player;
    return {
      screen: W.screen,
      x: Math.round(p.x), z: Math.round(p.z),
      health: Math.round(p.health), armor: Math.round(p.armor), cash: p.cash, rep: p.rep,
      weapon: p.weapon, ammo: p.ammo[p.weapon],
      inCar: !!p.car, carSpeed: p.car ? Math.round(p.car.speed * 2.237) : 0,
      wanted: W.wanted.stars,
      cops: W.wanted.cops.length, footCops: W.wanted.footCops.length, heli: !!W.wanted.heli,
      mission: W.mission.mission ? W.mission.mission.id : null,
      missionState: W.mission.state,
      missionStep: W.mission.step,
      killsDone: W.mission.killsDone,
      traffic: W.traffic.length, peds: W.peds.length, enemies: W.enemies.length,
      cars: W.cars.length, hour: W.gameHour.toFixed(2),
    };
  },
};

if (shot) runShot(shot);
else runGame();
