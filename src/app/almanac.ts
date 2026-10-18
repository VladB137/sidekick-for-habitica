/*
 * The weekly almanac (features F2, Vlad 2026-10-17): a Stable postcard with the week written on it. The crits and
 * what they added (Full only: Relaxed never mentions crits), the share of Dailies done, the longest Daily streak,
 * pets hatched, mounts raised and quests won. Weeks are Habitica weeks, Monday first, on the account's day start.
 *
 * Crits come from the journal and Dailies from the history Habitica keeps with each Daily (60 days at least), so any
 * week shown is covered. Habitica keeps no date for a hatched pet, a raised mount or a won quest, so the phone keeps
 * what the account had (items.pets, items.mounts, achievements.quests) at the start of each week and at its latest
 * read, and the difference is the week's. The first week is counted from the first read. Kept per account on this
 * device; nothing leaves it, and the postcard is made only when the player asks.
 */
import { store } from './store';
import { stateDay } from './views/history';
import { dailyDays, dayParts, habiticaDay, weekOf, weeklyTotals } from '../engine';
import { ITEMS } from './model';
import { has } from './mode';
import { changes, noteRead, ownedOf, type Rec } from './weekly';
import { fmt } from './ui/dom';

const KEY = 'critoracle:v2:almanac';
function readAll (): Record<string, Rec> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}
function load (userId: string | undefined): Rec {
  const v = userId ? readAll()[userId] : undefined;
  return v && typeof v === 'object' ? v : {};
}
function keep (userId: string, rec: Rec) {
  const all = readAll();
  all[userId] = rec;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode or full */ }
}

/** This account's week record, for a backup file (backup.ts). */
export const almanacForBackup = (userId: string | undefined): Rec => load(userId);
/** A week record from a backup file of the same account: kept when it looks like one, else nothing changes. */
export function restoreAlmanac (userId: string, v: unknown) {
  const r = v as Rec | null;
  const ok = (x: unknown) => !x || (typeof x === 'object' && typeof (x as { week?: unknown }).week === 'number');
  if (r && typeof r === 'object' && ok(r.cur) && ok(r.last) && (!r.cur || (r.cur.start && r.cur.end))) keep(userId, r);
}

let seen: unknown;
store.on(() => {
  const raw = store.raw, snap = store.snap, who = store.creds?.userId;
  // kept on the device only with “Remember on this device”, like the crit journal (the store drops it on log out)
  if (!raw || !snap || !who || !store.remember || raw === seen || raw._id !== who) return;
  seen = raw;
  const now = ownedOf(raw, store.tasks.filter(t => t.type === 'daily').map(t => t.streak || 0));
  if (!now) return;
  const rec = load(who), next = noteRead(rec, now, habiticaDay(Date.now(), snap.clock));
  if (JSON.stringify(next) !== JSON.stringify(rec)) keep(who, next);
});

/* ---------------------------------------------------------------- what the postcard says */

export type Which = 'this' | 'last';
/** one line of the almanac: the number first, then what it counts */
export interface AlmanacLine { k: string, bold: string, rest: string }
/** `note`: a small line under the rest (the first week counted from the first read) */
export interface Almanac { which: Which, title: string, lines: AlmanacLine[], note?: string }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/** "13–19 Oct", "29 Sep – 5 Oct" */
export function weekSpan (week: number): string {
  const a = dayParts(week), b = dayParts(week + 6);
  return a.m === b.m ? `${a.d}–${b.d} ${MONTHS[b.m]}` : `${a.d} ${MONTHS[a.m]} – ${b.d} ${MONTHS[b.m]}`;
}
const s = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const questName = (k: string) => ITEMS.bossQuests[k]?.[2] || ITEMS.bossQuests[k]?.[0] || ITEMS.collectQuests[k]?.[0] || ITEMS.quests[k]?.[0] || k;

/** Whether last week's almanac exists, and hasn't been offered yet. */
export function lastWeekReady (): boolean {
  const who = store.creds?.userId, rec = load(who), today = store.snap && habiticaDay(Date.now(), store.snap.clock);
  return !!rec.last && today !== undefined && rec.last.week === weekOf(today) - 7 && rec.offered !== rec.last.week;
}
/** Last week's almanac was offered: not again. */
export function markOffered () {
  const who = store.creds?.userId, rec = load(who);
  if (who && rec.last) keep(who, { ...rec, offered: rec.last.week });
}
/** Whether last week can be shown (it was counted, and it's the week before this one). */
export function hasLastWeek (): boolean {
  const rec = load(store.creds?.userId), today = store.snap && habiticaDay(Date.now(), store.snap.clock);
  return !!rec.last && today !== undefined && rec.last.week === weekOf(today) - 7;
}

/** The almanac of this week so far, or of last week (undefined: nothing to say yet). */
export function almanacOf (which: Which): Almanac | undefined {
  const snap = store.snap, who = store.creds?.userId;
  if (!snap || !who) return undefined;
  const rec = load(who), today = stateDay(), thisWeek = weekOf(habiticaDay(Date.now(), snap.clock));
  const week = which === 'this' ? thisWeek : thisWeek - 7;
  const lines: AlmanacLine[] = [];
  // crits, from the journal (Full only)
  if (has('journal')) {
    const w = weeklyTotals(store.journal.filter(e => weekOf(e.day) === week))[0];
    if (w) {
      const got = [w.gp ? `${fmt.int(w.gp)} Gold` : '', w.exp ? `${fmt.int(w.exp)} XP` : ''].filter(Boolean).join(' and ');
      lines.push({ k: 'crits', bold: s(w.crits, 'crit'), rest: `${got ? ` added ${got}` : ''}${w.crits > 1 ? `, the best ${fmt.mult(w.best)}` : ` (${fmt.mult(w.best)})`}` });
    }
  }
  // Dailies, from Habitica's history (today counts as it stands)
  let due = 0, done = 0;
  for (const t of store.tasks) {
    if (t.type !== 'daily') continue;
    const marks = dailyDays(t.history, snap.clock, snap.cronTimes);
    for (let d = week; d < week + 7 && d <= today; d++) {
      if (d === today) { if (t.isDue) { due += 1; if (t.completed) done += 1; } continue; }
      const m = marks.get(d);
      if (m === 'done') { due += 1; done += 1; } else if (m === 'missed') due += 1;
    }
  }
  if (due) lines.push({ k: 'dailies', bold: `${Math.round(100 * done / due)}%`, rest: ` of Dailies done (${done} of ${due})` });
  // the stable and quests, from what the phone counted
  const counted = which === 'this' ? rec.cur?.week === week ? { from: rec.cur.from, streak: rec.cur.streak, ...changes(rec.cur.start, rec.cur.end) } : undefined
    : rec.last?.week === week ? rec.last : undefined;
  if (counted?.streak) lines.push({ k: 'streak', bold: s(counted.streak, 'day'), rest: ': the longest Daily streak' });
  if (counted && (counted.hatched || counted.raised)) {
    const raised = counted.raised ? s(counted.raised, 'mount') : '';
    lines.push(counted.hatched
      ? { k: 'stable', bold: s(counted.hatched, 'pet'), rest: ` hatched${raised ? `, ${raised} raised` : ''}` }
      : { k: 'stable', bold: raised, rest: ' raised' });
  }
  if (counted?.quests.length) {
    const names = [...new Set(counted.quests)].map(questName);
    lines.push({ k: 'quests', bold: counted.quests.length === 1 ? 'Quest won' : `${counted.quests.length} quests won`, rest: `: ${names.join(', ')}` });
  }
  if (!lines.length) return undefined;
  const p = counted && counted.from > week ? dayParts(counted.from) : undefined;
  return {
    which, title: `${which === 'this' ? 'This week' : 'Last week'}, ${weekSpan(week)}`, lines,
    note: p ? `Pets, mounts and quests counted from ${WEEKDAYS[p.weekday]} ${p.d} ${MONTHS[p.m]}, when Sidekick first saw them.` : undefined,
  };
}
