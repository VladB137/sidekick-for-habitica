// Exports test vectors from the TypeScript engine for the Java verdict (android/verdict).
// Every number is the engine's own answer, so the Java port is checked against the code the
// parity suite already proves equal to Habitica's. Synthetic players only: no real account data.
//   npx tsx tools/gen-verdict-fixtures.ts [outDir]   (default android/verdict/build/fixtures)
import { mkdirSync, writeFileSync } from 'node:fs';
import { SIN_VECTORS } from '../src/engine/sinVectors';
import { rollOf, verdicts } from '../src/engine';
import { snapshotFromUser, GEAR, ITEMS } from '../src/app/model';
import { buildLines, trimParty, trimTasks, LINES, type LineId } from '../src/app/lines';
import { fmt } from '../src/app/ui/dom';
import { timeOfDay } from '../src/playground/scenes/clock';
import { stableFixtures } from './gen-stable-fixtures';

const out = process.argv[2] || 'android/verdict/build/fixtures';
mkdirSync(out, { recursive: true });

const buf = new Float64Array(1);
const bits = new BigUint64Array(buf.buffer);
const hex = (x: number): string => { buf[0] = x; return bits[0].toString(16).padStart(16, '0'); };

let state = 0x5eed;
const rnd = (): number => { state = (Math.imul(state, 1103515245) + 12345) >>> 0; return state / 4294967296; };
const int = (n: number): number => Math.floor(rnd() * n);
const pick = <T>(a: T[]): T => a[int(a.length)];

// 1. Habitica's recorded sines, as [x, high word, low word]
writeFileSync(`${out}/sin.txt`, SIN_VECTORS.map(([x, hi, lo]) => `${x} ${(hi >>> 0).toString(16)} ${(lo >>> 0).toString(16)}`).join('\n') + '\n');

// 2. rolls: every seed a player can plausibly have, plus fractional and very large ones
const seeds: number[] = [];
for (let s = 0; s < 20000; s++) seeds.push(s);
for (let i = 0; i < 5000; i++) seeds.push(rnd() * 1e6);
for (let i = 0; i < 2000; i++) seeds.push(Math.floor(rnd() * 1e11));
writeFileSync(`${out}/rolls.txt`, seeds.map(s => `${hex(s)} ${hex(rollOf(s))}`).join('\n') + '\n');

// 3. whole GET /user answers → the verdict, through snapshotFromUser and verdicts()
const keys = Object.keys(GEAR);
const slots = ['weapon', 'armor', 'head', 'shield', 'body', 'back', 'headAccessory', 'eyewear'];
const bySlot: Record<string, string[]> = {};
for (const s of slots) bySlot[s] = keys.filter(k => k.startsWith(`${s}_`));
const classes = ['warrior', 'wizard', 'rogue', 'healer'];
const maybeFrac = (n: number): number => (rnd() < 0.15 ? n + Math.round(rnd() * 1000) / 1000 : n);

const lines: string[] = [];
for (let i = 0; i < 4000; i++) {
  const lvl = rnd() < 0.05 ? 100 + int(150) : 1 + int(100);
  const equipped: Record<string, string> = {};
  for (const s of slots) {
    const r = rnd();
    if (r < 0.1) continue;
    if (r < 0.15) { equipped[s] = `${s}_base_0`; continue; }
    if (r < 0.17) { equipped[s] = `${s}_future_${int(99)}`; continue; } // not in the table
    if (bySlot[s].length) equipped[s] = pick(bySlot[s]);
  }
  const stats: Record<string, unknown> = {
    hp: maybeFrac(int(51)), mp: maybeFrac(int(300)), exp: maybeFrac(int(5000)), gp: maybeFrac(rnd() < 0.1 ? int(1e7) : int(3000)),
    lvl, points: int(5), str: int(120), con: int(120), int: int(120), per: int(120),
    buffs: { str: maybeFrac(int(60)), con: maybeFrac(int(60)), int: maybeFrac(int(60)), per: maybeFrac(int(60)), stealth: 0, streaks: rnd() < 0.1 },
    training: { int: 0, per: 0, str: 0, con: 0 },
    class: rnd() < 0.03 ? undefined : pick(classes),
    maxMP: 100,
  };
  if (rnd() < 0.02) delete stats.lvl;
  if (rnd() < 0.02) stats.gp = null;
  const user = {
    _id: '00000000-0000-4000-8000-000000000000',
    stats,
    flags: { classSelected: rnd() < 0.85 },
    preferences: { disableClasses: rnd() < 0.05, automaticAllocation: false, allocationMode: 'flat' },
    items: { gear: { equipped, owned: {} } },
    needsCron: rnd() < 0.1,
  };
  const json = JSON.parse(JSON.stringify(user)); // exactly what the device receives
  const snap = snapshotFromUser(json);
  const v = verdicts(snap.state);
  lines.push(JSON.stringify({
    user: json,
    expect: {
      seed: hex(v.seed), roll: hex(v.roll),
      gear: [snap.state.gear.str, snap.state.gear.con, snap.state.gear.int, snap.state.gear.per].map(hex),
      unknown: snap.unknownGear, needsCron: snap.needsCron, classSelected: snap.state.classSelected, cls: snap.state.cls,
      rolls: v.rolls.map(r => ({ key: r.key, chance: hex(r.chance), mult: hex(r.mult), crit: r.crit, available: r.available, multText: fmt.mult(r.mult), pctText: fmt.pct(r.chance) })),
    },
  }));
}
writeFileSync(`${out}/users.jsonl`, lines.join('\n') + '\n');

// 4. the notification's lines (src/app/lines.ts → android Lines.java): random reads, tasks, parties and choices
const bossKeys = Object.keys(ITEMS.bossQuests);
const collectKeys = Object.keys(ITEMS.collectQuests);
const words = ['Gym', 'Read 20 pages', '**Floss**', 'Water [plants](https://example.com/x)', ':smile: Meditate', '  Walk  ', '![img](a.png)Stretch', 'Journal _daily_', '# Plan', 'Tidy ~desk~'];
const shuffle = <T>(a: T[]): T[] => { const b = a.slice(); for (let i = b.length - 1; i > 0; i--) { const j = int(i + 1); [b[i], b[j]] = [b[j], b[i]]; } return b; };
const lineCases: string[] = [];
const NOW = Date.UTC(2026, 9, 13, 21, 0, 0);
for (let i = 0; i < 3000; i++) {
  const u = JSON.parse(lines[i % lines.length]).user;
  u.preferences.dayStart = rnd() < 0.1 ? undefined : int(24);
  if (rnd() < 0.3) u.stats.maxMP = rnd() < 0.1 ? 0 : 30 + int(300);
  else delete u.stats.maxMP;
  if (rnd() < 0.3) u.stats.toNextLevel = 25 + int(2000);
  if (rnd() < 0.2) u.stats.hp = rnd() < 0.5 ? 0 : -rnd() * 3;
  let party: unknown = null;
  const qr = rnd();
  if (qr < 0.7) {
    const key = qr < 0.35 ? pick(bossKeys) : qr < 0.6 ? pick(collectKeys) : rnd() < 0.5 ? 'notAQuest' : null;
    const collect: Record<string, number> = {};
    if (key && ITEMS.collectQuests[key]) for (const [k, [, n]] of Object.entries(ITEMS.collectQuests[key][1])) if (rnd() < 0.8) collect[k] = int(n + 3);
    const max = key && ITEMS.bossQuests[key] ? ITEMS.bossQuests[key][1] : 100;
    party = trimParty({ quest: { key, active: rnd() < 0.85, progress: { hp: rnd() < 0.1 ? undefined : rnd() * max, collect, rage: 3 }, members: {} } });
    const joined = rnd() < 0.8;
    u.party = { _id: 'p', quest: { key: joined ? key : null, progress: { up: rnd() < 0.5 ? rnd() * 80 : 0, down: 0, collectedItems: rnd() < 0.5 ? int(6) : 0 } } };
  }
  // the player's own numbers that the day change danger and drops lines read
  const uid = u._id as string;
  if (rnd() < 0.3) u.stats.buffs.stealth = int(4);
  if (rnd() < 0.1) u.stats.buffs.streaks = true;
  if (rnd() < 0.1) u.preferences.sleep = true;
  if (rnd() < 0.7) u.preferences.timezoneOffset = pick([0, -60, -180, 300, 480, -330, -840, 720, 5, -3, 900]);
  if (rnd() < 0.3) u.contributor = { level: int(9) };
  if (rnd() < 0.2) u.purchased = { plan: { customerId: rnd() < 0.8 ? 'cus_x' : '' } };
  const dr = rnd();
  if (dr < 0.8) u.items.lastDrop = { count: int(12), ...(dr < 0.6 ? { date: new Date(NOW + int(86400e3) - int(3 * 86400e3)).toISOString() } : dr < 0.65 ? { date: null } : dr < 0.7 ? { date: 'not a date' } : dr < 0.75 ? { date: NOW - int(86400e3) } : {}) };
  if (rnd() < 0.15 && !u.party) u.party = { _id: 'p', quest: { key: pick(bossKeys), progress: { up: 0, down: 0, collectedItems: 0 } } };
  // a quest invitation not yet answered: the key is set, the quest hasn't started
  if (u.party && rnd() < 0.2) (u.party as any).quest.RSVPNeeded = true;
  // the last day change: today's, yesterday's (a new day the read didn't see) or older; sometimes missing or odd
  const lc = rnd();
  u.lastCron = lc < 0.6 ? new Date(NOW + 86400e3 - int(30 * 3600e3)).toISOString() : lc < 0.7 ? new Date(NOW - int(5 * 86400e3)).toISOString() : lc < 0.8 ? undefined : lc < 0.9 ? 'not a date' : NOW - int(86400e3);
  if (rnd() < 0.35) u.stats.hp = maybeFrac(1 + int(15)); // low HP: the day change can kill
  const rawTasks = rnd() < 0.2 ? null : Array.from({ length: int(10) }, () => {
    const group = rnd() < 0.15;
    const checklist = rnd() < 0.3 ? Array.from({ length: int(5) }, () => ({ text: 'c', completed: rnd() < 0.5 })) : undefined;
    return {
      type: pick(['daily', 'daily', 'daily', 'habit', 'todo']), text: pick(words), isDue: rnd() < 0.7, completed: rnd() < 0.4,
      value: rnd() < 0.1 ? pick([-60, 30]) : maybeFrac(int(40) - 25), streak: rnd() < 0.6 ? int(40) : 0, ...(rnd() < 0.1 ? { challenge: { id: rnd() < 0.8 ? 'c' : null } } : {}), priority: pick([0.1, 1, 1.5, 2, 1]), ...(rnd() < 0.05 ? { priority: undefined } : {}),
      ...(checklist ? { checklist } : {}),
      ...(group ? { group: { id: 'g', assignedUsersDetail: rnd() < 0.5 ? { [uid]: { completed: rnd() < 0.5 } } : {} } } : rnd() < 0.05 ? { group: { id: null } } : {}),
      // a group task with the player's userId is an old assigned copy (in their day change); without it, the team board's
      ...(group && rnd() < 0.4 ? { userId: uid } : {}),
    };
  });
  const tasks = rawTasks ? trimTasks(JSON.parse(JSON.stringify(rawTasks)), uid) : null;
  const ids = shuffle(LINES.map(l => l.id)).filter(() => rnd() < 0.6) as LineId[];
  if (rnd() < 0.05) ids.push(ids[0] || 'crit');
  const readAt = rnd() < 0.05 ? 0 : NOW - (rnd() < 0.5 ? int(90_001) : int(3 * 86400e3));
  const input = {
    user: rnd() < 0.03 ? null : u,
    tasks,
    party,
    prefs: {
      order: rnd() < 0.5 ? 'auto' : 'mine',
      lines: ids,
      savingFor: rnd() < 0.5 ? { name: pick(['Golden Sword', 'Basi-List quest', 'Gems with Gold (1)']), price: pick([20, 240, 100, 1e6, 0]) } : null,
      allocateTo: rnd() < 0.5 ? pick(['str', 'con', 'int', 'per']) : null,
    },
    night: rnd() < 0.3 ? null : { on: rnd() < 0.7, mode: pick(['auto', 'int', 'con']), swapAt: int(1440), backOn: rnd() < 0.7, backAt: int(1440), phase: pick(['idle', 'idle', 'read', 'tasks', 'equip', 'swapped', 'back']) },
    now: NOW + int(86400e3),
    readAt,
    offline: rnd() < 0.15,
    tzOffsetMin: pick([0, 60, 120, 180, -300, -480, 330, 345, 540, 840, -720]),
  };
  if (input.readAt) input.readAt = Math.min(input.readAt, input.now);
  const json = JSON.parse(JSON.stringify(input));
  lineCases.push(JSON.stringify({ input: json, expect: buildLines(json), ...(rawTasks ? { rawTasks: JSON.parse(JSON.stringify(rawTasks)), userId: uid } : {}) }));
}
writeFileSync(`${out}/lines.jsonl`, lineCases.join('\n') + '\n');

// the Stable widget's light for each hour of the phone's clock (StableLight.java)
writeFileSync(`${out}/light.txt`, Array.from({ length: 24 }, (_, h) => `${h} ${timeOfDay(new Date(2026, 9, 14, h, 30))}`).join('\n') + '\n');
const stable = stableFixtures(out);
console.log(`verdict fixtures: ${SIN_VECTORS.length} sines, ${seeds.length} rolls, ${lines.length} users, ${lineCases.length} notifications, ${stable} → ${out}`);
