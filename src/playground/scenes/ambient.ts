/* The scenery's own small life (scenery, never Habitica's creatures): butterflies over the ground on spring
 * to autumn days, a fish ringing the lake, the sea or the pond, frogs hopping between the marsh's pools and
 * lily pads, a bird on the stable's fence, a crab on the cove's sand; in a clear night sky a shooting star
 * now and then, many on the nights of the Perseids and the Geminids; and a rainbow for the hour after a shower.
 *
 * Like the weather, everything is a function of the world's tick and fixed seeds, with no state: under reduced
 * motion (no ticks) it holds still, and the live wallpaper's Java port (android/verdict StableAmbient, tested
 * against this file by npm run android:test) draws the same pixels. Critters are plain lists of numbers, the
 * form the wallpaper gets them in (stable/scenery.ts). Everything is drawn on the 3 x 3 art grid. */
import { Rng } from '../rng';
import { ART } from './pixels';
import { toner, type SceneId } from './palettes';
import { rainbowAt, type Season, type TimeOfDay } from './clock';
import type { SceneLayout } from './paint';
import type { Ctx, Layer, World } from '../world';
import type { SceneLayer } from './layer';

export const BUTTERFLY = 0, FISH = 1, FROG = 2, BIRD = 3, CRAB = 4;

/**
 * [kind, seed, x, y, p, q, colour 1, colour 2, colour 3]: art pixels and 0xRRGGBB colours, already in the
 * light of the hour. By kind:
 * - butterfly: flutters around (x, y), p and q across and up; wings, body
 * - fish: rings anywhere in the water box (x, y, p wide, q high); ring, fish
 * - frog: sits at (x, y) or (p, q), its feet on that row; skin, throat
 * - bird: sits on the rail's row y, its left edge from x to p; body, breast, beak
 * - crab: scuttles along row y, its left edge from x to p; shell, claws
 */
export type Critter = [kind: number, seed: number, x: number, y: number, p: number, q: number, c1: number, c2: number, c3: number];

export interface Life {
  critters: Critter[];
  /** where a shooting star may start: [top, bottom, left, right], art pixels; null where the sky is never clear */
  sky: [number, number, number, number] | null;
  /** the rainbow's centre and outer radius, [x, y, r], art pixels; null where it never rains (winter, the glade) */
  bow: [number, number, number] | null;
}

export const NO_LIFE: Life = { critters: [], sky: null, bow: null };

/** Meteor showers by the date of the evening a night begins on: the Perseids peak on the night of 12 August, the
 * Geminids on 13 December (the nights either side count too). */
const SHOWERS: [month: number, from: number, to: number][] = [[7, 11, 13], [11, 12, 14]];

/** The night that holds this moment (before 06:00 it is still the previous evening's) is a meteor shower's. */
export function showerNight (d: Date): boolean {
  const e = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getHours() < 6 ? 1 : 0));
  return SHOWERS.some(([m, a, b]) => e.getMonth() === m && e.getDate() >= a && e.getDate() <= b);
}

const BUTTERFLIES: Partial<Record<SceneId, string[]>> = {
  meadow: ['#FFFFFF', '#FFD166', '#FF9A4D'], lake: ['#9AD0F5', '#FFFFFF'], pine: ['#FFD166', '#C3A6F0'], bamboo: ['#FF9BBE', '#FFFFFF'],
};
/** the fence's bird: body, breast, beak */
const BIRDS: Record<SceneId, [string, string, string]> = {
  meadow: ['#7A5A3A', '#E8743B', '#3A2E22'], lake: ['#5A6470', '#F2F2F2', '#2A2A2A'], pine: ['#3F6FC0', '#E8A06A', '#2A2A2A'],
  cove: ['#DCE3E8', '#FFFFFF', '#F2B33D'], bamboo: ['#8A6A4A', '#D8C8A8', '#3A2E22'], marsh: ['#7E6F52', '#D8CFA8', '#3A2E22'], mushroom: ['#7A5A3A', '#E8743B', '#3A2E22'],
};

/** Who lives in this scene at this light, from where the painted scene left room (paint.ts spots). */
export function lifeOf (o: { scene: SceneId, tod: TimeOfDay, season: Season, dailiesDone: boolean }, layout: SceneLayout, W: number): Life {
  const T = toner(o), col = (c: string) => parseInt(T(c).slice(1), 16);
  const s = layout.life, walk = layout.walk, out: Critter[] = [];
  const night = o.tod === 'night', winter = o.season === 'winter';
  const flyers = BUTTERFLIES[o.scene];
  if (flyers && (o.tod === 'day' || o.tod === 'dawn') && (o.season === 'summer' || (o.season !== 'winter' && o.scene !== 'pine'))) {
    const n = Math.max(2, Math.round(flyers.length * W / 180));
    for (let i = 0; i < n; i++) {
      const x = Math.round(walk.left + (i + 0.5) * (walk.right - walk.left) / n), y = walk.top - 3 + (i % 2) * 7;
      out.push([BUTTERFLY, i, x, y, 10, 4, col(flyers[i % flyers.length]), col('#3A2E22'), 0]);
    }
  }
  const fish = o.scene === 'bamboo' ? '#F08A3C' : '#C8D2D6';
  if (s.water && s.water.w >= 12 && (!winter || o.scene === 'cove')) {
    for (let i = 0; i < 2; i++) out.push([FISH, 10 + i, s.water.x, s.water.y, s.water.w, s.water.h, col(o.scene === 'cove' ? '#D8F4FC' : '#C3E2F5'), col(fish), 0]);
  }
  if (s.pond) out.push([FISH, 20, s.pond.x, s.pond.y, s.pond.w, s.pond.h, col('#BFE3F7'), col(fish), 0]);
  if (o.scene === 'marsh' && !winter) {
    // a frog for each pool with a lily pad: on the near bank or on the pad
    s.pools.filter(p => p.pad).forEach((p, i) => out.push([FROG, 30 + i, p.x - p.rx - 5, p.y, p.x + p.rx - 5, p.y - 1, col('#5E8C3A'), col('#E3EC9C'), col('#93B356')]));
  }
  if (s.rail && !night && s.rail.to > s.rail.from) {
    const [a, b, c] = BIRDS[o.scene];
    out.push([BIRD, 40, s.rail.from, s.rail.y, s.rail.to, 0, col(a), col(b), col(c)]);
  }
  if (o.scene === 'cove' && !night && !winter) out.push([CRAB, 50, 6, layout.horizon + 9, Math.round(W * 0.5), 0, col('#D9534F'), col('#B8322E'), col('#2A2A2A')]);
  const sky: Life['sky'] = o.scene === 'marsh' ? null : [s.skyTop + 2, s.skyTop + Math.round((layout.horizon - s.skyTop) * 0.42), 4, Math.round(W * 0.66)];
  // left of the stable, its feet on the horizon, no higher than two thirds of the sky
  const bow: Life['bow'] = winter || o.scene === 'mushroom' ? null : [Math.round(W * 0.36), layout.horizon + 4, Math.min(Math.round(W * 0.3), Math.round((layout.horizon - s.skyTop) * 0.66))];
  return { critters: out, sky, bow };
}

type Px = (x: number, y: number, rgb: number) => void;

const JUMP = [[-5, 0], [-4, -2], [-3, -3], [-2, -3], [-1, -2], [0, 0]];
const RINGS = [[[0, 0]], [[-1, 0], [1, 0]], [[-2, 0], [2, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]], [[-3, 0], [3, 0], [-2, 1], [2, -1]]];
const HOP = [0, -2, -3, -3, -2, -1];
const BOW = [0xE8483F, 0xF5953A, 0xF8DE4B, 0x5FC25A, 0x4A8FE0, 0x8A5CC8];
const METEOR = [0xFFFFFF, 0xFFFFFF, 0xFFF6C8, 0xFFF6C8, 0xFFF6C8, 0xC9D3FF, 0xC9D3FF, 0xC9D3FF, 0x8E9BD0, 0x8E9BD0, 0x8E9BD0, 0x8E9BD0];

function butterfly (px: Px, c: Critter, t: number) {
  const [, s, x, y, rx, ry, wing, body] = c;
  const cx = x + Math.round(Math.sin(t / 47 + s) * rx * 0.7 + Math.sin(t / 19 + s * 3) * rx * 0.3);
  const cy = y + Math.round(Math.sin(t / 31 + s * 2) * ry + Math.sin(t / 11 + s));
  // wings spread flat, then raised in a V
  if (Math.floor((t + s * 5) / 4) % 2 === 0) { px(cx - 2, cy - 1, wing); px(cx - 1, cy - 1, wing); px(cx + 1, cy - 1, wing); px(cx + 2, cy - 1, wing); px(cx - 1, cy, wing); px(cx + 1, cy, wing); } else { px(cx - 1, cy - 2, wing); px(cx + 1, cy - 2, wing); px(cx - 1, cy - 1, wing); px(cx + 1, cy - 1, wing); }
  px(cx, cy - 1, body); px(cx, cy, body);
}

/** Nearly every 5 s: a fish leaps (more often than not) and the water rings where it was, wider and wider, then broken. */
function fish (px: Px, c: Critter, t: number) {
  const [, s, x, y, w, h, ring, body] = c;
  const k = Math.floor(t / 150), r = new Rng(`fish:${s}:${k}`);
  if (!r.chance(0.9)) return;
  const fx = x + 6 + r.int(0, w - 10), fy = y + r.int(0, h - 1), jump = r.chance(0.6), start = r.int(0, 90);
  let i = t - k * 150 - start;
  if (i < 0) return;
  if (jump) {
    if (i < 18) {
      const [dx, dy] = JUMP[Math.floor(i / 3)];
      px(fx + dx - 1, fy + dy, body); px(fx + dx, fy + dy, body); px(fx + dx + 1, fy + dy, body);
      if (i < 6) px(fx - 5, fy, ring);
      return;
    }
    i -= 18;
  }
  const f = i < 8 ? 0 : i < 18 ? 1 : i < 30 ? 2 : i < 42 ? 3 : -1;
  if (f < 0) return;
  for (const [dx, dy] of RINGS[f]) if (fy + dy >= y && fy + dy < y + h) px(fx + dx, fy + dy, ring);
}

/** Sits on one of its two spots for 8 s, hopping across when the spot changes, and croaks some of the time. */
function frog (px: Px, c: Critter, t: number) {
  const [, s, ax, ay, bx, by, skin, throat, belly] = c;
  const k = Math.floor(t / 240), at = t - k * 240;
  const r = new Rng(`frog:${s}:${k}`), onB = r.chance(0.5), croaks = r.chance(0.9), cs = r.int(30, 180);
  const wasB = new Rng(`frog:${s}:${k - 1}`).chance(0.5);
  let x = onB ? bx : ax, y = onB ? by : ay;
  if (wasB !== onB && at < 12) {
    const x0 = wasB ? bx : ax, y0 = wasB ? by : ay, u = at / 12;
    x = x0 + Math.round((x - x0) * u); y = y0 + Math.round((y - y0) * u) + HOP[Math.floor(at / 2)];
  }
  // eyes on top, then the back, then the legs either side of a pale belly; croaking, the throat swells
  const croak = croaks && at >= cs && at < cs + 40 && Math.floor((at - cs) / 5) % 2 === 0;
  px(x + 1, y - 2, skin); px(x + 3, y - 2, skin);
  for (let i = 0; i < 5; i++) px(x + i, y - 1, skin);
  px(x, y, skin); px(x + 4, y, skin);
  for (let i = 1; i < 4; i++) px(x + i, y, croak ? throat : belly);
  if (croak) px(x + 2, y + 1, throat);
}

interface Perch { away: boolean, x: number, left: boolean, peck: number }
function perch (s: number, from: number, to: number, k: number): Perch {
  const r = new Rng(`bird:${s}:${k}`);
  const away = r.chance(0.3), x = from + r.int(0, to - from), left = r.chance(0.5), pecks = r.chance(0.8), at = r.int(30, 170);
  return { away, x, left, peck: pecks ? at : -1 };
}

/** Sits on the rail, turns, hops along it, pecks now and then; sometimes flies off for a while and comes back. */
function bird (px: Px, c: Critter, t: number) {
  const [, s, from, y, to, , body, breast, beak] = c;
  const k = Math.floor(t / 200), at = t - k * 200, now = perch(s, from, to, k), prev = perch(s, from, to, k - 1);
  // 5 across, facing right; mirrored facing left
  const flying = (fx: number, fy: number, left: boolean, i: number) => {
    const f = (col: number, row: number, rgb: number) => px(left ? fx + 4 - col : fx + col, fy + row, rgb);
    if (Math.floor(i / 3) % 2 === 0) { f(0, 0, body); f(4, 0, body); } else { f(0, 2, body); f(4, 2, body); }
    f(1, 1, body); f(2, 1, body); f(3, 1, body); f(5, 1, beak);
  };
  if (now.away) {
    if (prev.away || at >= 24) return;
    const d = prev.left ? -1 : 1;
    flying(prev.x + d * at, y - 3 - Math.floor(at / 2), prev.left, at);
    return;
  }
  if (prev.away && at < 24) {
    const d = now.left ? -1 : 1, a = 24 - at;
    flying(now.x - d * a, y - 3 - Math.floor(a / 2), now.left, at);
    return;
  }
  let x = now.x, lift = 0, left = now.left;
  if (!prev.away && prev.x !== now.x && at < 10) {
    x = prev.x + Math.round((now.x - prev.x) * at / 10); lift = at >= 2 && at < 8 ? 1 : 0; left = now.x < prev.x;
  }
  const put = (col: number, row: number, rgb: number) => px(left ? x + 4 - col : x + col, y - 3 + row - lift, rgb);
  if (now.peck >= 0 && at >= now.peck && at < now.peck + 8) {
    // head down to the rail
    put(0, 1, body); put(1, 1, body); put(2, 1, body); put(3, 1, breast); put(4, 2, body); put(5, 2, beak); put(1, 2, body);
  } else {
    put(3, 0, body); put(4, 0, beak); put(0, 1, body); put(1, 1, body); put(2, 1, body); put(3, 1, breast); put(1, 2, body); put(2, 2, breast);
  }
}

/** Scuttles sideways to a new place on the sand every 6 s, then waves its claws. */
function crab (px: Px, c: Critter, t: number) {
  const [, s, from, y, to, , shell, claw, eye] = c;
  const at6 = (k: number) => { const r = new Rng(`crab:${s}:${k}`); return { x: from + r.int(0, to - from), wave: r.int(20, 160) }; };
  const k = Math.floor(t / 180), at = t - k * 180, now = at6(k), prev = at6(k - 1);
  const d = now.x - prev.x, moved = Math.min(Math.abs(d), Math.floor(at / 4)), x = prev.x + Math.sign(d) * moved;
  const walking = moved < Math.abs(d), up = !walking && at >= now.wave && at < now.wave + 16 && Math.floor((at - now.wave) / 4) % 2 === 0;
  // claws either side (raised when waving), eyes on stalks, the shell, legs that patter while it walks
  px(x, y - (up ? 3 : 2), claw); px(x + 4, y - (up ? 3 : 2), claw);
  px(x + 1, y - 2, eye); px(x + 3, y - 2, eye);
  for (let i = 1; i < 4; i++) px(x + i, y - 1, shell);
  px(x + 1, y, shell); px(x + 2, y, shell); px(x + 3, y, shell);
  if (!walking || Math.floor(at / 2) % 2 === 0) { px(x, y, claw); px(x + 4, y, claw); } else { px(x - 1, y, claw); px(x + 5, y, claw); }
}

/** rate 1: one now and then (about every 40 s); 2: a shower (one or two every 2 s) */
function meteors (px: Px, sky: NonNullable<Life['sky']>, t: number, rate: number) {
  const [top, bottom, left, right] = sky, L = rate === 2 ? 40 : 600, D = 12;
  const k = Math.floor(t / L), r = new Rng(`meteor:${rate}:${k}`);
  if (!r.chance(rate === 2 ? 0.8 : 0.5)) return;
  const start = r.int(0, L - D), sx = left + r.int(0, right - left), sy = top + r.int(0, Math.floor((bottom - top) / 2));
  const i = t - k * L - start;
  if (i < 0 || i >= D) return;
  // a 2:1 streak down to the left: the head, then a tail fading out; the last ticks it burns away from the front
  for (let j = i >= D - 3 ? 3 * (i - D + 4) : 0; j < METEOR.length; j++) {
    const u = 2 * i + 2 - j;
    if (u < 0) break;
    const x = sx - u, y = sy + (u >> 1);
    if (y <= bottom && x >= 0) px(x, y, METEOR[j]);
  }
}

/** Six bands one art pixel wide, on every other pixel so the sky and hills show through, above the horizon. */
function rainbow (px: Px, bow: NonNullable<Life['bow']>) {
  const [cx, cy, R] = bow;
  for (let b = 0; b < BOW.length; b++) {
    const r = R - b;
    // each column's pixel, and each row's, so the steep ends have no gaps
    for (let dx = -r; dx <= r; dx++) {
      const dy = Math.round(Math.sqrt(r * r - dx * dx)), x = cx + dx, y = cy - dy;
      if (((x + y) & 1) === 0 && y < cy - 4) px(x, y, BOW[b]);
    }
    for (let dy = 0; dy < r; dy++) {
      const dx = Math.round(Math.sqrt(r * r - dy * dy)), y = cy - dy;
      for (const x of [cx - dx, cx + dx]) if (((x + y) & 1) === 0 && y < cy - 4 && Math.round(Math.sqrt(r * r - (x - cx) * (x - cx))) !== dy) px(x, y, BOW[b]);
    }
  }
}

/** The back (meteors, a rainbow, water, frogs, crab, bird: behind the creatures) or the front (butterflies). */
export function drawLife (g: { fillStyle: unknown, fillRect (x: number, y: number, w: number, h: number): void }, life: Life, front: boolean, t: number, meteorRate: number, bow = false) {
  const px: Px = (x, y, rgb) => { g.fillStyle = '#' + rgb.toString(16).padStart(6, '0'); g.fillRect(x * ART, y * ART, ART, ART); };
  if (!front && life.sky && meteorRate > 0) meteors(px, life.sky, t, meteorRate);
  if (!front && life.bow && bow) rainbow(px, life.bow);
  for (const c of life.critters) {
    if ((c[0] === BUTTERFLY) !== front) continue;
    switch (c[0]) {
      case BUTTERFLY: butterfly(px, c, t); break;
      case FISH: fish(px, c, t); break;
      case FROG: frog(px, c, t); break;
      case BIRD: bird(px, c, t); break;
      case CRAB: crab(px, c, t); break;
    }
  }
}

export class AmbientLayer implements Layer {
  readonly id: string;
  private shower = false;
  private bow = false;
  private checkedAt = -Infinity;
  /** @param o.shower   a fixed answer to "is tonight a meteor shower" (still pictures, tests, the dev page); else from the date
   *  @param o.rainbow  the same for "is there a rainbow now" */
  constructor (private readonly scene: SceneLayer, readonly depth: 'back' | 'front', private readonly o: { shower?: boolean, rainbow?: boolean } = {}) {
    this.id = `ambient-${depth}`;
  }

  /** what the date says, looked at no more than once a minute */
  private dated () {
    const t = Date.now();
    if (t - this.checkedAt <= 60_000) return;
    const d = this.scene.options.now?.() ?? new Date(t);
    this.shower = showerNight(d); this.bow = rainbowAt(d); this.checkedAt = t;
  }

  private rate (life: Life): number {
    if (!life.sky || this.scene.light().tod !== 'night') return 0;
    if (this.o.shower !== undefined) return this.o.shower ? 2 : 1;
    this.dated();
    return this.shower ? 2 : 1;
  }

  private rainbow (life: Life): boolean {
    if (!life.bow) return false;
    if (this.o.rainbow !== undefined) return this.o.rainbow;
    this.dated();
    return this.bow;
  }

  draw (g: Ctx, world: World) {
    const life = this.scene.life(world), back = this.depth === 'back';
    drawLife(g, life, !back, world.tick, back ? this.rate(life) : 0, back && this.rainbow(life));
  }
}
