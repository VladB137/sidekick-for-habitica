package io.github.critoracle.verdict;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * What the ongoing notification shows: the lines the player picked, worked out from the last read.
 * A line-by-line port of src/app/lines.ts (the app's live preview), checked by LinesTest against
 * vectors that file exports. Input and output are the same JSON shapes on both sides:
 * input {user, tasks, party, prefs, night, now, readAt, offline, tzOffsetMin};
 * output {look, title, text, rows: [{id, icon, text, tone, bars?: [{label?, value, max}]}], footer}.
 */
public final class Lines {
  private Lines () {}

  /** Every line in the default order, with its icon (the drawable is ic_line_&lt;icon&gt;). */
  public static final List<String> IDS = Arrays.asList("crit", "danger", "invite", "dailies", "streaks", "countdown", "boss", "collect", "drops", "bars", "points", "saving", "night");
  /** The lines on for a new install (lines.ts LINES `on`). */
  public static final List<String> DEFAULT_ON = Arrays.asList("crit", "danger", "invite", "countdown", "bars", "points", "saving", "night");
  public static final int MAX_ROWS = 6;
  public static final long DAILIES_URGENT_MS = 4 * 3600_000L;
  static final double MAX_HEALTH = 50;
  static final double LOW_HP = 10;
  static final double MIN_TASK_VALUE = -47.27, MAX_TASK_VALUE = 21.27;

  static String icon (String id) {
    switch (id) {
      case "crit": return "bolt";
      case "danger": return "warning";
      case "invite": return "mail";
      case "drops": return "egg";
      case "streaks": return "local_fire_department";
      case "dailies": return "today";
      case "countdown": return "schedule";
      case "boss": return "whatshot";
      case "collect": return "redeem";
      case "bars": return "favorite";
      case "points": return "add_circle";
      case "saving": return "savings";
      case "night": return "bedtime";
      default: return "bolt";
    }
  }

  /** Lines that need GET /tasks/user. */
  public static boolean needsTasks (List<String> on) { return on.contains("dailies") || on.contains("danger") || on.contains("streaks"); }
  /** Lines that need GET /groups/party (read only while a quest runs). */
  public static boolean needsParty (List<String> on) { return on.contains("boss") || on.contains("collect"); }

  /* ---------------------------------------------------------- what is kept from each read */

  /** lines.ts trimTasks: the Dailies of GET /tasks/user, with what the day change counts. */
  public static List<Object> trimTasks (Object tasks, String userId) {
    List<Object> out = new ArrayList<>();
    if (!(tasks instanceof List)) return out;
    for (Object t : (List<?>) tasks) {
      if (!"daily".equals(Json.at(t, "type"))) continue;
      Map<String, Object> m = new LinkedHashMap<>();
      Object text = Json.at(t, "text");
      boolean group = Json.truthy(Json.at(t, "group")) && Json.truthy(Json.at(t, "group", "id")) || Boolean.TRUE.equals(Json.at(t, "team")) || Boolean.TRUE.equals(Json.at(t, "group"));
      Object mine = group && userId != null && !userId.isEmpty() ? Json.at(t, "group", "assignedUsersDetail", userId) : null;
      Object list = Json.at(t, "checklist");
      double done = 0, total = 0;
      if (list instanceof List) { for (Object c : (List<?>) list) { total++; if (Boolean.TRUE.equals(Json.at(c, "completed"))) done++; } }
      else { done = Json.num(Json.at(t, "checklistDone"), 0); total = Json.num(Json.at(t, "checklistTotal"), 0); }
      m.put("type", "daily");
      m.put("text", text instanceof String ? text : "");
      m.put("isDue", Boolean.TRUE.equals(Json.at(t, "isDue")));
      m.put("completed", Json.truthy(mine) ? Boolean.TRUE.equals(Json.at(mine, "completed")) : Boolean.TRUE.equals(Json.at(t, "completed")));
      m.put("value", Json.num(Json.at(t, "value"), 0));
      m.put("priority", Json.num(Json.at(t, "priority"), 1));
      m.put("checklistDone", done);
      m.put("checklistTotal", total);
      m.put("group", group);
      // on the team board (no userId): never in the player's own day change (lines.ts)
      m.put("board", Json.truthy(Json.at(t, "group")) && Json.truthy(Json.at(t, "group", "id")) && !Json.truthy(Json.at(t, "userId")) || Boolean.TRUE.equals(Json.at(t, "board")));
      m.put("streak", Json.num(Json.at(t, "streak"), 0));
      m.put("shared", Json.truthy(Json.at(t, "challenge")) && Json.truthy(Json.at(t, "challenge", "id")) || group || Boolean.TRUE.equals(Json.at(t, "shared")));
      out.add(m);
    }
    return out;
  }

  /** lines.ts trimParty: the quest of GET /groups/party. */
  public static Object trimParty (Object party) {
    Map<String, Object> out = new LinkedHashMap<>();
    Object q = Json.at(party, "quest");
    if (!(q instanceof Map)) { out.put("quest", null); return out; }
    Map<String, Object> collect = new LinkedHashMap<>();
    Object c = Json.at(q, "progress", "collect");
    if (c instanceof Map) for (Map.Entry<?, ?> e : ((Map<?, ?>) c).entrySet()) if (e.getValue() instanceof Double) collect.put(String.valueOf(e.getKey()), e.getValue());
    Map<String, Object> progress = new LinkedHashMap<>();
    Object hp = Json.at(q, "progress", "hp");
    progress.put("hp", hp instanceof Double ? hp : null);
    progress.put("collect", collect);
    Map<String, Object> quest = new LinkedHashMap<>();
    Object key = Json.at(q, "key");
    quest.put("key", key instanceof String ? key : null);
    quest.put("active", Boolean.TRUE.equals(Json.at(q, "active")));
    quest.put("progress", progress);
    out.put("quest", quest);
    return out;
  }

  /* ---------------------------------------------------------- formatting, identical to lines.ts */

  private static String dec1 (double x) { return new BigDecimal(Math.max(0, x)).setScale(1, RoundingMode.HALF_UP).toPlainString(); }
  private static String integer (double x) { return Long.toString((long) Math.floor(Math.max(0, x))); }
  private static String two (long n) { return n < 10 ? "0" + n : Long.toString(n); }
  private static String hhmm (long m) { return two((m / 60) % 24) + ":" + two(m % 60); }

  public static String duration (long ms) {
    long min = Math.floorDiv(ms, 60_000L);
    if (min < 1) return "under a minute";
    long h = min / 60, m = min % 60;
    return h == 0 ? m + " min" : m == 0 ? h + " h" : h + " h " + m + " min";
  }

  public static String ago (long ms) {
    long s = Math.max(0, ms) / 1000;
    if (s < 45) return "just now";
    if (s < 90) return "1 min ago";
    if (s < 3600) return (s + 30) / 60 + " min ago";
    if (s < 86400) return s / 3600 + " h ago";
    return s / 86400 + " d ago";
  }

  public static long untilDayChange (long now, long tzOffsetMin, long dayStart) {
    long day = 86_400_000L;
    long into = Math.floorMod(now + tzOffsetMin * 60_000L, day);
    long start = dayStart * 3_600_000L;
    return into < start ? start - into : day - into + start;
  }

  private static final Pattern IMAGE = Pattern.compile("!\\[[^\\]]*\\]\\([^)]*\\)");
  private static final Pattern LINK = Pattern.compile("\\[([^\\]]*)\\]\\([^)]*\\)");
  private static final Pattern MARKS = Pattern.compile("[*_~`#>]+");
  private static final Pattern EMOJI = Pattern.compile(":([a-z0-9_+-]+):");

  /** dom.ts plain(): the most common Markdown stripped. */
  public static String plain (String s) {
    String t = IMAGE.matcher(s).replaceAll("");
    t = LINK.matcher(t).replaceAll("$1");
    t = MARKS.matcher(t).replaceAll("");
    t = EMOJI.matcher(t).replaceAll("");
    return jsTrim(t);
  }

  private static boolean jsSpace (char c) {
    return c == ' ' || c == '\t' || c == '\n' || c == '\u000B' || c == '\f' || c == '\r' || c == ' ' || c == ' '
        || (c >= ' ' && c <= ' ') || c == ' ' || c == ' ' || c == ' ' || c == ' ' || c == '　' || c == '﻿';
  }

  private static String jsTrim (String s) {
    int a = 0, b = s.length();
    while (a < b && jsSpace(s.charAt(a))) a++;
    while (b > a && jsSpace(s.charAt(b - 1))) b--;
    return s.substring(a, b);
  }

  /* ---------------------------------------------------------- the lines */

  private static Map<String, Object> row (String id, String icon, String text, String tone) {
    Map<String, Object> r = new LinkedHashMap<>();
    r.put("id", id); r.put("icon", icon); r.put("text", text); r.put("tone", tone);
    return r;
  }

  private static Map<String, Object> bar (String label, double value, double max) {
    Map<String, Object> b = new LinkedHashMap<>();
    if (label != null) b.put("label", label);
    b.put("value", value); b.put("max", max);
    return b;
  }

  private static List<Object> bars (Map<String, Object> b) { List<Object> l = new ArrayList<>(); l.add(b); return l; }

  private static double toNextLevel (double lvl) {
    if (lvl < 5) return 25 * lvl;
    if (lvl == 5) return 150;
    return Math.round((lvl * lvl * 0.25 + 10 * lvl + 139.75) / 10) * 10;
  }

  /** @param items parsed src/data/items.json (bossQuests, collectQuests) */
  public static Map<String, Object> build (Object input, GearTable gear, Object items) {
    Object user = Json.at(input, "user");
    Object prefs = Json.at(input, "prefs");
    long now = (long) Json.num(Json.at(input, "now"), 0);
    long readAt = (long) Json.num(Json.at(input, "readAt"), 0);
    boolean offline = Boolean.TRUE.equals(Json.at(input, "offline"));
    long tz = (long) Json.num(Json.at(input, "tzOffsetMin"), 0);
    String footer = readAt <= 0 ? "Not read yet" : (offline ? "Offline · read " : "Read ") + ago(now - readAt);
    Map<String, Object> out = new LinkedHashMap<>();
    if (!(user instanceof Map)) {
      String text = "Open Sidekick and log in with “Remember on this device”.";
      List<Object> rows = new ArrayList<>();
      rows.add(row("crit", "bolt", text, "normal"));
      out.put("look", "NONE"); out.put("title", "Sidekick for Habitica"); out.put("text", text); out.put("rows", rows); out.put("footer", footer);
      return out;
    }
    Verdict.Snapshot snap = Verdict.fromUser(user, gear);
    Verdict.State s = snap.state;
    boolean dayDue = snap.needsCron || dayChangedSince(user, now);
    long age = now - readAt;
    boolean fresh = !offline && age >= 0 && age <= VerdictText.FRESH_MS;
    boolean dead = s.hp <= 0;
    long dayStart = (long) Math.min(23, Math.max(0, Math.floor(Json.num(Json.at(user, "preferences", "dayStart"), 0))));
    long untilDay = untilDayChange(now, tz, dayStart);

    Verdict.Result v = Verdict.verdicts(s);
    Verdict.Roll task = v.task();
    String look = offline ? "OFFLINE" : fresh ? "LIVE" : "CHECKING";
    String critText;
    if (dead) critText = "Out of HP: open Habitica to recover";
    else if (dayDue) critText = "New day waiting: crits show once it starts";
    else if (fresh) {
      critText = task.crit ? "Next task: CRIT " + VerdictText.mult(task.mult) : "Next task: no crit (" + VerdictText.pct(task.chance) + ")";
      for (int i = 1; i < v.rolls.size(); i++) {
        Verdict.Roll r = v.rolls.get(i);
        if (r.available && r.crit) critText += " · " + r.name + " CRIT " + VerdictText.mult(r.mult);
      }
      if (task.crit) look = "CRIT";
    } else {
      critText = (offline ? "Offline" : "Checking") + ": next task was " + (task.crit ? "a crit " + VerdictText.mult(task.mult) : "no crit (" + VerdictText.pct(task.chance) + ")");
    }
    if (!snap.unknownGear.isEmpty() && !dead && !dayDue) critText += " · some gear unknown";

    Object quest = Json.at(input, "party", "quest");
    Object questKey = Json.at(quest, "key");
    Object mine = Json.truthy(questKey) && questKey.equals(Json.at(user, "party", "quest", "key")) ? Json.at(user, "party", "quest", "progress") : null;
    boolean questActive = Boolean.TRUE.equals(Json.at(quest, "active"));
    Object tasks = Json.at(input, "tasks");

    List<Map<String, Object>> built = new ArrayList<>();
    int dailiesLeft = 0;
    boolean deadly = false;
    List<Object> open = new ArrayList<>();
    if (tasks instanceof List) for (Object t : (List<?>) tasks) {
      if ("daily".equals(Json.at(t, "type")) && Boolean.TRUE.equals(Json.at(t, "isDue")) && !Boolean.TRUE.equals(Json.at(t, "completed"))) open.add(t);
    }
    // the ones the day change counts: the team board's never reach the player's own (lines.ts)
    List<Object> own = new ArrayList<>();
    for (Object t : open) if (!Boolean.TRUE.equals(Json.at(t, "board"))) own.add(t);
    Object on = Json.at(prefs, "lines");
    List<String> ids = new ArrayList<>();
    if (on instanceof List) for (Object o : (List<?>) on) if (o instanceof String && IDS.contains(o) && !ids.contains(o)) ids.add((String) o);
    for (String id : ids) {
      String icon = icon(id);
      Map<String, Object> r = null;
      switch (id) {
        case "crit":
          r = row(id, icon, critText, look.equals("CRIT") ? "crit" : "normal");
          break;
        case "invite": {
          // an invitation not yet answered (lines.ts): the quest waits for everyone's answer
          if (!Boolean.TRUE.equals(Json.at(user, "party", "quest", "RSVPNeeded"))) break;
          Object ik = Json.at(user, "party", "quest", "key");
          Object q = ik instanceof String ? Json.at(items, "bossQuests", (String) ik) : null;
          if (!(q instanceof List) && ik instanceof String) q = Json.at(items, "collectQuests", (String) ik);
          Object name = q instanceof List && !((List<?>) q).isEmpty() ? ((List<?>) q).get(0) : null;
          r = row(id, icon, "Quest invitation waiting in Habitica" + (name instanceof String ? ": " + name : ""), "normal");
          break;
        }
        case "dailies": {
          if (!(tasks instanceof List) || dayDue) break;
          List<String> names = new ArrayList<>();
          for (Object t : open) names.add(taskName(t));
          dailiesLeft = names.size();
          r = names.isEmpty() ? row(id, "task_alt", "All Dailies done", "normal")
              : row(id, icon, names.size() + " " + (names.size() == 1 ? "Daily" : "Dailies") + " left: " + String.join(", ", names), "normal");
          break;
        }
        case "danger": {
          if (!(tasks instanceof List) || dayDue || dead) break;
          List<double[]> missed = new ArrayList<>();
          for (Object t : own) missed.add(new double[] { Json.num(Json.at(t, "value"), 0), Json.num(Json.at(t, "priority"), 1),
              Json.num(Json.at(t, "checklistDone"), 0), Json.num(Json.at(t, "checklistTotal"), 0), Boolean.TRUE.equals(Json.at(t, "group")) ? 1 : 0 });
          Object bk = Json.at(user, "party", "quest", "key");
          // a quest only hits once it runs (lines.ts): the party's read, else an invitation not yet answered
          boolean running = quest != null && Json.truthy(bk) && bk.equals(Json.at(quest, "key"))
              ? Boolean.TRUE.equals(Json.at(quest, "active"))
              : !Boolean.TRUE.equals(Json.at(user, "party", "quest", "RSVPNeeded"));
          Object boss = running && bk instanceof String ? Json.at(items, "bossQuests", (String) bk) : null;
          double bossStr = boss instanceof List ? (((List<?>) boss).size() > 3 && ((List<?>) boss).get(3) != null ? Json.num(((List<?>) boss).get(3), 0) : 1) : 0;
          double stealth = Json.num(Json.at(user, "stats", "buffs", "stealth"), 0);
          if (Json.truthy(Json.at(user, "preferences", "sleep"))) break; // resting in the Inn: no damage
          double con = Verdict.totals(s).con;
          double hpAfter = dayChange(s.hp, con, missed, stealth, bossStr)[2];
          List<Object> hb = bars(bar(null, Math.round(Math.max(0, hpAfter) * 100) / 100.0, MAX_HEALTH)); // 2 decimals: pow's last bit differs from V8's
          if (hpAfter > 0) {
            if (hpAfter <= LOW_HP) { r = row(id, icon, "Day change leaves you " + integer(Math.ceil(hpAfter)) + " HP", "normal"); r.put("bars", hb); }
            break;
          }
          deadly = true;
          // fewest Dailies, costliest first (engine dayChangeDanger)
          List<double[]> order = new ArrayList<>();
          for (int i = 0; i < missed.size(); i++) {
            double[] one = dayChange(s.hp, con, java.util.Collections.singletonList(missed.get(i)), 0, bossStr);
            order.add(new double[] { i, one[0] + one[1] });
          }
          order.sort((a, b) -> Double.compare(b[1], a[1]));
          List<Integer> first = null;
          for (int n = 1; n <= order.size(); n++) {
            java.util.Set<Integer> doneSet = new java.util.HashSet<>();
            for (int k = 0; k < n; k++) doneSet.add((int) order.get(k)[0]);
            List<double[]> rest = new ArrayList<>();
            for (int i = 0; i < missed.size(); i++) if (!doneSet.contains(i)) rest.add(missed.get(i));
            if (dayChange(s.hp, con, rest, stealth, bossStr)[2] > 0) {
              first = new ArrayList<>();
              for (int k = 0; k < n; k++) first.add((int) order.get(k)[0]);
              break;
            }
          }
          // finishing them all always leaves HP above 0 (only the player's own misses count here); kept as the engine has it
          String fix = "pause damage in Habitica";
          if (first != null) {
            List<String> names = new ArrayList<>();
            for (int i : first) names.add(taskName(own.get(i)));
            fix = "finish " + String.join(", ", names);
          }
          r = row(id, icon, "Day change takes all your HP: " + fix, "danger");
          r.put("bars", hb);
          break;
        }
        case "drops": {
          double[] d = dropsLeft(user, Verdict.totals(s).per, now);
          r = row(id, icon, d[0] > 0 ? integer(d[0]) + " of " + integer(d[1]) + " item drops left today" : "No item drops left today (" + integer(d[1]) + " a day)", "normal");
          r.put("bars", bars(bar(null, d[0], d[1])));
          break;
        }
        case "streaks": {
          if (!(tasks instanceof List) || dayDue) break;
          boolean sleeping = Json.truthy(Json.at(user, "preferences", "sleep"));
          boolean frost = Json.truthy(Json.at(user, "stats", "buffs", "streaks"));
          double stealth = Json.num(Json.at(user, "stats", "buffs", "stealth"), 0);
          // engine streaksLost: the streaks the day change certainly resets (Inn, Chilling Frost or any Stealth cover the rest), longest first
          List<Object[]> lost = new ArrayList<>();
          for (Object t : own) {
            double streak = Json.num(Json.at(t, "streak"), 0);
            if (!(streak > 0)) continue;
            boolean shared = Boolean.TRUE.equals(Json.at(t, "shared"));
            boolean covered = sleeping || (frost && !shared) || stealth > 0;
            if (!covered) lost.add(new Object[] { t, streak });
          }
          if (lost.isEmpty()) break;
          lost.sort((a, b) -> Double.compare((Double) b[1] - (Double) a[1], 0));
          List<String> names = new ArrayList<>();
          for (Object[] x : lost) names.add(taskName(x[0]) + " (" + integer((Double) x[1]) + ")");
          r = row(id, icon, lost.size() + " " + (lost.size() == 1 ? "streak" : "streaks") + " at risk: " + String.join(", ", names), "normal");
          break;
        }
        case "countdown":
          r = row(id, icon, dayDue ? "New day waiting: open Habitica to start it" : "New day in " + duration(untilDay), "normal");
          break;
        case "boss": {
          Object b = questActive && questKey instanceof String ? Json.at(items, "bossQuests", (String) questKey) : null;
          if (!(b instanceof List)) break;
          List<?> bl = (List<?>) b;
          double max = Json.num(bl.get(1), 0);
          double hp = Json.num(Json.at(quest, "progress", "hp"), max);
          double hit = Json.num(Json.at(mine, "up"), 0);
          String name = bl.size() > 2 && Json.truthy(bl.get(2)) ? String.valueOf(bl.get(2)) : String.valueOf(bl.get(0));
          r = row(id, icon, name + ": " + integer(Math.ceil(hp)) + " / " + integer(max) + " HP" + (hit > 0 ? " · your hit waiting " + dec1(hit) : ""), "normal");
          r.put("bars", bars(bar(null, Math.max(0, hp), max)));
          break;
        }
        case "collect": {
          Object c = questActive && questKey instanceof String ? Json.at(items, "collectQuests", (String) questKey) : null;
          if (!(c instanceof List) || !(((List<?>) c).get(1) instanceof Map)) break;
          double found = 0, total = 0;
          for (Map.Entry<?, ?> e : ((Map<?, ?>) ((List<?>) c).get(1)).entrySet()) {
            double count = Json.num(((List<?>) e.getValue()).get(1), 0);
            found += Math.min(count, Json.num(Json.at(quest, "progress", "collect", String.valueOf(e.getKey())), 0));
            total += count;
          }
          long more = (long) Math.floor(Json.num(Json.at(mine, "collectedItems"), 0));
          r = row(id, icon, integer(found) + " / " + integer(total) + " items found" + (more > 0 ? " · " + more + " more " + (Json.truthy(Json.at(user, "preferences", "sleep")) ? "when you leave the Inn" : "at your day change") : ""), "normal");
          r.put("bars", bars(bar(null, found, total)));
          break;
        }
        case "bars": {
          Object sm = Json.at(user, "stats", "maxMP"), st = Json.at(user, "stats", "toNextLevel");
          double maxMP = sm instanceof Double && (Double) sm > 0 ? (Double) sm : Verdict.totals(s).intel * 2 + 30;
          double tnl = st instanceof Double && (Double) st > 0 ? (Double) st : toNextLevel(s.lvl);
          List<Object> three = new ArrayList<>();
          three.add(bar("HP " + integer(Math.ceil(s.hp)) + " / " + integer(MAX_HEALTH), Math.max(0, s.hp), MAX_HEALTH));
          three.add(bar("MP " + integer(s.mp) + " / " + integer(maxMP), Math.max(0, s.mp), maxMP));
          three.add(bar("XP " + integer(s.exp) + " / " + integer(tnl), Math.max(0, s.exp), tnl));
          List<String> labels = new ArrayList<>();
          for (Object b : three) labels.add((String) ((Map<?, ?>) b).get("label"));
          r = row(id, icon, String.join(" · ", labels), "normal");
          r.put("bars", three);
          break;
        }
        case "points": {
          long p = (long) Math.floor(Json.num(Json.at(user, "stats", "points"), 0));
          if (p < 1 || !s.classSelected) break;
          Object to = Json.at(prefs, "allocateTo");
          r = row(id, icon, p + " stat " + (p == 1 ? "point" : "points") + " to spend" + (Json.truthy(to) && to instanceof String ? " on " + ((String) to).toUpperCase(java.util.Locale.ROOT) : ""), "normal");
          break;
        }
        case "saving": {
          Object sv = Json.at(prefs, "savingFor");
          double price = Json.num(Json.at(sv, "price"), 0);
          if (!(sv instanceof Map) || !(price > 0)) break;
          String name = String.valueOf(Json.at(sv, "name"));
          double gp = Math.max(0, s.gp);
          r = row(id, icon, gp >= price ? name + ": ready to buy (" + integer(price) + " Gold)" : name + ": " + integer(gp) + " / " + integer(price) + " Gold", "normal");
          r.put("bars", bars(bar(null, Math.min(gp, price), price)));
          break;
        }
        case "night": {
          Object n = Json.at(input, "night");
          if (!(n instanceof Map)) break;
          Object ph = Json.at(n, "phase");
          String p = ph instanceof String ? (String) ph : "";
          if (p.equals("read") || p.equals("tasks") || p.equals("equip")) r = row(id, icon, "Night gear: putting it on", "normal");
          else if (p.equals("swapped")) r = row(id, icon, Boolean.TRUE.equals(Json.at(n, "backOn")) ? "Night gear on · your gear goes back at " + hhmm((long) Json.num(Json.at(n, "backAt"), 0)) + " or after the new day" : "Night gear on", "normal");
          else if (p.equals("back")) r = row(id, icon, "Night gear: putting your gear back", "normal");
          else if (Boolean.TRUE.equals(Json.at(n, "on"))) {
            Object m = Json.at(n, "mode");
            String which = "int".equals(m) ? "INT night gear" : "con".equals(m) ? "CON night gear" : "Night gear";
            r = row(id, icon, which + " goes on at " + hhmm((long) Json.num(Json.at(n, "swapAt"), 0)), "normal");
          }
          break;
        }
        default: break;
      }
      if (r != null) built.add(r);
    }

    List<Map<String, Object>> rows = new ArrayList<>(built);
    if ("auto".equals(Json.at(prefs, "order"))) {
      // most urgent first: a crit or being out of HP, then Dailies still open late in the day; the rest as chosen (stable)
      final String lk = look;
      final int left = dailiesLeft;
      final boolean kills = deadly;
      rows.sort((a, b) -> Integer.compare(urgency(a, lk, dead, kills, left, untilDay), urgency(b, lk, dead, kills, left, untilDay)));
    }
    if (rows.size() > MAX_ROWS) rows = new ArrayList<>(rows.subList(0, MAX_ROWS));
    boolean critShown = false;
    for (Map<String, Object> r : rows) if ("crit".equals(r.get("id"))) critShown = true;
    if (look.equals("CRIT") && !critShown) look = "LIVE";
    out.put("look", look);
    out.put("title", rows.isEmpty() ? "Sidekick for Habitica" : rows.get(0).get("text"));
    out.put("text", rows.size() < 2 ? footer : rows.get(1).get("text"));
    out.put("rows", new ArrayList<Object>(rows));
    out.put("footer", footer);
    return out;
  }

  private static int urgency (Map<String, Object> r, String look, boolean dead, boolean deadly, int dailiesLeft, long untilDay) {
    Object id = r.get("id");
    if ("danger".equals(id) && deadly) return 0;
    if ("crit".equals(id) && (look.equals("CRIT") || dead)) return 1;
    if (("dailies".equals(id) && dailiesLeft > 0 || "streaks".equals(id)) && untilDay <= DAILIES_URGENT_MS) return 2;
    return 3;
  }

  private static String taskName (Object t) {
    Object text = Json.at(t, "text");
    return plain(text instanceof String ? (String) text : text == null ? "" : String.valueOf(text));
  }

  /**
   * engine dayChange (classplan.ts): {hpLoss, bossLoss, hpAfter} for missed Dailies {value, priority, checklistDone,
   * checklistTotal, group 0/1}. With Stealth the largest losses stay (worst case).
   */
  static double[] dayChange (double hp, double con, List<double[]> missed, double stealth, double bossStr) {
    double evaded = Math.min(stealth, missed.size());
    double conBonus = 1 - con / 250;
    if (conBonus < 0.1) conBonus = 0.1;
    List<double[]> each = new ArrayList<>();
    for (double[] d : missed) {
      double v = d[0] < MIN_TASK_VALUE ? MIN_TASK_VALUE : d[0] > MAX_TASK_VALUE ? MAX_TASK_VALUE : d[0];
      double delta = -StrictMath.pow(0.9747, v);
      if (d[3] > 0) delta *= 1 - d[2] / d[3];
      double h = 0;
      if (d[4] == 0) {
        double hpMod = delta * conBonus * d[1] * 2;
        h = hpMod > -1 ? -1 : Math.ceil(hpMod);
      }
      each.add(new double[] { h, delta * (d[1] < 1 ? d[1] : 1) });
    }
    List<double[]> left = each;
    if (evaded != 0 && !Double.isNaN(evaded)) {
      left = new ArrayList<>(each);
      left.sort((a, b) -> Double.compare(a[0] - b[0], 0));
      double end = each.size() - evaded;
      int keep = (int) Math.max(0, Math.min(left.size(), end < 0 ? Math.ceil(end) : Math.floor(end)));
      left = new ArrayList<>(left.subList(0, keep));
    }
    double hpSum = 0, down = 0;
    for (double[] x : left) hpSum += x[0];
    for (double[] x : left) down += x[1];
    double hpLoss = -hpSum;
    double bossLoss = bossStr != 0 && !Double.isNaN(bossStr) ? -down * bossStr : 0;
    return new double[] { hpLoss, bossLoss, hp - hpLoss - bossLoss };
  }

  /** engine dropsLeft over model.ts dropAccount: {left, cap}. */
  static double[] dropsLeft (Object user, double per, long now) {
    Object ld = Json.at(user, "items", "lastDrop");
    Map<?, ?> last = Json.truthy(ld) && ld instanceof Map ? (Map<?, ?>) ld : new LinkedHashMap<>();
    double contributor = Json.num(Json.at(user, "contributor", "level"), 0);
    boolean subscribed = Json.truthy(Json.at(user, "purchased", "plan", "customerId"));
    double dayStart = Json.num(Json.at(user, "preferences", "dayStart"), 0);
    Object tzo = Json.at(user, "preferences", "timezoneOffset");
    Double tz = tzo instanceof Double ? (Double) tzo : null;
    double cap = (subscribed ? 2 : 1) * (5 + Math.floor(per / 25) + contributor);
    double used;
    Object date = last.get("date");
    double count = Json.num(last.get("count"), 0);
    if (last.containsKey("date") && date == null) used = 0;
    else {
      double at = !last.containsKey("date") ? now : dateMs(date);
      used = Double.isNaN(at) || Double.isInfinite(at) ? 0 : gameDay(at, dayStart, tz) == gameDay(now, dayStart, tz) ? count : 0;
    }
    return new double[] { Math.max(0, cap - used), cap };
  }

  /** new Date(v).getTime() for the shapes a JSON date takes (ISO strings, numbers); NaN otherwise. */
  static double dateMs (Object v) {
    if (v instanceof Double) {
      double x = (Double) v;
      return Math.abs(x) > 8.64e15 || Double.isNaN(x) ? Double.NaN : (x < 0 ? Math.ceil(x) : Math.floor(x));
    }
    if (v instanceof String) {
      try { return java.time.OffsetDateTime.parse((String) v).toInstant().toEpochMilli(); } catch (RuntimeException e) { return Double.NaN; }
    }
    return Double.NaN;
  }

  /**
   * lines.ts dayChangedSince: Habitica's day changed after the read's last day change (the phone slept through it),
   * so a new day is waiting whatever that read said.
   */
  public static boolean dayChangedSince (Object user, long now) {
    Object lc = Json.at(user, "lastCron");
    double lastCron = lc instanceof String && ((String) lc).matches("^\\d{4}-\\d\\d-\\d\\dT.*") ? dateMs(lc) : Double.NaN;
    if (Double.isNaN(lastCron)) return false;
    Object tzo = Json.at(user, "preferences", "timezoneOffset");
    Double tz = tzo instanceof Double ? (Double) tzo : null;
    double dayStart = Json.num(Json.at(user, "preferences", "dayStart"), 0);
    return gameDay(now, dayStart, tz) > gameDay(lastCron, dayStart, tz);
  }

  /** drops.ts gameDay (cron.js startOfDay) as a day number. */
  static double gameDay (double at, double dayStart, Double timezoneOffset) {
    double ds = dayStart >= 0 && dayStart <= 24 ? dayStart : 0;
    double tz = timezoneOffset != null && !timezoneOffset.isNaN() && !timezoneOffset.isInfinite() ? -timezoneOffset : 0;
    if (tz < -720 || tz > 840) tz = 0;
    if (tz > -16 && tz < 16) tz *= 60;
    double local = at + tz * 6e4;
    double day = Math.floor(local / 864e5);
    double hour = Math.floor((local - day * 864e5) / 36e5);
    if (hour < ds) day -= 1;
    return day;
  }
}
