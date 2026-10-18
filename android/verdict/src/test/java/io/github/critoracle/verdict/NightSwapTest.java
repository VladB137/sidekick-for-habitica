package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assume.assumeFalse;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** The night gear swap: the call order by itself, then end to end against Habitica's own equip and cron (mock server). */
public class NightSwapTest {
  private static final ZoneId ZONE = ZoneId.of("Europe/Bucharest");

  private static Map<String, String> gear (String... kv) {
    Map<String, String> m = new LinkedHashMap<>();
    for (int i = 0; i < kv.length; i += 2) m.put(kv[i], kv[i + 1]);
    return m;
  }

  static final class MemStore implements NightSwap.Store {
    final Map<String, String> m = new HashMap<>();
    public String get (String k) { return m.get(k); }
    public void put (String k, String v) { m.put(k, v); }
  }

  @Test
  public void nextKeyPutsTheWeaponFirstAndTogglesBareSlotsOff () {
    Map<String, String> cur = gear("weapon", "weapon_warrior_3", "shield", "shield_warrior_3", "head", "head_warrior_3", "eyewear", "eyewear_base_0");
    Map<String, String> night = gear("weapon", "weapon_armoire_blueLongbow", "shield", "shield_base_0", "head", "head_armoire_lunarCrown", "eyewear", "eyewear_armoire_plagueDoctorMask");
    assertEquals("weapon_armoire_blueLongbow", NightSwap.nextKey(cur, night));
    // the bow is two-handed: Habitica takes the shield off by itself
    cur = gear("weapon", "weapon_armoire_blueLongbow", "shield", "shield_base_0", "head", "head_warrior_3", "eyewear", "eyewear_base_0");
    assertEquals("head_armoire_lunarCrown", NightSwap.nextKey(cur, night));
    // back: the shield goes on after the one-handed weapon; a slot that was bare is emptied by equipping what's on it
    Map<String, String> base = gear("weapon", "weapon_warrior_3", "shield", "shield_warrior_3", "head", "head_warrior_3", "eyewear", "eyewear_base_0");
    assertEquals("weapon_warrior_3", NightSwap.nextKey(night, base));
    cur = gear("weapon", "weapon_warrior_3", "shield", "shield_base_0", "head", "head_warrior_3", "eyewear", "eyewear_armoire_plagueDoctorMask");
    assertEquals("shield_warrior_3", NightSwap.nextKey(cur, base));
    cur.put("shield", "shield_warrior_3");
    assertEquals("eyewear_armoire_plagueDoctorMask", NightSwap.nextKey(cur, base));
    cur.put("eyewear", "eyewear_base_0");
    assertNull(NightSwap.nextKey(cur, base));
    // a missing slot counts as bare
    assertTrue(NightSwap.sameGear(gear("back", "back_base_0"), gear()));
  }

  @Test
  public void nextAtIsTheNextLocalClockTimeAcrossTheClockChange () {
    NightSwap n = new NightSwap(new MemStore(), (m, p) -> NightSwap.Response.of(NightSwap.Kind.OFFLINE), ZONE);
    long at = ZonedDateTime.of(2026, 10, 24, 23, 0, 0, 0, ZONE).toInstant().toEpochMilli();
    // 25 October 2026: clocks go back an hour at 04:00 in Bucharest
    assertEquals(ZonedDateTime.of(2026, 10, 25, 8, 0, 0, 0, ZONE).toInstant().toEpochMilli(), n.nextAt(at, 8 * 60));
    assertEquals(ZonedDateTime.of(2026, 10, 25, 22, 0, 0, 0, ZONE).toInstant().toEpochMilli(), n.nextAt(at, 22 * 60));
    assertEquals(at + 24 * 3_600_000L + 3_600_000L, n.nextAt(at, 23 * 60));
  }

  @Test
  public void offAndNoPlanDoNothing () {
    MemStore st = new MemStore();
    List<String> calls = new ArrayList<>();
    NightSwap n = new NightSwap(st, (m, p) -> { calls.add(p); return NightSwap.Response.ok(Json.parse("{\"_id\":\"u\",\"items\":{\"gear\":{\"equipped\":{}}}}")); }, ZONE);
    assertEquals(0, n.step(1_000_000, false));
    n.configure(true, "int", 22 * 60, true, 8 * 60);
    long due = n.step(1_000_000, false);
    assertTrue(due > 1_000_000);
    assertTrue(calls.isEmpty());
    // the set hour, with the app on screen: wait for it to close
    assertEquals(due + 5 * 60_000L, n.step(due, true));
    long next = n.step(due + 5 * 60_000L, false);
    assertEquals(1, calls.size());
    assertTrue(n.lastText(), n.lastText().startsWith("Skipped: open Sidekick"));
    assertEquals("idle", n.phase());
    assertTrue(next > due + 20 * 3_600_000L);
  }

  @Test
  public void aRunHoursLateSkipsTheNight () {
    MemStore st = new MemStore();
    List<String> calls = new ArrayList<>();
    NightSwap n = new NightSwap(st, (m, p) -> { calls.add(p); return NightSwap.Response.ok(Json.parse("{}")); }, ZONE);
    n.configure(true, "int", 22 * 60, true, 8 * 60);
    long due = n.step(1_000_000, false);
    // the phone was off from before the set hour until the morning
    long next = n.step(due + 10 * 3_600_000L, false);
    assertTrue(calls.isEmpty());
    assertTrue(n.lastText(), n.lastText().startsWith("Skipped: the phone ran"));
    assertEquals("idle", n.phase());
    assertTrue(next > due + 20 * 3_600_000L);
  }

  /* ------------------------------------------------------------------ against the mock server */

  private static String mock () { return System.getProperty("mockUrl", ""); }

  static final String USER = "00000000-0000-4000-8000-000000000001";
  static final String TOKEN = "00000000-0000-4000-8000-00000000c0de";

  private static Object http (String method, String path, String body) {
    try {
      HttpURLConnection c = (HttpURLConnection) URI.create(mock() + path).toURL().openConnection();
      c.setRequestMethod(method);
      c.setRequestProperty("x-api-user", USER);
      c.setRequestProperty("x-api-key", TOKEN);
      c.setRequestProperty("x-client", USER + "-SidekickForHabitica");
      if (body != null) {
        c.setDoOutput(true);
        c.setRequestProperty("content-type", "application/json");
        try (OutputStream o = c.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
      }
      int code = c.getResponseCode();
      InputStream in = code < 400 ? c.getInputStream() : c.getErrorStream();
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      try (InputStream s = in) { if (s != null) s.transferTo(out); }
      Object r = Json.parse(out.toString(StandardCharsets.UTF_8));
      if (code >= 400) { Map<String, Object> e = new HashMap<>(); e.put("__status", (double) code); return e; }
      return r;
    } catch (IOException e) {
      throw new RuntimeException(e);
    }
  }

  /** The phone's Api, minus the 30 s spacing (the mock runs with --rate 1000). */
  private static final class MockApi implements NightSwap.Api {
    final List<String> calls = new ArrayList<>();
    public NightSwap.Response call (String method, String path) {
      calls.add(method + " " + path);
      Object r = http(method, path, null);
      Object status = Json.at(r, "__status");
      if (status != null) return NightSwap.Response.of(Json.num(status, 0) == 401 ? NightSwap.Kind.AUTH : NightSwap.Kind.REFUSED);
      return NightSwap.Response.ok(Json.at(r, "data"));
    }
  }

  private static Map<String, String> worn () { return NightSwap.equipped(Json.at(http("GET", "/mock/state", null), "user")); }

  @SuppressWarnings("unchecked")
  private static void setup (String lastCron) {
    http("POST", "/mock/reset?class=warrior&level=24", null);
    Map<String, Object> g = (Map<String, Object>) Json.at(http("GET", "/mock/state", null), "user", "items", "gear");
    ((Map<String, Object>) g.get("owned")).put("weapon_armoire_blueLongbow", true); // two-handed, CON 8
    Map<String, Object> items = new LinkedHashMap<>();
    items.put("gear", g);
    Map<String, Object> user = new LinkedHashMap<>();
    user.put("lastCron", lastCron);
    Map<String, Object> body = new LinkedHashMap<>();
    body.put("items", items);
    body.put("user", user);
    http("POST", "/mock/set", Json.stringify(body));
  }

  private static String plan (Map<String, String> expect, Map<String, String> intGear, Map<String, String> conGear) {
    Map<String, Object> p = new LinkedHashMap<>();
    p.put("userId", USER);
    p.put("expect", expect);
    p.put("int", intGear);
    p.put("con", conGear);
    return Json.stringify(p);
  }

  /** Runs steps until the swap waits for a later time than `until`; returns that time. */
  private static long run (NightSwap n, long from, long until) {
    long t = from;
    for (int i = 0; i < 40; i++) {
      long next = n.step(t, false);
      if (next == 0 || next > until) return next;
      t = Math.max(t, next);
    }
    throw new AssertionError("no end: " + n.phase());
  }

  @Test
  public void swapsAtNightAndBackAfterTheNewDayAgainstHabiticasCode () {
    assumeFalse("needs -PmockUrl (tools/mock-server.mjs)", mock().isEmpty());
    long real = System.currentTimeMillis();
    long t0 = real - 3 * 3_600_000L; // pretend the night was earlier, so Habitica's real-time cron comes after it
    setup(Instant.ofEpochMilli(t0 - 3_600_000L).toString());
    Map<String, String> base = worn();
    assertEquals("shield_warrior_3", base.get("shield"));
    Map<String, String> con = new LinkedHashMap<>(base);
    con.put("weapon", "weapon_armoire_blueLongbow");
    con.put("shield", "shield_base_0");
    con.put("head", "head_armoire_lunarCrown");
    con.put("eyewear", "eyewear_armoire_plagueDoctorMask");

    MockApi api = new MockApi();
    NightSwap n = new NightSwap(new MemStore(), api, ZONE);
    ZonedDateTime local = Instant.ofEpochMilli(t0).atZone(ZONE);
    int swapAt = (local.getHour() * 60 + local.getMinute() + 1) % (24 * 60);
    int backAt = (swapAt + 30) % (24 * 60);
    n.configure(true, "auto", swapAt, true, backAt);
    n.setPlan(plan(base, null, con));

    // the set hour: read, see open Dailies (auto picks CON), equip the bow (shield comes off), the crown, the mask
    long backDue = run(n, t0, t0 + 10 * 60_000L);
    assertEquals(n.lastText(), "swapped", n.phase());
    assertTrue(n.lastText(), n.lastText().contains("CON gear") && n.lastText().contains("Dailies were still open"));
    assertEquals(List.of("GET /api/v3/user", "GET /api/v3/tasks/user?type=dailys",
        "POST /api/v3/user/equip/equipped/weapon_armoire_blueLongbow", "POST /api/v3/user/equip/equipped/head_armoire_lunarCrown",
        "POST /api/v3/user/equip/equipped/eyewear_armoire_plagueDoctorMask"), api.calls);
    assertTrue(NightSwap.sameGear(con, worn()));
    // a read by the app meanwhile doesn't replace the plan the next night starts from
    n.setPlan(plan(con, null, null));

    // the swap-back hour, but no new day yet: the night gear stays and it looks again later
    api.calls.clear();
    long again = run(n, backDue, backDue);
    assertEquals("swapped", n.phase());
    assertEquals(backDue + 30 * 60_000L, again);
    assertTrue(NightSwap.sameGear(con, worn()));

    // the player starts the day in Habitica (POST /cron runs with the night gear on), then it all goes back
    http("POST", "/mock/new-day", null);
    http("POST", "/api/v3/cron", "{}");
    long next = run(n, again, again + 10 * 60_000L);
    assertEquals("idle", n.phase());
    assertEquals("Put your gear back as it was.", n.lastText());
    assertTrue(NightSwap.sameGear(base, worn()));
    assertEquals(List.of("GET /api/v3/user", "GET /api/v3/user", "POST /api/v3/user/equip/equipped/weapon_warrior_3",
        "POST /api/v3/user/equip/equipped/shield_warrior_3", "POST /api/v3/user/equip/equipped/head_warrior_3",
        "POST /api/v3/user/equip/equipped/eyewear_armoire_plagueDoctorMask"), api.calls);
    assertTrue(next > again + 20 * 3_600_000L);
  }

  @Test
  public void leavesGearThePlayerChangedAlone () {
    assumeFalse("needs -PmockUrl (tools/mock-server.mjs)", mock().isEmpty());
    long t0 = System.currentTimeMillis() - 3 * 3_600_000L;
    setup(Instant.ofEpochMilli(t0 - 3_600_000L).toString());
    Map<String, String> base = worn();
    Map<String, String> intGear = new LinkedHashMap<>(base);
    intGear.put("eyewear", "eyewear_armoire_plagueDoctorMask");
    ZonedDateTime local = Instant.ofEpochMilli(t0).atZone(ZONE);
    int swapAt = (local.getHour() * 60 + local.getMinute() + 1) % (24 * 60);

    // changed before the set hour: nothing is equipped
    MockApi api = new MockApi();
    NightSwap n = new NightSwap(new MemStore(), api, ZONE);
    n.configure(true, "int", swapAt, true, (swapAt + 30) % 1440);
    n.setPlan(plan(base, intGear, null));
    http("POST", "/api/v3/user/equip/equipped/head_armoire_lunarCrown", null);
    run(n, t0, t0 + 10 * 60_000L);
    assertEquals("idle", n.phase());
    assertTrue(n.lastText(), n.lastText().startsWith("Skipped: your gear changed"));
    assertEquals(List.of("GET /api/v3/user"), api.calls);

    // changed after the swap: not put back
    http("POST", "/api/v3/user/equip/equipped/head_warrior_3", null); // back as it was
    api.calls.clear();
    n = new NightSwap(new MemStore(), api, ZONE);
    n.configure(true, "int", swapAt, true, (swapAt + 30) % 1440);
    n.setPlan(plan(base, intGear, null));
    long backDue = run(n, t0, t0 + 10 * 60_000L);
    assertEquals("swapped", n.phase());
    assertEquals("eyewear_armoire_plagueDoctorMask", worn().get("eyewear"));
    http("POST", "/api/v3/user/equip/equipped/head_armoire_lunarCrown", null);
    http("POST", "/mock/new-day", null);
    http("POST", "/api/v3/cron", "{}");
    run(n, backDue, backDue + 10 * 60_000L);
    assertEquals("idle", n.phase());
    assertEquals("Left your gear alone: it changed after the night swap.", n.lastText());
    assertEquals("head_armoire_lunarCrown", worn().get("head"));
  }

  @Test
  public void aRefusedPieceUndoesWhatChanged () {
    assumeFalse("needs -PmockUrl (tools/mock-server.mjs)", mock().isEmpty());
    long t0 = System.currentTimeMillis() - 3 * 3_600_000L;
    setup(Instant.ofEpochMilli(t0 - 3_600_000L).toString());
    Map<String, String> base = worn();
    Map<String, String> intGear = new LinkedHashMap<>(base);
    intGear.put("eyewear", "eyewear_armoire_plagueDoctorMask");
    intGear.put("headAccessory", "headAccessory_special_bearEars"); // not owned: Habitica refuses it
    ZonedDateTime local = Instant.ofEpochMilli(t0).atZone(ZONE);
    int swapAt = (local.getHour() * 60 + local.getMinute() + 1) % (24 * 60);
    NightSwap n = new NightSwap(new MemStore(), new MockApi(), ZONE);
    n.configure(true, "int", swapAt, true, (swapAt + 30) % 1440);
    n.setPlan(plan(base, intGear, null));
    run(n, t0, t0 + 10 * 60_000L);
    assertEquals("idle", n.phase());
    assertTrue(NightSwap.sameGear(base, worn()));
    assertEquals("Habitica refused a piece of gear; check your gear. What had changed is back as it was.", n.lastText());
  }
}
