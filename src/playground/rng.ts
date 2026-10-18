/* Seeds and a small seeded generator: the same seed gives the same world on every phone, so only the
 * player's choices need saving, never the world itself. */

/** 32-bit FNV-1a of a string (a user ID plus a day, a meadow name...). */
export function hashSeed (s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** Mulberry32: fast, 32-bit state, good enough for scenery and wandering (not for anything Habitica decides). */
export class Rng {
  private s: number;
  constructor (seed: number | string) { this.s = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0; }
  /** in [0, 1) */
  next (): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** integer in [lo, hi] */
  int (lo: number, hi: number): number { return lo + Math.floor(this.next() * (hi - lo + 1)); }
  pick<T> (xs: readonly T[]): T { return xs[Math.floor(this.next() * xs.length)]; }
  chance (p: number): boolean { return this.next() < p; }
  /** a child generator, so one part of the world drawing more numbers doesn't reshuffle another */
  fork (label: string): Rng { return new Rng(hashSeed(`${this.s}:${label}`)); }
}
