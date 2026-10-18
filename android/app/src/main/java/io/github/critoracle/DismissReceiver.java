package io.github.critoracle;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * The player swiped the verdict notification away (Android 14+ allows it even for an ongoing one): it isn't posted
 * again, and the service that keeps it stops, until the app is next opened or the notification is switched on again.
 */
public class DismissReceiver extends BroadcastReceiver {
  static PendingIntent intent (Context c) {
    return PendingIntent.getBroadcast(c, 3, new Intent(c, DismissReceiver.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  @Override
  public void onReceive (Context c, Intent i) {
    Settings.setNotificationDismissed(c, true);
    VerdictService.stop(c);
  }
}
