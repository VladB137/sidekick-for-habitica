/* The Dragon's flame puff, now and then (and on a tap, quicker): a breath in, then a little burst of flame from its nose that drifts
 * forward and rises as smoke. One pixel each, so it reads the same whichever way the Dragon faces. On winter
 * evenings and nights it glows faintly, warm enough that on snowy nights the others sleep in a ring round it
 * (creatures.ts hearth, from Pets together's signature pairs). */
import type { Emit, Trait } from './types';

const puff = (x: number, y: number, life: number): Emit => ({ kind: 'flame', at: 'nose', x, y, life });

export const FLAME: Trait = {
  id: 'flame',
  glow: { when: { winter: true, hours: [19, 7] }, r: 5, cols: ['#FFCC80', '#FF7043'], flicker: true },
  // a tap: a quick puff, no breath first
  touch: { tap: { id: 'tap', script: [{ n: 2, sq: -1 }, { n: 2, fx: [puff(1, 0, 12), puff(2, -1, 14), puff(2, 1, 10)] }, { n: 3, fx: [puff(1, 0, 10)] }, { n: 10 }, { n: 3, sq: 1 }], rest: [30, 60] } },
  acts: [{
    id: 'flame',
    script: [
      { n: 4, sq: -1 }, { n: 3, sq: 1 },
      { n: 2, fx: [puff(1, 0, 14), puff(2, -1, 16), puff(2, 1, 12), puff(3, 0, 18)] },
      { n: 4, fx: [puff(1, 0, 12), puff(2, 0, 15)] },
      { n: 14 }, { n: 4, sq: 1 }, { n: 8 },
    ],
  }],
  particles: {
    flame: {
      frames: [{ rows: ['y'], until: 4 }, { rows: ['o'], until: 9 }, { rows: ['r'], until: 12 }, { rows: ['s'] }],
      cols: { y: '#FFE082', o: '#FF9800', r: '#E64A19', s: '#9E9E9E' },
      move: [{ every: 3, dx: 1, to: 9 }, { every: 4, dy: -1, from: 6 }],
    },
  },
};
