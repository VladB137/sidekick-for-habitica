package io.github.critoracle;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import io.github.critoracle.verdict.Json;
import io.github.critoracle.verdict.NightSwap;
import io.github.critoracle.verdict.RepeatPlan;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;

/**
 * Repeating To-Dos: one job shows the reminders when a To-Do is back (a one-off JobScheduler job at the next
 * reminder's time, like NightGearJob: no exact-alarm permission, kept across restarts, Android may run it a few
 * minutes late); the other makes the "Add to To-Dos" requests the player tapped for, one at a time, when there is a
 * network. That request is the only thing this adds to Habitica, and only after the tap.
 */
public class RepeatJob extends JobService {
  private static final int REMIND_ID = 4100;
  private static final int ADD_ID = 4101;
  private static final String PREFS = "critoracle-repeat-adds";

  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

  static void scheduleRemind (Context c, long at) {
    JobScheduler js = c.getSystemService(JobScheduler.class);
    if (js == null) return;
    if (at < 0) { js.cancel(REMIND_ID); return; }
    Jobs.schedule(js, new JobInfo.Builder(REMIND_ID, new ComponentName(c, RepeatJob.class))
        .setMinimumLatency(Math.max(0, at - System.currentTimeMillis()))
        .setPersisted(true)
        .build());
  }

  /** The items whose add the player tapped and that haven't gone through yet. */
  static synchronized Set<String> adding (Context c) { return new LinkedHashSet<>(prefs(c).getStringSet("ids", new LinkedHashSet<>())); }

  /**
   * Queue an add; false when this item's add is already waiting (a second tap adds nothing). The job is scheduled
   * either way and kept across restarts: a queued id whose job was lost would otherwise block its Add for good.
   */
  static synchronized boolean queueAdd (Context c, String id) {
    Set<String> ids = adding(c);
    boolean fresh = ids.add(id);
    if (fresh) prefs(c).edit().putStringSet("ids", ids).commit();
    scheduleAdds(c);
    return fresh;
  }

  /** The add job, when a tapped add is waiting (also after a restart, from BootReceiver). */
  static synchronized void scheduleAdds (Context c) {
    if (adding(c).isEmpty()) return;
    JobScheduler js = c.getSystemService(JobScheduler.class);
    if (js == null || js.getPendingJob(ADD_ID) != null) return;
    Jobs.schedule(js, new JobInfo.Builder(ADD_ID, new ComponentName(c, RepeatJob.class))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        .setPersisted(true)
        .build());
  }

  private static synchronized void done (Context c, String id) {
    Set<String> ids = adding(c);
    ids.remove(id);
    prefs(c).edit().putStringSet("ids", ids).commit();
  }

  static synchronized void cancelAll (Context c) {
    JobScheduler js = c.getSystemService(JobScheduler.class);
    if (js != null) { js.cancel(REMIND_ID); js.cancel(ADD_ID); }
    prefs(c).edit().clear().commit();
  }

  @Override
  public boolean onStartJob (JobParameters params) {
    if (!TokenStore.has(this)) { cancelAll(this); return false; }
    boolean add = params.getJobId() == ADD_ID;
    new Thread(() -> {
      if (add) runAdds();
      else { RepeatReminders.lookUpIfDue(this); RepeatReminders.update(this); }
      jobFinished(params, false);
    }, add ? "repeat-add" : "repeat-remind").start();
    return true;
  }

  private void runAdds () {
    for (String id : adding(this)) {
      Map<String, Object> it = RepeatReminders.load(this).find(id);
      // gone from the list, or added meanwhile from the app: nothing to do
      if (it == null || RepeatPlan.remindDay(it) == null) { done(this, id); RepeatReminders.markAdding(this, id, false); continue; }
      NightSwap.Response r = HabiticaReader.tapCall(this, "POST", "/api/v3/tasks/user", RepeatReminders.body(it));
      done(this, id);
      Object taskId = r.kind == NightSwap.Kind.OK ? Json.at(r.data, "_id") : null;
      if (taskId instanceof String) { RepeatReminders.added(this, id, (String) taskId); continue; }
      switch (r.kind) {
        case WAIT: RepeatReminders.failed(this, id, "Habitica asked to wait a moment. Tap Add again in a minute."); break;
        case AUTH: RepeatReminders.failed(this, id, HabiticaReader.blocked(this) ? "Habitica refused Sidekick’s calls. Open the app for Habitica’s message." : "Habitica no longer accepts your login. Open Sidekick and connect again."); break;
        case OFFLINE: RepeatReminders.failed(this, id, "Couldn’t reach Habitica. Tap Add to try again."); break;
        default: RepeatReminders.failed(this, id, "Habitica didn’t accept it. Open Sidekick to add it from there.");
      }
    }
  }

  @Override
  public boolean onStopJob (JobParameters params) { return params.getJobId() == ADD_ID && !adding(this).isEmpty(); }
}
