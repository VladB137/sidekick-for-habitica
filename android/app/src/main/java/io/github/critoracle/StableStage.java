package io.github.critoracle;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.ContentObserver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.text.Layout;
import android.text.StaticLayout;
import android.text.TextPaint;
import android.util.Log;
import android.view.Surface;
import android.view.SurfaceHolder;
import io.github.critoracle.verdict.Json;
import io.github.critoracle.verdict.StableHerd;
import io.github.critoracle.verdict.StableLight;
import io.github.critoracle.verdict.StableLoop;
import io.github.critoracle.verdict.StableNature;
import io.github.critoracle.verdict.StableTurns;
import io.github.critoracle.verdict.StableAmbient;
import io.github.critoracle.verdict.StableWeather;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CopyOnWriteArraySet;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The open playground moving on one surface: the live wallpaper's (StableWallpaper) or the screen saver's
 * (StableDream). It reads the scenery the app sent (StableWallpaper.save), moves the herd and the weather with the
 * Java port (verdict/StableHerd, StableWeather, StableAmbient for the critters) and draws them; when its timer runs is {@link StableLoop}'s call,
 * asked again at every change its host or Android reports, so no order of callbacks leaves the herd standing.
 *
 * Battery: it steps 30 times a second at most on a timer (not every screen refresh), only while shown on a screen
 * that is on, redraws only when something visible moved, and draws nothing on its own besides. With Android's
 * animations off or Battery Saver on it is a still picture that changes with the light of the day.
 */
final class StableStage implements StableHerd.Paint {
  /** Drawn over the playground in screen pixels (the screen saver's clock). */
  interface Overlay {
    /** changes when the overlay would draw something else (a frame that would draw the same is skipped) */
    int key ();

    void draw (Canvas c, int w, int h, boolean night);
  }

  private static final long TICK_MS = 1000 / 30;
  private static final int MAX_CRITTERS = 32;
  /** a rainbow's radius, art pixels, no bigger than a picture's side */
  private static final int MAX_BOW = 4096;
  private static final String TAG = "StableStage";
  /** the stages showing now (home screen, the picker's preview, the screen saver), told when the app sends new scenery */
  private static final Set<StableStage> STAGES = new CopyOnWriteArraySet<>();
  static final Handler MAIN = new Handler(Looper.getMainLooper());

  static void reloadAll () { MAIN.post(() -> { for (StableStage s : STAGES) s.reload(); }); }

  /** One tree standing among the creatures: its picture's top-left and the foot it sorts by. */
  private static final class Tree { Bitmap pic; int left, top, foot; }

  private final Context ctx;
  private final SurfaceHolder holder;
  private final Overlay overlay;
  private final Paint px = new Paint();
  private JSONObject scene;
  private StableHerd herd;
  private final StableWeather weather = new StableWeather();
  private Bitmap[] bodies = new Bitmap[0], heads = new Bitmap[0];
  /** the avatar's pictures on creature i (a ridden mount), else null */
  private Bitmap[][] riders = new Bitmap[0][];
  /** the avatar's pictures standing by the door */
  private Bitmap[] standing = new Bitmap[0];
  /** resting in the Inn: the day's light is dusk's */
  private boolean resting;
  private Bitmap bg;
  private final List<Tree> trees = new ArrayList<>();
  private String light, weatherKind;
  private int worldW, worldH, bandTop, bandBottom;
  /** the scenery's critters at this light, where shooting stars may start (null: never), and how many fall tonight */
  private int[][] critters = new int[0][];
  private int[] sky, bow;
  private int meteors;
  /** the day's shower falling now, a rainbow after it (null: none now), both from the date */
  private boolean raining;
  private int[] rainbow;
  /** when the timer runs: visible, a surface, the screen on, and whether it is the still picture */
  private final StableLoop loop = new StableLoop();
  /** a tick that failed starts the herd again from what the app sent, at most once a minute (uptime ms) */
  private long failedAt = Long.MIN_VALUE / 2;
  /** the screen on or off, Battery Saver switched */
  private final BroadcastReceiver phone = new BroadcastReceiver() {
    @Override public void onReceive (Context c, Intent i) { sync(false); }
  };
  /** Android's animations switched off or on */
  private final ContentObserver animations = new ContentObserver(MAIN) {
    @Override public void onChange (boolean self) { sync(false); }
  };
  private int surfW, surfH, k = 1, ox, oy;
  /** when the next tick is due (uptime ms) */
  private long due;
  /** this frame's drawing calls, and the last frame's: a frame that would draw the same is skipped */
  private int[] ops = new int[1024], last = new int[0];
  private int n;
  private Canvas canvas;
  private final Rect src = new Rect();
  private final RectF dst = new RectF();
  private final Matrix turn = new Matrix();

  StableStage (Context ctx, SurfaceHolder holder, Overlay overlay) {
    this.ctx = ctx;
    this.holder = holder;
    this.overlay = overlay;
    px.setAntiAlias(false);
    px.setFilterBitmap(false);
    px.setDither(false);
  }

  /* ---- what the host tells it */

  void create () {
    IntentFilter f = new IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED);
    f.addAction(Intent.ACTION_SCREEN_ON);
    f.addAction(Intent.ACTION_SCREEN_OFF);
    // system broadcasts only; RECEIVER_NOT_EXPORTED is required from Android 14 and still gets them
    ctx.registerReceiver(phone, f, null, MAIN, Build.VERSION.SDK_INT >= 33 ? Context.RECEIVER_NOT_EXPORTED : 0);
    ctx.getContentResolver().registerContentObserver(android.provider.Settings.Global.getUriFor(android.provider.Settings.Global.ANIMATOR_DURATION_SCALE), false, animations);
    STAGES.add(this);
    reload();
    // the app, if it's running, sends the scenery now (a wallpaper chosen from the phone's own picker, the screen saver)
    SidekickPlugin.stableWallpaperShown();
  }

  void destroy () {
    STAGES.remove(this);
    try { ctx.unregisterReceiver(phone); } catch (IllegalArgumentException ignored) { /* not registered */ }
    ctx.getContentResolver().unregisterContentObserver(animations);
    loop.visible = false;
    sync(false);
  }

  void surfaceChanged (int width, int height) {
    surfW = width; surfH = height;
    fit();
    loop.surface = true;
    // drawn even while hidden, so the surface never shows stale or empty pixels when it appears
    last = new int[0];
    draw();
    // a surface made again while it stays visible (Android says nothing else): the herd moves on
    sync(false);
  }

  void surfaceDestroyed () {
    loop.surface = false;
    sync(false);
  }

  void visible (boolean v) {
    loop.visible = v;
    sync(true);
  }

  /** A nudge that restarts a timer that stopped ticking (asks the phone nothing). */
  void nudge () { act(); }

  /** Draws again if anything shown changed (the overlay's key, say); nothing while hidden. */
  void refresh () { if (loop.shown()) draw(); }

  /** A tap at screen (x, y): the creature under the finger gets a happy hop and a heart. */
  void tap (int x, int y) {
    if (herd == null || k <= 0) return;
    StableHerd.Creature c = hit((x - ox) / (double) k, (y - oy) / (double) k);
    if (c != null && herd.pet(c)) { last = new int[0]; draw(); sync(false); }
  }

  /** Animations off in Android's settings (the app's reduced motion), or Battery Saver: the still picture. */
  private boolean stillPicture () {
    PowerManager pm = ctx.getSystemService(PowerManager.class);
    if (pm != null && pm.isPowerSaveMode()) return true;
    return android.provider.Settings.Global.getFloat(ctx.getContentResolver(), android.provider.Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f;
  }

  /* ---- the scenery */

  void reload () {
    scene = null; herd = null; bg = null; light = null; trees.clear();
    bodies = new Bitmap[0]; heads = new Bitmap[0]; riders = new Bitmap[0][]; standing = new Bitmap[0]; resting = false;
    File d = StableWallpaper.dir(ctx);
    if (TokenStore.has(ctx)) {
      try {
        JSONObject o = new JSONObject(new String(Files.readAllBytes(new File(d, "scenery.json").toPath()), StandardCharsets.UTF_8));
        JSONObject w = o.getJSONObject("world"), band = o.getJSONObject("band");
        worldW = w.getInt("w"); worldH = w.getInt("h");
        bandTop = band.getInt("top"); bandBottom = band.getInt("bottom");
        JSONObject door = o.optJSONObject("door");
        JSONArray cs = o.getJSONArray("creatures");
        List<StableHerd.Look> looks = new ArrayList<>();
        bodies = new Bitmap[cs.length()]; heads = new Bitmap[cs.length()]; riders = new Bitmap[cs.length()][];
        int[][][] layers = new int[cs.length()][][];
        for (int i = 0; i < cs.length(); i++) {
          JSONObject c = cs.getJSONObject(i);
          JSONObject spot = c.optJSONObject("spot");
          looks.add(new StableHerd.Look(c.getString("id"), c.getString("species"), c.getBoolean("mount"), StableHerd.motionOf(c.optString("gait", null)),
              c.optString("facing", "right"), c.optBoolean("nocturnal"), c.optBoolean("hasHead"), c.getInt("w"), c.getInt("h"), c.getInt("ax"),
              spot != null ? spot.getDouble("x") : Double.NaN, spot != null ? spot.getDouble("y") : Double.NaN));
          // how it gets on with the others here (src/app/stable/social.ts)
          String temper = c.optString("temper", "");
          if (!temper.isEmpty()) {
            JSONArray bs = c.optJSONArray("bonds");
            int nb = bs != null ? bs.length() : 0;
            String[] ids = new String[nb], kinds = new String[nb];
            for (int j = 0; j < nb; j++) { ids[j] = bs.getJSONObject(j).getString("id"); kinds[j] = bs.getJSONObject(j).getString("kind"); }
            looks.get(looks.size() - 1).social(temper, ids, kinds);
          }
          StableHerd.Look look = looks.get(looks.size() - 1);
          look.cold = c.optBoolean("cold");
          look.yours = c.optBoolean("yours");
          // its signature pair's part (src/app/stable/social.ts signaturesOf)
          look.lead = c.optString("lead", null); look.guard = c.optString("guard", null); look.orbit = c.optString("orbit", null);
          look.pounce = c.optString("pounce", null); look.meet = c.optString("meet", null); look.elder = c.optBoolean("elder");
          look.flock = strings(c.optJSONArray("flock")); look.fold = strings(c.optJSONArray("fold"));
          // its species' ways (src/stable/natures.ts), run as the app runs them
          JSONObject nature = c.optJSONObject("nature");
          if (nature != null) look.nature(StableNature.of(Json.parse(nature.toString())));
          bodies[i] = decode(new File(d, "body-" + i + ".png"));
          heads[i] = c.optBoolean("hasHead") ? decode(new File(d, "head-" + i + ".png")) : null;
          if (bodies[i] == null) throw new IOException("creature picture");
          JSONArray rider = c.optJSONArray("rider");
          if (rider != null && rider.length() > 0) {
            List<Bitmap> pics = new ArrayList<>();
            List<int[]> ls = new ArrayList<>();
            for (int j = 0; j < rider.length(); j++) {
              JSONObject part = rider.getJSONObject(j);
              Bitmap b = decode(new File(StableWallpaper.avatarDir(ctx), part.getString("file")));
              if (b == null) continue;
              pics.add(b);
              ls.add(new int[] { part.getInt("x"), part.getInt("y"), b.getWidth(), b.getHeight() });
            }
            riders[i] = pics.toArray(new Bitmap[0]);
            layers[i] = ls.toArray(new int[0][]);
          }
        }
        herd = new StableHerd(o.getInt("seed"), o.getString("herdSeed"), worldW, worldH, bandTop, bandBottom,
            door != null ? new double[] { door.getDouble("x"), door.getDouble("y") } : null, 0x4E6B34);
        herd.hour = hourNow();
        herd.still = loop.still;
        herd.weather = weatherKind;
        // the scene's places (the pond and the newest flowers where creatures meet their kind among them), the season and moon the scenery was painted for, the natures' particles
        JSONArray spots = o.optJSONArray("spots");
        if (spots != null) herd.spots = StableNature.spots(Json.parse(spots.toString()));
        JSONObject sky = o.optJSONObject("sky");
        if (sky != null) { herd.winter = sky.optBoolean("winter"); herd.moon = sky.optInt("moon", 1); }
        JSONObject fx = o.optJSONObject("particles");
        if (fx != null) herd.looks = StableNature.looks(Json.parse(fx.toString()));
        herd.set(looks);
        // the player's avatar on the mount it rides (getting on is a happy hop, as when the Stable opens)
        for (int i = 0; i < layers.length; i++) if (layers[i] != null && layers[i].length > 0) herd.ride(herd.creatures.get(i), layers[i]);
        // or on foot by the door
        JSONArray foot = o.optJSONArray("avatar");
        if (foot != null && foot.length() > 0) {
          List<Bitmap> pics = new ArrayList<>();
          List<int[]> ls = new ArrayList<>();
          for (int j = 0; j < foot.length(); j++) {
            JSONObject part = foot.getJSONObject(j);
            Bitmap b = decode(new File(StableWallpaper.avatarDir(ctx), part.getString("file")));
            if (b == null) continue;
            pics.add(b);
            ls.add(new int[] { part.getInt("x"), part.getInt("y"), b.getWidth(), b.getHeight() });
          }
          standing = pics.toArray(new Bitmap[0]);
          herd.stand(ls.toArray(new int[0][]));
        }
        resting = o.optBoolean("resting");
        herd.resting = resting;
        scene = o;
      } catch (IOException | JSONException | RuntimeException e) {
        scene = null; herd = null;
      }
    }
    fit();
    lightNow();
    last = new int[0];
    if (loop.shown()) draw();
    sync(false);
  }

  private static String[] strings (JSONArray a) throws JSONException {
    String[] out = new String[a != null ? a.length() : 0];
    for (int i = 0; i < out.length; i++) out[i] = a.getString(i);
    return out;
  }

  private static double[] point (JSONObject p) throws JSONException {
    return p != null ? new double[] { p.getDouble("x"), p.getDouble("y") } : null;
  }

  private Bitmap decode (File f) {
    BitmapFactory.Options o = new BitmapFactory.Options();
    o.inScaled = false;
    return f.isFile() ? BitmapFactory.decodeFile(f.getPath(), o) : null;
  }

  /** the light for the phone's hour: its background, trees, shadow colour, weather and critters */
  private void lightNow () {
    if (scene == null) return;
    String l = StableLight.at(LocalTime.now().getHour());
    // resting in the Inn the stable dims, as in the app
    if (resting && !"night".equals(l)) l = "dusk";
    if (!l.equals(light)) newLight(l);
    // shooting stars in a clear night sky, a shower on the Perseids' and the Geminids' nights; rain where it can rain
    java.time.LocalDateTime now = java.time.LocalDateTime.now();
    meteors = sky == null || !"night".equals(light) ? 0 : StableAmbient.showerNight(now) ? 2 : 1;
    raining = bow != null && StableWeather.rainAt(now);
    rainbow = bow != null && StableWeather.rainbowAt(now) ? bow : null;
  }

  private void newLight (String l) {
    try {
      File d = StableWallpaper.dir(ctx);
      JSONObject o = scene.getJSONObject("lights").getJSONObject(l);
      Bitmap b = decode(new File(d, "bg-" + l + ".png"));
      if (b == null) return;
      List<Tree> ts = new ArrayList<>();
      JSONArray arr = o.optJSONArray("trees");
      for (int i = 0; arr != null && i < arr.length(); i++) {
        JSONObject t = arr.getJSONObject(i);
        Tree tr = new Tree();
        tr.pic = decode(new File(d, "tree-" + l + "-" + i + ".png"));
        tr.left = t.getInt("left"); tr.top = t.getInt("top"); tr.foot = t.getInt("foot");
        if (tr.pic != null) ts.add(tr);
      }
      bg = b;
      trees.clear(); trees.addAll(ts);
      weatherKind = o.isNull("weather") ? null : o.optString("weather", null);
      lifeOf(o.optJSONObject("life"));
      if (herd != null) { herd.shadow = StableWallpaper.rgb(o.optString("shadow", "#4E6B34")); herd.weather = weatherKind; }
      light = l;
      last = new int[0];
    } catch (JSONException e) {
      // keeps the light it had
    }
  }

  /** The light's critters and sky (ambient.ts Life); none from an older app or anything malformed. */
  private void lifeOf (JSONObject life) {
    critters = new int[0][]; sky = null; bow = null;
    if (life == null) return;
    try {
      JSONArray cs = life.optJSONArray("critters");
      List<int[]> out = new ArrayList<>();
      for (int i = 0; cs != null && i < cs.length() && i < MAX_CRITTERS; i++) {
        JSONArray c = cs.getJSONArray(i);
        if (c.length() != StableAmbient.FIELDS) continue;
        int[] v = new int[StableAmbient.FIELDS];
        for (int j = 0; j < v.length; j++) v[j] = c.getInt(j);
        out.add(v);
      }
      JSONArray s = life.optJSONArray("sky");
      if (s != null && s.length() == 4) sky = new int[] { s.getInt(0), s.getInt(1), s.getInt(2), s.getInt(3) };
      JSONArray b = life.optJSONArray("bow");
      if (b != null && b.length() == 3 && b.getInt(2) > 0 && b.getInt(2) <= MAX_BOW) bow = new int[] { b.getInt(0), b.getInt(1), b.getInt(2) };
      critters = out.toArray(new int[0][]);
    } catch (JSONException e) {
      critters = new int[0][]; sky = null; bow = null;
    }
  }

  /**
   * Whole-number scale that covers the screen; centred across, the ground kept at the bottom. On a screen wider
   * than tall (a screen saver on a stand) that would show only the foot of the meadow, so the meadow's walking
   * band is centred instead, as far as the picture reaches.
   */
  private void fit () {
    if (surfW <= 0 || surfH <= 0 || worldW <= 0 || worldH <= 0) return;
    k = Math.max(1, Math.max((surfW + worldW - 1) / worldW, (surfH + worldH - 1) / worldH));
    ox = (surfW - worldW * k) / 2;
    oy = surfH - worldH * k;
    if (surfW > surfH && bandBottom > bandTop) oy = Math.max(surfH - worldH * k, Math.min(0, surfH / 2 - (bandTop + bandBottom) / 2 * k));
  }

  private double hourNow () { LocalTime t = LocalTime.now(); return t.getHour() + t.getMinute() / 60.0; }

  /* ---- the loop: a timer at 30 a second while visible and moving */

  private final Runnable frame = this::onFrame;
  private final Runnable lightCheck = () -> { lightNow(); draw(); scheduleLight(); };

  /**
   * After any change: asks Battery Saver, the animations setting and the screen again, then {@link #act}.
   * {@code redraw} draws the whole picture again (just shown).
   */
  private void sync (boolean redraw) {
    PowerManager pm = ctx.getSystemService(PowerManager.class);
    loop.awake = pm == null || pm.isInteractive();
    if (loop.shown()) {
      boolean s = stillPicture();
      if (s != loop.still) { loop.still = s; redraw = true; }
      if (herd != null) herd.still = s;
      lightNow();
      if (redraw) { last = new int[0]; draw(); }
    }
    act();
  }

  /** Starts, stops or keeps the timer as {@link StableLoop} says. */
  private void act () {
    // nothing to animate: no scenery yet, or the still picture without a heart left
    boolean moving = herd != null && (!loop.still || !herd.particles.isEmpty());
    switch (loop.sync(SystemClock.uptimeMillis(), moving)) {
      case START:
        MAIN.removeCallbacks(frame);
        MAIN.removeCallbacks(lightCheck);
        due = SystemClock.uptimeMillis();
        MAIN.post(frame);
        break;
      case STILL:
        MAIN.removeCallbacks(frame);
        scheduleLight();
        break;
      case STOP:
        MAIN.removeCallbacks(frame);
        MAIN.removeCallbacks(lightCheck);
        break;
      case NONE:
        break;
    }
  }

  /** the still picture changes only at the next light of the day */
  private void scheduleLight () {
    MAIN.removeCallbacks(lightCheck);
    if (!loop.shown()) return;
    long ms = java.time.Duration.between(java.time.LocalDateTime.now(), StableLight.next(java.time.LocalDateTime.now())).toMillis();
    MAIN.postDelayed(lightCheck, Math.max(1000, ms + 1000));
  }

  private void onFrame () {
    long now = SystemClock.uptimeMillis();
    if (!loop.tick(now)) return;
    boolean still = loop.still;
    try {
      // after a stall the world skips ahead instead of racing through every missed tick (frame.ts)
      int steps = (int) Math.min(4, Math.max(1, (now - due) / TICK_MS + 1));
      if (herd != null) {
        for (int i = 0; i < steps; i++) {
          if (still) herd.stillTick(); else herd.step();
          if (herd.tick % 30 == 0) { herd.hour = hourNow(); lightNow(); }
        }
      }
      draw();
      due += steps * TICK_MS;
    } catch (RuntimeException e) {
      // a broken tick must not take the app down with it (the wallpaper and the screen saver run in the app's process)
      Log.w(TAG, "a frame failed", e);
      loop.ended();
      if (now - failedAt >= 60_000) { failedAt = now; MAIN.post(this::reload); }
      return;
    }
    // the still picture only ran to let a heart live out its life
    if (herd == null || (still && herd.particles.isEmpty())) { loop.ended(); scheduleLight(); return; }
    if (due <= now) due = now + TICK_MS;
    MAIN.postAtTime(frame, due);
  }

  /* ---- drawing: record the frame, skip it when nothing visible changed, else replay it on the screen */

  private void draw () {
    if (surfW <= 0) return;
    if (scene == null || herd == null || bg == null) { empty(); last = new int[0]; return; }
    // the still picture's perches and poses for the hour it is now (nothing steps there); moving, everyone back down
    if (loop.still) herd.hour = hourNow();
    herd.settle();
    n = 0; canvas = null;
    record();
    if (overlay != null) op(5, overlay.key(), 0, 0, 0, 0, 0, 0, 0, 0);
    if (same()) return;
    Surface s = holder.getSurface();
    if (s == null || !s.isValid()) return;
    Canvas c;
    try { c = s.lockHardwareCanvas(); } catch (RuntimeException e) { return; }
    // kept only once it reaches the surface, so a frame that couldn't be drawn is tried again
    last = Arrays.copyOf(ops, n);
    try {
      c.drawColor(0xFF000000);
      c.save();
      c.translate(ox, oy);
      c.scale(k, k);
      src.set(0, 0, bg.getWidth(), bg.getHeight());
      dst.set(0, 0, worldW, worldH);
      c.drawBitmap(bg, src, dst, px);
      canvas = c;
      n = 0;
      record();
      canvas = null;
      c.restore();
      if (overlay != null) overlay.draw(c, surfW, surfH, "night".equals(light));
    } finally {
      s.unlockCanvasAndPost(c);
    }
  }

  /** the lights some creatures give off on the ground, the critters behind, trees and creatures in painter's order
   * (by foot, trees first on a tie), the butterflies, then weather, then hearts and Zzz */
  private void record () {
    herd.drawGlows(this);
    StableAmbient.draw(this, critters, sky, false, herd.tick, meteors, rainbow);
    List<StableHerd.Figure> cs = herd.figures();
    int ti = 0;
    List<Tree> ts = trees;
    for (StableHerd.Figure cr : cs) {
      while (ti < ts.size() && ts.get(ti).foot <= Math.round(cr.foot())) tree(ts.get(ti++));
      cr.draw(this);
    }
    while (ti < ts.size()) tree(ts.get(ti++));
    StableAmbient.draw(this, critters, sky, true, herd.tick, 0, null);
    weather.draw(this, raining ? "rain" : weatherKind, worldW, worldH, bandTop, bandBottom, "night".equals(light), herd.tick);
    herd.drawParticles(this);
  }

  private boolean same () {
    if (n != last.length) return false;
    for (int i = 0; i < n; i++) if (ops[i] != last[i]) return false;
    return true;
  }

  private void tree (Tree t) {
    op(3, t.foot, t.left, t.top, 0, 0, 0, 0, 0, 0);
    if (canvas != null) canvas.drawBitmap(t.pic, t.left, t.top, px);
  }

  @Override
  public void cell (int i, boolean head, int sx, int sy, int w, int h, int dx, int dy, boolean flip) {
    op(1, i, head ? 1 : 0, sx, sy, w, h, dx, dy, flip ? 1 : 0);
    Canvas c = canvas;
    Bitmap b = head ? heads[i] : bodies[i];
    if (c == null || b == null) return;
    src.set(sx, sy, sx + w, sy + h);
    dst.set(dx, dy, dx + w, dy + h);
    if (!flip) { c.drawBitmap(b, src, dst, px); return; }
    c.save();
    // mirrored in place: the cell's columns run the other way
    c.scale(-1, 1, dx + w / 2f, 0);
    c.drawBitmap(b, src, dst, px);
    c.restore();
  }

  @Override
  public void turned (int i, boolean head, int sx, int sy, int w, int h, int dx, int dy, boolean flip, int q) {
    op(6, i, head ? 1 : 0, sx, sy, w, h, dx, dy, (flip ? 1 : 0) | q << 1);
    Canvas c = canvas;
    Bitmap b = head ? heads[i] : bodies[i];
    if (c == null || b == null) return;
    float[] m = StableTurns.matrix(q, flip, w, h, dx, dy);
    turn.setValues(new float[] { m[0], m[2], m[4], m[1], m[3], m[5], 0, 0, 1 });
    src.set(sx, sy, sx + w, sy + h);
    dst.set(0, 0, w, h);
    c.save();
    // mirrored and turned by whole quarters with an exact matrix: every picture pixel on one world pixel
    c.concat(turn);
    c.drawBitmap(b, src, dst, px);
    c.restore();
  }

  @Override
  public void rider (int i, int part, int dx, int dy, boolean flip) {
    op(4, i, part, dx, dy, flip ? 1 : 0, 0, 0, 0, 0);
    Canvas c = canvas;
    Bitmap b = i < riders.length && riders[i] != null && part < riders[i].length ? riders[i][part] : null;
    if (c == null || b == null) return;
    if (!flip) { c.drawBitmap(b, dx, dy, px); return; }
    c.save();
    c.scale(-1, 1, dx + b.getWidth() / 2f, 0);
    c.drawBitmap(b, dx, dy, px);
    c.restore();
  }

  @Override
  public void avatar (int part, int dx, int dy) {
    op(5, part, dx, dy, 0, 0, 0, 0, 0, 0);
    Canvas c = canvas;
    Bitmap b = part < standing.length ? standing[part] : null;
    if (c != null && b != null) c.drawBitmap(b, dx, dy, px);
  }

  @Override
  public void rect (int rgb, int x, int y, int w, int h) {
    op(2, rgb, x, y, w, h, 0, 0, 0, 0);
    if (canvas == null) return;
    px.setColor(0xFF000000 | rgb);
    canvas.drawRect(x, y, x + w, y + h, px);
  }

  private void op (int a, int b, int c, int d, int e, int f, int g, int h, int i, int j) {
    if (n + 10 > ops.length) ops = Arrays.copyOf(ops, ops.length * 2);
    ops[n++] = a; ops[n++] = b; ops[n++] = c; ops[n++] = d; ops[n++] = e; ops[n++] = f; ops[n++] = g; ops[n++] = h; ops[n++] = i; ops[n++] = j;
  }

  /** the front-most creature with a painted pixel at world (x, y) */
  private StableHerd.Creature hit (double x, double y) {
    List<StableHerd.Creature> cs = herd.drawOrder();
    Collections.reverse(cs);
    int wx = (int) Math.floor(x), wy = (int) Math.floor(y);
    for (StableHerd.Creature c : cs) {
      int[] p = c.pixelAt(wx, wy);
      if (p != null && (painted(bodies[c.n], p[0], p[1]) || painted(heads[c.n], p[0], p[1]))) return c;
    }
    return null;
  }

  private boolean painted (Bitmap b, int x, int y) {
    return b != null && x >= 0 && y >= 0 && x < b.getWidth() && y < b.getHeight() && (b.getPixel(x, y) >>> 24) >= 128;
  }

  /** No scenery yet (never sent, or logged out): the app's teal and how to bring the Stable here. */
  private void empty () {
    Surface s = holder.getSurface();
    if (s == null || !s.isValid()) return;
    Canvas c;
    try { c = s.lockHardwareCanvas(); } catch (RuntimeException e) { return; }
    try {
      c.drawColor(0xFF00796B);
      TextPaint tp = new TextPaint(Paint.ANTI_ALIAS_FLAG);
      tp.setColor(0xFFFFFFFF);
      tp.setTextSize(18 * ctx.getResources().getDisplayMetrics().scaledDensity);
      String text = ctx.getString(TokenStore.has(ctx) ? R.string.stable_wallpaper_empty : R.string.widget_empty);
      int width = Math.max(1, surfW - Math.round(64 * ctx.getResources().getDisplayMetrics().density));
      StaticLayout layout = StaticLayout.Builder.obtain(text, 0, text.length(), tp, width).setAlignment(Layout.Alignment.ALIGN_CENTER).build();
      c.save();
      c.translate((surfW - width) / 2f, (surfH - layout.getHeight()) / 2f);
      layout.draw(c);
      c.restore();
      // the clock goes above the message, where it is with the Stable
      if (overlay != null) overlay.draw(c, surfW, surfH, false);
    } finally {
      s.unlockCanvasAndPost(c);
    }
  }
}
