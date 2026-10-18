package io.github.critoracle.verdict;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * The scenery's own small life on the live wallpaper, a port of src/playground/scenes/ambient.ts: butterflies,
 * a fish ringing the water, frogs on the marsh's pools, a bird on the fence, a crab on the sand, and shooting
 * stars in a clear night sky (a shower on the Perseids' and the Geminids' nights), a rainbow after rain. The app sends who lives
 * where for each light of the day (critters as lists of numbers, the sky's box); everything moves from the
 * world's tick and fixed seeds, as in the app, and draws the same pixels (tested against it by npm run android:test).
 */
public final class StableAmbient {
  private static final int ART = StableHerd.ART;
  public static final int BUTTERFLY = 0, FISH = 1, FROG = 2, BIRD = 3, CRAB = 4;
  /** a critter's numbers: kind, seed, x, y, p, q, colour 1, colour 2, colour 3 */
  public static final int FIELDS = 9;

  private static final int[][] JUMP = { { -5, 0 }, { -4, -2 }, { -3, -3 }, { -2, -3 }, { -1, -2 }, { 0, 0 } };
  private static final int[][][] RINGS = {
    { { 0, 0 } }, { { -1, 0 }, { 1, 0 } }, { { -2, 0 }, { 2, 0 }, { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } }, { { -3, 0 }, { 3, 0 }, { -2, 1 }, { 2, -1 } },
  };
  private static final int[] HOP = { 0, -2, -3, -3, -2, -1 };
  private static final int[] BOW = { 0xE8483F, 0xF5953A, 0xF8DE4B, 0x5FC25A, 0x4A8FE0, 0x8A5CC8 };
  private static final int[] METEOR = { 0xFFFFFF, 0xFFFFFF, 0xFFF6C8, 0xFFF6C8, 0xFFF6C8, 0xC9D3FF, 0xC9D3FF, 0xC9D3FF, 0x8E9BD0, 0x8E9BD0, 0x8E9BD0, 0x8E9BD0 };
  /** month (1-12), first and last evening of each shower's nights */
  private static final int[][] SHOWERS = { { 8, 11, 13 }, { 12, 12, 14 } };

  private StableAmbient () {}

  /** The night that holds this moment (before 06:00 it is still the previous evening's) is a meteor shower's. */
  public static boolean showerNight (LocalDateTime t) {
    LocalDate e = t.toLocalDate().minusDays(t.getHour() < 6 ? 1 : 0);
    for (int[] s : SHOWERS) if (e.getMonthValue() == s[0] && e.getDayOfMonth() >= s[1] && e.getDayOfMonth() <= s[2]) return true;
    return false;
  }

  /**
   * @param critters    from the scenery, each {@link #FIELDS} numbers long
   * @param sky         [top, bottom, left, right] where a shooting star may start, art pixels; null for none
   * @param front       the butterflies (over the creatures); else everything behind them
   * @param meteorRate  0 none, 1 one now and then, 2 a shower
   * @param bow         [x, y, r] of the rainbow, art pixels, when one shows now; else null
   */
  public static void draw (StableHerd.Paint g, int[][] critters, int[] sky, boolean front, int t, int meteorRate, int[] bow) {
    if (!front && sky != null && meteorRate > 0) meteors(g, sky, t, meteorRate);
    if (!front && bow != null) rainbow(g, bow);
    for (int[] c : critters) {
      if ((c[0] == BUTTERFLY) != front) continue;
      switch (c[0]) {
        case BUTTERFLY: butterfly(g, c, t); break;
        case FISH: fish(g, c, t); break;
        case FROG: frog(g, c, t); break;
        case BIRD: bird(g, c, t); break;
        case CRAB: crab(g, c, t); break;
        default: break;
      }
    }
  }

  private static void px (StableHerd.Paint g, int x, int y, int rgb) { g.rect(rgb, x * ART, y * ART, ART, ART); }
  private static int round (double v) { return (int) Math.round(v); }

  private static void butterfly (StableHerd.Paint g, int[] c, int t) {
    int s = c[1], x = c[2], y = c[3], rx = c[4], ry = c[5], wing = c[6], body = c[7];
    int cx = x + round(StrictMath.sin(t / 47.0 + s) * rx * 0.7 + StrictMath.sin(t / 19.0 + s * 3) * rx * 0.3);
    int cy = y + round(StrictMath.sin(t / 31.0 + s * 2) * ry + StrictMath.sin(t / 11.0 + s));
    if ((t + s * 5) / 4 % 2 == 0) {
      px(g, cx - 2, cy - 1, wing); px(g, cx - 1, cy - 1, wing); px(g, cx + 1, cy - 1, wing); px(g, cx + 2, cy - 1, wing); px(g, cx - 1, cy, wing); px(g, cx + 1, cy, wing);
    } else {
      px(g, cx - 1, cy - 2, wing); px(g, cx + 1, cy - 2, wing); px(g, cx - 1, cy - 1, wing); px(g, cx + 1, cy - 1, wing);
    }
    px(g, cx, cy - 1, body); px(g, cx, cy, body);
  }

  private static void fish (StableHerd.Paint g, int[] c, int t) {
    int s = c[1], x = c[2], y = c[3], w = c[4], h = c[5], ring = c[6], body = c[7];
    int k = t / 150;
    StableRng r = new StableRng("fish:" + s + ":" + k);
    if (!r.chance(0.9)) return;
    int fx = x + 6 + r.nextInt(0, w - 10), fy = y + r.nextInt(0, h - 1);
    boolean jump = r.chance(0.6);
    int start = r.nextInt(0, 90);
    int i = t - k * 150 - start;
    if (i < 0) return;
    if (jump) {
      if (i < 18) {
        int[] d = JUMP[i / 3];
        px(g, fx + d[0] - 1, fy + d[1], body); px(g, fx + d[0], fy + d[1], body); px(g, fx + d[0] + 1, fy + d[1], body);
        if (i < 6) px(g, fx - 5, fy, ring);
        return;
      }
      i -= 18;
    }
    int f = i < 8 ? 0 : i < 18 ? 1 : i < 30 ? 2 : i < 42 ? 3 : -1;
    if (f < 0) return;
    for (int[] d : RINGS[f]) if (fy + d[1] >= y && fy + d[1] < y + h) px(g, fx + d[0], fy + d[1], ring);
  }

  private static void frog (StableHerd.Paint g, int[] c, int t) {
    int s = c[1], ax = c[2], ay = c[3], bx = c[4], by = c[5], skin = c[6], throat = c[7], belly = c[8];
    int k = t / 240, at = t - k * 240;
    StableRng r = new StableRng("frog:" + s + ":" + k);
    boolean onB = r.chance(0.5), croaks = r.chance(0.9);
    int cs = r.nextInt(30, 180);
    boolean wasB = new StableRng("frog:" + s + ":" + (k - 1)).chance(0.5);
    int x = onB ? bx : ax, y = onB ? by : ay;
    if (wasB != onB && at < 12) {
      int x0 = wasB ? bx : ax, y0 = wasB ? by : ay;
      double u = at / 12.0;
      x = x0 + round((x - x0) * u); y = y0 + round((y - y0) * u) + HOP[at / 2];
    }
    boolean croak = croaks && at >= cs && at < cs + 40 && (at - cs) / 5 % 2 == 0;
    px(g, x + 1, y - 2, skin); px(g, x + 3, y - 2, skin);
    for (int i = 0; i < 5; i++) px(g, x + i, y - 1, skin);
    px(g, x, y, skin); px(g, x + 4, y, skin);
    for (int i = 1; i < 4; i++) px(g, x + i, y, croak ? throat : belly);
    if (croak) px(g, x + 2, y + 1, throat);
  }

  /** [away, x, facing left, peck tick or -1] for the bird's k-th 200 ticks */
  private static int[] perch (int s, int from, int to, int k) {
    StableRng r = new StableRng("bird:" + s + ":" + k);
    boolean away = r.chance(0.3);
    int x = from + r.nextInt(0, to - from);
    boolean left = r.chance(0.5), pecks = r.chance(0.8);
    int at = r.nextInt(30, 170);
    return new int[] { away ? 1 : 0, x, left ? 1 : 0, pecks ? at : -1 };
  }

  private static void flying (StableHerd.Paint g, int fx, int fy, boolean left, int i, int body, int beak) {
    if (i / 3 % 2 == 0) { put(g, fx, fy, left, 0, 0, body); put(g, fx, fy, left, 4, 0, body); } else { put(g, fx, fy, left, 0, 2, body); put(g, fx, fy, left, 4, 2, body); }
    put(g, fx, fy, left, 1, 1, body); put(g, fx, fy, left, 2, 1, body); put(g, fx, fy, left, 3, 1, body); put(g, fx, fy, left, 5, 1, beak);
  }

  /** a pixel of a 5-across picture with its top-left at (x, y), mirrored facing left */
  private static void put (StableHerd.Paint g, int x, int y, boolean left, int col, int row, int rgb) { px(g, left ? x + 4 - col : x + col, y + row, rgb); }

  private static void bird (StableHerd.Paint g, int[] c, int t) {
    int s = c[1], from = c[2], y = c[3], to = c[4], body = c[6], breast = c[7], beak = c[8];
    int k = t / 200, at = t - k * 200;
    int[] now = perch(s, from, to, k), prev = perch(s, from, to, k - 1);
    if (now[0] == 1) {
      if (prev[0] == 1 || at >= 24) return;
      int d = prev[2] == 1 ? -1 : 1;
      flying(g, prev[1] + d * at, y - 3 - at / 2, prev[2] == 1, at, body, beak);
      return;
    }
    if (prev[0] == 1 && at < 24) {
      int d = now[2] == 1 ? -1 : 1, a = 24 - at;
      flying(g, now[1] - d * a, y - 3 - a / 2, now[2] == 1, at, body, beak);
      return;
    }
    int x = now[1], lift = 0;
    boolean left = now[2] == 1;
    if (prev[0] == 0 && prev[1] != now[1] && at < 10) {
      x = prev[1] + round((now[1] - prev[1]) * at / 10.0); lift = at >= 2 && at < 8 ? 1 : 0; left = now[1] < prev[1];
    }
    int top = y - 3 - lift;
    if (now[3] >= 0 && at >= now[3] && at < now[3] + 8) {
      put(g, x, top, left, 0, 1, body); put(g, x, top, left, 1, 1, body); put(g, x, top, left, 2, 1, body); put(g, x, top, left, 3, 1, breast);
      put(g, x, top, left, 4, 2, body); put(g, x, top, left, 5, 2, beak); put(g, x, top, left, 1, 2, body);
    } else {
      put(g, x, top, left, 3, 0, body); put(g, x, top, left, 4, 0, beak); put(g, x, top, left, 0, 1, body); put(g, x, top, left, 1, 1, body);
      put(g, x, top, left, 2, 1, body); put(g, x, top, left, 3, 1, breast); put(g, x, top, left, 1, 2, body); put(g, x, top, left, 2, 2, breast);
    }
  }

  private static void crab (StableHerd.Paint g, int[] c, int t) {
    int s = c[1], from = c[2], y = c[3], to = c[4], shell = c[6], claw = c[7], eye = c[8];
    int k = t / 180, at = t - k * 180;
    StableRng rn = new StableRng("crab:" + s + ":" + k), rp = new StableRng("crab:" + s + ":" + (k - 1));
    int nx = from + rn.nextInt(0, to - from), wave = rn.nextInt(20, 160), px0 = from + rp.nextInt(0, to - from);
    int d = nx - px0, moved = Math.min(Math.abs(d), at / 4), x = px0 + Integer.signum(d) * moved;
    boolean walking = moved < Math.abs(d), up = !walking && at >= wave && at < wave + 16 && (at - wave) / 4 % 2 == 0;
    px(g, x, y - (up ? 3 : 2), claw); px(g, x + 4, y - (up ? 3 : 2), claw);
    px(g, x + 1, y - 2, eye); px(g, x + 3, y - 2, eye);
    for (int i = 1; i < 4; i++) px(g, x + i, y - 1, shell);
    px(g, x + 1, y, shell); px(g, x + 2, y, shell); px(g, x + 3, y, shell);
    if (!walking || at / 2 % 2 == 0) { px(g, x, y, claw); px(g, x + 4, y, claw); } else { px(g, x - 1, y, claw); px(g, x + 5, y, claw); }
  }

  private static void rainbow (StableHerd.Paint g, int[] bow) {
    int cx = bow[0], cy = bow[1], R = bow[2];
    for (int b = 0; b < BOW.length; b++) {
      int r = R - b;
      for (int dx = -r; dx <= r; dx++) {
        int dy = round(Math.sqrt(r * r - dx * dx)), x = cx + dx, y = cy - dy;
        if (((x + y) & 1) == 0 && y < cy - 4) px(g, x, y, BOW[b]);
      }
      for (int dy = 0; dy < r; dy++) {
        int dx = round(Math.sqrt(r * r - dy * dy)), y = cy - dy;
        for (int x : new int[] { cx - dx, cx + dx }) if (((x + y) & 1) == 0 && y < cy - 4 && round(Math.sqrt(r * r - (x - cx) * (x - cx))) != dy) px(g, x, y, BOW[b]);
      }
    }
  }

  private static void meteors (StableHerd.Paint g, int[] sky, int t, int rate) {
    int top = sky[0], bottom = sky[1], left = sky[2], right = sky[3], L = rate == 2 ? 40 : 600, D = 12;
    int k = t / L;
    StableRng r = new StableRng("meteor:" + rate + ":" + k);
    if (!r.chance(rate == 2 ? 0.8 : 0.5)) return;
    int start = r.nextInt(0, L - D), sx = left + r.nextInt(0, right - left), sy = top + r.nextInt(0, Math.floorDiv(bottom - top, 2));
    int i = t - k * L - start;
    if (i < 0 || i >= D) return;
    for (int j = i >= D - 3 ? 3 * (i - D + 4) : 0; j < METEOR.length; j++) {
      int u = 2 * i + 2 - j;
      if (u < 0) break;
      int x = sx - u, y = sy + (u >> 1);
      if (y <= bottom && x >= 0) px(g, x, y, METEOR[j]);
    }
  }
}
