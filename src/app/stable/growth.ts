/*
 * What the Stable grows (design spec §08), from numbers the app already reads: days checked in
 * (loginIncentives) plant the forest, Perfect Days (achievements.perfect) the flowers, the longest Daily
 * streak (the Dailies' own streak, or 21 days once there is a streak achievement) the water, the level the
 * stable, and different quests finished (achievements.quests) its plaques. Habitica's collection achievements
 * bring trophies, with a signpost where each will stand once the account is halfway (trophies.ts). Today's open
 * Dailies only soften the light. Nothing here asks Habitica for anything.
 *
 * Vlad, 15 Oct: more lenient and in smaller, visible steps. The whole playground grows in about 100 days of
 * checking in, 30 Perfect Days, a 21-day Daily streak and level 20 (it was 365 days, 90 Perfect Days, four
 * streak achievements and level 50), and each step is named when it lands.
 *
 * Growth never shrinks: the phone keeps the highest numbers it has shown (one record per Habitica account,
 * next to the playgrounds), so a death's lost level or a rebirth takes nothing away. The same record says
 * what has been announced: a stage reached since is named once, with a sparkle, when the Stable is on screen.
 * The first time the record is made, what has already grown is simply there, unannounced.
 *
 * Pure apart from storage: safe in the main bundle (the Stats card paints the grown scene too).
 */
import {
  GIANT_AT, MAX_PATCHES, MAX_TREES, NO_GROWTH, PATCH_EVERY, TREE_EVERY, TREE_GROWS, STABLE_STAGES, STREAK_ACHIEVEMENT_DAYS, WATER_AT,
  type Growth, type SceneId,
} from '../../playground/scenes';
import { TROPHY_KEYS } from '../../playground/scenes/trophies';
import { inOrder, progressAll, trophiesOf, trophyName, trophyProp, type Progress } from './trophies';

type Json = any;

/** where a stage grows; plaques hang on the stable. Trophies are apart: they don't count in "% grown" (most
 * accounts will never have most of them). */
export type Part = 'forest' | 'flowers' | 'water' | 'stable' | 'plaques' | 'trophies';
export const PARTS: Part[] = ['forest', 'flowers', 'water', 'stable', 'plaques'];

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/** the tasks the app has read, as far as growth needs them */
export interface StreakTask { type: string, streak?: number }

/** The longest Daily streak in days: the Dailies' own streaks, and a streak achievement means one reached 21. */
export function streakDaysOf (raw: Json, tasks: readonly StreakTask[] = []): number {
  let best = num(raw?.achievements?.streak) > 0 ? STREAK_ACHIEVEMENT_DAYS : 0;
  for (const t of tasks) if (t.type === 'daily') best = Math.max(best, num(t.streak));
  return best;
}

/** The growth numbers in a Habitica user object and its tasks (as the app reads them). */
export function growthOf (raw: Json, tasks: readonly StreakTask[] = []): Growth {
  if (!raw) return NO_GROWTH;
  const quests = raw.achievements?.quests;
  return {
    checkIns: num(raw.loginIncentives),
    perfectDays: num(raw.achievements?.perfect),
    streakDays: streakDaysOf(raw, tasks),
    level: Math.max(1, num(raw.stats?.lvl)),
    quests: quests && typeof quests === 'object' ? Object.values(quests).filter(n => num(n) > 0).length : 0,
    ...trophiesOf(raw),
  };
}

/** both lists of keys, in the trophies' order */
const union = (a: readonly string[] = [], b: readonly string[] = []) => inOrder([...a, ...b]);
const same = (a: readonly string[] = [], b: readonly string[] = []) => a.join() === b.join();

/** field by field, the bigger: what has grown stays grown */
export const atLeast = (a: Growth, b: Growth): Growth => ({
  checkIns: Math.max(a.checkIns, b.checkIns), perfectDays: Math.max(a.perfectDays, b.perfectDays),
  streakDays: Math.max(a.streakDays, b.streakDays), level: Math.max(a.level, b.level), quests: Math.max(a.quests, b.quests),
  ...grownTrophies(a, b),
});

/** trophies only arrive; a signpost stays until its trophy replaces it (a pet raised to a mount can lower a count) */
function grownTrophies (a: Growth, b: Growth): { trophies: string[], signs: string[] } {
  const trophies = union(a.trophies, b.trophies), has = new Set(trophies);
  return { trophies, signs: union(a.signs, b.signs).filter(k => !has.has(k)) };
}

export const sameGrowth = (a: Growth, b: Growth) =>
  a.checkIns === b.checkIns && a.perfectDays === b.perfectDays && a.streakDays === b.streakDays && a.level === b.level && a.quests === b.quests
  && same(a.trophies, b.trophies) && same(a.signs, b.signs);

/* ---- stages */

/** plaques the wall shows (house.ts), and the level its building (with the wall) arrives at */
export const MAX_PLAQUES = 6;
const BUILDING_AT = STABLE_STAGES[2], HALL_AT = STABLE_STAGES[4];
/** the day the last of the nine trees is fully grown */
const FOREST_GROWN = (MAX_TREES - 1) * TREE_EVERY + TREE_GROWS;

/** the scene's own building, flowers and their single */
const BUILDING: Record<SceneId, string> = {
  meadow: 'barn', lake: 'boathouse', pine: 'log cabin', cove: 'beach hut', bamboo: 'pagoda', marsh: 'stilt hut', mushroom: 'mushroom house',
};
const BLOOMS: Record<SceneId, [one: string, many: string]> = {
  meadow: ['patch of flowers', 'patches of flowers'], lake: ['patch of water lilies', 'patches of water lilies'],
  pine: ['patch of wildflowers', 'patches of wildflowers'], cove: ['handful of shells', 'handfuls of shells'],
  bamboo: ['patch of flowers', 'patches of flowers'], marsh: ['clump of cattails', 'clumps of cattails'],
  mushroom: ['ring of little mushrooms', 'rings of little mushrooms'],
};
export const buildingOf = (scene: SceneId) => BUILDING[scene];
export const bloomsOf = (scene: SceneId) => BLOOMS[scene];

/** One step a part grows by: reached at `at` of its number. `kind` groups steps that repeat (a tree, a patch). */
export interface Step { part: Part, at: number, kind: string, one: string, many?: string }

/** Every stage, in order, for one scene's words. */
export function stepsOf (scene: SceneId): Record<Part, Step[]> {
  const [bloom, blooms] = BLOOMS[scene];
  const forest: Step[] = [];
  // the first tree is planted on day 0; each grows to its full size over TREE_GROWS days
  for (let i = 1; i < MAX_TREES; i++) forest.push({ part: 'forest', at: i * TREE_EVERY, kind: 'tree', one: 'a new tree', many: 'new trees' });
  forest.push({ part: 'forest', at: TREE_GROWS, kind: 'old', one: 'the first tree fully grown' });
  forest.push({ part: 'forest', at: FOREST_GROWN, kind: 'grown', one: 'every tree fully grown' });
  forest.push({ part: 'forest', at: GIANT_AT, kind: 'giant', one: 'a giant tree' });
  forest.sort((a, b) => a.at - b.at);
  const flowers: Step[] = [];
  for (let i = 1; i <= MAX_PATCHES; i++) flowers.push({ part: 'flowers', at: i * PATCH_EVERY, kind: 'patch', one: `a ${bloom}`, many: blooms });
  const water: Step[] = [
    { part: 'water', at: WATER_AT[0], kind: 'stones', one: 'stepping stones' },
    { part: 'water', at: WATER_AT[1], kind: 'pond', one: 'a pond' },
    { part: 'water', at: WATER_AT[2], kind: 'bridge', one: 'a bridge over the pond' },
    { part: 'water', at: WATER_AT[3], kind: 'fall', one: 'a waterfall' },
  ];
  const stable: Step[] = [
    { part: 'stable', at: STABLE_STAGES[1], kind: 'shelter', one: 'a shelter' },
    { part: 'stable', at: STABLE_STAGES[2], kind: 'building', one: `the ${BUILDING[scene]}` },
    { part: 'stable', at: STABLE_STAGES[3], kind: 'banner', one: 'a banner on the stable' },
    { part: 'stable', at: STABLE_STAGES[4], kind: 'hall', one: 'the hall with lanterns' },
  ];
  const plaques: Step[] = [];
  for (let i = 1; i <= MAX_PLAQUES; i++) plaques.push({ part: 'plaques', at: i, kind: 'plaque', one: 'a quest plaque', many: 'quest plaques' });
  return { forest, flowers, water, stable, plaques, trophies: [] };
}

/** each part's number in a growth */
export function valueOf (g: Growth, part: Part): number {
  switch (part) {
    case 'forest': return g.checkIns;
    case 'flowers': return g.perfectDays;
    case 'water': return g.streakDays;
    case 'stable': return g.level;
    // the plaques hang on the building, which comes at level 10
    case 'plaques': return g.level >= BUILDING_AT ? g.quests : 0;
    case 'trophies': return g.trophies?.length ?? 0;
  }
}

/** The steps reached in `now` that `before` hadn't reached, all parts, in part order. */
export function newSteps (before: Growth, now: Growth, scene: SceneId): Step[] {
  const all = stepsOf(scene), out: Step[] = [];
  for (const p of PARTS) {
    const a = valueOf(before, p), b = valueOf(now, p);
    for (const s of all[p]) if (s.at > a && s.at <= b) out.push(s);
  }
  // a new trophy names itself and its achievement; a new signpost the achievement it waits for
  const had = new Set(before.trophies ?? []), signed = new Set([...had, ...(before.signs ?? [])]);
  for (const k of now.trophies ?? []) if (!had.has(k)) out.push({ part: 'trophies', at: 0, kind: `t:${k}`, one: `${trophyProp(k)} for ${trophyName(k)[0]}` });
  for (const k of now.signs ?? []) if (!signed.has(k)) out.push({ part: 'trophies', at: 0, kind: `s:${k}`, one: `a signpost: ${trophyName(k)[0]} is halfway` });
  return out;
}

/** "a new tree", "3 new trees and a giant tree": what grew, the newest first within each kind. */
export function namesOf (steps: Step[]): string[] {
  const by = new Map<string, Step[]>();
  for (const s of steps) {
    const k = `${s.part}:${s.kind}`;
    by.set(k, [...(by.get(k) ?? []), s]);
  }
  return [...by.values()].map(ss => (ss.length > 1 && ss[0].many ? `${ss.length} ${ss[0].many}` : ss[ss.length - 1].one));
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** The snackbar for what grew, or '' when nothing did. */
export function announcement (steps: Step[]): string {
  const names = namesOf(steps);
  if (!names.length) return '';
  const forestOnly = steps.every(s => s.part === 'forest');
  return `Your ${forestOnly ? 'forest' : 'playground'} grew: ${list(names)}.`;
}

/* ---- the "What grows here" sheet */

/** How far each part has grown, 0 to 1: its number against the number that completes it. */
export function progressOf (g: Growth, part: Part): number {
  const done: Record<Part, number> = {
    forest: GIANT_AT, flowers: MAX_PATCHES * PATCH_EVERY, water: WATER_AT[WATER_AT.length - 1], stable: HALL_AT, plaques: MAX_PLAQUES,
    trophies: TROPHY_KEYS.length,
  };
  // the stable starts at level 1, with its fence
  const v = part === 'stable' ? valueOf(g, part) - 1 : valueOf(g, part), all = part === 'stable' ? done.stable - 1 : done[part];
  return Math.max(0, Math.min(1, v / all));
}

/** the whole playground, in percent: each part counts the same */
export const grownPercent = (g: Growth) => Math.floor((100 * PARTS.reduce((t, p) => t + progressOf(g, p), 0)) / PARTS.length);

export interface GrowthRow { part: Part | 'light', icon: string, title: string, now: string, next: string, progress?: number }

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * One row per number: where the account is, the next stage and how far that part has grown. `open`: today's
 * Dailies still to do (undefined before the first read of tasks); `winter`: the flowers are under the snow.
 */
export function growthRows (g: Growth, scene: SceneId, open: number | undefined, o: { winter?: boolean, progress?: Progress[] } = {}): GrowthRow[] {
  const S = stepsOf(scene), next = (p: Part) => S[p].find(s => s.at > valueOf(g, p));
  const days = g.checkIns, trees = Math.min(MAX_TREES, 1 + Math.floor(days / TREE_EVERY));
  let young = 0;
  for (let i = 0; i < trees; i++) if (days - i * TREE_EVERY < TREE_GROWS) young++;
  const nf = next('forest');
  const forest: GrowthRow = {
    part: 'forest', icon: 'forest', title: 'Forest', progress: progressOf(g, 'forest'),
    now: `${plural(days, 'day')} checked in: ${plural(trees, 'tree')}${days >= GIANT_AT ? ' and a giant tree' : ''}${young ? `, ${young === trees ? (trees === 1 ? 'still growing' : 'all still growing') : `${young} still growing`}` : ''}.`,
    next: nf ? `Next: ${nf.one} at ${nf.at} days, ${nf.at - days} to go. Trees grow a little every day.` : 'The forest is complete.',
  };
  const patches = Math.min(MAX_PATCHES, Math.floor(g.perfectDays / PATCH_EVERY)), [bloom, blooms] = BLOOMS[scene];
  const nfl = next('flowers'), toGo = nfl ? nfl.at - g.perfectDays : 0;
  const flowers: GrowthRow = {
    part: 'flowers', icon: 'local_florist', title: cap(blooms.replace(/^(patches|handfuls|clumps|rings) of /, '')), progress: progressOf(g, 'flowers'),
    now: `${plural(g.perfectDays, 'Perfect Day')}: ${patches === 1 ? `1 ${bloom}` : `${patches} ${blooms}`}.${o.winter ? ' Under the snow until spring.' : ''}`,
    next: !nfl ? 'Every patch has grown.'
      : toGo === 1 ? `Next: ${nfl.one} with your next Perfect Day (all of a day’s Dailies done).`
        : `Next at ${nfl.at} Perfect Days, ${toGo} to go (all of a day’s Dailies done).`,
  };
  const water = S.water.filter(s => s.at <= g.streakDays).pop(), nw = next('water');
  const waterRow: GrowthRow = {
    part: 'water', icon: 'water_drop', title: 'Water', progress: progressOf(g, 'water'),
    now: `Longest Daily streak: ${plural(g.streakDays, 'day')}${water ? `: ${water.one}` : ''}.`,
    next: nw ? `Next: ${nw.one} once a Daily is done ${nw.at} days in a row.` : 'The water is complete.',
  };
  const lvl = g.level, st = [{ at: 1, one: 'a fence' }, ...S.stable].filter(s => s.at <= lvl).pop()!, ns = next('stable');
  const stable: GrowthRow = {
    part: 'stable', icon: 'cottage', title: 'Stable', progress: progressOf(g, 'stable'),
    now: `Level ${lvl}: ${st.one}${lvl >= HALL_AT ? ', the last stage' : ''}.`,
    next: ns ? `Next: ${ns.one} at level ${ns.at}.` : 'The stable is complete.',
  };
  const shown = Math.min(MAX_PLAQUES, g.quests);
  const plaques: GrowthRow = {
    part: 'plaques', icon: 'emoji_events', title: 'Quest plaques', progress: progressOf(g, 'plaques'),
    now: `${plural(g.quests, 'different quest')} finished${lvl >= BUILDING_AT ? `: ${plural(shown, 'plaque')} on the wall` : ''}.`,
    next: lvl < BUILDING_AT ? `They hang on the ${BUILDING[scene]}, from level ${BUILDING_AT}.`
      : shown < MAX_PLAQUES ? `One for each new quest, up to ${MAX_PLAQUES}.` : `The wall is full (${MAX_PLAQUES}).`,
  };
  const trophies = trophyRow(g, o.progress ?? []);
  const light: GrowthRow = {
    part: 'light', icon: 'wb_sunny', title: 'Today’s light',
    now: open === undefined ? 'Your Dailies haven’t been read yet.' : open ? `${plural(open, 'Daily', 'Dailies')} still open today: soft morning light.` : 'Today’s Dailies are done: full sun.',
    next: open ? 'Full sun once they’re done. It starts soft again each day; the clock brings dusk and night.' : 'It starts soft again each day; the clock brings dusk and night.',
  };
  return [forest, flowers, waterRow, stable, plaques, trophies, light];
}

/** How many trophies, and the nearest one still to come with Habitica's own count towards it. */
function trophyRow (g: Growth, progress: Progress[]): GrowthRow {
  const n = g.trophies?.length ?? 0, signs = g.signs?.length ?? 0, has = new Set(g.trophies ?? []);
  const near = progress.filter(p => !has.has(p.key) && p.need > 0).sort((a, b) => b.have / b.need - a.have / a.need)[0];
  const signed = near && (g.signs ?? []).includes(near.key);
  return {
    part: 'trophies', icon: 'military_tech', title: 'Trophies', progress: progressOf(g, 'trophies'),
    now: `${n} of ${TROPHY_KEYS.length} of Habitica’s collection achievements${signs ? `, ${signs} more halfway (a signpost each)` : ''}.`,
    next: !near ? (n ? 'Every trophy is here.' : 'Habitica’s collection achievements bring trophies; the first is a pennant for all 9 pets of one colour.')
      : `Next: ${trophyName(near.key)[0]}, ${near.have} of ${near.need} ${near.what}${signed ? '. Its signpost is up.' : near.have * 2 >= near.need ? '.' : `. A signpost goes up at ${Math.ceil(near.need / 2)}.`}`,
  };
}

/** the account's progress to every trophy, for the "What grows here" sheet */
export const trophyProgress = (raw: Json): Progress[] => (raw ? progressAll(raw) : []);

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** today's Dailies still to do, from the tasks already read */
export function openDailies (tasks: { type: string, isDue: boolean, completed?: boolean }[]): number {
  return tasks.filter(t => t.type === 'daily' && t.isDue && !t.completed).length;
}

/* ---- the record */

const KEY = 'critoracle:v2:growth';

function readAll (): Record<string, Json> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** The growth this phone has shown for an account (undefined: never yet). */
export function loadGrown (userId: string | undefined): Growth | undefined {
  return normalizeGrown(userId ? readAll()[userId] : undefined);
}

/** A stored record, checked field by field (an old one, or one from a backup file). */
export function normalizeGrown (v: Json): Growth | undefined {
  if (!v || typeof v !== 'object') return undefined;
  // a record from before 15 Oct counted streak achievements (`streaks`): any one of them is a 21-day streak
  const streakDays = Math.max(num(v.streakDays), num(v.streaks) > 0 ? STREAK_ACHIEVEMENT_DAYS : 0);
  const keys = (x: unknown) => inOrder(Array.isArray(x) ? x.filter((k): k is string => typeof k === 'string') : []);
  const trophies = keys(v.trophies), has = new Set(trophies);
  return {
    checkIns: num(v.checkIns), perfectDays: num(v.perfectDays), streakDays, level: Math.max(1, num(v.level)), quests: num(v.quests),
    trophies, signs: keys(v.signs).filter(k => !has.has(k)),
  };
}

export function saveGrown (userId: string | undefined, g: Growth) {
  if (!userId) return;
  const all = readAll();
  all[userId] = g;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode or full */ }
}

/** What to paint for an account: its numbers now, never below what this phone has already shown. */
export function grownFor (userId: string | undefined, raw: Json, tasks: readonly StreakTask[] = []): Growth {
  const shown = loadGrown(userId), now = growthOf(raw, tasks);
  return shown ? atLeast(shown, now) : now;
}
