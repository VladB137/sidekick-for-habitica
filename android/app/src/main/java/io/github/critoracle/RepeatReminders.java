package io.github.critoracle;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.service.notification.StatusBarNotification;
import io.github.critoracle.verdict.Json;
import io.github.critoracle.verdict.RepeatPlan;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Repeating To-Dos on the phone (src/app/repeats.ts owns the list; RepeatPlan is the logic). The list is kept here,
 * in app-private preferences, only while the player is logged in with "Remember on this device"; logout wipes it.
 * When a To-Do is back, a reminder on its own channel says so, and its "Add to To-Dos" button is the one tap that adds
 * it to Habitica (RepeatJob). Nothing is ever added without that tap.
 */
final class RepeatReminders {
  private RepeatReminders () {}

  static final String CHANNEL = "repeats";
  static final String ACTION_ADD = "io.github.critoracle.REPEAT_ADD";
  static final String ACTION_TOMORROW = "io.github.critoracle.REPEAT_TOMORROW";
  static final String EXTRA_ID = "id";
  private static final String PREFS = "critoracle-repeats";
  private static final int NOTIFICATION_BASE = 1000;

  /** the account's time zone, as the app stores it with the list (RepeatPlan.zone) */
  static ZoneId zone (RepeatPlan p) { return p.zone(ZoneId.systemDefault()); }

  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

  static synchronized String json (Context c) { return prefs(c).getString("json", null); }

  static synchronized RepeatPlan load (Context c) { return new RepeatPlan(json(c)).phoneZone(ZoneId.systemDefault()); }

  /** Store the list (from the app or after a change here), then bring the reminders and their schedule up to date. */
  static void save (Context c, RepeatPlan plan, boolean fromApp) {
    synchronized (RepeatReminders.class) { prefs(c).edit().putString("json", plan.json()).commit(); }
    update(c);
    if (!fromApp) SidekickPlugin.repeatsChanged();
  }

  static synchronized void clear (Context c) {
    pause(c);
    prefs(c).edit().clear().commit();
  }

  /** No reminders and no jobs, the list kept (the app shows it again only to the same User ID): until the next login. */
  static synchronized void pause (Context c) {
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm != null) for (StatusBarNotification n : nm.getActiveNotifications()) if (CHANNEL.equals(n.getNotification().getChannelId())) nm.cancel(n.getId());
    RepeatJob.cancelAll(c);
  }

  /** A full read of the user (native): copies that left the open To-Dos were ticked, so their day to come back is set. */
  static void onRead (Context c, Object user, long readStartedAt) {
    RepeatPlan p;
    synchronized (RepeatReminders.class) {
      p = load(c);
      if (!p.onUser(user, readStartedAt, zone(p))) return;
      prefs(c).edit().putString("json", p.json()).commit();
    }
    update(c);
    SidekickPlugin.repeatsChanged();
  }

  /** The ticked To-Dos answered (HabiticaReader.readCompletedTodos): copies that left the list were ticked or deleted. */
  static void onCompleted (Context c, Object completed) {
    synchronized (RepeatReminders.class) {
      RepeatPlan p = load(c);
      if (!p.onCompleted(completed, System.currentTimeMillis(), zone(p))) return;
      prefs(c).edit().putString("json", p.json()).commit();
    }
    SidekickPlugin.repeatsChanged();
  }

  /** a failed look-up waits this long before the next (a reminder is late rather than a call every minute) */
  private static final long LOOK_RETRY_MS = 15 * 60_000L;

  /** Before a reminder for a copy that left the list: the one read that tells a tick from a delete (RepeatJob). */
  static void lookUpIfDue (Context c) {
    long now = System.currentTimeMillis();
    RepeatPlan p = load(c);
    if (!p.needsLookUp(now, zone(p)) || now < prefs(c).getLong("lookAfter", 0)) return;
    HabiticaReader.Outcome o = HabiticaReader.readCompletedTodos(c);
    if (o != HabiticaReader.Outcome.READ) {
      long wait = o == HabiticaReader.Outcome.SKIPPED ? Math.max(60_000L, HabiticaReader.nextAutomaticAt(c) - now) : LOOK_RETRY_MS;
      prefs(c).edit().putLong("lookAfter", now + wait).apply();
    }
  }

  /** Show the reminders that are due, take down the ones no longer wanted, and schedule the next. */
  static void update (Context c) {
    long now = System.currentTimeMillis();
    RepeatPlan p;
    Set<String> fresh = new HashSet<>();
    synchronized (RepeatReminders.class) {
      p = load(c);
      if (TokenStore.has(c)) {
        for (Map<String, Object> it : p.toRemind(now, zone(p))) { RepeatPlan.markNotified(it); fresh.add(String.valueOf(it.get("id"))); }
        if (!fresh.isEmpty()) prefs(c).edit().putString("json", p.json()).commit();
      }
    }
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm != null) {
      Set<Integer> want = new HashSet<>();
      if (TokenStore.has(c)) {
        for (Map<String, Object> it : p.items()) {
          if (!RepeatPlan.waiting(it)) continue;
          String id = String.valueOf(it.get("id"));
          want.add(notificationId(id));
          // posted once, when it becomes due: a re-post would bring back one the player swiped away
          if (fresh.contains(id)) nm.notify(notificationId(id), reminder(c, p, it, null, true));
        }
      }
      for (StatusBarNotification n : nm.getActiveNotifications()) {
        if (CHANNEL.equals(n.getNotification().getChannelId()) && !want.contains(n.getId()) && !RepeatJob.adding(c).contains(idFor(p, n.getId()))) nm.cancel(n.getId());
      }
    }
    long next = p.nextRemind(now, zone(p));
    // a reminder held for its look-up: the job comes back when the look-up may go out
    if (p.needsLookUp(now, zone(p))) { long look = Math.max(now + 1_000, prefs(c).getLong("lookAfter", 0)); next = next < 0 ? look : Math.min(next, look); }
    RepeatJob.scheduleRemind(c, TokenStore.has(c) ? next : -1);
  }

  static int notificationId (String itemId) { return NOTIFICATION_BASE + (itemId.hashCode() & 0x7fff); }

  private static String idFor (RepeatPlan p, int nid) {
    for (Map<String, Object> it : p.items()) { String id = String.valueOf(it.get("id")); if (notificationId(id) == nid) return id; }
    return "";
  }

  static void ensureChannel (Context c) {
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm == null || nm.getNotificationChannel(CHANNEL) != null) return;
    NotificationChannel ch = new NotificationChannel(CHANNEL, "Repeating To-Dos", NotificationManager.IMPORTANCE_DEFAULT);
    ch.setDescription("When a repeating To-Do is back. Its button adds it to your Habitica To-Dos; nothing is added without that tap.");
    nm.createNotificationChannel(ch);
  }

  private static PendingIntent action (Context c, String action, String id) {
    Intent i = new Intent(c, RepeatReceiver.class).setAction(action).putExtra(EXTRA_ID, id);
    return PendingIntent.getBroadcast(c, (action + id).hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
  }

  /** "every 7 days" */
  static String every (int n) { return n == 1 ? "every day" : "every " + n + " days"; }

  /**
   * The reminder: "Water plants is back", when it was ticked, and two buttons. `status` replaces the text while an
   * add is under way or after one failed; `actions` false while adding (no second tap can add a second copy).
   */
  static Notification reminder (Context c, RepeatPlan p, Map<String, Object> it, String status, boolean actions) {
    ensureChannel(c);
    String id = String.valueOf(it.get("id"));
    String text = String.valueOf(it.get("text"));
    String done = it.get("doneDay") instanceof String ? (String) it.get("doneDay") : null;
    String when = "";
    if (done != null) {
      try {
        LocalDate d = LocalDate.parse(done);
        // the Habitica day itself, in English like the sentence (as repeats.ts dateLabel): no zone can shift it
        when = ", ticked " + d.format(java.time.format.DateTimeFormatter.ofPattern("EEE d MMM", java.util.Locale.UK));
      } catch (RuntimeException ignored) { /* no date */ }
    }
    String body = status != null ? status : "Comes back " + every(RepeatPlan.everyDays(it)) + when + ". Add it to your To-Dos?";
    Notification.Builder b = new Notification.Builder(c, CHANNEL)
        .setSmallIcon(R.drawable.ic_stat_repeat)
        .setContentTitle(text + " is back")
        .setContentText(body)
        .setStyle(new Notification.BigTextStyle().bigText(body))
        .setContentIntent(Surfaces.openApp(c))
        .setColor(Surfaces.TEAL)
        .setCategory(Notification.CATEGORY_REMINDER)
        .setVisibility(Notification.VISIBILITY_PRIVATE)
        .setOnlyAlertOnce(true)
        .setAutoCancel(false);
    if (actions) {
      b.addAction(new Notification.Action.Builder(null, "Add to To-Dos", action(c, ACTION_ADD, id)).build());
      b.addAction(new Notification.Action.Builder(null, "Tomorrow", action(c, ACTION_TOMORROW, id)).build());
    } else {
      b.setProgress(0, 0, true);
    }
    return b.build();
  }

  /** The tap on "Add to To-Dos": the reminder shows "Adding…" without buttons, and RepeatJob makes the one request. */
  static void requestAdd (Context c, String id) {
    RepeatPlan p = load(c);
    Map<String, Object> it = p.find(id);
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (it == null || RepeatPlan.remindDay(it) == null) { if (nm != null) nm.cancel(notificationId(id)); return; }
    // the app is adding it right now: a second copy would follow
    if (RepeatPlan.adding(it, System.currentTimeMillis()) && !RepeatJob.adding(c).contains(id)) {
      if (nm != null) nm.notify(notificationId(id), reminder(c, p, it, "Sidekick is adding it right now.", true));
      return;
    }
    boolean queued = RepeatJob.queueAdd(c, id);
    if (queued) markAdding(c, id, true);
    if (nm != null) nm.notify(notificationId(id), reminder(c, p, it, "Adding it to your To-Dos…", false));
  }

  /** "adding" in the shared list, so the app offers no Add while the phone's request is on its way (and the reverse). */
  static void markAdding (Context c, String id, boolean on) {
    synchronized (RepeatReminders.class) {
      RepeatPlan p = load(c);
      Map<String, Object> it = p.find(id);
      if (it == null || (on == it.containsKey("adding"))) return;
      if (on) it.put("adding", (double) System.currentTimeMillis()); else it.remove("adding");
      prefs(c).edit().putString("json", p.json()).commit();
    }
    SidekickPlugin.repeatsChanged();
  }

  /** The result of an add, on the reminder: gone after a moment when it worked, with the buttons again when it didn't. */
  static void added (Context c, String id, String taskId) {
    RepeatPlan p;
    Map<String, Object> it;
    synchronized (RepeatReminders.class) {
      p = load(c);
      it = p.find(id);
      if (it == null) return;
      RepeatPlan.added(it, taskId, System.currentTimeMillis());
      prefs(c).edit().putString("json", p.json()).commit();
    }
    // the schedule first: it takes down reminders no longer wanted, which this one is about to replace
    update(c);
    SidekickPlugin.repeatsChanged();
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm != null) {
      ensureChannel(c);
      nm.notify(notificationId(id), new Notification.Builder(c, CHANNEL)
          .setSmallIcon(R.drawable.ic_stat_repeat)
          .setContentTitle(it.get("text") + " is in your To-Dos")
          .setContentText("It comes back " + every(RepeatPlan.everyDays(it)) + " after you tick it.")
          .setColor(Surfaces.TEAL)
          .setContentIntent(Surfaces.openApp(c))
          .setOnlyAlertOnce(true)
          .setAutoCancel(true)
          .setTimeoutAfter(4_000)
          .build());
    }
  }

  static void failed (Context c, String id, String why) {
    markAdding(c, id, false);
    RepeatPlan p = load(c);
    Map<String, Object> it = p.find(id);
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (it == null || nm == null) return;
    nm.notify(notificationId(id), reminder(c, p, it, why, true));
  }

  /** "Tomorrow": the reminder goes and comes back the next day; the app still shows it as back. */
  static void tomorrow (Context c, String id) {
    synchronized (RepeatReminders.class) {
      RepeatPlan p = load(c);
      Map<String, Object> it = p.find(id);
      if (it != null) { p.snooze(it, System.currentTimeMillis(), zone(p)); prefs(c).edit().putString("json", p.json()).commit(); }
    }
    NotificationManager nm = c.getSystemService(NotificationManager.class);
    if (nm != null) nm.cancel(notificationId(id));
    update(c);
    SidekickPlugin.repeatsChanged();
  }

  static String body (Map<String, Object> it) { return Json.stringify(RepeatPlan.taskBody(it)); }
}
