package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** Repeating To-Dos on the phone: noticing a tick from a read, when the reminder comes, what its button adds. */
public class RepeatPlanTest {
  private static final ZoneId ZONE = ZoneId.of("Europe/Bucharest");
  private static final String UID = "00000000-0000-4000-8000-000000000001";

  private static long at (String local) { return LocalDateTime.parse(local).atZone(ZONE).toInstant().toEpochMilli(); }

  private static RepeatPlan plan (int dayStart, String items) {
    return new RepeatPlan("{\"v\":1,\"userId\":\"" + UID + "\",\"dayStart\":" + dayStart + ",\"items\":[" + items + "]}");
  }

  private static Object user (String... todos) {
    StringBuilder b = new StringBuilder("{\"_id\":\"" + UID + "\",\"tasksOrder\":{\"todos\":[");
    for (int i = 0; i < todos.length; i++) b.append(i > 0 ? "," : "").append('"').append(todos[i]).append('"');
    return Json.parse(b.append("]}}").toString());
  }

  @Test
  public void habiticaDayCountsHoursBeforeTheDayStartAsTheDayBefore () {
    assertEquals("2026-10-13", RepeatPlan.habiticaDay(at("2026-10-14T03:59"), 4, ZONE).toString());
    assertEquals("2026-10-14", RepeatPlan.habiticaDay(at("2026-10-14T04:00"), 4, ZONE).toString());
    assertEquals("2026-10-14", RepeatPlan.habiticaDay(at("2026-10-14T00:00"), 0, ZONE).toString());
  }

  @Test
  public void aCopyMissingFromTheOpenToDosWasTickedAndComesBackAfterItsInterval () {
    RepeatPlan p = plan(0, "{\"id\":\"r1\",\"text\":\"Water plants\",\"everyDays\":7,\"taskId\":\"t1\",\"updatedAt\":1},"
        + "{\"id\":\"r2\",\"text\":\"Sheets\",\"everyDays\":14,\"taskId\":\"t2\",\"updatedAt\":1}");
    assertTrue(p.onUser(user("t2", "other"), at("2026-10-13T20:00"), ZONE));
    Map<String, Object> r1 = p.find("r1");
    assertEquals("2026-10-13", r1.get("doneDay"));
    assertEquals("2026-10-20", r1.get("dueDay"));
    assertEquals(Boolean.TRUE, r1.get("gone"));
    assertNull(p.find("r2").get("doneDay"));
    // the next read changes nothing more
    assertFalse(p.onUser(user("t2"), at("2026-10-13T21:00"), ZONE));
    // after the JSON round trip the same
    assertEquals("2026-10-20", new RepeatPlan(p.json()).find("r1").get("dueDay"));
  }

  @Test
  public void aReadOfAnotherAccountOrOneOlderThanTheChangeIsIgnored () {
    RepeatPlan p = plan(0, "{\"id\":\"r1\",\"text\":\"x\",\"everyDays\":3,\"taskId\":\"t1\",\"updatedAt\":" + at("2026-10-13T20:00") + "}");
    // the copy was added after this read started
    assertFalse(p.onUser(user(), at("2026-10-13T19:59"), ZONE));
    Object other = Json.parse("{\"_id\":\"someone-else\",\"tasksOrder\":{\"todos\":[]}}");
    assertFalse(p.onUser(other, at("2026-10-13T21:00"), ZONE));
    // a read without tasksOrder (trimmed) says nothing
    assertFalse(p.onUser(Json.parse("{\"_id\":\"" + UID + "\"}"), at("2026-10-13T21:00"), ZONE));
  }

  @Test
  public void theReminderComesAtNineOrAtTheDayStartAndOnlyOnce () {
    RepeatPlan p = plan(0, "{\"id\":\"r1\",\"text\":\"x\",\"everyDays\":7,\"dueDay\":\"2026-10-20\",\"updatedAt\":1}");
    Map<String, Object> r1 = p.find("r1");
    assertEquals(at("2026-10-20T09:00"), p.remindAt(r1, ZONE));
    assertEquals(at("2026-10-20T09:00"), p.nextRemind(at("2026-10-19T12:00"), ZONE));
    assertTrue(p.toRemind(at("2026-10-20T08:59"), ZONE).isEmpty());
    List<Map<String, Object>> due = p.toRemind(at("2026-10-20T09:00"), ZONE);
    assertEquals(1, due.size());
    RepeatPlan.markNotified(r1);
    assertTrue(RepeatPlan.waiting(r1));
    assertEquals(-1, p.remindAt(r1, ZONE));
    assertTrue(p.toRemind(at("2026-10-25T12:00"), ZONE).isEmpty());
    // "Tomorrow" brings it back the next day
    p.snooze(r1, at("2026-10-20T10:00"), ZONE);
    assertFalse(RepeatPlan.waiting(r1));
    assertEquals(at("2026-10-21T09:00"), p.remindAt(r1, ZONE));
    // a later day start moves the hour
    RepeatPlan late = plan(11, "{\"id\":\"r\",\"text\":\"x\",\"everyDays\":1,\"dueDay\":\"2026-10-20\"}");
    assertEquals(at("2026-10-20T11:00"), late.remindAt(late.find("r"), ZONE));
    // paused, or nothing due: no reminder
    RepeatPlan none = plan(0, "{\"id\":\"a\",\"text\":\"x\",\"everyDays\":1,\"dueDay\":\"2026-10-20\",\"paused\":true},{\"id\":\"b\",\"text\":\"x\",\"everyDays\":1,\"taskId\":\"t\"}");
    assertEquals(-1, none.nextRemind(0, ZONE));
  }

  @Test
  public void afterTravelTheReminderKeepsThePhonesNineButWaitsForTheHabiticaDay () {
    // the account still says Bucharest; the phone is in New York (7 h behind) or Tokyo (6 h ahead)
    ZoneId ny = ZoneId.of("America/New_York");
    RepeatPlan p = plan(0, "{\"id\":\"r\",\"text\":\"x\",\"everyDays\":1,\"dueDay\":\"2026-10-20\"}").phoneZone(ny);
    assertEquals(LocalDateTime.parse("2026-10-20T09:00").atZone(ny).toInstant().toEpochMilli(), p.remindAt(p.find("r"), ZONE));
    // 09:00 in Tokyo is 03:00 in Bucharest, before a 04:00 day start there: it waits for the day to begin
    RepeatPlan east = plan(4, "{\"id\":\"r\",\"text\":\"x\",\"everyDays\":1,\"dueDay\":\"2026-10-20\"}").phoneZone(ZoneId.of("Asia/Tokyo"));
    assertEquals(at("2026-10-20T04:00"), east.remindAt(east.find("r"), ZONE));
  }

  @Test
  public void theButtonAddsTheTemplateAsAToDoAndClearsWhatWasDue () {
    RepeatPlan p = plan(0, "{\"id\":\"r1\",\"text\":\"Water <b>plants</b>\",\"notes\":\"\",\"priority\":1.5,\"checklist\":[\"Kitchen\",\"\",\"Balcony\"],"
        + "\"everyDays\":7,\"dueDay\":\"2026-10-20\",\"doneDay\":\"2026-10-13\",\"notified\":\"2026-10-20\",\"gone\":true}");
    Map<String, Object> r1 = p.find("r1");
    assertEquals("{\"type\":\"todo\",\"text\":\"Water <b>plants</b>\",\"priority\":1.5,\"checklist\":[{\"text\":\"Kitchen\",\"completed\":false},{\"text\":\"Balcony\",\"completed\":false}]}",
        Json.stringify(RepeatPlan.taskBody(r1)));
    RepeatPlan.added(r1, "t9", 5);
    assertEquals("t9", r1.get("taskId"));
    assertNull(r1.get("dueDay"));
    assertNull(r1.get("notified"));
    assertEquals(-1, p.nextRemind(0, ZONE));
    // a difficulty Habitica doesn't know becomes Easy
    RepeatPlan odd = plan(0, "{\"id\":\"r\",\"text\":\"x\",\"priority\":3}");
    assertEquals(1.0, RepeatPlan.taskBody(odd.find("r")).get("priority"));
  }

  @Test
  public void daysCountInTheAccountsTimeZoneWhenTheAppStoredIt () {
    // tzOffset -180: UTC+3 (Bucharest in summer), whatever zone the phone is set to
    RepeatPlan p = new RepeatPlan("{\"v\":1,\"userId\":\"" + UID + "\",\"dayStart\":0,\"tzOffset\":-180,\"items\":[]}");
    ZoneId z = p.zone(ZoneId.of("America/New_York"));
    long lateUtc = java.time.Instant.parse("2026-10-13T22:30:00Z").toEpochMilli();
    assertEquals("2026-10-14", RepeatPlan.habiticaDay(lateUtc, 0, z).toString());
    assertEquals(ZoneId.of("America/New_York"), plan(0, "").zone(ZoneId.of("America/New_York")));
  }

  @Test
  public void anAddUnderWayCountsForHalfAnHourAndAnAddedCopyClearsIt () {
    long now = at("2026-10-14T10:00");
    RepeatPlan p = plan(0, "{\"id\":\"r1\",\"text\":\"Water plants\",\"everyDays\":7,\"dueDay\":\"2026-10-14\",\"adding\":" + (double) (now - 60_000) + ",\"updatedAt\":1}");
    Map<String, Object> it = p.find("r1");
    assertTrue(RepeatPlan.adding(it, now));
    assertFalse(RepeatPlan.adding(it, now + RepeatPlan.ADDING_MS));
    RepeatPlan.added(it, "t9", now);
    assertFalse(RepeatPlan.adding(it, now));
  }

  @Test
  public void aCopyThatLeftTheListWaitsForTheLookUpThenComesBackOrPauses () {
    RepeatPlan p = plan(0, "{\"id\":\"r1\",\"text\":\"Water plants\",\"everyDays\":7,\"taskId\":\"t1\",\"updatedAt\":1},"
        + "{\"id\":\"r2\",\"text\":\"Change sheets\",\"everyDays\":14,\"taskId\":\"t2\",\"updatedAt\":1}");
    assertTrue(p.onUser(user(), at("2026-10-01T10:00"), ZONE));
    long due = at("2026-10-15T12:00");
    // r1 is due on the 8th by the phone's guess; neither reminds before the look-up
    assertTrue(p.toRemind(due, ZONE).isEmpty());
    assertTrue(p.needsLookUp(due, ZONE));
    Object done = Json.parse("[{\"_id\":\"t1\",\"dateCompleted\":\"2026-09-28T09:00:00.000Z\"}]");
    assertTrue(p.onCompleted(done, due, ZONE));
    Map<String, Object> r1 = p.find("r1");
    Map<String, Object> r2 = p.find("r2");
    assertEquals("2026-09-28", r1.get("doneDay"));
    assertEquals("2026-10-05", r1.get("dueDay"));
    assertFalse(RepeatPlan.gone(r1));
    assertTrue(Json.truthy(r2.get("paused")));
    assertNull(RepeatPlan.remindDay(r2));
    assertFalse(p.needsLookUp(due, ZONE));
    assertEquals(1, p.toRemind(due, ZONE).size());
  }
}
