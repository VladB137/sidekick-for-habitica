/* Frame pacing: the world steps in fixed 1/30 s ticks whatever the screen's refresh rate (60, 90, 120 Hz),
 * and draws at most 30 times a second. Pure, so it is tested without a browser. */

export const FPS = 30;
export const TICK_MS = 1000 / FPS;
/** after a stall (a slow phone, a debugger) the world skips ahead instead of racing through every missed tick */
export const MAX_CATCH_UP = 4;

export class FrameGate {
  private last = -1;
  private acc = 0;
  /** Call on every animation frame with its timestamp; returns how many ticks to step (0 = don't draw). */
  frame (now: number): number {
    if (this.last < 0) { this.last = now; return 1; }
    // a frame that arrives a hair early (vsync jitter) still counts: 2 ms of slack
    this.acc += Math.max(0, now - this.last);
    this.last = now;
    if (this.acc < TICK_MS - 2) return 0;
    const n = Math.max(1, Math.floor((this.acc + 2) / TICK_MS));
    // may dip just below 0 after an early frame: the debt is paid back next time, so the long-run rate stays 30
    this.acc -= n * TICK_MS;
    return Math.min(n, MAX_CATCH_UP);
  }
  /** after the loop was stopped (hidden, off screen): the time away isn't caught up */
  reset () { this.last = -1; this.acc = 0; }
}
