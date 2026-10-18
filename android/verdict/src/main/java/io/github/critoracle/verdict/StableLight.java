package io.github.critoracle.verdict;

import java.time.LocalDateTime;

/**
 * The light of the day the Stable widget shows, from the phone's clock alone: the same hours as the app's
 * scenes (src/playground/scenes/clock.ts timeOfDay): night 21:00 to 06:00, dawn 06:00 to 08:00, day 08:00 to
 * 19:00, dusk 19:00 to 21:00. Tested against the TypeScript function (npm run android:test).
 */
public final class StableLight {
  private StableLight () {}

  /** the hours a new light starts, in order */
  private static final int[] STARTS = { 6, 8, 19, 21 };

  public static String at (int hour) {
    if (hour >= 21 || hour < 6) return "night";
    if (hour < 8) return "dawn";
    if (hour >= 19) return "dusk";
    return "day";
  }

  /** When the next light starts after `now` (the widget swaps its picture then). */
  public static LocalDateTime next (LocalDateTime now) {
    for (int h : STARTS) {
      LocalDateTime t = now.toLocalDate().atTime(h, 0);
      if (t.isAfter(now)) return t;
    }
    return now.toLocalDate().plusDays(1).atTime(STARTS[0], 0);
  }
}
