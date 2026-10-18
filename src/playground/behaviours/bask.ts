/* Baskers (Snake, Chameleon, Turtle, Alligator): by day they find an open sunny spot and lie flat and still for
 * a long while (8 to 16 s); early in the evening they are sluggish (half the speed, twice the rest). */
import type { Trait } from './types';

export const BASK: Trait = {
  id: 'bask',
  acts: [{ id: 'bask', when: { hours: [9, 17] }, at: 'sun', script: [{ n: [240, 480], sq: 1 }], rest: [30, 60] }],
  moods: [{ when: { hours: [18, 21] }, speed: 0.5, rest: 2 }],
};
