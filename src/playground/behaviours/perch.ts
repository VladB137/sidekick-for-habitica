/* P4, perches (Habitica's Birds of a Feather and the gryphons): up onto a tree's crown or the stable's ridge, a
 * while up there looking about, then down. The Owl goes up at night with a soft hoot; the Falcon by day, and once
 * settled it swoops down and out and back up to its perch; the Gryphon, the Hippogriff and the Gryphatrice just
 * sit up there like the masters of the place. A tap on a perched creature gives a heart and it stays put. */
import type { Act, Pose, SpotKind, Trait, When } from './types';

/** wingbeats up: stretched every other step, the hover fading as it goes */
export function flyUp (to = 1): Pose[] {
  const out: Pose[] = [{ n: 3, sq: -1 }];
  for (const k of [0.2, 0.45, 0.7, 0.9]) out.push({ n: 3, perch: k * to, sq: out.length % 2 ? -1 : 0 });
  out.push({ n: 4, perch: to, sq: 1 });
  return out;
}

/** and down again, landing with a squash */
export function flyDown (from = 1): Pose[] {
  const out: Pose[] = [{ n: 3, perch: from, sq: -1 }];
  for (const k of [0.8, 0.55, 0.3, 0.1]) out.push({ n: 3, perch: k * from, sq: out.length % 2 ? -1 : 0 });
  out.push({ n: 3, sq: 1 }, { n: 4 });
  return out;
}

/** up there: still, then looking one way and the other */
const sit = (extra: readonly Pose[] = []): Pose[] => [
  { n: [90, 180], perch: 1 }, ...extra, { n: [50, 120], perch: 1, turn: true }, { n: [60, 150], perch: 1 }, { n: [50, 120], perch: 1, turn: true }, { n: [40, 90], perch: 1 },
];

const acts = (id: string, script: readonly Pose[], when?: When): Act[] =>
  (['tree', 'roof'] as const).map((at: SpotKind) => ({ id: `${id}:${at}`, at, ...(when ? { when } : {}), script, rest: [60, 150] as const }));

const HOOT: Pose = { n: 30, perch: 1, sq: -1, fx: [{ kind: 'note', at: 'head', x: 3, y: 1, life: 40 }] };

/** the Owl, at night: up a tree or onto the roof, a hoot, a long look round */
export const OWL_PERCH: Trait = { id: 'owlPerch', acts: acts('owlPerch', [...flyUp(), ...sit([HOOT]), { n: [120, 240], perch: 1 }, ...flyDown()], { hours: [20, 6] }) };

/** down and out from the perch, a turn at the bottom, and back up to it */
function swoop (): Pose[] {
  const out: Pose[] = [{ n: 4, perch: 1, sq: -1 }];
  const down: [number, number][] = [[0.8, 2], [0.55, 5], [0.3, 9], [0.12, 13], [0.05, 16]];
  for (const [k, f] of down) out.push({ n: 2, perch: k, fwd: f });
  // turned round at the bottom: the same place on screen is now the other way along
  out.push({ n: 3, perch: 0.05, fwd: -16, turn: true, sq: 1 });
  for (let i = down.length - 2; i >= 0; i--) out.push({ n: 3, perch: down[i][0], fwd: -down[i][1], sq: i % 2 ? -1 : 0 });
  out.push({ n: 4, perch: 1, sq: 1 });
  return out;
}

/** the Falcon, by day: up to a perch, a swoop now and then, back down */
export const FALCON: Trait = { id: 'swoop', acts: acts('swoop', [...flyUp(), { n: [60, 120], perch: 1 }, ...swoop(), ...sit(), ...flyDown()], { hours: [7, 19] }) };

/** the gryphons: up to the ridge or a crown, sitting there a long while */
export const GRYPHON_PERCH: Trait = { id: 'perch', acts: acts('perch', [...flyUp(), ...sit([{ n: [120, 300], perch: 1 }]), ...flyDown()], { hours: [7, 20] }) };
