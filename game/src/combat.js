// Combat: six weapons, hitscan shooting through the crosshair (a real
// THREE.Raycaster against the world), melee, and the mission enemies —
// gang members who chase the player and shoot back. Shooting in public is
// a crime; hitting a cop is a bigger one.
import * as THREE from 'three';
import { CFG, WEAPONS } from './config.js';
import { addWanted } from './police.js';
import { scarePeds } from './traffic.js';
import { damageCar } from './vehicles.js';
import { isBlocked, resolveCollision } from './city.js';

const raycaster = new THREE.Raycaster();
const center = new THREE.Vector2(0, 0);

function findHitRef(obj) {
  let o = obj;
  while (o) {
    if (o.userData && o.userData.hitRef) return o.userData.hitRef;
    o = o.parent;
  }
  return null;
}

/** Attach a floating health bar to an enemy's mesh group. */
function addHealthBar(mesh) {
  const bar = new THREE.Group();
  const bg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.14),
    new THREE.MeshBasicMaterial({ color: 0x14161a, transparent: true, opacity: 0.8, depthWrite: false }),
  );
  const fg = new THREE.Mesh(
    new THREE.PlaneGeometry(1.06, 0.1),
    new THREE.MeshBasicMaterial({ color: 0xe74c3c, transparent: true, opacity: 0.95, depthWrite: false }),
  );
  fg.position.z = 0.01;
  bar.add(bg, fg);
  bar.position.y = 2.45;
  mesh.add(bar);
  return { bar, fg };
}

export function createEnemy(G, x, z, opts = {}) {
  const mesh = G.renderer.makePersonMesh(opts.shirt ?? 0x7a1f2b, opts.pants ?? 0x1a1a1a, opts.skin ?? 0xc68642, { weapon: true, cap: 0x1a1a1a });
  mesh.position.set(x, 0, z);
  G.renderer.scene.add(mesh);
  const hb = addHealthBar(mesh);
  const enemy = {
    x, z,
    heading: Math.atan2(G.player.x - x, G.player.z - z),
    health: opts.health ?? 60,
    maxHealth: opts.health ?? 60,
    speed: opts.speed ?? 5.2,
    damage: opts.damage ?? 9,
    accuracy: opts.accuracy ?? 0.45,
    shootT: G.rng.range(0.4, 1.2),
    state: 'alive',
    r: 0.55,
    mesh,
    healthBar: hb,
    walkPhase: G.rng.range(0, 6),
    boss: !!opts.boss,
  };
  mesh.userData.hitRef = { kind: 'enemy', ref: enemy };
  G.enemies.push(enemy);
  return enemy;
}

export function removeEnemy(G, enemy) {
  const i = G.enemies.indexOf(enemy);
  if (i !== -1) G.enemies.splice(i, 1);
  if (enemy.mesh) {
    G.renderer.scene.remove(enemy.mesh);
    enemy.mesh.userData.hitRef = null;
  }
}

export function clearEnemies(G) {
  for (const e of [...G.enemies]) removeEnemy(G, e);
}

function hurtEnemy(G, enemy, damage) {
  if (enemy.state !== 'alive') return;
  enemy.health -= damage;
  G.renderer.spawnBlood(enemy.x, 1.4, enemy.z);
  if (enemy.health <= 0) {
    enemy.health = 0;
    enemy.state = 'down';
    enemy.mesh.visible = false;
    G.stats.kills = (G.stats.kills || 0) + 1;
    G.player.rep += 10;
    removeEnemy(G, enemy);
    if (G.mission) G.mission.onEnemyDown(enemy);
  }
}

function hurtPed(G, ped, damage) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.speed = 0;
  G.renderer.spawnBlood(ped.x, 1.2, ped.z);
  if (ped.mesh) ped.mesh.visible = false;
  if (ped.cop) addWanted(G, 1, 'You shot a cop.');
  else addWanted(G, 1, 'Someone saw you shoot a civilian.');
}

/** Fire the current weapon. Returns false when it cannot fire (reloading/empty). */
export function shoot(G) {
  const p = G.player;
  const def = WEAPONS[p.weapon];
  if (!def || p.reloadT > 0 || p.fireT > 0) return false;
  if (def.kind === 'melee') {
    p.fireT = 1 / def.rate;
    return punch(G, def);
  }
  if (p.ammo[p.weapon] <= 0) {
    reload(G);
    return false;
  }
  p.fireT = 1 / def.rate;
  p.ammo[p.weapon] -= 1;
  const pellets = def.pellets ?? 1;
  const cam = G.renderer.camera;
  const muzzle = {
    x: p.x + Math.sin(G.camYaw) * 0.7,
    y: 1.45,
    z: p.z + Math.cos(G.camYaw) * 0.7,
  };
  G.renderer.spawnFlash(muzzle.x, muzzle.y, muzzle.z);
  if (G.audio) {
    if (p.weapon === 'shotgun') G.audio.shotgun();
    else G.audio.shot();
  }
  scarePeds(G, p.x, p.z, 60);
  if (G.wanted.stars === 0 && G.wanted.footCops.length > 0) addWanted(G, 1, 'A cop heard the shot.');
  // Kick the camera a touch.
  G.renderer.addShake(def.kick * 60);

  for (let i = 0; i < pellets; i += 1) {
    const spread = def.spread;
    center.set((Math.random() - 0.5) * spread * 40, (Math.random() - 0.5) * spread * 40);
    raycaster.setFromCamera(center, cam);
    raycaster.far = def.range;
    // Targets: static city meshes plus every live entity mesh.
    const targets = G.staticHit.slice();
    for (const e of G.enemies) if (e.mesh) targets.push(e.mesh);
    for (const ped of G.peds) if (ped.mesh && ped.state !== 'down') targets.push(ped.mesh);
    for (const car of G.cars) if (car.mesh && !car.dead) targets.push(car.mesh);
    const hits = raycaster.intersectObjects(targets, true);
    const hit = hits[0];
    const end = hit ? hit.point : raycaster.ray.at(def.range, new THREE.Vector3());
    G.renderer.spawnTracer(muzzle.x, muzzle.y, muzzle.z, end.x, end.y, end.z);
    if (!hit) continue;
    const ref = findHitRef(hit.object);
    G.renderer.spawnSpark(hit.point.x, hit.point.y, hit.point.z);
    if (!ref) continue;
    if (ref.kind === 'enemy') hurtEnemy(G, ref.ref, def.damage);
    else if (ref.kind === 'ped') hurtPed(G, ref.ref, def.damage);
    else if (ref.kind === 'car') {
      const car = ref.ref;
      if (car.driver === 'police') addWanted(G, 1, 'You shot a police cruiser.');
      damageCar(G, car, def.damage);
    }
  }
  return true;
}

export function reload(G) {
  const p = G.player;
  const def = WEAPONS[p.weapon];
  if (!def || def.kind !== 'gun' || p.reloadT > 0) return;
  if (p.ammo[p.weapon] >= def.mag) return;
  p.reloadT = 1.1;
  if (G.audio) G.audio.click();
}

export function finishReload(G) {
  const p = G.player;
  const def = WEAPONS[p.weapon];
  if (def && def.kind === 'gun') p.ammo[p.weapon] = def.mag;
}

/** Melee swing in front of the player. Returns true when something was hit. */
export function punch(G, def) {
  const p = G.player;
  const w = def || WEAPONS[p.weapon];
  const range = w.range + 0.6;
  const facing = G.camYaw;
  let hitAny = false;
  const tryHit = (tx, tz, hit) => {
    const d = Math.hypot(tx - p.x, tz - p.z);
    if (d > range) return;
    const dir = Math.atan2(tx - p.x, tz - p.z);
    let diff = dir - facing;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < 1.1) {
      hit();
      hitAny = true;
    }
  };
  for (const e of [...G.enemies]) {
    if (e.state === 'alive') tryHit(e.x, e.z, () => hurtEnemy(G, e, w.damage));
  }
  for (const ped of G.peds) {
    if (ped.state !== 'down') {
      tryHit(ped.x, ped.z, () => {
        if (ped.cop) addWanted(G, 1, 'You hit a cop.');
        else addWanted(G, 1, 'You beat someone up in public.');
        hurtPed(G, ped, w.damage);
      });
    }
  }
  if (G.audio) G.audio.punch();
  return hitAny;
}

/** Foot cops and gang members can hurt the player. Armor absorbs first. */
export function hurtPlayer(G, amount) {
  const p = G.player;
  if (p.invuln > 0 || G.screen !== 'play') return;
  p.invuln = 0.45;
  let rest = amount;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest * 0.6);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.health -= rest;
  G.renderer.addShake(7);
  G.hudFlash = 1;
  if (p.health <= 0) {
    p.health = 0;
    if (G.onWasted) G.onWasted();
  }
}

function enemyShoot(G, enemy, dt) {
  const p = G.player;
  enemy.shootT -= dt;
  if (enemy.shootT > 0) return;
  enemy.shootT = 0.9 + G.rng.range(0, 0.9);
  const d = Math.hypot(p.x - enemy.x, p.z - enemy.z);
  if (d > 42 || p.car) return; // they cannot hit a moving car reliably; they aim at the player on foot
  const muzzle = { x: enemy.x + Math.sin(enemy.heading) * 0.7, y: 1.4, z: enemy.z + Math.cos(enemy.heading) * 0.7 };
  G.renderer.spawnFlash(muzzle.x, muzzle.y, muzzle.z);
  if (G.audio) G.audio.shot();
  const hitChance = enemy.accuracy * Math.max(0.25, 1 - d / 55);
  const spread = 1.5;
  const tx = p.x + (Math.random() - 0.5) * spread * 2;
  const tz = p.z + (Math.random() - 0.5) * spread * 2;
  G.renderer.spawnTracer(muzzle.x, muzzle.y, muzzle.z, tx, 1.3, tz);
  if (Math.random() < hitChance) hurtPlayer(G, enemy.damage);
}

export function updateEnemies(G, dt) {
  const p = G.player;
  for (const e of [...G.enemies]) {
    if (e.state !== 'alive') continue;
    const dx = p.x - e.x;
    const dz = p.z - e.z;
    const d = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    let diff = want - e.heading;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    e.heading += Math.max(-4 * dt, Math.min(4 * dt, diff));
    if (d > 20) {
      const nx = e.x + Math.sin(e.heading) * e.speed * dt;
      const nz = e.z + Math.cos(e.heading) * e.speed * dt;
      if (!isBlocked(G.city, nx, nz, e.r)) {
        e.x = nx;
        e.z = nz;
      } else {
        e.heading += Math.PI / 3;
      }
      resolveCollision(G.city, e);
      e.walkPhase += dt * e.speed * 1.6;
      const s = Math.sin(e.walkPhase) * 0.55;
      const u = e.mesh.userData;
      if (u.legL) {
        u.legL.rotation.x = s;
        u.legR.rotation.x = -s;
      }
    } else {
      enemyShoot(G, e, dt);
    }
    e.mesh.position.set(e.x, 0, e.z);
    e.mesh.rotation.y = e.heading;
    // Health bar faces the camera and shows remaining health.
    const hb = e.healthBar;
    if (hb) {
      hb.bar.lookAt(G.renderer.camera.position);
      const k = Math.max(0, e.health / e.maxHealth);
      hb.fg.scale.x = k;
      hb.fg.position.x = -(1 - k) * 0.53;
      hb.fg.material.color.setHex(k > 0.5 ? 0x2ecc71 : k > 0.25 ? 0xf5b942 : 0xe74c3c);
    }
  }
}
