/*
 * What a creature's nature is made of (thread "Behaviours by species", Vlad 2026-10-15: build every behaviour in
 * the species list behind it). Everything here is plain data, so the app can hand a
 * creature's resolved nature to the live wallpaper with its picture and the Java herd (android/verdict
 * StableNature) runs it without a table of its own: one source of truth, and the fixture replay
 * (npm run android:test) catches any drift.
 *
 * The pieces (numbers are art pixels, 3 world pixels, and ticks, 30 a second):
 *   Schedule  P1  when it sleeps by the stable, when it walks home first, and naps in bouts
 *   Like      P2  a place of the scene (Spot) it walks to now and then
 *   Pose.cut  P3  the cut line: drawn only above a line (swimming, burrowing, lurking)
 *   Pace      P5  how it walks: speed, rests, walk lengths, sprints, sideways, never on its own
 *   Emit      P7  particles from a pose (a note, dust, dirt), looks in ParticleLook
 *   Act           a special thing it does now and then: a pose script, perhaps at a place, under a condition
 *   Touch     P8  what a tap, a pick-up, a drop or a tap on the ground near it does (only the tap on the wallpaper)
 *   BallPlay  P9  how it plays with the ball and anything else that rolls (app only: the wallpaper has no ball)
 *
 * The pacing guard: a creature does an act on at most 1 wander in 2 while the act's condition holds, and at most 3
 * creatures are doing (or walking to) one at a time; the rest of the time it wanders as before (Vlad agreed 1 in 4
 * and 2 at first; on 15 Oct the acts were too rarely seen).
 */

import type { Motion } from '../creatures';

/** The phone's moment, as natures see it. */
export interface Now {
  /** the phone's clock, hours with minutes as a fraction */
  hour: number;
  /** winter (the scene's season): snow lies outside Sandy cove and Mushroom glade */
  winter: boolean;
  /** tonight's moon (scenes/clock.ts moonPhase: 0 new, 4 full) */
  moon: number;
  /** the scene has water: the pond, the marsh's pools, the lake or the sea */
  water: boolean;
}

/** A condition on the moment; every field given must hold. */
export interface When {
  /** [from, to) on the phone's clock; from > to wraps past midnight ([21, 6] = bedtime until morning) */
  hours?: readonly [number, number];
  /** true: only in winter; false: never in winter */
  winter?: boolean;
  /** only on these moon phases */
  moon?: readonly number[];
  /** true: only where the scene has water; false: only where it has none yet */
  water?: boolean;
}

/** Asleep `on` ticks out of every `cycle` while `when` holds, wherever it is (each creature at its own phase). */
export interface Nap { when: When, cycle: number, on: number }

/** P1: when it sleeps. A creature with no nature keeps the herd's old rule (DAY, or awake all night when its
 * sprite is nocturnal). */
export interface Schedule {
  /** asleep between these hours, by the stable (when it got there) */
  sleep?: readonly [number, number];
  /** walks to the stable's door between these hours (dusk before bed) */
  home?: readonly [number, number];
  naps?: readonly Nap[];
}

/** P5: how it walks. */
export interface Pace {
  /** instead of its gait's motion (Kangaroo bounds, Sloth crawls) */
  motion?: Motion;
  /** times the distance per tick (1) */
  speed: number;
  /** times the rest between walks (1) */
  rest: number;
  /** walk length, art pixels (10 to 50) */
  range?: readonly [number, number];
  /** walks along without turning round, mostly across (Crab) */
  sideways?: boolean;
  /** never walks on its own (a pet rock) */
  still?: boolean;
  /** a walk of its own is now and then a sprint: chance p, `mul` times as fast, `range` long (art pixels; else
   * as any walk), `fx` every `every` ticks while it runs */
  sprint?: { p: number, mul: number, range?: readonly [number, number], every?: number, fx?: Emit };
  /** gives off `fx` every `every` ticks while it walks, while `when` holds (a Snail's trail, a TRex's dust) */
  trail?: { when?: When, every: number, fx: Emit };
  /** P6: a walk is now and then a roll (chance p): steady, a quarter turn forward every `every` ticks */
  roll?: { p: number, every: number };
}

/** A mood: while `when` holds, its pace's speed and rest are multiplied (lively in snow, sluggish at dusk). */
export interface Mood { when: When, speed?: number, rest?: number }

/** The places a scene has, for P2. Each scene lists what it has (paint.ts SceneLayout.spots). */
export type SpotKind =
  | 'door' // the stable's door (from the herd's home)
  | 'water' // the pond, the marsh's pools, the lake or the sea (strip: above the walking ground)
  | 'shore' // along the lake's or the sea's edge, on the walking ground
  | 'tree' // every tree, on the horizon or standing on the walking ground (h: its height)
  | 'flowers' // the flower patches Perfect Days grow (none under snow)
  | 'sun' // open ground away from trees and the stable (sunny by day)
  | 'lantern' // the lantern post beside the stable
  | 'roof' // the stable's roof, once it is a building
  | 'rocks' // rocks and stones
  | 'bamboo' // the bamboo grove's canes
  | 'lily'; // a lily pad on the marsh's pools

/** One place: (x, y) is where a creature stands to be there (the foot), world pixels; w x h its extent (0 for a
 * point; a tree's h is its height). `strip`: a band above the walking ground (the lake, the sea). `pond`: the pond a
 * Daily streak grows (where sea creatures meet; the newest flower patch is the last 'flowers'). */
export interface Spot { kind: SpotKind, x: number, y: number, w: number, h: number, strip?: boolean, pond?: boolean }

/** P2: walks to a place of this kind on a wander with chance p, while `when` holds. */
export interface Like { at: SpotKind, p: number, when?: When }

/** P7: particles a pose gives off, placed from the creature: its head (top of the picture, middle), feet, the
 * front or back edge at the feet, its nose (the front edge, a quarter of the way down the picture); x along the way it faces, y up negative, both art pixels. side +1 sends it the
 * way the creature faces (a particle's `move` dx runs that way), -1 the other. */
export interface Emit { kind: string, at: 'head' | 'feet' | 'front' | 'back' | 'nose', x?: number, y?: number, life: number, side?: 1 | -1 }

/** One pose of a script, held `n` ticks (or a number of ticks drawn from [min, max]). */
export interface Pose {
  n: number | readonly [number, number];
  /** art pixels above the ground */
  lift?: number;
  /** art pixels below the ground (drawn sunk; with no cut, cut at the ground) */
  sink?: number;
  /** P3: drawn only above a line this many art pixels above its feet (0 = the ground) */
  cut?: number;
  /** 1 squash, -1 stretch */
  sq?: -1 | 0 | 1;
  /** art pixels sideways (a wobble) */
  dx?: number;
  /** the trot's legs apart */
  leg?: 0 | 1;
  /** turns round as the pose starts */
  turn?: boolean;
  /** P6: quarter turns forward (the head going down the way it faces): 1 on its belly or face, 2 upside down
   * (on its back, hanging), 3 the other way (src/playground/turns.ts) */
  rot?: 0 | 1 | 2 | 3;
  /** moves along the way it faces, art pixels a tick, staying in the world (a slide; in a 1-tick pose, a jump
   * there: the Bunny comes up a little way off) */
  go?: number;
  /** given off as the pose starts */
  fx?: readonly Emit[];
  /** wakes sleepers within this many art pixels as the pose starts (the Rooster's crow) */
  wake?: number;
  /** idle creatures within this many art pixels turn to face it as the pose starts (a Wolf's howl) */
  look?: number;
  /** P4: up off the ground, this fraction (0 to 1) of the way to the top of the place the act is at (a tree's
   * crown, the stable's ridge), when it stands at one; a flyer's own hover fades out on the way up, and `lift`
   * never takes it below the ground then */
  perch?: number;
  /** P4: up in the sky, this fraction of the way from its feet to halfway between the world's top and the
   * walking ground's (above the trees) */
  soar?: number;
  /** art pixels along the way it faces (a swoop, a glide), drawn only: where it stands is unchanged */
  fwd?: number;
  /** turns to face the middle of the world as the pose starts (before `turn`), so a glide stays on screen */
  inward?: boolean;
  /** in the water: this much of its picture's height under the waterline (0 to 1), cut there (swimming, diving,
   * lurking); with lift it rises out of the water (a breach) */
  depth?: number;
  /** swims along the way it faces, art pixels a second, inside the water it is in; turns round at the edge */
  glide?: number;
  /** comes up somewhere else in the same water as the pose starts (after a dive) */
  elsewhere?: boolean;
}

/** A light it gives off while `when` holds, awake or asleep: a pool of warm art pixels on the ground around its
 * feet, r art pixels across each way and a third as deep (inner half cols[0] in a checker, the rest cols[1] one in
 * four, shifting every 8 ticks when it flickers), and `fx` given off every `every` ticks, taking turns (embers, a
 * blinking light). r 0: no pool. */
export interface Glow {
  when?: When;
  r: number;
  cols?: readonly [string, string];
  flicker?: boolean;
  fx?: readonly Emit[];
  every?: number;
}

/** A special thing a creature does: when `when` holds (and, with `at`, after walking to such a place), it plays
 * `script` `loops` times, then rests. `p` weighs it against its other acts. At 'water' it only counts water the
 * creature fits in with room to spare (a mount: only the lake or the sea), and starts only with its feet in it. */
export interface Act {
  id: string;
  when?: When;
  at?: SpotKind;
  p?: number;
  script: readonly Pose[];
  loops?: readonly [number, number];
  /** ticks of rest after (default the usual 45 to 165) */
  rest?: readonly [number, number];
}

/** P8: what touch does to it beyond the usual. Each field is replaced whole by a more specific trait. */
export interface Touch {
  /** a tap (or the sheet's Pet): this act instead of the happy hop, the heart as usual; an empty script, no hop
   * at all (a pet rock). The wallpaper's taps do this too. */
  tap?: Act;
  /** picked up: given off as the finger lifts it (app only) */
  lift?: readonly Emit[];
  /** its pose while carried, in place of the dangle (Hedgehog curls up); lift is above the finger's height
   * (app only) */
  hold?: Pose;
  /** dropped: this act instead of landing's squash, dust and shake (app only) */
  land?: Act;
  /** a tap on the ground within 30 art pixels: it bounds this many art pixels away instead of turning to look
   * (app only) */
  shy?: number;
}

/** P9: what it does when it reaches the ball (or a rolling toy) it chased: fetch carries it back to where it was
 * flicked from, push rolls it along in front of it, pounce crouches, wiggles and leaps onto it, nose bounces it on
 * its nose when it lies in the water. Anything else bumps it back, as every pet does. */
export type BallPlay = 'fetch' | 'push' | 'pounce' | 'nose';

/** A creature's resolved nature: everything the herd (and the wallpaper's) needs, no lookups left. */
export interface Nature {
  /** the traits it was made of (behaviour modules), most general first: for tests and the sheet */
  traits: readonly string[];
  /** Habitica's animal sets and our own groups it belongs to (natures.ts FAMILIES) */
  families: readonly string[];
  schedule: Schedule;
  pace: Pace;
  moods: readonly Mood[];
  likes: readonly Like[];
  acts: readonly Act[];
  /** its pose in the still picture (reduced motion, the widget), when not the plain standing one */
  still?: Pose;
  /** the light it gives off (a JackOLantern, a Phoenix) */
  glow?: Glow;
  touch?: Touch;
  ball?: BallPlay;
}

/** One behaviour module: a trait a nature is built from. Fields merge per axis, the more specific level
 * (exact key > potion > species) winning: schedule and each pace field are replaced, moods, likes and acts add
 * up, `drop` removes acts by id, each touch field and the ball are replaced. */
export interface Trait {
  id: string;
  schedule?: Schedule;
  pace?: Partial<Pace>;
  moods?: readonly Mood[];
  likes?: readonly Like[];
  acts?: readonly Act[];
  drop?: readonly string[];
  still?: Pose;
  glow?: Glow;
  /** particle looks its acts use */
  particles?: Readonly<Record<string, ParticleLook>>;
  touch?: Touch;
  ball?: BallPlay;
}

/**
 * A particle's look, plain data so the wallpaper draws it too. Pictures are rows of art pixels ('.' clear, other
 * characters name a colour in cols); the picture sits on the particle's (x, y): left edge x, bottom edge y.
 */
export interface ParticleLook {
  /** the picture by age: the first whose `until` (ticks) is above its age, else the last */
  frames: readonly { rows: readonly string[], until?: number }[];
  /** its last 2 ticks (none: no pop) */
  pop?: readonly string[];
  cols: Readonly<Record<string, string>>;
  /** an art pixel's step every `every` ticks while from <= age < to (dx along its side) */
  move?: readonly { every: number, dx?: number, dy?: number, from?: number, to?: number }[];
  /** mirrored when sent the other way (side -1) */
  mirror?: boolean;
}
