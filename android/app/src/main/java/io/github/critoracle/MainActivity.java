package io.github.critoracle;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
  /** A tab to open on ("tasks"), from the notification's Tasks button. */
  static final String EXTRA_ROUTE = "io.github.critoracle.ROUTE";
  /** How long the page has to say it's ready (src/app/main.ts, the first screen drawn) before the screen below takes over. */
  static final long READY_WAIT_MS = 12_000;

  /** While the app is on screen it reads Habitica itself, so native automatic reads stand aside. */
  static volatile boolean inForeground;

  private final Handler main = new Handler(Looper.getMainLooper());
  private boolean ready;
  /** the native "didn't start" screen while it shows */
  private View stuck;
  private final Runnable watch = () -> {
    // Capacitor's own check already sent a too-old WebView to webview-update.html, which says the same
    String url = getBridge() == null ? null : getBridge().getWebView().getUrl();
    if (!ready && (url == null || !url.contains("webview-update.html"))) showStuck();
  };

  @Override
  public void onCreate (Bundle savedInstanceState) {
    registerPlugin(SidekickPlugin.class);
    super.onCreate(savedInstanceState);
    main.postDelayed(watch, READY_WAIT_MS);
  }

  @Override
  public void onResume () {
    super.onResume();
    inForeground = true;
  }

  @Override
  public void onPause () {
    inForeground = false;
    super.onPause();
  }

  @Override
  public void onDestroy () {
    main.removeCallbacks(watch);
    super.onDestroy();
  }

  /** The page drew its first screen (SidekickPlugin.ready): no need for the native screen, and away with it if it came up. */
  void pageReady () {
    runOnUiThread(() -> {
      ready = true;
      main.removeCallbacks(watch);
      if (stuck != null) { ((ViewGroup) stuck.getParent()).removeView(stuck); stuck = null; }
    });
  }

  /**
   * The page never said it was ready: a WebView too old for the app (or broken) leaves a blank screen. Instead, which WebView
   * this phone has and how to update it, with or without Google Play, and a way to try again.
   */
  private void showStuck () {
    if (stuck != null || isFinishing()) return;
    PackageInfo wv = WebView.getCurrentWebViewPackage();
    String pkg = wv == null ? "com.google.android.webview" : wv.packageName;
    String name = pkg;
    try { name = getPackageManager().getApplicationLabel(getPackageManager().getApplicationInfo(pkg, 0)).toString(); } catch (Exception e) { /* the package name, then */ }
    String version = wv == null ? "?" : wv.versionName;

    LinearLayout col = new LinearLayout(this);
    col.setOrientation(LinearLayout.VERTICAL);
    int pad = dp(24);
    col.setPadding(pad, pad, pad, pad);
    col.addView(text(getString(R.string.stuck_title), 22, true));
    col.addView(text(getString(R.string.stuck_body, name, version), 16, false));
    col.addView(text(getString(R.string.stuck_play), 16, false));
    col.addView(text(getString(R.string.stuck_no_play), 16, false));

    LinearLayout buttons = new LinearLayout(this);
    buttons.setGravity(Gravity.END);
    buttons.setPadding(0, dp(16), 0, 0);
    buttons.addView(button(getString(R.string.stuck_retry), Color.TRANSPARENT, 0xFF00796B, v -> {
      ready = false;
      ((ViewGroup) stuck.getParent()).removeView(stuck);
      stuck = null;
      getBridge().getWebView().reload();
      main.postDelayed(watch, READY_WAIT_MS);
    }));
    buttons.addView(button(getString(R.string.stuck_update), 0xFF00796B, Color.WHITE, v -> openStore(pkg)));
    col.addView(buttons);

    ScrollView scroll = new ScrollView(this);
    scroll.setFitsSystemWindows(true);
    scroll.setBackgroundColor(0xFFFAFAFA);
    scroll.setClickable(true); // nothing reaches the blank page underneath
    scroll.addView(col);
    stuck = scroll;
    addContentView(scroll, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
  }

  /** The WebView's page in the phone's app store (Google Play, AppGallery, Aurora…), else its page in Android's settings. */
  private void openStore (String pkg) {
    for (Intent i : new Intent[] {
        new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + pkg)),
        new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + pkg)) }) {
      try { startActivity(i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); return; } catch (ActivityNotFoundException e) { /* the next way */ }
    }
  }

  private TextView text (String s, int sp, boolean title) {
    TextView t = new TextView(this);
    t.setText(s);
    t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
    t.setTextColor(title ? 0xFF212121 : 0xDE000000);
    if (title) t.setTypeface(android.graphics.Typeface.create("sans-serif-medium", android.graphics.Typeface.NORMAL));
    t.setPadding(0, 0, 0, dp(title ? 16 : 12));
    t.setLineSpacing(0, 1.15f);
    return t;
  }

  private Button button (String label, int bg, int fg, View.OnClickListener on) {
    Button b = new Button(this);
    b.setText(label);
    b.setTextColor(fg);
    b.setBackgroundColor(bg);
    b.setPadding(dp(16), 0, dp(16), 0);
    b.setOnClickListener(on);
    LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(40));
    lp.setMarginStart(dp(8));
    b.setLayoutParams(lp);
    return b;
  }

  private int dp (int v) { return Math.round(v * getResources().getDisplayMetrics().density); }
}
