package io.github.critoracle.verdict;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The verdict in words for the notification, widget and tile, in the app's own phrasing
 * (src/app/views/now.ts, src/app/ui/dom.ts fmt). Kept here so it is tested with the numbers.
 */
public final class VerdictText {
  private VerdictText () {}

  /** Numbers count as current (Live) this long after a read, as in store.ts FRESH_MS. */
  public static final long FRESH_MS = 90_000;

  /** fmt.mult: "×" + toFixed(2). toFixed rounds the exact binary value half up, as BigDecimal(double) does. */
  public static String mult (double m) { return "×" + new BigDecimal(m).setScale(2, RoundingMode.HALF_UP).toPlainString(); }

  /** fmt.pct with one decimal. */
  public static String pct (double x) { return new BigDecimal(x * 100).setScale(1, RoundingMode.HALF_UP).toPlainString() + "%"; }

  public enum Look { LIVE, CRIT, CHECKING, OFFLINE, NONE }

  /**
   * What stands between the phone and fresh numbers, besides their age: Habitica refused the remembered login (401),
   * Habitica refused the app itself (403: the client or the connection blocked), or its last answer was a server
   * error (5xx).
   */
  public enum Problem { NONE, AUTH, BLOCKED, SERVER }

  public static final String AUTH_TITLE = "Log in again";
  public static final String AUTH_TEXT = "Habitica no longer accepts your login. Open the app to connect again.";
  public static final String BLOCKED_TITLE = "Stopped by Habitica";
  public static final String BLOCKED_TEXT = "Habitica refused Sidekick’s calls, so it stopped reading. Open the app for Habitica’s message.";
  public static final String SERVER_HINT = "Habitica isn’t answering";

  public static final class Line {
    /** short, for the tile label and the notification title */
    public final String title;
    /** one sentence for the notification and widget body */
    public final String text;
    public final Look look;
    /** the tile's second line: what the line is about, or what a tap can do */
    public final String subtitle;
    Line (String title, String text, Look look, String subtitle) { this.title = title; this.text = text; this.look = look; this.subtitle = subtitle; }
  }

  public static Line line (Verdict.Snapshot snap, long ageMs, boolean offline, String readAt) { return line(snap, ageMs, offline, readAt, Problem.NONE); }

  /**
   * @param snap the last read, or null when nothing has been read yet
   * @param ageMs how long ago it was read
   * @param offline the last attempt to read failed for lack of a connection
   * @param readAt clock text of the read ("10:42"), for the past-tense line
   * @param problem a refused login replaces the line; a server error is mentioned once the numbers are old
   */
  public static Line line (Verdict.Snapshot snap, long ageMs, boolean offline, String readAt, Problem problem) {
    if (snap == null) return new Line("Sidekick for Habitica", "Open Sidekick and log in with “Remember on this device”.", Look.NONE, "Log in");
    if (problem == Problem.AUTH) return new Line(AUTH_TITLE, AUTH_TEXT, Look.NONE, "Open the app");
    if (problem == Problem.BLOCKED) return new Line(BLOCKED_TITLE, BLOCKED_TEXT, Look.NONE, "Open the app");
    boolean fresh = !offline && ageMs >= 0 && ageMs <= FRESH_MS;
    // older numbers: say what the last read showed, in the past tense, never as a call to act
    String staleTitle = offline ? "Offline" : "Checking…";
    Look staleLook = offline ? Look.OFFLINE : Look.CHECKING;
    String staleSub = offline ? "Offline" : problem == Problem.SERVER ? "Not answering" : "Tap to read";
    String at = (offline ? "Offline. " : "") + "At " + readAt + " ";
    String hint = !offline && problem == Problem.SERVER ? " " + SERVER_HINT + "." : "";
    if (snap.dead()) {
      return fresh ? new Line("Out of HP", "You’re out of HP. Open Habitica to recover.", Look.LIVE, "Open Habitica")
          : new Line(staleTitle, at + "you were out of HP." + hint, staleLook, staleSub);
    }
    if (snap.needsCron) {
      return fresh ? new Line("New day", "A new Habitica day is waiting to start. Sidekick shows the next crit once it has.", Look.LIVE, "Open Habitica")
          : new Line(staleTitle, at + "a new Habitica day was waiting to start." + hint, staleLook, staleSub);
    }
    Verdict.Result r = Verdict.verdicts(snap.state);
    Verdict.Roll task = r.task();
    String taskWords = task.crit ? "CRIT " + mult(task.mult) : "no crit (chance " + pct(task.chance) + ")";
    StringBuilder skills = new StringBuilder();
    for (int i = 1; i < r.rolls.size(); i++) {
      Verdict.Roll k = r.rolls.get(i);
      if (!k.available || !k.crit) continue;
      skills.append(" · ").append(k.name).append(": CRIT ").append(mult(k.mult));
    }
    String gear = snap.unknownGear.isEmpty() ? "" : " Unknown gear: crit chances may be off.";
    if (fresh) {
      return new Line(task.crit ? "CRIT " + mult(task.mult) : "No crit",
          "Next task: " + taskWords + skills + "." + gear, task.crit ? Look.CRIT : Look.LIVE, "Next task");
    }
    String past = task.crit ? "a crit " + mult(task.mult) : "no crit (chance " + pct(task.chance) + ")";
    return new Line(staleTitle, at + "your next task was " + past + "." + gear + hint, staleLook, staleSub);
  }

  /**
   * The notification's lines (Lines.build) with a problem the app's preview never has: a refused login replaces
   * them with one line, and a server error is added to the "Read … ago" footer once the lines say Checking.
   */
  public static Map<String, Object> withProblem (Map<String, Object> lines, Problem problem) {
    if (problem == Problem.NONE || "NONE".equals(lines.get("look"))) return lines;
    Map<String, Object> out = new LinkedHashMap<>(lines);
    if (problem == Problem.AUTH || problem == Problem.BLOCKED) {
      out.put("look", "NONE");
      out.put("title", problem == Problem.AUTH ? AUTH_TITLE : BLOCKED_TITLE);
      out.put("text", problem == Problem.AUTH ? AUTH_TEXT : BLOCKED_TEXT);
      out.put("rows", new ArrayList<Object>());
      return out;
    }
    if ("CHECKING".equals(lines.get("look"))) {
      String footer = String.valueOf(lines.get("footer"));
      String with = footer + " · " + SERVER_HINT;
      if (footer.equals(lines.get("text"))) out.put("text", with);
      out.put("footer", with);
    }
    return out;
  }
}
