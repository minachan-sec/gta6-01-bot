// Solara Bay itself: a street grid, the blocks between the streets, the
// towers and parks on them, the beach and sea at the south edge, and every
// query the simulation needs (is this point solid? on a street? where is a
// random street spot?). Generation is seeded, so one seed always builds
// the same town. Coordinates are metres on the x/z plane; y is up. z+ is
// south (toward the beach).
import { TUNE, PAINT } from './config.js';

export const STREETS = [-280, -200, -120, -40, 40, 120, 200, 280];
export const STREET_W = TUNE.map.streetWide;
export const EDGE = TUNE.map.span / 2;

const SIGN_WORDS = ['HOTEL', 'BAR', '24H', 'CLUB', 'NEON', 'PIZZA', 'MOTEL', 'DISCO', 'TACOS', 'CINEMA', 'GYM', 'LIQUOR'];

// Hand-placed spots, so jobs always have somewhere to point. Each is a
// building footprint (x/z are its centre) on a block edge.
const SPOTS = {
  garage: { x: -80, z: 80, w: 30, d: 21, h: 9, tag: "Marisol's Garage" },
  paintShop: { x: 160, z: -80, w: 28, d: 19, h: 8, tag: 'Solara Paint & Body' },
  bank: { x: 80, z: -200, w: 33, d: 23, h: 16, tag: 'Bay Union Bank' },
  safehouse: { x: 260, z: -260, w: 26, d: 20, h: 10, tag: 'Safehouse' },
  marina: { x: -280, z: 120, w: 0, d: 0, h: 0, tag: 'Marina Docks' },
  plaza: { x: 80, z: 0, w: 0, d: 0, h: 0, tag: 'Bayfront Plaza' },
  beachBar: { x: 200, z: 260, w: 22, d: 16, h: 8, tag: 'Neon Tide Bar' },
};

function blockBounds(col, row) {
  const x0 = STREETS[col] + STREET_W / 2 + 3;
  const x1 = STREETS[col + 1] - STREET_W / 2 - 3;
  const z0 = STREETS[row] + STREET_W / 2 + 3;
  const z1 = STREETS[row + 1] - STREET_W / 2 - 3;
  return { x0, z0, x1, z1, w: x1 - x0, d: z1 - z0 };
}

export function generateTown(dice) {
  const towers = [];
  const greens = [];
  const palms = [];
  const yards = [];
  const posts = [];
  const signs = [];

  for (let col = 0; col < STREETS.length - 1; col += 1) {
    for (let row = 0; row < STREETS.length - 1; row += 1) {
      const b = blockBounds(col, row);
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      // South row is beachfront: sand and palms, no towers.
      if (row === STREETS.length - 2) {
        greens.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'beach' });
        for (let i = 0; i < 5; i += 1) {
          palms.push({ x: dice.between(b.x0 + 4, b.x1 - 4), z: dice.between(b.z0 + 4, b.z1 - 4), palm: true });
        }
        continue;
      }
      // Central block is the plaza; one block is the stadium.
      if (col === 4 && row === 3) {
        greens.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'plaza' });
        for (let i = 0; i < 4; i += 1) {
          palms.push({ x: dice.between(b.x0 + 5, b.x1 - 5), z: dice.between(b.z0 + 5, b.z1 - 5), palm: false });
        }
        continue;
      }
      if (col === 5 && row === 1) {
        greens.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'stadium' });
        continue;
      }
      const roll = dice.unit();
      if (roll < 0.1) {
        greens.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'park' });
        for (let i = 0; i < 10; i += 1) {
          palms.push({ x: dice.between(b.x0 + 4, b.x1 - 4), z: dice.between(b.z0 + 4, b.z1 - 4), palm: dice.maybe(0.3) });
        }
        continue;
      }
      if (roll < 0.18) {
        yards.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
        continue;
      }
      // Towers: one big one, or two smaller ones side by side. Taller near
      // the downtown core (80, -80).
      const downtown = Math.hypot(cx - 80, cz + 80);
      const tall = downtown < 170 ? dice.between(18, 55) : dice.between(8, 22);
      const count = dice.maybe(0.45) ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const w = count === 1 ? dice.between(b.w * 0.55, b.w * 0.8) : dice.between(b.w * 0.32, b.w * 0.42);
        const d = dice.between(b.d * 0.5, b.d * 0.75);
        const x = count === 1 ? cx : b.x0 + 4 + (i * b.w) / 2 + (b.w / 2 - w) / 2 + w / 2;
        const z = cz + dice.between(-4, 4);
        towers.push({
          x, z, w, d,
          h: count === 1 ? tall : dice.between(8, 20),
          tint: dice.choose(PAINT.towers),
          tag: null,
        });
      }
    }
  }

  // Landmark buildings replace whatever the grid put near them.
  for (const key of Object.keys(SPOTS)) {
    const spot = SPOTS[key];
    if (spot.w === 0) continue;
    for (let i = towers.length - 1; i >= 0; i -= 1) {
      const t = towers[i];
      if (Math.abs(t.x - spot.x) < (t.w + spot.w) / 2 + 2 && Math.abs(t.z - spot.z) < (t.d + spot.d) / 2 + 2) {
        towers.splice(i, 1);
      }
    }
    towers.push({ x: spot.x, z: spot.z, w: spot.w, d: spot.d, h: spot.h, tint: 0x4a3b52, tag: spot.tag });
  }

  // Neon signs on a dozen towers facing the street.
  const hopefuls = towers.filter((t) => !t.tag && t.h >= 10);
  for (let i = 0; i < 12 && hopefuls.length > 0; i += 1) {
    const t = hopefuls.splice(Math.floor(dice.unit() * hopefuls.length), 1)[0];
    const side = dice.choose(['n', 's', 'e', 'w']);
    const hue = dice.choose(PAINT.glow);
    signs.push({
      word: SIGN_WORDS[i % SIGN_WORDS.length],
      x: t.x + (side === 'e' ? t.w / 2 + 0.15 : side === 'w' ? -t.w / 2 - 0.15 : 0),
      z: t.z + (side === 's' ? t.d / 2 + 0.15 : side === 'n' ? -t.d / 2 - 0.15 : 0),
      y: dice.between(4, Math.min(9, t.h - 1)),
      side,
      hue,
      w: dice.between(5, 9),
    });
  }

  // Street lamps at every other intersection corner.
  for (let i = 0; i < STREETS.length; i += 1) {
    for (let j = 0; j < STREETS.length; j += 1) {
      if ((i + j) % 2 === 0) {
        posts.push({ x: STREETS[i] + STREET_W / 2 + 1.5, z: STREETS[j] + STREET_W / 2 + 1.5 });
      }
    }
  }

  // Sidewalk palms along the beach road.
  for (let x = -280; x <= 280; x += 40) {
    palms.push({ x: x + dice.between(-4, 4), z: 292, palm: true });
  }

  const walls = towers.map((t) => ({
    x0: t.x - t.w / 2, x1: t.x + t.w / 2, z0: t.z - t.d / 2, z1: t.z + t.d / 2,
  }));

  return {
    towers, greens, palms, yards, posts, signs, walls,
    spots: SPOTS,
    streets: STREETS,
  };
}

/** True when the circle at (x, z) with radius r hits a tower, the sea or the edge. */
export function isSolid(town, x, z, r) {
  const m = EDGE - 4;
  if (x < -m + r || x > m - r || z < -m + r || z > m - r) return true;
  if (z > TUNE.map.waterZ - r) return true; // the sea
  for (const w of town.walls) {
    if (x + r > w.x0 && x - r < w.x1 && z + r > w.z0 && z - r < w.z1) return true;
  }
  return false;
}

/** Push a circle out of towers/sea/edge; returns true when it had to move. */
export function pushOut(town, body) {
  let shifted = false;
  const r = body.r;
  for (const w of town.walls) {
    const cx = Math.max(w.x0, Math.min(body.x, w.x1));
    const cz = Math.max(w.z0, Math.min(body.z, w.z1));
    const dx = body.x - cx;
    const dz = body.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const shove = (r - d) / d;
        body.x += dx * shove;
        body.z += dz * shove;
      } else {
        // Dead centre of the box: shove out along the smallest overlap.
        const outs = [
          { d: body.x - w.x0 + r, x: -1, z: 0 },
          { d: w.x1 - body.x + r, x: 1, z: 0 },
          { d: body.z - w.z0 + r, x: 0, z: -1 },
          { d: w.z1 - body.z + r, x: 0, z: 1 },
        ];
        outs.sort((a, b) => a.d - b.d);
        body.x += outs[0].x * outs[0].d;
        body.z += outs[0].z * outs[0].d;
      }
      shifted = true;
    }
  }
  const m = EDGE - 4;
  if (body.x < -m + r) { body.x = -m + r; shifted = true; }
  if (body.x > m - r) { body.x = m - r; shifted = true; }
  if (body.z < -m + r) { body.z = -m + r; shifted = true; }
  if (body.z > TUNE.map.waterZ - r) { body.z = TUNE.map.waterZ - r; shifted = true; }
  if (body.z > m - r) { body.z = m - r; shifted = true; }
  return shifted;
}

/** True when (x, z) is on asphalt (a street), rather than pavement or block. */
export function onAsphalt(x, z) {
  for (const s of STREETS) {
    if (Math.abs(x - s) <= STREET_W / 2) return true;
    if (Math.abs(z - s) <= STREET_W / 2) return true;
  }
  return false;
}

/** A random point on a street, anywhere in the town. */
export function pickStreetSpot(dice) {
  if (dice.maybe(0.5)) {
    return { x: dice.choose(STREETS), z: dice.between(-280, 280), vertical: true };
  }
  return { x: dice.between(-280, 280), z: dice.choose(STREETS), vertical: false };
}

/** A random point on a curb (just off a street), for walkers. */
export function pickCurbSpot(dice) {
  const p = pickStreetSpot(dice);
  const off = STREET_W / 2 + 2.5;
  if (p.vertical) return { x: p.x + (dice.maybe(0.5) ? off : -off), z: p.z };
  return { x: p.x, z: p.z + (dice.maybe(0.5) ? off : -off) };
}
