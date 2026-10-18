package io.github.critoracle;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Bundle;
import android.util.Base64;
import android.view.View;
import android.widget.RemoteViews;
import io.github.critoracle.verdict.StableLight;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Home-screen widget: a still picture of the Stable's open playground; a tap opens the app on the Stable.
 * Widgets can't run the playground's canvas, so the app paints four pictures, one per light of the day
 * (src/app/stable/still.ts), and this shows the one for the phone's hour, swapping at the next light with an
 * alarm that doesn't wake the phone. Kept only with "Remember on this device" and wiped at logout, like the
 * last read. Never calls Habitica.
 */
public class StableWidget extends AppWidgetProvider {
  static final String[] LIGHTS = { "dawn", "day", "dusk", "night" };
  /** the alarm at the next light */
  private static final String ACTION_LIGHT = "io.github.critoracle.STABLE_LIGHT";
  private static final String PREFS = "critoracle-stablewidget";
  /** a picture is at most this big (the app sends 540 x 270) */
  private static final int MAX_SIDE = 2048;
  /** bytes of one widget's bitmap after scaling, well under what RemoteViews accepts */
  private static final long MAX_BYTES = 6L << 20;

  @Override
  public void onUpdate (Context c, AppWidgetManager m, int[] ids) {
    for (int id : ids) update(c, m, id);
    schedule(c);
  }

  @Override
  public void onAppWidgetOptionsChanged (Context c, AppWidgetManager m, int id, Bundle options) {
    update(c, m, id);
  }

  /** Android refuses a widget bitmap over 1.5 screens of memory (AppWidgetService): never a crash, then the plain picture. */
  private static void update (Context c, AppWidgetManager m, int id) {
    try {
      m.updateAppWidget(id, views(c, m, id));
    } catch (IllegalArgumentException e) {
      try { m.updateAppWidget(id, plain(c)); } catch (RuntimeException e2) { /* nothing more to show */ }
    }
  }

  /** The first one was placed: the app, if it's running, paints the pictures now. */
  @Override
  public void onEnabled (Context c) {
    SidekickPlugin.stableWidgetPlaced();
    schedule(c);
  }

  @Override
  public void onDisabled (Context c) {
    AlarmManager am = c.getSystemService(AlarmManager.class);
    if (am != null) am.cancel(alarm(c));
  }

  @Override
  public void onReceive (Context c, Intent intent) {
    String a = intent.getAction();
    if (ACTION_LIGHT.equals(a) || Intent.ACTION_TIME_CHANGED.equals(a) || Intent.ACTION_TIMEZONE_CHANGED.equals(a)) refresh(c);
    else super.onReceive(c, intent);
  }

  static int[] ids (Context c) {
    int[] ids = AppWidgetManager.getInstance(c).getAppWidgetIds(new ComponentName(c, StableWidget.class));
    return ids == null ? new int[0] : ids;
  }

  /** Redraws every Stable widget with the picture for this hour, and sets the alarm for the next light. */
  static void refresh (Context c) {
    int[] ids = ids(c);
    if (ids.length == 0) return;
    AppWidgetManager m = AppWidgetManager.getInstance(c);
    for (int id : ids) update(c, m, id);
    schedule(c);
  }

  /** The key of the pictures the phone has (what they show, from the app), or null. */
  static String key (Context c) { return prefs(c).getString("key", null); }

  /**
   * Keeps the app's four pictures (PNG data URLs or bare base64), then redraws. False when one isn't a picture,
   * or the login isn't remembered.
   */
  static synchronized boolean save (Context c, String key, String[] pngs) {
    if (!TokenStore.has(c) || key == null || pngs.length != LIGHTS.length) return false;
    byte[][] bytes = new byte[LIGHTS.length][];
    for (int i = 0; i < LIGHTS.length; i++) {
      if (pngs[i] == null) return false;
      String s = pngs[i];
      int comma = s.startsWith("data:") ? s.indexOf(',') : -1;
      try {
        bytes[i] = Base64.decode(comma >= 0 ? s.substring(comma + 1) : s, Base64.DEFAULT);
      } catch (IllegalArgumentException e) {
        return false;
      }
      BitmapFactory.Options o = new BitmapFactory.Options();
      o.inJustDecodeBounds = true;
      BitmapFactory.decodeByteArray(bytes[i], 0, bytes[i].length, o);
      if (o.outWidth <= 0 || o.outHeight <= 0 || o.outWidth > MAX_SIDE || o.outHeight > MAX_SIDE) return false;
    }
    File dir = dir(c);
    if (!dir.isDirectory() && !dir.mkdirs()) return false;
    for (int i = 0; i < LIGHTS.length; i++) {
      // written next to the old one, then swapped in, so a widget never reads half a file
      File tmp = new File(dir, LIGHTS[i] + ".tmp"), to = new File(dir, LIGHTS[i] + ".png");
      try (FileOutputStream out = new FileOutputStream(tmp)) {
        out.write(bytes[i]);
      } catch (IOException e) {
        tmp.delete();
        return false;
      }
      if (!tmp.renameTo(to)) { tmp.delete(); return false; }
    }
    prefs(c).edit().putString("key", key).apply();
    refresh(c);
    return true;
  }

  /** Logout: the pictures go, and the widgets say how to get them back. */
  static synchronized void clear (Context c) {
    File[] fs = dir(c).listFiles();
    if (fs != null) for (File f : fs) f.delete();
    prefs(c).edit().clear().apply();
    refresh(c);
  }

  private static RemoteViews views (Context c, AppWidgetManager m, int id) { return views(c, TokenStore.has(c) ? picture(c, m, id) : null); }

  /** Without the picture (the words the widget shows before one is painted). */
  private static RemoteViews plain (Context c) { return views(c, null); }

  private static RemoteViews views (Context c, Bitmap pic) {
    RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_stable);
    if (pic != null) {
      v.setImageViewBitmap(R.id.stable_picture, pic);
      v.setViewVisibility(R.id.stable_picture, View.VISIBLE);
      v.setViewVisibility(R.id.stable_empty, View.GONE);
    } else {
      v.setViewVisibility(R.id.stable_picture, View.GONE);
      v.setViewVisibility(R.id.stable_empty, View.VISIBLE);
      v.setTextViewText(R.id.stable_empty, c.getString(TokenStore.has(c) ? R.string.stable_widget_empty : R.string.widget_empty));
    }
    v.setOnClickPendingIntent(android.R.id.background, Surfaces.openApp(c, "stable"));
    return v;
  }

  /**
   * This hour's picture, enlarged by a whole number with no smoothing (pixel art stays sharp) until it covers
   * the widget; the view crops what's left over to the widget's shape.
   */
  private static Bitmap picture (Context c, AppWidgetManager m, int id) {
    File f = new File(dir(c), StableLight.at(LocalDateTime.now().getHour()) + ".png");
    Bitmap src = f.isFile() ? BitmapFactory.decodeFile(f.getPath()) : null;
    if (src == null) return null;
    Bundle o = m.getAppWidgetOptions(id);
    float dp = c.getResources().getDisplayMetrics().density;
    // portrait uses the min width and max height, landscape the other two: cover both
    int w = Math.round(dp * Math.max(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH)));
    int h = Math.round(dp * Math.max(o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT), o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)));
    int k = Math.max(1, (int) Math.ceil(Math.max((double) w / src.getWidth(), (double) h / src.getHeight())));
    // and under Android's own limit for one widget update, 1.5 screens of 4-byte pixels (AppWidgetService), with room to spare
    int[] scr = StableWallpaper.screen(c);
    long cap = Math.min(MAX_BYTES, (long) (0.8 * 1.5 * scr[0] * scr[1] * 4));
    while (k > 1 && (long) src.getWidth() * src.getHeight() * 4 * k * k > cap) k--;
    if (k == 1) return src;
    Bitmap big = Bitmap.createScaledBitmap(src, src.getWidth() * k, src.getHeight() * k, false);
    if (big != src) src.recycle();
    return big;
  }

  /** The next light's picture, when the phone is next awake (an inexact alarm that doesn't wake it). */
  private static void schedule (Context c) {
    AlarmManager am = c.getSystemService(AlarmManager.class);
    if (am == null || ids(c).length == 0) return;
    long at = StableLight.next(LocalDateTime.now()).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    am.set(AlarmManager.RTC, at, alarm(c));
  }

  private static PendingIntent alarm (Context c) {
    Intent i = new Intent(c, StableWidget.class).setAction(ACTION_LIGHT);
    return PendingIntent.getBroadcast(c, 0, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  private static File dir (Context c) { return new File(c.getFilesDir(), "stable-widget"); }
  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
