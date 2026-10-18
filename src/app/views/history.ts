/*
 * History: streaks at risk, a calendar heatmap per Daily and habit from Habitica's own task history,
 * and the crit journal. Read-only; nothing here changes the account.
 */
import { h, icon, button, fmt, plain, sheet } from '../ui/dom';
import { store } from '../store';
import {
  dailyDays, dailySummary, dayParts, habitDays, habitSummary, habiticaDay, runNow, streaksAtRisk, weekOf, weeklyTotals,
  type CritRecords, type DailyMark, type DayClock, type HabitDay, type StreakRisk, type WeekTotal,
} from '../../engine';
import type { UiTask } from '../model';
import { hint, term } from '../ui/term';
import { has } from '../mode';
import { foldCard } from '../ui/fold';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dateOf = (day: number) => { const p = dayParts(day); return `${WEEKDAYS[p.weekday].slice(0, 3)} ${p.d} ${MONTHS[p.m]}`; };
/** at most this many weeks of squares, at least MIN_WEEKS */
const MAX_WEEKS = 13;
const MIN_WEEKS = 5;

/** The Habitica day the tasks' current state belongs to (the day of the last cron; today once the day has started). */
export function stateDay (): number {
  const snap = store.snap!;
  const last = Date.parse(snap.lastCron || '');
  return Number.isFinite(last) ? habiticaDay(last, snap.clock) : habiticaDay(Date.now(), snap.clock);
}

/** Streaks the coming day change would reset (or that something protects), for Now, Tasks and here. */
export function streakRisks (): StreakRisk[] {
  const snap = store.snap;
  if (!snap) return [];
  return streaksAtRisk(store.tasks.filter(t => !t.board).map(t => ({ id: t.id, type: t.type, streak: t.streak, completed: t.completed, isDue: t.isDue, shared: t.shared })),
    { sleeping: snap.sleeping, streaksActive: snap.streaksActive, stealth: snap.stealth });
}

const COVER: Record<StreakRisk['cover'], string> = {
  none: 'resets at the day change if unchecked',
  inn: 'kept: you’re resting in the Inn',
  frost: 'kept by Chilling Frost',
  stealth: 'kept: Stealth covers every unchecked Daily today',
  someStealth: 'Stealth covers some unchecked Dailies; Habitica picks which',
};

function untilDayChange (): string {
  const ms = store.nextDayStart() - Date.now();
  if (store.needsCron) return 'The new day starts when you start it on Now.';
  if (ms <= 0) return '';
  const hh = Math.floor(ms / 3600e3); const mm = Math.floor((ms % 3600e3) / 60e3);
  return `The day changes in ${hh ? `${hh} h ` : ''}${mm} min (${fmt.time(store.nextDayStart())}).`;
}

/** Streaks at risk: a card on Now (Relaxed), a folding one in History. */
export function riskCard (fold = false): HTMLElement {
  const risks = streakRisks();
  const byId = new Map(store.tasks.map(t => [t.id, t]));
  const lost = risks.filter(r => r.cover === 'none');
  const parts = [
    h('div', { class: 'card-sub' }, risks.length
      ? (lost.length ? [`${lost.length} `, term(lost.length === 1 ? 'streak' : 'streaks', 'streak'), ` reset${lost.length === 1 ? 's' : ''} if left unchecked. ${untilDayChange()}`] : `Nothing resets at the day change. ${untilDayChange()}`)
      : 'No due Daily with a streak is unchecked.'),
    risks.length ? h('ul', { class: 'list' }, risks.map(r => {
      const t = byId.get(r.id);
      return h('li', { class: 'li', 'data-k': `risk-${r.id}` },
        h('span', { class: `streak-num ${r.cover === 'none' ? 'lost' : ''}`, title: `${r.streak}-day streak` }, String(r.streak)),
        h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, plain(t?.text || '')), h('div', { class: 'li-sub' }, COVER[r.cover])));
    })) : null,
  ];
  return fold
    ? foldCard('streaks', { icon: 'whatshot', title: 'Streaks at risk', count: lost.length ? String(lost.length) : '' }, parts)
    : h('div', { class: 'card', 'data-k': 'streaks' }, h('div', { class: 'card-head' }, icon('whatshot'), h('h2', { class: 'card-title' }, 'Streaks at risk')), parts);
}

/**
 * All Dailies together, one square per day for the last `days` days (today last): every due one done, some done,
 * none done, or nothing due. Plus the share of due days done over the last 30, across every Daily.
 */
export function dailiesOverview (days = 14): { cells: Array<{ day: number, cls: string, tip: string }>, rate: number | null, due: number, doneToday: number, dueToday: number } {
  const snap = store.snap!;
  const today = stateDay();
  const dailies = store.tasks.filter(t => t.type === 'daily');
  const marks = dailies.map(t => dailyDays(t.history, snap.clock, snap.cronTimes));
  const dueToday = dailies.filter(t => t.isDue).length;
  const doneToday = dailies.filter(t => t.isDue && t.completed).length;
  const cells: Array<{ day: number, cls: string, tip: string }> = [];
  for (let d = today - days + 1; d <= today; d += 1) {
    let due = 0; let done = 0;
    if (d === today) { due = dueToday; done = doneToday; }
    else for (const m of marks) { const x = m.get(d); if (x === 'done') { due += 1; done += 1; } else if (x === 'missed') due += 1; }
    const cls = !due ? 'off' : done === due ? 'done' : d === today ? (done ? 'extra' : 'open') : done ? 'extra' : 'missed';
    cells.push({ day: d, cls, tip: due ? `${dateOf(d)}: ${done} of ${due} done` : `${dateOf(d)}: none due` });
  }
  let due = 0; let done = 0;
  for (const m of marks) { const x = dailySummary(m, today, 30); due += x.due; done += x.done; }
  return { cells, rate: due ? done / due : null, due, doneToday, dueToday };
}

/* ---------------------------------------------------------------- heatmaps */

type Cell = { cls: string, tip: string };

/** Columns of weeks (Monday at the top), the last one the current week. */
function grid (start: number, today: number, cell: (day: number) => Cell, label: string): HTMLElement {
  const cols: HTMLElement[] = [];
  const months: HTMLElement[] = [];
  let lastMonth = -1;
  for (let w = start; w <= weekOf(today); w += 7) {
    const m = dayParts(w).m;
    months.push(h('span', null, m !== lastMonth ? MONTHS[m] : ''));
    lastMonth = m;
    const days: HTMLElement[] = [];
    for (let d = w; d < w + 7; d += 1) {
      if (d > today) { days.push(h('i', { class: 'c future' })); continue; }
      const c = cell(d);
      days.push(h('i', { class: `c ${c.cls} ${d === today ? 'today' : ''}`, title: `${dateOf(d)}: ${c.tip}`, 'data-d': d }));
    }
    cols.push(h('span', { class: 'heat-col' }, days));
  }
  return h('div', { class: 'heat', role: 'img', 'aria-label': label },
    h('div', { class: 'heat-months', 'aria-hidden': 'true' }, months),
    h('div', { class: 'heat-body', 'aria-hidden': 'true' },
      h('span', { class: 'heat-days' }, ['M', '', 'W', '', 'F', '', 'S'].map(x => h('span', null, x))),
      cols));
}

const DAILY_TIP: Record<DailyMark | 'open' | 'none', string> = {
  done: 'done', extra: 'done (not due)', missed: 'missed', off: 'not due', open: 'due, not checked yet', none: 'no record',
};

function dailyBlock (t: UiTask, clock: DayClock, today: number, start: number): HTMLElement {
  const days = dailyDays(t.history, clock, store.snap!.cronTimes);
  // today's square comes from the Daily itself, which is newer than its history
  const now: DailyMark | 'open' = t.completed ? (t.isDue ? 'done' : 'extra') : (t.isDue ? 'open' : 'off');
  const sum = dailySummary(days, today, 30);
  const rate = sum.rate === null ? 'nothing due in 30 days' : `${fmt.pct(sum.rate, 0)} done in 30 days (${sum.done} of ${sum.due})`;
  return h('li', { class: 'hist', 'data-k': `hist-${t.id}` },
    h('div', { class: 'li-title' }, plain(t.text)),
    h('div', { class: 'li-sub' }, [rate, t.streak ? `streak ${t.streak}` : ''].filter(Boolean).join(' · ')),
    grid(start, today, d => {
      const m = d === today ? now : days.get(d) || 'none';
      return { cls: m, tip: DAILY_TIP[m] };
    }, `${plain(t.text)}: ${rate}`));
}

function habitCell (x: HabitDay | undefined): Cell {
  if (!x || (!x.up && !x.down)) return { cls: 'none', tip: 'not scored' };
  const tip = [x.up ? `+${x.up}` : '', x.down ? `−${x.down}` : ''].filter(Boolean).join(' ');
  if (x.down > x.up) return { cls: 'neg', tip };
  return { cls: `up${Math.min(4, x.up)}`, tip };
}

function habitBlock (t: UiTask, clock: DayClock, today: number, start: number): HTMLElement {
  const days = habitDays(t.history, clock);
  const s = habitSummary(days, today, 30);
  const sub = `Scored ${s.activeDays} of 30 days${s.up || s.down ? ` · ${[t.up || s.up ? `+${s.up}` : '', t.down || s.down ? `−${s.down}` : ''].filter(Boolean).join(' / ')}` : ''}`;
  return h('li', { class: 'hist', 'data-k': `hist-${t.id}` },
    h('div', { class: 'li-title' }, plain(t.text)),
    h('div', { class: 'li-sub' }, sub),
    grid(start, today, d => habitCell(days.get(d)), `${plain(t.text)}: ${sub}`));
}

function legend (items: Array<[string, string]>): HTMLElement {
  return h('div', { class: 'heat-legend', 'aria-hidden': 'true' }, items.map(([cls, text]) => h('span', null, h('i', { class: `c ${cls}` }), text)));
}

/** First week to show: back to the oldest record, within MIN_WEEKS..MAX_WEEKS. */
function firstWeek (tasks: UiTask[], clock: DayClock, today: number): number {
  let oldest = today;
  for (const t of tasks) for (const e of t.history || []) oldest = Math.min(oldest, habiticaDay(e.date, clock) - 1);
  const last = weekOf(today);
  return Math.max(last - 7 * (MAX_WEEKS - 1), Math.min(last - 7 * (MIN_WEEKS - 1), weekOf(oldest)));
}

/* ---------------------------------------------------------------- crit journal */

function gainText (g: { exp: number, gp: number, mp: number, dmg: number }, boss = true): string {
  return [g.gp ? `${fmt.int(g.gp)} Gold` : '', g.exp ? `${fmt.int(g.exp)} XP` : '', g.mp ? `${fmt.int(g.mp)} MP` : '', boss && g.dmg ? `${fmt.int(g.dmg)} boss damage` : '']
    .filter(Boolean).join(', ') || 'nothing extra';
}

function weekName (w: WeekTotal, thisWeek: number): string {
  if (w.week === thisWeek) return 'This week';
  if (w.week === thisWeek - 7) return 'Last week';
  return `Week of ${dateOf(w.week).slice(4)}`;
}

/** The records row on top of the journal: biggest crit, most in a day, most days in a row, all crits together. */
function recordsRow (r: CritRecords, today: number): HTMLElement {
  const run = runNow(r, today);
  const tile = (k: string, value: string, label: string, sub: string) => h('div', { class: 'record', 'data-k': `record-${k}` },
    h('div', { class: 'record-value' }, value), h('div', { class: 'record-label' }, label), h('div', { class: 'record-sub' }, sub));
  return h('div', { class: 'records', role: 'group', 'aria-label': 'Crit records', 'data-k': 'records' },
    tile('best', fmt.mult(r.best.mult), 'Biggest crit', dateOf(r.best.day)),
    tile('day', String(r.bestDay.crits), 'Most crits in a day', dateOf(r.bestDay.day)),
    tile('run', `${r.bestRun.days} day${r.bestRun.days === 1 ? '' : 's'}`, 'Most days in a row', run ? `${run} now` : `to ${dateOf(r.bestRun.day)}`),
    tile('all', `${fmt.int(r.crits)} crit${r.crits === 1 ? '' : 's'}`, `Since ${dateOf(r.since).slice(4)}`, `+${gainText(r)}`));
}

function journalCard (today: number): HTMLElement {
  const j = store.journal;
  const weeks = weeklyTotals(j);
  const thisWeek = weekOf(today);
  const cur = weeks.find(w => w.week === thisWeek);
  const recent = j.slice(-20).reverse();
  const head = cur
    ? `${cur.crits} crit${cur.crits === 1 ? '' : 's'} this week added ${gainText(cur)}${cur.planned ? `; ${cur.planned} set up by Sidekick` : ''}.`
    : j.length ? 'No crits yet this week.' : 'Every crit you score in Sidekick lands here, with what it added.';
  return foldCard('journal', { icon: 'event_note', title: 'Crit journal', count: cur ? `${cur.crits} this week` : '' }, [
    store.records ? recordsRow(store.records, today) : null,
    h('div', { class: 'card-sub', 'data-k': 'journal-head' }, head),
    weeks.length > 1 || (weeks.length === 1 && !cur) ? h('div', { class: 'card-body', style: 'padding-top:0' }, h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Week', 'Crits', 'Gold', 'XP', 'Best'].map(x => h('th', { scope: 'col' }, x)))),
      h('tbody', null, weeks.slice(0, 8).map(w => h('tr', null,
        h('th', { scope: 'row' }, weekName(w, thisWeek)), h('td', null, String(w.crits)), h('td', null, fmt.int(w.gp)), h('td', null, fmt.int(w.exp)), h('td', null, fmt.mult(w.best)))))))) : null,
    recent.length ? h('ul', { class: 'list' }, recent.map(e => h('li', { class: 'li', 'data-k': `crit-${e.at}` },
      h('span', { class: 'crit-mult' }, fmt.mult(e.mult)),
      h('div', { class: 'li-main' },
        h('div', { class: 'li-title' }, plain(e.text)),
        h('div', { class: 'li-sub' }, `${dateOf(e.day)}, ${fmt.time(e.at)} · +${gainText(e, e.boss)}${e.planned ? ' · set up' : ''}`))))) : null,
    h('div', { class: 'card-body small muted', style: 'padding-top:0' }, store.remember ? 'Kept on this device only. ' : 'Kept for this session only. ',
      hint('The crit journal', [store.remember
        ? 'Kept on this device only, like your saved login. Logging out clears it.'
        : 'Kept for this session only: log in with “Remember on this device” to keep it.', 'Crits scored in Habitica’s own app aren’t seen here.'], 'journal')),
    j.length ? h('div', { class: 'card-actions' }, button('Clear journal', confirmClear, { k: 'journal-clear' })) : null,
  ]);
}

function confirmClear () {
  sheet('Clear the crit journal?', h('p', null, `This deletes the ${store.journal.length} crit${store.journal.length === 1 ? '' : 's'} recorded on this device and your crit records. Nothing changes in Habitica.`),
    [{ label: 'Cancel', run: () => {} }, { label: 'Clear', primary: true, run: () => store.clearJournal() }]);
}

/* ---------------------------------------------------------------- screen */

/** How many Dailies and habits show before "All …": the ones most worth a look, the rest one tap away. */
const TOP = 3;
const allOpen = { dailies: false, habits: false };

/** The TOP first (by rank, highest first), then the rest in Habitica's own order; only the TOP unless opened. */
function topFirst (tasks: UiTask[], rank: (t: UiTask) => number, open: boolean): UiTask[] {
  const top = [...tasks].sort((a, b) => rank(b) - rank(a)).slice(0, TOP);
  return open ? [...top, ...tasks.filter(t => !top.includes(t))] : top;
}

function moreButton (which: 'dailies' | 'habits', label: string, n: number): HTMLElement | null {
  if (n <= TOP) return null;
  const open = allOpen[which];
  return h('div', { class: 'card-actions' }, button(open ? `Top ${TOP} only` : `All ${label} (${n})`, () => { allOpen[which] = !open; store.emit(); },
    { icon: open ? 'expand_less' : 'expand_more', k: `all-${which}` }));
}

/** "82% in 30 days": every Daily's due days done over the last 30, for a closed Dailies fold. */
function overall (dailies: UiTask[]): string {
  if (!dailies.length) return '';
  const r = dailiesOverview(1).rate;
  return r === null ? String(dailies.length) : `${fmt.pct(r, 0)} in 30 days`;
}

export function historyView (): HTMLElement {
  const snap = store.snap!;
  const clock = snap.clock;
  const today = stateDay();
  const dailies = store.tasks.filter(t => t.type === 'daily');
  const habits = store.tasks.filter(t => t.type === 'habit');
  const start = firstWeek([...dailies, ...habits], clock, today);
  const noHistory = !store.tasks.some(t => t.history?.length);
  // Dailies: streaks at risk first (longest first), then the longest streaks; habits: the most active over 30 days
  const atRisk = new Set(streakRisks().map(r => r.id));
  const shownDailies = topFirst(dailies, t => (atRisk.has(t.id) ? 1e6 : 0) + (t.streak || 0), allOpen.dailies);
  const active = new Map(habits.map(t => [t.id, habitSummary(habitDays(t.history, clock), today, 30).activeDays]));
  const shownHabits = topFirst(habits, t => active.get(t.id) || 0, allOpen.habits);
  return h('div', null,
    riskCard(true),
    foldCard('hist-dailies', { title: 'Dailies', sub: true, count: overall(dailies) }, [
      dailies.length ? [
        legend([['done', 'done'], ['extra', 'done, not due'], ['missed', 'missed'], ['off', 'not due'], ['none', 'no record']]),
        h('ul', { class: 'list hist-list' }, shownDailies.map(t => dailyBlock(t, clock, today, start))),
        moreButton('dailies', 'Dailies', dailies.length),
      ] : h('div', { class: 'card-body muted' }, 'No Dailies.')], { label: 'Dailies' }),
    foldCard('hist-habits', { title: 'Habits', sub: true, count: habits.length ? String(habits.length) : '' }, [
      habits.length ? [
        legend([['up1', '+1'], ['up2', '+2'], ['up4', '+4 or more'], ['neg', 'more − than +']]),
        h('ul', { class: 'list hist-list' }, shownHabits.map(t => habitBlock(t, clock, today, start))),
        moreButton('habits', 'Habits', habits.length),
      ] : h('div', { class: 'card-body muted' }, 'No habits.')], { label: 'Habits' }),
    noHistory && store.tasks.length ? h('div', { class: 'card-body small muted' }, 'Habitica hasn’t recorded any history for these tasks yet; it starts with the next score and day change.') : null,
    h('div', { class: 'card-body small muted', style: 'padding-top:0' }, `From the history Habitica keeps with each habit and Daily: every day for the last 60 days (a year with a subscription), on your day start${clock.dayStart ? ` (${clock.dayStart}:00)` : ''}.`),
    has('journal') ? journalCard(today) : null,
  );
}
