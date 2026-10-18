/* A collection quest's finds lying in the grass (Stable ideas, 10): Habitica's own pictures of them, each at
 * a spot seeded by the quest, the same every visit, on open ground (away from the stable's door, the water
 * and each other), with a pixel of shadow under it; and a few glints for what the player found today, which
 * Habitica hands over only at the day change. When the quest is won, the finds hop up one after another and
 * burst into confetti. Under the creatures, which walk over them. With reduced motion the glints hold still
 * and a won quest's finds simply go. Nothing here reads Habitica: the app says what to show. */
import { drawParticle, stepParticle, type Particle } from '../particles';
import { Rng } from '../rng';
import { ART } from './pixels';
import type { SceneLayer } from './layer';
import type { Ctx, Layer, World } from '../world';

/** One find's picture: its cell on the sheet, pixels (Habitica's 3x art, drawn 1:1). */
export interface FindPicture { key: string, sx: number, sy: number, w: number, h: number }
/** What lies in the grass: the pictures (one per find shown) and how many glints. */
export interface FindsShown { seed: string, pictures: FindPicture[], glints: number }

/** art pixels between finds' feet, across and up and down (a picture is up to 20 wide and 20 tall), and from
 * the door, the water and the stable */
const APART_X = 21, APART_Y = 21, CLEAR_X = 16, CLEAR_Y = 10;
/** ticks between one find's hop and the next's, a hop's length, and when it bursts */
const STAGGER = 3, HOP = 14;
const CONFETTI = ['#FFC400', '#009688', '#FF6F91', '#FFFFFF'];

interface Spot { x: number, y: number }
interface Hop { pic: FindPicture, at: Spot, t: number }

export class FindsLayer implements Layer {
  readonly id = 'finds';
  readonly depth = 'back' as const;
  private shown: FindsShown | null = null;
  private spotsOf: { key: string, spots: Spot[] } | null = null;
  private hops: Hop[] = [];
  private bits: Particle[] = [];
  private readonly rng = new Rng('finds-confetti');

  constructor (
    private readonly scene: SceneLayer,
    private readonly sheet: () => CanvasImageSource | undefined,
    private readonly still: () => boolean = () => false,
  ) {}

  /** what lies in the grass now (null: no collection quest) */
  set (shown: FindsShown | null) { this.shown = shown; }
  get showing () { return !!this.shown && (this.shown.pictures.length > 0 || this.shown.glints > 0); }
  /** the quest was won: its finds are bursting now */
  get popping () { return this.hops.length > 0 || this.bits.length > 0; }

  /**
   * Where each picture lies, then each glint, world pixels (the foot of a picture, the middle of a glint).
   * Seeded by the quest: the same spots every visit while the playground keeps its size.
   */
  spots (world: World, shown = this.shown): Spot[] {
    if (!shown) return [];
    const n = shown.pictures.length + shown.glints;
    const band = this.scene.walk(world), key = `${shown.seed}:${n}:${band.left},${band.right},${band.top},${band.bottom}`;
    if (this.spotsOf?.key === key) return this.spotsOf.spots;
    const rng = new Rng(`finds:${shown.seed}`);
    const keepOff = [this.scene.door(world), this.scene.mark(world, 'water'), this.scene.mark(world, 'stable')];
    const l = band.left / ART + 8, r = band.right / ART - 8, t = band.top / ART + 6, b = band.bottom / ART - 2;
    const spots: Spot[] = [];
    for (let i = 0; i < n; i++) {
      let best: Spot | undefined, bestGap = -1;
      for (let a = 0; a < 40; a++) {
        const p = { x: Math.round(l + rng.next() * Math.max(0, r - l)), y: Math.round(t + rng.next() * Math.max(0, b - t)) };
        // 1 or more: clear of every other find's box and of the door, the water and the stable
        const gap = Math.min(
          ...spots.map(s => Math.max(Math.abs(s.x - p.x) / APART_X, Math.abs(s.y - p.y) / APART_Y)),
          ...keepOff.map(k => Math.max(Math.abs(k.x / ART - p.x) / CLEAR_X, Math.abs(k.y / ART - p.y) / CLEAR_Y)),
          99,
        );
        if (gap > bestGap) { best = p; bestGap = gap; }
        if (gap >= 1) break;
      }
      spots.push(best!);
    }
    const out = spots.map(s => ({ x: s.x * ART, y: s.y * ART }));
    this.spotsOf = { key, spots: out };
    return out;
  }

  /** The quest was won: these finds (its last picture) hop up one by one and burst; the grass is empty after. */
  pop (world: World, won: FindsShown) {
    this.shown = null;
    if (this.still()) return;
    const at = this.spots(world, won);
    this.hops = won.pictures.map((pic, i) => ({ pic, at: at[i], t: -i * STAGGER }));
  }

  update (_world: World) {
    for (const h of this.hops) {
      h.t++;
      if (h.t !== HOP) continue;
      // the burst: confetti from the find's middle, up and out
      for (let k = 0; k < 10; k++) {
        this.bits.push({
          kind: 'bit', x: h.at.x, y: h.at.y - h.pic.h / 2 - 4 * ART, t: 0, life: 30 + this.rng.int(0, 15),
          vx: (this.rng.next() - 0.5) * 2.4 * ART, vy: (-1 - this.rng.next() * 1.4) * ART, col: CONFETTI[k % CONFETTI.length],
        });
      }
    }
    this.hops = this.hops.filter(h => h.t < HOP);
    for (const q of this.bits) stepParticle(q);
    this.bits = this.bits.filter(q => q.t < q.life);
  }

  draw (g: Ctx, world: World) {
    const sheet = this.sheet(), s = this.shown;
    if (sheet && s) {
      const at = this.spots(world);
      s.pictures.forEach((pic, i) => this.picture(g, sheet, pic, at[i], 0));
      for (let i = 0; i < s.glints; i++) this.glint(g, world, at[s.pictures.length + i], i);
    }
    if (sheet) for (const h of this.hops) if (h.t >= 0) this.picture(g, sheet, h.pic, h.at, Math.round(Math.sin(Math.PI * h.t / HOP) * 4));
    for (const q of this.bits) drawParticle(g, q);
  }

  /** a find with its foot at `at`, `lift` art pixels off the ground (its shadow stays) */
  private picture (g: Ctx, sheet: CanvasImageSource, pic: FindPicture, at: Spot, lift: number) {
    const x = at.x - Math.floor(pic.w / 2 / ART) * ART, y = at.y - pic.h - lift * ART;
    g.fillStyle = this.scene.shadow();
    g.fillRect(at.x - Math.floor(pic.w / 3 / ART) * ART, at.y - ART, Math.max(1, Math.round(pic.w * 2 / 3 / ART)) * ART, ART);
    g.drawImage(sheet, pic.sx, pic.sy, pic.w, pic.h, x, y, pic.w, pic.h);
  }

  /** a glint: a twinkle on the grass, a star that shrinks to a point and back, each on its own beat (still: the star) */
  private glint (g: Ctx, world: World, at: Spot, i: number) {
    const t = this.still() ? 0 : (world.tick + i * 11) % 40, x = at.x, y = at.y - 3 * ART;
    const px = (dx: number, dy: number, col: string) => { g.fillStyle = col; g.fillRect(x + dx * ART, y + dy * ART, ART, ART); };
    const col = i % 2 ? '#FFC400' : '#FFFFFF', arm = t < 12 ? 2 : t < 18 ? 1 : 0;
    for (let k = 1; k <= arm; k++) { px(-k, 0, col); px(k, 0, col); px(0, -k, col); px(0, k, col); }
    px(0, 0, arm ? '#FFFFFF' : '#FFF3C4');
  }

}
