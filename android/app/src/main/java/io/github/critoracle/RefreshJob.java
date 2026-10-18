package io.github.critoracle;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.os.PersistableBundle;

/**
 * "Refresh every 15 minutes": one automatic GET /user per period (Android's minimum), only with a
 * network, never while the app itself is on screen (it reads on its own), always inside the 30 s spacing.
 * JobScheduler rather than WorkManager: part of the platform, no extra library.
 *
 * Also the notification's Refresh button (RefreshReceiver), as a one-off job: a read may wait 20 s to connect and
 * 20 s more for the answer, longer than a broadcast receiver may run (about 10 s).
 */
public class RefreshJob extends JobService {
  private static final int JOB_ID = 1;
  private static final int TAP_JOB_ID = 5;
  static final long PERIOD_MS = 15 * 60_000L;
  /** a Refresh tap still waiting for a network after this long is read like an automatic one (30 s spacing) */
  private static final long TAP_LATE_MS = 60_000;

  static void schedule (Context c) {
    JobScheduler js = c.getSystemService(JobScheduler.class);
    if (js == null) return;
    Jobs.schedule(js, new JobInfo.Builder(JOB_ID, new ComponentName(c, RefreshJob.class))
        .setPeriodic(PERIOD_MS)
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        .setPersisted(true)
        .build());
  }

  /** The Refresh button was tapped: one read as soon as there is a network. */
  static void tap (Context c) {
    JobScheduler js = c.getSystemService(JobScheduler.class);
    if (js == null) return;
    PersistableBundle x = new PersistableBundle();
    x.putLong("at", System.currentTimeMillis());
    Jobs.schedule(js, new JobInfo.Builder(TAP_JOB_ID, new ComponentName(c, RefreshJob.class))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        .setExtras(x)
        .build());
  }

  static void cancel (Context c) {
    JobScheduler js = c.getSystemService(JobScheduler.class);
    if (js != null) js.cancel(JOB_ID);
  }

  @Override
  public boolean onStartJob (JobParameters params) {
    if (params.getJobId() == TAP_JOB_ID) {
      boolean late = System.currentTimeMillis() - params.getExtras().getLong("at", 0) > TAP_LATE_MS;
      new Thread(() -> {
        if (TokenStore.has(this)) HabiticaReader.read(this, late ? HabiticaReader.Kind.AUTOMATIC : HabiticaReader.Kind.TAP);
        Surfaces.refresh(this);
        jobFinished(params, false);
      }, "refresh-button").start();
      return true;
    }
    if (!Settings.backgroundRefresh(this) || !TokenStore.has(this)) { cancel(this); return false; }
    // the login was refused: nothing can be read until the app reads again (it schedules this job again then)
    if (HabiticaReader.authFailed(this)) { cancel(this); Surfaces.refresh(this); return false; }
    // nothing on the phone would show the read (no notification, widget, tile or repeating To-Do): skip this period
    if (!Surfaces.anyOn(this)) return false;
    new Thread(() -> {
      if (!MainActivity.inForeground) HabiticaReader.read(this, HabiticaReader.Kind.AUTOMATIC);
      Surfaces.refresh(this);
      jobFinished(params, false);
    }, "refresh").start();
    return true;
  }

  @Override
  public boolean onStopJob (JobParameters params) { return false; }
}
