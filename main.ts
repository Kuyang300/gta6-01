// Sunhaven Heat — the gta6-01 entry program (Node 22, standard library only).
// The game is plain static files under game/ (game/index.html and its ES
// modules, three.js vendored as a minified build under game/vendor/), and this
// program hands it in: it copies game/ and screenshots/ from beside this file
// into /output and writes /output/dossier.json with the vendored make.fun
// library, so the judge can read the game from the dossier alone.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// Every path is resolved from this file's own directory, never from the
// process working directory: the grader runs it from wherever it likes.
const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps: the dossier text is capped at 160 KiB, at most four
// screenshots of 256 KiB each, and game/ stays under 993 files and 48 MiB
// with no path over 1000 bytes — an entry past any of those is refused, so
// this program refuses first rather than handing in a broken entry.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
