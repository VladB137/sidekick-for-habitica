package io.github.critoracle;

import android.app.AppOpsManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Process;
import io.github.critoracle.verdict.Json;
import io.github.critoracle.verdict.Lines;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** The player's choices for the native extras (all off until switched on in the app's Settings). */
final class Settings {
  private Settings () {}

  private static final String PREFS = "critoracle-native";

  static boolean notification (Context c) { return prefs(c).getBoolean("notification", false); }
  static void setNotification (Context c, boolean on) { prefs(c).edit().putBoolean("notification", on).apply(); }

  /**
   * The player swiped the notification away (Android 14+ lets them, ongoing or not): it stays away until the app is
   * next opened or the notification is switched on again.
   */
  static boolean notificationDismissed (Context c) { return prefs(c).getBoolean("notificationDismissed", false); }
  static void setNotificationDismissed (Context c, boolean dismissed) {
    if (notificationDismissed(c) != dismissed) prefs(c).edit().putBoolean("notificationDismissed", dismissed).apply();
  }

  /** The Quick Settings tile is in the player's panel (VerdictTile: added, removed, or seen listening). Kept across logout. */
  static boolean tileAdded (Context c) { return c.getSharedPreferences(TILE_PREFS, Context.MODE_PRIVATE).getBoolean("added", false); }
  static void setTileAdded (Context c, boolean added) {
    if (tileAdded(c) != added) c.getSharedPreferences(TILE_PREFS, Context.MODE_PRIVATE).edit().putBoolean("added", added).apply();
  }
  private static final String TILE_PREFS = "critoracle-tile";

  static boolean backgroundRefresh (Context c) { return prefs(c).getBoolean("refresh", false); }
  static void setBackgroundRefresh (Context c, boolean on) { prefs(c).edit().putBoolean("refresh", on).apply(); }

  /**
   * What the notification shows (the app's Settings → Notification): {order: "auto" | "mine", lines: [id…] switched on,
   * in the player's order, savingFor: {name, price} | null, allocateTo, widget: boolean}. Until the player chooses,
   * the lines on for a new install, most urgent first.
   */
  static Object lines (Context c) {
    String json = prefs(c).getString("lines", null);
    if (json != null) {
      try { return Json.parse(json); } catch (RuntimeException e) { /* fall back to the defaults */ }
    }
    Map<String, Object> d = new LinkedHashMap<>();
    d.put("order", "auto");
    d.put("lines", new ArrayList<Object>(Lines.DEFAULT_ON));
    return d;
  }
  static void setLines (Context c, String json) { prefs(c).edit().putString("lines", json).apply(); }

  /** The lines switched on (known ids only). */
  static List<String> linesOn (Context c) {
    List<String> on = new ArrayList<>();
    Object l = Json.at(lines(c), "lines");
    if (l instanceof List) for (Object o : (List<?>) l) if (o instanceof String && Lines.IDS.contains(o)) on.add((String) o);
    return on;
  }

  /** The home-screen widget shows the notification's first two lines instead of the verdict alone. */
  static boolean widgetMirrors (Context c) { return relaxed(c) || Boolean.TRUE.equals(Json.at(lines(c), "widget")); }

  /** Relaxed mode (src/app/mode.ts): no crit verdict anywhere, so the widget and the tile show the notification's first lines. */
  static boolean relaxed (Context c) { return Boolean.TRUE.equals(Json.at(lines(c), "relaxed")); }

  static void clear (Context c) { prefs(c).edit().clear().apply(); }

  /** Usage access (Settings → Apps → Special app access), needed to notice Habitica closing. */
  static boolean usageAccess (Context c) {
    AppOpsManager ops = c.getSystemService(AppOpsManager.class);
    if (ops == null) return false;
    @SuppressWarnings("deprecation")
    int mode = ops.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), c.getPackageName());
    return mode == AppOpsManager.MODE_ALLOWED;
  }

  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
