// Solara Bay: Neon Tide — boot and the one loop. Input is read every frame,
// the world advances in fixed 1/60 s steps, and the renderer paints what is
// there. Screens: title, play, paused, wasted, busted, mission failed and
// the ending. ?seed=N fixes the city. ?shot=chase|drive|foot|title stages
// that scene, runs the loop briefly and sets window.__shotReady.
import { CFG, WEAPONS, WEAPON_ORDER, PALETTE } from './config.js';
import { RNG } from './rng.js';
import { buildCity, isBlocked, resolveCollision } from './city.js';
import { createAudio } from './audio.js';
import { createInput } from './input.js';
import { createCar, driveCar, syncCarMesh, nearestEnterableCar, damageCar } from './vehicles.js';
import { createPopulation, updateTraffic, updatePeds, scarePeds, syncPedMesh } from './traffic.js';
import { createWanted, addWanted, syncPolice, updateWanted, busted, wasted } from './police.js';
import { shoot, reload, finishReload, punch, updateEnemies, clearEnemies } from './combat.js';
import { createMissionRunner, MISSIONS } from './missions.js';
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

const status = document.getElementById('status');
function announce(message) {
  if (status) status.textContent = message;
}

function buildGame(seedValue) {
  const rng = new RNG(seedValue);
  const city = buildCity(rng);
  const audio = createAudio();
  const renderer = createRenderer(document.getElementById('scene'));
  const staticHit = renderer.buildCityMeshes(city);

  const G = {
    rng, city, audio, renderer, staticHit,
    time: 0,
    gameHour: CFG.time.startHour,
    screen: 'title',
    message: '',
    messageT: 0,
    interactPrompt: '',
    consumeInteract: false,
    nextMissionReady: false,
    failReason: '',
    cameraSnap: false,
    camYaw: Math.PI,
    camPitchTarget: 0.32,
    hudFlash: 0,
    showStagedDialogue: false,
    stats: { cashEarned: 0, carsStolen: 0, missionsDone: 0, kills: 0 },
    player: {
      // On Marlin Ave (road x=-40) just south of the garage: open asphalt.
      x: -40, z: 120, heading: Math.PI,
      health: 100, armor: 0, stamina: 100,
      cash: 250, rep: 0,
      car: null, moving: false, invuln: 0, r: CFG.player.radius,
      weapons: ['fists', 'bat', 'pistol'],
      weapon: 'pistol',
      ammo: { fists: Infinity, bat: Infinity, pistol: 12, smg: 0, shotgun: 0, rifle: 0 },
      fireT: 0, reloadT: 0,
      mesh: null,
      velX: 0, velZ: 0,
    },
    cars: [],
    traffic: [],
    peds: [],
    enemies: [],
    wanted: createWanted(),
    mission: null,
  };
  G.mission = createMissionRunner(G);
  const pop = createPopulation(rng, city, renderer);
  G.traffic = pop.traffic;
  G.peds = pop.peds;
  G.cars = [...pop.traffic];
  for (const car of G.traffic) {
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
  }
  for (const ped of G.peds) {
    ped.mesh.userData.hitRef = { kind: 'ped', ref: ped };
  }

  // Rook himself: red shirt, dark jeans.
  const pm = renderer.makePersonMesh(0xc0392b, 0x2c3e50, 0xe8b98a, { weapon: true, hair: 0x2a1a12 });
  renderer.scene.add(pm);
  G.player.mesh = pm;

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
  for (const [type, x, z, heading, color] of parked) {
    const car = createCar(type, x, z, heading, color);
    car.driver = 'parked';
    car.mesh = renderer.makeCarMesh(type, color);
    car.mesh.userData.hitRef = { kind: 'car', ref: car };
    car.mesh.position.set(x, 0, z);
    car.mesh.rotation.y = heading;
    renderer.scene.add(car.mesh);
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
  // by the title screen background and the screenshot scenes).
  G.stepWorld = (dt, auto) => {
    G.time += dt;
    G.gameHour += (dt * CFG.time.minutesPerSecond) / 60;
    if (G.gameHour >= 24 * 7) G.gameHour -= 24 * 7;
    if (G.messageT > 0) G.messageT -= dt;
    updateTraffic(G, dt);
    updatePeds(G, dt);
    updateWanted(G, dt);
    updateEnemies(G, dt);
    if (G.mission) G.mission.update(dt);
    if (auto && G.player.car) {
      driveCar(G.player.car, 0.45, 0, dt, G.city, G.cars);
      syncCarMesh(G.player.car, dt);
    }
    // Engine smoke from wrecked cars.
    for (const car of G.cars) {
      if (!car.dead && car.health < 40 && Math.random() < 0.25) {
        G.renderer.spawnSmoke(car.x - Math.sin(car.heading) * car.len / 2, 1.2, car.z - Math.cos(car.heading) * car.len / 2);
      }
    }
    // Near-miss + drift bonuses for the player's driving.
    const p = G.player;
    if (p.car && !p.car.dead) {
      const car = p.car;
      for (const other of G.traffic) {
        if (other.dead) continue;
        other.nearMissT = Math.max(0, (other.nearMissT || 0) - dt);
        if (other.nearMissT > 0) continue;
        const dx = other.x - car.x;
        const dz = other.z - car.z;
        const d = Math.hypot(dx, dz);
        if (d < CFG.driving.nearMissDist + 1 && Math.abs(car.speed) > CFG.driving.nearMissMinSpeed) {
          other.nearMissT = 5;
          p.rep += 25;
          p.cash += 10;
          G.message = 'NEAR MISS +25 REP';
          G.messageT = 2;
          if (G.audio) G.audio.nearMiss();
        }
      }
      if (!car.drifting && car.driftScore > 1.5) {
        const bonus = Math.round(car.driftScore) * 15;
        p.cash += bonus;
        p.rep += Math.round(car.driftScore) * 10;
        G.message = `DRIFT +$${bonus}`;
        G.messageT = 2;
        car.driftScore = 0;
      } else if (!car.drifting) car.driftScore = 0;
    }
  };
  return G;
}

let G = buildGame(seed);
const input = createInput(G.renderer.renderer.domElement);
const hud = createHUD(G);
G.input = input;
G.hud = hud;

function enterCar(car) {
  const p = G.player;
  if (car.driver === 'traffic') {
    const idx = G.traffic.indexOf(car);
    if (idx !== -1) G.traffic.splice(idx, 1);
    // The driver becomes a panicking pedestrian.
    const ped = {
      x: car.x - Math.cos(car.heading) * 2, z: car.z + Math.sin(car.heading) * 2,
      heading: car.heading + Math.PI / 2, speed: 0, target: null, state: 'walk',
      panic: 4, r: 0.55, walkPhase: 0, cop: false, mesh: null,
    };
    ped.mesh = G.renderer.makePersonMesh(0xe74c3c, 0x2c3e50, 0xe8b98a);
    ped.mesh.userData.hitRef = { kind: 'ped', ref: ped };
    G.renderer.scene.add(ped.mesh);
    G.peds.push(ped);
    G.stats.carsStolen += 1;
    addWanted(G, 1, 'You stole a car in broad daylight.');
  }
  car.driver = 'player';
  p.car = car;
  p.x = car.x;
  p.z = car.z;
  p.mesh.visible = false;
  G.audio.ensure();
}

function exitCar() {
  const p = G.player;
  const car = p.car;
  if (!car) return;
  // Step out on the driver's side.
  const sideX = -Math.cos(car.heading);
  const sideZ = Math.sin(car.heading);
  p.x = car.x + sideX * 2.4;
  p.z = car.z + sideZ * 2.4;
  p.heading = car.heading;
  car.driver = 'parked';
  car.speed *= 0.3;
  p.car = null;
  p.mesh.visible = true;
  resolveCollision(G.city, p);
}

function syncPlayerMesh(dt) {
  const p = G.player;
  const m = p.mesh;
  if (!m) return;
  m.visible = !p.car;
  if (p.car) return;
  m.position.set(p.x, 0, p.z);
  // Face the movement direction, or the camera when aiming a gun.
  const aiming = WEAPONS[p.weapon].kind === 'gun' && (input.mouse.down || input.mouse.rightDown);
  const targetHeading = aiming ? G.camYaw : p.heading;
  let diff = targetHeading - m.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  m.rotation.y += diff * Math.min(1, dt * 12);
  const u = m.userData;
  if (u.gun) u.gun.visible = WEAPONS[p.weapon].kind === 'gun';
  if (u.legL) {
    if (p.moving) {
      p.walkPhase = (p.walkPhase || 0) + dt * 11;
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

function updatePlayer(dt, actions) {
  const p = G.player;
  if (p.invuln > 0) p.invuln -= dt;
  if (p.fireT > 0) p.fireT -= dt;
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) finishReload(G);
  }
  // Mouse-look.
  const look = input.takeLook();
  G.camYaw -= look.dx * 0.0023;
  G.camPitchTarget = Math.max(CFG.camera.pitchMin, Math.min(CFG.camera.pitchMax, G.camPitchTarget + look.dy * 0.002));
  G.renderer.camState.yaw = G.camYaw;

  if (actions.weapon) {
    const key = WEAPON_ORDER[actions.weapon - 1];
    if (key && p.weapons.includes(key) && p.weapon !== key) {
      p.weapon = key;
      p.reloadT = 0;
      if (G.audio) G.audio.click();
    }
  }
  if (actions.reload) reload(G);

  if (p.car) {
    const car = p.car;
    const throttle = input.moveY();
    const steer = -input.moveX();
    const crashed = driveCar(car, throttle, steer, dt, G.city, G.cars, {
      handbrake: input.handbrake,
      nitro: input.nitro,
    });
    syncCarMesh(car, dt);
    if (crashed) {
      const impact = Math.abs(car.speed);
      if (impact > CFG.driving.collisionSpeedThreshold) {
        damageCar(G, car, (impact - CFG.driving.collisionSpeedThreshold) * CFG.driving.collisionDamage * 3);
        G.renderer.addShake(6);
        G.audio.crash();
      }
    }
    G.audio.engine(Math.abs(car.speed) / 55, Math.abs(throttle));
    p.x = car.x;
    p.z = car.z;
    if (actions.interact) {
      if (G.nextMissionReady && Math.hypot(car.x - (G.city.landmarks.garage.x + 24), car.z - (G.city.landmarks.garage.z + 18)) < 16) {
        G.nextMissionReady = false;
        G.mission.start(G.mission.index);
      } else {
        exitCar();
      }
    }
    return;
  }

  G.audio.engine(0, 0);

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
    const f = { x: Math.sin(G.camYaw), z: Math.cos(G.camYaw) };
    const r = { x: -Math.cos(G.camYaw), z: Math.sin(G.camYaw) };
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
  if (!isBlocked(G.city, nx, p.z, p.r)) p.x = nx;
  if (!isBlocked(G.city, p.x, nz, p.r)) p.z = nz;
  resolveCollision(G.city, p);

  // Slow health regen when the heat is off.
  if (G.wanted.stars === 0 && p.health < 100) p.health = Math.min(100, p.health + 1.5 * dt);

  // Shooting: autos fire while held, semi-autos fire per click.
  const def = WEAPONS[p.weapon];
  if (def.kind === 'gun') {
    if (def.auto ? input.mouse.down : actions.shootClick) shoot(G);
  } else if (actions.shootClick) {
    punch(G, def);
  }
  if (actions.punch) punch(G, WEAPONS.fists);

  if (actions.interact) {
    const s = G.mission.state === 'running' ? G.mission.stepDef : null;
    if (s && s.kind === 'interact' && Math.hypot(p.x - s.x, p.z - s.z) < s.radius) {
      G.consumeInteract = true;
      return;
    }
    if (G.nextMissionReady && Math.hypot(p.x - (G.city.landmarks.garage.x + 24), p.z - (G.city.landmarks.garage.z + 18)) < 16) {
      G.nextMissionReady = false;
      G.mission.start(G.mission.index);
      return;
    }
    const car = nearestEnterableCar(G.cars, G.mission.markerCar, p.x, p.z, CFG.player.enterCarRange);
    if (car) enterCar(car);
  }
}

function updateInteractPrompt() {
  const p = G.player;
  G.interactPrompt = '';
  if (G.screen !== 'play') return;
  const gx = G.city.landmarks.garage.x + 24;
  const gz = G.city.landmarks.garage.z + 18;
  if (G.nextMissionReady && Math.hypot(p.x - gx, p.z - gz) < 16) {
    G.interactPrompt = `E — Start job: ${G.mission.mission.title}`;
    return;
  }
  if (p.car) return;
  const s = G.mission.state === 'running' ? G.mission.stepDef : null;
  if (s && s.kind === 'interact' && Math.hypot(p.x - s.x, p.z - s.z) < s.radius) {
    G.interactPrompt = 'E — Pick up Rosa';
    return;
  }
  const car = nearestEnterableCar(G.cars, G.mission.markerCar, p.x, p.z, CFG.player.enterCarRange);
  if (car) {
    G.interactPrompt = car.driver === 'traffic' ? `E — Steal the ${car.name}` : `E — Get in the ${car.name}`;
  }
}

function updateMarker() {
  const marker = G.markerMesh;
  if (!marker) return;
  const s = G.mission && G.mission.state === 'running' ? G.mission.stepDef : null;
  let tx = null;
  let tz = null;
  if (s) {
    if (s.kind === 'car' && G.mission.markerCar) {
      tx = G.mission.markerCar.x;
      tz = G.mission.markerCar.z;
    } else if (s.x !== undefined) {
      tx = s.x;
      tz = s.z;
    }
  } else if (G.nextMissionReady) {
    tx = G.city.landmarks.garage.x + 24;
    tz = G.city.landmarks.garage.z + 18;
  }
  if (tx === null) {
    marker.visible = false;
    return;
  }
  marker.visible = true;
  marker.position.set(tx, 0, tz);
  const u = marker.userData;
  u.diamond.position.y = 6 + Math.sin(G.time * 2.4) * 0.8;
  u.diamond.rotation.y += 0.02;
  const pulse = 1 + Math.sin(G.time * 2.4) * 0.08;
  u.ring.scale.set(pulse, pulse, pulse);
}

function resetForNewGame() {
  const p = G.player;
  p.x = -40;
  p.z = 120;
  p.heading = Math.PI;
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
  G.wanted.stars = 0;
  G.wanted.bustTimer = 0;
  syncPolice(G);
  clearEnemies(G);
  G.mission.index = 0;
  G.mission.step = 0;
  G.mission.completed = [];
  G.mission.state = 'idle';
  G.nextMissionReady = false;
  G.stats = { cashEarned: 0, carsStolen: 0, missionsDone: 0, kills: 0 };
  G.gameHour = CFG.time.startHour;
  G.camYaw = Math.PI;
  G.cameraSnap = true;
  clearSave();
}

function startNewGame() {
  resetForNewGame();
  G.screen = 'play';
  G.audio.ensure();
  G.audio.startMusic();
  G.mission.start(0);
  announce('Playing. First job: Back in Town.');
}

function continueGame(save) {
  const p = G.player;
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
  G.mission.index = save.missionIndex;
  G.mission.completed = save.completed || [];
  G.stats = save.stats || G.stats;
  G.gameHour = save.hour || CFG.time.startHour;
  G.nextMissionReady = true;
  G.camYaw = p.heading;
  G.screen = 'play';
  G.cameraSnap = true;
  G.audio.ensure();
  G.audio.startMusic();
  announce('Playing. Head to the garage for your next job.');
}

G.markerMesh = G.renderer.makeMarker();

function runShot(name) {
  stageShot(name, G);
  hud.setTitleVisible(name === 'title');
  hud.setHudVisible(name !== 'title');
  let frames = 0;
  const t0 = performance.now();
  function frame() {
    requestAnimationFrame(frame);
    frames += 1;
    if (name === 'title') {
      G.camYaw += 0.0006;
      G.renderer.camState.yaw = G.camYaw;
    }
    // Step the world several times per rendered frame so the scene settles
    // in the same amount of game time even on a slow software renderer.
    for (let i = 0; i < 3; i += 1) G.stepWorld(STEP, true);
    // Snap the camera every frame: at ~2 fps the lerp would trail metres
    // behind a fast car and the player's own car would leave the frame.
    G.renderer.camState.yaw = G.camYaw;
    G.cameraSnap = true;
    G.renderer.updateCamera(G, STEP);
    G.renderer.updateSky(G.gameHour);
    G.renderer.updateParticles(STEP);
    updateMarker();
    if (G.showStagedDialogue && G.mission.dialogue) {
      hud.showDialogue(G.mission.dialogue.lines[0]);
      hud.completeDialogue();
    }
    hud.update(STEP);
    syncPlayerMesh(STEP);
    for (const car of G.cars) if (!car.dead) syncCarMesh(car, STEP);
    G.renderer.render();
    // Ready after ~2 s of game time, or 12 s of wall time on slow renderers
    // (SwiftShader manages ~2 fps, so a frame count alone would take a minute).
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
    G.screen = next;
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
      G.audio.click();
      startFromTitle();
    });
  }
  if (hud.el.newGameBtn) {
    hud.el.newGameBtn.addEventListener('click', () => {
      titleSelected = hasSave ? 1 : 0;
      G.audio.click();
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
      writeSave(G);
      setScreen('title');
    } else if (i === 2) {
      G.mission.retry();
      setScreen('play');
    }
  }
  pauseBtns.forEach((b, i) => b && b.addEventListener('click', () => {
    G.audio.click();
    pauseAction(i);
  }));
  if (hud.el.endBtn) {
    hud.el.endBtn.addEventListener('click', () => {
      G.audio.click();
      if (screen === 'ending') setScreen('play');
      else {
        G.mission.retry();
        setScreen('play');
      }
    });
  }

  setScreen('title');

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    if (G.screen !== screen) setScreen(G.screen);

    function handleMute(actions) {
      if (actions.mute) {
        const muted = G.audio.toggleMute();
        G.message = muted ? 'Muted (M to unmute)' : 'Sound on';
        G.messageT = 2;
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
        G.camYaw += STEP * 0.03;
        G.stepWorld(STEP, true);
        accumulator -= STEP;
      }
      accumulator = 0;
      G.renderer.camState.yaw = G.camYaw;
      G.renderer.updateCamera(G, STEP);
      G.renderer.updateSky(G.gameHour);
      G.renderer.updateParticles(STEP);
      G.renderer.render();
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
      G.renderer.render();
      return;
    }

    if (screen === 'wasted' || screen === 'busted' || screen === 'failed') {
      const actions = input.takeActions();
      handleMute(actions);
      if (actions.retry || actions.confirm) {
        G.mission.retry();
        setScreen('play');
        announce('Playing. Try the job again.');
      }
      G.renderer.render();
      return;
    }

    if (screen === 'ending') {
      const actions = input.takeActions();
      handleMute(actions);
      if (actions.confirm) {
        setScreen('play');
        announce('Free roam. Solara Bay is yours.');
      }
      G.renderer.render();
      return;
    }

    // Play screen.
    if (accumulator < STEP) {
      G.renderer.updateCamera(G, 1 / 60);
      G.renderer.render();
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
    if (G.mission.state === 'dialogue' && G.mission.dialogue) {
      const line = G.mission.dialogue.lines[G.mission.dialogue.at];
      hud.showDialogue(line);
      if (actions.confirm || actions.interact) {
        G.audio.click();
        G.mission.advanceDialogue();
        if (G.mission.state !== 'dialogue') hud.hideDialogue();
      }
    } else if (!G.showStagedDialogue) {
      hud.hideDialogue();
    }
    if (G.mission.banner) {
      G.mission.bannerT += 1 / 60;
      if (G.mission.bannerT > 4) G.mission.banner = null;
    }

    while (accumulator >= STEP) {
      if (G.mission.state !== 'dialogue') updatePlayer(STEP, actions);
      else input.takeLook();
      G.stepWorld(STEP, false);
      updateInteractPrompt();
      accumulator -= STEP;
      actions.interact = false;
      actions.shootClick = false;
      actions.punch = false;
      actions.confirm = false;
    }

    updateMarker();
    syncPlayerMesh(1 / 60);
    for (const car of G.cars) if (!car.dead) syncCarMesh(car, 1 / 60);
    G.renderer.updateCamera(G, 1 / 60);
    G.renderer.updateSky(G.gameHour);
    G.renderer.updateParticles(1 / 60);
    G.renderer.render();
    hud.update(1 / 60);
  }

  announce('Solara Bay: Neon Tide. Press Enter to start.');
  requestAnimationFrame(frame);
}

// Debug and test handle: playtests drive the game through this.
window.__solara = {
  G,
  version: '2.0.0',
  startMission(i) { G.mission.start(i); G.screen = 'play'; },
  setWanted(n) { G.wanted.stars = n; syncPolice(G); },
  blocked(x, z, r) { return isBlocked(G.city, x, z, r); },
  teleport(x, z) {
    G.player.x = x;
    G.player.z = z;
    if (G.player.car) {
      G.player.car.x = x;
      G.player.car.z = z;
    }
    G.cameraSnap = true;
  },
  state() {
    const p = G.player;
    return {
      screen: G.screen,
      x: Math.round(p.x), z: Math.round(p.z),
      health: Math.round(p.health), armor: Math.round(p.armor), cash: p.cash, rep: p.rep,
      weapon: p.weapon, ammo: p.ammo[p.weapon],
      inCar: !!p.car, carSpeed: p.car ? Math.round(p.car.speed * 2.237) : 0,
      wanted: G.wanted.stars,
      cops: G.wanted.cops.length, footCops: G.wanted.footCops.length, heli: !!G.wanted.heli,
      mission: G.mission.mission ? G.mission.mission.id : null,
      missionState: G.mission.state,
      missionStep: G.mission.step,
      killsDone: G.mission.killsDone,
      traffic: G.traffic.length, peds: G.peds.length, enemies: G.enemies.length,
      cars: G.cars.length, hour: G.gameHour.toFixed(2),
    };
  },
};

if (shot) runShot(shot);
else runGame();
