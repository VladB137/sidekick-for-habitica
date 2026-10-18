package io.github.critoracle;

import android.Manifest;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import io.github.critoracle.verdict.Json;
import io.github.critoracle.verdict.NightSwap;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

/** The bridge between the web app (src/app/native.ts) and the Android-only parts. */
@CapacitorPlugin(
    name = "Sidekick",
    permissions = { @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }) })
public class SidekickPlugin extends Plugin {
  /** the plugin the app's WebView has now, for telling it about changes made outside it (a reminder's button) */
  private static volatile SidekickPlugin live;

  /** A Stable widget was just put on the home screen: the app, if it's running, paints its pictures. */
  static void stableWidgetPlaced () {
    SidekickPlugin p = live;
    if (p != null) p.notifyListeners("stableWidget", new JSObject());
  }

  /** The Stable wallpaper or screen saver started showing (set, previewed, dreaming): the app, if it's running, sends its scenery. */
  static void stableWallpaperShown () {
    SidekickPlugin p = live;
    if (p != null) p.notifyListeners("stableWallpaper", new JSObject());
  }

  /** The repeating To-Dos changed on the phone (a reminder's button, a native read): the app reads them again. */
  static void repeatsChanged () {
    SidekickPlugin p = live;
    if (p != null) p.notifyListeners("repeatsChanged", new JSObject());
  }

  @PluginMethod
  public void getCredentials (PluginCall call) {
    getBridge().execute(() -> {
      TokenStore.Credentials c = TokenStore.load(getContext());
      JSObject r = new JSObject();
      if (c != null) { r.put("userId", c.userId); r.put("apiToken", c.apiToken); r.put("client", c.client); }
      call.resolve(r);
    });
  }

  @PluginMethod
  public void setCredentials (PluginCall call) {
    String u = call.getString("userId"), t = call.getString("apiToken"), cl = call.getString("client");
    if (u == null || t == null || cl == null) { call.reject("missing credentials"); return; }
    getBridge().execute(() -> {
      if (!TokenStore.save(getContext(), u, t, cl)) { call.reject("The Android Keystore refused to store the token."); return; }
      boolean wasRefused = HabiticaReader.authFailed(getContext());
      // only the refused-login mark goes: a running 429 wait and the call spacing stay
      HabiticaReader.reset(getContext());
      if (wasRefused) resumeAfterLogin(getContext());
      // repeating To-Dos kept from before a refused token come back with their reminders
      RepeatReminders.update(getContext());
      call.resolve();
    });
  }

  /** A new x-client for the remembered login (the app was renamed); keeps the call spacing, unlike setCredentials. */
  @PluginMethod
  public void setClient (PluginCall call) {
    String cl = call.getString("client");
    if (cl == null) { call.reject("missing client"); return; }
    getBridge().execute(() -> {
      TokenStore.Credentials c = TokenStore.load(getContext());
      if (c == null || TokenStore.save(getContext(), c.userId, c.apiToken, cl)) call.resolve();
      else call.reject("The Android Keystore refused to store the token.");
    });
  }

  /** Logout: the token, the last numbers and the native extras all go. */
  @PluginMethod
  public void clearCredentials (PluginCall call) {
    // Habitica refused the token: the same player reconnects, so the repeating To-Dos are kept, with no reminders meanwhile
    boolean keep = Boolean.TRUE.equals(call.getBoolean("keepPlayerData", false));
    getBridge().execute(() -> {
      // first: whatever is still running (a read on its way, a night gear step) writes nothing from here on
      Session.loggedOut();
      TokenStore.clear(getContext());
      LastRead.clear(getContext());
      HabiticaReader.reset(getContext());
      io.github.critoracle.Settings.clear(getContext());
      VerdictService.stop(getContext());
      RefreshJob.cancel(getContext());
      NightGearJob.clear(getContext());
      if (keep) RepeatReminders.pause(getContext()); else RepeatReminders.clear(getContext());
      StableWidget.clear(getContext());
      StableWallpaper.clear(getContext());
      wipe(avatarDir());
      wipe(postcardDir());
      Surfaces.refresh(getContext());
      call.resolve();
    });
  }

  /** The app read the user: show the same numbers natively, and count the call for the 30 s spacing. */
  @PluginMethod
  public void reportRead (PluginCall call) {
    String json = call.getString("user");
    Long at = call.getLong("at");
    if (json == null) { call.reject("missing user"); return; }
    getBridge().execute(() -> {
      try {
        boolean remembered = TokenStore.has(getContext());
        // an older read than the phone's own newest is left out (LastRead.save)
        if (remembered) LastRead.save(getContext(), Json.parse(json), at != null ? at : System.currentTimeMillis());
        HabiticaReader.noteCall(getContext());
        // the app's read worked with the remembered login: the phone may read again after a 401
        if (remembered && HabiticaReader.clearAuthFailed(getContext())) resumeAfterLogin(getContext());
        Surfaces.refresh(getContext());
        VerdictService.nudge();
        call.resolve();
      } catch (RuntimeException e) {
        call.reject("unreadable user");
      }
    });
  }

  /**
   * The Dailies and the party's quest from the app's own full read (with "Remember", like reportRead), so the
   * notification's lines need no native read of them while the app is in use. `partyAt` = when the app read the party.
   */
  @PluginMethod
  public void reportExtras (PluginCall call) {
    String tasks = call.getString("tasks"), party = call.getString("party");
    Long partyAt = call.getLong("partyAt");
    getBridge().execute(() -> {
      try {
        if (TokenStore.has(getContext())) {
          if (tasks != null) LastRead.saveTasks(getContext(), Json.parse(tasks));
          if (party != null && partyAt != null && partyAt > 0) LastRead.saveParty(getContext(), Json.parse(party), partyAt);
        }
        Surfaces.refresh(getContext());
        VerdictService.nudge();
        call.resolve();
      } catch (RuntimeException e) {
        call.reject("unreadable tasks or party");
      }
    });
  }

  /** What the notification shows (Settings → Notification): see Settings.lines. */
  @PluginMethod
  public void setLines (PluginCall call) {
    String json = call.getString("lines");
    if (json == null) { call.reject("missing lines"); return; }
    getBridge().execute(() -> {
      try {
        Json.parse(json);
        io.github.critoracle.Settings.setLines(getContext(), json);
        Surfaces.refresh(getContext());
        VerdictService.nudge(); // a line that needs the Dailies or the party may be on now
        call.resolve();
      } catch (RuntimeException e) {
        call.reject("unreadable lines");
      }
    });
  }

  /* The notification's Tasks button opens the app on a tab: kept until the app asks (a cold start), or sent at once. */
  private String pendingRoute;

  /** After a 401 the phone stopped reading; the login works again (the app read, or a new login): start over. */
  private static void resumeAfterLogin (android.content.Context c) {
    VerdictService.restart(c);
    if (io.github.critoracle.Settings.backgroundRefresh(c)) RefreshJob.schedule(c);
    NightGearJob.reschedule(c);
  }

  /** Back on screen: the notification comes back if it was stopped (notifications were blocked, then allowed again, or it was swiped away). */
  @Override
  protected void handleOnResume () {
    super.handleOnResume();
    getBridge().execute(() -> {
      io.github.critoracle.Settings.setNotificationDismissed(getContext(), false);
      VerdictService.ensure(getContext());
    });
  }

  @Override
  public void load () {
    live = this;
    Intent i = getActivity() != null ? getActivity().getIntent() : null;
    if (i != null) pendingRoute = i.getStringExtra(MainActivity.EXTRA_ROUTE);
  }

  @Override
  protected void handleOnNewIntent (Intent intent) {
    super.handleOnNewIntent(intent);
    String r = intent.getStringExtra(MainActivity.EXTRA_ROUTE);
    if (r == null) return;
    JSObject o = new JSObject();
    o.put("route", r);
    notifyListeners("route", o);
  }

  @PluginMethod
  public void takeRoute (PluginCall call) {
    JSObject r = new JSObject();
    if (pendingRoute != null) r.put("route", pendingRoute);
    pendingRoute = null;
    call.resolve(r);
  }

  /** Whether a Stable widget is on the home screen, and the key of the pictures it has (src/app/stable/widget.ts). */
  @PluginMethod
  public void stableWidget (PluginCall call) {
    getBridge().execute(() -> {
      JSObject r = new JSObject();
      r.put("placed", StableWidget.ids(getContext()).length > 0);
      String key = StableWidget.key(getContext());
      if (key != null) r.put("key", key);
      call.resolve(r);
    });
  }

  /** The Stable widget's four pictures (dawn, day, dusk, night) as PNG data URLs, and what they show. */
  @PluginMethod
  public void setStablePicture (PluginCall call) {
    String key = call.getString("key");
    String[] pngs = new String[StableWidget.LIGHTS.length];
    for (int i = 0; i < pngs.length; i++) pngs[i] = call.getString(StableWidget.LIGHTS[i]);
    getBridge().execute(() -> {
      if (StableWidget.save(getContext(), key, pngs)) call.resolve();
      else call.reject("pictures not kept");
    });
  }

  /**
   * Whether the Stable shows on the phone (the live wallpaper or the screen saver, which share the scenery), the key of
   * the scenery the phone has, and the screen it paints for (src/app/stable/wallpaper.ts).
   */
  @PluginMethod
  public void stableWallpaper (PluginCall call) {
    getBridge().execute(() -> {
      JSObject r = new JSObject();
      boolean dream = StableDream.chosen(getContext());
      r.put("set", StableWallpaper.isSet(getContext()) || dream);
      r.put("dream", dream);
      String key = StableWallpaper.key(getContext());
      if (key != null) r.put("key", key);
      int[] s = StableWallpaper.screen(getContext());
      JSObject screen = new JSObject();
      screen.put("w", s[0]);
      screen.put("h", s[1]);
      r.put("screen", screen);
      call.resolve(r);
    });
  }

  /** The Stable wallpaper's scenery (src/app/stable/scenery.ts): pictures per light of the day, the creatures and what moves them. */
  @PluginMethod
  public void setStableScenery (PluginCall call) {
    JSObject o = call.getData();
    getBridge().execute(() -> {
      if (StableWallpaper.save(getContext(), o)) call.resolve();
      else call.reject("scenery not kept");
    });
  }

  /**
   * One of the avatar's pictures (src/app/stable/playground.ts riderLayers) as a data URL: fetched here from
   * Habitica's image server (AvatarFiles, no token) and kept in the cache, so the playground's canvas stays
   * readable for a postcard. Rejected when it can't be had now; the app then leaves that picture out.
   */
  @PluginMethod
  public void avatarPicture (PluginCall call) {
    String file = call.getString("file");
    getBridge().execute(() -> {
      try {
        if (AvatarFiles.get(avatarDir(), file) == null) { call.reject("not available"); return; }
        byte[] bytes = Files.readAllBytes(new File(avatarDir(), file).toPath());
        JSObject r = new JSObject();
        r.put("picture", "data:image/" + (file.endsWith(".gif") ? "gif" : "png") + ";base64," + Base64.encodeToString(bytes, Base64.NO_WRAP));
        call.resolve(r);
      } catch (IOException | RuntimeException e) {
        call.reject("not available");
      }
    });
  }

  /**
   * A Stable postcard (src/app/stable/postcard.ts), a PNG data URL, through Android's share sheet: written to the
   * cache (only the latest one is kept) and offered with read access for the app the player picks. Nothing is
   * uploaded by this app.
   */
  @PluginMethod
  public void sharePicture (PluginCall call) {
    String picture = call.getString("picture");
    getBridge().execute(() -> {
      Uri uri;
      try {
        if (picture == null || !picture.startsWith("data:image/png;base64,")) { call.reject("not a picture"); return; }
        byte[] bytes = Base64.decode(picture.substring(picture.indexOf(',') + 1), Base64.DEFAULT);
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, o);
        if (o.outWidth <= 0 || o.outHeight <= 0 || o.outWidth > 4096 || o.outHeight > 4096) { call.reject("not a picture"); return; }
        File d = postcardDir();
        wipe(d);
        if (!d.mkdirs()) { call.reject("not kept"); return; }
        File f = new File(d, "stable-postcard.png");
        try (FileOutputStream out = new FileOutputStream(f)) { out.write(bytes); }
        uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
      } catch (IOException | IllegalArgumentException e) {
        call.reject("not kept");
        return;
      }
      Intent send = new Intent(Intent.ACTION_SEND).setType("image/png").putExtra(Intent.EXTRA_STREAM, uri)
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
      send.setClipData(ClipData.newRawUri("", uri));
      getActivity().runOnUiThread(() -> {
        try {
          getActivity().startActivity(Intent.createChooser(send, "Share your postcard"));
          call.resolve();
        } catch (android.content.ActivityNotFoundException e) {
          call.reject("nothing to share with");
        }
      });
    });
  }

  /**
   * A backup file (src/app/backup.ts) through Android's save dialog: the player picks where it goes (Downloads, a
   * cloud drive) and the app writes only there. It holds no token (the web side never puts it in).
   */
  @PluginMethod
  public void saveFile (PluginCall call) {
    String name = call.getString("name");
    if (name == null || !name.matches("[A-Za-z0-9._-]{1,80}") || call.getString("text") == null) { call.reject("not a file"); return; }
    Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
        .setType("application/json").putExtra(Intent.EXTRA_TITLE, name);
    try {
      startActivityForResult(call, i, "fileSaved");
    } catch (android.content.ActivityNotFoundException e) {
      call.reject("no file picker");
    }
  }

  @ActivityCallback
  private void fileSaved (PluginCall call, ActivityResult result) {
    if (call == null) return;
    Uri uri = result.getData() == null ? null : result.getData().getData();
    if (result.getResultCode() != android.app.Activity.RESULT_OK || uri == null) {
      JSObject r = new JSObject();
      r.put("saved", false);
      call.resolve(r);
      return;
    }
    String text = call.getString("text");
    getBridge().execute(() -> {
      try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w")) {
        if (out == null) { call.reject("not saved"); return; }
        out.write(text.getBytes(StandardCharsets.UTF_8));
      } catch (IOException | SecurityException | IllegalArgumentException e) {
        call.reject("not saved");
        return;
      }
      JSObject r = new JSObject();
      r.put("saved", true);
      call.resolve(r);
    });
  }

  private File avatarDir () { return new File(getContext().getCacheDir(), "avatar"); }
  private File postcardDir () { return new File(getContext().getCacheDir(), "postcards"); }
  private static void wipe (File f) {
    File[] fs = f.listFiles();
    if (fs != null) for (File x : fs) x.delete();
    f.delete();
  }

  /** Android's live wallpaper preview for the Stable (its Set button is the player's own tap), or the picker on phones without it. */
  @PluginMethod
  public void openStableWallpaper (PluginCall call) {
    Intent i = new Intent(android.app.WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER)
        .putExtra(android.app.WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT, new android.content.ComponentName(getContext(), StableWallpaper.class));
    try {
      getActivity().startActivity(i);
    } catch (android.content.ActivityNotFoundException e) {
      try {
        getActivity().startActivity(new Intent(android.app.WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER));
      } catch (android.content.ActivityNotFoundException e2) {
        call.reject("no live wallpaper picker");
        return;
      }
    }
    call.resolve();
  }

  /** Android's screen saver settings, where the player chooses the Stable (their own tap), or the display settings without them. */
  @PluginMethod
  public void openStableDream (PluginCall call) {
    try {
      getActivity().startActivity(new Intent(Settings.ACTION_DREAM_SETTINGS));
    } catch (android.content.ActivityNotFoundException e) {
      try {
        getActivity().startActivity(new Intent(Settings.ACTION_DISPLAY_SETTINGS));
      } catch (android.content.ActivityNotFoundException e2) {
        call.reject("no screen saver settings");
        return;
      }
    }
    call.resolve();
  }

  /** When the app's next automatic read may go out: the phone's own calls (night gear, refresh, tile) count for the 30 s spacing too. */
  @PluginMethod
  public void nextAutoAt (PluginCall call) {
    JSObject r = new JSObject();
    r.put("at", HabiticaReader.nextAutomaticAt(getContext()));
    call.resolve(r);
  }

  /** Android's 24-hour switch: the WebView's clock times follow the language instead, the notification follows this. */
  @PluginMethod
  public void clock (PluginCall call) {
    JSObject r = new JSObject();
    r.put("h24", android.text.format.DateFormat.is24HourFormat(getContext()));
    call.resolve(r);
  }

  @PluginMethod
  public void status (PluginCall call) {
    JSObject r = new JSObject();
    r.put("notification", io.github.critoracle.Settings.notification(getContext()));
    r.put("notificationsAllowed", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
    // the permission, the app's own switch in Android's settings, and the verdict channel
    r.put("notificationsEnabled", Surfaces.notificationsEnabled(getContext()));
    r.put("authFailed", HabiticaReader.authFailed(getContext()) && TokenStore.has(getContext()));
    r.put("usageAccess", io.github.critoracle.Settings.usageAccess(getContext()));
    r.put("backgroundRefresh", io.github.critoracle.Settings.backgroundRefresh(getContext()));
    r.put("stableWallpaper", StableWallpaper.isSet(getContext()));
    r.put("stableDream", StableDream.chosen(getContext()));
    NightSwap n = NightGearJob.swap(getContext());
    JSObject night = new JSObject();
    night.put("on", n.on());
    night.put("mode", n.mode());
    night.put("swapAt", n.swapAt());
    night.put("backOn", n.backOn());
    night.put("backAt", n.backAt());
    night.put("phase", n.phase());
    night.put("last", n.lastText());
    night.put("lastAt", n.lastAt());
    // while night gear may be on: what was worn before, so logout can offer to put it back (JSON {slot: key})
    String base = n.baseGear();
    if (base != null) night.put("base", base);
    r.put("night", night);
    call.resolve(r);
  }

  /** Night gear: equip at a set hour, put back after the new day starts (NightSwap). Off by default. */
  @PluginMethod
  public void setNightGear (PluginCall call) {
    boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
    String mode = call.getString("mode", "auto");
    Integer swapAt = call.getInt("swapAt"), backAt = call.getInt("backAt");
    boolean backOn = Boolean.TRUE.equals(call.getBoolean("backOn", true));
    if (swapAt == null || backAt == null) { call.reject("missing times"); return; }
    getBridge().execute(() -> {
      synchronized (NightGearJob.class) { NightGearJob.swap(getContext()).configure(on && TokenStore.has(getContext()), mode, swapAt, backOn, backAt); }
      NightGearJob.reschedule(getContext());
      call.resolve();
    });
  }

  /** The loadouts the app worked out from its last read (src/app/store.ts nightPlan). */
  @PluginMethod
  public void setNightPlan (PluginCall call) {
    String plan = call.getString("plan");
    if (plan == null) { call.reject("missing plan"); return; }
    getBridge().execute(() -> {
      synchronized (NightGearJob.class) { NightGearJob.swap(getContext()).setPlan(plan); }
      call.resolve();
    });
  }

  /** The repeating To-Do templates (src/app/repeats.ts), kept natively so the reminders work without the app. */
  @PluginMethod
  public void repeatsGet (PluginCall call) {
    getBridge().execute(() -> {
      JSObject r = new JSObject();
      String json = RepeatReminders.json(getContext());
      if (json != null && TokenStore.has(getContext())) r.put("json", json);
      call.resolve(r);
    });
  }

  @PluginMethod
  public void repeatsSet (PluginCall call) {
    String json = call.getString("json");
    if (json == null) { call.reject("missing json"); return; }
    getBridge().execute(() -> {
      // only with the login remembered in the Keystore (the reminder's button needs it); logout wipes the list
      if (!TokenStore.has(getContext())) { call.reject("not remembered"); return; }
      RepeatReminders.save(getContext(), new io.github.critoracle.verdict.RepeatPlan(json), true);
      call.resolve();
    });
  }

  /** Reminders need the notification permission on Android 13+: asked when the first repeating To-Do is saved. */
  @PluginMethod
  public void repeatsPermission (PluginCall call) {
    if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "repeatsPermissionResult");
      return;
    }
    repeatsPermissionResult(call);
  }

  @PermissionCallback
  private void repeatsPermissionResult (PluginCall call) {
    JSObject r = new JSObject();
    r.put("granted", Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED);
    call.resolve(r);
  }

  @PluginMethod
  public void setNotification (PluginCall call) {
    boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
    if (on && Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
      requestPermissionForAlias("notifications", call, "notificationPermission");
      return;
    }
    applyNotification(call, on);
  }

  @PermissionCallback
  private void notificationPermission (PluginCall call) {
    applyNotification(call, getPermissionState("notifications") == PermissionState.GRANTED);
  }

  private void applyNotification (PluginCall call, boolean on) {
    io.github.critoracle.Settings.setNotification(getContext(), on);
    io.github.critoracle.Settings.setNotificationDismissed(getContext(), false);
    if (on) VerdictService.start(getContext()); else VerdictService.stop(getContext());
    JSObject r = new JSObject();
    r.put("on", on);
    call.resolve(r);
  }

  @PluginMethod
  public void setBackgroundRefresh (PluginCall call) {
    boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
    io.github.critoracle.Settings.setBackgroundRefresh(getContext(), on);
    if (on) RefreshJob.schedule(getContext()); else RefreshJob.cancel(getContext());
    call.resolve();
  }

  /** Blocked notifications can only be allowed again by the player, on Android's screen for this app. */
  @PluginMethod
  public void openNotificationSettings (PluginCall call) {
    Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS)
        .putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName())
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    openOrAppDetails(i, call);
  }

  /** Usage access can only be granted by the player, on the system's own screen. */
  @PluginMethod
  public void openUsageAccess (PluginCall call) {
    Intent i = new Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    openOrAppDetails(i, call);
  }

  /** Some phones leave a settings screen out: then Android's page for this app, where the same switches are reachable. */
  private void openOrAppDetails (Intent i, PluginCall call) {
    try {
      getContext().startActivity(i);
    } catch (android.content.ActivityNotFoundException e) {
      try {
        getContext().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.fromParts("package", getContext().getPackageName(), null)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
      } catch (android.content.ActivityNotFoundException e2) {
        call.reject("no settings screen");
        return;
      }
    }
    call.resolve();
  }

  /**
   * Login's "Open Habitica settings": Habitica's own app on its Settings screen (its PrefsActivity takes habitica.com/settings/...
   * links), else the app's start screen, else the API page on the website when the app isn't installed.
   */
  @PluginMethod
  public void openHabitica (PluginCall call) {
    android.content.Context c = getContext();
    Intent settings = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://habitica.com/settings/api"))
        .setPackage(VerdictService.HABITICA_PACKAGE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    Intent launch = c.getPackageManager().getLaunchIntentForPackage(VerdictService.HABITICA_PACKAGE);
    Intent web = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse("https://habitica.com/user/settings/siteData")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    for (Intent i : new Intent[] { settings, launch == null ? null : launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK), web }) {
      if (i == null) continue;
      try {
        c.startActivity(i);
        JSObject r = new JSObject();
        r.put("app", i != web);
        call.resolve(r);
        return;
      } catch (android.content.ActivityNotFoundException e) {
        // not installed (or no browser): the next way
      }
    }
    call.reject("Nothing on this phone opens Habitica.");
  }

  /** The page drew its first screen: MainActivity's "didn't start" screen isn't needed (or goes away). */
  @PluginMethod
  public void ready (PluginCall call) {
    if (getActivity() instanceof MainActivity) ((MainActivity) getActivity()).pageReady();
    call.resolve();
  }

  /** Before Android 15 the status bar has its own colour; it follows the app bar (live, crit, offline). */
  @PluginMethod
  @SuppressWarnings("deprecation")
  public void setStatusBarColor (PluginCall call) {
    String color = call.getString("color");
    if (color == null || Build.VERSION.SDK_INT >= 35) { call.resolve(); return; }
    getActivity().runOnUiThread(() -> {
      try { getActivity().getWindow().setStatusBarColor(Color.parseColor(color)); } catch (IllegalArgumentException ignored) { /* bad colour: keep */ }
      call.resolve();
    });
  }
}
