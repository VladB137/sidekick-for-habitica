/*
 * Runs a creature's nature in the herd (creatures.ts calls these): its schedule, its pace and moods, its
 * favourite places and its acts, with the pacing guard. android/verdict StableNature and StableHerd are a line by
 * line port: same order of random draws, same arithmetic, replayed tick by tick by npm run android:test.
 */
import type { Creature, Herd } from '../creatures';
import type { Ctx, World } from '../world';
import { BEDTIME, DUSK, MORNING } from '../hours';
import type { Act, Emit, Glow, Nature, Now, Pose, Schedule, Spot, SpotKind, When } from './types';

const ART = 3;

/** a creature does an act on at most 1 wander in 2 while it may (Vlad, 15 Oct: 1 in 4 was too rarely seen) */
export const GUARD = 0.5;
/** at most this many creatures doing an act (or walking to one) at once, or half the herd when that is more
 * (busyMax; Vlad, 15 Oct: something going on all the time) */
export const BUSY_MAX = 3;
export const busyMax = (n: number): number => Math.max(BUSY_MAX, Math.ceil(n / 2));
/** the usual rest between walks, ticks */
export const REST: readonly [number, number] = [30, 120];
/** how long a sleeper woken by a crow stays up, ticks */
export const WOKEN = 300;

/** The rule before natures: asleep from bedtime to morning, home from dusk. */
export const DAY: Schedule = { sleep: [BEDTIME, MORNING], home: [DUSK, MORNING] };
/** ...and for a nocturnal sprite with no nature: never asleep, still home at dusk (as the Owl always did) */
const OWL: Schedule = { sleep: [0, 0], home: [DUSK, MORNING] };

/** [from, to) on the clock, wrapping past midnight when from > to; [x, x] never */
export function inHours (h: number, w: readonly [number, number]): boolean {
  return w[0] <= w[1] ? h >= w[0] && h < w[1] : h >= w[0] || h < w[1];
}

export function holds (w: When | undefined, n: Now): boolean {
  if (!w) return true;
  if (w.hours && !inHours(n.hour, w.hours)) return false;
  if (w.winter !== undefined && w.winter !== n.winter) return false;
  if (w.moon && !w.moon.includes(n.moon)) return false;
  if (w.water !== undefined && w.water !== n.water) return false;
  return true;
}

export function scheduleOf (c: Creature, nocturnal: boolean): Schedule { return c.nature ? c.nature.schedule : nocturnal ? OWL : DAY; }

/** asleep now by its schedule: its sleeping hours, or a nap bout (each creature at its own phase) */
export function sleepy (s: Schedule, n: Now, tick: number, phase: number): boolean {
  if (s.sleep && inHours(n.hour, s.sleep)) return true;
  for (const z of s.naps ?? []) if (holds(z.when, n) && (tick + phase) % z.cycle < z.on) return true;
  return false;
}

/** it walks to the stable's door now */
export const homeward = (s: Schedule, n: Now): boolean => !!s.home && inHours(n.hour, s.home);

/** its pace's speed and rest now, with the moods that hold */
export function paceNow (nature: Nature | undefined, n: Now): { speed: number, rest: number } {
  if (!nature) return { speed: 1, rest: 1 };
  let speed = nature.pace.speed, rest = nature.pace.rest;
  for (const m of nature.moods) if (holds(m.when, n)) { speed *= m.speed ?? 1; rest *= m.rest ?? 1; }
  return { speed, rest };
}

/** a rest of `ticks`, stretched by its pace */
export function rested (c: Creature, n: Now, ticks: number): number {
  return c.nature ? Math.round(ticks * paceNow(c.nature, n).rest) : ticks;
}

/** A pose's length: fixed, or drawn from the creature's own generator. */
export function ticksOf (c: Creature, p: Pose): number { return typeof p.n === 'number' ? p.n : c.rng.int(p.n[0], p.n[1]); }

/** What a wander turns into for this nature: an act now, an act at a place (walk there first), a favourite
 * place, or nothing special (null). Draws from the creature's own generator only when it has something it may
 * do. */
export function choose (h: Herd, c: Creature, n: Now): { act: Act | null, goal: { x: number, y: number } | null } | null {
  const nature = c.nature!;
  // ridden, nothing that sinks, cuts, turns or wets it: the avatar would be left floating
  const ok = nature.acts.filter(a => holds(a.when, n) && (!a.at || places(h, c, a.at).length > 0) && !(c.rider && sinks(a)));
  if (ok.length && h.acting() < busyMax(h.creatures.length) && c.rng.chance(GUARD)) {
    let r = c.rng.next() * ok.reduce((s, a) => s + (a.p ?? 1), 0), act = ok[ok.length - 1];
    for (const a of ok) { if (r < (a.p ?? 1)) { act = a; break; } r -= a.p ?? 1; }
    return { act, goal: act.at ? spotGoal(h, c, act.at) : null };
  }
  for (const l of nature.likes) {
    if (!holds(l.when, n) || places(h, c, l.at).length === 0 || !c.rng.chance(l.p)) continue;
    // a favourite place, unless a crowd is there already
    const goal = spotGoal(h, c, l.at);
    if (!h.crowded(c, goal.x, goal.y)) return { act: null, goal };
  }
  return null;
}

/** an act that goes up its place (P4: a perch) */
export const goesUp = (a: Act): boolean => a.script.some(p => !!p.perch);

/** The pose an act holds longest at its highest point over its place (P4: a perch, a soar), for the still picture
 * (Herd.settle): not one swooping away from it (fwd) or hanging below it on a thread (lift < 0); null when it
 * never goes up. */
export function topPose (a: Act): Pose | null {
  let out: Pose | null = null, hi = 0, len = 0;
  for (const p of a.script) {
    const up = p.perch ?? p.soar ?? 0, n = typeof p.n === 'number' ? p.n : p.n[1];
    if (up <= 0 || p.fwd || (p.lift ?? 0) < 0) continue;
    if (up > hi || (up === hi && n > len)) { out = p; hi = up; len = n; }
  }
  return out;
}

/** one place, told apart from the rest of its kind */
export const spotKey = (s: Spot): string => `${s.kind}:${s.x}:${s.y}`;

/** an act whose script sinks the creature, cuts it at a line, turns it (P6) or puts it in the water */
export const sinks = (a: Act): boolean => a.script.some(p => !!p.sink || p.cut !== undefined || !!p.rot || p.depth !== undefined);

/** somewhere in a place of this kind: one picked at random, a little off its middle; in the lake or the sea, a few
 * art pixels out from the shore (`above`: the walk may leave the walking ground to get there) */
function spotGoal (h: Herd, c: Creature, kind: SpotKind): { x: number, y: number, above?: boolean } {
  const ss = places(h, c, kind), s = ss[Math.floor(c.rng.next() * ss.length)];
  const x = s.x + (c.rng.next() - 0.5) * s.w * 0.6;
  return s.strip ? { x, y: s.y + s.h / 2 - (2 + c.rng.int(0, 3)) * ART, above: true } : { x, y: s.y };
}

/* ---- water (package W): wading, swimming, diving */

/** wading: this much of a creature's picture under the waterline while it walks through water */
export const WADE = 0.3;
/** water a swimmer fits in: this many art pixels wider than the creature */
export const ROOM = 6;

/** The pond and the pools freeze in winter (the scene paints them iced); the lake and the sea never do. */
export const open = (s: Spot, winter: boolean): boolean => s.strip || !winter;

/** The places of a kind this creature can use: open water it fits in with room to spare (a stretch of the lake or
 * the sea between the trees in front of it, the pond, a pool), and for a mount only the lake or the sea (the pond
 * and the pools are for pets). */
export function places (h: Herd, c: Creature, kind: SpotKind): readonly Spot[] {
  const ss = h.spots(kind);
  if (kind !== 'water') return ss;
  const wide = 2 * c.half(h.world) + ROOM * ART, winter = h.now().winter;
  return ss.filter(s => open(s, winter) && s.w >= wide && (s.strip || !c.mount));
}

/** the point is in this water: the lake's or the sea's band, or the oval of the pond or a pool */
export function inside (s: Spot, x: number, y: number): boolean {
  const hw = s.w / 2, hh = s.h / 2;
  if (s.strip) return Math.abs(x - s.x) <= hw && Math.abs(y - s.y) <= hh;
  const u = (x - s.x) / hw, v = (y - s.y) / hh;
  return u * u + v * v <= 1;
}

/** the open water its feet are in, or null (on ice it simply walks) */
export function waterAt (h: Herd, c: Creature): Spot | null {
  const winter = h.now().winter;
  for (const s of h.spots('water')) if (open(s, winter) && inside(s, c.fx, c.fy)) return s;
  return null;
}

/** how far either side of the water's middle a creature can be at its height, its whole body in the water */
function reach (s: Spot, y: number, half: number): number {
  const hw = s.w / 2, v = (y - s.y) / (s.h / 2);
  return (s.strip ? hw : hw * Math.sqrt(Math.max(0, 1 - v * v))) - half;
}

/** An act can start here: one in the water only with its feet in water. */
export function canAct (h: Herd, c: Creature, a: Act): boolean { return a.at !== 'water' || !!waterAt(h, c); }

/** Wading, after each tick: a creature walking (or standing) in water is drawn cut at the waterline, a little of it
 * under. Its acts, a toy or a game draw it their own way, so a busy creature is left alone; a carried one, a flyer
 * or a ridden mount is never cut. */
export function wade (h: Herd, c: Creature) {
  // perched only ever in the still picture (Herd.settle; the wallpaper's StableHerd.settle too), where nothing steps
  if (c.act || c.busy || c.perched) return;
  const wet = c.base === 0 && !c.rider && c.st !== 'held' && c.st !== 'fall' && c.st !== 'land' && !!waterAt(h, c);
  if (wet) {
    const s = c.pic(h.world);
    c.off = -Math.round((s ? s.h : 60) * WADE / ART) * ART; c.clipBelow = c.y + 1; c.wet = true;
  } else if (c.wet) { c.wet = false; c.off = 0; c.clipBelow = undefined; }
}

/** Swims `glide` art pixels a second the way it faces, inside its water; at the edge it turns round instead. */
function swim (h: Herd, c: Creature, glide: number) {
  const s = waterAt(h, c);
  if (!s) return;
  const lim = reach(s, c.fy, c.half(h.world)), nx = c.fx + c.dir * glide * ART / 30;
  if (Math.abs(nx - s.x) > lim && (nx - s.x) * c.dir > 0) { c.dir = -c.dir; return; }
  c.setPos(nx, c.fy);
}

/** Comes up somewhere else in the same water, facing either way. */
function surface (h: Herd, c: Creature) {
  const s = waterAt(h, c);
  if (!s) return;
  const lim = reach(s, c.fy, c.half(h.world));
  if (lim > 0) c.setPos(s.x + (c.rng.next() * 2 - 1) * lim, c.fy);
  c.dir = c.rng.chance(0.5) ? 1 : -1;
}

/** Starts an act where it stands. */
export function startAct (c: Creature, a: Act) {
  c.plan = null;
  c.st = 'act'; c.t = 0; c.busy = 'act';
  c.act = { a, i: 0, t: 0, n: 0, loops: a.loops ? c.rng.int(a.loops[0], a.loops[1]) : 1 };
  c.act.n = ticksOf(c, a.script[0]);
}

/** One tick of an act: the pose's start (turn, particles, waking), its shape, then on to the next. */
export function stepAct (h: Herd, c: Creature) {
  const r = c.act!, p = r.a.script[r.i];
  if (r.top === undefined) {
    // P4: an act that goes up its place, when it didn't get to one (crowded there), isn't played
    r.top = goesUp(r.a) ? placeTop(h, c, r.a.at) : 0;
    if (r.top < 0) { quitAct(c); c.idle(rested(c, h.now(), c.rng.int(REST[0], REST[1]))); return; }
  }
  if (r.t === 0) {
    if (p.inward) c.dir = c.x < h.world.w / 2 ? 1 : -1;
    if (p.elsewhere) surface(h, c);
    if (p.turn) c.dir = -c.dir;
    for (const e of p.fx ?? []) h.emitFrom(c, e);
    if (p.wake) h.wakeNear(c, p.wake);
    if (p.look) h.lookAt(c, p.look);
  }
  if (p.glide) swim(h, c, p.glide);
  applyPose(c, p, r.top, h.band.top);
  if (p.depth !== undefined) {
    const s = c.pic(h.world);
    c.off = -Math.round((s ? s.h : 60) * p.depth / ART) * ART; c.clipBelow = c.y + 1;
  }
  if (p.go) {
    const half = c.half(h.world);
    c.setPos(Math.max(half, Math.min(h.world.w - half, c.fx + c.dir * p.go * ART)), c.fy);
    c.tx = c.fx; c.ty = c.fy;
  }
  if (++r.t < r.n) return;
  r.t = 0;
  if (++r.i >= r.a.script.length) {
    if (--r.loops <= 0) {
      const a = r.a;
      quitAct(c);
      c.idle(rested(c, h.now(), a.rest ? c.rng.int(a.rest[0], a.rest[1]) : c.rng.int(REST[0], REST[1])));
      return;
    }
    r.i = 0;
  }
  r.n = ticksOf(c, r.a.script[r.i]);
}

/** A pose's shape on a creature: an act's, or the one it holds while carried (Touch.hold). `top`: how far above its
 * feet the top of the act's place stands (P4, for `perch`); `sky`: the walking ground's top (for `soar`). */
export function applyPose (c: Creature, p: Pose, top = 0, sky = 0) {
  const k = p.perch ?? 0;
  c.lift = c.base * (1 - k) + (p.lift ?? 0) * ART;
  c.off = -(p.sink ?? 0) * ART;
  if (k) {
    c.off += k * top;
    if (c.off + c.lift < 0) c.lift = -c.off;
  }
  if (p.soar) c.off += p.soar * (c.y - sky / 2);
  c.clipBelow = p.cut !== undefined || p.sink ? c.y + 1 - (p.cut ?? 0) * ART : undefined;
  c.sq = p.sq ?? 0; c.dx = (p.dx ?? 0) + (p.fwd ?? 0) * c.dir; c.leg = p.leg ?? 0;
  c.rot = p.rot ?? 0;
}

/** Back to its own height, uncut, after a pose (an act's end, or being let go). */
export function clearPose (c: Creature) { c.off = 0; c.clipBelow = undefined; c.dx = 0; }

/** P4: how far above its feet the top of the place it is at stands (world pixels): the nearest place of that kind
 * across, when it stands within it (2 art pixels to spare); -1 when it stands at none. */
export function placeTop (h: Herd, c: Creature, kind: SpotKind | undefined): number {
  if (!kind) return -1;
  let best: Spot | null = null;
  for (const s of h.spots(kind)) if (!best || Math.abs(s.x - c.x) < Math.abs(best.x - c.x)) best = s;
  if (!best || Math.abs(best.x - c.x) > best.w / 2 + 2 * ART) return -1;
  return Math.max(0, c.y - (best.y - best.h));
}

/** Out of its act (finished, or something else took over): back to its own height, uncut. */
export function quitAct (c: Creature) {
  if (!c.act) return;
  c.act = null; clearPose(c);
  if (c.busy === 'act') c.busy = undefined;
}

/** Where an emit starts, world pixels, and the way it goes (+1 right). */
export function emitPoint (c: Creature, e: Emit, w: World): { x: number, y: number, side: number } {
  const s = c.pic(w), h = s ? s.h : 60, half = c.half(w), d = c.dir;
  const snap = (v: number) => Math.round(v / ART) * ART;
  let x = c.x, y = c.y;
  if (e.at === 'head') y = c.y - (h - 1) - snap(c.lift) - snap(c.off);
  else if (e.at === 'front') x = c.x + d * half;
  else if (e.at === 'back') x = c.x - d * half;
  else if (e.at === 'nose') { x = c.x + d * half; y = c.y - (h - 1) - snap(c.lift) - snap(c.off) + snap(h / 4); }
  return { x: x + d * (e.x ?? 0) * ART, y: y + (e.y ?? 0) * ART, side: d * (e.side ?? 1) };
}

/** its light now, if it gives one off */
export const glowing = (c: Creature, n: Now): Glow | null => (c.nature?.glow && holds(c.nature.glow.when, n) ? c.nature.glow : null);

const mod = (v: number, m: number) => ((v % m) + m) % m;

/** The pool of light on the ground around its feet (types.ts Glow), drawn before anyone stands on it. */
export function drawGlow (g: Ctx, c: Creature, gl: Glow, tick: number, still: boolean) {
  const R = gl.r, Ry = Math.max(1, Math.round(R / 3));
  if (R <= 0 || !gl.cols) return;
  const f = gl.flicker && !still ? Math.floor((tick + c.breathAt) / 8) % 2 : 0, all = R * R * Ry * Ry;
  for (let j = -Ry; j <= Ry; j++) {
    for (let i = -R; i <= R; i++) {
      const e = i * i * Ry * Ry + j * j * R * R;
      if (e > all) continue;
      const inner = 4 * e <= all;
      if (inner ? mod(i + j + f, 2) !== 0 : mod(i + 2 * j + f, 4) !== 0) continue;
      g.fillStyle = gl.cols[inner ? 0 : 1];
      g.fillRect(c.x + i * ART, c.y + 1 + j * ART, ART, ART);
    }
  }
}

/** Its light's turn to give off a particle (embers, a blink), at its own phase. */
export function glowFx (c: Creature, gl: Glow, tick: number): Emit | null {
  if (!gl.fx?.length || !gl.every) return null;
  const k = tick + c.breathAt * 3;
  return k % gl.every === 0 ? gl.fx[Math.floor(k / gl.every) % gl.fx.length] : null;
}
