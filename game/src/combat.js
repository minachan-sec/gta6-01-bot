// Combat: fists up close, a pistol at range, and the bullets and muzzle
// flashes between them. Shooting in public is a crime; hitting a cop is a
// bigger one.
import { PLAYER } from './config.js';
import { addWanted } from './police.js';
import { scarePeds } from './traffic.js';

export function updateBullets(G, dt) {
  for (let i = G.bullets.length - 1; i >= 0; i -= 1) {
    const b = G.bullets[i];
    b.x += Math.cos(b.angle) * b.speed * dt;
    b.y += Math.sin(b.angle) * b.speed * dt;
    b.life -= dt;
    let hit = b.life <= 0;
    // Buildings stop bullets.
    for (const bd of G.city.buildings) {
      if (b.x > bd.x && b.x < bd.x + bd.w && b.y > bd.y && b.y < bd.y + bd.h) { hit = true; break; }
    }
    if (!hit) {
      // Peds and foot cops.
      for (const ped of G.peds) {
        if (Math.hypot(ped.x - b.x, ped.y - b.y) < ped.r + 4) {
          hit = true;
          hurtPed(G, ped, b.damage, b.angle);
          break;
        }
      }
    }
    if (!hit) {
      // Cars (not the one the player drives).
      for (const car of G.cars) {
        if (car.dead || car === G.player.car) continue;
        const dx = b.x - car.x;
        const dy = b.y - car.y;
        const localX = dx * Math.cos(-car.angle) - dy * Math.sin(-car.angle);
        const localY = dx * Math.sin(-car.angle) + dy * Math.cos(-car.angle);
        if (Math.abs(localX) < car.length / 2 + 4 && Math.abs(localY) < car.width / 2 + 4) {
          hit = true;
          if (car.driver === 'police') addWanted(G, 1, 'You shot a police cruiser.');
          damageCarShot(G, car, b.damage);
          break;
        }
      }
    }
    if (hit) {
      G.particles.push({ kind: 'spark', x: b.x, y: b.y, t: 0, life: 0.25 });
      G.bullets.splice(i, 1);
    }
  }
}

function damageCarShot(G, car, damage) {
  car.health -= damage;
  if (car.health <= 0 && !car.dead) {
    car.dead = true;
    G.particles.push({ kind: 'explosion', x: car.x, y: car.y, t: 0, life: 0.9 });
    if (car.driver === 'traffic') {
      const idx = G.traffic.indexOf(car);
      if (idx !== -1) G.traffic.splice(idx, 1);
    }
  }
}

function hurtPed(G, ped, damage, angle) {
  if (ped.cop) {
    addWanted(G, 1, 'You shot a cop.');
    ped.panic = 0;
    // A shot cop goes down and stays down.
    ped.state = 'down';
    ped.speed = 0;
    G.particles.push({ kind: 'blood', x: ped.x, y: ped.y, t: 0, life: 0.5 });
    return;
  }
  ped.state = 'down';
  ped.speed = 0;
  ped.panic = 0;
  G.particles.push({ kind: 'blood', x: ped.x, y: ped.y, t: 0, life: 0.5 });
  addWanted(G, 1, 'Someone saw you shoot a civilian.');
}

/** Fire the pistol toward the mouse. Returns false when there is no ammo. */
export function shoot(G, angle) {
  const p = G.player;
  if (p.ammo <= 0) {
    G.message = 'Out of ammo — find the gun shop on Marlin Ave.';
    return false;
  }
  p.ammo -= 1;
  const mx = p.x + Math.cos(angle) * 22;
  const my = p.y + Math.sin(angle) * 22;
  G.bullets.push({ x: mx, y: my, angle, speed: 900, life: 1.2, damage: PLAYER.pistolDamage });
  G.particles.push({ kind: 'flash', x: mx, y: my, t: 0, life: 0.08, angle });
  p.aimAngle = angle;
  if (G.audio) G.audio.shot();
  scarePeds(G, p.x, p.y, 420);
  // A cop in earshot notices.
  if (G.wanted.stars === 0 && G.wanted.footCops.length > 0) addWanted(G, 1, 'A cop heard the shot.');
  return true;
}

/** A punch: short range, no ammo, no noise — but a cop who sees it cares. */
export function punch(G) {
  const p = G.player;
  const range = 34;
  let hitAny = false;
  for (const ped of G.peds) {
    if (ped.state === 'down') continue;
    const d = Math.hypot(ped.x - p.x, ped.y - p.y);
    if (d < range + ped.r) {
      const dir = Math.atan2(ped.y - p.y, ped.x - p.x);
      const facing = Math.abs(((dir - p.aimAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (facing < 1.2) {
        hitAny = true;
        if (ped.cop) addWanted(G, 1, 'You hit a cop.');
        else addWanted(G, 1, 'You beat someone up in public.');
        ped.state = 'down';
        ped.speed = 0;
        G.particles.push({ kind: 'blood', x: ped.x, y: ped.y, t: 0, life: 0.4 });
      }
    }
  }
  if (G.audio) G.audio.punch();
  return hitAny;
}

/** Foot cops and angry drivers can hurt the player up close. */
export function hurtPlayer(G, amount) {
  const p = G.player;
  if (p.invulnerable > 0) return;
  p.health -= amount;
  p.invulnerable = 0.6;
  G.shake = 8;
  if (p.health <= 0) {
    p.health = 0;
    if (G.onWasted) G.onWasted();
  }
}
