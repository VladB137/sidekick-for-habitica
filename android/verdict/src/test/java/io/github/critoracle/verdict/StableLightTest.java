package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;

import java.nio.file.Files;
import java.nio.file.Paths;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.Test;

/** The Stable widget's light by the hour: the same as the app's scenes (clock.ts), and when it changes next. */
public class StableLightTest {
  @Test
  public void everyHourHasTheAppsLight () throws Exception {
    // "hour light" per line, from clock.ts timeOfDay (tools/gen-verdict-fixtures.ts)
    List<String> lines = Files.readAllLines(Paths.get(System.getProperty("fixtures"), "light.txt"));
    assertEquals(24, lines.size());
    for (String l : lines) {
      String[] p = l.split(" ");
      assertEquals("hour " + p[0], p[1], StableLight.at(Integer.parseInt(p[0])));
    }
  }

  @Test
  public void theNextChangeIsTheNextLightsFirstHour () {
    assertEquals(LocalDateTime.parse("2026-10-14T06:00"), StableLight.next(LocalDateTime.parse("2026-10-14T00:00")));
    assertEquals(LocalDateTime.parse("2026-10-14T08:00"), StableLight.next(LocalDateTime.parse("2026-10-14T06:00")));
    assertEquals(LocalDateTime.parse("2026-10-14T19:00"), StableLight.next(LocalDateTime.parse("2026-10-14T12:30")));
    assertEquals(LocalDateTime.parse("2026-10-14T21:00"), StableLight.next(LocalDateTime.parse("2026-10-14T20:59:59")));
    assertEquals(LocalDateTime.parse("2026-10-15T06:00"), StableLight.next(LocalDateTime.parse("2026-10-14T21:00")));
    assertEquals(LocalDateTime.parse("2026-10-15T06:00"), StableLight.next(LocalDateTime.parse("2026-10-14T23:59")));
  }
}
