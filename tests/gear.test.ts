/*
 * Every piece of gear Habitica knows today must resolve in the app: in src/data/gear.json with the same
 * stats and class, and in src/data/items.json with its slot and name. A miss shows as "unknown item" in
 * Stats and leaves the piece out of the stat totals, so a stale table fails here, not on a phone.
 * Real clock on purpose: the question is what a player can own now. (gen:data builds the table with the
 * clock years ahead, so it also holds items Habitica has scheduled but not yet released.)
 */
import { createRequire } from 'node:module';
import gearJson from '../src/data/gear.json';
import itemsJson from '../src/data/items.json';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');
const GEAR = gearJson as Record<string, 0 | (number | string)[]>;
const ITEMS = itemsJson as unknown as { habitica: string, gear: Record<string, [string, number, string, ...unknown[]]> };
const classes = ['warrior', 'rogue', 'healer', 'wizard'];

const problems: string[] = [];
let n = 0;
for (const [key, it] of Object.entries(H.content.gear.flat as Record<string, any>)) {
  n += 1;
  if (!(key in GEAR)) { problems.push(`${key}: not in gear.json`); continue; }
  const s = [it.str || 0, it.con || 0, it.int || 0, it.per || 0];
  const cls = classes.includes(it.klass) ? it.klass : (classes.includes(it.specialClass) ? it.specialClass : '');
  const want = s.some(Boolean) ? (cls ? [...s, cls] : s) : 0;
  if (JSON.stringify(GEAR[key]) !== JSON.stringify(want)) problems.push(`${key}: gear.json ${JSON.stringify(GEAR[key])}, Habitica ${JSON.stringify(want)}`);
  const meta = ITEMS.gear[key];
  if (!meta) problems.push(`${key}: not in items.json`);
  else if (meta[0] !== it.type || meta[2] !== it.text()) problems.push(`${key}: items.json ${meta[0]} "${meta[2]}", Habitica ${it.type} "${it.text()}"`);
}

const head = `gear: ${n} items in Habitica ${H.version} (clock ${new Date().toISOString().slice(0, 10)}), table from ${ITEMS.habitica}`;
if (problems.length) {
  console.log(`FAIL  ${head}: ${problems.length} wrong or missing (npm run gen:data fixes a stale table)`);
  for (const p of problems.slice(0, 40)) console.log(`  ${p}`);
  process.exit(1);
}
console.log(`PASS  ${head}: all ${n} resolve with the right stats, class, slot and name`);
