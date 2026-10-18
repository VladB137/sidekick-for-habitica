/*
 * The talking character's lines when tapped (Vlad, 2026-10-17): which of src/app/sayings-lines.ts fits the speaker
 * and the moment, and which one it says now. The tap, the typing and the bubble are the caller's; it keeps the ids
 * said lately (`recent`, newest last) and passes them back, so a line doesn't come round again soon.
 *
 * How a line is picked:
 *   1. Only lines that fit: the mode (Relaxed never hears about crits), the speaker (avatar, pet or mount, its
 *      species and potion), the hour, a feast day, the connection, the Inn, the class and level, and whose words can
 *      all be filled in.
 *   2. Never the line just said, and none of the most recent three quarters of what fits.
 *   3. A line about this very moment (a feast day, no connection, resting in the Inn, a coming crit) half the time.
 *   4. Otherwise a kind first, in fixed shares (facts 30%, funny 25%, the rest 15% each), so a big group of jokes
 *      doesn't drown the facts; then within it, lines written for this speaker or hour count three times.
 * Pure: the caller gives the clock and, in tests, the dice.
 */
import itemsJson from '../data/items.json';
import { toNextLevel } from '../engine';
import { nextCheckIn } from './checkins';
import type { Json } from '../api/client';
import { GROUPS, type ClassKey, type Fit, type SayingKind } from './sayings-lines';
import type { Feast } from '../playground/scenes/feasts';
import type { Speaker } from './ui/speaker';

export type { ClassKey, SayingKind, SpeakerKind } from './sayings-lines';

/** who is talking: ui/speaker.ts's Speaker (the avatar, or a pet or mount by its Habitica key and its name) */
export type { Speaker } from './ui/speaker';
export interface SayingContext {
  mode: 'full' | 'relaxed'
  conn: 'live' | 'checking' | 'offline'
  /** the next task crits (read in Full only) */
  crit: boolean
  speaker: Speaker
  now: Date
  /** today's feasts, from src/app/stable/calendar.ts today(raw).feasts */
  feasts?: readonly Feast[]
  /** the player's class, once chosen */
  cls?: ClassKey
  lvl?: number
  /** damage paused (resting in the Inn) */
  resting?: boolean
  /** the last GET /user (store.raw), for the lines about the player's own numbers; they're left out without it */
  user?: Json
  /** the last tasks read (store.tasks): Dailies' streaks */
  tasks?: readonly { type: string, streak?: number }[]
}
export interface Said {
  id: string
  kind: SayingKind
  /** plain text: show it as text */
  text: string
  /** indices into text where the typing waits a beat (one index per beat; a repeated index is a longer wait) */
  beats: number[]
}
export interface Line extends Fit { id: string, say: string }

/** the longest a filled-in line may be */
export const MAX_CHARS = 140;
/** how much of what fits must be said before a line comes round again */
export const RECENT_SHARE = 0.75;
export const MOMENT_CHANCE = 0.5;
export const KIND_SHARE: Readonly<Record<SayingKind, number>> = { info: 0.3, funny: 0.25, witty: 0.15, whimsical: 0.15, nonsense: 0.15 };
const SPECIFIC_WEIGHT = 3;
const CLASS_NAME: Readonly<Record<ClassKey, string>> = { warrior: 'Warrior', wizard: 'Mage', healer: 'Healer', rogue: 'Rogue' };

const items = itemsJson as unknown as {
  eggs: Record<string, [string, number, string, string?]>
  hatchingPotions: Record<string, [string, number, 'drop' | 'premium' | 'wacky']>
  food: Record<string, [string, number, string?]>
  specialPets: Record<string, string>
  specialMounts: Record<string, unknown>
};

/** a short stable id from the words, so a reworded line counts as a new one */
function hash (s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

const DROP_EGGS = Object.keys(items.eggs).filter(k => items.eggs[k][2] === 'drop');
const DROP_POTIONS = Object.keys(items.hatchingPotions).filter(k => items.hatchingPotions[k][2] === 'drop');
/** a count worth saying: from 2 up, so no line says "1 Perfect Days" */
const count = (n: unknown): string | undefined => (typeof n === 'number' && isFinite(n) && n >= 2 ? String(Math.floor(n)) : undefined);
const DAY_MS = 864e5;

/** The player's own numbers as words for the lines (each undefined when the read lacks it or it's under 2). */
export function accountWords (ctx: SayingContext): Record<string, string | undefined> {
  const u = ctx.user, w: Record<string, string | undefined> = {};
  if (u) {
    const a = u.achievements || {}, pets = u.items?.pets || {}, mounts = u.items?.mounts || {}, st = u.stats || {};
    w.perfect = count(a.perfect);
    w.streakAch = count(a.streak);
    w.streakDays = w.streakAch && String(21 * Number(w.streakAch));
    w.rebirths = count(a.rebirths);
    let won = 0;
    for (const k in a.quests || {}) won += Number(a.quests[k]) || 0;
    w.questsWon = count(won);
    let basic = 0, basicM = 0, all = 0, allM = 0;
    for (const e of DROP_EGGS) for (const p of DROP_POTIONS) { if (pets[`${e}-${p}`] > 0) basic++; if (mounts[`${e}-${p}`]) basicM++; }
    for (const k in pets) if (pets[k] > 0) all++;
    for (const k in mounts) if (mounts[k]) allM++;
    w.basicPets = count(basic);
    w.basicLeft = count(90 - basic);
    w.basicMounts = count(basicM);
    w.petCount = count(all);
    w.mountCount = count(allM);
    w.checkins = count(u.loginIncentives);
    const next = nextCheckIn(u.loginIncentives);
    w.checkinsLeft = next ? count(next.left) : undefined;
    w.checkinReward = next?.reward;
    w.checkinRewardNext = next?.left === 1 ? next.reward : undefined;
    const created = Date.parse(u.auth?.timestamps?.created);
    w.daysIn = isFinite(created) ? count((ctx.now.getTime() - created) / DAY_MS) : undefined;
    w.gold = count(st.gp);
    if (typeof st.lvl === 'number' && typeof st.exp === 'number' && st.lvl >= 1) {
      w.xpToNext = count(toNextLevel(st.lvl) - Math.floor(st.exp));
      w.nextLvl = w.xpToNext && String(st.lvl + 1);
    }
    const sp = ctx.speaker;
    const g = sp.kind === 'pet' && sp.key ? pets[sp.key] : undefined;
    if (typeof g === 'number' && g > 0 && g < 50) { w.growth = count(g); w.mealsLeft = count(Math.ceil((50 - g) / 5)); }
  }
  let best = 0;
  for (const t of ctx.tasks || []) if (t.type === 'daily' && (t.streak ?? 0) > best) best = t.streak ?? 0;
  w.bestStreak = count(best);
  w.toStreakAch = best > 0 ? count(21 - (best % 21)) : undefined;
  return w;
}

let built: Line[] | null = null;
/** every line, with its fit */
export function allLines (): readonly Line[] {
  if (built) return built;
  built = [];
  for (const [fit, ...says] of GROUPS) for (const say of says) built.push(Object.assign({}, fit, { id: fit.kind[0] + hash(say), say }));
  return built;
}

export interface SpeakerInfo {
  /** the egg key ('TigerCub'), the potion key ('Shade') */
  species?: string
  potion?: string
  /** Habitica's names: the animal as this speaker ('Tiger' for the mount), the pet it was ('Tiger Cub') */
  speciesName?: string
  young?: string
  potionName?: string
  potionKind?: 'drop' | 'premium' | 'wacky'
  /** the food its potion likes (drop-potion pets) */
  food?: string
  special: boolean
  feeds: boolean
}

export function speakerInfo (sp: Speaker): SpeakerInfo {
  if (sp.kind === 'avatar' || !sp.key) return { special: false, feeds: false };
  const cut = sp.key.indexOf('-');
  const species = cut < 0 ? sp.key : sp.key.slice(0, cut);
  const potion = cut < 0 ? undefined : sp.key.slice(cut + 1);
  const egg = items.eggs[species];
  const pot = potion ? items.hatchingPotions[potion] : undefined;
  const special = sp.key in (sp.kind === 'mount' ? items.specialMounts : items.specialPets);
  const potionKind = pot?.[2];
  let food: string | undefined;
  if (sp.kind === 'pet' && potionKind === 'drop') {
    for (const k in items.food) if (k.indexOf('_') < 0 && items.food[k][2] === potion) { food = items.food[k][0]; break; }
  }
  // special pets with no egg of their own (the Turkey, the Phoenix…) go by Habitica's name for them
  const own = items.specialPets[sp.key] as string | undefined;
  return {
    species, potion,
    speciesName: egg ? (sp.kind === 'mount' ? egg[3] ?? egg[0] : egg[0]) : own,
    young: egg ? egg[0] : own,
    potionName: pot?.[0],
    potionKind,
    food,
    special,
    feeds: sp.kind === 'pet' && !!egg && !special && potionKind !== 'wacky',
  };
}

const article = (w: string) => (/^([AEIO]|U(?!ni))/.test(w) ? 'an ' : 'a ') + w;

/** the line's words for this speaker, or null when one can't be filled in */
export function fill (say: string, ctx: SayingContext, info: SpeakerInfo, acct?: Record<string, string | undefined>): string | null {
  let missing = false;
  const out = say.replace(/\{([A-Za-z ]+)\}/g, (_, t: string) => {
    let v: string | undefined;
    switch (t) {
      case 'name': v = ctx.speaker.name || undefined; break;
      case 'species': v = info.speciesName; break;
      case 'a species': v = info.speciesName && article(info.speciesName); break;
      case 'young': v = info.young; break;
      case 'potion': v = info.potionName; break;
      case 'food': v = info.food; break;
      case 'cls': v = ctx.cls && CLASS_NAME[ctx.cls]; break;
      case 'lvl': v = ctx.lvl ? String(ctx.lvl) : undefined; break;
      default: v = (acct ?? accountWords(ctx))[t];
    }
    if (v === undefined) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
}

const inHours = ([from, to]: readonly [number, number], h: number) => (from <= to ? h >= from && h < to : h >= from || h < to);

/** whether a line fits the speaker and the moment (its words aside) */
export function fits (l: Fit, ctx: SayingContext, info: SpeakerInfo): boolean {
  if ((l.crit || l.critNow) && ctx.mode !== 'full') return false;
  if (l.critNow && !ctx.crit) return false;
  if (l.who && !l.who.includes(ctx.speaker.kind)) return false;
  if (l.species && !(info.species && l.species.includes(info.species))) return false;
  if (l.potions && !(info.potion && l.potions.includes(info.potion))) return false;
  if (l.potionKind && info.potionKind !== l.potionKind) return false;
  if (l.feeds && !info.feeds) return false;
  if (l.special && !info.special) return false;
  if (l.hours && !inHours(l.hours, ctx.now.getHours())) return false;
  if (l.feast && !(ctx.feasts && ctx.feasts.includes(l.feast))) return false;
  if (l.conn && ctx.conn !== l.conn) return false;
  if (l.resting && !ctx.resting) return false;
  if (l.cls && !(ctx.cls && l.cls.includes(ctx.cls))) return false;
  if (l.minLvl && !((ctx.lvl ?? 0) >= l.minLvl)) return false;
  return true;
}

/** about this very moment: said half the time when one is free */
export const isMoment = (l: Fit) => !!(l.feast || l.conn || l.resting || l.critNow);
/** written for this speaker or hour rather than anyone */
const isSpecific = (l: Fit) => !!(l.species || l.potions || l.potionKind || l.feeds || l.special || l.hours || l.cls);

/** the text without its beat marks, and where the beats were */
export function beatsOf (filled: string): { text: string, beats: number[] } {
  const beats: number[] = [];
  let text = '';
  for (const ch of filled) { if (ch === '|') beats.push(text.length); else text += ch; }
  // a beat at the very end has nothing to wait for
  return { text, beats: beats.filter(b => b < text.length) };
}

interface Cand { l: Line, text: string }

function weighted (pool: Cand[], rand: () => number): Cand {
  let sum = 0;
  for (const c of pool) sum += isSpecific(c.l) ? SPECIFIC_WEIGHT : 1;
  let r = rand() * sum;
  for (const c of pool) { r -= isSpecific(c.l) ? SPECIFIC_WEIGHT : 1; if (r < 0) return c; }
  return pool[pool.length - 1];
}

/** every line that fits now, filled in */
export function candidates (ctx: SayingContext): Cand[] {
  const info = speakerInfo(ctx.speaker);
  const acct = accountWords(ctx);
  const out: Cand[] = [];
  for (const l of allLines()) {
    if (!fits(l, ctx, info)) continue;
    const text = fill(l.say, ctx, info, acct);
    if (text !== null) out.push({ l, text });
  }
  return out;
}

/**
 * What the character says now. `recent`: the ids of the lines said lately, newest last (keeping about 60 is plenty).
 * `rand` is for tests.
 */
export function pickSaying (ctx: SayingContext, recent: readonly string[], rand: () => number = Math.random): Said {
  const all = candidates(ctx);
  // the general groups always fit, so this is only for safety
  if (!all.length) return { id: 'hello', kind: 'funny', text: 'Hello!', beats: [] };
  const last = recent[recent.length - 1];
  const blocked = new Set(recent.slice(-Math.floor(all.length * RECENT_SHARE)));
  let fresh = all.filter(c => !blocked.has(c.l.id) && c.l.id !== last);
  if (!fresh.length) fresh = all.filter(c => c.l.id !== last);
  if (!fresh.length) fresh = all;

  const moments = fresh.filter(c => isMoment(c.l));
  let pool: Cand[];
  if (moments.length && rand() < MOMENT_CHANCE) pool = moments;
  else {
    const kinds = (Object.keys(KIND_SHARE) as SayingKind[]).filter(k => fresh.some(c => c.l.kind === k));
    let r = rand() * kinds.reduce((a, k) => a + KIND_SHARE[k], 0);
    let kind = kinds[kinds.length - 1];
    for (const k of kinds) { r -= KIND_SHARE[k]; if (r < 0) { kind = k; break; } }
    pool = fresh.filter(c => c.l.kind === kind);
  }
  const { l, text } = weighted(pool, rand);
  const b = beatsOf(text);
  return { id: l.id, kind: l.kind, text: b.text, beats: b.beats };
}
