/* The toys (Vlad, 2026-10-15): the toy box's frisbee, stick and kite beside the herd's ball, and one toy of
 * its own that always stands in each playground: a hay pile to dive into (Meadow), flat stones to skip over the
 * lake (Lakeside), pine cones (Pine hill), a sandcastle (Sandy cove), a spinning top (Bamboo grove), a bubble pot
 * (Misty marsh) and a bouncy cap (Mushroom glade).
 *
 * Each toy is an entity in the world. It moves the creatures through their own public state (goTo, a happy
 * hop, a spin) and marks the one it plays with as busy, so the ball and wandering leave it alone. Nothing here
 * runs on the wallpaper, whose herd (android/verdict StableHerd) has no toys, as it has no ball. */
import { ART, type Particle } from '../particles';
import type { Creature, Herd } from '../creatures';
import type { Roller } from '../ballplay';
import type { Rng } from '../rng';
import type { Ctx, Entity, World } from '../world';
import type { Sprite } from '../sprites';
import {
  BUBBLE, BUBBLE_POT, CAP, CONE, CONE_PILE, FRISBEE, HAY_PILE, KITE, SANDCASTLE, STICK, STONE, STONES, TOP, TOP_DOWN, draw, on,
  type Picture, type Tone,
} from './art';

export type BoxToy = 'ball' | 'frisbee' | 'stick' | 'kite';
export type OwnToy = 'hay' | 'stones' | 'cones' | 'sandcastle' | 'top' | 'bubbles' | 'cap';
export type ToyKind = Exclude<BoxToy, 'ball'> | OwnToy;

/** What the toys need from the playground around them. */
export interface PlayEnv {
  world: World;
  herd: Herd;
  rng: Rng;
  tone: Tone;
  /** names the light, for pictures cached per light */
  light (): string;
  /** the still picture is showing (reduced motion): nothing travels */
  still (): boolean;
  /** the first ground row, world px */
  horizon (): number;
  /** where the kite's string is tied (by the stable), world px */
  tie (): { x: number, y: number };
  /** something airborne drawn over the creatures this frame (bubbles, rings) */
  over (fn: (g: Ctx) => void): void;
  /** the rim that marks a picture as something to tap, drawn just before it (hint.ts) */
  hint? (g: Ctx, p: Picture, x: number, y: number): void;
}

const snap = (v: number) => Math.round(v / ART) * ART;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/* ---------------------------------------------------------------- the creatures, from outside */

/** a sprite's painted pixels: first and last row and column (unmirrored) */
const boxes = new WeakMap<Sprite, { top: number, bottom: number, left: number, right: number }>();
export function painted (s: Sprite) {
  let b = boxes.get(s);
  if (!b) {
    b = { top: 0, bottom: s.h - 1, left: 0, right: s.w - 1 };
    if (s.mask) {
      let top = s.h, bottom = -1, left = s.w, right = -1;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.mask[y * s.w + x]) { top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x); }
      if (right >= 0) b = { top, bottom, left, right };
    }
    boxes.set(s, b);
  }
  return b;
}

/** where its mouth is, world px: the front of its painted pixels, a little under halfway down */
export function mouth (c: Creature, w: World) {
  const f = c.frame(w);
  if (!f) return { x: c.x, y: c.y - 10 * ART };
  const b = painted(f.s);
  const l = f.flipped ? f.left + f.s.w - 1 - b.right : f.left + b.left;
  const r = f.flipped ? f.left + f.s.w - 1 - b.left : f.left + b.right;
  const front = c.facing(w) === 'front' ? 0 : c.dir;
  const top = c.y - f.s.anchor.y - snap(c.lift) - snap(c.off);
  return { x: front > 0 ? r - 3 * ART : front < 0 ? l + 3 * ART : (l + r) / 2, y: top + b.top + (b.bottom - b.top) * 0.45 };
}

/** who can play now: awake, on its feet, not playing with something else */
export function free (c: Creature) {
  return !c.isAsleep && !c.busy && c.st !== 'held' && c.st !== 'fall' && c.st !== 'land';
}

/** The nearest one that may play, within range (art px). */
export function nearest (h: Herd, w: World, x: number, y: number, range: number, ok: (c: Creature) => boolean = () => true) {
  let best: Creature | null = null, bd = range * ART;
  for (const c of h.creatures) {
    if (!free(c) || !ok(c)) continue;
    const d = Math.hypot(c.fx - x, c.fy - y);
    if (d < bd) { bd = d; best = c; }
  }
  return best;
}
const pets = (w: World) => (c: Creature) => !c.mount && c.motion(w) !== 'hover';

export function engage (c: Creature, what: string) { c.busy = what; }
export function release (c: Creature | null | undefined) {
  if (!c) return;
  c.busy = undefined; c.off = 0; c.clipBelow = undefined;
  if (c.st === 'chase') c.idle(c.rng.int(30, 60));
  else if (c.st === 'idle') c.wait = Math.min(c.wait, c.rng.int(30, 60));
}
export function hop (c: Creature) { c.st = 'happy'; c.t = 0; c.tx = c.fx; c.ty = c.fy; c.leg = 0; }
export function face (c: Creature, x: number) { if (Math.abs(x - c.fx) > ART && c.lift <= c.base) c.dir = x > c.fx ? 1 : -1; }

/* ---------------------------------------------------------------- a toy */

export abstract class Toy implements Entity {
  readonly id: string;
  readonly sprite: string;
  x = 0; y = 0;
  hidden = false;
  /** where it lies on the ground, its height above it, world px */
  fx = 0; fy = 0; z = 0;
  vx = 0; vy = 0; vz = 0;
  /** dropping in from the toy box: falls from above the view, bounces, lands with a ring of sparks */
  arriving = false;
  private bounced = false;
  /** put back in the toy box: rises out of the view; done once it has gone */
  leaving = false;
  done = false;

  constructor (readonly kind: ToyKind | 'ball', protected env: PlayEnv) { this.id = `toy:${kind}`; this.sprite = `toy:${kind}`; }

  /** its picture now */
  abstract pic (): Picture;
  /** may be picked up and thrown */
  get grabbable () { return false; }

  place (x: number, y: number, z = 0) { this.fx = x; this.fy = y; this.z = z; this.snapPos(); }
  protected snapPos () { this.x = snap(this.fx); this.y = snap(this.fy); }

  protected get w () { return this.env.world; }
  protected get herd () { return this.env.herd; }
  protected band () { return this.herd.band; }
  protected emit (p: Particle) { this.herd.emit(p); }
  protected spark (x: number, y: number, col = '#FFFFFF', life = 24) { this.emit({ kind: 'spark', x, y, t: 0, life, col }); }

  /** top-left of the picture, world px */
  protected topLeft () { const p = this.pic(); return { x: this.x - Math.floor(p.w / 2) * ART, y: this.y - p.h * ART + ART - snap(this.z) }; }

  draw (g: Ctx) {
    const p = this.pic(), t = this.topLeft();
    if (this.z > ART && !this.arriving && !this.leaving) { g.fillStyle = this.herd.shadow(); g.fillRect(this.x - Math.floor(p.w / 3) * ART, this.y, Math.max(1, Math.floor(p.w / 1.5)) * ART, ART); }
    if (!this.arriving && !this.leaving) this.env.hint?.(g, p, t.x, t.y);
    draw(g, p, this.env.tone, this.env.light(), t.x, t.y);
  }

  /** where its picture is now, world px */
  area () { const p = this.pic(), t = this.topLeft(); return { x: t.x, y: t.y, w: p.w * ART, h: p.h * ART }; }

  hit (x: number, y: number) {
    if (this.arriving || this.leaving) return false;
    const t = this.topLeft();
    return on(this.pic(), this.env.tone, this.env.light(), t.x, t.y, x, y, 1);
  }

  /** a tap on it; false lets the tap through */
  tap (_x: number, _y: number): boolean { return false; }
  grab () {}
  dragTo (_x: number, _y: number) {}
  /** let go at (x, y) with the finger's speed (world px a tick) */
  throwFrom (_vx: number, _vy: number, _x: number, _y: number) {}

  /** Drop in from the toy box: from above the view (or, in the still picture, just there with sparks). */
  arrive () {
    if (this.env.still()) { this.ring(); return; }
    this.arriving = true; this.bounced = false;
    this.z = this.fy + 12 * ART; this.vz = 0;
  }
  /** Back into the toy box: up and out of the view. */
  leave () {
    this.leaving = true; this.vz = ART;
    if (this.env.still()) { this.ring(); this.done = true; }
  }

  /** the landing: dust both sides, a burst of sparks in the toy box's colours, and everyone near looks and hops */
  protected ring () {
    const p = this.pic(), t = this.topLeft(), cx = this.x, cy = t.y + Math.floor(p.h / 2) * ART;
    const still = this.env.still();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      if (still) { if (i % 3 === 0) this.spark(cx + Math.cos(a) * 9 * ART, cy + Math.sin(a) * 5 * ART, i % 2 ? '#FFC400' : '#FFFFFF', 36); continue; }
      this.emit({ kind: 'bit', x: cx, y: cy, vx: Math.cos(a) * 1.6 * ART, vy: Math.sin(a) * 1.2 * ART - 1.4 * ART, t: 0, life: 26, col: ['#FFC400', '#FFFFFF', '#009688'][i % 3] });
    }
    if (still) return;
    this.emit({ kind: 'dust', x: this.x - Math.floor(p.w / 2) * ART - ART, y: this.y + ART, vx: -1, t: 0, life: 9 });
    this.emit({ kind: 'dust', x: this.x + Math.floor(p.w / 2) * ART, y: this.y + ART, vx: 1, t: 0, life: 9 });
    for (const c of this.herd.creatures) {
      if (!free(c) || c.st !== 'idle' || Math.hypot(c.fx - this.fx, c.fy - this.fy) > 70 * ART) continue;
      face(c, this.fx); hop(c);
    }
  }

  update (_w: World) {
    if (this.leaving) {
      this.vz += 0.25 * ART; this.z += this.vz;
      if (this.w.tick % 2 === 0) { const t = this.topLeft(); this.spark(this.x, t.y + this.pic().h * ART, this.w.tick % 4 ? '#FFFFFF' : '#FFC400', 16); }
      if (this.topLeft().y + this.pic().h * ART < -ART) this.done = true;
      this.snapPos();
      return;
    }
    if (this.arriving) {
      this.vz -= 0.3 * ART; this.z += this.vz;
      if (this.w.tick % 2 === 0 && this.vz < 0) { const t = this.topLeft(); this.spark(this.x - ART, t.y - 2 * ART, this.w.tick % 4 ? '#FFFFFF' : '#FFC400', 14); }
      if (this.z <= 0) {
        this.z = 0;
        if (!this.bounced) { this.bounced = true; this.vz = 1.6 * ART; this.ring(); } else { this.vz = 0; this.arriving = false; }
      }
      this.snapPos();
      return;
    }
    this.play();
    this.snapPos();
  }

  /** its own play, a tick */
  protected play () {}

  /** gone from the playground (put away, or the playground closed): let go of whoever it plays with */
  stop () {}
}

/* ---------------------------------------------------------------- thrown toys: frisbee and stick */

abstract class Thrown extends Toy {
  /** whoever fetches it, and where to bring it */
  protected fetcher: Creature | null = null;
  protected carrying = false;
  protected home = { x: 0, y: 0 };
  protected held = false;
  /** noses left (a legless one pushes the stick along instead of carrying it) */
  protected noses = 0;

  get grabbable () { return !this.arriving && !this.leaving; }
  get moving () { return Math.abs(this.vx) + Math.abs(this.vy) > 0.05 * ART || this.z > 0 || this.vz !== 0; }

  grab () { this.held = true; this.vx = this.vy = this.vz = 0; this.drop(); }
  dragTo (x: number, y: number) {
    const b = this.band(), gy = clamp(y, b.top, b.bottom);
    this.place(clamp(x, 0, this.w.w), gy, this.env.still() ? 0 : Math.max(0, gy - y));
  }
  throwFrom (vx: number, vy: number, x: number, y: number) {
    this.held = false;
    const b = this.band();
    this.home = { x: clamp(x, 10 * ART, this.w.w - 10 * ART), y: clamp(y, b.top, b.bottom) };
    if (this.env.still()) { this.place(this.home.x, this.home.y); this.spark(this.x, this.y - 6 * ART); return; }
    this.launch(vx, vy);
  }
  /** a tap: a short toss toward the middle */
  tap () {
    if (this.arriving || this.leaving || this.carrying) return true;
    if (this.env.still()) { this.spark(this.x, this.y - 6 * ART); return true; }
    this.home = { x: this.fx, y: this.fy };
    const r = this.env.rng;
    this.launch((this.fx > this.w.w / 2 ? -1 : 1) * (2 + r.next() * 2) * ART, (r.next() - 0.5) * ART);
    return true;
  }
  protected abstract launch (vx: number, vy: number): void;
  /** can this one fetch it now (and how far away it notices, art px)? */
  protected abstract wants (c: Creature): boolean;
  protected range = 90;

  protected drop () { if (this.fetcher) { release(this.fetcher); this.fetcher = null; } this.carrying = false; }
  stop () { this.drop(); }

  protected physics (gravity: number, keep: number, slide: number) {
    if (this.z > 0 || this.vz) {
      this.vz -= gravity; this.z += this.vz;
      if (this.z <= 0) { this.z = 0; this.vz = Math.abs(this.vz) > 0.8 * ART && keep > 0 ? -this.vz * keep : 0; }
    }
    this.fx += this.vx; this.fy += this.vy;
    const fr = this.z > 0 ? 0.99 : slide;
    this.vx *= fr; this.vy *= fr;
    if (Math.abs(this.vx) < 0.02) this.vx = 0;
    if (Math.abs(this.vy) < 0.02) this.vy = 0;
    const half = this.pic().w * ART / 2, b = this.band();
    if (this.fx < half || this.fx > this.w.w - half) { this.vx = -this.vx; this.fx = clamp(this.fx, half, this.w.w - half); }
    if (this.fy < b.top || this.fy > b.bottom) { this.vy = -this.vy; this.fy = clamp(this.fy, b.top, b.bottom); }
  }

  /** chase it, pick it up (or nose it), bring it back to where it was thrown from, drop it there */
  protected fetch () {
    const w = this.w;
    let c = this.fetcher;
    if (c && (c.isAsleep || c.st === 'held' || c.st === 'fall' || c.st === 'land' || c.busy !== this.id)) { this.drop(); c = null; }
    if (this.carrying && c) {
      // in its mouth, a row in front of it
      const m = mouth(c, w);
      this.fx = m.x; this.fy = c.fy + 1; this.z = Math.max(0, c.fy - m.y - this.pic().h * ART / 2);
      if (c.st === 'idle') {
        // home: put down in front, a happy hop
        this.fy = clamp(c.fy + 4 * ART, this.band().top, this.band().bottom); this.z = 0;
        hop(c); this.drop();
      }
      return;
    }
    if (!c) {
      if (!this.moving && this.noses <= 0) return;
      c = nearest(this.herd, w, this.fx, this.fy, this.range, x => this.wants(x));
      if (!c) return;
      this.fetcher = c; engage(c, this.id);
      c.goTo(this.fx, this.fy, true);
    }
    c.tx = clamp(this.fx - c.dir * 3 * ART, 0, w.w); c.ty = this.fy;
    if (Math.hypot(c.fx - this.fx, c.fy - this.fy) < 7 * ART && this.reachable(c)) this.reached(c);
  }
  protected reachable (_c: Creature) { return this.z < 4 * ART; }
  protected reached (c: Creature) {
    if (c.motion(this.w) === 'scoot') {
      // legless: nose it along a little way, twice, then it lies there
      this.noses = this.noses > 0 ? this.noses - 1 : 1;
      this.vx = c.dir * (1.2 + this.env.rng.next()) * ART; this.vy = (this.env.rng.next() - 0.5) * 0.4 * ART; this.vz = ART;
      hop(c); release(c); this.fetcher = null;
      return;
    }
    this.carrying = true; this.vx = this.vy = this.vz = 0; this.noses = 0;
    c.goTo(this.home.x, this.home.y);
  }
}

export class Frisbee extends Thrown {
  constructor (env: PlayEnv) { super('frisbee', env); this.range = 140; }
  pic () { return FRISBEE; }
  protected launch (vx: number, vy: number) {
    const sp = Math.max(3 * ART, Math.min(7 * ART, Math.hypot(vx, vy)));
    const a = Math.atan2(vy, vx), dir = Math.cos(a) >= 0 ? 1 : -1;
    // it glides: mostly sideways, low and long
    this.vx = dir * sp * Math.max(0.7, Math.abs(Math.cos(a))); this.vy = Math.sin(a) * sp * 0.25; this.z = Math.max(this.z, 8 * ART); this.vz = 0.6 * ART;
  }
  /** flyers first: they catch it in the air; the rest when it's low enough to leap for */
  protected wants (c: Creature) { return !c.mount && (c.motion(this.w) === 'hover' || this.z < 10 * ART); }
  protected reachable (c: Creature) { return c.motion(this.w) === 'hover' || this.z < 10 * ART; }
  protected reached (c: Creature) {
    if (c.motion(this.w) !== 'hover' && this.z > 2 * ART) hop(c);
    super.reached(c);
    if (c.motion(this.w) === 'hover' || c.st === 'happy') this.spark(this.x, this.y - this.z - 4 * ART, '#FFC400');
  }
  protected play () {
    if (this.held) return;
    if (!this.carrying) this.physics(0.05 * ART, 0.2, 0.85);
    this.fetch();
  }
}

export class Stick extends Thrown {
  constructor (env: PlayEnv) { super('stick', env); }
  pic () { return STICK; }
  protected launch (vx: number, vy: number) {
    const sp = Math.min(6 * ART, Math.hypot(vx, vy)), a = Math.atan2(vy, vx);
    this.vx = Math.cos(a) * sp * 0.9; this.vy = Math.sin(a) * sp * 0.35; this.vz = 2.4 * ART + sp * 0.4;
  }
  protected wants (c: Creature) { return pets(this.w)(c) || c.motion(this.w) === 'scoot'; }
  protected play () {
    if (this.held) return;
    if (!this.carrying) this.physics(0.32 * ART, 0, 0.75);
    this.fetch();
  }
}

/* ---------------------------------------------------------------- the kite: always in the toy box */

export class Kite extends Toy {
  /** where it flies, world px (its picture's middle) */
  kx = 0; ky = 0;
  private hx = 0; hy = 0;
  private held = false;
  /** ticks since the finger last moved it: the herd runs under it while this is small */
  private since = 999;
  private followers: Creature[] = [];
  constructor (env: PlayEnv) { super('kite', env); }
  pic () { return KITE; }
  get grabbable () { return !this.arriving && !this.leaving; }

  /** where it flies when nobody holds it: over the meadow, a little left of the stable */
  private homeAt () { const t = this.env.tie(); return { x: clamp(t.x - 50 * ART, 20 * ART, this.w.w - 20 * ART), y: Math.max(this.w.insets.top + 20 * ART, this.env.horizon() - 50 * ART) }; }
  place (x: number, y: number) { super.place(x, y); const h = this.homeAt(); this.hx = h.x; this.hy = h.y; this.kx = h.x; this.ky = h.y; }

  private box () { const p = this.pic(); return { x: this.kx - Math.floor(p.w / 2) * ART, y: this.ky - Math.floor(p.h / 2) * ART - snap(this.z) }; }
  hit (x: number, y: number) {
    if (this.arriving || this.leaving) return false;
    const b = this.box();
    return on(this.pic(), this.env.tone, this.env.light(), b.x, b.y, x, y, 2);
  }
  arrive () { super.arrive(); if (this.arriving) this.z = this.ky + 20 * ART; }
  grab () { this.held = true; this.since = 0; }
  dragTo (x: number, y: number) {
    const top = this.w.insets.top + 8 * ART, low = this.env.horizon() - 16 * ART;
    this.kx = clamp(x, 8 * ART, this.w.w - 8 * ART); this.ky = clamp(y, top, Math.max(top, low)); this.since = 0;
  }
  throwFrom () { this.held = false; this.hx = this.kx; this.hy = this.ky; }
  tap () { if (!this.arriving && !this.leaving) { this.since = 0; this.hx = clamp(this.hx + (this.env.rng.next() - 0.5) * 60 * ART, 20 * ART, this.w.w - 20 * ART); } return true; }

  draw (g: Ctx) {
    const b = this.box(), p = this.pic(), still = this.env.still(), t = still ? 0 : this.w.tick;
    // the string, sagging, from its foot to the post by the stable
    if (!this.leaving) {
      const tie = this.env.tie(), sx = this.kx, sy = b.y + p.h * ART;
      g.fillStyle = this.env.tone('#F5F5F5');
      const n = Math.max(8, Math.round(Math.hypot(tie.x - sx, tie.y - sy) / (2 * ART)));
      for (let i = 0; i <= n; i += 2) {
        const k = i / n, x = sx + (tie.x - sx) * k, y = sy + (tie.y - sy) * k + Math.sin(k * Math.PI) * 6 * ART;
        g.fillRect(snap(x), snap(y), ART, ART);
      }
    }
    // the tail with its bows, waving
    for (let i = 0; i < 6; i++) {
      const x = this.kx - i * ART, y = b.y + (p.h + 1 + i * 2) * ART + (Math.floor((t + i * 5) / 8) % 2) * ART;
      g.fillStyle = this.env.tone('#FFFFFF'); g.fillRect(snap(x), snap(y), ART, ART);
      if (i % 2) { g.fillStyle = this.env.tone('#E53935'); g.fillRect(snap(x) - ART, snap(y), 3 * ART, ART); }
    }
    if (!this.arriving && !this.leaving) this.env.hint?.(g, p, b.x, b.y);
    draw(g, p, this.env.tone, this.env.light(), b.x, b.y);
  }
  area () { const p = this.pic(), b = this.box(); return { x: b.x, y: b.y, w: p.w * ART, h: p.h * ART }; }

  update (w: World) {
    if (this.leaving) {
      this.vz += 0.25 * ART; this.z += this.vz;
      if (w.tick % 2 === 0) this.spark(this.kx, this.box().y + this.pic().h * ART, '#FFFFFF', 16);
      if (this.box().y + this.pic().h * ART * 3 < 0) this.done = true;
      return;
    }
    if (this.arriving) {
      this.z -= 2 * ART;
      if (w.tick % 2 === 0) this.spark(this.kx - ART, this.box().y - 2 * ART, w.tick % 4 ? '#FFFFFF' : '#FFC400', 14);
      if (this.z <= 0) { this.z = 0; this.arriving = false; this.burst(); }
      return;
    }
    this.since++;
    if (!this.held && !this.env.still()) {
      // drifts on the wind around where it was left
      const tx = this.hx + Math.sin(w.tick / 70) * 12 * ART, ty = this.hy + Math.sin(w.tick / 41) * 4 * ART;
      this.kx += (tx - this.kx) * 0.04; this.ky += (ty - this.ky) * 0.04;
    }
    this.lead(w);
  }

  /** while the finger flies it (and a little after), up to three run to stand under it, facing it */
  private lead (w: World) {
    const keen = this.since < 120;
    this.followers = this.followers.filter(c => c.busy === this.id && !c.isAsleep);
    if (!keen) { for (const c of this.followers) release(c); this.followers = []; return; }
    if (w.tick % 15) return;
    if (this.followers.length < 3) {
      const c = nearest(this.herd, w, this.kx, this.band().top, 200, x => !x.mount);
      if (c) { engage(c, this.id); this.followers.push(c); }
    }
    const b = this.band();
    this.followers.forEach((c, i) => {
      const x = clamp(this.kx + (i - 1) * 22 * ART, c.half(w), w.w - c.half(w)), y = b.top + (b.bottom - b.top) * (0.15 + 0.2 * i);
      if (c.st === 'idle' && Math.abs(c.fx - x) < 6 * ART) { face(c, this.kx); c.wait = 999; return; }
      if (c.st === 'idle') c.goTo(x, y);
      else if (c.st === 'move') { c.tx = x; c.ty = y; }
    });
  }

  private burst () {
    const b = this.box(), cx = this.kx, cy = b.y + Math.floor(this.pic().h / 2) * ART;
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; this.emit({ kind: 'bit', x: cx, y: cy, vx: Math.cos(a) * 1.6 * ART, vy: Math.sin(a) * 1.2 * ART - ART, t: 0, life: 24, col: ['#FFC400', '#FFFFFF', '#009688'][i % 3] }); }
    for (const c of this.herd.creatures) if (free(c) && c.st === 'idle') { face(c, this.kx); if (Math.abs(c.fx - this.kx) < 90 * ART) hop(c); }
  }

  stop () { for (const c of this.followers) release(c); this.followers = []; }
}

/* ---------------------------------------------------------------- each playground's own toy */

/** Toys that call one creature over when tapped, and play with it when it gets there. */
abstract class Caller extends Toy {
  protected player: Creature | null = null;
  protected t = 0;
  protected abstract range: number;
  protected eligible (c: Creature) { return !c.mount; }
  /** where the creature stands to play, world px */
  protected spot () { return { x: this.fx, y: this.fy - ART }; }
  tap () {
    if (this.arriving || this.leaving) return true;
    if (this.player) return true;
    const c = nearest(this.herd, this.w, this.fx, this.fy, this.range, x => this.eligible(x));
    if (!c) { this.idleTap(); return true; }
    if (this.env.still()) { this.instant(c); return true; }
    this.player = c; engage(c, this.id); this.t = 0;
    const s = this.spot(); c.goTo(s.x, s.y, true);
    return true;
  }
  /** nobody can come: the toy on its own (a wobble, a spark) */
  protected idleTap () { this.spark(this.x, this.topLeft().y - 2 * ART); }
  /** the still picture: what playing ends with, at once */
  protected instant (_c: Creature) { this.spark(this.x, this.topLeft().y - 2 * ART, '#FFC400'); }
  protected gone (c: Creature) { return c.busy !== this.id || c.isAsleep || c.st === 'held' || c.st === 'fall' || c.st === 'land'; }
  protected play () {
    const c = this.player;
    if (!c) return this.alone();
    if (this.gone(c)) { this.end(); return; }
    this.t++;
    if (c.st === 'chase') {
      const s = this.spot(); c.tx = s.x; c.ty = s.y;
      if (Math.hypot(c.fx - s.x, c.fy - s.y) < 2 * ART) { c.idle(9999); this.t = 0; this.begin(c); }
      else if (this.t > 300) this.end();
      return;
    }
    // it stays to play: no wandering off until it's done
    if (c.st === 'idle') c.wait = Math.max(c.wait, 999);
    this.with(c);
  }
  protected alone () {}
  protected abstract begin (c: Creature): void;
  protected abstract with (c: Creature): void;
  protected end () { release(this.player); this.player = null; this.t = 0; }
  stop () { this.end(); }
}

/** Meadow: a hay pile. The one called runs over, dives in with a spray of hay, and pops out a moment later. */
export class HayPile extends Caller {
  protected range = 140;
  constructor (env: PlayEnv) { super('hay', env); }
  pic () { return HAY_PILE; }
  private inside = false;
  protected spot () { return { x: this.fx, y: this.fy - 2 * ART }; }
  protected begin (c: Creature) {
    this.inside = true;
    c.setPos(this.fx + (this.env.rng.next() - 0.5) * 6 * ART, this.fy - ART);
    c.clipBelow = this.topLeft().y + 3 * ART;
    this.hay(10);
  }
  protected with (c: Creature) {
    const s = c.pic(this.w);
    const deep = s ? painted(s).bottom - painted(s).top + ART : 30 * ART;
    if (this.t <= 8) c.off = -snap(deep * this.t / 8);
    if (this.t > 8 && this.t % 12 === 0) this.hay(2);
    if (this.t === 50) {
      c.off = 0; c.clipBelow = undefined;
      c.setPos(this.fx + (this.env.rng.chance(0.5) ? -1 : 1) * 14 * ART, clamp(this.fy + 6 * ART, this.band().top, this.band().bottom));
      hop(c); this.hay(12);
      this.end();
    }
  }
  private hay (n: number) {
    const t = this.topLeft();
    for (let i = 0; i < n; i++) this.emit({ kind: 'bit', x: this.x + (this.env.rng.next() - 0.5) * 14 * ART, y: t.y + 2 * ART, vx: (this.env.rng.next() - 0.5) * 2.4 * ART, vy: -(1 + this.env.rng.next() * 1.6) * ART, t: 0, life: 22, col: this.env.tone(i % 2 ? '#E3C565' : '#C9A63F') });
  }
  draw (g: Ctx) {
    // it shivers while someone is inside
    const wob = this.inside && this.player && this.t > 8 && Math.floor(this.t / 4) % 2 ? ART : 0;
    this.x += wob; super.draw(g); this.x -= wob;
  }
  protected end () { this.inside = false; super.end(); }
}

/** Lakeside: flat stones. A tap skips one across the lake, ring after ring; the nearest go to the shore to watch. */
export class Stones extends Toy {
  private stone: { x: number, y: number, vx: number, hops: number, t: number, gap: number } | null = null;
  private rings: { x: number, y: number, t: number }[] = [];
  private watchers: Creature[] = [];
  private quiet = 0;
  constructor (env: PlayEnv) { super('stones', env); }
  pic () { return STONES; }
  tap () {
    if (this.arriving || this.leaving || this.stone) return true;
    const water = this.env.horizon() - 6 * ART, dir = this.fx < this.w.w / 2 ? 1 : -1;
    if (this.env.still()) { this.rings.push({ x: this.fx + dir * 40 * ART, y: water, t: 0 }); this.spark(this.fx + dir * 40 * ART, water - 3 * ART); return true; }
    this.stone = { x: this.fx, y: this.topLeft().y, vx: dir * 2.2 * ART, hops: 4, t: 0, gap: 22 };
    for (const c of [...this.herd.creatures].filter(c => free(c) && !c.mount).sort((a, b) => Math.abs(a.fx - this.fx) - Math.abs(b.fx - this.fx)).slice(0, 2)) {
      engage(c, this.id); this.watchers.push(c);
      c.goTo(clamp(this.fx + dir * (30 + 26 * this.watchers.length) * ART, c.half(this.w), this.w.w - c.half(this.w)), this.band().top);
    }
    return true;
  }
  protected play () {
    const s = this.stone, water = this.env.horizon() - 6 * ART;
    if (s) {
      s.t++; s.x += s.vx;
      // a low arc to the water, then shorter and shorter skips
      const k = Math.min(1, s.t / s.gap), base = s.hops === 4 ? this.topLeft().y + (water - this.topLeft().y) * k : water;
      s.y = base - Math.sin(k * Math.PI) * (s.hops === 4 ? 14 : 2 + s.hops * 2) * ART;
      if (s.t >= s.gap) {
        this.rings.push({ x: s.x, y: water, t: 0 });
        s.hops--; s.t = 0; s.gap = Math.max(6, Math.round(s.gap * 0.6)); s.vx *= 0.8;
        if (s.hops < 0 || s.x < 4 * ART || s.x > this.w.w - 4 * ART) {
          for (let i = 0; i < 5; i++) this.emit({ kind: 'bit', x: s.x, y: water, vx: (i - 2) * 0.5 * ART, vy: -1.4 * ART, t: 0, life: 14, col: this.env.tone('#E1F5FE') });
          this.stone = null; this.quiet = 60;
        }
      }
    } else if (this.quiet > 0 && --this.quiet === 0) { for (const c of this.watchers) release(c); this.watchers = []; }
    for (const c of this.watchers) if (c.st === 'idle') { c.wait = 999; face(c, s ? s.x : this.fx); }
    for (const r of this.rings) r.t++;
    this.rings = this.rings.filter(r => r.t < 36);
    if (s || this.rings.length) this.env.over(g => this.water(g));
  }
  private water (g: Ctx) {
    const tone = this.env.tone, light = this.env.light();
    for (const r of this.rings) {
      const rx = 2 + Math.floor(r.t / 6), col = tone(r.t < 18 ? '#FFFFFF' : '#B3E5FC');
      g.fillStyle = col;
      for (let i = -rx; i <= rx; i++) {
        const dy = Math.round(Math.sqrt(Math.max(0, 1 - (i * i) / (rx * rx))) * Math.max(1, rx / 3));
        if (Math.abs(i) === rx || (i + r.t) % 2 === 0) { g.fillRect(snap(r.x) + i * ART, snap(r.y) - dy * ART, ART, ART); g.fillRect(snap(r.x) + i * ART, snap(r.y) + dy * ART, ART, ART); }
      }
    }
    if (this.stone) draw(g, STONE, tone, light, this.stone.x - 2 * ART, this.stone.y - 2 * ART);
  }
  stop () { for (const c of this.watchers) release(c); this.watchers = []; this.stone = null; }
}

/** Pine hill: pine cones. A tap rolls one out of the pile; a pet chases it and bats it back toward the pile. */
export class PineCones extends Toy {
  private cones: Cone[] = [];
  constructor (env: PlayEnv) { super('cones', env); }
  pic () { return CONE_PILE; }
  tap () {
    if (this.arriving || this.leaving || this.cones.length >= 3) return true;
    const r = this.env.rng, dir = r.chance(0.5) ? 1 : -1;
    if (this.env.still()) { this.spark(this.x + dir * 12 * ART, this.y - 4 * ART); return true; }
    this.cones.push(this.cone(this.fx + dir * 4 * ART, this.fy, dir * (1.6 + r.next() * 1.4) * ART, (r.next() - 0.5) * 1.2 * ART));
    return true;
  }
  /** the cones out of the pile now, as species' ball play sees them */
  rollers (): Roller[] { return this.cones.map(k => k.roll); }
  /** a cone rolling out of the pile; species' ball play (ballplay.ts) can carry, push or pounce on it like the ball */
  private cone (x: number, y: number, vx: number, vy: number): Cone {
    const toy = this;
    const k: Cone = {
      x, y, z: 4 * ART, vx, vy, vz: 2 * ART, chaser: null, bats: 0, held: false, rest: 0,
      roll: {
        get x () { return k.x; }, get y () { return k.y; }, get z () { return k.z; }, get moving () { return moving(k); },
        size: 4 * ART, tag: this.id,
        hold: at => { if (at) { k.held = true; k.vx = k.vy = k.vz = 0; k.x = at.x; k.y = at.y; k.z = at.z; } else k.held = false; },
        send: (vx, vy, vz) => { k.vx = vx; k.vy = vy; k.vz = vz; },
        bat: c => toy.batBack(k, c),
        gone: () => toy.leaving || !toy.cones.includes(k),
        from: () => ({ x: toy.fx, y: toy.fy }),
      },
    };
    return k;
  }
  /** batted back toward the pile, with a happy hop */
  private batBack (k: Cone, c: Creature) {
    const d = Math.sign(this.fx - k.x) || 1;
    k.vx = d * (0.8 + Math.min(2, Math.abs(this.fx - k.x) / (40 * ART))) * ART; k.vy = (this.fy - k.y) / (40 * ART) * ART; k.vz = 1.6 * ART; k.bats++;
    hop(c);
  }
  protected play () {
    const b = this.band(), w = this.w, plays = this.herd.plays;
    for (const k of this.cones) {
      // carried, pushed or on a nose: the one playing with it moves it
      if (k.held || plays.playing(k.roll)) continue;
      if (k.z > 0 || k.vz) { k.vz -= 0.3 * ART; k.z += k.vz; if (k.z <= 0) { k.z = 0; k.vz = Math.abs(k.vz) > ART ? -k.vz * 0.4 : 0; } }
      k.x += k.vx; k.y += k.vy; const fr = k.z > 0 ? 0.99 : 0.9; k.vx *= fr; k.vy *= fr;
      if (k.x < 4 * ART || k.x > w.w - 4 * ART) { k.vx = -k.vx; k.x = clamp(k.x, 4 * ART, w.w - 4 * ART); }
      if (k.y < b.top || k.y > b.bottom) { k.vy = -k.vy; k.y = clamp(k.y, b.top, b.bottom); }
      let c = k.chaser;
      if (c && c.busy !== this.id) { k.chaser = c = null; }
      if (!c && moving(k) && k.bats < 3) {
        c = nearest(this.herd, w, k.x, k.y, 80, pets(w));
        if (c) { k.chaser = c; engage(c, this.id); c.goTo(k.x, k.y, true); }
      }
      if (!c) continue;
      c.tx = clamp(k.x - c.dir * 3 * ART, 0, w.w); c.ty = k.y;
      // a pouncer crouches to spring at it, a fetcher or a pusher takes it over on reaching it (ballplay.ts)
      if (plays.near(c, k.roll)) { k.chaser = null; continue; }
      if (Math.hypot(c.fx - k.x, c.fy - k.y) < 6 * ART && k.z < 4 * ART) {
        k.chaser = null;
        if (plays.reach(c, k.roll)) continue;
        this.batBack(k, c); release(c);
      }
    }
    // a cone back at the pile, or lying still after its bats, rolls home into it (unless someone is playing with it);
    // one left lying away from the pile (put down by a fetcher, pushed off) rolls back to it after a while
    this.cones = this.cones.filter(k => {
      if (k.held || plays.playing(k.roll)) { k.rest = 0; return true; }
      const still = !moving(k) && k.z === 0;
      const home = Math.abs(k.x - this.fx) < 14 * ART && Math.abs(k.y - this.fy) < 8 * ART;
      k.rest = still && !k.chaser ? k.rest + 1 : 0;
      if (k.rest > 90 && !home) { k.bats = 3; k.rest = 0; k.vx = (this.fx - k.x) / 9; k.vy = (this.fy - k.y) / 9; return true; }
      if (!((home && still) || (still && k.bats >= 3 && home))) return true;
      this.drop(k);
      return false;
    });
    if (this.cones.length) this.env.over(g => { for (const k of this.cones) draw(g, CONE, this.env.tone, this.env.light(), k.x - 2 * ART, k.y - 4 * ART - snap(k.z)); });
  }
  /** a cone gone: whoever plays with it lets go */
  private drop (k: Cone) {
    const c = k.chaser;
    k.chaser = null;
    this.herd.plays.stop(k.roll);
    if (c && !this.herd.plays.has(c)) release(c);
  }
  stop () { const ks = this.cones; this.cones = []; for (const k of ks) this.drop(k); }
}
interface Cone { x: number, y: number, z: number, vx: number, vy: number, vz: number, chaser: Creature | null, bats: number, held: boolean, rest: number, roll: Roller }
const moving = (k: Cone) => Math.abs(k.vx) + Math.abs(k.vy) > 0.1 * ART || k.z > 0;

/** Sandy cove: the sandcastle. A tap calls a pet to dig, and it grows a step; when it's a castle, a pet stomps it flat. */
export class Sandcastle extends Caller {
  protected range = 160;
  stage = 0;
  constructor (env: PlayEnv) { super('sandcastle', env); }
  pic () { return SANDCASTLE[this.stage]; }
  protected spot () { return { x: this.fx + (this.stage === 2 ? 0 : 14 * ART), y: this.fy + (this.stage === 2 ? 2 * ART : ART) }; }
  protected instant () { this.grow(); }
  protected begin (c: Creature) { face(c, this.fx); if (this.stage === 2) { hop(c); } }
  protected with (c: Creature) {
    if (this.stage === 2) {
      // a stomp: it lands on it, dust, a mound again
      if (this.t === 6) {
        this.stage = 0; this.sand(14);
        this.emit({ kind: 'dust', x: this.x - 10 * ART, y: this.y + ART, vx: -1, t: 0, life: 9 });
        this.emit({ kind: 'dust', x: this.x + 9 * ART, y: this.y + ART, vx: 1, t: 0, life: 9 });
      }
      if (this.t > 16) { hop(c); this.end(); }
      return;
    }
    // digging: sand flies, a hop now and then, then the next step
    if (this.t % 4 === 0) this.sand(2);
    if (this.t % 16 === 0 && c.st === 'idle') hop(c);
    if (this.t >= 48) { this.grow(); this.end(); }
  }
  private grow () {
    this.stage = this.stage === 2 ? 0 : this.stage + 1;
    const t = this.topLeft();
    this.spark(this.x - 4 * ART, t.y - 2 * ART, '#FFC400'); this.spark(this.x + 6 * ART, t.y, '#FFFFFF');
  }
  private sand (n: number) {
    const r = this.env.rng;
    for (let i = 0; i < n; i++) this.emit({ kind: 'bit', x: this.x + (r.next() - 0.3) * 18 * ART, y: this.y - 2 * ART, vx: (r.next() - 0.5) * 2 * ART, vy: -(0.8 + r.next() * 1.4) * ART, t: 0, life: 18, col: this.env.tone(i % 2 ? '#E6C98A' : '#C9A86A') });
  }
}

/** Bamboo grove: the spinning top. A tap spins it; it wanders, the nearest follow it round, then it tips over. */
export class SpinningTop extends Toy {
  private spin = 0;
  private down = 0;
  private followers: Creature[] = [];
  constructor (env: PlayEnv) { super('top', env); }
  pic () { return this.down > 0 ? TOP_DOWN : TOP[this.spin > 0 ? Math.floor(this.spin / 2) % 2 : 0]; }
  tap () {
    if (this.arriving || this.leaving || this.spin > 0 || this.down > 0) return true;
    if (this.env.still()) { this.spark(this.x, this.y - 6 * ART, '#FFC400'); return true; }
    const r = this.env.rng;
    this.spin = 150; this.vx = (r.chance(0.5) ? 1 : -1) * 0.6 * ART; this.vy = (r.next() - 0.5) * 0.4 * ART;
    for (const c of [...this.herd.creatures].filter(c => free(c) && !c.mount && Math.hypot(c.fx - this.fx, c.fy - this.fy) < 90 * ART).slice(0, 2)) { engage(c, this.id); this.followers.push(c); }
    return true;
  }
  protected play () {
    const b = this.band(), w = this.w;
    if (this.spin > 0) {
      this.spin--;
      // a wobbly path
      this.vx += Math.sin(w.tick / 9) * 0.05 * ART;
      this.fx += this.vx; this.fy += this.vy;
      const half = 4 * ART;
      if (this.fx < half || this.fx > w.w - half) { this.vx = -this.vx; this.fx = clamp(this.fx, half, w.w - half); }
      if (this.fy < b.top || this.fy > b.bottom) { this.vy = -this.vy; this.fy = clamp(this.fy, b.top, b.bottom); }
      if (w.tick % 20 === 0) this.followers.forEach((c, i) => {
        if (c.busy !== this.id) return;
        const a = w.tick / 30 + i * Math.PI;
        const x = clamp(this.fx + Math.cos(a) * 24 * ART, c.half(w), w.w - c.half(w)), y = clamp(this.fy + Math.sin(a) * 8 * ART, b.top, b.bottom);
        if (c.st === 'idle') { c.goTo(x, y); c.wait = 999; } else if (c.st === 'move') { c.tx = x; c.ty = y; }
      });
      if (this.spin === 0) {
        this.down = 60;
        this.emit({ kind: 'dust', x: this.x - 4 * ART, y: this.y + ART, vx: -1, t: 0, life: 9 });
        for (const c of this.followers) if (c.busy === this.id) { face(c, this.fx); if (c.st === 'idle') hop(c); }
      }
    } else if (this.down > 0 && --this.down === 0) { for (const c of this.followers) release(c); this.followers = []; }
    for (const c of this.followers) if (c.busy === this.id && c.st === 'idle') c.wait = Math.max(c.wait, 999);
  }
  stop () { for (const c of this.followers) release(c); this.followers = []; this.spin = 0; this.down = 0; }
}

/** Misty marsh: the bubble pot. A tap blows bubbles; pets chase them and pop them with a hop. */
export class BubblePot extends Toy {
  private bubbles: { x: number, y: number, z: number, top: number, t: number, ph: number, chaser: Creature | null }[] = [];
  private blowing = 0;
  constructor (env: PlayEnv) { super('bubbles', env); }
  pic () { return BUBBLE_POT; }
  tap () {
    if (this.arriving || this.leaving || this.blowing) return true;
    if (this.env.still()) { this.spark(this.x, this.topLeft().y - 3 * ART, '#B3E5FC'); return true; }
    this.blowing = 36;
    return true;
  }
  protected play () {
    const r = this.env.rng, w = this.w, b = this.band();
    if (this.blowing > 0) {
      if (this.blowing % 6 === 0) this.bubbles.push({ x: this.fx, y: clamp(this.fy + (r.next() - 0.3) * 20 * ART, b.top, b.bottom), z: 8 * ART, top: (12 + r.next() * 16) * ART, t: 0, ph: r.next() * 6, chaser: null });
      this.blowing--;
    }
    for (const u of this.bubbles) {
      u.t++;
      if (u.z < u.top) u.z += 0.4 * ART;
      u.x += Math.sin(u.t / 20 + u.ph) * 0.5 * ART + (u.x < w.w / 2 ? 0.25 : -0.25) * ART * (u.t < 60 ? 1 : 0.3);
      let c = u.chaser;
      if (c && c.busy !== this.id) u.chaser = c = null;
      if (!c && u.t > 20) {
        c = nearest(this.herd, w, u.x, u.y, 90, x => !x.mount);
        if (c) { u.chaser = c; engage(c, this.id); c.goTo(u.x, u.y, true); }
      }
      if (c) {
        c.tx = clamp(u.x, c.half(w), w.w - c.half(w)); c.ty = u.y;
        if (Math.abs(c.fx - u.x) < 5 * ART && Math.abs(c.fy - u.y) < 5 * ART) {
          hop(c); release(c); u.chaser = null; u.t = 9999;
          this.spark(u.x - ART, u.y - u.z - 2 * ART, '#E1F5FE', 18);
        }
      }
    }
    this.bubbles = this.bubbles.filter(u => {
      if (u.t < 300) return true;
      release(u.chaser);
      if (u.t < 9999) this.spark(u.x - ART, u.y - u.z - 2 * ART, '#E1F5FE', 12);
      return false;
    });
    if (this.bubbles.length) this.env.over(g => { for (const u of this.bubbles) draw(g, BUBBLE, this.env.tone, this.env.light(), u.x - 2 * ART, u.y - u.z - 4 * ART); });
  }
  stop () { for (const u of this.bubbles) release(u.chaser); this.bubbles = []; this.blowing = 0; }
}

/** Mushroom glade: the bouncy cap. A tap calls a pet, who climbs on and bounces three times, spinning, then hops off. */
export class BouncyCap extends Caller {
  protected range = 160;
  private bounces = 0;
  private squash = 0;
  constructor (env: PlayEnv) { super('cap', env); }
  pic () { return CAP[this.squash > 0 ? 1 : 0]; }
  protected spot () { return { x: this.fx + 14 * ART, y: this.fy + 2 * ART }; }
  protected begin (c: Creature) {
    c.setPos(this.fx, this.fy + ART);
    c.off = (this.pic().h - 4) * ART;
    this.bounces = 0; this.boing(c);
  }
  private boing (c: Creature) { c.st = 'spin'; c.t = 0; c.tx = c.fx; c.ty = c.fy; this.squash = 3; this.bounces++; }
  protected with (c: Creature) {
    if (this.squash > 0) this.squash--;
    c.off = (this.pic().h - 4) * ART;
    if (c.st !== 'idle') return;
    if (this.bounces < 3) { this.boing(c); return; }
    c.off = 0;
    c.setPos(clamp(this.fx + (this.env.rng.chance(0.5) ? -1 : 1) * 16 * ART, c.half(this.w), this.w.w - c.half(this.w)), clamp(this.fy + 4 * ART, this.band().top, this.band().bottom));
    hop(c); this.end();
  }
  protected instant (c: Creature) { this.spark(this.x, this.topLeft().y - 3 * ART, '#FFC400'); this.spark(c.x, c.y - 30 * ART); }
  protected idleTap () { this.squash = 4; this.spark(this.x, this.topLeft().y - 2 * ART); }
  protected alone () { if (this.squash > 0) this.squash--; }
}

export function ownToy (kind: OwnToy, env: PlayEnv): Toy {
  switch (kind) {
    case 'hay': return new HayPile(env);
    case 'stones': return new Stones(env);
    case 'cones': return new PineCones(env);
    case 'sandcastle': return new Sandcastle(env);
    case 'top': return new SpinningTop(env);
    case 'bubbles': return new BubblePot(env);
    case 'cap': return new BouncyCap(env);
  }
}
export function boxToy (kind: Exclude<BoxToy, 'ball'>, env: PlayEnv): Toy {
  return kind === 'frisbee' ? new Frisbee(env) : kind === 'stick' ? new Stick(env) : new Kite(env);
}
