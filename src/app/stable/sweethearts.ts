/* Valentine's on the Stable screen (Vlad, 2026-10-15): during Habitica's Valentine's, two creatures of the same
 * kind standing close (a pet and its mount count, as they keep company) send up a heart now and then from between
 * them. A front layer that only reads where the herd stands, like the name tags: the herd itself doesn't change, so
 * the wallpaper's copy of it doesn't either (the wallpaper and widget show the decorations, not these hearts).
 * Asleep or carried, no hearts; with reduced motion, none. Each pair's heart follows from the tick alone. */
import { ART, type Creature, type Ctx, type Herd, type Layer, type World } from '../../playground';
import { HEART_LIFE, drawParticle } from '../../playground/particles';

/** world pixels apart at most, across and down the meadow */
const NEAR_X = 30 * ART, NEAR_Y = 8 * ART;
/** a pair's heart every this many ticks (about 4 s), and at most this many pairs at once */
const EVERY = 120, PAIRS = 3;

const phase = (a: string, b: string) => {
  let h = 0;
  for (const ch of a + '|' + b) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
  return (h >>> 0) % EVERY;
};

export class SweetheartsLayer implements Layer {
  readonly id = 'sweethearts';
  readonly depth = 'front' as const;
  /** on during Valentine's (the playground sets it) */
  on = false;

  constructor (private herd: Herd) {}

  /** the pairs close enough for hearts now, by id */
  pairs (): [Creature, Creature][] {
    if (!this.on || this.herd.still()) return [];
    const out: [Creature, Creature][] = [];
    const cs = this.herd.creatures.filter(c => !c.isAsleep && c.st !== 'held');
    for (let i = 0; i < cs.length && out.length < PAIRS; i++) for (let j = i + 1; j < cs.length && out.length < PAIRS; j++) {
      const a = cs[i], b = cs[j];
      if (a.species === b.species && Math.abs(a.x - b.x) <= NEAR_X && Math.abs(a.y - b.y) <= NEAR_Y) out.push(a.id < b.id ? [a, b] : [b, a]);
    }
    return out;
  }

  draw (g: Ctx, w: World) {
    for (const [a, b] of this.pairs()) {
      const t = (w.tick + phase(a.id, b.id)) % EVERY;
      if (t >= HEART_LIFE) continue;
      const fa = a.frame(w), fb = b.frame(w);
      if (!fa || !fb) continue;
      // from just above the lower of the two heads, between them, rising as a petted creature's heart does
      const x = (a.x + b.x) / 2 - 2 * ART, y = Math.max(fa.top, fb.top) - 2 * ART;
      drawParticle(g, { kind: 'heart', x, y: y - Math.floor(t / 4) * ART, t, life: HEART_LIFE });
    }
  }
}
