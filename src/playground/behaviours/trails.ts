/* What some leave behind as they walk. The Unicorn trots with a faint sparkle trail in the evening and at
 * night; the Snail leaves a shiny trail that fades; every other step of the TRex puffs dust. */
import type { Trait } from './types';

export const SPARKLE: Trait = {
  id: 'sparkle',
  pace: { trail: { when: { hours: [18.5, 6.5] }, every: 5, fx: { kind: 'twinkle', at: 'back', y: -3, life: 24, side: -1 } } },
  particles: {
    twinkle: { frames: [{ rows: ['w'], until: 8 }, { rows: ['p'], until: 16 }, { rows: ['v'] }], cols: { w: '#FFFFFF', p: '#F8BBD0', v: '#CE93D8' }, move: [{ every: 8, dy: 1 }] },
  },
};

export const SLIME: Trait = {
  id: 'slime',
  pace: { trail: { every: 6, fx: { kind: 'slime', at: 'back', life: 120, side: -1 } } },
  particles: { slime: { frames: [{ rows: ['a'], until: 40 }, { rows: ['b'], until: 80 }, { rows: ['c'] }], cols: { a: '#E3F2F7', b: '#B4CCD6', c: '#8FA6AF' } } },
};

export const STOMP: Trait = { id: 'stomp', pace: { trail: { every: 8, fx: { kind: 'dust', at: 'back', life: 9, side: -1 } } } };
