/*
 * The avatar is drawn from Habitica's own images, layered as Habitica's client does (avatar.vue). Checks the layer
 * order and origins against that component's rules, and that every image name the app can ask for is one Habitica
 * has: its sprite stylesheet at the rules.ts tag (../habitica, cloned by the harness step) lists each image as a class.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { avatarLayers, AVATAR_SPECIAL } from '../src/app/avatar';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');
let failed = 0; let n = 0;
const check = (name: string, ok: boolean, info = '') => { n += 1; if (!ok) { failed += 1; console.log(`FAIL ${name} ${info}`); } };

// Habitica's defaults (schema.js), warrior gear, no mount or pet
const base = { preferences: {}, stats: { class: 'warrior', buffs: {} }, items: { gear: { equipped: { weapon: 'weapon_warrior_3', armor: 'armor_warrior_3', head: 'head_warrior_3', shield: 'shield_warrior_3', back: 'back_base_0', body: 'body_base_0', headAccessory: 'headAccessory_base_0', eyewear: 'eyewear_base_0' } } } };
const names = (u: unknown, o = {}) => avatarLayers(u, o).map(l => l.name);
check('default avatar: layers in avatar.vue order', JSON.stringify(names(base)) === JSON.stringify(['hair_flower_1', 'skin_915533', 'slim_shirt_blue', 'head_0', 'slim_armor_warrior_3', 'hair_bangs_1_red', 'hair_base_3_red', 'head_warrior_3', 'hair_flower_1', 'shield_warrior_3', 'weapon_warrior_3']), names(base).join(' '));
check('no mount: avatar layers start at (24, 24)', avatarLayers(base).every(l => l.x === 24 && l.y === 24));
const riding = { ...base, preferences: { background: 'blue', size: 'broad', costume: true }, items: { ...base.items, currentMount: 'Kangaroo-Base', currentPet: 'Wolf-Base', gear: { ...base.items.gear, costume: { armor: 'armor_special_1' } } } };
const rl = avatarLayers(riding);
check('riding: background first, mount body next, mount head over the avatar, pet last', rl[0].name === 'background_blue' && rl[1].name === 'Mount_Body_Kangaroo-Base' && rl[rl.length - 2].name === 'Mount_Head_Kangaroo-Base' && rl[rl.length - 1].name === 'Pet-Wolf-Base', rl.map(l => l.name).join(' '));
check('riding: mount at (24, 18); avatar from y 0, Kangaroo moves it 24 px down', rl[1].x === 24 && rl[1].y === 18 && rl.filter(l => l.part === 'avatar').every(l => l.y === 24));
check('costume on: costume gear, broad size', rl.some(l => l.name === 'broad_armor_special_1') && !rl.some(l => l.name.includes('warrior_3')));
check('pet sits bottom-left', rl[rl.length - 1].x === 0 && rl[rl.length - 1].y === 0 && !!rl[rl.length - 1].bottom);
check('avatarOnly: no mount, pet or background', !names(riding, { avatarOnly: true, background: false }).some(x => /Mount|Pet|background/.test(x)));
const snow = { ...base, stats: { class: 'rogue', buffs: { snowball: true } } };
check('snowball: the snowman replaces the avatar', JSON.stringify(names(snow)) === JSON.stringify(['avatar_snowball_rogue', 'hair_flower_1']), names(snow).join(' '));
const sleep = { ...base, preferences: { sleep: true } };
check('resting in the Inn: sleeping skin and zzz', names(sleep).includes('skin_915533_sleep') && names(sleep).includes('zzz'));

// every image the app asks for exists in Habitica's sprite sheets at the tag, from the file and offset they give
const dir = '../habitica/website/client/src/assets/css';
if (!existsSync(`${dir}/sprites.css`)) console.log(`skip: ${dir} missing (run the harness step)`);
else {
  const main = new Set([...readFileSync(`${dir}/sprites/spritesmith-main.css`, 'utf8').matchAll(/^\.([A-Za-z0-9_-]+) \{[^}]*mobileApp\/images\/([^')"]+)/gm)].filter(m => m[2] === `${m[1]}.png`).map(m => m[1]));
  // sprites.css: selectors (comma lists) -> url and margins, later rules adding to earlier ones as in the browser
  const special: Record<string, { file?: string, ml: number, mt: number }> = {};
  for (const [, sel, body] of readFileSync(`${dir}/sprites.css`, 'utf8').replace(/\/\*[^]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    for (const raw of sel.split(',')) {
      const name = raw.trim().replace(/^\./, '');
      if (!/^[A-Za-z0-9_-]+$/.test(name)) continue;
      const e = special[name] || (special[name] = { ml: 0, mt: 0 });
      const url = body.match(/mobileApp\/images\/([^")]+)/); if (url) e.file = url[1];
      const ml = body.match(/margin-left:\s*(-?\d+)px/); if (ml) e.ml = Number(ml[1]);
      const mt = body.match(/margin-top:\s*(-?\d+)px/); if (mt) e.mt = Number(mt[1]);
    }
  }
  const avatarish = /^(weapon|head|shield|back|body|eyewear|headAccessory|slim|broad|Pet-|Mount_|background)_?/;
  const fromCss = Object.entries(special).filter(([k, e]) => avatarish.test(k) && (e.file || e.ml || e.mt));
  const bad = fromCss.filter(([k, e]) => { const t = AVATAR_SPECIAL[k]; return !t || t[0] !== (e.file || `${k}.png`) || (t[1] ?? 0) !== e.ml || (t[2] ?? 0) !== e.mt; });
  const extra = Object.keys(AVATAR_SPECIAL).filter(k => !special[k]);
  check('special images match sprites.css (file and margins)', bad.length === 0 && extra.length === 0, `${bad.map(([k, e]) => `${k}=${JSON.stringify(e)}`).join(' ')} ${extra.join(' ')}`);
  const want = new Set<string>();
  for (const u of [base, riding, snow, sleep]) for (const l of avatarLayers(u)) want.add(l.name);
  const slots = ['armor', 'head', 'shield', 'weapon', 'back', 'body', 'eyewear', 'headAccessory'];
  for (const [key, g] of Object.entries(H.content.gear.flat as Record<string, { type: string }>)) {
    if (!slots.includes(g.type) || key.endsWith('_base_0')) continue;
    for (const size of ['slim', 'broad']) {
      const u = { ...base, preferences: { size }, items: { gear: { equipped: { [g.type]: key } } } };
      for (const l of avatarLayers(u)) want.add(l.name);
    }
  }
  for (const k of Object.keys(H.content.mountInfo || {})) for (const l of avatarLayers({ ...base, items: { ...base.items, currentMount: k } })) want.add(l.name);
  for (const k of Object.keys(H.content.petInfo || {})) want.add(`Pet-${k}`);
  for (const k of Object.keys(H.content.backgroundsFlat || {})) want.add(`background_${k}`);
  const miss = [...want].filter(x => !main.has(x) && !AVATAR_SPECIAL[x]);
  console.log(`avatar images: ${want.size} names, ${miss.length} not in Habitica's sprite sheets${miss.length ? `: ${miss.slice(0, 12).join(' ')}` : ''}`);
  check('every avatar image name is one Habitica has', miss.length === 0);
}
console.log(`avatar: ${n - failed}/${n} passed`);
if (failed) process.exit(1);
