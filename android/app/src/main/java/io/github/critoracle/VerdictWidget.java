package io.github.critoracle;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.widget.RemoteViews;

/** Home-screen widget: the verdict line from the last read, or the notification's first two lines when the player chose so; a tap opens the app. Never calls Habitica itself. */
public class VerdictWidget extends AppWidgetProvider {
  @Override
  public void onUpdate (Context c, AppWidgetManager m, int[] ids) { Surfaces.refresh(c); }

  /** `look`: VerdictText.Look or lines.ts Look, by name (the same names). */
  static void updateAll (Context c, AppWidgetManager m, String title, String text, String look) {
    int[] ids = m.getAppWidgetIds(new ComponentName(c, VerdictWidget.class));
    if (ids == null || ids.length == 0) return;
    RemoteViews v = views(c, title, text, look);
    for (int id : ids) m.updateAppWidget(id, v);
  }

  private static RemoteViews views (Context c, String title, String text, String look) {
    boolean crit = "CRIT".equals(look);
    RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_verdict);
    v.setTextViewText(R.id.widget_title, title);
    v.setTextViewText(R.id.widget_text, text);
    v.setInt(android.R.id.background, "setBackgroundColor", Surfaces.color(look));
    v.setTextColor(R.id.widget_title, crit ? 0xDE000000 : 0xFFFFFFFF);
    v.setTextColor(R.id.widget_text, crit ? 0x8A000000 : 0xB3FFFFFF);
    v.setOnClickPendingIntent(android.R.id.background, Surfaces.openApp(c));
    return v;
  }
}
