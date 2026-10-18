/*
 * How the Stable's scene reacts to the account (design spec §08), read-only and from what the app already
 * reads: a crit landed in the app sets off confetti and a spinning hop (Full only: Relaxed never mentions crits),
 * a boss quest sends the boss's silhouette across the sky, sized by the HP it has left, and below a third of
 * the player's HP the creatures gather by the stable's door with a sweat drop: information, not pressure. (The
 * level-up lantern rides on growth's record of what the phone has shown: playground.ts grow().) A boss quest the
 * player won breaks the boss's outline up in confetti (Full only, like a crit).
 *
 * A crit is celebrated once: the phone keeps, per account, when the last one it celebrated was landed. One
 * landed while the Stable was elsewhere is celebrated on the next visit the same Habitica day.
 *
 * A quest win is read from achievements.quests, the count of each quest the player finished, which Habitica
 * raises only when it hands out a quest's rewards (Group.finishQuest), so a quest given up or left never
 * counts, nor one the player didn't join. The phone keeps the counts it last saw; a count that went up since
 * is a win, celebrated once, on the next visit the same Habitica day. The first counts are kept silently.
 */
import shapesJson from '../../data/boss-shapes.json';
import { RULES } from '../../engine/rules';
import { decodeShape, type BossShape } from '../../playground/scenes';
import { ITEMS } from '../model';
import type { JournalEntry } from '../../engine';

type Json = any;

/** Below this HP the creatures gather by the stable's door. */
export const LOW_HP = RULES.maxHealth / 3;
export const worried = (hp: number | undefined) => typeof hp === 'number' && hp < LOW_HP;

/** The party's boss now (an active boss quest), with the HP it has left. */
export interface BossNow { key: string, name: string, hp: number, max: number }
export function bossOf (party: Json): BossNow | undefined {
  const q = party?.quest, b = q?.active ? ITEMS.bossQuests[q.key] : undefined;
  if (!b) return undefined;
  const hp = Number(q.progress?.hp);
  return { key: q.key, name: b[2] || b[0], hp: Number.isFinite(hp) ? Math.max(0, hp) : b[1], max: b[1] };
}

const SHAPES = (shapesJson as unknown as { shapes: Record<string, [number, number, string]> }).shapes;
const decoded = new Map<string, BossShape>();
/** The boss's outline, bundled from Habitica's images (undefined: Habitica has no picture for it). */
export function bossShape (key: string): BossShape | undefined {
  let s = decoded.get(key);
  if (!s && SHAPES[key]) { s = decodeShape(SHAPES[key]); decoded.set(key, s); }
  return s;
}

/** The newest crit of today (Habitica's day) not celebrated yet: when it was landed, or undefined. */
export function critToCelebrate (journal: readonly JournalEntry[], seenAt: number, today: number): number | undefined {
  let at: number | undefined;
  for (const e of journal) if (e.day === today && e.at > seenAt && (at === undefined || e.at > at)) at = e.at;
  return at;
}

const KEY = 'critoracle:v2:stable-crit';
function readAll (): Record<string, number> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
/** When the last crit this phone celebrated for the account was landed (0: none yet). */
export function loadCelebrated (userId: string | undefined): number {
  const v = userId ? readAll()[userId] : 0;
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}
export function saveCelebrated (userId: string | undefined, at: number) {
  if (!userId) return;
  const all = readAll();
  all[userId] = at;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode or full */ }
}

/** The boss's name, Habitica's own ("The Basi-List"), for a boss quest key (undefined: not one). */
export function bossName (key: string): string | undefined {
  const b = ITEMS.bossQuests[key];
  return b ? b[2] || b[0] : undefined;
}

/** What the phone knows of the account's quest wins: each quest's count, and a win still to celebrate. */
export interface QuestWins { counts: Record<string, number>, won?: { key: string, day: number } }

const counts = (quests: Json): Record<string, number> | undefined => {
  if (!quests || typeof quests !== 'object') return undefined;
  const c: Record<string, number> = {};
  for (const [k, n] of Object.entries(quests)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) c[k] = n;
  return c;
};

/**
 * The record after a read of achievements.quests (today: Habitica's day). A quest whose count went up is the
 * win to celebrate, a boss with an outline before any other; no record yet: the counts, nothing to celebrate.
 * A read without the counts changes nothing.
 */
export function noteWins (rec: QuestWins | undefined, quests: Json, today: number): QuestWins | undefined {
  const now = counts(quests);
  if (!now) return rec;
  if (!rec) return { counts: now };
  const up = Object.keys(now).filter(k => now[k] > (rec.counts[k] ?? 0));
  const key = up.find(k => bossShape(k)) ?? up[0];
  return { counts: now, won: key ? { key, day: today } : rec.won };
}

/** The quest won and not celebrated yet, if it was seen today (Habitica's day). */
export const winToCelebrate = (rec: QuestWins | undefined, today: number) => (rec?.won && rec.won.day === today ? rec.won.key : undefined);

const WINS = 'critoracle:v2:stable-quests';
function readWins (): Record<string, QuestWins> {
  try { const v = JSON.parse(localStorage.getItem(WINS) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
export function loadWins (userId: string | undefined): QuestWins | undefined {
  const v = userId ? readWins()[userId] : undefined;
  return v && typeof v === 'object' && v.counts && typeof v.counts === 'object' ? v : undefined;
}
export function saveWins (userId: string | undefined, rec: QuestWins) {
  if (!userId) return;
  const all = readWins();
  all[userId] = rec;
  try { localStorage.setItem(WINS, JSON.stringify(all)); } catch { /* private mode or full */ }
}
