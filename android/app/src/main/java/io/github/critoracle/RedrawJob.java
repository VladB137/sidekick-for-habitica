package io.github.critoracle;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import io.github.critoracle.verdict.VerdictText;

/**
 * Re-draws the surfaces once a Live line has gone stale, so a widget or notification drawn outside the service
 * doesn't keep saying "CRIT" as if it were current. No Habitica call: the line just turns to "Checking".
 */
public class RedrawJob extends JobService {
  private static final int JOB_ID = 3;

  static void scheduleAt (Context c, long at) {
    long wait = at - System.currentTimeMillis();
    JobScheduler js = c.getSystemService(JobScheduler.class);
    if (js == null || wait <= 0) return;
    Jobs.schedule(js, new JobInfo.Builder(JOB_ID, new ComponentName(c, RedrawJob.class)).setMinimumLatency(wait).setOverrideDeadline(wait + 60_000).build());
  }

  /** after drawing `look` from a read at `readAt` */
  static void afterDraw (Context c, VerdictText.Look look, long readAt) {
    if ((look == VerdictText.Look.LIVE || look == VerdictText.Look.CRIT) && readAt > 0) scheduleAt(c, readAt + VerdictText.FRESH_MS + 1_000);
  }

  @Override
  public boolean onStartJob (JobParameters params) {
    Surfaces.refresh(this);
    return false;
  }

  @Override
  public boolean onStopJob (JobParameters params) { return false; }
}
