/* The behaviour modules: one trait each (types.ts Trait), listed here by id. src/stable/natures.ts says which
 * species, potions and single creatures have which traits and resolves them into a creature's Nature; the herd
 * runs it (runner.ts), and so does the wallpaper's Java herd from the same data.
 *
 * A new behaviour: a module here exporting its Trait (schedule, pace, moods, likes, acts as pose scripts,
 * particle looks), a line in TRAITS, its species in natures.ts. Anything the pose script can't say yet (a
 * perch, a quarter turn) is a new Pose field, run in both runner.ts and android/verdict StableNature. */
import { BASK } from './bask';
import { FETCH, NOSE_BALL, POUNCE, PUSH_BALL } from './balls';
import { BURROWING, DIGGING, MOUSING } from './burrow';
import { BAMBOO, BEE, BUTTERFLY } from './flowers';
import { CROWING } from './crow';
import { EARLY } from './early';
import { FLAME } from './flame';
import { FLOAT } from './float';
import { FX_LOOKS } from './fx';
import { BOUNDS, SIDEWAYS } from './gaits';
import { EMBERS, LANTERN, ROBOT } from './glow';
import { GRAZING, MOO } from './graze';
import { HANG } from './hang';
import { HOMEBODY, LOUNGE } from './homebody';
import { HOWL } from './howl';
import { NIGHT } from './night';
import { FALCON, GRYPHON_PERCH, OWL_PERCH } from './perch';
import { ROCK, SUNLOVER, WOBBLE } from './objects';
import { POPCORN } from './popcorn';
import { RUMMAGE } from './rummage';
import { CURL, ROLLER, ROLLS } from './roll';
import { CRAWL, LONG_SLEEPER } from './sleeper';
import { SOAR } from './soar';
import { FLUTTER } from './flutter';
import { PARROT_PERCH, SAIL } from './flight';
import { BELLY_SLIDE } from './slide';
import { DASH, SCURRY, SPRINT } from './sprint';
import { SLIME, SPARKLE, STOMP } from './trails';
import { INK, RUSTLE, SHY, SPLAT, STONY, WAR_DANCE } from './touch';
import { TWILIGHT } from './twilight';
import { BROWSE, CLIMB, MONKEY_CLIMB, SPIDER, TREELING } from './trees';
import { SNOW_LOVER, WINTER_NAP } from './winter';
import { BREACH, FISHING, LILY, LURK, SEA, SPOUT, SWIM, WATER_LOOKS } from './water';
import type { Nature, ParticleLook, Trait } from './types';

export type * from './types';

const ALL: readonly Trait[] = [
  NIGHT, TWILIGHT, EARLY, CROWING, LONG_SLEEPER, CRAWL, HOMEBODY, LOUNGE, SPRINT, DASH, SCURRY, POPCORN, BOUNDS, SIDEWAYS,
  WOBBLE, ROCK, SUNLOVER, BASK, SNOW_LOVER, WINTER_NAP,
  // G: ground, light and night details
  GRAZING, MOO, BURROWING, DIGGING, MOUSING, RUMMAGE, LANTERN, EMBERS, ROBOT, FLAME, SPARKLE, SLIME, STOMP, HOWL,
  // B: ball and touch
  WAR_DANCE, STONY, RUSTLE, INK, SPLAT, SHY, FETCH, PUSH_BALL, POUNCE, NOSE_BALL,
  // T: trees, sky and flowers
  OWL_PERCH, FALCON, GRYPHON_PERCH, SOAR, CLIMB, MONKEY_CLIMB, SPIDER, BROWSE, TREELING, BUTTERFLY, BEE, BAMBOO,
  // R: turns
  ROLLS, ROLLER, CURL, FLOAT, HANG, BELLY_SLIDE,
  // W: water
  SWIM, SEA, BREACH, SPOUT, LURK, LILY, FISHING,
  // more fliers: the Flying Pig, the Dragon and the Phoenix, the Parrot
  FLUTTER, SAIL, PARROT_PERCH,
];

let traits: Record<string, Trait> | null = null;
/** every trait by id */
export function traitById (id: string): Trait | undefined {
  if (!traits) { traits = {}; for (const t of ALL) traits[t.id] = t; }
  return traits[id];
}
export const traitIds = (): string[] => ALL.map(t => t.id);

let looks: Record<string, ParticleLook> | null = null;
/** every particle look the behaviours use, by kind */
export function particleLook (kind: string): ParticleLook | undefined {
  if (!looks) {
    looks = { ...FX_LOOKS, ...WATER_LOOKS };
    for (const t of ALL) for (const k in t.particles ?? {}) looks[k] = t.particles![k];
  }
  return looks[kind];
}

/** the looks of every particle these natures give off (the wallpaper draws them from these) */
export function looksOf (natures: readonly (Nature | undefined)[]): Record<string, ParticleLook> {
  const out: Record<string, ParticleLook> = {};
  const add = (kind: string) => { const l = particleLook(kind); if (l) out[kind] = l; };
  for (const n of natures) {
    for (const a of n?.acts ?? []) for (const p of a.script) for (const e of p.fx ?? []) add(e.kind);
    // a tap's reaction runs on the wallpaper too
    for (const p of n?.touch?.tap?.script ?? []) for (const e of p.fx ?? []) add(e.kind);
    const fx = n?.pace.sprint?.fx;
    if (fx) add(fx.kind);
    if (n?.pace.trail) add(n.pace.trail.fx.kind);
    for (const e of n?.glow?.fx ?? []) add(e.kind);
  }
  return out;
}
