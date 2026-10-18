/* The Rooster's dawn crow (handed over by Pets together): between 5:00 and 8:00 it stretches tall, crows three
 * notes, and sleepers within 60 art pixels wake for a while (they stir and wander, then doze off again until
 * morning). */
import type { Act, Emit, Trait } from './types';

const note = (x: number): Emit => ({ kind: 'note', at: 'head', x, y: 1, life: 40 });

const CROW: Act = {
  id: 'crow', when: { hours: [5, 8] },
  script: [
    { n: 3, sq: -1 },
    { n: 12, sq: -1, lift: 1, fx: [note(3)], wake: 60 },
    { n: 8, sq: -1, lift: 1, fx: [note(5)] },
    { n: 8, sq: -1, fx: [note(4)] },
    { n: 6, sq: 1 },
    { n: 4 },
  ],
};

export const CROWING: Trait = { id: 'crow', acts: [CROW] };
