/* More fliers (Vlad 2026-10-16, after the Flying Pig): the Phoenix and the Dragon mounts (the Dragon pets are
 * wingless) take off on slow, heavy wingbeats high into the sky above the trees and sail a wide figure: out, back
 * past where they took off, round again, and down; rarer than the Pterodactyl's soar. The Parrot hops up onto a
 * tree's crown or the stable's ridge for a short while, chatters, looks about and flutters down. The sail's poses up
 * there are all on the way somewhere (fwd), so the still picture keeps them where they stand; the Parrot's perch
 * shows there like the Falcon's. */
import { flyDown, flyUp } from './perch';
import type { Act, Pose, SpotKind, Trait } from './types';

function sail (): Pose[] {
  // facing the middle first, so the figure stays on screen; a crouch, a spring forward
  const out: Pose[] = [{ n: 6, sq: 1, inward: true }, { n: 3, sq: -1, soar: 0.04, fwd: 1 }];
  // the climb: a slow beat every other step
  for (let i = 1; i <= 10; i++) out.push({ n: 5, soar: i / 10, fwd: 1 + i, sq: i % 2 ? -1 : 0 });
  // out, sailing, a pixel's rise on each beat
  for (let f = 13; f <= 49; f += 2) out.push({ n: 3, soar: 1, fwd: f, lift: (f - 1) % 12 === 0 ? 1 : 0, sq: (f - 1) % 12 === 0 ? -1 : 0 });
  out.push({ n: 8, soar: 1, fwd: -49, turn: true, sq: -1 });
  // back, on past where it took off
  for (let f = 47; f >= -13; f -= 2) out.push({ n: 3, soar: 1, fwd: -f, lift: (f + 1) % 12 === 0 ? 1 : 0, sq: (f + 1) % 12 === 0 ? -1 : 0 });
  // round again toward where it took off, and down
  out.push({ n: 8, soar: 1, fwd: -13, turn: true, sq: -1 });
  for (let i = 10; i >= 1; i--) out.push({ n: 5, soar: (i - 1) / 10 || 0.04, fwd: -(i + 1), sq: i % 2 ? -1 : 0 });
  out.push({ n: 3, sq: 1 }, { n: 8 });
  return out;
}

/** the Phoenix and the Dragon mounts, by day */
export const SAIL: Trait = { id: 'sail', acts: [{ id: 'sail', when: { hours: [9, 18] }, script: sail(), rest: [240, 480] }] };

const CHATTER: Pose = { n: 20, perch: 1, sq: -1, fx: [{ kind: 'note', at: 'head', x: 3, y: 1, life: 30 }] };

const perchActs = (script: readonly Pose[]): Act[] =>
  (['tree', 'roof'] as const).map((at: SpotKind) => ({ id: `parrotPerch:${at}`, at, when: { hours: [7, 19] }, script, rest: [90, 210] as const }));

/** the Parrot: up a little while, a chatter, a look one way and the other, down */
export const PARROT_PERCH: Trait = {
  id: 'parrotPerch',
  acts: perchActs([...flyUp(), { n: [30, 60], perch: 1 }, CHATTER, { n: [30, 60], perch: 1, turn: true }, { n: [20, 50], perch: 1, turn: true }, ...flyDown()]),
};
