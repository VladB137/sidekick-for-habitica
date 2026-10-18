/*
 * Habit and Daily history (src/engine/history.ts) against Habitica's own code.
 *
 * Simulated players live through 75 days on a controlled clock: Habitica's scoreTask (from the harness) writes
 * the history entries when habits and Dailies are scored and unchecked; the day change writes its entries as
 * server/libs/cron.js does (unchecked Dailies, then the exp entry, then isDue for the new day through
 * Habitica's shouldDo). Days away, records of yesterday's activity made before the day's cron, time zones on
 * both sides of UTC and custom day starts are all in the mix. The engine's reading of the entries must match
 * what actually happened, day by day.
 *
 * Streaks at risk: every unchecked due Daily goes through Habitica's own cron score-down, and the streak must
 * reset exactly when the engine said it would.
 */
import { createRequire } from 'node:module';
import { dailyDays, habitDays, habiticaDay, streaksAtRisk, dailySummary, type DailyMark, type DayClock, type HistoryEntry } from '../src/engine/history';
import { shouldDo, yesterdayProbe } from '../src/engine/schedule';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');

/* a clock we move by hand (Habitica's code reads Date and moment()) */
const Real = Date;
let simNow = Real.parse('2026-06-01T00:00:00Z');
const Fake = function (this: unknown, ...args: unknown[]) {
  if (!new.target) return new Real(simNow).toString();
  return args.length ? new (Real as any)(...args) : new Real(simNow);
} as unknown as DateConstructor;
Object.setPrototypeOf(Fake, Real);
(Fake as any).prototype = Real.prototype;
(Fake as any).now = () => simNow;
globalThis.Date = Fake;

let seed = 12345;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
const DAY = 864e5;

function makeUser (tz: number, dayStart: number) {
  return {
    _id: 'u1', _tmp: {}, guilds: [] as string[], preferences: { timezoneOffset: tz, dayStart, automaticAllocation: false, allocationMode: 'flat', sleep: false },
    stats: { hp: 50, mp: 30, exp: 10, gp: 100, lvl: 20, class: 'warrior', points: 0, str: 10, con: 5, int: 3, per: 2, buffs: { str: 0, int: 0, per: 0, con: 0, stealth: 0, streaks: false }, training: { int: 0, per: 0, str: 0, con: 0 } },
    items: { gear: { equipped: {}, owned: {} } }, party: { _id: 'g1', quest: { progress: { up: 0, down: 0 } } },
    achievements: { streak: 0 }, flags: { levelDrops: { atom1: true, vice1: true, goldenknight1: true, moonstone1: true } }, history: { exp: [] as Array<{ date: string, value: number }> },
    addNotification () {}, markModified () {},
  };
}
function makeDaily (id: string, extra: Record<string, unknown> = {}) {
  return {
    _id: id, id, type: 'daily', text: id, value: 0, priority: 1, attribute: 'str', streak: 0, completed: false, isDue: true,
    history: [] as HistoryEntry[], checklist: [], group: {}, challenge: {}, frequency: 'daily', everyX: 1,
    startDate: '2026-01-01T00:00:00.000Z', repeat: { su: true, m: true, t: true, w: true, th: true, f: true, s: true }, daysOfMonth: [], weeksOfMonth: [],
    markModified () {}, ...extra,
  };
}
const makeHabit = (id: string) => ({ _id: id, id, type: 'habit', text: id, value: 0, priority: 1, attribute: 'str', up: true, down: true, history: [] as HistoryEntry[], counterUp: 0, counterDown: 0, group: {}, challenge: {}, markModified () {} });

let failures = 0;
let checks = 0;
const fail = (msg: string) => { failures += 1; if (failures <= 30) console.log(`  ${msg}`); };

function simulate (tz: number, dayStart: number, opts: { away: number, rya: number, days: number }) {
  const user = makeUser(tz, dayStart);
  const clock: DayClock = { tzOffset: tz, dayStart };
  const dailies = [
    makeDaily('every'),
    makeDaily('everyOther', { everyX: 2 }),
    makeDaily('weekdays', { frequency: 'weekly', repeat: { su: false, m: true, t: true, w: true, th: true, f: true, s: false } }),
    makeDaily('twice', { frequency: 'weekly', repeat: { su: false, m: false, t: true, w: false, th: false, f: true, s: false } }),
  ];
  const habits = [makeHabit('h1'), makeHabit('h2')];
  const truthD = new Map<string, Map<number, DailyMark>>(dailies.map(d => [d.id, new Map()]));
  const truthH = new Map<string, Map<number, { up: number, down: number }>>(habits.map(x => [x.id, new Map()]));
  const req = { language: 'en' };
  /** start of Habitica day n, as an instant */
  const dayAt = (n: number) => n * DAY + tz * 6e4 + dayStart * 36e5;
  const first = habiticaDay(Real.parse('2026-06-01T12:00:00Z'), clock);
  let lastCronDay = first - 1;
  simNow = dayAt(first - 1) + 3600e3;
  user.history.exp.push({ date: new Real(simNow).toISOString(), value: 0 });
  for (const d of dailies) d.isDue = H.shouldDo(new Real(simNow), d, { dayStart, timezoneOffset: tz });
  const crons: number[] = [simNow];
  const mark = (id: string, day: number, m: DailyMark | undefined) => { const t = truthD.get(id)!; if (m) t.set(day, m); else t.delete(day); };

  for (let n = first; n < first + opts.days; n += 1) {
    if (rnd() < opts.away) continue;
    let t = Math.floor(dayAt(n) + (0.2 + rnd() * 10) * 3600e3);
    simNow = t;
    // recording yesterday's activity: checks before the cron count for the day of the last cron
    if (rnd() < opts.rya) {
      for (const d of dailies) {
        if (d.completed || !d.isDue || rnd() < 0.5) continue;
        H.scoreTask({ user, task: d, direction: 'up', times: 1, cron: false }, req);
        mark(d.id, lastCronDay, 'done');
      }
      t += 60e3; simNow = t;
    }
    // the day change (server/libs/cron.js): unchecked Dailies get an entry, then the exp entry, then the new day
    const cronAt = simNow;
    for (const d of dailies) {
      if (!d.completed) {
        d.history.push({ date: Number(new Date()), value: d.value, isDue: d.isDue, completed: false });
        mark(d.id, lastCronDay, d.isDue ? 'missed' : 'off');
        if (d.isDue) d.streak = 0;
      }
      d.completed = false;
      d.isDue = H.shouldDo(new Real(cronAt), d, { dayStart, timezoneOffset: tz });
    }
    user.history.exp.push({ date: new Real(cronAt).toISOString(), value: 0 });
    crons.push(cronAt);
    lastCronDay = n;
    // the day: a few taps spread over its hours, sometimes undone
    const end = dayAt(n + 1) - 60e3;
    for (let k = 0; k < 8 && t < end; k += 1) {
      t = Math.min(end, Math.floor(t + rnd() * 5 * 3600e3));
      simNow = t;
      const d = dailies[Math.floor(rnd() * dailies.length)];
      if (!d.completed && rnd() < 0.6) {
        H.scoreTask({ user, task: d, direction: 'up', times: 1, cron: false }, req);
        mark(d.id, n, d.isDue ? 'done' : 'extra');
      } else if (d.completed && rnd() < 0.2) {
        H.scoreTask({ user, task: d, direction: 'down', times: 1, cron: false }, req);
        mark(d.id, n, undefined);
      }
      const hb = habits[Math.floor(rnd() * habits.length)];
      const dir = rnd() < 0.7 ? 'up' : 'down';
      H.scoreTask({ user, task: hb, direction: dir, times: 1, cron: false }, req);
      const was = truthH.get(hb.id)!.get(n) || { up: 0, down: 0 };
      truthH.get(hb.id)!.set(n, { up: was.up + (dir === 'up' ? 1 : 0), down: was.down + (dir === 'down' ? 1 : 0) });
    }
  }
  return { dailies, habits, truthD, truthH, clock, crons, user };
}

function compare (label: string, got: Map<number, unknown>, want: Map<number, unknown>) {
  checks += 1;
  const days = new Set([...got.keys(), ...want.keys()]);
  for (const d of days) {
    const a = JSON.stringify(got.get(d)); const b = JSON.stringify(want.get(d));
    if (a !== b) { fail(`${label} day ${d}: engine ${a}, actual ${b}`); return; }
  }
}

// time zones west and east of UTC and at it, custom day starts including late ones
const CASES: Array<[number, number]> = [[0, 0], [-120, 0], [300, 0], [-600, 4], [420, 23], [-330, 9], [240, 2]];
for (const [tz, ds] of CASES) {
  for (let run = 0; run < 3; run += 1) {
    const sim = simulate(tz, ds, { away: 0.15, rya: 0.25, days: 75 });
    const label = `tz ${tz} dayStart ${ds} run ${run}`;
    for (const d of sim.dailies) compare(`${label} ${d.id}`, dailyDays(d.history, sim.clock, sim.crons), sim.truthD.get(d.id)!);
    for (const x of sim.habits) compare(`${label} ${x.id}`, habitDays(x.history, sim.clock), sim.truthH.get(x.id)!);
    // the crons as the app gets them: user.history.exp dates
    const fromExp = sim.user.history.exp.map(e => Real.parse(e.date));
    for (const d of sim.dailies) compare(`${label} ${d.id} (exp history)`, dailyDays(d.history, sim.clock, fromExp), sim.truthD.get(d.id)!);
  }
  // without the cron times the reading holds for a player who opens Habitica every day and records nothing late
  const daily = simulate(tz, ds, { away: 0, rya: 0, days: 60 });
  for (const d of daily.dailies) compare(`tz ${tz} dayStart ${ds} no crons ${d.id}`, dailyDays(d.history, daily.clock), daily.truthD.get(d.id)!);
}

// averaged entries left by preening carry no completed/scoredUp fields and are skipped
{
  checks += 1;
  const clock = { tzOffset: 0, dayStart: 0 };
  const d = dailyDays([{ date: Real.parse('2025-01-01T00:00:00Z'), value: 3 }, { date: Real.parse('2026-06-02T10:00:00Z'), value: 1, isDue: true, completed: true }], clock);
  const h = habitDays([{ date: Real.parse('2025-01-01T00:00:00Z'), value: 3 }], clock);
  if (d.size !== 1 || h.size !== 0) fail(`preened entries not skipped: ${d.size} ${h.size}`);
  const s = dailySummary(new Map<number, DailyMark>([[10, 'done'], [11, 'missed'], [12, 'off'], [13, 'extra'], [14, 'done']]), 15, 30);
  if (s.due !== 3 || s.done !== 2 || s.extra !== 1) fail(`dailySummary ${JSON.stringify(s)}`);
}

// streaks at risk: Habitica's own cron score-down decides
{
  const req = { language: 'en' };
  let n = 0;
  for (let i = 0; i < 4000; i += 1) {
    const user = makeUser(0, 0);
    user.stats.buffs.streaks = rnd() < 0.3;
    user.stats.buffs.stealth = rnd() < 0.3 ? Math.floor(rnd() * 4) : 0;
    user.preferences.sleep = rnd() < 0.1;
    const tasks = Array.from({ length: 1 + Math.floor(rnd() * 5) }, (_, k) => makeDaily(`d${k}`, {
      streak: rnd() < 0.7 ? Math.floor(rnd() * 40) : 0, completed: rnd() < 0.3, isDue: rnd() < 0.8,
      challenge: rnd() < 0.2 ? { id: 'c1' } : {}, group: rnd() < 0.15 ? { id: 'g1' } : {}, userId: 'u1',
    }));
    const risk = streaksAtRisk(tasks.map(t => ({
      id: t.id, type: 'daily' as const, streak: t.streak, completed: t.completed, isDue: t.isDue,
      shared: !!(t.challenge as any).id || !!(t.group as any).id, team: false,
    })), { sleeping: user.preferences.sleep, streaksActive: user.stats.buffs.streaks, stealth: user.stats.buffs.stealth });
    // cron.js: for unchecked due Dailies, Stealth evades in task order, then scoreTask down unless sleeping
    const before = new Map(tasks.map(t => [t.id, t.streak]));
    for (const t of tasks) {
      if (t.completed || !t.isDue) continue;
      if (user.stats.buffs.stealth) { user.stats.buffs.stealth -= 1; continue; }
      if (!user.preferences.sleep) H.scoreTask({ user, task: t, direction: 'down', times: 1, cron: true }, req);
    }
    for (const r of risk) {
      checks += 1; n += 1;
      const lost = (tasks.find(t => t.id === r.id)!.streak === 0) && before.get(r.id)! > 0;
      if (r.cover === 'someStealth') continue; // Habitica's task order decides
      if (lost !== (r.cover === 'none')) fail(`streak ${r.id} (${r.streak}, ${r.cover}): Habitica ${lost ? 'reset' : 'kept'} it`);
    }
    // nothing outside the list loses a streak
    for (const t of tasks) {
      if (risk.some(r => r.id === t.id)) continue;
      if (before.get(t.id)! > 0 && t.streak === 0) { checks += 1; fail(`streak ${t.id} reset but not listed`); }
    }
  }
  console.log(`streaks: ${n} at-risk verdicts checked`);
}

// "Record yesterday's activity": the Dailies the app lists are exactly those the day change charges (server/libs/cron.js:
// now minus a day through shouldDo with the account's zone and day start), at any hour, the hours between midnight and
// a late day start included, whatever the phone's own zone
{
  let n = 0;
  const kinds = [
    makeDaily('every'), makeDaily('everyOther', { everyX: 2 }), makeDaily('everyThird', { everyX: 3 }),
    makeDaily('weekdays', { frequency: 'weekly', repeat: { su: false, m: true, t: true, w: true, th: true, f: true, s: false } }),
    makeDaily('thursday', { frequency: 'weekly', repeat: { su: false, m: false, t: false, w: false, th: true, f: false, s: false } }),
  ];
  for (const [tz, ds] of [...CASES, [-180, 4], [-120, 5], [300, 3]] as Array<[number, number]>) {
    for (let k = 0; k < 400; k += 1) {
      const now = Real.parse('2026-10-01T00:00:00Z') + Math.floor(rnd() * 60 * DAY);
      simNow = now;
      const probe = yesterdayProbe(ds, -tz, now);
      for (const d of kinds) {
        checks += 1; n += 1;
        const charged = !!H.shouldDo(new Real(now - DAY), d, { dayStart: ds, timezoneOffset: tz });
        if (shouldDo(probe.at, d, probe) !== charged) fail(`yesterday's ${d.id} at ${new Real(now).toISOString()} tz ${tz} dayStart ${ds}: app ${!charged}, cron ${charged}`);
      }
    }
  }
  console.log(`yesterday's Dailies: ${n} checked against the day change`);
}

globalThis.Date = Real;
if (failures) { console.log(`FAIL  history: ${failures} of ${checks} checks failed (Habitica ${H.version})`); process.exit(1); }
console.log(`PASS  history: ${checks} checks against Habitica ${H.version} (${CASES.length} time zone/day-start cases)`);
