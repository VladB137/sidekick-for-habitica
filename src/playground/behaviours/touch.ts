/* P8, touch by species (package B): what a tap, a pick-up, a drop or a tap on the ground near it does instead of
 * the usual. The tap reactions are acts (plain data), so the wallpaper's taps run them too (android/verdict
 * StableHerd.pet); a pick-up, a drop and a tap on the ground exist only in the app. (The Dragon's flame and the
 * Robot's beep on a tap are Ground and night details' package, through the same Touch.tap.)
 *
 *   Ferret    a tap: the war dance, sideways hops with turns
 *   Rock      a tap: a heart and no hop (a pet rock)
 *   Treeling  a tap: wakes with a shake and a few leaves falling
 *   Octopus, Cuttlefish  picked up: a puff of ink where it sat
 *   Slime     dropped: splats flat with a spatter, then pulls itself together
 *   Deer, Bunny  a tap on the ground near it: bounds away instead of turning to look
 */
import type { Act, Emit, Pose, Trait } from './types';

/** a tap's act: rests as briefly as after the happy hop */
const tap = (script: readonly Pose[]): Act => ({ id: 'tap', script, rest: [30, 60] });

/** hop sideways three steps, turn, hop back, turn: two or three times */
const side = (dx: number, turn = false): Pose[] => [{ n: 2, lift: 2, dx }, { n: 2, lift: 3, dx }, { n: 2, sq: 1, dx, turn }];
export const WAR_DANCE: Trait = {
  id: 'warDance',
  touch: { tap: { id: 'tap', script: [{ n: 1, sq: -1 }, ...side(1), ...side(2), ...side(3, true), ...side(2), ...side(1), ...side(0, true)], loops: [2, 3], rest: [30, 60] } },
};

export const STONY: Trait = { id: 'stony', touch: { tap: tap([]) } };

const leaf = (x: number): Emit => ({ kind: 'leaf', at: 'head', x, y: 2, life: 36 });
export const RUSTLE: Trait = {
  id: 'rustle',
  touch: { tap: tap([{ n: 3, sq: 1 }, { n: 3, sq: -1, fx: [leaf(-3), leaf(3)] }, { n: 3, dx: 1 }, { n: 3, dx: -1 }, { n: 3, dx: 1, fx: [leaf(1)] }, { n: 3, dx: -1 }, { n: 4 }]) },
  particles: {
    // tumbling down, drifting the way it fell
    leaf: { frames: [{ rows: ['lL'], until: 8 }, { rows: ['L', 'l'], until: 16 }, { rows: ['Ll'], until: 24 }, { rows: ['l', 'L'] }], pop: ['l'], cols: { l: '#7CB342', L: '#558B2F' }, move: [{ every: 3, dy: 1 }, { every: 6, dx: 1 }] },
  },
};

const ink = (side: 1 | -1): Emit => ({ kind: 'ink', at: 'feet', x: side * 3, y: 0, life: 26, side });
export const INK: Trait = {
  id: 'ink',
  touch: { lift: [ink(1), ink(-1)] },
  particles: {
    // a dark cloud that swells and thins out
    ink: { frames: [{ rows: ['k'], until: 3 }, { rows: ['.k.', 'kkk', '.k.'], until: 8 }, { rows: ['.kk.', 'kkkk', 'kkkk', '.kk.'], until: 18 }, { rows: ['k..k', '.kk.', 'k..k'] }], pop: ['.k.'], cols: { k: '#2E2442' }, move: [{ every: 6, dx: 1 }] },
  },
};

const goo = (side: 1 | -1): Emit => ({ kind: 'goo', at: side > 0 ? 'front' : 'back', x: 0, y: 0, life: 12, side });
export const SPLAT: Trait = {
  id: 'splat',
  touch: { land: { id: 'land', script: [{ n: 8, sq: 1, sink: 2, fx: [goo(1), goo(-1)] }, { n: 6, sq: 1, sink: 1 }, { n: 4, sq: 1 }, { n: 3, sq: -1 }, { n: 4 }], rest: [30, 60] } },
  particles: {
    // a drop flung up and out, falling back
    goo: { frames: [{ rows: ['g'] }], cols: { g: '#C5E1A5' }, move: [{ every: 2, dx: 1, dy: -1, to: 6 }, { every: 2, dx: 1, dy: 1, from: 6 }] },
  },
};

export const SHY: Trait = { id: 'shy', touch: { shy: 24 } };
