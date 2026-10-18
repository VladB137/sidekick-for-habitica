/*
 * Class plans: what each class's own strengths are worth right now, and the owned gear that makes the most of
 * them. Everything rests on four facts read in Habitica's code (see docs/class-strategies.md):
 *   - every action reads statsComputed() at that moment, so each action has its own best loadout;
 *   - buffs keep the value they were cast with until the player's own cron;
 *   - MP is only cut back to max MP when MP is gained (scoreTask.js _gainMP) or at cron, never by unequipping;
 *   - cron uses the gear worn when the day is started.
 * Gear never moves the seed, so a swap changes how big an action is (and whether its roll clears the bar),
 * never which roll comes up. All numbers come from the verified engine functions (castSkill, scoreTask).
 */
import {
  castSkill, cloneState, critChance, critFor, critMultiplier, gearFromEquipped, scoreTask, skillByKey, totals, withGear, xpGained,
  type ClassKey, type GearMeta, type GearTable, type State, type StatKey, type Stats4, type Task,
} from './core';
import { bestLoadoutBy, equipCalls, restoreCalls } from './levers';
import { RULES } from './rules';

export interface GearContext {
  equipped: Record<string, string>
  owned: string[]
  table: GearTable
  meta: Record<string, GearMeta>
}

/** A set of owned gear, with the equip calls that get there from what is worn now and the calls that undo them. */
export interface Loadout {
  /** 'current' or the stats it was picked for, e.g. 'int' or 'str+con' */
  key: string
  equipped: Record<string, string>
  gear: Stats4
  equip: string[]
  restore: string[]
}

const W = (o: Partial<Stats4>): Stats4 => ({ str: 0, con: 0, int: 0, per: 0, ...o });
const sameGear = (a: Stats4, b: Stats4) => a.str === b.str && a.con === b.con && a.int === b.int && a.per === b.per;

/** What is worn now, as a loadout. */
export function currentLoadout (ctx: GearContext, cls: ClassKey): Loadout {
  return { key: 'current', equipped: { ...ctx.equipped }, gear: gearFromEquipped(Object.values(ctx.equipped), cls, ctx.table).gear, equip: [], restore: [] };
}

/** The best owned loadout for each weighting, plus the current one; duplicates (same totals) dropped, current first. */
const loadoutCache = new WeakMap<string[], Map<string, Loadout[]>>();
export function loadouts (ctx: GearContext, cls: ClassKey, weights: Record<string, Partial<Stats4>>): Loadout[] {
  // the screen asks for the same sets many times per render; cached per owned-gear list (a new read is a new list)
  const memoKey = `${cls}|${JSON.stringify(ctx.equipped)}|${JSON.stringify(weights)}`;
  let memo = loadoutCache.get(ctx.owned);
  if (!memo) { memo = new Map(); loadoutCache.set(ctx.owned, memo); }
  const hit = memo.get(memoKey);
  if (hit) return hit;
  const out = computeLoadouts(ctx, cls, weights);
  memo.set(memoKey, out);
  return out;
}
function computeLoadouts (ctx: GearContext, cls: ClassKey, weights: Record<string, Partial<Stats4>>): Loadout[] {
  const cur = currentLoadout(ctx, cls);
  const out: Loadout[] = [cur];
  for (const [key, w] of Object.entries(weights)) {
    const target = bestLoadoutBy(ctx.equipped, ctx.owned, cls, W(w), ctx.table, ctx.meta);
    const { keys, result } = equipCalls(ctx.equipped, target, ctx.meta);
    const gear = gearFromEquipped(Object.values(result), cls, ctx.table).gear;
    if (out.some(l => sameGear(l.gear, gear))) continue;
    out.push({ key, equipped: result, gear, equip: keys, restore: restoreCalls(ctx.equipped, result) });
  }
  return out;
}

/* ------------------------------------------------------------------ the next task */

export type TaskGoal = 'damage' | 'xp' | 'gold' | 'drops';

/** What scoring `task` now is worth toward `goal` (drops: the factors of the drop chance that gear and crits move). */
function taskGain (before: State, task: Task, goal: TaskGoal, forceMult?: number): { gain: number, crit: boolean, mult: number } {
  const r = scoreTask(before, task, 'up', forceMult);
  const t = totals(before);
  const gain = goal === 'damage' ? r.dmg
    : goal === 'gold' ? r.state.gp - before.gp
      : goal === 'drops' ? (1 + t.per / 100) * r.mult
        : xpGained(before, r.state);
  return { gain, crit: r.crit, mult: r.mult };
}

export interface GearForTask { loadout: Loadout, gain: number, crit: boolean, now: number, critNow: boolean }

/**
 * The owned loadout that makes scoring `task` worth the most toward `goal`, if any beats what is worn. Checks the
 * best set for each stat that moves a task's payoff (STR: crit and boss damage, INT: XP, PER: Gold and drops).
 */
export function gearForTask (s: State, ctx: GearContext, task: Task, goal: TaskGoal): GearForTask | null {
  let now;
  try { now = taskGain(s, task, goal); } catch { return null; }
  let best: GearForTask | null = null;
  for (const l of loadouts(ctx, s.cls, { str: { str: 1 }, int: { int: 1 }, per: { per: 1 } }).slice(1)) {
    const r = taskGain(withGear(s, l.gear), task, goal);
    if (r.gain > now.gain && (!best || r.gain > best.gain)) best = { loadout: l, gain: r.gain, crit: r.crit, now: now.gain, critNow: now.crit };
  }
  return best;
}

/* ------------------------------------------------------------------ what to buy next */

/**
 * What one task gives toward `goal` on average over its crit roll: the plain payoff, and the crit's payoff weighted
 * by the crit chance (both from STR). Gear never moves the roll itself, only how likely and how big a crit is, so
 * this is the measure for gear meant to be worn for weeks, not for the next tap.
 */
export function expectedTaskGain (s: State, goal: TaskGoal, task: Task): number {
  const str = totals(s).str;
  const p = Math.min(1, critChance(str));
  return (1 - p) * taskGain(s, task, goal, 1).gain + p * taskGain(s, task, goal, critMultiplier(str)).gain;
}

/**
 * The same over a list of tasks, each scored once from `s`. Habitica keeps Gold and XP in whole numbers (the save
 * hook floors them), so a small bonus moves some tasks' payoff and not others: only the player's own tasks say
 * what a piece of gear is really worth to them.
 */
export function expectedTasksGain (s: State, goal: TaskGoal, tasks: Task[]): number {
  let sum = 0;
  for (const t of tasks) { try { sum += expectedTaskGain(s, goal, t); } catch { /* a task Habitica would refuse adds nothing */ } }
  return sum;
}

export interface GearBuy {
  key: string
  price: number
  /** expected gain toward the goal from the tasks, in the best owned loadout now and with this piece owned too */
  now: number
  after: number
  /** the best loadout once it is owned (it includes the piece) */
  loadout: Loadout
}

const GOAL_SETS: Record<string, Partial<Stats4>> = { str: { str: 1 }, int: { int: 1 }, per: { per: 1 }, 'str+int': { str: 1, int: 1 }, 'str+per': { str: 1, per: 1 } };

function bestForGoal (s: State, ctx: GearContext, goal: TaskGoal, tasks: Task[]): { gain: number, loadout: Loadout } {
  let best: { gain: number, loadout: Loadout } | null = null;
  for (const l of loadouts(ctx, s.cls, GOAL_SETS)) {
    const gain = expectedTasksGain(withGear(s, l.gear), goal, tasks);
    if (!best || gain > best.gain) best = { gain, loadout: l };
  }
  return best!;
}

/**
 * Of the gear Habitica sells the player for Gold now (`forSale`), the pieces that would raise what `tasks` give
 * toward `goal`, each worn in the best set it makes; best gain per Gold first. Advice only: buying stays a tap.
 */
export function gearBuys (s: State, ctx: GearContext, forSale: { key: string, price: number }[], goal: TaskGoal, tasks: Task[]): GearBuy[] {
  if (!tasks.length) return [];
  const base = bestForGoal(s, ctx, goal, tasks);
  if (!(base.gain > 0)) return [];
  const out: GearBuy[] = [];
  for (const g of forSale) {
    if (ctx.owned.includes(g.key) || !(g.price > 0)) continue;
    const after = bestForGoal(s, { ...ctx, owned: [...ctx.owned, g.key] }, goal, tasks);
    // a piece that only ties (or helps by a rounding hair) isn't worth naming
    if (after.gain > base.gain * 1.001 && Object.values(after.loadout.equipped).includes(g.key)) {
      out.push({ key: g.key, price: g.price, now: base.gain, after: after.gain, loadout: after.loadout });
    }
  }
  return out.sort((a, b) => (b.after - b.now) / b.price - (a.after - a.now) / a.price || a.price - b.price);
}

/* ------------------------------------------------------------------ Warrior: Brutal Smash */

export interface SmashChain { casts: number, dmg: number, crits: number }
export interface SmashPlan { now: SmashChain, best: SmashChain, loadout: Loadout }

/** Cast Brutal Smash until the MP runs out, in one loadout. Each cast costs 10 MP, which sets the next roll. */
export function smashChain (s: State, targetValue: number, max = 100): SmashChain {
  let st = s; let v = targetValue; let dmg = 0; let crits = 0; let casts = 0;
  const def = skillByKey('smash')!;
  while (casts < max && st.classSelected && st.cls === 'warrior' && st.lvl >= def.lvl && st.mp >= def.mana) {
    const r = castSkill(st, 'smash', { targetValue: v });
    st = r.state; v = r.targetValue ?? v; dmg += r.dmg; casts += 1; if (r.crit) crits += 1;
  }
  return { casts, dmg, crits };
}

/**
 * All the Smashes the MP pays for now: in the gear worn, and in the owned loadout that does the most boss damage
 * (STR for damage, CON for the crit roll, or both). One loadout for the whole chain keeps it to a few equip calls.
 */
export function smashPlan (s: State, ctx: GearContext, targetValue: number): SmashPlan | null {
  const now = smashChain(s, targetValue);
  if (!now.casts) return null;
  let best = now; let loadout = currentLoadout(ctx, s.cls);
  for (const l of loadouts(ctx, s.cls, { str: { str: 1 }, con: { con: 1 }, 'str+con': { str: 1, con: 1 } }).slice(1)) {
    const c = smashChain(withGear(s, l.gear), targetValue);
    if (c.dmg > best.dmg) { best = c; loadout = l; }
  }
  return { now, best, loadout };
}

export interface ManaBank {
  maxMP: number
  /** max MP in the best owned INT loadout */
  bankMaxMP: number
  loadout: Loadout | null
  /** MP the day change adds with every Daily done, now and in that loadout */
  cronNow: number
  cronBank: number
  /** MP above the current max: scoring any task now cuts MP back to the max */
  overMax: number
}

/** Mana: what INT gear adds to the cap and to the MP the day change gives (cron.js), and MP at risk of being cut. */
export function manaBank (s: State, ctx: GearContext): ManaBank {
  const t = totals(s);
  const ls = loadouts(ctx, s.cls, { int: { int: 1 } });
  const l = ls.length > 1 && ls[1].gear.int > ls[0].gear.int ? ls[1] : null;
  const bankMaxMP = l ? totals(withGear(s, l.gear)).maxMP : t.maxMP;
  return {
    maxMP: t.maxMP, bankMaxMP, loadout: l,
    cronNow: Math.max(10, 0.1 * t.maxMP), cronBank: Math.max(10, 0.1 * bankMaxMP),
    overMax: Math.max(0, s.mp - t.maxMP),
  };
}

/**
 * The two night loadouts for the scheduled swap (Settings > Night gear, Android): the most INT (more max MP, so
 * more of the cron's MP is kept) and the most CON (less damage from missed Dailies). Each is the full set of slots
 * to wear, or null when it adds nothing to what is worn. The other stat breaks ties (a hair's weight).
 */
export function nightLoadouts (ctx: GearContext, cls: ClassKey): { int: Record<string, string> | null, con: Record<string, string> | null } {
  const now = gearFromEquipped(Object.values(ctx.equipped), cls, ctx.table).gear;
  const pick = (stat: 'int' | 'con', other: 'int' | 'con') => {
    const target = bestLoadoutBy(ctx.equipped, ctx.owned, cls, W({ [stat]: 1, [other]: 1e-3 }), ctx.table, ctx.meta);
    const { result } = equipCalls(ctx.equipped, target, ctx.meta);
    const g = gearFromEquipped(Object.values(result), cls, ctx.table).gear;
    return g[stat] > now[stat] ? result : null;
  };
  return { int: pick('int', 'con'), con: pick('con', 'int') };
}

/* ------------------------------------------------------------------ skills at their peak */

const SKILL_STATS: Record<string, Partial<Stats4>> = {
  defensiveStance: { con: 1 }, valorousPresence: { str: 1 }, intimidate: { con: 1 },
  earth: { int: 1 }, mpheal: { int: 1 },
  toolsOfTrade: { per: 1 }, stealth: { per: 1 }, pickPocket: { per: 1 },
  protectAura: { con: 1 }, heal: { con: 1, int: 1 }, healAll: { con: 1, int: 1 }, brightness: { int: 1 },
};
const BUFF_STAT: Record<string, StatKey> = { defensiveStance: 'con', valorousPresence: 'str', intimidate: 'con', earth: 'int', toolsOfTrade: 'per', protectAura: 'con' };
const DR = (b: number, max: number, half: number) => max * (b / (b + half));

/**
 * One cast's effect, in the skill's own unit: the buff it adds (it stays until the player's cron), HP healed
 * before the 50 cap, MP each party member gets, Dailies Stealth hides, Gold from Pickpocket at `targetValue`,
 * or how much Searing Brightness adds to each task's value.
 */
export function skillEffect (s: State, key: string, opts: { dailyCount?: number, targetValue?: number } = {}): number {
  const t = totals(s);
  const stat = BUFF_STAT[key];
  if (stat) {
    const before = s.buffs[stat];
    const r = castSkill({ ...cloneState(s), mp: Math.max(s.mp, skillByKey(key)!.mana) }, key);
    return r.state.buffs[stat] - before;
  }
  switch (key) {
    case 'heal': return Math.ceil((t.con + t.int + 5) * 0.075);
    case 'healAll': return Math.ceil((t.con + t.int + 5) * 0.04);
    case 'mpheal': return Math.ceil(DR(t.int, 25, 125));
    case 'brightness': return Math.ceil(4 * (t.int / (t.int + 40)));
    case 'stealth': return Math.ceil(DR(t.per, (opts.dailyCount ?? 0) * 0.64, 55));
    case 'pickPocket': {
      const v = opts.targetValue ?? 0;
      return Math.ceil(DR((v < 0 ? 1 : v + 1) + t.per * 0.5, 25, 75));
    }
    default: return 0;
  }
}

export interface SkillPeak { key: string, now: number, best: number, loadout: Loadout | null }

/** For each of these skills the player can cast: its effect in the gear worn and in the owned loadout that maximises it. */
export function skillPeaks (s: State, ctx: GearContext, keys: string[], opts: { dailyCount?: number, targetValue?: number } = {}): SkillPeak[] {
  const out: SkillPeak[] = [];
  for (const key of keys) {
    const def = skillByKey(key);
    const w = SKILL_STATS[key];
    if (!def || !w || def.cls !== s.cls || !s.classSelected || s.lvl < def.lvl) continue;
    const now = skillEffect(s, key, opts);
    let best = now; let loadout: Loadout | null = null;
    const name = (Object.keys(w) as StatKey[]).join('+');
    for (const l of loadouts(ctx, s.cls, { [name]: w }).slice(1)) {
      const e = skillEffect(withGear(s, l.gear), key, opts);
      if (e > best) { best = e; loadout = l; }
    }
    out.push({ key, now, best, loadout });
  }
  return out;
}

/** Searing Brightness steps up at INT 14, 41 and 121 (ceil(4 × INT / (INT + 40))): the INT total for the next step. */
export function brightnessNextStep (int: number): number | null {
  for (const at of [14, 41, 121]) if (int < at) return at;
  return null;
}

/* ------------------------------------------------------------------ the day change */

/** A Daily due today and not done, as the day change will treat it. */
export interface MissedDaily {
  value: number
  priority: number
  checklistDone: number
  checklistTotal: number
  /** a group task: no HP lost for it (scoreTask.js _subtractPoints), boss damage still counts */
  group: boolean
}

export interface DayChange {
  /** HP lost to the player's own missed Dailies */
  hpLoss: number
  /** HP the boss takes from the player for their own missed Dailies (party members' misses add to it) */
  bossLoss: number
  hpAfter: number
  missed: number
  /** Stealth hides some but not all: which ones depends on the server's task order, so the figure is the most it can be */
  upperBound: boolean
}

/**
 * HP after the next day change, for the player's own missed Dailies (cron.js + scoreTask.js with cron: true, one
 * day missed). CON includes today's buffs: they are reset after the damage. `bossStr`: the boss's strength when
 * a boss quest is active. Resting in the Inn: nothing.
 */
export function dayChange (s: State, missed: MissedDaily[], opts: { stealth?: number, bossStr?: number, sleeping?: boolean } = {}): DayChange {
  if (opts.sleeping) return { hpLoss: 0, bossLoss: 0, hpAfter: s.hp, missed: 0, upperBound: false };
  const evaded = Math.min(opts.stealth ?? 0, missed.length);
  const t = totals(s);
  let conBonus = 1 - t.con / 250;
  if (conBonus < 0.1) conBonus = 0.1;
  const each = missed.map(d => {
    const v = d.value < RULES.minTaskValue ? RULES.minTaskValue : d.value > RULES.maxTaskValue ? RULES.maxTaskValue : d.value;
    let delta = -(0.9747 ** v);
    if (d.checklistTotal > 0) delta *= 1 - d.checklistDone / d.checklistTotal;
    let hp = 0;
    if (!d.group) {
      const hpMod = delta * conBonus * d.priority * 2;
      hp = hpMod > -1 ? -1 : Math.ceil(hpMod);
    }
    return { hp, down: delta * (d.priority < 1 ? d.priority : 1) };
  });
  // with Stealth, the largest losses are the worst case for the ones left over
  const left = evaded ? [...each].sort((a, b) => a.hp - b.hp).slice(0, each.length - evaded) : each;
  const hpLoss = -left.reduce((a, x) => a + x.hp, 0);
  const down = left.reduce((a, x) => a + x.down, 0);
  const bossLoss = opts.bossStr ? -down * opts.bossStr : 0;
  return { hpLoss, bossLoss, hpAfter: s.hp - hpLoss - bossLoss, missed: left.length, upperBound: evaded > 0 && evaded < each.length };
}

/** Does the next task roll crit in this gear? (For "this swap also makes it crit".) */
export const taskCritsIn = (s: State, gear: Stats4): boolean => critFor(withGear(s, gear), 'str') > 1;
