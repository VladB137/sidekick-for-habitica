/*
 * Every pet and mount Habitica knows today must have a sprite sheet in the Stable's catalogue
 * (src/data/sprites.json + public/stable/), with a sheet whose size matches its cells, an anchor inside the
 * cell, and a hand-checked gait for its species (src/stable/gaits.ts). A miss would leave a creature the
 * player owns out of the Stable, so a stale catalogue fails here, not on a phone.
 * Real clock on purpose, like gear.test.ts: the question is what a player can own now.
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import spritesJson from '../src/data/sprites.json';
import shopJson from '../src/data/shop-icons.json';
import { SKILLS } from '../src/engine/core';
import { PET_GAITS, MOUNT_GAITS } from '../src/stable/gaits';
import { allSprites, spriteMeta, frameAt } from '../src/stable/sprites';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');
const DATA = spritesJson as unknown as { habitica: string, images: string, skipped: string[] };
const NO_IMAGE = new Set(['mount Aether-Invisible']); // Habitica's invisible mount: nothing to draw

const problems: string[] = [];
for (const [kind, info] of [['pet', H.content.petInfo], ['mount', H.content.mountInfo]] as const) {
  for (const key of Object.keys(info)) {
    if (NO_IMAGE.has(`${kind} ${key}`)) continue;
    if (!spriteMeta(kind, key)) problems.push(`${kind} ${key}: not in sprites.json`);
  }
}
for (const s of DATA.skipped) if (!NO_IMAGE.has(s)) problems.push(`${s}: Habitica has no image for it`);

const untagged = new Set<string>();
for (const m of allSprites()) {
  const file = `public/stable/${m.kind}/${m.key}.png`;
  if (!existsSync(file)) { problems.push(`${file}: missing`); continue; }
  const png = readFileSync(file);
  const w = png.readUInt32BE(16); const h = png.readUInt32BE(20);
  if (w !== m.w * m.frames || h !== m.h * m.layers) problems.push(`${file}: ${w}x${h}, catalogue says ${m.frames}x${m.w} by ${m.layers}x${m.h}`);
  if (m.ax < 0 || m.ax > m.w || m.ay !== m.h) problems.push(`${m.kind} ${m.key}: anchor ${m.ax},${m.ay} outside ${m.w}x${m.h}`);
  if (m.frames > 1 && m.frameMs.length !== m.frames) problems.push(`${m.kind} ${m.key}: ${m.frames} frames, ${m.frameMs.length} delays`);
  if (!(m.species in (m.kind === 'pet' ? PET_GAITS : MOUNT_GAITS))) untagged.add(`${m.kind} ${m.species}`);
  if ((m.motion === 'trot') !== (m.gait === 'four-legged')) problems.push(`${m.kind} ${m.key}: ${m.gait} ${m.motion === 'trot' ? 'must not trot' : 'must trot'}`);
}
for (const u of untagged) problems.push(`${u}: no gait tag in src/stable/gaits.ts (look at the sprite and tag it)`);
const files = readdirSync('public/stable/pet').length + readdirSync('public/stable/mount').length;
if (files !== allSprites().length) problems.push(`public/stable holds ${files} sheets, catalogue ${allSprites().length}`);
const cerberus = spriteMeta('pet', 'Wolf-Cerberus');
if (!cerberus || cerberus.frames < 2 || frameAt(cerberus, 0) !== 0 || frameAt(cerberus, cerberus.frameMs[0]) !== 1) problems.push('pet Wolf-Cerberus: animation frames wrong');

// item and skill icons (public/shop/, tools/gen-shop-icons.mjs): every class skill and every gear piece a player
// can own today, except the empty "_base_0" slots, which are never drawn
const SHOP = shopJson as { images: string, skills: number, gear: number, skipped: string[] };
for (const s of SKILLS) if (!existsSync(`public/shop/shop_${s.key}.png`)) problems.push(`skill ${s.key}: no icon in public/shop`);
for (const key of Object.keys(H.content.gear.flat)) {
  if (!key.endsWith('_base_0') && !existsSync(`public/shop/shop_${key}.png`)) problems.push(`gear ${key}: no icon in public/shop (npm run gen:shop -- ../habitica-images)`);
}
for (const k of SHOP.skipped) if (!k.endsWith('_base_0')) problems.push(`gear ${k}: Habitica has no shop image for it`);
const icons = readdirSync('public/shop').length;
if (icons !== SHOP.skills + SHOP.gear) problems.push(`public/shop holds ${icons} icons, shop-icons.json ${SHOP.skills + SHOP.gear}`);

const pets = allSprites('pet').length; const mounts = allSprites('mount').length;
const head = `sprites: ${pets} pets, ${mounts} mounts for Habitica ${H.version} (clock ${new Date().toISOString().slice(0, 10)}), catalogue from ${DATA.habitica}, images ${DATA.images.slice(0, 7)}`;
if (problems.length) {
  console.log(`FAIL  ${head}: ${problems.length} problems (npm run gen:sprites -- ../habitica-images refreshes the catalogue)`);
  for (const p of problems.slice(0, 40)) console.log(`  ${p}`);
  process.exit(1);
}
console.log(`PASS  ${head}: every creature has a sheet, an anchor and a gait; ${SHOP.skills} skill and ${SHOP.gear} gear icons`);
