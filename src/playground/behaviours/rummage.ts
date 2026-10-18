/* The Raccoon rummages by the stable door and the lantern in the evening and at night: head down, scraps
 * tossed out, looking round between goes. */
import type { Act, Pose, SpotKind, Trait } from './types';

const SCRIPT: Pose[] = [
  { n: 3, sq: 1 },
  { n: 4, sq: 1, dx: 1, fx: [{ kind: 'scrap', at: 'front', life: 16 }] },
  { n: 4, sq: 1, dx: -1 },
  { n: 4, sq: 1, dx: 1, fx: [{ kind: 'scrap', at: 'front', x: 1, life: 16, side: -1 }] },
  { n: 4, sq: 1 },
  { n: [10, 20] },
  { n: 6, turn: true },
  { n: [10, 20] },
  { n: 6, turn: true },
];

const at = (id: string, spot: SpotKind): Act => ({ id, at: spot, when: { hours: [18, 7] }, script: SCRIPT, loops: [2, 3], rest: [60, 120] });

export const RUMMAGE: Trait = {
  id: 'rummage',
  acts: [at('rummageDoor', 'door'), at('rummageLantern', 'lantern')],
  particles: {
    scrap: { frames: [{ rows: ['s'], until: 8 }, { rows: ['c'] }], cols: { s: '#D7CCA8', c: '#A1887F' }, move: [{ every: 2, dx: 1, dy: -1, to: 8 }, { every: 2, dy: 1, from: 8 }] },
  },
};
