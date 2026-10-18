/*
 * Habit and Daily history, read from the history Habitica keeps on every habit and Daily
 * (returned with GET /tasks/user), and the streaks the next day change would reset.
 *
 * Where the entries come from (Habitica v5.51.0):
 * - Habits: scoring pushes { date, value, scoredUp, scoredDown } once per Habitica day and updates it on
 *   later scores that day (common/script/ops/scoreTask.js _lastHistoryEntryWasToday / _updateLastHistoryEntry).
 * - Dailies: checking one pushes { date, value, isDue, completed: true } at that moment, unchecking removes
 *   the last entry (scoreTask.js); at the day change every Daily left unchecked gets
 *   { date, value, isDue, completed: false } (server/libs/cron.js), describing the day that just ended,
 *   i.e. the day of the previous cron.
 * - Entries older than 60 days (365 for subscribers) are averaged into month and year entries without
 *   these fields (server/libs/preening.js); those are skipped here.
 */
import type { Task } from './core';

export interface HistoryEntry {
  date: number | string
  value?: number
  isDue?: boolean
  completed?: boolean
  scoredUp?: number
  scoredDown?: number
}

/** The player's day settings: preferences.timezoneOffset (minutes west of UTC, as JS reports it) and dayStart (hour). */
export interface DayClock { tzOffset: number, dayStart: number }

const DAY = 864e5;
const ms = (d: number | string): number => (typeof d === 'number' ? d : Date.parse(d));

/**
 * The Habitica day a moment belongs to, as a day number (days since 1970-01-01 in the player's calendar):
 * the date in the player's time zone, one day earlier before the custom day start (fns/getUtcOffset.js,
 * scoreTask.js _lastHistoryEntryWasToday).
 */
export function habiticaDay (t: number | string, clock: DayClock): number {
  return Math.floor((ms(t) - (clock.tzOffset || 0) * 6e4 - (clock.dayStart || 0) * 36e5) / DAY);
}

/** Calendar parts of a day number (UTC arithmetic, so the device's own time zone plays no part). */
export function dayParts (day: number): { y: number, m: number, d: number, weekday: number } {
  const dt = new Date(day * DAY);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), weekday: dt.getUTCDay() };
}

/** done: checked on a due day; extra: checked on a day it wasn't due; missed: due and left unchecked; off: not due. */
export type DailyMark = 'done' | 'extra' | 'missed' | 'off';
const RANK: Record<DailyMark, number> = { off: 0, missed: 1, extra: 2, done: 3 };

/**
 * Day by day, what happened to one Daily.
 * @param cronTimes when the player's day changes ran (user.history.exp dates, plus lastCron), ascending.
 *   With them, a check made before that day's cron (recording yesterday's activity) counts for the day
 *   before, and an unchecked Daily counts for the day of the previous cron even after days away. Without
 *   them, an unchecked entry counts for the day before its own.
 */
export function dailyDays (history: HistoryEntry[] | undefined, clock: DayClock, cronTimes: number[] = []): Map<number, DailyMark> {
  const out = new Map<number, DailyMark>();
  const crons = cronTimes.filter(Number.isFinite);
  /** index of the last cron at or before t, -1 if none */
  const cronAt = (t: number): number => {
    let lo = 0; let hi = crons.length - 1; let found = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (crons[mid] <= t) { found = mid; lo = mid + 1; } else hi = mid - 1; }
    return found;
  };
  for (const e of history || []) {
    if (!e || typeof e.completed !== 'boolean') continue; // averaged (preened) entries
    const t = ms(e.date);
    if (!Number.isFinite(t)) continue;
    const own = habiticaDay(t, clock);
    let day: number;
    const i = cronAt(t);
    if (e.completed) {
      // the day of the cron it followed, if that cron ran within the week (recording yesterday's activity
      // happens before the new day's cron)
      day = i >= 0 && own - habiticaDay(crons[i], clock) <= 7 ? habiticaDay(crons[i], clock) : own;
    } else {
      // written by the cron at i, about the day of the cron before it
      day = i >= 1 && own === habiticaDay(crons[i], clock) ? habiticaDay(crons[i - 1], clock) : own - 1;
    }
    const mark: DailyMark = e.completed ? (e.isDue === false ? 'extra' : 'done') : (e.isDue === false ? 'off' : 'missed');
    const was = out.get(day);
    if (!was || RANK[mark] > RANK[was]) out.set(day, mark);
  }
  return out;
}

export interface HabitDay { up: number, down: number }

/** Day by day, how often a habit was scored up and down. */
export function habitDays (history: HistoryEntry[] | undefined, clock: DayClock): Map<number, HabitDay> {
  const out = new Map<number, HabitDay>();
  for (const e of history || []) {
    if (!e || (typeof e.scoredUp !== 'number' && typeof e.scoredDown !== 'number')) continue;
    const t = ms(e.date);
    if (!Number.isFinite(t)) continue;
    const day = habiticaDay(t, clock);
    const was = out.get(day) || { up: 0, down: 0 };
    out.set(day, { up: was.up + (e.scoredUp || 0), down: was.down + (e.scoredDown || 0) });
  }
  return out;
}

export interface DailySummary {
  /** due days in the window with a record, and how many of them were checked */
  due: number
  done: number
  /** done / due, null without any due day on record */
  rate: number | null
  /** checked on days it wasn't due */
  extra: number
}

/** Completion over the `window` days before `today` (today itself is still open, so it isn't counted). */
export function dailySummary (days: Map<number, DailyMark>, today: number, window = 30): DailySummary {
  let due = 0; let done = 0; let extra = 0;
  for (let d = today - window; d < today; d += 1) {
    const m = days.get(d);
    if (m === 'done') { due += 1; done += 1; } else if (m === 'missed') due += 1; else if (m === 'extra') extra += 1;
  }
  return { due, done, rate: due ? done / due : null, extra };
}

export interface HabitSummary { activeDays: number, up: number, down: number }

/** Scores over the `window` days up to and including `today`. */
export function habitSummary (days: Map<number, HabitDay>, today: number, window = 30): HabitSummary {
  let activeDays = 0; let up = 0; let down = 0;
  for (let d = today - window + 1; d <= today; d += 1) {
    const x = days.get(d);
    if (!x) continue;
    if (x.up || x.down) activeDays += 1;
    up += x.up; down += x.down;
  }
  return { activeDays, up, down };
}

/* ------------------------------------------------------------------ streaks at risk */

/** What a Daily needs for the streak check: the engine's Task plus whether it is on the team board (callers usually leave those out: libs/cron.js never sees them). */
export type StreakTask = Pick<Task, 'type' | 'streak' | 'completed' | 'shared'> & { id: string, isDue: boolean, team?: boolean }

/**
 * none: the next day change resets the streak; inn: resting in the Inn skips the Dailies' cron scoring;
 * frost: Chilling Frost keeps the streak (not on challenge or group Dailies); stealth: the Rogue's Stealth
 * covers every unchecked Daily due today; someStealth: Stealth covers some of them, and Habitica picks which.
 */
export type StreakCover = 'none' | 'inn' | 'frost' | 'stealth' | 'someStealth';
export interface StreakRisk { id: string, streak: number, cover: StreakCover }

/**
 * Due Dailies with a streak that are still unchecked, and whether the coming day change resets that streak
 * (server/libs/cron.js: unchecked due Dailies are scored down unless the player sleeps in the Inn or Stealth
 * evades them; ops/scoreTask.js: a cron score-down sets streak 0 unless buffs.streaks is on, and always for
 * challenge and group Dailies). Ordered by streak, longest first.
 */
export function streaksAtRisk (tasks: StreakTask[], ctx: { sleeping: boolean, streaksActive: boolean, stealth: number }): StreakRisk[] {
  const open = tasks.filter(t => t.type === 'daily' && t.isDue && !t.completed);
  // Stealth is spent on every unchecked due Daily, streak or not, except team-board ones
  const stealthNeeded = open.filter(t => !t.team).length;
  const stealthAll = ctx.stealth > 0 && ctx.stealth >= stealthNeeded;
  return open.filter(t => t.streak > 0).map(t => {
    let cover: StreakCover = 'none';
    if (ctx.sleeping) cover = 'inn';
    else if (ctx.streaksActive && !t.shared) cover = 'frost';
    else if (ctx.stealth > 0 && !t.team) cover = stealthAll ? 'stealth' : 'someStealth';
    return { id: t.id, streak: t.streak, cover };
  }).sort((a, b) => b.streak - a.streak);
}

/** Only the streaks the next day change certainly resets. */
export const streaksLost = (tasks: StreakTask[], ctx: { sleeping: boolean, streaksActive: boolean, stealth: number }): StreakRisk[] =>
  streaksAtRisk(tasks, ctx).filter(r => r.cover === 'none');
