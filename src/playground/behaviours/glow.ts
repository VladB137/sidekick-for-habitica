/* Lights. The JackOLantern lights the ground around it in the evening and at night, a candle's flicker; the
 * Phoenix glows warmer and gives off embers; the Robot powers down by the door at night with a blinking light, and beeps when tapped. */
import type { Emit, Trait } from './types';

const NIGHT: readonly [number, number] = [18.5, 7];

export const LANTERN: Trait = { id: 'lantern', glow: { when: { hours: NIGHT }, r: 7, cols: ['#FFCC80', '#FB8C00'], flicker: true } };

const ember = (x: number, y: number, side: 1 | -1): Emit => ({ kind: 'ember', at: 'feet', x, y, life: 30, side });

export const EMBERS: Trait = {
  id: 'embers',
  glow: { when: { hours: NIGHT }, r: 8, cols: ['#FFAB40', '#FF5722'], flicker: true, every: 14, fx: [ember(-3, -6, 1), ember(2, -9, -1), ember(0, -4, 1), ember(4, -7, -1), ember(-1, -10, 1)] },
  particles: {
    ember: {
      frames: [{ rows: ['y'], until: 10 }, { rows: ['o'], until: 20 }, { rows: ['r'] }], cols: { y: '#FFE57F', o: '#FF9100', r: '#BF360C' },
      move: [{ every: 3, dy: -1 }, { every: 9, dx: 1 }],
    },
  },
};

const beep = (x: number): Emit => ({ kind: 'beep', at: 'head', x, y: -1, life: 24 });

export const ROBOT: Trait = {
  id: 'robot',
  glow: { when: { hours: [21, 6] }, r: 0, every: 60, fx: [{ kind: 'led', at: 'head', y: 2, life: 30 }] },
  // a tap: two beeps, a little bounce each, its light blinking
  touch: { tap: { id: 'tap', script: [{ n: 2, lift: 1, fx: [beep(3), { kind: 'led', at: 'head', y: 2, life: 30 }] }, { n: 4 }, { n: 2, lift: 1, fx: [beep(4)] }, { n: 4 }, { n: 3, sq: 1 }, { n: 3 }], rest: [30, 60] } },
  particles: {
    led: { frames: [{ rows: ['l'], until: 10 }, { rows: ['.'], until: 20 }, { rows: ['l'] }], cols: { l: '#FF5252' } },
    beep: { frames: [{ rows: ['b.', '.b', 'b.'] }], pop: ['b'], cols: { b: '#80DEEA' }, mirror: true, move: [{ every: 6, dy: -1 }] },
  },
};
