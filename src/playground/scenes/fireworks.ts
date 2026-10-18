/* New Year's fireworks on the Stable screen (Vlad, 2026-10-15): after dusk during Habitica's New Year, a rocket
 * rises from behind the hills every second or so and bursts into a ring of sparks that droop as they fall, behind
 * the scenery (they show only where the open sky does, as the boss does). The still scene already has three bursts
 * painted in its sky (feasts.ts), so with reduced motion, and on the widget and the wallpaper, those stay and
 * nothing moves. Every rocket follows from the tick alone, so it draws the same however the frames fall. */
import { ART } from './pixels';
import { surface, type SceneLayer, type Surface } from './layer';
import type { Ctx, Layer, World } from '../world';

const COLOURS: [spark: string, tip: string][] = [['#FF6F91', '#FFF1F5'], ['#FFC400', '#FFF6C8'], ['#4FC3F7', '#E8F8FF'], ['#7DD87D', '#EFFFF0'], ['#F4F1FF', '#FFFFFF']];
/** ticks between one rocket and the next, the climb, and the burst */
const EVERY = 40, RISE = 20, BURST = 34, RAYS = 14;
/** rockets in the air at once at most (each lives RISE + BURST ticks) */
const AT_ONCE = Math.ceil((RISE + BURST) / EVERY);

/** a small hash of a whole number, 0..1 (where and in which colour rocket k goes) */
const hash = (k: number, salt: number) => {
  let h = Math.imul(k ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul(salt + 1, 0xC2B2AE35);
  h ^= h >>> 15; h = Math.imul(h, 0x27D4EB2F); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
};

export class FireworksLayer implements Layer {
  readonly id = 'fireworks';
  readonly depth = 'back' as const;
  /** on during New Year (the playground sets it) */
  on = false;
  private art: Surface | null = null;

  constructor (private readonly scene: SceneLayer, private readonly still: () => boolean = () => false) {}

  /** shown now: on, after dusk, and allowed to move */
  get showing () { const t = this.scene.light().tod; return this.on && !this.still() && (t === 'night' || t === 'dusk'); }

  draw (g: Ctx, world: World) {
    if (!this.showing) return;
    const sky = this.scene.skyMask(world);
    if (!sky) return;
    const W = sky.width, H = sky.height;
    if (!this.art || this.art.width !== W || this.art.height !== H) this.art = surface(W, H);
    const a = this.art.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    a.globalCompositeOperation = 'source-over';
    a.clearRect(0, 0, W, H);
    const top = Math.ceil(world.insets.top / ART), horizon = Math.floor(this.scene.horizon(world) / ART);
    const dot = (x: number, y: number, col: string) => { a.fillStyle = col; a.fillRect(Math.round(x), Math.round(y), 1, 1); };
    const now = world.tick, newest = Math.floor(now / EVERY);
    for (let k = newest - AT_ONCE; k <= newest; k++) {
      const t = now - k * EVERY;
      if (k < 0 || t < 0 || t >= RISE + BURST) continue;
      const x = Math.round(W * (0.15 + 0.7 * hash(k, 1))), y = top + Math.round((horizon - top) * (0.1 + 0.3 * hash(k, 2)));
      const [col, tip] = COLOURS[Math.floor(hash(k, 3) * COLOURS.length)];
      if (t < RISE) {
        // the climb: a bright head and a short trail, easing out near the top
        const p = 1 - (1 - t / RISE) ** 2, ry = horizon - (horizon - y) * p;
        dot(x, ry, '#FFF6C8'); dot(x, ry + 1, '#E8B23A'); if (t % 2) dot(x, ry + 2, '#B5651D');
        continue;
      }
      // the burst: sparks fly out fast, slow down and droop; the last few ticks thin out
      const b = t - RISE, r = 10 * (1 - (1 - b / BURST) ** 3), droop = (b / BURST) ** 2 * 4;
      for (let i = 0; i < RAYS; i++) {
        if (b > BURST - 6 && (i + b) % 2) continue;
        const ang = (i / RAYS) * Math.PI * 2 + hash(k, 4);
        const sx = x + Math.cos(ang) * r, sy = y + Math.sin(ang) * r * 0.9 + droop;
        dot(sx, sy, b < BURST - 10 ? tip : col);
        if (r > 3) dot(x + Math.cos(ang) * (r - 2), y + Math.sin(ang) * (r - 2) * 0.9 + droop * 0.7, col);
      }
      if (b < 3) { dot(x, y, '#FFFFFF'); dot(x - 1, y, tip); dot(x + 1, y, tip); dot(x, y - 1, tip); dot(x, y + 1, tip); }
    }
    // keep only where the open sky shows
    a.globalCompositeOperation = 'destination-in';
    a.drawImage(sky, 0, 0);
    a.globalCompositeOperation = 'source-over';
    g.save();
    g.imageSmoothingEnabled = false;
    g.drawImage(this.art, 0, 0, W, H, 0, 0, W * ART, H * ART);
    g.restore();
  }
}
