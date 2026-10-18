package io.github.critoracle;

import android.content.Context;
import android.content.SharedPreferences;
import io.github.critoracle.verdict.GearTable;
import io.github.critoracle.verdict.Json;
import io.github.critoracle.verdict.Lines;
import io.github.critoracle.verdict.Verdict;
import io.github.critoracle.verdict.VerdictText;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.DateFormat;
import java.util.Date;
import java.time.Instant;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The last numbers read from Habitica (by the app or by a native read), trimmed to what the verdict and the
 * notification's lines need: the user, and with the lines that need them the Dailies (GET /tasks/user) and the
 * party's quest (GET /groups/party). Kept only while the player is logged in with "Remember on this device";
 * logout wipes it.
 */
final class LastRead {
  private LastRead () {}

  private static final String PREFS = "critoracle-lastread";
  private static GearTable gear;
  private static Object items;

  static synchronized GearTable gear (Context c) {
    if (gear != null) return gear;
    try (InputStream in = c.getAssets().open("gear.json")) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buf = new byte[16384];
      for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
      gear = GearTable.parse(new String(out.toByteArray(), StandardCharsets.UTF_8));
    } catch (Exception e) {
      gear = GearTable.parse("{}"); // every item unknown: the line says crit chances may be off
    }
    return gear;
  }

  /** items.json (boss and collection quests), parsed once. */
  static synchronized Object items (Context c) {
    if (items != null) return items;
    try (InputStream in = c.getAssets().open("items.json")) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buf = new byte[16384];
      for (int n; (n = in.read(buf)) > 0; ) out.write(buf, 0, n);
      items = Json.parse(new String(out.toByteArray(), StandardCharsets.UTF_8));
    } catch (Exception e) {
      items = new LinkedHashMap<String, Object>(); // no quest names: the quest lines stay hidden
    }
    return items;
  }

  /** The fields snapshotFromUser and the notification's lines read, from a full or trimmed user object. */
  static Object trim (Object user) {
    Map<String, Object> out = new LinkedHashMap<>();
    out.put("_id", Json.at(user, "_id"));
    out.put("stats", Json.at(user, "stats"));
    Map<String, Object> flags = new LinkedHashMap<>();
    flags.put("classSelected", Json.at(user, "flags", "classSelected"));
    out.put("flags", flags);
    Map<String, Object> prefs = new LinkedHashMap<>();
    prefs.put("disableClasses", Json.at(user, "preferences", "disableClasses"));
    prefs.put("dayStart", Json.at(user, "preferences", "dayStart"));
    prefs.put("timezoneOffset", Json.at(user, "preferences", "timezoneOffset"));
    prefs.put("sleep", Json.at(user, "preferences", "sleep"));
    out.put("preferences", prefs);
    // item drops left today: the drop count and when, contributor level, and only whether there is a subscription
    Map<String, Object> contributor = new LinkedHashMap<>();
    contributor.put("level", Json.at(user, "contributor", "level"));
    out.put("contributor", contributor);
    Map<String, Object> plan = new LinkedHashMap<>();
    plan.put("customerId", Json.truthy(Json.at(user, "purchased", "plan", "customerId")) ? "yes" : null);
    Map<String, Object> purchased = new LinkedHashMap<>();
    purchased.put("plan", plan);
    out.put("purchased", purchased);
    // the player's own part of a running quest: boss damage and items found, both waiting for the day change
    Map<String, Object> quest = new LinkedHashMap<>();
    quest.put("key", Json.at(user, "party", "quest", "key"));
    // an invitation not yet answered: the quest hasn't started (Lines danger)
    quest.put("RSVPNeeded", Json.at(user, "party", "quest", "RSVPNeeded"));
    Map<String, Object> progress = new LinkedHashMap<>();
    progress.put("up", Json.at(user, "party", "quest", "progress", "up"));
    progress.put("collectedItems", Json.at(user, "party", "quest", "progress", "collectedItems"));
    quest.put("progress", progress);
    Map<String, Object> party = new LinkedHashMap<>();
    party.put("quest", quest);
    out.put("party", party);
    out.put("lastCron", Json.at(user, "lastCron"));
    Map<String, Object> gearMap = new LinkedHashMap<>();
    gearMap.put("equipped", Json.at(user, "items", "gear", "equipped"));
    Map<String, Object> items = new LinkedHashMap<>();
    items.put("gear", gearMap);
    Object lastDrop = Json.at(user, "items", "lastDrop");
    if (lastDrop != null) items.put("lastDrop", lastDrop); // kept as is: a missing date and a null one read differently
    out.put("items", items);
    out.put("needsCron", Json.at(user, "needsCron"));
    return out;
  }

  /**
   * The user as read at `at`. A read older than the one kept (the app's report arriving after a newer native read)
   * changes nothing: false then.
   */
  static synchronized boolean save (Context c, Object user, long at) {
    SharedPreferences p = prefs(c);
    if (p.getString("user", null) != null && at < p.getLong("at", 0)) return false;
    p.edit().putString("user", Json.stringify(trim(user))).putString("userSig", signature(user)).putLong("at", at)
        .putBoolean("offline", false).putBoolean("serverTrouble", false).apply();
    return true;
  }

  /** What changes when anything is scored or a day starts: the tasks are read again only after it moved. */
  static String signature (Object user) {
    Object st = Json.at(user, "stats");
    return Json.stringify(java.util.Arrays.asList(Json.at(st, "hp"), Json.at(st, "mp"), Json.at(st, "exp"), Json.at(st, "gp"), Json.at(st, "lvl"), Json.at(user, "needsCron"), Json.at(user, "lastCron")));
  }

  /** The Dailies, read with (or right after) the user whose signature is current. */
  static synchronized void saveTasks (Context c, Object tasks) {
    SharedPreferences p = prefs(c);
    Object id = Json.at(parsed(p.getString("user", null)), "_id");
    p.edit().putString("tasks", Json.stringify(Lines.trimTasks(tasks, id instanceof String ? (String) id : null))).putString("tasksSig", p.getString("userSig", "")).apply();
  }

  /** A tasks read that failed: don't try again until the numbers move. */
  static synchronized void skipTasks (Context c) { SharedPreferences p = prefs(c); p.edit().putString("tasksSig", p.getString("userSig", "")).apply(); }

  /** The party's quest; `readAt` = when it was read (the app re-reads the party every few minutes). */
  static synchronized void saveParty (Context c, Object party, long readAt) {
    prefs(c).edit().putString("party", Json.stringify(Lines.trimParty(party))).putLong("partyAt", readAt).apply();
  }

  static synchronized void skipParty (Context c) { prefs(c).edit().putLong("partyAt", System.currentTimeMillis()).apply(); }

  private static Object parsed (String json) {
    if (json == null) return null;
    try { return Json.parse(json); } catch (RuntimeException e) { return null; }
  }

  /** The player is in a running quest (their own numbers say so), so the party is worth reading. */
  private static boolean inQuest (Object user) { return Json.truthy(Json.at(user, "party", "quest", "key")); }

  /** A line that needs the Dailies is on and they are older than the last change to the numbers. */
  static synchronized boolean tasksWanted (Context c) {
    SharedPreferences p = prefs(c);
    return p.getString("user", null) != null && Lines.needsTasks(Settings.linesOn(c)) && !p.getString("userSig", "").equals(p.getString("tasksSig", null));
  }

  /** A quest line is on, the player is in a running quest, and the party was read before the last read of the user. */
  static synchronized boolean partyWanted (Context c) {
    SharedPreferences p = prefs(c);
    Object user = parsed(p.getString("user", null));
    return user != null && Lines.needsParty(Settings.linesOn(c)) && inQuest(user) && p.getLong("partyAt", 0) < p.getLong("at", 0);
  }

  /** What the notification shows now: lines.ts buildLines on the phone (Lines.build). */
  static Map<String, Object> lines (Context c) {
    SharedPreferences p = prefs(c);
    Object user = TokenStore.has(c) ? parsed(p.getString("user", null)) : null;
    Map<String, Object> in = new LinkedHashMap<>();
    in.put("user", user);
    in.put("tasks", parsed(p.getString("tasks", null)));
    // a party read while the player was in a quest that has since ended says nothing any more
    in.put("party", user != null && inQuest(user) ? parsed(p.getString("party", null)) : null);
    in.put("prefs", Settings.lines(c));
    in.put("night", NightGearJob.info(c));
    long now = System.currentTimeMillis();
    in.put("now", (double) now);
    in.put("readAt", (double) p.getLong("at", 0));
    in.put("offline", p.getBoolean("offline", false));
    // the day changes at dayStart in the account's time zone (cron uses it; this app never moves it), the phone's until a read says
    Object tzo = user == null ? null : Json.at(user, "preferences", "timezoneOffset");
    in.put("tzOffsetMin", tzo instanceof Number && Double.isFinite(((Number) tzo).doubleValue()) ? -((Number) tzo).doubleValue()
      : (double) (ZoneId.systemDefault().getRules().getOffset(Instant.ofEpochMilli(now)).getTotalSeconds() / 60));
    try {
      return VerdictText.withProblem(Lines.build(in, gear(c), items(c)), problem(c));
    } catch (RuntimeException e) {
      in.put("user", null); // unreadable numbers: the "log in" line rather than nothing
      return Lines.build(in, gear(c), items(c));
    }
  }

  static synchronized void setOffline (Context c, boolean offline) { prefs(c).edit().putBoolean("offline", offline).apply(); }

  /** Habitica's last answer to a native call was a server error (5xx), or it answered again. */
  static synchronized void setServerTrouble (Context c, boolean trouble) {
    SharedPreferences p = prefs(c);
    if (p.getBoolean("serverTrouble", false) != trouble) p.edit().putBoolean("serverTrouble", trouble).apply();
  }

  /** What the surfaces add to the line: a refused login, or Habitica failing. */
  static VerdictText.Problem problem (Context c) {
    if (!TokenStore.has(c)) return VerdictText.Problem.NONE;
    if (HabiticaReader.authFailed(c)) return HabiticaReader.blocked(c) ? VerdictText.Problem.BLOCKED : VerdictText.Problem.AUTH;
    return prefs(c).getBoolean("serverTrouble", false) ? VerdictText.Problem.SERVER : VerdictText.Problem.NONE;
  }

  static synchronized void clear (Context c) { prefs(c).edit().clear().apply(); }

  static long at (Context c) { return prefs(c).getLong("at", 0); }

  static VerdictText.Line line (Context c) {
    SharedPreferences p = prefs(c);
    String u = p.getString("user", null);
    long at = p.getLong("at", 0);
    Verdict.Snapshot snap = null;
    if (u != null) {
      try {
        Object user = Json.parse(u);
        snap = Verdict.fromUser(user, gear(c));
        // a day change the phone slept through: the tile and widget say a new day is waiting, as the notification does
        if (!snap.needsCron && Lines.dayChangedSince(user, System.currentTimeMillis())) snap = new Verdict.Snapshot(snap.state, true, snap.unknownGear);
      } catch (RuntimeException e) { snap = null; }
    }
    if (!TokenStore.has(c)) snap = null;
    String clock = DateFormat.getTimeInstance(DateFormat.SHORT).format(new Date(at));
    return VerdictText.line(snap, System.currentTimeMillis() - at, p.getBoolean("offline", false), clock, problem(c));
  }

  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
