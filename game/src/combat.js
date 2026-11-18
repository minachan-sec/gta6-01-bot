// Combat: shooting (raycast), melee, reload, and enemy AI.
// Enemies are crew members with a health bar; they advance and shoot back.
import * as THREE from 'three';
import { CFG, WEAPONS } from './config.js';
import { addWanted, wasted } from './police.js';
import { damageCar } from './vehicles.js';
import { scarePeds } from './traffic.js';

const raycaster = new THREE.Raycaster();
const aimDir = new THREE.Vector3();

export function shoot(W) {
  const p = W.player;
  if (p.car || p.fireT > 0 || p.reloadT > 0) return;
  const def = WEAPONS[p.weapon];
  if (def.kind !== 'gun') return;
  if (p.ammo[p.weapon] <= 0) {
    p.reloadT = def.reload;
    return;
  }
  p.ammo[p.weapon] -= 1;
  p.fireT = def.rate;
  const pellets = def.pellets || 1;
  // The shot leaves the player's gun and travels horizontally along the
  // camera yaw, at torso height. (Shooting along the camera's 3D forward
  // would dive into the ground: the camera sits high and looks down.)
  const origin = new THREE.Vector3(p.x, 1.4, p.z);
  const baseDir = new THREE.Vector3(Math.sin(W.camYaw), 0, Math.cos(W.camYaw));
  for (let i = 0; i < pellets; i += 1) {
    const dir = baseDir.clone();
    dir.x += (Math.random() - 0.5) * def.spread * 2;
    dir.y += (Math.random() - 0.5) * def.spread * 2;
    dir.z += (Math.random() - 0.5) * def.spread * 2;
    dir.normalize();
    raycaster.set(origin, dir);
    raycaster.far = def.range;
    const targets = [];
    for (const e of W.enemies) if (e.mesh && e.health > 0) targets.push(e.mesh);
    for (const car of W.cars) if (car.mesh && !car.dead) targets.push(car.mesh);
    for (const ped of W.peds) if (ped.mesh) targets.push(ped.mesh);
    for (const cop of W.wanted.footCops) if (cop.mesh) targets.push(cop.mesh);
    const hits = raycaster.intersectObjects(targets, true);
    if (hits.length > 0) {
      const hit = hits[0];
      let obj = hit.object;
      while (obj && !obj.userData.hitRef && obj.parent) obj = obj.parent;
      const ref = obj ? obj.userData.hitRef : null;
      if (ref) {
        if (ref.kind === 'enemy') hurtEnemy(W, ref.ref, def.damage, hit.point);
        else if (ref.kind === 'car') {
          damageCar(W, ref.ref, def.damage);
          addWanted(W, 1, 'You shot a car in public.');
        } else if (ref.kind === 'ped') {
          scarePeds(W, ref.ref.x, ref.ref.z, 30);
          addWanted(W, 2, 'You shot a civilian.');
          W.renderer.spawnSparks(hit.point.x, hit.point.y, hit.point.z);
        } else if (ref.kind === 'cop') {
          addWanted(W, 1, 'You shot a cop.');
          W.renderer.spawnSparks(hit.point.x, hit.point.y, hit.point.z);
        }
      }
      W.renderer.spawnSparks(hit.point.x, hit.point.y, hit.point.z);
    }
  }
  // Muzzle flash at the player's gun + noise that draws attention.
  W.renderer.spawnFlash(p.x + Math.sin(W.camYaw) * 1.2, 1.4, p.z + Math.cos(W.camYaw) * 1.2);
  W.renderer.addShake(1.5);
  if (W.audio) W.audio.gunshot();
  scarePeds(W, p.x, p.z, 25);
}

export function reload(W) {
  const p = W.player;
  const def = WEAPONS[p.weapon];
  if (def.kind !== 'gun' || p.reloadT > 0) return;
  if (p.ammo[p.weapon] >= def.mag) return;
  p.reloadT = def.reload;
}

export function finishReload(W) {
  const p = W.player;
  const def = WEAPONS[p.weapon];
  if (def.kind === 'gun') p.ammo[p.weapon] = def.mag;
  if (W.audio) W.audio.click();
}

export function melee(W, def) {
  const p = W.player;
  if (p.car || p.fireT > 0) return;
  p.fireT = def.rate;
  const range = def.range || CFG.combat.meleeRange;
  let hitAny = false;
  for (const e of W.enemies) {
    if (e.health <= 0) continue;
    const d = Math.hypot(e.x - p.x, e.z - p.z);
    if (d > range) continue;
    const ang = Math.atan2(e.x - p.x, e.z - p.z);
    let diff = ang - p.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > CFG.combat.meleeArc) continue;
    hurtEnemy(W, e, def.damage, { x: e.x, y: 1, z: e.z });
    hitAny = true;
  }
  // A punch can also smash a car window — and anger the law.
  for (const car of W.cars) {
    if (car.dead) continue;
    if (Math.hypot(car.x - p.x, car.z - p.z) < range + 1) {
      damageCar(W, car, def.damage * 0.5);
      hitAny = true;
    }
  }
  if (hitAny && W.audio) W.audio.punch();
}

function hurtEnemy(W, e, damage, point) {
  e.health -= damage;
  e.flashT = 0.12;
  if (e.healthBar) {
    e.healthBar.scale.x = Math.max(0.01, e.health / e.maxHealth);
  }
  W.renderer.spawnSparks(point.x, point.y, point.z);
  if (e.health <= 0) {
    e.health = 0;
    W.stats.kills += 1;
    W.mission.killsDone += 1;
    if (e.mesh) {
      e.mesh.rotation.x = -Math.PI / 2;
      e.mesh.position.y = 0.3;
    }
    if (e.healthBar) e.healthBar.visible = false;
    // The body fades out after a few seconds.
    e.fadeT = 4;
  }
}

export function spawnEnemies(W, list) {
  // list: [{x, z, hp, boss}]
  for (const spec of list) {
    const e = {
      x: spec.x,
      z: spec.z,
      heading: Math.atan2(W.player.x - spec.x, W.player.z - spec.z),
      health: spec.hp || 60,
      maxHealth: spec.hp || 60,
      boss: !!spec.boss,
      fireT: 1 + Math.random(),
      speed: spec.boss ? 4.5 : 3.6,
      r: 0.6,
      walkPhase: Math.random() * 6,
      flashT: 0,
      fadeT: 0,
      mesh: null,
      healthBar: null,
    };
    e.mesh = W.renderer.makePersonMesh(spec.boss ? 0x8b0000 : 0x5b2c6f, 0x1a1a2e, 0xe8b98a, { weapon: true });
    if (spec.boss) e.mesh.scale.set(1.25, 1.25, 1.25);
    e.mesh.userData.hitRef = { kind: 'enemy', ref: e };
    W.renderer.scene.add(e.mesh);
    // Health bar: a small green plane floating above the head.
    const bar = new THREE.Mesh(
      new THREE.PlaneGeometry(1.1, 0.14),
      new THREE.MeshBasicMaterial({ color: spec.boss ? 0xff3333 : 0x33ff66, transparent: true, opacity: 0.9 }),
    );
    bar.position.set(e.x, 2.3, e.z);
    W.renderer.scene.add(bar);
    e.healthBar = bar;
    W.enemies.push(e);
  }
}

export function clearEnemies(W) {
  for (const e of W.enemies) {
    if (e.mesh) W.renderer.scene.remove(e.mesh);
    if (e.healthBar) W.renderer.scene.remove(e.healthBar);
  }
  W.enemies = [];
}

export function updateEnemies(W, dt) {
  const p = W.player;
  for (const e of W.enemies) {
    if (e.health <= 0) {
      if (e.fadeT > 0) {
        e.fadeT -= dt;
        if (e.fadeT <= 0) {
          if (e.mesh) W.renderer.scene.remove(e.mesh);
          e.mesh = null;
        }
      }
      continue;
    }
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    // Advance until in shooting range, then stand and fire.
    if (d > CFG.combat.enemyShootRange * 0.7 && d < CFG.combat.enemySight) {
      e.heading = Math.atan2(dx, dz);
      e.x += Math.sin(e.heading) * e.speed * dt;
      e.z += Math.cos(e.heading) * e.speed * dt;
      e.walkPhase += dt * 9;
    } else if (d <= CFG.combat.enemyShootRange) {
      e.heading = Math.atan2(dx, dz);
      e.fireT -= dt;
      if (e.fireT <= 0) {
        e.fireT = e.boss ? 1.4 : 1.8 + Math.random() * 1.0;
        // Enemy fire: a visible flash + a chance to land.
        W.renderer.spawnFlash(e.x + Math.sin(e.heading), 1.4, e.z + Math.cos(e.heading));
        if (Math.random() < CFG.combat.enemyAccuracy && p.invuln <= 0) {
          hurtPlayer(W, e.boss ? 10 : 5);
        }
        if (W.audio) W.audio.gunshot();
      }
    }
    if (e.mesh) {
      e.mesh.position.set(e.x, 0, e.z);
      e.mesh.rotation.y = e.heading;
      const u = e.mesh.userData;
      if (u.legL) {
        const s = Math.sin(e.walkPhase) * 0.5;
        u.legL.rotation.x = s;
        u.legR.rotation.x = -s;
        u.armR.rotation.x = -1.2; // aiming
      }
      if (e.flashT > 0) {
        e.flashT -= dt;
        e.mesh.position.y = 0.05;
      } else {
        e.mesh.position.y = 0;
      }
    }
    if (e.healthBar) {
      e.healthBar.position.set(e.x, 2.35, e.z);
      e.healthBar.lookAt(W.renderer.camera.position);
    }
  }
}

export function hurtPlayer(W, amount) {
  const p = W.player;
  if (p.invuln > 0 || W.screen !== 'play') return;
  let rest = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.health -= rest;
  p.invuln = 0.5;
  W.hudFlash = 1;
  W.renderer.addShake(4);
  if (p.health <= 0) {
    p.health = 0;
    wasted(W);
  }
}
