/*
 * Creatures' names (Vlad, 2026-10-15). Habitica has none (a pet is a key and a feed count), so these are the
 * app's own, kept on this phone next to the playground picks, one record per Habitica account, never sent anywhere.
 *
 * A creature gets a name the first time it lives in a playground, from a hand-written list (src/data/pet-names.json)
 * themed by its egg and its hatching potion, in an order seeded by the account and the creature, so two players'
 * Red Wolves usually differ. No two creatures on an account get the same name, and a name once given stays: taking
 * a creature out and back keeps it. The player can rename it, or keep Habitica's name for it ("Red Wolf").
 * A pet raised into a mount passes its name on to the mount; a pet hatched again later, while its grown-up keeps
 * the name, is "Little" that name.
 *
 * Pure apart from load/save. Giving names (the list) is naming.ts, in the Stable's own chunk; this part is small
 * enough for any screen that shows a creature.
 */
import { unwritable } from '../../playground/font';
import { creatureName, type CreatureId } from './picks';

export const MAX_NAME = 12;

export interface NameRec {
  /** '' = the player chose Habitica's name for it */
  name: string;
  /** typed (or picked) by the player, not given by the app */
  own?: boolean;
  /** the day it was named, YYYY-MM-DD on the phone's calendar: how long it has been in the Stable */
  since?: string;
}
export type Names = Readonly<Record<CreatureId, NameRec>>;

/** A name as the player typed it, tidied (spaces trimmed and single), or why it can't be one. */
export function cleanName (raw: string): { name: string } | { error: string } {
  const name = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!name) return { error: 'Type a name, or keep Habitica’s name for it.' };
  if ([...name].length > MAX_NAME) return { error: `Up to ${MAX_NAME} letters, so it fits over its head.` };
  const bad = unwritable(name);
  if (bad.length) return { error: `The meadow can’t write ${bad.map(c => `“${c}”`).join(' ')}. Letters (with accents), digits, spaces, ' - and . work.` };
  return { name };
}

/** The player renames a creature ('' = Habitica's name). */
export function rename (names: Names, id: CreatureId, name: string, today: string): Names {
  return { ...names, [id]: { name, own: true, since: names[id]?.since ?? today } };
}

/** Its own name, if it has one. */
export const nameOf = (names: Names, id: CreatureId): string => names[id]?.name ?? '';
/** What to call it in a sentence: "Ruby", or "Red Wolf" without a name. */
export const called = (names: Names, id: CreatureId): string => nameOf(names, id) || creatureName(id);
/** For a button or TalkBack: "Ruby, Red Wolf mount". */
export const calledFull = (names: Names, id: CreatureId): string => {
  const n = nameOf(names, id);
  return n ? `${n}, ${creatureName(id, true)}` : creatureName(id, true);
};

/** Whole days from the day it was named to today (both YYYY-MM-DD). */
export function daysSince (since: string | undefined, today: string): number | undefined {
  if (!since) return undefined;
  const d = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
  const n = Math.round((d(today) - d(since)) / 864e5);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** The phone's calendar day, YYYY-MM-DD. */
export function localDay (now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

/* ---- storage */

const KEY = 'critoracle:v2:names';

function readAll (): Record<string, unknown> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** A stored record, checked entry by entry (an old or hand-edited one can't break the Stable). */
export function normalizeNames (v: unknown): Names {
  const out: Record<CreatureId, NameRec> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [id, r] of Object.entries(v as Record<string, Partial<NameRec>>)) {
    if (!/^(pet|mount):[^:]+-/.test(id) || !r || typeof r.name !== 'string') continue;
    const c = r.name === '' ? { name: '' } : cleanName(r.name);
    if (!('name' in c)) continue;
    out[id] = { name: c.name, ...(r.own ? { own: true } : {}), ...(typeof r.since === 'string' && /^\d{4}-\d\d-\d\d$/.test(r.since) ? { since: r.since } : {}) };
  }
  return out;
}

export function loadNames (userId: string | undefined): Names {
  return normalizeNames(userId ? readAll()[userId] : undefined);
}

export function saveNames (userId: string | undefined, names: Names) {
  if (!userId) return;
  const all = readAll();
  all[userId] = names;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode or full */ }
}
