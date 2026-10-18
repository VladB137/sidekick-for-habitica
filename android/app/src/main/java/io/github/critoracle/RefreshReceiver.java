package io.github.critoracle;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The notification's Refresh button: the player asking for one read, like a tap on the tile (5 s apart at most), made by RefreshJob. */
public class RefreshReceiver extends BroadcastReceiver {
  static PendingIntent intent (Context c) {
    return PendingIntent.getBroadcast(c, 2, new Intent(c, RefreshReceiver.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  @Override
  public void onReceive (Context c, Intent i) { RefreshJob.tap(c); }
}
