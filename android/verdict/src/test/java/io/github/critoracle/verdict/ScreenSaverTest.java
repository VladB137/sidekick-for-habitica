package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** The Stable screen saver: recognised in Android's settings, a clock as the phone tells the time, drifting a little. */
public class ScreenSaverTest {
  private static final String PKG = "io.github.critoracle", CLS = "io.github.critoracle.StableDream";

  @Test
  public void chosenWhenAndroidNamesIt () {
    assertTrue(ScreenSaver.chosen("1", PKG + "/" + CLS, PKG, CLS));
    // the short form, and among others
    assertTrue(ScreenSaver.chosen("1", "com.android.deskclock/com.android.deskclock.Screensaver, " + PKG + "/.StableDream", PKG, CLS));
    // never written: on where the phone has screen savers on by default
    assertTrue(ScreenSaver.chosen(null, PKG + "/" + CLS, PKG, CLS));
  }

  @Test
  public void notChosenWhenOffOrAnother () {
    assertFalse(ScreenSaver.chosen("0", PKG + "/" + CLS, PKG, CLS));
    assertFalse(ScreenSaver.chosen("1", "com.android.deskclock/com.android.deskclock.Screensaver", PKG, CLS));
    assertFalse(ScreenSaver.chosen("1", null, PKG, CLS));
    assertFalse(ScreenSaver.chosen("1", "", PKG, CLS));
    // a debug build's own package isn't the release one
    assertFalse(ScreenSaver.chosen("1", PKG + ".debug/" + CLS, PKG, CLS));
  }

  @Test
  public void clockAsThePhoneTellsTheTime () {
    assertEquals("H:mm", ScreenSaver.pattern(true));
    assertEquals("h:mm", ScreenSaver.pattern(false));
  }

  @Test
  public void driftStaysCloseAndMovesEveryMinute () {
    int[] prev = ScreenSaver.drift(-1);
    for (long m = 0; m < 3 * 24 * 60; m++) {
      int[] d = ScreenSaver.drift(m);
      assertTrue(Math.abs(d[0]) <= ScreenSaver.DRIFT_DP && Math.abs(d[1]) <= ScreenSaver.DRIFT_DP);
      // one dp a minute: never still, never a jump
      assertEquals(1, Math.abs(d[0] - prev[0]) + Math.abs(d[1] - prev[1]));
      prev = d;
    }
  }
}
