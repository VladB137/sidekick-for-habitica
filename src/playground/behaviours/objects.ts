/* Things more than creatures. The Egg wobbles in place and never goes far; the Rock never moves on its own (a pet
 * rock); the Cactus keeps to the sun and barely moves. */
import type { Trait } from './types';

export const WOBBLE: Trait = {
  id: 'wobble',
  pace: { range: [3, 10], rest: 1.5 },
  acts: [{ id: 'wobble', script: [{ n: 3, dx: 1 }, { n: 3 }, { n: 3, dx: -1 }, { n: 3 }], loops: [2, 3] }],
};

export const ROCK: Trait = { id: 'rock', pace: { still: true } };

export const SUNLOVER: Trait = { id: 'sunlover', pace: { rest: 4, range: [4, 14] }, likes: [{ at: 'sun', p: 0.5, when: { hours: [8, 18] } }] };
