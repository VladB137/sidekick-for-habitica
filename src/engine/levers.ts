/*
 * Levers: honest ways to change the next crit roll, and a search for the cheapest
 * combination that makes it land. Every lever is simulated with the verified engine,
 * so a suggestion is exactly what the server will do.
 *
 * What counts as a lever (the project's standing rule): deterministic and verified
 * against Habitica's real code, something a player plausibly does anyway, and not on
 * the exploit list (fake tasks, padded checklists, uncheck/recheck loops, cron dodging,
 * timezone shifts, stat edits).
 */
import {
  availableSkills, buyGear, buyGems, buyPotion, buyReward, buyWithGold, castSkill, cloneState, critFor, gearFromEquipped,
  allocatePoint, applyEquip, scoreTask, seedOf, sellItem, skillByKey, withGear, xpGained,
  type ClassKey, type GearMeta, type GearTable, type StatKey, type State, type Stats4, type Task,
} from './core';
import { RULES } from './rules';

export type RollKey = 'task' | 'smash' | 'fireball' | 'backStab';

/** What the player has, as far as levers are concerned. */
export interface Inventory {
  /** own custom rewards */
  rewards: Array<{ id: string, text: string, price: number }>
  /**
   * sellable items the player owns (Saddles excluded). tier: 1 spare, 2 still useful or rare, 3 rare and
   * still useful (default 1); replace: what one would cost to get back, in Gold (default: its sell value)
   */
  sellables: Array<{ type: 'food' | 'eggs' | 'hatchingPotions', key: string, name: string, count: number, value: number, tier?: 1 | 2 | 3, replace?: number }>
  /** own tasks a task skill may target (no challenge/group tasks, no rewards) */
  targets: Task[]
  /** values of the tasks Searing Brightness would touch */
  brightnessValues?: number[]
  dailyCount?: number
  streaksActive?: boolean
  /** buffs.stealth and the player's Dailies due today and not done (stored isDue): the server refuses
   * Stealth when stealth >= that count (website/server/libs/spells.js, castSpell) */
  stealth?: number
  incompleteDailiesDue?: number
  /** items the player has marked "saving for" */
  savingFor: Array<{ kind: 'gear' | 'quest' | 'special' | 'gems', key: string, name: string, price: number, count?: number }>
  /** seasonal transformation items and cards buyable right now */
  seasonal: Array<{ key: string, name: string, price: number }>
  /** equipped keys and owned gear, for swaps */
  equipped?: Record<string, string>
  ownedGear?: string[]
  gearTable?: GearTable
  gearMeta?: Record<string, GearMeta>
  /** preferences.autoEquip: bought gear is equipped immediately */
  autoEquip?: boolean
  /** habits with a "-" button, for real slip-ups the player has to log anyway */
  badHabits: Task[]
  /**
   * open tasks the player may already have done but not ticked yet (habits with a "+", Dailies due and not done,
   * To-Dos not done): scoring one moves every number the roll reads. Offered only as "if you've already done it".
   */
  done?: Task[]
  /** where the player's next stat points go (the app never picks a stat for them) */
  allocateTo?: StatKey
  /** which lever families the player allows */
  allow?: Partial<Record<LeverKind, boolean>>
}

export type LeverKind = 'reward' | 'sell' | 'potion' | 'skill' | 'allocate' | 'gear' | 'purchase' | 'seasonal' | 'habitDown' | 'done';

/**
 * How much a suggestion asks of the player, most important first:
 * 0 free (a swap put back later, a point or purchase they'd make anyway), 1 cheap (mana, a little Gold,
 * spare items), 2 costs something (more Gold, items the stable still needs, rare spares), 3 last resort
 * (rare items the stable still needs).
 */
export type Tier = 0 | 1 | 2 | 3;
/** Gold spent counts as cheap up to 3% of what the player has, and never below 10. */
export const cheapGold = (gp: number) => Math.max(10, Math.round(gp * 0.03));

/** One step the app can perform with one API call. */
export type Step =
  | { kind: 'reward', taskId: string, label: string, price: number }
  | { kind: 'sell', type: string, key: string, amount: number, label: string, tier?: Tier }
  | { kind: 'potion', label: string }
  | { kind: 'cast', spellId: string, targetId?: string, label: string }
  | { kind: 'allocate', stat: StatKey, label: string }
  | { kind: 'equip', key: string, restore: string[], label: string }
  | { kind: 'buy', buyKind: 'gear' | 'quest' | 'special' | 'gems', key: string, label: string, price: number, count?: number }
  | { kind: 'habitDown', taskId: string, label: string }
  | { kind: 'score', taskId: string, label: string }

export interface LeverAction {
  kind: LeverKind
  tier: Tier
  steps: Step[]
  cost: number
  /** only valid if it actually happened (logging a bad habit) */
  conditional?: boolean
  /** only valid if the player has already done the task it scores */
  ifDone?: boolean
  apply: (s: State, ctx: ApplyCtx) => State
}
interface ApplyCtx { targetValues: Map<string, number> }

export interface ForceOption {
  kinds: LeverKind[]
  /** the costliest tier among its steps */
  tier: Tier
  steps: Step[]
  cost: number
  conditional: boolean
  /** scores a task: only for a task the player has already done */
  ifDone: boolean
  state: State
  summary: string
}

const rollStat = (roll: RollKey): { stat: StatKey, base: number } => {
  if (roll === 'smash') return { stat: 'con', base: RULES.critBase };
  if (roll === 'fireball') return { stat: 'per', base: RULES.critBase };
  if (roll === 'backStab') return { stat: 'str', base: RULES.backstabCritBase };
  return { stat: 'str', base: RULES.critBase };
};

export const rollHits = (s: State, roll: RollKey): boolean => {
  const { stat, base } = rollStat(roll);
  return critFor(s, stat, base) > 1;
};
/** The roll can still be made: a skill roll needs the class, level and mana left after the levers. */
export const rollReady = (s: State, roll: RollKey): boolean => {
  if (roll === 'task') return true;
  const def = skillByKey(roll);
  return !!def && s.classSelected && s.cls === def.cls && s.lvl >= def.lvl && s.mp >= def.mana;
};
const lands = (s: State, roll: RollKey): boolean => rollHits(s, roll) && rollReady(s, roll);


/** Sell k units from a pool of same-value, same-tier items, most plentiful kinds first. */
function sellSteps (pool: Inventory['sellables'], k: number, tier: Tier): Step[] {
  const steps: Step[] = [];
  let left = k;
  for (const it of [...pool].sort((a, b) => b.count - a.count)) {
    if (left <= 0) break;
    const n = Math.min(left, it.count);
    const note = tier >= 2 ? (tier === 3 ? '; rare, and your stable needs it' : '; your stable needs it, or it is rare') : '';
    if (n > 0) steps.push({ kind: 'sell', type: it.type, key: it.key, amount: n, tier, label: `Sell ${n} × ${it.name} (+${n * it.value} Gold${note})` });
    left -= n;
  }
  return steps;
}

const empty = (v?: string) => !v || v.endsWith('_base_0');
/**
 * What to put back after the tap: every slot the swap changed. An item was there → equip it again; the slot was
 * empty → take the new item off ("-key", equip toggles it off). Re-equipping first also undoes two-handed side
 * effects, so "-" entries run last and only if still needed.
 */
function restoreList (equipped: Record<string, string>, next: Record<string, string>): string[] {
  const changed = Object.keys(next).filter(k => next[k] !== equipped[k]);
  return [
    ...changed.filter(k => !empty(equipped[k])).map(k => equipped[k]),
    ...changed.filter(k => empty(equipped[k]) && !empty(next[k])).map(k => `-${next[k]}`),
  ];
}

/**
 * The owned loadout with the highest total of one stat: per slot the best piece, and the better of a two-handed
 * weapon or a one-handed weapon plus shield. Gear never moves the seed, so for a crit this is the best any swap
 * can do. Ties keep what is equipped.
 */
export function bestLoadout (equipped: Record<string, string>, owned: string[], cls: ClassKey, stat: StatKey, table: GearTable, meta: Record<string, GearMeta>): Record<string, string> {
  return bestLoadoutBy(equipped, owned, cls, { str: 0, con: 0, int: 0, per: 0, [stat]: 1 }, table, meta);
}

/**
 * The owned loadout with the highest weighted sum of the four stats (each slot adds its own share, so per-slot
 * picking is exact for any weights). Same two-handed rules and tie-breaking as `bestLoadout`.
 */
export function bestLoadoutBy (equipped: Record<string, string>, owned: string[], cls: ClassKey, weight: Stats4, table: GearTable, meta: Record<string, GearMeta>): Record<string, string> {
  const val = (k?: string) => {
    if (!k || empty(k) || !meta[k]) return 0;
    const g = gearFromEquipped([k], cls, table).gear;
    return g.str * weight.str + g.con * weight.con + g.int * weight.int + g.per * weight.per;
  };
  const best = (slot: string, ok: (k: string) => boolean = () => true) => {
    let key = equipped[slot] && ok(equipped[slot]) ? equipped[slot] : undefined;
    for (const k of owned) if (meta[k] && meta[k][0] === slot && ok(k) && val(k) > val(key)) key = k;
    return key;
  };
  const next = { ...equipped };
  const slots = new Set([...Object.keys(equipped), ...owned.map(k => meta[k]?.[0]).filter(Boolean)]);
  for (const slot of slots) {
    if (slot === 'weapon' || slot === 'shield') continue;
    const k = best(slot);
    if (k) next[slot] = k;
  }
  // weapon and shield together: the best two-handed weapon alone, or the best one-handed weapon plus the best shield
  const curTwo = !!meta[equipped.weapon]?.[5];
  const two = best('weapon', k => !!meta[k]?.[5]);
  const one = best('weapon', k => !meta[k]?.[5]);
  const shield = best('shield');
  const pair = val(one) + val(shield);
  if (two && (val(two) > pair || (val(two) === pair && curTwo))) {
    next.weapon = two;
    if (!empty(next.shield)) next.shield = 'shield_base_0';
  } else {
    next.weapon = one ?? (curTwo ? 'weapon_base_0' : equipped.weapon);
    if (shield) next.shield = shield;
  }
  return next;
}

/**
 * The equip calls that turn `equipped` into `target`, in an order that gets there (weapon first: a two-handed
 * weapon drops the shield, a shield drops a two-handed weapon), and the loadout they end in. Equipping an
 * equipped item takes it off, which is how a slot the target leaves bare gets emptied.
 */
export function equipCalls (equipped: Record<string, string>, target: Record<string, string>, meta: Record<string, GearMeta>): { keys: string[], result: Record<string, string> } {
  const order = Object.keys(target).filter(k => target[k] !== equipped[k] && !empty(target[k])).sort((a, b) => (a === 'weapon' ? -1 : b === 'weapon' ? 1 : a === 'shield' ? -1 : b === 'shield' ? 1 : 0));
  let cur = equipped;
  const keys: string[] = [];
  for (const slot of order) { if (cur[slot] === target[slot]) continue; cur = applyEquip(cur, target[slot], meta); keys.push(target[slot]); }
  // empty a slot the loadout leaves bare (a two-handed weapon that loses to weapon-less shield, or a shield to a two-hander)
  for (const slot of ['weapon', 'shield']) if (empty(target[slot]) && !empty(cur[slot])) { keys.push(cur[slot]); cur = applyEquip(cur, cur[slot], meta); }
  return { keys, result: cur };
}

/** What to put back after a swap from `equipped` to `next` (see restoreList). */
export const restoreCalls = (equipped: Record<string, string>, next: Record<string, string>): string[] => restoreList(equipped, next);

interface GearCandidate { gear: Stats4, steps: Step[], loadout?: boolean }
/**
 * One-item swaps between owned pieces (two-handed rules included), one per resulting set of totals, plus the
 * best owned loadout for the roll's stat when that changes more than one slot. Cached per inventory.
 */
const gearCache = new WeakMap<Inventory, { cls: string, stat: StatKey, list: GearCandidate[] }>();
function gearCandidates (inv: Inventory, cls: ClassKey, stat: StatKey): GearCandidate[] {
  const hit = gearCache.get(inv);
  if (hit && hit.cls === cls && hit.stat === stat) return hit.list;
  const list: GearCandidate[] = [];
  if (inv.equipped && inv.ownedGear && inv.gearTable && inv.gearMeta) {
    const { equipped, gearTable: table, gearMeta: meta } = inv;
    const seenTotals = new Set<string>([Object.values(gearFromEquipped(Object.values(equipped), cls, table).gear).join(',')]);
    for (const key of inv.ownedGear) {
      const m = meta[key];
      if (!m || equipped[m[0]] === key) continue;
      const next = applyEquip(equipped, key, meta);
      const g = gearFromEquipped(Object.values(next), cls, table).gear;
      const sig = `${g.str},${g.con},${g.int},${g.per}`;
      if (seenTotals.has(sig)) continue;
      seenTotals.add(sig);
      const restore = restoreList(equipped, next);
      const back = Object.keys(next).some(k => next[k] !== equipped[k] && !empty(equipped[k])) ? 'put it back after your task' : 'take it off after your task';
      list.push({ gear: g, steps: [{ kind: 'equip', key, restore, label: `Equip ${m[2]} (${m[0]}; ${back})` }] });
    }
    // the best loadout for the stat, as equip calls in an order that gets there
    const target = bestLoadout(equipped, inv.ownedGear, cls, stat, table, meta);
    const { keys, result: cur } = equipCalls(equipped, target, meta);
    const g = gearFromEquipped(Object.values(cur), cls, table).gear;
    if (keys.length > 1 && g[stat] > gearFromEquipped(Object.values(equipped), cls, table).gear[stat]) {
      const restore = restoreList(equipped, cur);
      const steps: Step[] = keys.map((key, i) => ({
        kind: 'equip', key, restore,
        label: i === 0 ? `Equip your best ${stat.toUpperCase()} gear: ${meta[key][2]} (${meta[key][0]})` : `Equip ${meta[key][2]} (${meta[key][0]}${i === keys.length - 1 ? '; put it all back after' : ''})`,
      }));
      list.push({ gear: g, steps, loadout: true });
    }
  }
  gearCache.set(inv, { cls, stat, list });
  return list;
}

const ONCE = new Set(['frost', 'stealth']);
const castKey = (a: LeverAction) => { const st = a.steps[0]; return st && st.kind === 'cast' ? st.spellId : undefined; };

/** Candidate single actions from the current state. */
export function leverActions (s: State, inv: Inventory, roll: RollKey): LeverAction[] {
  const allow = (k: LeverKind) => inv.allow?.[k] !== false;
  const acts: LeverAction[] = [];
  // at 0 HP the official apps allow nothing but reviving (the server itself doesn't enforce it)
  if (s.hp <= 0) return acts;

  const goldTier = (price: number): Tier => (price <= cheapGold(s.gp) ? 1 : 2);
  if (allow('reward')) {
    for (const r of inv.rewards) {
      if (r.price <= 0 || r.price > s.gp) continue;
      acts.push({
        kind: 'reward', tier: goldTier(r.price), cost: r.price, steps: [{ kind: 'reward', taskId: r.id, label: `Buy your reward “${r.text}” (${r.price} Gold)`, price: r.price }],
        apply: st => buyReward(st, r.price),
      });
    }
  }

  if (allow('sell')) {
    // pool by unit value and tier: selling k items of one pool moves the roll the same way, whichever kinds they are
    const pools = new Map<string, Inventory['sellables']>();
    for (const it of inv.sellables) {
      if (it.count <= 0 || it.value <= 0) continue;
      const pk = `${it.type === 'food' ? 'food' : it.type}:${it.value}:${it.tier ?? 1}`;
      if (!pools.has(pk)) pools.set(pk, []);
      pools.get(pk)!.push(it);
    }
    for (const [pk, pool] of pools) {
      const [type, v, t] = pk.split(':');
      const value = Number(v);
      const tier = Number(t) as Tier;
      const have = pool.reduce((a, b) => a + b.count, 0);
      // spare items: a nominal cost that prefers fewer; others: what they'd cost to get back
      const replace = Math.max(...pool.map(it => it.replace ?? it.value));
      const perItemCost = tier === 1 ? (type === 'food' ? 0.25 : 1) : tier === 2 ? replace : replace * 2;
      for (let k = 1; k <= Math.min(have, 40); k += 1) {
        acts.push({
          kind: 'sell', tier, cost: k * perItemCost, steps: sellSteps(pool, k, tier),
          apply: st => sellItem(st, value, k),
        });
      }
    }
  }

  if (allow('potion') && s.hp > 0 && s.hp < RULES.maxHealth && s.gp >= RULES.healthPotion.price) {
    acts.push({
      kind: 'potion', tier: goldTier(RULES.healthPotion.price), cost: RULES.healthPotion.price - Math.min(RULES.healthPotion.heal, RULES.maxHealth - s.hp) * 0.5,
      steps: [{ kind: 'potion', label: `Drink a Health Potion (25 Gold, +${Math.min(15, RULES.maxHealth - s.hp)} HP)` }],
      apply: st => buyPotion(st),
    });
  }

  if (allow('skill')) {
    const targets = [...inv.targets].filter(t => t.type !== 'reward' && !t.shared).sort((a, b) => b.value - a.value);
    for (const def of availableSkills(s)) {
      // casting the very skill whose roll we're steering is the roll itself, not a lever
      if (def.key === roll) continue;
      if (def.key === 'heal' && s.hp >= RULES.maxHealth) continue;
      if (def.key === 'frost' && inv.streaksActive) continue;
      if (def.key === 'stealth' && inv.incompleteDailiesDue !== undefined && (inv.stealth ?? 0) >= inv.incompleteDailiesDue) continue;
      const useful = ['smash', 'fireball', 'pickPocket', 'backStab', 'heal', 'healAll'].includes(def.key);
      const cost = def.mana * (useful ? 0.5 : 1);
      if (def.target === 'task') {
        // the seed shift of Burst of Flames, Pickpocket and Backstab depends on the target's value
        const seen = new Set<string>();
        for (const t of targets) {
          const probe = castSkill(s, def.key, { targetValue: t.value });
          const sig = `${seedOf(probe.state)}`;
          if (seen.has(sig)) continue;
          seen.add(sig);
          acts.push({
            kind: 'skill', tier: 1, cost, steps: [{ kind: 'cast', spellId: def.key, targetId: t.id, label: `Cast ${def.name} on “${t.text || 'a task'}”` }],
            apply: (st, ctx) => {
              const r = castSkill(st, def.key, { targetValue: ctx.targetValues.get(t.id) ?? t.value });
              if (r.targetValue !== undefined) ctx.targetValues.set(t.id, r.targetValue);
              return r.state;
            },
          });
          if (seen.size >= 3) break;
        }
        if (!targets.length && def.key === 'smash') continue;
      } else {
        acts.push({
          kind: 'skill', tier: 1, cost, steps: [{ kind: 'cast', spellId: def.key, label: `Cast ${def.name}` }],
          apply: st => castSkill(st, def.key, { taskValues: inv.brightnessValues, dailyCount: inv.dailyCount, streaksActive: inv.streaksActive }).state,
        });
      }
    }
  }

  if (allow('allocate') && s.classSelected && s.points > 0 && inv.allocateTo) {
    // only the stat the player has chosen for their build; spending it now instead of later is free
    const stat = inv.allocateTo;
    acts.push({
      kind: 'allocate', tier: 0, cost: 0.2,
      steps: [{ kind: 'allocate', stat, label: `Spend a stat point on ${stat.toUpperCase()} now` }],
      apply: st => allocatePoint(st, stat),
    });
  }

  if (allow('gear')) {
    for (const g of gearCandidates(inv, s.cls as ClassKey, rollStat(roll).stat)) {
      if (g.gear.str === s.gear.str && g.gear.con === s.gear.con && g.gear.per === s.gear.per) continue;
      acts.push({ kind: 'gear', tier: 0, cost: 0.5 + 0.1 * (g.steps.length - 1), steps: g.steps, apply: st => withGear(st, g.gear) });
    }
  }

  if (allow('purchase')) {
    for (const it of inv.savingFor) {
      const n = it.count || 1;
      const price = it.kind === 'gems' ? RULES.gemGoldPrice * n : it.price;
      if (price > s.gp) continue;
      acts.push({
        kind: 'purchase', tier: 0, cost: 0.1,
        steps: [{ kind: 'buy', buyKind: it.kind, key: it.key, label: `Buy ${it.name} now (${price} Gold; you were saving for it)`, price, count: n }],
        apply: st => {
          if (it.kind === 'gems') return buyGems(st, n);
          if (it.kind === 'gear' && inv.autoEquip && inv.equipped && inv.gearMeta && inv.gearTable) {
            return buyGear(st, it.key, price, { autoEquip: true, equipped: inv.equipped, meta: inv.gearMeta, table: inv.gearTable }).state;
          }
          return buyWithGold(st, price);
        },
      });
    }
  }

  if (allow('seasonal')) {
    for (const it of inv.seasonal) {
      if (it.price > s.gp) continue;
      acts.push({
        kind: 'seasonal', tier: goldTier(it.price), cost: it.price,
        steps: [{ kind: 'buy', buyKind: 'special', key: it.key, label: `Buy ${it.name} (${it.price} Gold)`, price: it.price }],
        apply: st => buyWithGold(st, it.price),
      });
    }
  }

  if (allow('done') && inv.done) {
    // a task the player has done but not ticked: free, but only true if they really did it. One per distinct result.
    const seen = new Set<string>();
    for (const t of inv.done) {
      if (t.type === 'reward') continue;
      let probe: State;
      try { probe = scoreTask(s, t, 'up').state; } catch { continue; }
      const sig = `${seedOf(probe)}|${probe.lvl}|${probe.str}|${probe.con}|${probe.per}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      acts.push({
        kind: 'done', tier: 0, cost: 0.3, ifDone: true,
        steps: [{ kind: 'score', taskId: t.id, label: `Score “${t.text || 'a task'}”, if you’ve already done it` }],
        apply: (st, ctx) => {
          const r = scoreTask(st, { ...t, value: ctx.targetValues.get(t.id) ?? t.value }, 'up');
          ctx.targetValues.set(t.id, r.task.value);
          return r.state;
        },
      });
      if (seen.size >= 8) break;
    }
  }

  if (allow('habitDown')) {
    for (const h of inv.badHabits) {
      acts.push({
        kind: 'habitDown', tier: 1, cost: 6, conditional: true,
        steps: [{ kind: 'habitDown', taskId: h.id, label: `Log “${h.text || 'bad habit'}” (−), only if it really happened` }],
        apply: (st, ctx) => {
          const r = scoreTask(st, { ...h, value: ctx.targetValues.get(h.id) ?? h.value }, 'down');
          ctx.targetValues.set(h.id, r.task.value);
          return r.state;
        },
      });
    }
  }
  return acts;
}

function describe (steps: Step[]): string {
  return steps.map(s => s.label).join(', then ');
}

/**
 * Cheapest ways to make the next `roll` crit. Searches single actions and pairs,
 * simulating each with the engine, and returns diverse options sorted by cost.
 */
export function forceOptions (state: State, inv: Inventory, roll: RollKey = 'task', opts: { max?: number, depth?: number, expand?: number } = {}): { already: boolean, options: ForceOption[] } {
  if (rollHits(state, roll)) return { already: true, options: [] };
  const maxOut = opts.max ?? 5;
  const depth = opts.depth ?? 2;
  const found: ForceOption[] = [];
  const first = leverActions(state, inv, roll);

  const tryApply = (a: LeverAction, s: State, ctx: ApplyCtx): State | null => {
    try { return a.apply(s, ctx); } catch { return null; }
  };
  const record = (acts: LeverAction[], s: State) => {
    const steps = acts.flatMap(a => a.steps);
    found.push({
      kinds: acts.map(a => a.kind), tier: Math.max(...acts.map(a => a.tier)) as Tier, steps, cost: acts.reduce((x, a) => x + a.cost, 0),
      conditional: acts.some(a => a.conditional), ifDone: acts.some(a => a.ifDone), state: s, summary: describe(steps),
    });
  };

  // single actions first: anything that already works alone makes every pair containing it pointless
  const singles: Array<{ a: LeverAction, s1: State, ctx: ApplyCtx }> = [];
  const singleHit = new Set<string>();
  for (const a of first) {
    const ctx: ApplyCtx = { targetValues: new Map() };
    const s1 = tryApply(a, state, ctx);
    if (!s1) continue;
    if (lands(s1, roll)) { record([a], s1); singleHit.add(describe(a.steps)); } else singles.push({ a, s1, ctx });
  }
  if (depth >= 2) {
    const seen = new Set<string>();
    // expand the cheapest first moves only; pairs of two expensive moves are never the cheapest answer
    singles.sort((x, y) => (x.a.tier - y.a.tier) || (x.a.cost - y.a.cost));
    for (const { a, s1, ctx } of singles.slice(0, opts.expand ?? 60)) {
      const sig = `${seedOf(s1)}|${s1.gear.str}|${s1.gear.con}|${s1.gear.per}|${s1.buffs.str}|${s1.buffs.con}|${s1.buffs.per}|${s1.str}|${s1.con}|${s1.per}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      for (const b of leverActions(s1, inv, roll)) {
        if (b.kind === a.kind && (a.kind === 'sell' || a.kind === 'allocate' || a.kind === 'gear' || a.kind === 'habitDown' || a.kind === 'done')) continue;
        // `inv` describes the state before `a`: after Chilling Frost the server refuses a second one
        // (streaks already active), and after Stealth the buff may already cover every Dailies due
        if (b.kind === 'skill' && a.kind === 'skill' && castKey(a) === castKey(b) && ONCE.has(castKey(a)!)) continue;
        if (singleHit.has(describe(b.steps))) continue;
        const ctx2: ApplyCtx = { targetValues: new Map(ctx.targetValues) };
        const s2 = tryApply(b, s1, ctx2);
        if (s2 && lands(s2, roll)) record([a, b], s2);
      }
    }
  }

  // free first, then cheap, then costly, last resort at the end; within a tier the smallest cost, then the fewest
  // steps; one option per family of levers so the list shows real alternatives. Options that need the player to
  // have done a task come after those that need nothing, up to three of them on top of `max`; conditional
  // (bad-habit) options last.
  found.sort((x, y) => (Number(x.conditional) - Number(y.conditional)) || (Number(x.ifDone) - Number(y.ifDone)) || (x.tier - y.tier) || (x.cost - y.cost) || (x.steps.length - y.steps.length));
  const out: ForceOption[] = [];
  const families = new Set<string>();
  let plain = 0; let done = 0;
  for (const f of found) {
    const fam = [...f.kinds].sort().join('+');
    if (families.has(fam)) continue;
    if (f.ifDone ? done >= 3 : plain >= maxOut) continue;
    families.add(fam);
    out.push(f);
    if (f.ifDone) done += 1; else plain += 1;
  }
  return { already: false, options: out };
}

/** For each task: what tapping it now gives, and whether the tap after it would crit. */
export interface TaskPreview {
  id: string
  crit: boolean
  mult: number
  dExp: number
  dGp: number
  dMp: number
  dHp: number
  dmg: number
  leveled: number
  nextCrit: boolean
  after: State
  error?: string
}

export function taskPreviews (state: State, tasks: Task[], direction: 'up' | 'down' = 'up'): TaskPreview[] {
  return tasks.map(t => {
    try {
      const r = scoreTask(state, t, direction);
      const dExp = r.leveled ? xpGained(state, r.state) : r.state.exp - state.exp;
      return {
        id: t.id, crit: r.crit, mult: r.mult, dExp, dGp: r.state.gp - state.gp, dMp: r.state.mp - state.mp,
        dHp: r.state.hp - state.hp, dmg: r.dmg, leveled: r.leveled, nextCrit: rollHits(r.state, 'task'), after: r.state,
      };
    } catch (e) {
      return {
        id: t.id, crit: false, mult: 1, dExp: 0, dGp: 0, dMp: 0, dHp: 0, dmg: 0, leveled: 0, nextCrit: false,
        after: cloneState(state), error: (e as Error).message,
      };
    }
  });
}

export { skillByKey };
