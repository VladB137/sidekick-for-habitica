/* The Wolf howls at the full moon: on full-moon evenings (it stays out until 20:30 to see it rise) it sits,
 * lifts its head and howls three notes, and the creatures near it turn to look. */
import type { Emit, Trait } from './types';

const note = (x: number, life: number): Emit => ({ kind: 'note', at: 'head', x, y: 1, life });

export const HOWL: Trait = {
  id: 'howl',
  schedule: { home: [20.5, 6] },
  acts: [{
    id: 'howl', when: { moon: [4], hours: [19, 4] }, p: 3,
    script: [
      { n: 4, sq: 1 }, { n: 3, sq: -1 },
      { n: 24, sq: -1, lift: 1, fx: [note(3, 44)], look: 50 },
      { n: 12, sq: -1, lift: 1, fx: [note(5, 40)] },
      { n: 12, sq: -1, fx: [note(4, 36)] },
      { n: 6, sq: 1 }, { n: 12 },
    ],
    loops: [1, 2], rest: [90, 180],
  }],
};
