// main.ts — the CINDERLINE entrypoint for make.fun's threejs-fps-02.
// Hands the game in: copies game/ and screenshots/ from this repository into
// the output directory and writes /output/dossier.json with buildDossier
// from the kit's vendor/makefun-threejs.ts. Outside the grader,
// MAKEFUN_OUTPUT_DIR stands in for /output. Standard library only.
//
// NOTE (round-1 fix): the grader mounts /output, so NEVER rmSync the output
// directory itself — removing a mount point fails EBUSY ("Device or resource
// busy") and the graded run exits non-zero. The starter does mkdirSync only;
// do the same here.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Round-5 fix: never copy dotfiles into /output. Rounds 2-4 were rejected
// because screenshots/.gitkeep (committed to the repo to keep the empty
// directory) was copied verbatim, and the grader rejects any output path
// that is not a plain relative name. cpSync's filter runs on every entry,
// so a dotfile anywhere under game/ or screenshots/ is skipped too.
const noDotfiles = (src: string) => !basename(src).startsWith('.');

mkdirSync(outDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true, filter: noDotfiles });
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), { recursive: true, filter: noDotfiles });
}

const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
