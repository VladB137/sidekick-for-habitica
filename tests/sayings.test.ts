/*
 * The talking character's lines (src/app/sayings-lines.ts) and how one is picked (src/app/sayings.ts): every line
 * fits, fills in and stays short; Relaxed never hears about crits; lines don't come round again too soon; and every
 * fact holds against Habitica's code at the rules.ts tag, replayed through its own functions where the harness has
 * them and found in its source where it doesn't (cron, constants, locales).
 */
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import itemsJson from '../src/data/items.json';
import { SPECIES_TRAITS } from '../src/stable/natures';
import { GROUPS } from '../src/app/sayings-lines';
import {
  KIND_SHARE, MAX_CHARS, RECENT_SHARE, accountWords, allLines, beatsOf, candidates, fill, pickSaying, speakerInfo,
  type SayingContext, type SayingKind, type Speaker,
} from '../src/app/sayings';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');
const ITEMS = itemsJson as any;
const HABITICA = resolve(process.env.HABITICA_DIR || resolve(dirname(fileURLToPath(import.meta.url)), '../../habitica'));

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };

let rs = 20261017;
const rand = () => { rs |= 0; rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const NOON = new Date(2026, 9, 17, 12, 0);
const ctxOf = (speaker: Speaker, more: Partial<SayingContext> = {}): SayingContext => Object.assign({ mode: 'full', conn: 'live', crit: false, speaker, now: NOON }, more) as SayingContext;
const lines = allLines();

// ---------------------------------------------------------------- the library itself
{
  const ids = new Set(lines.map(l => l.id));
  check('lib: every id unique', ids.size === lines.length, `${ids.size} of ${lines.length}`);
  check('lib: a few hundred lines', lines.length >= 300, String(lines.length));
  const ACCT = ['perfect', 'streakAch', 'streakDays', 'bestStreak', 'toStreakAch', 'basicPets', 'basicLeft', 'basicMounts', 'petCount', 'mountCount', 'checkins', 'questsWon', 'daysIn', 'rebirths', 'gold', 'xpToNext', 'nextLvl', 'growth', 'mealsLeft', 'checkinsLeft'];
  const WORDS = ['checkinReward', 'checkinRewardNext'];
  const TOKENS = new Set(['name', 'species', 'a species', 'young', 'potion', 'food', 'cls', 'lvl', ...ACCT, ...WORDS]);
  const species = new Set([...Object.keys(ITEMS.eggs), ...Object.keys(SPECIES_TRAITS)]);
  for (const l of lines) {
    const bad = [...l.say.matchAll(/\{([^}]*)\}/g)].map(m => m[1]).filter(t => !TOKENS.has(t));
    check(`lib: known words only: ${l.say}`, !bad.length, bad.join());
    check(`lib: typographic quotes: ${l.say}`, !/['"]/.test(l.say));
    check(`lib: no stray spaces or beats: ${l.say}`, !/ {2}| \||^\||^\s|\s$/.test(l.say));
    for (const s of l.species ?? []) check(`lib: species ${s} exists`, species.has(s));
    for (const p of l.potions ?? []) check(`lib: potion ${p} exists`, p in ITEMS.hatchingPotions);
    // Relaxed never hears about crits: anything that says the word is marked, and the marked ones are Full only
    if (/\bcrit/i.test(l.say)) check(`lib: mentions a crit, so Full only: ${l.say}`, !!l.crit);
    if (l.kind === 'info') check(`lib: a fact says where it holds: ${l.say}`, !!l.src);
    check(`lib: no claim to be Habitica’s: ${l.say}`, !/\b(official|endorsed|affiliated)\b/i.test(l.say) || /\bnot\b/i.test(l.say));
    check(`lib: no gryphon by name: ${l.say}`, !/gryphon/i.test(l.say));
  }
  // the longest every word could be: a 12-letter name, Habitica's longest animal, potion and food names, a level of 9999
  const longest = (xs: string[]) => xs.reduce((a, b) => (b.length > a.length ? b : a), '');
  const eggNames = Object.values(ITEMS.eggs as Record<string, any[]>).flatMap(e => [e[0], e[3] ?? e[0]]).concat(Object.values(ITEMS.specialPets as Record<string, string>));
  const info = {
    special: true, feeds: true, speciesName: longest(eggNames), young: longest(eggNames),
    potionName: longest(Object.values(ITEMS.hatchingPotions as Record<string, any[]>).map(p => p[0])),
    food: longest(Object.values(ITEMS.food as Record<string, any[]>).map(f => f[0])),
  };
  const worst = ctxOf({ kind: 'pet', key: 'x', name: 'Mărțișorelul' }, { cls: 'warrior', lvl: 9999 });
  for (const l of lines) {
    // a player's numbers at their longest: seven digits of Gold, the rest five
    const big: Record<string, string> = {};
    for (const k of ACCT) big[k] = k === 'gold' ? '9999999' : '99999';
    for (const k of WORDS) big[k] = longest((ITEMS.checkIns as Array<[number, string]>).map(c => c[1]));
    const t = beatsOf(fill(l.say, worst, info, big) ?? '').text;
    check(`lib: at most ${MAX_CHARS} characters filled in (${t.length}): ${l.say}`, t.length <= MAX_CHARS);
  }
  const kinds = new Set(lines.map(l => l.kind));
  check('lib: every kind', (Object.keys(KIND_SHARE) as SayingKind[]).every(k => kinds.has(k)));
  check('lib: groups say something', GROUPS.every(g => g.length > 1));
}

// ---------------------------------------------------------------- filling in, beats
{
  const s = beatsOf('I counted every blade of grass.| Twice.||');
  check('beats: marks out, positions kept', s.text === 'I counted every blade of grass. Twice.' && s.beats.join() === '31', JSON.stringify(s));
  const tc = speakerInfo({ kind: 'mount', key: 'TigerCub-Shade', name: 'Stripes' });
  check('speaker: a mount is called by its mount name, and was a cub', tc.speciesName === 'Tiger' && tc.young === 'Tiger Cub' && tc.potionName === 'Shade' && !tc.feeds && !tc.food);
  const wolf = speakerInfo({ kind: 'pet', key: 'Wolf-Zombie', name: 'Rex' });
  check('speaker: a Zombie pet likes Rotten Meat', wolf.food === 'Rotten Meat' && wolf.feeds && wolf.potionKind === 'drop');
  const magic = speakerInfo({ kind: 'pet', key: 'Fox-Shimmer', name: 'Glint' });
  check('speaker: a magic potion pet eats, has no one favourite', magic.feeds && !magic.food && magic.potionKind === 'premium');
  const vet = speakerInfo({ kind: 'pet', key: 'Wolf-Veteran', name: 'Old Wolf' });
  check('speaker: special pets aren’t fed', vet.special && !vet.feeds);
  const turkey = speakerInfo({ kind: 'pet', key: 'Turkey-Base', name: 'Gobbles' });
  check('speaker: a special pet with no egg goes by Habitica’s name for it', turkey.speciesName === 'Turkey' && turkey.special);
  const wacky = speakerInfo({ kind: 'pet', key: 'Cactus-Veggie', name: 'Sprout' });
  check('speaker: wacky pets aren’t fed', !wacky.feeds && wacky.potionKind === 'wacky');
  const me = speakerInfo({ kind: 'avatar', name: 'Vlad' });
  const said = fill('I heard you were looking for {a species} with ambition.', ctxOf({ kind: 'avatar', name: 'Vlad' }), me);
  check('fill: a word the speaker hasn’t got leaves the line out', said === null);
  const an = (k: string) => fill('{a species}', ctxOf({ kind: 'pet', key: k, name: 'X' }), speakerInfo({ kind: 'pet', key: k, name: 'X' }));
  check('fill: a or an', an('Owl-Base') === 'an Owl' && an('Unicorn-Base') === 'a Unicorn' && an('Egg-Base') === 'an Egg' && an('Wolf-Base') === 'a Wolf', [an('Owl-Base'), an('Unicorn-Base')].join());
}

// ---------------------------------------------------------------- what fits
{
  const all = [
    ...Object.keys(H.content.petInfo).map(key => ({ kind: 'pet' as const, key, name: 'Pip' })),
    ...Object.keys(H.content.mountInfo).map(key => ({ kind: 'mount' as const, key, name: 'Pip' })),
    { kind: 'avatar' as const, name: 'Vlad' },
  ];
  let fewest = Infinity, who = '';
  for (const sp of all) {
    for (const mode of ['full', 'relaxed'] as const) {
      const n = candidates(ctxOf(sp, { mode })).length;
      if (n < fewest) { fewest = n; who = `${sp.kind} ${sp.key ?? ''} ${mode}`; }
    }
  }
  check('fit: every pet, mount and the avatar has plenty to say, in either mode', fewest >= 130, `${fewest} for ${who}`);

  const has = (ctx: SayingContext, text: RegExp) => candidates(ctx).some(c => text.test(c.text));
  const wolf: Speaker = { kind: 'pet', key: 'Wolf-Base', name: 'Pip' };
  check('fit: species lines for their species only', has(ctxOf(wolf), /Awoo/) && !has(ctxOf({ kind: 'pet', key: 'Fox-Base', name: 'Pip' }), /Awoo/));
  check('fit: feeding lines for pets that eat', has(ctxOf(wolf), /favourite food is Meat/) && !has(ctxOf({ kind: 'mount', key: 'Wolf-Base', name: 'Pip' }), /favourite food/));
  check('fit: hours, wrapping past midnight', has(ctxOf(wolf, { now: new Date(2026, 9, 17, 23, 30) }), /moon is yawning/) && has(ctxOf(wolf, { now: new Date(2026, 9, 18, 2, 0) }), /moon is yawning/) && !has(ctxOf(wolf), /moon is yawning/));
  check('fit: feasts on their days only', has(ctxOf(wolf, { feasts: ['habitoween'] }), /Habitoween/) && !has(ctxOf(wolf), /Habitoween/));
  check('fit: offline lines only offline', has(ctxOf(wolf, { conn: 'offline' }), /hear Habitica/) && !has(ctxOf(wolf), /hear Habitica/));
  check('fit: the Inn only while resting', has(ctxOf(wolf, { resting: true }), /resting in the Inn/) && !has(ctxOf(wolf), /resting in the Inn\. I/));
  check('fit: class lines need the class', has(ctxOf({ kind: 'avatar', name: 'V' }, { cls: 'wizard', lvl: 30 }), /Mage tip/) && !has(ctxOf({ kind: 'avatar', name: 'V' }), /Mage tip/));
  check('fit: a coming crit, in Full only', has(ctxOf(wolf, { crit: true }), /next task crits/) && !has(ctxOf(wolf), /next task crits/) && !has(ctxOf(wolf, { crit: true, mode: 'relaxed' }), /next task crits/));
  check('fit: Relaxed never hears about crits', ['live', 'checking', 'offline'].every(conn => candidates(ctxOf(wolf, { mode: 'relaxed', crit: true, conn: conn as any, cls: 'rogue', lvl: 50 })).every(c => !/crit/i.test(c.text))));
}

const src = (file: string) => { const p = resolve(HABITICA, 'website', file); return existsSync(p) ? readFileSync(p, 'utf8') : ''; };
const t = (k: string) => H.i18n.t(k, {}, 'en') as string;
const says = (re: RegExp) => lines.some(l => l.kind === 'info' && re.test(l.say));
const throws = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
const stable = (pets: Record<string, number>, food: Record<string, number>, more: any = {}): any => Object.assign({
  items: { pets, mounts: {}, food, eggs: {}, hatchingPotions: {}, currentPet: '' }, achievements: {}, markModified () {}, addNotification () {},
}, more);

// ---------------------------------------------------------------- the player's own numbers
{
  const pets: Record<string, number> = { 'Wolf-Base': 15, 'Fox-Red': 5, 'Gryphon-Base': 5, 'Wolf-Shimmer': 5, 'Fox-Base': -1 };
  const user = {
    achievements: { perfect: 12, streak: 3, rebirths: 1, quests: { gryphon: 2, rat: 1 } },
    items: { pets, mounts: { 'Fox-Base': true, 'Wolf-Red': true, 'Gryphon-Base': true } },
    loginIncentives: 40, auth: { timestamps: { created: '2026-01-01T00:00:00Z' } }, stats: { gp: 345.8, lvl: 12, exp: 100.6 },
  };
  const tasks = [{ type: 'daily', streak: 30 }, { type: 'daily', streak: 4 }, { type: 'habit', streak: 99 }];
  const sp: Speaker = { kind: 'pet', key: 'Wolf-Base', name: 'Pip' };
  const w = accountWords(ctxOf(sp, { user, tasks, now: new Date('2026-10-17T12:00:00Z') }));
  const want = {
    perfect: '12', streakAch: '3', streakDays: '63', rebirths: undefined, questsWon: '3', basicPets: '2', basicLeft: '88', basicMounts: '2',
    petCount: '4', mountCount: '3', checkins: '40', daysIn: '289', gold: '345', growth: '15', mealsLeft: '7',
    bestStreak: '30', toStreakAch: '12', checkinsLeft: '5', checkinReward: 'Royal Purple Potion', checkinRewardNext: undefined,
  } as Record<string, string | undefined>;
  // XP to level 13 from 100 XP at level 12, with Habitica's own table
  const u12: any = { stats: { hp: 10, gp: 0, exp: 0, lvl: 12, points: 0, str: 0, con: 0, int: 0, per: 0, class: 'warrior', buffs: {} }, preferences: { automaticAllocation: false }, flags: { levelDrops: {}, customizationsNotification: true, itemsEnabled: true }, items: { quests: {} }, achievements: {}, _tmp: {}, markModified () {}, addNotification () {} };
  let need = 0;
  for (let x = 1; x < 1000; x++) { const t2 = JSON.parse(JSON.stringify(u12)); Object.assign(t2, { markModified () {}, addNotification () {} }); H.updateStats(t2, { hp: 10, gp: 0, exp: x }); if (t2.stats.lvl === 13) { need = x; break; } }
  want.xpToNext = String(need - 100); want.nextLvl = '13';
  const bad = Object.keys(want).filter(k => w[k] !== want[k]).map(k => `${k} ${w[k]} vs ${want[k]}`);
  check('account: the numbers, from a read', !bad.length, bad.join('; '));
  // the meals left really raise it: 7 of its liked food from 15
  const u: any = stable({ 'Wolf-Base': 15 }, { Meat: 7 });
  for (let i = 0; i < 6; i++) H.feed(u, { params: { pet: 'Wolf-Base', food: 'Meat' }, language: 'en' });
  const notYet = !u.items.mounts['Wolf-Base'];
  H.feed(u, { params: { pet: 'Wolf-Base', food: 'Meat' }, language: 'en' });
  check('account: meals left, replayed through feed.js', notYet && u.items.mounts['Wolf-Base'] === true);
  const said = candidates(ctxOf(sp, { user, tasks })).map(c => c.text);
  check('account: the lines say them', said.includes('You’ve had 12 Perfect Days. I remember every one of them. Roughly.') && said.some(t => t.startsWith('I’m 15 of 50 grown. 7 more')) && !said.some(t => /Orb of Rebirth 1 times/.test(t)));
  check('account: the next Check-In Reward, said', said.includes('5 more check-ins to your next Check-In Reward: Royal Purple Potion.'));
  const at = (n: number) => accountWords(ctxOf(sp, { user: { loginIncentives: n } }));
  check('account: one check-in to go says it the other way', at(49).checkinRewardNext === 'Saddle' && at(49).checkinsLeft === undefined && at(48).checkinsLeft === '2' && at(48).checkinRewardNext === undefined);
  check('account: no next Check-In Reward after the last', at(500).checkinReward === undefined && at(9000).checkinReward === undefined && at(0).checkinRewardNext === 'Bardic Robes');
  check('account: none without a read', !candidates(ctxOf(sp)).some(c => /Perfect Days\. I remember|check-ins so far/.test(c.text)));
  const one = accountWords(ctxOf(sp, { user: { achievements: { perfect: 1 } }, tasks: [{ type: 'daily', streak: 20 }] }));
  check('account: no “1 Perfect Days”, and 1 day to a Streak Achievement isn’t said', one.perfect === undefined && one.toStreakAch === undefined && one.bestStreak === '20');
}

// ---------------------------------------------------------------- picking
{
  const sp: Speaker = { kind: 'pet', key: 'Dragon-Red', name: 'Ember' };
  for (const mode of ['full', 'relaxed'] as const) {
    const ctx = ctxOf(sp, { mode, crit: true });
    const n = candidates(ctx).length;
    const window = Math.floor(n * RECENT_SHARE);
    const recent: string[] = [];
    let repeat = '';
    const kinds: Record<string, number> = {};
    let crits = 0;
    for (let i = 0; i < 3000; i++) {
      const s = pickSaying(ctx, recent, rand);
      if (!repeat && recent.slice(-window).includes(s.id)) repeat = `${i}: ${s.text}`;
      if (/crit/i.test(s.text)) crits++;
      kinds[s.kind] = (kinds[s.kind] ?? 0) + 1;
      recent.push(s.id);
      if (recent.length > window) recent.shift();
    }
    check(`pick ${mode}: nothing again until ${window} of ${n} others have been said`, !repeat, repeat);
    if (mode === 'relaxed') check('pick relaxed: no crit, even with one coming', crits === 0, String(crits));
    else check('pick full: crit lines come up', crits > 0);
    // in step 4's shares, give or take what step 2 holds back (the moment lines are only the coming crit here)
    check(`pick ${mode}: every kind gets its turn`, (Object.keys(KIND_SHARE) as SayingKind[]).every(k => (kinds[k] ?? 0) > 3000 * KIND_SHARE[k] * 0.4), JSON.stringify(kinds));
  }
  // a moment line comes up about half the time while it's free
  let feast = 0;
  const recent: string[] = [];
  for (let i = 0; i < 400; i++) {
    const s = pickSaying(ctxOf(sp, { feasts: ['piDay'] }), recent.slice(-1), rand);
    if (/Pi Day|3\.14/.test(s.text)) feast++;
    recent.push(s.id);
  }
  check('pick: a feast line about half the time', feast > 120 && feast < 280, String(feast));
  // with every line just said, still something other than the last one
  const ctx = ctxOf({ kind: 'avatar', name: 'V' });
  const ids = candidates(ctx).map(c => c.l.id);
  const s = pickSaying(ctx, ids, rand);
  check('pick: everything said lately still says something new', s.id !== ids[ids.length - 1] && !!s.text);
  check('pick: the same dice, the same line', pickSaying(ctx, [], () => 0.3).id === pickSaying(ctx, [], () => 0.3).id);
}

// ---------------------------------------------------------------- the facts, in Habitica's code
{
  check('facts: Habitica’s source is at hand', !!src('common/script/ops/feed.js'), HABITICA);

  // feeding (ops/feed.js)
  const feed = (u: any, pet: string, food: string) => H.feed(u, { params: { pet, food }, language: 'en' });
  let u = stable({ 'Wolf-Base': 5 }, { Meat: 2, Milk: 2 });
  feed(u, 'Wolf-Base', 'Meat'); const liked = u.items.pets['Wolf-Base'] - 5;
  feed(u, 'Wolf-Base', 'Milk'); const other = u.items.pets['Wolf-Base'] - 5 - liked;
  check('facts: liked food counts 5, any other 2', liked === 5 && other === 2 && says(/counts 5 toward growing up; any other food counts 2/), `${liked} ${other}`);
  u = stable({ 'Fox-Shimmer': 5 }, { Milk: 1 });
  feed(u, 'Fox-Shimmer', 'Milk');
  check('facts: magic potion pets like every food', u.items.pets['Fox-Shimmer'] === 10);
  u = stable({ 'Wolf-Base': 45 }, { Meat: 1 }); u.items.currentPet = 'Wolf-Base';
  feed(u, 'Wolf-Base', 'Meat');
  check('facts: at 50 a mount, and Habitica takes the pet off the avatar', u.items.mounts['Wolf-Base'] === true && u.items.pets['Wolf-Base'] === -1 && u.items.currentPet === '');
  u = stable({ 'Wolf-Red': 5 }, { Saddle: 1 }); feed(u, 'Wolf-Red', 'Saddle');
  check('facts: a Saddle raises a pet at once', u.items.mounts['Wolf-Red'] === true && t('foodSaddleText') === 'Saddle');
  check('facts: special and wacky pets can’t eat', throws(() => feed(stable({ 'Wolf-Veteran': 5 }, { Meat: 1 }), 'Wolf-Veteran', 'Meat')) && throws(() => feed(stable({ 'Cactus-Veggie': 5 }, { Meat: 1 }), 'Cactus-Veggie', 'Meat')));
  check('facts: wacky pets have no mounts', !('Cactus-Veggie' in H.content.mountInfo) && 'Cactus-Base' in H.content.mountInfo);
  check('facts: each drop potion’s favourite food', Object.keys(H.content.dropHatchingPotions).every(p => {
    const sp = speakerInfo({ kind: 'pet', key: `Wolf-${p}`, name: 'x' });
    const k = Object.keys(H.content.food).find(f => H.content.food[f].text('en') === sp.food);
    return !!k && H.content.food[k].target === p;
  }));

  // hatching (ops/hatch.js)
  const hatch = (u: any, egg: string, hatchingPotion: string) => H.hatch(u, { params: { egg, hatchingPotion }, language: 'en' });
  u = stable({ 'Wolf-Base': -1 }, {}); u.items.mounts = { 'Wolf-Base': true }; u.items.eggs = { Wolf: 1 }; u.items.hatchingPotions = { Base: 1 };
  check('facts: a raised pet hatches again', !throws(() => hatch(u, 'Wolf', 'Base')) && u.items.pets['Wolf-Base'] === 5);
  u = stable({}, {}); u.items.eggs = { Gryphon: 1 }; u.items.hatchingPotions = { Shimmer: 1 };
  check('facts: magic potions don’t work on quest eggs', throws(() => hatch(u, 'Gryphon', 'Shimmer')) && /cannot be used on eggs received from Quests.*not from random drops/.test(t('premiumPotionNoDropExplanation')));
  check('facts: nine eggs and ten potions drop, 90 pets', Object.keys(H.content.dropEggs).length === 9 && Object.keys(H.content.dropHatchingPotions).length === 10 && /all 90 pets/.test(t('beastMasterText')) && /all 90 mounts/.test(t('mountMasterText')) && t('beastMasterName') === 'Beast Master' && t('mountMasterName') === 'Mount Master');
  check('facts: Triad Bingo in Habitica’s words', /all 90 pets, all 90 mounts, and found all 90 pets AGAIN \(HOW DID YOU DO THAT!\)/.test(t('triadBingoText')) && t('triadBingoName') === 'Triad Bingo');

  // item drops (fns/randomDrop.js)
  const drop = src('common/script/fns/randomDrop.js');
  check('facts: the drop limit, 5 plus 1 for 25 Perception, twice for subscribers', drop.includes('dropMultiplier * (5 + Math.floor(statsComputed(user).per / 25)') && drop.includes('dropMultiplier = 2;'));
  check('facts: food 4 in 10, eggs 3, potions 3', /rarity > 0\.6\) \{ \/\/ food/.test(drop) && /rarity > 0\.3\) \{ \/\/ eggs/.test(drop));
  check('facts: Golden, 1 drop in 50', /rarity < 0\.02\) \{[^}]*\n\s*acceptableDrops = \['Golden'\];/.test(drop));
  check('facts: harder tasks, new players, streaks and crits make drops likelier', drop.includes('chance *= task.priority') && drop.includes('Math.max(0, 80 - (5 * user.stats.lvl))') && drop.includes('(1 + (task.streak / 100 || 0))') && drop.includes('(user._tmp.crit || 1)'));
  check('facts: new players’ boost gone by level 16', 80 - 5 * 16 === 0 && 80 - 5 * 15 > 0);

  // HP, death, levels
  u = { stats: { hp: 30, gp: 100 }, items: {}, markModified () {}, preferences: {}, _tmp: {} };
  H.buy(u, { params: { key: 'potion' }, type: 'potion', language: 'en' });
  const hp1 = u.stats.hp, gp1 = u.stats.gp; u.stats.hp = 45; H.buy(u, { params: { key: 'potion' }, type: 'potion', language: 'en' });
  check('facts: a Health Potion, 25 Gold for 15 HP, up to 50', hp1 === 45 && gp1 === 75 && u.stats.hp === 50 && t('potionText') === 'Health Potion', `${hp1} ${gp1} ${u.stats.hp}`);
  const lvlUser = (lvl: number, exp: number): any => ({
    stats: { hp: 10, gp: 0, exp, lvl, points: 0, str: 0, con: 0, int: 0, per: 0, class: 'warrior', buffs: {} },
    preferences: { automaticAllocation: false }, flags: { levelDrops: {}, customizationsNotification: true, itemsEnabled: true }, items: { quests: {} },
    achievements: {}, _tmp: {}, markModified () {}, addNotification () {},
  });
  const need = [25, 50, 75, 100, 150];
  check('facts: XP for levels 1 to 5', need.every((x, i) => {
    const below = lvlUser(i + 1, 0); H.updateStats(below, { hp: 10, gp: 0, exp: x - 1 });
    const at = lvlUser(i + 1, 0); H.updateStats(at, { hp: 10, gp: 0, exp: x });
    return below.stats.lvl === i + 1 && at.stats.lvl === i + 2;
  }));
  u = lvlUser(14, 0); H.updateStats(u, { hp: 10, gp: 0, exp: 1000 });
  check('facts: a level-up fills HP to 50, and level 15 brings Attack of the Mundane', u.stats.hp === 50 && u.items.quests.atom1 === 1 && /^Attack of the Mundane/.test(t('questAtom1Text')));
  const ud = src('common/script/fns/updateStats.js');
  check('facts: more quest scrolls at 30, 40 and 60', /vice1: 30,\s*atom1: 15,\s*moonstone1: 60,\s*goldenknight1: 40,/.test(ud));
  const consts = src('common/script/constants.js');
  check('facts: stat points stop at 100, levels at 9999', consts.includes('MAX_LEVEL = 100;') && consts.includes('MAX_STAT_POINTS = MAX_LEVEL;') && consts.includes('MAX_LEVEL_HARD_CAP = 9999;'));
  u = { stats: { hp: 0, gp: 120, exp: 40, lvl: 6, str: 3, con: 0, int: 0, per: 0, class: 'warrior', points: 0, buffs: {}, training: {} }, items: { gear: { owned: {}, equipped: {} } }, markModified () {}, _tmp: {} };
  H.revive(u, { language: 'en' });
  check('facts: at 0 HP a level, the Gold and XP and a stat point go, then 50 HP', u.stats.lvl === 5 && u.stats.gp === 0 && u.stats.exp === 0 && u.stats.str === 2 && u.stats.hp === 50);
  check('facts: revive takes a piece of gear when it can', src('common/script/ops/revive.js').includes('losableItems'));

  // skills (content/spells.js)
  const S = H.spells;
  const skills = ['wizard', 'warrior', 'rogue', 'healer'].flatMap(c => Object.values(S[c]) as any[]);
  check('facts: sixteen class skills, one a level from 11 to 14', skills.length === 16 && ['wizard', 'warrior', 'rogue', 'healer'].every(c => Object.values(S[c]).map((s: any) => s.lvl).sort().join() === '11,12,13,14'));
  const mana = skills.map(s => s.mana);
  check('facts: Stealth is the priciest at 45, the cheapest are 10', S.rogue.stealth.mana === 45 && Math.max(...mana) === 45 && Math.min(...mana) === 10 && skills.filter(s => s.mana === 10).map(s => s.text('en')).sort().join() === 'Brutal Smash,Burst of Flames,Pickpocket');
  const caster = (cls: string): any => ({ stats: { str: 5, con: 5, int: 20, per: 5, lvl: 20, class: cls, buffs: { str: 0, con: 0, int: 0, per: 0 } }, items: { gear: { equipped: {} } } });
  const data: any = { query: {}, update: {} }; S.wizard.mpheal.cast(caster('wizard'), data);
  check('facts: Ethereal Surge skips other Mages', data.query['stats.class']?.$ne === 'wizard' && data.update.$inc['stats.mp'] > 0 && S.wizard.mpheal.text('en') === 'Ethereal Surge');
  check('facts: skill names in Habitica’s words', [S.wizard.frost, S.rogue.stealth, S.healer.brightness, S.rogue.backStab, S.wizard.fireball, S.warrior.smash].map((s: any) => s.text('en')).join() === 'Chilling Frost,Stealth,Searing Brightness,Backstab,Burst of Flames,Brutal Smash' && t('wizard') === 'Mage');
  const tasks = [{ type: 'daily', value: 0 }, { type: 'reward', value: 0 }];
  S.healer.brightness.cast(caster('healer'), tasks);
  check('facts: Searing Brightness turns tasks bluer', tasks[0].value > 0 && tasks[1].value === 0);
  const spells = src('common/script/content/spells.js');
  check('facts: Backstab 30%, Burst of Flames on PER, Brutal Smash on CON', spells.includes("crit.crit(user, 'str', 0.3)") && spells.includes("crit.crit(user, 'per')") && spells.includes("crit.crit(user, 'con')"));

  // the day change (server/libs/cron.js) and scoring (ops/scoreTask.js)
  const cron = src('server/libs/cron.js');
  check('facts: Perfect Day, half the level up to 50 on every stat', cron.includes('const lvlDiv2 = Math.ceil(common.capByLevel(user.stats.lvl) / 2);') && /str: lvlDiv2,\s*int: lvlDiv2,\s*per: lvlDiv2,\s*con: lvlDiv2,/.test(cron) && consts.includes('MAX_LEVEL = 100;'));
  check('facts: days away count as one', cron.includes('const multiDaysCountAsOneDay = true;') && cron.includes('if (multiDaysCountAsOneDay) break;'));
  check('facts: only due Dailies hurt', cron.includes('if (shouldDo(thatDay.toDate(), task, user.preferences)) {'));
  check('facts: MP at the day change', cron.includes('user.stats.mp += (Math.max(10, 0.1 * maxMP) * dailyChecked) / (dailyDueUnchecked + dailyChecked);'));
  check('facts: undone To-Dos get redder', /make uncompleted To Do's redder[\s\S]{0,400}direction: 'down',/.test(cron));
  check('facts: paused damage: no hurt, no streak reset, boss damage waits', /if \(!user\.preferences\.sleep\) \{\s*const delta = scoreTask\(/.test(cron) && /if \(!user\.preferences\.sleep\) \{[\s\S]{0,600}progress\.down = 0;\s*progress\.up = 0;\s*progress\.collectedItems = 0;/.test(cron) && t('pauseDailies') === 'Pause Damage' && /won't damage you/.test(t('sleepBullet1')) && /streaks .* will not reset/.test(t('sleepBullet2')) && /remain pending/.test(t('sleepBullet3')));
  check('facts: Stealth dodges missed Dailies', cron.includes('user.stats.buffs.stealth -= 1;'));
  check('facts: check-ins', cron.includes('user.loginIncentives += 1;') && t('checkInRewards') === 'Check-In Rewards');
  // the next Check-In Reward from every count up to the last, against content/loginIncentives.js (nextRewardAt), worded
  // as cron.js's notification words it (the reward's name, a potion in the 'potion' string, rewardName over both)
  {
    const li = H.content.loginIncentives as Record<number, any>;
    const said = (r: any): string => {
      if (r.rewardName) return t(r.rewardName);
      let w = '';
      r.reward.forEach((x: any, i: number) => {
        if (x.text) { w += x.text('en'); if (x.key === 'RoyalPurple') w = H.i18n.t('potion', { potionType: w }, 'en'); }
        else if (r.rewardKey[0] === 'background_blue') w = t('incentiveBackgrounds');
        if (i < r.reward.length - 1) w += ', ';
      });
      return w;
    };
    const max = Number(/MAX_INCENTIVES = (\d+);/.exec(consts)?.[1]);
    const bad: string[] = [];
    for (let n = 0; n <= max + 1; n++) {
      const at = li[n]?.nextRewardAt;
      const want = at ? `${at - n} ${said(li[at])}` : 'none';
      const w = accountWords(ctxOf({ kind: 'avatar', name: 'You' }, { user: { loginIncentives: n } }));
      const got = w.checkinReward ? `${w.checkinsLeft ?? (w.checkinRewardNext ? '1' : '?')} ${w.checkinReward}` : 'none';
      if (got !== want && !(at && at - n === 1 && got === `1 ${said(li[at])}`)) bad.push(`${n}: ${got} vs ${want}`);
    }
    check('facts: the next Check-In Reward from every count, in Habitica’s words', max === 500 && !bad.length, bad.slice(0, 3).join('; '));
    check('facts: the Check-In Reward words follow cron.js', cron.includes("notificationData.rewardText = i18n.t('potion', { potionType: notificationData.rewardText }, user.preferences.language);") && cron.includes('notificationData.rewardText = i18n.t(loginIncentive.rewardName, user.preferences.language);'));
  }
  check('facts: Custom Day Start', t('customDayStart') === 'Custom Day Start');
  const score = src('common/script/ops/scoreTask.js');
  check('facts: red tasks give more', score.includes("let nextDelta = (0.9747 ** currVal) * (direction === 'down' ? -1 : 1);"));
  check('facts: a Streak Achievement every 21 days', score.includes('if (task.streak !== 0 && task.streak % 21 === 0) {') && score.includes('user.achievements.streak = user.achievements.streak ? user.achievements.streak + 1 : 1;'));
  check('facts: a streak adds 1% Gold, at least 1', score.includes('const streakBonus = currStreak / 100 + 1;') && score.includes('// min streak bonus of +1'));
  check('facts: Perception adds 2% Gold a point', score.includes('const perBonus = 1 + statsComputed(user).per * 0.02;') && score.includes('const gpMod = delta * task.priority * _crit * perBonus;'));
  check('facts: Chilling Frost keeps your own streaks', score.includes('if (!user.stats.buffs.streaks || task.challenge.id || task.group.id) task.streak = 0;'));
  const schema = src('server/models/user/schema.js');
  check('facts: one pet and one mount out', schema.includes('currentPet:') && schema.includes('currentMount:'));

  // the rules added on 17 Oct
  check('facts: Habit counters reset daily, weekly or monthly', /task\.frequency === 'daily'[\s\S]{0,200}task\.frequency === 'weekly' && resetWeekly === true[\s\S]{0,200}task\.frequency === 'monthly' && resetMonthly === true/.test(cron) && /counterUp = 0;\s*task\.counterDown = 0;/.test(cron));
  check('facts: one-way Habits drift halfway back each day change', cron.includes('if (task.up === false || task.down === false) {') && cron.includes('task.value = Math.abs(task.value) < 0.1 ? 0 : task.value /= 2;'));
  check('facts: a missed Daily’s ticked checklist share cuts its damage', /direction === 'down' && task\.type === 'daily' && cron\) \{\s*nextDelta \*= 1 - reduce\(/.test(score));
  const taskModel = src('server/models/task.js');
  check('facts: difficulties 0.1, 1, 1.5, 2 in Habitica’s words', taskModel.includes('Valid priority values are 0.1, 1, 1.5, 2.') && score.includes('task.priority * _crit * 6') && ['trivial', 'easy', 'medium', 'hard'].map(t).join() === 'Trivial,Easy,Medium,Hard');
  check('facts: Dailies repeat daily, weekly, monthly or yearly', taskModel.includes("enum: ['daily', 'weekly', 'monthly', 'yearly']"));
  const eggQuests = Object.values(H.content.quests as Record<string, any>).map(q => (q.drop?.items || []).filter((i: any) => i.type === 'eggs').length).filter(n => n > 0);
  check('facts: nearly every pet quest gives 3 eggs', eggQuests.filter(n => n === 3).length >= eggQuests.length - 2 && eggQuests.length > 50, JSON.stringify(eggQuests.filter(n => n !== 3)));
  check('facts: boss Rage fills from missed Dailies', src('server/models/group.js').includes('group.quest.progress.rage += Math.abs(down);') && Object.values(H.content.quests as Record<string, any>).some(q => q.boss?.rage) && t('rage') === 'Rage');
  const free = src('common/script/libs/isFreeRebirth.js');
  check('facts: the Orb of Rebirth free from 100 every 45 days, else 6 Gems', free.includes('user.stats.lvl >= MAX_LEVEL && daysFromLastFreeRebirth >= 45') && src('common/script/libs/getItemInfo.js').includes('value: isFreeRebirth(user) ? 0 : 6,') && t('rebirthName') === 'Orb of Rebirth');
  check('facts: CON cuts HP lost, a tenth per 25, down to a tenth', score.includes('let conBonus = 1 - statsComputed(user).con / 250;') && score.includes('if (conBonus < 0.1) conBonus = 0.1;') && Math.abs(1 - 225 / 250 - 0.1) < 1e-9);
  check('facts: INT adds 2.5% XP a point', score.includes('const intBonus = 1 + statsComputed(user).int * 0.025;'));
  const sc = src('common/script/libs/statsComputed.js');
  check('facts: most MP 30 + 2 per INT, class gear counts twice', sc.includes('statBreakdown.maxMP = statBreakdown.int * 2 + 30;') && sc.includes('gearBonus += equipmentStat;') && sc.includes('classBonus += equipmentStat * classBonusMultiplier;') && /item\.klass === user\.stats\.class\s*\|\| item\.specialClass === user\.stats\.class \? 1 : 0/.test(sc));
  check('facts: STR adds half a percent of boss damage; Habits half as hard', score.includes('nextDelta * _crit * (1 + statsComputed(user).str / 200)') && score.includes('nextDelta * _crit * (0.5 + statsComputed(user).str / 400)'));
  check('facts: Automatic Allocation in Habitica’s words', t('autoAllocation') === 'Automatic Allocation' && t('evenAllocation') === 'Distribute evenly' && t('classAllocation') === 'Distribute based on class' && t('taskAllocation') === 'Distribute based on task activity');
  const gems = src('common/script/libs/planGemLimits.js');
  check('facts: Gems for Gold, 20 each, 24 a month and more for long subscribers', gems.includes('convRate: 20,') && gems.includes('convCap: 24,') && src('common/script/ops/buy/buyGem.js').includes('convCap += user.purchased.plan.consecutive.gemCapExtra;'));
  check('facts: the day change adds no HP', !/stats\.hp\s*\+=/.test(cron) && !/stats\.hp\s*=/.test(cron));
  const rv = src('common/script/ops/revive.js');
  check('facts: running out of HP leaves pets, mounts and quests', !/items\.(pets|mounts|quests)/.test(rv) && !/party/.test(rv));
  check('facts: collection finds wait for the day change', /_progress = progress\.toObject\(\);[\s\S]{0,100}progress\.collectedItems = 0;/.test(cron));
  check('facts: Start My New Day!', t('yesterDailiesCallToAction') === 'Start My New Day!');
  check('facts: Habitica’s words to a mount’s feeder and a picky pet', t('messageAlreadyMount') === 'You already have that mount. Try feeding another pet.' && /but doesn't seem to enjoy it\.$/.test(t('messageDontEnjoyFood')));

  // crits (fns/crit.js, fns/predictableRandom.js)
  const crit = src('common/script/fns/crit.js');
  check('facts: crit chance 3% plus 3% per 100 STR, ×1.5 up toward ×5.5', crit.includes("function crit (user, stat = 'str', chance = 0.03)") && crit.includes('predictableRandom(user) <= chance * (1 + s / 100)') && crit.includes('return 1.5 + (4 * s) / (s + 200);'));
  const pr = src('common/script/fns/predictableRandom.js');
  check('facts: the dice are a sine of your stats', pr.includes('seed += 1;') && pr.includes('const x = Math.sin(seed) * 10000;') && pr.includes('return x - Math.floor(x);'));
}

if (failures) { console.log(`FAIL  sayings: ${failures} of ${checks} checks failed`); process.exit(1); }
console.log(`PASS  sayings: ${checks} checks (${lines.length} lines)`);
