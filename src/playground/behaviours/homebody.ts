/* Homebodies (Habitica's Domesticated set: Ferret, GuineaPig, Rooster, FlyingPig, Rat, Bunny, Horse, Cow): half
 * their walks by day go back toward the stable. The Lion lounges: the longest rests in the herd, near the
 * stable, and lies low in the still picture. */
import type { Trait } from './types';

export const HOMEBODY: Trait = { id: 'homebody', likes: [{ at: 'door', p: 0.5, when: { hours: [6, 19] } }] };

export const LOUNGE: Trait = { id: 'lounge', pace: { rest: 3 }, likes: [{ at: 'door', p: 0.6, when: { hours: [6, 19] } }], still: { n: 1, sq: 1 } };
