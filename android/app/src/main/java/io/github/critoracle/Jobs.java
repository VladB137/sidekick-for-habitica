package io.github.critoracle;

import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.util.Log;

/** JobScheduler.schedule, which throws when Android refuses a job (too many jobs, a missing permission): never a crash. */
final class Jobs {
  private Jobs () {}

  static boolean schedule (JobScheduler js, JobInfo job) {
    try {
      return js.schedule(job) == JobScheduler.RESULT_SUCCESS;
    } catch (RuntimeException e) {
      Log.w("Sidekick", "job " + job.getId() + " not scheduled: " + e.getClass().getSimpleName());
      return false;
    }
  }
}
