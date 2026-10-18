/* The Sloth hangs from a tree upside down (P6, P4): it climbs halfway up a tree (the tree's own height, so higher
 * up a big one), turns over and hangs there a long while, swaying a little, then turns back and climbs down,
 * slowly as sloths do. */
import type { Pose, Trait } from './types';

const UP = 0.5, STEPS = 5;
const climb = (up: boolean): Pose[] => {
  const out: Pose[] = [];
  for (let i = 1; i <= STEPS; i++) {
    const k = up ? i : STEPS - i;
    out.push({ n: 12, perch: UP * k / STEPS, leg: i % 2 ? 1 : 0 });
  }
  return out;
};

export const HANG: Trait = {
  id: 'hang',
  acts: [{
    id: 'hang', at: 'tree', p: 2,
    script: [
      ...climb(true),
      { n: 8, perch: UP, rot: 1 }, { n: [150, 300], perch: UP, rot: 2 },
      { n: 24, perch: UP, rot: 2, dx: 1 }, { n: 24, perch: UP, rot: 2 }, { n: 24, perch: UP, rot: 2, dx: -1 }, { n: [90, 180], perch: UP, rot: 2 },
      { n: 8, perch: UP, rot: 1 }, { n: 12, perch: UP },
      ...climb(false),
    ],
    rest: [90, 200],
  }],
};
