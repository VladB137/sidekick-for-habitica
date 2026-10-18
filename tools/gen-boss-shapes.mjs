// Bundles the outline of every boss Habitica's quests have, for the Stable's sky: during a boss quest the
// boss's silhouette crosses the playground's sky (Stable spec §08). Only the shape is kept, as a 1-bit mask,
// so it draws offline, from the app itself, in each scene's own light.
//   src/data/boss-shapes.json   { images: commit, size, shapes: { questKey: [w, h, base64 bits] } }
// Each boss image (habitica-images/quests/bosses/quest_<key>.png) is cropped to its opaque pixels and scaled
// down so its longer side is `size` art pixels: a cell is in the shape when at least half of the image
// pixels it covers are opaque, and holes inside the outline are filled (a silhouette). Bits run row by row,
// most significant first. Quests are the bosses in src/data/items.json (run after npm run gen:data); a boss
// without an image is listed and left out.
// Usage: npm run gen:bosses -- ../habitica-images
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { decodePng } from './sprites/png.mjs';

const SIZE = 48;
const src = process.argv[2];
if (!src || !existsSync(`${src}/quests/bosses`)) {
  console.error('Usage: npm run gen:bosses -- /path/to/habitica-images (git clone https://github.com/HabitRPG/habitica-images)');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const items = JSON.parse(readFileSync(resolve(here, '../src/data/items.json'), 'utf8'));
const commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

const shapes = {}; const skipped = [];
for (const key of Object.keys(items.bossQuests).sort()) {
  const file = `${src}/quests/bosses/quest_${key}.png`;
  if (!existsSync(file)) { skipped.push(key); continue; }
  const { w, h, px } = decodePng(readFileSync(file));
  const on = (x, y) => px[(y * w + x) * 4 + 3] >= 128;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (on(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (x1 < 0) { skipped.push(key); continue; }
  const bw = x1 - x0 + 1, bh = y1 - y0 + 1, f = Math.max(1, Math.max(bw, bh) / SIZE);
  const tw = Math.max(1, Math.round(bw / f)), th = Math.max(1, Math.round(bh / f));
  const cell = new Uint8Array(tw * th);
  for (let ty = 0; ty < th; ty++) for (let tx = 0; tx < tw; tx++) {
    const sx0 = x0 + Math.floor(tx * bw / tw), sx1 = x0 + Math.max(Math.floor(tx * bw / tw) + 1, Math.floor((tx + 1) * bw / tw));
    const sy0 = y0 + Math.floor(ty * bh / th), sy1 = y0 + Math.max(Math.floor(ty * bh / th) + 1, Math.floor((ty + 1) * bh / th));
    let n = 0, all = 0;
    for (let y = sy0; y < sy1; y++) for (let x = sx0; x < sx1; x++) { all++; if (on(x, y)) n++; }
    if (n * 2 >= all) cell[ty * tw + tx] = 1;
  }
  // the sky reaches every empty cell joined to the edge; the rest is inside the outline
  const sky = new Uint8Array(tw * th), todo = [];
  for (let x = 0; x < tw; x++) todo.push(x, (th - 1) * tw + x);
  for (let y = 0; y < th; y++) todo.push(y * tw, y * tw + tw - 1);
  while (todo.length) {
    const i = todo.pop();
    if (sky[i] || cell[i]) continue;
    sky[i] = 1;
    const x = i % tw, y = (i - x) / tw;
    if (x > 0) todo.push(i - 1); if (x < tw - 1) todo.push(i + 1); if (y > 0) todo.push(i - tw); if (y < th - 1) todo.push(i + tw);
  }
  const bits = new Uint8Array(Math.ceil(tw * th / 8));
  for (let i = 0; i < tw * th; i++) if (!sky[i]) bits[i >> 3] |= 0x80 >> (i & 7);
  shapes[key] = [tw, th, Buffer.from(bits).toString('base64')];
}
writeFileSync(resolve(here, '../src/data/boss-shapes.json'), `${JSON.stringify({ images: commit, size: SIZE, shapes })}\n`);
console.log(`habitica-images ${commit.slice(0, 7)}: ${Object.keys(shapes).length} boss shapes; no image: ${skipped.join(', ') || 'none'}`);
