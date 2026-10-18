/*
 * The speech bubble on Now when nobody taps the character: headline.ts picks what to say, this reads it off the
 * store (the same engine numbers the cards below it use) and draws it.
 */
import { h, icon, fmt, plain } from '../ui/dom';
import { term } from '../ui/term';
import type { TermKey } from '../glossary';
import { store } from '../store';
import { relaxed } from '../mode';
import { ITEMS, petName } from '../model';
import { streaksLost, toNextLevel } from '../../engine';
import { daySummary, headline, type Fact, type HeadlineInput, type Seg } from '../headline';
import { currentDanger } from './inn';
import { stateDay } from './history';
import { sayLine } from '../ui/talk';

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/** The facts headline.ts needs, from the last read. Call only once there is one (store.snap). */
export function headlineInput (now = Date.now()): HeadlineInput {
  const snap = store.snap!;
  const s = snap.state;
  const raw = store.raw || {};
  const due = store.tasks.filter(t => t.type === 'daily' && t.isDue);
  // the team board's Dailies never reach your own day change (libs/cron.js loads only your tasks)
  const open = due.filter(t => !t.completed && !t.board);
  const d = currentDanger();
  const lost = streaksLost(open.map(t => ({ id: t.id, type: t.type, streak: t.streak, completed: t.completed, isDue: t.isDue, shared: t.shared })),
    { sleeping: snap.sleeping, streaksActive: snap.streaksActive, stealth: snap.stealth });
  const byId = new Map(open.map(t => [t.id, plain(t.text)]));

  // the party's quest, and your own progress in it (counted at your day change), as the notification's lines read them
  const quest = store.party?.quest;
  const mine = quest?.key && raw.party?.quest?.key === quest.key ? raw.party.quest.progress || {} : {};
  const b = quest?.active ? ITEMS.bossQuests[quest.key] : undefined;
  const c = quest?.active ? ITEMS.collectQuests[quest.key] : undefined;
  // an invitation the player hasn't answered yet (Habitica sets it on everyone but the inviter, api-v3/quests.js)
  const ik = raw.party?.quest?.key;
  const invite = raw.party?.quest?.RSVPNeeded === true ? ITEMS.bossQuests[ik]?.[0] ?? ITEMS.collectQuests[ik]?.[0] ?? '' : null;
  let collect: HeadlineInput['collect'] = null;
  if (c) {
    let found = 0; let total = 0;
    for (const [k, [, count]] of Object.entries(c[1])) { found += Math.min(count, num(quest.progress?.collect?.[k])); total += count; }
    collect = { found, total, today: Math.floor(num(mine.collectedItems)) };
  }

  const plan = store.feedingPlan();
  const tnl = num(raw.stats?.toNextLevel) > 0 ? raw.stats.toNextLevel : toNextLevel(s.lvl);
  const v = relaxed() ? undefined : store.verdict?.rolls[0];
  return {
    mode: relaxed() ? 'relaxed' : 'full',
    connection: store.connection,
    readAt: fmt.time(store.syncedAt || store.lastServerAt),
    dead: store.dead,
    needsCron: store.needsCron,
    roll: v ? { crit: v.crit, mult: v.mult, chance: v.chance } : undefined,
    gearUnknown: snap.unknownGear.length > 0,
    dailies: store.tasksReadAt || due.length ? due.map(t => ({ name: plain(t.text), done: !!t.completed })) : null,
    danger: d ? { level: d.level, hpAfter: d.hpAfter, finish: d.dailiesFirst.map(i => plain(open[i]?.text ?? '')).filter(Boolean) } : null,
    streaks: lost.map(r => ({ name: byId.get(r.id) ?? '', streak: r.streak })),
    untilDay: Math.max(0, store.nextDayStart() - now),
    sleeping: !!store.snap?.sleeping,
    // only a player with a class can spend them (ops/stats/allocate.js hasClass)
    points: store.snap?.state.classSelected ? Math.floor(num(raw.stats?.points)) : 0,
    allocateTo: store.settings.allocateTo,
    invite,
    boss: b ? { name: b[2] || b[0], hit: num(mine.up), hp: num(quest.progress?.hp, b[1]), max: b[1] } : null,
    collect,
    raise: plan ? plan.raise.map(p => ({ pet: petName(p.pet), feeds: p.steps.reduce((n, st) => n + st.count, 0) })) : [],
    hatch: plan ? plan.hatch.map(o => petName(o.pet)) : [],
    level: { lvl: s.lvl, exp: s.exp, toNext: tnl },
  };
}

/** What the bubble says now. */
export const headlineNow = (): Fact => headline(headlineInput());

const seg = (p: Seg): Node | string => (typeof p === 'string' ? p : 'b' in p ? h('b', null, p.b) : term(p.term, p.key as TermKey));

/** The bubble's own lines: overline, headline and the line below. */
export function bubbleLines (f: Fact): HTMLElement[] {
  const head = f.headline.map(seg);
  return [
    h('div', { class: 'overline' }, f.overline),
    h('div', { class: 'headline' }, f.icon ? h('span', { class: 'row' }, icon(f.icon, 'headline-icon'), ...head) : h('span', null, ...head)),
    h('div', { class: 'hero-sub' }, ...f.sub.map(seg)),
  ];
}

/* ---------------------------------------------------------------- the day's summary, said once */

/** the Habitica day whose summary was said, on this device (one a day, whatever the redraws) */
const SUMMED_KEY = 'critoracle:v2:daySummed';
const summedDay = (): number => { try { return Number(localStorage.getItem(SUMMED_KEY)) || 0; } catch { return 0; } };
/** the open due Dailies at the last look, and a summary owed since the last of them was ticked */
let seen: { day: number, open: number } | undefined;
let owed: number | undefined;

/**
 * After each render: when the last due Daily of the day gets ticked (seen open at one look, all done at the next, the
 * same Habitica day), the character says the day's summary once, on Now (headline.ts daySummary). Ticked elsewhere,
 * it's said the next time Now shows, that same day; unticking one first, or a new day, calls it off.
 */
export function sayDayDone (onNow: boolean) {
  const snap = store.snap;
  if (!snap || store.dead || store.needsCron || !store.tasksReadAt) return;
  const day = stateDay();
  const due = store.tasks.filter(t => t.type === 'daily' && t.isDue);
  const open = due.filter(t => !t.completed).length;
  if (seen && seen.day === day && seen.open > 0 && open === 0 && due.length && summedDay() !== day) owed = day;
  seen = { day, open };
  // end-to-end tests keep it quiet except in its own check (it would talk over other checks of the bubble)
  if ((window as { __noDaySummary?: boolean }).__noDaySummary) owed = undefined;
  if (owed !== day || open > 0) { owed = undefined; return; }
  if (!onNow || store.connection !== 'live') return;
  const crits = store.journal.filter(e => e.day === day);
  const line = daySummary(relaxed() ? 'relaxed' : 'full', due.length, {
    n: crits.length, gp: crits.reduce((a, e) => a + e.gp, 0), exp: crits.reduce((a, e) => a + e.exp, 0),
  });
  // after the render that called this: talking redraws
  window.setTimeout(() => {
    if (owed !== day) return;
    // said, or still owed: the character was busy talking, or Now went
    owed = undefined;
    if (!sayLine(line)) { owed = day; return; }
    try { localStorage.setItem(SUMMED_KEY, String(day)); } catch { /* private mode: said once this session */ }
  }, 0);
}
