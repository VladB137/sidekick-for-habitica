package io.github.critoracle.verdict;

/**
 * The playground's seeded generator (src/playground/rng.ts): FNV-1a for string seeds, Mulberry32 for the
 * numbers, and the same forks, so the live wallpaper's herd draws the same numbers as the app's Stable.
 */
public final class StableRng {
  private int s;

  public StableRng (int seed) { s = seed; }
  public StableRng (String seed) { s = hash(seed); }

  /** 32-bit FNV-1a over UTF-16 code units, as rng.ts hashSeed (returned as the same 32 bits) */
  public static int hash (String str) {
    int h = 0x811c9dc5;
    for (int i = 0; i < str.length(); i++) { h ^= str.charAt(i); h *= 0x01000193; }
    return h;
  }

  /** in [0, 1) */
  public double next () {
    int t = (s += 0x6d2b79f5);
    t = (t ^ (t >>> 15)) * (t | 1);
    t ^= t + (t ^ (t >>> 7)) * (t | 61);
    return ((t ^ (t >>> 14)) & 0xFFFFFFFFL) / 4294967296.0;
  }

  /** integer in [lo, hi] */
  public int nextInt (int lo, int hi) { return lo + (int) Math.floor(next() * (hi - lo + 1)); }
  public boolean chance (double p) { return next() < p; }
  public StableRng fork (String label) { return new StableRng(hash(Integer.toUnsignedString(s) + ":" + label)); }
}
