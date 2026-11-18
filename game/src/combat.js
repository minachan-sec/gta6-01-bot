// Combat: six weapons, hitscan shooting through the crosshair (a real
// THREE.Raycaster against the world), melee, and the job foes — gang
// members who chase the hero and shoot back. Shooting in public is a
// crime; hitting a cop is a bigger one.
import * as THREE from 'three';
import { TUNE, ARSENAL } from './config.js';
import { raiseHeat } from './police.js';
import { panicWalkers } from './traffic.js';
import { harmVehicle } from './vehicles.js';
import { isSolid, pushOut } from './city.js';

const caster = new THREE.Raycaster();
const cross = new THREE.Vector2(0, 0);

function findTarget(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.hitRef) return o.userData.hitRef;
    o = o.parent;
  }
  return null;
}

/** Attach a floating health bar to a foe's mesh group. */
function attachHealthBar(mesh) {
  const bar = new THREE.Group();
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  const front = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  front.position.z = 0.01;
  bar.add(back, front);
  bar.position.y = 2.45;
  mesh.add(bar);
  return { bar, front };
}

export function spawnFoe(W, x, z, opts = {}) {
  const mesh = W.view.buildPersonMesh(opts.shirt ?? 0x7a1f2b, opts.pants ?? 0x1a1a1a, opts.skin ?? 0xc68642, { weapon: true, cap: 0x1a1a1a });
  mesh.position.set(x, 0, z);
  W.view.scene.add(mesh);
  const hb = attachHealthBar(mesh);
  const foe = {
    x, z,
    facing: Math.atan2(W.hero.x - x, W.hero.z - z),
    health: opts.health ?? 60,
    maxHealth: opts.health ?? 60,
    speed: opts.speed ?? 5.2,
    hurt: opts.damage ?? 9,
    aim: opts.accuracy ?? 0.45,
    shotT: W.dice.between(0.4, 1.2),
    state: 'alive',
    r: 0.55,
    mesh,
    bar: hb,
    walkPhase: W.dice.between(0, 6),
    boss: !!opts.boss,
  };
  mesh.userData.hitRef = { kind: 'enemy', ref: foe };
  W.foes.push(foe);
  return foe;
}

export function dropFoe(W, foe) {
  const i = W.foes.indexOf(foe);
  if (i !== -1) W.foes.splice(i, 1);
  if (foe.mesh) {
    W.view.scene.remove(foe.mesh);
    foe.mesh.userData.hitRef = null;
  }
}

export function clearFoes(W) {
  for (const f of [...W.foes]) dropFoe(W, f);
}

function harmFoe(W, foe, amount) {
  if (foe.state !== 'alive') return;
  foe.health -= amount;
  W.view.spawnBlood(foe.x, 1.4, foe.z);
  if (foe.health <= 0) {
    foe.health = 0;
    foe.state = 'down';
    foe.mesh.visible = false;
    W.tally.kills = (W.tally.kills || 0) + 1;
    W.hero.rep += 10;
    dropFoe(W, foe);
    if (W.jobs) W.jobs.onFoeDown(foe);
  }
}

function harmWalker(W, walker, amount) {
  if (walker.state === 'down') return;
  walker.state = 'down';
  walker.speed = 0;
  W.view.spawnBlood(walker.x, 1.2, walker.z);
  if (walker.mesh) walker.mesh.visible = false;
  if (walker.cop) raiseHeat(W, 1, 'You shot a cop.');
  else raiseHeat(W, 1, 'Someone saw you shoot a civilian.');
}

/** Fire the current weapon. Returns false when it cannot fire (reloading/empty). */
export function fireWeapon(W) {
  const hero = W.hero;
  const spec = ARSENAL[hero.weapon];
  if (!spec || hero.reloadT > 0 || hero.fireT > 0) return false;
  if (spec.style === 'melee') {
    hero.fireT = 1 / spec.pace;
    return swingMelee(W, spec);
  }
  if (hero.ammo[hero.weapon] <= 0) {
    startReload(W);
    return false;
  }
  hero.fireT = 1 / spec.pace;
  hero.ammo[hero.weapon] -= 1;
  const count = spec.shot ?? 1;
  const cam = W.view.camera;
  const muzzle = {
    x: hero.x + Math.sin(W.yaw) * 0.7,
    y: 1.45,
    z: hero.z + Math.cos(W.yaw) * 0.7,
  };
  W.view.spawnFlash(muzzle.x, muzzle.y, muzzle.z);
  if (W.sound) {
    if (hero.weapon === 'shotgun') W.sound.shotgun();
    else W.sound.shot();
  }
  panicWalkers(W, hero.x, hero.z, 60);
  if (W.heat.stars === 0 && W.heat.beat.length > 0) raiseHeat(W, 1, 'A cop heard the shot.');
  // Kick the camera a touch.
  W.view.addShake(spec.jolt * 60);

  for (let i = 0; i < count; i += 1) {
    const spread = spec.wobble;
    cross.set((Math.random() - 0.5) * spread * 40, (Math.random() - 0.5) * spread * 40);
    caster.setFromCamera(cross, cam);
    caster.far = spec.reach;
    // Targets: static town meshes plus every live entity mesh.
    const targets = W.solidHit.slice();
    for (const f of W.foes) if (f.mesh) targets.push(f.mesh);
    for (const walker of W.walkers) if (walker.mesh && walker.state !== 'down') targets.push(walker.mesh);
    for (const car of W.motors) if (car.mesh && !car.dead) targets.push(car.mesh);
    const hits = caster.intersectObjects(targets, true);
    const hit = hits[0];
    const end = hit ? hit.point : caster.ray.at(spec.reach, new THREE.Vector3());
    W.view.spawnTracer(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z);
    if (!hit) continue;
    const ref = findTarget(hit.object);
    W.view.spawnSpark(hit.point.x, hit.point.y, hit.point.z);
    if (!ref) continue;
    if (ref.kind === 'enemy') harmFoe(W, ref.ref, spec.hurt);
    else if (ref.kind === 'ped') harmWalker(W, ref.ref, spec.hurt);
    else if (ref.kind === 'car') {
      const car = ref.ref;
      if (car.driver === 'police') raiseHeat(W, 1, 'You shot a police cruiser.');
      harmVehicle(W, car, spec.hurt);
    }
  }
  return true;
}

export function startReload(W) {
  const hero = W.hero;
  const spec = ARSENAL[hero.weapon];
  if (!spec || spec.style !== 'gun' || hero.reloadT > 0) return;
  if (hero.ammo[hero.weapon] >= spec.clip) return;
  hero.reloadT = 1.1;
  if (W.sound) W.sound.click();
}

export function completeReload(W) {
  const hero = W.hero;
  const spec = ARSENAL[hero.weapon];
  if (spec && spec.style === 'gun') hero.ammo[hero.weapon] = spec.clip;
}

/** Melee swing in front of the hero. Returns true when something was hit. */
export function swingMelee(W, spec) {
  const hero = W.hero;
  const w = spec || ARSENAL[hero.weapon];
  const reach = w.reach + 0.6;
  const facing = W.yaw;
  let landed = false;
  const tryHit = (tx, tz, hit) => {
    const d = Math.hypot(tx - hero.x, tz - hero.z);
    if (d > reach) return;
    const dir = Math.atan2(tx - hero.x, tz - hero.z);
    let diff = dir - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 1.1) {
      hit();
      landed = true;
    }
  };
  for (const f of [...W.foes]) {
    if (f.state === 'alive') tryHit(f.x, f.z, () => harmFoe(W, f, w.hurt));
  }
  for (const walker of W.walkers) {
    if (walker.state !== 'down') {
      tryHit(walker.x, walker.z, () => {
        if (walker.cop) raiseHeat(W, 1, 'You hit a cop.');
        else raiseHeat(W, 1, 'You beat someone up in public.');
        harmWalker(W, walker, w.hurt);
      });
    }
  }
  if (W.sound) W.sound.punch();
  return landed;
}

/** Foot cops and gang members can hurt the hero. Armor absorbs first. */
export function harmHero(W, amount) {
  const hero = W.hero;
  if (hero.invuln > 0 || W.screen !== 'play') return;
  hero.invuln = 0.45;
  let rest = amount;
  if (hero.armor > 0) {
    const soaked = Math.min(hero.armor, rest * 0.6);
    hero.armor -= soaked;
    rest -= soaked;
  }
  hero.health -= rest;
  W.view.addShake(7);
  W.painFlash = 1;
  if (hero.health <= 0) {
    hero.health = 0;
    if (W.onWasted) W.onWasted();
  }
}

function foeShoot(W, foe, dt) {
  const hero = W.hero;
  foe.shotT -= dt;
  if (foe.shotT > 0) return;
  foe.shotT = 0.9 + W.dice.between(0, 0.9);
  const d = Math.hypot(hero.x - foe.x, hero.z - foe.z);
  if (d > 42 || hero.car) return; // they cannot hit a moving car reliably; they aim at the hero on foot
  const muzzle = { x: foe.x + Math.sin(foe.facing) * 0.7, y: 1.4, z: foe.z + Math.cos(foe.facing) * 0.7 };
  W.view.spawnFlash(muzzle.x, muzzle.y, muzzle.z);
  if (W.sound) W.sound.shot();
  const chance = foe.aim * Math.max(0.25, 1 - d / 55);
  const spread = 1.5;
  const tx = hero.x + (Math.random() - 0.5) * spread * 2;
  const tz = hero.z + (Math.random() - 0.5) * spread * 2;
  W.view.spawnTracer(muzzle.x, muzzle.y, muzzle.z, tx, 1.3, tz);
  if (Math.random() < chance) harmHero(W, foe.hurt);
}

export function stepFoes(W, dt) {
  const hero = W.hero;
  for (const f of [...W.foes]) {
    if (f.state !== 'alive') continue;
    const dx = hero.x - f.x;
    const dz = hero.z - f.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - f.facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    f.facing += Math.max(-4 * dt, Math.min(4 * dt, diff));
    if (d > 20) {
      const nx = f.x + Math.sin(f.facing) * f.speed * dt;
      const nz = f.z + Math.cos(f.facing) * f.speed * dt;
      if (!isSolid(W.town, nx, nz, f.r)) {
        f.x = nx;
        f.z = nz;
      } else {
        f.facing += Math.PI / 3;
      }
      pushOut(W.town, f);
      f.walkPhase += dt * f.speed * 1.6;
      const s = Math.sin(f.walkPhase) * 0.55;
      const u = f.mesh.userData;
      if (u.legL) {
        u.legL.rotation.x = s;
        u.legR.rotation.x = -s;
      }
    } else {
      foeShoot(W, f, dt);
    }
    f.mesh.position.set(f.x, 0, f.z);
    f.mesh.rotation.y = f.facing;
    // Health bar faces the camera and shows remaining health.
    const hb = f.bar;
    if (hb) {
      hb.bar.lookAt(W.view.camera.position);
      const k = Math.max(0, f.health / f.maxHealth);
      hb.front.scale.x = k;
      hb.front.position.x = -(1 - k) * 0.53;
      hb.front.material.color.setHex(k > 0.5 ? 0x2ecc71 : k > 0.25 ? 0xf5b942 : 0xe74c3c);
    }
  }
}
