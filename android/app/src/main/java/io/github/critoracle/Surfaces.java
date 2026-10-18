package io.github.critoracle;

import android.annotation.SuppressLint;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Typeface;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;
import io.github.critoracle.verdict.Json;
import io.github.critoracle.verdict.NotifFit;
import io.github.critoracle.verdict.VerdictText;
import java.util.List;
import java.util.Map;

/** Puts the current verdict on the native surfaces: the ongoing notification (with the lines the player chose) and the widgets; the tile reads it itself (VerdictTile). */
final class Surfaces {
  private Surfaces () {}

  static final String CHANNEL = "verdict";
  static final int NOTIFICATION_ID = 1;

  // the app's looks (src/styles.css): Teal 900 live, Amber 700 crit, Blue Grey 700/900 offline (by Look name)
  static final int TEAL = 0xFF004D40;
  static final int AMBER = 0xFFFFA000;
  static final int BLUE_GREY = 0xFF455A64;

  static int color (String look) {
    switch (look) {
      case "CRIT": return AMBER;
      case "OFFLINE": return BLUE_GREY;
      default: return TEAL;
    }
  }

  /** icons on the rows: Teal 500, Amber 700 for a crit, Red 600 for danger (visible on light and dark shades) */
  static final int ICON_TEAL = 0xFF009688;
  static final int ICON_AMBER = 0xFFFFA000;
  static final int ICON_RED = 0xFFE53935;

  private static String shown = "";

  /** Re-draws only when something on a surface changed (the service checks every couple of seconds). */
  static synchronized void refreshIfChanged (Context c) {
    VerdictText.Line line = LastRead.line(c);
    Map<String, Object> lines = LastRead.lines(c);
    String key = key(c, line, lines);
    if (key.equals(shown)) return;
    shown = key;
    draw(c, line, lines);
  }

  static synchronized void refresh (Context c) {
    VerdictText.Line line = LastRead.line(c);
    Map<String, Object> lines = LastRead.lines(c);
    shown = key(c, line, lines);
    draw(c, line, lines);
  }

  private static String key (Context c, VerdictText.Line line, Map<String, Object> lines) {
    return line.look + "|" + line.title + "|" + line.text + "|" + LastRead.at(c) + "|" + Settings.notification(c) + Settings.notificationDismissed(c) + "|" + Settings.widgetMirrors(c) + "|" + Settings.relaxed(c) + "|" + Json.stringify(lines)
        + "|" + c.getResources().getConfiguration().fontScale + "|" + c.getResources().getConfiguration().smallestScreenWidthDp;
  }

  private static void draw (Context c, VerdictText.Line line, Map<String, Object> lines) {
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    // switched off or logged out: the last verdict must not stay on screen (stopping the service only removes its own copy);
    // swiped away: not posted again until the app is opened
    if (nm != null) {
      if (Settings.notification(c) && !Settings.notificationDismissed(c) && TokenStore.has(c)) nm.notify(NOTIFICATION_ID, notification(c, lines));
      else nm.cancel(NOTIFICATION_ID);
    }
    if (Settings.widgetMirrors(c)) VerdictWidget.updateAll(c, AppWidgetManager.getInstance(c), str(lines.get("title")), str(lines.get("text")), str(lines.get("look")));
    else VerdictWidget.updateAll(c, AppWidgetManager.getInstance(c), line.title, line.text, line.look.name());
    // not the tile: it redraws from LastRead whenever the panel opens (onStartListening), the only time it's seen
    RedrawJob.afterDraw(c, line.look, LastRead.at(c));
  }

  private static String str (Object o) { return o == null ? "" : String.valueOf(o); }

  /** Something on the phone shows what a read brings: the notification, a widget, the tile, or a repeating To-Do's reminder. */
  static boolean anyOn (Context c) {
    if (Settings.notification(c) && !Settings.notificationDismissed(c) && notificationsEnabled(c)) return true;
    int[] ids = AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, VerdictWidget.class));
    if (ids != null && ids.length > 0) return true;
    if (Settings.tileAdded(c)) return true;
    return !RepeatReminders.load(c).items().isEmpty();
  }

  /** Android lets the app post notifications (the permission, the app's switch) and the verdict channel isn't blocked. */
  static boolean notificationsEnabled (Context c) {
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm == null || !nm.areNotificationsEnabled()) return false;
    NotificationChannel ch = nm.getNotificationChannel(CHANNEL);
    return ch == null || ch.getImportance() != NotificationManager.IMPORTANCE_NONE;
  }

  static void ensureChannel (Context c) {
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
    NotificationChannel ch = new NotificationChannel(CHANNEL, "Crit verdict", NotificationManager.IMPORTANCE_LOW);
    ch.setDescription("Whether your next task will crit, and the other lines you chose, from the last read of your Habitica numbers.");
    ch.setShowBadge(false);
    nm.createNotificationChannel(ch);
  }

  static PendingIntent openApp (Context c) { return openApp(c, null); }

  /** The app, on a given tab ("tasks", "stable") or wherever it was. */
  static PendingIntent openApp (Context c, String route) {
    Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
    if (route != null) i.putExtra(MainActivity.EXTRA_ROUTE, route);
    // one request code per route: with a shared one, FLAG_UPDATE_CURRENT would give every route's intent the last route's extra
    return PendingIntent.getActivity(c, route == null ? 0 : 1 + Math.floorMod(route.hashCode(), 1 << 20), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  /** For the service's first start, before anything was worked out. */
  static Notification notification (Context c) { return notification(c, LastRead.lines(c)); }

  /**
   * Collapsed: the first line as the title, the second as the text. Expanded: up to six rows with an icon and an
   * optional thin bar, as many as fit whole, then when the numbers were read. Open, Tasks and Refresh only open
   * the app or read: nothing here scores, buys or spends.
   */
  static Notification notification (Context c, Map<String, Object> lines) {
    ensureChannel(c);
    String look = str(lines.get("look"));
    Notification.Builder b = new Notification.Builder(c, CHANNEL)
        .setSmallIcon(R.drawable.ic_stat_crit)
        .setContentTitle(str(lines.get("title")))
        .setContentText(str(lines.get("text")))
        .setContentIntent(openApp(c))
        .setDeleteIntent(DismissReceiver.intent(c))
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setShowWhen(LastRead.at(c) > 0)
        .setWhen(LastRead.at(c))
        .setCategory(Notification.CATEGORY_STATUS)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setColor(color(look))
        .setColorized("CRIT".equals(look));
    Object rows = lines.get("rows");
    if (TokenStore.has(c) && rows instanceof List && !((List<?>) rows).isEmpty()) {
      b.setStyle(new Notification.DecoratedCustomViewStyle()).setCustomBigContentView(expanded(c, (List<?>) rows, str(lines.get("footer"))));
      b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_line_open_in_new), "Open", openApp(c)).build());
      b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_line_task_alt), "Tasks", openApp(c, "tasks")).build());
      b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_line_refresh), "Refresh", RefreshReceiver.intent(c)).build());
    } else {
      b.setStyle(new Notification.BigTextStyle().bigText(str(lines.get("text"))));
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
    return b.build();
  }

  /**
   * The rows that fit whole in Android's expanded height (NotifFit), each up to three lines, then the footer,
   * which names any row left out. Heights are worked out from the phone's own text size and screen width.
   */
  private static RemoteViews expanded (Context c, List<?> rows, String footer) {
    String pkg = c.getPackageName();
    RemoteViews big = new RemoteViews(pkg, R.layout.notif_expanded);
    big.removeAllViews(R.id.notif_rows);
    Measure m = new Measure(c);
    int n = NotifFit.fit(rows.size(), footer, NotifFit.budgetDp(Build.VERSION.SDK_INT), new NotifFit.Heights() {
      public float row (int i) { return m.row(rows.get(i)); }
      public float footer (String text) { return m.footer(text); }
    });
    for (Object r : rows.subList(0, n)) {
      List<?> bl = bars(r);
      String tone = str(Json.at(r, "tone"));
      int tint = "crit".equals(tone) ? ICON_AMBER : "danger".equals(tone) ? ICON_RED : ICON_TEAL;
      RemoteViews v;
      if (bl.size() == 3) {
        v = new RemoteViews(pkg, R.layout.notif_row_bars);
        int[] labels = { R.id.bar_label_0, R.id.bar_label_1, R.id.bar_label_2 };
        int[] ids = { R.id.bar_0, R.id.bar_1, R.id.bar_2 };
        for (int i = 0; i < 3; i++) {
          v.setTextViewText(labels[i], str(Json.at(bl.get(i), "label")));
          v.setProgressBar(ids[i], 1000, permille(bl.get(i)), false);
        }
      } else {
        v = new RemoteViews(pkg, R.layout.notif_row);
        v.setTextViewText(R.id.row_text, str(Json.at(r, "text")));
        if (bl.size() == 1) {
          int id = "crit".equals(tone) ? R.id.row_bar_amber : "danger".equals(tone) ? R.id.row_bar_red : R.id.row_bar_teal;
          v.setViewVisibility(id, View.VISIBLE);
          v.setProgressBar(id, 1000, permille(bl.get(0)), false);
        }
      }
      v.setImageViewResource(R.id.row_icon, icon(str(Json.at(r, "icon"))));
      v.setInt(R.id.row_icon, "setColorFilter", tint);
      big.addView(R.id.notif_rows, v);
    }
    big.setTextViewText(R.id.notif_footer, NotifFit.footer(footer, rows.size() - n));
    return big;
  }

  private static List<?> bars (Object row) {
    Object bars = Json.at(row, "bars");
    return bars instanceof List ? (List<?>) bars : java.util.Collections.emptyList();
  }

  /**
   * How tall the rows in res/layout/notif_row*.xml and the footer come out, in dp. The text is laid out as the
   * notification's TextViews lay it out (font padding, up to their maxLines), at the phone's text size, in a
   * width a little narrower than the real one (the shade's margins differ by phone and the system font may be
   * wider than Roboto), so a guess errs towards leaving a row out, never towards cutting one off.
   */
  private static final class Measure {
    // notif_row.xml / notif_row_bars.xml / notif_expanded.xml
    static final float ROW_PAD = 2 * 2, ICON = 20, ICON_GAP = 16, BAR = 3 + 4, FOOTER_TOP = 2;
    static final int ROW_LINES = 3, FOOTER_LINES = 2;
    final DisplayMetrics dm;
    final TextPaint text, info;
    final int width, third;

    Measure (Context c) {
      dm = c.getResources().getDisplayMetrics();
      text = paint(14);
      info = paint(12);
      // the narrowest the shade gets on this phone: the screen less the shade's sides (8 dp each), the content's
      // start and end margins (notification_content_margin_start: 16 dp, 52 dp from Android 12; _end: 16 dp)
      // and the row's icon; then 10% to spare
      int start = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ? 52 : 16;
      int dp = c.getResources().getConfiguration().smallestScreenWidthDp - 16 - start - 16;
      width = Math.max(1, (int) (px(dp - ICON - ICON_GAP) * 0.9f));
      third = Math.max(1, (int) (px(dp - ICON - ICON_GAP - 24) / 3 * 0.9f));
    }

    TextPaint paint (float sp) {
      TextPaint p = new TextPaint(TextPaint.ANTI_ALIAS_FLAG);
      p.setTextSize(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, dm));
      p.setTypeface(Typeface.SANS_SERIF);
      return p;
    }

    float px (float dp) { return dp * dm.density; }

    // Layout.BREAK_STRATEGY_HIGH_QUALITY is LineBreaker's (API 29) same value, and Android 9 has only Layout's
    @SuppressLint("WrongConstant")
    float textDp (String s, TextPaint p, int w, int maxLines) {
      StaticLayout l = StaticLayout.Builder.obtain(s, 0, s.length(), p, w)
          .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(true)
          .setBreakStrategy(Layout.BREAK_STRATEGY_HIGH_QUALITY)
          .setMaxLines(maxLines).setEllipsize(TextUtils.TruncateAt.END).build();
      return l.getHeight() / dm.density;
    }

    float row (Object r) {
      List<?> bl = bars(r);
      float inner;
      if (bl.size() == 3) {
        float label = 0;
        for (Object b : bl) label = Math.max(label, textDp(str(Json.at(b, "label")), info, third, 1));
        inner = label + BAR;
      } else {
        inner = textDp(str(Json.at(r, "text")), text, width, ROW_LINES) + (bl.size() == 1 ? BAR : 0);
      }
      return ROW_PAD + Math.max(ICON, inner);
    }

    float footer (String s) {
      return FOOTER_TOP + textDp(s, info, width, FOOTER_LINES);
    }
  }

  private static int permille (Object bar) {
    double max = Json.num(Json.at(bar, "max"), 0), value = Json.num(Json.at(bar, "value"), 0);
    if (!(max > 0)) return 0;
    return (int) Math.round(Math.max(0, Math.min(1, value / max)) * 1000);
  }

  static int icon (String name) {
    switch (name) {
      case "warning": return R.drawable.ic_line_warning;
      case "today": return R.drawable.ic_line_today;
      case "task_alt": return R.drawable.ic_line_task_alt;
      case "schedule": return R.drawable.ic_line_schedule;
      case "whatshot": return R.drawable.ic_line_whatshot;
      case "redeem": return R.drawable.ic_line_redeem;
      case "favorite": return R.drawable.ic_line_favorite;
      case "egg": return R.drawable.ic_line_egg;
      case "local_fire_department": return R.drawable.ic_line_local_fire_department;
      case "add_circle": return R.drawable.ic_line_add_circle;
      case "savings": return R.drawable.ic_line_savings;
      case "bedtime": return R.drawable.ic_line_bedtime;
      case "mail": return R.drawable.ic_line_mail;
      default: return R.drawable.ic_line_bolt;
    }
  }
}
