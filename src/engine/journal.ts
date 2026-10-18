/*
 * The crit journal's arithmetic: what a crit added over the same score without it, and weekly totals.
 * The journal itself (which crits, where they are kept) is the app's (src/app/journal.ts).
 */
import { scoreTask, xpGained, type State, type Task } from './core';
import { dayParts } from './history';

export interface CritGain { exp: number, gp: number, mp: number, dmg: number }

/**
 * What scoring `task` up from `before` with crit multiplier `mult` gave beyond the same score at ×1
 * (ops/scoreTask.js: the multiplier scales XP, Gold, mana and boss damage alike).
 */
export function critExtra (before: State, task: Task, mult: number): CritGain {
  const crit = scoreTask(before, task, 'up', mult);
  const plain = scoreTask(before, task, 'up', 1);
  return {
    exp: xpGained(before, crit.state) - xpGained(before, plain.state),
    gp: crit.state.gp - plain.state.gp,
    mp: crit.state.mp - plain.state.mp,
    dmg: crit.dmg - plain.dmg,
  };
}

export interface JournalEntry extends CritGain {
  /** when (ms) and on which Habitica day */
  at: number
  day: number
  taskId: string
  /** the task's text when it was scored (the player's own words: render as text) */
  text: string
  type: Task['type']
  mult: number
  /** set up by one of Sidekick's suggestions */
  planned?: boolean
  /** boss damage only counts while a boss quest is on */
  boss?: boolean
}

export interface WeekTotal extends CritGain { week: number, crits: number, planned: number, best: number }

/** Monday of the week a Habitica day falls in, as a day number. */
export const weekOf = (day: number): number => day - ((dayParts(day).weekday + 6) % 7);

/** Totals per week (Monday first), newest week first. */
export function weeklyTotals (entries: JournalEntry[]): WeekTotal[] {
  const by = new Map<number, WeekTotal>();
  for (const e of entries) {
    const w = weekOf(e.day);
    const t = by.get(w) || { week: w, crits: 0, planned: 0, best: 0, exp: 0, gp: 0, mp: 0, dmg: 0 };
    t.crits += 1; if (e.planned) t.planned += 1;
    t.best = Math.max(t.best, e.mult);
    t.exp += e.exp; t.gp += e.gp; t.mp += e.mp; if (e.boss) t.dmg += e.dmg;
    by.set(w, t);
  }
  return [...by.values()].sort((a, b) => b.week - a.week);
}

/**
 * Crit records (all time, on this device), kept beside the journal and carried forward crit by crit, so they
 * outlive the journal's oldest entries. A run is days in a row each with at least one crit.
 */
export interface CritRecords extends CritGain {
  crits: number
  /** the first crit's Habitica day */
  since: number
  /** the biggest multiplier and when */
  best: { mult: number, at: number, day: number }
  /** the most crits in one Habitica day */
  bestDay: { crits: number, day: number }
  /** the most days in a row with a crit, ending on `day` */
  bestRun: { days: number, day: number }
  /** the latest crit's day, its crits so far, and the run that reaches it */
  last: { day: number, crits: number, run: number }
}

/** The records with one more crit (entries come in the order they were scored). */
export function addRecord (r: CritRecords | undefined, e: JournalEntry): CritRecords {
  const boss = e.boss ? e.dmg : 0;
  if (!r) {
    return {
      crits: 1, exp: e.exp, gp: e.gp, mp: e.mp, dmg: boss, since: e.day,
      best: { mult: e.mult, at: e.at, day: e.day }, bestDay: { crits: 1, day: e.day }, bestRun: { days: 1, day: e.day },
      last: { day: e.day, crits: 1, run: 1 },
    };
  }
  // a crit dated before the latest (the phone's clock or time zone moved) counts, but starts no day or run
  const same = e.day <= r.last.day;
  const last = same ? { day: r.last.day, crits: r.last.crits + (e.day === r.last.day ? 1 : 0), run: r.last.run }
    : { day: e.day, crits: 1, run: e.day === r.last.day + 1 ? r.last.run + 1 : 1 };
  return {
    crits: r.crits + 1, exp: r.exp + e.exp, gp: r.gp + e.gp, mp: r.mp + e.mp, dmg: r.dmg + boss, since: Math.min(r.since, e.day),
    best: e.mult > r.best.mult ? { mult: e.mult, at: e.at, day: e.day } : r.best,
    bestDay: last.crits > r.bestDay.crits ? { crits: last.crits, day: last.day } : r.bestDay,
    bestRun: last.run > r.bestRun.days ? { days: last.run, day: last.day } : r.bestRun,
    last,
  };
}

/** The records of a whole journal (for a journal kept before records were). */
export const recordsOf = (entries: readonly JournalEntry[]): CritRecords | undefined =>
  entries.reduce<CritRecords | undefined>((r, e) => addRecord(r, e), undefined);

/** The run of days with a crit still going on `today` (yesterday's run counts until today ends without one). */
export const runNow = (r: CritRecords | undefined, today: number): number =>
  (r && (r.last.day === today || r.last.day === today - 1) ? r.last.run : 0);

/** Whether stored records look whole (anything else is rebuilt from the journal). */
export function validRecords (v: unknown): v is CritRecords {
  const r = v as CritRecords;
  const n = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
  return !!r && typeof r === 'object' && [r.crits, r.exp, r.gp, r.mp, r.dmg, r.since].every(n)
    && !!r.best && n(r.best.mult) && n(r.best.at) && n(r.best.day) && !!r.bestDay && n(r.bestDay.crits) && n(r.bestDay.day)
    && !!r.bestRun && n(r.bestRun.days) && n(r.bestRun.day) && !!r.last && n(r.last.day) && n(r.last.crits) && n(r.last.run);
}
