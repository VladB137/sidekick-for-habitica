package io.github.critoracle.verdict;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeSet;

/**
 * "Night gear": at a set hour, put on the best INT gear (more mana at the day change) or the best CON gear (less
 * damage from missed Dailies), then put back what was worn at a second hour, but never before the new day has
 * started (Habitica runs the day change only on POST /cron, with the gear worn then; v5.51.0 cronWrapper).
 *
 * One Habitica call per step; the caller runs a step whenever the time it returned comes and spaces the calls
 * (at least 30 s apart, 429 honoured). Only equips: nothing is scored, bought, cast or spent. The app works out
 * the loadouts (src/engine/classplan.ts) and hands them over with the gear it saw; if the gear worn at the set
 * hour isn't that, or the night gear was changed before the swap back, the player changed it and it is left alone.
 * Plain Java (no Android) so it is tested on any JDK, against Habitica's own equip and cron in the mock server.
 */
public final class NightSwap {
  /** Settings and progress, as strings (SharedPreferences on the phone). */
  public interface Store { String get (String key); void put (String key, String value); }

  /** One Habitica call: GET or POST on a path under https://habitica.com. */
  public interface Api { Response call (String method, String path); }

  public enum Kind { OK, WAIT, REFUSED, AUTH, OFFLINE }

  public static final class Response {
    public final Kind kind;
    /** the response's `data` on OK */
    public final Object data;
    /** on WAIT: when a call may go out (spacing or Retry-After) */
    public final long retryAt;
    public Response (Kind kind, Object data, long retryAt) { this.kind = kind; this.data = data; this.retryAt = retryAt; }
    public static Response ok (Object data) { return new Response(Kind.OK, data, 0); }
    public static Response of (Kind kind) { return new Response(kind, null, 0); }
    public static Response waitUntil (long at) { return new Response(Kind.WAIT, null, at); }
  }

  public static final String[] SLOTS = { "weapon", "shield", "armor", "head", "body", "back", "eyewear", "headAccessory" };
  static final long MIN = 60_000L;
  /** no connection at the set hour: try again this often, for an hour */
  static final long OFFLINE_RETRY = 5 * MIN;
  static final int OFFLINE_TRIES = 12;
  /** the app is on screen at the set hour: it reads by itself, so wait for it to close */
  static final long FOREGROUND_RETRY = 5 * MIN;
  /** a run this long after the set hour (phone off, Doze) skips the night: the gear could land after the new day and stay on all day */
  static final long TOO_LATE = 120 * MIN;
  /** after the swap-back hour, look for the new day this often, until the next swap is near */
  static final long CRON_RETRY = 30 * MIN;
  static final int MAX_EQUIPS = 12;

  private final Store st;
  private final Api api;
  private final ZoneId zone;

  public NightSwap (Store st, Api api, ZoneId zone) { this.st = st; this.api = api; this.zone = zone; }

  /* ------------------------------------------------------------------ settings */

  public boolean on () { return "1".equals(st.get("on")); }
  /** "auto", "int" or "con" */
  public String mode () { String m = st.get("mode"); return "int".equals(m) || "con".equals(m) ? m : "auto"; }
  /** minutes after local midnight */
  public int swapAt () { return mins(st.get("swapAt"), 22 * 60); }
  public boolean backOn () { return !"0".equals(st.get("backOn")); }
  public int backAt () { return mins(st.get("backAt"), 8 * 60); }
  public String phase () { String p = st.get("phase"); return p == null ? "idle" : p; }

  /** Switching on or changing a time starts over from the next set hour; an unfinished swap-back is kept. */
  public void configure (boolean on, String mode, int swapAt, boolean backOn, int backAt) {
    st.put("on", on ? "1" : "0");
    st.put("mode", mode);
    st.put("swapAt", String.valueOf(swapAt));
    st.put("backOn", backOn ? "1" : "0");
    st.put("backAt", String.valueOf(backAt));
    st.put("due", "0");
    String p = phase();
    if (!on || p.equals("read") || p.equals("tasks") || p.equals("equip")) {
      // a swap in progress stops where it is; what is already on gets put back at the swap-back hour
      if (p.equals("equip") && !sameGear(map(st.get("cur")), map(st.get("base")))) toSwapped(System.currentTimeMillis());
      else st.put("phase", "idle");
    }
  }

  /**
   * The app's plan, from its last read: `{"userId", "expect": {slot: key}, "int": {slot: key} | null,
   * "con": {slot: key} | null}`, where int/con are the full loadouts to wear (null when nothing beats `expect`).
   */
  public void setPlan (String json) {
    // read while the night gear is on: that gear isn't what the next night starts from, so keep the plan from before
    String p = phase();
    if (p.equals("equip") || p.equals("swapped") || p.equals("back")) return;
    st.put("plan", json);
  }

  /** What happened last, for the app's Settings. */
  public String lastText () { String t = st.get("last"); return t == null ? "" : t; }
  public long lastAt () { return lng(st.get("lastAt")); }

  /**
   * While night gear may be on (putting it on, worn, putting it back): the gear from before, as JSON {slot: key},
   * so the app can offer to put it back before logging out. Null otherwise.
   */
  public String baseGear () {
    String p = phase();
    if (!p.equals("equip") && !p.equals("swapped") && !p.equals("back")) return null;
    String b = st.get("base");
    return b == null || b.isEmpty() ? null : b;
  }

  /* ------------------------------------------------------------------ the steps */

  /**
   * Does what is due at `now` (at most one Habitica call) and returns when to run again (epoch ms), or 0 when
   * nothing is planned (switched off, or the login no longer works).
   */
  public long step (long now, boolean appOnScreen) {
    if (!on() && !phase().equals("swapped") && !phase().equals("back")) return 0;
    switch (phase()) {
      case "idle": {
        if (!on()) return 0;
        long due = lng(st.get("due"));
        if (due == 0) { due = nextAt(now, swapAt()); st.put("due", String.valueOf(due)); }
        if (now < due) return due;
        if (now > due + TOO_LATE) return finish(now, "Skipped: the phone ran the night swap more than 2 hours late.");
        if (appOnScreen) return now + FOREGROUND_RETRY;
        st.put("phase", "read"); st.put("tries", "0");
        return readBeforeSwap(now);
      }
      case "read": return readBeforeSwap(now);
      case "tasks": return readTasks(now);
      case "equip": return equipStep(now, false);
      case "swapped": return checkBack(now);
      case "back": return equipStep(now, true);
      default: st.put("phase", "idle"); return now;
    }
  }

  private long readBeforeSwap (long now) {
    Response r = api.call("GET", "/api/v3/user");
    Long later = trouble(r, now);
    if (later != null) return later;
    Map<String, Object> plan = asMap(parseOrNull(st.get("plan")));
    Map<String, String> worn = equipped(r.data);
    if (plan == null || !String.valueOf(Json.at(r.data, "_id")).equals(Json.at(plan, "userId"))) {
      return finish(now, "Skipped: open Sidekick once so it can work out your night gear.");
    }
    if (!sameGear(worn, map(Json.at(plan, "expect")))) {
      return finish(now, "Skipped: your gear changed since Sidekick last read it. Open the app once to update the plan.");
    }
    st.put("cur", Json.stringify(worn));
    String mode = mode();
    if (mode.equals("auto")) {
      // asleep in the Inn: missed Dailies do no damage, so mana is all the night gear can add
      if (Json.truthy(Json.at(r.data, "preferences", "sleep"))) return choose(now, "int", "you're resting in the Inn");
      st.put("phase", "tasks");
      return now; // the next call waits for the spacing
    }
    return choose(now, mode, null);
  }

  private long readTasks (long now) {
    Response r = api.call("GET", "/api/v3/tasks/user?type=dailys");
    Long later = trouble(r, now);
    if (later != null) return later;
    int open = 0;
    if (r.data instanceof List) {
      for (Object t : (List<?>) r.data) {
        // team (group) Dailies cost no HP at the day change; challenge Dailies do
        if ("daily".equals(Json.at(t, "type")) && Json.truthy(Json.at(t, "isDue")) && !Json.truthy(Json.at(t, "completed"))
            && !Json.truthy(Json.at(t, "group", "id"))) open++;
      }
    }
    return open > 0
        ? choose(now, "con", open + (open == 1 ? " Daily was" : " Dailies were") + " still open")
        : choose(now, "int", "every Daily was done");
  }

  private long choose (long now, String which, String why) {
    Map<String, Object> plan = asMap(parseOrNull(st.get("plan")));
    Map<String, String> target = map(Json.at(plan, which));
    Map<String, String> cur = map(st.get("cur"));
    String name = which.equals("int") ? "INT" : "CON";
    if (target.isEmpty() || sameGear(target, cur)) {
      return finish(now, "Nothing to swap: you already wear your best " + name + " gear" + (why == null ? "." : " (" + why + ")."));
    }
    st.put("base", Json.stringify(cur));
    st.put("target", Json.stringify(target));
    st.put("which", which);
    st.put("why", why == null ? "" : why);
    st.put("equips", "0");
    st.put("phase", "equip");
    return now;
  }

  /** One equip call toward the target (night gear, or the gear from before when `back`). */
  private long equipStep (long now, boolean back) {
    Map<String, String> cur = map(st.get("cur"));
    Map<String, String> target = map(st.get(back ? "base" : "target"));
    String key = nextKey(cur, target);
    if (key == null) {
      if (back) {
        String why = st.get("backWhy");
        st.put("backWhy", "");
        return finish(now, why == null || why.isEmpty() ? "Put your gear back as it was." : why + " What had changed is back as it was.");
      }
      return toSwapped(now);
    }
    int n = (int) lng(st.get("equips"));
    if (n >= MAX_EQUIPS) return giveUp(now, back, "Habitica didn't take the gear as planned; check your gear.");
    Response r = api.call("POST", "/api/v3/user/equip/equipped/" + key);
    if (r.kind == Kind.REFUSED) return giveUp(now, back, "Habitica refused a piece of gear; check your gear.");
    Long later = trouble(r, now);
    if (later != null) return later;
    st.put("equips", String.valueOf(n + 1));
    st.put("cur", Json.stringify(map(Json.at(r.data, "gear", "equipped"))));
    return now;
  }

  /** A failed swap puts back what it already changed; a failed swap-back leaves things as they are. */
  private long giveUp (long now, boolean back, String why) {
    if (!back && !sameGear(map(st.get("cur")), map(st.get("base")))) {
      st.put("equips", "0");
      st.put("phase", "back");
      st.put("backWhy", why);
      note(now, why + " Putting back what was changed.");
      return now;
    }
    return finish(now, why);
  }

  private long toSwapped (long now) {
    String which = st.get("which");
    String why = st.get("why");
    st.put("swappedAt", String.valueOf(now));
    st.put("target", st.get("cur"));
    String what = "Put on your " + ("con".equals(which) ? "CON gear (less damage from missed Dailies)" : "INT gear (more mana at the day change)")
        + (why == null || why.isEmpty() ? "" : ": " + why) + ".";
    if (!backOn()) return finish(now, what);
    long back = nextAt(now, backAt());
    st.put("backDue", String.valueOf(back));
    st.put("phase", "swapped");
    note(now, what + " It goes back after your new day starts.");
    return back;
  }

  private long checkBack (long now) {
    long due = lng(st.get("backDue"));
    if (now < due) return due;
    Response r = api.call("GET", "/api/v3/user");
    Long later = trouble(r, now);
    if (later != null) return later;
    Map<String, String> worn = equipped(r.data);
    if (!sameGear(worn, map(st.get("target")))) return finish(now, "Left your gear alone: it changed after the night swap.");
    long swapped = lng(st.get("swappedAt"));
    long lastCron = isoMillis(Json.at(r.data, "lastCron"));
    if (lastCron > swapped && !Json.truthy(Json.at(r.data, "needsCron"))) {
      st.put("cur", Json.stringify(worn));
      st.put("equips", "0");
      st.put("backWhy", "");
      st.put("phase", "back");
      return now;
    }
    // the day change hasn't run yet: putting the gear back now would undo the point of it
    long nextSwap = nextAt(swapped + MIN, swapAt());
    if (now + CRON_RETRY >= nextSwap - CRON_RETRY) return finish(now, "Your new day hadn't started by the next night, so the night gear stayed on.");
    return now + CRON_RETRY;
  }

  /** Spacing, rate limits and failures: when to try again, or null to go on with the response. */
  private Long trouble (Response r, long now) {
    switch (r.kind) {
      case OK: st.put("tries", "0"); return null;
      case WAIT: return Math.max(now + 1000, r.retryAt);
      case AUTH:
        st.put("phase", "idle");
        note(now, "Stopped: Habitica refused the login. Log in again in the app.");
        return 0L;
      case OFFLINE: {
        int t = (int) lng(st.get("tries")) + 1;
        st.put("tries", String.valueOf(t));
        if (t < OFFLINE_TRIES) return now + OFFLINE_RETRY;
        if (phase().equals("equip")) return giveUp(now, false, "No connection to Habitica.");
        if (phase().equals("swapped")) return now + CRON_RETRY; // keep looking for the new day
        return finish(now, "No connection to Habitica" + (phase().equals("back") ? "; your night gear is still on." : "; skipped tonight."));
      }
      default:
        if (phase().equals("swapped")) return now + CRON_RETRY;
        return finish(now, "Habitica refused the request; skipped.");
    }
  }

  /** Done for tonight: note it and wait for the next set hour. */
  private long finish (long now, String text) {
    note(now, text);
    st.put("phase", "idle");
    st.put("tries", "0");
    if (!on()) return 0;
    long due = nextAt(now + MIN, swapAt());
    st.put("due", String.valueOf(due));
    return due;
  }

  private void note (long now, String text) { st.put("last", text); st.put("lastAt", String.valueOf(now)); }

  /* ------------------------------------------------------------------ gear */

  static boolean empty (String k) { return k == null || k.isEmpty() || k.endsWith("_base_0"); }

  static boolean sameGear (Map<String, String> a, Map<String, String> b) {
    TreeSet<String> slots = new TreeSet<>(a.keySet());
    slots.addAll(b.keySet());
    for (String s : slots) {
      String x = a.get(s), y = b.get(s);
      if (empty(x) && empty(y)) continue;
      if (x == null || !x.equals(y)) return false;
    }
    return true;
  }

  /**
   * The next equip call from `cur` toward `target`. Equipping is a toggle in Habitica (ops/equip.js: the worn key
   * again takes it off), so a key already worn is never sent to put it on. Weapon first, shield next (a two-handed
   * weapon takes the shield off, a shield takes a two-hander off: fns/handleTwoHanded.js), then bare slots emptied.
   */
  static String nextKey (Map<String, String> cur, Map<String, String> target) {
    List<String> slots = new ArrayList<>(List.of(SLOTS));
    for (String s : target.keySet()) if (!slots.contains(s)) slots.add(s);
    for (String s : slots) {
      String want = target.get(s);
      if (!empty(want) && !want.equals(cur.get(s))) return want;
    }
    for (String s : slots) {
      if (!target.containsKey(s)) continue;
      String has = cur.get(s);
      if (empty(target.get(s)) && !empty(has)) return has;
    }
    return null;
  }

  static Map<String, String> equipped (Object user) { return map(Json.at(user, "items", "gear", "equipped")); }

  static Map<String, String> map (Object v) {
    if (v instanceof String) v = parseOrNull((String) v);
    Map<String, String> out = new LinkedHashMap<>();
    if (v instanceof Map) for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) if (e.getValue() instanceof String) out.put(String.valueOf(e.getKey()), (String) e.getValue());
    return out;
  }

  @SuppressWarnings("unchecked")
  private static Map<String, Object> asMap (Object v) { return v instanceof Map ? (Map<String, Object>) v : null; }

  private static Object parseOrNull (String s) {
    if (s == null || s.isEmpty()) return null;
    try { return Json.parse(s); } catch (RuntimeException e) { return null; }
  }

  /* ------------------------------------------------------------------ time */

  /** The first moment after `after` when the local clock shows `minutes` past midnight. */
  public long nextAt (long after, int minutes) {
    ZonedDateTime from = Instant.ofEpochMilli(after).atZone(zone);
    LocalTime t = LocalTime.of(minutes / 60 % 24, minutes % 60);
    LocalDate d = from.toLocalDate();
    ZonedDateTime at = ZonedDateTime.of(d, t, zone);
    if (!at.toInstant().isAfter(from.toInstant())) at = ZonedDateTime.of(d.plusDays(1), t, zone);
    return at.toInstant().toEpochMilli();
  }

  static long isoMillis (Object v) {
    if (!(v instanceof String)) return 0;
    try { return Instant.parse((String) v).toEpochMilli(); } catch (RuntimeException e) { return 0; }
  }

  private static long lng (String s) {
    if (s == null) return 0;
    try { return Long.parseLong(s); } catch (NumberFormatException e) { return 0; }
  }

  private static int mins (String s, int d) {
    if (s == null) return d;
    try { int m = Integer.parseInt(s); return m >= 0 && m < 24 * 60 ? m : d; } catch (NumberFormatException e) { return d; }
  }
}
