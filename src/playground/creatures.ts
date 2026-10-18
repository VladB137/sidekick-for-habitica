/* The creatures: Habitica's pets and mounts living in a playground, as the Stable design spec (round 2,
 * approved 2026-10-14) describes them. Habitica gives one still frame per creature, so all motion is ours,
 * made of whole art pixels (3 world pixels) without ever scaling a sprite: squash, stretch, lean and the trot
 * are row slices of the one frame, shifted on the grid.
 *
 *   gait          moves by                                           numbers (art pixels, 30 ticks a second)
 *   four-legged   trot: bottom 3 rows split front/back, step apart  every 4 ticks · pet 10/s · mount 14/s
 *   sitting       hop: stretch, arc, squash (also anything untagged) 16-tick cycle · arc 3 (mount 4) · 5 a hop
 *   leaping       bound: a long low leap                            22-tick cycle · arc 5 · 9 a bound
 *   legless       scoot: small quick nudges with a squash           6-tick cycle · lift 1 · 2 a nudge
 *   flying        hover: glides and bobs, shadow on the ground      height 6 (mount 8) · bob 1 / 8 ticks · 12/s
 *
 * Facing is the way the body points as drawn, tail to head; a creature mirrors only when it turns, only on the
 * ground, and pauses 2 ticks before setting off. Touch: tap = one happy hop and a heart (3 at most), a drag
 * across = lean into the finger with hearts, press and hold = lift, dangle, drop with a fall, dust and a shake,
 * tap the ground = those near turn to look, flick the ball = the nearest awake pets (3 at most) chase it and
 * take turns bumping it back. With reduced motion the meadow is a still diorama: feedback appears, nothing
 * travels.
 *
 * The herd is headless like the world: a scene tells it where the ground is, the shadow colour, the stable's
 * door and the clock; the pet-picking screen tells it who lives here and stores where they were dropped.
 *
 * The player's avatar, when it rides nothing here, stands on foot beside the stable's door (Avatar): now and
 * then a creature walks over to greet it (a heart, and the avatar hops), a tap on it calls the nearest one
 * over, and while the player rests in Habitica's Inn the herd sleeps by the door whatever the hour. Visitors
 * (Herd.visit) are a party member's creatures walking in from the side for a while; they never belong here. */
import { ART, COLOURS, HEART_LIFE, drawParticle, drawSweat, stepParticle, type Particle } from './particles';
import { Ball, BALL_SIZE, type BallOptions } from './ball';
import { BallPlay, type Roller } from './ballplay';
import { TICK_MS } from './frame';
import { BEDTIME, DUSK, MORNING } from './hours';
import { applyPose, canAct, choose, clearPose, drawGlow, emitPoint, glowFx, glowing, goesUp, holds, homeward, inHours, paceNow, places, quitAct, REST, rested, scheduleOf, sleepy, spotKey, startAct, stepAct, topPose, wade, WOKEN } from './behaviours/runner';
import type { Act, Emit, Nature, Now, Pose, Spot, SpotKind } from './behaviours/types';
import type { Rng } from './rng';
import type { Facing, Gait, Sprite } from './sprites';
import type { Interaction, Stage } from './stage';
import type { Ctx, Entity, Layer, World } from './world';
import { drawTurned, screenTurns, turnedBox, turnedPart, turnedPixel } from './turns';

export type Motion = 'trot' | 'hop' | 'bound' | 'scoot' | 'hover';

/** The gait tag's motion: only four-legged creatures trot; untagged ones hop, which never looks wrong. */
export function motionOf (g: Gait | undefined): Motion {
  switch (g) {
    case 'four-legged': case 'upright': return 'trot';
    case 'leaping': return 'bound';
    case 'legless': return 'scoot';
    case 'flying': return 'hover';
    default: return 'hop';
  }
}

/** How it gets on with others (src/app/stable/social.ts reads it from Habitica's word for its egg). */
export type Temper = 'close' | 'usual' | 'aloof' | 'mischief';
/** family: a pet and its grown-up (the mount of the same key); kin: one animal; friend: paired up here;
 * cousin: one of Habitica's animal families; alike: the same hatching potion */
export type BondKind = 'family' | 'kin' | 'friend' | 'cousin' | 'alike';
export interface Bond { id: string, kind: BondKind }

/** How often a creature walks over to company (a mount half as often), how near it stands (art pixels), and how
 * often, standing about, it does a little something (Fidget) on each check. */
export const TEMPERS: Record<Temper, { seek: number, gap: number, fidget: number }> = {
  close: { seek: 0.6, gap: 3, fidget: 0.5 }, usual: { seek: 0.4, gap: 6, fidget: 0.45 }, aloof: { seek: 0.2, gap: 10, fidget: 0.35 }, mischief: { seek: 0.4, gap: 6, fidget: 0.6 },
};
/**
 * Company ebbs (Vlad, 15 Oct: friends close only some of the time). Every walk to company (a friend, a signature
 * pair's partner, the avatar), every greeting and every time it follows another adds FILL to how much company a
 * creature has had lately, up to 1; every wander keeps KEEP of it. It seeks company, keeps by its pair and follows
 * only (1 - fill) as often as its temper says, so after time together it goes off on its own for a while.
 */
const FILL = 0.6, KEEP = 0.8;
/** a little one or a train follower sets off after the one it follows at most this often (times 1 - fill) */
const FOLLOW = 0.75;
/**
 * Standing about, a creature checks every FIDGET_EVERY ticks (at its own phase) whether to do a little something:
 * look round, sniff the ground, scratch, stretch or hop. Weights per temper, in that order: the aloof look about,
 * mischief makers scratch and hop.
 */
const FIDGET_EVERY = 20;
const FIDGETS: Record<Temper, readonly number[]> = {
  close: [2, 2, 1, 1, 2], usual: [2, 2, 1, 1, 1], aloof: [3, 2, 1, 2, 0], mischief: [1, 1, 2, 1, 3],
};
/** fidget kinds, the index into FIDGETS */
const LOOK = 0, SNIFF = 1, SCRATCH = 2, STRETCH = 3, HOP = 4;
/** How strongly each bond draws a creature over, against the others it has here. */
const PULL: Record<BondKind, number> = { family: 6, kin: 4, friend: 4, cousin: 2, alike: 1 };
/** bonds that lie down together at night and breathe in step */
const SNUG: ReadonlySet<BondKind> = new Set(['family', 'friend', 'kin']);

/** One creature living here. */
export interface Resident {
  id: string;
  /** sprite key of the picture (a mount's body layer) */
  sprite: string;
  /** a mount's head layer, drawn over the body (and over a rider) */
  head?: string;
  kind: 'pet' | 'mount';
  /** Habitica species ('Wolf'): pets keep company with their own kind and the mount of their kind */
  species: string;
  /** where it was last dropped: x across the world, y down the ground band, both 0..1 */
  spot?: { x: number, y: number };
  /** how it gets on with others, and whom it's bonded to here (strongest first); without them it keeps company
   * with its own species only, as before */
  temper?: Temper;
  bonds?: readonly Bond[];
  /** its species' ways (src/stable/natures.ts natureOf): when it sleeps, how it walks, where it likes to be, the
   * special things it does; without one it lives by the herd's old rules */
  nature?: Nature;
  /** one of Habitica's Polar Pro animals: snow is its weather, it never huddles against it */
  cold?: boolean;
  /* signature pairs (social.ts): two species that make a moment people recognise */
  /** walks behind this one when it sets off, by day (penguins single file, the dinosaur gang, the slow club) */
  lead?: string;
  /** keeps near this one facing outward, and sleeps beside it (a Dragon and an Egg) */
  guard?: string;
  /** hops circles around this one, then sits beside it (a Squirrel and a Treeling) */
  orbit?: string;
  /** stalks and pounces on this one, which scoots off (a Cat and Yarn) */
  pounce?: string;
  /** a sheepdog: circles these sheep */
  flock?: readonly string[];
  /** a sheep with a dog about: when it strays from these it walks back */
  fold?: readonly string[];
  /** meets its own kind at the pond (sea creatures) or over the flowers (bees and butterflies) */
  meet?: 'pond' | 'flowers';
  /** a Veteran: the others walk over to it first */
  elder?: boolean;
  /** brave, mighty, fierce or ferocious, or a Veteran: it faces a boss in the sky */
  bold?: boolean;
  /** a party member's creature visiting (Herd.visit): not one of the residents */
  visitor?: boolean;
}

/**
 * One picture of a rider (the player's avatar on a mount), drawn between the mount's body and its head the way
 * Habitica layers them. x, y: its top-left from the top-left of the mount's (unmirrored) picture, world pixels;
 * it may reach outside that picture (the avatar sits above the saddle).
 */
export interface RiderLayer { image: CanvasImageSource, x: number, y: number, w: number, h: number }

/** Hop arcs, art pixels per airborne tick: stretch tick, arc, 2 squash ticks, rest. */
const ARCS: Record<'hop' | 'bound' | 'scoot', { arc: number[], dist: number, rest: number }> = {
  hop: { arc: [1, 2, 3, 3, 3, 2, 1], dist: 5, rest: 6 },             // 1 + 7 + 2 + 6 = 16 ticks
  bound: { arc: [1, 2, 3, 4, 5, 5, 5, 4, 3, 2, 1], dist: 9, rest: 8 }, // 1 + 11 + 2 + 8 = 22
  scoot: { arc: [1, 1], dist: 2, rest: 1 },                          // 1 + 2 + 2 + 1 = 6
};
const HAPPY_ARC = [0, 2, 3, 4, 4, 3, 2, 0];
/** the avatar on foot: half its body's width, and how often a creature choosing a walk goes to greet it */
const AV_HALF = 6 * ART, GREET = 0.3;
const SPIN_ARC = [0, 2, 4, 5, 6, 7, 7, 7, 6, 5, 4, 2, 0];

const snap = (v: number) => Math.round(v / ART) * ART;
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

type State = 'idle' | 'turn' | 'move' | 'chase' | 'happy' | 'spin' | 'held' | 'fall' | 'land' | 'act';

export class Creature implements Entity {
  readonly id: string;
  sprite: string;
  head?: string;
  readonly kind: 'pet' | 'mount';
  readonly species: string;
  /** a party member's, visiting */
  readonly visitor: boolean;
  /** walking over to greet the avatar on foot */
  greet = false;
  /** a visitor on its way out */
  leaving = false;
  /** drawn position: (fx, fy) snapped to art pixels, so drawing, depth and hit-testing agree */
  x = 0; y = 0;
  /** precise position on the ground, world pixels */
  fx = 0; fy = 0;
  /** +1 = body pointing right on screen, -1 = left */
  dir = 1;
  st: State = 'idle';
  /** ticks in this state */
  t = 0;
  /** ticks of the current hop cycle */
  cyc = 0;
  /** ticks to wait before the next walk */
  wait = 0;
  /** height above the ground and resting height (a flyer hovers), world pixels */
  lift = 0;
  base = 0;
  /** 1 = squash, -1 = stretch, 0 = neither */
  sq = 0;
  /** leaning into a finger: -1, 0, +1 (screen direction) */
  lean = 0;
  /** the trot's legs apart */
  leg = 0;
  /** shake offset, art pixels */
  dx = 0;
  /** where it's heading */
  tx = 0; ty = 0;
  /** hearts showing above it now */
  hearts = 0;
  /** its own breathing rhythm (ticks), so the herd never breathes in sync */
  breathEvery = 60;
  breathAt = 0;
  asleep = false;
  /** the player's avatar riding this mount, bottom layer first (Herd.ride) */
  rider?: readonly RiderLayer[];
  /** ticks left awake after being petted at night */
  wake = 0;
  /** the finger while carried */
  hx = 0; hy = 0;
  vz = 0;
  lastStroke = -99;
  temper?: Temper;
  bonds: readonly Bond[] = [];
  /** placed without a saved spot: it starts beside a friend */
  free = false;
  /** the bonded creature it is walking over to */
  mate: Creature | null = null;
  /** a little one setting off after its grown-up in a few ticks */
  follow: { of: Creature, in: number } | null = null;
  /** ticks until it copies its grown-up's happy hop */
  copy = 0;
  /** drawn this much higher (a toy it stands on) or, negative, lower (sunk behind a hiding spot), world pixels; no shadow then */
  off = 0;
  /** drawn only above this world y (behind a hiding spot or in a hay pile) */
  clipBelow?: number;
  /** off and clipBelow are its wading (behaviours/runner.ts wade) */
  wet = false;
  /** what it is busy with (a toy or hiding, src/playground/play; 'moment' with another creature, a greeting or a nuzzle;
   * 'act', one of its species' behaviours): the ball, wandering and other creatures leave it alone */
  busy?: string;
  /** its nature (Resident.nature), the act it is doing (state 'act') and the one it is walking to do */
  nature?: Nature;
  act: { a: Act, i: number, t: number, n: number, loops: number, top?: number } | null = null;
  plan: Act | null = null;
  /** in the still picture, up at the place of an act that goes up (P4: a crown, the ridge, a flower, the sky;
   * Herd.settle): where it stood, and the pose it holds up there */
  perched: { fx: number, fy: number, pose: Pose } | null = null;
  /** put down by a finger in the still picture: it stays where it was put until the meadow moves again */
  grounded = false;
  /** this walk is a sprint (Pace.sprint) */
  sprinting = false;
  /** P6: quarter turns forward it is drawn turned this tick (set afresh each tick by an act, a roll or being held),
   * and this walk is a roll (Pace.roll) */
  rot = 0;
  rolling = false;
  /** this walk is bolting away from a tap on the ground (Touch.shy; app only, the wallpaper has no ground taps) */
  bolt = false;
  cold = false;
  lead?: string; guard?: string; orbit?: string; pounce?: string; flock?: readonly string[]; fold?: readonly string[];
  meet?: 'pond' | 'flowers'; elder = false; bold = false;
  /** circles hopped around the one it orbits */
  lap = 0;
  /** how much company it has had lately, 0 to 1 (FILL) */
  fill = 0;
  /** a little something it is doing standing about (FIDGETS kind k, tick t of n; `back` the way it faced before) */
  fid: { k: number, t: number, n: number, back: number } | null = null;
  readonly rng: Rng;

  constructor (r: Resident, private herd: Herd) {
    this.id = r.id; this.sprite = r.sprite; this.head = r.head; this.kind = r.kind; this.species = r.species; this.nature = r.nature; this.visitor = !!r.visitor;
    this.free = !r.spot;
    this.know(r);
    this.rng = herd.rng.fork(`creature:${r.id}`);
    this.breathEvery = this.rng.int(48, 72);
    this.breathAt = this.rng.int(0, this.breathEvery - 1);
    this.wait = this.rng.int(20, 110);
  }

  /** how it gets on with the others (Resident's temper, bonds, cold and signature fields) */
  know (r: Resident) {
    this.temper = r.temper; this.bonds = r.bonds ?? []; this.cold = !!r.cold;
    this.lead = r.lead; this.guard = r.guard; this.orbit = r.orbit; this.pounce = r.pounce; this.flock = r.flock; this.fold = r.fold;
    this.meet = r.meet; this.elder = !!r.elder; this.bold = !!r.bold;
  }

  get mount () { return this.kind === 'mount'; }
  /** up at night: its nature's schedule keeps it awake at midnight, or (no nature) its sprite is a night one */
  nocturnal (w: World) {
    const n = this.nature, s = n?.schedule.sleep;
    return n ? !s || !inHours(0, s) : !!this.pic(w)?.nocturnal;
  }
  pic (w: World) { return w.sprites.get(this.sprite); }
  facing (w: World): Facing { return this.pic(w)?.facing ?? (this.mount ? 'left' : 'right'); }
  motion (w: World): Motion { return this.nature?.pace.motion ?? motionOf(this.pic(w)?.gait); }
  /** half its width, world pixels (to keep it inside the world) */
  half (w: World) { return Math.ceil((this.pic(w)?.w ?? 60) / 2); }
  /** arcs grow by a third on a mount */
  private get M () { return this.mount ? 4 / 3 : 1; }
  private art (n: number) { return Math.round(n * this.M) * ART; }

  /** mirrored on screen: the body points the other way from how it's drawn (never for a front-facing sprite) */
  flipped (w: World) { const f = this.facing(w); return f !== 'front' && (this.dir < 0) !== (f === 'left'); }

  setPos (x: number, y: number) { this.fx = x; this.fy = y; this.x = snap(x); this.y = snap(y); }

  /** a flyer rests in the air while awake; everything else on the ground */
  restHeight (w: World) { return this.motion(w) === 'hover' && !this.isAsleep ? (this.mount ? 8 : 6) * ART : 0; }
  get isAsleep () { return this.asleep && this.wake <= 0; }

  /* ---------------------------------------------------------------- one tick */
  update (w: World) {
    this.step(w);
    wade(this.herd, this);
  }

  private step (w: World) {
    const h = this.herd;
    // something else took over from its act (a tap, a chase, a moment): back to its own height, uncut
    if (this.act && this.st !== 'act') quitAct(this);
    // and from a fidget (walking, asleep, leaning, busy with something)
    if (this.fid && (this.st !== 'idle' || this.isAsleep || this.lean || this.busy)) this.unfidget();
    this.t++;
    this.rot = 0;
    if (this.wake > 0) this.wake--;
    this.base = this.restHeight(w);
    switch (this.st) {
      case 'act': stepAct(h, this); return;
      case 'held': {
        this.setPos(this.hx, clamp(this.hy + 8 * ART, h.band.top, h.band.bottom));
        // its own way of being carried (Touch.hold: the hedgehog curls up), else a dangle
        const hold = this.nature?.touch?.hold, up = Math.max(8 * ART, this.fy - this.hy);
        if (hold) { applyPose(this, hold); this.lift += up - this.base; return; }
        this.lift = up;
        this.dx = Math.floor(this.t / 6) % 2 ? 1 : -1; this.sq = 0;
        return;
      }
      case 'fall': {
        this.vz += 0.6 * ART;
        this.lift = Math.max(this.base, this.lift - this.vz); this.dx = 0;
        if (this.lift <= this.base) {
          this.lift = this.base;
          // its own landing (Touch.land: the slime splats), saved where it landed
          const land = this.nature?.touch?.land;
          if (land) { startAct(this, land); h.dropped(this); return; }
          this.st = 'land'; this.t = 0; this.sq = 1;
          const half = this.half(w);
          h.emit({ kind: 'dust', x: this.x - half, y: this.y + ART, vx: -1, t: 0, life: 9 });
          h.emit({ kind: 'dust', x: this.x + half - ART, y: this.y + ART, vx: 1, t: 0, life: 9 });
        }
        return;
      }
      case 'land': {
        this.sq = this.t < 3 ? 1 : 0;
        if (this.t >= 3) { const k = this.t - 3; this.dx = k < 12 ? (Math.floor(k / 2) % 2 ? -1 : 1) : 0; }
        if (this.t > 16) { this.dx = 0; this.idle(40); h.dropped(this); }
        return;
      }
      case 'happy': {
        this.sq = this.t === 1 ? -1 : this.t === 9 ? 1 : 0;
        this.lift = this.base + this.art(HAPPY_ARC[this.t] ?? 0);
        if (this.t > 10) this.idle(this.rng.int(30, 60));
        return;
      }
      case 'spin': {
        this.lift = this.base + (SPIN_ARC[this.t] ?? 0) * ART;
        if (this.t >= 3 && this.t <= 10 && this.t % 2 === 1) this.dir = -this.dir;
        this.sq = this.t === 1 ? -1 : this.t === 13 ? 1 : 0;
        if (this.t > 14) this.idle(40);
        return;
      }
    }
    if (this.isAsleep) {
      this.lift = 0; this.leg = 0; this.lean = 0;
      this.sq = Math.floor((w.tick + h.breathOf(this)) / 40) % 2 ? 1 : 0;
      return;
    }
    if (this.lean) { this.sq = 0; return; }
    if (this.st === 'turn') { this.lift = this.base; if (this.t >= 2) { this.st = 'move'; this.t = 0; this.cyc = 0; } return; }
    if (this.st === 'idle') {
      const hover = this.motion(w) === 'hover';
      this.leg = 0;
      this.lift = this.base + (hover ? (Math.floor((w.tick + this.breathAt) / 8) % 2) * ART : 0);
      this.sq = !hover && (w.tick + this.breathAt) % this.breathEvery < 8 ? 1 : 0;
      if (this.copy > 0 && --this.copy === 0) { this.st = 'happy'; this.t = 0; return; }
      if (this.follow && --this.follow.in <= 0) {
        const f = this.follow.of;
        this.follow = null;
        h.trail(this, f);
        if (this.st !== 'idle') return;
      }
      if (!this.fid && !this.busy && this.wait > 20 && (w.tick + this.breathAt) % FIDGET_EVERY === 0) this.fidget(w);
      if (this.fid) this.fidgeting();
      if (this.st === 'idle' && --this.wait <= 0) h.wander(this);
      return;
    }
    if (this.st === 'move' || this.st === 'chase') this.travel(w);
  }

  idle (wait: number) { this.st = 'idle'; this.t = 0; this.wait = wait; this.lift = this.base; this.sq = 0; this.leg = 0; this.dx = 0; this.vz = 0; this.plan = null; this.sprinting = false; this.rolling = false; this.bolt = false; this.fid = null; }

  /** Standing about: now and then a little something, by its temper (TEMPERS fidget, FIDGETS): looking round (not
   * a front-facing or sideways walker), sniffing the ground (not a flyer), a scratch, a stretch, a hop. */
  private fidget (w: World) {
    const tp = this.temper ?? 'usual';
    if (!this.rng.chance(TEMPERS[tp].fidget)) return;
    const ws = FIDGETS[tp].map((k, i) => (i === LOOK && (this.facing(w) === 'front' || this.sideways)) || (i === SNIFF && this.motion(w) === 'hover') ? 0 : k);
    let r = this.rng.next() * ws.reduce((a, b) => a + b, 0), k = ws.length - 1;
    for (let i = 0; i < ws.length; i++) { if (r < ws[i]) { k = i; break; } r -= ws[i]; }
    if (k === HOP) { this.st = 'happy'; this.t = 0; this.tx = this.fx; this.ty = this.fy; this.leg = 0; return; }
    this.startFidget(k, k === LOOK ? this.rng.int(30, 60) : k === SNIFF ? this.rng.int(24, 40) : k === SCRATCH ? this.rng.int(12, 20) : this.rng.int(10, 18));
  }

  /** a fidget of kind k, n ticks (a look round turns it now) */
  startFidget (k: number, n: number) {
    this.fid = { k, t: 0, n, back: this.dir };
    if (k === LOOK) this.dir = -this.dir;
  }

  /** one tick of its fidget: its shape, then done */
  private fidgeting () {
    const f = this.fid!;
    if (f.k === SNIFF) this.sq = Math.floor(f.t / 5) % 2 ? 0 : 1;
    else if (f.k === SCRATCH) this.dx = Math.floor(f.t / 2) % 2 ? 1 : -1;
    else if (f.k === STRETCH) this.sq = -1;
    if (++f.t >= f.n) this.unfidget();
  }

  /** turned to face something by the herd (a friend, a howl, the boss, fireflies): any fidget over, no looking back */
  face (d: number) { if (this.fid) { this.fid = null; this.dx = 0; } this.dir = d; }

  /** out of its fidget: no shake, and back the way it faced if it is still looking round */
  private unfidget () {
    const f = this.fid!;
    this.fid = null;
    this.dx = 0;
    if (f.k === LOOK && this.dir === -f.back) this.dir = f.back;
  }

  /** walks along without turning round (Pace.sideways) */
  private get sideways () { return !!this.nature?.pace.sideways; }

  goTo (x: number, y: number, chase = false) {
    if (this.fid) this.unfidget();
    this.tx = x; this.ty = y; this.plan = null; this.sprinting = false; this.rolling = false; this.bolt = false; this.greet = false;
    if (chase) { this.st = 'chase'; this.t = 0; return; }
    const want = x > this.fx + 0.5 ? 1 : x < this.fx - 0.5 ? -1 : this.dir;
    if (want !== this.dir && !this.sideways) { this.dir = want; this.st = 'turn'; } else this.st = 'move';
    this.t = 0; this.cyc = 0;
  }

  private travel (w: World) {
    const chase = this.st === 'chase';
    const dx = this.tx - this.fx, dy = this.ty - this.fy, d = Math.hypot(dx, dy);
    const want = dx > 0.5 ? 1 : dx < -0.5 ? -1 : this.dir;
    const grounded = this.lift <= this.base;
    if (want !== this.dir && grounded && !this.sideways) {
      this.dir = want;
      // a walk pauses 2 ticks after turning; a chase can't wait
      if (!chase) { this.st = 'turn'; this.t = 0; this.leg = 0; this.sq = 0; return; }
    }
    if (d < 1) {
      const plan = this.plan, now = this.herd.now();
      if (!chase) this.idle(rested(this, now, this.rng.int(REST[0], REST[1])));
      this.lift = this.base; this.sq = 0; this.leg = 0;
      if (!chase) this.herd.arrived(this, !!plan);
      if (this.greet) this.herd.greeted(this);
      // there to do something (still the time for it): it does it now
      if (plan && this.st === 'idle' && !this.busy && holds(plan.when, now) && canAct(this.herd, this, plan)) startAct(this, plan);
      return;
    }
    const sprint = this.sprinting ? this.nature!.pace.sprint! : null;
    const mul = chase ? 1.6 : sprint ? sprint.mul : this.bolt ? 2 : 1, sp = this.nature ? paceNow(this.nature, this.herd.now()).speed : 1;
    if (sprint?.fx && this.t % (sprint.every ?? 4) === 0) this.herd.emitFrom(this, sprint.fx);
    const trail = this.nature?.pace.trail;
    if (trail && this.t % trail.every === 0 && holds(trail.when, this.herd.now())) this.herd.emitFrom(this, trail.fx);
    const m = this.motion(w), roll = this.rolling ? this.nature!.pace.roll! : null;
    let adv = 0;
    if (roll) {
      // rolling along: steady, a quarter turn forward every few ticks
      adv = (this.mount ? 14 : 10) * ART / 30 * mul * sp;
      this.leg = 0; this.sq = 0; this.lift = this.base; this.rot = Math.floor(this.t / roll.every) % 4;
    } else if (m === 'trot') {
      adv = (this.mount ? 14 : 10) * ART / 30 * mul * sp;
      this.leg = Math.floor(this.t / 4) % 2; this.sq = 0; this.lift = this.base;
    } else if (m === 'hover') {
      adv = 12 * ART / 30 * mul * sp; this.sq = 0;
      this.lift = this.base + (Math.floor(w.tick / 8) % 2) * ART;
    } else {
      const a = ARCS[m], len = a.arc.length, cycle = 1 + len + 2 + Math.max(0, Math.round(a.rest / mul));
      const f = this.cyc++ % cycle;
      if (f === 0) { this.sq = -1; this.lift = this.base; }
      else if (f <= len) { this.sq = 0; this.lift = this.base + (m === 'scoot' ? a.arc[f - 1] * ART : this.art(a.arc[f - 1])); adv = a.dist * ART / len * (m === 'scoot' ? 1 : this.M) * (chase ? 1.2 : sprint || this.bolt ? 1.5 : 1) * sp; }
      else if (f <= len + 2) { this.sq = 1; this.lift = this.base; }
      else { this.sq = 0; this.lift = this.base; }
    }
    if (adv) { const s = Math.min(adv, d); this.setPos(this.fx + dx / d * s, this.fy + dy / d * s); }
  }

  /* ---------------------------------------------------------------- drawing */
  /** Where the picture's top-left sits (without the shake or lean), and the picture's size. */
  frame (w: World, s = this.pic(w)) {
    if (!s) return null;
    const flipped = this.flipped(w);
    const ax = flipped ? s.w - 1 - s.anchor.x : s.anchor.x;
    return { s, flipped, left: this.x - ax, top: this.y - s.anchor.y - snap(this.lift) };
  }

  draw (g: Ctx, w: World) {
    const still = this.herd.still();
    const body = this.frame(w);
    if (!body) return;
    const { s, flipped } = body;
    // still picture: the resting pose (a flyer keeps its height) or its nature's still one, feedback particles only
    const sp = still ? this.stillPose() : undefined;
    const lift = this.shownLift(still), lean = this.lean;
    const sq = still ? sp?.sq ?? 0 : this.sq, leg = still ? sp?.leg ?? 0 : this.leg;
    const dx = still ? (sp?.dx ?? 0) + (sp?.fwd ?? 0) * this.dir : this.dx;
    const left = body.left + dx * ART, top = this.y - s.anchor.y - lift;

    // shadow: a flat row (two for a mount) of the ground's dark colour, 60% of the width, 2 art px narrower per 2 of height
    const liftArt = Math.round(lift / ART);
    // turned a quarter (P6, never under a rider): drawn whole, body then head
    const q = this.rider ? 0 : screenTurns(still ? sp?.rot ?? 0 : this.rot, this.dir);
    const sw = Math.max(1, Math.round((q % 2 ? s.h : s.w) / ART * 0.6) - 2 * Math.min(3, Math.floor(liftArt / 2)));
    if (!this.off && this.clipBelow === undefined) {
      g.fillStyle = this.herd.shadow();
      g.fillRect(this.x - Math.floor(sw / 2) * ART, this.y + 1, sw * ART, (this.mount ? 2 : 1) * ART);
    }
    if (q) {
      this.turned(g, s, flipped, left, top, q);
      const hd = this.head ? w.sprites.get(this.head) : undefined;
      if (hd) this.turned(g, hd, flipped, left, top, q);
      return;
    }
    this.slices(g, s, flipped, left, top, sq, lean, leg);
    // a rider is never cut
    if (this.rider) this.ridden(g, s.w, flipped, left, top, sq, lean);
    const head = this.head ? w.sprites.get(this.head) : undefined;
    if (head) this.slices(g, head, flipped, left, top, sq, lean, leg);
    // the still picture's worry: a sweat drop that stays (in motion they run down now and then, as particles)
    if (still && this.herd.worried() && !this.isAsleep) { const p = this.sweatPoint(w); drawSweat(g, snap(p.x), snap(p.y)); }
  }

  /** Its pose in the still picture, never held, ridden or asleep: up at its place, the pose it holds there
   * (perched, Herd.settle, its height in `off`), else its nature's (Nature.still). Its lift, squash, legs, offsets
   * and quarter turns show; a sink or cut needs a line to be at, so not those. */
  stillPose (): Pose | undefined {
    return this.st === 'held' || this.rider || this.isAsleep ? undefined : this.perched?.pose ?? this.nature?.still;
  }

  /** How high its picture is drawn: in motion where it is now, in the still picture its resting height (none while
   * held, less of it the higher it perches, as in applyPose) plus its still pose's lift. */
  shownLift (still = this.herd.still()) {
    if (!still) return snap(this.lift) + snap(this.off);
    const p = this.stillPose(), k = this.perched ? p?.perch ?? 0 : 0;
    return (this.st === 'held' ? 0 : snap(this.base * (1 - k))) + (p?.lift ?? 0) * ART + snap(this.off);
  }

  /** beside its head, where a sweat drop starts */
  sweatPoint (w: World) { const p = this.headPoint(w); return { x: p.x + 5 * ART, y: p.y + 7 * ART }; }

  /** The rider moves with the top half of the body: down a row in a squash, up in a stretch, along in a lean. */
  private ridden (g: Ctx, W: number, flipped: boolean, left: number, top: number, sq: number, lean: number) {
    const ox = lean * ART, oy = sq > 0 ? ART : sq < 0 ? -ART : 0;
    for (const l of this.rider!) {
      const dy = top + l.y + oy;
      if (!flipped) { g.drawImage(l.image, left + l.x + ox, dy, l.w, l.h); continue; }
      g.save(); g.translate(left + (W - l.x) + ox, dy); g.scale(-1, 1);
      g.drawImage(l.image, 0, 0, l.w, l.h);
      g.restore();
    }
  }

  /** The picture as row slices: the top half shifted for a squash (middle row hidden), a stretch (middle row
   * repeated) or a lean; the bottom 3 art rows split under the anchor for the trot. Nothing is scaled. Below the
   * cut line (clipBelow) each slice is cut short, so the wallpaper's Java can do the same without a clip. */
  private slices (g: Ctx, s: Sprite, flipped: boolean, left: number, top: number, sq: number, lean: number, leg: number) {
    const W = s.w, H = s.h, A = ART;
    const m = Math.max(A, Math.floor(H / 2 / A) * A);
    const legs = leg ? Math.min(3 * A, H - m - A) : 0;
    const ly = H - legs;
    // horizontal offsets are screen pixels; inside a mirrored picture they run the other way
    const sx0 = s.sx ?? 0, sy0 = s.sy ?? 0;
    const cut = this.clipBelow;
    const put = (x: number, y: number, w: number, h: number, ox: number, oy: number) => {
      if (cut !== undefined) h = Math.min(h, cut - (top + y + oy));
      if (w <= 0 || h <= 0) return;
      const dx = flipped ? left + (W - x - w) + ox : left + x + ox;
      if (!flipped) { g.drawImage(s.image, sx0 + x, sy0 + y, w, h, dx, top + y + oy, w, h); return; }
      g.save(); g.translate(dx + w, top + y + oy); g.scale(-1, 1);
      g.drawImage(s.image, sx0 + x, sy0 + y, w, h, 0, 0, w, h);
      g.restore();
    };
    const leanX = lean * A;
    if (sq > 0) { put(0, 0, W, m, leanX, A); put(0, m + A, W, ly - m - A, 0, 0); }
    else if (sq < 0) { put(0, 0, W, m + A, leanX, -A); put(0, m, W, ly - m, 0, 0); }
    else { put(0, 0, W, m, leanX, 0); put(0, m, W, ly - m, 0, 0); }
    if (legs) {
      // split under the anchor (the middle of the legs); each half steps 1 art pixel outward
      const mid = s.anchor.x + 1;
      const back = flipped ? 1 : -1; // picture-left half moves screen-left when not mirrored
      put(0, ly, mid, legs, back * A, 0);
      put(mid, ly, W - mid, legs, -back * A, 0);
    }
  }

  /** The whole picture turned q quarters clockwise, cut short at the cut line. */
  private turned (g: Ctx, s: Sprite, flipped: boolean, left: number, top: number, q: number) {
    const p = turnedPart(s.w, s.h, flipped, q, turnedBox(s.w, s.h, left, top, q), this.clipBelow);
    if (p) drawTurned(g, s.image, (s.sx ?? 0) + p.x, (s.sy ?? 0) + p.y, p.w, p.h, p.dx, p.dy, flipped, q);
  }

  /** Painted pixel of the body or the head at world pixel (x, y), where it's drawn now. */
  hit (x: number, y: number, w: World) {
    const f = this.frame(w);
    if (!f) return false;
    const { s, flipped } = f;
    const still = this.herd.still(), sp = still ? this.stillPose() : undefined;
    const lift = this.shownLift(still);
    const left = f.left, top = this.y - s.anchor.y - lift;
    if (this.clipBelow !== undefined && y >= this.clipBelow) return false;
    const q = this.rider ? 0 : screenTurns(still ? sp?.rot ?? 0 : this.rot, this.dir);
    let px: number, py: number;
    if (q) {
      const at = turnedPixel(s.w, s.h, flipped, q, turnedBox(s.w, s.h, left, top, q), x, y);
      if (!at) return false;
      ({ px, py } = at);
    } else {
      if (x < left || y < top || x >= left + s.w || y >= top + s.h) return false;
      px = flipped ? s.w - 1 - (x - left) : x - left; py = y - top;
    }
    const head = this.head ? w.sprites.get(this.head) : undefined;
    const on = (sp: Sprite | undefined) => !!sp && (!sp.mask || !!sp.mask[py * sp.w + px]);
    return on(s) || (!!head && head.w === s.w && head.h === s.h && on(head));
  }

  /** above its head, where hearts and sparkles start */
  headPoint (w: World) {
    const s = this.pic(w);
    // over a rider, over the rider's head
    const h = (s ? s.h : 60) - Math.min(0, ...(this.rider ?? []).map(l => l.y));
    // in the still picture where it's drawn (a perch, a still pose)
    const up = this.herd.still() ? this.shownLift(true) : snap(this.lift) + snap(this.off);
    return { x: this.x - 2 * ART, y: this.y - h - up - 7 * ART };
  }
}

/* ---------------------------------------------------------------- the avatar on foot */

/**
 * The player's avatar standing on foot beside the stable's door: Habitica's avatar pictures, whole and unscaled,
 * each placed from the point under its feet (RiderLayer's x, y from there). It doesn't wander; it hops when a
 * creature greets it or it's tapped. Its images come from Habitica's image server, so its pixels can't be read:
 * a tap hits the box its body fills.
 */
export class Avatar implements Entity {
  readonly id = 'avatar';
  readonly sprite = '';
  x = 0; y = 0;
  lift = 0;
  /** ticks into a hop; -1 = standing */
  hop = -1;

  constructor (public layers: readonly RiderLayer[], private herd: Herd) {}

  draw (g: Ctx) {
    const lift = this.herd.still() ? 0 : snap(this.lift);
    g.fillStyle = this.herd.shadow();
    g.fillRect(this.x - 4 * ART, this.y + 1, 8 * ART, ART);
    for (const l of this.layers) g.drawImage(l.image, this.x + l.x, this.y + l.y - lift, l.w, l.h);
  }

  /** the box Habitica's avatar body fills (head gear and the weapon reach a little past it) */
  hit (x: number, y: number) {
    const top = this.y - (this.herd.still() ? 0 : snap(this.lift));
    return x >= this.x - AV_HALF - 2 * ART && x < this.x + AV_HALF + 2 * ART && y >= top - 22 * ART && y <= top + ART;
  }
}

/* ---------------------------------------------------------------- the herd */

export interface HerdOptions {
  seed: number | string;
  /** the band creatures walk, world pixels; default: the lower 40% of the world above the bottom bar */
  ground?: (w: World) => { top: number, bottom: number };
  /** the scene's dark ground colour, for shadows */
  shadow?: () => string;
  /** the stable's door: at dusk pets amble toward it and sleep near it */
  home?: (w: World) => { x: number, y: number } | null;
  /** the player is low on HP: the creatures gather by the stable's door with a sweat drop (spec §08) */
  worried?: () => boolean;
  /** phone clock (time of day for dusk and sleep) */
  clock?: () => Date;
  /** the still picture is showing (reduced motion): wire to the stage's */
  still?: () => boolean;
  /** a light haptic tick when a creature is petted (the app checks its haptics setting) */
  haptic?: () => void;
  /** the player rests in Habitica's Inn: the herd sleeps by the door, day or night */
  resting?: () => boolean;
  /** a creature was dropped somewhere new: store it (x, y as in Resident.spot) */
  onMoved?: (id: string, spot: { x: number, y: number }) => void;
  /** the ball (on unless false); its picture comes from the scene */
  ball?: false | Pick<BallOptions, 'draw'>;
  /** the scene's places, world pixels (scenes SceneLayer.spots): where natures' favourite places and acts are */
  spots?: (w: World) => readonly Spot[];
  /** winter, and tonight's moon (scenes/clock.ts), for natures' conditions; default summer, a crescent */
  sky?: () => { winter: boolean, moon: number };
  /** the scene's weather now (scenes/weather.ts kind): snow huddles them together, fireflies hold their eyes */
  weather?: () => string | null;
  /** the middle of the boss in the sky, world pixels across, or null when there is none: the bold face it */
  boss?: (w: World) => number | null;
  /** the app's touch extras (not on the wallpaper): passing the ball, "my turn", joining a crit's spin */
  extras?: boolean;
}

export { DUSK, BEDTIME, MORNING };

/** Keep this far apart, world pixels (6 art pixels). */
const APART = 6 * ART;
/** Walks are 10 to 50 art pixels. */
const WALK_MIN = 10 * ART, WALK_MAX = 50 * ART;
/** A flicked ball is chased by the nearest awake pets within 70 art pixels, 3 at most at once. */
const CHASE_RANGE = 70 * ART, CHASERS = 3;
/** Where the small hearts of a greeting rise, art pixels from the point between the two heads, in the order shown. */
const TINY_AT: [number, number][] = [[-3, 0], [2, -1], [-1, -3]];
/** Two bonded creatures greet at most twice a minute. */
const GREET_EVERY = 900;
/** Tag: a playmate within 50 art pixels, a dodge of 24, a round over after 10 s without a tag. A cat pounces on
 * yarn within 90, which rolls 8 away. */
const TAG_RANGE = 50 * ART, TAG_FLEE = 24 * ART, TAG_ROUND = 300, POUNCE_RANGE = 90 * ART, POUNCE_ROLL = 8 * ART;

/**
 * Two bonded creatures together for a moment (thread "Pets together"): they face each other and hop in turn,
 * with a little group of small hearts between them (family and friends) or a sparkle; now and then family and
 * friends lean into each other afterwards. Any touch on either ends it.
 */
interface Moment { a: Creature, b: Creature, t: number, close: boolean, back: boolean, nuzzle: boolean, family: boolean }

/** A game of tag (thread "Pets together"): `it` chases `run`, who dodges away and waits; a touch is a tag, a
 * hop and a sparkle, and after a breath they swap. Three or four tags, then back to grazing. */
interface Game { it: Creature, run: Creature, left: number, t: number, pause: number, pounce: boolean }

export class Herd {
  readonly rng: Rng;
  readonly creatures: Creature[] = [];
  readonly ball: Ball | null;
  /** the player's avatar on foot (Herd.stand), or null */
  avatar: Avatar | null = null;
  readonly particles: Particle[] = [];
  /** the ground band now, world pixels */
  band = { top: 0, bottom: 1 };
  private stage: Stage | null = null;
  /** after the ball: the first to reach it bumps it back */
  private chasers: Creature[] = [];
  /** who bumped it last: sits this flick out while anyone else can play */
  private bumper: Creature | null = null;
  /** the friend the last bump was passed to (the app's extras): it alone chases the ball next */
  private passTo: Creature | null = null;
  /** the ball for ball play by species, the games going on, and where the ball was last flicked from */
  private readonly roll: Roller | null;
  readonly plays: BallPlay;
  private thrown: { x: number, y: number } | null = null;
  /** greetings and nuzzles going on now, and when each pair last met (world tick) */
  readonly moments: Moment[] = [];
  private met = new Map<string, number>();
  /** the game of tag going on, if any (one at a time) */
  game: Game | null = null;
  /** the player's current pet, when it lives here: it walks beside the mount the player rides */
  private yours: string | null = null;
  private placed = false;
  /** saved spots of residents added before the world had a size */
  private pending = new Map<string, Resident['spot']>();
  private size = { w: 0, h: 0 };
  /** finger state between gesture events */
  private touch: { mode: 'stroke' | 'ball' | 'carry' | null, who: Creature | null, last: { x: number, y: number }, trail: { x: number, y: number, t: number }[] } = { mode: null, who: null, last: { x: 0, y: 0 }, trail: [] };

  constructor (readonly world: World, private o: HerdOptions) {
    this.rng = world.rng.fork(`herd:${o.seed}`);
    this.ball = o.ball === false ? null : new Ball({ draw: o.ball?.draw, shadow: () => this.shadow(), ground: () => this.band });
    if (this.ball) world.add(this.ball);
    world.addLayer(this.glows);
    this.roll = this.ball ? this.roller(this.ball) : null;
    this.plays = new BallPlay(this, world);
    world.addLayer(this.layer);
  }

  /** The ball as species' ball play (ballplay.ts) sees it. */
  private roller (b: Ball): Roller {
    const herd = this;
    return {
      get x () { return b.fx; }, get y () { return b.fy; }, get z () { return b.z; }, get moving () { return b.moving; },
      size: BALL_SIZE, tag: 'ball',
      hold: at => { if (at) { b.held = true; b.vx = b.vy = b.vz = 0; b.place(at.x, at.y, at.z); } else b.held = false; },
      send: (vx, vy, vz) => { b.vx = vx; b.vy = vy; b.vz = vz; },
      bat: c => { b.bump(herd.world, herd.rng.next(), herd.rng.next()); herd.bumper = c; },
      gone: () => b.hidden || herd.touch.mode === 'ball',
      from: () => herd.thrown ?? { x: b.fx, y: b.fy },
    };
  }

  still () { return this.o.still?.() ?? this.stage?.still ?? false; }
  worried () { return this.o.worried?.() ?? false; }
  shadow () { return this.o.shadow?.() ?? '#4E6B34'; }
  weather () { return this.o.weather?.() ?? null; }
  private ground (w: World) {
    if (this.o.ground) return this.o.ground(w);
    const bottom = w.h - w.insets.bottom - 2 * ART;
    return { top: Math.min(bottom, Math.floor(w.h * 0.6)), bottom };
  }

  /** The stage this herd is on (for redraws in the still picture). mountStage with herd.interaction does it. */
  attach (stage: Stage) { this.stage = stage; }

  /* ---- residents */
  /** Who lives here now: adds the new, removes the gone, keeps the rest where they are. */
  set (residents: readonly Resident[]) {
    this.unperch();
    const keep = new Set(residents.map(r => r.id));
    for (const c of [...this.creatures]) if (!keep.has(c.id) && !c.visitor) this.removeCreature(c);
    for (const r of residents) {
      const c = this.byId(r.id);
      if (c) { c.sprite = r.sprite; c.head = r.head; c.nature = r.nature; c.know(r); continue; }
      const n = new Creature(r, this);
      this.creatures.push(n);
      this.world.add(n);
      if (this.size.w > 1) { this.placeOne(n, r.spot); this.pairUp(n); } else this.pending.set(n.id, r.spot);
    }
    if (this.size.w > 1) this.spread();
    this.redraw();
  }

  byId (id: string) { return this.creatures.find(c => c.id === id); }
  private removeCreature (c: Creature) {
    this.release(c);
    this.creatures.splice(this.creatures.indexOf(c), 1); this.world.remove(c);
    this.unchase(c);
    for (let i = this.particles.length - 1; i >= 0; i--) if (this.particles[i].owner === c.id) this.particles.splice(i, 1);
  }

  /** The sprite keys to load for these residents. */
  static keys (rs: readonly Resident[]) { return rs.flatMap(r => r.head ? [r.sprite, r.head] : [r.sprite]); }

  /** where a creature stands now, as Resident.spot */
  spotOf (c: Creature) {
    const w = this.world, b = this.band;
    return { x: clamp(c.fx / Math.max(1, w.w), 0, 1), y: clamp((c.fy - b.top) / Math.max(1, b.bottom - b.top), 0, 1) };
  }

  private placeOne (c: Creature, spot?: { x: number, y: number }) {
    const w = this.world, b = this.band, half = c.half(w);
    const sx = spot ? spot.x : this.rng.next(), sy = spot ? spot.y : this.rng.next();
    c.setPos(clamp(sx * w.w, half, w.w - half), b.top + clamp(sy, 0, 1) * (b.bottom - b.top));
    c.dir = c.facing(w) === 'left' ? -1 : 1;
    c.base = c.restHeight(w); c.lift = c.base;
    c.tx = c.fx; c.ty = c.fy;
  }

  /** A creature with no saved spot starts beside its closest friend placed before it (family, friend or kin),
   * facing it, so even the still picture shows who belongs together. */
  private pairUp (c: Creature) {
    if (!c.free) return;
    const w = this.world, i = this.creatures.indexOf(c);
    const b = c.bonds.find(x => SNUG.has(x.kind) && this.creatures.findIndex(o => o.id === x.id) < i && this.creatures.some(o => o.id === x.id));
    const p = b && this.byId(b.id);
    if (!p) return;
    const side = p.fx < w.w / 2 ? 1 : -1, half = c.half(w);
    c.setPos(clamp(p.fx + side * (p.half(w) + half + 3 * ART), half, w.w - half), p.fy);
    if (c.facing(w) !== 'front') c.dir = p.fx > c.fx ? 1 : p.fx < c.fx ? -1 : c.dir;
    c.tx = c.fx; c.ty = c.fy;
  }

  /** Nudge apart creatures standing on top of each other, so none overlap in the still picture either. */
  spread () {
    const w = this.world, b = this.band, cs = this.creatures.filter(c => !c.visitor);
    for (let pass = 0; pass < 12; pass++) {
      let moved = false;
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) {
        const a = cs[i], c = cs[j];
        const need = a.half(w) + c.half(w) - 4 * ART;
        const dx = c.fx - a.fx, dy = c.fy - a.fy;
        if (Math.abs(dx) >= need || Math.abs(dy) >= 8 * ART) continue;
        const push = (need - Math.abs(dx)) / 2 + 1, s = dx >= 0 ? 1 : -1;
        a.setPos(a.fx - s * push, a.fy); c.setPos(c.fx + s * push, c.fy);
        moved = true;
      }
      for (const c of cs) { const h = c.half(w); c.setPos(clamp(c.fx, h, w.w - h), clamp(c.fy, b.top, b.bottom)); c.tx = c.fx; c.ty = c.fy; }
      if (!moved) break;
    }
  }

  private readonly layer: Layer = {
    id: 'creatures', depth: 'front',
    resize: w => this.resized(w),
    update: w => this.tick(w),
    draw: g => { for (const p of this.particles) drawParticle(g, p); },
  };

  /** the lights some give off, on the ground under everyone (behaviours Glow) */
  private readonly glows: Layer = {
    id: 'glows', depth: 'back',
    draw: (g, w) => {
      const now = this.now(), still = this.still();
      for (const c of this.creatures) { const gl = glowing(c, now); if (gl) drawGlow(g, c, gl, w.tick, still); }
    },
  };

  private resized (w: World) {
    this.unperch();
    const old = this.size, ob = this.band;
    this.band = this.ground(w);
    if (w.w <= 1) return;
    this.size = { w: w.w, h: w.h };
    if (this.avatar) this.placeAvatar(this.avatar);
    if (!this.placed) {
      this.placed = true;
      for (const c of this.creatures) this.placeOne(c, this.pending.get(c.id));
      for (const c of this.creatures) this.pairUp(c);
      this.pending.clear();
      if (this.ball) this.ball.place(w.w * 0.55, this.band.top + (this.band.bottom - this.band.top) * 0.5);
      this.spread();
      this.settle();
      return;
    }
    // keep everyone at the same place relative to the meadow
    const rx = (x: number) => x / Math.max(1, old.w) * w.w;
    const ry = (y: number) => this.band.top + (y - ob.top) / Math.max(1, ob.bottom - ob.top) * (this.band.bottom - this.band.top);
    for (const c of this.creatures) { const h = c.half(w); c.setPos(clamp(rx(c.fx), h, w.w - h), clamp(ry(c.fy), this.band.top, this.band.bottom)); c.tx = c.fx; c.ty = c.fy; if (c.st === 'move' || c.st === 'chase') c.idle(30); }
    if (this.ball) this.ball.place(clamp(rx(this.ball.fx), 0, w.w), clamp(ry(this.ball.fy), this.band.top, this.band.bottom));
    this.settle();
  }

  /* ---- the still picture's perches */
  /** Everyone up at a place back down where they stood. */
  private unperch () {
    for (const c of this.creatures) {
      const p = c.perched;
      if (!p) continue;
      c.perched = null; c.off = 0;
      c.setPos(p.fx, p.fy); c.tx = c.fx; c.ty = c.fy;
    }
  }

  /**
   * The still picture (reduced motion, the widget) shows a creature whose act goes up (P4) up there whenever that
   * act may happen now, in the pose it holds longest at the top (topPose): the Owl at night and the Falcon by day
   * on a crown or the ridge, climbers in a crown, the Sloth hanging, a butterfly on the flowers, the Pterodactyl
   * high in the sky (beside anyone up there rather than over them). Each goes to the free place nearest where it
   * stands, one to a place, in the herd's order; none is free, it stays on the ground. Nothing random, so the same meadow always makes the same picture. Asleep,
   * ridden, carried, busy, or put down by a finger: on the ground. In motion everyone is back where they stood.
   * The wallpaper's Java does the same (StableHerd.settle); its tests call this one to compare.
   */
  settle () {
    this.unperch();
    if (!this.still()) { for (const c of this.creatures) c.grounded = false; return; }
    if (!this.placed) return;
    const w = this.world, now = this.now(), taken = new Set<string>(), soarers: [Creature, Pose][] = [];
    for (const c of this.creatures) {
      if (!c.nature || (c.st !== 'idle' && c.st !== 'move' && c.st !== 'turn') || c.act || c.busy || c.rider || c.isAsleep || c.grounded || c.leaving) continue;
      let at: Spot | null = null, pose: Pose | null = null, soar: Pose | null = null;
      for (const a of c.nature.acts) {
        if (!holds(a.when, now)) continue;
        const p = topPose(a);
        if (!p) continue;
        if (!a.at) { if (p.soar) soar ??= p; continue; }
        for (const s of places(this, c, a.at)) {
          if (taken.has(spotKey(s)) || (at && Math.abs(s.x - c.fx) >= Math.abs(at.x - c.fx))) continue;
          at = s; pose = p;
        }
      }
      if (at && pose) {
        taken.add(spotKey(at));
        const half = c.half(w);
        c.perched = { fx: c.fx, fy: c.fy, pose };
        // where it would walk to for it (on the walking ground under a horizon tree or the roof), as high up as there
        c.setPos(clamp(at.x, half, w.w - half), clamp(at.y, this.band.top, this.band.bottom)); c.tx = c.fx; c.ty = c.fy;
        c.off = (pose.perch ?? 0) * Math.max(0, c.y - (at.y - at.h));
      } else if (soar) soarers.push([c, soar]);
    }
    // high in the sky where it stands, or beside whoever is up a tree or another flyer there, not on their heads
    const up: Creature[] = this.creatures.filter(c => c.perched);
    for (const [c, pose] of soarers) {
      const half = c.half(w), clear = (x: number) => up.every(o => Math.abs(o.x - x) >= o.half(w) + half);
      let x = c.fx;
      if (!clear(x)) {
        const xs = up.flatMap(o => [o.x - o.half(w) - half - ART, o.x + o.half(w) + half + ART]).filter(v => v >= half && v <= w.w - half && clear(v));
        for (const v of xs) if (x === c.fx || Math.abs(v - c.fx) < Math.abs(x - c.fx)) x = v;
      }
      c.perched = { fx: c.fx, fy: c.fy, pose };
      c.setPos(x, c.fy); c.tx = c.fx; c.ty = c.fy;
      c.off = (pose.soar ?? 0) * (c.y - this.band.top / 2);
      up.push(c);
    }
  }

  /* ---- clock */
  private hour () { const d = (this.o.clock ?? (() => new Date()))(); return d.getHours() + d.getMinutes() / 60; }
  /** bedtime until morning, or resting in the Inn */
  night () { const h = this.hour(); return !!this.o.resting?.() || h >= BEDTIME || h < MORNING; }
  dusk () { const h = this.hour(); return h >= DUSK && h < BEDTIME; }

  /** the moment, as natures see it */
  now (): Now {
    const k = this.o.sky?.(), winter = k?.winter ?? false;
    return { hour: this.hour(), winter, moon: k?.moon ?? 1, water: this.spots('water').some(s => s.strip || !winter) };
  }

  /** The scene's places of a kind (the door is the stable's). */
  spots (kind: SpotKind): readonly Spot[] {
    if (kind === 'door') { const d = this.o.home?.(this.world); return d ? [{ kind, x: d.x, y: d.y, w: 40 * ART, h: 0 }] : []; }
    return (this.o.spots?.(this.world) ?? []).filter(s => s.kind === kind);
  }

  /** where creatures meet their own kind: the pond a Daily streak grows, or the newest flower patch (the last) */
  meetAt (kind: 'pond' | 'flowers'): Spot | null {
    let out: Spot | null = null;
    for (const s of this.o.spots?.(this.world) ?? []) if (kind === 'pond' ? s.pond : s.kind === 'flowers') { out = s; if (kind === 'pond') break; }
    return out;
  }

  /** creatures doing an act, or walking to one (the pacing guard counts them) */
  acting () { return this.creatures.filter(c => c.st === 'act' || c.plan).length; }

  /** A pose's particle, from where it stands. */
  emitFrom (c: Creature, e: Emit) {
    const p = emitPoint(c, e, this.world);
    this.emit({ kind: e.kind, x: p.x, y: p.y, t: 0, life: e.life, vx: p.side });
  }

  /** A crow: sleepers within r art pixels wake for a while. */
  wakeNear (c: Creature, r: number) {
    for (const o of this.creatures) {
      if (o !== c && o.asleep && Math.abs(o.fx - c.fx) <= r * ART && Math.abs(o.fy - c.fy) <= r * ART) o.wake = Math.max(o.wake, WOKEN);
    }
  }

  /** A howl: idle creatures within r art pixels turn to face it. */
  lookAt (c: Creature, r: number) {
    const w = this.world;
    for (const o of this.creatures) {
      if (o === c || o.st !== 'idle' || o.isAsleep || o.busy || o.lean || o.facing(w) === 'front') continue;
      const dx = c.fx - o.fx;
      if (Math.abs(dx) <= r * ART && Math.abs(c.fy - o.fy) <= r * ART && Math.abs(dx) > ART) o.face(dx > 0 ? 1 : -1);
    }
  }

  /* ---- one tick for the herd: sleep, the ball and its chaser, particles */
  private tick (w: World) {
    this.band = this.ground(w);
    const a = this.avatar;
    if (a) {
      this.placeAvatar(a);
      if (a.hop >= 0) { a.hop++; a.lift = (HAPPY_ARC[a.hop] ?? 0) * ART; if (a.hop > 10) { a.hop = -1; a.lift = 0; } }
    }
    const now = this.now(), worried = this.worried();
    for (const c of this.creatures) {
      // a ridden mount never falls asleep
      // resting in the Inn: everyone sleeps, whatever their hours
      const sleeper = (!!this.o.resting?.() || sleepy(scheduleOf(c, !!c.pic(w)?.nocturnal), now, w.tick, c.breathAt * 37)) && !c.rider;
      if (sleeper && !c.asleep && c.st === 'idle') { c.asleep = true; c.leg = 0; }
      if (!sleeper && c.asleep) c.asleep = false;
      if (c.isAsleep && c.st === 'idle' && (w.tick + c.breathAt * 7) % 48 === 0) {
        const p = c.headPoint(w);
        this.emit({ kind: 'zed', x: p.x + 6 * ART, y: p.y + 4 * ART, t: 0, life: 40 });
      }
      const gl = glowing(c, now), gx = gl && glowFx(c, gl, w.tick);
      if (gx) this.emitFrom(c, gx);
      if (worried && !c.isAsleep && c.st === 'idle' && (w.tick + c.breathAt * 5) % 75 === 0) {
        const p = c.sweatPoint(w);
        this.emit({ kind: 'sweat', x: p.x, y: p.y, t: 0, life: 30 });
      }
    }
    // the still picture's perches for who is awake now; in motion, back down
    this.settle();
    // a visitor on its way out is gone past the edge; one stopped on the way (petted, carried) sets off again
    for (const c of [...this.creatures]) {
      if (!c.leaving) continue;
      const half = c.half(w);
      if (c.fx <= -half || c.fx >= w.w + half) this.removeCreature(c);
      else if (c.st === 'idle') this.exit(c);
    }
    const b = this.ball;
    if (b && !b.held && !b.hidden) this.chaseBall(w, b);
    this.plays.tick(this.roll ? [this.roll] : []);
    for (const p of this.particles) stepParticle(p);
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      if (p.t < p.life) continue;
      this.particles.splice(i, 1);
      if (p.owner) { const o = this.byId(p.owner); if (o) o.hearts = Math.max(0, o.hearts - 1); }
    }
    for (const m of [...this.moments]) this.moment(m, w);
    this.play(w);
    this.fireflies(w);
    this.faceBoss(w);
  }

  /** awake on its own feet, and not a mount or a flyer: it can run after the ball */
  private canChase (c: Creature, w: World) {
    return !c.isAsleep && !c.mount && c.motion(w) !== 'hover' && c.st !== 'held' && c.st !== 'fall' && c.st !== 'land';
  }

  /** whom a pet passes the ball to: its strongest bond that can chase it, within reach */
  private passee (c: Creature, w: World) {
    for (const b of c.bonds) {
      const o = this.byId(b.id);
      if (o && o !== c && this.canChase(o, w) && !o.busy && Math.hypot(o.fx - c.fx, o.fy - c.fy) < CHASE_RANGE) return o;
    }
    return null;
  }

  /** A boss in the sky: the bold ones standing about keep turning to face it as it crosses. */
  private faceBoss (w: World) {
    if (w.tick % 15 !== 0 || !this.o.boss) return;
    const x = this.o.boss(w);
    if (x === null) return;
    for (const c of this.creatures) {
      if (!c.bold || c.st !== 'idle' || c.isAsleep || c.busy || c.lean || c.facing(w) === 'front' || Math.abs(x - c.fx) < ART) continue;
      c.face(x > c.fx ? 1 : -1);
    }
  }

  /* ---- together */

  /** Its breathing phase asleep: the lowest of its own and any family, friend or kin asleep against it, so a
   * pair lying side by side breathes in step. */
  breathOf (c: Creature) {
    const w = this.world;
    let ph = c.breathAt;
    for (const b of c.bonds) {
      if (!SNUG.has(b.kind)) continue;
      const o = this.byId(b.id);
      if (o && o.isAsleep && Math.abs(o.fx - c.fx) <= o.half(w) + c.half(w) + 12 * ART && Math.abs(o.fy - c.fy) <= 10 * ART) ph = Math.min(ph, o.breathAt);
    }
    return ph;
  }

  /** Arrived where it was walking: if that was beside a friend, it turns to face it, and they may greet; anywhere
   * else (not there to do an act) it may sniff hello to whoever stands next to it. */
  arrived (c: Creature, planned = false) {
    const m = c.mate, w = this.world;
    c.mate = null;
    // circling: on to the next quarter soon; guarding: facing outward
    if (c.orbit && c.lap % 5) c.wait = c.rng.int(6, 16);
    const g = !m && c.guard ? this.byId(c.guard) : undefined;
    if (g && c.facing(w) !== 'front') c.dir = g.fx > c.fx ? -1 : 1;
    // the bold face the boss in the sky
    const boss = !m && c.bold && this.o.boss ? this.o.boss(w) : null;
    if (boss !== null && c.facing(w) !== 'front' && Math.abs(boss - c.fx) >= ART) c.dir = boss > c.fx ? 1 : -1;
    if (!m) { if (!planned) this.hello(c); return; }
    if (!this.creatures.includes(m)) return;
    if (c.facing(w) !== 'front') c.dir = m.fx > c.fx ? 1 : m.fx < c.fx ? -1 : c.dir;
    if (this.still() || c.busy || m.busy || c.isAsleep || m.isAsleep || m.st !== 'idle' || c.lean || m.lean) return;
    if (Math.abs(m.fx - c.fx) > m.half(w) + c.half(w) + 20 * ART || Math.abs(m.fy - c.fy) > 12 * ART) return;
    const key = c.id < m.id ? `${c.id}|${m.id}` : `${m.id}|${c.id}`, last = this.met.get(key);
    if (last !== undefined && w.tick - last < GREET_EVERY) return;
    const kind = c.bonds.find(b => b.id === m.id)?.kind;
    if (!kind) return;
    this.met.set(key, w.tick);
    const close = kind === 'family' || kind === 'friend';
    const back = m.temper !== 'aloof' || this.rng.chance(0.5);
    const nuzzle = close && this.rng.chance(0.25);
    if (m.facing(w) !== 'front') m.face(c.fx > m.fx ? 1 : c.fx < m.fx ? -1 : m.dir);
    m.fill = Math.min(1, m.fill + FILL);
    c.busy = m.busy = 'moment';
    this.moments.push({ a: c, b: m, t: 0, close, back, nuzzle, family: kind === 'family' });
  }

  /** One tick of a moment: a hop each, small hearts or a sparkle between them, perhaps a lean together. */
  private moment (m: Moment, w: World) {
    const { a, b } = m;
    m.t++;
    const away = (c: Creature) => !this.creatures.includes(c) || c.isAsleep || (c.st !== 'idle' && c.st !== 'happy');
    if (away(a) || away(b)) { this.endMoment(m); return; }
    for (const c of [a, b]) if (c.st === 'idle') c.wait = Math.max(c.wait, 2);
    const hop = (c: Creature) => { c.st = 'happy'; c.t = 0; c.tx = c.fx; c.ty = c.fy; c.leg = 0; };
    if (m.t === 6) hop(a);
    if (m.t === 10 && m.back) hop(b);
    const pa = a.headPoint(w), pb = b.headPoint(w), mx = (pa.x + pb.x) / 2, my = Math.min(pa.y, pb.y) + 2 * ART;
    if (m.close) {
      const at = [8, 13, 18].indexOf(m.t);
      if (at >= 0) { const [dx, dy] = TINY_AT[at]; this.emit({ kind: 'tiny', x: mx + dx * ART, y: my + dy * ART, t: 0, life: 30 }); }
    } else if (m.t === 8) this.emit({ kind: 'spark', x: mx, y: my, t: 0, life: 30, col: '#FFFFFF' });
    if (m.nuzzle && m.t === 26 && a.st === 'idle' && b.st === 'idle') {
      a.lean = b.x >= a.x ? 1 : -1;
      if (m.family) b.lean = -a.lean;
    }
    if (m.t >= (m.nuzzle ? 56 : 26)) this.endMoment(m);
  }

  private endMoment (m: Moment) {
    this.moments.splice(this.moments.indexOf(m), 1);
    for (const c of [m.a, m.b]) {
      c.busy = undefined;
      if (m.nuzzle) c.lean = 0;
      if (c.st === 'idle') c.wait = c.rng.int(45, 120);
    }
  }

  /** Arrived on a walk of its own next to anyone standing about (not a sleeper, not busy): now and then, as often as
   * it seeks company, they turn to each other and sniff hello. Not on the way to an act or the avatar. */
  private hello (c: Creature) {
    if (this.still() || c.greet || c.busy || !c.temper) return;
    const w = this.world;
    let o: Creature | null = null, bd = Infinity;
    for (const x of this.creatures) {
      if (x === c || x.st !== 'idle' || x.isAsleep || x.busy || x.lean || x.leaving) continue;
      if (Math.abs(x.fx - c.fx) > x.half(w) + c.half(w) + 12 * ART || Math.abs(x.fy - c.fy) > 8 * ART) continue;
      const d = Math.hypot(x.fx - c.fx, x.fy - c.fy);
      if (d < bd) { bd = d; o = x; }
    }
    if (!o || !this.rng.chance(TEMPERS[c.temper].seek)) return;
    for (const [a, b] of [[c, o], [o, c]]) {
      a.face(a.facing(w) !== 'front' && Math.abs(b.fx - a.fx) >= ART ? (b.fx > a.fx ? 1 : -1) : a.dir);
      a.startFidget(SNIFF, 20);
    }
  }

  /** Touched (or gone): out of any moment, and no longer about to follow or copy anyone. */
  release (c: Creature) {
    c.follow = null; c.copy = 0;
    if (this.inGame(c)) this.endGame();
    for (const m of [...this.moments]) if (m.a === c || m.b === c) {
      this.moments.splice(this.moments.indexOf(m), 1);
      for (const o of [m.a, m.b]) { o.busy = undefined; if (m.nuzzle && o !== c) o.lean = 0; }
      if (m.nuzzle) c.lean = 0;
    }
  }

  /** A grown-up sets off: its little ones here (the pet of the same key) follow a moment later, most times. */
  private leadLittleOnes (c: Creature) {
    for (const p of this.creatures) {
      if (p === c || p.mount || p.st !== 'idle' || p.isAsleep || p.busy || p.follow) continue;
      if (!c.bonds.some(b => b.id === p.id && b.kind === 'family') || Math.abs(p.fx - c.fx) >= 90 * ART) continue;
      if (this.rng.chance(FOLLOW * (1 - p.fill))) p.follow = { of: c, in: this.rng.int(6, 12) };
    }
  }

  /** The player's current pet, when it lives here: it walks beside the mount the player rides (none: off). */
  mine (id: string | null) { this.yours = id; }

  /** The mount the player rides sets off (or is climbed on): the player's pet comes along, always (when it is on
   * a walk of its own, as soon as it gets there). */
  private leadYours (c: Creature) {
    const p = this.yours ? this.byId(this.yours) : undefined;
    if (!p || p === c || p.mount || (p.st !== 'idle' && p.st !== 'move' && p.st !== 'turn') || p.isAsleep || p.busy || p.follow) return;
    p.follow = { of: c, in: this.rng.int(6, 12) };
  }

  /** A little one walks to just behind where its grown-up is heading. */
  trail (p: Creature, lead: Creature) {
    if (!this.creatures.includes(lead) || p.busy || p.isAsleep) return;
    const w = this.world, half = p.half(w);
    const x = clamp(lead.tx - lead.dir * (lead.half(w) + half + 3 * ART), half, w.w - half), y = clamp(lead.ty, this.band.top, this.band.bottom);
    if (Math.hypot(x - p.fx, y - p.fy) < ART || !this.roomAt(p, x, y)) return;
    p.goTo(x, y);
    p.mate = lead;
    p.fill = Math.min(1, p.fill + FILL);
    if (!this.dusk() && !this.night() && !this.worried()) this.leadTrain(p);
  }

  /** At dusk, beside a family member, friend or kin already heading to (or lying) by the door. */
  private nightMate (c: Creature, home: { x: number, y: number }) {
    for (const b of c.bonds) {
      if (!SNUG.has(b.kind)) continue;
      const o = this.byId(b.id);
      if (o && Math.abs(o.tx - home.x) <= 30 * ART && Math.abs(o.ty - home.y) <= 14 * ART) return o;
    }
    return null;
  }

  /** side by side with another standing still, no more than `gap` art pixels between them (12: as sleepers breathe
   * in step, breathOf) */
  private lying (c: Creature, o: Creature, gap = 12) {
    const w = this.world;
    return Math.abs(o.fx - c.fx) <= o.half(w) + c.half(w) + gap * ART && Math.abs(o.fy - c.fy) <= 10 * ART && Math.hypot(o.tx - o.fx, o.ty - o.fy) < ART;
  }

  /** up against someone by the door in the snow */
  private huddled (c: Creature, home: { x: number, y: number }) {
    return this.creatures.some(o => o !== c && Math.abs(o.tx - home.x) <= 30 * ART && Math.abs(o.ty - home.y) <= 14 * ART && this.lying(c, o, 8));
  }

  /** A night creature's watch: the nearest sleeper it isn't already sitting beside. */
  private sleeperNear (c: Creature) {
    const w = this.world;
    let best: Creature | null = null, bd = Infinity;
    for (const o of this.creatures) {
      if (o === c || !o.isAsleep) continue;
      const d = Math.hypot(o.fx - c.fx, o.fy - c.fy);
      if (d < bd) { bd = d; best = o; }
    }
    if (best && Math.abs(best.fx - c.fx) <= best.half(w) + c.half(w) + 10 * ART && Math.abs(best.fy - c.fy) <= 8 * ART) return null;
    return best;
  }

  /** In the snow, the creature nearest to it already heading to (or lying) by the door, to huddle against. */
  private huddle (c: Creature, home: { x: number, y: number }) {
    let best: Creature | null = null, bd = Infinity;
    for (const o of this.creatures) {
      if (o === c || Math.abs(o.tx - home.x) > 30 * ART || Math.abs(o.ty - home.y) > 14 * ART) continue;
      const d = Math.hypot(o.tx - c.fx, o.ty - c.fy);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** The Dragon the others sleep round on snowy nights (Pets together, with its flame): the first not ridden. */
  private hearth () { return this.creatures.find(o => !o.rider && !!o.nature?.traits.includes('flame')) ?? null; }

  /** Its place in the ring round the Dragon: everyone who settles there evenly round it, in the herd's order. */
  private ringSpot (c: Creature, d: Creature) {
    const w = this.world, ring = this.creatures.filter(o => o !== d && o.temper && !o.cold);
    const a = 2 * Math.PI * ring.indexOf(c) / ring.length, r = d.half(w) + c.half(w) + 2 * ART;
    return { x: d.tx + Math.cos(a) * r, y: d.ty + Math.sin(a) * 12 * ART };
  }

  /** The line home at dusk: the largest mount leads (no mount: whoever has most bonds), the rest behind in turn;
   * the one it walks behind, or null for the leader. */
  private ahead (c: Creature) {
    const w = this.world, line = this.creatures.filter(o => o.temper);
    let lead: Creature | null = null, size = -2;
    for (const o of line) {
      const s = o.mount ? (o.pic(w)?.w ?? 0) * (o.pic(w)?.h ?? 0) : -1;
      if (s > size) { size = s; lead = o; }
    }
    if (lead && !lead.mount) for (const o of line) if (o.bonds.length > lead.bonds.length) lead = o;
    if (!lead || lead === c) return null;
    const order = [lead, ...line.filter(o => o !== lead)];
    return order[order.indexOf(c) - 1] ?? null;
  }

  /** Beside another, `gap` art pixels from its edge on this side, where it stands or is heading. */
  private beside (c: Creature, o: Creature, side: number, gap: number) {
    const w = this.world;
    return { x: o.tx + side * (o.half(w) + c.half(w) + gap * ART), y: o.ty };
  }

  /** The ball: the nearest awake pets go after it, and the first to reach it bumps it back and sits the rest of
   * this flick out, so the next bump is someone else's while anyone else can play. Up to 3 bumps a flick. */
  private chaseBall (w: World, b: Ball) {
    if (!b.bumps) this.bumper = null;
    if (!b.moving) this.passTo = null;
    this.chasers = this.chasers.filter(c => c.st === 'chase' && !c.busy);
    // passed to a friend: it alone goes after the ball
    const to = this.passTo && this.creatures.includes(this.passTo) ? this.passTo : null;
    if (b.bumps < 3 && b.moving && this.chasers.length < (to ? 1 : CHASERS)) {
      const free = (c: Creature) => !this.chasers.includes(c) && !c.isAsleep && !c.mount && !c.busy && c.motion(w) !== 'hover' &&
        c.st !== 'held' && c.st !== 'fall' && c.st !== 'land' && c.st !== 'happy' && Math.hypot(c.fx - b.fx, c.fy - b.fy) < CHASE_RANGE;
      const near = to ? [to].filter(free) : this.creatures.filter(c => c !== this.bumper && free(c));
      // alone with the ball: the one who just bumped it goes again once its hop is over
      if (!to && !near.length && !this.chasers.length && this.bumper && free(this.bumper)) near.push(this.bumper);
      near.sort((p, q) => Math.hypot(p.fx - b.fx, p.fy - b.fy) - Math.hypot(q.fx - b.fx, q.fy - b.fy));
      for (const c of near.slice(0, CHASERS - this.chasers.length)) {
        if (this.inGame(c)) this.endGame();
        this.chasers.push(c); c.goTo(b.fx, b.fy, true);
      }
    }
    for (const c of b.bumps < 3 ? [...this.chasers] : []) {
      // its species' way (ballplay.ts): a cat springs from a little way off; a dog carries it, a beetle pushes it
      // (the others stop where they are)
      if (this.plays.near(c, this.roll!)) { this.unchase(c); continue; }
      if (Math.hypot(c.fx - b.fx, c.fy - b.fy) < 6 * ART && b.z < 4 * ART) {
        if (this.plays.reach(c, this.roll!)) { this.unchase(c); for (const o of this.chasers) o.idle(o.rng.int(20, 40)); this.chasers = []; this.passTo = null; return; }
        // passed to a friend, who chases it next (a rally of up to 3), or knocked back into the meadow
        const f = this.o.extras && b.bumps < 2 ? this.passee(c, w) : null;
        if (f) b.pass(f.fx, f.fy); else b.bump(w, this.rng.next(), this.rng.next());
        c.st = 'happy'; c.t = 0; this.bumper = c; this.unchase(c); this.passTo = f;
        if (f) { for (const o of this.chasers) o.idle(o.rng.int(20, 40)); this.chasers = []; }
        break;
      }
    }
    // the third bump ends the game: the others stop where they are
    if (b.bumps >= 3) { for (const c of this.chasers) c.idle(c.rng.int(20, 40)); this.chasers = []; return; }
    for (const c of this.chasers) { c.tx = clamp(b.fx - c.dir * 3 * ART, 0, w.w); c.ty = b.fy; }
  }

  private unchase (c: Creature) { const i = this.chasers.indexOf(c); if (i >= 0) this.chasers.splice(i, 1); }

  /** Where a creature walks next: 10 to 50 art pixels away, toward company now and then or (at dusk, or when the
   * player is low on HP) the stable, never on top of another; on its own, to the roomiest of a few places. */
  wander (c: Creature) {
    const w = this.world, b = this.band, half = c.half(w), n = c.nature, now = this.now();
    c.follow = null;
    // a pet rock: never on its own
    if (n?.pace.still) { c.wait = rested(c, now, c.rng.int(REST[0], REST[1])); return; }
    // company ebbs; in a crowd, none at all
    c.fill *= KEEP;
    const keen = this.crowded(c, c.fx, c.fy) ? 0 : 1 - c.fill;
    let social = false;
    let greet = false, goal: { x: number, y: number, above?: boolean } | null = null, mate: Creature | null = null, plan: Act | null = null, far = false;
    let pick: ReturnType<typeof choose> = null;
    const dusk = this.dusk(), night = this.night(), snow = this.weather() === 'snow';
    const home = !!this.o.resting?.() || homeward(scheduleOf(c, c.nocturnal(w)), now) || this.worried() ? this.o.home?.(w) ?? null : null;
    const av = this.avatar;
    const guard = home && c.guard ? this.byId(c.guard) ?? null : null;
    // a snowy evening with a Dragon here: it stays where it is, warm (by its egg, if it has one), and the rest settle
    // in a ring round it
    const hearth = home && snow ? this.hearth() : null;
    if (hearth === c && !guard) { c.wait = rested(c, now, c.rng.int(REST[0], REST[1])); return; }
    const watch = !guard && night && c.temper && c.nocturnal(w) ? this.sleeperNear(c) : null;
    const ring = !guard && !watch && hearth && hearth !== c && c.temper && !c.cold ? hearth : null;
    const snug = !guard && !watch && !ring && home && c.temper ? this.nightMate(c, home) : null;
    const huddle = !guard && !watch && !ring && !snug && home && snow && c.temper && !c.cold ? this.huddle(c, home) : null;
    const ahead = !guard && !watch && !ring && !snug && !huddle && home && dusk && !snow && c.temper ? this.ahead(c) : null;
    if (guard) {
      // a dragon sleeps right beside its egg
      goal = this.beside(c, guard, c.fx < guard.tx ? -1 : 1, 2);
      mate = guard;
    } else if (watch && this.rng.chance(0.6)) {
      goal = this.beside(c, watch, c.fx < watch.fx ? -1 : 1, 4);
      mate = watch;
    } else if (ring) {
      goal = this.ringSpot(c, ring);
      mate = ring;
    } else if (snug && this.lying(c, snug)) {
      // already lying beside it by the door: it stays
      c.wait = rested(c, now, c.rng.int(REST[0], REST[1])); return;
    } else if (snug && this.rng.chance(0.7)) {
      goal = this.beside(c, snug, this.rng.chance(0.5) ? 1 : -1, 3);
    } else if (huddle && this.huddled(c, home!)) {
      // already huddled up against someone: it stays
      c.wait = rested(c, now, c.rng.int(REST[0], REST[1])); return;
    } else if (huddle && this.rng.chance(0.8)) {
      goal = this.beside(c, huddle, c.fx < huddle.tx ? -1 : 1, 1);
    } else if (ahead && Math.abs(ahead.tx - home!.x) <= 60 * ART && Math.abs(ahead.ty - home!.y) <= 20 * ART && this.rng.chance(0.6)) {
      goal = this.beside(c, ahead, -ahead.dir, 3);
    } else if (home) goal = { x: home.x + (this.rng.next() - 0.5) * 40 * ART, y: home.y + this.rng.next() * 10 * ART };
    else if (av && !this.crowded(c, av.x, av.y) && this.rng.chance(GREET * keen)) {
      // over to say hello to your avatar (not when a crowd is there already)
      const side = this.rng.chance(0.5) ? 1 : -1;
      goal = { x: av.x + side * (half + AV_HALF + ART), y: av.y + (this.rng.next() - 0.5) * 6 * ART };
      greet = true; social = true;
    } else if (n && (pick = choose(this, c, now))) {
      // its nature: an act here and now, or a place to go (for an act there, or because it likes it)
      if (!pick.goal) { startAct(c, pick.act!); return; }
      goal = pick.goal; plan = pick.act; far = true;
    } else if (c.temper) {
      if (this.pounceOn(c) || this.tag(c)) return;
      const t = TEMPERS[c.temper], sig = this.signature(c, keen);
      if (sig) { goal = sig.goal; mate = sig.mate; social = true; }
      else if (snow && !c.cold && this.creatures.length > 1 && this.rng.chance(0.15 * keen)) {
        // a cold day: up against anyone at all for warmth
        const o = this.rng.pick(this.creatures.filter(o => o !== c));
        goal = this.beside(c, o, c.fx < o.tx ? -1 : 1, 1); social = true;
      } else if (this.rng.chance((c.mount ? t.seek / 2 : t.seek) * keen)) {
        // elders (Veterans) draw three times as strongly
        const mates = c.bonds.map(b => { const o = this.byId(b.id); return [o, PULL[b.kind] * (o?.elder ? 3 : 1)] as const; }).filter((m): m is readonly [Creature, number] => !!m[0]);
        if (mates.length) {
          let r = this.rng.next() * mates.reduce((n, m) => n + m[1], 0), f = mates[mates.length - 1][0];
          for (const [o, k] of mates) { if (r < k) { f = o; break; } r -= k; }
          const side = this.rng.chance(0.5) ? 1 : -1;
          // not into a crowd round it
          if (!this.crowded(c, f.fx, f.fy)) {
            goal = { x: f.fx + side * (f.half(w) + half + t.gap * ART), y: f.fy + (this.rng.next() - 0.5) * 6 * ART };
            mate = f; social = true;
          }
        }
      }
    } else if (!c.mount && this.rng.chance(0.4 * keen)) {
      const friends = this.creatures.filter(o => o !== c && o.species === c.species);
      if (friends.length) {
        const f = this.rng.pick(friends), side = this.rng.chance(0.5) ? 1 : -1;
        goal = { x: f.fx + side * (f.half(w) + half + APART), y: f.fy + (this.rng.next() - 0.5) * 6 * ART };
        social = true;
      }
    }
    if (social) c.fill = Math.min(1, c.fill + FILL);
    // a walk of its own may be a sprint, with its own lengths
    const sprint = !goal && n?.pace.sprint && c.rng.chance(n.pace.sprint.p) ? n.pace.sprint : null;
    const range = sprint?.range ?? n?.pace.range, lo = range ? range[0] * ART : WALK_MIN, hi = range ? range[1] * ART : WALK_MAX;
    const across = n?.pace.sideways ? 0.15 : 0.5;
    let x = c.fx, y = c.fy, best = -1, bx = x, by = y, found = 0;
    for (let tries = 0; tries < 10; tries++) {
      if (goal && tries < 8) {
        // crowded there: aim a little wider each try, so the last to arrive settles at the edge
        const r = tries * 10 * ART, a = this.rng.next() * Math.PI * 2;
        const gx = goal.x + Math.cos(a) * r, gy = goal.y + Math.sin(a) * r * 0.5;
        const dx = gx - c.fx, dy = gy - c.fy, d = Math.hypot(dx, dy);
        // a place it means to reach: all the way
        const go = far ? d : Math.min(d, hi);
        x = d > 0 ? c.fx + dx / d * go : c.fx; y = d > 0 ? c.fy + dy / d * go : c.fy;
      } else {
        const a = this.rng.next() * Math.PI * 2, dist = lo + this.rng.next() * (hi - lo);
        x = c.fx + Math.cos(a) * dist; y = c.fy + Math.sin(a) * dist * across;
      }
      // into the lake or the sea: off the walking ground, up to the place it means to reach
      x = clamp(x, half, w.w - half); y = clamp(y, goal?.above ? Math.min(b.top, goal.y) : b.top, b.bottom);
      if (goal) {
        // up a tree or onto the roof (P4) it won't stand in anyone's way: straight to its place
        if (this.roomAt(c, x, y) || (tries === 0 && plan && goesUp(plan))) break;
        continue;
      }
      // a walk of its own: the roomiest of three places with room, away from the others and the edges, so the herd
      // spreads over the meadow instead of drifting into a corner together
      if (!this.roomAt(c, x, y)) continue;
      const o = this.openness(c, x, y);
      if (o > best) { best = o; bx = x; by = y; }
      if (++found >= 3) break;
    }
    if (!goal && best >= 0) { x = bx; y = by; }
    if (Math.hypot(x - c.fx, y - c.fy) < ART) {
      // already there: an act it came for starts now
      if (plan && canAct(this, c, plan)) { startAct(c, plan); return; }
      c.wait = rested(c, now, c.rng.int(REST[0], REST[1])); return;
    }
    c.goTo(x, y);
    c.mate = mate; c.plan = plan; c.sprinting = !!sprint; c.greet = greet;
    // P6: a walk may be a roll (never under a rider)
    if (n?.pace.roll && c.rng.chance(n.pace.roll.p)) c.rolling = !c.rider;
    if (c.mount && c.temper) this.leadLittleOnes(c);
    if (c.rider) this.leadYours(c);
    if (!home) this.leadTrain(c);
  }

  /** The middle of these creatures here, or null when none is. */
  private middle (ids: readonly string[]) {
    let x = 0, y = 0, n = 0;
    for (const id of ids) { const o = this.byId(id); if (o) { x += o.fx; y += o.fy; n++; } }
    return n ? { x: x / n, y: y / n } : null;
  }

  /** By day, a signature pair's walk (social.ts says who): facing the boss, keeping near the egg, circling the
   * treeling, herding the sheep, a stray sheep's way back, meeting at the pond or the flowers. Null: none now. */
  private signature (c: Creature, keen: number): { goal: { x: number, y: number }, mate: Creature | null } | null {
    const w = this.world;
    const boss = this.o.boss?.(w) ?? null;
    if (boss !== null && c.bold && this.rng.chance(0.5)) return { goal: { x: boss, y: this.band.top + this.rng.next() * 8 * ART }, mate: null };
    if (boss !== null && c.temper === 'close') {
      // tucked behind the nearest brave one (or a mount), on the side away from the boss
      let b: Creature | null = null, bd = Infinity;
      for (const o of this.creatures) {
        if (o === c || !(o.bold || o.mount)) continue;
        const d = Math.hypot(o.fx - c.fx, o.fy - c.fy);
        if (d < bd) { bd = d; b = o; }
      }
      if (b && this.rng.chance(0.5)) return { goal: this.beside(c, b, boss > b.tx ? -1 : 1, 2), mate: b };
    }
    // each only now and then, the less the more company it has had lately (keen, Herd.wander)
    const guard = c.guard ? this.byId(c.guard) : undefined;
    if (guard && this.rng.chance(0.7 * keen)) {
      const r = guard.half(w) + c.half(w) + 20 * ART;
      return { goal: { x: guard.tx + (this.rng.next() - 0.5) * 2 * r, y: guard.ty + (this.rng.next() - 0.5) * 16 * ART }, mate: null };
    }
    const orbit = c.orbit ? this.byId(c.orbit) : undefined;
    if (orbit && this.rng.chance(0.6 * keen)) {
      const lap = c.lap++ % 5;
      if (lap === 4) return { goal: this.beside(c, orbit, c.fx < orbit.tx ? -1 : 1, 2), mate: orbit };
      const r = orbit.half(w) + c.half(w) + 8 * ART, a = lap * Math.PI / 2;
      return { goal: { x: orbit.tx + Math.cos(a) * r, y: orbit.ty + Math.sin(a) * r * 0.5 }, mate: null };
    }
    const flock = c.flock?.length ? this.middle(c.flock) : null;
    if (flock && this.rng.chance(0.5 * keen)) {
      const r = 30 * ART + c.half(w), a = this.rng.next() * Math.PI * 2;
      return { goal: { x: flock.x + Math.cos(a) * r, y: flock.y + Math.sin(a) * r * 0.5 }, mate: null };
    }
    const fold = c.fold?.length ? this.middle(c.fold) : null;
    if (fold && Math.hypot(fold.x - c.fx, fold.y - c.fy) > 40 * ART && this.rng.chance(0.7 * keen)) return { goal: fold, mate: null };
    const spot = c.meet ? this.meetAt(c.meet) : null;
    if (spot && this.rng.chance(0.3 * keen)) {
      // around the pond's edge, over the flowers (unless a crowd is there already)
      const ring = c.meet === 'pond' ? (18 + this.rng.next() * 6) * ART * (this.rng.chance(0.5) ? 1 : -1) : (this.rng.next() - 0.5) * 12 * ART;
      const goal = { x: spot.x + ring, y: spot.y + (this.rng.next() - 0.5) * 6 * ART };
      if (!this.crowded(c, goal.x, goal.y)) return { goal, mate: null };
    }
    return null;
  }

  /** A creature sets off by day: whoever walks behind it (social.ts lead) follows a moment later. */
  private leadTrain (c: Creature) {
    for (const p of this.creatures) {
      if (p.lead !== c.id || p.st !== 'idle' || p.isAsleep || p.busy || p.follow) continue;
      if (this.rng.chance(FOLLOW * (1 - p.fill))) p.follow = { of: c, in: this.rng.int(6, 12) };
    }
  }

  /* ---- tag */

  inGame (c: Creature) { return !!this.game && (this.game.it === c || this.game.run === c); }

  /** A mischief maker, now and then, starts a game of tag with the nearest pet free to play. */
  private tag (c: Creature) {
    if (this.game || c.mount || c.temper !== 'mischief' || !this.rng.chance(1 / 3)) return false;
    let run: Creature | null = null, bd = TAG_RANGE;
    for (const o of this.creatures) {
      if (o === c || o.mount || o.st !== 'idle' || o.isAsleep || o.busy || o.follow || o.lean) continue;
      const d = Math.hypot(o.fx - c.fx, o.fy - c.fy);
      if (d < bd) { bd = d; run = o; }
    }
    if (!run) return false;
    this.game = { it: c, run, left: this.rng.int(3, 4), t: 0, pause: 0, pounce: false };
    c.busy = run.busy = 'tag'; c.mate = run.mate = null; run.copy = 0;
    this.round();
    return true;
  }

  /** A cat with yarn about, now and then: it stalks it and pounces, the yarn rolls off a little; two or three goes. */
  private pounceOn (c: Creature) {
    if (this.game || !c.pounce) return false;
    const y = this.byId(c.pounce);
    if (!y || y.st !== 'idle' || y.isAsleep || y.busy || y.follow || y.lean || Math.hypot(y.fx - c.fx, y.fy - c.fy) >= POUNCE_RANGE || !this.rng.chance(0.3)) return false;
    this.game = { it: c, run: y, left: this.rng.int(2, 3), t: 0, pause: 0, pounce: true };
    c.busy = y.busy = 'tag'; c.mate = y.mate = null; y.copy = 0;
    this.round();
    return true;
  }

  /** a round: `it` sets off after `run`, who dodges away */
  private round () {
    const g = this.game!;
    g.t = 0;
    g.it.goTo(g.run.fx, g.run.fy, true);
    const w = this.world, r = g.run, half = r.half(w), s = r.fx >= g.it.fx ? 1 : -1, flee = g.pounce ? POUNCE_ROLL : TAG_FLEE;
    let x = r.fx + s * flee;
    if (x < half || x > w.w - half) x = r.fx - s * flee;
    r.goTo(clamp(x, half, w.w - half), clamp(r.fy + (this.rng.next() - 0.5) * 20 * ART, this.band.top, this.band.bottom), true);
  }

  /** One tick of the game: the chase, a tag, the breath before they swap; over at dusk or when either is called away. */
  private play (w: World) {
    const g = this.game;
    if (!g) return;
    const { it, run } = g;
    const gone = (c: Creature) => !this.creatures.includes(c) || c.isAsleep || c.st === 'held' || c.st === 'fall' || c.st === 'land';
    if (gone(it) || gone(run) || this.dusk() || this.night() || this.worried()) { this.endGame(); return; }
    if (g.pause > 0) {
      // tag: now the other one is it; a cat goes again
      if (--g.pause === 0) { if (!g.pounce) { g.it = run; g.run = it; } this.round(); }
      return;
    }
    if (it.st !== 'chase' || run.st !== 'chase' || ++g.t > TAG_ROUND) { this.endGame(); return; }
    // dodged: it waits, watching
    if (Math.hypot(run.tx - run.fx, run.ty - run.fy) < 1 && run.facing(w) !== 'front') run.dir = it.fx > run.fx ? 1 : -1;
    it.tx = run.fx; it.ty = run.fy;
    if (Math.abs(it.fx - run.fx) < it.half(w) + run.half(w) - 6 * ART && Math.abs(it.fy - run.fy) < 6 * ART) {
      // tagged: a hop and a sparkle; pounced on: the cat lands with a hop, the yarn just stops
      const hop = g.pounce ? it : run;
      if (g.pounce) run.idle(40); else it.idle(40);
      hop.st = 'happy'; hop.t = 0; hop.tx = hop.fx; hop.ty = hop.fy; hop.leg = 0;
      const p = run.headPoint(w);
      this.emit({ kind: 'spark', x: p.x + ART, y: p.y, t: 0, life: 30, col: '#FFFFFF' });
      if (--g.left <= 0) this.endGame(); else g.pause = 14;
    }
  }

  private endGame () {
    const g = this.game;
    if (!g) return;
    this.game = null;
    for (const c of [g.it, g.run]) { c.busy = undefined; if (c.st === 'chase') c.idle(c.rng.int(45, 120)); }
  }

  /** Fireflies: every 3 s whoever is idle turns to watch the meadow's middle, and mischief makers jump for one. */
  private fireflies (w: World) {
    if (w.tick % 90 !== 0 || this.weather() !== 'fireflies' || this.still()) return;
    for (const c of this.creatures) {
      if (!c.temper || c.st !== 'idle' || c.isAsleep || c.busy || c.lean) continue;
      if (c.facing(w) !== 'front') c.face(w.w / 2 > c.fx ? 1 : -1);
      if (c.temper === 'mischief' && !c.mount && this.rng.chance(0.5)) { c.st = 'happy'; c.t = 0; c.tx = c.fx; c.ty = c.fy; c.leg = 0; }
    }
  }

  /** Two or more others stand, or are heading, around this point (within 12 art pixels of their edges across, 10
   * up or down): a crowd it keeps out of. */
  crowded (c: Creature, x: number, y: number) {
    const w = this.world;
    let k = 0;
    for (const o of this.creatures) {
      if (o === c) continue;
      const r = o.half(w) + c.half(w) + 12 * ART;
      if ((Math.abs(o.fx - x) <= r && Math.abs(o.fy - y) <= 10 * ART) || (Math.abs(o.tx - x) <= r && Math.abs(o.ty - y) <= 10 * ART)) k++;
    }
    return k >= 2;
  }

  /** How open a place is: room to the nearest other (where it stands or is heading; up and down count double, the
   * ground being shallow), up to 60 art pixels, plus room to the meadow's sides (up to 40) and top and bottom (up to
   * 12), world pixels. */
  private openness (c: Creature, x: number, y: number) {
    const w = this.world, b = this.band, half = c.half(w);
    let near = 60 * ART;
    for (const o of this.creatures) {
      if (o === c) continue;
      near = Math.min(near, Math.hypot(o.fx - x, (o.fy - y) * 2), Math.hypot(o.tx - x, (o.ty - y) * 2));
    }
    return near + Math.min(x - half, w.w - half - x, 40 * ART) + Math.min(y - b.top, b.bottom - y, 12 * ART);
  }

  /** nobody stands, or is heading, within 6 art pixels of their edge */
  private roomAt (c: Creature, x: number, y: number) {
    const w = this.world;
    return this.creatures.every(o => o === c || ([[o.fx, o.fy], [o.tx, o.ty]] as const).every(([ox, oy]) =>
      Math.abs(ox - x) >= o.half(w) + c.half(w) - 8 * ART + APART || Math.abs(oy - y) >= 8 * ART));
  }

  /* ---- what touch and the screen around it do */
  emit (p: Particle) {
    this.particles.push(p);
    if (!this.still()) return;
    // the still picture: it shows for its life, then disappears; nothing moves meanwhile
    this.redraw();
    setTimeout(() => {
      const i = this.particles.indexOf(p);
      if (i < 0) return;
      this.particles.splice(i, 1);
      if (p.owner) { const o = this.byId(p.owner); if (o) o.hearts = Math.max(0, o.hearts - 1); }
      this.redraw();
    }, p.life * TICK_MS);
  }

  private redraw () { this.settle(); if (this.stage && !this.stage.running) this.stage.invalidate(); }

  private heart (c: Creature) {
    if (c.hearts >= 3) return false;
    c.hearts++;
    const p = c.headPoint(this.world);
    this.emit({ kind: 'heart', x: p.x + (c.hearts - 2) * ART, y: p.y, t: 0, life: HEART_LIFE, owner: c.id });
    return true;
  }

  /** Tap (or the sheet's Pet, for TalkBack): one happy hop and a heart, at most 3 hearts at a time. */
  pet (id: string) {
    const c = this.byId(id);
    if (!c || c.st === 'held' || c.st === 'fall' || c.st === 'land') return false;
    if (!this.heart(c)) return false;
    this.o.haptic?.();
    this.release(c);
    if (c.isAsleep || c.asleep) c.wake = 50;
    // up on a perch or in the sky (P4): the heart, and it stays up there
    if (!this.still() && !(c.st === 'act' && c.off > 0)) {
      quitAct(c);
      // its own reaction (Touch.tap) instead of the hop; an empty one, none at all
      const tap = c.nature?.touch?.tap;
      c.tx = c.fx; c.ty = c.fy; c.leg = 0; this.unchase(c);
      if (!tap) { c.st = 'happy'; c.t = 0; } else if (tap.script.length) startAct(c, tap); else if (c.st === 'move' || c.st === 'turn') c.idle(c.rng.int(30, 60));
      if (this.o.extras) this.myTurn(c);
      // its little ones nearby copy the hop
      if (c.mount) {
        for (const p of this.creatures) {
          if (p.mount || p.st !== 'idle' || p.isAsleep || p.busy || !c.bonds.some(b => b.id === p.id && b.kind === 'family')) continue;
          if (Math.abs(p.fx - c.fx) < 60 * ART && Math.abs(p.fy - c.fy) < 30 * ART) p.copy = 8;
        }
      }
    }
    return true;
  }

  /** "My turn": petting one, its close-natured friends within 40 art pixels come over and wait beside it. */
  private myTurn (c: Creature) {
    const w = this.world;
    for (const o of this.creatures) {
      if (o === c || o.temper !== 'close' || o.st !== 'idle' || o.isAsleep || o.busy || o.follow || o.lean || !o.bonds.some(b => b.id === c.id)) continue;
      if (Math.abs(o.fx - c.fx) > o.half(w) + c.half(w) + 40 * ART || Math.abs(o.fy - c.fy) > 20 * ART) continue;
      const g = this.beside(o, c, o.fx < c.fx ? -1 : 1, 2), half = o.half(w);
      const x = clamp(g.x, half, w.w - half), y = clamp(g.y, this.band.top, this.band.bottom);
      if (Math.hypot(x - o.fx, y - o.fy) < ART || !this.roomAt(o, x, y)) continue;
      o.goTo(x, y);
      o.mate = c;
    }
  }

  /**
   * The player's avatar climbs on this mount (and off any other here); without layers, off whoever has a rider.
   * Getting on is a happy hop, no heart.
   */
  ride (id: string | null, rider?: readonly RiderLayer[]) {
    for (const c of this.creatures) {
      if (c.visitor) continue;
      if (c.id !== id || !rider?.length) { c.rider = undefined; continue; }
      const on = !c.rider;
      c.rider = rider;
      if (on && !this.still() && c.st !== 'held' && c.st !== 'fall' && c.st !== 'land') {
        c.st = 'happy'; c.t = 0; c.tx = c.fx; c.ty = c.fy; c.leg = 0; c.asleep = false;
        this.unchase(c);
        this.leadYours(c);
      }
    }
    this.redraw();
  }

  /** The sheet's Find: a sparkle and a hop so the eye lands on it. */
  find (id: string) {
    const c = this.byId(id);
    if (!c) return;
    const p = c.headPoint(this.world);
    if (!this.still() && c.st !== 'held') { c.st = 'happy'; c.t = 0; c.tx = c.fx; c.ty = c.fy; }
    this.emit({ kind: 'spark', x: p.x + ART, y: p.y, t: 0, life: 30, col: '#FFFFFF' });
  }

  /** A crit: a spinning hop and confetti (still picture: an amber sparkle for 1.2 s). */
  celebrate (id?: string) {
    const c = (id && this.byId(id)) || this.creatures.find(x => !x.mount && !x.visitor) || this.creatures.find(x => !x.visitor);
    if (!c) return;
    const p = c.headPoint(this.world);
    if (this.still()) { this.emit({ kind: 'spark', x: p.x + ART, y: p.y - 2 * ART, t: 0, life: HEART_LIFE, col: COLOURS.amber }); return; }
    c.st = 'spin'; c.t = 0; c.tx = c.fx; c.ty = c.fy;
    // its friends nearby join in, one hop after another
    if (this.o.extras) {
      const w = this.world;
      let k = 0;
      for (const o of this.creatures) {
        if (o === c || o.st !== 'idle' || o.isAsleep || o.busy || !c.bonds.some(b => b.id === o.id)) continue;
        if (Math.abs(o.fx - c.fx) <= o.half(w) + c.half(w) + 40 * ART && Math.abs(o.fy - c.fy) <= 20 * ART) o.copy = 3 * ++k;
      }
    }
    const cols = [COLOURS.amber, '#009688', '#FF6F91', '#FFFFFF'];
    for (let i = 0; i < 28; i++) this.emit({ kind: 'bit', x: p.x + 2 * ART, y: p.y + 4 * ART, vx: (this.rng.next() - 0.5) * 2.6 * ART, vy: (-1.4 - this.rng.next() * 1.6) * ART, t: 0, life: 45, col: cols[i % 4] });
  }

  /** Tap on the ground: creatures within 30 art pixels turn to look (facing only, on the ground). */
  look (x: number, y: number) {
    for (const c of this.creatures) {
      if (c.st === 'held' || c.st === 'fall' || c.lift > c.base || c.isAsleep) continue;
      if (Math.abs(c.fx - x) < 30 * ART && Math.abs(c.fy - y) < 30 * ART && Math.abs(c.fx - x) > ART) {
        if (this.startle(c, x)) continue;
        c.dir = x > c.fx ? 1 : -1;
        if (c.st === 'move') c.idle(c.rng.int(30, 60));
      }
    }
    this.redraw();
  }

  /** A shy one (Touch.shy: Deer, Bunny) bounds away from a tap on the ground at x, the way it faces away from it
   * (or the other way at the edge); false when it isn't shy or is busy, so it turns to look instead. */
  private startle (c: Creature, x: number) {
    const far = c.nature?.touch?.shy, w = this.world;
    if (!far || this.still() || c.busy || (c.st !== 'idle' && c.st !== 'move' && c.st !== 'turn')) return false;
    const half = c.half(w), away = x > c.fx ? -1 : 1;
    let gx = c.fx + away * far * ART;
    if (gx < half || gx > w.w - half) gx = c.fx - away * far * ART;
    const gy = clamp(c.fy + (c.rng.next() - 0.5) * 12 * ART, this.band.top, this.band.bottom);
    this.release(c);
    c.goTo(clamp(gx, half, w.w - half), gy); c.bolt = true;
    return true;
  }

  pickUp (c: Creature, x: number, y: number) {
    // what it gives off as it leaves the ground (Touch.lift: the octopus's ink), before it's lifted
    if (!this.still()) for (const e of c.nature?.touch?.lift ?? []) this.emitFrom(c, e);
    this.release(c);
    this.unchase(c);
    if (this.still()) c.grounded = true;
    c.st = 'held'; c.t = 0; c.hx = x; c.hy = y; c.lean = 0; c.leg = 0; c.wake = Math.max(c.wake, 1);
    this.redraw();
  }

  /** Let go at (x, y), the finger: it falls to the ground below, squashes, puffs dust and shakes itself off. */
  drop (c: Creature, x: number, y: number) {
    const w = this.world, half = c.half(w);
    const gy = clamp(y + 8 * ART, this.band.top, this.band.bottom), gx = clamp(x, half, w.w - half);
    c.setPos(gx, gy); c.tx = gx; c.ty = gy;
    // out of its carried pose (Touch.hold)
    if (c.nature?.touch?.hold) { clearPose(c); c.sq = 0; }
    if (this.still()) { c.idle(60); this.dropped(c); this.redraw(); return; }
    c.base = c.restHeight(w);
    c.lift = Math.max(8 * ART, gy - y, c.base); c.vz = 0; c.st = 'fall'; c.t = 0;
  }

  /** landed after a drop: its new place is saved (a visitor's isn't: it doesn't live here) */
  dropped (c: Creature) { if (!c.visitor) this.o.onMoved?.(c.id, this.spotOf(c)); }

  /* ---- the avatar on foot */
  /**
   * The player's avatar stands by the stable's door with these pictures (bottom first, placed from the point
   * under its feet); null or none: it isn't here (it rides a mount here, or its pictures won't load).
   */
  stand (layers: readonly RiderLayer[] | null) {
    if (!layers?.length) {
      if (this.avatar) { this.world.remove(this.avatar); this.avatar = null; }
    } else if (this.avatar) this.avatar.layers = layers;
    else {
      this.avatar = this.world.add(new Avatar(layers, this));
      this.placeAvatar(this.avatar);
    }
    this.redraw();
  }

  /** beside the door, on the side with room; without a door, a quarter of the way into the meadow */
  private placeAvatar (a: Avatar) {
    const w = this.world, b = this.band, door = this.o.home?.(w) ?? null;
    let x: number, y: number;
    if (door) {
      x = door.x + 14 * ART;
      if (x > w.w - AV_HALF - ART) x = door.x - 14 * ART;
      y = door.y + 6 * ART;
    } else { x = w.w * 0.3; y = b.top + (b.bottom - b.top) * 0.25; }
    a.x = snap(clamp(x, AV_HALF, w.w - AV_HALF)); a.y = snap(clamp(y, b.top, b.bottom));
  }

  /** A creature walked over to greet the avatar: if it got there, it turns to it with a heart and the avatar hops. */
  greeted (c: Creature) {
    c.greet = false;
    const a = this.avatar;
    if (!a || Math.abs(c.fx - a.x) > c.half(this.world) + AV_HALF + 12 * ART || Math.abs(c.fy - a.y) > 10 * ART) return;
    c.dir = a.x > c.fx ? 1 : -1;
    this.heart(c);
    a.hop = 0;
  }

  /** A tap on the avatar: it hops and the nearest awake creature comes over to say hello (in the still picture, a heart). */
  call () {
    const a = this.avatar, w = this.world;
    if (!a) return false;
    let best: Creature | null = null, bd = Infinity;
    for (const c of this.creatures) {
      if (c.isAsleep || c.leaving || c.st === 'held' || c.st === 'fall' || c.st === 'land') continue;
      const d = Math.hypot(c.fx - a.x, c.fy - a.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (this.still()) { if (best) { this.heart(best); this.o.haptic?.(); } this.redraw(); return !!best; }
    a.hop = 0;
    if (!best) return false;
    this.unchase(best);
    const half = best.half(w), side = best.fx < a.x ? -1 : 1;
    best.goTo(clamp(a.x + side * (half + AV_HALF + ART), half, w.w - half), clamp(a.y, this.band.top, this.band.bottom));
    best.greet = true;
    return true;
  }

  /* ---- visitors */
  /**
   * A party member's creature (with its rider on a mount) walks in from one side and mixes with the herd until
   * Herd.leave. In the still picture it just stands somewhere in the meadow.
   */
  visit (r: Resident, rider?: readonly RiderLayer[]) {
    if (this.byId(r.id)) return;
    this.unperch();
    const c = new Creature({ ...r, visitor: true }, this);
    this.creatures.push(c);
    this.world.add(c);
    if (rider?.length && c.mount) c.rider = rider;
    const w = this.world, b = this.band, half = c.half(w);
    if (this.size.w <= 1) this.pending.set(c.id, undefined);
    else if (this.still()) this.placeOne(c);
    else {
      const side = this.rng.chance(0.5) ? -1 : 1;
      c.setPos(side < 0 ? -half : w.w + half, b.top + this.rng.next() * (b.bottom - b.top));
      c.base = c.restHeight(w); c.lift = c.base;
      c.dir = -side;
      c.goTo(clamp(w.w * (0.2 + this.rng.next() * 0.6), half, w.w - half), c.fy);
    }
    this.redraw();
  }

  /** The visitor walks out past the nearer edge, and is gone (at once in the still picture). */
  leave (id: string) {
    const c = this.byId(id);
    if (!c?.visitor || c.leaving) return;
    if (this.still()) { this.removeCreature(c); this.redraw(); return; }
    c.leaving = true;
    this.exit(c);
  }

  private exit (c: Creature) {
    const w = this.world, half = c.half(w);
    this.unchase(c);
    c.asleep = false; c.wake = 0;
    c.goTo(c.fx < w.w / 2 ? -half - ART : w.w + half + ART, c.fy);
  }

  /* ---- gestures (pass as mountStage's interaction) */
  readonly interaction: Interaction = {
    tap: (p, s) => {
      this.attach(s);
      const hit = p.hit;
      if (hit instanceof Creature) { this.pet(hit.id); return; }
      if (hit && hit === this.avatar) { if (this.call() && !this.still()) this.o.haptic?.(); return; }
      if (hit === this.ball && this.ball) {
        if (!this.still()) { this.plays.stop(this.roll!); this.thrown = { x: this.ball.fx, y: this.ball.fy }; this.ball.flick((this.rng.next() - 0.5) * 3 * ART, (this.rng.next() - 0.5) * ART); }
        return;
      }
      this.look(p.x, p.y);
    },
    longPress: (p, s) => {
      this.attach(s);
      if (p.hit instanceof Creature) { this.touch = { mode: 'carry', who: p.hit, last: p, trail: [] }; this.pickUp(p.hit, p.x, p.y); }
    },
    longPressEnd: (p, _c, s) => {
      this.attach(s);
      const t = this.touch;
      if (t.mode === 'carry' && t.who) this.drop(t.who, t.who.hx, t.who.hy);
      this.touch = { mode: null, who: null, last: p, trail: [] };
    },
    dragStart: (p, long, s) => {
      this.attach(s);
      if (long) return; // a carry: longPress already lifted it
      if (p.hit === this.ball && this.ball) {
        this.ball.held = true; this.ball.vx = this.ball.vy = this.ball.vz = 0;
        this.touch = { mode: 'ball', who: null, last: p, trail: [{ x: p.x, y: p.y, t: performance.now() }] };
      } else if (p.hit instanceof Creature && p.hit.st !== 'held') {
        this.touch = { mode: 'stroke', who: p.hit, last: p, trail: [] };
        this.stroke(p.hit, 0);
      } else this.touch = { mode: null, who: null, last: p, trail: [] };
    },
    drag: (p, s) => {
      this.attach(s);
      const t = this.touch, w = this.world;
      const x = clamp(p.x, 0, w.w - 1), y = clamp(p.y, 0, w.h - 1);
      if (t.mode === 'carry' && t.who) { t.who.hx = x; t.who.hy = y; }
      else if (t.mode === 'ball' && this.ball) {
        t.trail.push({ x, y, t: performance.now() }); if (t.trail.length > 6) t.trail.shift();
        // with reduced motion the ball jumps to where it's let go
        if (!this.still()) { const gy = clamp(y, this.band.top, this.band.bottom); this.ball.place(x, gy, Math.max(0, gy - y)); }
      } else if (t.mode === 'stroke' && t.who) this.stroke(t.who, x - t.last.x);
      t.last = { x, y };
    },
    dragEnd: (p, _cancelled, s) => {
      this.attach(s);
      const t = this.touch, w = this.world;
      const x = clamp(p.x, 0, w.w - 1), y = clamp(p.y, 0, w.h - 1);
      if (t.mode === 'carry' && t.who) this.drop(t.who, x, y);
      else if (t.mode === 'ball' && this.ball) {
        const b = this.ball; b.held = false;
        const gy = clamp(y, this.band.top, this.band.bottom);
        if (this.still()) { b.place(clamp(x, 0, w.w), gy); this.redraw(); }
        else {
          const now = performance.now(), tr = t.trail.filter(q => now - q.t < 120);
          const a = tr[0] ?? { x, y, t: now - TICK_MS }, ticks = Math.max(1, (now - a.t) / TICK_MS);
          this.thrown = { x: b.fx, y: b.fy };
          b.flick((x - a.x) / ticks, (y - a.y) / ticks);
        }
      } else if (t.mode === 'stroke' && t.who) { t.who.lean = 0; this.redraw(); }
      this.touch = { mode: null, who: null, last: { x, y }, trail: [] };
    },
  };

  /** Stroking: it stops and leans into the finger (top half 1 art pixel), a heart every 10 ticks. */
  private stroke (c: Creature, dx: number) {
    this.release(c);
    if (dx) c.lean = dx > 0 ? 1 : -1;
    if (c.st === 'move' || c.st === 'chase' || c.st === 'turn') { c.idle(40); this.unchase(c); }
    if (c.st === 'idle') { c.wait = Math.max(c.wait, 40); c.tx = c.fx; c.ty = c.fy; }
    const now = this.still() ? Math.floor(performance.now() / TICK_MS) : this.world.tick;
    if (now - c.lastStroke >= 10 && this.heart(c)) { c.lastStroke = now; this.o.haptic?.(); }
    this.redraw();
  }
}
