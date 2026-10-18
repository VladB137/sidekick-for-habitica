/* Weather over everything: snow in winter, falling leaves in autumn, fireflies on summer evenings and nights,
 * the Mushroom glade's floating glow all year, and the day's shower when there is one (clock.ts showerOf; not
 * in winter or in the glade). Particles are single art pixels moving whole art pixels.
 * Positions come from the world's tick, so under reduced motion (no ticks) they hold still: snow lies where
 * it is, nothing drifts. */
import { Rng } from '../rng';
import { rainAt } from './clock';
import { ART } from './pixels';
import type { Ctx, Layer, World } from '../world';
import type { SceneLayer } from './layer';

interface Mote { x: number, y: number, sp: number, ph: number, col: number }

export type WeatherKind = 'snow' | 'leaves' | 'fireflies' | 'glow' | 'rain' | null;

const LEAVES = ['#F2A541', '#D9822B', '#C0392B', '#E8C04A'];

export class WeatherLayer implements Layer {
  readonly id = 'weather';
  readonly depth = 'front' as const;
  private motes: Mote[] = [];
  private n = -1;
  private wet = false;
  private checkedAt = -Infinity;
  /** @param o.rain  a fixed answer to "is it raining" (still pictures, tests, the dev page); else from the date */
  constructor (private readonly scene: SceneLayer, private readonly o: { rain?: boolean } = {}) {}

  /** raining now: the day's shower, where it can rain at all (the scene's life has a rainbow's place) */
  raining (world: World): boolean {
    if (this.o.rain !== undefined) return this.o.rain;
    if (!this.scene.life(world).bow) return false;
    const t = Date.now();
    if (t - this.checkedAt > 60_000) { this.wet = rainAt(this.scene.options.now?.() ?? new Date(t)); this.checkedAt = t; }
    return this.wet;
  }

  /** the season's weather at this light (a shower, from the date, comes on top: see raining) */
  kind (): WeatherKind {
    const { tod, season } = this.scene.light();
    if (this.scene.options.scene === 'mushroom') return season === 'winter' ? 'snow' : 'glow';
    // Pine hill's winter nights are clear, for the northern lights (paint.ts aurora)
    if (season === 'winter') return this.scene.options.scene === 'pine' && tod === 'night' ? null : 'snow';
    if (season === 'autumn') return 'leaves';
    if (season === 'summer' && (tod === 'night' || tod === 'dusk')) return 'fireflies';
    return null;
  }

  private seed (count: number) {
    if (count === this.n) return;
    const r = new Rng('weather');
    this.motes = Array.from({ length: count }, () => ({ x: r.next(), y: r.next(), sp: r.next(), ph: r.int(0, 999), col: r.int(0, 3) }));
    this.n = count;
  }

  draw (g: Ctx, world: World) {
    const kind = this.raining(world) ? 'rain' : this.kind();
    if (!kind) return;
    const W = Math.ceil(world.w / ART), H = Math.ceil(world.h / ART), t = world.tick;
    const px = (x: number, y: number, col: string) => { g.fillStyle = col; g.fillRect(Math.round(x) * ART, Math.round(y) * ART, ART, ART); };
    const band = this.scene.walk(world), top = Math.floor(band.top / ART), bottom = Math.floor(band.bottom / ART);
    const night = this.scene.light().tod === 'night';
    if (kind === 'snow') {
      this.seed(Math.round(40 * Math.max(1, W / 160)));
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i], sp = 0.3 + m.sp * 0.4;
        const y = (m.y * H + t * sp) % H, x = m.x * W + Math.round(Math.sin(t / 20 + i));
        px(x, y, night ? '#C9D3E8' : '#F4F8FF');
      }
    } else if (kind === 'rain') {
      // streaks two art pixels long, fast, slanting a little in the wind, down to the ground
      this.seed(Math.round(50 * Math.max(1, W / 160)));
      const col = night ? '#7E93B8' : '#B8D4F0';
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i], sp = 2 + m.sp, span = bottom + 6;
        const y = (m.y * span + t * sp) % span - 4, x = (m.x * W + y / 3) % W;
        px(x, y, col); px(x, y + 1, col);
      }
    } else if (kind === 'leaves') {
      this.seed(Math.round(12 * Math.max(1, W / 160)));
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i], sp = 0.25 + m.sp * 0.25, span = bottom + 8;
        const y = (m.y * span + t * sp) % span - 8, x = (m.x * W + t * sp * 0.6 + Math.round(Math.sin(t / 12 + i) * 2)) % W;
        px(x, y, LEAVES[m.col]);
      }
    } else {
      // fireflies over the ground, glow motes everywhere below the treetops: they wander and blink
      this.seed(Math.round((kind === 'glow' ? 16 : 12) * Math.max(1, W / 160)));
      const hi = kind === 'glow' ? Math.max(0, top - 30) : Math.max(0, top - 14);
      for (let i = 0; i < this.motes.length; i++) {
        const m = this.motes[i];
        if ((t + m.ph) % 90 >= (kind === 'glow' ? 70 : 50)) continue;
        const x = m.x * W + Math.round(Math.sin(t / 40 + m.ph) * 6), y = hi + m.y * (bottom - hi) + Math.round(Math.cos(t / 33 + i) * 3);
        px(x, y, kind === 'glow' ? ['#7CF5E8', '#FFE66D', '#FF8FD0', '#B9FFF7'][m.col] : '#FFF59D');
      }
    }
  }
}
