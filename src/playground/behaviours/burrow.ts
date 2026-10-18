/* Under the ground. The Bunny burrows: it digs in, throwing dirt back and leaving a mound, sinks out of sight,
 * goes a little way along underground and pops up there through a new mound, then shakes itself off (snow
 * instead of dirt in winter). The Badger digs a hole and sits in it for a while. The Fox goes mousing in the
 * snow: a high leap and a dive, buried to the shoulders for a moment, then out again. */
import type { Act, Emit, Pose, Trait } from './types';

const fling = (kind: string, x = 0, side: 1 | -1 = -1): Emit => ({ kind, at: 'front', x, life: 12, side });
const mound = (kind: string, life: number): Emit => ({ kind, at: 'feet', x: -2, life });

const burrow = (bit: string, heap: string): Pose[] => [
  { n: 3, sq: 1 },
  { n: 4, sink: 2, fx: [mound(heap, 150), fling(bit), fling(bit, 1)] },
  { n: 4, sink: 5, fx: [fling(bit)] },
  { n: 4, sink: 9 },
  { n: 4, sink: 14, fx: [fling(bit, 1)] },
  { n: 4, sink: 20 },
  { n: [30, 60], sink: 40 },
  // along underground, out of sight
  { n: 1, sink: 40, go: 18 }, { n: [19, 39], sink: 40 },
  { n: 2, sink: 12, fx: [mound(heap, 120), fling(bit, 0, 1), fling(bit, 1)] },
  { n: 2, sink: 5 },
  { n: 3, lift: 1 },
  { n: 2, sq: 1 },
  { n: 6 },
  { n: 2, dx: 1 }, { n: 2, dx: -1 }, { n: 2, dx: 1 }, { n: 2 },
];

const BURROW: Act = { id: 'burrow', when: { winter: false }, script: burrow('dirt', 'mound'), rest: [60, 120] };
const BURROW_SNOW: Act = { id: 'burrowSnow', when: { winter: true }, script: burrow('snowbit', 'drift'), rest: [60, 120] };

const heaps = {
  mound: { frames: [{ rows: ['.mm.', 'mddm'] }], pop: ['.mm.'], cols: { m: '#8A6A44', d: '#6B5032' } },
  drift: { frames: [{ rows: ['.ss.', 'swws'] }], pop: ['.ss.'], cols: { s: '#F4F8FF', w: '#D3DFEA' } },
  snowbit: { frames: [{ rows: ['s'] }], cols: { s: '#F4F8FF' }, move: [{ every: 2, dx: 1, dy: -1, to: 6 }, { every: 2, dy: 1, from: 6 }] },
};

export const BURROWING: Trait = { id: 'burrow', acts: [BURROW, BURROW_SNOW], particles: heaps };

const scrape = (sink: number, x: number): Pose[] => [{ n: 3, sq: 1, sink, fx: [fling('dirt', x)] }, { n: 3, sink }];

export const DIGGING: Trait = {
  id: 'dig',
  acts: [{
    id: 'dig', when: { winter: false },
    script: [
      { n: 3, sq: 1 },
      ...scrape(0, 0), ...scrape(0, 1), ...scrape(1, 0), ...scrape(1, 1), ...scrape(2, 0), ...scrape(2, 1), ...scrape(3, 0), ...scrape(3, 1),
      { n: [20, 40], sink: 3 },
      { n: 3, sink: 2, fx: [fling('dirt', 0, 1)] }, { n: 3, sink: 1 }, { n: 3, lift: 1, fx: [mound('mound', 120)] }, { n: 3, sq: 1 }, { n: 4 },
    ],
    rest: [60, 140],
  }],
  particles: { mound: heaps.mound },
};

export const MOUSING: Trait = {
  id: 'mousing',
  acts: [{
    id: 'mousing', when: { winter: true }, p: 2,
    script: [
      { n: [6, 12], sq: 1 },
      { n: 2, sq: -1, lift: 2 }, { n: 2, lift: 5 }, { n: 3, lift: 8 }, { n: 3, lift: 9 },
      { n: 2, sq: -1, lift: 8 }, { n: 2, sq: -1, lift: 5 }, { n: 2, sq: -1, lift: 2 },
      { n: 2, sink: 4, fx: [fling('snowbit', 0, 1), fling('snowbit'), fling('snowbit', 1)] },
      { n: [20, 40], sink: 8 },
      { n: 3, sink: 4, fx: [fling('snowbit', 0, 1)] },
      { n: 3, lift: 1, fx: [fling('snowbit')] },
      { n: 4, sq: 1 },
      { n: 2, dx: 1 }, { n: 2, dx: -1 }, { n: 8 },
    ],
    rest: [40, 100],
  }],
  particles: { snowbit: heaps.snowbit },
};
