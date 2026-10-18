/* P7, the particle framework's own looks: dust (a landing, a sprint), dirt (digging, burrowing) and a note (a
 * crow, a howl, a moo). Behaviour modules add their own in Trait.particles; each is plain data (types.ts
 * ParticleLook) so the wallpaper draws it too. */
import type { ParticleLook } from './types';

export const FX_LOOKS: Readonly<Record<string, ParticleLook>> = {
  // two pixels high for its first 5 ticks, then one, drifting out a pixel every 3 ticks (as creatures.ts always had)
  dust: { frames: [{ rows: ['#', '#'], until: 5 }, { rows: ['#'] }], cols: { '#': '#E9E2CF' }, move: [{ every: 3, dx: 1 }] },
  // a clod flung up and out, falling back
  dirt: { frames: [{ rows: ['d'] }], cols: { d: '#8A6A44' }, move: [{ every: 2, dx: 1, dy: -1, to: 6 }, { every: 2, dx: 1, dy: 1, from: 6 }] },
  // a quaver rising and drifting the way the singer faces
  note: {
    frames: [{ rows: ['.nn', '.n.', 'nn.', 'nn.'] }], pop: ['n'], cols: { n: '#FFE082' }, mirror: true,
    move: [{ every: 5, dy: -1 }, { every: 10, dx: 1 }],
  },
};
