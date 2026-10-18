package io.github.critoracle.verdict;

import java.time.LocalDateTime;

/**
 * Weather over the live wallpaper, a port of src/playground/scenes/weather.ts: snow in winter, falling leaves
 * in autumn, fireflies on summer evenings and nights, the Mushroom glade's glow, and the day's shower of rain
 * (clock.ts showerOf, from the date alone). Single art pixels, positions from the world's tick, the same seeded
 * motes as the app (tested against it by npm run android:test).
 */
public final class StableWeather {
  /** the day's shower, [from hour, to hour), or null for a dry day: about one day in three, as clock.ts showerOf */
  public static int[] showerOf (LocalDateTime d) {
    StableRng r = new StableRng("rain:" + d.getYear() + "-" + d.getMonthValue() + "-" + d.getDayOfMonth());
    if (!r.chance(1 / 3.0)) return null;
    int from = r.nextInt(7, 17);
    return new int[] { from, from + r.nextInt(1, 3) };
  }

  /** raining now (where it can rain at all) */
  public static boolean rainAt (LocalDateTime d) { int[] s = showerOf(d); return s != null && d.getHour() >= s[0] && d.getHour() < s[1]; }
  /** a rainbow: the hour after a shower that ends before dusk */
  public static boolean rainbowAt (LocalDateTime d) { int[] s = showerOf(d); return s != null && s[1] < 19 && d.getHour() == s[1]; }

  private static final int ART = StableHerd.ART;
  private static final int[] LEAVES = { 0xF2A541, 0xD9822B, 0xC0392B, 0xE8C04A };
  private static final int[] GLOW = { 0x7CF5E8, 0xFFE66D, 0xFF8FD0, 0xB9FFF7 };

  private double[] mx = new double[0], my = new double[0], msp = new double[0];
  private int[] mph = new int[0], mcol = new int[0];
  private int n = -1;

  private void seed (int count) {
    if (count == n) return;
    StableRng r = new StableRng("weather");
    mx = new double[count]; my = new double[count]; msp = new double[count]; mph = new int[count]; mcol = new int[count];
    for (int i = 0; i < count; i++) { mx[i] = r.next(); my[i] = r.next(); msp[i] = r.next(); mph[i] = r.nextInt(0, 999); mcol[i] = r.nextInt(0, 3); }
    n = count;
  }

  /**
   * @param kind      "snow", "leaves", "fireflies", "glow", "rain", or null for none
   * @param worldW    world size, world pixels
   * @param bandTop   the ground band (where creatures walk), world pixels
   */
  public void draw (StableHerd.Paint g, String kind, int worldW, int worldH, int bandTop, int bandBottom, boolean night, int t) {
    if (kind == null) return;
    int W = (int) Math.ceil(worldW / (double) ART), H = (int) Math.ceil(worldH / (double) ART);
    int top = Math.floorDiv(bandTop, ART), bottom = Math.floorDiv(bandBottom, ART);
    double scale = Math.max(1, W / 160.0);
    switch (kind) {
      case "snow": {
        seed((int) Math.round(40 * scale));
        for (int i = 0; i < n; i++) {
          double sp = 0.3 + msp[i] * 0.4;
          double y = (my[i] * H + t * sp) % H, x = mx[i] * W + Math.round(StrictMath.sin(t / 20.0 + i));
          px(g, x, y, night ? 0xC9D3E8 : 0xF4F8FF);
        }
        break;
      }
      case "rain": {
        seed((int) Math.round(50 * scale));
        int col = night ? 0x7E93B8 : 0xB8D4F0;
        for (int i = 0; i < n; i++) {
          double sp = 2 + msp[i];
          int span = bottom + 6;
          double y = (my[i] * span + t * sp) % span - 4, x = (mx[i] * W + y / 3) % W;
          px(g, x, y, col); px(g, x, y + 1, col);
        }
        break;
      }
      case "leaves": {
        seed((int) Math.round(12 * scale));
        for (int i = 0; i < n; i++) {
          double sp = 0.25 + msp[i] * 0.25;
          int span = bottom + 8;
          double y = (my[i] * span + t * sp) % span - 8, x = (mx[i] * W + t * sp * 0.6 + Math.round(StrictMath.sin(t / 12.0 + i) * 2)) % W;
          px(g, x, y, LEAVES[mcol[i]]);
        }
        break;
      }
      default: {
        boolean glow = "glow".equals(kind);
        seed((int) Math.round((glow ? 16 : 12) * scale));
        int hi = glow ? Math.max(0, top - 30) : Math.max(0, top - 14);
        for (int i = 0; i < n; i++) {
          if ((t + mph[i]) % 90 >= (glow ? 70 : 50)) continue;
          double x = mx[i] * W + Math.round(StrictMath.sin(t / 40.0 + mph[i]) * 6), y = hi + my[i] * (bottom - hi) + Math.round(StrictMath.cos(t / 33.0 + i) * 3);
          px(g, x, y, glow ? GLOW[mcol[i]] : 0xFFF59D);
        }
      }
    }
  }

  private static void px (StableHerd.Paint g, double x, double y, int rgb) {
    g.rect(rgb, (int) Math.round(x) * ART, (int) Math.round(y) * ART, ART, ART);
  }
}
