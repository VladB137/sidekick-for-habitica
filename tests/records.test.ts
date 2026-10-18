/*
 * Crit records (src/engine/journal.ts) and the weekly almanac's counting (src/app/weekly.ts).
 * Records are carried crit by crit, so they must equal a fold over the whole journal and outlive its oldest entries;
 * the almanac's weeks must freeze at the turn of a week and count on from the last read, so nothing between two
 * reads is lost.
 */
import { addRecord, recordsOf, runNow, validRecords, weekOf, type JournalEntry } from '../src/engine';
import { changes, noteRead, ownedOf } from '../src/app/weekly';

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };

const e = (day: number, mult: number, at = day * 1000, more: Partial<JournalEntry> = {}): JournalEntry =>
  Object.assign({ at, day, taskId: 't', text: 'x', type: 'daily' as const, mult, exp: 10, gp: 5, mp: 1, dmg: 3 }, more);

/* ---- records */
const j = [e(100, 1.5), e(100, 2.2), e(101, 1.8), e(101, 1.6), e(101, 1.7), e(103, 3.1, undefined, { boss: true }), e(104, 1.4), e(105, 1.9), e(106, 1.2)];
const r = recordsOf(j)!;
check('records: every crit counted, gains summed, boss damage only during a boss quest', r.crits === 9 && r.exp === 90 && r.gp === 45 && r.mp === 9 && r.dmg === 3, JSON.stringify(r));
check('records: the biggest multiplier and its day', r.best.mult === 3.1 && r.best.day === 103);
check('records: the most crits in one day', r.bestDay.crits === 3 && r.bestDay.day === 101);
check('records: the most days in a row (103–106 beats 100–101)', r.bestRun.days === 4 && r.bestRun.day === 106, JSON.stringify(r.bestRun));
check('records: since the first crit', r.since === 100);
check('records: the run still going today and the day after, gone after a day without', runNow(r, 106) === 4 && runNow(r, 107) === 4 && runNow(r, 108) === 0);
// carried forward one crit at a time equals the fold over the journal, and outlives the journal's trimming
let carried = recordsOf(j.slice(0, 4));
for (const x of j.slice(4)) carried = addRecord(carried, x);
check('records: carried crit by crit equals the whole journal', JSON.stringify(carried) === JSON.stringify(r));
const trimmed = recordsOf(j.slice(-3));
check('records: kept records outlive a trimmed journal (the journal alone forgets)', carried!.crits === 9 && trimmed!.crits === 3);
// a crit dated before the latest (the clock moved) counts, but starts no new day or run
const back = addRecord(r, e(102, 1.3, 107_000));
check('records: a crit dated earlier counts without breaking the day or the run', back.crits === 10 && back.last.day === 106 && back.last.run === 4 && back.bestDay.crits === 3);
check('records: stored records are checked before use', validRecords(r) && !validRecords({ crits: 1 }) && !validRecords(undefined) && !validRecords({ ...r, best: { mult: 'x' } }));
check('records: none without crits', recordsOf([]) === undefined);

/* ---- the almanac's counting */
const raw = (pets: Record<string, number>, mounts: Record<string, boolean>, quests: Record<string, number> = {}) => ({ items: { pets, mounts }, achievements: { quests } });
const a = ownedOf(raw({ 'Wolf-Base': 5, 'Fox-Red': -1, 'Cactus-Desert': 0 }, { 'Fox-Red': true, 'Bear-Base': false }, { basilist: 1, gryphon: 0 }), [3, 12, 7])!;
check('owned: pets alive and raised, mounts owned, quests won, the longest Daily streak',
  a.alive.join() === 'Wolf-Base' && a.raised.join() === 'Fox-Red' && a.mounts.join() === 'Fox-Red' && JSON.stringify(a.quests) === '{"basilist":1}' && a.streak === 12, JSON.stringify(a));
check('owned: a read without the stable says nothing', ownedOf({ stats: {} }, []) === undefined);
const b = ownedOf(raw({ 'Wolf-Base': -1, 'Fox-Red': 5, 'Cactus-Desert': 5, 'Dragon-Red': 5 }, { 'Fox-Red': true, 'Wolf-Base': true }, { basilist: 2, dilatory: 1 }), [13])!;
const c = changes(a, b);
check('changes: new pets and one hatched again after it was raised; a raised mount; each quest win once',
  c.hatched === 3 && c.raised === 1 && c.quests.sort().join() === 'basilist,dilatory', JSON.stringify(c));

const MON = 20374; // a Monday (2025-10-13)
check('weeks start on Monday', weekOf(MON) === MON && weekOf(MON + 6) === MON && weekOf(MON + 7) === MON + 7);
let rec = noteRead({}, a, MON + 2);
check('first read: the week counted from that day, nothing frozen yet', rec.cur?.week === MON && rec.cur.from === MON + 2 && !rec.last);
rec = noteRead(rec, b, MON + 5);
check('a later read in the same week moves its end and keeps the longest streak', rec.cur?.end === b && rec.cur.start === a && rec.cur.streak === 13);
const d = ownedOf(raw({ 'Wolf-Base': -1, 'Fox-Red': 5, 'Cactus-Desert': 5, 'Dragon-Red': 5, 'Egg-Base': 2 }, { 'Fox-Red': true, 'Wolf-Base': true }, { basilist: 2, dilatory: 1 }), [2])!;
rec = noteRead(rec, d, MON + 8);
check('the next week freezes last week from its first to its latest read',
  rec.last?.week === MON && rec.last.hatched === 3 && rec.last.raised === 1 && rec.last.quests.length === 2 && rec.last.streak === 13 && rec.last.from === MON + 2, JSON.stringify(rec.last));
check('…and counts the new week on from that latest read, so a pet hatched between the two reads is this week’s',
  rec.cur?.week === MON + 7 && rec.cur.from === MON + 7 && changes(rec.cur.start, rec.cur.end).hatched === 1, JSON.stringify(rec.cur && changes(rec.cur.start, rec.cur.end)));
const gap = noteRead(rec, d, MON + 22);
check('after weeks away: no last week to show, the new week counted from that read', !gap.last && gap.cur?.week === MON + 21 && gap.cur.from === MON + 22);
check('a clock moved back keeps the newer week', noteRead(rec, a, MON + 1) === rec);

console.log(`records: ${checks - failures}/${checks} checks passed`);
if (failures) process.exit(1);
