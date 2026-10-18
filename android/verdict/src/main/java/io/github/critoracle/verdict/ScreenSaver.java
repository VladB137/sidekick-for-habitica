package io.github.critoracle.verdict;

/**
 * The Stable screen saver's small decisions (StableDream), pure Java so they're tested on any JDK: whether Android's
 * settings name it as the screen saver, how its clock reads, and the few pixels the clock drifts each minute so an
 * OLED screen left on all night doesn't keep the same digits lit in the same place.
 */
public final class ScreenSaver {
  private ScreenSaver () {}

  /** how far the clock drifts each way, in dp */
  public static final int DRIFT_DP = 6;

  /**
   * Whether Android's screen saver is on and it is this one: {@code enabled} and {@code components} are the phone's
   * {@code screensaver_enabled} and {@code screensaver_components} settings (null when never written: then it is on
   * if the phone has screen savers on by default, so it counts as on), {@code pkg} and {@code cls} this app's
   * package and the screen saver's class.
   */
  public static boolean chosen (String enabled, String components, String pkg, String cls) {
    if (enabled != null && enabled.trim().equals("0")) return false;
    if (components == null || pkg == null || cls == null) return false;
    String full = pkg + "/" + cls, brief = cls.startsWith(pkg + ".") ? pkg + "/" + cls.substring(pkg.length()) : full;
    for (String c : components.split(",")) {
      String t = c.trim();
      if (t.equals(full) || t.equals(brief)) return true;
    }
    return false;
  }

  /** the clock's pattern for android.text.format.DateFormat: hours and minutes only, as the phone tells the time */
  public static String pattern (boolean is24) { return is24 ? "H:mm" : "h:mm"; }

  /**
   * Where the clock sits this minute, in dp from its middle place: a slow walk around a small square, one step a
   * minute, never more than {@link #DRIFT_DP} either way, never the same place two minutes running.
   */
  public static int[] drift (long minute) {
    int side = 2 * DRIFT_DP, lap = 4 * side;
    int s = (int) Math.floorMod(minute, (long) lap);
    int x, y;
    if (s < side) { x = s; y = 0; }
    else if (s < 2 * side) { x = side; y = s - side; }
    else if (s < 3 * side) { x = 3 * side - s; y = side; }
    else { x = 0; y = 4 * side - s; }
    return new int[] { x - DRIFT_DP, y - DRIFT_DP };
  }
}
