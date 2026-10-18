/* The Otter floats on its back (P3 cut line, P6 turns): it wades into the water, rolls over onto its back, bobs
 * there a while, then rolls on round and wades out. Where the water is comes from the scene's spots; the Water
 * package places swimmers in the lake's and the sea's strip. */
import type { Trait } from './types';

export const FLOAT: Trait = {
  id: 'float',
  acts: [{
    id: 'float', at: 'water',
    script: [
      { n: 6, sink: 1, cut: 0 }, { n: 6, sink: 2, cut: 0 },
      // over onto its back
      { n: 4, sink: 3, cut: 0, rot: 1 }, { n: [60, 120], sink: 3, cut: 0, rot: 2 },
      { n: 20, sink: 2, cut: 0, rot: 2 }, { n: 20, sink: 3, cut: 0, rot: 2 }, { n: 20, sink: 2, cut: 0, rot: 2 },
      { n: [40, 90], sink: 3, cut: 0, rot: 2 },
      // on round and out
      { n: 4, sink: 3, cut: 0, rot: 3 }, { n: 6, sink: 2, cut: 0 }, { n: 6, sink: 1, cut: 0 },
    ],
  }],
};
