/*
 * Sidekick engine core: a line-by-line port of the parts of Habitica's game code
 * that decide crits and move the numbers the crit roll is seeded from.
 * Sources (github.com/HabitRPG/habitica, website/common/script/...):
 *   fns/predictableRandom.js, fns/crit.js, libs/statsComputed.js, fns/updateStats.js,
 *   fns/autoAllocate.js, ops/scoreTask.js, content/spells.js, ops/buy/*, ops/sell.js,
 *   ops/stats/allocate.js, and server/models/user/hooks.js (whole-number save hook).
 * Pure functions on plain objects. No DOM, no network. Verified by tests/parity.test.ts.
 */
import { fdlibmSin } from './fdlibm';
import { RULES } from './rules';

export type StatKey = 'str' | 'con' | 'int' | 'per';
export type ClassKey = 'warrior' | 'wizard' | 'rogue' | 'healer';
export type AllocationMode = 'flat' | 'classbased' | 'taskbased';
export type TaskType = 'habit' | 'daily' | 'todo' | 'reward';
export type Direction = 'up' | 'down';
export interface Stats4 { str: number, con: number, int: number, per: number }

/** The player's numbers. `str/con/int/per` are allocated points only; `gear` is item stats + class bonus. */
export interface State {
  hp: number, mp: number, exp: number, gp: number, lvl: number, points: number
  str: number, con: number, int: number, per: number
  buffs: Stats4
  gear: Stats4
  /** stats.training, in schema order int, per, str, con (the order decides auto-allocation ties) */
  training: { int: number, per: number, str: number, con: number }
  cls: ClassKey
  /** flags.classSelected and not preferences.disableClasses: skills and stat allocation are available */
  classSelected: boolean
  autoAllocate: boolean
  allocationMode: AllocationMode
}

export interface Task {
  id: string
  text?: string
  type: TaskType
  value: number
  priority: number
  streak: number
  /** completed checklist items */
  checked: number
  attribute: StatKey
  completed?: boolean
  up?: boolean
  down?: boolean
  /** challenge or group task: Searing Brightness skips it, skills can't target it */
  shared?: boolean
}

export const CLASSES: ClassKey[] = ['warrior', 'rogue', 'healer', 'wizard'];

export const capByLevel = (lvl: number): number => (lvl > RULES.maxLevel ? RULES.maxLevel : lvl);
export function toNextLevel (lvl: number): number {
  if (lvl < 5) return 25 * lvl;
  if (lvl === 5) return 150;
  return Math.round(((lvl ** 2) * 0.25 + 10 * lvl + 139.75) / 10) * 10;
}
export const diminishingReturns = (bonus: number, max: number, halfway: number = max / 2): number => max * (bonus / (bonus + halfway));
const clampValue = (v: number): number => (v < RULES.minTaskValue ? RULES.minTaskValue : v > RULES.maxTaskValue ? RULES.maxTaskValue : v);

export function cloneState (s: State): State {
  return {
    hp: s.hp, mp: s.mp, exp: s.exp, gp: s.gp, lvl: s.lvl, points: s.points,
    str: s.str, con: s.con, int: s.int, per: s.per,
    buffs: { str: s.buffs.str, con: s.buffs.con, int: s.buffs.int, per: s.buffs.per },
    gear: { str: s.gear.str, con: s.gear.con, int: s.gear.int, per: s.gear.per },
    training: { int: s.training.int, per: s.training.per, str: s.training.str, con: s.training.con },
    cls: s.cls, classSelected: s.classSelected, autoAllocate: s.autoAllocate, allocationMode: s.allocationMode,
  };
}

/* ------------------------------------------------------------------ totals */

export interface Totals extends Stats4 { maxMP: number, levelBonus: number }

/** statsComputed(): gear + class bonus + allocated + buff, plus floor(min(lvl,100)/2). */
export function totals (s: State): Totals {
  const lb = Math.floor(capByLevel(s.lvl) / 2);
  const str = s.gear.str + s.str + s.buffs.str + lb;
  const con = s.gear.con + s.con + s.buffs.con + lb;
  const int = s.gear.int + s.int + s.buffs.int + lb;
  const per = s.gear.per + s.per + s.buffs.per + lb;
  return { str, con, int, per, levelBonus: lb, maxMP: int * 2 + 30 };
}

/** Gear table row: [str, con, int, per, class?]; 0 for items without stats. */
export type GearRow = 0 | [number, number, number, number] | [number, number, number, number, string];
export type GearTable = Record<string, GearRow>;

/** Equipment totals from equipped item keys. Class gear counts (1 + classGearBonus) times. */
export function gearFromEquipped (equippedKeys: string[], cls: ClassKey, table: GearTable): { gear: Stats4, unknown: string[] } {
  const g = { str: 0, con: 0, int: 0, per: 0 };
  const unknown: string[] = [];
  for (const key of equippedKeys) {
    if (!key) continue;
    const it = table[key];
    if (it === undefined) { unknown.push(key); continue; }
    if (it === 0) continue;
    const mult = it[4] && it[4] === cls ? 1 + RULES.classGearBonus : 1;
    g.str += it[0] * mult; g.con += it[1] * mult; g.int += it[2] * mult; g.per += it[3] * mult;
  }
  return { gear: g, unknown };
}

/* ------------------------------------------------------------------ the roll */

/** predictableRandom(): the sum of the numeric user.stats fields, in schema order. */
export const seedOf = (s: State): number => 0 + s.hp + s.mp + s.exp + s.gp + s.lvl + s.points + s.str + s.con + s.int + s.per;
/** frac(sin(seed + 1) × 10000), with the server's exact sine. */
export function rollOf (seed: number): number {
  const x = fdlibmSin(seed + 1) * 10000;
  return x - Math.floor(x);
}
export const critChance = (stat: number, base: number = RULES.critBase): number => base * (1 + stat / 100);
export const critMultiplier = (stat: number): number => 1.5 + (4 * stat) / (stat + 200);

/** crit.crit(user, stat, chance): the multiplier (> 1) or 1. */
export function critFor (s: State, stat: StatKey = 'str', base: number = RULES.critBase): number {
  const v = totals(s)[stat];
  return rollOf(seedOf(s)) <= base * (1 + v / 100) ? 1.5 + (4 * v) / (v + 200) : 1;
}

/** The server's save hook: hp/mp/exp/gp become whole numbers (floored), capped at MAX_FIELD_HARD_CAP. */
export function saveHook (s: State): State {
  for (const k of ['hp', 'mp', 'exp', 'gp'] as const) {
    if (s[k] > RULES.maxFieldHardCap) s[k] = RULES.maxFieldHardCap;
    else if (!Number.isInteger(s[k])) s[k] = Math.floor(s[k]);
  }
  if (s.lvl > RULES.maxLevelHardCap) s.lvl = RULES.maxLevelHardCap;
  return s;
}

/* ------------------------------------------------------------------ level-ups */

function statToAllocate (s: State): StatKey {
  switch (s.allocationMode) {
    case 'flat': {
      // invert(pick(stats, 'con str per int'))[min] — the last key with the minimum wins
      const order: StatKey[] = ['con', 'str', 'per', 'int'];
      const m = Math.min(...order.map(k => s[k]));
      let pick: StatKey = 'str';
      order.forEach(k => { if (s[k] === m) pick = k; });
      return pick;
    }
    case 'classbased': {
      const lvlDiv7 = s.lvl / 7;
      const ideal = [lvlDiv7 * 3, lvlDiv7 * 2, lvlDiv7, lvlDiv7];
      const pref: StatKey[] = s.cls === 'wizard' ? ['int', 'per', 'con', 'str']
        : s.cls === 'rogue' ? ['per', 'str', 'int', 'con']
          : s.cls === 'healer' ? ['con', 'int', 'str', 'per']
            : ['str', 'con', 'per', 'int'];
      const diff = pref.map((k, i) => s[k] - ideal[i]);
      const m = Math.min(...diff);
      const idx = diff.findIndex(v => v === m);
      return idx !== -1 ? pref[idx] : 'str';
    }
    case 'taskbased': {
      // invert(training)[max(values(training))] — schema order int, per, str, con; the last key with the max wins
      const order: StatKey[] = ['int', 'per', 'str', 'con'];
      const m = Math.max(...order.map(k => s.training[k]));
      let pick: StatKey | null = null;
      order.forEach(k => { if (s.training[k] === m) pick = k; });
      s.training = { int: 0, per: 0, str: 0, con: 0 };
      return pick || 'str';
    }
    default: return 'str';
  }
}

interface HpGpExp { hp: number, gp: number, exp: number }

/** updateStats(user, stats): clamps hp/gp, handles level-ups. Returns the number of levels gained. */
export function updateStats (s: State, st: HpGpExp): number {
  s.hp = st.hp > 0 ? st.hp : 0;
  s.gp = st.gp > 0 ? st.gp : 0;
  let tnl = toNextLevel(s.lvl);
  let leveled = 0;
  if (st.exp >= tnl) {
    s.exp = st.exp;
    while (st.exp >= tnl) {
      st.exp -= tnl;
      s.lvl = s.lvl >= RULES.maxLevelHardCap ? RULES.maxLevelHardCap : s.lvl + 1;
      leveled += 1;
      tnl = toNextLevel(s.lvl);
      s.hp = RULES.maxHealth;
      const allocated = s.str + s.int + s.con + s.per;
      let total = allocated + s.points;
      if (total >= RULES.maxStatPoints) continue; // eslint-disable-line no-continue
      if (s.autoAllocate) {
        const k = statToAllocate(s);
        s[k] += 1;
      } else {
        s.points = s.lvl - allocated;
        total = s.points + allocated;
        if (total > RULES.maxStatPoints) s.points = RULES.maxStatPoints - allocated;
        if (s.points < 0) s.points = 0;
      }
    }
  }
  s.exp = st.exp;
  return leveled;
}

function gainMP (s: State, val: number, crit: number): void {
  val *= crit;
  if (val < 0) s.mp += Math.floor(val); else s.mp += Math.ceil(val);
  const { maxMP } = totals(s);
  if (s.mp >= maxMP) s.mp = maxMP;
  if (s.mp < 0) s.mp = 0;
}

/* ------------------------------------------------------------------ scoring a task */

export interface ScoreResult {
  state: State
  task: Task
  /** crit multiplier applied (1 = no crit) */
  mult: number
  crit: boolean
  /** boss damage (quest progress) from this score */
  dmg: number
  delta: number
  leveled: number
}

function calculateDelta (t: Task, direction: Direction): number {
  const currVal = clampValue(t.value);
  let nextDelta = (0.9747 ** currVal) * (direction === 'down' ? -1 : 1);
  if (t.type === 'todo' && t.checked > 0) nextDelta *= 1 + t.checked;
  return nextDelta;
}

function calculateReverseDelta (t: Task, direction: Direction): number {
  const currVal = clampValue(t.value);
  let testVal = currVal + (0.9747 ** currVal) * (direction === 'down' ? -1 : 1);
  for (;;) {
    const calc = testVal + (0.9747 ** testVal);
    const diff = currVal - calc;
    if (Math.abs(diff) < RULES.closeEnough) break;
    if (diff > 0) testVal -= diff; else testVal += diff;
  }
  let nextDelta = testVal - currVal;
  if (t.type === 'todo' && t.checked > 0) nextDelta *= 1 + t.checked;
  return nextDelta;
}

function subtractPoints (s: State, t: Task, st: HpGpExp, delta: number): void {
  let conBonus = 1 - totals(s).con / 250;
  if (conBonus < 0.1) conBonus = 0.1;
  const hpMod = delta * conBonus * t.priority * 2;
  if (hpMod > -1) st.hp -= 1;
  else st.hp += Math.ceil(hpMod);
}

function addPoints (s: State, t: Task, st: HpGpExp, direction: Direction, delta: number, crit: number): void {
  const tot = totals(s);
  const intBonus = 1 + tot.int * 0.025;
  st.exp += Math.round(delta * intBonus * t.priority * crit * 6);
  const perBonus = 1 + tot.per * 0.02;
  const gpMod = delta * t.priority * crit * perBonus;
  if (t.streak) {
    const currStreak = direction === 'down' ? t.streak - 1 : t.streak;
    const streakBonus = currStreak / 100 + 1;
    let afterStreak = gpMod * streakBonus;
    if (Math.abs(afterStreak - gpMod) < 1) afterStreak = direction === 'down' ? gpMod - 1 : gpMod + 1;
    st.gp += direction === 'down' ? Math.floor(afterStreak) : Math.ceil(afterStreak);
  } else {
    st.gp += direction === 'down' ? Math.floor(gpMod) : Math.ceil(gpMod);
  }
}

/**
 * scoreTask(user, task, direction), outside cron, followed by the save hook.
 * Returns new objects; inputs are not mutated. Throws on moves the server refuses.
 * `forceMult` replaces the crit roll (1 = as if it hadn't crit), for working out what a crit added.
 */
export function scoreTask (state: State, task: Task, direction: Direction = 'up', forceMult?: number): ScoreResult {
  const s = cloneState(state);
  const t: Task = { ...task };
  if (t.type === 'reward' && t.value > s.gp) throw new Error('notEnoughGold');
  const st: HpGpExp = { gp: s.gp, hp: s.hp, exp: s.exp };
  const tot = totals(s);

  // _changeTaskValue: one roll, only when scoring up
  const mult = direction === 'up' ? (forceMult ?? critFor(s, 'str')) : 1;
  const nextDelta = direction === 'down' ? calculateReverseDelta(t, direction) : calculateDelta(t, direction);
  let dmg = 0;
  if (t.type !== 'reward') {
    if (s.autoAllocate && s.allocationMode === 'taskbased' && !(t.type === 'todo' && direction === 'down')) {
      s.training[t.attribute || 'str'] += nextDelta;
    }
    if (direction === 'up') {
      if (t.type === 'todo' || t.type === 'daily') dmg = Math.ceil(nextDelta * mult * (1 + tot.str / 200));
      else if (t.type === 'habit') dmg = Math.ceil(nextDelta * mult * (0.5 + tot.str / 400));
    }
    t.value += nextDelta;
  }
  let delta = 0 + nextDelta;

  if (t.type === 'habit') {
    if (delta > 0) addPoints(s, t, st, direction, delta, mult);
    else subtractPoints(s, t, st, delta);
    gainMP(s, Math.max(0.25, 0.0025 * totals(s).maxMP) * (direction === 'down' ? -1 : 1), mult);
  } else if (t.type === 'daily') {
    if (direction === 'down') delta = calculateDelta(t, direction);
    addPoints(s, t, st, direction, delta, mult);
    gainMP(s, Math.max(1, 0.01 * totals(s).maxMP) * (direction === 'down' ? -1 : 1), mult);
    if (direction === 'up') { t.streak += 1; t.completed = true; } else { t.streak -= 1; t.completed = false; }
  } else if (t.type === 'todo') {
    t.completed = direction === 'up';
    if (direction === 'down') delta = calculateDelta(t, direction);
    addPoints(s, t, st, direction, delta, mult);
    const multiplier = Math.max(1 + (t.checked || 0), 1);
    gainMP(s, Math.max(multiplier, 0.01 * totals(s).maxMP * multiplier) * (direction === 'down' ? -1 : 1), mult);
  } else if (t.type === 'reward') {
    st.gp -= t.value;
  }
  const leveled = updateStats(s, st);
  saveHook(s);
  return { state: s, task: t, mult, crit: mult > 1, dmg, delta, leveled };
}

/* ------------------------------------------------------------------ class skills */

export type SkillTarget = 'task' | 'self' | 'party' | 'tasks';
export interface SkillDef { key: string, cls: ClassKey, name: string, mana: number, lvl: number, target: SkillTarget, crit?: { stat: StatKey, base: number } }

export const SKILLS: SkillDef[] = [
  { key: 'fireball', cls: 'wizard', name: 'Burst of Flames', mana: 10, lvl: 11, target: 'task', crit: { stat: 'per', base: RULES.critBase } },
  { key: 'mpheal', cls: 'wizard', name: 'Ethereal Surge', mana: 30, lvl: 12, target: 'party' },
  { key: 'earth', cls: 'wizard', name: 'Earthquake', mana: 35, lvl: 13, target: 'party' },
  { key: 'frost', cls: 'wizard', name: 'Chilling Frost', mana: 40, lvl: 14, target: 'self' },
  { key: 'smash', cls: 'warrior', name: 'Brutal Smash', mana: 10, lvl: 11, target: 'task', crit: { stat: 'con', base: RULES.critBase } },
  { key: 'defensiveStance', cls: 'warrior', name: 'Defensive Stance', mana: 25, lvl: 12, target: 'self' },
  { key: 'valorousPresence', cls: 'warrior', name: 'Valorous Presence', mana: 20, lvl: 13, target: 'party' },
  { key: 'intimidate', cls: 'warrior', name: 'Intimidating Gaze', mana: 15, lvl: 14, target: 'party' },
  { key: 'pickPocket', cls: 'rogue', name: 'Pickpocket', mana: 10, lvl: 11, target: 'task' },
  { key: 'backStab', cls: 'rogue', name: 'Backstab', mana: 15, lvl: 12, target: 'task', crit: { stat: 'str', base: RULES.backstabCritBase } },
  { key: 'toolsOfTrade', cls: 'rogue', name: 'Tools of the Trade', mana: 25, lvl: 13, target: 'party' },
  { key: 'stealth', cls: 'rogue', name: 'Stealth', mana: 45, lvl: 14, target: 'self' },
  { key: 'heal', cls: 'healer', name: 'Healing Light', mana: 15, lvl: 11, target: 'self' },
  { key: 'brightness', cls: 'healer', name: 'Searing Brightness', mana: 15, lvl: 12, target: 'tasks' },
  { key: 'protectAura', cls: 'healer', name: 'Protective Aura', mana: 30, lvl: 13, target: 'party' },
  { key: 'healAll', cls: 'healer', name: 'Blessing', mana: 25, lvl: 14, target: 'party' },
];
export const skillByKey = (key: string): SkillDef | undefined => SKILLS.find(k => k.key === key);

/** Skills this player can cast right now (class chosen, level reached, enough mana). */
export function availableSkills (s: State, opts: { includeUnaffordable?: boolean } = {}): SkillDef[] {
  if (!s.classSelected) return [];
  return SKILLS.filter(k => k.cls === s.cls && s.lvl >= k.lvl && (opts.includeUnaffordable || s.mp >= k.mana));
}

export interface CastContext {
  /** value of the targeted task (task skills) */
  targetValue?: number
  /** values of the player's own non-challenge, non-group, non-reward tasks (Searing Brightness) */
  taskValues?: number[]
  /** number of Dailies (tasksOrder.dailys.length) — Stealth */
  dailyCount?: number
  /** Chilling Frost already active (buffs.streaks) */
  streaksActive?: boolean
}

export interface CastResult {
  state: State
  mult: number
  crit: boolean
  dmg: number
  targetValue?: number
  taskValues?: number[]
  leveled: number
}

const calculateBonus = (value: number, stat: number, critVal = 1, statScale = 0.5): number => (value < 0 ? 1 : value + 1) + stat * statScale * critVal;

/** One cast of a class skill, then the mana cost, then the save hook. Throws on casts the server refuses. */
export function castSkill (state: State, key: string, ctx: CastContext = {}): CastResult {
  const def = skillByKey(key);
  if (!def) throw new Error('spellNotFound');
  if (def.mana > state.mp) throw new Error('notEnoughMana');
  if (def.lvl > state.lvl) throw new Error('spellLevelTooHigh');
  const s = cloneState(state);
  const tot = totals(s);
  let mult = 1; let dmg = 0; let leveled = 0;
  let targetValue = ctx.targetValue;
  let taskValues = ctx.taskValues;
  const upd = (): number => updateStats(s, { hp: s.hp, gp: s.gp, exp: s.exp });

  switch (key) {
    case 'fireball': {
      mult = critFor(s, 'per');
      let bonus = tot.int * mult;
      const v = targetValue ?? 0;
      bonus *= Math.ceil((v < 0 ? 1 : v + 1) * 0.075);
      s.exp += Math.ceil(diminishingReturns(bonus, 75));
      dmg = Math.ceil(tot.int * 0.1);
      leveled = upd();
      break;
    }
    case 'mpheal': break; // other party members gain mana; Mages (the caster included) don't
    case 'earth': s.buffs.int += Math.ceil(diminishingReturns(tot.int - s.buffs.int, 30, 200)); break;
    case 'frost': if (ctx.streaksActive) throw new Error('spellAlreadyCast'); break;
    case 'smash': {
      mult = critFor(s, 'con');
      const bonus = tot.str * mult;
      targetValue = (targetValue ?? 0) + Math.ceil(diminishingReturns(bonus, 2.5, 35));
      dmg = Math.ceil(diminishingReturns(bonus, 55, 70));
      break;
    }
    case 'defensiveStance': s.buffs.con += Math.ceil(diminishingReturns(tot.con - s.buffs.con, 40, 200)); break;
    case 'valorousPresence': s.buffs.str += Math.ceil(diminishingReturns(tot.str - s.buffs.str, 20, 200)); break;
    case 'intimidate': s.buffs.con += Math.ceil(diminishingReturns(tot.con - s.buffs.con, 24, 200)); break;
    case 'pickPocket': {
      const bonus = calculateBonus(targetValue ?? 0, tot.per);
      s.gp += Math.ceil(diminishingReturns(bonus, 25, 75));
      break;
    }
    case 'backStab': {
      mult = critFor(s, 'str', RULES.backstabCritBase);
      const bonus = calculateBonus(targetValue ?? 0, tot.str, mult);
      s.exp += Math.ceil(diminishingReturns(bonus, 75, 50));
      s.gp += Math.ceil(diminishingReturns(bonus, 18, 75));
      leveled = upd();
      break;
    }
    case 'toolsOfTrade': s.buffs.per += Math.ceil(diminishingReturns(tot.per - s.buffs.per, 100, 50)); break;
    case 'stealth': break; // buffs.stealth is not part of the seed or any crit bar
    case 'heal': {
      if (s.hp >= RULES.maxHealth) throw new Error('messageHealthAlreadyMax');
      s.hp += Math.ceil((tot.con + tot.int + 5) * 0.075);
      if (s.hp > RULES.maxHealth) s.hp = RULES.maxHealth;
      break;
    }
    case 'brightness': {
      const add = Math.ceil(4 * (tot.int / (tot.int + 40)));
      taskValues = (taskValues || []).map(v => v + add);
      break;
    }
    case 'protectAura': s.buffs.con += Math.ceil(diminishingReturns(tot.con - s.buffs.con, 200, 200)); break;
    case 'healAll': {
      s.hp += Math.ceil((tot.con + tot.int + 5) * 0.04);
      if (s.hp > RULES.maxHealth) s.hp = RULES.maxHealth;
      break;
    }
    default: throw new Error('spellNotFound');
  }
  s.mp -= def.mana;
  saveHook(s);
  return { state: s, mult, crit: mult > 1, dmg, targetValue, taskValues, leveled };
}

/** Outcome of a skill's crit roll at the current seed, without casting it. */
export function skillRoll (s: State, key: string): { crit: boolean, chance: number, mult: number } | null {
  const def = skillByKey(key);
  if (!def || !def.crit) return null;
  const v = totals(s)[def.crit.stat];
  const chance = critChance(v, def.crit.base);
  return { crit: rollOf(seedOf(s)) <= chance, chance, mult: critMultiplier(v) };
}

/* ------------------------------------------------------------------ shops and stats */

function spend (state: State, price: number): State {
  if (price > state.gp) throw new Error('messageNotEnoughGold');
  const s = cloneState(state);
  s.gp -= price;
  return saveHook(s);
}

/** Buying a custom reward = scoring the reward task up. */
export function buyReward (state: State, price: number): State {
  return scoreTask(state, { id: 'reward', type: 'reward', value: price, priority: 1, streak: 0, checked: 0, attribute: 'str' }, 'up').state;
}

/** ops/buy/buyHealthPotion.js */
export function buyPotion (state: State, quantity = 1): State {
  if (state.hp >= RULES.maxHealth) throw new Error('messageHealthAlreadyMax');
  if (state.hp <= 0) throw new Error('messageHealthAlreadyMin');
  const price = RULES.healthPotion.price * quantity;
  if (price > state.gp) throw new Error('messageNotEnoughGold');
  const s = cloneState(state);
  s.hp += RULES.healthPotion.heal * quantity;
  if (s.hp > RULES.maxHealth) s.hp = RULES.maxHealth;
  s.gp -= price;
  return saveHook(s);
}

/** Gear, gold quests, seasonal spells, cards: plain gold purchases at the item's price. */
export const buyWithGold = (state: State, price: number): State => spend(state, price);
/**
 * ops/buy/buyMarketGear.js: pay the gold; with preferences.autoEquip the item is equipped at once
 * (two-handed rules apply), which moves the crit bar too.
 */
export function buyGear (state: State, key: string, price: number, opts: { autoEquip: boolean, equipped: Record<string, string>, meta: Record<string, GearMeta>, table: GearTable }): { state: State, equipped: Record<string, string> } {
  let s = spend(state, price);
  let equipped = opts.equipped;
  if (opts.autoEquip) {
    equipped = applyEquip(opts.equipped, key, opts.meta, { toggle: false });
    s = withGear(s, gearFromEquipped(Object.values(equipped), s.cls, opts.table).gear);
  }
  return { state: s, equipped };
}

/** Subscribers' gold-to-gem conversion. */
export const buyGems = (state: State, count: number): State => spend(state, RULES.gemGoldPrice * count);

/** ops/sell.js: eggs, hatching potions and food (not Saddles) for their gold value. */
export function sellItem (state: State, unitValue: number, amount = 1): State {
  const s = cloneState(state);
  s.gp += unitValue * amount;
  return saveHook(s);
}

/** ops/stats/allocate.js: one point; INT also adds 1 MP. */
export function allocatePoint (state: State, stat: StatKey): State {
  if (!state.classSelected) throw new Error('classNotSelected');
  if (state.points <= 0) throw new Error('notEnoughAttrPoints');
  const s = cloneState(state);
  s[stat] += 1;
  s.points -= 1;
  if (stat === 'int') s.mp += 1;
  return saveHook(s);
}

/** Gear metadata row from src/data/items.json: [slot, gold value, name, klass, specialClass, twoHanded, index] */
export type GearMeta = [string, number, string, string, string, number, string?];

/**
 * ops/equip.js + fns/handleTwoHanded.js: equipping an equipped item unequips it (slot → `<slot>_base_0`);
 * a two-handed weapon drops the shield; a shield drops a two-handed weapon. Returns the new equipped map.
 */
export function applyEquip (equipped: Record<string, string>, key: string, meta: Record<string, GearMeta>, opts: { toggle?: boolean } = {}): Record<string, string> {
  const item = meta[key];
  if (!item) throw new Error('gearNotFound');
  const slot = item[0];
  const next = { ...equipped };
  // equipping what is already on takes it off; a purchase (buyMarketGear autoEquip) just puts it on
  if (opts.toggle !== false && next[slot] === key) { next[slot] = `${slot}_base_0`; return next; }
  const currentWeapon = meta[next.weapon];
  const currentShield = meta[next.shield];
  next[slot] = key;
  if (slot === 'shield' && currentWeapon && currentWeapon[5]) next.weapon = 'weapon_base_0';
  else if (item[5] && currentShield && next.shield !== 'shield_base_0') next.shield = 'shield_base_0';
  return next;
}

/** Equipping or unequipping changes gear totals only (the crit bar), never the seed. */
export function withGear (state: State, gear: Stats4): State {
  const s = cloneState(state);
  s.gear = { ...gear };
  return s;
}

/**
 * What reviving costs (ops/revive.js). The lost stat point and gear piece are chosen with
 * predictableRandom over sorted candidates (libs/randomVal.js sorts), so both are known in advance.
 */
export function revivePreview (state: State, owned: string[], meta: Record<string, GearMeta>, gear?: { equipped: Record<string, string>, table: GearTable }): { state: State, gpLost: number, stat?: StatKey, item?: string } {
  const s = cloneState(state);
  const gpLost = s.gp;
  s.hp = RULES.maxHealth; s.exp = 0; s.gp = 0;
  if (s.lvl > 1) s.lvl -= 1;
  const stats = (['str', 'con', 'per', 'int'] as StatKey[]).filter(k => s[k]).sort();
  const stat = stats.length ? stats[Math.floor(rollOf(seedOf(s)) * stats.length)] : undefined;
  if (stat) s[stat] -= 1;
  const losable = owned.filter(key => {
    const m = meta[key];
    if (!m) return false;
    const [, value, , klass, specialClass] = m;
    const hasValue = value > 0 || key === 'weapon_warrior_0';
    const special = klass === 'special' && (!specialClass || specialClass === s.cls);
    return hasValue && (klass === s.cls || special || klass === 'armoire');
  }).sort();
  const item = losable.length ? losable[Math.floor(rollOf(seedOf(s)) * losable.length)] : undefined;
  // a lost piece that was equipped comes off
  if (item && gear && gear.equipped[meta[item][0]] === item) {
    const eq = { ...gear.equipped, [meta[item][0]]: `${meta[item][0]}_base_0` };
    s.gear = gearFromEquipped(Object.values(eq), s.cls, gear.table).gear;
  }
  return { state: s, gpLost, stat, item };
}

/* ------------------------------------------------------------------ helpers */

export const headerOf = (s: State) => ({ hp: s.hp, mp: s.mp, exp: s.exp, gp: s.gp, lvl: s.lvl });

export function xpGained (before: State, after: State): number {
  let xp = 0; let lvl = before.lvl; let exp = before.exp;
  while (lvl < after.lvl) { xp += toNextLevel(lvl) - exp; exp = 0; lvl += 1; }
  return xp + after.exp - exp;
}

/** Every crit roll this player has, evaluated at the current seed. */
export interface RollVerdict { key: string, name: string, stat: StatKey, chance: number, mult: number, crit: boolean, available: boolean }
export function verdicts (s: State): { seed: number, roll: number, rolls: RollVerdict[] } {
  const seed = seedOf(s);
  const roll = rollOf(seed);
  const tot = totals(s);
  const rolls: RollVerdict[] = [{
    key: 'task', name: 'Task', stat: 'str', chance: critChance(tot.str), mult: critMultiplier(tot.str),
    crit: roll <= critChance(tot.str), available: true,
  }];
  for (const def of SKILLS) {
    if (!def.crit || def.cls !== s.cls) continue;
    const v = tot[def.crit.stat];
    const chance = critChance(v, def.crit.base);
    rolls.push({
      key: def.key, name: def.name, stat: def.crit.stat, chance, mult: critMultiplier(v), crit: roll <= chance,
      available: s.classSelected && s.lvl >= def.lvl && s.mp >= def.mana,
    });
  }
  return { seed, roll, rolls };
}
