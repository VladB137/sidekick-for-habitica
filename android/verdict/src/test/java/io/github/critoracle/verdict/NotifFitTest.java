package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** The expanded notification shows whole rows only, and says how many it left out. */
public class NotifFitTest {
  private static NotifFit.Heights rows (float[] dp, float oneLineFooter) {
    return new NotifFit.Heights() {
      public float row (int i) { return dp[i]; }
      // a footer that names left-out lines wraps to a second line here, as it can on a narrow phone
      public float footer (String text) { return text.contains("didn't fit") ? 2 * oneLineFooter : oneLineFooter; }
    };
  }

  @Test
  public void theBudgetIsTheExpandedHeightLessHeaderAndActions () {
    assertEquals(180f, NotifFit.budgetDp(28), 0);
    assertEquals(180f, NotifFit.budgetDp(30), 0);
    assertEquals(240f, NotifFit.budgetDp(31), 0);
    assertEquals(240f, NotifFit.budgetDp(36), 0);
  }

  @Test
  public void sixOneLineRowsFitOnAndroid9 () {
    // crit, countdown, points, night (24 dp), saving with its bar (31 dp), the HP, MP and XP bars (27 dp), footer 18 dp
    float[] dp = { 24, 24, 24, 24, 31, 27 };
    assertEquals(6, NotifFit.fit(6, "Read just now", NotifFit.budgetDp(28), rows(dp, 18)));
  }

  @Test
  public void rowsThatDontFitAreLeftOutWhole () {
    float[] dp = { 40, 40, 40, 40, 40, 40 };
    // Android 9: 180 dp; 4 × 40 + a two-line footer (36) is too much, 3 × 40 + 36 fits
    assertEquals(3, NotifFit.fit(6, "Read just now", 180, rows(dp, 18)));
    // Android 12+: 240 dp; 6 × 40 + 36 is too much, 5 × 40 + 36 fits
    assertEquals(5, NotifFit.fit(6, "Read just now", 240, rows(dp, 18)));
    // 200 dp: 5 × 40 + 36 is too much, 4 × 40 + 36 fits
    assertEquals(4, NotifFit.fit(6, "Read just now", 200, rows(dp, 18)));
  }

  @Test
  public void theFirstRowAlwaysShows () {
    assertEquals(1, NotifFit.fit(3, "Read just now", 50, rows(new float[] { 90, 20, 20 }, 18)));
    assertEquals(0, NotifFit.fit(0, "Read just now", 50, rows(new float[0], 18)));
  }

  @Test
  public void theFooterCountsWhatWasLeftOut () {
    assertEquals("Read 2 min ago", NotifFit.footer("Read 2 min ago", 0));
    assertEquals("Read 2 min ago · 1 line didn't fit", NotifFit.footer("Read 2 min ago", 1));
    assertEquals("Offline · read 1 h ago · 2 lines didn't fit", NotifFit.footer("Offline · read 1 h ago", 2));
  }
}
