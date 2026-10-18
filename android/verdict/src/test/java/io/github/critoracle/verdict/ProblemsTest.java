package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertSame;
import static org.junit.Assert.assertTrue;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** What the phone's surfaces say when something other than age is wrong: a refused login, a failing Habitica, old HP and new-day lines. */
public class ProblemsTest {
  private static Verdict.Snapshot snap (double hp, boolean needsCron) {
    Verdict.State s = new Verdict.State();
    s.lvl = 20; s.cls = "warrior"; s.classSelected = true; s.mp = 30; s.con = 50; s.str = 40; s.hp = hp;
    return new Verdict.Snapshot(s, needsCron, new ArrayList<>());
  }

  @Test
  public void aRefusedLoginReplacesEveryLine () {
    for (Verdict.Snapshot sn : new Verdict.Snapshot[] { snap(30, false), snap(0, false), snap(30, true) }) {
      VerdictText.Line l = VerdictText.line(sn, 5_000, false, "10:42", VerdictText.Problem.AUTH);
      assertEquals(VerdictText.AUTH_TITLE, l.title);
      assertEquals("Habitica no longer accepts your login. Open the app to connect again.", l.text);
      assertEquals(VerdictText.Look.NONE, l.look);
      assertEquals("Open the app", l.subtitle);
    }
    // nothing read yet (no login at all) stays the log-in line
    assertEquals("Log in", VerdictText.line(null, 0, false, "", VerdictText.Problem.AUTH).subtitle);
  }

  @Test
  public void aBlockReplacesEveryLine () {
    for (Verdict.Snapshot sn : new Verdict.Snapshot[] { snap(30, false), snap(0, false), snap(30, true) }) {
      VerdictText.Line l = VerdictText.line(sn, 5_000, false, "10:42", VerdictText.Problem.BLOCKED);
      assertEquals("Stopped by Habitica", l.title);
      assertEquals(VerdictText.BLOCKED_TEXT, l.text);
      assertEquals(VerdictText.Look.NONE, l.look);
      assertEquals("Open the app", l.subtitle);
    }
    Map<String, Object> blocked = VerdictText.withProblem(lines("LIVE", "x", "Read just now"), VerdictText.Problem.BLOCKED);
    assertEquals("NONE", blocked.get("look"));
    assertEquals(VerdictText.BLOCKED_TITLE, blocked.get("title"));
    assertTrue(((List<?>) blocked.get("rows")).isEmpty());
  }

  @Test
  public void outOfHpAndNewDayFollowTheAgeRule () {
    VerdictText.Line dead = VerdictText.line(snap(0, false), 10_000, false, "10:42");
    assertEquals("Out of HP", dead.title);
    assertEquals(VerdictText.Look.LIVE, dead.look);
    assertEquals("Open Habitica", dead.subtitle);
    VerdictText.Line oldDead = VerdictText.line(snap(0, false), VerdictText.FRESH_MS + 1, false, "10:42");
    assertEquals("Checking…", oldDead.title);
    assertEquals(VerdictText.Look.CHECKING, oldDead.look);
    assertEquals("At 10:42 you were out of HP.", oldDead.text);
    assertEquals("Tap to read", oldDead.subtitle);
    VerdictText.Line offDead = VerdictText.line(snap(0, false), 10_000, true, "10:42");
    assertEquals(VerdictText.Look.OFFLINE, offDead.look);
    assertEquals("Offline. At 10:42 you were out of HP.", offDead.text);

    VerdictText.Line day = VerdictText.line(snap(30, true), 10_000, false, "10:42");
    assertEquals("New day", day.title);
    assertEquals("Open Habitica", day.subtitle);
    VerdictText.Line oldDay = VerdictText.line(snap(30, true), 3_600_000, false, "10:42");
    assertEquals(VerdictText.Look.CHECKING, oldDay.look);
    assertEquals("At 10:42 a new Habitica day was waiting to start.", oldDay.text);
  }

  @Test
  public void aServerErrorIsNamedOnceTheNumbersAreOld () {
    VerdictText.Line fresh = VerdictText.line(snap(30, false), 10_000, false, "10:42", VerdictText.Problem.SERVER);
    assertEquals("Next task", fresh.subtitle);
    assertTrue(fresh.text, fresh.text.startsWith("Next task: "));
    VerdictText.Line old = VerdictText.line(snap(30, false), 120_000, false, "10:42", VerdictText.Problem.SERVER);
    assertEquals(VerdictText.Look.CHECKING, old.look);
    assertTrue(old.text, old.text.startsWith("At 10:42 your next task was ") && old.text.endsWith(". Habitica isn’t answering."));
    assertEquals("Not answering", old.subtitle);
    // offline says it already
    VerdictText.Line off = VerdictText.line(snap(30, false), 120_000, true, "10:42", VerdictText.Problem.SERVER);
    assertTrue(off.text, !off.text.contains("answering"));
  }

  private static Map<String, Object> lines (String look, String text, String footer) {
    Map<String, Object> m = new LinkedHashMap<>();
    List<Object> rows = new ArrayList<>();
    rows.add(new HashMap<String, Object>());
    m.put("look", look); m.put("title", "Checking: next task was no crit (3.0%)"); m.put("text", text); m.put("rows", rows); m.put("footer", footer);
    return m;
  }

  @Test
  public void notificationLinesTakeTheProblem () {
    Map<String, Object> in = lines("CHECKING", "Read 5 min ago", "Read 5 min ago");
    assertSame(in, VerdictText.withProblem(in, VerdictText.Problem.NONE));
    Map<String, Object> server = VerdictText.withProblem(in, VerdictText.Problem.SERVER);
    assertEquals("Read 5 min ago · Habitica isn’t answering", server.get("footer"));
    assertEquals("Read 5 min ago · Habitica isn’t answering", server.get("text"));
    assertEquals("Read 5 min ago", in.get("footer")); // the input is left as it was
    Map<String, Object> second = lines("CHECKING", "New day in 3 h", "Read 5 min ago");
    assertEquals("New day in 3 h", VerdictText.withProblem(second, VerdictText.Problem.SERVER).get("text"));
    Map<String, Object> live = lines("LIVE", "x", "Read just now");
    assertEquals("Read just now", VerdictText.withProblem(live, VerdictText.Problem.SERVER).get("footer"));
    Map<String, Object> auth = VerdictText.withProblem(live, VerdictText.Problem.AUTH);
    assertEquals("NONE", auth.get("look"));
    assertEquals(VerdictText.AUTH_TITLE, auth.get("title"));
    assertEquals(VerdictText.AUTH_TEXT, auth.get("text"));
    assertTrue(((List<?>) auth.get("rows")).isEmpty());
    // not logged in at all: the log-in line stays
    Map<String, Object> none = lines("NONE", "Open Sidekick", "Not read yet");
    assertSame(none, VerdictText.withProblem(none, VerdictText.Problem.AUTH));
  }

  @Test
  public void retryAfterTakesWholeAndFractionalSeconds () {
    assertEquals(30_000, Calls.retryAfterMs("30"));
    assertEquals(12_500, Calls.retryAfterMs(" 12.5 "));
    assertEquals(1_001, Calls.retryAfterMs("1.0001"));
    assertEquals(1_000, Calls.retryAfterMs("0"));
    assertEquals(1_000, Calls.retryAfterMs("-5"));
    assertEquals(Calls.DEFAULT_RETRY_MS, Calls.retryAfterMs(null));
    assertEquals(Calls.DEFAULT_RETRY_MS, Calls.retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT"));
    assertEquals(Calls.DEFAULT_RETRY_MS, Calls.retryAfterMs("NaN"));
    assertEquals(Calls.MAX_RETRY_MS, Calls.retryAfterMs("1e9"));
  }

  @Test
  public void baseGearOnlyWhileNightGearMayBeOn () {
    NightSwapTest.MemStore st = new NightSwapTest.MemStore();
    NightSwap n = new NightSwap(st, (m, p) -> NightSwap.Response.of(NightSwap.Kind.OFFLINE), java.time.ZoneId.of("UTC"));
    st.put("base", "{\"armor\":\"armor_warrior_1\"}");
    assertNull(n.baseGear());
    for (String p : new String[] { "read", "tasks", "idle" }) { st.put("phase", p); assertNull(p, n.baseGear()); }
    for (String p : new String[] { "equip", "swapped", "back" }) { st.put("phase", p); assertEquals(p, "{\"armor\":\"armor_warrior_1\"}", n.baseGear()); }
  }
}
