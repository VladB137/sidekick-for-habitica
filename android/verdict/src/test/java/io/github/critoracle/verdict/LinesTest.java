package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** The notification's lines against src/app/lines.ts (the app's live preview). Fixtures: tools/gen-verdict-fixtures.ts. */
public class LinesTest {
  private static String read (String prop) throws IOException {
    return new String(Files.readAllBytes(Paths.get(System.getProperty(prop))), StandardCharsets.UTF_8);
  }

  @Test
  public void linesMatchTheApp () throws IOException {
    Path p = Paths.get(System.getProperty("fixtures", "build/fixtures"), "lines.jsonl");
    if (!Files.exists(p)) fail(p + " is missing: run `npm run android:fixtures` in the repo root first");
    GearTable gear = GearTable.parse(read("gearJson"));
    Object items = Json.parse(read("itemsJson"));
    int n = 0;
    for (String line : Files.readAllLines(p, StandardCharsets.UTF_8)) {
      if (line.isEmpty()) continue;
      Object c = Json.parse(line);
      Object want = Json.at(c, "expect");
      Object raw = Json.at(c, "rawTasks");
      if (raw != null) {
        Object uid = Json.at(c, "userId");
        List<Object> trimmed = Lines.trimTasks(raw, uid instanceof String ? (String) uid : null);
        assertEquals("trim " + n, Json.stringify(Json.at(c, "input", "tasks")), Json.stringify(trimmed));
        assertEquals("trim twice " + n, Json.stringify(trimmed), Json.stringify(Lines.trimTasks(trimmed, null)));
      }
      Map<String, Object> got = Lines.build(Json.at(c, "input"), gear, items);
      assertEquals("case " + n + ": " + Json.stringify(Json.at(c, "input")), Json.stringify(want), Json.stringify(got));
      assertEquals("case " + n, want, got);
      n++;
    }
    assertTrue("cases read", n >= 1000);
    System.out.println("lines: " + n + "/" + n + " notifications identical");
  }

  @Test
  public void plainStripsMarkdownLikeTheApp () {
    assertEquals("Water plants", Lines.plain("Water [plants](https://x)"));
    assertEquals("Floss", Lines.plain("**Floss**"));
    assertEquals("Meditate", Lines.plain(":smile: Meditate"));
    assertEquals("Stretch", Lines.plain("![img](a.png)Stretch"));
  }

  @Test
  public void countdownAndAgo () {
    // 21:00 UTC, phone at UTC+3 → local 00:00; day start 0 → a full day away
    long now = 1_791_925_200_000L; // 2026-10-13T21:00:00Z
    assertEquals(86_400_000L, Lines.untilDayChange(now, 180, 0));
    assertEquals(3_600_000L, Lines.untilDayChange(now, 180, 1));
    assertEquals("3 h 12 min", Lines.duration((3 * 60 + 12) * 60_000L + 59_000));
    assertEquals("under a minute", Lines.duration(59_999));
    assertEquals("4 min ago", Lines.ago(4 * 60_000L));
  }

  @Test
  public void trimsTasksAndParty () {
    Object tasks = Json.parse("[{\"type\":\"habit\",\"text\":\"x\"},{\"type\":\"daily\",\"text\":\"Gym\",\"isDue\":true,\"completed\":false,\"notes\":\"n\"}]");
    assertEquals(1, Lines.trimTasks(tasks, null).size());
    Object party = Lines.trimParty(Json.parse("{\"quest\":{\"key\":\"basilist\",\"active\":true,\"progress\":{\"hp\":12.5,\"collect\":{},\"rage\":0},\"members\":{\"a\":true}}}"));
    assertEquals("{\"quest\":{\"key\":\"basilist\",\"active\":true,\"progress\":{\"hp\":12.5,\"collect\":{}}}}", Json.stringify(party));
    Map<String, Object> m = new LinkedHashMap<>();
    m.put("quest", null);
    assertEquals(m, Lines.trimParty(Json.parse("{\"_id\":\"p\"}")));
    List<String> on = Arrays.asList("crit", "boss");
    assertTrue(Lines.needsParty(on));
  }
}
