/*
 * What to buy next (src/engine/classplan.ts gearBuys): the Gold gear that raises what one task gives toward the aim,
 * worn in the best set it makes, best gain per Gold first. Built on scoreTask, which the parity suites check.
 */
import { expectedTasksGain, gearBuys, type GearContext } from '../src/engine/classplan';
import { type GearMeta, type GearTable, type State, type Task } from '../src/engine/core';
import gearJson from '../src/data/gear.json';
import itemsJson from '../src/data/items.json';

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };

const table = gearJson as unknown as GearTable;
const meta = (itemsJson as unknown as { gear: Record<string, GearMeta> }).gear;
const price = (k: string) => meta[k][1];
const sale = (...keys: string[]) => keys.map(key => ({ key, price: price(key) }));

const state = (x: Partial<State> = {}): State => ({
  hp: 50, mp: 30, exp: 100, gp: 200, lvl: 20, points: 0, str: 5, con: 5, int: 5, per: 5,
  buffs: { str: 0, con: 0, int: 0, per: 0 }, gear: { str: 0, con: 0, int: 0, per: 0 },
  training: { int: 0, per: 0, str: 0, con: 0 }, cls: 'warrior', classSelected: true, autoAllocate: false, allocationMode: 'flat', ...x,
});
// a typical list: Easy to Hard, from red to blue, a habit, Dailies and To-Dos
const TASKS: Task[] = [];
for (const [i, value] of [-12, -4, 0, 2, 6, 11, 19].entries()) {
  for (const priority of [1, 1.5, 2]) TASKS.push({ id: `t${i}-${priority}`, type: (['todo', 'daily', 'habit'] as const)[i % 3], value, priority, streak: i, checked: 0, attribute: 'str', up: true });
}
const ctx = (owned: string[], equipped: Record<string, string> = {}): GearContext => ({
  equipped: { weapon: 'weapon_base_0', armor: 'armor_base_0', head: 'head_base_0', shield: 'shield_base_0', ...equipped },
  owned, table, meta,
});

// ---- expected gain grows with the stat that drives each aim
{
  const s = state();
  check('XP per task grows with INT', expectedTasksGain(state({ int: 50 }), 'xp', TASKS) > expectedTasksGain(s, 'xp', TASKS));
  check('Gold per task grows with PER', expectedTasksGain(state({ per: 50 }), 'gold', TASKS) > expectedTasksGain(s, 'gold', TASKS));
  check('boss damage per task grows with STR', expectedTasksGain(state({ str: 50 }), 'damage', TASKS) > expectedTasksGain(s, 'damage', TASKS));
  check('more STR alone raises the XP expected too (a likelier, bigger crit)', expectedTasksGain(state({ str: 50 }), 'xp', TASKS) > expectedTasksGain(s, 'xp', TASKS));
}

// ---- a Warrior aiming at boss damage
{
  const s = state();
  const buys = gearBuys(s, ctx([]), sale('weapon_warrior_1', 'head_warrior_1', 'armor_warrior_1', 'shield_warrior_1'), 'damage', TASKS);
  const keys = buys.map(b => b.key);
  check('STR gear is worth buying for boss damage', keys.includes('weapon_warrior_1') && keys.includes('head_warrior_1'), keys.join(','));
  check('CON-only gear does nothing for a task\'s damage, so it isn\'t named', !keys.includes('armor_warrior_1') && !keys.includes('shield_warrior_1'), keys.join(','));
  const per = (b: typeof buys[number]) => (b.after - b.now) / b.price;
  check('best gain per Gold first', buys.every((b, i) => i === 0 || per(buys[i - 1]) >= per(b)), buys.map(b => `${b.key}:${per(b).toFixed(4)}`).join(' '));
  check('each buy is worn in the set it makes', buys.every(b => Object.values(b.loadout.equipped).includes(b.key)));
  check('the gain is real: after beats now', buys.every(b => b.after > b.now));
}

// ---- owned or free gear is never a buy
{
  const s = state();
  const owned = ['weapon_warrior_1'];
  const buys = gearBuys(s, ctx(owned, { weapon: 'weapon_warrior_1' }), sale('weapon_warrior_1', 'weapon_warrior_2'), 'damage', TASKS);
  check('a piece already owned isn\'t offered', !buys.some(b => b.key === 'weapon_warrior_1'));
  check('the next tier still is', buys.some(b => b.key === 'weapon_warrior_2'));
  check('nothing with no tasks to score', gearBuys(s, ctx([]), sale('weapon_warrior_1'), 'damage', []).length === 0);
  check('nothing for a price of 0', gearBuys(s, ctx([]), [{ key: 'weapon_warrior_1', price: 0 }], 'damage', TASKS).length === 0);
}

// ---- a Mage aiming at XP: INT first; a two-handed staff weighed against what it replaces
{
  const s = state({ cls: 'wizard' });
  const buys = gearBuys(s, ctx([]), sale('weapon_wizard_1', 'armor_wizard_1', 'head_wizard_1'), 'xp', TASKS);
  const keys = buys.map(b => b.key);
  check('Mage: INT gear is worth buying for XP', keys.includes('weapon_wizard_1') && keys.includes('armor_wizard_1'), keys.join(','));
  const gold = gearBuys(s, ctx([]), sale('head_wizard_1'), 'gold', TASKS);
  check('Mage: a PER hat is worth buying for Gold', gold.length === 1, JSON.stringify(gold.map(b => b.key)));
}

console.log(`${checks - failures}/${checks} gear buy checks pass`);
if (failures) process.exit(1);
