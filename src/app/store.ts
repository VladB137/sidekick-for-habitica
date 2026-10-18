/*
 * Session state and every action the app can take. Each action that changes stats is
 * predicted with the engine first; the server's answer is then compared with the
 * prediction, which is how a rules change at Habitica would show up the day it ships.
 *
 * Freshness matters: the player may also tap in the official app, and party members'
 * skills, quest damage or another client's day change can move the numbers between our
 * reads. So a mismatch only counts as evidence of a rule change when the numbers the
 * prediction started from came straight from Habitica moments earlier.
 */
import { ApiError, HabiticaApi, HABITICA, type Credentials, type Json, type Send } from '../api/client';
import { native } from './native';
import { demo, leaveDemo } from './demo';
import {
  allocatePoint, buyGear, buyPotion, buyWithGold, castSkill, critExtra, forceOptions, habiticaDay, revivePreview, rollHits, scoreTask, sellItem, shouldDo, yesterdayProbe,
  RULES, seedOf, addRecord, recordsOf, validRecords,
  skillByKey, taskPreviews, verdicts, withGear, gearFromEquipped, applyEquip, nightLoadouts, dropOdds, dropsLeft, feedingPlan,
  type DropOdds, type FeedingPlan, type CritRecords, type ForceOption, type GearContext, type JournalEntry, type LeverKind, type RollKey, type State, type Step, type StatKey, type TaskPreview,
} from '../engine';
import { LINES, trimParty, trimTasks, untilDayChange, type LineId, type LinePrefs } from './lines';
import { mayToggle } from './stable/ride';
import {
  EMPTY_SHOP, GEAR, HISTORY_DAYS, ITEMS, STABLE, gearCheck, inventoryFor, itemName, memberFromApi, seasonalFromShop, seedDiff, snapshotFromUser, taskFromApi,
  type PartyMember, type SavingFor, type ShopInfo, type Snapshot, type UiTask,
} from './model';

export type Objective = 'damage' | 'xp' | 'gold' | 'drops';
export type Theme = 'system' | 'light' | 'dark';

export interface Settings {
  theme: Theme
  objective: Objective | 'auto'
  allow: Record<LeverKind, boolean>
  savingFor: SavingFor[]
  smashTarget?: string
  /** where the player's next stat points go; allocation is only suggested for this stat */
  allocateTo?: StatKey
  /** never offer to sell the last N of any food, egg or hatching potion */
  keepItems: number
  /** eggs, potions and food the player's pets and mounts still need count as costly to sell */
  protectStable: boolean
  /** after a gear swap for a crit, put the gear back automatically once the crit has been used */
  autoRestore: boolean
  haptics: boolean
  /** who talks in Now's meadow header ('pet:Wolf-Base', 'mount:…'); unset = the player's avatar (ui/speaker.ts) */
  speaker?: string
  /** the ongoing notification (Android): its lines in the player's order with their switches, Automatic or Mine order,
   * and whether the home-screen widget shows the same */
  notification: NotificationSettings
  /** Full or Relaxed (mode.ts); unset until the player chooses, after login */
  mode?: 'full' | 'relaxed'
  /** the first-run tips (views/modes.ts) already seen, per mode */
  coach?: { full?: boolean, relaxed?: boolean }
  /** Night gear was on when Relaxed started: it is off while Relaxed is on and back on with Full */
  nightPaused?: boolean
}
/** `lines`: Full's lines; `relaxed`: Relaxed's own (never the crit verdict), made from Full's on the first switch */
export interface NotificationSettings { order: 'auto' | 'mine', lines: Array<[LineId, boolean]>, widget: boolean, relaxed?: Array<[LineId, boolean]> }

/** Relaxed's lines: no crit verdict, and the Dailies left on (Relaxed's notification leads with your day). */
export function relaxedLines (saved: Array<[LineId, boolean]> | undefined, full: Array<[LineId, boolean]>): Array<[LineId, boolean]> {
  if (saved) return normalizeLines(saved).filter(([id]) => id !== 'crit');
  return normalizeLines(full).filter(([id]) => id !== 'crit').map(([id, on]) => [id, on || id === 'dailies'] as [LineId, boolean]);
}

/** Saved line choices with every line the app knows: unknown ones dropped, new ones added where they belong, at their default. */
export function normalizeLines (saved: Array<[LineId, boolean]> | undefined): Array<[LineId, boolean]> {
  const known = new Set(LINES.map(l => l.id));
  const out = (saved || []).filter(([id], i, a) => known.has(id) && a.findIndex(x => x[0] === id) === i).map(([id, on]) => [id, !!on] as [LineId, boolean]);
  LINES.forEach((l, i) => {
    if (out.some(x => x[0] === l.id)) return;
    // after the line that comes before it by default, or first
    const prev = LINES.slice(0, i).reverse().find(p => out.some(x => x[0] === p.id));
    const at = prev ? out.findIndex(x => x[0] === prev.id) + 1 : 0;
    out.splice(at, 0, [l.id, l.on]);
  });
  return out;
}

export interface LogEntry { t: number, action: string, ok: boolean, detail?: string, fresh?: boolean }
export interface Record_ { predicted: number, matched: number, crits: number, forced: number, log: LogEntry[] }

const DEFAULT_SETTINGS: Settings = {
  theme: 'system',
  objective: 'auto',
  // logging a bad habit is opt-in: it only makes sense when the slip really happened
  allow: { reward: true, sell: true, potion: true, skill: true, allocate: true, gear: true, purchase: true, seasonal: true, habitDown: false, done: true },
  savingFor: [],
  keepItems: 0,
  protectStable: true,
  autoRestore: true,
  haptics: true,
  notification: { order: 'auto', lines: normalizeLines(undefined), widget: false },
};
const EMPTY_RECORD: Record_ = { predicted: 0, matched: 0, crits: 0, forced: 0, log: [] };

/** Saved settings (on this device, or from a backup file), checked: defaults for what's missing or not the right kind. */
export function normalizeSettings (v: unknown): Settings {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Settings>;
  const s: Settings = { ...DEFAULT_SETTINGS, ...o };
  s.allow = { ...DEFAULT_SETTINGS.allow, ...(o.allow && typeof o.allow === 'object' ? o.allow : {}) };
  s.savingFor = Array.isArray(o.savingFor) ? o.savingFor.filter(x => x && typeof x.key === 'string' && typeof x.name === 'string' && Number.isFinite(x.price)) : [];
  if (!Number.isFinite(s.keepItems)) s.keepItems = 0;
  const n = s.notification;
  s.notification = { order: n?.order === 'mine' ? 'mine' : 'auto', lines: normalizeLines(Array.isArray(n?.lines) ? n.lines : undefined), widget: !!n?.widget, relaxed: Array.isArray(n?.relaxed) ? relaxedLines(n.relaxed, []) : undefined };
  if (s.mode !== 'full' && s.mode !== 'relaxed') delete s.mode;
  if (typeof s.speaker !== 'string' || !/^(pet|mount):./.test(s.speaker)) delete s.speaker;
  return s;
}

/** The prediction record (History), checked the same way. */
export function normalizeRecord (v: unknown): Record_ {
  const o = (v && typeof v === 'object' ? v : {}) as Partial<Record_>;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : 0);
  const log = Array.isArray(o.log) ? o.log.filter(e => e && typeof e.t === 'number' && typeof e.action === 'string' && typeof e.ok === 'boolean') : [];
  return { predicted: n(o.predicted), matched: n(o.matched), crits: n(o.crits), forced: n(o.forced), log };
}

const K = {
  creds: 'critoracle:v2:creds', settings: 'critoracle:v2:settings', record: 'critoracle:v2:record',
  cache: 'critoracle:v2:cache', restore: 'critoracle:v2:restore', repeats: 'critoracle:v2:repeats', journal: 'critoracle:v2:journal',
  almanac: 'critoracle:v2:almanac',
};
/** The crit journal keeps this many crits (oldest go first). */
const JOURNAL_MAX = 1000;
/** '' for an empty slot (missing or a *_base_0 placeholder), else the item key */
const emptySlot = (k?: string): string => (!k || k.endsWith('_base_0') ? '' : k);
/** "your next task", "your next Brutal Smash" */
export const rollName = (roll: RollKey): string => (roll === 'task' ? 'your next task' : `your next ${skillByKey(roll)?.name || roll}`);
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const load = <T>(k: string, d: T): T => { try { const v = localStorage.getItem(k); return v ? { ...d, ...JSON.parse(v) } : d; } catch { return d; } };
const save = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode or full */ } };
const drop = (k: string) => { try { localStorage.removeItem(k); } catch { /* ignore */ } };

/** API base: habitica.com, except in end-to-end test builds (VITE_TEST_API is never set for releases). */
export const API_BASE: string = (import.meta as any).env?.VITE_TEST_API || HABITICA;

/** How long numbers read from Habitica count as current (live) — a little over the 60 s automatic re-read. */
const FRESH_MS = 90_000;
/** Automatic re-reads while the app is on screen; Habitica asks for at least 30 s between automatic calls. */
const TEST_READ_MS = Number((import.meta as any).env?.VITE_AUTO_READ_MS) || 0; // end-to-end builds only
export const AUTO_READ_MS = TEST_READ_MS || 60_000;
const AUTO_GAP_MS = Math.min(30_000, AUTO_READ_MS / 2);
/** A drift verdict only looks at checks from the last day. */
const DRIFT_WINDOW_MS = 24 * 3600e3;

export interface Toast { text: string, crit?: boolean, action?: { label: string, run: () => void }, error?: boolean, ms?: number }
/** how long a bad habit logged by a tap waits for Undo before it is sent (the snackbar shows as long) */
export const LOG_GRACE_MS = 5000;
type Res<T> = { ok: true, value: T } | { ok: false, error?: unknown };
export type Connection = 'live' | 'checking' | 'offline';
export type PlanResult =
  | { status: 'done', crit: boolean }
  | { status: 'changed' }
  | { status: 'stopped', at: number, of: number, reason: string }
  | { status: 'blocked', reason: string };

export class Store {
  creds?: Credentials;
  remember = false;
  api?: HabiticaApi;
  raw?: Json;
  snap?: Snapshot;
  tasks: UiTask[] = [];
  /** the last GET /tasks/user as Habitica sent it (for the phone's notification) */
  private rawTasks: Json[] = [];
  party: Json = null;
  /** the party's members (the player included), read with the party */
  partyMembers: PartyMember[] = [];
  shop: ShopInfo = EMPTY_SHOP;
  settings: Settings;
  record: Record_;
  /** crits scored through the app, newest last; kept on the device only with "Remember on this device" */
  journal: JournalEntry[] = [];
  /** crit records over every crit the journal has seen, kept with it (they outlive its oldest entries) */
  records?: CritRecords;
  /** seed at which a suggestion left the next task certain to crit: the crit scored from it was planned */
  private plannedSeed?: number;
  busy = false;
  /** the task a score or checklist tick is being sent for: only its row waits, the others stay live */
  sendingFor?: string;
  syncedAt = 0;
  /** when the last full read of the tasks started (a change made after it isn't in that answer) */
  tasksReadAt = 0;
  /** last time any response from Habitica told us the player's stats */
  lastServerAt = 0;
  /** the app was in the background, so the player may have acted elsewhere */
  changedElsewhere = false;
  offline = false;
  /** numbers shown come from the on-device cache, not yet confirmed by Habitica */
  fromCache = false;
  authError?: string;
  /** message of the last failed read, for the start-up screen */
  lastError?: string;
  /**
   * Habitica's message when it refuses this app or account outright: a 403 (Habitica blocked the client or the
   * connection, server/middlewares/blocker.js) or a read refused with 401 for any reason but the token (a suspended
   * account, middlewares/auth.js). Calls that can't succeed must stop, so no automatic call goes out until a read
   * the player asks for succeeds, or another login.
   */
  refused?: string;
  /** Habitica failing (5xx, maintenance): automatic reads wait until then, longer after each failure in a row */
  private serverWaitUntil = 0;
  private serverFailures = 0;
  private loggingIn = false;
  /** gear swapped for a crit: for each slot the piece that was on before the first swap ('' = empty), per account */
  private restore: { userId: string, base: Record<string, string>, /** seed right after the crit was set up */ armedSeed?: number } | null = null;
  lastMismatch?: string;
  toast?: Toast;
  private shopFetchedAt = 0;
  private partyFetchedAt = 0;
  private depth = 0;
  /** bumped on login and logout, so answers to requests from an earlier session are ignored */
  private session = 0;
  private resyncWanted = false;
  /** last automatic (not tap-initiated) call to Habitica, for the 30 s spacing */
  private lastAutoAt = 0;
  /** tasks may have changed elsewhere (a light read saw the stats move); re-read them on the next automatic turn */
  private tasksStale = false;
  private autoRestoring = false;
  /** bumped on every change to the numbers, so a slower background read can't overwrite a newer answer */
  private rawSeq = 0;
  private listeners = new Set<() => void>();

  constructor () {
    this.settings = normalizeSettings(load<unknown>(K.settings, {}));
    this.record = normalizeRecord(load<unknown>(K.record, {}));
    const rs = load<{ userId?: string, base?: Record<string, string> }>(K.restore, {});
    this.restore = rs.userId && rs.base ? { userId: rs.userId, base: rs.base, armedSeed: (rs as { armedSeed?: number }).armedSeed } : null;
    // the Android app keeps the token in the Keystore instead (restoreNative)
    if (!native.available) this.adopt(load<Partial<Credentials>>(K.creds, {}));
  }

  /** Remembered credentials found at start-up: log in with them and show the saved copy of the numbers. */
  private adopt (c: Partial<Credentials>) {
    if (!c.userId || !c.apiToken) return;
    this.creds = c as Credentials; this.remember = true; this.api = new HabiticaApi(this.creds, API_BASE);
    this.loadJournal();
    // show the last known numbers at once; a sync confirms them
    const cache = load<{ raw?: Json, tasks?: Json[], party?: Json, at?: number }>(K.cache, {});
    if (cache.raw && cache.raw._id === c.userId) {
      this.raw = cache.raw; this.snap = snapshotFromUser(cache.raw);
      this.tasks = (cache.tasks || []).map(t => taskFromApi(t, c.userId));
      this.party = cache.party || null;
      this.syncedAt = cache.at || 0;
      this.fromCache = true;
    }
  }

  /** Android app: read the remembered credentials from the Keystore before the first screen. */
  async restoreNative () {
    if (!native.available || this.creds) return;
    const c = await native.getCredentials() || {};
    this.adopt(c);
    // a login saved before a rename (Crit Oracle, then Habitica Oracle) still carries the old x-client
    if (this.creds && c.client && c.client !== HabiticaApi.clientFor(this.creds)) void native.setClient(HabiticaApi.clientFor(this.creds));
    this.sendLines();
  }

  on (fn: () => void) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit () { for (const fn of this.listeners) fn(); }
  notify (t: Toast) { this.toast = t; this.emit(); }

  saveSettings () { save(K.settings, this.settings); this.sendLines(); this.emit(); }

  get relaxed () { return this.settings.mode === 'relaxed'; }
  /** The notification's lines for the mode in use, with their switches (Relaxed keeps its own list). */
  get modeLines (): Array<[LineId, boolean]> {
    const n = this.settings.notification;
    if (!this.relaxed) return n.lines;
    n.relaxed ??= relaxedLines(undefined, n.lines);
    return n.relaxed;
  }
  set modeLines (lines: Array<[LineId, boolean]>) {
    if (this.relaxed) this.settings.notification.relaxed = lines; else this.settings.notification.lines = lines;
  }
  /** What the notification shows, for the phone (lines.ts LinePrefs + the widget choice); sent when it changes.
   * `relaxed`: the widget and tile show the first lines too, never the crit verdict. */
  get linePrefs (): LinePrefs & { widget: boolean, relaxed: boolean } {
    const n = this.settings.notification;
    const sv = this.settings.savingFor[0];
    return {
      order: n.order, lines: this.modeLines.filter(([, on]) => on).map(([id]) => id), widget: n.widget, relaxed: this.relaxed,
      savingFor: sv ? { name: sv.name, price: sv.price * (sv.count || 1) } : null,
      allocateTo: this.settings.allocateTo || null,
    };
  }
  private linesSent = '';
  sendLines () {
    if (!native.available || !this.remember || !this.creds) return;
    const p = JSON.stringify(this.linePrefs);
    if (p === this.linesSent) return;
    this.linesSent = p;
    native.setLines(this.linePrefs);
  }
  /** a full read (user and tasks together) is waiting to go to the phone's notification */
  private extrasPending = false;
  private saveRecord () { this.record.log = this.record.log.slice(-200); save(K.record, this.record); }
  /** The journal on the device belongs to one account; another account's is never shown. */
  private loadJournal () {
    const j = load<{ userId?: string, entries?: JournalEntry[], records?: unknown }>(K.journal, {});
    const mine = !!j.userId && j.userId === this.creds?.userId;
    this.journal = mine && Array.isArray(j.entries) ? j.entries : [];
    this.records = mine && validRecords(j.records) ? j.records : recordsOf(this.journal);
  }
  private saveJournal () {
    this.journal = this.journal.slice(-JOURNAL_MAX);
    if (this.remember && this.creds) save(K.journal, { userId: this.creds.userId, entries: this.journal, records: this.records });
  }
  clearJournal () { this.journal = []; this.records = undefined; drop(K.journal); this.emit(); }

  /** From a backup file (backup.ts): settings, the prediction record and, for the same account, the crit journal and its records. */
  adoptBackup (b: { settings?: unknown, record?: unknown, journal?: JournalEntry[], records?: unknown }) {
    if (b.settings) {
      const next = normalizeSettings(b.settings);
      // night gear's pause belongs to this phone's night gear (mode.ts setMode), not to the phone the file came from
      if (this.settings.nightPaused) next.nightPaused = true; else delete next.nightPaused;
      // and the mode was chosen on this phone at login
      if (this.settings.mode) next.mode = this.settings.mode;
      this.settings = next;
      this.linesSent = '';
      save(K.settings, this.settings);
      this.sendLines();
    }
    if (b.record) { this.record = normalizeRecord(b.record); this.saveRecord(); }
    if (b.journal) {
      this.journal = b.journal;
      // the records outlive the journal's oldest entries, so the file's own are kept when they are whole
      this.records = validRecords(b.records) ? b.records : recordsOf(this.journal);
      this.saveJournal();
    }
    this.forceMemo.clear();
    this.emit();
  }

  private saveRestore () { if (this.restore) save(K.restore, this.restore); else drop(K.restore); }

  get loggedIn () { return !!this.creds && !this.loggingIn; }
  get dead () { return !!this.snap && this.snap.state.hp <= 0; }
  get needsCron () { return !!this.snap?.needsCron; }
  /** Actions that score or cast wait while the player is dead or a new day is pending. */
  get paused () { return this.dead || this.needsCron; }

  /** `via`: the made-up account's stand-in for habitica.com (demo-account.ts); a real login goes to API_BASE. */
  async login (creds: Credentials, remember: boolean, via?: { base: string, send: Send }) {
    this.session += 1;
    this.api = via ? new HabiticaApi(creds, via.base, via.send) : new HabiticaApi(creds, API_BASE);
    this.creds = creds; this.remember = remember; this.authError = undefined; this.lastError = undefined; this.refused = undefined;
    this.loggingIn = true;
    try {
      await this.sync({ throwErrors: true });
    } catch (e) {
      this.creds = undefined; this.api = undefined; this.raw = undefined; this.snap = undefined; this.tasks = [];
      throw e;
    } finally {
      this.loggingIn = false;
    }
    if (native.available) {
      if (remember && !await native.setCredentials(creds.userId, creds.apiToken, HabiticaApi.clientFor(creds))) this.remember = false;
      if (!this.remember) void native.clearCredentials();
    } else if (remember) save(K.creds, creds); else drop(K.creds);
    // the journal only lives on the device with "Remember on this device"
    if (this.remember) this.loadJournal(); else drop(K.journal);
    this.extrasPending = true;
    this.linesSent = '';
    this.sendLines();
    this.saveCache();
    this.emit();
  }

  logout (reason?: string) {
    // the made-up account: everything of it is forgotten by starting over, on the login screen
    if (demo) { leaveDemo(); return; }
    drop(K.creds); drop(K.cache); drop(K.restore);
    // Habitica refusing the token (reset elsewhere): the same player reconnects, so their crit journal and repeating
    // To-Dos stay, kept by User ID (another account never sees them); logging out yourself takes everything (Vlad, 2026-10-17)
    if (!reason) { drop(K.repeats); drop(K.journal); drop(K.almanac); }
    if (native.available) void native.clearCredentials(!!reason);
    // logging out (not Habitica refusing the token, where the same player reconnects): the next login asks Full or Relaxed
    // again, nothing preselected, as on a first login (Vlad, 2026-10-14). Night gear stays as Relaxed left it (off), so
    // choosing Full doesn't switch an automatic write back on for whoever logs in next
    if (!reason && (this.settings.mode || this.settings.nightPaused)) { delete this.settings.mode; delete this.settings.nightPaused; save(K.settings, this.settings); }
    // answers still on their way belong to the old session and must not refill anything
    this.session += 1; this.remember = false; this.linesSent = ''; this.rawTasks = []; this.extrasPending = false; this.restore = null; this.resyncWanted = false;
    this.creds = undefined; this.api = undefined; this.raw = undefined; this.snap = undefined; this.tasks = []; this.party = null; this.partyMembers = [];
    this.journal = []; this.records = undefined; this.plannedSeed = undefined;
    this.fromCache = false; this.offline = false; this.authError = reason; this.lastError = undefined; this.refused = undefined;
    this.syncedAt = 0; this.tasksReadAt = 0; this.lastServerAt = 0; this.autoHoldUntil = 0; this.shop = EMPTY_SHOP; this.shopFetchedAt = 0; this.partyFetchedAt = 0;
    this.emit();
  }

  forgetRecord () { this.record = { ...EMPTY_RECORD, log: [] }; this.saveRecord(); this.emit(); }

  /* ---------------------------------------------------------------- reading */

  private setRaw (raw: Json) {
    // only the logged-in account's own data (a late answer after logout or an account switch is dropped)
    if (!this.creds || (raw?._id && raw._id !== this.creds.userId)) return;
    this.rawSeq += 1;
    this.raw = raw;
    this.snap = snapshotFromUser(raw);
    this.lastServerAt = Date.now();
    this.fromCache = false;
  }

  /** Merge a partial response (stats and/or items) into the last full user object. */
  private merge (part: Json) {
    if (!this.raw) return;
    const raw = { ...this.raw };
    if (part.stats) raw.stats = { ...part.stats };
    if (part.items) raw.items = part.items;
    if (part.flags) raw.flags = part.flags;
    // max MP only comes with a full read; after any change it may be out of date
    if (raw.stats) raw.stats = { ...raw.stats, maxMP: undefined };
    this.setRaw(raw);
    this.saveCache();
  }

  /** On-device copy of the last numbers (only when the player chose "Remember on this device"). */
  private saveCache () {
    if (!this.remember || !this.raw || !this.creds) return;
    const r = this.raw;
    const trimmed = {
      _id: r._id, id: r.id, profile: { name: r.profile?.name }, auth: { local: { username: r.auth?.local?.username } },
      stats: r.stats, preferences: r.preferences, flags: { classSelected: r.flags?.classSelected },
      items: { gear: { equipped: r.items?.gear?.equipped, costume: r.items?.gear?.costume, owned: r.items?.gear?.owned }, currentMount: r.items?.currentMount, currentPet: r.items?.currentPet, food: r.items?.food, eggs: r.items?.eggs, hatchingPotions: r.items?.hatchingPotions, special: r.items?.special, pets: r.items?.pets, mounts: r.items?.mounts, lastDrop: r.items?.lastDrop },
      // the earned achievements (true/false flags) too: the Stable's trophies (stable/trophies.ts)
      achievements: { ...trueFlags(r.achievements), quests: r.achievements?.quests, completedTask: r.achievements?.completedTask, streak: r.achievements?.streak, rebirths: r.achievements?.rebirths, perfect: r.achievements?.perfect },
      // what the Stable grows from (stable/growth.ts)
      loginIncentives: r.loginIncentives,
      // a subscriber or not, never the payment provider's customer ID (as LastRead.java keeps it)
      contributor: { level: r.contributor?.level }, party: { _id: r.party?._id, quest: r.party?.quest }, tasksOrder: { dailys: r.tasksOrder?.dailys }, purchased: { plan: { customerId: r.purchased?.plan?.customerId ? 'yes' : undefined, gemsBought: r.purchased?.plan?.gemsBought, consecutive: { gemCapExtra: r.purchased?.plan?.consecutive?.gemCapExtra } } },
      needsCron: r.needsCron, lastCron: r.lastCron,
      // when the day changes ran, for reading Daily history (engine/history.ts)
      history: { exp: (r.history?.exp || []).filter((e: Json) => Date.parse(e?.date) > Date.now() - HISTORY_DAYS * 864e5).map((e: Json) => ({ date: e.date })) },
    };
    const tasks = this.tasks.map(t => ({
      ...(t.schedule || {}), _id: t.id, text: t.text, notes: t.notes, type: t.type, value: t.value, priority: t.priority, streak: t.streak, attribute: t.attribute,
      completed: t.completed, up: t.up, down: t.down, isDue: t.isDue, yesterDaily: t.yesterDaily, checklist: t.checklist, history: t.history,
      challenge: t.challenge ? { id: 'c' } : t.noCast && !t.team ? { id: 'c', broken: 'x' } : {}, group: t.team ? { id: 'g', broken: t.brightnessSkip ? undefined : 'x' } : {},
      // a group task without the player's userId is on the team board (UiTask.board)
      userId: t.board ? undefined : this.snap?.userId,
    }));
    const at = this.syncedAt || Date.now();
    save(K.cache, { raw: trimmed, tasks, party: this.party ? { quest: this.party.quest } : null, at });
    // the notification, widget and tile show the same numbers (only with "Remember", like this copy)
    if (native.available) {
      native.reportRead(trimmed, this.lastServerAt || at);
      this.sendNightPlan();
      // the Dailies and the party only after a full read, when they are as new as the numbers
      if (this.extrasPending) { this.extrasPending = false; native.reportExtras(trimTasks(this.rawTasks, this.snap?.userId), this.party ? trimParty(this.party) : null, this.partyFetchedAt); }
    }
  }

  /**
   * The night gear swap runs on the phone without the app (android NightSwap): it gets the two loadouts worked
   * out here, with the gear they start from, and skips the night if the gear worn then is different.
   */
  private nightPlanSent = '';
  private sendNightPlan () {
    const ctx = this.gearCtx;
    if (!ctx || !this.snap) return;
    const plan = JSON.stringify({ userId: this.snap.userId, expect: ctx.equipped, ...nightLoadouts(ctx, this.snap.state.cls) });
    if (plan === this.nightPlanSent) return;
    this.nightPlanSent = plan;
    native.setNightPlan(plan);
  }

  /** Full read: user and tasks, plus party (every 5 min) and seasonal shop (every 6 h). */
  async sync (opts: { throwErrors?: boolean, quiet?: boolean } = {}): Promise<boolean> {
    const api = this.api;
    if (!api) return false;
    const sid = this.session;
    this.begin();
    const startedAt = Date.now();
    try {
      const [user, tasks] = await Promise.all([api.getUser(), api.getTasks()]);
      if (sid !== this.session) return false;
      this.setRaw(user);
      this.tasks = tasks.map(t => taskFromApi(t, user._id));
      this.rawTasks = tasks;
      this.extrasPending = true;
      const extra: Promise<unknown>[] = [];
      const now = Date.now();
      if (!user.party?._id) { this.party = null; this.partyMembers = []; } else if (now - this.partyFetchedAt > 5 * 60e3 || !this.party) {
        extra.push(api.getParty().then(p => { if (sid === this.session) { this.party = p; this.partyFetchedAt = Date.now(); } }).catch(() => { /* keep the last one */ }));
        extra.push(api.getPartyMembers().then(ms => { if (sid === this.session) this.partyMembers = ms.map(memberFromApi); }).catch(() => { /* keep the last ones */ }));
      }
      if (now - this.shopFetchedAt > 6 * 3600e3) {
        extra.push(api.getSeasonalShop().then(s => { if (sid === this.session) { this.shop = seasonalFromShop(s); this.shopFetchedAt = Date.now(); } }).catch(() => { /* keep the last one */ }));
      }
      await Promise.all(extra);
      if (sid !== this.session) return false;
      this.syncedAt = Date.now();
      this.tasksReadAt = startedAt;
      this.changedElsewhere = false;
      this.offline = false;
      this.lastError = undefined;
      this.refused = undefined;
      this.serverFailures = 0; this.serverWaitUntil = 0;
      this.dropStaleRestore();
      this.saveCache();
      return true;
    } catch (e) {
      if (sid !== this.session) return false;
      if (opts.throwErrors) throw e;
      this.handleError('Sync', e, opts.quiet, true);
      return false;
    } finally {
      this.end();
    }
  }

  /** Sync if the numbers may be out of date (app came back to the foreground, long pause). */
  async syncIfStale (maxAgeMs = 30_000): Promise<boolean> {
    if (!this.api || this.busy || this.refused) return false;
    if (!this.changedElsewhere && Date.now() - this.lastServerAt < maxAgeMs) return false;
    if (this.budget() < 6) return false;
    return this.sync({ quiet: true });
  }

  /**
   * The automatic re-read while the app is on screen: one GET /user, at most every 60 s and never within 30 s
   * of another automatic call (Habitica's rule for background automation). If the numbers moved (a tap in
   * another app, a party member's skill), the tasks are re-read on the next automatic turn, 30 s later.
   */
  async autoRead (): Promise<void> {
    const api = this.api;
    if (!api || this.busy || !this.snap || this.refused || this.budget() < 10) return;
    const now = Date.now();
    if (this.lastAutoAt > now) this.lastAutoAt = 0; // the clock went back
    if (now - this.lastAutoAt < AUTO_GAP_MS || now < this.serverWaitUntil) return;
    // the phone's own automatic calls (night gear, the 15-minute refresh, the Habitica-closed read) count for the 30 s spacing too
    if (native.available && (Date.now() < await native.nextAutoAt() || this.busy)) return;
    // offline: try a full read once a minute, so a dropped connection recovers without a tap
    if (this.offline) {
      if (now - this.lastAutoAt < AUTO_READ_MS) return;
      this.lastAutoAt = now;
      await this.sync({ quiet: true });
      return;
    }
    // tasks may have moved (seen by a light read), or the app was away and the player may have used another one:
    // only a full read clears either, so a light read would leave the screen on "Checking…"
    if (this.tasksStale || this.changedElsewhere) {
      this.lastAutoAt = now;
      if (await this.sync({ quiet: true })) this.tasksStale = false;
      return;
    }
    if (now - this.lastServerAt < AUTO_READ_MS && now >= this.lastServerAt) return;
    this.lastAutoAt = now;
    const sid = this.session;
    const seq = this.rawSeq;
    const before = this.snap;
    // no busy state: a tap made meanwhile goes through, and this answer is dropped if that tap's answer is newer
    try {
      const user = await api.getUser();
      if (sid !== this.session || seq !== this.rawSeq) return;
      this.setRaw(user);
      this.saveCache();
      const after = this.snap;
      const moved = !after || seedOf(before.state) !== seedOf(after.state) || JSON.stringify(before.equipped) !== JSON.stringify(after.equipped) || before.needsCron !== after.needsCron;
      if (moved) this.tasksStale = true;
      this.offline = false;
      this.serverFailures = 0; this.serverWaitUntil = 0;
      this.dropStaleRestore();
    } catch (e) {
      if (sid === this.session) this.handleError('Sync', e, true, true);
    }
    this.emit();
    setTimeout(() => this.afterIdle(), 0);
  }

  /**
   * An automatic full read outside the 60 s turn (the connection came back, Habitica's day changed): kept to the same
   * spacing as every automatic call, the phone's own included, and never while Habitica refuses or is failing.
   */
  async autoSync (): Promise<boolean> {
    if (!this.api || this.busy || this.refused || this.budget() < 6) return false;
    const now = Date.now();
    if (now - this.lastAutoAt < AUTO_GAP_MS || now < this.serverWaitUntil) return false;
    if (native.available && Date.now() < await native.nextAutoAt()) return false;
    this.lastAutoAt = Date.now();
    return this.sync({ quiet: true });
  }

  private async refetchUser () {
    const api = this.api;
    if (!api) return;
    this.setRaw(await api.getUser());
    this.saveCache();
  }

  /* ---------------------------------------------------------------- derived */

  get state (): State | undefined { return this.snap?.state; }
  /** Active boss quest in the party (collection quests and invitations don't count). */
  // and the player is in it: someone who didn't join does no damage (group.js _isOnQuest, quest.members)
  get bossActive (): boolean {
    const q = this.party?.quest;
    if (!q?.active || !ITEMS.bossQuests?.[q.key]) return false;
    const uid = this.snap?.userId;
    return q.members && uid && uid in q.members ? q.members[uid] === true : this.raw?.party?.quest?.key === q.key;
  }
  get objective (): Objective {
    if (this.settings.objective !== 'auto') return this.settings.objective;
    const s = this.snap?.state;
    if (!s || !s.classSelected) return 'xp';
    if (s.cls === 'warrior') return this.bossActive ? 'damage' : 'xp';
    return s.cls === 'rogue' ? 'gold' : 'xp';
  }
  get verdict () { return this.state ? verdicts(this.state) : undefined; }
  /** What the player owns and wears, for the class plans' gear choices. */
  get gearCtx (): GearContext | undefined {
    return this.snap ? { equipped: this.snap.equipped, owned: this.snap.owned, table: GEAR, meta: ITEMS.gear } : undefined;
  }
  /** Gear swapped by the app and not put back yet; `armed`: for a crit, so it goes back by itself once used. */
  get restorePending (): { armed: boolean } | null {
    return this.restoreTodo().length ? { armed: this.restore?.armedSeed !== undefined } : null;
  }
  get gearIssue () { return this.snap ? gearCheck(this.snap) : { ok: true }; }
  get inventory () {
    return this.snap ? inventoryFor(this.snap, this.tasks, this.shop, this.settings.savingFor, this.settings.allow, this.settings.allocateTo, this.settings.keepItems, this.settings.protectStable) : undefined;
  }
  /** Requests left in Habitica's 30-per-minute window (the window resets at X-RateLimit-Reset). */
  budget (): number {
    const r = this.api?.rate;
    if (!r) return 30;
    // after a 429, nothing until Retry-After has passed; then the window has refilled
    if (r.retryAt) return r.retryAt > Date.now() ? 0 : r.limit ?? 30;
    if (r.remaining === undefined) return r.limit ?? 30;
    if (r.reset && Date.parse(r.reset) < Date.now()) return r.limit ?? 30;
    return r.remaining;
  }
  /** Seconds until the request window refills (0 if unknown or already open). */
  budgetResetIn (): number {
    const r = this.api?.rate;
    if (!r) return 0;
    // after a 429 Retry-After decides, as in budget(); the window's reset may be later than that
    const at = r.retryAt || (r.reset ? Date.parse(r.reset) || 0 : 0);
    return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  }
  // a read "in the future" means the phone's clock went back since: not fresh (lines.ts says the same)
  isFresh (): boolean { const age = Date.now() - this.lastServerAt; return !this.changedElsewhere && !this.fromCache && age >= 0 && age < FRESH_MS; }
  /**
   * live: read from Habitica within the last 90 s (and nothing happened elsewhere since) — only then does the app
   * show a crit as certain; checking: older or from the on-device copy, a read is due; offline: no connection.
   */
  get connection (): Connection { return this.offline ? 'offline' : this.isFresh() ? 'live' : 'checking'; }
  get live (): boolean { return this.connection === 'live'; }
  /** Habitica reports a newer version than the rules were checked against. */
  get newerHabitica (): string | undefined {
    const v = this.api?.appVersion;
    if (!v) return undefined;
    const n = (x: string) => x.replace(/^v/, '').split('.').map(p => Number(p) || 0);
    const [a, b] = [n(v), n(RULES.checkedAgainst)];
    for (let i = 0; i < 3; i += 1) { if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0) ? v : undefined; }
    return undefined;
  }

  private forceMemo = new Map<string, { already: boolean, options: ForceOption[] }>();
  /** Cheapest ways to make the next roll crit, memoised on everything the search reads. */
  force (roll: RollKey = 'task'): { already: boolean, options: ForceOption[] } | undefined {
    const s = this.state; const inv = this.inventory;
    if (!s || !inv) return undefined;
    const key = JSON.stringify([roll, s, inv.sellables, this.snap?.equipped, this.snap?.owned.length, inv.rewards, inv.targets.map(t => t.value), inv.savingFor, inv.seasonal, inv.allow, inv.allocateTo, inv.badHabits.map(t => t.value), inv.done?.map(t => [t.id, t.value, t.streak, t.checked])]);
    const hit = this.forceMemo.get(key);
    if (hit) return hit;
    const res = forceOptions(s, inv, roll, { max: 8 });
    if (this.forceMemo.size > 20) this.forceMemo.clear();
    this.forceMemo.set(key, res);
    return res;
  }

  /**
   * A drop from a score (the response's _tmp.drop): the same bookkeeping randomDrop does, so drops left today
   * stays right until the next read brings the real numbers. Returns the item's name, or '' when nothing dropped.
   */
  private noteDrop (drop: Json | undefined): string {
    if (!drop || !this.raw || typeof drop.key !== 'string') return '';
    const kind = ({ Food: 'food', Egg: 'eggs', HatchingPotion: 'hatchingPotions' } as const)[drop.type as 'Food' | 'Egg' | 'HatchingPotion'];
    if (!kind) return '';
    const items = { ...(this.raw.items || {}) };
    items[kind] = { ...(items[kind] || {}), [drop.key]: (Number(items[kind]?.[drop.key]) || 0) + 1 };
    items.lastDrop = { date: Date.now(), count: (Number(items.lastDrop?.count) || 0) + 1 };
    this.merge({ items });
    return itemName(kind, drop.key);
  }

  /** Drops left today (randomDrop's daily cap). */
  dropsLeft (): { left: number, cap: number, used: number } | null {
    return this.state && this.snap ? dropsLeft(this.state, this.snap.drops) : null;
  }

  /** The drop chance of scoring each open task now, with the crit it would land. */
  dropOdds (): Map<string, DropOdds> {
    const m = new Map<string, DropOdds>();
    const s = this.state; const a = this.snap?.drops;
    if (!s || !a) return m;
    const now = Date.now();
    for (const t of this.tasks) if (t.type !== 'reward' && ((t.type === 'habit' && t.up) || (t.type !== 'habit' && !t.completed))) m.set(t.id, dropOdds(s, t, a, now));
    return m;
  }

  /** Which pets the food held raises into mounts, and what to hatch. Advice only. */
  feedingPlan (): FeedingPlan | null {
    const sn = this.snap;
    if (!sn) return null;
    // worked out once per read: a stable with every egg and potion takes a while, and each render asks twice
    if (this.planFor !== sn) {
      this.planFor = sn;
      this.plan = feedingPlan({ pets: sn.pets, mounts: sn.mounts, food: sn.items.food, eggs: sn.items.eggs, hatchingPotions: sn.items.hatchingPotions }, STABLE);
    }
    return this.plan;
  }
  private planFor: Snapshot | undefined;
  private plan: FeedingPlan | null = null;

  /** What logging each bad habit (−) would do now: the HP it costs. */
  downPreviews (): Map<string, TaskPreview> {
    const m = new Map<string, TaskPreview>();
    const s = this.state;
    if (!s) return m;
    for (const p of taskPreviews(s, this.tasks.filter(t => t.type === 'habit' && t.down), 'down')) m.set(p.id, p);
    return m;
  }

  previews (): Map<string, TaskPreview> {
    const m = new Map<string, TaskPreview>();
    const s = this.state;
    if (!s) return m;
    const open = this.tasks.filter(t => t.type !== 'reward' && ((t.type === 'habit' && t.up) || (t.type !== 'habit' && !t.completed)));
    for (const p of taskPreviews(s, open, 'up')) m.set(p.id, p);
    return m;
  }

  /**
   * When the next Habitica day starts: preferences.dayStart in the account's time zone (preferences.timezoneOffset).
   * Habitica's own apps send the phone's zone with every request and Habitica moves the account to it; this app
   * doesn't, so after travel, a clock change or a desktop elsewhere, the account's zone is the one cron uses.
   */
  nextDayStart (now = new Date()): number {
    const dayStart = Math.min(23, Math.max(0, Math.floor(Number(this.raw?.preferences?.dayStart) || 0)));
    return now.getTime() + untilDayChange(now.getTime(), this.utcOffsetMin(now), dayStart);
  }

  /** The account's zone when it isn't the phone's (half an hour or more apart), as "UTC+3", else null. */
  zoneMismatch (now = new Date()): { account: string, phone: string } | null {
    const o = this.raw?.preferences?.timezoneOffset;
    if (typeof o !== 'number' || !Number.isFinite(o)) return null;
    const phone = -now.getTimezoneOffset();
    if (Math.abs(-o - phone) < 30) return null;
    const utc = (m: number) => `UTC${m < 0 ? '−' : '+'}${Math.floor(Math.abs(m) / 60)}${Math.abs(m) % 60 ? `:${String(Math.abs(m) % 60).padStart(2, '0')}` : ''}`;
    return { account: utc(-o), phone: utc(phone) };
  }

  /** The account's offset from UTC in minutes (east positive), the phone's until the account says. */
  utcOffsetMin (now = new Date()): number {
    const o = this.raw?.preferences?.timezoneOffset;
    return typeof o === 'number' && Number.isFinite(o) ? -o : -now.getTimezoneOffset();
  }

  /* ---------------------------------------------------------------- self-check */

  private check (action: string, predicted: State | null, crit: boolean | null, actualCrit: boolean | null, fresh: boolean) {
    if (!predicted || !this.state) return;
    const diff = seedDiff(predicted, this.state);
    const critBad = crit !== null && actualCrit !== null && crit !== actualCrit;
    const ok = !diff.length && !critBad;
    // in a party, a member's Blessing or Ethereal Surge, or the boss hitting everyone, moves HP and MP at any moment:
    // a miss in those alone is no evidence of a rule change
    if (!ok && !critBad && this.raw?.party?._id && diff.every(d => d.startsWith('hp ') || d.startsWith('mp '))) fresh = false;
    this.record.predicted += 1;
    if (ok) this.record.matched += 1;
    const detail = ok ? undefined : [...diff, critBad ? `crit predicted ${crit}, got ${actualCrit}` : ''].filter(Boolean).join(', ');
    this.record.log.push({ t: Date.now(), action, ok, detail, fresh });
    if (!ok) {
      this.lastMismatch = `${action}: ${detail}`;
      // something moved that we didn't see (or a rule changed): re-read the truth once the current action is over
      this.wantResync();
    }
    this.saveRecord();
  }

  /** Two misses among the last ten checks that started from fresh numbers, within a day: a rule may have changed. */
  get drift (): boolean {
    const now = Date.now();
    const recent = this.record.log.filter(e => e.fresh !== false && now - e.t < DRIFT_WINDOW_MS).slice(-10);
    return recent.filter(e => !e.ok).length >= 2;
  }

  /* ---------------------------------------------------------------- running actions */

  private begin () { this.depth += 1; this.busy = true; this.emit(); }
  private end () {
    this.depth = Math.max(0, this.depth - 1);
    if (this.depth === 0) {
      this.busy = false;
      if (this.resyncWanted) this.flushResync();
      else setTimeout(() => this.afterIdle(), 0);
    }
    this.emit();
  }

  /** Follow-ups that run once nothing else is: putting swapped gear back, starting a day with nothing to record. */
  private afterIdle () {
    if (this.busy || !this.snap || this.offline || !this.api || this.refused) return;
    // one that failed waits a minute: Habitica refusing it again at once would turn this into a request loop
    if (Date.now() < this.autoHoldUntil || this.budget() < 6) return;
    // the crit a gear swap was for has been used (or cancelled by some other change): put the gear back
    const r = this.restore;
    if (this.settings.autoRestore && r && r.armedSeed !== undefined && r.userId === this.snap.userId && !this.autoRestoring
      && seedOf(this.snap.state) !== r.armedSeed && this.restoreTodo().length && !this.dead) {
      this.autoRestoring = true;
      this.restoreGear().then(ok => { if (!ok) this.holdAuto(); }).finally(() => { this.autoRestoring = false; });
      return;
    }
    // the official web client starts the day by itself when there is nothing to ask about
    if (this.needsCron && this.live && !this.dead && this.yesterdailies().length === 0 && !this.autoStarting) {
      this.autoStarting = true;
      this.startDay([], true).then(ok => { if (!ok && this.needsCron) this.holdAuto(); }).finally(() => { this.autoStarting = false; });
    }
  }
  private autoStarting = false;
  /** no automatic follow-up before this time (ms), after one failed */
  private autoHoldUntil = 0;
  private holdAuto () { this.autoHoldUntil = Date.now() + 60_000; }
  /** A re-read never runs alongside a multi-step action: it waits until the action is over. */
  private wantResync () { this.resyncWanted = true; if (this.depth === 0) this.flushResync(); }
  private flushResync () {
    this.resyncWanted = false;
    if (!this.api || this.refused || this.budget() < 6) return;
    setTimeout(() => { if (!this.busy && this.api) this.sync({ quiet: true }); }, 0);
  }

  private handleError (label: string, e: unknown, quiet = false, fromSync = false) {
    this.lastError = e instanceof Error ? e.message : String(e);
    if (e instanceof ApiError) {
      if (e.code === 'invalid_credentials') {
        this.logout('Habitica no longer accepts this User ID and API Token (it may have been reset). Please connect again.');
        return;
      }
      if (e.code === 'network') { this.offline = true; if (!quiet) this.notify({ text: 'You’re offline. Showing the last numbers Sidekick saw.', error: true }); return; }
      // Habitica refusing the app or the account itself: say so once, in Habitica's words, and stop calling by itself
      if (e.status === 403 || (fromSync && e.status === 401)) {
        const first = !this.refused;
        this.refused = e.message || 'Habitica refused the request.';
        if (first || !quiet) this.notify({ text: this.refused, error: true });
        return;
      }
      // Habitica failing: automatic reads back off (1, 2, 4, 8 then every 10 minutes) until one works
      if (fromSync && e.status >= 500) {
        this.serverFailures += 1;
        this.serverWaitUntil = Date.now() + Math.min(10, 2 ** (this.serverFailures - 1)) * 60_000;
      }
      // rate limiting explains itself; everything else says what it was doing
      if (!quiet) this.notify({ text: e.status === 429 ? e.message : `${label}: ${e.message}`, error: true });
      // an action refused because our copy is out of date: re-read (never after a failed re-read, which would loop)
      if (!fromSync && e.status !== 429 && (e.status === 401 || e.status === 404 || e.message.includes('outdated'))) this.wantResync();
      return;
    }
    if (!quiet) this.notify({ text: `${label}: ${(e as Error)?.message || e}`, error: true });
  }

  private async attempt<T> (label: string, fn: () => Promise<T>, quiet = false): Promise<Res<T>> {
    if (!this.api) return { ok: false };
    const sid = this.session;
    this.begin();
    try {
      return { ok: true, value: await fn() };
    } catch (e) {
      // logged out meanwhile: nothing to report
      if (sid === this.session) this.handleError(label, e, quiet);
      return { ok: false, error: e };
    } finally {
      this.end();
    }
  }

  /** Taps are ignored while another action is running, so a double tap can't send two requests from one state. */
  private guard (what: 'score' | 'cast' | 'other'): string | null {
    if (!this.api || !this.snap) return 'Not connected.';
    if (this.busy) return 'busy';
    if (this.offline) return 'You’re offline.';
    if (this.dead && what !== 'other') return 'You’re out of HP. Revive first.';
    if (this.needsCron && what !== 'other') return 'Start the new day first.';
    return null;
  }

  private refuse (reason: string | null): boolean {
    if (!reason) return false;
    // a tap while another request runs sends nothing, and says so (rows other than the one being sent stay live)
    this.notify(reason === 'busy' ? { text: 'One moment…' } : { text: reason, error: true });
    return true;
  }

  /* ---------------------------------------------------------------- actions */

  async score (task: UiTask, direction: 'up' | 'down') {
    if (this.refuse(this.guard('score'))) return false;
    this.sendingFor = task.id;
    try { return (await this._score(task, direction)).ok; } finally { this.sendingFor = undefined; this.emit(); }
  }

  /** a bad habit logged by a tap, waiting out its Undo */
  private pendingDown?: { id: string, session: number, timer: ReturnType<typeof setTimeout> };
  get loggingId (): string | undefined { return this.pendingDown?.id; }

  /**
   * The player's own "−" tap on a habit: no confirmation (their own action, as in Habitica's apps), but Habitica
   * has no undo for a habit scored down, so the request waits LOG_GRACE_MS with Undo in the snackbar and nothing
   * is sent if Undo is tapped. Leaving the app, or a second log, sends a waiting one at once.
   */
  logDown (task: UiTask) {
    const g = this.guard('score');
    if (g && g !== 'busy') { this.refuse(g); return; }
    void this.flushDown();
    const id = task.id;
    this.pendingDown = { id, session: this.session, timer: setTimeout(() => { void this.flushDown(); }, LOG_GRACE_MS) };
    const hp = this.downPreviews().get(id)?.dHp;
    this.notify({
      text: `Logging “${task.text}”${hp ? ` · ${hpText(hp)}` : ''}`, ms: LOG_GRACE_MS,
      action: { label: 'Undo', run: () => {
        if (this.pendingDown?.id !== id) { this.notify({ text: 'Already sent to Habitica.' }); return; }
        clearTimeout(this.pendingDown.timer); this.pendingDown = undefined;
        this.notify({ text: 'Not logged.' });
      } },
    });
  }

  /** Send a waiting bad-habit log now (after any request already running). */
  async flushDown () {
    const p = this.pendingDown;
    if (!p) return;
    clearTimeout(p.timer); this.pendingDown = undefined;
    for (let i = 0; i < 300 && this.busy; i++) await new Promise(res => setTimeout(res, 100));
    const t = this.tasks.find(x => x.id === p.id);
    if (p.session !== this.session || !t) return;
    await this.score(t, 'down');
  }

  private async _score (task: UiTask, direction: 'up' | 'down', opts: { quiet?: boolean } = {}): Promise<Res<Json>> {
    const fresh = this.isFresh();
    return this.attempt(task.text || 'Score', async () => {
      const before = this.state!;
      let pred: ReturnType<typeof scoreTask> | null = null;
      try { pred = scoreTask(before, task, direction); } catch { pred = null; }
      const res = await this.api!.score(task.id, direction);
      this.merge({ stats: res });
      const dropped = direction === 'up' ? this.noteDrop(res._tmp?.drop) : '';
      const actualCrit = !!res._tmp?.crit;
      if (actualCrit && direction === 'up' && task.type !== 'reward') { this.record.crits += 1; this.addToJournal(before, task, Number(res._tmp.crit)); }
      if (direction === 'up') this.plannedSeed = undefined;
      const i = this.tasks.findIndex(t => t.id === task.id);
      if (i >= 0) {
        const t = { ...this.tasks[i] };
        // the engine's task value is exact (for unchecking, the server's returned delta is not the value change)
        if (t.type !== 'reward') t.value = pred ? pred.task.value : t.value + (Number(res.delta) || 0);
        if (t.type === 'daily') { t.streak += direction === 'up' ? 1 : -1; t.completed = direction === 'up'; }
        t.history = this.historyAfterScore(t, direction);
        if (t.type === 'todo') t.completed = direction === 'up';
        this.tasks = this.tasks.map((x, j) => (j === i ? t : x));
      }
      // team tasks can move another member's stats when unchecked, so they aren't checked; Habitica answers an unchecked
      // team task with numbers from before its own rollback (libs/tasks/index.js), so they aren't trusted until a re-read
      if (task.team && direction === 'down') this.changedElsewhere = true;
      if (!task.team) this.check(`${direction === 'up' ? 'Score' : 'Undo/−'} “${task.text}”`, pred?.state ?? null, pred ? pred.crit : null, direction === 'up' && task.type !== 'reward' ? actualCrit : null, fresh);
      const s = this.state!;
      if (!opts.quiet) {
        const dExp = s.lvl > before.lvl ? `Level ${s.lvl}!` : `${s.exp - before.exp >= 0 ? '+' : '−'}${Math.abs(s.exp - before.exp)} XP`;
        const dGp = s.gp - before.gp;
        const parts = task.type === 'reward' ? [`−${task.value} Gold`] : [dExp, `${dGp >= 0 ? '+' : '−'}${Math.abs(dGp)} Gold`];
        if (s.hp !== before.hp) parts.push(`${s.hp - before.hp > 0 ? '+' : '−'}${Math.abs(s.hp - before.hp)} HP`);
        if (dropped) parts.push(`found ${dropped}`);
        const undoable = direction === 'up' && (task.type === 'daily' || task.type === 'todo');
        this.notify({
          // Relaxed never mentions crits: the result alone, as Habitica gave it
          text: `${actualCrit && direction === 'up' && task.type !== 'reward' && !this.relaxed ? `CRIT ×${Number(res._tmp.crit).toFixed(2)} · ` : ''}${parts.join(' · ')}`,
          crit: actualCrit && task.type !== 'reward' && !this.relaxed,
          action: undoable ? { label: 'Undo', run: () => { const t = this.tasks.find(x => x.id === task.id); if (t && t.completed && !this.refuse(this.guard('score'))) this._score(t, 'down'); } } : undefined,
        });
      }
      if (s.hp <= 0) this.notify({ text: 'You ran out of HP. Revive to continue.', error: true });
      return res;
    }, opts.quiet);
  }

  /**
   * Add a To-Do to Habitica: a repeating To-Do coming back (src/app/repeats.ts). Only ever on a tap. Creating a task
   * moves none of the numbers the crit roll reads, so nothing is predicted; the new To-Do joins the top of the list,
   * where Habitica puts it.
   */
  async createTodo (body: Parameters<HabiticaApi['createTodo']>[0]): Promise<UiTask | undefined> {
    if (this.refuse(this.guard('other'))) return undefined;
    const r = await this.attempt('Add To-Do', async () => {
      const t = taskFromApi(await this.api!.createTodo(body), this.snap?.userId);
      const i = this.tasks.findIndex(x => x.type === 'todo');
      this.tasks = i < 0 ? [...this.tasks, t] : [...this.tasks.slice(0, i), t, ...this.tasks.slice(i)];
      this.saveCache();
      return t;
    });
    return r.ok ? r.value : undefined;
  }

  /**
   * The ticked To-Dos (one read, quiet): when a repeating To-Do's copy left the list, was it ticked or deleted? Nobody
   * tapped for it, so it is an automatic call: 30 s after any other one, the phone's included ({ waitUntil } until then).
   */
  async completedTodos (): Promise<Json[] | { waitUntil: number } | undefined> {
    const api = this.api;
    if (!api || this.offline || this.budget() < 6) return undefined;
    const at = Math.max(this.lastAutoAt + AUTO_GAP_MS, native.available ? await native.nextAutoAt() : 0);
    if (Date.now() < at) return { waitUntil: at };
    this.lastAutoAt = Date.now();
    const sid = this.session;
    try {
      const out = await api.getCompletedTodos();
      return sid === this.session ? out : undefined;
    } catch (e) {
      if (sid === this.session) this.handleError('Read', e, true, true);
      return undefined;
    }
  }

  /** The task's history as Habitica leaves it after a score (ops/scoreTask.js), until the next read brings the real one. */
  private historyAfterScore (t: UiTask, direction: 'up' | 'down'): UiTask['history'] {
    if (!t.history || !this.snap) return t.history;
    const h = [...t.history];
    const now = Date.now();
    if (t.type === 'daily') {
      if (direction === 'up') h.push({ date: now, isDue: t.isDue, completed: true }); else h.pop();
    } else if (t.type === 'habit') {
      const last = h[h.length - 1];
      const up = direction === 'up' ? 1 : 0;
      if (last && habiticaDay(last.date, this.snap.clock) === habiticaDay(now, this.snap.clock)) {
        h[h.length - 1] = { date: now, scoredUp: (last.scoredUp || 0) + up, scoredDown: (last.scoredDown || 0) + 1 - up };
      } else h.push({ date: now, scoredUp: up, scoredDown: 1 - up });
    }
    return h;
  }

  /** A crit Habitica confirmed: what it added over the same score without it (engine/journal.ts). */
  private addToJournal (before: State, task: UiTask, mult: number) {
    if (!(mult > 1) || !this.snap) return;
    let gain = { exp: 0, gp: 0, mp: 0, dmg: 0 };
    try { gain = critExtra(before, task, mult); } catch { /* keep the crit without its gains */ }
    const at = Date.now();
    const key = this.snap.quest.key;
    const entry: JournalEntry = {
      at, day: habiticaDay(at, this.snap.clock), taskId: task.id, text: task.text, type: task.type, mult, ...gain,
      planned: this.plannedSeed !== undefined && this.plannedSeed === seedOf(before),
      boss: !!key && !!ITEMS.bossQuests[key],
    };
    this.journal.push(entry);
    this.records = addRecord(this.records, entry);
    this.saveJournal();
  }

  async checklist (task: UiTask, itemId: string) {
    if (this.refuse(this.guard('other'))) return false;
    this.sendingFor = task.id;
    const r = await this.attempt('Checklist', async () => {
      const res = await this.api!.scoreChecklist(task.id, itemId);
      const t = taskFromApi(res, this.snap?.userId);
      this.tasks = this.tasks.map(x => (x.id === t.id ? t : x));
    }).finally(() => { this.sendingFor = undefined; this.emit(); });
    return r.ok;
  }

  async cast (key: string, targetId?: string) {
    if (this.refuse(this.guard('cast'))) return false;
    return (await this._cast(key, targetId)).ok;
  }

  private async _cast (key: string, targetId?: string, quiet = false): Promise<Res<Json>> {
    const def = skillByKey(key);
    if (!def) return { ok: false };
    const fresh = this.isFresh();
    return this.attempt(def.name, async () => {
      const before = this.state!;
      const target = targetId ? this.tasks.find(t => t.id === targetId) : undefined;
      if (def.target === 'task' && (!target || target.noCast)) throw new Error('Pick one of your own tasks (not a challenge or team task).');
      let pred: ReturnType<typeof castSkill> | null = null;
      try {
        pred = castSkill(before, key, {
          targetValue: target?.value,
          taskValues: this.tasks.filter(t => !t.brightnessSkip && t.type !== 'reward').map(t => t.value),
          dailyCount: this.snap?.dailyCount,
          streaksActive: this.snap?.streaksActive,
        });
      } catch { pred = null; }
      const res = await this.api!.cast(key, targetId);
      if (def.target === 'party') await this.refetchUser(); // party buffs land in the database, not in the response
      else if (res.user) { this.setRaw({ ...res.user, needsCron: this.raw?.needsCron }); this.saveCache(); }
      if (res.task) this.tasks = this.tasks.map(t => (t.id === res.task._id || t.id === res.task.id ? taskFromApi(res.task, this.snap?.userId) : t));
      if (res.tasks) { const byId = new Map<string, Json>(res.tasks.map((t: Json) => [t._id || t.id, t])); this.tasks = this.tasks.map(t => (byId.has(t.id) ? taskFromApi(byId.get(t.id), this.snap?.userId) : t)); }
      this.check(`Cast ${def.name}`, pred?.state ?? null, null, null, fresh);
      if (!quiet) {
        const crit = pred?.crit ? ` · CRIT ×${pred.mult.toFixed(2)}` : '';
        const dmg = pred?.dmg && this.bossActive ? ` · ${pred.dmg} boss damage` : '';
        this.notify({ text: `${def.name}${crit}${dmg}`, crit: !!pred?.crit });
      }
      return res;
    }, quiet);
  }

  async potion () { if (this.refuse(this.guard('cast'))) return false; return (await this._potion()).ok; }
  private async _potion (quiet = false): Promise<Res<void>> {
    const fresh = this.isFresh();
    return this.attempt('Health Potion', async () => {
      let pred: State | null = null;
      try { pred = buyPotion(this.state!); } catch { pred = null; }
      const res = await this.api!.buyPotion();
      this.merge({ stats: res });
      this.check('Health Potion', pred, null, null, fresh);
      if (!quiet) this.notify({ text: 'Health Potion: +15 HP, −25 Gold' });
    }, quiet);
  }

  async sell (type: string, key: string, amount: number) { if (this.refuse(this.guard('other'))) return false; return (await this._sell(type, key, amount)).ok; }
  private async _sell (type: string, key: string, amount: number, quiet = false): Promise<Res<void>> {
    const fresh = this.isFresh();
    return this.attempt('Sell', async () => {
      const unit = type === 'food' ? ITEMS.food[key]?.[1] : type === 'eggs' ? ITEMS.eggs[key]?.[1] : ITEMS.hatchingPotions[key]?.[1];
      const pred: State | null = unit !== undefined ? sellItem(this.state!, unit, amount) : null;
      const res = await this.api!.sell(type, key, amount);
      this.merge(res);
      this.check(`Sell ${amount} ${key}`, pred, null, null, fresh);
    }, quiet);
  }

  async allocate (stat: StatKey) { if (this.refuse(this.guard('other'))) return false; return (await this._allocate(stat)).ok; }
  private async _allocate (stat: StatKey, quiet = false): Promise<Res<void>> {
    const fresh = this.isFresh();
    return this.attempt('Allocate', async () => {
      let pred: State | null = null;
      try { pred = allocatePoint(this.state!, stat); } catch { pred = null; }
      const res = await this.api!.allocate(stat);
      this.merge({ stats: res });
      this.check(`Allocate ${stat.toUpperCase()}`, pred, null, null, fresh);
    }, quiet);
  }

  async equip (key: string) { if (this.refuse(this.guard('other'))) return false; return (await this._equip(key)).ok; }
  private async _equip (key: string, quiet = false): Promise<Res<void>> {
    const fresh = this.isFresh();
    return this.attempt('Equip', async () => {
      const snap = this.snap!;
      const next = applyEquip(snap.equipped, key, ITEMS.gear);
      const pred = withGear(snap.state, gearFromEquipped(Object.values(next), snap.state.cls, GEAR).gear);
      const res = await this.api!.equip(key);
      this.merge({ items: res });
      this.check(`Equip ${key}`, pred, null, null, fresh);
    }, quiet);
  }

  /**
   * The Stable's Ride (on) and Get off: one tap, one call, only from the Live look, and only when the latest read
   * says the player isn't on that mount (on) or is (off), since Habitica's equip toggles. The answer is Habitica's
   * own: `now` is the mount its reply reports ('' = none), never assumed and never retried.
   */
  async ride (key: string, on: boolean): Promise<{ sent: boolean, now?: string }> {
    const g = this.guard('other');
    if (g) { this.refuse(g); return { sent: false }; }
    if (!this.live) { this.notify({ text: 'Waiting for Habitica. Try again in a moment.', error: true }); return { sent: false }; }
    const current: string = this.raw?.items?.currentMount || '';
    if (!mayToggle(current, key, on)) return { sent: false, now: current };
    const r = await this.attempt(on ? 'Ride' : 'Get off', async () => {
      const items = await this.api!.equipMount(key);
      this.merge({ items });
      return (items?.currentMount as string | undefined) || '';
    });
    return r.ok ? { sent: true, now: r.value } : { sent: true };
  }

  async buy (kind: SavingFor['kind'], key: string, price: number, count = 1) { if (this.refuse(this.guard('other'))) return false; return (await this._buy(kind, key, price, count)).ok; }
  private async _buy (kind: SavingFor['kind'], key: string, price: number, count = 1, quiet = false): Promise<Res<void>> {
    const fresh = this.isFresh();
    return this.attempt('Buy', async () => {
      const snap = this.snap!;
      let pred: State | null = null;
      try {
        if (kind === 'gear') pred = buyGear(snap.state, key, price, { autoEquip: snap.autoEquip, equipped: snap.equipped, meta: ITEMS.gear, table: GEAR }).state;
        else pred = buyWithGold(snap.state, kind === 'gems' ? 20 * count : price);
      } catch { pred = null; }
      if (kind === 'gear') this.merge(await this.api!.buyGear(key));
      else if (kind === 'special') this.merge(await this.api!.buySpecial(key));
      else if (kind === 'quest') { await this.api!.buyQuest(key); await this.refetchUser(); }
      else { await this.api!.buyGems(count); await this.refetchUser(); }
      this.check(`Buy ${key}`, pred, null, null, fresh);
      if (kind !== 'gems' && kind !== 'special') {
        this.settings.savingFor = this.settings.savingFor.filter(s => !(s.kind === kind && s.key === key));
        save(K.settings, this.settings);
      }
    }, quiet);
  }

  /**
   * Put on the gear a class plan suggests. Re-reads first and works the equip calls out again from the fresh read
   * (`plan` returns null when the suggestion no longer applies), then equips piece by piece and remembers what to
   * put back. Never spends anything.
   */
  async wearLoadout (label: string, plan: () => string[] | null): Promise<boolean> {
    const g = this.guard('other');
    if (g) { if (g !== 'busy') this.notify({ text: g, error: true }); return false; }
    if (this.budget() < 12) { this.notify({ text: `Not enough Habitica requests left this minute. Try again ${this.budgetResetIn() ? `in ${this.budgetResetIn()} s` : 'in a minute'}.`, error: true }); return false; }
    this.begin();
    try {
      if (!await this.sync({ quiet: true })) { this.notify({ text: 'Couldn’t re-read your account. Nothing was changed.', error: true }); return false; }
      const keys = plan();
      if (!keys || !keys.length) { this.notify({ text: 'Your gear or numbers changed in Habitica; this swap no longer helps.' }); return false; }
      for (const key of keys) {
        const prev = { ...(this.snap?.equipped || {}) };
        const r = await this._equip(key, true);
        if (!r.ok) { this.notify({ text: 'Habitica refused a piece; check your gear.', error: true }); return false; }
        this.noteSwap(prev);
      }
      this.notify({ text: `${label}. Put it back from Now when you’re done.` });
      return true;
    } finally {
      this.end();
    }
  }

  /**
   * Brutal Smash until the MP runs out, one request per cast (never the API's `quantity`, which checks mana once
   * and overspends). Re-reads first; `plan` re-checks the chain on the fresh numbers and says how many casts and
   * which gear. Stops at the first refusal, and at the request budget.
   */
  async smashChain (targetId: string, plan: () => { keys: string[], casts: number } | null): Promise<boolean> {
    const g = this.guard('cast');
    if (g) { if (g !== 'busy') this.notify({ text: g, error: true }); return false; }
    this.begin();
    try {
      if (this.budget() < 12) { this.notify({ text: 'Not enough Habitica requests left this minute. Try again in a minute.', error: true }); return false; }
      if (!await this.sync({ quiet: true })) { this.notify({ text: 'Couldn’t re-read your account. Nothing was changed.', error: true }); return false; }
      if (this.paused) { this.notify({ text: this.dead ? 'You’re out of HP. Revive first.' : 'Start the new day first.', error: true }); return false; }
      const p = plan();
      if (!p || !p.casts) { this.notify({ text: 'Your numbers changed in Habitica; nothing to cast now.' }); return false; }
      for (const key of p.keys) {
        const prev = { ...(this.snap?.equipped || {}) };
        const r = await this._equip(key, true);
        if (!r.ok) { this.notify({ text: 'Habitica refused a piece of gear; nothing was cast.', error: true }); return false; }
        this.noteSwap(prev);
      }
      let cast = 0; let dmg = 0; let crits = 0;
      const before = this.snap?.quest.pendingDamage ?? 0;
      while (cast < p.casts && (this.state?.mp ?? 0) >= 10 && this.budget() > 2) {
        const crit = this.state ? castSkill(this.state, 'smash', { targetValue: this.tasks.find(t => t.id === targetId)?.value }).crit : false;
        const r = await this._cast('smash', targetId, true);
        if (!r.ok) break;
        cast += 1; if (crit) crits += 1;
      }
      dmg = (this.snap?.quest.pendingDamage ?? before) - before;
      const left = p.casts - cast;
      // the damage gear has done its job: back to what was on (the same setting as after a crit swap)
      const back = p.keys.length && this.settings.autoRestore && cast > 0 && left === 0 ? await this.putBack() : false;
      this.notify({ text: `Brutal Smash ×${cast}: ${dmg} boss damage${crits ? `, ${crits} crit${crits === 1 ? '' : 's'}` : ''}.${left > 0 ? ` ${left} left for when Habitica allows more requests.` : ''}${back ? ' Your gear is back as it was.' : ''}`, crit: crits > 0 });
      return cast > 0;
    } finally {
      this.end();
    }
  }

  /**
   * Run a crit suggestion. First re-reads the account (the player may have acted elsewhere since the
   * suggestion was computed) and only continues if the same suggestion still works; then runs the steps
   * in order and stops at the first one Habitica refuses.
   */
  async runPlan (opt: ForceOption, roll: RollKey = 'task'): Promise<PlanResult> {
    const g = this.guard('cast');
    if (g) { if (g !== 'busy') this.notify({ text: g, error: true }); return { status: 'blocked', reason: g }; }
    // re-read (user + tasks, sometimes party and shop) + one request per step + re-reads some steps need
    const refetches = opt.steps.filter(st => (st.kind === 'cast' && skillByKey(st.spellId)?.target === 'party') || (st.kind === 'buy' && (st.buyKind === 'quest' || st.buyKind === 'gems'))).length;
    const need = 4 + opt.steps.length + refetches;
    if (this.budget() < need) {
      const wait = this.budgetResetIn();
      const reason = `This needs ${need} Habitica requests and ${this.budget()} are left this minute. Try again ${wait ? `in ${wait} s` : 'in a minute'}.`;
      this.notify({ text: reason, error: true });
      return { status: 'blocked', reason };
    }
    this.begin();
    try {
      const read = await this.sync({ quiet: true });
      if (!read) {
        const reason = `Couldn’t re-read your account${this.lastError ? `: ${this.lastError.replace(/\.$/, '')}` : ''}. Nothing was changed.`;
        if (this.creds) this.notify({ text: reason, error: true });
        return { status: 'blocked', reason };
      }
      // the day may have turned over, or HP run out, since the suggestion was shown
      if (this.paused) {
        const reason = this.dead ? 'You’re out of HP. Revive first; nothing was changed.' : 'A new day is waiting. Start it first; nothing was changed.';
        this.notify({ text: reason, error: true });
        return { status: 'blocked', reason };
      }
      const again = this.force(roll);
      const same = again?.options.find(o => o.summary === opt.summary);
      if (!again || again.already || !same) {
        this.notify({ text: again?.already ? `Your numbers changed in Habitica, and ${rollName(roll)} already crits.` : 'Your numbers changed in Habitica. Here are fresh options.' });
        return { status: 'changed' };
      }
      // run the re-computed steps: same labels, but targets and gear to put back reflect the fresh read
      const steps = same.steps;
      for (let i = 0; i < steps.length; i += 1) {
        const r = await this.runStep(steps[i]);
        if (!r.ok) {
          const reason = r.error instanceof Error ? r.error.message : 'Habitica refused it';
          const done = i === 0 ? 'Nothing was changed.' : `The step${i === 1 ? '' : 's'} before it went through.`;
          if (this.creds) this.notify({ text: `Step ${i + 1} of ${steps.length} failed: ${reason.replace(/\.$/, '')}. ${done}`, error: true });
          return { status: 'stopped', at: i, of: steps.length, reason };
        }
      }
      this.record.forced += 1; this.saveRecord();
      // gear swapped for this crit goes back once the crit is used (the seed moves when anything is scored)
      if (this.restore && this.snap && this.restore.userId === this.snap.userId && steps.some(st => st.kind === 'equip')) {
        this.restore.armedSeed = seedOf(this.snap.state); this.saveRestore();
      }
      const v = this.verdict?.rolls.find(r => r.key === roll);
      const hits = this.state ? rollHits(this.state, roll) : false;
      if (hits && roll === 'task' && this.state) this.plannedSeed = seedOf(this.state);
      this.notify({
        text: hits ? `Done. ${cap(rollName(roll))} will crit ×${v?.mult.toFixed(2)}, unless something else changes first.` : `Done, but ${rollName(roll)} no longer crits (something else changed).`,
        crit: hits, error: !hits,
      });
      return { status: 'done', crit: hits };
    } finally {
      this.end();
    }
  }

  private async runStep (st: Step): Promise<Res<unknown>> {
    switch (st.kind) {
      case 'reward': { const t = this.tasks.find(x => x.id === st.taskId); return t ? this._score(t, 'up', { quiet: true }) : { ok: false, error: new Error('That reward is gone.') }; }
      case 'sell': return this._sell(st.type, st.key, st.amount, true);
      case 'potion': return this._potion(true);
      case 'cast': return this._cast(st.spellId, st.targetId, true);
      case 'allocate': return this._allocate(st.stat, true);
      case 'equip': {
        const prev = { ...(this.snap?.equipped || {}) };
        const r = await this._equip(st.key, true);
        if (r.ok) this.noteSwap(prev);
        return r;
      }
      case 'buy': return this._buy(st.buyKind, st.key, st.price, st.count, true);
      case 'habitDown': { const t = this.tasks.find(x => x.id === st.taskId); return t ? this._score(t, 'down', { quiet: true }) : { ok: false, error: new Error('That habit is gone.') }; }
      case 'score': { const t = this.tasks.find(x => x.id === st.taskId); return t ? this._score(t, 'up', { quiet: true }) : { ok: false, error: new Error('That task is gone.') }; }
      default: return { ok: false };
    }
  }

  /** Remember, per slot, what was on before the first swap (a second swap keeps the first baseline). */
  private noteSwap (prev: Record<string, string>) {
    const snap = this.snap;
    if (!snap) return;
    const base = this.restore && this.restore.userId === snap.userId ? { ...this.restore.base } : {};
    for (const slot of new Set([...Object.keys(prev), ...Object.keys(snap.equipped)])) {
      if (emptySlot(prev[slot]) !== emptySlot(snap.equipped[slot]) && !(slot in base)) base[slot] = emptySlot(prev[slot]);
    }
    this.restore = { userId: snap.userId, base };
    this.saveRestore();
  }

  /**
   * Gear still to put back, as equip calls: "key" = put it on, "-key" = take it off (equip toggles).
   * Put-ons come first, since re-equipping also undoes two-handed side effects. A piece no longer
   * owned (lost when reviving) can't be put back and is skipped.
   */
  restoreTodo (): string[] {
    const snap = this.snap; const r = this.restore;
    if (!snap || !r || r.userId !== snap.userId) return [];
    const put: string[] = []; const off: string[] = [];
    for (const [slot, want] of Object.entries(r.base)) {
      const now = emptySlot(snap.equipped[slot]);
      if (now === want) continue;
      if (want) { if (snap.owned.includes(want)) put.push(want); } else if (now) off.push(`-${now}`);
    }
    return [...put, ...off];
  }

  /** Put back gear swapped for a crit, re-checking what is on after every call. */
  async restoreGear () {
    if (this.refuse(this.guard('other'))) return false;
    this.begin();
    try {
      const ok = await this.putBack();
      this.notify(!ok ? { text: 'Some gear couldn’t be put back; check it in Habitica.', error: true } : { text: this.autoRestoring ? 'Crit used — your gear is back as it was.' : 'Gear is back as it was.' });
      return ok;
    } finally {
      this.end();
    }
  }

  /**
   * Before logging out mid night swap (the player's tap): put back what the phone's night gear replaced, `base` =
   * the gear worn before it ({slot: key}, android NightSwap). Re-reads first; equips only. False if anything is left.
   */
  async putBackNightGear (base: Record<string, string>): Promise<boolean> {
    if (this.refuse(this.guard('other'))) return false;
    if (this.budget() < 10) { this.notify({ text: `Not enough Habitica requests left this minute. Try again ${this.budgetResetIn() ? `in ${this.budgetResetIn()} s` : 'in a minute'}.`, error: true }); return false; }
    this.begin();
    try {
      if (!await this.sync({ quiet: true }) || !this.snap) { this.notify({ text: 'Couldn’t re-read your account. You’re still logged in.', error: true }); return false; }
      const want: Record<string, string> = {};
      for (const [slot, key] of Object.entries(base || {})) if (typeof key === 'string') want[slot] = emptySlot(key);
      this.restore = { userId: this.snap.userId, base: want };
      const ok = await this.putBack();
      if (!ok) this.notify({ text: 'Some gear couldn’t be put back; check it in Habitica. You’re still logged in.', error: true });
      return ok;
    } finally {
      this.end();
    }
  }

  /** Equip calls until the gear is as it was before the app's swaps; false if any piece is left. */
  private async putBack (): Promise<boolean> {
    for (let i = 0; i < 8; i += 1) {
      const todo = this.restoreTodo();
      if (!todo.length) break;
      const r = await this._equip(todo[0].replace(/^-/, ''), true);
      if (!r.ok) return false;
    }
    const left = this.restoreTodo().length;
    this.restore = null; this.saveRestore();
    return !left;
  }

  private dropStaleRestore () {
    if (!this.restore || !this.snap) return;
    // everything already back (e.g. changed in the official app), or another account: forget the reminder
    if (this.restore.userId !== this.snap.userId || !this.restoreTodo().length) { this.restore = null; this.saveRestore(); }
  }

  /**
   * The Dailies to ask about before the day change, exactly as Habitica's web client picks them
   * (client/src/components/notifications.vue runYesterDailies): not a team task, not done,
   * "record yesterday's activity" on, and due yesterday by shouldDo on this device's clock.
   * (The stored isDue flag is from the last day change, which is wrong after several missed days.)
   */
  yesterdailies (): UiTask[] {
    const probe = yesterdayProbe(Number(this.raw?.preferences?.dayStart) || 0, this.utcOffsetMin());
    return this.tasks.filter(t => t.type === 'daily' && !t.team && !t.completed && t.yesterDaily
      && !!t.schedule && shouldDo(probe.at, t.schedule, probe));
  }

  /** Record yesterday's Dailies (as the official apps do), then run the day change and re-sync. */
  async startDay (doneIds: string[], auto = false): Promise<boolean> {
    if (this.refuse(this.guard('other'))) return false;
    this.begin();
    try {
      // the official app may have started the day already; then these ticks would count for today. Starting by
      // itself, it re-reads the tasks too: a Daily added elsewhere since the last full read may need asking about
      const r = await this.attempt('New day', () => (auto ? this.sync({ quiet: true, throwErrors: true }) : this.refetchUser().then(() => true)));
      if (!r.ok || !r.value) return false;
      if (auto && this.needsCron && this.yesterdailies().length) return false;
      if (!this.needsCron) {
        if (!auto) await this.sync({ quiet: true });
        if (!auto) this.notify({ text: 'Habitica already started the new day (probably from another app). Nothing was scored.' });
        return false;
      }
      for (const id of doneIds) {
        const t = this.tasks.find(x => x.id === id);
        if (!t || t.completed) continue;
        const s = await this._score(t, 'up', { quiet: true });
        if (!s.ok) { this.notify({ text: `Stopped: couldn’t record “${t.text}”. The day hasn’t changed; try again.`, error: true }); return false; }
      }
      const c = await this.attempt('New day', () => this.api!.cron());
      if (!c.ok) return false;
      await this.sync({ quiet: true });
      this.notify({ text: auto ? 'New day started (nothing to record from yesterday).' : 'New day started.' });
      return true;
    } finally {
      this.end();
    }
  }

  /** Exactly what reviving will cost (ops/revive.js picks the lost point and piece deterministically). */
  revivePreview () {
    const snap = this.snap;
    return snap ? revivePreview(snap.state, snap.owned, ITEMS.gear, { equipped: snap.equipped, table: GEAR }) : undefined;
  }

  async revive () {
    if (this.refuse(this.guard('other'))) return false;
    const pv = this.revivePreview();
    const r = await this.attempt('Revive', async () => { await this.api!.revive(); });
    if (r.ok) {
      await this.sync({ quiet: true });
      if (pv && this.state) this.check('Revive', pv.state, null, null, true);
      this.notify({ text: `Revived: level ${this.state?.lvl ?? ''}, full HP.` });
    }
    return r.ok;
  }
}

export const store = new Store();

/** An HP change as Habitica shows it: one decimal, signed. */
export function hpText (d: number): string {
  return `${d > 0 ? '+' : '−'}${Math.abs(d).toFixed(1).replace(/\.0$/, '')} HP`;
}

/** the fields of an object that are exactly true (Habitica's achievement flags) */
function trueFlags (o: unknown): Record<string, true> {
  if (!o || typeof o !== 'object') return {};
  return Object.fromEntries(Object.entries(o as Record<string, unknown>).filter(([, v]) => v === true)) as Record<string, true>;
}
