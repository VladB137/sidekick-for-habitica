package io.github.critoracle;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import io.github.critoracle.verdict.NightSwap;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * "Night gear" (Settings, off by default): one step of NightSwap per run, then the job schedules itself for the
 * time the step asked for. A one-off JobScheduler job rather than an exact alarm: no extra permission, it survives
 * restarts (persisted), and Android may run it a little after the set time (Doze), which the swap doesn't mind.
 * Each run makes at most one Habitica call, spaced like every other automatic call (HabiticaReader).
 * A step still running when the player logs out writes nothing afterwards (Session).
 */
public class NightGearJob extends JobService {
  private static final int JOB_ID = 2;
  private static final String PREFS = "critoracle-night";

  static NightSwap swap (Context c) { return swap(c, Session.generation()); }

  /** The swap whose writes are dropped once a logout came after `gen`. */
  static NightSwap swap (Context c, int gen) {
    SharedPreferences p = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    NightSwap.Store store = new NightSwap.Store() {
      @Override public String get (String key) { return p.getString(key, null); }
      @Override public void put (String key, String value) { Session.ifCurrent(gen, () -> p.edit().putString(key, value).commit()); }
    };
    return new NightSwap(store, (method, path) -> HabiticaReader.nightCall(c, method, path), ZoneId.systemDefault());
  }

  /** For the notification's night gear line (lines.ts NightInfo). */
  static Map<String, Object> info (Context c) {
    NightSwap n = swap(c);
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("on", n.on());
    m.put("mode", n.mode());
    m.put("swapAt", (double) n.swapAt());
    m.put("backOn", n.backOn());
    m.put("backAt", (double) n.backAt());
    m.put("phase", n.phase());
    return m;
  }

  /** Runs at `at` (epoch ms), or never when 0. */
  static void schedule (Context c, long at) {
    JobScheduler js = c.getSystemService(JobScheduler.class);
    if (js == null) return;
    if (at <= 0) { js.cancel(JOB_ID); return; }
    Jobs.schedule(js, new JobInfo.Builder(JOB_ID, new ComponentName(c, NightGearJob.class))
        .setMinimumLatency(Math.max(0, at - System.currentTimeMillis()))
        .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
        .setPersisted(true)
        .build());
  }

  /** After a change in Settings: the next step's time. */
  static void reschedule (Context c) {
    NightSwap n = swap(c);
    // a run now only works out the next time (no call before the set hour); a swap-back still due carries on when off
    schedule(c, n.on() || !n.phase().equals("idle") ? System.currentTimeMillis() : 0);
  }

  /** Logout (after Session.loggedOut, so a step still running can't write or reschedule afterwards). */
  static void clear (Context c) {
    schedule(c, 0);
    c.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().commit();
  }

  @Override
  public boolean onStartJob (JobParameters params) {
    if (!TokenStore.has(this)) { schedule(this, 0); return false; }
    final int gen = Session.generation();
    new Thread(() -> {
      long next;
      synchronized (NightGearJob.class) { next = swap(this, gen).step(System.currentTimeMillis(), MainActivity.inForeground); }
      final long at = next;
      Session.ifCurrent(gen, () -> schedule(this, at));
      Surfaces.refresh(this);
      jobFinished(params, false);
    }, "night-gear").start();
    return true;
  }

  @Override
  public boolean onStopJob (JobParameters params) { return false; } // the run schedules the next one itself
}
