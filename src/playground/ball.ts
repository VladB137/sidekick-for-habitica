/* The ball: 7 x 7 art pixels that a finger flicks and the nearest awake pets (3 at most) chase, taking turns
 * to bump it back, up to 3 times a flick. Its physics live here; its picture is the scene's (a draw function),
 * and until a scene gives one it draws the design spec's ball. Height (z) is above its spot on the ground, so it
 * sorts by where it would land and its shadow stays on the grass. */
import { ART } from './particles';
import type { Ctx, Entity, World } from './world';

const BALL = ['..ooo..', '.orrwo.', 'orrrwwo', 'orrwwbo', 'oyywwbo', '.oyybo.', '..ooo..'];
const BALL_COLOURS: Record<string, string> = { o: '#3A2A2A', r: '#EF5350', w: '#FFFFFF', b: '#42A5F5', y: '#FFCA28' };

/** size in world pixels */
export const BALL_SIZE = 7 * ART;
/** a bounce keeps 55% of its speed; slower than this it stops bouncing */
const KEEP = 0.55, GRAVITY = 0.32 * ART, MIN_BOUNCE = 0.7 * ART;

/** The spec's ball, top-left at (x, y). */
export function drawSpecBall (g: Ctx, x: number, y: number) {
  for (let r = 0; r < 7; r++) for (let i = 0; i < 7; i++) {
    const c = BALL_COLOURS[BALL[r][i]];
    if (!c) continue;
    g.fillStyle = c; g.fillRect(x + i * ART, y + r * ART, ART, ART);
  }
}

export interface BallOptions {
  /** the ball's picture, top-left at (x, y), BALL_SIZE square */
  draw?: (g: Ctx, x: number, y: number) => void;
  /** flat colour of its shadow (the scene's dark ground) */
  shadow?: () => string;
  /** the ground band it rolls on */
  ground: (w: World) => { top: number, bottom: number };
}

export class Ball implements Entity {
  readonly id = 'ball';
  readonly sprite = 'ball';
  x = 0; y = 0;
  /** precise ground position, height above it and velocities, world pixels and world pixels a tick */
  fx = 0; fy = 0; z = 0; vx = 0; vy = 0; vz = 0;
  /** bumps back from pets since the last flick */
  bumps = 0;
  held = false;
  /** put away in the toy box: not drawn, not chased */
  hidden = false;

  constructor (private o: BallOptions) {}

  place (x: number, y: number, z = 0) { this.fx = x; this.fy = y; this.z = z; this.snap(); }
  private snap () { this.x = Math.round(this.fx / ART) * ART; this.y = Math.round(this.fy / ART) * ART; }

  get moving () { return Math.abs(this.vx) + Math.abs(this.vy) > 0.05 * ART || this.z > 0 || this.vz !== 0; }

  /** A flick: velocity of the finger at release, world pixels a tick. */
  flick (vx: number, vy: number) {
    const sp = Math.min(6 * ART, Math.hypot(vx, vy)), a = Math.atan2(vy, vx);
    this.vx = Math.cos(a) * sp * 0.9; this.vy = Math.sin(a) * sp * 0.35; this.vz = 2.2 * ART + sp * 0.45;
    this.bumps = 0;
  }

  /** A pet's nose sends it back toward the middle of the meadow. r in [0, 1) from the world's generator. */
  bump (w: World, r1: number, r2: number) {
    this.vx = (this.fx > w.w / 2 ? -1 : 1) * (1.2 + r1) * ART; this.vy = (r2 - 0.5) * 0.8 * ART; this.vz = 2.6 * ART;
    this.bumps++;
  }

  /** A bump aimed at (x, y), a friend's feet (thread "Pets together": passing the ball): it comes down about there. */
  pass (x: number, y: number) {
    const dx = x - this.fx, dy = y - this.fy, d = Math.max(1, Math.hypot(dx, dy)), sp = Math.min(5 * ART, Math.max(1.2 * ART, d / 14));
    this.vx = dx / d * sp; this.vy = dy / d * sp * 0.6; this.vz = 2.6 * ART;
    this.bumps++;
  }

  update (w: World) {
    if (this.held || this.hidden) return;
    if (this.z > 0 || this.vz) {
      this.vz -= GRAVITY; this.z += this.vz;
      if (this.z <= 0) { this.z = 0; this.vz = Math.abs(this.vz) > MIN_BOUNCE ? -this.vz * KEEP : 0; }
    }
    this.fx += this.vx; this.fy += this.vy;
    const fr = this.z > 0 ? 0.99 : 0.9;
    this.vx *= fr; this.vy *= fr;
    if (Math.abs(this.vx) < 0.01) this.vx = 0;
    if (Math.abs(this.vy) < 0.01) this.vy = 0;
    const half = BALL_SIZE / 2, band = this.o.ground(w);
    if (this.fx < half || this.fx > w.w - half) { this.vx = -this.vx; this.fx = Math.max(half, Math.min(w.w - half, this.fx)); }
    if (this.fy < band.top || this.fy > band.bottom) { this.vy = -this.vy; this.fy = Math.max(band.top, Math.min(band.bottom, this.fy)); }
    this.snap();
  }

  private top () { return { x: this.x - Math.floor(BALL_SIZE / 2 / ART) * ART, y: this.y - BALL_SIZE - Math.round(this.z / ART) * ART }; }

  draw (g: Ctx) {
    if (this.hidden) return;
    const z = Math.round(this.z / ART);
    const sw = (z > 4 ? 3 : 5) * ART;
    g.fillStyle = this.o.shadow?.() ?? '#4E6B34';
    g.fillRect(this.x - Math.floor(sw / 2 / ART) * ART, this.y, sw, ART);
    const t = this.top();
    (this.o.draw ?? drawSpecBall)(g, t.x, t.y);
  }

  /** a finger lands on it: its picture plus an art pixel of slack all round */
  hit (x: number, y: number) {
    if (this.hidden) return false;
    const t = this.top();
    return x >= t.x - ART && x < t.x + BALL_SIZE + ART && y >= t.y - ART && y < t.y + BALL_SIZE + ART;
  }
}
