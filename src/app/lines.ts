/*
 * What the ongoing notification shows: the lines the player picked, worked out from the last read.
 * The phone builds the real notification with the Java port (android/verdict Lines.java, tested against
 * this file by tools/gen-verdict-fixtures.ts); the app uses this one for the live preview in Settings.
 * Pure: no clock, no locale. Every number is formatted by hand so the two sides say exactly the same.
 */
import { dayChangeDanger, dropsLeft, gameDay, streaksLost, totals, toNextLevel, verdicts, RULES, type MissedDaily } from '../engine';
import { ITEMS, snapshotFromUser } from './model';
import { fmt, plain } from './ui/dom';
import type { Json } from '../api/client';

export type LineId = 'crit' | 'danger' | 'invite' | 'dailies' | 'streaks' | 'countdown' | 'boss' | 'collect' | 'drops' | 'bars' | 'points' | 'saving' | 'night';
export type Look = 'LIVE' | 'CRIT' | 'CHECKING' | 'OFFLINE' | 'NONE';
export type Tone = 'normal' | 'crit' | 'danger';

export interface LineInfo {
  id: LineId
  name: string
  icon: string
  /** a one-line example for the Settings list */
  example: string
  /** needs a read besides GET /user: tasks or the party */
  extra?: 'tasks' | 'party'
  /** on for a new install */
  on: boolean
}

/** Every line, in the default order. */
export const LINES: LineInfo[] = [
  { id: 'crit', name: 'Crit verdict', icon: 'bolt', example: 'Next task: CRIT ×2.40', on: true },
  { id: 'danger', name: 'Day change danger', icon: 'warning', example: 'Day change takes all your HP: finish Gym, Read', extra: 'tasks', on: true },
  { id: 'invite', name: 'Quest invitation', icon: 'mail', example: 'Quest invitation waiting in Habitica: The Basi-List', on: true },
  { id: 'dailies', name: 'Dailies left', icon: 'today', example: '3 Dailies left: Gym, Read, Floss', extra: 'tasks', on: false },
  { id: 'streaks', name: 'Streaks at risk', icon: 'local_fire_department', example: '2 streaks at risk: Gym (12), Read (5)', extra: 'tasks', on: false },
  { id: 'countdown', name: 'Day change countdown', icon: 'schedule', example: 'New day in 3 h 12 min', on: true },
  { id: 'boss', name: 'Boss', icon: 'whatshot', example: 'Basi-List: 340 / 900 HP · your hit waiting 41.0', extra: 'party', on: false },
  { id: 'collect', name: 'Collection quest', icon: 'redeem', example: '7 / 20 items found · 2 more at your day change', extra: 'party', on: false },
  { id: 'drops', name: 'Item drops left', icon: 'egg', example: '3 of 6 item drops left today', on: false },
  { id: 'bars', name: 'HP, MP and XP', icon: 'favorite', example: 'Three thin bars', on: true },
  { id: 'points', name: 'Stat points', icon: 'add_circle', example: '2 stat points to spend on STR', on: true },
  { id: 'saving', name: 'Saving for', icon: 'savings', example: 'Golden Sword: 180 / 240 Gold', on: true },
  { id: 'night', name: 'Night gear', icon: 'bedtime', example: 'Night gear goes on at 23:30', on: true },
];
export const LINE_INFO = {} as Record<LineId, LineInfo>;
for (const l of LINES) LINE_INFO[l.id] = l;
/** Rows in the expanded notification, besides the small "Read … ago" at the bottom. */
export const MAX_ROWS = 6;
/** In the automatic order, Dailies still open rise to the top this close to the day change. */
export const DAILIES_URGENT_MS = 4 * 3600e3;
/** Numbers count as current (Live) this long after a read, as in store.ts and VerdictText.FRESH_MS. */
const FRESH_MS = 90_000;

export interface LinePrefs {
  order: 'auto' | 'mine'
  /** the lines switched on, in the player's order */
  lines: LineId[]
  savingFor?: { name: string, price: number } | null
  /** 'str' | 'con' | 'int' | 'per' */
  allocateTo?: string | null
}
export interface NightInfo { on: boolean, mode: string, swapAt: number, backOn: boolean, backAt: number, phase: string }

export interface LinesInput {
  /** the last GET /user (trimmed is fine), or null before the first read */
  user: Json
  /** Dailies from the last GET /tasks/user (trimTasks), or null when not read */
  tasks: Json[] | null
  /** { quest } of the last GET /groups/party (trimParty), or null */
  party: Json
  prefs: LinePrefs
  night: NightInfo | null
  now: number
  /** when `user` was read (ms), 0 = never */
  readAt: number
  /** the last attempt to read failed for lack of a connection */
  offline: boolean
  /** the phone's offset from UTC now, minutes east */
  tzOffsetMin: number
}

export interface Bar { label?: string, value: number, max: number }
export interface Row { id: LineId, icon: string, text: string, tone: Tone, bars?: Bar[] }
export interface LinesOut {
  look: Look
  /** collapsed: the first row */
  title: string
  /** collapsed: the second row, or when the numbers were read */
  text: string
  /** expanded: up to MAX_ROWS rows */
  rows: Row[]
  footer: string
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/* ---------------------------------------------------------------- what is kept from each read */

/**
 * What the lines need of GET /tasks/user: the Dailies, with what the day change counts (model.ts taskFromApi:
 * a team task's completion is the player's own in assignedUsersDetail; a team task costs no HP).
 */
export function trimTasks (tasks: Json[], userId?: string): Json[] {
  return (tasks || []).filter(t => t && t.type === 'daily').map(t => {
    // t.team: the app's own task list (preview); group === true: already trimmed (trimming twice changes nothing)
    const group = !!(t.group && t.group.id) || t.team === true || t.group === true;
    const shared = !!(t.challenge && t.challenge.id) || group || t.shared === true;
    const mine = group && userId ? t.group.assignedUsersDetail?.[userId] : undefined;
    const list: Json[] = Array.isArray(t.checklist) ? t.checklist : [];
    return {
      type: 'daily', text: typeof t.text === 'string' ? t.text : '', isDue: t.isDue === true,
      completed: mine ? mine.completed === true : t.completed === true,
      value: num(t.value), priority: num(t.priority, 1),
      checklistDone: Array.isArray(t.checklist) ? list.filter(c => c && c.completed === true).length : num(t.checklistDone),
      checklistTotal: Array.isArray(t.checklist) ? list.length : num(t.checklistTotal), group,
      // on the team board (no userId): never in the player's own day change (libs/cron.js loads only their tasks)
      board: (!!(t.group && t.group.id) && !t.userId) || t.board === true,
      streak: num(t.streak), shared,
    };
  });
}
/** What the lines need of GET /groups/party: the quest. */
export function trimParty (party: Json): Json {
  const q = party?.quest;
  if (!q) return { quest: null };
  const collect: Record<string, number> = {};
  for (const [k, v] of Object.entries(q.progress?.collect || {})) if (typeof v === 'number') collect[k] = v;
  return { quest: { key: typeof q.key === 'string' ? q.key : null, active: q.active === true, progress: { hp: typeof q.progress?.hp === 'number' ? q.progress.hp : null, collect } } };
}

/* ---------------------------------------------------------------- formatting, identical in Java */

/** non-negative x with one decimal (Number#toFixed, BigDecimal HALF_UP in Java) */
const dec1 = (x: number): string => Math.max(0, x).toFixed(1);
const int = (x: number): string => String(Math.floor(Math.max(0, x)));
const hhmm = (m: number): string => `${String(Math.floor(m / 60) % 24).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** "3 h 12 min", "45 min", "under a minute" */
export function duration (ms: number): string {
  const min = Math.floor(ms / 60000);
  if (min < 1) return 'under a minute';
  const hours = Math.floor(min / 60); const m = min % 60;
  return hours === 0 ? `${m} min` : m === 0 ? `${hours} h` : `${hours} h ${m} min`;
}

/** "just now", "4 min ago", "2 h ago", "3 d ago" */
export function ago (ms: number): string {
  const s = Math.floor(Math.max(0, ms) / 1000);
  if (s < 45) return 'just now';
  if (s < 90) return '1 min ago';
  if (s < 3600) return `${Math.floor((s + 30) / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Until the next Habitica day starts: preferences.dayStart at tzOffsetMin (the account's zone, minutes east of UTC; store.nextDayStart). */
export function untilDayChange (now: number, tzOffsetMin: number, dayStart: number): number {
  const day = 86400e3;
  const local = now + tzOffsetMin * 60000;
  const into = ((local % day) + day) % day;
  const start = dayStart * 3600e3;
  return into < start ? start - into : day - into + start;
}

/* ---------------------------------------------------------------- the lines */

/**
 * Habitica's day changed after the read's last day change (the phone slept through it), so a new day is waiting
 * whatever that read said (gameDay = cron.js startOfDay; identical in Java).
 */
export function dayChangedSince (user: Json, now: number): boolean {
  const lastCron = typeof user?.lastCron === 'string' && /^\d{4}-\d\d-\d\dT/.test(user.lastCron) ? Date.parse(user.lastCron) : NaN;
  if (!Number.isFinite(lastCron)) return false;
  const tz = typeof user.preferences?.timezoneOffset === 'number' ? user.preferences.timezoneOffset : undefined;
  const dayStart = num(user.preferences?.dayStart);
  return gameDay(now, dayStart, tz) > gameDay(lastCron, dayStart, tz);
}

export function buildLines (input: LinesInput): LinesOut {
  const { user, prefs, now } = input;
  const footer = input.readAt <= 0 ? 'Not read yet' : `${input.offline ? 'Offline · read' : 'Read'} ${ago(now - input.readAt)}`;
  if (!user) {
    const text = 'Open Sidekick and log in with “Remember on this device”.';
    return { look: 'NONE', title: 'Sidekick for Habitica', text, rows: [{ id: 'crit', icon: 'bolt', text, tone: 'normal' }], footer };
  }
  const snap = snapshotFromUser(user);
  const s = snap.state;
  const dayDue = snap.needsCron || dayChangedSince(user, now);
  const stats = user.stats || {};
  const age = now - input.readAt;
  const fresh = !input.offline && age >= 0 && age <= FRESH_MS;
  const dead = s.hp <= 0;
  const dayStart = Math.min(23, Math.max(0, Math.floor(num(user.preferences?.dayStart))));
  const untilDay = untilDayChange(now, input.tzOffsetMin, dayStart);

  // the crit verdict, and the look of the whole notification
  const v = verdicts(s);
  const task = v.rolls[0];
  let look: Look = input.offline ? 'OFFLINE' : fresh ? 'LIVE' : 'CHECKING';
  let critText: string;
  if (dead) critText = 'Out of HP: open Habitica to recover';
  else if (dayDue) critText = 'New day waiting: crits show once it starts';
  else if (fresh) {
    critText = task.crit ? `Next task: CRIT ${fmt.mult(task.mult)}` : `Next task: no crit (${fmt.pct(task.chance)})`;
    for (const r of v.rolls.slice(1)) if (r.available && r.crit) critText += ` · ${r.name} CRIT ${fmt.mult(r.mult)}`;
    if (task.crit) look = 'CRIT';
  } else {
    critText = `${input.offline ? 'Offline' : 'Checking'}: next task was ${task.crit ? `a crit ${fmt.mult(task.mult)}` : `no crit (${fmt.pct(task.chance)})`}`;
  }
  if (snap.unknownGear.length && !dead && !dayDue) critText += ' · some gear unknown';

  const quest = input.party?.quest;
  const mine = quest?.key && user.party?.quest?.key === quest.key ? user.party.quest.progress || {} : {};
  let dailiesLeft = 0;
  let deadly = false;
  const open = (input.tasks || []).filter(t => t.type === 'daily' && t.isDue === true && t.completed !== true);
  // the ones the day change counts: the team board's never reach the player's own (libs/cron.js loads only their tasks)
  const own = open.filter(t => t.board !== true);

  const make = (id: LineId): Row | null => {
    const icon = LINE_INFO[id].icon;
    switch (id) {
      case 'crit': return { id, icon, text: critText, tone: look === 'CRIT' ? 'crit' : 'normal' };
      case 'danger': {
        // what the next day change does to HP (engine dayChangeDanger, as the Inn card on Now); quiet when safe
        if (!input.tasks || dayDue || dead) return null;
        const missed: MissedDaily[] = own.map(t => ({ value: num(t.value), priority: num(t.priority, 1), checklistDone: num(t.checklistDone), checklistTotal: num(t.checklistTotal), group: t.group === true }));
        // a quest only hits once it runs: the party's read says so when there is one, else an invitation still
        // waiting for an answer (RSVPNeeded) hasn't started (an invitation sets party.quest.key, api-v3/quests.js)
        const uq = user.party?.quest;
        const running = quest && quest.key === uq?.key ? quest.active === true : uq?.RSVPNeeded !== true;
        const boss = running ? ITEMS.bossQuests[uq?.key] : undefined;
        const d = dayChangeDanger(s, missed, { stealth: snap.stealth, bossStr: boss ? boss[3] ?? 1 : 0, sleeping: snap.sleeping });
        // to 2 decimals: Habitica's 0.9747 ** value can differ in the last bit between JavaScript and Java
        const bars: Bar[] = [{ value: Math.round(Math.max(0, d.hpAfter) * 100) / 100, max: RULES.maxHealth }];
        if (d.level === 'low') return { id, icon, text: `Day change leaves you ${int(Math.ceil(d.hpAfter))} HP`, tone: 'normal', bars };
        if (d.level !== 'dies') return null;
        deadly = true;
        // finishing them all always leaves HP above 0 (only the player's own misses count here)
        const fix = d.dailiesToDo ? `finish ${d.dailiesFirst.map(i => plain(String(own[i].text || ''))).join(', ')}` : 'pause damage in Habitica';
        return { id, icon, text: `Day change takes all your HP: ${fix}`, tone: 'danger', bars };
      }
      case 'invite': {
        // an invitation the player hasn't answered (GET /user party.quest.RSVPNeeded): the quest waits for everyone's answer
        const uq = user.party?.quest;
        if (uq?.RSVPNeeded !== true) return null;
        const name = typeof uq.key === 'string' ? ITEMS.bossQuests[uq.key]?.[0] ?? ITEMS.collectQuests[uq.key]?.[0] : undefined;
        return { id, icon, text: `Quest invitation waiting in Habitica${name ? `: ${name}` : ''}`, tone: 'normal' };
      }
      case 'dailies': {
        if (!input.tasks || dayDue) return null;
        const left = open;
        dailiesLeft = left.length;
        if (!left.length) return { id, icon: 'task_alt', text: 'All Dailies done', tone: 'normal' };
        const names = left.map(t => plain(String(t.text || ''))).join(', ');
        return { id, icon, text: `${left.length} ${left.length === 1 ? 'Daily' : 'Dailies'} left: ${names}`, tone: 'normal' };
      }
      case 'streaks': {
        // engine streaksLost (history.ts): unchecked due Dailies whose streak the day change resets, longest first
        if (!input.tasks || dayDue) return null;
        const lost = streaksLost(own.map((t, i) => ({ id: String(i), type: 'daily' as const, streak: num(t.streak), completed: false, isDue: true, shared: t.shared === true })),
          { sleeping: snap.sleeping, streaksActive: !!stats.buffs?.streaks, stealth: snap.stealth });
        if (!lost.length) return null;
        const names = lost.map(r => `${plain(String(own[Number(r.id)].text || ''))} (${int(r.streak)})`).join(', ');
        return { id, icon, text: `${lost.length} ${lost.length === 1 ? 'streak' : 'streaks'} at risk: ${names}`, tone: 'normal' };
      }
      case 'countdown':
        return { id, icon, text: dayDue ? 'New day waiting: open Habitica to start it' : `New day in ${duration(untilDay)}`, tone: 'normal' };
      case 'boss': {
        const b = quest?.active ? ITEMS.bossQuests[quest.key] : undefined;
        if (!b) return null;
        const hp = num(quest.progress?.hp, b[1]);
        const hit = num(mine.up);
        return { id, icon, text: `${b[2] || b[0]}: ${int(Math.ceil(hp))} / ${int(b[1])} HP${hit > 0 ? ` · your hit waiting ${dec1(hit)}` : ''}`, tone: 'normal', bars: [{ value: Math.max(0, hp), max: b[1] }] };
      }
      case 'collect': {
        const c = quest?.active ? ITEMS.collectQuests[quest.key] : undefined;
        if (!c) return null;
        let found = 0; let total = 0;
        for (const [k, [, count]] of Object.entries(c[1])) { found += Math.min(count, num(quest.progress?.collect?.[k])); total += count; }
        const more = Math.floor(num(mine.collectedItems));
        return { id, icon, text: `${int(found)} / ${int(total)} items found${more > 0 ? ` · ${more} more ${snap.sleeping ? 'when you leave the Inn' : 'at your day change'}` : ''}`, tone: 'normal', bars: [{ value: found, max: total }] };
      }
      case 'drops': {
        const d = dropsLeft(s, snap.drops, now);
        const text = d.left > 0 ? `${int(d.left)} of ${int(d.cap)} item drops left today` : `No item drops left today (${int(d.cap)} a day)`;
        return { id, icon, text, tone: 'normal', bars: [{ value: d.left, max: d.cap }] };
      }
      case 'bars': {
        const maxMP = typeof stats.maxMP === 'number' && stats.maxMP > 0 ? stats.maxMP : totals(s).maxMP;
        const tnl = typeof stats.toNextLevel === 'number' && stats.toNextLevel > 0 ? stats.toNextLevel : toNextLevel(s.lvl);
        const bars: Bar[] = [
          { label: `HP ${int(Math.ceil(s.hp))} / ${RULES.maxHealth}`, value: Math.max(0, s.hp), max: RULES.maxHealth },
          { label: `MP ${int(s.mp)} / ${int(maxMP)}`, value: Math.max(0, s.mp), max: maxMP },
          { label: `XP ${int(s.exp)} / ${int(tnl)}`, value: Math.max(0, s.exp), max: tnl },
        ];
        return { id, icon, text: bars.map(b => b.label).join(' · '), tone: 'normal', bars };
      }
      case 'points': {
        const p = Math.floor(num(stats.points));
        // only a player with a class can spend them (ops/stats/allocate.js hasClass)
        if (p < 1 || !s.classSelected) return null;
        const to = prefs.allocateTo ? ` on ${prefs.allocateTo.toUpperCase()}` : '';
        return { id, icon, text: `${p} stat ${p === 1 ? 'point' : 'points'} to spend${to}`, tone: 'normal' };
      }
      case 'saving': {
        const sv = prefs.savingFor;
        if (!sv || !(sv.price > 0)) return null;
        const gp = Math.max(0, s.gp);
        const text = gp >= sv.price ? `${sv.name}: ready to buy (${int(sv.price)} Gold)` : `${sv.name}: ${int(gp)} / ${int(sv.price)} Gold`;
        return { id, icon, text, tone: 'normal', bars: [{ value: Math.min(gp, sv.price), max: sv.price }] };
      }
      case 'night': {
        const n = input.night;
        if (!n) return null;
        const p = n.phase;
        if (p === 'read' || p === 'tasks' || p === 'equip') return { id, icon, text: 'Night gear: putting it on', tone: 'normal' };
        if (p === 'swapped') return { id, icon, text: n.backOn ? `Night gear on · your gear goes back at ${hhmm(n.backAt)} or after the new day` : 'Night gear on', tone: 'normal' };
        if (p === 'back') return { id, icon, text: 'Night gear: putting your gear back', tone: 'normal' };
        if (!n.on) return null;
        const which = n.mode === 'int' ? 'INT night gear' : n.mode === 'con' ? 'CON night gear' : 'Night gear';
        return { id, icon, text: `${which} goes on at ${hhmm(n.swapAt)}`, tone: 'normal' };
      }
    }
    return null;
  };

  const built: Row[] = [];
  for (const id of prefs.lines) {
    if (!LINE_INFO[id] || built.some(r => r.id === id)) continue;
    const r = make(id);
    if (r) built.push(r);
  }
  let rows = built;
  if (prefs.order === 'auto') {
    // most urgent first: a day change that would kill, a crit or being out of HP, Dailies still open late in the day; the rest as chosen
    const urgent = (r: Row): number => (r.id === 'danger' && deadly ? 0 : r.id === 'crit' && (look === 'CRIT' || dead) ? 1
      : (r.id === 'dailies' && dailiesLeft > 0 || r.id === 'streaks') && untilDay <= DAILIES_URGENT_MS ? 2 : 3);
    rows = built.map((r, i) => [urgent(r), i, r] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(x => x[2]);
  }
  rows = rows.slice(0, MAX_ROWS);
  // amber means one thing: the next task crits, and the notification says so
  if (look === 'CRIT' && !rows.some(r => r.id === 'crit')) look = 'LIVE';
  const title = rows[0]?.text ?? 'Sidekick for Habitica';
  const text = rows[1]?.text ?? footer;
  return { look, title, text, rows, footer };
}
