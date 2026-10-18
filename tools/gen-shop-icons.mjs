// Bundles the item and skill icons the app draws (the 68 × 68 "shop_" images Habitica's shops use) from
// Habitica's own images (github.com/HabitRPG/habitica-images), so they load offline and from the app itself:
//   public/shop/shop_<skill>.png   every class skill (habitica-images/skills/)
//   public/shop/shop_<gear>.png    every gear key in src/data/gear.json (found anywhere under habitica-images/gear/)
//   src/data/shop-icons.json       the image commit and the gear keys Habitica has no shop image for
// Images are re-encoded losslessly (palette PNG where it fits, no metadata), pixels and size unchanged; an
// animated GIF icon keeps its first frame. Run after npm run gen:data (the gear keys come from src/data).
// Usage: npm run gen:shop -- ../habitica-images
import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { decodePng, encodePng, decodeGif } from './sprites/png.mjs';

const src = process.argv[2];
if (!src || !existsSync(`${src}/skills`) || !existsSync(`${src}/gear`)) {
  console.error('Usage: npm run gen:shop -- /path/to/habitica-images (git clone https://github.com/HabitRPG/habitica-images)');
  process.exit(1);
}
const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '../public/shop');
rmSync(pub, { recursive: true, force: true });
mkdirSync(pub, { recursive: true });
const commit = execFileSync('git', ['-C', src, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();

/** file name -> path, for every shop_ image under a folder (gear icons are spread over event and set folders) */
function index (dir, out = new Map()) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) index(p, out);
    else if (e.name.startsWith('shop_') && !out.has(e.name)) out.set(e.name, p);
  }
  return out;
}

function write (name, file) {
  const img = file.endsWith('.gif') ? (() => { const g = decodeGif(readFileSync(file)); return { w: g.w, h: g.h, px: g.frames[0].px }; })() : decodePng(readFileSync(file));
  const png = encodePng(img);
  writeFileSync(`${pub}/${name}.png`, png);
  return png.length;
}

let bytes = 0; let skills = 0; let gear = 0; const skipped = [];
for (const f of readdirSync(`${src}/skills`).sort()) {
  if (!f.startsWith('shop_') || !f.endsWith('.png')) continue;
  bytes += write(f.slice(0, -4), `${src}/skills/${f}`); skills += 1;
}
const files = index(`${src}/gear`);
const keys = Object.keys(JSON.parse(readFileSync(resolve(here, '../src/data/gear.json'), 'utf8'))).sort();
for (const key of keys) {
  const file = files.get(`shop_${key}.png`) ?? files.get(`shop_${key}.gif`);
  if (!file) { skipped.push(key); continue; }
  bytes += write(`shop_${key}`, file); gear += 1;
}
writeFileSync(resolve(here, '../src/data/shop-icons.json'), `${JSON.stringify({ images: commit, skills, gear, skipped })}\n`);
console.log(`habitica-images ${commit.slice(0, 7)}: ${skills} skill and ${gear} gear icons, ${(bytes / 1e6).toFixed(2)} MB; no shop image: ${skipped.join(', ') || 'none'}`);
