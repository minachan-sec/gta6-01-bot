// The city of Solara Bay: a seeded grid of roads, blocks and buildings,
// plus the collision queries every moving thing in the game uses.
import { CFG } from './config.js';

// Landmarks the missions and the spawn points refer to. All sit on roads
// (road centrelines are multiples of 80) so cars can always reach them.
export const LANDMARKS = {
  garage: { x: 0, z: 200, label: "Marisol's Garage" },
  plaza: { x: -160, z: -80, label: 'Vega Plaza' },
  docks: { x: 320, z: 40, label: 'The Docks' },
  safehouse: { x: -80, z: -280, label: 'Hills Safehouse' },
  dropPoint: { x: 160, z: 160, label: 'Drop Point' },
  cometSpot: { x: 240, z: 40, label: 'Comet' },
  rosaSpot: { x: 80, z: 80, label: 'Rosa' },
  playerStart: { x: 0, z: 120, heading: Math.PI },
};

const ROAD_COORDS = [-320, -240, -160, -80, 0, 80, 160, 240, 320];

export function generateCity(rng) {
  const buildings = [];
  const trees = [];
  const lamps = [];
  const half = CFG.world.roadHalf;
  const gap = CFG.world.roadGap;

  // One block between each pair of neighbouring roads.
  for (let ix = 0; ix < ROAD_COORDS.length - 1; ix += 1) {
    for (let iz = 0; iz < ROAD_COORDS.length - 1; iz += 1) {
      const x0 = ROAD_COORDS[ix] + half + 3;
      const x1 = ROAD_COORDS[ix + 1] - half - 3;
      const z0 = ROAD_COORDS[iz] + half + 3;
      const z1 = ROAD_COORDS[iz + 1] - half - 3;
      // The plaza block stays open: missions fight there.
      const isPlaza = ROAD_COORDS[ix] === -160 && ROAD_COORDS[iz] === -80;
      // The beach strip stays open too.
      const isBeach = ROAD_COORDS[iz] >= 240;
      if (isPlaza || isBeach) {
        // A few palm trees, no buildings.
        const n = rng.int(4, 8);
        for (let t = 0; t < n; t += 1) {
          trees.push({ x: rng.range(x0, x1), z: rng.range(z0, z1), s: rng.range(0.9, 1.4) });
        }
        continue;
      }
      const count = rng.int(1, 3);
      for (let b = 0; b < count; b += 1) {
        const w = rng.range(14, 26);
        const d = rng.range(14, 26);
        const x = rng.range(x0 + w / 2, x1 - w / 2);
        const z = rng.range(z0 + d / 2, z1 - d / 2);
        const h = rng.int(8, 34);
        const hue = rng.pick([0x9a7b5f, 0x7f8ea3, 0xa39a8b, 0x8b7f9e, 0x6f8f7b, 0xb08d6a]);
        buildings.push({ x, z, w, d, h, color: hue, floors: Math.max(2, Math.round(h / 4)) });
      }
      // Sidewalk trees around the block.
      const nt = rng.int(2, 5);
      for (let t = 0; t < nt; t += 1) {
        const edge = rng.int(0, 3);
        let x; let z;
        if (edge === 0) { x = rng.range(x0, x1); z = z0 - 1; } else if (edge === 1) { x = rng.range(x0, x1); z = z1 + 1; } else if (edge === 2) { x = x0 - 1; z = rng.range(z0, z1); } else { x = x1 + 1; z = rng.range(z0, z1); }
        trees.push({ x, z, s: rng.range(0.8, 1.3) });
      }
    }
  }
  // Street lamps at every intersection.
  for (const rx of ROAD_COORDS) {
    for (const rz of ROAD_COORDS) {
      lamps.push({ x: rx + half + 1.5, z: rz + half + 1.5 });
    }
  }
  return {
    roads: ROAD_COORDS,
    buildings,
    trees,
    lamps,
    landmarks: LANDMARKS,
    bounds: CFG.world.cityHalf,
  };
}

// Is a circle at (x, z) with radius r blocked by a building or the city edge?
export function isSolid(city, x, z, r) {
  const b = city.bounds;
  if (x < -b + r || x > b - r || z < -b + r || z > b - r) return true;
  for (const bd of city.buildings) {
    const cx = Math.max(bd.x - bd.w / 2, Math.min(x, bd.x + bd.w / 2));
    const cz = Math.max(bd.z - bd.d / 2, Math.min(z, bd.z + bd.d / 2));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < r * r) return true;
  }
  return false;
}

// Push a circle out of whatever it overlaps. Mutates obj.x / obj.z.
// Returns true when anything was pushed.
export function pushOut(city, obj) {
  const r = obj.r || 0.6;
  let pushed = false;
  const b = city.bounds;
  if (obj.x < -b + r) { obj.x = -b + r; pushed = true; }
  if (obj.x > b - r) { obj.x = b - r; pushed = true; }
  if (obj.z < -b + r) { obj.z = -b + r; pushed = true; }
  if (obj.z > b - r) { obj.z = b - r; pushed = true; }
  for (const bd of city.buildings) {
    const hx = bd.w / 2 + r;
    const hz = bd.d / 2 + r;
    const dx = obj.x - bd.x;
    const dz = obj.z - bd.z;
    if (Math.abs(dx) < hx && Math.abs(dz) < hz) {
      const px = hx - Math.abs(dx);
      const pz = hz - Math.abs(dz);
      if (px < pz) obj.x = bd.x + (dx >= 0 ? hx : -hx);
      else obj.z = bd.z + (dz >= 0 ? hz : -hz);
      pushed = true;
    }
  }
  return pushed;
}

// Nearest road centreline coordinate to v (for traffic that drives on roads).
export function nearestRoad(v) {
  let best = ROAD_COORDS[0];
  let bd = Infinity;
  for (const c of ROAD_COORDS) {
    const d = Math.abs(c - v);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}

export function roadCoords() {
  return ROAD_COORDS;
}
