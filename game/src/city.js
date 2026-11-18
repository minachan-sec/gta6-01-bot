// Solara Bay itself: a road grid, the blocks between the roads, the buildings
// and parks on them, the beach and sea at the south edge, and every query the
// simulation needs (is this point blocked? on a road? where is the nearest
// road?). Generation is seeded, so one seed always builds the same city.
// Coordinates are metres on the x/z plane; y is up. z+ is south (the beach).
import { CFG, PALETTE } from './config.js';

export const ROADS = [-280, -200, -120, -40, 40, 120, 200, 280];
export const ROAD_W = CFG.world.roadWidth;
export const HALF = CFG.world.size / 2;

const NEON_TEXTS = ['HOTEL', 'BAR', '24H', 'CLUB', 'NEON', 'PIZZA', 'MOTEL', 'DISCO', 'TACOS', 'CINEMA', 'GYM', 'LIQUOR'];

// Hand-placed landmarks, so missions always have somewhere to point.
// Each is a building footprint (x/z are its centre) on a block edge.
const LANDMARKS = {
  garage: { x: -80, z: 80, w: 30, d: 21, h: 9, label: "Marisol's Garage" },
  paintShop: { x: 160, z: -80, w: 28, d: 19, h: 8, label: 'Solara Paint & Body' },
  bank: { x: 80, z: -200, w: 33, d: 23, h: 16, label: 'Bay Union Bank' },
  safehouse: { x: 260, z: -260, w: 26, d: 20, h: 10, label: 'Safehouse' },
  marina: { x: -280, z: 120, w: 0, d: 0, h: 0, label: 'Marina Docks' },
  plaza: { x: 80, z: 0, w: 0, d: 0, h: 0, label: 'Bayfront Plaza' },
  beachBar: { x: 200, z: 260, w: 22, d: 16, h: 8, label: 'Neon Tide Bar' },
};

function blockRect(col, row) {
  const x0 = ROADS[col] + ROAD_W / 2 + 3;
  const x1 = ROADS[col + 1] - ROAD_W / 2 - 3;
  const z0 = ROADS[row] + ROAD_W / 2 + 3;
  const z1 = ROADS[row + 1] - ROAD_W / 2 - 3;
  return { x0, z0, x1, z1, w: x1 - x0, d: z1 - z0 };
}

export function buildCity(rng) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const lamps = [];
  const neons = [];
  const lots = [];

  for (let col = 0; col < ROADS.length - 1; col += 1) {
    for (let row = 0; row < ROADS.length - 1; row += 1) {
      const b = blockRect(col, row);
      const cx = (b.x0 + b.x1) / 2;
      const cz = (b.z0 + b.z1) / 2;
      // South row is beachfront: sand and palms, no buildings.
      if (row === ROADS.length - 2) {
        parks.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'beach' });
        for (let i = 0; i < 5; i += 1) {
          trees.push({ x: rng.range(b.x0 + 4, b.x1 - 4), z: rng.range(b.z0 + 4, b.z1 - 4), palm: true });
        }
        continue;
      }
      // Central block is the plaza; one block is the stadium.
      if (col === 4 && row === 3) {
        parks.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'plaza' });
        for (let i = 0; i < 4; i += 1) {
          trees.push({ x: rng.range(b.x0 + 5, b.x1 - 5), z: rng.range(b.z0 + 5, b.z1 - 5), palm: false });
        }
        continue;
      }
      if (col === 5 && row === 1) {
        parks.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'stadium' });
        continue;
      }
      const roll = rng.next();
      if (roll < 0.1) {
        parks.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, kind: 'park' });
        for (let i = 0; i < 10; i += 1) {
          trees.push({ x: rng.range(b.x0 + 4, b.x1 - 4), z: rng.range(b.z0 + 4, b.z1 - 4), palm: rng.chance(0.3) });
        }
        continue;
      }
      if (roll < 0.18) {
        lots.push({ x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1 });
        continue;
      }
      // Buildings: one big one, or two smaller ones side by side. Taller near
      // the downtown core (80, -80).
      const distDowntown = Math.hypot(cx - 80, cz + 80);
      const tall = distDowntown < 170 ? rng.range(18, 55) : rng.range(8, 22);
      const count = rng.chance(0.45) ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const w = count === 1 ? rng.range(b.w * 0.55, b.w * 0.8) : rng.range(b.w * 0.32, b.w * 0.42);
        const d = rng.range(b.d * 0.5, b.d * 0.75);
        const x = count === 1 ? cx : b.x0 + 4 + i * (b.w / 2) + (b.w / 2 - w) / 2 + w / 2;
        const z = cz + rng.range(-4, 4);
        buildings.push({
          x, z, w, d,
          h: count === 1 ? tall : rng.range(8, 20),
          color: rng.pick(PALETTE.building),
          label: null,
        });
      }
    }
  }

  // Landmark buildings replace whatever the grid put near them.
  for (const key of Object.keys(LANDMARKS)) {
    const lm = LANDMARKS[key];
    if (lm.w === 0) continue;
    for (let i = buildings.length - 1; i >= 0; i -= 1) {
      const b = buildings[i];
      if (Math.abs(b.x - lm.x) < (b.w + lm.w) / 2 + 2 && Math.abs(b.z - lm.z) < (b.d + lm.d) / 2 + 2) {
        buildings.splice(i, 1);
      }
    }
    buildings.push({ x: lm.x, z: lm.z, w: lm.w, d: lm.d, h: lm.h, color: 0x4a3b52, label: lm.label });
  }

  // Neon signs on a dozen buildings facing the street.
  const cands = buildings.filter((b) => !b.label && b.h >= 10);
  for (let i = 0; i < 12 && cands.length > 0; i += 1) {
    const b = cands.splice(Math.floor(rng.f() * cands.length), 1)[0];
    const face = rng.pick(['n', 's', 'e', 'w']);
    const color = rng.pick(PALETTE.neon);
    neons.push({
      text: NEON_TEXTS[i % NEON_TEXTS.length],
      x: b.x + (face === 'e' ? b.w / 2 + 0.15 : face === 'w' ? -b.w / 2 - 0.15 : 0),
      z: b.z + (face === 's' ? b.d / 2 + 0.15 : face === 'n' ? -b.d / 2 - 0.15 : 0),
      y: rng.range(4, Math.min(9, b.h - 1)),
      face,
      color,
      w: rng.range(5, 9),
    });
  }

  // Street lamps at every other intersection corner.
  for (let i = 0; i < ROADS.length; i += 1) {
    for (let j = 0; j < ROADS.length; j += 1) {
      if ((i + j) % 2 === 0) {
        lamps.push({ x: ROADS[i] + ROAD_W / 2 + 1.5, z: ROADS[j] + ROAD_W / 2 + 1.5 });
      }
    }
  }

  // Sidewalk palms along the beach road.
  for (let x = -280; x <= 280; x += 40) {
    trees.push({ x: x + rng.range(-4, 4), z: 292, palm: true });
  }

  const colliders = buildings.map((b) => ({
    x0: b.x - b.w / 2, x1: b.x + b.w / 2, z0: b.z - b.d / 2, z1: b.z + b.d / 2,
  }));

  return {
    buildings, parks, trees, lots, lamps, neons, colliders,
    landmarks: LANDMARKS,
    roads: ROADS,
  };
}

/** True when the circle at (x, z) with radius r hits a building, the sea or the edge. */
export function isBlocked(city, x, z, r) {
  const m = HALF - 4;
  if (x < -m + r || x > m - r || z < -m + r || z > m - r) return true;
  if (z > CFG.world.seaZ - r) return true; // the sea
  for (const c of city.colliders) {
    if (x + r > c.x0 && x - r < c.x1 && z + r > c.z0 && z - r < c.z1) return true;
  }
  return false;
}

/** Push a circle out of buildings/sea/edge; returns true when it had to move. */
export function resolveCollision(city, body) {
  let moved = false;
  const r = body.r;
  for (const c of city.colliders) {
    const cx = Math.max(c.x0, Math.min(body.x, c.x1));
    const cz = Math.max(c.z0, Math.min(body.z, c.z1));
    const dx = body.x - cx;
    const dz = body.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (r - d) / d;
        body.x += dx * push;
        body.z += dz * push;
      } else {
        // Dead centre of the box: shove out along the smallest overlap.
        const pushes = [
          { d: body.x - c.x0 + r, x: -1, z: 0 },
          { d: c.x1 - body.x + r, x: 1, z: 0 },
          { d: body.z - c.z0 + r, x: 0, z: -1 },
          { d: c.z1 - body.z + r, x: 0, z: 1 },
        ];
        pushes.sort((a, b) => a.d - b.d);
        body.x += pushes[0].x * pushes[0].d;
        body.z += pushes[0].z * pushes[0].d;
      }
      moved = true;
    }
  }
  const m = HALF - 4;
  if (body.x < -m + r) { body.x = -m + r; moved = true; }
  if (body.x > m - r) { body.x = m - r; moved = true; }
  if (body.z < -m + r) { body.z = -m + r; moved = true; }
  if (body.z > CFG.world.seaZ - r) { body.z = CFG.world.seaZ - r; moved = true; }
  if (body.z > m - r) { body.z = m - r; moved = true; }
  return moved;
}

/** True when (x, z) is on asphalt (a road), rather than sidewalk or block. */
export function onRoad(x, z) {
  for (const r of ROADS) {
    if (Math.abs(x - r) <= ROAD_W / 2) return true;
    if (Math.abs(z - r) <= ROAD_W / 2) return true;
  }
  return false;
}

/** A random point on a road, anywhere in the city. */
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(ROADS), z: rng.range(-280, 280), vertical: true };
  }
  return { x: rng.range(-280, 280), z: rng.pick(ROADS), vertical: false };
}

/** A random point on a sidewalk (just off a road), for pedestrians. */
export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const off = ROAD_W / 2 + 2.5;
  if (p.vertical) return { x: p.x + (rng.chance(0.5) ? off : -off), z: p.z };
  return { x: p.x, z: p.z + (rng.chance(0.5) ? off : -off) };
}
