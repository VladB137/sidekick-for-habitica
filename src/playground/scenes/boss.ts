/* During a boss quest the boss's silhouette crosses the sky, sized by the HP it has left (Stable spec §08):
 * a shade of the sky, behind the hills, trees and the stable (it shows only where the open sky does), drifting
 * one art pixel every 4 ticks from left to right, then a pause, then again. With reduced motion it is shown
 * still, in the middle of the sky. The shape is Habitica's own boss picture as a 1-bit mask
 * (tools/gen-boss-shapes.mjs); nothing here reads Habitica.
 *
 * A beaten boss breaks up: its outline stops where it is (or appears mid-sky), shakes for a moment, then every
 * pixel of it flies off as confetti that falls through the scene. Never in the still picture. */
import { drawParticle, stepParticle, type Particle } from '../particles';
import { Rng } from '../rng';
import { ART } from './pixels';
import { surface, type SceneLayer, type Surface } from './layer';
import type { Ctx, Layer, World } from '../world';

/** A boss's outline: w x h art pixels, one bit each, row by row, most significant bit first. */
export interface BossShape { w: number, h: number, bits: Uint8Array }

export function decodeShape ([w, h, b64]: readonly [number, number, string]): BossShape {
  const s = atob(b64), bits = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bits[i] = s.charCodeAt(i);
  return { w, h, bits };
}

/** the silhouette's size: a third of the drawn outline when the boss is nearly beaten, all of it at full HP */
export const bossScale = (hp: number, max: number) => 1 / 3 + 2 / 3 * Math.max(0, Math.min(1, max > 0 ? hp / max : 1));

/** art pixels of empty sky between one crossing and the next */
const GAP = 60;
/** ticks per art pixel moved */
const PACE = 4;
/** ticks the beaten outline shakes before it breaks */
const SHAKE = 24;
/** the crit's confetti colours */
const CONFETTI = ['#FFC400', '#009688', '#FF6F91', '#FFFFFF'];
/** at most this many pieces (a big outline gives one for every other pixel, or fewer) */
const PIECES = 320;

/** A boss breaking up: where its outline stands, art pixels, and the confetti once it has broken. */
interface Breakup { shape: BossShape, scale: number, x: number, y: number, w: number, h: number, t: number, bits: Particle[] }

export class BossLayer implements Layer {
  readonly id = 'boss';
  readonly depth = 'back' as const;
  private shape: BossShape | null = null;
  private scale = 1;
  private pic: Surface | null = null;
  private picOf: { shape: BossShape, w: number, h: number } | null = null;
  private tmp: Surface | null = null;
  private broken: Breakup | null = null;
  private pending: { shape: BossShape, scale: number } | null = null;
  /** the boss shown before this one, and its size */
  private last: { shape: BossShape, scale: number } | null = null;
  /** the confetti's own randomness, so the herd's never changes */
  private readonly rng = new Rng('boss-confetti');

  constructor (private readonly scene: SceneLayer, private readonly still: () => boolean = () => false) {}

  /** the boss to show (null: none), and its size from bossScale */
  set (shape: BossShape | null, scale = 1) {
    if (this.shape) this.last = { shape: this.shape, scale: this.scale };
    this.shape = shape; this.scale = scale;
  }
  get showing () { return !!this.shape; }
  /** a beaten boss is breaking up now */
  get beating () { return !!this.pending || !!this.broken; }

  /**
   * The boss was beaten: its outline breaks up in confetti, at the size the sky last showed it (a third, the
   * size of a beaten boss, if it wasn't there), from where it is if it's on screen, else from mid-sky, and the
   * boss leaves the sky. In the still picture it just leaves.
   */
  beat (shape: BossShape) {
    this.set(null);
    const scale = this.last?.shape === shape ? this.last.scale : 1 / 3;
    if (!this.still()) this.pending = { shape, scale };
  }

  /** where the silhouette is drawn now, art pixels (x may be off either edge between crossings) */
  place (world: World): { x: number, y: number, w: number, h: number } | null {
    const s = this.shape;
    if (!s) return null;
    return this.spot(world, s, this.scale, this.still());
  }

  private spot (world: World, s: BossShape, scale: number, still: boolean) {
    const w = Math.max(1, Math.round(s.w * scale)), h = Math.max(1, Math.round(s.h * scale));
    const W = Math.ceil(world.w / ART), top = Math.ceil(world.insets.top / ART), horizon = Math.floor(this.scene.horizon(world) / ART);
    const y = Math.max(top + 2, Math.min(top + Math.round((horizon - top) * 0.1), horizon - h - 6));
    const x = still ? Math.round(W * 0.6 - w / 2) : Math.floor(world.tick / PACE) % (W + w + GAP) - w;
    return { x, y, w, h };
  }

  update (world: World) {
    const p = this.pending;
    if (p) {
      this.pending = null;
      // where it is now if that's on screen (it was crossing the sky), else mid-sky
      const W = Math.ceil(world.w / ART);
      let at = this.spot(world, p.shape, p.scale, false);
      if (at.x < 0 || at.x + at.w > W) at = this.spot(world, p.shape, p.scale, true);
      this.broken = { shape: p.shape, scale: p.scale, ...at, t: 0, bits: [] };
    }
    const b = this.broken;
    if (!b) return;
    b.t++;
    if (b.t === SHAKE) this.burst(b);
    for (const q of b.bits) stepParticle(q);
    b.bits = b.bits.filter(q => q.t < q.life && q.y < world.h);
    if (b.t > SHAKE && !b.bits.length) this.broken = null;
  }

  /** every pixel of the outline (every other one, for a big outline) flies off from the middle, up and out */
  private burst (b: Breakup) {
    const { shape: s, w, h } = b, on: [number, number][] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = Math.floor(y * s.h / h) * s.w + Math.floor(x * s.w / w);
      if (s.bits[i >> 3] & (0x80 >> (i & 7))) on.push([x, y]);
    }
    const every = Math.max(1, Math.ceil(on.length / PIECES)), cx = w / 2, cy = h / 2, r = Math.max(w, h) / 2;
    for (let n = 0; n < on.length; n += every) {
      const [x, y] = on[n], rng = this.rng;
      b.bits.push({
        kind: 'bit', x: (b.x + x) * ART, y: (b.y + y) * ART, t: 0, life: 40 + rng.int(0, 30),
        vx: ((x - cx) / r * 1.6 + (rng.next() - 0.5)) * ART, vy: ((y - cy) / r * 0.8 - 0.8 - rng.next() * 1.4) * ART,
        col: CONFETTI[n % CONFETTI.length],
      });
    }
  }

  /** the outline at this size, opaque black where the boss is */
  private picture (s: BossShape, w: number, h: number): Surface {
    const o = this.picOf;
    if (this.pic && o && o.shape === s && o.w === w && o.h === h) return this.pic;
    const img = new ImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = Math.floor(y * s.h / h) * s.w + Math.floor(x * s.w / w);
      if (s.bits[i >> 3] & (0x80 >> (i & 7))) img.data[(y * w + x) * 4 + 3] = 255;
    }
    this.pic = surface(w, h);
    (this.pic.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).putImageData(img, 0, 0);
    this.picOf = { shape: s, w, h };
    return this.pic;
  }

  draw (g: Ctx, world: World) {
    const b = this.broken;
    if (b) {
      // a shake of one art pixel, then the confetti
      if (b.t < SHAKE) this.outline(g, world, b.shape, { ...b, x: b.x + (b.t >> 1) % 2 * 2 - 1 });
      for (const q of b.bits) drawParticle(g, q);
    }
    const p = this.place(world);
    if (p) this.outline(g, world, this.shape!, p);
  }

  /** the outline at p, a shade of the sky where the open sky shows */
  private outline (g: Ctx, world: World, shape: BossShape, p: { x: number, y: number, w: number, h: number }) {
    if (p.x >= Math.ceil(world.w / ART) || p.x + p.w <= 0) return;
    const sky = this.scene.skyMask(world);
    if (!sky) return;
    if (!this.tmp || this.tmp.width !== p.w || this.tmp.height !== p.h) this.tmp = surface(p.w, p.h);
    const t = this.tmp.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, p.w, p.h);
    t.drawImage(this.picture(shape, p.w, p.h), 0, 0);
    // keep only where the open sky shows
    t.globalCompositeOperation = 'destination-in';
    t.drawImage(sky, -p.x, -p.y);
    t.globalCompositeOperation = 'source-over';
    const dark = this.scene.light().tod === 'night' || this.scene.options.scene === 'mushroom';
    g.save();
    g.imageSmoothingEnabled = false;
    g.globalAlpha = dark ? 0.45 : 0.22;
    g.drawImage(this.tmp, 0, 0, p.w, p.h, p.x * ART, p.y * ART, p.w * ART, p.h * ART);
    g.restore();
  }
}
