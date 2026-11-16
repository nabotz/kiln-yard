// Kiln Yard's hand-in (Node 22, standard library only). The game is game/: static ES modules the
// browser loads with three.js 0.187.0 through an import map, no build step. This program copies
// game/ and screenshots/ to /output and writes /output/dossier.json, the summary the judge reads,
// with the kit's make.fun library. Outside the grader MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// To play: node serve.ts, then open http://localhost:8080 in desktop Chrome.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The gate's own caps: the judge's text is cut at 160 KiB; at most 4 screenshots of 256 KiB each;
// game/ holds at most 993 entries and 48 MiB.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);
