/*
 * Trophies (src/app/stable/trophies.ts, src/playground/scenes/trophies.ts): the counts towards each collection
 * achievement against Habitica's own hatch and feed at the rules.ts tag (the achievement arrives exactly when
 * our count reaches its need), the signposts at half, growth's words and record for them, and where the
 * trophies stand in every scene (clear of each other and of the scene's props, and never moving when another
 * arrives).
 */
import { createRequire } from 'node:module';
import { progressAll, trophiesOf } from '../src/app/stable/trophies';
import { atLeast, growthRows, loadGrown, newSteps, announcement, saveGrown } from '../src/app/stable/growth';
import { NO_GROWTH, SCENE_IDS, paintScene, type Growth } from '../src/playground/scenes';
import { SET_TROPHIES, TROPHY_KEYS } from '../src/playground/scenes/trophies';
import { paintInterior } from '../src/playground/scenes/interior';
import { FAMILIES, barnMounts, familyOf } from '../src/app/stable/stalls';
import sprites from '../src/data/sprites.json';
import itemsJson from '../src/data/items.json';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');
const A = (itemsJson as any).achievements;

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } };

const userWith = (pets: Record<string, number>, mounts: Record<string, boolean> = {}) =>
  ({ items: { eggs: {}, hatchingPotions: {}, food: { Saddle: 9 }, pets: { ...pets }, mounts: { ...mounts } }, achievements: {}, preferences: {}, markModified () {} } as any);
const progress = (u: any, key: string) => progressAll(u).find(p => p.key === key)!;
const hatch = (u: any, key: string) => {
  const [egg, potion] = key.split('-');
  u.items.eggs[egg] = 1; u.items.hatchingPotions[potion] = 1;
  H.hatch(u, { params: { egg, hatchingPotion: potion } });
};

/* ---- the data is Habitica's */
{
  check('38 trophies: 10 colours for pets and for mounts, 14 sets, Bone to Pick, 3 masters', TROPHY_KEYS.length === 38 && new Set(TROPHY_KEYS).size === 38);
  check('every trophy has Habitica\'s name and line', TROPHY_KEYS.every(k => A.names[k]?.[0] && A.names[k]?.[1]), TROPHY_KEYS.filter(k => !A.names[k]?.[0]).join());
  check('the sets are Habitica\'s', Object.keys(A.sets).sort().join() === SET_TROPHIES.filter(t => t.key !== 'boneToPick').map(t => t.key).sort().join());
}

/* ---- each count reaches its need exactly when Habitica awards the achievement */
{
  const combos = (species: string[], potions: string[]) => species.flatMap(s => potions.map(p => `${s}-${p}`));
  // colour pets: hatching the last of the 9
  for (const [potion, key] of A.colours) {
    const keys = A.dropEggs.map((e: string) => `${e}-${potion}`), last = keys.pop();
    const u = userWith(Object.fromEntries(keys.map((k: string) => [k, 5])));
    const before = progress(u, key);
    hatch(u, last);
    const after = progress(u, key);
    check(`${key}: ${before.have} of ${before.need} before, Habitica awards it at ${after.have}`, before.have === before.need - 1 && after.have === after.need && u.achievements[key] === true && trophiesOf(u).trophies.includes(key), JSON.stringify({ before, after, a: u.achievements }));
  }
  // colour mounts: the last of the 9 raised with a Saddle
  for (const [potion, , key] of A.colours) {
    const keys = A.dropEggs.map((e: string) => `${e}-${potion}`), last = keys.pop();
    const u = userWith({ [last]: 5 }, Object.fromEntries(keys.map((k: string) => [k, true])));
    const before = progress(u, key);
    H.feed(u, { params: { pet: last, food: 'Saddle' } });
    const after = progress(u, key);
    check(`${key}: ${before.have} of ${before.need} before, Habitica awards it at ${after.have}`, before.have === before.need - 1 && after.have === after.need && u.achievements[key] === true, JSON.stringify({ before, after, a: u.achievements }));
  }
  // species sets: one pet raised to a mount (-1) doesn't count, until hatched again
  for (const [key, [type, species]] of Object.entries(A.sets) as [string, [string, string[]]][]) {
    const keys = combos(species, A.dropPotions), last = keys[keys.length - 1];
    const pets = Object.fromEntries(keys.map(k => [k, 5])); pets[last] = -1;
    const u = userWith(pets, type === 'petMount' ? Object.fromEntries(keys.map(k => [k, true])) : {});
    const before = progress(u, key);
    check(`${key}: Habitica hasn't awarded it yet`, !u.achievements[key]);
    hatch(u, last);
    const after = progress(u, key);
    check(`${key}: ${before.have} of ${before.need} before, Habitica awards it at ${after.have}`, before.have === before.need - 1 && after.have === after.need && u.achievements[key] === true, JSON.stringify({ before, after }));
  }
  // Bone to Pick: drop and quest Skeletons
  for (const [potion, key] of A.petSets) {
    const keys = [...A.dropEggs, ...A.questEggs].map((e: string) => `${e}-${potion}`), last = keys.pop()!;
    const u = userWith(Object.fromEntries(keys.map((k: string) => [k, 5])));
    const before = progress(u, key);
    hatch(u, last);
    check(`${key}: ${before.have} of ${before.need} before, Habitica awards it with the last`, before.have === before.need - 1 && progress(u, key).have === before.need && u.achievements[key] === true);
  }
  // the masters: Habitica's count.js over its 90 drop pets
  const drop = Object.keys(H.content.pets);
  const u = userWith(Object.fromEntries(drop.map((k, i) => [k, i < 45 ? -1 : 5])), Object.fromEntries(drop.slice(0, 50).map(k => [k, true])));
  check('Beast Master counts pets raised to mounts (-1) too, Mount Master the mounts, Triad Bingo pets now and mounts',
    progress(u, 'beastMaster').have === 90 && progress(u, 'beastMaster').need === 90 && progress(u, 'mountMaster').have === 50 && progress(u, 'triadBingo').have === 45 + 50 && progress(u, 'triadBingo').need === 180);
}

/* ---- earned and halfway */
{
  const pets = Object.fromEntries(['Cheetah', 'LionCub', 'Sabretooth', 'TigerCub'].flatMap(s => A.dropPotions.slice(0, 5).map((p: string) => [`${s}-${p}`, 5])));
  const t = trophiesOf({ achievements: { polarPro: true, backToBasics: true, streak: 3, beastMaster: false }, items: { pets } });
  check('earned: Habitica\'s true flags, in the trophies\' order', t.trophies.join() === 'backToBasics,polarPro', t.trophies.join());
  check('halfway: Cat Herder at 20 of 40 gets a signpost; earned ones don\'t', t.signs.includes('cats') && !t.signs.includes('polarPro') && !t.signs.includes('backToBasics'), t.signs.join());
  check('nothing read: no trophies', trophiesOf(undefined).trophies.length === 0 && trophiesOf({}).signs.length === 0);
}

/* ---- growth: named once, never lost, a signpost gives way to its trophy */
{
  const G = (o: Partial<Growth>): Growth => ({ ...NO_GROWTH, trophies: [], signs: [], ...o });
  const steps = newSteps(G({ signs: ['cats'] }), G({ trophies: ['backToBasics', 'polarPro'], signs: ['cats', 'rodentRuler'] }), 'meadow');
  check('a new trophy and a new signpost are named, an old signpost isn\'t',
    announcement(steps) === 'Your playground grew: a Base pennant for Back to Basics, an igloo for Polar Pro and a signpost: Rodent Ruler is halfway.', announcement(steps));
  const both = atLeast(G({ trophies: ['polarPro'], signs: ['cats'] }), G({ trophies: ['cats'], signs: ['rodentRuler'] }));
  check('trophies only arrive; an earned one\'s signpost goes', both.trophies!.join() === 'cats,polarPro' && both.signs!.join() === 'rodentRuler', JSON.stringify(both));
  saveGrown('t1', G({ trophies: ['polarPro'], signs: ['cats'] }));
  mem.set('critoracle:v2:growth', JSON.stringify({ ...JSON.parse(mem.get('critoracle:v2:growth')!), t2: { trophies: ['nope', 'cats', 3], signs: 'x' } }));
  check('the record keeps them, and drops what isn\'t a trophy', loadGrown('t1')!.trophies!.join() === 'polarPro' && loadGrown('t1')!.signs!.join() === 'cats' && loadGrown('t2')!.trophies!.join() === 'cats' && loadGrown('t2')!.signs!.length === 0);
  const raw = { achievements: { backToBasics: true }, items: { pets: { 'Wolf-Desert': 5, 'Fox-Desert': 5, 'Dragon-Desert': 5, 'Cactus-Desert': 5, 'BearCub-Desert': 5, 'TigerCub-Desert': 5, 'LionCub-Desert': 5 } } };
  const row = growthRows(G({ trophies: ['backToBasics'], signs: ['dustDevil'] }), 'meadow', 0, { progress: progressAll(raw) }).find(r => r.part === 'trophies')!;
  check('sheet: how many, the halfway ones, and the nearest with Habitica\'s count',
    row.now === '1 of 38 of Habitica’s collection achievements, 1 more halfway (a signpost each).' && row.next === 'Next: Dust Devil, 7 of 9 Desert pets. Its signpost is up.' && Math.abs(row.progress! - 1 / 38) < 1e-9, JSON.stringify(row));
  const none = growthRows(G({}), 'meadow', 0, { progress: progressAll({}) }).find(r => r.part === 'trophies')!;
  check('sheet: before any, what brings the first', /Next: .* 0 of 9 .* A signpost goes up at 5\./.test(none.next), none.next);
}

/* ---- where they stand */
{
  class Raster {
    fillStyle: unknown = '#000000'; bad = 0;
    fillRect (x: number, y: number, w: number, h: number) { if (![x, y, w, h].every(Number.isInteger) || !/^#[0-9a-f]{6}$/i.test(String(this.fillStyle))) this.bad++; }
  }
  const all = G0({ trophies: TROPHY_KEYS, signs: [] }), some = G0({ trophies: ['polarPro'], signs: ['cats'] });
  function G0 (o: Partial<Growth>): Growth { return { checkIns: 100, perfectDays: 30, streakDays: 21, level: 20, quests: 6, ...o }; }
  for (const W of [137, 160]) for (const scene of SCENE_IDS) for (const tod of ['day', 'night'] as const) {
    const r = new Raster();
    const l = paintScene(r, { W, H: 230, top: 30, bottom: 40 }, { scene, growth: all, tod, season: 'winter', dailiesDone: true });
    const props = l.trophies.filter(t => SET_TROPHIES.some(s => s.key === t.key));
    const overlap = l.trophies.some((a, i) => l.trophies.some((b, j) => j > i && a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1));
    check(`${scene} ${W} ${tod}: whole pixels and real colours with every trophy`, r.bad === 0);
    check(`${scene} ${W}: a spot per pennant, prop and statue (28), none on another`, l.trophies.filter(t => !t.sign).length === 28 && !overlap, JSON.stringify(props));
    check(`${scene} ${W}: on the ground, inside the picture`, props.every(t => t.x0 >= 0 && t.x1 <= W && t.y1 > l.horizon));
    const one = paintScene(new Raster(), { W, H: 230, top: 30, bottom: 40 }, { scene, growth: some, tod, season: 'summer', dailiesDone: true }).trophies;
    const at = (ts: typeof one, k: string) => JSON.stringify(ts.find(t => t.key === k));
    check(`${scene} ${W}: a trophy stands where it would with all the others`, at(one, 'polarPro') === at(l.trophies, 'polarPro') && one.find(t => t.key === 'cats')?.sign === true);
  }
}

/* ---- the barn: every mount in Habitica's families, every trophy on the wall, plaques without a cap */
{
  const mounts = Object.fromEntries(Object.keys((sprites as any).mounts).map(k => [k, true]));
  const ids = barnMounts({ mounts: { ...mounts, 'Nope-Base': true, 'Wolf-Base': false as unknown as boolean } });
  const fams = ids.map(id => familyOf(id.slice(6)));
  check('barn: a stall for every mount the Stable can draw, none it can\'t or the account doesn\'t have', ids.length === Object.keys(mounts).length - 1 && !ids.includes('mount:Wolf-Base') && !ids.includes('mount:Nope-Base'));
  check('barn: Habitica\'s families in its order, each together', fams.every((f, i) => i === 0 || FAMILIES.indexOf(fams[i - 1]) <= FAMILIES.indexOf(f)) && FAMILIES.every(f => fams.includes(f)), [...new Set(fams)].join());
  check('barn: the families are Habitica\'s (drop eggs and potions, magic potions, quest eggs, special mounts)',
    familyOf('Wolf-Base') === 'Standard' && familyOf('Wolf-Golden') === 'Standard' && familyOf('Gryphon-Base') === 'Quest' && familyOf('BearCub-Polar') === 'Special' && familyOf('Wolf-Aquatic') === 'Magic Potion');
  check('barn: within a family, by egg then potion, as Habitica lists them', ids.indexOf('mount:Wolf-Base') < 0 && ids.indexOf('mount:Wolf-White') < ids.indexOf('mount:Wolf-Desert') && ids.indexOf('mount:Wolf-Golden') < ids.indexOf('mount:TigerCub-Base'));
  class Raster {
    fillStyle: unknown = '#000000'; bad = 0;
    fillRect (x: number, y: number, w: number, h: number) { if (![x, y, w, h].every(Number.isInteger) || !/^#[0-9a-f]{6}$/i.test(String(this.fillStyle))) this.bad++; }
  }
  for (const [W, H] of [[137, 230], [160, 230], [200, 300], [137, 190]]) for (const quests of [0, 1, 60, 200]) {
    const r = new Raster(), l = paintInterior(r, W, H, { top: 30, bottom: 20 }, { have: new Set(TROPHY_KEYS.slice(0, 20)), quests });
    const t = l.trophies, overlap = t.some((a, i) => t.some((b, j) => j > i && a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1));
    check(`barn ${W}x${H}, ${quests} quests: whole pixels, real colours`, r.bad === 0);
    check(`barn ${W}x${H}: all 38 trophies on the wall, earned ones marked, none on another, under the bars`, t.length === 38 && new Set(t.map(x => x.key)).size === 38 && t.filter(x => !x.sign).length === 20 && !overlap
      && t.every(x => x.x0 >= 0 && x.x1 <= W && x.y0 >= 30 && x.y1 <= l.stalls.beam), JSON.stringify({ top: Math.min(...t.map(x => x.y0)), beam: l.stalls.beam }));
    check(`barn ${W}x${H}: the board under the rack, the stalls under the wall, the floor under the stalls, inside the picture`,
      l.plaques.y0 > 30 && l.plaques.y1 <= l.stalls.beam && l.stalls.beam < l.stalls.top && l.stalls.top < l.stalls.door && l.stalls.door < l.stalls.floor && l.floor.top > l.stalls.floor && l.floor.bottom <= H - 20 && l.floor.bottom > l.floor.top, JSON.stringify(l));
  }
}

console.log(failures ? `FAIL  trophies: ${failures} of ${checks} checks failed` : `PASS  trophies: ${checks} checks`);
if (failures) process.exit(1);
