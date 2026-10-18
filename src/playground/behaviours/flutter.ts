/* The Flying Pig flies (Vlad 2026-10-16: it hovered all day and never went anywhere): a crouch, a hop off and a
 * slanting climb on busy little wingbeats to about the treetops, a loop out and back with a bob now and then, and
 * down where it took off; once or twice, then a rest. Lower and shorter than the Pterodactyl's soar, and always
 * flapping, never gliding. Every pose up there is on the way somewhere (fwd), so the still picture keeps it on its
 * own hover by the herd (runner.ts topPose). */
import type { Pose, Trait } from './types';

/** how high it gets: this much of the Pterodactyl's way up (Pose.soar) */
const HIGH = 0.55;

function flutter (): Pose[] {
  // facing the middle first, so the loop stays on screen
  const out: Pose[] = [{ n: 4, sq: 1, inward: true }, { n: 2, sq: -1, soar: 0.05, fwd: 1 }];
  for (let i = 1; i <= 8; i++) out.push({ n: 3, soar: HIGH * i / 8, fwd: 1 + i, sq: i % 2 ? -1 : 0 });
  // out: a wingbeat every other step, a pixel's bob every fourth
  for (let f = 10; f <= 34; f += 2) out.push({ n: 2, soar: HIGH, fwd: f, sq: f % 4 ? -1 : 0, lift: f % 8 === 0 ? 1 : 0 });
  out.push({ n: 6, soar: HIGH, fwd: -34, turn: true, sq: -1 });
  for (let f = 32; f >= 10; f -= 2) out.push({ n: 2, soar: HIGH, fwd: -f, sq: f % 4 ? -1 : 0, lift: f % 8 === 0 ? 1 : 0 });
  for (let i = 7; i >= 1; i--) out.push({ n: 3, soar: HIGH * i / 8, fwd: -(1 + i), sq: i % 2 ? -1 : 0 });
  out.push({ n: 2, soar: 0.05, fwd: -1, sq: -1 }, { n: 3, sq: 1 }, { n: 6 });
  return out;
}

export const FLUTTER: Trait = { id: 'flutter', acts: [{ id: 'flutter', when: { hours: [8, 19] }, script: flutter(), loops: [1, 2], rest: [120, 240] }] };
