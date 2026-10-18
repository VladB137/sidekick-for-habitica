package io.github.critoracle;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** The two buttons on a repeating To-Do's reminder. "Add to To-Dos" is the player's tap that adds it to Habitica. */
public class RepeatReceiver extends BroadcastReceiver {
  @Override
  public void onReceive (Context c, Intent intent) {
    String id = intent.getStringExtra(RepeatReminders.EXTRA_ID);
    if (id == null || !TokenStore.has(c)) return;
    PendingResult pr = goAsync();
    new Thread(() -> {
      try {
        if (RepeatReminders.ACTION_ADD.equals(intent.getAction())) RepeatReminders.requestAdd(c, id);
        else if (RepeatReminders.ACTION_TOMORROW.equals(intent.getAction())) RepeatReminders.tomorrow(c, id);
      } finally {
        pr.finish();
      }
    }, "repeat-button").start();
  }
}
