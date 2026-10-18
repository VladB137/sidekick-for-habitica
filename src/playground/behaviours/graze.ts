/* Grazers (our own family: Horse, Unicorn, Deer, Cow, Sheep, Alpaca, Mammoth, Triceratops): by day they stand
 * with their heads down and nibble, a bit of grass flicking up now and then, head up to chew, two to four
 * mouthfuls; in winter they paw at the snow instead. The Cow moos now and then (a stretch and two notes). */
import type { Act, Emit, Pose, Trait } from './types';

const bit = (kind: string, x: number, side: 1 | -1): Emit => ({ kind, at: 'front', x, life: 14, side });

const mouthfuls = (kind: string): Pose[] => [
  { n: 4, sq: 1 },
  { n: [12, 24], sq: 1 },
  { n: 3, sq: 1, fx: [bit(kind, 0, 1)] },
  { n: [10, 20], sq: 1 },
  { n: 3, sq: 1, dx: kind === 'snowbit' ? 1 : 0, fx: [bit(kind, 1, -1)] },
  { n: [8, 14], sq: 1 },
  { n: [10, 20] },
];

const GRAZE: Act = { id: 'graze', when: { hours: [5, 20], winter: false }, p: 2, script: mouthfuls('grass'), loops: [2, 4], rest: [40, 120] };
const PAW: Act = { id: 'grazeSnow', when: { hours: [5, 20], winter: true }, p: 2, script: mouthfuls('snowbit'), loops: [2, 3], rest: [40, 120] };

// a bit flicked up and out, falling back (as fx.ts dirt)
const flick = [{ every: 2, dx: 1, dy: -1, to: 6 }, { every: 2, dy: 1, from: 6 }];

export const GRAZING: Trait = {
  id: 'graze', acts: [GRAZE, PAW],
  particles: {
    grass: { frames: [{ rows: ['g'] }], cols: { g: '#7CB342' }, move: flick },
    snowbit: { frames: [{ rows: ['s'] }], cols: { s: '#F4F8FF' }, move: flick },
  },
};

export const MOO: Trait = {
  id: 'moo',
  acts: [{
    id: 'moo', when: { hours: [6, 20] },
    script: [
      { n: 4 }, { n: 3, sq: -1 },
      { n: 18, sq: -1, fx: [{ kind: 'note', at: 'head', x: 4, y: 1, life: 40 }] },
      { n: 8, sq: -1, fx: [{ kind: 'note', at: 'head', x: 6, y: 2, life: 36 }] },
      { n: 4, sq: 1 }, { n: 6 },
    ],
  }],
};
