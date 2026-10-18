package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** The Java verdict against the TypeScript engine, bit for bit. Fixtures: tools/gen-verdict-fixtures.ts. */
public class VerdictTest {
  private static Path fixtures (String name) {
    Path p = Paths.get(System.getProperty("fixtures", "build/fixtures"), name);
    if (!Files.exists(p)) fail(p + " is missing: run `npm run android:fixtures` in the repo root first");
    return p;
  }

  private static double fromHex (String h) { return Double.longBitsToDouble(Long.parseUnsignedLong(h, 16)); }
  private static String hex (double x) { return String.format("%016x", Double.doubleToRawLongBits(x)); }

  private static GearTable gear () throws IOException {
    return GearTable.parse(new String(Files.readAllBytes(Paths.get(System.getProperty("gearJson"))), StandardCharsets.UTF_8));
  }

  @Test
  public void strictMathSinMatchesHabiticasRecordedSines () throws IOException {
    int n = 0;
    for (String line : Files.readAllLines(fixtures("sin.txt"))) {
      if (line.isEmpty()) continue;
      String[] f = line.split(" ");
      double x = Double.parseDouble(f[0]);
      long want = (Long.parseLong(f[1], 16) << 32) | Long.parseLong(f[2], 16);
      assertEquals("sin(" + f[0] + ")", hex(Double.longBitsToDouble(want)), hex(StrictMath.sin(x)));
      n++;
    }
    assertTrue("vectors read", n > 100);
    System.out.println("sin: " + n + "/" + n + " recorded vectors identical");
  }

  @Test
  public void rollsMatchTheEngine () throws IOException {
    int n = 0;
    for (String line : Files.readAllLines(fixtures("rolls.txt"))) {
      if (line.isEmpty()) continue;
      String[] f = line.split(" ");
      double seed = fromHex(f[0]);
      assertEquals("roll at seed " + seed, f[1], hex(Verdict.rollOf(seed)));
      n++;
    }
    assertTrue("rolls read", n > 20000);
    System.out.println("rolls: " + n + "/" + n + " identical");
  }

  @Test
  public void wholeUsersGiveTheEnginesVerdict () throws IOException {
    GearTable table = gear();
    int n = 0, crits = 0, skills = 0;
    for (String line : Files.readAllLines(fixtures("users.jsonl"), StandardCharsets.UTF_8)) {
      if (line.isEmpty()) continue;
      Object c = Json.parse(line);
      Object user = Json.at(c, "user");
      Object ex = Json.at(c, "expect");
      String at = "user #" + n;
      Verdict.Snapshot snap = Verdict.fromUser(user, table);
      Verdict.Result r = Verdict.verdicts(snap.state);
      assertEquals(at + " seed", Json.at(ex, "seed"), hex(r.seed));
      assertEquals(at + " roll", Json.at(ex, "roll"), hex(r.roll));
      List<?> g = (List<?>) Json.at(ex, "gear");
      assertEquals(at + " gear str", g.get(0), hex(snap.state.gearStr));
      assertEquals(at + " gear con", g.get(1), hex(snap.state.gearCon));
      assertEquals(at + " gear int", g.get(2), hex(snap.state.gearInt));
      assertEquals(at + " gear per", g.get(3), hex(snap.state.gearPer));
      assertEquals(at + " unknown gear", Json.at(ex, "unknown"), new ArrayList<Object>(snap.unknownGear));
      assertEquals(at + " needsCron", Json.at(ex, "needsCron"), snap.needsCron);
      assertEquals(at + " classSelected", Json.at(ex, "classSelected"), snap.state.classSelected);
      assertEquals(at + " class", Json.at(ex, "cls"), snap.state.cls);
      List<?> rolls = (List<?>) Json.at(ex, "rolls");
      assertEquals(at + " roll count", rolls.size(), r.rolls.size());
      for (int i = 0; i < rolls.size(); i++) {
        Map<?, ?> w = (Map<?, ?>) rolls.get(i);
        Verdict.Roll got = r.rolls.get(i);
        String k = at + " " + w.get("key");
        assertEquals(k + " key", w.get("key"), got.key);
        assertEquals(k + " chance", w.get("chance"), hex(got.chance));
        assertEquals(k + " mult", w.get("mult"), hex(got.mult));
        assertEquals(k + " crit", w.get("crit"), got.crit);
        assertEquals(k + " available", w.get("available"), got.available);
        assertEquals(k + " multiplier text", w.get("multText"), VerdictText.mult(got.mult));
        assertEquals(k + " chance text", w.get("pctText"), VerdictText.pct(got.chance));
        if (got.crit) crits++;
        if (i > 0) skills++;
      }
      n++;
    }
    assertTrue("users read", n >= 4000);
    assertTrue("some crits among the cases", crits > 50);
    assertTrue("some skill rolls among the cases", skills > 1000);
    System.out.println("users: " + n + "/" + n + " identical (" + crits + " crit rolls, " + skills + " skill rolls)");
  }

  @Test
  public void storedUsersReadBackTheSame () throws IOException {
    GearTable table = gear();
    int n = 0;
    for (String line : Files.readAllLines(fixtures("users.jsonl"), StandardCharsets.UTF_8)) {
      if (line.isEmpty() || n++ > 500) continue;
      Object user = Json.at(Json.parse(line), "user");
      Object again = Json.parse(Json.stringify(user));
      assertEquals(user, again);
      assertEquals(hex(Verdict.verdicts(Verdict.fromUser(user, table).state).roll), hex(Verdict.verdicts(Verdict.fromUser(again, table).state).roll));
    }
  }

  @Test
  public void wordsFollowTheLiveCheckingOfflineLooks () {
    Verdict.State s = new Verdict.State();
    s.lvl = 20; s.cls = "warrior"; s.classSelected = true; s.mp = 30; s.con = 50; s.str = 40;
    // find a crit seed and a non-crit seed by moving gold
    Verdict.Snapshot crit = null, none = null;
    for (int gp = 0; gp < 5000 && (crit == null || none == null); gp++) {
      Verdict.State t = copy(s); t.gp = gp;
      Verdict.Snapshot snap = new Verdict.Snapshot(t, false, new ArrayList<>());
      if (Verdict.verdicts(t).task().crit) { if (crit == null) crit = snap; } else if (none == null) none = snap;
    }
    VerdictText.Line live = VerdictText.line(crit, 10_000, false, "10:42");
    assertEquals(VerdictText.Look.CRIT, live.look);
    assertTrue(live.title, live.title.startsWith("CRIT ×"));
    assertTrue(live.text, live.text.startsWith("Next task: CRIT ×"));
    VerdictText.Line quiet = VerdictText.line(none, 10_000, false, "10:42");
    assertEquals(VerdictText.Look.LIVE, quiet.look);
    assertTrue(quiet.text, quiet.text.startsWith("Next task: no crit (chance "));
    VerdictText.Line checking = VerdictText.line(crit, 120_000, false, "10:42");
    assertEquals(VerdictText.Look.CHECKING, checking.look);
    assertEquals("At 10:42 your next task was a crit " + VerdictText.mult(Verdict.verdicts(crit.state).task().mult) + ".", checking.text);
    VerdictText.Line offline = VerdictText.line(crit, 10_000, true, "10:42");
    assertEquals(VerdictText.Look.OFFLINE, offline.look);
    assertTrue(offline.text.startsWith("Offline. At 10:42"));
    assertEquals(VerdictText.Look.NONE, VerdictText.line(null, 0, false, "").look);
    Verdict.State dead = copy(s); dead.hp = 0;
    assertEquals("Out of HP", VerdictText.line(new Verdict.Snapshot(dead, false, new ArrayList<>()), 0, false, "").title);
    Verdict.State alive = copy(s); alive.hp = 30;
    assertEquals("New day", VerdictText.line(new Verdict.Snapshot(alive, true, new ArrayList<>()), 0, false, "").title);
  }

  private static Verdict.State copy (Verdict.State s) {
    Verdict.State t = new Verdict.State();
    t.hp = s.hp == 0 ? 50 : s.hp; t.mp = s.mp; t.exp = s.exp; t.gp = s.gp; t.lvl = s.lvl; t.points = s.points;
    t.str = s.str; t.con = s.con; t.intel = s.intel; t.per = s.per; t.cls = s.cls; t.classSelected = s.classSelected;
    return t;
  }

  @Test
  public void gearTableReadsTheShippedFile () throws IOException {
    GearTable t = gear();
    assertTrue(t.size() > 500);
    List<String> eq = new ArrayList<>();
    eq.add("weapon_wizard_1"); // [0, 0, 3, 1, "wizard"]
    eq.add("weapon_healer_0"); // no stats
    eq.add(null);
    eq.add("");
    eq.add("not_an_item");
    GearTable.Sum wiz = t.sum(eq, "wizard");
    assertEquals(6.0, wiz.intel, 0); // class gear counts twice since v5.49.0
    assertEquals(2.0, wiz.per, 0);
    assertEquals(1, wiz.unknown.size());
    GearTable.Sum war = t.sum(eq, "warrior");
    assertEquals(3.0, war.intel, 0);
  }

  @Test
  public void jsonReaderHandlesWhatHabiticaSends () {
    Object v = Json.parse("{\"a\":[1,-2.5e3,true,false,null,\"x\\u00e9\\n\\\"\"],\"b\":{}}");
    List<?> a = (List<?>) Json.at(v, "a");
    assertEquals(1.0, (Double) a.get(0), 0);
    assertEquals(-2500.0, (Double) a.get(1), 0);
    assertEquals(Boolean.TRUE, a.get(2));
    assertEquals(null, a.get(4));
    assertEquals("xé\n\"", a.get(5));
    assertEquals(null, Json.at(v, "b", "missing", "deeper"));
    try { Json.parse("{\"a\":1,}"); fail("trailing comma accepted"); } catch (IllegalArgumentException expected) { /* ok */ }
    try { Json.parse("[1] x"); fail("trailing text accepted"); } catch (IllegalArgumentException expected) { /* ok */ }
  }
}
