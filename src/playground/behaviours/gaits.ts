/* Ways of going that only change the pace: the Kangaroo and the Jackalope bound instead of hop; the Crab walks
 * sideways only, never turning round, along the shore where there is one. */
import type { Trait } from './types';

export const BOUNDS: Trait = { id: 'bounds', pace: { motion: 'bound' } };

export const SIDEWAYS: Trait = { id: 'sideways', pace: { sideways: true }, likes: [{ at: 'shore', p: 0.4 }] };
