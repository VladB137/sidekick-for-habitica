package io.github.critoracle;

import android.app.WallpaperInfo;
import android.app.WallpaperManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.Bundle;
import android.service.wallpaper.WallpaperService;
import android.util.Base64;
import android.util.DisplayMetrics;
import android.view.SurfaceHolder;
import android.view.WindowManager;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The Stable as a live wallpaper: the open playground moving on the home screen.
 *
 * The scenery can't be drawn here (the scenes are TypeScript), so the app paints it once per light of the day
 * (src/app/stable/scenery.ts: the background, the trees that stand among the creatures, each creature's
 * picture) and hands it over with what moves; the creatures and the weather move here, with the app's own
 * numbers ported to Java (verdict/StableHerd, StableWeather, tested tick by tick against the TypeScript).
 *
 * The moving and drawing are {@link StableStage}'s, shared with the screen saver (StableDream): it runs only
 * while the wallpaper is visible and the screen is on, at 30 steps a second at most, and with Android's animations
 * off or Battery Saver on it is a still picture that changes with the light of the day.
 * It never calls Habitica's API and keeps what the app sent only with "Remember on this device", losing it at
 * logout. The one thing it fetches: the avatar's pictures on a ridden mount or standing by the stable's door,
 * from Habitica's image server (the same files the app shows the avatar with; the app can't hand them over, its canvas can't read them), once per
 * look, kept beside the scenery.
 */
public class StableWallpaper extends WallpaperService {
  static final String[] LIGHTS = StableWidget.LIGHTS;
  private static final String PREFS = "critoracle-stablewallpaper";
  private static final int MAX_SIDE = 4096, MAX_CREATURES = 16, MAX_TREES = 24;
  private static final int MAX_RIDER = 16;

  @Override
  public Engine onCreateEngine () { return new StableEngine(); }

  /* ---------------------------------------------------------------- what the app sent */

  /** Whether this is the phone's live wallpaper now, on the home screen or (Android 14+, which can tell) the lock screen. */
  static boolean isSet (Context c) {
    try {
      WallpaperManager wm = WallpaperManager.getInstance(c);
      ComponentName me = new ComponentName(c, StableWallpaper.class);
      if (isMe(wm.getWallpaperInfo(), me)) return true;
      return Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE && isMe(wm.getWallpaperInfo(WallpaperManager.FLAG_LOCK), me);
    } catch (RuntimeException e) {
      return false;
    }
  }

  private static boolean isMe (WallpaperInfo info, ComponentName me) { return info != null && me.equals(info.getComponent()); }

  /** The screen's size, portrait (the app paints the scenery to fit it). */
  static int[] screen (Context c) {
    DisplayMetrics m = new DisplayMetrics();
    WindowManager wm = c.getSystemService(WindowManager.class);
    if (wm != null) wm.getDefaultDisplay().getRealMetrics(m);
    else m = c.getResources().getDisplayMetrics();
    return new int[] { Math.min(m.widthPixels, m.heightPixels), Math.max(m.widthPixels, m.heightPixels) };
  }

  static String key (Context c) { return prefs(c).getString("key", null); }

  /**
   * Keeps the app's scenery (src/app/stable/scenery.ts Scenery): pictures as files, the rest as JSON. False when
   * something isn't what it should be, or the login isn't remembered. Swapped in whole, so an engine never
   * reads half of it.
   */
  static synchronized boolean save (Context c, JSONObject o) {
    if (!TokenStore.has(c)) return false;
    try {
      String key = o.getString("key");
      JSONObject meta = new JSONObject(o.toString());
      File dir = new File(c.getFilesDir(), "stable-wallpaper.new");
      wipe(dir);
      if (!dir.mkdirs()) return false;
      JSONObject world = meta.getJSONObject("world");
      int w = world.getInt("w"), h = world.getInt("h");
      if (w <= 0 || h <= 0 || w > MAX_SIDE || h > MAX_SIDE) return false;
      JSONObject lights = meta.getJSONObject("lights");
      for (String l : LIGHTS) {
        JSONObject light = lights.getJSONObject(l);
        if (!png(dir, "bg-" + l, light.remove("picture"), w, h)) return false;
        JSONArray trees = light.optJSONArray("trees");
        if (trees == null) trees = new JSONArray();
        if (trees.length() > MAX_TREES) return false;
        for (int i = 0; i < trees.length(); i++) if (!png(dir, "tree-" + l + "-" + i, trees.getJSONObject(i).remove("picture"), 0, 0)) return false;
      }
      JSONArray cs = meta.getJSONArray("creatures");
      if (cs.length() > MAX_CREATURES) return false;
      boolean whole = true;
      Set<String> avatar = new HashSet<>();
      for (int i = 0; i < cs.length(); i++) {
        JSONObject cr = cs.getJSONObject(i);
        JSONArray rider = cr.optJSONArray("rider");
        if (rider != null) {
          if (!cr.optBoolean("mount") || rider.length() > MAX_RIDER) return false;
          // each picture with its size; one that can't be fetched now is left out (as in the app) and tried again
          JSONArray kept = new JSONArray();
          for (int j = 0; j < rider.length(); j++) {
            JSONObject part = rider.getJSONObject(j);
            String file = part.getString("file");
            if (!AvatarFiles.valid(file)) return false;
            int[] size = AvatarFiles.get(avatarDir(c), file);
            if (size == null) { whole = false; continue; }
            avatar.add(file);
            kept.put(new JSONObject().put("file", file).put("x", part.getInt("x")).put("y", part.getInt("y")).put("w", size[0]).put("h", size[1]));
          }
          cr.put("rider", kept);
        }
        if (!png(dir, "body-" + i, cr.remove("body"), cr.getInt("w"), cr.getInt("h"))) return false;
        Object head = cr.remove("head");
        if (head != null && !png(dir, "head-" + i, head, cr.getInt("w"), cr.getInt("h"))) return false;
        cr.put("hasHead", head != null);
      }
      // the avatar on foot by the door: its pictures fetched as a rider's
      JSONArray standing = meta.optJSONArray("avatar");
      if (standing != null) {
        if (standing.length() > MAX_RIDER) return false;
        JSONArray kept = new JSONArray();
        for (int j = 0; j < standing.length(); j++) {
          JSONObject part = standing.getJSONObject(j);
          String file = part.getString("file");
          if (!AvatarFiles.valid(file)) return false;
          int[] size = AvatarFiles.get(avatarDir(c), file);
          if (size == null) { whole = false; continue; }
          avatar.add(file);
          kept.put(new JSONObject().put("file", file).put("x", part.getInt("x")).put("y", part.getInt("y")).put("w", size[0]).put("h", size[1]));
        }
        meta.put("avatar", kept);
      }
      Files.write(new File(dir, "scenery.json").toPath(), meta.toString().getBytes(StandardCharsets.UTF_8));
      File to = dir(c), old = new File(c.getFilesDir(), "stable-wallpaper.old");
      wipe(old);
      if (to.exists() && !to.renameTo(old)) return false;
      if (!dir.renameTo(to)) return false;
      wipe(old);
      prune(avatarDir(c), avatar);
      // a rider picture missing (offline): no key, so the app sends it again and the fetch is tried again
      if (whole) prefs(c).edit().putString("key", key).apply();
      else prefs(c).edit().remove("key").apply();
    } catch (JSONException | IOException | IllegalArgumentException e) {
      return false;
    }
    reloadAll();
    return true;
  }

  /** A PNG data URL (or bare base64) into dir/name.png; when w > 0 it must be w x h. */
  private static boolean png (File dir, String name, Object data, int w, int h) throws IOException {
    if (!(data instanceof String)) return false;
    String s = (String) data;
    int comma = s.startsWith("data:") ? s.indexOf(',') : -1;
    byte[] bytes = Base64.decode(comma >= 0 ? s.substring(comma + 1) : s, Base64.DEFAULT);
    BitmapFactory.Options o = new BitmapFactory.Options();
    o.inJustDecodeBounds = true;
    BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
    if (o.outWidth <= 0 || o.outHeight <= 0 || o.outWidth > MAX_SIDE || o.outHeight > MAX_SIDE) return false;
    if (w > 0 && (o.outWidth != w || o.outHeight != h)) return false;
    try (FileOutputStream out = new FileOutputStream(new File(dir, name + ".png"))) { out.write(bytes); }
    return true;
  }

  /** the avatar's pictures no scenery uses any more */
  private static void prune (File d, Set<String> keep) {
    File[] fs = d.listFiles();
    if (fs != null) for (File x : fs) if (!keep.contains(x.getName())) x.delete();
  }

  /** Logout: the scenery goes, and the wallpaper says how to get it back. */
  static synchronized void clear (Context c) {
    wipe(dir(c));
    wipe(avatarDir(c));
    prefs(c).edit().clear().apply();
    reloadAll();
  }

  private static void reloadAll () { StableStage.reloadAll(); }

  private static void wipe (File f) {
    File[] fs = f.listFiles();
    if (fs != null) for (File x : fs) x.delete();
    f.delete();
  }

  static File dir (Context c) { return new File(c.getFilesDir(), "stable-wallpaper"); }
  static File avatarDir (Context c) { return new File(c.getFilesDir(), "stable-wallpaper-avatar"); }
  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

  static int rgb (String hex) {
    try { return Integer.parseInt(hex.replace("#", ""), 16) & 0xFFFFFF; } catch (NumberFormatException e) { return 0x4E6B34; }
  }

  /* ---------------------------------------------------------------- the engine */

  /** The wallpaper's side of a {@link StableStage}: Android's callbacks in, a tap on the home screen to pet. */
  private final class StableEngine extends Engine {
    private StableStage stage;

    @Override
    public void onCreate (SurfaceHolder holder) {
      super.onCreate(holder);
      setTouchEventsEnabled(false);
      stage = new StableStage(StableWallpaper.this, holder, null);
      stage.create();
    }

    @Override
    public void onDestroy () {
      stage.destroy();
      super.onDestroy();
    }

    @Override
    public void onSurfaceChanged (SurfaceHolder holder, int format, int width, int height) {
      super.onSurfaceChanged(holder, format, width, height);
      stage.surfaceChanged(width, height);
    }

    @Override
    public void onSurfaceDestroyed (SurfaceHolder holder) {
      stage.surfaceDestroyed();
      super.onSurfaceDestroyed(holder);
    }

    @Override
    public void onVisibilityChanged (boolean v) { stage.visible(v); }

    /** A swipe between home screen pages: a nudge that restarts a timer that stopped ticking (asks the phone nothing). */
    @Override
    public void onOffsetsChanged (float xOffset, float yOffset, float xStep, float yStep, int xPixels, int yPixels) {
      stage.nudge();
    }

    /** A tap on the home screen's empty space: the creature under the finger gets a happy hop and a heart. */
    @Override
    public Bundle onCommand (String action, int x, int y, int z, Bundle extras, boolean resultRequested) {
      if (WallpaperManager.COMMAND_TAP.equals(action)) stage.tap(x, y);
      return null;
    }
  }
}
