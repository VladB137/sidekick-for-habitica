/* Turns one finger's pointer events into tap, long press and drag. Pure (timers are passed in) so the
 * thresholds are tested without a browser. A long press that keeps moving becomes a drag: lift and drop. */

export const TAP_SLOP_PX = 8;      // CSS pixels a finger may wander and still tap
export const LONG_PRESS_MS = 450;

export interface Point { x: number, y: number }

export interface GestureHandlers<P> {
  tap? (at: P): void;
  longPress? (at: P): void;
  /** the finger lifted (or the system took it) after a long press that never moved into a drag */
  longPressEnd? (at: P, cancelled: boolean): void;
  /** started at the down point; drag moves follow, then dragEnd (cancelled = the system took the pointer) */
  dragStart? (at: P, long: boolean): void;
  drag? (at: P): void;
  dragEnd? (at: P, cancelled: boolean): void;
}

export interface Timers { set (f: () => void, ms: number): unknown, clear (t: unknown): void }

/** P is whatever the caller attaches to a point (world coordinates, the entity under the finger...). */
export class Gestures<P> {
  private id: number | null = null;
  private start: Point = { x: 0, y: 0 };
  private startAt!: P;
  private last!: P;
  private state: 'down' | 'long' | 'drag' = 'down';
  private timer: unknown = null;

  constructor (private h: GestureHandlers<P>, private timers: Timers = { set: (f, ms) => setTimeout(f, ms), clear: t => clearTimeout(t as number) }) {}

  get active () { return this.id !== null; }

  down (id: number, css: Point, at: P) {
    if (this.id !== null) return; // a second finger is ignored
    this.id = id; this.start = css; this.startAt = at; this.last = at; this.state = 'down';
    this.timer = this.timers.set(() => {
      this.timer = null;
      if (this.id === null || this.state !== 'down') return;
      this.state = 'long';
      this.h.longPress?.(this.startAt);
    }, LONG_PRESS_MS);
  }

  move (id: number, css: Point, at: P) {
    if (id !== this.id) return;
    this.last = at;
    if (this.state === 'drag') { this.h.drag?.(at); return; }
    if (Math.hypot(css.x - this.start.x, css.y - this.start.y) <= TAP_SLOP_PX) return;
    const long = this.state === 'long';
    this.clearTimer();
    this.state = 'drag';
    this.h.dragStart?.(this.startAt, long);
    this.h.drag?.(at);
  }

  up (id: number, at: P) {
    if (id !== this.id) return;
    this.clearTimer();
    if (this.state === 'down') this.h.tap?.(this.startAt);
    else if (this.state === 'long') this.h.longPressEnd?.(at, false);
    else if (this.state === 'drag') this.h.dragEnd?.(at, false);
    this.id = null;
  }

  cancel (id: number) {
    if (id !== this.id) return;
    this.clearTimer();
    if (this.state === 'drag') this.h.dragEnd?.(this.last, true);
    else if (this.state === 'long') this.h.longPressEnd?.(this.last, true);
    this.id = null;
  }

  /** Forget the finger without telling anyone (the stage is going away): no late long press. */
  abort () { this.clearTimer(); this.id = null; }

  private clearTimer () { if (this.timer !== null) { this.timers.clear(this.timer); this.timer = null; } }
}
