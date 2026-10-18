/* Play in a playground (Vlad, 2026-10-15): hide and seek behind the scene's one hiding spot, the playground's
 * own toy that always stands there, and the toy box's toys (ball, frisbee, stick, kite) that drop in from the
 * sky when chosen and fly back up when put away.
 *
 * App only: the herd on the wallpaper (android/verdict StableHerd) has no ball, toys or hiding, and Herd itself
 * plays none of this unless a Play is attached, so the herd the wallpaper replays tick by tick is unchanged. */
import { ART } from '../particles';
import { Creature, type Herd } from '../creatures';
import { TICK_MS } from '../frame';
import { BALL_SIZE } from '../ball';
import type { Rng } from '../rng';
import type { Interaction, Stage, WorldPoint } from '../stage';
import type { Ctx, Entity, Layer, World } from '../world';
import type { SceneLayer } from '../scenes/layer';
import type { SceneId } from '../scenes/palettes';
import { BALL, BUBBLE_POT, CAP, CONE_PILE, FRISBEE, HAY_PILE, KITE, SANDCASTLE, SPOTS, STICK, STONES, TOP, draw, on, type Picture } from './art';
import type { HintBox, Hints } from './hint';
import { Toy, boxToy, engage, hop, ownToy, painted, release, type BoxToy, type OwnToy, type PlayEnv } from './toys';

export { SPOTS, look, type Picture } from './art';
export type { BoxToy, OwnToy, ToyKind } from './toys';
export { Toy } from './toys';
export { Hints, HINT_STYLES, type HintStyle } from './hint';

/** each playground's own toy, always there */
export const OWN_TOY: Record<SceneId, OwnToy> = {
  meadow: 'hay', lake: 'stones', pine: 'cones', cove: 'sandcastle', bamboo: 'top', marsh: 'bubbles', mushroom: 'cap',
};
export const BOX_TOYS: readonly BoxToy[] = ['ball', 'frisbee', 'stick', 'kite'];
/** each toy's picture (the toy box shows them) */
export const TOY_ART: Record<BoxToy | OwnToy, Picture> = {
  ball: BALL, frisbee: FRISBEE, stick: STICK, kite: KITE,
  hay: HAY_PILE, stones: STONES, cones: CONE_PILE, sandcastle: SANDCASTLE[2], top: TOP[0], bubbles: BUBBLE_POT, cap: CAP[0],
};

/** where the hiding spot and the own toy stand: x across the world, y down the walking band, 0..1 */
const PLACES: Record<SceneId, { spot: [number, number], toy: [number, number] }> = {
  meadow: { spot: [0.36, 0.08], toy: [0.32, 0.6] },
  lake: { spot: [0.42, 0.08], toy: [0.27, 0.05] },
  pine: { spot: [0.3, 0.1], toy: [0.32, 0.66] },
  cove: { spot: [0.34, 0.08], toy: [0.34, 0.6] },
  bamboo: { spot: [0.32, 0.1], toy: [0.32, 0.64] },
  marsh: { spot: [0.38, 0.1], toy: [0.32, 0.66] },
  mushroom: { spot: [0.3, 0.12], toy: [0.32, 0.6] },
};

const snap = (v: number) => Math.round(v / ART) * ART;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The scene's hiding spot: scenery that stands among the creatures (one may hide behind it). */
export class HidingSpot implements Entity {
  readonly id = 'hiding-spot';
  readonly sprite = 'hiding-spot';
  x = 0; y = 0;
  /** ticks left of a rustle */
  wobble = 0;
  constructor (readonly scene: SceneId, private env: PlayEnv) {}
  get name () { return SPOTS[this.scene].name; }
  topLeft () { const p = SPOTS[this.scene].pic; return { x: this.x - Math.floor(p.w / 2) * ART, y: this.y - p.h * ART + ART }; }
  /** where its solid part starts, world y: a hider shows above this */
  solidTop () { return this.topLeft().y + SPOTS[this.scene].solid * ART; }
  draw (g: Ctx) {
    const t = this.topLeft(), dx = this.wobble > 0 && Math.floor(this.wobble / 2) % 2 ? ART : 0, p = SPOTS[this.scene].pic;
    this.env.hint?.(g, p, t.x + dx, t.y);
    draw(g, p, this.env.tone, this.env.light(), t.x + dx, t.y);
  }
  area () { const p = SPOTS[this.scene].pic, t = this.topLeft(); return { x: t.x, y: t.y, w: p.w * ART, h: p.h * ART }; }
  hit (x: number, y: number) { const t = this.topLeft(); return on(SPOTS[this.scene].pic, this.env.tone, this.env.light(), t.x, t.y, x, y); }
  update () { if (this.wobble > 0) this.wobble--; }
}

export interface PlayOptions {
  world: World;
  herd: Herd;
  layer: SceneLayer;
  scene: SceneId;
  rng: Rng;
  still: () => boolean;
  /** who should hide now, if anyone (asked every couple of seconds while nobody hides) */
  seek?: () => string | undefined;
  /** the hider was found (by a tap, or the sheet's Find) */
  onFound?: (id: string) => void;
  /** someone went to hide or came out (found, dusk, or it left): what TalkBack hears changes */
  onHiding?: () => void;
  /** marks what can be tapped (hint.ts) */
  hints?: Hints;
}

export class Play implements Layer {
  readonly id = 'play';
  readonly depth = 'front' as const;
  readonly env: PlayEnv;
  readonly own: Toy;
  readonly spot: HidingSpot;
  /** the toy box's toys out now (the ball is the herd's own) */
  readonly toys = new Map<Exclude<BoxToy, 'ball'>, Toy>();
  private leaving: Toy[] = [];
  /** who hides behind the spot now */
  hider: Creature | null = null;
  private hiderDx = 0;
  /** the hider is still on its way to the spot (ticks so far) */
  private walking = -1;
  private overs: ((g: Ctx) => void)[] = [];
  private placed = false;
  /** the world's width and walking band at the last resize */
  private last: { w: number, top: number, bottom: number } | null = null;
  private held: { toy: Toy, trail: { x: number, y: number, t: number }[] } | null = null;

  constructor (private o: PlayOptions) {
    const layer = o.layer;
    this.env = {
      world: o.world, herd: o.herd, rng: o.rng, still: o.still,
      tone: c => layer.tone(c), light: () => layer.lightKey(), horizon: () => layer.horizon(o.world),
      tie: () => { const l = layer.lantern(o.world); return { x: l.x, y: l.y - 10 * ART }; },
      over: fn => { this.overs.push(fn); },
      hint: (g, p, x, y) => o.hints?.picture(g, o.world, p, this.env.tone, this.env.light(), x, y),
    };
    this.own = ownToy(OWN_TOY[o.scene], this.env);
    this.spot = new HidingSpot(o.scene, this.env);
    o.world.add(this.spot); o.world.add(this.own);
    o.world.addLayer(this);
  }

  private get w () { return this.o.world; }
  private get herd () { return this.o.herd; }

  resize (w: World) {
    if (w.w <= 1) return;
    const b = this.herd.band, P = PLACES[this.o.scene];
    const at = ([x, y]: [number, number]) => ({ x: snap(x * w.w), y: snap(b.top + y * (b.bottom - b.top)) });
    const s = at(P.spot), t = at(P.toy);
    this.spot.x = s.x; this.spot.y = s.y;
    this.own.place(t.x, t.y);
    if (!this.placed) {
      this.placed = true;
      for (const toy of this.toys.values()) this.drop(toy);
    } else if (this.last) {
      // the toys lying about keep their place in the meadow, as the herd does
      const o = this.last;
      for (const toy of this.toys.values()) {
        toy.place(toy.fx / Math.max(1, o.w) * w.w, b.top + (toy.fy - o.top) / Math.max(1, o.bottom - o.top) * (b.bottom - b.top));
      }
    }
    this.last = { w: w.w, top: b.top, bottom: b.bottom };
    if (this.hider) this.pose(this.hider);
  }

  /** the hiding spot and the toys lying about, world px (the hints' glint) */
  things (): HintBox[] {
    const out: HintBox[] = [this.spot.area(), this.own.area()];
    for (const t of this.toys.values()) if (!t.arriving && !t.leaving) out.push(t.area());
    const b = this.herd.ball;
    if (b && !b.hidden) out.push({ x: b.x - Math.floor(BALL_SIZE / 2 / ART) * ART, y: b.y - BALL_SIZE - Math.round(b.z / ART) * ART, w: BALL_SIZE, h: BALL_SIZE });
    return out;
  }

  /* ---- the toy box */
  /** what's out of the toy box now */
  out (): BoxToy[] { return BOX_TOYS.filter(k => this.has(k)); }
  has (k: BoxToy) { return k === 'ball' ? !!this.herd.ball && !this.herd.ball.hidden : this.toys.has(k); }

  /** Opening a playground: these are out, the rest in the box (nothing drops in). */
  setOut (kinds: readonly BoxToy[]) {
    if (this.herd.ball) this.herd.ball.hidden = !kinds.includes('ball');
    for (const k of BOX_TOYS) if (k !== 'ball' && kinds.includes(k)) this.add(k, false);
  }

  /** Take it out of the toy box: it drops in from the sky (animate) or is simply there (opening a playground). */
  add (k: BoxToy, animate = true) {
    if (this.has(k)) return;
    if (k === 'ball') {
      const ball = this.herd.ball;
      if (!ball) return;
      ball.hidden = false;
      if (this.placed) {
        const p = this.freeSpot();
        // dropped from above the view: it falls, bounces, and the nearest pet goes after it
        ball.place(p.x, p.y, animate && !this.o.still() ? p.y + 12 * ART : 0);
        ball.vx = ball.vy = ball.vz = 0;
        if (animate) this.sparks(p.x, p.y - 8 * ART);
      }
      return;
    }
    const toy = boxToy(k, this.env);
    this.toys.set(k, toy);
    this.w.add(toy);
    if (this.placed) { this.drop(toy); if (animate) toy.arrive(); }
  }

  /** Put it back in the toy box: it flies up and away. */
  remove (k: BoxToy) {
    if (k === 'ball') {
      const ball = this.herd.ball;
      if (!ball || ball.hidden) return;
      this.sparks(ball.x, ball.y - 8 * ART);
      ball.hidden = true; ball.held = false;
      return;
    }
    const toy = this.toys.get(k);
    if (!toy) return;
    if (this.held?.toy === toy) this.held = null;
    this.toys.delete(k);
    toy.stop(); toy.leave();
    if (toy.done) this.w.remove(toy); else this.leaving.push(toy);
  }

  private drop (toy: Toy) { const p = this.freeSpot(); toy.place(p.x, p.y); }

  /** somewhere on the ground away from everyone and everything */
  private freeSpot () {
    const w = this.w, b = this.herd.band, r = this.o.rng;
    let best = { x: w.w / 2, y: (b.top + b.bottom) / 2 }, bestD = -1;
    const others: { x: number, y: number }[] = [
      ...this.herd.creatures.map(c => ({ x: c.fx, y: c.fy })), { x: this.own.fx, y: this.own.fy }, { x: this.spot.x, y: this.spot.y },
      ...[...this.toys.values()].map(t => ({ x: t.fx, y: t.fy })),
    ];
    for (let i = 0; i < 12; i++) {
      const p = { x: snap(w.w * (0.25 + r.next() * 0.45)), y: snap(b.top + (b.bottom - b.top) * (0.35 + r.next() * 0.5)) };
      const d = Math.min(...others.map(o => Math.hypot((o.x - p.x) / 2, o.y - p.y)), 1e9);
      if (d > bestD) { bestD = d; best = p; }
    }
    return best;
  }

  private sparks (x: number, y: number) {
    for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; this.herd.emit({ kind: 'spark', x: x + Math.cos(a) * 8 * ART, y: y + Math.sin(a) * 5 * ART, t: 0, life: 24, col: i % 2 ? '#FFC400' : '#FFFFFF' }); }
  }

  /* ---- hide and seek */
  /** daytime: from morning until dusk (at dusk everyone heads home) */
  daytime () { return !this.herd.night() && !this.herd.dusk(); }

  /**
   * This one hides behind the spot (a pet that's free to play): at once (the playground opening), or walking
   * there first (walk, someone hiding while you watch). False if it can't now.
   */
  hide (id: string, walk = false) {
    const c = this.herd.byId(id);
    if (!c || c.mount || c.busy || c.isAsleep || !this.daytime() || this.hider) return false;
    if (c.st === 'held' || c.st === 'fall' || c.st === 'land') return false;
    this.hider = c; this.hiderDx = snap((this.o.rng.next() - 0.5) * 12 * ART);
    engage(c, 'hide');
    if (walk && !this.o.still()) { this.walking = 0; c.goTo(this.spot.x + this.hiderDx, this.spot.y - ART); } else this.pose(c);
    this.o.onHiding?.();
    return true;
  }

  /** behind the spot, sunk so only the top 40% of its painted pixels show (ears, eyes, a tail tip) */
  private pose (c: Creature) {
    const w = this.w, s = c.pic(w);
    c.idle(1e9); c.leg = 0; c.lean = 0;
    c.setPos(this.spot.x + this.hiderDx, this.spot.y - ART); c.tx = c.fx; c.ty = c.fy;
    if (!s) return;
    const b = painted(s), base = c.restHeight(w);
    const peek = snap((b.bottom - b.top + 1) * 0.4), solid = this.spot.solidTop();
    c.off = c.y - s.anchor.y - base + b.top - solid + peek;
    c.clipBelow = solid + 2 * ART;
  }

  /** Found (a tap on the spot or on it, or the sheet's Find): it hops out in front with sparkles. */
  found (): string | undefined {
    const c = this.hider;
    if (!c) return undefined;
    this.hider = null; this.walking = -1;
    release(c);
    const b = this.herd.band;
    c.setPos(clamp(this.spot.x + this.hiderDx, c.half(this.w), this.w.w - c.half(this.w)), clamp(this.spot.y + 10 * ART, b.top, b.bottom));
    c.tx = c.fx; c.ty = c.fy;
    if (!this.o.still()) hop(c);
    const p = c.headPoint(this.w);
    this.herd.emit({ kind: 'spark', x: p.x - 6 * ART, y: p.y + 2 * ART, t: 0, life: 30, col: '#FFC400' });
    this.herd.emit({ kind: 'spark', x: p.x + 8 * ART, y: p.y + 4 * ART, t: 0, life: 30, col: '#FFFFFF' });
    this.o.onFound?.(c.id);
    this.o.onHiding?.();
    return c.id;
  }

  /** out from behind the spot without being found (dusk, or it left the playground) */
  unhide () {
    const c = this.hider;
    if (!c) return;
    this.hider = null; this.walking = -1;
    release(c);
    c.setPos(c.fx, clamp(this.spot.y + 6 * ART, this.herd.band.top, this.herd.band.bottom)); c.tx = c.fx; c.ty = c.fy;
    this.o.onHiding?.();
  }

  /** a rustle and a leaf: a hint that someone's there */
  private rustle () {
    const t = this.spot.topLeft(), r = this.o.rng;
    this.spot.wobble = 8;
    for (let i = 0; i < 2; i++) this.herd.emit({ kind: 'bit', x: t.x + (6 + r.next() * 20) * ART, y: t.y + 3 * ART, vx: (r.next() - 0.5) * ART, vy: -1.2 * ART, t: 0, life: 20, col: this.env.tone(SPOT_LEAF[this.o.scene]) });
  }

  /* ---- each tick */
  update (w: World) {
    this.overs = [];
    for (const t of this.leaving) if (t.done) w.remove(t);
    this.leaving = this.leaving.filter(t => !t.done);
    const c = this.hider;
    if (c) {
      if (!this.herd.creatures.includes(c) || c.busy !== 'hide') { this.hider = null; this.walking = -1; release(c); this.o.onHiding?.(); }
      else if (!this.daytime()) this.unhide();
      else if (this.walking >= 0) {
        // on its way: hidden once there (or after a while, wherever it got stuck)
        const x = this.spot.x + this.hiderDx, y = this.spot.y - ART;
        if (Math.hypot(c.fx - x, c.fy - y) < 2 * ART || ++this.walking > 450) { this.walking = -1; this.pose(c); }
        else if (c.st === 'idle') c.goTo(x, y);
      } else {
        if (c.st !== 'idle') this.pose(c);
        c.wait = 1e9;
        if (w.tick % 150 === 75) this.rustle();
      }
    } else if (this.o.seek && w.tick % 60 === 30 && this.daytime()) {
      const id = this.o.seek();
      if (id) this.hide(id, true);
    }
  }

  draw (g: Ctx) { for (const f of this.overs) f(g); }

  /* ---- touch: toys and the hiding spot first, everything else to the herd */
  wrap (inner: Interaction): Interaction {
    const start = (toy: Toy, p: WorldPoint) => { this.held = { toy, trail: [{ x: p.x, y: p.y, t: performance.now() }] }; toy.grab(); };
    const grabbable = (e: Entity | null): e is Toy => e instanceof Toy && e.grabbable;
    const clampP = (p: WorldPoint) => ({ x: clamp(p.x, 0, this.w.w - 1), y: clamp(p.y, 0, this.w.h - 1) });
    const let_ = (p: WorldPoint, s: Stage, fling: boolean) => {
      const h = this.held!; this.held = null;
      const q = clampP(p), now = performance.now(), tr = h.trail.filter(t => now - t.t < 120);
      const a = tr[0] ?? { x: q.x, y: q.y, t: now - TICK_MS }, ticks = Math.max(1, (now - a.t) / TICK_MS);
      h.toy.throwFrom(fling ? (q.x - a.x) / ticks : 0, fling ? (q.y - a.y) / ticks : 0, q.x, q.y);
      s.invalidate();
    };
    return {
      ...inner,
      tap: (p, s) => {
        const hit = p.hit;
        if (!hit) this.o.hints?.reveal(this.w);
        if (hit === this.spot || (hit instanceof Creature && hit === this.hider)) {
          if (this.hider) this.found(); else this.rustle();
          s.invalidate(); return;
        }
        if (hit instanceof Toy && hit.tap(p.x, p.y)) { s.invalidate(); return; }
        inner.tap?.(p, s);
      },
      longPress: (p, s) => { if (grabbable(p.hit)) { start(p.hit, p); return; } inner.longPress?.(p, s); },
      longPressEnd: (p, c, s) => { if (this.held) { let_(p, s, false); return; } inner.longPressEnd?.(p, c, s); },
      dragStart: (p, long, s) => {
        if (this.held) return;
        if (grabbable(p.hit)) { start(p.hit, p); return; }
        inner.dragStart?.(p, long, s);
      },
      drag: (p, s) => {
        const h = this.held;
        if (!h) { inner.drag?.(p, s); return; }
        const q = clampP(p);
        h.trail.push({ x: q.x, y: q.y, t: performance.now() }); if (h.trail.length > 6) h.trail.shift();
        h.toy.dragTo(q.x, q.y);
        s.invalidate();
      },
      dragEnd: (p, c, s) => { if (this.held) { let_(p, s, !c); return; } inner.dragEnd?.(p, c, s); },
    };
  }

  /** the playground closes: everyone lets go */
  destroy () {
    this.unhide();
    this.own.stop();
    for (const t of this.toys.values()) t.stop();
  }
}

const SPOT_LEAF: Record<SceneId, string> = {
  meadow: '#6FAE47', lake: '#4F8E3F', pine: '#3E7A3A', cove: '#8FA85A', bamboo: '#6FB85A', marsh: '#7A8A42', mushroom: '#7DA34A',
};
