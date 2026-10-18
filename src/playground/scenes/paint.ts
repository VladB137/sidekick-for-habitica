/* One scene, painted once into a still picture: sky, the horizon that makes the scene (hills, a lake, the
 * sea, peaks, bamboo mist, glowing caps), the ground, its props, and everything the account has grown
 * (forest, flowers, water, the stable). In art pixels; seeded per scene, so the same numbers paint the same
 * picture on every phone. Pure: give it anything with fillStyle and fillRect. */
import { Rng } from '../rng';
import { NATURE, SCENES, toner, type Light, type SceneId } from './palettes';
import { AMANITA, TREES, treeline, type TreeLook } from './trees';
import { paintHouse, STABLE_STAGES } from './house';
import { PROPS } from './props';
import { paintFeastGround, paintFeastSky, usesYard, yardOf, type Feast, type FeastPlace } from './feasts';
import { paintTrophies, pennantSpan, type Box, type TrophySpot } from './trophies';
import { disc, dither, ditherOval, dot, mix, oval, rect, type Paint, type Rand } from './pixels';
import type { MoonPhase } from './clock';
import type { SpotKind } from '../behaviours/types';

/** The account numbers the scene grows from (stage 3 reads them from Habitica; here they are just inputs). */
export interface Growth {
  /** days checked in (loginIncentives): a tree every 5, up to 9, each growing for 30 days; a giant at 100 */
  checkIns: number;
  /** achievements.perfect: a flower patch each, up to 30 */
  perfectDays: number;
  /** the longest Daily streak, in days (a streak achievement counts as 21): 3 stepping stones, 7 a pond,
   * 14 a bridge, 21 a waterfall */
  streakDays: number;
  /** 1 fence, 5 shelter, 10 building, 15 banner, 20 hall */
  level: number;
  /** different quests finished: plaques on the stable wall */
  quests: number;
  /** Habitica's collection achievements earned (trophies.ts keys): a trophy each */
  trophies?: readonly string[];
  /** the ones halfway there: a signpost (a furled pennant for a colour) where the trophy will stand */
  signs?: readonly string[];
}

export const NO_GROWTH: Growth = { checkIns: 0, perfectDays: 0, streakDays: 0, level: 1, quests: 0 };

export interface SceneOptions extends Light {
  scene: SceneId;
  growth: Growth;
  /** 'paint' (default): every tree in the one picture (thumbnails, still frames); 'return': trees on the
   * walking ground are left out and listed in the layout instead */
  standing?: 'paint' | 'return';
  /** the moon's shape tonight (clock.ts moonPhase); the night sky shows it. Left out: a waxing crescent */
  moon?: MoonPhase;
  /** seen from south of the equator: the lit side is mirrored */
  southern?: boolean;
  /** called once the sky is painted (sun, moon, stars and clouds included), before anything stands in it */
  afterSky?: () => void;
  /** called as the painting starts on something a tap opens (the stable, the trophies and signposts) and with null
   * once it is done, so the playground can tell their pixels apart (play/hint.ts) */
  part?: (part: 'house' | 'trophies' | null) => void;
  /** Habitica's feast days and the account's anniversary on today (feasts.ts) */
  feasts?: readonly Feast[];
  /** years in Habitica, for the anniversary's cake and sign */
  years?: number;
}

/** a tree of the account's forest: its foot (art pixels), drawn size and seed */
export interface StandingTree { x: number, y: number, size: number, seed: number }

/** where the forest grows, in planting order: [x as a share of the open ground, row]; row 0 is the horizon,
 * a fraction is a place down the meadow, and x below 0 or above 1 hugs the left or right edge */
const TREE_SLOTS: [x: number, row: number][] = [[0.1, 0], [0.4, 0], [-1, 0.3], [0.66, 0], [2, 0.42], [0.24, 0], [-1, 0.72], [0.52, 0], [2, 0.86]];

/** One tree with its soft shadow, as paintScene draws it. */
export function paintTree (c: Paint, t: StandingTree, o: SceneOptions, look: TreeLook) {
  const P = SCENES[o.scene];
  ditherOval(c, t.x + 1, t.y + 1, Math.round(3 + t.size * 5), 1, toner(o)(P.shadow), 2);
  const tr = new Rng(`tree:${o.scene}:${t.seed}`);
  TREES[P.tree](c, t.x, t.y, t.size, () => tr.next(), look);
}

/** how a scene's trees look in this light */
export const treeLook = (o: SceneOptions): TreeLook => ({ T: toner(o), night: o.tod === 'night', snow: o.season === 'winter', autumn: o.season === 'autumn' });

/** The painted area (art pixels) and how much of it the app's bars cover. */
export interface Frame { W: number, H: number, top: number, bottom: number }

/** Where things are, in art pixels. */
export interface SceneLayout {
  /** the ground starts here */
  horizon: number;
  /** creatures' feet stay between these rows (inside the bars) and columns */
  walk: { top: number, bottom: number, left: number, right: number };
  /** trees that stand on the walking ground, left out of the picture so the layer can sort them among the
   * creatures (only with standing: 'return') */
  standing: StandingTree[];
  /** the stable's door: where pets gather at dusk */
  door: { x: number, y: number };
  /** the stable building, from the fence to the roof (a tap there goes into the barn) */
  house: Box;
  /** where each grown thing is (the newest tree, a flower patch, the water, the stable), for its sparkle */
  marks: Record<GrowthMark, { x: number, y: number }>;
  /** the foot of the lantern post beside the stable, lit after a level-up (spec §08) */
  lantern: { x: number, y: number };
  /** the places creatures' natures go to (behaviours/types.ts Spot), art pixels: (x, y) where one stands */
  spots: ArtSpot[];
  /** where each trophy and signpost stands, for a tap */
  trophies: TrophySpot[];
  /** where the scene's own small life can be (ambient.ts) */
  life: LifeSpots;
}

/** a place, art pixels (SceneLayer.spots turns it into world pixels) */
export interface ArtSpot { kind: SpotKind, x: number, y: number, w: number, h: number, strip?: boolean, pond?: boolean }

/** Places for the scenery's critters, art pixels: boxes are top-left plus size. */
export interface LifeSpots {
  /** the painted sky's first row (below the top bar) and the horizon */
  skyTop: number;
  /** open water a fish may ring: the lake or the sea in front of the scenery, the pond in the middle */
  water: { x: number, y: number, w: number, h: number } | null;
  pond: { x: number, y: number, w: number, h: number } | null;
  /** the marsh's pools: centre and half-width, and whether a lily pad floats on it */
  pools: { x: number, y: number, rx: number, pad: boolean }[];
  /** the stretch of the fence's top rail a bird can sit on (left x from, to), and the rail's row */
  rail: { from: number, to: number, y: number } | null;
}

export type GrowthMark = 'forest' | 'flowers' | 'water' | 'stable' | 'trophies';

/* Vlad, 15 Oct: growth more lenient and in smaller steps (was a tree every 30 days growing for 240, a giant at
 * 365, a patch per 3 Perfect Days, streak achievements 1 to 4 for the water) */
export const TREE_EVERY = 5, MAX_TREES = 9, TREE_GROWS = 30, GIANT_AT = 100;
/** how much bigger the account's trees are drawn than the spec's mockup (Vlad, 14 Oct: bigger forests) */
export const TREE_SIZE = 1.4;
export const PATCH_EVERY = 1, MAX_PATCHES = 30;
/** Daily streak days for stepping stones, a pond, a bridge over it and a waterfall */
export const WATER_AT = [3, 7, 14, 21] as const;
/** a streak achievement is a Daily done 21 days in a row (Habitica's scoreTask), so any one is the whole water */
export const STREAK_ACHIEVEMENT_DAYS = 21;

export const treeCount = (days: number) => Math.min(MAX_TREES, 1 + Math.floor(Math.max(0, days) / TREE_EVERY));
export const patchCount = (perfect: number) => Math.min(MAX_PATCHES, Math.floor(Math.max(0, perfect) / PATCH_EVERY));
/** 0 nothing, 1 stepping stones, 2 a pond, 3 a bridge, 4 a waterfall */
export const waterStage = (days: number) => WATER_AT.filter(at => days >= at).length;
/** The pond's half-width and half-height in art pixels: 24 x 6 (49 x 13) on a phone and wider, so a median pet
 * (19 x 18) sits in it with water on both sides (Vlad, 15 Oct: bigger, for pets, not for mounts); smaller
 * pictures (the 96-wide thumbnails) keep it to the same share of the width. */
export const pondSize = (W: number) => {
  const rx = Math.max(12, Math.min(24, Math.round(W * 0.15)));
  return { rx, ry: Math.round(rx / 4) };
};

const MOON = '#F3F0D8', MOON_SHADE = '#D9D3B4';

/**
 * The moon in one of its eight shapes, radius 4 art pixels. Row by row, the lit part runs from one limb to the
 * terminator, an ellipse whose half-width is the row's half-width times cos(phase); waxing is lit on the right
 * (on the left south of the equator). The unlit part is the sky with a little earthshine, so a new moon is a
 * faint disc. A nearly full moon has a soft ring of glow; behind the marsh's clouds it is dimmed, in a haze.
 */
export function paintMoon (c: Paint, cx: number, cy: number, phase: MoonPhase, southern: boolean, sky: string, hazy = false) {
  const r = 4, a = phase / 8, lit = hazy ? mix(MOON, sky, 0.35) : MOON;
  // a solid ring of glow, not dithered (dots around the moon read as sparkles at the phone's scale)
  if (hazy) disc(c, cx, cy, r + 2, mix(sky, MOON, 0.22));
  else if (phase >= 3 && phase <= 5) disc(c, cx, cy, r + 2, mix(sky, MOON, 0.12));
  const dark = mix(sky, MOON, 0.14), k = Math.cos(2 * Math.PI * a);
  c.fillStyle = dark;
  for (let y = -r; y <= r; y++) {
    const q = r * r + r * 0.6 - y * y;
    if (q < 0) continue;
    const half = Math.floor(Math.sqrt(q));
    for (let x = -half; x <= half; x++) {
      // the pixel's centre against the terminator, in the row's own width (so every row has the same shape)
      const u = x / (half + 0.5);
      const lx = southern ? -u : u;
      const on = a <= 0.5 ? lx > k : lx < -k;
      // the lit side's limb a shade darker at the edge, for roundness
      c.fillStyle = !on ? dark : (Math.abs(x) === half && Math.abs(y) < r - 1 ? mix(lit, MOON_SHADE, 0.6) : lit);
      c.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1);
    }
  }
}

/** The stretches of the lake or the sea a swimmer can be in, art pixels: the whole band less what is painted in
 * front of it, the jetty, a boat on the water and the stable (the trees along its shore stand among the creatures,
 * so they hide a swimmer behind them). */
function openWater (W: number, strip: { y: number, h: number, jetty?: number }, stable: number, boats: readonly number[]) {
  const shut: [number, number][] = [[stable - 2, W]];
  if (strip.jetty !== undefined) shut.push([strip.jetty - 1, strip.jetty + 22]);
  for (const b of boats) shut.push([b - 10, b + 10]);
  shut.sort((a, b) => a[0] - b[0]);
  const out: { x: number, y: number, w: number, h: number }[] = [];
  let from = 0;
  for (const [a, b] of shut) {
    if (a - from >= 8) out.push({ x: Math.round((from + a - 1) / 2), y: strip.y, w: a - from, h: strip.h });
    from = Math.max(from, b + 1);
  }
  return out;
}

/** Pine hill's winter nights are clear, with the northern lights over the peaks (and no snow falling). */
export const aurora = (o: { scene: SceneId, tod: string, season: string }) => o.scene === 'pine' && o.tod === 'night' && o.season === 'winter';

const AURORA = '#7CFFB2', AURORA_TOP = '#D27BFF';

/**
 * The northern lights, left of the moon: a wavy curtain of green rays, its hem the brightest, thinning upward
 * on the dither pattern (the stars show through) to a violet fringe. The peaks stand in front of its lowest
 * folds. Painted into the sky, so it holds still like the stars.
 */
export function paintAurora (c: Paint, W: number, top: number, gT: number, sky: string) {
  const span = gT - top, x0 = Math.round(W * 0.05), x1 = Math.round(W * 0.66);
  const hem = mix(sky, AURORA, 0.75), body = mix(sky, AURORA, 0.5), fringe = mix(sky, AURORA_TOP, 0.5);
  for (let x = x0; x < x1; x++) {
    // the curtain's height changes slowly, its brightness from ray to ray; it thins out at both ends
    const end = Math.min(1, Math.min(x - x0 + 1, x1 - x) / 14);
    const b = Math.max(0, Math.min(1, 0.6 + 0.25 * Math.sin(x / 3.1 + 1) + 0.15 * Math.sin(x / 1.7))) * end;
    const base = top + Math.round(span * 0.46 + Math.sin(x / 23) * span * 0.07 + Math.sin(x / 7.3) * 1.2);
    const h = Math.round((span * (0.13 + 0.05 * Math.sin(x / 11 + 1) + 0.025 * Math.sin(x / 4.3)) + Math.sin(x * 1.7) * 1.5) * end);
    for (let j = 0; j < h; j++) {
      const y = base - j, u = j / h;
      if (j < 2) { if (b > 0.35) dot(c, x, y, hem); else dither(c, x, y, 1, 1, hem, 2); }
      else if (u < 0.45) dither(c, x, y, 1, 1, body, b > 0.55 ? 3 : 2);
      else if (u < 0.75) dither(c, x, y, 1, 1, body, b > 0.55 ? 2 : 1);
      else dither(c, x, y, 1, 1, fringe, 1);
    }
  }
}

export function paintScene (c: Paint, f: Frame, o: SceneOptions): SceneLayout {
  const P = SCENES[o.scene], T = toner(o), g = o.growth;
  const { W, H } = f;
  // the part between the bars is what the scene is composed for; sky and ground run on under the bars
  const top = Math.max(0, Math.min(f.top, H - 20)), B = Math.max(top + 20, H - Math.max(0, f.bottom));
  const gT = top + Math.round((B - top) * 0.58);
  const night = o.tod === 'night', snow = o.season === 'winter';
  const rng = new Rng(`scene:${o.scene}`), R: Rand = () => rng.next();
  const look = treeLook(o);
  let seaBox: LifeSpots['water'] = null;

  // ---- sky
  rect(c, 0, 0, W, H, T(P.sky[0]));
  const b1 = top + Math.round((gT - top) * 0.3), b2 = top + Math.round((gT - top) * 0.55);
  rect(c, 0, b1, W, b2 - b1, T(P.sky[1])); rect(c, 0, b2, W, gT - b2, T(P.sky[2]));
  // dithered seams between the bands instead of hard steps
  for (const [y, up, lo] of [[b1, P.sky[0], P.sky[1]], [b2, P.sky[1], P.sky[2]]] as const) {
    dither(c, 0, y - 2, W, 1, T(lo), 1); dither(c, 0, y - 1, W, 1, T(lo), 2); dither(c, 0, y, W, 1, T(up), 1);
  }
  const skyY = (t: number) => top + Math.round((gT - top) * t);
  if (night || o.scene === 'mushroom') {
    const mx = Math.round(W * 0.8), my = skyY(0.16);
    for (let i = 0; i < 46 * Math.max(1, W / 160); i++) {
      const x = R() * W, y = top + R() * (gT - top) * 0.7, col = R() < 0.3 ? '#FFF6C8' : '#C9D3FF';
      // none right beside the moon, where a star reads as a sparkle on it
      if (Math.abs(x - mx) > 8 || Math.abs(y - my) > 8) dot(c, x, y, col);
    }
    paintMoon(c, mx, my, o.moon ?? 1, !!o.southern, T(P.sky[0]), o.scene === 'marsh');
    if (aurora(o)) paintAurora(c, W, top, gT, T(P.sky[0]));
  } else if (o.scene === 'marsh') { /* overcast: no sun */ }
  else if (o.tod === 'dawn') { disc(c, Math.round(W * 0.14), skyY(0.62), 5, '#FFCB6B'); disc(c, Math.round(W * 0.14), skyY(0.62), 3, '#FFE29A'); }
  else {
    const sun = o.scene === 'bamboo' ? '#FFF1C2' : '#FFE27A';
    ditherOval(c, Math.round(W * 0.14), skyY(0.18), 7, 7, T(mix(sun, P.sky[0], 0.45)), 1);
    disc(c, Math.round(W * 0.14), skyY(0.18), 4, sun); disc(c, Math.round(W * 0.14) - 1, skyY(0.18) - 1, 2, '#FFF6D0');
  }
  if (!night && o.scene !== 'mushroom' && o.scene !== 'bamboo') for (const [fx, fy] of [[0.42, 0.18], [0.7, 0.1]]) {
    const cx = Math.round(W * fx), cy = skyY(fy) + 4, cl = T(o.scene === 'marsh' ? '#C9D2CD' : '#F4FBFF'), sh = T(o.scene === 'marsh' ? '#AEB9B3' : mix('#F4FBFF', P.sky[1], 0.5));
    // flat-bottomed pixel clouds with a shaded base
    disc(c, cx, cy - 1, 3, cl); disc(c, cx + 5, cy, 2, cl); disc(c, cx - 4, cy, 2, cl);
    rect(c, cx - 7, cy + 1, 15, 1, cl); rect(c, cx - 6, cy + 2, 13, 1, sh);
  }
  const feasts = o.feasts ?? [];
  const place = (x0: number): FeastPlace => ({ W, gT, top, x0, fence: P.house !== 'shroom', T, night, dusk: o.tod === 'dusk', snow, years: o.years });
  if (feasts.length) paintFeastSky(c, feasts, place(W - 36));
  o.afterSky?.();

  // ---- the horizon: what makes each scene its own
  if (o.scene === 'pine') for (const [mx, mh, mw] of [[0.25, 0.62, 30], [0.6, 0.82, 42], [0.92, 0.55, 26]]) {
    const px = Math.round(W * mx), pk = gT - Math.round((gT - top) * mh * 0.6);
    for (let y = pk; y < gT; y++) {
      const hw = Math.round((y - pk) * mw / (gT - pk));
      rect(c, px - hw, y, hw * 2 + 1, 1, T(y - pk < 6 ? '#F0F4F8' : '#8C9BB0'));
      if (hw > 2) rect(c, px - hw, y, Math.max(1, hw - 2), 1, T(y - pk < 6 ? '#DCE4EC' : '#7A8AA0'));
    }
  }
  if (o.scene === 'bamboo') {
    for (let x = 0; x < W; x += 3 + ((R() * 3) | 0)) { const h = 20 + R() * ((gT - top) * 0.6); rect(c, x, gT - h, 1, h, T(R() < 0.5 ? '#B4D9BB' : '#A2CCAA')); }
    rect(c, 0, skyY(0.62), W, 2, T('#ECF7EE')); rect(c, 0, skyY(0.78), W, 1, T('#ECF7EE'));
  }
  const spots: ArtSpot[] = [];
  // the lake's or the sea's band of water (its places are cut where trees, the jetty or the stable stand in front)
  let strip: { y: number, h: number, jetty?: number } | null = null;
  if (o.scene === 'cove') {
    const wt = gT - 14, w = P.water!;
    strip = { y: gT - 7, h: 14 };
    rect(c, 0, wt, W, gT - wt + 3, T(w[0])); rect(c, 0, wt, W, 2, T(w[1]));
    seaBox = { x: 4, y: wt + 4, w: Math.round(W * 0.56) - 4, h: gT - wt - 5 };
    for (let i = 0; i < 30 * Math.max(1, W / 160); i++) rect(c, R() * W, wt + 3 + R() * (gT - wt - 2), 2 + R() * 3, 1, T(w[2]));
    // sea stacks
    for (const [sx, sh] of [[0.62, 12], [0.7, 7]]) {
      const x = Math.round(W * sx);
      rect(c, x, wt - sh, 5, sh + 2, T('#8C7A66')); rect(c, x + 3, wt - sh, 2, sh + 2, T('#6E5E4E')); rect(c, x, wt - sh, 5, 1, T('#F2F2F2'));
    }
  }
  if (o.scene === 'lake') {
    const wt = gT - 18, w = P.water!;
    strip = { y: gT - 9, h: 18, jetty: Math.round(W * 0.5) };
    rect(c, 0, wt - 4, W, 5, T(P.shore!));
    for (let x = 0; x < W; x += 2) rect(c, x, wt - 6 - ((R() * 4) | 0), 2, 3, T('#2F5A3B'));
    rect(c, 0, wt, W, gT - wt + 4, T(w[0])); rect(c, 0, wt, W, 2, T(w[1]));
    seaBox = { x: 4, y: wt + 4, w: Math.round(W * 0.5) - 8, h: gT - wt - 7 };
    for (let i = 0; i < 34 * Math.max(1, W / 160); i++) rect(c, R() * W, wt + 3 + R() * (gT - wt), 2 + R() * 4, 1, T(w[2]));
    // the jetty
    const jx = Math.round(W * 0.5);
    rect(c, jx, gT - 6, 22, 2, T(NATURE.wood)); for (let k = 0; k < 22; k += 5) rect(c, jx + k, gT - 4, 1, 4, T('#6B4F33'));
  }
  if (P.hill) {
    const amp = o.scene === 'marsh' ? 1 : o.scene === 'bamboo' ? 2 : 3;
    for (let x = 0; x < W; x++) {
      const y = Math.round(gT - 12 + Math.sin(x / 13) * amp + Math.sin(x / 5.3) * 1.2);
      rect(c, x, y, 1, gT - y + 1, T(snow && o.scene !== 'mushroom' ? NATURE.snow[1] : P.hill));
      const y2 = Math.round(gT - 5 + Math.sin(x / 9 + 2) * 2);
      rect(c, x, y2, 1, gT - y2 + 1, T(snow && o.scene !== 'mushroom' ? NATURE.snow[2] : P.hill2!));
    }
  }
  // the forest beyond: far trees of the scene's own kind, faded into the sky
  if (P.tree !== 'bamboo' && P.tree !== 'palm' && o.scene !== 'lake') {
    const leaf = o.scene === 'mushroom' ? AMANITA.cap : (look.autumn ? NATURE.autumn : NATURE.leaf)[3];
    const far = mix(leaf, P.sky[2], o.scene === 'mushroom' ? 0.5 : 0.42), farHi = mix(o.scene === 'mushroom' ? AMANITA.stem : NATURE.leaf[1], P.sky[2], 0.5);
    treeline(c, W, (P.hill ? gT - 4 : gT), P.tree, T(snow && o.scene !== 'mushroom' ? mix(far, '#FFFFFF', 0.3) : far), T(snow ? NATURE.snowCap : farHi), R);
    if (P.hill2) for (let x = 0; x < W; x++) { const y2 = Math.round(gT - 3 + Math.sin(x / 9 + 2) * 1.5); rect(c, x, y2, 1, gT - y2 + 1, T(snow && o.scene !== 'mushroom' ? NATURE.snow[2] : P.hill2)); }
  }
  // marsh mist
  if (o.scene === 'marsh') { rect(c, 0, gT - 14, W, 2, T('#C7D1CB')); rect(c, 0, gT - 9, W, 1, T('#C7D1CB')); }

  // ---- ground
  const ground = snow && o.scene !== 'cove' && o.scene !== 'mushroom' ? NATURE.snow : P.ground;
  rect(c, 0, gT, W, H - gT, T(ground[0]));
  // haze where the ground meets the horizon, then speckle and tufts (ripples on sand)
  const haze = T(mix(ground[0], P.sky[2], 0.45));
  rect(c, 0, gT, W, 1, haze); dither(c, 0, gT + 1, W, 1, haze, 2); dither(c, 0, gT + 2, W, 1, haze, 1);
  for (let i = 0; i < W * (H - gT) * 0.02; i++) {
    const x = R() * W, y = gT + 3 + R() * (H - gT);
    dot(c, x, y, T(ground[1])); if (R() < 0.4) dot(c, x, y - 1, T(ground[2]));
  }
  for (let i = 0; i < W * (H - gT) * 0.006; i++) {
    const x = Math.round(R() * W), y = Math.round(gT + 5 + R() * (H - gT));
    if (o.scene === 'cove' && !snow) { rect(c, x - 1, y, 4, 1, T(ground[2])); rect(c, x, y - 1, 2, 1, T(mix(ground[0], '#FFFFFF', 0.4))); continue; }
    dot(c, x - 1, y, T(ground[2])); dot(c, x + 1, y, T(ground[2])); dot(c, x, y - 1, T(ground[2])); dot(c, x, y - 2, T(snow ? '#FFFFFF' : mix(ground[0], '#FFFFFF', 0.25)));
  }
  const band = (t: number) => gT + Math.round((B - gT) * t);
  const wild: LifeSpots = { skyTop: top, water: null, pond: null, pools: [], rail: null };
  if (o.scene === 'marsh') for (let i = 0; i < 6; i++) {
    const px = 8 + R() * (W - 50), py = gT + 8 + R() * (B - gT - 14), rx = (6 + R() * 6) | 0;
    wild.pools.push({ x: Math.round(px), y: Math.round(py), rx, pad: i % 2 === 0 });
    const ry = 1 + ((R() * 2) | 0);
    oval(c, px, py, rx, ry, T(P.water![0])); rect(c, px - 2, py, 3, 1, T(P.water![2]));
    spots.push({ kind: 'water', x: Math.round(px), y: Math.round(py), w: rx * 2 + 1, h: ry * 2 + 1 });
    // a lily pad on some, big enough for a frog to sit on
    if (i % 2 === 0) {
      const lx = Math.round(px + rx - 5), ly = Math.round(py);
      oval(c, lx, ly, 3, 1, T('#6E9A4A')); dot(c, lx + 1, ly, T(P.water![0])); dot(c, lx - 2, ly - 1, T('#E8D8F0'));
      spots.push({ kind: 'lily', x: lx, y: ly, w: 7, h: 3 });
    }
  }
  if (o.scene === 'meadow' || o.scene === 'pine') for (let x = 0; x < W; x++) {
    const y = Math.round(band(0.62) + Math.sin(x / 11) * 3);
    rect(c, x, y, 1, 3, T(snow ? '#D3DEE8' : P.path));
  }
  if (o.scene === 'bamboo') for (let i = 0; i < 9; i++) {
    const sx = Math.round(i * (W - 40) / 9) + 4, sy = band(0.55) + (i % 2) * 2;
    oval(c, sx, sy, 3, 1, T('#B7B09A')); rect(c, sx - 2, sy, 5, 1, T('#9A937E'));
  }
  if (o.scene === 'mushroom') for (let x = 0; x < W; x++) rect(c, x, Math.round(band(0.6) + Math.sin(x / 9) * 4), 1, 2, T(P.path));
  if (o.scene === 'cove') for (let x = 0; x < W; x++) if (R() < 0.4) dot(c, x, gT + 1, T('#FFF6DA'));
  if (o.scene === 'lake') for (let x = 0; x < W; x += 3) if (R() < 0.5) {
    const h = (2 + R() * 4) | 0;
    rect(c, x, gT + 1 - h, 1, h, T('#4F8E3F')); dot(c, x, gT - h, T('#8C6B3E'));
  }
  if (o.scene === 'pine') for (let i = 0; i < 5; i++) {
    const rx = 6 + R() * (W - 50), ry = gT + 8 + R() * (B - gT - 14);
    oval(c, rx, ry, 3, 1, T(P.rock![2])); oval(c, rx, ry - 1, 2, 1, T(snow ? NATURE.snowCap : P.rock![0]));
    spots.push({ kind: 'rocks', x: Math.round(rx), y: Math.round(ry), w: 7, h: 3 });
  }

  // ---- water from the longest Daily streak: stepping stones, a pond, a bridge over it, a waterfall
  const st = waterStage(g.streakDays), wat = P.water ?? ['#2F6F9F', '#4E9AD0', '#BFE3F7'];
  const { rx: pw, ry: ph } = pondSize(W);
  // never closer than 4 art px to the left edge; the stepping stones lead off to its right
  const pondX = Math.max(Math.round(W * 0.22), pw + 4), pondY = band(0.82);
  const stonesX = Math.max(Math.round(W * 0.36), pondX + pw + 3);
  const marks = {} as SceneLayout['marks'];
  marks.water = st >= 4 ? { x: Math.round(W * 0.08) + 2, y: (P.hill ? gT - 13 : gT - 8) + 4 } : st === 1 ? { x: stonesX + 10, y: band(0.78) - 2 } : { x: pondX, y: pondY - ph };
  if (st >= 4) {
    // a waterfall off the hills (or a rock face where there are none), and a stream winding down into the pond
    const fx = Math.round(W * 0.08), fy = P.hill ? gT - 13 : gT - 8, foot = gT + 3, end = pondX - Math.round(pw * 0.75);
    const fall = T(snow ? '#CFE6F5' : '#7EC3EA'), foam = T('#E8F6FD');
    if (!P.hill) { rect(c, fx - 3, fy - 2, 10, foot - fy + 1, T('#7A8488')); rect(c, fx - 3, fy - 2, 10, 1, T('#9AA4A8')); rect(c, fx + 4, fy - 2, 3, foot - fy + 1, T('#5B6468')); }
    for (let y = foot; y <= pondY; y++) {
      const t = (y - foot) / Math.max(1, pondY - foot), x = Math.round(fx + 2 + (end - fx - 2) * t + Math.sin(y / 6) * 2);
      rect(c, x - 1, y, 3, 1, T(snow ? '#BFD6E6' : wat[1])); if (y % 4 === 0) dot(c, x, y, foam);
    }
    rect(c, fx, fy, 4, foot - fy, fall); rect(c, fx + 1, fy, 1, foot - fy, foam);
    oval(c, fx + 2, foot, 4, 1, foam);
  }
  if (st >= 2) {
    // a dark rim, deep water showing round the near edge, the shallows and two glints of sky
    const x = pondX, y = pondY;
    spots.push({ kind: 'water', x, y, w: 2 * pw + 1, h: 2 * ph + 1, pond: true });
    // its near bank, where a bear stands to fish
    spots.push({ kind: 'shore', x, y: y + ph + 2, w: 2 * pw - 8, h: 0 });
    if (!snow) wild.pond = { x: x - (pw - 7), y: y - ((ph - 1) >> 1), w: 2 * (pw - 7) + 1, h: ph - 1 };
    oval(c, x, y, pw, ph, T('#2A4A2A')); oval(c, x, y, pw - 1, ph - 1, T(snow ? '#BFD6E6' : wat[0]));
    oval(c, x, y - 1, pw - 3, ph - 2, T(snow ? '#D7E7F2' : wat[1]));
    const glint = T(snow ? '#FFFFFF' : wat[2]), gl = Math.round(pw * 0.3);
    rect(c, x - Math.round(pw * 0.45), y - Math.round(ph / 2), gl, 1, glint); rect(c, x + Math.round(pw * 0.2), y + 1, Math.round(gl / 2), 1, glint);
    if (st >= 3) {
      // the bridge spans most of the pond with an arch a quarter of its half-span high, posts just past its ends
      const span = pw - 6, arch = Math.round(span / 4), base = y - Math.round(ph / 2) - 1;
      for (let i = -span; i <= span; i++) rect(c, x + i, base - Math.round(arch * (1 - (i * i) / (span * span))), 1, 2, T(i % 3 ? NATURE.wood : NATURE.wood2));
      rect(c, x - span - 1, base - 3, 1, 4, T(NATURE.wood2)); rect(c, x + span + 1, base - 3, 1, 4, T(NATURE.wood2));
    }
  }
  if (st >= 1) for (let i = 0; i < 4; i++) {
    const sx = stonesX + i * 7, sy = band(0.78) + (i % 2);
    rect(c, sx, sy, 3, 1, T('#9AA4A8')); rect(c, sx, sy + 1, 3, 1, T('#6E777B'));
  }
  // ---- props: hand-authored, a few per scene; one standing in the stable's yard makes room on a feast day
  const hall = g.level >= STABLE_STAGES[4], x0 = W - (hall ? 40 : 36);
  const yard = usesYard(feasts) ? yardOf(x0, gT) : undefined;
  for (const p of PROPS[o.scene]) {
    const px = Math.round(4 + p.x * (W - 48)), py = p.y < 0 ? gT + p.y : band(p.y);
    if (yard && Math.abs(px - yard.x) < 20 && py >= gT - 4 && py < yard.y + 10) continue;
    p.paint(c, px, py, { T, night, snow });
    if (p.id === 'rocks') spots.push({ kind: 'rocks', x: px, y: py, w: 12, h: 3 });
  }

  // ---- the stable, then the forest in front of it (a tree every few check-ins, a giant tree last)
  // soft shadows under the stable and the trees
  const shadow = T(P.shadow);
  dither(c, W - (hall ? 42 : 38), gT + 3, 50, 2, shadow, 2);
  o.part?.('house');
  const door = paintHouse(c, x0, gT + 3, W, T, { style: P.house, level: g.level, quests: g.quests, night, snow });
  o.part?.(null);
  if (door.roof) spots.push({ kind: 'roof', x: door.roof.x, y: door.roof.y, w: door.roof.w, h: 0 });
  // a bird sits on the rail left of the building (in front of it would be on its wall); the toadstools have no rail
  if (P.house !== 'shroom') wild.rail = { from: x0 - 9, to: g.level >= STABLE_STAGES[2] ? x0 - (hall ? 8 : 5) : W - 6, y: gT + 3 - 5 };
  marks.stable = { x: door.x, y: door.y - (g.level >= STABLE_STAGES[2] ? 16 : 8) };
  const days = Math.max(0, g.checkIns), trng = new Rng(`trees:${o.scene}`), TR = () => trng.next();
  // across the whole width left of the stable, in two rows: along the horizon and a little in front
  // along the horizon, then groves down both sides of the meadow (those stand among the creatures)
  const walkTop = Math.min(gT + 12, B - 4);
  const list: StandingTree[] = [];
  for (let i = 0; i < treeCount(days); i++) {
    const age = Math.max(0.06, Math.min(1, (days - i * TREE_EVERY) / TREE_GROWS)), [sx, row] = TREE_SLOTS[i];
    const x = sx < 0 ? 4 + Math.round(TR() * 4) : sx > 1 ? W - 8 - Math.round(TR() * 4) : Math.round(sx * (W - 44)) + Math.round(TR() * 4);
    const y = row === 0 ? gT - 1 + Math.round(TR() * 3) : Math.max(walkTop + 2, band(row));
    list.push({ x, y, size: age * TREE_SIZE, seed: 100 + i });
  }
  if (days >= GIANT_AT) list.push({ x: Math.round(W * 0.42), y: gT + 4, size: 1.25 * TREE_SIZE, seed: 999 });
  for (const t of list) spots.push({ kind: 'tree', x: t.x, y: t.y, w: Math.round(4 + t.size * 8), h: Math.round(8 + t.size * 22) });
  const newest = list[list.length - 1];
  marks.forest = { x: newest.x, y: newest.y - Math.round(8 + newest.size * 10) };
  list.sort((a, b) => a.y - b.y);
  if (strip) for (const s of openWater(W, strip, x0, PROPS[o.scene].filter(p => p.y < 0).map(p => Math.round(4 + p.x * (W - 48))))) spots.push({ kind: 'water', ...s, strip: true });
  // by the lake and the sea the trees along the horizon stand among the creatures too, in front of anyone swimming
  const standing = o.standing === 'return' ? list.filter(t => t.y >= walkTop || strip) : [];
  for (const t of list) if (!standing.includes(t)) paintTree(c, t, o, look);

  // ---- flowers from Perfect Days (each scene has its own kind); under snow there are none
  const frng = new Rng(`blooms:${o.scene}`), FR = () => frng.next();
  marks.flowers = { x: Math.round(W * 0.5), y: band(0.5) };
  if (!snow) for (let i = 0; i < patchCount(g.perfectDays); i++) {
    const fx = 4 + FR() * (W - 44), fy = gT + 6 + FR() * (B - gT - 10), col = P.blooms[(FR() * P.blooms.length) | 0];
    marks.flowers = { x: Math.round(fx), y: Math.round(fy) - 2 };
    spots.push({ kind: 'flowers', x: Math.round(fx), y: Math.round(fy), w: 6, h: 0 });
    if (o.scene === 'cove') { dot(c, fx, fy, T(col)); dot(c, fx + 1, fy, T('#E9A98C')); continue; }
    if (o.scene === 'lake' && i % 2 === 0) { const ly = gT - 3 - (i % 3) * 4; rect(c, fx, ly, 3, 1, T('#3E9A4A')); dot(c, fx + 1, ly - 1, T(col)); continue; }
    if (o.scene === 'marsh') { rect(c, fx, fy - 4, 1, 5, T('#6B7A3A')); rect(c, fx, fy - 6, 1, 2, T('#8A5A2E')); continue; }
    if (o.scene === 'mushroom') {
      // tiny fly agarics, glowing at night
      rect(c, fx, fy - 1, 1, 2, T(AMANITA.stem)); rect(c, fx - 1, fy - 3, 3, 1, night ? '#FF4D5E' : T(AMANITA.cap)); rect(c, fx - 2, fy - 2, 5, 1, night ? '#FF4D5E' : T(AMANITA.cap));
      dot(c, fx, fy - 3, night ? '#FFF8EE' : T(AMANITA.wart)); continue;
    }
    if (o.scene === 'bamboo') { for (let k = -1; k <= 1; k++) dot(c, fx + k * 2, fy - Math.abs(k), T('#2F7F3B')); dot(c, fx, fy - 2, T(col)); continue; }
    for (let k = 0; k < 3; k++) { const x = fx + (k - 1) * 2, y = fy + (k % 2); dot(c, x, y + 1, T(P.ground[2])); dot(c, x, y, T(col)); }
  }
  if (feasts.length) paintFeastGround(c, feasts, place(x0));

  // ---- trophies (Habitica's collection achievements) and their signposts, in front of everything painted;
  // each keeps clear of the scene's props, the water, the trees' places and the stable
  const taken: Box[] = PROPS[o.scene].filter(p => p.y >= 0).map(p => {
    const px = Math.round(4 + p.x * (W - 48)), py = band(p.y);
    return { x0: px - 8, y0: py - 12, x1: px + 9, y1: py + 3 };
  });
  taken.push({ x0: pondX - 18, y0: pondY - 7, x1: pondX + 19, y1: pondY + 6 });
  taken.push({ x0: Math.round(W * 0.36) - 2, y0: band(0.78) - 3, x1: Math.round(W * 0.36) + 26, y1: band(0.78) + 4 });
  taken.push({ x0: Math.round(W * 0.08) - 3, y0: gT, x1: pondX - 8, y1: pondY });
  for (const [sx, row] of TREE_SLOTS) {
    if (row === 0) continue;
    const y = Math.max(walkTop + 2, band(row));
    taken.push(sx < 0 ? { x0: 0, y0: y - 34, x1: 32, y1: y + 3 } : { x0: W - 36, y0: y - 34, x1: W, y1: y + 3 });
  }
  taken.push({ x0: W - 62, y0: gT - 30, x1: W, y1: gT + 10 }, { x0: pennantSpan(W)[0] - 1, y0: gT - 10, x1: pennantSpan(W)[1] + 2, y1: gT + 7 });
  o.part?.('trophies');
  const trophies: TrophySpot[] = paintTrophies(c, { W, horizon: gT, bottom: B - 3, band, taken },
    new Set(g.trophies ?? []), new Set(g.signs ?? []), { T, night, snow });
  o.part?.(null);
  const newestTrophy = trophies.filter(t => !t.sign).pop() ?? trophies[trophies.length - 1];
  marks.trophies = newestTrophy ? { x: Math.round((newestTrophy.x0 + newestTrophy.x1) / 2), y: newestTrophy.y0 } : marks.stable;

  // places along the walking ground: open sun in the middle (clear of the groves at the edges and the stable),
  // the shore below the lake or the sea, the bamboo grove's back edge
  const open = W - 44, wt = Math.min(gT + 12, B - 4);
  spots.push({ kind: 'sun', x: Math.round(open * 0.55), y: band(0.45), w: Math.round(open * 0.6), h: 0 });
  if (o.scene === 'lake' || o.scene === 'cove') spots.push({ kind: 'shore', x: Math.round(open / 2), y: wt, w: open, h: 0 });
  if (o.scene === 'bamboo') spots.push({ kind: 'bamboo', x: Math.round(open / 2), y: wt, w: open, h: 0 });
  spots.push({ kind: 'lantern', x: x0 - 12, y: gT + 3, w: 0, h: 0 });

  return {
    trophies,
    house: { x0: x0 - 2, y0: door.y - 40, x1: W, y1: door.y + 2 },
    horizon: gT,
    walk: { top: wt, bottom: B - 3, left: 3, right: W - 4 },
    standing,
    door,
    marks,
    lantern: { x: x0 - 12, y: gT + 3 },
    spots,
    life: { ...wild, water: seaBox },
  };
}
