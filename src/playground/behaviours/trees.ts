/* Trees (P4 and P2): the Squirrel and the Monkey climb into a crown and sit there a while (the Monkey swings); the
 * Spider climbs and lets itself down on a thread, dangles, and climbs the thread back up; the Giraffe browses at a
 * tree, leaves dropping; the Treeling stands among the trees and goes as still as one. Every tree counts, on the
 * horizon or standing on the walking ground; the more the account grows, the more there are. */
import type { Emit, ParticleLook, Pose, Trait } from './types';

/** up a trunk in small hops to `to` of the way, `n` ticks a step, the legs apart on every other */
function climb (to: number, steps: number, n: number): Pose[] {
  const out: Pose[] = [{ n: 3, sq: -1 }];
  for (let i = 1; i <= steps; i++) out.push({ n, perch: to * i / steps, leg: i % 2 ? 1 : 0 });
  return out;
}
function climbDown (from: number, steps: number, n: number): Pose[] {
  const out: Pose[] = [];
  for (let i = steps - 1; i >= 0; i--) out.push({ n, perch: from * i / steps, leg: i % 2 ? 1 : 0 });
  out.push({ n: 3, sq: 1 }, { n: 4 });
  return out;
}

const IN_CROWN = 0.65;

export const CLIMB: Trait = {
  id: 'climb',
  likes: [{ at: 'tree', p: 0.3, when: { hours: [7, 19] } }],
  acts: [{
    id: 'climb', at: 'tree',
    script: [
      ...climb(IN_CROWN, 8, 4),
      { n: [120, 240], perch: IN_CROWN, sq: 1 }, { n: [40, 90], perch: IN_CROWN, turn: true }, { n: [80, 180], perch: IN_CROWN, sq: 1 },
      ...climbDown(IN_CROWN, 8, 3),
    ],
    rest: [60, 150],
  }],
};

/** the Monkey hangs and swings a little up there */
const swing: Pose[] = [];
for (let i = 0; i < 4; i++) swing.push({ n: 6, perch: IN_CROWN, dx: 1, lift: -1 }, { n: 4, perch: IN_CROWN, lift: -1 }, { n: 6, perch: IN_CROWN, dx: -1, lift: -1 }, { n: 4, perch: IN_CROWN, lift: -1 });

export const MONKEY_CLIMB: Trait = {
  id: 'monkeyClimb',
  likes: [{ at: 'tree', p: 0.3, when: { hours: [7, 19] } }],
  acts: [{
    id: 'climb', at: 'tree',
    script: [...climb(IN_CROWN, 7, 3), { n: [60, 150], perch: IN_CROWN, sq: 1 }, ...swing, { n: [40, 90], perch: IN_CROWN, turn: true }, { n: [60, 120], perch: IN_CROWN, sq: 1 }, ...climbDown(IN_CROWN, 7, 3)],
    rest: [60, 150],
  }],
};

/* The Spider's thread: a pixel left at the top of its back each step it lets itself down, each living until the
 * Spider climbs back past it (its life worked out from the steps below, so the thread shortens as it climbs). */
const THREAD = 10, STEP = 6, DANGLE = 90, AT = 0.6;
function thread (): Pose[] {
  const out: Pose[] = [];
  for (let k = 1; k <= THREAD; k++) {
    const silk: Emit = { kind: 'silk', at: 'head', life: (2 * THREAD - 2 * k + 1) * STEP + DANGLE };
    out.push({ n: STEP, perch: AT, lift: -k, fx: [silk] });
  }
  out.push({ n: DANGLE, perch: AT, lift: -THREAD, sq: 1 });
  for (let k = THREAD - 1; k >= 0; k--) out.push({ n: STEP, perch: AT, lift: -k, leg: k % 2 ? 1 : 0 });
  return out;
}

export const SPIDER: Trait = {
  id: 'thread',
  likes: [{ at: 'tree', p: 0.25 }],
  acts: [{ id: 'thread', at: 'tree', script: [...climb(AT, 6, 5), { n: [30, 60], perch: AT }, ...thread(), { n: [30, 60], perch: AT }, ...climbDown(AT, 6, 4)], rest: [90, 200] }],
  particles: {
    silk: { frames: [{ rows: ['s'] }], cols: { s: '#ECEFF1' } },
  },
};

/** a leaf from the Giraffe's mouth, drifting down and to and fro */
const LEAF: ParticleLook = {
  frames: [{ rows: ['l'] }], cols: { l: '#5FAE4E' },
  move: [{ every: 3, dy: 1 }, { every: 8, dx: 1, to: 16 }, { every: 8, dx: -1, from: 16, to: 32 }, { every: 8, dx: 1, from: 32 }],
};
const leaf: Emit = { kind: 'leaf', at: 'head', x: 4, y: 2, life: 45 };

export const BROWSE: Trait = {
  id: 'browse',
  likes: [{ at: 'tree', p: 0.25, when: { hours: [7, 19] } }],
  acts: [{
    id: 'browse', at: 'tree',
    script: [{ n: 4, sq: -1 }, { n: 12, sq: -1 }, { n: 6, sq: -1, lift: 1, fx: [leaf] }, { n: 10, sq: -1 }, { n: 8, sq: -1, lift: 1 }, { n: 6 }],
    loops: [3, 6],
  }],
  particles: { leaf: LEAF },
};

/** the Treeling among the trees: it stands there as still as one, for a long while */
export const TREELING: Trait = {
  id: 'treeling',
  likes: [{ at: 'tree', p: 0.5 }],
  acts: [{ id: 'stillAsATree', at: 'tree', script: [{ n: 4, sq: -1 }, { n: [300, 900] }, { n: 3, sq: 1 }], rest: [30, 90] }],
};
