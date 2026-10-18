// Bundles the picture of every collection quest's find, for the Stable: during a collection quest the party's
// finds lie in the playground's grass (src/app/stable/finds.ts). Habitica's own pictures, the ones its quest
// sidebar shows (habitica-images/quests/items/quest_<quest>_<item>.png), drawn on its 3x pixel grid like the
// pets. Each is cropped to its paint (on the 3-pixel grid) and packed into one sheet:
//   public/stable/finds.png         the sheet
//   src/data/quest-finds.json       { images: commit, finds: { '<quest>_<item>': [x, y, w, h] } }
// Quests are the collection quests in src/data/items.json (run after npm run gen:data); a find without a
// picture is listed and left out.
// Usage: npm run gen:finds -- ../habitica-images
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng } from './sprites/png.mjs';

/** sheet width, pixels, and the gap between pictures */
const SHEET_W = 512, GAP = 3;
const src = process.argv[2];
if (!src || !existsSync(`${src}/quests/items`)) {
  console.error('Usage: npm run gen:finds -- /path/to/habitica-images (git clone https://github.com/HabitRPG/habitica-images)');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(resolve(here, '../src/data/items.json'), 'utf8'));
const commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const pics = []; const skipped = [];
for (const quest of Object.keys(items.collectQuests).sort()) {
  for (const item of Object.keys(items.collectQuests[quest][1]).sort()) {
    const key = `${quest}_${item}`, file = `${src}/quests/items/quest_${key}.png`;
    if (!existsSync(file)) { skipped.push(key); continue; }
    const { w, h, px } = decodePng(readFileSync(file));
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0) { skipped.push(key); continue; }
    x0 -= x0 % 3; y0 -= y0 % 3;
    pics.push({ key, w: x1 - x0 + 1, h: y1 - y0 + 1, x0, y0, sw: w, px });
  }
}

// shelves, tallest first
const order = [...pics].sort((a, b) => b.h - a.h || a.key.localeCompare(b.key));
let x = 0, y = 0, shelf = 0;
for (const p of order) {
  if (x + p.w > SHEET_W) { x = 0; y += shelf + GAP; shelf = 0; }
  p.x = x; p.y = y; x += p.w + GAP; shelf = Math.max(shelf, p.h);
}
const H = y + shelf, out = new Uint8Array(SHEET_W * H * 4);
for (const p of pics) {
  for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
    const s = ((p.y0 + r) * p.sw + p.x0 + c) * 4, d = ((p.y + r) * SHEET_W + p.x + c) * 4;
    for (let k = 0; k < 4; k++) out[d + k] = p.px[s + k];
  }
}
writeFileSync(resolve(here, '../public/stable/finds.png'), encodePng({ w: SHEET_W, h: H, px: out }));
const finds = Object.fromEntries(pics.map(p => [p.key, [p.x, p.y, p.w, p.h]]));
writeFileSync(resolve(here, '../src/data/quest-finds.json'), `${JSON.stringify({ images: commit, finds })}\n`);
console.log(`habitica-images ${commit.slice(0, 7)}: ${pics.length} finds on a ${SHEET_W} x ${H} sheet; no picture: ${skipped.join(', ') || 'none'}`);
