package io.github.critoracle;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * After a restart or an app update the notification comes back by itself if it was on (a started service doesn't
 * survive either). The refresh and night-gear jobs are persisted by JobScheduler; a tapped repeating To-Do add queued
 * before this update (when its job wasn't persisted yet) is scheduled again. The Stable widget's alarm for the next
 * light of the day doesn't survive either, so it is drawn again and sets it anew.
 */
public class BootReceiver extends BroadcastReceiver {
  @Override
  public void onReceive (Context c, Intent intent) {
    String a = intent.getAction();
    if (!Intent.ACTION_BOOT_COMPLETED.equals(a) && !Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) return;
    StableWidget.refresh(c);
    if (!TokenStore.has(c)) return;
    RepeatJob.scheduleAdds(c);
    if (!Settings.notification(c) || Settings.notificationDismissed(c)) return;
    try {
      VerdictService.start(c);
    } catch (RuntimeException e) {
      // the system refused a foreground start from here; the app starts it again when it is next opened
    }
  }
}
