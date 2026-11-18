// Solara Bay itself: a road grid, the blocks between the roads, the buildings
// and parks on them, the beach and marina at the edges, and every query the
// simulation needs (is this point blocked? on a road? where is the nearest
// road?). Generation is seeded, so one seed always builds the same city.
import { WORLD, ROADS_X, ROADS_Y, ROAD_W, PALETTE } from './config.js';

function blockRect(col, row) {
  const x0 = ROADS_X[col] + ROAD_W / 2 + 10;
  const x1 = ROADS_X[col + 1] - ROAD_W / 2 - 10;
  const y0 = ROADS_Y[row] + ROAD_W / 2 + 10;
  const y1 = ROADS_Y[row + 1] - ROAD_W / 2 - 10;
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

export function buildCity(rng) {
  const buildings = [];
  const parks = [];
  const trees = [];
  const lots = [];
  const cols = ROADS_X.length - 1;
  const rows = ROADS_Y.length - 1;

  // Hand-placed landmarks first, so missions always have somewhere to point.
  // Marisol's garage (mission hub), the paint shop, the docks, the hideout.
  const landmarks = {
    garage: { x: 700, y: 830, w: 120, h: 84, label: "Marisol's Garage" },
    paintShop: { x: 1180, y: 700, w: 110, h: 76, label: 'Solara Paint & Body' },
    bank: { x: 1000, y: 420, w: 130, h: 92, label: 'Bay Union Bank' },
    hideout: { x: 1780, y: 1300, w: 110, h: 80, label: 'Safehouse' },
  };

  for (const col of [0, 1, 2, 3, 4, 5, 6]) {
    for (const row of [0, 1, 2, 3, 4, 5]) {
      const b = blockRect(col, row);
      // The south row is beachfront: sand and palms, no buildings.
      if (row === 5) {
        const park = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, kind: 'beach' };
        parks.push(park);
        for (let i = 0; i < 5; i += 1) {
          trees.push({ x: rng.range(b.x0 + 14, b.x1 - 14), y: rng.range(b.y0 + 14, b.y1 - 14), palm: true });
        }
        continue;
      }
      // A few blocks are parks, a plaza, or the stadium.
      const roll = rng.next();
      if ((col === 3 && row === 2) || roll < 0.10) {
        const park = { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, kind: col === 3 && row === 2 ? 'plaza' : 'park' };
        parks.push(park);
        const n = park.kind === 'plaza' ? 4 : 12;
        for (let i = 0; i < n; i += 1) {
          trees.push({ x: rng.range(b.x0 + 16, b.x1 - 16), y: rng.range(b.y0 + 16, b.y1 - 16), palm: rng.chance(0.3) });
        }
        continue;
      }
      if (col === 5 && row === 1) {
        parks.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, kind: 'stadium' });
        continue;
      }
      if (roll < 0.18) {
        lots.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
        continue;
      }
      // Buildings: one big one, or two smaller ones side by side.
      const count = rng.chance(0.45) ? 2 : 1;
      for (let i = 0; i < count; i += 1) {
        const w = count === 1 ? rng.range(b.w * 0.55, b.w * 0.8) : rng.range(b.w * 0.32, b.w * 0.42);
        const h = rng.range(b.h * 0.5, b.h * 0.75);
        const x = count === 1 ? b.x0 + (b.w - w) / 2 : b.x0 + 8 + i * (b.w / 2) + (b.w / 2 - w) / 2;
        const y = b.y0 + (b.h - h) / 2 + rng.range(-8, 8);
        buildings.push({
          x, y, w, h,
          hgt: rng.range(10, 42),
          roof: rng.pick(PALETTE.roofColors),
          pool: rng.chance(0.12),
          label: null,
        });
      }
    }
  }

  // Landmark buildings replace whatever the grid put near them.
  for (const key of Object.keys(landmarks)) {
    const lm = landmarks[key];
    for (let i = buildings.length - 1; i >= 0; i -= 1) {
      const b = buildings[i];
      if (b.x < lm.x + lm.w && b.x + b.w > lm.x && b.y < lm.y + lm.h && b.y + b.h > lm.y) {
        buildings.splice(i, 1);
      }
    }
    buildings.push({ x: lm.x, y: lm.y, w: lm.w, h: lm.h, hgt: 22, roof: '#a89a6f', pool: false, label: lm.label });
  }

  // The pier juts into the water from the beach at x ~1500.
  const pier = { x0: 1470, y0: 1440, x1: 1530, y1: 1536 };

  return { buildings, parks, trees, lots, landmarks, pier, cols, rows };
}

/** True when the circle at (x, y) with radius r hits a building or the water. */
export function isBlocked(city, x, y, r) {
  if (x < 8 + r || x > WORLD.width - 8 - r || y < 8 + r || y > WORLD.height - 8 - r) return true;
  // Marina water on the west edge, sea on the south edge (except the pier).
  if (x < 64 - r) return true;
  if (y > 1496 - r && !(x >= city.pier.x0 - r && x <= city.pier.x1 + r)) return true;
  for (const b of city.buildings) {
    if (x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h) return true;
  }
  return false;
}

/** Push a circle out of buildings/water; returns true when it had to move. */
export function resolveCollision(city, body) {
  let moved = false;
  for (const b of city.buildings) {
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.h));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < body.r * body.r) {
      const d = Math.sqrt(d2) || 0.001;
      const push = (body.r - d) / d;
      body.x += dx * push;
      body.y += dy * push;
      moved = true;
    }
  }
  if (body.x < 64 + body.r) { body.x = 64 + body.r; moved = true; }
  if (body.y > 1496 - body.r && !(body.x >= city.pier.x0 && body.x <= city.pier.x1)) {
    body.y = 1496 - body.r;
    moved = true;
  }
  return moved;
}

/** True when (x, y) is on asphalt (a road), rather than sidewalk or block. */
export function onRoad(x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) <= ROAD_W / 2) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) <= ROAD_W / 2) return true;
  return false;
}

/** Nearest point on a road centreline, for spawning traffic and pedestrians. */
export function nearestRoadPoint(rng, x, y) {
  let best = null;
  let bestD = Infinity;
  for (const rx of ROADS_X) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; best = { x: rx, y, vertical: true }; }
  }
  for (const ry of ROADS_Y) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; best = { x, y: ry, vertical: false }; }
  }
  return best;
}

/** A random point on a road, anywhere in the city. */
export function randomRoadPoint(rng) {
  if (rng.chance(0.5)) {
    return { x: rng.pick(ROADS_X), y: rng.range(80, WORLD.height - 80), vertical: true };
  }
  return { x: rng.range(80, WORLD.width - 80), y: rng.pick(ROADS_Y), vertical: false };
}

/** A random point on a sidewalk (just off a road), for pedestrians. */
export function randomSidewalkPoint(rng) {
  const p = randomRoadPoint(rng);
  const off = ROAD_W / 2 + 12;
  if (p.vertical) return { x: p.x + (rng.chance(0.5) ? off : -off), y: p.y };
  return { x: p.x, y: p.y + (rng.chance(0.5) ? off : -off) };
}
