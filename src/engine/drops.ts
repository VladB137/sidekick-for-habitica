/*
 * Item drops: the chance that scoring a task drops an item, and how many drops are left today.
 * A port of website/common/script/fns/randomDrop.js and the daysSince() it calls (cron.js).
 *
 * Only the chance is knowable. The server rolls it, and picks the item, with Math.random
 * (randomDrop is called without predictableRandom, server/libs/tasks/index.js), so which item
 * drops, and whether one does, is luck. The crit is not: it multiplies the chance, and the
 * engine knows in advance whether the score crits.
 */
import { scoreTask, totals, diminishingReturns, type ScoreResult, type State, type Task } from './core';

/** The account fields randomDrop reads besides the stats. */
export interface DropAccount {
  /** contributor.level */
  contributor: number
  /** achievements.rebirths */
  rebirths: number
  /** achievements.streak (21-day streak achievements) */
  streakAchievements: number
  /** purchased.plan.customerId set: twice the daily drops */
  subscribed: boolean
  /** items.lastDrop: when the last drop came (ms; undefined reads as now, as moment(undefined) does) and today's count */
  lastDropAt?: number | null
  lastDropCount: number
  /** preferences.dayStart (hour) and preferences.timezoneOffset (minutes west of UTC, as Date#getTimezoneOffset) */
  dayStart: number
  timezoneOffset?: number
  /** achievements.completedTask: no drop until the very first task is done */
  completedTask: boolean
  /** Habitica checks the size of the objects (keys present, even at 0), not the counts */
  hasEggsOrPotions: boolean
  hasFood: boolean
}

const DAY = 864e5;

/** The Habitica day an instant belongs to (cron.js startOfDay), as a day number; equal numbers = daysSince 0. */
export function gameDay (at: number, dayStart: number, timezoneOffset?: number): number {
  const ref = Number(dayStart || 0);
  const ds = !Number.isNaN(ref) && ref >= 0 && ref <= 24 ? ref : 0;
  // the server runs in UTC: a missing or out-of-range offset falls back to 0
  let tz = Number.isFinite(timezoneOffset) ? -(timezoneOffset as number) : 0;
  if (tz < -720 || tz > 840) tz = 0;
  // moment's utcOffset() reads a value between -16 and 16 as hours, so Habitica does too
  if (tz > -16 && tz < 16) tz *= 60;
  const local = at + tz * 6e4;
  let day = Math.floor(local / DAY);
  const hour = Math.floor((local - day * DAY) / 36e5);
  if (hour < ds) day -= 1;
  return day;
}

/** Drops allowed per day: (5 + floor(PER / 25) + contributor level), twice that for subscribers. */
export function dropCap (s: State, a: DropAccount): number {
  return (a.subscribed ? 2 : 1) * (5 + Math.floor(totals(s).per / 25) + (a.contributor || 0));
}

/** Drops already had today (items.lastDrop.count, which only counts while its date is today). */
export function dropsToday (a: DropAccount, now = Date.now()): number {
  if (a.lastDropAt === null) return 0;
  const at = a.lastDropAt === undefined ? now : a.lastDropAt;
  if (!Number.isFinite(at)) return 0;
  return gameDay(at, a.dayStart, a.timezoneOffset) === gameDay(now, a.dayStart, a.timezoneOffset) ? a.lastDropCount : 0;
}

/** Drops left today; the reusable number behind "drops left" lines. */
export function dropsLeft (s: State, a: DropAccount, now = Date.now()): { left: number, cap: number, used: number } {
  const cap = dropCap(s, a);
  const used = dropsToday(a, now);
  return { left: Math.max(0, cap - used), cap, used };
}

/** The chance itself, from the task and the player as they are just after the score. */
export function dropChance (after: State, task: Task, crit: number, a: DropAccount): number {
  let chance = Math.min(Math.abs(task.value - 21.27), 37.5) / 150 + 0.02;
  chance *= task.priority
    * (1 + Math.max(0, 80 - (5 * after.lvl)) / 100)
    * (1 + (task.streak / 100 || 0))
    * (1 + totals(after).per / 100)
    * (1 + (a.contributor / 40 || 0))
    * (1 + (a.rebirths / 20 || 0))
    * (1 + (a.streakAchievements / 200 || 0))
    * (crit || 1)
    * (1 + 0.5 * (task.checked || 0));
  return diminishingReturns(chance, 0.75);
}

export interface DropOdds {
  /** chance of an item drop from this score: 0 once today's drops are used up */
  drop: number
  /** chance of finding a collection-quest item (the same roll, made separately, with no daily cap) */
  quest: number
  crit: boolean
  /** today's drops are used up */
  capped: boolean
  /** no food held at all: the next drop is certain, and it is food */
  firstFood: boolean
  /** a new account holding no eggs or potions: the score gives a first egg and potion instead */
  firstDrops: boolean
}

const NONE: DropOdds = { drop: 0, quest: 0, crit: false, capped: false, firstFood: false, firstDrops: false };

/** Drop odds for a score already worked out by scoreTask. `team`: a team task (its streak doesn't earn achievements). */
export function dropOddsAfter (r: ScoreResult, a: DropAccount, now = Date.now(), team = false): DropOdds {
  const t = r.task;
  if (t.type === 'reward' || !a.completedTask) return NONE;
  if (!a.hasEggsOrPotions) return { ...NONE, crit: r.crit, firstDrops: true };
  // a Daily reaching a multiple of 21 earns a streak achievement before the drop is rolled (ops/scoreTask.js)
  const ach = a.streakAchievements + (t.type === 'daily' && !team && t.streak !== 0 && t.streak % 21 === 0 ? 1 : 0);
  const chance = dropChance(r.state, t, r.mult, { ...a, streakAchievements: ach });
  const capped = dropsToday(a, now) >= dropCap(r.state, a);
  const firstFood = !a.hasFood;
  return { drop: capped ? 0 : firstFood ? 1 : chance, quest: chance, crit: r.crit, capped, firstFood, firstDrops: false };
}

/** Drop odds for scoring `task` up now. Habits scored down and rewards never drop anything worth counting here. */
export function dropOdds (s: State, task: Task & { team?: boolean }, a: DropAccount, now = Date.now()): DropOdds {
  if (task.type === 'reward') return NONE;
  let r: ScoreResult;
  try { r = scoreTask(s, task, 'up'); } catch { return NONE; }
  return dropOddsAfter(r, a, now, !!task.team);
}

/** What a drop is, once one happens (randomDrop's rarity roll): food 40%, egg 30%, hatching potion 30% (Golden 2%). */
export const DROP_KINDS = { food: 0.4, egg: 0.3, potion: 0.3, golden: 0.02 } as const;
