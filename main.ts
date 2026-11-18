// Solara Bay: Neon Tide — an original 3D open-world crime game built for
// make.fun's gta6-01 bounty ("Make GTA 6"), round 2. The game is plain
// static files under game/ (Three.js vendored under game/vendor/, a desktop
// browser plays it offline, no network request), and this program hands it
// in: it copies game/ and screenshots/ from beside this file into /output
// and writes /output/dossier.json with the vendored make.fun library
// (vendor/makefun-game.ts, the kit's copy, unchanged apart from comments).
//
// Run it outside the grader with MAKEFUN_OUTPUT_DIR standing in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it locally first with `node serve.ts`, then open http://localhost:8080.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });
}

// The sealed gate's own caps (kit reference/gate.json): text_max_bytes is the
// only one that shapes the dossier's bytes; the others refuse an entry the
// scorer would refuse anyway (more than 4 screenshots or one over 256 KiB;
// game/ over 993 files or 48 MiB in all; a path under game/ over 1000 bytes).
// game/ counts beside /output's own 1000-entry cap, its screenshots/ and
// dossier.json, so the game is kept well inside those limits.
writeFileSync(
  join(outDir, 'dossier.json'),
  buildDossier(outDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
