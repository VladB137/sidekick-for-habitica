/* New growth's sparkle: a few twinkles around where it stands, white and amber, staggered over about two
 * seconds, then gone. A front layer, so it shows over the creatures; the still picture (reduced motion) never
 * gets one (it would stay painted), the snackbar names the growth instead. */
import { drawParticle, type Particle } from '../particles';
import { ART } from './pixels';
import type { Ctx, Layer, World } from '../world';

const AROUND: [dx: number, dy: number, delay: number][] = [[0, 0, 0], [-4, 2, 6], [4, -2, 12], [-2, -5, 20], [5, 4, 28], [1, 6, 36], [-5, -1, 44]];
const LIFE = 24;

export class SparkleLayer implements Layer {
  readonly id = 'sparkle';
  readonly depth = 'front' as const;
  readonly twinkles: (Particle & { wait: number })[] = [];
  private pending: ((world: World) => { x: number, y: number })[] = [];

  /** sparkle around a place, world pixels, found on the next tick (once the world has its size) */
  around (where: (world: World) => { x: number, y: number }) { this.pending.push(where); }

  /** sparkle around (x, y), world pixels */
  at (x: number, y: number) {
    AROUND.forEach(([dx, dy, wait], i) => this.twinkles.push({
      kind: 'spark', x: x + dx * ART - ART, y: y + dy * ART - ART, t: 0, life: LIFE, wait, col: i % 2 ? '#FFC400' : '#FFFFFF',
    }));
  }

  get active () { return this.twinkles.length > 0 || this.pending.length > 0; }

  update (world: World) {
    for (const f of this.pending.splice(0)) { const p = f(world); this.at(p.x, p.y); }
    for (const p of this.twinkles) { if (p.wait > 0) p.wait--; else p.t++; }
    for (let i = this.twinkles.length - 1; i >= 0; i--) if (this.twinkles[i].t >= this.twinkles[i].life) this.twinkles.splice(i, 1);
  }

  draw (g: Ctx, _world: World) {
    for (const p of this.twinkles) if (p.wait <= 0) drawParticle(g, p);
  }
}
