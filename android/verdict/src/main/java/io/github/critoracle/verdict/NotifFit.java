package io.github.critoracle.verdict;

/**
 * How many of the chosen rows the expanded notification can show whole. Android gives an expanded notification
 * a fixed height (SystemUI's notification_max_height: 294 dp on Android 9 to 11, 358 dp from 12) and takes the
 * header and the action buttons out of it; anything taller is cut off at the bottom. So rows go in, in their
 * order, while they fit with the "Read … ago" footer below them; the rest are left out and the footer says how
 * many, rather than half a row or a footer that isn't there.
 */
public final class NotifFit {
  private NotifFit () {}

  /** What one row and the footer take, in dp, as the phone will draw them (Surfaces measures the text). */
  public interface Heights {
    float row (int i);
    float footer (String text);
  }

  /**
   * The dp the custom rows may use on this Android version: notification_max_height, minus the decorated
   * template's top margin under the header (notification_content_margin_top: 46 dp, 50 dp from 12) and the
   * action row (notification_action_list_height, 60 dp), minus 8 dp to spare for skins that pad a little more.
   */
  public static float budgetDp (int sdk) {
    return sdk >= 31 ? 358 - 50 - 60 - 8 : 294 - 46 - 60 - 8;
  }

  /** The footer with the left-out rows counted. */
  public static String footer (String footer, int left) {
    if (left <= 0) return footer;
    return footer + " · " + left + (left == 1 ? " line" : " lines") + " didn't fit";
  }

  /** How many leading rows to show: all of them if they fit, else as many as fit, at least the first. */
  public static int fit (int rows, String footer, float budget, Heights h) {
    float used = 0;
    float[] upTo = new float[rows + 1];
    for (int i = 0; i < rows; i++) upTo[i + 1] = used += h.row(i);
    for (int k = rows; k > 1; k--) {
      if (upTo[k] + h.footer(footer(footer, rows - k)) <= budget) return k;
    }
    return Math.min(rows, 1);
  }
}
