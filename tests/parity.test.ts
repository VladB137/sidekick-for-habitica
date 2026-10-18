/*
 * Parity suite: the engine against Habitica's own game code (bundled by tools/harness).
 * Every case runs the same move through both and compares every number the crit roll
 * depends on. A failure prints the first mismatching case.
 *
 *   npm run harness -- /path/to/habitica && npm run test:parity
 *   PARITY_N=2000 npm run test:parity      (quicker)
 *   PARITY_NOW=now npm run test:parity     (today's clock instead of the pinned one, see fixed-clock.ts)
 */
import { clockLabel } from './fixed-clock'; // first: the clock must be pinned before Habitica's code loads
import { createRequire } from 'node:module';
import {
  allocatePoint, applyEquip, buyGear, buyPotion, buyReward, buyWithGold, castSkill, critFor, forceOptions, gearFromEquipped, scoreTask,
  revivePreview, sellItem, shouldDo, SKILLS, totals, withGear, RULES, dayChange, dayChangeDanger, skillEffect, skillByKey, smashPlan, gearForTask,
  dropOdds, feedingPlan, type DropAccount, type StableCatalogue,
  type ClassKey, type GearTable, type Inventory, type RollKey, type State, type StatKey, type Task,
} from '../src/engine';
import gearJson from '../src/data/gear.json';
import itemsJson from '../src/data/items.json';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');
const GEAR = gearJson as unknown as GearTable;
const ITEMS = itemsJson as any;
const N = Number(process.env.PARITY_N || 20000);

// ---------------------------------------------------------------- deterministic randomness
let rs = Number(process.env.PARITY_SEED || 20260923);
const rand = () => { rs |= 0; rs = (rs + 0x6D2B79F5) | 0; let t = Math.imul(rs ^ (rs >>> 15), 1 | rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const ri = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1));
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const CLASSES: ClassKey[] = ['warrior', 'wizard', 'rogue', 'healer'];
const STATS: StatKey[] = ['str', 'con', 'int', 'per'];
const tnl = (L: number) => (L < 5 ? 25 * L : L === 5 ? 150 : Math.round((L * L * 0.25 + 10 * L + 139.75) / 10) * 10);

// gear keys by slot, for random loadouts
const SLOTS = ['weapon', 'armor', 'head', 'shield', 'body', 'back', 'headAccessory', 'eyewear'];
const bySlot: Record<string, string[]> = {};
for (const [key, meta] of Object.entries(ITEMS.gear as Record<string, any[]>)) {
  if (!(key in H.content.gear.flat)) continue; // only items released today
  (bySlot[meta[0]] ||= []).push(key);
}

interface Case { state: State, equipped: Record<string, string>, owned: string[], user: any }

function randomCase (opts: { cls?: ClassKey, lvl?: number } = {}): Case {
  const cls = opts.cls || pick(CLASSES);
  const lvl = opts.lvl ?? (rand() < 0.15 ? ri(1, 10) : ri(10, 140));
  const alloc = Math.min(lvl, 100);
  const split = [rand(), rand(), rand(), rand()];
  const sum = split.reduce((a, b) => a + b, 0);
  const pts = Math.floor(alloc * rand());
  const a = split.map(x => Math.floor((x / sum) * (alloc - pts)));
  const equipped: Record<string, string> = {};
  const owned: string[] = [];
  for (const slot of SLOTS) {
    if (rand() < 0.2 || !bySlot[slot]) continue;
    const key = pick(bySlot[slot]);
    equipped[slot] = key; owned.push(key);
    for (let i = 0; i < 2; i++) { const o = pick(bySlot[slot]); if (!owned.includes(o)) owned.push(o); }
  }
  const autoAllocate = rand() < 0.3;
  const allocationMode = pick(['flat', 'classbased', 'taskbased'] as const);
  const buffs = { str: rand() < 0.3 ? ri(0, 40) : 0, con: rand() < 0.3 ? ri(0, 40) : 0, int: rand() < 0.3 ? ri(0, 40) : 0, per: rand() < 0.3 ? ri(0, 40) : 0 };
  const training = { int: rand() < 0.5 ? rand() * 5 : 0, per: rand() < 0.5 ? rand() * 5 : 0, str: rand() < 0.5 ? rand() * 5 : 0, con: rand() < 0.5 ? rand() * 5 : 0 };
  const state0: State = {
    hp: ri(1, 50), mp: 0, exp: ri(0, tnl(lvl) - 1), gp: rand() < 0.05 ? ri(0, 3_000_000) : ri(0, 2000), lvl, points: pts,
    str: a[0], con: a[1], int: a[2], per: a[3], buffs, gear: { str: 0, con: 0, int: 0, per: 0 }, training,
    cls, classSelected: lvl >= 10 ? rand() < 0.95 : false, autoAllocate, allocationMode,
  };
  state0.gear = gearFromEquipped(Object.values(equipped), cls, GEAR).gear;
  state0.mp = ri(0, totals(state0).maxMP);
  const user = realUser(state0, equipped, owned);
  return { state: state0, equipped, owned, user };
}

function realUser (s: State, equipped: Record<string, string>, owned: string[]): any {
  const foods = Object.keys(ITEMS.food);
  return {
    _id: 'u', _tmp: {}, guilds: [],
    party: { _id: undefined, quest: { progress: { up: 0, down: 0, collectedItems: 0 } } },
    stats: {
      hp: s.hp, mp: s.mp, exp: s.exp, gp: s.gp, lvl: s.lvl, class: s.cls, points: s.points,
      str: s.str, con: s.con, int: s.int, per: s.per,
      buffs: { str: s.buffs.str, int: s.buffs.int, per: s.buffs.per, con: s.buffs.con, stealth: 0, streaks: false, snowball: false, spookySparkles: false, shinySeed: false, seafoam: false },
      training: { int: s.training.int, per: s.training.per, str: s.training.str, con: s.training.con },
    },
    items: {
      gear: { equipped: { ...equipped }, owned: Object.fromEntries(owned.map(k => [k, true])), costume: {} },
      quests: {}, food: { [pick(foods)]: ri(0, 30), [pick(foods)]: ri(0, 30) }, eggs: { Wolf: ri(0, 10) }, hatchingPotions: { Base: ri(0, 10) },
      special: { snowball: 0, spookySparkles: 0, shinySeed: 0, seafoam: 0 }, lastDrop: { count: 0, date: new Date() },
      pets: {}, mounts: {},
    },
    preferences: { automaticAllocation: s.autoAllocate, allocationMode: s.allocationMode, dayStart: 0, timezoneOffset: 0, disableClasses: false, autoEquip: rand() < 0.5 },
    achievements: { completedTask: true, streak: 0, ultimateGearSets: {} },
    flags: { classSelected: s.classSelected, levelDrops: { atom1: true, vice1: true, goldenknight1: true, moonstone1: true }, customizationsNotification: true, itemsEnabled: true, rebirthEnabled: true },
    tasksOrder: { dailys: ['a', 'b', 'c'] }, contributor: {}, purchased: { plan: {} }, pinnedItems: [], balance: 0,
    addNotification () {}, markModified () {},
  };
}

function floorHook (u: any) {
  for (const k of ['hp', 'mp', 'exp', 'gp']) {
    if (u.stats[k] > RULES.maxFieldHardCap) u.stats[k] = RULES.maxFieldHardCap;
    else if (!Number.isInteger(u.stats[k])) u.stats[k] = Math.floor(u.stats[k]);
  }
}

const FIELDS = ['hp', 'mp', 'exp', 'gp', 'lvl', 'points', 'str', 'con', 'int', 'per'] as const;
function diffState (s: State, u: any): string | null {
  for (const f of FIELDS) if (s[f] !== u.stats[f]) return `${f}: engine ${s[f]} vs real ${u.stats[f]}`;
  for (const f of STATS) if (s.buffs[f] !== u.stats.buffs[f]) return `buffs.${f}: engine ${s.buffs[f]} vs real ${u.stats.buffs[f]}`;
  for (const f of ['int', 'per', 'str', 'con'] as const) if (Math.abs(s.training[f] - u.stats.training[f]) > 0) return `training.${f}`;
  const real = H.statsComputed(u);
  const tot = totals(s);
  for (const f of STATS) if (tot[f] !== real[f]) return `total ${f}: engine ${tot[f]} vs real ${real[f]}`;
  return null;
}

let failures = 0;
function report (name: string, ok: number, total: number, extra = '') {
  const pass = ok === total;
  if (!pass) failures += 1;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}: ${ok}/${total} identical${extra ? `  ${extra}` : ''}`);
}

function realTask (t: Task, checklistLen = t.checked): any {
  return {
    _id: t.id, id: t.id, type: t.type, value: t.value, priority: t.priority, streak: t.streak, attribute: t.attribute,
    history: t.type === 'daily' && t.completed ? [{ date: Date.now(), value: t.value }] : [], group: {}, challenge: {},
    up: true, down: true, counterUp: 0, counterDown: 0, completed: !!t.completed, yesterDailyScored: false,
    checklist: Array.from({ length: Math.max(checklistLen, t.checked) }, (_, i) => ({ id: String(i), text: 'x', completed: i < t.checked })),
  };
}

// ---------------------------------------------------------------- A. scoring tasks up and down
{
  let ok = 0; let crits = 0; let levelUps = 0; let firstBad = '';
  for (let i = 0; i < N; i++) {
    const c = randomCase();
    const type = pick(['habit', 'habit', 'daily', 'todo', 'reward'] as const);
    let direction: 'up' | 'down' = rand() < 0.7 ? 'up' : 'down';
    if (type === 'reward') direction = 'up';
    const t: Task = {
      id: 't', type, value: type === 'reward' ? pick([0, 1, 2.5, 5, 10, 20, 37.5]) : (rand() * 72 - 50),
      priority: pick([0.1, 1, 1.5, 2]), streak: type === 'daily' ? ri(0, 60) : 0,
      checked: type === 'todo' ? ri(0, 5) : 0, attribute: pick(STATS), completed: direction === 'down',
    };
    if (type === 'daily' && direction === 'down') t.streak = Math.max(1, t.streak);
    let eng; let engErr = '';
    try { eng = scoreTask(c.state, t, direction); } catch (e) { engErr = (e as Error).message; }
    const rt = realTask(t);
    let realErr = '';
    try { H.scoreTask({ user: c.user, task: rt, direction, times: 1, cron: false }, { language: 'en' }); floorHook(c.user); } catch (e) { realErr = (e as Error).message || 'err'; }
    if (engErr || realErr) {
      if (engErr && realErr) ok++; else if (!firstBad) firstBad = `#${i} ${type} ${direction}: engine threw "${engErr}", real threw "${realErr}"`;
      continue;
    }
    const d = diffState(eng!.state, c.user)
      || (Math.abs(eng!.task.value - rt.value) > 0 ? `task.value ${eng!.task.value} vs ${rt.value}` : null)
      || (eng!.task.streak !== rt.streak ? `streak ${eng!.task.streak} vs ${rt.streak}` : null)
      || (eng!.mult !== (c.user._tmp.crit || 1) ? `crit ${eng!.mult} vs ${c.user._tmp.crit}` : null)
      || (direction === 'up' && type !== 'reward' && eng!.dmg !== c.user._tmp.quest?.progressDelta ? `dmg ${eng!.dmg} vs ${c.user._tmp.quest?.progressDelta}` : null);
    if (d) { if (!firstBad) firstBad = `#${i} ${type} ${direction} value ${t.value}: ${d}`; continue; }
    ok++; if (eng!.crit) crits++; if (eng!.leveled) levelUps++;
  }
  report('A  scoring (habit/daily/todo/reward, up and down)', ok, N, `crits ${crits}, level-ups ${levelUps}${firstBad ? `\n      first mismatch: ${firstBad}` : ''}`);
}

// ---------------------------------------------------------------- B. every class skill
{
  let ok = 0; let crits = 0; let firstBad = ''; const perSkill: Record<string, number> = {};
  const M = N;
  for (let i = 0; i < M; i++) {
    const def = pick(SKILLS);
    const c = randomCase({ cls: def.cls, lvl: ri(def.lvl, 140) });
    c.state.classSelected = true; c.user.flags.classSelected = true;
    if (rand() < 0.9) { c.state.mp = Math.max(c.state.mp, def.mana); c.user.stats.mp = c.state.mp; }
    const targetValue = rand() * 72 - 50;
    const taskValues = [rand() * 40 - 20, rand() * 40 - 20, rand() * 40 - 20];
    let eng; let engErr = '';
    try { eng = castSkill(c.state, def.key, { targetValue, taskValues }); } catch (e) { engErr = (e as Error).message; }
    const spell = H.spells[def.cls][def.key];
    const before = c.user.party.quest.progress.up;
    let realErr = ''; let realCrit = 1; let realTarget: any; let realTasks: any[] = [];
    try {
      if (spell.mana > c.user.stats.mp) throw new Error('notEnoughMana');
      if (def.target === 'task') { realTarget = { value: targetValue }; realCrit = spell.cast(c.user, realTarget, { language: 'en' }) || 1; }
      else if (def.target === 'tasks') { realTasks = taskValues.map(v => ({ type: 'daily', value: v })); spell.cast(c.user, realTasks, { language: 'en' }); }
      else if (def.target === 'self') spell.cast(c.user, null, { language: 'en' });
      else if (spell.bulk) {
        const data: any = { query: { _id: 'u' } };
        const pre = JSON.parse(JSON.stringify(c.user.stats.buffs));
        spell.cast(c.user, data);
        const excluded = data.query['stats.class'] && data.query['stats.class'].$ne === c.user.stats.class;
        if (!excluded) for (const [path, inc] of Object.entries(data.update.$inc)) {
          const k = path.split('.').pop()!;
          if (path.startsWith('stats.buffs.')) c.user.stats.buffs[k] = pre[k] + (inc as number);
          else c.user.stats[k] += inc as number;
        }
      } else spell.cast(c.user, [c.user], { language: 'en' });
      floorHook(c.user);
    } catch (e) { realErr = (e as Error).message || 'err'; }
    if (engErr || realErr) {
      if (engErr && realErr) { ok++; perSkill[def.key] = (perSkill[def.key] || 0) + 1; } else if (!firstBad) firstBad = `#${i} ${def.key}: engine "${engErr}" real "${realErr}"`;
      continue;
    }
    const d = diffState(eng!.state, c.user)
      || (def.target === 'task' && def.key === 'smash' && eng!.targetValue !== realTarget.value ? `target ${eng!.targetValue} vs ${realTarget.value}` : null)
      || (def.target === 'tasks' && JSON.stringify(eng!.taskValues) !== JSON.stringify(realTasks.map(t => t.value)) ? 'task values' : null)
      || (eng!.mult !== realCrit ? `crit ${eng!.mult} vs ${realCrit}` : null)
      || (eng!.dmg !== (c.user.party.quest.progress.up - before) ? `dmg ${eng!.dmg} vs ${c.user.party.quest.progress.up - before}` : null);
    if (d) { if (!firstBad) firstBad = `#${i} ${def.key}: ${d}`; continue; }
    ok++; perSkill[def.key] = (perSkill[def.key] || 0) + 1; if (eng!.crit) crits++;
  }
  report('B  class skills (all 16, incl. party buffs on the caster)', ok, M, `crits ${crits}, skills covered ${Object.keys(perSkill).length}/16${firstBad ? `\n      first mismatch: ${firstBad}` : ''}`);
}

// ---------------------------------------------------------------- C. shop, sell, allocate, equip
{
  let ok = 0; let firstBad = ''; const M = Math.round(N / 2); const kinds: Record<string, number> = {};
  const marketGear = Object.entries(ITEMS.gear as Record<string, any[]>).filter(([k, m]) => m[1] > 0 && k in H.content.gear.flat && H.content.gear.flat[k].klass && ['warrior', 'wizard', 'rogue', 'healer', 'base'].includes(H.content.gear.flat[k].klass)).map(([k]) => k);
  const seasonalNow = Object.keys(ITEMS.special).filter(k => H.getScheduleMatchingGroup(H.content.cardTypes[k] ? 'card' : 'seasonalSpells').match(k) && H.content.spells.special[k].value);
  let lastInfo = '';
  for (let i = 0; i < M; i++) {
    const c = randomCase();
    lastInfo = '';
    const kind = pick(['potion', 'reward', 'gear', 'quest', 'special', 'sell', 'allocate', 'equip'] as const);
    kinds[kind] = (kinds[kind] || 0) + 1;
    let eng: State | undefined; let engErr = ''; let realErr = '';
    const run = async () => {
      switch (kind) {
        case 'potion':
          try { eng = buyPotion(c.state); } catch (e) { engErr = (e as Error).message; }
          await H.buy(c.user, { params: { key: 'potion' }, type: 'potion', language: 'en' });
          break;
        case 'reward': {
          const price = pick([1, 2, 2.5, 5, 7, 10, 25, 0.5]);
          try { eng = buyReward(c.state, price); } catch (e) { engErr = (e as Error).message; }
          H.scoreTask({ user: c.user, task: realTask({ id: 'r', type: 'reward', value: price, priority: 1, streak: 0, checked: 0, attribute: 'str' }), direction: 'up' }, { language: 'en' });
          break;
        }
        case 'gear': {
          const key = pick(marketGear); const price = H.content.gear.flat[key].value;
          lastInfo = `bought ${key} autoEquip=${c.user.preferences.autoEquip}`;
          c.user.stats.class = H.content.gear.flat[key].klass === 'base' ? c.user.stats.class : H.content.gear.flat[key].klass;
          c.state.cls = c.user.stats.class; c.state.gear = gearFromEquipped(Object.values(c.equipped), c.state.cls, GEAR).gear;
          // own every lower tier of that line so the server's previous-tier check passes; price is what's compared
          const it = H.content.gear.flat[key];
          c.user.items.gear.owned = Object.fromEntries(Object.values(H.content.gear.flat as Record<string, any>)
            .filter((g: any) => g.type === it.type && g.klass === it.klass && Number(g.index) < Number(it.index)).map((g: any) => [g.key, true]));
          try {
            eng = buyGear(c.state, key, price, { autoEquip: c.user.preferences.autoEquip, equipped: c.equipped, meta: ITEMS.gear, table: GEAR }).state;
          } catch (e) { engErr = (e as Error).message; }
          await H.buy(c.user, { params: { key }, language: 'en' }); // /user/buy-gear/:key sets no type
          break;
        }
        case 'quest': {
          const key = pick(['basilist', 'dilatoryDistress1', 'mayhemMistiflying1', 'stoikalmCalamity1', 'taskwoodsTerror1']);
          try { eng = buyWithGold(c.state, ITEMS.quests[key][1]); } catch (e) { engErr = (e as Error).message; }
          await H.buy(c.user, { params: { key }, type: 'quest', language: 'en' });
          break;
        }
        case 'special': {
          if (!seasonalNow.length) { eng = c.state; return; }
          const key = pick(seasonalNow);
          try { eng = buyWithGold(c.state, ITEMS.special[key][1]); } catch (e) { engErr = (e as Error).message; }
          await H.buy(c.user, { params: { key }, type: 'special', language: 'en' });
          break;
        }
        case 'sell': {
          const [type, key] = pick([['food', Object.keys(c.user.items.food)[0]], ['eggs', 'Wolf'], ['hatchingPotions', 'Base']] as const);
          const have = c.user.items[type][key];
          const amount = ri(1, Math.max(1, have));
          const value = type === 'food' ? ITEMS.food[key][1] : ITEMS[type][key][1];
          if (amount > have || have === 0) engErr = 'userItemsNotEnough'; else eng = sellItem(c.state, value, amount);
          H.sell(c.user, { params: { type, key }, query: { amount }, language: 'en' });
          break;
        }
        case 'allocate': {
          const stat = pick(STATS);
          try { eng = allocatePoint(c.state, stat); } catch (e) { engErr = (e as Error).message; }
          H.allocate(c.user, { query: { stat }, language: 'en' });
          break;
        }
        case 'equip': {
          const key = pick(c.owned.length ? c.owned : ['weapon_warrior_1']);
          if (!c.owned.length) { c.owned.push(key); c.user.items.gear.owned[key] = true; }
          const next = applyEquip(c.equipped, key, ITEMS.gear);
          eng = withGear(c.state, gearFromEquipped(Object.values(next), c.state.cls, GEAR).gear);
          H.equip(c.user, { params: { type: 'equipped', key }, language: 'en' });
          break;
        }
      }
    };
    try { await run(); floorHook(c.user); } catch (e) { realErr = (e as Error).message || 'err'; }
    if (engErr || realErr) {
      if (engErr && realErr) ok++; else if (!firstBad) firstBad = `#${i} ${kind}: engine "${engErr}" real "${realErr}"`;
      continue;
    }
    const d = diffState(eng!, c.user);
    if (d) { if (!firstBad) firstBad = `#${i} ${kind}: ${d} | equipped before ${JSON.stringify(c.equipped)} after(real) ${JSON.stringify(c.user.items.gear.equipped)} cls ${c.user.stats.class} ${lastInfo}`; continue; }
    ok++;
  }
  report('C  potion, rewards, gear/quest/seasonal purchases, selling, allocation, equipping', ok, M, `${JSON.stringify(kinds)}${firstBad ? `\n      first mismatch: ${firstBad}` : ''}`);
}

// ---------------------------------------------------------------- D. crit-forcing suggestions replayed through the real code
{
  let promised = 0; let delivered = 0; let states = 0; let already = 0; let noOption = 0; let firstBad = '';
  let restores = 0; let restored = 0; let firstRestoreBad = '';
  const dKinds: Record<string, number> = {};
  const M = Math.round(N / 10);
  for (let i = 0; i < M; i++) {
    const c = randomCase();
    const roll: RollKey = c.state.classSelected && c.state.lvl >= 12 && rand() < 0.3
      ? ({ warrior: 'smash', wizard: 'fireball', rogue: 'backStab', healer: 'task' } as const)[c.state.cls] : 'task';
    const tasks: Task[] = Array.from({ length: 4 }, (_, j) => ({ id: `t${j}`, text: `Task ${j}`, type: pick(['habit', 'daily', 'todo'] as const), value: rand() * 30 - 10, priority: 1, streak: 0, checked: 0, attribute: 'str' as StatKey }));
    const foodKey = Object.keys(c.user.items.food)[0];
    const inv: Inventory = {
      rewards: [{ id: 'r1', text: 'Coffee', price: pick([1, 2, 3, 5]) }, { id: 'r2', text: 'Episode', price: pick([7, 10, 15]) }],
      sellables: [
        { type: 'food', key: foodKey, name: foodKey, count: c.user.items.food[foodKey], value: ITEMS.food[foodKey][1] },
        { type: 'eggs', key: 'Wolf', name: 'Wolf egg', count: c.user.items.eggs.Wolf, value: 3 },
        { type: 'hatchingPotions', key: 'Base', name: 'Base potion', count: c.user.items.hatchingPotions.Base, value: 2 },
      ],
      targets: tasks, brightnessValues: tasks.map(t => t.value), dailyCount: 3, stealth: 0, incompleteDailiesDue: ri(0, 3),
      allocateTo: pick(STATS), savingFor: [], seasonal: [], badHabits: [{ ...tasks[0], id: 'bad', text: 'Snack', type: 'habit' }],
      equipped: c.equipped, ownedGear: c.owned, gearTable: GEAR,
      gearMeta: ITEMS.gear, done: tasks,
    };
    states++;
    const res = forceOptions(c.state, inv, roll, { max: 5 });
    if (res.already) { already++; continue; }
    if (!res.options.length) { noOption++; continue; }
    for (const opt of res.options) {
      promised++;
      for (const k of new Set(opt.kinds.map(k => (k === 'gear' && opt.steps.filter(st => st.kind === 'equip').length > 1 ? 'loadout' : k)))) dKinds[k] = (dKinds[k] || 0) + 1;
      const u = JSON.parse(JSON.stringify(c.user, (k, v) => (typeof v === 'function' ? undefined : v)));
      u.addNotification = () => {}; u.markModified = () => {};
      const values = new Map<string, number>(tasks.map(t => [t.id, t.value])); values.set('bad', tasks[0].value);
      let err = '';
      try {
        for (const st of opt.steps) {
          switch (st.kind) {
            case 'reward': H.scoreTask({ user: u, task: realTask({ id: st.taskId, type: 'reward', value: st.price, priority: 1, streak: 0, checked: 0, attribute: 'str' }), direction: 'up' }, { language: 'en' }); break;
            case 'sell': H.sell(u, { params: { type: st.type, key: st.key }, query: { amount: st.amount }, language: 'en' }); break;
            case 'potion': await H.buy(u, { params: { key: 'potion' }, type: 'potion', language: 'en' }); break;
            case 'allocate': H.allocate(u, { query: { stat: st.stat }, language: 'en' }); break;
            case 'equip': H.equip(u, { params: { type: 'equipped', key: st.key }, language: 'en' }); break;
            case 'habitDown': {
              const rt = realTask({ id: 'bad', type: 'habit', value: values.get('bad')!, priority: 1, streak: 0, checked: 0, attribute: 'str' });
              H.scoreTask({ user: u, task: rt, direction: 'down' }, { language: 'en' }); values.set('bad', rt.value); break;
            }
            case 'score': {
              const t = tasks.find(x => x.id === st.taskId)!;
              const rt = realTask({ ...t, value: values.get(t.id)! });
              H.scoreTask({ user: u, task: rt, direction: 'up' }, { language: 'en' }); values.set(t.id, rt.value); break;
            }
            case 'cast': {
              const def = SKILLS.find(k => k.key === st.spellId)!;
              const spell = H.spells[def.cls][def.key];
              if (def.target === 'task') { const tgt = { value: values.get(st.targetId!)! }; spell.cast(u, tgt, { language: 'en' }); values.set(st.targetId!, tgt.value); }
              else if (def.target === 'tasks') spell.cast(u, tasks.map(t => ({ type: t.type, value: values.get(t.id)! })), { language: 'en' });
              else if (def.target === 'self') {
                // the server's own check before castSelfSpell (website/server/libs/spells.js), not in common/
                if (def.key === 'stealth' && u.stats.buffs.stealth >= inv.incompleteDailiesDue!) throw new Error('spellAlreadyCast');
                spell.cast(u, null, { language: 'en' });
              }
              else if (spell.bulk) {
                const data: any = { query: {} }; const pre = { ...u.stats.buffs };
                spell.cast(u, data);
                const excluded = data.query['stats.class'] && data.query['stats.class'].$ne === u.stats.class;
                if (!excluded) for (const [p, inc] of Object.entries(data.update.$inc)) { const k = p.split('.').pop()!; if (p.startsWith('stats.buffs.')) u.stats.buffs[k] = pre[k] + (inc as number); else u.stats[k] += inc as number; }
              } else spell.cast(u, [u], { language: 'en' });
              break;
            }
            default: throw new Error(`unreplayable step ${st.kind}`);
          }
          floorHook(u);
        }
      } catch (e) { err = (e as Error).message; }
      const stat = roll === 'smash' ? 'con' : roll === 'fireball' ? 'per' : 'str';
      const base = roll === 'backStab' ? 0.3 : 0.03;
      // a skill roll must still be castable: the server refuses it without the mana or level (server/libs/spells.js)
      const skill = SKILLS.find(k => k.key === roll);
      if (!err && skill && (u.stats.mp < skill.mana || u.stats.lvl < skill.lvl)) err = 'notEnoughMana for the roll itself';
      const hit = !err && H.crit.crit(u, stat, base) > 1;
      if (hit) delivered++; else if (!firstBad) firstBad = `#${i} ${roll}: "${opt.summary}" ${err || 'did not crit'}`;
      // putting gear back (the app's restoreGear order and skip rules) must give the original loadout
      const eq = opt.steps.find(st => st.kind === 'equip');
      // (random loadouts can break the two-handed rule, which no real loadout does; those can't be restored exactly)
      const twoHandedBoth = !!ITEMS.gear[c.equipped.weapon]?.[5] && !!c.equipped.shield && !c.equipped.shield.endsWith('_base_0');
      if (eq && eq.kind === 'equip' && !err && !twoHandedBoth) {
        restores++;
        for (const k of eq.restore) {
          const on = Object.values(u.items.gear.equipped);
          const todo = k.startsWith('-') ? on.includes(k.slice(1)) : !on.includes(k);
          if (todo) H.equip(u, { params: { type: 'equipped', key: k.replace(/^-/, '') }, language: 'en' });
        }
        const norm = (e: Record<string, string>) => JSON.stringify(Object.fromEntries(SLOTS.map(sl => [sl, e[sl] && !e[sl].endsWith('_base_0') ? e[sl] : ''])));
        if (norm(u.items.gear.equipped) === norm(c.equipped)) restored++;
        else if (!firstRestoreBad) firstRestoreBad = `#${i} ${eq.label}: ${norm(c.equipped)} → ${norm(u.items.gear.equipped)}`;
      }
    }
  }
  report('D2 putting swapped gear back restores the original loadout', restored, restores, firstRestoreBad ? `\n      first failure: ${firstRestoreBad}` : '');
  report('D  crit-forcing suggestions replayed through the real code', delivered, promised, `(${states} states: ${already} already crit, ${noOption} with no option) ${JSON.stringify(dKinds)}${firstBad ? `\n      first failure: ${firstBad}` : ''}`);
}

// ---------------------------------------------------------------- E. the roll itself, every stat and base
{
  let ok = 0; const M = N;
  for (let i = 0; i < M; i++) {
    const c = randomCase();
    const stat = pick(STATS); const base = pick([0.03, 0.3]);
    if (critFor(c.state, stat, base) === H.crit.crit(c.user, stat, base)) ok++;
  }
  report('E  crit roll (fdlibm sine vs the server\'s Math.sin, all stats)', ok, M);
}

// ---------------------------------------------------------------- F. revive: the level, gold, stat point and gear piece lost
{
  let ok = 0; let firstBad = ''; const M = Math.round(N / 4);
  for (let i = 0; i < M; i++) {
    const c = randomCase();
    c.state.hp = 0; c.user.stats.hp = 0;
    // extra owned pieces of every kind (class, special, armoire, other classes) so the loss draw has real choices
    for (let j = 0; j < ri(0, 12); j++) { const slot = pick(SLOTS); const k = pick(bySlot[slot]); if (!c.owned.includes(k)) { c.owned.push(k); c.user.items.gear.owned[k] = true; } }
    if (rand() < 0.2) { const k = pick(c.owned); if (k) c.user.items.gear.owned[k] = false; }
    const owned = Object.entries(c.user.items.gear.owned).filter(([, v]) => v).map(([k]) => k);
    const pv = revivePreview(c.state, owned, ITEMS.gear, { equipped: c.equipped, table: GEAR });
    const before = JSON.parse(JSON.stringify(c.user.items.gear.owned));
    let err = '';
    try { H.revive(c.user, { language: 'en' }); } catch (e) { err = (e as Error).message; }
    const lostItem = Object.keys(before).find(k => before[k] && c.user.items.gear.owned[k] === false);
    const lostStat = STATS.find(k => c.user.stats[k] === c.state[k] - 1);
    const bad = err || diffState(pv.state, c.user) || (lostItem !== pv.item ? `item ${pv.item} vs ${lostItem}` : '') || (lostStat !== pv.stat ? `stat ${pv.stat} vs ${lostStat}` : '');
    if (!bad) ok++; else if (!firstBad) firstBad = `#${i} ${c.state.cls} L${c.state.lvl}: ${bad}`;
  }
  report('F  revive: level, gold, stat point and gear piece lost', ok, M, firstBad ? `\n      first failure: ${firstBad}` : '');
}

// ---------------------------------------------------------------- G. is a Daily due on a given day (cron.js shouldDo)
{
  let ok = 0; let firstBad = ''; let threw = 0; const M = N;
  const TZ = [0, 60, 120, 180, -300, -420, -480, 330, 345, 540, 600, -210, 780, 840, -720, 900];
  const FREQ = ['daily', 'weekly', 'monthly', 'yearly'];
  const DAYS = ['su', 'm', 't', 'w', 'th', 'f', 's'];
  const base = Date.UTC(2026, 8, 24);
  for (let i = 0; i < M; i++) {
    const frequency = pick(FREQ);
    const repeat: Record<string, boolean> = {};
    for (const d of DAYS) repeat[d] = rand() < 0.5;
    // start dates around month ends and leap days as often as anywhere else
    const startMs = rand() < 0.3
      ? Date.UTC(pick([2023, 2024, 2025, 2026]), ri(0, 11), pick([1, 28, 29, 30, 31]), ri(0, 23), ri(0, 59))
      : base + ri(-4 * 365, 60) * 864e5 + ri(0, 86399) * 1000;
    const task: any = {
      type: 'daily', frequency, everyX: rand() < 0.05 ? pick([0, undefined, 10000]) : ri(1, 6), repeat,
      startDate: rand() < 0.03 ? pick([null, undefined]) : new Date(startMs).toISOString(),
      daysOfMonth: frequency === 'monthly' && rand() < 0.5 ? [...new Set(Array.from({ length: ri(1, 3) }, () => (rand() < 0.3 ? pick([29, 30, 31]) : ri(1, 31))))] : [],
      weeksOfMonth: frequency === 'monthly' && rand() < 0.4 ? [...new Set(Array.from({ length: ri(1, 2) }, () => ri(0, 4)))] : [],
    };
    let day = rand() < 0.3 ? Date.UTC(pick([2024, 2025, 2026, 2027]), ri(0, 11), pick([1, 28, 29, 30, 31]), ri(0, 23)) : base + ri(-400, 400) * 864e5 + ri(0, 86399) * 1000;
    // yearly Dailies are only due near anniversaries: test those days (incl. Feb 28/29) most of the time
    if (frequency === 'yearly' && rand() < 0.7) { const sd = new Date(startMs); day = Date.UTC(sd.getUTCFullYear() + ri(0, 6), sd.getUTCMonth(), sd.getUTCDate() + ri(-2, 2), ri(0, 23)); }
    const opts = { timezoneUtcOffset: pick(TZ), dayStart: rand() < 0.5 ? 0 : ri(0, 24) };
    let real: boolean;
    try { real = !!H.shouldDo(new Date(day), JSON.parse(JSON.stringify(task)), { ...opts }); } catch { real = false; threw++; }
    const mine = shouldDo(day, task, opts);
    if (mine === real) ok++;
    else if (!firstBad) firstBad = `#${i} ${JSON.stringify(task)} day ${new Date(day).toISOString()} ${JSON.stringify(opts)}: engine ${mine} vs real ${real}`;
  }
  report('G  Dailies due on a given day (shouldDo: daily/weekly/monthly/yearly, time zones, day start)', ok, M, `${threw ? `(${threw} inputs make Habitica throw; engine says not due)` : ''}${firstBad ? `\n      first failure: ${firstBad}` : ''}`);
}

// ---------------------------------------------------------------- H. the day change: HP lost to missed Dailies, boss damage share
{
  let ok = 0; let firstBad = ''; const M = Math.round(N / 4);
  for (let i = 0; i < M; i++) {
    const c = randomCase();
    if (rand() < 0.5) { c.state.buffs.con = ri(0, 300); c.user.stats.buffs.con = c.state.buffs.con; }
    const missed = Array.from({ length: ri(0, 8) }, (_, j) => {
      const total = rand() < 0.4 ? ri(1, 6) : 0;
      return { id: `d${j}`, value: rand() * 72 - 50, priority: pick([0.1, 1, 1.5, 2]), checklistDone: total ? ri(0, total) : 0, checklistTotal: total, group: rand() < 0.15 };
    });
    const bossStr = pick([0.5, 1, 1.5, 2, 4]);
    const eng = dayChange(c.state, missed, { bossStr });
    let down = 0; let err = '';
    try {
      for (const d of missed) {
        const t: Task = { id: d.id, type: 'daily', value: d.value, priority: d.priority, streak: ri(0, 30), checked: d.checklistDone, attribute: 'str', completed: false };
        const rt = realTask(t, d.checklistTotal);
        if (d.group) { rt.group = { id: 'g' }; c.user.guilds = ['g']; }
        const delta = H.scoreTask({ user: c.user, task: rt, direction: 'down', times: 1, cron: true }, { language: 'en' });
        down += delta * (d.priority < 1 ? d.priority : 1);
      }
    } catch (e) { err = (e as Error).message || 'err'; }
    const realHp = c.user.stats.hp;
    const bad = err || (Math.max(0, c.state.hp - eng.hpLoss) !== realHp ? `hp ${Math.max(0, c.state.hp - eng.hpLoss)} vs ${realHp}` : '')
      || (Math.abs(eng.bossLoss - (-down * bossStr)) > 1e-9 ? `boss ${eng.bossLoss} vs ${-down * bossStr}` : '');
    if (!bad) ok++; else if (!firstBad) firstBad = `#${i} con ${totals(c.state).con} ${JSON.stringify(missed)}: ${bad}`;
  }
  report('H  day change: HP lost to missed Dailies and the boss damage share', ok, M, firstBad ? `\n      first failure: ${firstBad}` : '');
}

// ---------------------------------------------------------------- H2. Inn advice: would the day change take all HP, and the smallest fixes
{
  let ok = 0; let firstBad = ''; let dies = 0; const M = Math.round(N / 20);
  // HP after the day change in Habitica's code: drink `potions` Health Potions, finish the Dailies in `done`, then the
  // day change scores the rest down (cron.js) and the boss hits for the player's share (group.js _processBossQuest)
  const realAfter = async (c: Case, missed: any[], done: Set<number>, potions: number, bossStr: number): Promise<number> => {
    const u = { ...JSON.parse(JSON.stringify(c.user)), addNotification () {}, markModified () {} };
    u.stats.gp = 1e6;
    for (let k = 0; k < potions; k++) await H.buy(u, { params: { key: 'potion' }, type: 'potion', language: 'en' });
    let down = 0;
    missed.forEach((d, j) => {
      if (done.has(j)) return;
      const rt = realTask({ id: d.id, type: 'daily', value: d.value, priority: d.priority, streak: 3, checked: d.checklistDone, attribute: 'str', completed: false }, d.checklistTotal);
      if (d.group) { rt.group = { id: 'g' }; u.guilds = ['g']; }
      down += H.scoreTask({ user: u, task: rt, direction: 'down', times: 1, cron: true }, { language: 'en' }) * (d.priority < 1 ? d.priority : 1);
    });
    return u.stats.hp + down * bossStr;
  };
  const subsets = function * (n: number, k: number, from = 0, acc: number[] = []): Generator<number[]> {
    if (acc.length === k) { yield acc; return; }
    for (let i = from; i < n; i++) yield * subsets(n, k, i + 1, [...acc, i]);
  };
  for (let i = 0; i < M; i++) {
    const c = randomCase();
    c.state.hp = ri(1, 30); c.user.stats.hp = c.state.hp;
    const missed = Array.from({ length: ri(1, 7) }, (_, j) => {
      const total = rand() < 0.3 ? ri(1, 6) : 0;
      return { id: `d${j}`, value: rand() * 50 - 45, priority: pick([0.1, 1, 1.5, 2]), checklistDone: total ? ri(0, total - 1) : 0, checklistTotal: total, group: rand() < 0.1 };
    });
    const bossStr = rand() < 0.5 ? 0 : pick([0.5, 1, 1.5, 2, 4]);
    const d = dayChangeDanger(c.state, missed, { bossStr });
    let bad = '';
    try {
      const all = await realAfter(c, missed, new Set(), 0, bossStr);
      if ((d.level === 'dies') !== (all <= 0)) bad = `dies ${d.level} vs real HP ${all}`;
      if (d.level === 'dies') {
        dies++;
        if (d.dailiesToDo == null) bad ||= 'no Daily count although finishing all of them leaves HP untouched';
        else {
          if (await realAfter(c, missed, new Set(d.dailiesFirst), 0, bossStr) <= 0) bad ||= `finishing ${d.dailiesFirst} still dies`;
          for (const sub of subsets(missed.length, d.dailiesToDo - 1)) {
            if (await realAfter(c, missed, new Set(sub), 0, bossStr) > 0) { bad ||= `${sub.length} Dailies (${sub}) would do`; break; }
          }
        }
        if (d.potions) {
          if (await realAfter(c, missed, new Set(), d.potions, bossStr) <= 0) bad ||= `${d.potions} potions still die`;
          if (await realAfter(c, missed, new Set(), d.potions - 1, bossStr) > 0) bad ||= `${d.potions - 1} potions would do`;
        } else {
          const most = Math.ceil((RULES.maxHealth - c.state.hp) / RULES.healthPotion.heal);
          if (await realAfter(c, missed, new Set(), most, bossStr) > 0) bad ||= `no potion count but ${most} would do`;
        }
      }
    } catch (e) { bad = (e as Error).message || 'err'; }
    if (!bad) ok++; else if (!firstBad) firstBad = `#${i} hp ${c.state.hp} con ${totals(c.state).con} boss ${bossStr} ${JSON.stringify(missed)}: ${bad}`;
  }
  report('H2 day change danger: dies or not, fewest Dailies to finish, Health Potions needed', ok, M, `(${dies} deadly)${firstBad ? `\n      first failure: ${firstBad}` : ''}`);
}

// ---------------------------------------------------------------- I. one cast's effect, as the class plans show it
{
  let ok = 0; let firstBad = ''; const M = Math.round(N / 4);
  const KEYS = ['heal', 'healAll', 'mpheal', 'brightness', 'stealth', 'pickPocket', 'defensiveStance', 'valorousPresence', 'intimidate', 'earth', 'toolsOfTrade', 'protectAura'];
  for (let i = 0; i < M; i++) {
    const key = pick(KEYS);
    const def = skillByKey(key)!;
    const c = randomCase({ cls: def.cls, lvl: ri(def.lvl, 140) });
    c.state.classSelected = true; c.user.flags.classSelected = true;
    c.state.mp = Math.max(c.state.mp, def.mana); c.user.stats.mp = c.state.mp;
    c.state.hp = 1; c.user.stats.hp = 1;
    const dailyCount = ri(0, 30); c.user.tasksOrder.dailys = Array.from({ length: dailyCount }, (_, j) => `d${j}`);
    const targetValue = rand() * 72 - 50;
    const eng = skillEffect(c.state, key, { dailyCount, targetValue });
    const spell = H.spells[def.cls][key];
    const u = c.user; let real = NaN;
    if (key === 'heal') { spell.cast(u, null, { language: 'en' }); real = u.stats.hp - 1; }
    else if (key === 'healAll') { spell.cast(u, [u], { language: 'en' }); real = u.stats.hp - 1; }
    else if (key === 'brightness') { const ts = [{ type: 'daily', value: 0 }]; spell.cast(u, ts, { language: 'en' }); real = ts[0].value; }
    else if (key === 'stealth') { spell.cast(u, null, { language: 'en' }); real = u.stats.buffs.stealth; }
    else if (key === 'pickPocket') { const gp = u.stats.gp; spell.cast(u, { value: targetValue }, { language: 'en' }); real = u.stats.gp - gp; }
    else if (spell.bulk) { const data: any = { query: {} }; spell.cast(u, data); real = Object.values(data.update.$inc)[0] as number; }
    else { const k = ({ defensiveStance: 'con' } as Record<string, string>)[key]; const b = u.stats.buffs[k]; spell.cast(u, null, { language: 'en' }); real = u.stats.buffs[k] - b; }
    if (Math.abs(eng - real) < 1e-9) ok++; else if (!firstBad) firstBad = `#${i} ${key}: engine ${eng} vs real ${real}`;
  }
  report('I  one cast\'s effect (heals, buffs, Ethereal Surge, Stealth, Pickpocket, Searing Brightness)', ok, M, firstBad ? `\n      first failure: ${firstBad}` : '');
}

// ---------------------------------------------------------------- J. gear plans replayed: Smash chains and the gear for the next task
{
  let ok = 0; let firstBad = ''; let swapped = 0; let tasks = 0; const M = Math.round(N / 10);
  for (let i = 0; i < M; i++) {
    const smash = rand() < 0.6;
    const c = randomCase(smash ? { cls: 'warrior', lvl: ri(11, 140) } : {});
    // more owned pieces, so there is something to swap to
    for (let j = 0; j < ri(4, 16); j++) { const slot = pick(SLOTS); const k = pick(bySlot[slot]); if (!c.owned.includes(k)) { c.owned.push(k); c.user.items.gear.owned[k] = true; } }
    const ctx = { equipped: c.equipped, owned: c.owned, table: GEAR, meta: ITEMS.gear };
    const u = c.user;
    let bad = '';
    const wear = (keys: string[]) => { for (const key of keys) H.equip(u, { params: { type: 'equipped', key }, language: 'en' }); };
    if (smash) {
      c.state.classSelected = true; u.flags.classSelected = true;
      const plan = smashPlan(c.state, ctx, 0);
      if (!plan) { ok++; continue; }
      if (plan.loadout.equip.length) swapped++;
      wear(plan.loadout.equip);
      let dmg = 0; let crits = 0; const target = { value: 0 };
      while (u.stats.mp >= 10) {
        const before = u.party.quest.progress.up;
        const m = H.spells.warrior.smash.cast(u, target, { language: 'en' }) || 1;
        floorHook(u);
        dmg += u.party.quest.progress.up - before; if (m > 1) crits++;
      }
      if (dmg !== plan.best.dmg || crits !== plan.best.crits) bad = `smash dmg ${plan.best.dmg}/${plan.best.crits} vs ${dmg}/${crits}`;
    } else {
      tasks++;
      const goal = pick(['damage', 'xp', 'gold'] as const);
      const t: Task = { id: 't', type: pick(['habit', 'daily', 'todo'] as const), value: rand() * 40 - 20, priority: pick([0.1, 1, 1.5, 2]), streak: 0, checked: 0, attribute: pick(STATS) };
      const g = gearForTask(c.state, ctx, t, goal);
      if (!g) { ok++; continue; }
      swapped++;
      wear(g.loadout.equip);
      const before = { exp: u.stats.exp, gp: u.stats.gp, lvl: u.stats.lvl };
      const rt = realTask(t);
      H.scoreTask({ user: u, task: rt, direction: 'up', times: 1, cron: false }, { language: 'en' }); floorHook(u);
      const real = goal === 'damage' ? (u._tmp.quest?.progressDelta || 0) : goal === 'gold' ? u.stats.gp - before.gp
        : (u.stats.lvl > before.lvl ? NaN : u.stats.exp - before.exp);
      if (!Number.isNaN(real) && real !== g.gain) bad = `${goal} ${g.gain} vs ${real}`;
    }
    if (!bad) ok++; else if (!firstBad) firstBad = `#${i}: ${bad}`;
  }
  report('J  gear plans replayed (Smash chains, best gear for the next task)', ok, M, `(${swapped} with a swap, ${tasks} task cases)${firstBad ? `\n      first failure: ${firstBad}` : ''}`);
}

// ---------------------------------------------------------------- K. item drops: the exact chance, today's cap, the day boundary (fns/randomDrop.js)
{
  // the largest double below x: a roll of x must miss and a roll just under it must hit, so the chances are bit-identical
  const below = (x: number) => { const b = new DataView(new ArrayBuffer(8)); b.setFloat64(0, x); b.setBigUint64(0, b.getBigUint64(0) - 1n); return b.getFloat64(0); };
  const copy = (u: any) => Object.assign(JSON.parse(JSON.stringify(u)), { addNotification () {}, markModified () {} });
  let ok = 0; let firstBad = ''; let capped = 0; let crits = 0; const M = Math.round(N / 4);
  for (let i = 0; i < M; i++) {
    const c = randomCase();
    const u = c.user;
    const type = pick(['habit', 'daily', 'todo'] as const);
    const t: Task = {
      id: 't', type, value: rand() * 72 - 50, priority: pick([0.1, 1, 1.5, 2]),
      streak: type === 'daily' ? (rand() < 0.2 ? pick([20, 41, 62]) : ri(0, 60)) : 0, checked: rand() < 0.4 ? ri(1, 5) : 0, attribute: pick(STATS),
    };
    const now = Date.now();
    const acct: DropAccount = {
      contributor: rand() < 0.2 ? ri(1, 9) : 0, rebirths: rand() < 0.2 ? ri(1, 5) : 0, streakAchievements: rand() < 0.5 ? ri(0, 60) : 0,
      subscribed: rand() < 0.3, lastDropAt: now + ri(-3 * 24, 3) * 36e5 + ri(0, 3599) * 1000, lastDropCount: ri(0, 14),
      dayStart: ri(0, 23), timezoneOffset: rand() < 0.05 ? pick([-900, 800]) : ri(-56, 48) * 15,
      completedTask: rand() < 0.97, hasEggsOrPotions: rand() < 0.97, hasFood: rand() < 0.9,
    };
    u.contributor = acct.contributor ? { level: acct.contributor } : {};
    Object.assign(u.achievements, { rebirths: acct.rebirths || undefined, streak: acct.streakAchievements, completedTask: acct.completedTask });
    u.purchased.plan = acct.subscribed ? { customerId: 'c' } : {};
    u.items.lastDrop = { count: acct.lastDropCount, date: new Date(acct.lastDropAt!) };
    u.preferences.dayStart = acct.dayStart; u.preferences.timezoneOffset = acct.timezoneOffset;
    if (!acct.hasEggsOrPotions) { u.items.eggs = {}; u.items.hatchingPotions = {}; }
    if (!acct.hasFood) u.items.food = {};
    const eng = dropOdds(c.state, t, acct, now);
    const rt = realTask(t, t.checked + ri(0, 2));
    let bad = '';
    try {
      H.scoreTask({ user: u, task: rt, direction: 'up', times: 1, cron: false }, { language: 'en' }); floorHook(u);
      if (!acct.completedTask) {
        if (eng.drop || eng.quest || eng.firstDrops) bad = 'no drop before the first completed task';
      } else if (!acct.hasEggsOrPotions) {
        const r = copy(u); H.randomDrop(r, { task: rt, predictableRandom: () => 0 }, { language: 'en' });
        if (!eng.firstDrops || !r._tmp.firstDrops) bad = `first drops: engine ${eng.firstDrops} vs real ${!!r._tmp.firstDrops}`;
      } else {
        const run = (x: number) => {
          const r = copy(u); const before = r.items.lastDrop.count;
          H.randomDrop(r, { task: rt, predictableRandom: () => x }, { language: 'en' });
          return { quest: (r.party.quest.progress.collectedItems || 0) > 0, drop: r.items.lastDrop.count > before };
        };
        const at = run(eng.quest); const under = run(below(eng.quest)); const zero = run(0);
        if (eng.crit !== ((u._tmp.crit || 1) > 1)) bad = 'crit';
        else if (at.quest || !under.quest) bad = `chance: engine ${eng.quest}, real ${at.quest ? 'higher' : 'lower'}`;
        else if (eng.capped === zero.drop) bad = `cap: engine capped ${eng.capped}, real dropped ${zero.drop} (count ${acct.lastDropCount})`;
        else if (at.drop !== (!eng.capped && eng.firstFood)) bad = `first food: engine ${eng.firstFood}, real dropped ${at.drop} at the chance`;
        else if (under.drop !== !eng.capped) bad = `drop just under the chance: real ${under.drop}`;
        else if (eng.drop !== (eng.capped ? 0 : eng.firstFood ? 1 : eng.quest)) bad = 'drop odds';
      }
    } catch (e) { bad = `threw ${(e as Error).message}`; }
    if (eng.capped) capped++; if (eng.crit) crits++;
    if (!bad) ok++; else if (!firstBad) firstBad = `#${i} ${type} value ${t.value} ${JSON.stringify(acct)}: ${bad}`;
  }
  report('K  item drops (exact chance, crit, streak achievement, daily cap, day start and time zone)', ok, M, `(${capped} capped, ${crits} crits)${firstBad ? `\n      first failure: ${firstBad}` : ''}`);
}

// ---------------------------------------------------------------- L. feeding and hatching plans replayed through feed.js and hatch.js
{
  const CAT: StableCatalogue = {
    foodTarget: Object.fromEntries(Object.entries(ITEMS.food as Record<string, any[]>).map(([k, v]) => [k, v[2]])),
    eggKind: Object.fromEntries(Object.entries(ITEMS.eggs as Record<string, any[]>).map(([k, v]) => [k, v[2]])),
    potionKind: Object.fromEntries(Object.entries(ITEMS.hatchingPotions as Record<string, any[]>).map(([k, v]) => [k, v[2]])),
  };
  const petKeys = Object.keys(H.content.petInfo);
  const foods = Object.keys(CAT.foodTarget);
  let ok = 0; let firstBad = ''; let raised = 0; let hatched = 0; let pairs = 0; const M = Math.round(N / 20);
  for (let i = 0; i < M; i++) {
    const pets: Record<string, number> = {}; const mounts: Record<string, boolean> = {};
    for (let j = 0; j < ri(0, 14); j++) {
      const k = pick(petKeys);
      if (rand() < 0.2) { pets[k] = -1; mounts[k] = true; } else pets[k] = Math.min(49, 5 + 2 * ri(0, 6) + 5 * ri(0, 7));
    }
    const food: Record<string, number> = {};
    for (let j = 0; j < ri(0, 10); j++) food[pick(foods)] = ri(0, 14);
    if (rand() < 0.2) food.Saddle = ri(1, 3);
    const eggs: Record<string, number> = {}; const hatchingPotions: Record<string, number> = {};
    for (let j = 0; j < ri(0, 5); j++) eggs[pick(Object.keys(CAT.eggKind))] = ri(0, 3);
    for (let j = 0; j < ri(0, 5); j++) hatchingPotions[pick(Object.keys(CAT.potionKind))] = ri(0, 3);
    const plan = feedingPlan({ pets, mounts, food, eggs, hatchingPotions }, CAT);
    const fresh = (): any => ({ items: { pets: { ...pets }, mounts: { ...mounts }, food: { ...food }, eggs: { ...eggs }, hatchingPotions: { ...hatchingPotions }, currentPet: '' }, achievements: {}, markModified () {}, addNotification () {} });
    const u: any = fresh();
    let bad = '';
    try {
      // byEgg lists exactly the pairings hatch.js accepts from what you hold, each once, with the right mount to raise
      for (const egg of Object.keys(eggs)) {
        for (const potion of Object.keys(hatchingPotions)) {
          if (bad) break;
          let real = true;
          try { H.hatch(fresh(), { params: { egg, hatchingPotion: potion }, language: 'en' }); } catch { real = false; }
          const listed = plan.byEgg.filter(e => e.egg === egg).flatMap(e => e.pets.filter(o => o.potion === potion));
          const pet = `${egg}-${potion}`;
          const mount = H.content.petInfo[pet]?.type !== 'wacky' && !mounts[pet];
          if (listed.length !== (real ? 1 : 0)) bad = `${pet}: listed ${listed.length} time(s), hatch.js ${real ? 'accepts' : 'refuses'} it`;
          else if (real && (listed[0].mount !== mount || listed[0].planned !== plan.hatch.some(o => o.pet === pet))) bad = `${pet}: mount ${listed[0].mount} vs ${mount}, planned ${listed[0].planned}`;
          if (real) pairs++;
        }
      }
      for (const p of [...plan.raise, ...plan.growing]) {
        for (const st of p.steps) H.feed(u, { params: { pet: p.pet, food: st.food }, query: { amount: st.count }, language: 'en' });
        const grown = p.growth + 5 * p.steps.reduce((n, s) => n + s.count, 0);
        if (p.ready !== !!u.items.mounts[p.pet]) { bad = `${p.pet}: plan ready ${p.ready}, real mount ${!!u.items.mounts[p.pet]}`; break; }
        if (!p.ready && (u.items.pets[p.pet] !== grown || grown + 5 * p.short < 50 || grown + 5 * (p.short - 1) >= 50)) { bad = `${p.pet}: growth ${grown} short ${p.short} vs real ${u.items.pets[p.pet]}`; break; }
        if (p.ready) raised++;
      }
      // every pet the plan left out really can't take food, or has none it likes
      for (const [k, g] of Object.entries(pets)) {
        if (bad || !(g > 0) || mounts[k] || [...plan.raise, ...plan.growing].some(p => p.pet === k)) continue;
        const info = H.content.petInfo[k];
        if (info && info.type !== 'special' && info.type !== 'wacky') bad = `${k} (${info.type}) left out of the plan`;
      }
      if (!bad) for (const o of plan.hatch) { H.hatch(u, { params: { egg: o.egg, hatchingPotion: o.potion }, language: 'en' }); hatched++; }
    } catch (e) { bad = `threw ${(e as Error).message}`; }
    if (!bad) ok++; else if (!firstBad) firstBad = `#${i} ${JSON.stringify({ pets, food, eggs, hatchingPotions })}: ${bad}`;
  }
  report('L  feeding and hatching plans replayed (feed.js, hatch.js)', ok, M, `(${raised} mounts raised, ${hatched} hatched, ${pairs} pairings listed)${firstBad ? `\n      first failure: ${firstBad}` : ''}`);
}

console.log(`\nHabitica ${H.version}, engine rules checked against ${RULES.checkedAgainst}, ${clockLabel}`);
if (failures) { console.error(`${failures} suite(s) failed`); process.exit(1); }
console.log('parity: OK');
