/*
 * Is a Daily due on a given day? A port of Habitica's `shouldDo` (website/common/script/cron.js),
 * which runs on moment + HabitRPG's moment-recur fork. Everything there happens on calendar dates
 * in one fixed UTC offset, so the port works on whole-day numbers (days since 1970-01-01 in that
 * offset). Checked case by case against the real function in tests/parity.test.ts (suite G).
 *
 * Quirks kept on purpose, because Habitica has them:
 *  - weekly "every X weeks" counts whole weeks since the start date (not calendar weeks);
 *  - monthly with neither days-of-month nor weeks-of-month set is due every day of a matching month;
 *  - days-of-month past the end of a short month match its last day (e.g. the 31st in April);
 *  - yearly uses moment's month arithmetic, where Feb 28 → Feb 29 counts as exactly one year.
 */

export interface DailySchedule {
  type: string
  frequency?: string
  everyX?: number
  startDate?: string | number | null
  repeat?: Record<string, boolean>
  daysOfMonth?: number[]
  weeksOfMonth?: number[]
}

const DAY = 864e5;
const WEEKDAY: Record<string, number> = { su: 0, m: 1, t: 2, w: 3, th: 4, f: 5, s: 6 };

interface CalDate { y: number, m: number, d: number, n: number }
const cal = (n: number): CalDate => { const dt = new Date(n * DAY); return { y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate(), n }; };
const dayNumber = (y: number, m: number, d: number) => Math.round(Date.UTC(y, m, d) / DAY);
const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** moment's add(k, 'months'): same day of month, clamped to the target month's length */
function addMonths (c: CalDate, k: number): number {
  const t = c.y * 12 + c.m + k;
  const y = Math.floor(t / 12); const m = t - y * 12;
  return dayNumber(y, m, Math.min(c.d, daysInMonth(y, m)));
}
/** moment's diff(…, 'months', true) between two dates when the result is a whole number of months, else NaN */
function wholeMonths (from: CalDate, to: CalDate): number {
  const k = (to.y * 12 + to.m) - (from.y * 12 + from.m);
  // moment's monthDiff anchors on whichever date has the larger day of month
  const exact = to.d < from.d ? addMonths(from, k) === to.n : addMonths(to, -k) === from.n;
  return exact ? k : NaN;
}

/**
 * @param day   the instant to test (the web client passes yesterday at the day-start hour, local time)
 * @param opts  timezoneUtcOffset in minutes east of UTC; dayStart hour (0–24)
 */
export function shouldDo (day: Date | number, task: DailySchedule, opts: { timezoneUtcOffset?: number, dayStart?: number } = {}): boolean {
  const everyX = task.everyX as number;
  if (task.type !== 'daily' || task.startDate === null || everyX < 1 || everyX > 9999) return false;

  const ds = Number(opts.dayStart || 0);
  const dayStart = !Number.isNaN(ds) && ds >= 0 && ds <= 24 ? ds : 0;
  let tz = Number.isFinite(opts.timezoneUtcOffset) ? opts.timezoneUtcOffset as number : -new Date().getTimezoneOffset();
  if (tz < -720 || tz > 840) tz = -new Date().getTimezoneOffset();

  // the day in question: calendar date of `day` in tz, moved back one day before the custom day start
  const t = (typeof day === 'number' ? day : day.getTime()) + tz * 6e4;
  const hour = new Date(t).getUTCHours();
  const D = cal(Math.floor(t / DAY) + Math.floor(dayStart / 24) - (hour < dayStart ? 1 : 0));
  // the start date's calendar date in the same offset (a missing start date means "now")
  const startMs = task.startDate === undefined ? Date.now() : new Date(task.startDate as string | number).getTime();
  if (Number.isNaN(startMs)) return false;
  const S = cal(Math.floor((startMs + tz * 6e4) / DAY));
  if (S.n > D.n) return false; // starts in the future

  const weekdays: number[] = [];
  for (const [k, on] of Object.entries(task.repeat || {})) if (k in WEEKDAY && on) weekdays.push(WEEKDAY[k]);
  const dow = new Date(D.n * DAY).getUTCDay();
  const days = D.n - S.n;

  switch (task.frequency) {
    case 'daily':
      if (!everyX) return false;
      return days % everyX === 0;
    case 'weekly': {
      if (!weekdays.length) return false;
      return weekdays.includes(dow) && Math.floor(days / 7) % everyX === 0;
    }
    case 'monthly': {
      const months = (D.y * 12 + D.m) - (S.y * 12 + S.m);
      const matchEveryX = months % everyX === 0;
      const weeks = task.weeksOfMonth || [];
      const dates = task.daysOfMonth || [];
      if (weeks.length) {
        if (!weekdays.length) return false;
        if (weeks.some(w => w < 0 || w > 4)) return false; // moment-recur throws on these
        return weekdays.includes(dow) && weeks.includes(Math.floor((D.d - 1) / 7)) && matchEveryX;
      }
      if (dates.length) {
        if (dates.some(v => v < 1 || v > 31)) return false; // moment-recur throws on these
        let hit = dates.includes(D.d);
        // the last day of a short month also stands for the missing days after it
        const last = daysInMonth(D.y, D.m);
        if (!hit && D.d === last && D.d < 31) for (let u = D.d; u <= 31 && !hit; u += 1) hit = dates.includes(u);
        return hit && matchEveryX;
      }
      return matchEveryX;
    }
    case 'yearly': {
      // moment-recur without a unit sets no rule, so everything from the start date matches
      if (task.everyX === undefined || task.everyX === null) return true;
      const k = wholeMonths(S, D);
      return Number.isInteger(k) && k % 12 === 0 && (k / 12) % everyX === 0;
    }
    default:
      return false;
  }
}

/**
 * The day the day change will charge missed Dailies for, as the server reads it (server/libs/cron.js: `now` minus one
 * day, then shouldDo with the account's own zone and day start; with multiDaysCountAsOneDay, the default, only that
 * day). Habitica's web client asks about yesterday at the day-start hour on the device's clock instead
 * (notifications.vue runYesterDailies), which is another day between midnight and the day start, or when the account's
 * zone isn't the device's: then it would offer the wrong Dailies and start the day by itself over an undone one.
 */
export function yesterdayProbe (dayStart: number, timezoneUtcOffset: number, now = Date.now()): { at: number, timezoneUtcOffset: number, dayStart: number } {
  return { at: now - 24 * 3600e3, timezoneUtcOffset, dayStart: Number(dayStart) || 0 };
}
