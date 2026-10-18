/*
 * Growth (src/app/stable/growth.ts and the scene's marks): the Stable design spec §08. Which Habitica numbers
 * grow what, the stages and their words, what a new read announces, that growth never shrinks, and the
 * "What grows here" rows.
 */
import {
  MAX_PLAQUES, PARTS, announcement, atLeast, growthOf, growthRows, grownFor, grownPercent, loadGrown, newSteps, openDailies, progressOf, saveGrown, stepsOf,
} from '../src/app/stable/growth';
import { NO_GROWTH, SCENE_IDS, paintScene, type Growth } from '../src/playground/scenes';

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } };

const G = (o: Partial<Growth>): Growth => ({ ...NO_GROWTH, trophies: [], signs: [], ...o });

// the numbers, from a user object as Habitica sends it
{
  const g = growthOf({ loginIncentives: 47, stats: { lvl: 34 }, achievements: { perfect: 8, streak: 0, quests: { atom1: 1, vice1: 2, dilatoryDistress1: 0 } } },
    [{ type: 'daily', streak: 9 }, { type: 'daily', streak: 4 }, { type: 'habit', streak: 40 }, { type: 'daily' }]);
  check('numbers: check-ins, Perfect Days, the longest Daily streak, level and different quests finished', JSON.stringify(g) === JSON.stringify({ checkIns: 47, perfectDays: 8, streakDays: 9, level: 34, quests: 2, trophies: [], signs: [] }), JSON.stringify(g));
  check('numbers: a streak achievement is a 21-day streak, a longer Daily streak counts as it is',
    growthOf({ achievements: { streak: 2 } }, [{ type: 'daily', streak: 5 }]).streakDays === 21 && growthOf({ achievements: { streak: 1 } }, [{ type: 'daily', streak: 30 }]).streakDays === 30);
  check('numbers: nothing read is nothing grown', JSON.stringify(growthOf(undefined)) === JSON.stringify(NO_GROWTH) && growthOf({}).level === 1);
  check('numbers: junk is read as 0', JSON.stringify(growthOf({ loginIncentives: 'x', achievements: { perfect: -3, streak: NaN, quests: 5 }, stats: { lvl: 2.7 } }, [{ type: 'daily', streak: -4 }])) === JSON.stringify(G({ level: 2 })));
}

// the stages
{
  const s = stepsOf('meadow');
  check('forest: a tree every 5 days up to 9, the first fully grown at 30, all at 70, a giant at 100',
    s.forest.filter(x => x.kind === 'tree').map(x => x.at).join() === '5,10,15,20,25,30,35,40' && s.forest.find(x => x.kind === 'old')?.at === 30
    && s.forest.find(x => x.kind === 'grown')?.at === 70 && s.forest[s.forest.length - 1].at === 100);
  check('forest: something new at most 10 days apart', s.forest.every((x, i) => x.at - (i ? s.forest[i - 1].at : 0) <= 30) && s.forest.filter(x => x.at <= 40).length >= 9);
  check('flowers: a patch every Perfect Day, 30 at most', s.flowers.length === 30 && s.flowers[0].at === 1 && s.flowers[29].at === 30);
  check('water: stones, pond, bridge, waterfall at Daily streaks of 3, 7, 14 and 21 days', s.water.map(x => `${x.at}:${x.kind}`).join() === '3:stones,7:pond,14:bridge,21:fall');
  check('stable: shelter 5, building 10, banner 15, hall 20 (the last)', s.stable.map(x => x.at).join() === '5,10,15,20' && stepsOf('lake').stable[1].one === 'the boathouse');
  check('each scene has its own words', new Set(SCENE_IDS.map(id => stepsOf(id).flowers[0].one)).size >= 6, SCENE_IDS.map(id => stepsOf(id).flowers[0].one).join(' | '));
}

// what a read announces
{
  const a = G({ checkIns: 4, perfectDays: 2, level: 4 });
  check('nothing new, nothing said', newSteps(a, a, 'meadow').length === 0 && announcement([]) === '');
  check('one tree', announcement(newSteps(a, G({ checkIns: 5, perfectDays: 2, level: 4 }), 'meadow')) === 'Your forest grew: a new tree.');
  check('one Perfect Day, one patch', announcement(newSteps(a, G({ checkIns: 4, perfectDays: 3, level: 4 }), 'meadow')) === 'Your playground grew: a patch of flowers.');
  check('several at once, named together', announcement(newSteps(a, G({ checkIns: 16, perfectDays: 4, streakDays: 7, level: 5 }), 'meadow'))
    === 'Your playground grew: 3 new trees, 2 patches of flowers, stepping stones, a pond and a shelter.', announcement(newSteps(a, G({ checkIns: 16, perfectDays: 4, streakDays: 7, level: 5 }), 'meadow')));
  check('the first tree grown, the whole forest, the giant tree', announcement(newSteps(G({ checkIns: 29 }), G({ checkIns: 30 }), 'pine')) === 'Your forest grew: a new tree and the first tree fully grown.'
    && announcement(newSteps(G({ checkIns: 69 }), G({ checkIns: 100 }), 'pine')) === 'Your forest grew: every tree fully grown and a giant tree.');
  check('the scene names its own building', announcement(newSteps(G({ level: 9 }), G({ level: 10 }), 'cove')) === 'Your playground grew: the beach hut.');
  check('plaques only once the building is there to hang them on', newSteps(G({ level: 9 }), G({ level: 9, quests: 3 }), 'meadow').length === 0
    && newSteps(G({ level: 9, quests: 3 }), G({ level: 10, quests: 3 }), 'meadow').filter(x => x.part === 'plaques').length === 3);
  check('at most as many plaques as the wall shows', newSteps(G({ level: 30 }), G({ level: 30, quests: 40 }), 'meadow').length === MAX_PLAQUES);
  check('past the last stage, nothing more', newSteps(G({ checkIns: 100, perfectDays: 30, streakDays: 21, level: 20 }), G({ checkIns: 900, perfectDays: 300, streakDays: 200, level: 99 }), 'meadow').length === 0);
}

// never shrinks: the phone keeps what it has shown
{
  check('field by field, the bigger', JSON.stringify(atLeast(G({ level: 50, checkIns: 10 }), G({ level: 1, checkIns: 12 }))) === JSON.stringify(G({ level: 50, checkIns: 12 })));
  check('no record: just the numbers', grownFor('u1', { stats: { lvl: 12 } }).level === 12 && loadGrown('u1') === undefined);
  saveGrown('u1', G({ level: 50, streakDays: 14 }));
  check('after a rebirth the hall stays', grownFor('u1', { stats: { lvl: 1 }, achievements: { streak: 0 } }).level === 50 && loadGrown('u2') === undefined);
  check('a broken streak takes no water away', grownFor('u1', { stats: { lvl: 1 } }, [{ type: 'daily', streak: 0 }]).streakDays === 14 && grownFor('u1', {}, [{ type: 'daily', streak: 16 }]).streakDays === 16);
  check('a broken record is read as numbers', (mem.set('critoracle:v2:growth', JSON.stringify({ u3: { level: 'x', checkIns: 5 } })), JSON.stringify(loadGrown('u3'))) === JSON.stringify(G({ checkIns: 5 })));
  mem.set('critoracle:v2:growth', JSON.stringify({ u4: { checkIns: 61, perfectDays: 7, streaks: 2, level: 12, quests: 1 }, u5: { checkIns: 3, streaks: 0 } }));
  check('a record from before counted streak achievements: any is a 21-day streak', loadGrown('u4')?.streakDays === 21 && loadGrown('u5')?.streakDays === 0, JSON.stringify([loadGrown('u4'), loadGrown('u5')]));
}

// open Dailies only change the light
{
  const t = [{ type: 'daily', isDue: true, completed: false }, { type: 'daily', isDue: false, completed: false }, { type: 'daily', isDue: true, completed: true }, { type: 'todo', isDue: true, completed: false }];
  check('open Dailies: due today and not done', openDailies(t) === 1 && openDailies([]) === 0);
}

// the sheet
{
  const rows = growthRows(G({ checkIns: 47, perfectDays: 8, streakDays: 9, level: 12, quests: 2 }), 'meadow', 2);
  const r = Object.fromEntries(rows.map(x => [x.part, x]));
  check('sheet: a row per number and the light', rows.map(x => x.part).join() === 'forest,flowers,water,stable,plaques,trophies,light');
  check('sheet: forest now and next', r.forest.now === '47 days checked in: 9 trees, 5 still growing.' && r.forest.next === 'Next: every tree fully grown at 70 days, 23 to go. Trees grow a little every day.', `${r.forest.now} / ${r.forest.next}`);
  check('sheet: a young forest', growthRows(G({ checkIns: 6 }), 'meadow', 0)[0].now === '6 days checked in: 2 trees, all still growing.' && growthRows(G({ checkIns: 0 }), 'meadow', 0)[0].now === '0 days checked in: 1 tree, still growing.');
  check('sheet: flowers', r.flowers.title === 'Flowers' && r.flowers.now === '8 Perfect Days: 8 patches of flowers.' && r.flowers.next === 'Next: a patch of flowers with your next Perfect Day (all of a day’s Dailies done).', `${r.flowers.title}: ${r.flowers.now} / ${r.flowers.next}`);
  check('sheet: water', r.water.now === 'Longest Daily streak: 9 days: a pond.' && r.water.next === 'Next: a bridge over the pond once a Daily is done 14 days in a row.', `${r.water.now} / ${r.water.next}`);
  check('sheet: stable', r.stable.now === 'Level 12: the barn.' && r.stable.next === 'Next: a banner on the stable at level 15.', `${r.stable.now} / ${r.stable.next}`);
  check('sheet: plaques', r.plaques.now === '2 different quests finished: 2 plaques on the wall.', r.plaques.now);
  check('sheet: light', r.light.now === '2 Dailies still open today: soft morning light.' && r.light.progress === undefined);
  check('sheet: each part says how far it has grown', r.forest.progress === 0.47 && r.flowers.progress === 8 / 30 && r.water.progress === 9 / 21 && r.stable.progress === 11 / 19 && r.plaques.progress === 2 / 6,
    rows.map(x => `${x.part} ${x.progress}`).join(', '));
  const end = Object.fromEntries(growthRows(G({ checkIns: 400, perfectDays: 99, streakDays: 50, level: 50, quests: 9 }), 'marsh', 0, { winter: true }).map(x => [x.part, x]));
  check('sheet: complete parts say so', end.forest.next === 'The forest is complete.' && end.flowers.next === 'Every patch has grown.' && end.water.next === 'The water is complete.'
    && end.stable.now === 'Level 50: the hall with lanterns, the last stage.' && end.plaques.next === 'The wall is full (6).' && end.flowers.title === 'Cattails' && /Under the snow/.test(end.flowers.now) && /full sun/.test(end.light.now), JSON.stringify(end));
  const low = Object.fromEntries(growthRows(G({ quests: 2 }), 'lake', undefined).map(x => [x.part, x]));
  check('sheet: low levels say where plaques will hang; unread Dailies say so', low.plaques.next === 'They hang on the boathouse, from level 10.' && low.stable.now === 'Level 1: a fence.' && /haven’t been read/.test(low.light.now) && low.plaques.progress === 0);
}

// how far the whole playground has grown
{
  check('percent: nothing grown is 0, everything is 100', grownPercent(NO_GROWTH) === 0 && grownPercent(G({ checkIns: 100, perfectDays: 30, streakDays: 21, level: 20, quests: 6 })) === 100);
  check('percent: never past 100 and every part counts the same', grownPercent(G({ checkIns: 9999, perfectDays: 9999, streakDays: 9999, level: 999, quests: 99 })) === 100
    && grownPercent(G({ checkIns: 100 })) === 20 && PARTS.every(p => progressOf(NO_GROWTH, p) === 0));
  check('percent: a steady month is about half', grownPercent(G({ checkIns: 30, perfectDays: 15, streakDays: 21, level: 10, quests: 1 })) >= 45, String(grownPercent(G({ checkIns: 30, perfectDays: 15, streakDays: 21, level: 10, quests: 1 }))));
}

// the scene's marks: where the sparkle goes, inside the picture
{
  const sink = { fillStyle: '', fillRect () {} } as any;
  for (const scene of SCENE_IDS) for (const g of [NO_GROWTH, G({ checkIns: 400, perfectDays: 60, streakDays: 21, level: 50, quests: 6 }), G({ streakDays: 3 })]) {
    const L = paintScene(sink, { W: 160, H: 284, top: 20, bottom: 30 }, { scene, growth: g, tod: 'day', season: 'summer', dailiesDone: true });
    const bad = Object.entries(L.marks).filter(([, m]) => !(m.x >= 0 && m.x < 160 && m.y >= 0 && m.y < 284));
    check(`marks inside the picture: ${scene} ${JSON.stringify(g)}`, bad.length === 0, JSON.stringify(bad));
  }
}

if (failures) { console.log(`FAIL  growth: ${failures} of ${checks} checks failed`); process.exit(1); }
console.log(`PASS  growth: ${checks} checks`);
