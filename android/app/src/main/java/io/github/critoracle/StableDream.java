package io.github.critoracle;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Typeface;
import android.os.Build;
import android.provider.Settings;
import android.service.dreams.DreamService;
import android.text.TextPaint;
import android.text.format.DateFormat;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import io.github.critoracle.verdict.ScreenSaver;
import java.util.Locale;

/**
 * The Stable as Android's screen saver (Settings → Display → Screen saver): the open playground moving, with a
 * clock, while the phone charges or sits in a dock. It shows exactly what the live wallpaper shows (the same
 * scenery from the app, the same herd and weather, {@link StableStage}), whether or not the Stable is also the
 * wallpaper. Android starts it only when the player chose it and the phone is charging or docked; it ends itself
 * when the charger comes out, and a touch ends it as with any screen saver. It never calls Habitica.
 */
public class StableDream extends DreamService {
  private static final String PREFS = "critoracle-stabledream";
  private StableStage stage;
  private Clock clock;
  /** the minute (the clock), the time or zone set by hand, the charger out */
  private final BroadcastReceiver phone = new BroadcastReceiver() {
    @Override public void onReceive (Context c, Intent i) {
      if (Intent.ACTION_POWER_DISCONNECTED.equals(i.getAction())) { finish(); return; }
      if (stage != null) stage.refresh();
    }
  };
  private boolean listening;

  /**
   * Whether Android's settings name the Stable as the screen saver. Phones that won't let an app read that setting
   * count it as chosen once it has run, so the app keeps sending its scenery.
   */
  static boolean chosen (Context c) {
    try {
      return ScreenSaver.chosen(Settings.Secure.getString(c.getContentResolver(), "screensaver_enabled"),
          Settings.Secure.getString(c.getContentResolver(), "screensaver_components"), c.getPackageName(), StableDream.class.getName());
    } catch (RuntimeException e) {
      return prefs(c).getBoolean("ran", false);
    }
  }

  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

  @Override
  public void onAttachedToWindow () {
    super.onAttachedToWindow();
    setInteractive(false);
    setFullscreen(true);
    setScreenBright(true);
    prefs(this).edit().putBoolean("ran", true).apply();
    clock = new Clock(this);
    SurfaceView view = new SurfaceView(this);
    stage = new StableStage(this, view.getHolder(), clock);
    view.getHolder().addCallback(new SurfaceHolder.Callback() {
      @Override public void surfaceCreated (SurfaceHolder h) { }
      @Override public void surfaceChanged (SurfaceHolder h, int format, int w, int ht) { stage.surfaceChanged(w, ht); }
      @Override public void surfaceDestroyed (SurfaceHolder h) { stage.surfaceDestroyed(); }
    });
    setContentView(view);
    stage.create();
  }

  @Override
  public void onDreamingStarted () {
    super.onDreamingStarted();
    IntentFilter f = new IntentFilter(Intent.ACTION_TIME_TICK);
    f.addAction(Intent.ACTION_TIME_CHANGED);
    f.addAction(Intent.ACTION_TIMEZONE_CHANGED);
    f.addAction(Intent.ACTION_POWER_DISCONNECTED);
    // system broadcasts only; RECEIVER_NOT_EXPORTED is required from Android 14 and still gets them
    registerReceiver(phone, f, null, StableStage.MAIN, Build.VERSION.SDK_INT >= 33 ? Context.RECEIVER_NOT_EXPORTED : 0);
    listening = true;
    stage.visible(true);
  }

  @Override
  public void onDreamingStopped () {
    stopListening();
    stage.visible(false);
    super.onDreamingStopped();
  }

  @Override
  public void onDetachedFromWindow () {
    stopListening();
    if (stage != null) { stage.destroy(); stage = null; }
    super.onDetachedFromWindow();
  }

  private void stopListening () {
    if (!listening) return;
    listening = false;
    try { unregisterReceiver(phone); } catch (IllegalArgumentException ignored) { /* not registered */ }
  }

  /**
   * The time, large, in the sky over the meadow, with the day under it; as the phone tells the time (12 or 24 hours,
   * its language). Dimmer at night, and a few pixels somewhere else each minute ({@link ScreenSaver#drift}).
   */
  private static final class Clock implements StableStage.Overlay {
    private final Context ctx;
    private final TextPaint time = new TextPaint(Paint.ANTI_ALIAS_FLAG), day = new TextPaint(Paint.ANTI_ALIAS_FLAG);

    Clock (Context ctx) {
      this.ctx = ctx;
      time.setTypeface(Typeface.create("sans-serif-light", Typeface.NORMAL));
      time.setTextAlign(Paint.Align.CENTER);
      day.setTypeface(Typeface.create("sans-serif", Typeface.NORMAL));
      day.setTextAlign(Paint.Align.CENTER);
    }

    private static long minute () { return Math.floorDiv(System.currentTimeMillis() + java.util.TimeZone.getDefault().getOffset(System.currentTimeMillis()), 60_000L); }

    @Override
    public int key () { return (int) minute() * 2 + (DateFormat.is24HourFormat(ctx) ? 1 : 0); }

    @Override
    public void draw (Canvas c, int w, int h, boolean night) {
      long now = System.currentTimeMillis();
      CharSequence t = DateFormat.format(ScreenSaver.pattern(DateFormat.is24HourFormat(ctx)), now);
      CharSequence d = DateFormat.format(DateFormat.getBestDateTimePattern(Locale.getDefault(), "EEEEdMMMM"), now);
      float side = Math.min(w, h), dp = ctx.getResources().getDisplayMetrics().density;
      int[] drift = ScreenSaver.drift(minute());
      float x = w / 2f + drift[0] * dp, y = h * (h > w ? 0.17f : 0.24f) + drift[1] * dp;
      int alpha = night ? 0xB0 : 0xFF;
      time.setTextSize(side * 0.22f);
      time.setColor((alpha << 24) | 0xFFFFFF);
      time.setShadowLayer(side * 0.012f, 0, side * 0.004f, 0x66000000);
      day.setTextSize(side * 0.045f);
      day.setColor((alpha << 24) | 0xFFFFFF);
      day.setShadowLayer(side * 0.008f, 0, side * 0.003f, 0x66000000);
      c.drawText(t, 0, t.length(), x, y, time);
      c.drawText(d, 0, d.length(), x, y + day.getTextSize() * 1.6f, day);
    }
  }
}
