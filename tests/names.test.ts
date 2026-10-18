/*
 * Creatures' names (src/app/stable/names.ts, naming.ts), the pixel font that writes them in the scene
 * (src/playground/font.ts) and the name tag's place (src/app/stable/nametag.ts); and Habitica's own names for
 * every pet and mount (petName), checked against its code at the rules.ts tag.
 */
import { createRequire } from 'node:module';
import bank from '../src/data/pet-names.json';
import { ITEMS, petName } from '../src/app/model';
import { MAX_NAME, called, calledFull, cleanName, daysSince, loadNames, nameOf, normalizeNames, rename, saveNames, type Names } from '../src/app/stable/names';
import { assign, candidates, residentIds } from '../src/app/stable/naming';
import { creatureName, freshState, choose } from '../src/app/stable/picks';
import { FONT_ROWS, drawText, textRows, textWidth, unwritable } from '../src/playground/font';
import { NameTagLayer } from '../src/app/stable/nametag';
import { ART, World, Herd, type Sprite, type SpriteSource } from '../src/playground';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } };

const B = bank as { potions: Record<string, string[]>, eggs: Record<string, string[]>, anyone: string[] };
const DAY = '2026-10-15';

// ---- Habitica's names for every pet and mount
{
  const c = H.content;
  const wrong: string[] = [];
  for (const [k, v] of Object.entries<any>(c.petInfo)) if (petName(k) !== v.text()) wrong.push(`pet ${k}: ${petName(k)} ≠ ${v.text()}`);
  for (const [k, v] of Object.entries<any>(c.mountInfo)) if (petName(k, true) !== v.text()) wrong.push(`mount ${k}: ${petName(k, true)} ≠ ${v.text()}`);
  check(`Habitica's names: every pet (${Object.keys(c.petInfo).length}) and mount (${Object.keys(c.mountInfo).length}) is called what Habitica calls it`, !wrong.length, wrong.slice(0, 5).join(' | '));
  check('Habitica’s names: specials and grown cubs', creatureName('pet:Wolf-Cerberus') === 'Cerberus Pup' && creatureName('pet:Turkey-Base') === 'Turkey'
    && creatureName('mount:TigerCub-Red', true) === 'Red Tiger mount' && creatureName('mount:Mammoth-Base') === 'Woolly Mammoth' && creatureName('pet:TigerCub-Red') === 'Red Tiger Cub');
}

// ---- the list
{
  const all = [...Object.values(B.potions).flat(), ...Object.values(B.eggs).flat(), ...B.anyone];
  const bad = all.filter(n => 'error' in cleanName(n) || cleanName(n as string) && (cleanName(n) as { name: string }).name !== n);
  check(`the list: every name (${all.length}, ${new Set(all).size} different) is at most ${MAX_NAME} letters the font can write, already tidy`, !bad.length, bad.join());
  const potions = Object.keys(ITEMS.hatchingPotions).filter(p => (B.potions[p]?.length ?? 0) < 4);
  check(`the list: every hatching potion at ${ITEMS.habitica} has at least 4 names of its own`, !potions.length, potions.join());
  const eggs = Object.keys(ITEMS.eggs).filter(e => (B.eggs[e]?.length ?? 0) < 3);
  check(`the list: every egg at ${ITEMS.habitica} has at least 3 names of its own`, !eggs.length, eggs.join());
  const special = [...Object.keys(H.content.specialPets), ...Object.keys(H.content.specialMounts)].map(k => k.split('-')[1]).filter(p => !B.potions[p] && !ITEMS.hatchingPotions[p]);
  check('the list: special creatures’ potions (Veteran, Cerberus…) have names too', !special.length, special.join());
  check('the list: Romanian names keep their diacritics', B.potions.CottonCandyPink.includes('Mărțișor') && B.anyone.includes('Țăndărică'));
}

// ---- candidates and assignment
{
  const a = candidates('pet:Wolf-Red', 'user-a'), b = candidates('pet:Wolf-Red', 'user-b');
  const own = new Set([...B.eggs.Wolf, ...B.potions.Red]);
  check('candidates: the egg’s and the potion’s names first, then anyone’s', a.slice(0, own.size).every(n => own.has(n)) && a.length > own.size + 50);
  check('candidates: the same order for the same account, another for another', a.join() === candidates('pet:Wolf-Red', 'user-a').join() && a.join() !== b.join());

  let s = freshState();
  s = choose(s, 1, ['pet:Wolf-Red', 'mount:Dragon-Red', 'pet:Fox-Desert']).state;
  const r1 = assign({}, residentIds(s), 'user-a', DAY);
  check('assign: everyone in a playground gets a name, dated today', r1.given.length === 3 && Object.values(r1.names).every(x => x.name && x.since === DAY && !x.own), JSON.stringify(r1.names));
  check('assign: from its own list', B.eggs.Wolf.concat(B.potions.Red).includes(nameOf(r1.names, 'pet:Wolf-Red')) && B.eggs.Fox.concat(B.potions.Desert).includes(nameOf(r1.names, 'pet:Fox-Desert')));
  check('assign: nothing new, the same object back', assign(r1.names, residentIds(s), 'user-a', DAY).names === r1.names);
  const r2 = assign(r1.names, [...residentIds(s), 'pet:Owl-Base'], 'user-a', '2026-10-16');
  check('assign: names once given stay, the new one is added', r2.given.join() === 'pet:Owl-Base' && ['pet:Wolf-Red', 'mount:Dragon-Red', 'pet:Fox-Desert'].every(id => r2.names[id] === r1.names[id]));
  // seventy creatures (every playground full): all different names
  const many = Object.keys(H.content.pets).slice(0, 70).map(k => `pet:${k}`);
  const r3 = assign({}, many, 'user-a', DAY);
  const ns = Object.values(r3.names).map(x => x.name.toLocaleLowerCase());
  check('assign: seventy creatures, seventy different names', ns.length === 70 && new Set(ns).size === 70);
  // a name the player chose isn't given to anyone else
  const taken = rename({}, 'pet:Wolf-Base', 'Fang', DAY);
  const r4 = assign(taken, ['pet:Wolf-Red', 'pet:Wolf-White', 'pet:Wolf-Desert', 'pet:Wolf-Shade', 'pet:Wolf-Golden', 'pet:Wolf-Zombie'], 'user-a', DAY);
  check('assign: never a name already used on the account (any case)', !Object.entries(r4.names).some(([id, x]) => id !== 'pet:Wolf-Base' && x.name.toLowerCase() === 'fang'));

  // grown up: the mount takes its pet's name
  const pet = assign({}, ['pet:Fox-Desert'], 'u', DAY).names;
  const grown = assign(pet, ['mount:Fox-Desert'], 'u', '2026-10-20', () => false);
  check('grown up: a pet raised into a mount passes its name and its days to the mount', grown.names['mount:Fox-Desert']?.name === pet['pet:Fox-Desert'].name
    && grown.names['mount:Fox-Desert'].since === DAY && !grown.names['pet:Fox-Desert'] && !grown.given.length, JSON.stringify(grown.names));
  const both = assign(pet, ['mount:Fox-Desert'], 'u', DAY, () => true);
  check('grown up: not while that pet is still in the account (a mount of its own)', both.names['mount:Fox-Desert'].name !== pet['pet:Fox-Desert'].name && !!both.names['pet:Fox-Desert']);
  const again = assign(grown.names, ['pet:Fox-Desert'], 'u', DAY);
  check('grown up: a pet hatched again is Little that name', again.names['pet:Fox-Desert'].name === `Little ${pet['pet:Fox-Desert'].name}` || [...`Little ${pet['pet:Fox-Desert'].name}`].length > MAX_NAME, JSON.stringify(again.names));
  const long = assign({ 'mount:Fox-Desert': { name: 'Butterscotch' } }, ['pet:Fox-Desert'], 'u', DAY);
  check('grown up: Little only when it fits (12 letters)', !long.names['pet:Fox-Desert'].name.startsWith('Little'));
}

// ---- renaming, words, storage
{
  check('clean: spaces tidied, accents composed', (cleanName('  Ana   Maria ') as any).name === 'Ana Maria' && (cleanName('Mărțișor') as any).name === 'Mărțișor');
  check('clean: empty, too long and unwritable are refused with a reason', 'error' in cleanName('  ') && 'error' in cleanName('Abcdefghijklm') && /“☃”/.test((cleanName('Snow ☃') as any).error ?? ''));
  check('clean: twelve letters with diacritics fit', (cleanName('Țăndăricățăă') as any).name === 'Țăndăricățăă');
  let n: Names = assign({}, ['pet:Wolf-Red'], 'u', DAY).names;
  n = rename(n, 'pet:Wolf-Red', 'Ruby', '2026-10-20');
  check('rename: the player’s name, the day it came kept', n['pet:Wolf-Red'].name === 'Ruby' && n['pet:Wolf-Red'].own === true && n['pet:Wolf-Red'].since === DAY);
  check('words: called, and with Habitica’s name for buttons', called(n, 'pet:Wolf-Red') === 'Ruby' && calledFull(n, 'pet:Wolf-Red') === 'Ruby, Red Wolf' && calledFull(n, 'mount:Wolf-Red') === 'Red Wolf mount');
  n = rename(n, 'pet:Wolf-Red', '', DAY);
  check('rename: Habitica’s name instead (no name over its head)', nameOf(n, 'pet:Wolf-Red') === '' && called(n, 'pet:Wolf-Red') === 'Red Wolf' && !!n['pet:Wolf-Red']);
  check('rename: Habitica’s name is kept, not given a new one later', assign(n, ['pet:Wolf-Red'], 'u', DAY).names === n);
  check('days: whole days since, never negative', daysSince(DAY, '2026-10-15') === 0 && daysSince(DAY, '2026-11-14') === 30 && daysSince(DAY, '2026-10-01') === undefined && daysSince(undefined, DAY) === undefined);
  saveNames('u1', rename({}, 'pet:Wolf-Red', 'Ruby', DAY));
  saveNames('u2', rename({}, 'pet:Wolf-Red', 'Rex', DAY));
  check('storage: one record per account', loadNames('u1')['pet:Wolf-Red'].name === 'Ruby' && loadNames('u2')['pet:Wolf-Red'].name === 'Rex' && !Object.keys(loadNames('u3')).length && !Object.keys(loadNames(undefined)).length);
  const odd = normalizeNames({ 'pet:Wolf-Red': { name: 'Ruby', since: 'yesterday', own: 1 }, 'pet:Fox-Desert': { name: 'x'.repeat(40) }, 'nonsense': { name: 'A' }, 'pet:Owl-Base': { name: '' }, 'mount:Dragon-Red': 5 });
  check('storage: an odd record is checked entry by entry', JSON.stringify(odd) === JSON.stringify({ 'pet:Wolf-Red': { name: 'Ruby', own: true }, 'pet:Owl-Base': { name: '' } }), JSON.stringify(odd));
}

// ---- the pixel font
{
  check('font: Romanian letters, accents and capitals are written', !unwritable('ăâîșțĂÂÎȘȚ áéíóúüöçñÅøŁł 0-9.’').filter(c => c !== 'ø').length, unwritable('ăâîșțĂÂÎȘȚ áéíóúüöçñÅøŁł').join());
  check('font: emoji and other scripts are not', unwritable('🐺Ж中').length === 3);
  check('font: widths in art pixels, one between letters', textWidth('i') === 1 && textWidth('ii') === 3 && textWidth('Mm') === 11 && textWidth('ă') === 3);
  // painted cells: rows inside the 8-row cell; accents above capitals and lower case, commas below
  const px = (t: string) => {
    const cells: [number, number][] = [];
    drawText({ fillStyle: '', fillRect: (x: number, y: number) => cells.push([x, y]) }, t, 0, 0, '#fff', 1);
    return cells;
  };
  const rows = (t: string) => [...new Set(px(t).map(c => c[1]))].sort((a, b) => a - b);
  check('font: everything inside its 8 rows', [...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ăâîșțĂÂÎȘȚ'].every(ch => rows(ch).every(r => r >= 0 && r < FONT_ROWS)));
  check('font: ă’s breve above the a with a clear row, ș’s comma below', rows('ă')[0] === 0 && !rows('ă').includes(2) && Math.max(...rows('ș')) === 7 && Math.max(...rows('s')) === 6);
  check('font: ă and â differ, î has no dot', px('ă').join() !== px('â').join() && !rows('î').includes(2) && rows('i').includes(1));
  check('font: rows a word uses', textRows('Ruby').join() === '2,7' && textRows('ana').join() === '3,6' && textRows('Mărțișor').join() === '0,7');
}

// ---- the tag's place: over the painted head, inside the world, never under the app bar
{
  // a picture with nothing painted in its top 40 rows: the plate goes over what's painted, not over the box
  const sprite = (key: string): Sprite => {
    const w = 81, h = 99, mask = new Uint8Array(w * h);
    for (let y = 40; y < h; y++) mask.fill(1, y * w + 20, y * w + 60);
    return { key, image: {} as CanvasImageSource, w, h, anchor: { x: 40, y: h - 1 }, gait: 'four-legged', facing: 'right', mask };
  };
  const cache = new Map<string, Sprite>();
  const src: SpriteSource = { get: k => cache.get(k) ?? (cache.set(k, sprite(k)), cache.get(k)), load: async () => {} };
  const w = new World(src, { seed: 1 });
  const herd = new Herd(w, { seed: 'names', still: () => true, clock: () => new Date(2026, 9, 15, 12) });
  herd.set([{ id: 'pet:Wolf-Red', sprite: 'wolf', kind: 'pet', species: 'Wolf', spot: { x: 0.5, y: 0.5 } }, { id: 'pet:Fox-Desert', sprite: 'fox', kind: 'pet', species: 'Fox', spot: { x: 0, y: 0 } }]);
  w.resize(480, 640);
  let t = 1000;
  const names: Record<string, string> = { 'pet:Wolf-Red': 'Ruby', 'pet:Fox-Desert': 'Mărțișor' };
  const tags = new NameTagLayer(herd, id => names[id] ?? '', () => t);
  check('tag: none for a creature without a name or not here', !tags.show('pet:Owl-Base') && !tags.showing().length);
  check('tag: shows on demand, goes after 2.5 s', tags.show('pet:Wolf-Red') && tags.showing().join() === 'pet:Wolf-Red' && ((t += 2600), !tags.showing().length));
  tags.hold('pet:Wolf-Red'); t += 60_000;
  check('tag: stays while carried, then 2.5 s more', tags.showing().join() === 'pet:Wolf-Red' && (tags.release('pet:Wolf-Red'), (t += 2400), tags.showing().length === 1) && ((t += 200), !tags.showing().length));
  const c = herd.byId('pet:Wolf-Red')!, b = tags.place(w, c, 'Ruby')!;
  const f = c.frame(w)!;
  check('tag: above the creature’s picture, in whole art pixels', b.y + b.h <= f.top + 40 - ART && b.y + b.h >= f.top + 40 - 4 * ART && b.x % ART === 0 && b.y % ART === 0 && b.w === (textWidth('Ruby') + 4) * ART, JSON.stringify([b, f.top]));
  w.insets = { top: 600, bottom: 0 };
  const edge = tags.place(w, herd.byId('pet:Fox-Desert')!, 'Mărțișor')!;
  check('tag: kept inside the world and under the app bar', edge.x >= ART && edge.x + edge.w <= w.w && edge.y >= 600 + ART, JSON.stringify(edge));
  const drawn: string[] = [];
  tags.show('pet:Fox-Desert');
  tags.draw({ set fillStyle (v: string) { drawn.push(v); }, get fillStyle () { return ''; }, fillRect () {} } as any, w);
  check('tag: a dark plate, white letters', drawn.join() === 'rgba(24,32,28,0.8),#FFFFFF', drawn.join());
}

if (failures) { console.log(`FAIL  names: ${failures} of ${checks} checks failed`); process.exit(1); }
console.log(`PASS  names: ${checks} checks`);
