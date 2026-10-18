/* Water (package W of thread "Behaviours by species"; Vlad 2026-10-15: every behaviour). Water is the pond (from
 * a 7-day Daily streak, frozen in winter), the marsh's pools (also frozen), and the lake and the sea along the
 * horizon, always. Pets swim anywhere they fit with room to spare; mounts only in the lake and the sea
 * (runner.ts places). Anyone walking through water wades (runner.ts wade), so nothing walks on it.
 *
 *   swim    amphibians (Otter, Platypus, Penguin, Turtle, Frog, the Tigers, the polar Bear cub): now and then a
 *           swim, low in the water with ripples, or a dive that comes up somewhere else
 *   sea     sea creatures live in the water when there is any (longer swims, more often); with none yet they
 *           rest longer and wander less
 *   breach  Dolphin and Orca leap out of the water in an arc and splash back in
 *   spout   the Whale surfaces and spouts
 *   lurk    Alligator and Hippo lie in the water with only the top rows showing, for a long time
 *   lily    the Frog sits on the marsh's lily pads and croaks
 *   fishing bears stand at the water's edge (the pond's near bank, the lake's or the sea's shore), a fish jumps
 */
import type { Act, Emit, ParticleLook, Pose, Trait } from './types';

/** ripples spreading from both sides at the waterline */
const ripple: readonly Emit[] = [{ kind: 'ripple', at: 'front', life: 16, side: 1 }, { kind: 'ripple', at: 'back', life: 16, side: -1 }];
/** bubbles from where its head went under */
const bubbles: readonly Emit[] = [{ kind: 'bubble', at: 'head', life: 14 }, { kind: 'bubble', at: 'head', x: 2, life: 20 }];
/** water flung up both ways as it lands */
const splash: readonly Emit[] = [
  { kind: 'splash', at: 'front', life: 12, side: 1 }, { kind: 'splash', at: 'back', life: 12, side: -1 },
  { kind: 'splash', at: 'feet', x: 1, life: 10, side: 1 },
];

/** a swim: in low, then along the water and back with ripples */
const SWIM_SCRIPT: readonly Pose[] = [
  { n: 8, depth: 0.4, fx: ripple },
  { n: [45, 90], depth: 0.55, glide: 5, fx: ripple },
  { n: [30, 60], depth: 0.55, glide: 5, fx: ripple },
];
/** a dive: under with bubbles, up again somewhere else in the same water */
const DIVE_SCRIPT: readonly Pose[] = [
  { n: 6, depth: 0.55, sq: -1 },
  { n: 4, depth: 0.8, fx: bubbles },
  { n: [24, 48], depth: 1, fx: bubbles },
  { n: 10, depth: 1, elsewhere: true, fx: bubbles },
  { n: 4, depth: 0.8, fx: ripple },
  { n: [40, 80], depth: 0.55, glide: 5, fx: ripple },
];
const open = { winter: false } as const;
const swim = (loops: readonly [number, number], p = 1): Act => ({ id: 'swim', at: 'water', p, script: SWIM_SCRIPT, loops });
const dive = (p: number): Act => ({ id: 'dive', at: 'water', p, script: DIVE_SCRIPT, loops: [1, 2] });

export const SWIM: Trait = { id: 'swim', acts: [swim([2, 4]), dive(0.5)] };

export const SEA: Trait = {
  id: 'sea',
  moods: [{ when: { water: false }, rest: 2.5, speed: 0.6 }],
  acts: [swim([4, 8], 2), dive(1)],
};

/** the leap: from under the water up in an arc, its whole body out at the top, and back in with a splash */
export const BREACH: Trait = {
  id: 'breach',
  acts: [{
    id: 'breach', at: 'water', p: 1.5, loops: [1, 3],
    script: [
      { n: [30, 60], depth: 0.55, glide: 8, fx: ripple },
      { n: [10, 20], depth: 1, glide: 10, fx: bubbles },
      { n: 3, depth: 0.5, lift: 1, glide: 14, sq: -1 },
      { n: 3, depth: 0, lift: 4, glide: 14 },
      { n: 4, depth: 0, lift: 7, glide: 14 },
      { n: 4, depth: 0, lift: 8, glide: 14 },
      { n: 4, depth: 0, lift: 7, glide: 14 },
      { n: 3, depth: 0, lift: 4, glide: 14 },
      { n: 2, depth: 0.5, lift: 1, glide: 14, sq: 1, fx: splash },
      { n: [20, 40], depth: 1, glide: 6, fx: ripple },
      { n: [30, 60], depth: 0.55, glide: 6 },
    ],
  }],
};

export const SPOUT: Trait = {
  id: 'spout',
  acts: [{
    id: 'spout', at: 'water', p: 1.5, loops: [1, 2],
    script: [
      { n: [30, 60], depth: 1, glide: 4, fx: bubbles },
      { n: 8, depth: 0.7, fx: ripple },
      { n: 6, depth: 0.6, sq: -1, fx: [{ kind: 'spout', at: 'head', x: -2, y: 1, life: 34 }] },
      { n: 30, depth: 0.6 },
      { n: [30, 60], depth: 0.6, glide: 4, fx: ripple },
      { n: 10, depth: 0.8 },
      { n: [20, 40], depth: 1, glide: 4 },
    ],
  }],
};

export const LURK: Trait = {
  id: 'lurk',
  acts: [{
    id: 'lurk', at: 'water', p: 2, rest: [90, 200],
    script: [
      { n: 10, depth: 0.4, fx: ripple },
      { n: [300, 600], depth: 0.75 },
      { n: [60, 120], depth: 0.75, glide: 2, fx: ripple },
      { n: [200, 400], depth: 0.75 },
      { n: 8, depth: 0.5 },
    ],
  }],
};

export const LILY: Trait = {
  id: 'lily',
  acts: [{
    id: 'lily', at: 'lily', p: 2, when: open, loops: [2, 4],
    script: [
      { n: [120, 240], depth: 0.15 },
      { n: 4, depth: 0.15, sq: -1, fx: [{ kind: 'note', at: 'head', x: 3, y: 1, life: 30 }] },
      { n: 6, depth: 0.15, sq: 1 },
    ],
  }],
};

const fish: readonly Emit[] = [{ kind: 'fish', at: 'front', x: 3, y: -3, life: 22 }];
export const FISHING: Trait = {
  id: 'fishing',
  acts: [{
    id: 'fish', at: 'shore', when: open, loops: [1, 2],
    script: [
      { n: [30, 60] },
      { n: 4, sq: -1 },
      { n: [60, 150], fx: fish },
      { n: 3, dx: 1, sq: 1 },
      { n: 3, dx: -1 },
      { n: [60, 120], fx: fish },
      { n: 20 },
    ],
  }],
};

/** Plain data, so the wallpaper draws them too (types.ts ParticleLook). */
export const WATER_LOOKS: Readonly<Record<string, ParticleLook>> = {
  // a dash on the water running outward, shorter as it fades
  ripple: { frames: [{ rows: ['ww'], until: 10 }, { rows: ['w'] }], cols: { w: '#DDF1FB' }, move: [{ every: 4, dx: 1 }] },
  // a bubble rising a little and popping
  bubble: { frames: [{ rows: ['b'] }], pop: ['b.b'], cols: { b: '#E3F4FC' }, move: [{ every: 3, dy: -1 }, { every: 7, dx: 1 }] },
  // a drop flung up and out, falling back
  splash: { frames: [{ rows: ['s', 's'], until: 5 }, { rows: ['s'] }], cols: { s: '#CFEAF7' }, move: [{ every: 2, dx: 1, dy: -1, to: 6 }, { every: 2, dx: 1, dy: 1, from: 6 }] },
  // the whale's spout: a jet that rises, fans out at the top and falls away
  spout: {
    frames: [
      { rows: ['..s..', '..s..'], until: 4 },
      { rows: ['.s.s.', '..s..', '..s..', '..s..'], until: 10 },
      { rows: ['s.s.s', '.sss.', '..s..', '..s..', '..s..', '..s..'], until: 26 },
      { rows: ['s...s', '.s.s.', '.....', '..s..'] },
    ],
    cols: { s: '#E8F6FD' },
  },
  // a little fish jumping out of the water and back in
  fish: {
    frames: [{ rows: ['ff.', '.ff'] }], pop: ['w.w'], cols: { f: '#9FC3D6', w: '#DDF1FB' }, mirror: true,
    move: [{ every: 2, dy: -1, to: 8 }, { every: 2, dy: 1, from: 12 }, { every: 3, dx: 1 }],
  },
};
