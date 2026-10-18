/* The Guinea pig's popcorn: sudden small hops in place, two to four in a row. */
import type { Trait } from './types';

export const POPCORN: Trait = {
  id: 'popcorn',
  acts: [{
    id: 'popcorn',
    script: [{ n: 1, sq: -1 }, { n: 2, lift: 1 }, { n: 3, lift: 2 }, { n: 2, lift: 1 }, { n: 2, sq: 1 }, { n: [3, 9] }],
    loops: [2, 4],
  }],
};
