/* The ball by species (package B, behaviours/balls.ts; app only): when a chaser reaches the ball, or anything
 * else that rolls (a Roller), its species' way of playing takes over from the usual bump. A Dog carries it back
 * to where it was flicked from, a Beetle pushes it along, a Cat crouches, wiggles and pounces, and a Dolphin
 * comes to bounce it on its nose when it lies in the water. The one playing is busy with the roller's tag, so the
 * herd, the toys and wandering leave it alone; any touch, the finger on the roller or the roller put away ends
 * the game where it is. */
import { ART } from './particles';
import { mouth, painted } from './play/toys';
import { startAct } from './behaviours/runner';
import type { Act } from './behaviours/types';
import type { Creature, Herd } from './creatures';
import type { World } from './world';

/** Something that rolls, as ball play sees it: the herd's ball, or a toy's. Positions in world pixels. */
export interface Roller {
  /** where it lies on the ground, and its height above it */
  readonly x: number; readonly y: number; readonly z: number;
  /** its size (the ball: 7 art pixels) */
  readonly size: number;
  readonly moving: boolean;
  /** what the one playing with it is busy with */
  readonly tag: string;
  /** out of its own physics and put here (carried, pushed, on a nose); null: back to its physics where it is */
  hold (at: { x: number, y: number, z: number } | null): void;
  /** sent off, world pixels a tick */
  send (vx: number, vy: number, vz: number): void;
  /** batted back by c, as a chaser's bump (it counts as one) */
  bat (c: Creature): void;
  /** taken by the finger or put away: whoever plays with it lets go */
  gone (): boolean;
  /** where it was last flicked from */
  from (): { x: number, y: number };
}

/** The pounce: a crouch, two wiggles, a spring, a leap of 12 ticks onto it, the landing. */
const LEAP = 7, LEAP_TICKS = 12;
export const POUNCE_ACT: Act = {
  id: 'pounce', rest: [20, 40],
  script: [
    { n: 4, sq: 1 }, { n: 2, sq: 1, dx: 1 }, { n: 2, sq: 1 }, { n: 2, sq: 1, dx: -1 }, { n: 2, sq: 1 }, { n: 2, sq: 1, dx: 1 }, { n: 2, sq: 1, dx: -1 },
    { n: 2, sq: -1 }, // the spring (pose LEAP is the first in the air)
    { n: 2, lift: 2 }, { n: 2, lift: 4 }, { n: 2, lift: 5 }, { n: 2, lift: 5 }, { n: 2, lift: 4 }, { n: 2, lift: 2 },
    { n: 3, sq: 1 }, { n: 8 },
  ],
};
/** a pounce starts this close (art pixels), and leaps at most this far */
const POUNCE_FROM = 26, POUNCE_LEAP = 30;

/** The nose: low in the water, five bounces of 12 ticks, a flick of the head to send it back to the grass. */
const BOUNCE = [0, 2, 4, 5, 6, 6, 5, 4, 2, 0, 0, 0], BOUNCES = 5;
export const NOSE_ACT: Act = { id: 'nose', rest: [40, 80], script: [{ n: BOUNCE.length * BOUNCES, sink: 4 }, { n: 4, sink: 3, sq: -1 }, { n: 8, sink: 4 }] };
/** a ball in the water draws a noser from this far (art pixels) */
const NOSE_RANGE = 120;

type Game =
  | { kind: 'fetch', c: Creature, r: Roller }
  | { kind: 'push', c: Creature, r: Roller }
  | { kind: 'pounce', c: Creature, r: Roller, from?: { x: number, y: number }, to?: { x: number, y: number }, landed?: boolean, bat?: number }
  | { kind: 'nose', c: Creature, r: Roller, t: number };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export class BallPlay {
  private games: Game[] = [];

  constructor (private herd: Herd, private world: World) {}

  /** someone is playing with it (it isn't anyone else's to chase) */
  playing (r: Roller) { return this.games.some(g => g.r === r && g.kind !== 'pounce'); }
  /** c is playing with something */
  has (c: Creature) { return this.games.some(g => g.c === c); }

  /** A chaser reached it: its species' way, or false for the usual bump. */
  reach (c: Creature, r: Roller): boolean {
    const how = c.nature?.ball, w = this.world;
    if (how === 'fetch') {
      const home = r.from(), m = mouth(c, w);
      this.take(c, r);
      this.games.push({ kind: 'fetch', c, r });
      r.hold({ x: m.x, y: c.fy + 1, z: this.at(c, m.y, r) });
      c.goTo(clamp(home.x, c.half(w), w.w - c.half(w)), clamp(home.y, this.herd.band.top, this.herd.band.bottom));
      return true;
    }
    if (how === 'push') {
      const half = c.half(w), room = (c.dir > 0 ? w.w - half - r.size - c.fx : c.fx - half - r.size) / ART;
      if (room < 10) return false;
      this.take(c, r);
      this.games.push({ kind: 'push', c, r });
      c.goTo(c.fx + c.dir * Math.min(room, c.rng.int(30, 50)) * ART, c.fy);
      this.ahead(c, r);
      return true;
    }
    return false;
  }

  /** A chaser near it: a pouncer crouches to spring (true: it left the chase). */
  near (c: Creature, r: Roller): boolean {
    if (c.nature?.ball !== 'pounce' || this.herd.still()) return false;
    const d = Math.hypot(r.x - c.fx, r.y - c.fy) / ART;
    if (d > POUNCE_FROM || d < 8 || r.z > 2 * ART) return false;
    c.dir = r.x > c.fx ? 1 : -1;
    startAct(c, POUNCE_ACT);
    c.busy = r.tag;
    this.games.push({ kind: 'pounce', c, r });
    return true;
  }

  /** One tick: each game, then a ball lying in the water calls a noser. */
  tick (rollers: readonly Roller[]) {
    for (const g of [...this.games]) this.step(g);
    for (const r of rollers) this.water(r);
  }

  /** Every game with this roller ends where it is (the finger took it, it was flicked again). */
  stop (r: Roller) { for (const g of [...this.games]) if (g.r === r) this.end(g); }

  private step (g: Game) {
    const { c, r } = g, w = this.world;
    if (r.gone() || c.busy !== r.tag || c.isAsleep || !this.herd.creatures.includes(c)) { this.end(g); return; }
    switch (g.kind) {
      case 'fetch': {
        if (c.st !== 'move' && c.st !== 'turn' && c.st !== 'idle') { this.end(g); return; }
        const m = mouth(c, w);
        if (c.st !== 'idle') { r.hold({ x: m.x, y: c.fy + 1, z: this.at(c, m.y, r) }); return; }
        // there: put down in front, a happy hop
        r.hold({ x: m.x, y: clamp(c.fy + 4 * ART, this.herd.band.top, this.herd.band.bottom), z: 0 });
        this.end(g);
        c.st = 'happy'; c.t = 0; c.tx = c.fx; c.ty = c.fy; c.leg = 0;
        return;
      }
      case 'push': {
        if (c.st !== 'move' && c.st !== 'turn' && c.st !== 'idle') { this.end(g); return; }
        this.ahead(c, r);
        // there: a last nudge and it rolls on a little
        if (c.st === 'idle') { this.end(g); r.send(c.dir * 0.6 * ART, 0, 0); }
        return;
      }
      case 'pounce': {
        const a = c.act;
        if (c.st !== 'act' || !a || a.a !== POUNCE_ACT) { this.end(g); return; }
        if (a.i >= LEAP && a.i < LEAP + 6) {
          if (!g.from) {
            const d = Math.min(POUNCE_LEAP * ART, Math.hypot(r.x - c.fx, r.y - c.fy)), k = Math.atan2(r.y - c.fy, r.x - c.fx);
            g.from = { x: c.fx, y: c.fy };
            g.to = { x: clamp(c.fx + Math.cos(k) * d, c.half(w), w.w - c.half(w)), y: clamp(c.fy + Math.sin(k) * d, this.herd.band.top, this.herd.band.bottom) };
            if (Math.abs(g.to.x - c.fx) > ART) c.dir = g.to.x > c.fx ? 1 : -1;
          }
          const f = Math.min(1, ((a.i - LEAP) * 2 + a.t + 1) / LEAP_TICKS);
          c.setPos(g.from.x + (g.to!.x - g.from.x) * f, g.from.y + (g.to!.y - g.from.y) * f);
          c.tx = c.fx; c.ty = c.fy;
        } else if (a.i >= LEAP + 6 && !g.landed) {
          g.landed = true;
          // on it: pinned under the paws a moment, then batted away
          if (Math.hypot(r.x - c.fx, r.y - c.fy) < 8 * ART && r.z < 3 * ART) { r.send(0, 0, 0); g.bat = 8; }
        } else if (g.bat !== undefined && --g.bat <= 0) { g.bat = undefined; r.bat(c); }
        return;
      }
      case 'nose': {
        if (!c.act) {
          // swimming over to it
          if (c.st !== 'move' && c.st !== 'turn' && c.st !== 'idle') { this.end(g); return; }
          if (r.moving) { this.end(g); return; }
          if (Math.hypot(r.x - c.fx, r.y - c.fy) > 5 * ART && c.st !== 'idle') { c.tx = r.x - c.dir * 3 * ART; c.ty = r.y; return; }
          startAct(c, NOSE_ACT); c.busy = r.tag;
        }
        if (c.act?.a !== NOSE_ACT) { this.end(g); return; }
        const top = this.top(c), m = mouth(c, w);
        if (g.t < BOUNCE.length * BOUNCES) r.hold({ x: m.x, y: c.fy + 1, z: Math.max(0, c.fy + 1 - top) + BOUNCE[g.t % BOUNCE.length] * ART });
        else if (g.t === BOUNCE.length * BOUNCES) {
          // a flick of the head: back toward the middle of the grass
          r.hold(null);
          r.send((r.x > w.w / 2 ? -1 : 1) * (1.6 + c.rng.next()) * ART, (this.herd.band.top + this.herd.band.bottom - 2 * r.y) / (60 * ART) * ART, 3 * ART);
        }
        g.t++;
        return;
      }
    }
  }

  /** a ball lying still in the water (pond or pools, not the lake or sea strip) calls the nearest free noser */
  private water (r: Roller) {
    if (this.world.tick % 15 || r.moving || r.z > 0 || r.gone() || this.herd.still() || this.games.some(g => g.r === r) || this.herd.now().winter) return;
    if (!this.herd.spots('water').some(s => !s.strip && Math.abs(r.x - s.x) <= s.w / 2 && Math.abs(r.y - s.y) <= Math.max(s.h / 2, 2 * ART))) return;
    let best: Creature | null = null, bd = NOSE_RANGE * ART;
    for (const c of this.herd.creatures) {
      if (c.nature?.ball !== 'nose' || c.mount || c.isAsleep || c.busy || (c.st !== 'idle' && c.st !== 'move' && c.st !== 'turn')) continue;
      const d = Math.hypot(c.fx - r.x, c.fy - r.y);
      if (d < bd) { bd = d; best = c; }
    }
    if (!best) return;
    this.take(best, r);
    this.games.push({ kind: 'nose', c: best, r, t: 0 });
    best.goTo(r.x - (r.x > best.fx ? 1 : -1) * 3 * ART, r.y);
  }

  /** c plays with r now (anything else it was doing with others ends) */
  private take (c: Creature, r: Roller) {
    this.herd.release(c);
    c.busy = r.tag;
  }

  /** the ball in front of a pusher, on the ground */
  private ahead (c: Creature, r: Roller) {
    const m = mouth(c, this.world), d = c.facing(this.world) === 'front' ? 0 : c.dir;
    r.hold({ x: m.x + d * (3 * ART + r.size / 2), y: c.fy + 1, z: 0 });
  }

  /** the height that puts the roller's middle at world y (a mouth) */
  private at (c: Creature, y: number, r: Roller) { return Math.max(0, c.fy + 1 - y - r.size / 2); }

  /** its painted top, world y, where it's drawn now */
  private top (c: Creature) {
    const f = c.frame(this.world);
    if (!f) return c.fy - 10 * ART;
    return f.top - Math.round(c.off / ART) * ART + painted(f.s).top;
  }

  private end (g: Game) {
    const i = this.games.indexOf(g);
    if (i < 0) return;
    this.games.splice(i, 1);
    if (g.c.busy === g.r.tag) g.c.busy = undefined;
    // let go where it is (unless the finger has it)
    if (g.kind !== 'pounce' && !g.r.gone()) g.r.hold(null);
  }
}
