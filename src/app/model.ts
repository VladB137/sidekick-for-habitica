/*
 * Turns Habitica API objects into the engine's plain structures, and checks the
 * engine's reading of them against what the server itself reports.
 */
import {
  gearFromEquipped, totals,
  type AllocationMode, type DailySchedule, type ClassKey, type DayClock, type DropAccount, type GearMeta, type GearTable, type HistoryEntry, type Inventory, type StableCatalogue, type State, type StatKey, type Task,
} from '../engine';
import gearJson from '../data/gear.json';
import itemsJson from '../data/items.json';
import type { Json } from '../api/client';

export const GEAR = gearJson as unknown as GearTable;
export const ITEMS = itemsJson as unknown as {
  habitica: string
  generated: string
  gear: Record<string, GearMeta>
  /** name, sell value in Gold (= Market price in Gems), favourite of pets of this potion */
  food: Record<string, [string, number, string]>
  /** name, sell value, drop egg (Market) or quest egg, the grown mount's name when it differs (Tiger Cub grows into a Tiger) */
  eggs: Record<string, [string, number, 'drop' | 'quest', string?]>
  /** Habitica's word for what an egg hatches into, as its hatching message says it: 'a loyal' (Wolf), 'woolen' (Yarn) */
  eggWords: Record<string, string>
  /** Habitica's animal families (its set achievements): species in each */
  animalSets: Record<string, string[]>
  /** name, sell value, drop (Market), premium (magic, limited) or wacky */
  hatchingPotions: Record<string, [string, number, 'drop' | 'premium' | 'wacky']>
  /** gold quests: name, price, quests that must be completed first */
  quests: Record<string, [string, number, string[]?]>
  special: Record<string, [string, number, string]>
  /** name, boss HP, boss name, boss strength (multiplies the damage of missed Dailies) */
  bossQuests: Record<string, [string, number, string, number?]>
  /** name, { item key: [item name, count needed] } */
  collectQuests: Record<string, [string, Record<string, [string, number]>]>
  /** Habitica's own names for its special pets and mounts (Cerberus Pup, Woolly Mammoth): not "Potion Egg" */
  specialPets: Record<string, string>
  specialMounts: Record<string, string>
};

export interface ChecklistItem { id: string, text: string, completed: boolean }
export interface UiTask extends Task {
  text: string
  notes: string
  checklist: ChecklistItem[]
  isDue: boolean
  /** part of an active challenge */
  challenge: boolean
  /** a team/group task: another user's stats may move when it's unchecked, so predictions aren't checked */
  team: boolean
  /** on the team board (group.id, no userId): the player's own day change never sees it, and neither does Stealth
   * (libs/cron.js and libs/spells.js load only tasks with the player's userId) */
  board: boolean
  /** skills can't target it: any challenge or group task, broken or not (server/libs/spells.js castTaskSpell) */
  noCast: boolean
  /** Searing Brightness skips it: active challenge or group tasks (models/task.js taskIsGroupOrChallengeQuery) */
  brightnessSkip: boolean
  /** Dailies: false when the player turned off "record yesterday's activity" for it */
  yesterDaily: boolean
  /** Dailies: repeat settings, for working out which days it is due (engine/schedule.ts) */
  schedule?: DailySchedule
  /** habits and Dailies: Habitica's own record of them (engine/history.ts), the last HISTORY_DAYS days */
  history?: HistoryEntry[]
}

/** How far back the app keeps task history (Habitica keeps 60 days day by day, a year for subscribers). */
export const HISTORY_DAYS = 120;

export interface Snapshot {
  userId: string
  name: string
  state: State
  /** what the server says, for self-checks */
  serverMaxMP?: number
  needsCron: boolean
  lastCron?: string
  equipped: Record<string, string>
  owned: string[]
  unknownGear: string[]
  autoEquip: boolean
  classesDisabled: boolean
  /** resting in the Inn: the day change does no damage */
  sleeping: boolean
  streaksActive: boolean
  stealth: number
  items: { food: Record<string, number>, eggs: Record<string, number>, hatchingPotions: Record<string, number>, special: Record<string, number> }
  /** stable: pet growth by "Egg-Potion" (> 0 alive, -1 raised into a mount), mounts owned */
  pets: Record<string, number>
  mounts: Record<string, boolean>
  quest: { key?: string, pendingDamage: number, collected: number }
  subscribed: boolean
  dailyCount: number
  /** gems still buyable with gold this month (libs/planGemLimits.js: 24 + consecutive.gemCapExtra − gemsBought) */
  gemsLeft: number
  /** quests the player has completed (achievements.quests), for gold-quest prerequisites */
  questsDone: string[]
  /** what randomDrop reads besides the stats: today's drop count, contributor level, achievements, day start */
  drops: DropAccount
  habiticaVersion?: string
  /** the player's time zone and day start, for telling which Habitica day a moment belongs to */
  clock: DayClock
  /** when the day changes ran (history.exp, lastCron), ascending: for reading Daily history */
  cronTimes: number[]
}

const num = (v: unknown, d = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

export function stateFromStats (stats: Json, gear: State['gear'], flags: { classSelected: boolean, autoAllocate: boolean, allocationMode: AllocationMode }): State {
  const b = stats.buffs || {};
  const tr = stats.training || {};
  return {
    hp: num(stats.hp), mp: num(stats.mp), exp: num(stats.exp), gp: num(stats.gp), lvl: num(stats.lvl, 1), points: num(stats.points),
    str: num(stats.str), con: num(stats.con), int: num(stats.int), per: num(stats.per),
    buffs: { str: num(b.str), con: num(b.con), int: num(b.int), per: num(b.per) },
    gear,
    training: { int: num(tr.int), per: num(tr.per), str: num(tr.str), con: num(tr.con) },
    cls: (stats.class || 'warrior') as ClassKey,
    classSelected: flags.classSelected,
    autoAllocate: flags.autoAllocate,
    allocationMode: flags.allocationMode,
  };
}

export function snapshotFromUser (u: Json): Snapshot {
  const equipped: Record<string, string> = { ...(u.items?.gear?.equipped || {}) };
  const owned = Object.entries(u.items?.gear?.owned || {}).filter(([, v]) => v).map(([k]) => k);
  const cls = (u.stats?.class || 'warrior') as ClassKey;
  const { gear, unknown } = gearFromEquipped(Object.values(equipped), cls, GEAR);
  const classesDisabled = !!u.preferences?.disableClasses;
  const state = stateFromStats(u.stats || {}, gear, {
    // common/script/libs/hasClass.js: level 10+, classes enabled, class chosen
    classSelected: !!u.flags?.classSelected && !classesDisabled && (u.stats?.lvl || 0) >= 10,
    autoAllocate: !!u.preferences?.automaticAllocation,
    allocationMode: (u.preferences?.allocationMode || 'flat') as AllocationMode,
  });
  const plan = u.purchased?.plan || {};
  return {
    userId: u._id || u.id,
    name: u.profile?.name || u.auth?.local?.username || 'Player',
    state,
    serverMaxMP: typeof u.stats?.maxMP === 'number' ? u.stats.maxMP : undefined,
    needsCron: !!u.needsCron,
    lastCron: u.lastCron,
    equipped, owned, unknownGear: unknown,
    autoEquip: u.preferences?.autoEquip !== false,
    classesDisabled,
    sleeping: !!u.preferences?.sleep,
    streaksActive: !!u.stats?.buffs?.streaks,
    stealth: num(u.stats?.buffs?.stealth),
    items: {
      food: { ...(u.items?.food || {}) },
      eggs: { ...(u.items?.eggs || {}) },
      hatchingPotions: { ...(u.items?.hatchingPotions || {}) },
      special: { ...(u.items?.special || {}) },
    },
    pets: { ...(u.items?.pets || {}) },
    mounts: { ...(u.items?.mounts || {}) },
    quest: { key: u.party?.quest?.key || undefined, pendingDamage: num(u.party?.quest?.progress?.up), collected: num(u.party?.quest?.progress?.collectedItems) },
    // ops/buy/buyGem.js only checks for a customer id (a cancelled plan stays active until it ends)
    subscribed: !!plan.customerId,
    dailyCount: (u.tasksOrder?.dailys || []).length,
    gemsLeft: plan.customerId ? Math.max(0, 24 + num(plan.consecutive?.gemCapExtra) - num(plan.gemsBought)) : 0,
    questsDone: Object.entries(u.achievements?.quests || {}).filter(([, n]) => Number(n) > 0).map(([k]) => k),
    drops: dropAccount(u),
    clock: { tzOffset: num(u.preferences?.timezoneOffset), dayStart: num(u.preferences?.dayStart) },
    cronTimes: cronTimesOf(u),
  };
}

function cronTimesOf (u: Json): number[] {
  const out = (Array.isArray(u.history?.exp) ? u.history.exp : []).map((e: Json) => Date.parse(e?.date)).filter(Number.isFinite) as number[];
  const last = Date.parse(u.lastCron);
  if (Number.isFinite(last) && !out.includes(last)) out.push(last);
  return out.sort((a, b) => a - b);
}

/** Habitica's history entries of a habit or Daily, the recent ones in the shape engine/history.ts reads. */
function historyOf (t: Json): HistoryEntry[] | undefined {
  if ((t.type !== 'habit' && t.type !== 'daily') || !Array.isArray(t.history)) return undefined;
  const since = Date.now() - HISTORY_DAYS * 864e5;
  const out: HistoryEntry[] = [];
  for (const e of t.history) {
    const date = typeof e?.date === 'number' ? e.date : Date.parse(e?.date);
    if (!Number.isFinite(date) || date < since) continue;
    if (t.type === 'daily' && typeof e.completed === 'boolean') out.push({ date, isDue: e.isDue !== false, completed: e.completed });
    else if (t.type === 'habit' && (typeof e.scoredUp === 'number' || typeof e.scoredDown === 'number')) out.push({ date, scoredUp: num(e.scoredUp), scoredDown: num(e.scoredDown) });
  }
  return out;
}

function dropAccount (u: Json): DropAccount {
  const last = u.items?.lastDrop || {};
  const at = last.date === undefined ? undefined : last.date === null ? null : new Date(last.date).getTime();
  const size = (o: unknown) => (o && typeof o === 'object' ? Object.keys(o).length : 0);
  return {
    contributor: num(u.contributor?.level),
    rebirths: num(u.achievements?.rebirths),
    streakAchievements: num(u.achievements?.streak),
    subscribed: !!u.purchased?.plan?.customerId,
    lastDropAt: at, lastDropCount: num(last.count),
    dayStart: num(u.preferences?.dayStart),
    timezoneOffset: typeof u.preferences?.timezoneOffset === 'number' ? u.preferences.timezoneOffset : undefined,
    completedTask: !!u.achievements?.completedTask,
    // randomDrop checks how many kinds the objects hold (keys, even at 0), not the counts
    hasEggsOrPotions: size(u.items?.eggs) + size(u.items?.hatchingPotions) > 0,
    hasFood: size(u.items?.food) > 0,
  };
}

/** Food, eggs and potions as the feeding plan reads them (src/data/items.json, generated from Habitica's content). */
// (a loop, not Object.fromEntries: this runs at load, maybe before src/app/polyfills.ts)
const third = <T extends string>(o: Record<string, readonly [unknown, unknown, T, ...unknown[]]>) => {
  const r: Record<string, T> = {};
  for (const [k, v] of Object.entries(o)) r[k] = v[2];
  return r;
};
export const STABLE: StableCatalogue = {
  foodTarget: third(ITEMS.food),
  eggKind: third(ITEMS.eggs),
  potionKind: third(ITEMS.hatchingPotions),
};

/** A display name for a food, egg or potion key; falls back to the key. */
export function itemName (kind: 'food' | 'eggs' | 'hatchingPotions', key: string): string {
  if (kind === 'food') return key === 'Saddle' ? 'Saddle' : ITEMS.food[key]?.[0] || key;
  if (kind === 'eggs') return `${ITEMS.eggs[key]?.[0] || key} egg`;
  return `${ITEMS.hatchingPotions[key]?.[0] || key} hatching potion`;
}

/** "Wolf-Red" → "Red Wolf", as Habitica names it: a mount by its grown name ("TigerCub-Red" → "Red Tiger"), special ones by their own. */
export function petName (key: string, mount = false): string {
  const own = (mount ? ITEMS.specialMounts : ITEMS.specialPets)[key];
  if (own) return own;
  const i = key.indexOf('-');
  const egg = key.slice(0, i); const potion = key.slice(i + 1);
  const e = ITEMS.eggs[egg];
  return `${ITEMS.hatchingPotions[potion]?.[0] || potion} ${(mount ? e?.[3] : undefined) || e?.[0] || egg}`;
}

/** Replace stats after an action whose response carries user.stats (score, allocate, potion, sell…). */
export function withStats (snap: Snapshot, stats: Json): Snapshot {
  const state = stateFromStats(stats, snap.state.gear, { classSelected: snap.state.classSelected, autoAllocate: snap.state.autoAllocate, allocationMode: snap.state.allocationMode });
  return { ...snap, state, streaksActive: !!stats.buffs?.streaks, stealth: num(stats.buffs?.stealth) };
}

export function taskFromApi (t: Json, userId?: string): UiTask {
  const checklist: ChecklistItem[] = (t.checklist || []).map((c: Json) => ({ id: c.id, text: String(c.text ?? ''), completed: !!c.completed }));
  const hasChallenge = !!(t.challenge && t.challenge.id);
  const challenge = hasChallenge && !t.challenge.broken;
  const group = !!(t.group && t.group.id);
  // team tasks with assignees: this player's own completion lives in assignedUsersDetail
  const mine = group && userId ? t.group.assignedUsersDetail?.[userId] : undefined;
  const completed = mine ? !!mine.completed : !!t.completed;
  return {
    id: t._id || t.id,
    text: String(t.text ?? ''),
    notes: String(t.notes ?? ''),
    type: t.type,
    value: num(t.value),
    priority: num(t.priority, 1),
    streak: num(t.streak),
    checked: checklist.filter(c => c.completed).length,
    attribute: (t.attribute || 'str') as StatKey,
    completed,
    up: t.up !== false,
    down: !!t.down,
    shared: hasChallenge || group,
    checklist,
    isDue: t.type === 'daily' ? !!t.isDue : true,
    challenge,
    team: group,
    board: group && !t.userId,
    noCast: hasChallenge || group,
    brightnessSkip: challenge || (group && !t.group.broken),
    yesterDaily: t.yesterDaily !== false,
    schedule: t.type === 'daily' ? {
      type: 'daily', frequency: t.frequency, everyX: t.everyX, startDate: t.startDate,
      repeat: t.repeat, daysOfMonth: t.daysOfMonth, weeksOfMonth: t.weeksOfMonth,
    } : undefined,
    history: historyOf(t),
  };
}

/** Engine-side verification of the server's own numbers: max MP = 2 × INT total + 30. */
export function gearCheck (snap: Snapshot): { ok: boolean, message?: string } {
  if (snap.unknownGear.length) return { ok: false, message: `Unknown gear: ${snap.unknownGear.join(', ')}. Its stats aren’t counted until the item table updates, so a crit shown is still certain but “no crit” may be one.` };
  if (snap.serverMaxMP !== undefined && totals(snap.state).maxMP !== snap.serverMaxMP) {
    return { ok: false, message: `Habitica says max MP ${snap.serverMaxMP}, Sidekick computes ${totals(snap.state).maxMP}. Some stat total is off — check for an update.` };
  }
  return { ok: true };
}

export interface ShopInfo {
  seasonal: Array<{ key: string, name: string, price: number }>
  /** seasonal gear for sale for gold right now (the current set of the player's class) */
  gear: Array<{ key: string, name: string, price: number }>
}
export const EMPTY_SHOP: ShopInfo = { seasonal: [], gear: [] };

export interface SavingFor { kind: 'gear' | 'quest' | 'special' | 'gems', key: string, name: string, price: number, count?: number }

/**
 * What the player's stable still needs, per item (ops/hatch.js, ops/feed.js):
 * - every egg × potion pairing wants a pet and a mount (wacky pets have no mount), so a pairing needs
 *   (pet alive ? 0 : 1) + (mount owned ? 0 : 1) more hatches;
 * - premium and wacky potions only hatch drop eggs; quest eggs only take drop potions;
 * - only pairings the player can actually make count: drop eggs and drop potions (always obtainable),
 *   other eggs and potions only while the player holds some;
 * - food: pets being raised right now need ceil((50 − growth) / 5) of their favourite food.
 */
export function stableNeeds (snap: Snapshot): { eggs: Record<string, number>, hatchingPotions: Record<string, number>, food: Record<string, number> } {
  const eggs: Record<string, number> = {}; const potions: Record<string, number> = {}; const food: Record<string, number> = {};
  const held = snap.items;
  const eggKeys = Object.keys(ITEMS.eggs).filter(e => ITEMS.eggs[e][2] === 'drop' || (held.eggs[e] || 0) > 0);
  const potKeys = Object.keys(ITEMS.hatchingPotions).filter(p => ITEMS.hatchingPotions[p][2] === 'drop' || (held.hatchingPotions[p] || 0) > 0);
  for (const e of eggKeys) {
    for (const p of potKeys) {
      const pk = ITEMS.hatchingPotions[p][2];
      if (pk !== 'drop' && ITEMS.eggs[e][2] !== 'drop') continue;
      const alive = (snap.pets[`${e}-${p}`] || 0) > 0;
      const mount = pk === 'wacky' || !!snap.mounts[`${e}-${p}`];
      const n = (alive ? 0 : 1) + (mount ? 0 : 1);
      if (!n) continue;
      eggs[e] = (eggs[e] || 0) + n;
      potions[p] = (potions[p] || 0) + n;
    }
  }
  // favourite food for pets being raised now; the need is shared by all foods pets of that potion like
  const byTarget: Record<string, number> = {};
  for (const [key, growth] of Object.entries(snap.pets)) {
    if (!(growth > 0) || snap.mounts[key]) continue;
    const potion = key.slice(key.indexOf('-') + 1);
    if (ITEMS.hatchingPotions[potion]?.[2] !== 'drop') continue; // magic pets eat anything; wacky ones can't be fed
    byTarget[potion] = (byTarget[potion] || 0) + Math.ceil((50 - growth) / 5);
  }
  for (const [target, n] of Object.entries(byTarget)) {
    // keep the favourite foods the player holds least of first, so plenty stays sellable
    let left = n;
    const foods = Object.keys(held.food).filter(f => ITEMS.food[f]?.[2] === target).sort((a, b) => (held.food[a] || 0) - (held.food[b] || 0));
    for (const f of foods) { const take = Math.min(left, held.food[f] || 0); food[f] = (food[f] || 0) + take; left -= take; }
  }
  return { eggs, hatchingPotions: potions, food };
}

export function inventoryFor (snap: Snapshot, tasks: UiTask[], shop: ShopInfo, savingFor: SavingFor[], allow: Inventory['allow'], allocateTo?: StatKey, keep = 0, protectStable = true): Inventory {
  const sellables: Inventory['sellables'] = [];
  const needs = protectStable ? stableNeeds(snap) : { eggs: {}, hatchingPotions: {}, food: {} } as ReturnType<typeof stableNeeds>;
  // Each item is offered in up to two parts: spare first, then what the stable needs. Tiers: 1 cheap, 2 costs
  // something, 3 last resort. Rare items (quest eggs, magic and wacky potions) can't be bought back and go one
  // tier up. "keep" of each kind is never offered. Replacement value in Gold: Market price in Gems × 20.
  const add = (type: 'food' | 'eggs' | 'hatchingPotions', key: string, count: number, name: string, value: number, rare: boolean) => {
    const sellable = Math.max(0, Math.floor(count) - keep);
    const needed = Math.min(sellable, (needs[type] as Record<string, number>)[key] || 0);
    const spare = sellable - needed;
    const replace = value * 20 * (rare ? 2 : 1);
    if (spare > 0) sellables.push({ type, key, name, count: spare, value, tier: rare ? 2 : 1, replace });
    if (needed > 0) sellables.push({ type, key, name, count: needed, value, tier: rare ? 3 : 2, replace });
  };
  for (const [key, count] of Object.entries(snap.items.food)) if (ITEMS.food[key]) add('food', key, count, ITEMS.food[key][0], ITEMS.food[key][1], false);
  for (const [key, count] of Object.entries(snap.items.eggs)) if (ITEMS.eggs[key]) add('eggs', key, count, `${ITEMS.eggs[key][0]} egg`, ITEMS.eggs[key][1], ITEMS.eggs[key][2] !== 'drop');
  for (const [key, count] of Object.entries(snap.items.hatchingPotions)) if (ITEMS.hatchingPotions[key]) add('hatchingPotions', key, count, `${ITEMS.hatchingPotions[key][0]} hatching potion`, ITEMS.hatchingPotions[key][1], ITEMS.hatchingPotions[key][2] !== 'drop');
  const own = tasks.filter(t => !t.noCast);
  return {
    rewards: tasks.filter(t => t.type === 'reward').map(t => ({ id: t.id, text: t.text, price: t.value })),
    sellables,
    targets: own.filter(t => t.type !== 'reward'),
    brightnessValues: tasks.filter(t => !t.brightnessSkip && t.type !== 'reward').map(t => t.value),
    dailyCount: snap.dailyCount,
    streaksActive: snap.streaksActive,
    stealth: snap.stealth,
    incompleteDailiesDue: tasks.filter(t => t.type === 'daily' && t.isDue && !t.completed && !t.board).length,
    // only things Habitica would sell right now (tier order, prerequisites, this season's set)
    savingFor: savingFor.filter(s => purchasable(s, snap, shop)),
    seasonal: shop.seasonal,
    equipped: snap.equipped,
    ownedGear: snap.owned,
    gearTable: GEAR,
    gearMeta: ITEMS.gear,
    autoEquip: snap.autoEquip,
    badHabits: tasks.filter(t => t.type === 'habit' && t.down),
    // tasks that may be done and not ticked yet; Dailies only when due
    done: tasks.filter(t => (t.type === 'habit' && t.up) || (t.type === 'daily' && t.isDue && !t.completed) || (t.type === 'todo' && !t.completed)),
    allocateTo,
    allow,
  };
}

/** GET /shops/seasonal → transformation items and this season's class gear, both for gold (libs/shops.js). */
export function seasonalFromShop (shop: Json): ShopInfo {
  const out: ShopInfo = { seasonal: [], gear: [] };
  for (const cat of shop?.categories || []) {
    for (const it of cat.items || []) {
      if (typeof it.value !== 'number' || it.currency !== 'gold' || it.locked) continue;
      if (cat.identifier === 'spells') out.seasonal.push({ key: it.key, name: String(it.text || it.key), price: it.value });
      // only the current season's set is sold for gold ("marketGear"); older sets cost gems
      else if (it.pinType === 'marketGear' && ITEMS.gear[it.key]) out.gear.push({ key: it.key, name: ITEMS.gear[it.key][2], price: ITEMS.gear[it.key][1] });
    }
  }
  return out;
}

/** Can this be bought for gold right now? Mirrors ops/buy/buyMarketGear.js and buyQuestGold.js. */
export function purchasable (sv: SavingFor, snap: Snapshot, shop: ShopInfo): boolean {
  if (sv.kind === 'gems') return snap.subscribed && snap.gemsLeft >= (sv.count || 1);
  if (sv.kind === 'quest') {
    const q = ITEMS.quests[sv.key];
    if (!q) return false;
    if (sv.key === 'lostMasterclasser1') return ['dilatoryDistress3', 'mayhemMistiflying3', 'stoikalmCalamity3', 'taskwoodsTerror3'].every(k => snap.questsDone.includes(k));
    return (q[2] || []).every(k => snap.questsDone.includes(k));
  }
  if (sv.kind !== 'gear') return true;
  const m = ITEMS.gear[sv.key];
  if (!m || snap.owned.includes(sv.key)) return false;
  if (m[3] === 'special') return shop.gear.some(g => g.key === sv.key);
  if (m[3] !== snap.state.cls) return false;
  // class gear needs the previous tier first (weapons and rogue shields from tier 1, the rest from tier 2)
  const index = Number(m[6]);
  if (Number.isInteger(index) && index > (m[0] === 'weapon' || (m[0] === 'shield' && m[3] === 'rogue') ? 0 : 1)) {
    return snap.owned.includes(sv.key.replace(/[0-9]/, String(index - 1)));
  }
  return true;
}

/** The numbers the crit roll is seeded from, for comparing a prediction with the server's answer. */
export const SEED_FIELDS = ['hp', 'mp', 'exp', 'gp', 'lvl', 'points', 'str', 'con', 'int', 'per'] as const;
export function seedDiff (a: State, b: State): string[] {
  return SEED_FIELDS.filter(f => a[f] !== b[f]).map(f => `${f} ${a[f]}→${b[f]}`);
}

/**
 * A party member as the class plans and the Stable's visitors need them. Names are other players' text: render
 * as text only. Kept in memory only, never stored.
 */
export interface PartyMember {
  id: string, name: string, cls: ClassKey, classSelected: boolean, lvl: number, hp: number, mp: number, maxMP: number,
  /** their current pet and mount (Habitica keys), when they have one out */
  pet?: string, mount?: string,
  /** what app/avatar.ts needs to draw their avatar: the look parts of their preferences, gear, visual buffs and class */
  look?: Json,
}

const pick = (o: Json, keys: readonly string[]): Json => {
  const out: Json = {};
  for (const k of keys) if (o?.[k] !== undefined) out[k] = o[k];
  return out;
};

export function memberFromApi (m: Json): PartyMember {
  const st = m.stats || {}, it = m.items || {};
  const key = (v: unknown) => (typeof v === 'string' && v ? v : undefined);
  return {
    id: String(m._id || m.id || ''), name: String(m.profile?.name || m.auth?.local?.username || 'Party member'),
    cls: (st.class || 'warrior') as ClassKey, classSelected: !!m.flags?.classSelected && !m.preferences?.disableClasses && num(st.lvl) >= 10,
    lvl: num(st.lvl, 1), hp: num(st.hp), mp: num(st.mp), maxMP: num(st.maxMP),
    pet: key(it.currentPet), mount: key(it.currentMount),
    look: {
      preferences: pick(m.preferences, ['size', 'hair', 'skin', 'shirt', 'chair', 'costume', 'sleep']),
      items: { gear: pick(it.gear, ['equipped', 'costume']), currentMount: key(it.currentMount) },
      stats: { class: st.class, buffs: pick(st.buffs, ['snowball', 'spookySparkles', 'shinySeed', 'seafoam']) },
    },
  };
}
