package io.github.critoracle;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyPermanentlyInvalidatedException;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import io.github.critoracle.verdict.Json;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.security.UnrecoverableKeyException;
import java.util.LinkedHashMap;
import java.util.Map;
import javax.crypto.AEADBadTagException;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * The Habitica credentials, kept only when the player ticks "Remember on this device":
 * encrypted with an AES-256-GCM key that lives in the Android Keystore and never leaves it.
 * The ciphertext sits in app-private preferences, excluded from backups (data_extraction_rules.xml),
 * so a copy restored elsewhere has nothing to decrypt it with. Nothing here is ever logged.
 */
final class TokenStore {
  private TokenStore () {}

  private static final String KEYSTORE = "AndroidKeyStore";
  private static final String ALIAS = "critoracle-credentials";
  private static final String PREFS = "critoracle-credentials";

  static final class Credentials {
    final String userId, apiToken, client;
    Credentials (String userId, String apiToken, String client) { this.userId = userId; this.apiToken = apiToken; this.client = client; }
  }

  private static SecretKey key (boolean create) throws Exception {
    KeyStore ks = KeyStore.getInstance(KEYSTORE);
    ks.load(null);
    if (ks.containsAlias(ALIAS)) return ((KeyStore.SecretKeyEntry) ks.getEntry(ALIAS, null)).getSecretKey();
    if (!create) return null;
    KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
    kg.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build());
    return kg.generateKey();
  }

  /** @param client the x-client value the web code computed (src/api/client.ts), so there is one source for it */
  static synchronized boolean save (Context c, String userId, String apiToken, String client) {
    try {
      Map<String, Object> m = new LinkedHashMap<>();
      m.put("u", userId);
      m.put("t", apiToken);
      m.put("c", client);
      Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
      ci.init(Cipher.ENCRYPT_MODE, key(true));
      byte[] ct = ci.doFinal(Json.stringify(m).getBytes(StandardCharsets.UTF_8));
      return prefs(c).edit()
          .putString("iv", Base64.encodeToString(ci.getIV(), Base64.NO_WRAP))
          .putString("ct", Base64.encodeToString(ct, Base64.NO_WRAP))
          .commit();
    } catch (Exception e) {
      return false;
    }
  }

  /** null when nothing is stored or it can't be decrypted (then the stored copy is wiped). */
  static synchronized Credentials load (Context c) {
    SharedPreferences p = prefs(c);
    String iv = p.getString("iv", null), ct = p.getString("ct", null);
    if (iv == null || ct == null) return null;
    try {
      SecretKey k = key(false);
      if (k == null) { clear(c); return null; }
      Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
      ci.init(Cipher.DECRYPT_MODE, k, new GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)));
      Object m = Json.parse(new String(ci.doFinal(Base64.decode(ct, Base64.NO_WRAP)), StandardCharsets.UTF_8));
      Object u = Json.at(m, "u"), t = Json.at(m, "t"), cl = Json.at(m, "c");
      if (!(u instanceof String) || !(t instanceof String) || !(cl instanceof String)) { clear(c); return null; }
      return new Credentials((String) u, (String) t, (String) cl);
    } catch (AEADBadTagException | KeyPermanentlyInvalidatedException | UnrecoverableKeyException e) {
      // the key can never decrypt this copy again (e.g. the screen lock was removed): wipe it
      clear(c);
      return null;
    } catch (Exception e) {
      // a passing Keystore error (busy, low memory, a vendor hiccup): keep the login for the next try
      return null;
    }
  }

  /** Whether credentials are stored, without decrypting them. */
  static boolean has (Context c) { return prefs(c).contains("ct"); }

  static synchronized void clear (Context c) {
    prefs(c).edit().clear().commit();
    try {
      KeyStore ks = KeyStore.getInstance(KEYSTORE);
      ks.load(null);
      if (ks.containsAlias(ALIAS)) ks.deleteEntry(ALIAS);
    } catch (Exception ignored) {
      // the ciphertext is gone already; a leftover key decrypts nothing
    }
  }

  private static SharedPreferences prefs (Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
}
