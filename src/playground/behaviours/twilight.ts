/* Twilight creatures (Fox, Cat): liveliest at dusk and dawn (shorter rests, a little quicker), a long nap at
 * midday, in bed later than the rest and up before them. */
import type { Trait } from './types';

export const TWILIGHT: Trait = {
  id: 'twilight',
  schedule: { sleep: [22, 5], home: [21.5, 5], naps: [{ when: { hours: [12, 14.5] }, cycle: 1, on: 1 }] },
  moods: [{ when: { hours: [5, 8] }, rest: 0.4, speed: 1.2 }, { when: { hours: [18, 22] }, rest: 0.4, speed: 1.2 }],
};
