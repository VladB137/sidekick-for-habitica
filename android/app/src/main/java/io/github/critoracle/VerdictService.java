package io.github.critoracle;

import android.app.Service;
import android.app.usage.UsageEvents;
import android.app.usage.UsageStatsManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Keeps the verdict notification on screen and, with usage access, reads Habitica once each time
 * the Habitica app leaves the foreground (the player probably just scored something there).
 * Reads are automatic calls, so they wait for the 30 s spacing; several closes in a row make one read. Lines that
 * need the Dailies or the party get them in the following turns, each call again 30 s after the last.
 *
 * Nothing runs on a short timer: the surfaces are redrawn by whoever read (HabiticaReader's callers, the app's
 * reports) and by RedrawJob when a Live line goes stale; here only a once-a-minute redraw for the countdown and
 * "read … ago" while the screen is on, and with usage access a look at usage events every few seconds while the
 * screen is on. With the login refused (401) or notifications blocked it stops doing anything.
 */
public class VerdictService extends Service {
  static final String HABITICA_PACKAGE = "com.habitrpg.android.habitica";
  /** usage events, only with usage access and the screen on */
  private static final long USAGE_POLL_MS = 5_000;
  /** without usage access: how often to see whether it was granted (screen on) */
  private static final long ACCESS_CHECK_MS = 60_000;
  /** while the app is on screen it reads itself; a read still wanted waits this long */
  private static final long FOREGROUND_RETRY_MS = 30_000;

  /** the running service, for the app's reports (nudge) */
  private static volatile VerdictService running;

  private HandlerThread thread;
  private Handler handler;
  private long checkedTo;
  private boolean readPending;
  private boolean usage;
  private long accessCheckedAt;
  private BroadcastReceiver screen;

  private final Runnable pollTask = this::poll;
  private final Runnable turnTask = this::turn;
  private final Runnable redrawTask = this::redraw;

  static void start (Context c) {
    Intent i = new Intent(c, VerdictService.class);
    c.startForegroundService(i);
  }

  static void stop (Context c) { c.stopService(new Intent(c, VerdictService.class)); }

  /** The notification is wanted and can be shown (and wasn't swiped away since the app was last opened). */
  static boolean wanted (Context c) {
    return Settings.notification(c) && !Settings.notificationDismissed(c) && TokenStore.has(c) && Surfaces.notificationsEnabled(c);
  }

  /** Start it if it should run and doesn't (the app came back to the screen). Never throws. */
  static void ensure (Context c) { if (running == null) restart(c); }

  /** Start it, or start its turns over when it runs (the login works again after a 401). Never throws. */
  static void restart (Context c) {
    if (!wanted(c)) return;
    try { start(c); } catch (RuntimeException e) { /* a background start the system refused: the next app start tries again */ }
  }

  /** New numbers or new line choices from the app: a turn soon, for the Dailies or party a line may now need. */
  static void nudge () {
    VerdictService s = running;
    if (s != null && s.handler != null) s.handler.post(s.turnTask);
  }

  @Override
  public void onCreate () {
    super.onCreate();
    thread = new HandlerThread("verdict");
    thread.start();
    handler = new Handler(thread.getLooper());
    checkedTo = System.currentTimeMillis();
    screen = new BroadcastReceiver() {
      @Override public void onReceive (Context c, Intent i) {
        if (Intent.ACTION_SCREEN_ON.equals(i.getAction())) wake();
        else sleep();
      }
    };
    IntentFilter f = new IntentFilter();
    f.addAction(Intent.ACTION_SCREEN_ON);
    f.addAction(Intent.ACTION_SCREEN_OFF);
    // system broadcasts only; RECEIVER_NOT_EXPORTED is required from Android 14 and still gets them
    registerReceiver(screen, f, null, handler, Build.VERSION.SDK_INT >= 33 ? Context.RECEIVER_NOT_EXPORTED : 0);
  }

  @Override
  public int onStartCommand (Intent intent, int flags, int startId) {
    // startForegroundService must be followed by startForeground, even when the service is about to stop
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        startForeground(Surfaces.NOTIFICATION_ID, Surfaces.notification(this), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
      } else {
        startForeground(Surfaces.NOTIFICATION_ID, Surfaces.notification(this));
      }
    } catch (RuntimeException e) {
      // Android 12+ refuses a foreground start from the background (a sticky restart after the process was killed):
      // stop quietly; the app, a boot or the refresh job starts it again
      running = null;
      stopSelf();
      return START_NOT_STICKY;
    }
    if (!wanted(this)) { quit(); return START_NOT_STICKY; }
    running = this;
    handler.removeCallbacksAndMessages(null);
    readPending = false;
    handler.post(() -> {
      checkedTo = System.currentTimeMillis();
      accessCheckedAt = 0;
      Surfaces.refresh(this);
      turn();
      if (screenOn()) wake();
    });
    return START_STICKY;
  }

  private void quit () {
    running = null;
    stopForeground(STOP_FOREGROUND_REMOVE);
    stopSelf();
  }

  /** Nothing to do until the app reads again: the notification stays with the "log in again" line. */
  private boolean idle () { return HabiticaReader.authFailed(this); }

  private boolean screenOn () {
    PowerManager pm = getSystemService(PowerManager.class);
    return pm == null || pm.isInteractive();
  }

  private void wake () {
    if (idle()) return;
    handler.removeCallbacks(pollTask);
    handler.removeCallbacks(redrawTask);
    redraw();
    poll();
  }

  private void sleep () {
    handler.removeCallbacks(pollTask);
    handler.removeCallbacks(redrawTask);
  }

  /** Once a minute while the screen is on: the countdown and "read … ago" move; blocked notifications stop it all. */
  private void redraw () {
    if (!Surfaces.notificationsEnabled(this) || !TokenStore.has(this)) { Surfaces.refresh(this); quit(); return; }
    Surfaces.refreshIfChanged(this);
    if (idle() || !screenOn()) return;
    long now = System.currentTimeMillis();
    handler.postDelayed(redrawTask, 60_000 - now % 60_000 + 500);
  }

  /** Did Habitica just close? Only with usage access, every few seconds, screen on. */
  private void poll () {
    if (idle() || !screenOn()) return;
    long now = System.currentTimeMillis();
    if (now - accessCheckedAt >= ACCESS_CHECK_MS) {
      boolean was = usage;
      usage = Settings.usageAccess(this);
      accessCheckedAt = now;
      if (usage && !was) checkedTo = now; // just granted: only closes from now on
    }
    if (usage && habiticaClosedSince(checkedTo, now)) { readPending = true; turn(); }
    checkedTo = now;
    handler.postDelayed(pollTask, usage ? USAGE_POLL_MS : ACCESS_CHECK_MS);
  }

  /** One read if one is due and allowed; otherwise the next turn at the time it may go out. */
  private void turn () {
    handler.removeCallbacks(turnTask);
    if (idle()) return;
    boolean more = readPending || LastRead.tasksWanted(this) || LastRead.partyWanted(this);
    if (!more) return;
    if (MainActivity.inForeground) { handler.postDelayed(turnTask, FOREGROUND_RETRY_MS); return; }
    if (!HabiticaReader.allowed(this, HabiticaReader.Kind.AUTOMATIC)) { later(); return; }
    HabiticaReader.Outcome o;
    if (readPending) {
      readPending = false;
      o = HabiticaReader.read(this, HabiticaReader.Kind.AUTOMATIC);
    } else {
      // the lines that need more than the user: the Dailies after the numbers moved, the party during a quest,
      // one call per turn, each at least 30 s after the one before (the app reads both itself while on screen)
      o = LastRead.tasksWanted(this) ? HabiticaReader.readTasks(this) : HabiticaReader.readParty(this);
    }
    Surfaces.refresh(this);
    if (o == HabiticaReader.Outcome.NO_LOGIN) { quit(); return; }
    if (o == HabiticaReader.Outcome.AUTH_FAILED) { sleep(); return; }
    if (readPending || LastRead.tasksWanted(this) || LastRead.partyWanted(this)) later();
  }

  private void later () {
    long wait = Math.max(1_000, HabiticaReader.nextAutomaticAt(this) - System.currentTimeMillis() + 200);
    handler.postDelayed(turnTask, wait);
  }

  @SuppressWarnings("deprecation")
  private boolean habiticaClosedSince (long from, long to) {
    UsageStatsManager usm = getSystemService(UsageStatsManager.class);
    if (usm == null) return false;
    UsageEvents ev = usm.queryEvents(from, to);
    UsageEvents.Event e = new UsageEvents.Event();
    boolean closed = false;
    while (ev != null && ev.hasNextEvent()) {
      ev.getNextEvent(e);
      // MOVE_TO_BACKGROUND (API 21) has the same value as ACTIVITY_PAUSED (API 29)
      if (HABITICA_PACKAGE.equals(e.getPackageName()) && e.getEventType() == UsageEvents.Event.MOVE_TO_BACKGROUND) closed = true;
    }
    return closed;
  }

  @Override
  public void onDestroy () {
    if (running == this) running = null;
    if (screen != null) { try { unregisterReceiver(screen); } catch (IllegalArgumentException ignored) { /* not registered */ } }
    if (handler != null) handler.removeCallbacksAndMessages(null);
    if (thread != null) thread.quitSafely();
    super.onDestroy();
  }

  @Override
  public IBinder onBind (Intent intent) { return null; }
}
