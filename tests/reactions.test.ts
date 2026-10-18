/*
 * The Stable's scene reactions without a browser (src/app/stable/reactions.ts, spec §08): when the creatures
 * worry about the player's HP, the boss in the sky and its size, every boss shape bundled from Habitica's
 * images, which crit and which quest win are still to celebrate, and a collection quest's finds in the grass. The drawing is checked in a real browser by tests/e2e.cjs.
 */
import { LOW_HP, bossName, bossOf, bossShape, critToCelebrate, noteWins, winToCelebrate, worried } from '../src/app/stable/reactions';
import { bossScale } from '../src/playground/scenes';
import { ITEMS } from '../src/app/model';
import shapes from '../src/data/boss-shapes.json';
import { FIND_PICTURES, PER_KIND, allFound, describeFinds, findsOf, shownOf } from '../src/app/stable/finds';
import { readFileSync } from 'node:fs';
import { FindsLayer } from '../src/playground/scenes/finds';
import type { JournalEntry } from '../src/engine';

let failures = 0, passes = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); }
};

/* ---- low HP: below a third of Habitica's 50 */
check('worry: below a third of the HP', LOW_HP === 50 / 3 && worried(16.6) && worried(0) && worried(-1));
check('worry: from a third up, or no read yet, none', !worried(50 / 3) && !worried(17) && !worried(50) && !worried(undefined));

/* ---- the boss in the sky */
const basilist = ITEMS.bossQuests.basilist;
check('boss: an active boss quest, with the HP it has left', JSON.stringify(bossOf({ quest: { key: 'basilist', active: true, progress: { hp: 77 } } })) === JSON.stringify({ key: 'basilist', name: basilist[2], hp: 77, max: basilist[1] }));
check('boss: no HP in the read counts as full', bossOf({ quest: { key: 'basilist', active: true, progress: {} } })?.hp === basilist[1]);
check('boss: none before the quest starts, for a collection quest, or with no party', !bossOf({ quest: { key: 'basilist', active: false } }) && !bossOf({ quest: { key: 'dilatoryDistress1', active: true } }) && !bossOf(null) && !bossOf(undefined));
check('boss: a third of its size nearly beaten, all of it at full HP', bossScale(100, 100) === 1 && Math.abs(bossScale(0, 100) - 1 / 3) < 1e-9 && Math.abs(bossScale(50, 100) - 2 / 3) < 1e-9 && bossScale(150, 100) === 1 && bossScale(-5, 100) === bossScale(0, 100));

/* ---- every boss Habitica's quests have, as an outline (the world bosses have no quest picture) */
const keys = Object.keys(ITEMS.bossQuests);
const missing = keys.filter(k => !bossShape(k));
check('shapes: every party boss has one', missing.join() === 'burnout,dysheartener,stressbeast', missing.join());
const bad = keys.filter(k => {
  const s = bossShape(k);
  if (!s) return false;
  let on = 0;
  for (let i = 0; i < s.w * s.h; i++) if (s.bits[i >> 3] & (0x80 >> (i & 7))) on++;
  return s.bits.length !== Math.ceil(s.w * s.h / 8) || Math.max(s.w, s.h) !== shapes.size || on < s.w * s.h * 0.15;
});
check('shapes: whole masks, longest side 48, a real silhouette in each', bad.length === 0, bad.join());
check('shapes: a key that isn’t a boss has none', !bossShape('notAQuest'));

/* ---- the crit to celebrate */
const e = (at: number, day: number) => ({ at, day } as JournalEntry);
const journal = [e(100, 9), e(200, 10), e(300, 10), e(250, 10)];
check('crit: the newest of today', critToCelebrate(journal, 0, 10) === 300);
check('crit: once celebrated, not again', critToCelebrate(journal, 300, 10) === undefined);
check('crit: a newer one after that is', critToCelebrate([...journal, e(400, 10)], 300, 10) === 400);
check('crit: yesterday’s are gone by the next visit', critToCelebrate(journal, 0, 11) === undefined && critToCelebrate([], 0, 10) === undefined);

/* ---- the quest won (achievements.quests counts what Habitica rewarded) */
const first = noteWins(undefined, { dilatoryDistress1: 1, basilist: 2 }, 10);
check('quest: the first counts are kept silently', JSON.stringify(first) === JSON.stringify({ counts: { dilatoryDistress1: 1, basilist: 2 } }) && winToCelebrate(first, 10) === undefined);
check('quest: a read without the counts changes nothing', noteWins(first, undefined, 10) === first && noteWins(undefined, null, 10) === undefined);
const won = noteWins(first, { dilatoryDistress1: 1, basilist: 3 }, 10);
check('quest: a count that went up is the win, celebrated the same Habitica day', won?.won?.key === 'basilist' && winToCelebrate(won, 10) === 'basilist' && winToCelebrate(won, 11) === undefined);
check('quest: a first win counts too, and a boss beats a collection quest', noteWins(first, { dilatoryDistress1: 2, basilist: 2, gryphon: 1 }, 10)?.won?.key === 'gryphon' && noteWins(first, { dilatoryDistress1: 2, basilist: 2 }, 10)?.won?.key === 'dilatoryDistress1');
check('quest: the same counts again keep the win waiting, and a lower count is no win', noteWins(won, { dilatoryDistress1: 1, basilist: 3 }, 11)?.won?.day === 10 && !noteWins({ counts: first!.counts }, { basilist: 1 }, 10)?.won);
check('quest: junk in the counts is ignored', JSON.stringify(noteWins(undefined, { a: 'x', b: -1, c: NaN, basilist: 1 }, 1)) === JSON.stringify({ counts: { basilist: 1 } }));
check('quest: the boss’s name is Habitica’s own', bossName('basilist') === 'The Basi-List' && bossName('dilatoryDistress1') === undefined);

/* ---- a collection quest's finds */
check('finds: one picture per eighth begun, none before the first, 8 at most', shownOf(0, 20) === 0 && shownOf(1, 20) === 1 && shownOf(10, 20) === 4 && shownOf(11, 20) === 5 && shownOf(20, 20) === 8 && shownOf(25, 20) === 8 && shownOf(1, 1) === 8 && PER_KIND === 8);
const dd = { quest: { key: 'dilatoryDistress1', active: true, progress: { collect: { fireCoral: 10, blueFins: 5 } } } };
const f = findsOf(dd, { party: { quest: { key: 'dilatoryDistress1', progress: { collectedItems: 3 } } } });
check('finds: the party’s finds, Habitica’s names and counts', JSON.stringify(f?.finds.map(x => [x.key, x.name, x.found, x.need, x.shown])) === JSON.stringify([['dilatoryDistress1_fireCoral', 'Fire Coral', 10, 20, 4], ['dilatoryDistress1_blueFins', 'Blue Fins', 5, 20, 2]]) && f?.today === 3, JSON.stringify(f));
check('finds: today’s only while the player is in that quest', findsOf(dd, { party: { quest: { key: 'basilist', progress: { collectedItems: 3 } } } })?.today === 0 && findsOf(dd, undefined)?.today === 0);
check('finds: none for a boss quest, before the quest starts, or without a party', !findsOf({ quest: { key: 'basilist', active: true } }, undefined) && !findsOf({ quest: { ...dd.quest, active: false } }, undefined) && !findsOf(null, undefined));
check('finds: TalkBack hears what lies there and what waits for the day change', describeFinds(f!) === 'Fire Coral and Blue Fins lie in the grass: 10 of 20 and 5 of 20, 3 more found today, counted at the day change', describeFinds(f!));
check('finds: nothing found yet and nothing today, nothing said', describeFinds(findsOf({ quest: { key: 'robot', active: true, progress: { collect: {} } } }, undefined)!) === undefined);
const robot = allFound('robot');
check('finds: a won quest’s last picture is everything found', !!robot && robot.finds.every(x => x.found === x.need && x.shown === PER_KIND) && !allFound('basilist'));
const sheet = readFileSync(new URL('../public/stable/finds.png', import.meta.url)), sw = sheet.readUInt32BE(16), sh = sheet.readUInt32BE(20);
const keysNeeded = Object.entries(ITEMS.collectQuests).flatMap(([q, [, items]]) => Object.keys(items).map(i => `${q}_${i}`));
const noPic = keysNeeded.filter(k => { const c = FIND_PICTURES[k]; return !c || c[2] < 9 || c[3] < 9 || c[0] + c[2] > sw || c[1] + c[3] > sh; });
check('finds: every find of every collection quest has its picture on the sheet', keysNeeded.length >= 41 && noPic.length === 0, noPic.join());

// spots: a fake scene with a small playground's ground (160 x 77 art pixels), the door in its top right corner
const fake = { walk: () => ({ left: 0, right: 480, top: 390, bottom: 620 }), door: () => ({ x: 450, y: 380 }), mark: () => ({ x: 450, y: 380 }) };
const layer = new FindsLayer(fake as any, () => undefined), pic = { key: 'k', sx: 0, sy: 0, w: 60, h: 60 };
const shown = { seed: 'dilatoryDistress1', pictures: Array(8).fill(pic), glints: 3 }, at = layer.spots({ w: 480, h: 640 } as any, shown);
const clash = at.flatMap((p, i) => at.slice(i + 1).filter(q => Math.abs(p.x - q.x) < 21 * 3 && Math.abs(p.y - q.y) < 21 * 3).map(q => `${p.x},${p.y}~${q.x},${q.y}`));
check('finds: every spot on the ground, no two finds’ boxes touching', at.length === 11 && at.every(p => p.x >= 0 && p.x <= 480 && p.y >= 390 && p.y <= 620) && clash.length === 0, clash.join(' '));
check('finds: the same spots every time for the quest', JSON.stringify(new FindsLayer(fake as any, () => undefined).spots({ w: 480, h: 640 } as any, shown)) === JSON.stringify(at));

if (failures) { console.log(`FAIL  reactions: ${failures} of ${passes + failures} checks failed`); process.exit(1); }
console.log(`PASS  reactions: all ${passes} checks (low HP, the boss and its size, ${keys.length - missing.length} boss shapes, crits and quest wins to celebrate, ${keysNeeded.length} finds)`);
