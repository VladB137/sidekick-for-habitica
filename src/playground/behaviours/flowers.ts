/* Flowers and bamboo (P2). The Butterfly and the Magical Bee visit the flower patches Perfect Days grow (none under
 * snow): down onto one, wings opening and closing while it sips, off to the next; the bee leaves pollen. The Panda
 * cub, in the Bamboo grove, sits by the canes munching for long spells. */
import type { Emit, Pose, Trait } from './types';

function visit (fx: readonly Emit[]): Pose[] {
  return [
    { n: 3, perch: 0.5 }, { n: 4, perch: 1, lift: 1, sq: 1 },
    { n: [20, 40], perch: 1, lift: 1, fx }, { n: 6, perch: 1, lift: 1, sq: -1 }, { n: [20, 40], perch: 1, lift: 1 }, { n: 6, perch: 1, lift: 1, sq: -1, fx },
    { n: [10, 30], perch: 1, lift: 1 }, { n: 3, perch: 0.5, sq: -1 }, { n: 3 },
  ];
}

const pollen = (x: number): Emit => ({ kind: 'pollen', at: 'feet', x, y: -1, life: 36 });

export const BUTTERFLY: Trait = {
  id: 'flowers',
  likes: [{ at: 'flowers', p: 0.5, when: { hours: [8, 18] } }],
  acts: [{ id: 'flowers', at: 'flowers', when: { hours: [7, 19] }, script: visit([]), loops: [2, 3] }],
};

export const BEE: Trait = {
  id: 'pollen',
  likes: [{ at: 'flowers', p: 0.5, when: { hours: [8, 18] } }],
  acts: [{ id: 'flowers', at: 'flowers', when: { hours: [7, 19] }, script: visit([pollen(-2), pollen(2)]), loops: [2, 3] }],
  particles: {
    // a yellow fleck drifting down and out, then gone
    pollen: { frames: [{ rows: ['p'] }], cols: { p: '#FFD54F' }, move: [{ every: 6, dy: 1, to: 24 }, { every: 9, dx: 1 }] },
  },
};

/** bamboo bits from the Panda cub's mouth */
const bits: Emit = { kind: 'leaf', at: 'head', x: 3, y: 4, life: 30 };

export const BAMBOO: Trait = {
  id: 'bamboo',
  likes: [{ at: 'bamboo', p: 0.6, when: { hours: [7, 19] } }],
  acts: [{
    id: 'munch', at: 'bamboo', when: { hours: [7, 19] },
    script: [{ n: [30, 60], sq: 1 }, { n: 8, sq: 1 }, { n: 6, fx: [bits] }, { n: 8, sq: 1 }, { n: 6 }, { n: 8, sq: 1 }, { n: [20, 50], sq: 1 }],
    loops: [8, 16], rest: [30, 90],
  }],
};
