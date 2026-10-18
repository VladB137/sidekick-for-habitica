/*
 * Repeating To-Dos (Vlad, 2026-10-13): a To-Do template kept on this device that comes back a set number of days after
 * you tick it. Habitica has nothing like it: a Daily's "every N days" runs on a fixed rhythm and costs HP when missed.
 * So the app keeps the template and, once the To-Do is due, offers one tap that adds a fresh copy to Habitica. It is
 * never added without that tap, and editing a template never touches the copy already in Habitica.
 *
 * Where it lives: on Android natively (RepeatReminders.java), so a reminder can come while the app is closed and its
 * button can add the copy; on the website in this browser's storage. Only with "Remember on this device"; logging out
 * deletes it.
 *
 * Noticing a tick: Habitica leaves ticked To-Dos out of the task list. The app sees its copy ticked (here) or gone
 * (after a read); gone is looked up among the ticked To-Dos (one read) to tell a tick from a delete, and a deleted copy
 * pauses its template. The phone notices it on its own reads, from user.tasksOrder.todos (RepeatPlan.java).
 * Days are Habitica days, in the account's time zone (preferences.timezoneOffset, as History counts them): before
 * your day start hour it is still the day before.
 */
import { store } from './store';
import { native } from './native';
import type { UiTask } from './model';

export type Priority = 0.1 | 1 | 1.5 | 2;
export const PRIORITIES: Array<[Priority, string]> = [[0.1, 'Trivial'], [1, 'Easy'], [1.5, 'Medium'], [2, 'Hard']];
export const MAX_DAYS = 365;
export const MAX_CHECKLIST = 30;

export interface Repeat {
  id: string
  text: string
  notes: string
  priority: Priority
  checklist: string[]
  everyDays: number
  /** the copy in Habitica: open, or ticked and not yet seen leaving the list */
  taskId?: string
  /** the Habitica day the copy was ticked */
  doneDay?: string
  /** the day it is back: doneDay + everyDays, or the first day the player picked */
  dueDay?: string
  /** its copy was deleted in Habitica: no reminder until the player adds it again */
  paused?: boolean
  /** the phone saw the copy leave the list; the app checks whether it was ticked */
  gone?: boolean
  /** "Tomorrow" on the reminder: remind again on this day (the app still shows it as back) */
  snooze?: string
  /** the day a reminder was shown for (RepeatReminders.java) */
  notified?: string
  /** an add is under way (epoch ms), from the app or from the reminder's button: no second Add meanwhile */
  adding?: number
  updatedAt: number
}
export interface Draft { text: string, notes: string, priority: Priority, checklist: string[], everyDays: number }
interface Saved { v: 1, userId: string, dayStart: number, tzOffset?: number, items: Repeat[] }

const KEY = 'critoracle:v2:repeats';

/* ---------------------------------------------------------------- days */

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dayStart = (): number => Number(store.raw?.preferences?.dayStart) || 0;
/** minutes west of UTC, as JS reports it: the account's own (Habitica's cron counts in it), else this device's */
const tzOffset = (t: number): number => {
  const o = Number(store.raw?.preferences?.timezoneOffset);
  return store.raw?.preferences?.timezoneOffset != null && Number.isFinite(o) ? o : new Date(t).getTimezoneOffset();
};
/** The Habitica day a moment belongs to: the date in the account's time zone, the day before until the day start hour. */
export function habiticaDay (t = Date.now(), start = dayStart()): string {
  const d = new Date(t - tzOffset(t) * 6e4 - start * 36e5);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
/** noon on that day, local time (no daylight-saving edge can move it to another date) */
export const dayDate = (day: string): Date => { const [y, m, d] = day.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const addDays = (day: string, n: number): string => { const d = dayDate(day); d.setDate(d.getDate() + n); return dayKey(d); };
export const daysBetween = (a: string, b: string): number => Math.round((dayDate(b).getTime() - dayDate(a).getTime()) / 864e5);
export const every = (n: number) => (n === 1 ? 'every day' : `every ${n} days`);
/** "Tue 20 Oct" */
export const dateLabel = (day: string) => dayDate(day).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
/** "today", "tomorrow", "on Thursday" within a week, else "on Tue 20 Oct" */
export function whenLabel (day: string, from = habiticaDay()): string {
  const n = daysBetween(from, day);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n > 1 && n < 7) return `on ${dayDate(day).toLocaleDateString('en-GB', { weekday: 'long' })}`;
  return `on ${dateLabel(day)}`;
}

/* ---------------------------------------------------------------- state */

let items: Repeat[] = [];
let loadedFor = '';
let loading: Promise<void> | undefined;

export const repeats = {
  get list (): readonly Repeat[] { return items; },
  /** kept only with "Remember on this device" (the reminder's button needs the remembered login) */
  get available (): boolean { return store.loggedIn && store.remember; },
  find: (id: string) => items.find(r => r.id === id),
  /** an add for this one is under way (here, or from the phone's reminder) */
  adding: (id: string) => inFlight.has(id) || isAdding(items.find(r => r.id === id)),
  /** the template a To-Do in Habitica is the current copy of */
  forTask: (taskId: string) => items.find(r => r.taskId === taskId && !r.doneDay),
};

export type Status =
  | { kind: 'open', task?: UiTask }
  | { kind: 'ticked', back: string, done: string }
  | { kind: 'first', back: string }
  | { kind: 'due', since: string }
  | { kind: 'paused' };

export function statusOf (r: Repeat, today = habiticaDay()): Status {
  if (r.paused) return { kind: 'paused' };
  if (r.dueDay) {
    if (r.dueDay <= today) return { kind: 'due', since: r.dueDay };
    return r.doneDay ? { kind: 'ticked', back: r.dueDay, done: r.doneDay } : { kind: 'first', back: r.dueDay };
  }
  return { kind: 'open', task: store.tasks.find(t => t.id === r.taskId) };
}
/** Back and waiting for its tap. */
export const dueNow = (): Repeat[] => { const today = habiticaDay(); return items.filter(r => statusOf(r, today).kind === 'due'); };

async function readSaved (): Promise<Saved | null> {
  let text: string | null | undefined;
  if (native.available) text = await native.repeatsGet();
  else { try { text = localStorage.getItem(KEY); } catch { text = null; } }
  if (!text) return null;
  try { const s = JSON.parse(text) as Saved; return Array.isArray(s?.items) ? s : null; } catch { return null; }
}

/** Store the list; false when it couldn't be kept (storage full or blocked, or the phone no longer has the login). */
async function writeSaved (): Promise<boolean> {
  const userId = store.snap?.userId || store.creds?.userId;
  if (!userId || !store.remember) return false;
  const s: Saved = { v: 1, userId, dayStart: dayStart(), tzOffset: tzOffset(Date.now()), items };
  const text = JSON.stringify(s);
  if (native.available) return native.repeatsSet(text);
  try { localStorage.setItem(KEY, text); return true; } catch { return false; }
}

/** Read the list again (start-up, back in the app, a reminder's button changed it). */
export function reload (): Promise<void> {
  if (loading) return loading;
  loading = (async () => {
    const userId = store.creds?.userId;
    if (!userId) { items = []; loadedFor = ''; return; }
    if (!store.remember) { items = []; loadedFor = userId; return; }
    const s = await readSaved();
    const next = s && s.userId === userId ? s.items : [];
    loadedFor = userId;
    if (JSON.stringify(next) !== JSON.stringify(items)) { items = next; store.emit(); }
  })().finally(() => { loading = undefined; });
  return loading;
}

/** Change the list: read it fresh (the phone may have changed it meanwhile), apply, store, re-draw. */
async function mutate (fn: (list: Repeat[]) => void): Promise<void> {
  await reload();
  const list = items.map(r => ({ ...r, checklist: [...r.checklist] }));
  fn(list);
  items = list;
  if (!await writeSaved()) store.notify({ text: 'Couldn’t save your repeating To-Dos on this device.', error: true });
  store.emit();
}

const newId = () => `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const clean = (d: Draft): Draft => ({
  text: d.text.trim(), notes: d.notes.trim(), priority: PRIORITIES.some(([p]) => p === d.priority) ? d.priority : 1,
  checklist: d.checklist.map(c => c.trim()).filter(Boolean).slice(0, MAX_CHECKLIST),
  everyDays: Math.max(1, Math.min(MAX_DAYS, Math.round(d.everyDays) || 1)),
});
const bodyOf = (r: Draft) => ({
  text: r.text, notes: r.notes || undefined, priority: r.priority,
  checklist: r.checklist.length ? r.checklist.map(text => ({ text, completed: false })) : undefined,
});
/** a copy is in Habitica now: nothing is due until it is ticked */
function addedCopy (r: Repeat, taskId: string) {
  r.taskId = taskId;
  delete r.doneDay; delete r.dueDay; delete r.gone; delete r.paused; delete r.snooze; delete r.notified; delete r.adding;
  r.updatedAt = Date.now();
}

/** An add marked in the shared list counts for half an hour (a phone add waits for a network; one that died is offered again). */
export const ADDING_MS = 30 * 60_000;
const isAdding = (r?: Repeat) => !!r?.adding && Date.now() - r.adding < ADDING_MS;
/** adds this app has sent and not yet stored: the Add buttons stay off until the copy is recorded */
const inFlight = new Set<string>();

/** A tap during a quiet read: wait for it (a few seconds at most) rather than drop the tap without a word. */
async function whenIdle (): Promise<boolean> {
  for (let i = 0; i < 100 && store.busy; i++) await new Promise(res => setTimeout(res, 100));
  if (store.busy) store.notify({ text: 'Still reading Habitica. Try again in a moment.', error: true });
  return !store.busy;
}

/** The one tap: a fresh copy of the template goes into Habitica's To-Dos. */
export async function addNow (id: string): Promise<boolean> {
  if (inFlight.has(id)) return false;
  inFlight.add(id);
  store.emit();
  try {
    await reload();
    const r = repeats.find(id);
    if (!r) return false;
    if (isAdding(r)) { store.notify({ text: `“${r.text}” is already being added from the notification.` }); return false; }
    if (!await whenIdle()) return false;
    // marked in the shared list first, so the phone's reminder button can't add a second copy meanwhile
    await mutate(list => { const x = list.find(y => y.id === id); if (x) x.adding = Date.now(); });
    const t = await store.createTodo(bodyOf(r));
    await mutate(list => { const x = list.find(y => y.id === id); if (!x) return; if (t) addedCopy(x, t.id); else delete x.adding; });
    if (!t) return false;
    store.notify({ text: `“${r.text}” is in your To-Dos. It comes back ${every(r.everyDays)} after you tick it.` });
    return true;
  } finally {
    inFlight.delete(id);
    store.emit();
  }
}

/**
 * Save a new template. `from`: an open To-Do that becomes its first copy (nothing is added); otherwise, with `now`,
 * the first copy is added at once (the tap on Save), or comes back in everyDays.
 */
export async function create (draft: Draft, opts: { from?: string, now: boolean }): Promise<boolean> {
  const d = clean(draft);
  if (!d.text) return false;
  let taskId = opts.from;
  if (!taskId && opts.now) {
    if (!await whenIdle()) return false;
    const t = await store.createTodo(bodyOf(d));
    if (!t) return false;
    taskId = t.id;
  }
  const r: Repeat = { id: newId(), ...d, updatedAt: Date.now() };
  if (taskId) r.taskId = taskId; else r.dueDay = addDays(habiticaDay(), d.everyDays);
  await mutate(list => { list.push(r); });
  // the first one on Android: reminders need the notification permission (asked once by Android)
  if (native.available) {
    void native.repeatsPermission().then(ok => {
      if (!ok) store.notify({ text: 'Notifications are off for Sidekick, so the phone can’t remind you when a To-Do is back. You can switch them on in Android’s settings.', error: true });
    });
  }
  store.notify({ text: taskId
    ? (opts.from ? `“${d.text}” now comes back ${every(d.everyDays)} after you tick it.` : `“${d.text}” is in your To-Dos. It comes back ${every(d.everyDays)} after you tick it.`)
    : `“${d.text}” comes ${whenLabel(r.dueDay!)}; one tap then adds it.` });
  return true;
}

/** Edit a template: what comes back next time. The copy already in Habitica stays as it is. */
export async function edit (id: string, draft: Draft): Promise<boolean> {
  const d = clean(draft);
  if (!d.text) return false;
  await mutate(list => {
    const r = list.find(x => x.id === id);
    if (!r) return;
    Object.assign(r, d, { updatedAt: Date.now() });
    if (r.doneDay) r.dueDay = addDays(r.doneDay, d.everyDays);
  });
  return true;
}

/** Stop repeating: the template goes; a copy in Habitica stays a plain To-Do. */
export async function remove (id: string): Promise<void> {
  const r = repeats.find(id);
  await mutate(list => { const i = list.findIndex(x => x.id === id); if (i >= 0) list.splice(i, 1); });
  if (r) store.notify({ text: `“${r.text}” no longer repeats.` });
}

/* ---------------------------------------------------------------- backup (backup.ts) */

const DAY = /^\d{4}-\d\d-\d\d$/;
/** The list for a backup file, without what only this phone means (an add under way, a reminder shown). */
export async function forBackup (): Promise<Repeat[]> {
  await reload();
  return items.map(r => { const c = { ...r, checklist: [...r.checklist] }; delete c.adding; delete c.notified; delete c.gone; return c; });
}

/**
 * Templates from a backup file, checked one by one (a hand-edited file can't break the list). `sameAccount` false:
 * the copies in Habitica belong to another account, so a template with a copy is back today, one tap away.
 */
export function fromBackup (v: unknown, sameAccount: boolean): Repeat[] {
  if (!Array.isArray(v)) return [];
  const today = habiticaDay();
  const out: Repeat[] = [];
  for (const x of v as Array<Partial<Repeat> | null>) {
    if (!x || typeof x.text !== 'string' || !x.text.trim() || out.length >= 200) continue;
    const d = clean({
      text: x.text, notes: typeof x.notes === 'string' ? x.notes : '', priority: x.priority as Priority,
      checklist: Array.isArray(x.checklist) ? x.checklist.filter((c): c is string => typeof c === 'string') : [], everyDays: Number(x.everyDays),
    });
    const r: Repeat = { id: typeof x.id === 'string' && /^r-[a-z0-9]+$/.test(x.id) && !out.some(o => o.id === x.id) ? x.id : newId(), ...d, updatedAt: Date.now() };
    if (x.paused) r.paused = true;
    else if (sameAccount) {
      if (typeof x.taskId === 'string' && x.taskId) r.taskId = x.taskId;
      if (typeof x.doneDay === 'string' && DAY.test(x.doneDay)) r.doneDay = x.doneDay;
      if (typeof x.dueDay === 'string' && DAY.test(x.dueDay)) r.dueDay = x.dueDay;
      if (typeof x.snooze === 'string' && DAY.test(x.snooze)) r.snooze = x.snooze;
      if (!r.taskId && !r.dueDay) r.dueDay = today;
    } else if (!x.taskId && typeof x.dueDay === 'string' && DAY.test(x.dueDay)) {
      r.dueDay = x.dueDay;
      if (typeof x.doneDay === 'string' && DAY.test(x.doneDay)) r.doneDay = x.doneDay;
    } else r.dueDay = today;
    out.push(r);
  }
  return out;
}

/** Replace this account's list with a backup's; false when it couldn't be kept (no remembered login). */
export async function replaceAll (next: Repeat[]): Promise<boolean> {
  if (!repeats.available) return false;
  await reload();
  items = next;
  const ok = await writeSaved();
  store.emit();
  return ok;
}

/* ---------------------------------------------------------------- noticing ticks */

let lookedUpFor = 0;
/** no look-up before this (epoch ms): the 30 s spacing of automatic calls, or a minute after one failed */
let nextLookAt = 0;
let lookTimer: ReturnType<typeof setTimeout> | undefined;
const lookLater = (at: number) => {
  nextLookAt = at;
  if (lookTimer) clearTimeout(lookTimer);
  lookTimer = setTimeout(() => { lookTimer = undefined; reconcile(); }, Math.max(0, at - Date.now()) + 50);
};

/** After each change to the tasks: a copy ticked or unticked here, or gone from Habitica's list after a read. */
function reconcile () {
  if (!items.length || !store.snap || store.fromCache || !loadedFor || loading) return;
  const today = habiticaDay();
  const changes = new Map<string, (r: Repeat) => void>();
  const missing: Repeat[] = [];
  for (const r of items) {
    if (!r.taskId || r.paused) continue;
    const t = store.tasks.find(x => x.id === r.taskId);
    if (t && !t.completed && r.doneDay) {
      // unticked again (Undo): open, nothing due
      changes.set(r.id, x => { delete x.doneDay; delete x.dueDay; delete x.gone; delete x.snooze; delete x.notified; x.updatedAt = Date.now(); });
    } else if (t && t.completed && !r.doneDay) {
      changes.set(r.id, x => { x.doneDay = today; x.dueDay = addDays(today, x.everyDays); x.updatedAt = Date.now(); });
    } else if (!t && store.tasksReadAt && r.updatedAt < store.tasksReadAt) {
      // ticked here and now gone from the list: done with this copy
      if (r.doneDay && !r.gone) changes.set(r.id, x => { delete x.taskId; x.updatedAt = Date.now(); });
      else missing.push(r);
    }
  }
  if (changes.size) void mutate(list => { for (const x of list) changes.get(x.id)?.(x); });
  if (missing.length && lookedUpFor !== store.tasksReadAt && Date.now() >= nextLookAt) { lookedUpFor = store.tasksReadAt; void lookUp(missing.map(r => r.id)); }
}

/** Was the copy ticked (and when) or deleted? One read of the ticked To-Dos tells. */
async function lookUp (ids: string[]) {
  const done = await store.completedTodos();
  // not yet (an automatic call went out under 30 s ago), or it failed: once more later, never on every redraw
  if (!Array.isArray(done)) { lookedUpFor = 0; lookLater(done ? done.waitUntil : Date.now() + 60_000); return; }
  const byId = new Map(done.map(t => [t._id || t.id, t]));
  await mutate(list => {
    for (const x of list) {
      if (!ids.includes(x.id) || !x.taskId) continue;
      const t = byId.get(x.taskId);
      const at = t?.dateCompleted ? Date.parse(t.dateCompleted) : NaN;
      if (t && Number.isFinite(at)) {
        x.doneDay = habiticaDay(at);
        x.dueDay = addDays(x.doneDay, x.everyDays);
      } else {
        // deleted in Habitica: no reminder until the player adds it again
        x.paused = true;
        delete x.doneDay; delete x.dueDay; delete x.notified; delete x.snooze;
      }
      delete x.taskId; delete x.gone;
      x.updatedAt = Date.now();
    }
  });
}

store.on(() => {
  if (!store.loggedIn) { if (items.length || loadedFor) { items = []; loadedFor = ''; } return; }
  if (store.creds && loadedFor !== store.creds.userId && !loading) { void reload(); return; }
  reconcile();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && store.loggedIn) void reload(); });
native.onRepeatsChanged(() => { void reload(); });
