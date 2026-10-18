/* Trophies: Habitica's collection achievements, each a prop of our own in the playground. The colour
 * achievements hang as pennants on a line, one per hatching potion (a short one for the pets, a long
 * swallowtail once the mounts are done too); the species sets each bring a themed prop; Beast Master,
 * Mount Master and Triad Bingo stand as statues in front of the stable. Keys are Habitica's own
 * (achievements.<key>, v5.51.0 constants/animalSetAchievements.js, animalColorAchievements.js,
 * stableAchievements.js, petCompleteSetAchievements.js). In art pixels, like every prop. */
import { dot, rect, type Paint } from './pixels';
import { pic as stampOf, type PropLook } from './props';

type Painter = (c: Paint, x: number, y: number, l: PropLook) => void;
/** a stamped picture that knows its size */
interface Art { paint: Painter, w: number, h: number }
const pic = (rows: readonly string[], colours: Record<string, string>, opts?: Parameters<typeof stampOf>[2]): Art =>
  ({ paint: stampOf(rows, colours, opts), w: rows[0].length, h: rows.length });

/** the colour achievements in Habitica's order: potion, pet achievement, mount achievement, pennant colours */
export const COLOURS = [
  ['Base', 'backToBasics', 'allYourBase', '#B88A5A', '#8E663E'],
  ['Desert', 'dustDevil', 'aridAuthority', '#E9C98A', '#C9A35E'],
  ['Zombie', 'monsterMagus', 'undeadUndertaker', '#8FA36A', '#6C7E4C'],
  ['White', 'primedForPainting', 'pearlyPro', '#F7F7F2', '#D4D4CC'],
  ['CottonCandyPink', 'tickledPink', 'rosyOutlook', '#F7A8C8', '#E07FA8'],
  ['Golden', 'goodAsGold', 'allThatGlitters', '#F7CC3B', '#D9A520'],
  ['Skeleton', 'boneCollector', 'skeletonCrew', '#ECE6D2', '#3A3A3A'],
  ['Red', 'seeingRed', 'redLetterDay', '#D64545', '#A83232'],
  ['CottonCandyBlue', 'violetsAreBlue', 'wildBlueYonder', '#9CC8F0', '#6FA5D8'],
  ['Shade', 'shadyCustomer', 'shadeOfItAll', '#5A5468', '#3C3848'],
] as const;

const STONE = { s: '#B8BEC2', S: '#8E969B', d: '#6E777B' };

const ARCH = pic([
  '....ssgss....',
  '..sssSSSsss..',
  '.sSs.....sSs.',
  '.sS.......Ss.',
  'sSs.......sSs',
  'sS.........Ss',
  'sSv........Ss',
  'sSv........Ss',
  'sS.........Sv',
  'sS.........Sv',
  'sS........vSs',
  'dSd.......dSd',
  'ddd.......ddd',
], { ...STONE, g: '#FFC400', v: '#4F9A4A' }, { glow: 'g', snowRow: 1 });

const BIRDHOUSE = pic([
  '...b...',
  '...r...',
  '..rrr..',
  '.rrRrr.',
  'rrrrrrr',
  '.wwwww.',
  '.wwhww.',
  '.wwwww.',
  'pwwwww.',
  '...P...',
  '...P...',
  '...P...',
  '..PPP..',
], { b: '#F2A541', r: '#4F7FA8', R: '#6F9CC4', w: '#E8D2A6', h: '#3A2A1E', p: '#7B5A3A', P: '#7B5A3A' }, { snowRow: 2 });

const SHELL = pic([
  '...pppp...',
  '..pPPPPp..',
  '.pPpppPPp.',
  '.pPpPPpPp.',
  '.pPppPPPp.',
  'ttpPPPPp..',
  '.tttttttt.',
  'bbbbbbbbbb',
  '.BBBBBBBB.',
], { p: '#D9739E', P: '#F4B6CF', t: '#C9B48A', b: '#B8BEC2', B: '#8E969B' }, { snowRow: 0 });

const SCRATCHER = pic([
  'ppppppp..',
  '.PPPPP...',
  '..rRr....',
  '..RrR....',
  '..rRr....',
  '..RrR....',
  '..rRr....',
  '..RrR.yy.',
  '..rRryYyy',
  '.ppppp.yy',
  'PPPPPPP..',
], { p: '#A1774F', P: '#7B5A3A', r: '#D9C08A', R: '#B89A5E', y: '#E05A7A', Y: '#F58FA6' }, { snowRow: 0 });

const FOSSIL = pic([
  '...b.b.b.......',
  '..b.b.b.b...bb.',
  '.b..b.b..b.bBBb',
  '.b..b.b..bbbBkb',
  '.b..b.b..b.bbbb',
  'mmmmmmmmmmmmmm.',
  'mMmmmmMmmmmmMmm',
], { b: '#EDE6D0', B: '#D4CCB0', k: '#3A3A3A', m: '#9C7E58', M: '#7D6243' }, { snowRow: 5 });

const COOP = pic([
  '.....rrr.....',
  '...rrrrrrr...',
  '.rrrrRrrrrrr.',
  'rrrrrrrrrrrrr',
  '.wwwwwwwwwww.',
  '.wWWwwwwwddw.',
  '.wWWwwwwwddw.',
  '.wwwwwwwwddw.',
  '.wwwwwwwwddw..',
  '..l.......lyy',
  '..l.......l.y',
].map(r => r.padEnd(13, '.').slice(0, 13)), { r: '#B5533C', R: '#D27A5F', w: '#F5E6C8', W: '#FFE9A8', d: '#8E3F2D', l: '#7B5A3A', y: '#E3C565' }, { glow: 'W', snowRow: 1 });

const CACTUS = pic([
  '....g....',
  '...gGg...',
  '.g.gGg...',
  'gG.gGg.g.',
  'gGggGg.gG',
  '.gGgGggGg',
  '...gGgGg.',
  '...gGg...',
  '...gGg...',
  '.sssssss.',
  'sSsssssSs',
], { g: '#3F8A4A', G: '#6CB46A', s: '#E9C98A', S: '#C9A35E' }, { snowRow: 0 });

const GREENHOUSE = pic([
  '......f......',
  '.....fGf.....',
  '....fgGgf....',
  '...fggGggf...',
  '..fgggGgggf..',
  '.fffffffffff.',
  '.fgGgfgGgfgf.',
  '.fgpgfppgfpf.',
  '.fpppfpppfpf.',
  '.fffffffffff.',
  '.bbbbbbbbbbb.',
], { f: '#F2F2EE', g: '#BFE3F7', G: '#E8F6FD', p: '#3F9B4A', b: '#8C7A66' }, { snowRow: 1 });

const IGLOO = pic([
  '....iiiii....',
  '..iiIiiiIii..',
  '.iIiiiiiiiIi.',
  'iiiiIiiiIiiii',
  'iIiiiddddiiIi',
  'iiiiddddddiii',
  'IIIIddddddIII',
], { i: '#EAF4FB', I: '#B9D2E4', d: '#3E5566' });

const TURTLE = pic([
  '...ggggg....',
  '..gGgGgGg...',
  '.gGgGgGgGg..',
  '.gggggggggh.',
  'ttttttttthhh',
  '.ll....ll...',
  'bbbbbbbbbbbb',
], { g: '#9AA4A8', G: '#C4CBCE', t: '#7A8488', h: '#B8BEC2', l: '#7A8488', b: '#6E777B' }, { snowRow: 0 });

const CHEESE = pic([
  '......yy',
  '....yyyy',
  '..yyoyyy',
  'yyyyyyoy',
  'YyoyyyyY',
  'YYYYYYYY',
  'bbbbbbbb',
].map(r => `.${r}.`), { y: '#F7CC3B', Y: '#D9A520', o: '#C98E1A', b: '#A1774F' }, { snowRow: 0 });

const SADDLE = pic([
  '..hh.......',
  '..hssssss..',
  '.sSSSSSSSs.',
  '.sSsssssSs.',
  '..s.....s..',
  'ppppppppppp',
  '.p.......p.',
  '.p.......p.',
  'p.p.....p.p',
], { h: '#5A3420', s: '#8B4A2B', S: '#B06A3E', p: '#A1774F' }, { snowRow: 1 });

const WIZARD = pic([
  '....h....',
  '....h....',
  '...hyh...',
  '...hhh...',
  '..hhhyh..',
  '..hhhhh..',
  '.hyhhhhh.',
  'bbbbbbbbb',
  '.tTtttTt.',
  '.ttwwttt.',
  '.tTwwtTt.',
  'TTTTTTTTT',
], { h: '#2E4A8A', y: '#FFC400', b: '#22386A', t: '#8A5A33', T: '#6B4325', w: '#FFE9A8' }, { glow: 'yw', snowRow: 7 });

const RED_LANTERN = pic([
  'ppppppp.',
  'p.....y.',
  'p....rrr',
  'p...rRrRr',
  'p...rRrRr',
  'p...rRrRr',
  'p....rrr',
  'p.....y.',
  'p.....y.',
  'p........',
  'p........',
  'p........',
  'pp.......',
].map(r => r.padEnd(9, '.').slice(0, 9)), { p: '#3A2E22', r: '#D7263D', R: '#F25C54', y: '#FFC400' }, { glow: 'rRy' });

const BONE = pic([
  'bb.....bb',
  'bBbbbbbBb',
  'bbbbbbbbB',
  'bb.....bb',
], { b: '#F2ECDA', B: '#D4CCB0' }, { snowRow: 0 });

const PLINTH = { P: '#9AA4A8', p: '#7A8488' };

const BEAST = pic([
  '..s...s..',
  '..ss.ss..',
  '..sssss..',
  '..sksks..',
  '...sSs...',
  '..sssss.s',
  '..ssssss.',
  '..sssss..',
  '.PPPPPPP.',
  '.PpppppP.',
  'PPPPPPPPP',
], { s: '#D9DEE0', S: '#B8BEC2', k: '#8E969B', ...PLINTH });

const MOUNT = pic([
  '....bb...',
  '...bbbb..',
  '..bbbBbb.',
  '.bbbbbbb.',
  'bbb.bbbb.',
  'bb..bbbb.',
  '...bbbbb.',
  '...bbbbb.',
  '..bbbbbbb',
  '.PPPPPPP.',
  '.PpppppP.',
  'PPPPPPPPP',
], { b: '#B87333', B: '#E0A060', ...PLINTH });

const CUP = pic([
  'y.yyyyy.y',
  'yyYYYYYyy',
  'y.yYYYy.y',
  '..yyyyy..',
  '...yyy...',
  '....y....',
  '...yyy...',
  '..yyyyy..',
  '.PPPPPPP.',
  '.PpppppP.',
  'PPPPPPPPP',
], { y: '#E8B23A', Y: '#FFD86B', ...PLINTH }, { glow: 'Y' });

/** One trophy: Habitica's achievement key, what we call the prop, and where it stands (x a share of the
 * open ground left of the stable, y a share of the ground band, as for props). */
export interface Trophy { key: string, prop: string, x: number, y: number, art: Art, accent: string }

/** the species sets (and Bone to Pick) */
export const SET_TROPHIES: Trophy[] = [
  { key: 'legendaryBestiary', prop: 'a stone arch', x: 0.5, y: 0.62, art: ARCH, accent: '#B8BEC2' },
  { key: 'birdsOfAFeather', prop: 'a birdhouse', x: 0.3, y: 0.14, art: BIRDHOUSE, accent: '#4F7FA8' },
  { key: 'bonelessBoss', prop: 'a shell sculpture', x: 0.36, y: 0.97, art: SHELL, accent: '#D9739E' },
  { key: 'cats', prop: 'a scratching post', x: 0.3, y: 0.44, art: SCRATCHER, accent: '#E05A7A' },
  { key: 'dinosaurDynasty', prop: 'a dinosaur fossil', x: 0.5, y: 0.25, art: FOSSIL, accent: '#EDE6D0' },
  { key: 'domesticated', prop: 'a hen house', x: 0.7, y: 0.44, art: COOP, accent: '#B5533C' },
  { key: 'duneBuddy', prop: 'a desert cactus', x: 0.28, y: 0.64, art: CACTUS, accent: '#3F8A4A' },
  { key: 'plantParent', prop: 'a greenhouse', x: 0.5, y: 0.46, art: GREENHOUSE, accent: '#BFE3F7' },
  { key: 'polarPro', prop: 'an igloo', x: 0.72, y: 0.6, art: IGLOO, accent: '#EAF4FB' },
  { key: 'reptacularRumble', prop: 'a turtle statue', x: 0.78, y: 0.76, art: TURTLE, accent: '#9AA4A8' },
  { key: 'rodentRuler', prop: 'a wedge of cheese', x: 0.62, y: 0.72, art: CHEESE, accent: '#F7CC3B' },
  { key: 'roughRider', prop: 'a saddle on its rack', x: 0.82, y: 0.98, art: SADDLE, accent: '#8B4A2B' },
  { key: 'woodlandWizard', prop: 'a wizard’s stump', x: 0.58, y: 0.97, art: WIZARD, accent: '#2E4A8A' },
  { key: 'zodiacZookeeper', prop: 'a red lantern', x: 0.2, y: 0.38, art: RED_LANTERN, accent: '#D7263D' },
  { key: 'boneToPick', prop: 'a big bone', x: 0.08, y: 0.88, art: BONE, accent: '#F2ECDA' },
];

/** Beast Master, Mount Master and Triad Bingo: statues in front of the stable */
export const MASTER_TROPHIES: Trophy[] = [
  { key: 'beastMaster', prop: 'the Beast Master statue', x: 0, y: 0.2, art: BEAST, accent: '#D9DEE0' },
  { key: 'mountMaster', prop: 'the Mount Master statue', x: 0, y: 0.2, art: MOUNT, accent: '#B87333' },
  { key: 'triadBingo', prop: 'the Triad Bingo cup', x: 0, y: 0.2, art: CUP, accent: '#E8B23A' },
];

/** every achievement key that brings something */
export const TROPHY_KEYS: string[] = [
  // no flatMap or fromEntries at a module's top level: a shared chunk runs before src/app/polyfills.ts (Chrome 66)
  ...COLOURS.reduce<string[]>((a, c) => a.concat([c[1], c[2]]), []), ...SET_TROPHIES.map(t => t.key), ...MASTER_TROPHIES.map(t => t.key),
];

/** where a trophy (or its signpost) stands on the picture, art pixels, for a tap */
export interface TrophySpot { key: string, sign: boolean, x0: number, y0: number, x1: number, y1: number }

/** a box in art pixels, right and bottom edges excluded */
export interface Box { x0: number, y0: number, x1: number, y1: number }
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * The pennant line: two posts and a sagging line from x0 at ground row y, a pennant per colour achievement in
 * Habitica's order (short for the pets, a long swallowtail once the mounts are done too); a colour halfway to
 * its pets hangs furled. The line is as long as its pennants need, up to x1. Nothing until the first one.
 */
export function paintPennants (c: Paint, x0: number, x1: number, y: number, have: ReadonlySet<string>, half: ReadonlySet<string>, l: PropLook): TrophySpot[] {
  const flags = COLOURS.filter(k => have.has(k[1]) || have.has(k[2]) || half.has(k[1]));
  if (!flags.length) return [];
  x1 = Math.min(x1, x0 + 6 * (flags.length + 1) + 2);
  const T = l.T, post = T('#6B4F33'), line = T('#4E3A26');
  rect(c, x0, y - 12, 1, 13, post); rect(c, x1, y - 12, 1, 13, post);
  dot(c, x0, y - 13, T('#FFC400')); dot(c, x1, y - 13, T('#FFC400'));
  const span = x1 - x0, sag = (t: number) => Math.round(Math.min(4, span / 14) * Math.sin(Math.PI * t));
  for (let x = x0 + 1; x < x1; x++) dot(c, x, y - 12 + sag((x - x0) / span), line);
  const step = span / (flags.length + 1), spots: TrophySpot[] = [];
  flags.forEach(([, pet, mount, a, b], i) => {
    const px = Math.round(x0 + step * (i + 1)) - 1, top = y - 11 + sag((px + 1 - x0) / span);
    const A = T(a), B = T(b);
    if (have.has(mount)) {
      // a swallowtail: 3 wide, 6 long, notched
      rect(c, px, top, 3, 4, A); rect(c, px + 2, top, 1, 4, B);
      dot(c, px, top + 4, A); dot(c, px + 2, top + 4, B); dot(c, px, top + 5, A); dot(c, px + 2, top + 5, B);
      spots.push({ key: mount, sign: false, x0: px - 1, y0: top - 1, x1: px + 4, y1: top + 7 });
    } else if (have.has(pet)) {
      rect(c, px, top, 3, 2, A); dot(c, px + 1, top + 2, A); dot(c, px + 2, top, B); dot(c, px + 2, top + 1, B);
      spots.push({ key: pet, sign: false, x0: px - 1, y0: top - 1, x1: px + 4, y1: top + 4 });
    } else {
      // furled: rolled up on its hook until the colour's pets are all hatched
      rect(c, px + 1, top, 1, 3, A); dot(c, px + 1, top, B);
      spots.push({ key: pet, sign: true, x0: px - 1, y0: top - 1, x1: px + 4, y1: top + 4 });
    }
  });
  return spots;
}

/** where the pennant line may run, clear of the masters' statues (the line is 48 wide or more, so ten fit) */
export function pennantSpan (W: number): [number, number] {
  const x1 = Math.min(Math.round(W * 0.62), W - 62);
  return [Math.min(Math.round(W * 0.3), x1 - 48), x1];
}

/** The signpost on a trophy's spot once it is halfway there: a little board with the trophy's own colour. */
export function paintSign (c: Paint, x: number, y: number, accent: string, l: PropLook) {
  const T = l.T, wood = T('#A1774F'), dark = T('#6B4F33');
  rect(c, x, y - 4, 1, 5, dark);
  rect(c, x - 3, y - 9, 7, 5, dark); rect(c, x - 2, y - 8, 5, 3, wood);
  rect(c, x - 1, y - 7, 3, 1, T(accent));
  if (l.snow) rect(c, x - 3, y - 10, 7, 1, T('#F2F6FA'));
}
export const SIGN = { w: 7, h: 10 };

/** The ground a scene gives the trophies: art-pixel rows and where its own things already stand. */
export interface TrophyGround {
  W: number;
  /** the horizon row, and the last row creatures walk on */
  horizon: number;
  bottom: number;
  /** a row in the ground band, t from 0 (horizon) to 1 */
  band (t: number): number;
  /** what trophies must not stand on or behind: the scene's props, water, the trees' places, the stable */
  taken: Box[];
}

/**
 * Where each species-set trophy stands: its own spot, or the nearest free one around it. Every trophy gets a
 * place whether earned or not, in a fixed order, so a trophy never moves when another one arrives.
 */
export function placeTrophies (g: TrophyGround): Map<string, { x: number, y: number }> {
  // trophies are painted last, so one standing in front of a scene thing may cover it; only its foot must
  // stay off the thing (or it would stand in the pond, or cover a tree it is behind). Trophies keep apart.
  const out = new Map<string, { x: number, y: number }>(), placed: Box[] = [];
  // near the trophy's own spot first, then anywhere on the ground, nearest first
  const tries: [number, number][] = [];
  for (let dx = -1; dx <= 1.001; dx += 0.02) for (let dy = -1; dy <= 1.001; dy += 0.035) tries.push([dx, dy]);
  tries.sort((a, b) => Math.hypot(a[0], a[1] * 1.4) - Math.hypot(b[0], b[1] * 1.4));
  const top = g.horizon + 8;
  for (const t of SET_TROPHIES) {
    const w = Math.max(t.art.w, SIGN.w), h = Math.max(t.art.h, SIGN.h);
    const at = (fx: number, fy: number) => {
      const x = Math.round(4 + fx * (g.W - 48)), y = g.band(fy);
      return { x, y, box: { x0: x - Math.ceil(w / 2) - 1, y0: y - h - 1, x1: x + Math.ceil(w / 2) + 1, y1: y + 2 } };
    };
    // a narrow ground with every set can run out of room: then it may stand by a scene thing, never on a trophy
    const find = (clearOfScene: boolean) => tries.map(([dx, dy]) => [t.x + dx, t.y + dy]).filter(([fx, fy]) => fx >= 0 && fx <= 1 && fy >= 0 && fy <= 1)
      .map(([fx, fy]) => at(fx, fy)).find(p => {
        if (p.box.x0 < 1 || p.box.x1 > g.W - 1 || p.box.y0 < top || p.y > g.bottom) return false;
        const foot = { x0: p.box.x0, y0: p.y - 1, x1: p.box.x1, y1: p.y + 2 };
        return !(clearOfScene && g.taken.some(b => hits(b, foot))) && !placed.some(b => hits(b, p.box));
      });
    const best = find(true) ?? find(false) ?? at(t.x, t.y);
    out.set(t.key, { x: best.x, y: best.y });
    placed.push(best.box);
  }
  return out;
}

/**
 * Every trophy the account has, and a signpost for each halfway there: the pennant line, the species-set
 * props where placeTrophies puts them, the masters' statues in front of the stable. Returns where each is.
 */
export function paintTrophies (c: Paint, g: TrophyGround, have: ReadonlySet<string>, half: ReadonlySet<string>, l: PropLook): TrophySpot[] {
  const [px0, px1] = pennantSpan(g.W), spots = paintPennants(c, px0, px1, g.horizon + 5, have, half, l);
  MASTER_TROPHIES.forEach((t, i) => {
    const x = g.W - 54 + i * 12, y = g.horizon + 5;
    if (have.has(t.key)) { t.art.paint(c, x, y, l); spots.push(spotOf(t.key, false, x, y, t.art)); }
    else if (half.has(t.key)) { paintSign(c, x, y, t.accent, l); spots.push(spotOf(t.key, true, x, y, SIGN)); }
  });
  const at = placeTrophies(g);
  // back to front, so a nearer one overlaps a farther one
  const set = SET_TROPHIES.filter(t => have.has(t.key) || half.has(t.key)).sort((a, b) => at.get(a.key)!.y - at.get(b.key)!.y);
  for (const t of set) {
    const { x, y } = at.get(t.key)!;
    if (have.has(t.key)) { t.art.paint(c, x, y, l); spots.push(spotOf(t.key, false, x, y, t.art)); }
    else { paintSign(c, x, y, t.accent, l); spots.push(spotOf(t.key, true, x, y, SIGN)); }
  }
  return spots;
}

const spotOf = (key: string, sign: boolean, x: number, y: number, a: { w: number, h: number }): TrophySpot =>
  ({ key, sign, x0: x - Math.ceil(a.w / 2) - 1, y0: y - a.h - 1, x1: x + Math.ceil(a.w / 2) + 1, y1: y + 2 });

/** what each trophy is, for a tap: our prop's words */
export const PROP_OF: Record<string, string> = {};
for (const t of [...SET_TROPHIES, ...MASTER_TROPHIES]) PROP_OF[t.key] = t.prop;
for (const [potion, pet, mount] of COLOURS) {
  const name = potion.replace(/([a-z])([A-Z])/g, '$1 $2');
  PROP_OF[pet] = `a ${name} pennant`;
  PROP_OF[mount] = `a ${name} swallowtail pennant`;
}
