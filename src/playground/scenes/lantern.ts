/* A level-up lights the stable's lantern for the next visit (Stable spec §08): a lantern on a post beside the
 * stable, glowing amber, its halo flickering a pixel in and out. Unlit, nothing is drawn. With reduced motion
 * the glow holds still. */
import { ART } from './pixels';
import { NATURE } from './palettes';
import type { SceneLayer } from './layer';
import type { Ctx, Layer, World } from '../world';

export class LanternLayer implements Layer {
  readonly id = 'lantern';
  readonly depth = 'back' as const;
  /** lit now */
  lit = false;

  constructor (private readonly scene: SceneLayer, private readonly still: () => boolean = () => false) {}

  draw (g: Ctx, world: World) {
    if (!this.lit) return;
    const foot = this.scene.lantern(world), x = foot.x / ART, y = foot.y / ART;
    const px = (ax: number, ay: number, w: number, h: number, col: string) => { g.fillStyle = col; g.fillRect(ax * ART, ay * ART, w * ART, h * ART); };
    // the glow first, so the post and the lantern stand in it: a dithered halo, one pixel wider now and then
    const cy = y - 11, r = 3 + (!this.still() && Math.floor(world.tick / 7) % 3 === 0 ? 1 : 0);
    g.save();
    g.globalAlpha = 0.65;
    g.fillStyle = '#FFD86B';
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = dx * dx + dy * dy;
      if (d > 2 && d <= r * r + 1 && ((dx + dy) & 1) === 0) g.fillRect((x + dx) * ART, (cy + dy) * ART, ART, ART);
    }
    g.restore();
    px(x, y - 9, 1, 10, this.scene.tone(NATURE.post));
    px(x - 1, y - 13, 3, 1, '#3A2E22');
    px(x - 1, y - 12, 3, 3, '#FFC94A');
    px(x, y - 11, 1, 1, '#FFF3C4');
    px(x - 1, y - 9, 3, 1, '#3A2E22');
  }
}
