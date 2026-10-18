package io.github.critoracle.verdict;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Repeating To-Dos (src/app/repeats.ts): templates kept on the phone. A copy comes back a set number of days after
 * the player ticks it, and only a tap adds it to Habitica. This is the part the phone runs without the app: noticing
 * from a read that a copy was ticked (Habitica takes a ticked To-Do out of user.tasksOrder.todos, tasks/index.js), when
 * to remind, and what the reminder's button adds. Days are Habitica days: before the player's day start hour, a moment
 * still belongs to the day before, as in the app. The time zone is the account's (tzOffset, which the app stores from
 * preferences.timezoneOffset), as Habitica's cron counts days.
 *
 * The stored list is the app's own JSON: {"v":1,"userId":"…","dayStart":0,"items":[{id, text, notes, priority,
 * checklist: [text], everyDays, taskId?, doneDay?, dueDay?, paused?, gone?, snooze?, notified?, adding?, updatedAt}]},
 * plus "tzOffset" (minutes west of UTC).
 */
public final class RepeatPlan {
  /** reminders come at this hour on the day a To-Do is back (or at the day start, if that is later) */
  public static final int REMIND_HOUR = 9;

  private final Map<String, Object> root;

  @SuppressWarnings("unchecked")
  public RepeatPlan (String json) {
    Object o = null;
    if (json != null) { try { o = Json.parse(json); } catch (RuntimeException e) { o = null; } }
    root = o instanceof Map ? (Map<String, Object>) o : new LinkedHashMap<>();
    if (!(root.get("items") instanceof List)) root.put("items", new ArrayList<>());
  }

  public String json () { return Json.stringify(root); }

  public String userId () { Object u = root.get("userId"); return u instanceof String ? (String) u : null; }

  public int dayStart () { return (int) Json.num(root.get("dayStart"), 0); }

  /** The account's time zone (tzOffset: minutes west of UTC, as JS reports it), else the phone's. */
  public ZoneId zone (ZoneId fallback) {
    Object o = root.get("tzOffset");
    if (!(o instanceof Number)) return fallback;
    long sec = Math.round(-((Number) o).doubleValue() * 60);
    return sec >= -18 * 3600 && sec <= 18 * 3600 ? ZoneOffset.ofTotalSeconds((int) sec) : fallback;
  }

  /** An add marked in the list counts for this long (as ADDING_MS in the app); after that it is offered again. */
  public static final long ADDING_MS = 30 * 60_000L;

  /** An add for this item is under way, from the app or from the reminder's button. */
  public static boolean adding (Map<String, Object> it, long now) {
    double at = Json.num(it.get("adding"), 0);
    return at > 0 && now - at < ADDING_MS;
  }

  @SuppressWarnings("unchecked")
  public List<Map<String, Object>> items () {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Object o : (List<Object>) root.get("items")) if (o instanceof Map) out.add((Map<String, Object>) o);
    return out;
  }

  public Map<String, Object> find (String id) {
    for (Map<String, Object> it : items()) if (id != null && id.equals(it.get("id"))) return it;
    return null;
  }

  /** The Habitica day a moment belongs to: before the day start hour it is still the day before. */
  public static LocalDate habiticaDay (long at, int dayStart, ZoneId zone) {
    ZonedDateTime t = ZonedDateTime.ofInstant(java.time.Instant.ofEpochMilli(at), zone);
    LocalDate d = t.toLocalDate();
    return t.getHour() < dayStart ? d.minusDays(1) : d;
  }

  private static String str (Object o) { return o instanceof String && !((String) o).isEmpty() ? (String) o : null; }

  /**
   * A full read of the user, started at readAt: a copy that is no longer among the open To-Dos was ticked (or
   * deleted; the app finds out which when it next reads the completed To-Dos). It comes back everyDays after that day.
   * Items changed after the read started are left alone (a copy added meanwhile isn't in that answer yet).
   */
  public boolean onUser (Object user, long readAt, ZoneId zone) {
    String uid = userId();
    Object id = Json.at(user, "_id");
    if (uid == null || !uid.equals(id)) return false;
    Object todos = Json.at(user, "tasksOrder", "todos");
    if (!(todos instanceof List)) return false;
    boolean changed = false;
    for (Map<String, Object> it : items()) {
      String taskId = str(it.get("taskId"));
      if (taskId == null || str(it.get("doneDay")) != null || Json.truthy(it.get("paused"))) continue;
      if (Json.num(it.get("updatedAt"), 0) >= readAt || ((List<?>) todos).contains(taskId)) continue;
      LocalDate done = habiticaDay(readAt, dayStart(), zone);
      it.put("doneDay", done.toString());
      it.put("dueDay", done.plusDays(everyDays(it)).toString());
      it.put("gone", true);
      it.put("updatedAt", (double) readAt);
      changed = true;
    }
    return changed;
  }

  public static int everyDays (Map<String, Object> it) { return (int) Math.max(1, Math.min(365, Json.num(it.get("everyDays"), 7))); }

  /** The day the reminder is for: the day it is back, or the day a "Tomorrow" moved it to; null when none is wanted. */
  public static String remindDay (Map<String, Object> it) {
    if (Json.truthy(it.get("paused"))) return null;
    String due = str(it.get("dueDay"));
    if (due == null) return null;
    String snooze = str(it.get("snooze"));
    return snooze != null && snooze.compareTo(due) > 0 ? snooze : due;
  }

  /** The phone's own zone, when it may differ from the account's (after travel, until Habitica's app is opened). */
  private ZoneId phone;
  public RepeatPlan phoneZone (ZoneId z) { phone = z; return this; }

  /**
   * When the reminder shows (epoch ms), or -1 when it needs none or was already shown: REMIND_HOUR on the phone's
   * clock, but never before the Habitica day starts (dayStart in the account's zone, `zone`).
   */
  public long remindAt (Map<String, Object> it, ZoneId zone) {
    String day = remindDay(it);
    if (day == null || day.equals(str(it.get("notified")))) return -1;
    LocalDate d;
    try { d = LocalDate.parse(day); } catch (RuntimeException e) { return -1; }
    long starts = d.atTime(Math.max(0, Math.min(23, dayStart())), 0).atZone(zone).toInstant().toEpochMilli();
    long clock = d.atTime(REMIND_HOUR, 0).atZone(phone != null ? phone : zone).toInstant().toEpochMilli();
    return Math.max(starts, clock);
  }

  /**
   * The copy left the list but nobody has checked yet whether it was ticked or deleted: its reminder waits for that
   * check (a deleted To-Do mustn't come back as "is back").
   */
  public static boolean gone (Map<String, Object> it) { return Json.truthy(it.get("gone")) && str(it.get("taskId")) != null; }

  /** The reminders due by now, not shown yet. */
  public List<Map<String, Object>> toRemind (long now, ZoneId zone) {
    List<Map<String, Object>> out = new ArrayList<>();
    for (Map<String, Object> it : items()) { long at = remindAt(it, zone); if (at >= 0 && at <= now && !gone(it)) out.add(it); }
    return out;
  }

  /** A reminder is due for a copy that left the list: one read of the ticked To-Dos first (onCompleted). */
  public boolean needsLookUp (long now, ZoneId zone) {
    for (Map<String, Object> it : items()) { long at = remindAt(it, zone); if (at >= 0 && at <= now && gone(it)) return true; }
    return false;
  }

  /**
   * GET /tasks/user?type=completedTodos answered: a copy among them was ticked (it comes back everyDays after the day
   * it was ticked), one missing was deleted (paused: no reminder until the player adds it again). As lookUp in the app.
   */
  public boolean onCompleted (Object completed, long now, ZoneId zone) {
    if (!(completed instanceof List)) return false;
    Map<String, Object> byId = new LinkedHashMap<>();
    for (Object t : (List<?>) completed) {
      Object id = Json.at(t, "_id");
      if (!(id instanceof String)) id = Json.at(t, "id");
      if (id instanceof String && t instanceof Map) byId.put((String) id, t);
    }
    boolean changed = false;
    for (Map<String, Object> it : items()) {
      if (!gone(it)) continue;
      Object t = byId.get(str(it.get("taskId")));
      long at = -1;
      Object dc = t == null ? null : Json.at(t, "dateCompleted");
      if (dc instanceof String) { try { at = java.time.Instant.parse((String) dc).toEpochMilli(); } catch (RuntimeException e) { at = -1; } }
      if (at >= 0) {
        LocalDate done = habiticaDay(at, dayStart(), zone);
        it.put("doneDay", done.toString());
        it.put("dueDay", done.plusDays(everyDays(it)).toString());
      } else {
        it.put("paused", true);
        for (String k : new String[] { "doneDay", "dueDay", "notified", "snooze" }) it.remove(k);
      }
      it.remove("taskId");
      it.remove("gone");
      it.put("updatedAt", (double) now);
      changed = true;
    }
    return changed;
  }

  /** The next reminder after now (epoch ms), or -1. */
  public long nextRemind (long now, ZoneId zone) {
    long next = -1;
    for (Map<String, Object> it : items()) { long at = remindAt(it, zone); if (at > now && (next < 0 || at < next)) next = at; }
    return next;
  }

  /** Whether a reminder for this item should be on screen now (it is waiting for its tap). */
  public static boolean waiting (Map<String, Object> it) { return remindDay(it) != null && remindDay(it).equals(str(it.get("notified"))); }

  public static void markNotified (Map<String, Object> it) { it.put("notified", remindDay(it)); }

  /** "Tomorrow": the reminder comes back the next Habitica day. */
  public void snooze (Map<String, Object> it, long now, ZoneId zone) {
    it.put("snooze", habiticaDay(now, dayStart(), zone).plusDays(1).toString());
    it.put("updatedAt", (double) now);
  }

  /** What POST /api/v3/tasks/user gets: a To-Do with the template's text, notes, difficulty and checklist. */
  public static Map<String, Object> taskBody (Map<String, Object> it) {
    Map<String, Object> b = new LinkedHashMap<>();
    b.put("type", "todo");
    b.put("text", String.valueOf(it.get("text")));
    String notes = str(it.get("notes"));
    if (notes != null) b.put("notes", notes);
    double p = Json.num(it.get("priority"), 1);
    b.put("priority", p == 0.1 || p == 1 || p == 1.5 || p == 2 ? p : 1.0);
    List<Object> cl = new ArrayList<>();
    if (it.get("checklist") instanceof List) {
      for (Object c : (List<?>) it.get("checklist")) {
        String t = str(c);
        if (t == null) continue;
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("text", t);
        m.put("completed", false);
        cl.add(m);
      }
    }
    if (!cl.isEmpty()) b.put("checklist", cl);
    return b;
  }

  /** A copy was added to Habitica: it is open now, and nothing is due until it is ticked. */
  public static void added (Map<String, Object> it, String taskId, long now) {
    it.put("taskId", taskId);
    for (String k : new String[] { "doneDay", "dueDay", "gone", "paused", "snooze", "notified", "adding" }) it.remove(k);
    it.put("updatedAt", (double) now);
  }
}
