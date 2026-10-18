// Builds the Stable's sprite catalogue from Habitica's own images (github.com/HabitRPG/habitica-images):
//   public/stable/pet/<Key>.png     one sheet per pet: columns = animation frames
//   public/stable/mount/<Key>.png   one sheet per mount: row 0 body, row 1 head, columns = frames
//   src/data/sprites.json           key -> [w, h, ax, ay, frames, frameMs?] per cell, plus the image commit;
//                                   mountAt: mount key -> [x, y], where its cell's top-left was in Habitica's own image
//                                   (the rider's avatar is placed from that image's corner, as Habitica draws it)
// Every pet and mount Habitica's content defines (via the harness, clock years ahead like gen:data) gets a
// sheet. Sheets are cropped to the opaque pixels of all frames and layers and re-encoded losslessly
// (palette PNG where it fits, no metadata), at Habitica's own pixel size: the art is on a 3 px grid, but
// not every sprite strictly is, so nothing is downscaled. Anchor (ax, ay) = where the creature meets the
// ground: x = middle of the opaque span in its lowest quarter, y = bottom edge. Gaits are hand-tagged in
// src/stable/gaits.ts, not here.
// Usage: npm run gen:sprites -- ../habitica-images   (after npm run harness)
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng, decodeGif } from './sprites/png.mjs';

const src = process.argv[2];
if (!src || !existsSync(`${src}/stable/pets`)) {
  console.error('Usage: npm run gen:sprites -- /path/to/habitica-images (git clone https://github.com/HabitRPG/habitica-images)');
  process.exit(1);
}
const RealDate = Date;
const AHEAD = RealDate.now() + 5 * 365 * 86400e3;
globalThis.Date = class extends RealDate {
  constructor (...a) { if (a.length === 0) super(AHEAD); else super(...a); }
  static now () { return AHEAD; }
};
const require = createRequire(import.meta.url);
const H = require('./harness/load.cjs');
const petKeys = Object.keys(H.content.petInfo).sort();
const mountKeys = Object.keys(H.content.mountInfo).sort();
globalThis.Date = RealDate;

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public/stable');
rmSync(pub, { recursive: true, force: true });
mkdirSync(`${pub}/pet`, { recursive: true }); mkdirSync(`${pub}/mount`, { recursive: true });
const commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

/** One layer's frames (RGBA canvases of the same size) from a PNG or, for Habitica's animated creatures, a GIF. */
function layer (png, gif) {
  if (existsSync(png)) { const { w, h, px } = decodePng(readFileSync(png)); return { w, h, frames: [{ px, ms: 0 }] }; }
  if (existsSync(gif)) return decodeGif(readFileSync(gif));
  return null;
}

const MS_STEP = 10; // GIF delays are in 1/100 s
function sheet (layers) {
  // Habitica draws a mount's body and head from the same top-left corner; a few pairs differ in size
  const W = Math.max(...layers.map(l => l.w)); const H2 = Math.max(...layers.map(l => l.h));
  layers = layers.map(l => (l.w === W && l.h === H2 ? l : { w: W, h: H2, frames: l.frames.map(f => {
    const px = new Uint8Array(W * H2 * 4);
    for (let y = 0; y < l.h; y++) px.set(f.px.subarray(y * l.w * 4, (y + 1) * l.w * 4), y * W * 4);
    return { px, ms: f.ms };
  }) }));
  const nf = Math.max(...layers.map(l => l.frames.length));
  const frame = (l, f) => l.frames[Math.min(f, l.frames.length - 1)].px;
  // union of opaque pixels over every layer and frame
  let x0 = W; let y0 = H2; let x1 = -1; let y1 = -1;
  for (const l of layers) for (const fr of l.frames) for (let y = 0; y < H2; y++) for (let x = 0; x < W; x++) {
    if (fr.px[(y * W + x) * 4 + 3]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1; const h = y1 - y0 + 1;
  const out = new Uint8Array(w * nf * h * layers.length * 4);
  layers.forEach((l, r) => { for (let f = 0; f < nf; f++) { const px = frame(l, f); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((y + y0) * W + x + x0) * 4; const d = (((r * h + y) * w * nf) + f * w + x) * 4;
    out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3];
  } } });
  // anchor from the first frame, all layers: middle of the opaque columns in the lowest quarter (legs drawn
  // in perspective end on different rows, so the lowest few rows alone would favour the front feet)
  let lo = w; let hi = -1;
  for (let y = h - Math.max(6, Math.round(h / 4)); y < h; y++) for (let x = 0; x < w; x++) {
    if (layers.some(l => frame(l, 0)[((y + y0) * W + x + x0) * 4 + 3])) { if (x < lo) lo = x; if (x > hi) hi = x; }
  }
  const ms = layers.find(l => l.frames.length === nf).frames.map(f => Math.round(f.ms / MS_STEP) * MS_STEP);
  const meta = [w, h, Math.round((lo + hi + 1) / 2), h, nf];
  if (nf > 1) meta.push(ms);
  return { png: encodePng({ w: w * nf, h: h * layers.length, px: out }), meta, at: [x0, y0] };
}

const S = `${src}/stable`; const A = `${src}/animated`;
const pets = {}; const mounts = {}; const mountAt = {}; const skipped = []; let bytes = 0;
for (const key of petKeys) {
  const l = layer(`${S}/pets/Pet-${key}.png`, `${A}/Pet-${key}.gif`);
  const s = l && sheet([l]);
  if (!s) { skipped.push(`pet ${key}`); continue; }
  writeFileSync(`${pub}/pet/${key}.png`, s.png); pets[key] = s.meta; bytes += s.png.length;
}
for (const key of mountKeys) {
  const body = layer(`${S}/mounts/body/Mount_Body_${key}.png`, `${A}/Mount_Body_${key}.gif`);
  const head = layer(`${S}/mounts/head/Mount_Head_${key}.png`, `${A}/Mount_Head_${key}.gif`);
  const s = body && head && sheet([body, head]);
  if (!s) { skipped.push(`mount ${key}`); continue; } // Aether-Invisible has no image by design
  writeFileSync(`${pub}/mount/${key}.png`, s.png); mounts[key] = s.meta; mountAt[key] = s.at; bytes += s.png.length;
}

writeFileSync(resolve(here, '../src/data/sprites.json'), JSON.stringify({
  habitica: H.version,
  images: commit,
  generated: new RealDate().toISOString().slice(0, 10),
  pets, mounts, mountAt, skipped,
}));
console.log(`Habitica ${H.version}, habitica-images ${commit.slice(0, 7)}: ${Object.keys(pets).length} pets, ${Object.keys(mounts).length} mounts, ${(bytes / 1e6).toFixed(2)} MB; no image: ${skipped.join(', ') || 'none'}`);
