/* P4, the Pterodactyl soars: a run-up, wingbeats up into the sky above the trees, a long glide out, a turn, the
 * glide back, and down where it started. Up there it is above everything the scene stands in the sky. */
import type { Pose, Trait } from './types';

function soar (): Pose[] {
  // facing the middle first, so the glide stays on screen
  const out: Pose[] = [{ n: 4, sq: 1, inward: true }, { n: 2, sq: -1, soar: 0.04 }];
  for (let i = 1; i <= 10; i++) out.push({ n: 4, soar: i / 10, sq: i % 2 ? -1 : 0 });
  // the glide: a bob of a pixel now and then
  for (let f = 2; f <= 40; f += 2) out.push({ n: 3, soar: 1, fwd: f, lift: f % 8 === 0 ? 1 : 0 });
  out.push({ n: 6, soar: 1, fwd: -40, turn: true, sq: -1 });
  for (let f = 38; f >= 0; f -= 2) out.push({ n: 3, soar: 1, fwd: -f, lift: f % 8 === 0 ? 1 : 0 });
  out.push({ n: 6, soar: 1, turn: true, sq: -1 });
  for (let i = 9; i >= 0; i--) out.push({ n: 4, soar: i / 10, sq: i % 2 ? -1 : 0 });
  out.push({ n: 3, sq: 1 }, { n: 6 });
  return out;
}

export const SOAR: Trait = { id: 'soar', acts: [{ id: 'soar', when: { hours: [8, 18] }, script: soar(), rest: [90, 200] }] };
