package io.github.critoracle;

import android.content.Context;
import android.content.SharedPreferences;
import io.github.critoracle.verdict.Calls;
import io.github.critoracle.verdict.Json;
import io.github.critoracle.verdict.NightSwap;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * The native calls to Habitica: GET /api/v3/user, the same read the app makes; GET /api/v3/tasks/user and
 * /api/v3/groups/party when a notification line needs them; and the night gear swap's calls
 * (NightGearJob: reads and equips only, when the player switched it on). Habitica's rules for third-party tools:
 * x-client on every call, automatic calls at least 30 s apart (the app's own calls count too), honour 429
 * Retry-After, and stop when calls can't succeed (a 401 or 403 stops every call until the app reads again or a new login).
 * Results of a call that was on its way during a logout are dropped (Session).
 */
final class HabiticaReader {
  private HabiticaReader () {}

  static final String BASE = "https://habitica.com";
  static final long AUTO_GAP_MS = 30_000;
  /** a tap on the tile is the player asking; still not more than one read per few seconds */
  static final long TAP_GAP_MS = 5_000;
  private static final int TIMEOUT_MS = 20_000;
  private static final String PREFS = "critoracle-calls";

  enum Kind { AUTOMATIC, TAP }

  enum Outcome { READ, SKIPPED, NO_LOGIN, AUTH_FAILED, RATE_LIMITED, OFFLINE, FAILED }

  /** Called whenever any Habitica call starts, native or from the app, so the spacing covers both. */
  static synchronized void noteCall (Context c) { prefs(c).edit().putLong("lastCallAt", System.currentTimeMillis()).apply(); }

  /** Whether a read of this kind may go out now. */
  static synchronized boolean allowed (Context c, Kind kind) { return refusal(c, kind) == null; }

  /** Why a read of this kind may not go out now (refused login, a 429's wait, the spacing), or null when it may. */
  private static synchronized Outcome refusal (Context c, Kind kind) {
    SharedPreferences p = prefs(c);
    long now = System.currentTimeMillis();
    if (p.getBoolean("authFailed", false)) return Outcome.AUTH_FAILED;
    if (now < retryAt(p, now)) return Outcome.RATE_LIMITED;
    long gap = kind == Kind.AUTOMATIC ? AUTO_GAP_MS : TAP_GAP_MS;
    return now - lastCallAt(p, now) >= gap ? null : Outcome.SKIPPED;
  }

  /** The earliest time an automatic call may go out, counting the phone's own calls and any 429 wait (for the app's auto-read). */
  static synchronized long nextAutomaticAt (Context c) {
    SharedPreferences p = prefs(c);
    long now = System.currentTimeMillis();
    return Math.max(retryAt(p, now), lastCallAt(p, now) + AUTO_GAP_MS);
  }

  /** The last call, never later than now: after the phone's clock goes back, a call "in the future" doesn't hold reads back. */
  private static long lastCallAt (SharedPreferences p, long now) { return Math.min(p.getLong("lastCallAt", 0), now); }

  /** A 429's wait, at most an hour from now for the same reason (Retry-After itself is capped at an hour). */
  private static long retryAt (SharedPreferences p, long now) { return Math.min(p.getLong("retryAt", 0), now + 3600_000L); }

  /** Habitica refused the remembered token (401) or the app (403): no call goes out until the app reads again or a new login. */
  static synchronized boolean authFailed (Context c) { return prefs(c).getBoolean("authFailed", false); }

  /** The stop came from a 403: Habitica blocked the client or the connection (server/middlewares/blocker.js). */
  static synchronized boolean blocked (Context c) { return prefs(c).getBoolean("authFailed", false) && prefs(c).getBoolean("blocked", false); }

  /** The app read successfully with the remembered login: calls may go out again. True when they had been stopped. */
  static synchronized boolean clearAuthFailed (Context c) {
    if (!prefs(c).getBoolean("authFailed", false)) return false;
    prefs(c).edit().remove("authFailed").remove("blocked").commit();
    return true;
  }

  /**
   * After a new login (or a logout) the old refusal no longer applies. The call spacing and a running 429 wait
   * stay: they are about Habitica's limits, not the login.
   */
  static synchronized void reset (Context c) { prefs(c).edit().remove("authFailed").remove("blocked").commit(); }

  /** A 401 from any call: remember it (unless a logout came since the call started) and stop the refresh job. */
  private static void refused (Context c, int gen) { stop(c, gen, false); }

  /**
   * A 403 from any call: Habitica blocked this app or the connection, so no call can succeed. Stops every call as a
   * 401 does (Habitica's rule: stop once calls can't succeed); the app's next successful read lifts it.
   */
  private static void blocked (Context c, int gen) { stop(c, gen, true); }

  private static void stop (Context c, int gen, boolean blocked) {
    if (Session.ifCurrent(gen, () -> { synchronized (HabiticaReader.class) { prefs(c).edit().putBoolean("authFailed", true).putBoolean("blocked", blocked).commit(); } })) RefreshJob.cancel(c);
  }

  /** A 429: no call before its Retry-After (whole or fractional seconds). Kept across logins: it is Habitica's limit. */
  private static long rateLimited (Context c, HttpURLConnection con) {
    long at = System.currentTimeMillis() + Calls.retryAfterMs(con.getHeaderField("Retry-After"));
    synchronized (HabiticaReader.class) { prefs(c).edit().putLong("retryAt", Math.max(at, prefs(c).getLong("retryAt", 0))).apply(); }
    return at;
  }

  /** Blocking: call from a background thread. GET /user, saved for the notification, widget and tile. */
  static Outcome read (Context c, Kind kind) {
    Fetched f = get(c, kind, "/api/v3/user");
    if (f.outcome != Outcome.READ) return f.outcome;
    // only the logged-in account's numbers
    if (!f.userId.equals(Json.at(f.data, "_id")) && !f.userId.equals(Json.at(f.data, "id"))) return Outcome.FAILED;
    // a logout while the read was on its way: the answer belongs to nobody now
    boolean kept = Session.ifCurrent(f.gen, () -> {
      LastRead.save(c, f.data, System.currentTimeMillis());
      RepeatReminders.onRead(c, f.data, f.startedAt);
    });
    return kept ? Outcome.READ : Outcome.NO_LOGIN;
  }

  /**
   * The Dailies for the notification's lines (blocking, automatic: at least 30 s after any other call). Asked for
   * only after the user's numbers moved; a failed read waits for the next move rather than trying again.
   */
  static Outcome readTasks (Context c) {
    Fetched f = get(c, Kind.AUTOMATIC, "/api/v3/tasks/user?type=dailys");
    Session.ifCurrent(f.gen, () -> {
      if (f.outcome == Outcome.READ && f.data instanceof java.util.List) LastRead.saveTasks(c, f.data);
      else if (f.outcome != Outcome.SKIPPED && f.outcome != Outcome.RATE_LIMITED && f.outcome != Outcome.AUTH_FAILED) LastRead.skipTasks(c);
    });
    return f.outcome;
  }

  /**
   * The ticked To-Dos, before a repeating To-Do's reminder whose copy left the list: ticked or deleted? Same spacing;
   * only when such a reminder is due (RepeatReminders.update).
   */
  static Outcome readCompletedTodos (Context c) {
    Fetched f = get(c, Kind.AUTOMATIC, "/api/v3/tasks/user?type=completedTodos");
    if (f.outcome == Outcome.READ) Session.ifCurrent(f.gen, () -> RepeatReminders.onCompleted(c, f.data));
    return f.outcome;
  }

  /** The party's quest (boss HP, items found), only while the player is in a running quest. Same spacing. */
  static Outcome readParty (Context c) {
    Fetched f = get(c, Kind.AUTOMATIC, "/api/v3/groups/party");
    Session.ifCurrent(f.gen, () -> {
      if (f.outcome == Outcome.READ) LastRead.saveParty(c, f.data, System.currentTimeMillis());
      else if (f.outcome != Outcome.SKIPPED && f.outcome != Outcome.RATE_LIMITED && f.outcome != Outcome.AUTH_FAILED) LastRead.skipParty(c);
    });
    return f.outcome;
  }

  private static final class Fetched {
    final Outcome outcome;
    final Object data;
    final String userId;
    /** Session.generation() when the call was asked for */
    int gen;
    /** when the request went out: a repeating To-Do's copy ticked after this isn't in `data` yet */
    long startedAt;
    Fetched (Outcome outcome, Object data, String userId) { this.outcome = outcome; this.data = data; this.userId = userId; }
  }

  /** One GET with the spacing, x-client, 429 and 401 rules; READ comes with the response's `data`. */
  private static Fetched get (Context c, Kind kind, String path) {
    int gen = Session.generation();
    Fetched f = fetch(c, kind, path, gen);
    f.gen = gen;
    return f;
  }

  private static Fetched fetch (Context c, Kind kind, String path, int gen) {
    TokenStore.Credentials cr = TokenStore.load(c);
    if (cr == null) return new Fetched(Outcome.NO_LOGIN, null, null);
    synchronized (HabiticaReader.class) {
      Outcome no = refusal(c, kind);
      if (no != null) return new Fetched(no, null, cr.userId);
      noteCall(c);
    }
    long startedAt = System.currentTimeMillis();
    HttpURLConnection con = null;
    try {
      con = (HttpURLConnection) new URL(BASE + path).openConnection();
      con.setRequestMethod("GET");
      con.setConnectTimeout(TIMEOUT_MS);
      con.setReadTimeout(TIMEOUT_MS);
      con.setUseCaches(false);
      con.setInstanceFollowRedirects(false); // the token goes to habitica.com only, never along a redirect; a 3xx is a failed call
      con.setRequestProperty("x-api-user", cr.userId);
      con.setRequestProperty("x-api-key", cr.apiToken);
      con.setRequestProperty("x-client", cr.client);
      con.setRequestProperty("accept", "application/json");
      final int code = con.getResponseCode();
      if (code == 429) {
        rateLimited(c, con);
        return new Fetched(Outcome.RATE_LIMITED, null, cr.userId);
      }
      if (code == 401) {
        // the token no longer works: no more calls until the app reads again or the player logs in again
        refused(c, gen);
        return new Fetched(Outcome.AUTH_FAILED, null, cr.userId);
      }
      if (code == 403) {
        blocked(c, gen);
        return new Fetched(Outcome.AUTH_FAILED, null, cr.userId);
      }
      // Habitica failing (5xx): the surfaces say so once their numbers are old; any other answer clears it
      Session.ifCurrent(gen, () -> LastRead.setServerTrouble(c, code >= 500));
      if (code < 200 || code >= 300) return new Fetched(Outcome.FAILED, null, cr.userId);
      Object body = Json.parse(readAll(con.getInputStream()));
      Object data = Json.at(body, "data");
      if (!Boolean.TRUE.equals(Json.at(body, "success")) || data == null) return new Fetched(Outcome.FAILED, null, cr.userId);
      Fetched f = new Fetched(Outcome.READ, data, cr.userId);
      f.startedAt = startedAt;
      return f;
    } catch (IOException e) {
      Session.ifCurrent(gen, () -> LastRead.setOffline(c, true));
      return new Fetched(Outcome.OFFLINE, null, cr.userId);
    } catch (RuntimeException e) {
      return new Fetched(Outcome.FAILED, null, cr.userId);
    } finally {
      if (con != null) con.disconnect();
    }
  }

  /**
   * One automatic call for the night gear swap (blocking). Never goes out sooner than the spacing allows: then it
   * says when it may. Only GET and the equip endpoint are used (NightSwap).
   */
  static NightSwap.Response nightCall (Context c, String method, String path) {
    final int gen = Session.generation();
    TokenStore.Credentials cr = TokenStore.load(c);
    if (cr == null) return NightSwap.Response.of(NightSwap.Kind.AUTH);
    synchronized (HabiticaReader.class) {
      SharedPreferences p = prefs(c);
      if (p.getBoolean("authFailed", false)) return NightSwap.Response.of(NightSwap.Kind.AUTH);
      long now = System.currentTimeMillis();
      long at = Math.max(retryAt(p, System.currentTimeMillis()), lastCallAt(p, System.currentTimeMillis()) + AUTO_GAP_MS);
      if (now < at) return NightSwap.Response.waitUntil(at);
      noteCall(c);
    }
    final long startedAt = System.currentTimeMillis();
    HttpURLConnection con = null;
    try {
      con = (HttpURLConnection) new URL(BASE + path).openConnection();
      con.setRequestMethod(method);
      con.setConnectTimeout(TIMEOUT_MS);
      con.setReadTimeout(TIMEOUT_MS);
      con.setUseCaches(false);
      con.setInstanceFollowRedirects(false);
      con.setRequestProperty("x-api-user", cr.userId);
      con.setRequestProperty("x-api-key", cr.apiToken);
      con.setRequestProperty("x-client", cr.client);
      con.setRequestProperty("accept", "application/json");
      if (method.equals("POST")) {
        // no body, as the app sends equips
        con.setDoOutput(true);
        con.setFixedLengthStreamingMode(0);
        con.getOutputStream().close();
      }
      int code = con.getResponseCode();
      if (code == 429) return NightSwap.Response.waitUntil(rateLimited(c, con));
      if (code == 401 || code == 403) {
        if (code == 401) refused(c, gen); else blocked(c, gen);
        return NightSwap.Response.of(NightSwap.Kind.AUTH);
      }
      if (code < 200 || code >= 300) return NightSwap.Response.of(code >= 500 ? NightSwap.Kind.OFFLINE : NightSwap.Kind.REFUSED);
      Object body = Json.parse(readAll(con.getInputStream()));
      if (!Boolean.TRUE.equals(Json.at(body, "success"))) return NightSwap.Response.of(NightSwap.Kind.REFUSED);
      final Object data = Json.at(body, "data");
      // a fresh read for the notification, widget and tile too (not after a logout since the call went out)
      if (method.equals("GET") && path.equals("/api/v3/user") && data != null && cr.userId.equals(Json.at(data, "_id"))) {
        Session.ifCurrent(gen, () -> {
          LastRead.save(c, data, System.currentTimeMillis());
          RepeatReminders.onRead(c, data, startedAt);
        });
      }
      return NightSwap.Response.ok(data);
    } catch (IOException e) {
      return NightSwap.Response.of(NightSwap.Kind.OFFLINE);
    } catch (RuntimeException e) {
      return NightSwap.Response.of(NightSwap.Kind.REFUSED);
    } finally {
      if (con != null) con.disconnect();
    }
  }

  /**
   * One call the player tapped for outside the app (the repeating To-Do reminder's "Add to To-Dos": POST
   * /api/v3/tasks/user with a JSON body). Blocking. Taps are not automatic calls, but still wait out a 429's
   * Retry-After and stay a few seconds apart; a refused token stops everything as for reads.
   */
  static NightSwap.Response tapCall (Context c, String method, String path, String json) {
    final int gen = Session.generation();
    TokenStore.Credentials cr = TokenStore.load(c);
    if (cr == null) return NightSwap.Response.of(NightSwap.Kind.AUTH);
    synchronized (HabiticaReader.class) {
      SharedPreferences p = prefs(c);
      if (p.getBoolean("authFailed", false)) return NightSwap.Response.of(NightSwap.Kind.AUTH);
      long now = System.currentTimeMillis();
      if (now < retryAt(p, now)) return NightSwap.Response.waitUntil(retryAt(p, now));
      long gapAt = lastCallAt(p, now) + TAP_GAP_MS;
      if (now < gapAt) { try { Thread.sleep(gapAt - now); } catch (InterruptedException e) { Thread.currentThread().interrupt(); } }
      noteCall(c);
    }
    HttpURLConnection con = null;
    try {
      con = (HttpURLConnection) new URL(BASE + path).openConnection();
      con.setRequestMethod(method);
      con.setConnectTimeout(TIMEOUT_MS);
      con.setReadTimeout(TIMEOUT_MS);
      con.setUseCaches(false);
      con.setInstanceFollowRedirects(false);
      con.setRequestProperty("x-api-user", cr.userId);
      con.setRequestProperty("x-api-key", cr.apiToken);
      con.setRequestProperty("x-client", cr.client);
      con.setRequestProperty("accept", "application/json");
      byte[] out = json == null ? new byte[0] : json.getBytes(StandardCharsets.UTF_8);
      if (json != null) con.setRequestProperty("content-type", "application/json");
      con.setDoOutput(true);
      con.setFixedLengthStreamingMode(out.length);
      try (java.io.OutputStream os = con.getOutputStream()) { os.write(out); }
      int code = con.getResponseCode();
      if (code == 429) return NightSwap.Response.waitUntil(rateLimited(c, con));
      if (code == 401 || code == 403) {
        if (code == 401) refused(c, gen); else blocked(c, gen);
        return NightSwap.Response.of(NightSwap.Kind.AUTH);
      }
      if (code < 200 || code >= 300) return NightSwap.Response.of(code >= 500 ? NightSwap.Kind.OFFLINE : NightSwap.Kind.REFUSED);
      Object body = Json.parse(readAll(con.getInputStream()));
      if (!Boolean.TRUE.equals(Json.at(body, "success"))) return NightSwap.Response.of(NightSwap.Kind.REFUSED);
      return NightSwap.Response.ok(Json.at(body, "data"));
    } catch (IOException e) {
      return NightSwap.Response.of(NightSwap.Kind.OFFLINE);
    } catch (RuntimeException e) {
      return NightSwap.Response.of(NightSwap.Kind.REFUSED);
    } finally {
      if (con != null) con.disconnect();
    }
  }

  private static String readAll (InputStream in) throws IOException {
    try (InputStream s = in) {
      ByteArrayOutputStream out = new ByteArrayOutputStream();
      byte[] buf = new byte[32768];
      for (int n; (n = s.read(buf)) > 0; ) out.write(buf, 0, n);
      return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }
  }

  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
