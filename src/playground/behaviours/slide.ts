/* The Penguin belly-slides in the snow (P6): a little stretch, flops forward onto its belly, slides along the way it
 * faces throwing snow up behind, slows to a stop, and stands up again. */
import type { Emit, Trait } from './types';

const spray: Emit = { kind: 'snowSpray', at: 'feet', x: -6, life: 10, side: -1 };

export const BELLY_SLIDE: Trait = {
  id: 'bellySlide',
  acts: [{
    id: 'bellySlide', when: { winter: true }, p: 2,
    script: [
      { n: 3, sq: -1 }, { n: 3, lift: 1, rot: 1 },
      { n: 6, rot: 1, go: 1.2, fx: [spray] }, { n: 6, rot: 1, go: 1.2, fx: [spray] }, { n: 8, rot: 1, go: 0.8, fx: [spray] },
      { n: 10, rot: 1, go: 0.4 }, { n: [10, 30], rot: 1 }, { n: 3, sq: 1 }, { n: 6 },
    ],
    loops: [1, 2],
  }],
  particles: {
    // a puff of snow flung up and back, falling
    snowSpray: {
      frames: [{ rows: ['s', 's'], until: 4 }, { rows: ['s'] }], cols: { s: '#FFFFFF' },
      move: [{ every: 2, dx: 1, dy: -1, to: 6 }, { every: 2, dx: 1, dy: 1, from: 6 }],
    },
  },
};
