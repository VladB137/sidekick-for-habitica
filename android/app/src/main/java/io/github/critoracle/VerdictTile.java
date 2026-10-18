package io.github.critoracle;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.drawable.Icon;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;
import io.github.critoracle.verdict.VerdictText;

/**
 * Quick Settings tile: shows the verdict from the last read; a tap is the player asking for one
 * fresh read (still at most one per few seconds, and never during a 429 wait). A tap that couldn't read says why
 * for a few seconds instead of showing the old line as if it were new.
 */
public class VerdictTile extends TileService {
  /** how long a tap's "why not" stays on the tile */
  private static final long HINT_MS = 10_000;
  private static volatile String hint;
  private static volatile long hintUntil;

  @Override
  public void onTileAdded () { Settings.setTileAdded(this, true); }

  @Override
  public void onTileRemoved () { Settings.setTileAdded(this, false); }

  @Override
  public void onStartListening () {
    Settings.setTileAdded(this, true); // a tile added before onTileAdded was recorded
    show();
  }

  @Override
  public void onClick () {
    if (!TokenStore.has(this)) { openApp(); return; }
    if (HabiticaReader.authFailed(this)) { openApp(); return; } // only the app can connect again
    Tile t = getQsTile();
    if (t != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) { t.setSubtitle("Reading…"); t.updateTile(); }
    new Thread(() -> {
      HabiticaReader.Outcome o = HabiticaReader.read(this, HabiticaReader.Kind.TAP);
      hint = o == HabiticaReader.Outcome.AUTH_FAILED && HabiticaReader.blocked(this) ? VerdictText.BLOCKED_TITLE : why(o);
      hintUntil = System.currentTimeMillis() + HINT_MS;
      Surfaces.refresh(this);
      show();
    }, "tile").start();
  }

  /** What a tap that read nothing says on the tile, or null after a read. */
  static String why (HabiticaReader.Outcome o) {
    switch (o) {
      case SKIPPED: return "Wait a few seconds";
      case RATE_LIMITED: return "Habitica asked to wait";
      case AUTH_FAILED: return "Log in again";
      case NO_LOGIN: return "Log in";
      case OFFLINE: return "Offline";
      case FAILED: return "Not answering";
      default: return null;
    }
  }

  /** The verdict; in Relaxed mode the notification's first two lines instead (it never speaks of crits). */
  private void show () {
    if (Settings.relaxed(this) && TokenStore.has(this)) {
      java.util.Map<String, Object> l = LastRead.lines(this);
      Tile t = getQsTile();
      if (t == null) return;
      t.setIcon(Icon.createWithResource(this, R.drawable.ic_stat_crit));
      t.setState(Tile.STATE_INACTIVE);
      String title = String.valueOf(l.get("title")), text = String.valueOf(l.get("text"));
      t.setLabel(title);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        String h = hint;
        t.setSubtitle(h != null && System.currentTimeMillis() < hintUntil ? h : "OFFLINE".equals(l.get("look")) ? "Offline" : "Your day");
      }
      t.setContentDescription(title + ". " + text);
      t.updateTile();
      return;
    }
    show(LastRead.line(this));
  }

  private void show (VerdictText.Line line) {
    Tile t = getQsTile();
    if (t == null) return;
    t.setIcon(Icon.createWithResource(this, R.drawable.ic_stat_crit));
    t.setState(line.look == VerdictText.Look.CRIT ? Tile.STATE_ACTIVE : Tile.STATE_INACTIVE);
    t.setLabel(line.title);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
      String h = hint;
      t.setSubtitle(h != null && System.currentTimeMillis() < hintUntil ? h : line.subtitle);
    }
    t.setContentDescription(line.text);
    t.updateTile();
  }

  /** On the lock screen Android asks to unlock first. */
  private void openApp () {
    if (isLocked()) unlockAndRun(this::launchApp);
    else launchApp();
  }

  // the Intent form only below Android 14, where it is the only one
  @SuppressWarnings("deprecation")
  @SuppressLint("StartActivityAndCollapseDeprecated")
  private void launchApp () {
    Intent i = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, i, PendingIntent.FLAG_IMMUTABLE));
    } else {
      startActivityAndCollapse(i);
    }
  }
}
