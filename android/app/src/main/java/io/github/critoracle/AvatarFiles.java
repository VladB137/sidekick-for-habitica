package io.github.critoracle;

import android.graphics.BitmapFactory;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Pattern;

/**
 * The avatar's pictures (src/app/ui/dom.ts SPRITES), fetched from Habitica's image server and kept in a folder.
 * No token and no API: plain public images, the same files the app shows the avatar with. The WebView can't use
 * them on a canvas it wants to read back (the server sends no CORS headers), so the Stable wallpaper draws the
 * rider from these files, and the app's playground takes them from here too, which lets a postcard be shared.
 */
final class AvatarFiles {
  private AvatarFiles () {}

  static final String SPRITES = "https://habitica-assets.s3.amazonaws.com/mobileApp/images/";
  static final Pattern FILE = Pattern.compile("[A-Za-z0-9_.-]{1,120}\\.(png|gif)");
  static final int MAX_BYTES = 1 << 20, MAX_SIDE = 512;

  /** Whether a name can be one of Habitica's avatar pictures (never a path). */
  static boolean valid (String file) { return file != null && FILE.matcher(file).matches() && !file.startsWith("."); }

  /**
   * The picture in folder d, fetched from Habitica's image server when it isn't there yet. Its size, or null when
   * it can't be had now (offline, not Habitica's, too big).
   */
  static int[] get (File d, String file) {
    if (!valid(file)) return null;
    File f = new File(d, file);
    if (!f.isFile()) {
      if (!d.isDirectory() && !d.mkdirs()) return null;
      HttpURLConnection con = null;
      File part = new File(d, file + ".part");
      try {
        con = (HttpURLConnection) new URL(SPRITES + file).openConnection();
        con.setConnectTimeout(10000);
        con.setReadTimeout(10000);
        con.setInstanceFollowRedirects(false);
        if (con.getResponseCode() != 200) return null;
        try (InputStream in = con.getInputStream(); FileOutputStream out = new FileOutputStream(part)) {
          byte[] buf = new byte[8192];
          int total = 0, r;
          while ((r = in.read(buf)) > 0) {
            total += r;
            if (total > MAX_BYTES) return null;
            out.write(buf, 0, r);
          }
        }
        if (!part.renameTo(f)) return null;
      } catch (IOException | RuntimeException e) {
        return null;
      } finally {
        if (con != null) con.disconnect();
        part.delete();
      }
    }
    BitmapFactory.Options o = new BitmapFactory.Options();
    o.inJustDecodeBounds = true;
    BitmapFactory.decodeFile(f.getPath(), o);
    if (o.outWidth <= 0 || o.outHeight <= 0 || o.outWidth > MAX_SIDE || o.outHeight > MAX_SIDE) { f.delete(); return null; }
    return new int[] { o.outWidth, o.outHeight };
  }
}
