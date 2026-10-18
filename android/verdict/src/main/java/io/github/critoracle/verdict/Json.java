package io.github.critoracle.verdict;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * A small strict JSON reader: objects become LinkedHashMap, arrays ArrayList, numbers Double
 * (Double.parseDouble rounds exactly like JavaScript's JSON.parse), plus String, Boolean and null.
 * Plain Java so the verdict code runs, and is tested, on any JVM; Android's org.json would tie it to the device.
 */
public final class Json {
  private final String s;
  private int i;

  private Json (String s) { this.s = s; }

  public static Object parse (String text) {
    Json p = new Json(text);
    p.ws();
    Object v = p.value();
    p.ws();
    if (p.i != p.s.length()) throw p.error("trailing characters");
    return v;
  }

  private IllegalArgumentException error (String what) { return new IllegalArgumentException("JSON: " + what + " at " + i); }

  private void ws () {
    while (i < s.length()) {
      char c = s.charAt(i);
      if (c == ' ' || c == '\t' || c == '\n' || c == '\r') i++; else break;
    }
  }

  private Object value () {
    if (i >= s.length()) throw error("unexpected end");
    char c = s.charAt(i);
    switch (c) {
      case '{': return object();
      case '[': return array();
      case '"': return string();
      case 't': word("true"); return Boolean.TRUE;
      case 'f': word("false"); return Boolean.FALSE;
      case 'n': word("null"); return null;
      default:
        if (c == '-' || (c >= '0' && c <= '9')) return number();
        throw error("unexpected '" + c + "'");
    }
  }

  private void word (String w) {
    if (!s.startsWith(w, i)) throw error("expected " + w);
    i += w.length();
  }

  private Map<String, Object> object () {
    Map<String, Object> m = new LinkedHashMap<>();
    i++; ws();
    if (peek() == '}') { i++; return m; }
    while (true) {
      ws();
      if (peek() != '"') throw error("expected a key");
      String k = string();
      ws();
      if (peek() != ':') throw error("expected ':'");
      i++; ws();
      m.put(k, value());
      ws();
      char c = peek();
      i++;
      if (c == '}') return m;
      if (c != ',') throw error("expected ',' or '}'");
    }
  }

  private List<Object> array () {
    List<Object> a = new ArrayList<>();
    i++; ws();
    if (peek() == ']') { i++; return a; }
    while (true) {
      ws();
      a.add(value());
      ws();
      char c = peek();
      i++;
      if (c == ']') return a;
      if (c != ',') throw error("expected ',' or ']'");
    }
  }

  private char peek () {
    if (i >= s.length()) throw error("unexpected end");
    return s.charAt(i);
  }

  private String string () {
    i++;
    StringBuilder b = new StringBuilder();
    while (true) {
      char c = peek();
      i++;
      if (c == '"') return b.toString();
      if (c < 0x20) throw error("control character in string");
      if (c != '\\') { b.append(c); continue; }
      char e = peek();
      i++;
      switch (e) {
        case '"': b.append('"'); break;
        case '\\': b.append('\\'); break;
        case '/': b.append('/'); break;
        case 'b': b.append('\b'); break;
        case 'f': b.append('\f'); break;
        case 'n': b.append('\n'); break;
        case 'r': b.append('\r'); break;
        case 't': b.append('\t'); break;
        case 'u':
          if (i + 4 > s.length()) throw error("bad \\u escape");
          b.append((char) Integer.parseInt(s.substring(i, i + 4), 16));
          i += 4;
          break;
        default: throw error("bad escape");
      }
    }
  }

  private Double number () {
    int start = i;
    if (peek() == '-') i++;
    while (i < s.length() && "0123456789.eE+-".indexOf(s.charAt(i)) >= 0) i++;
    try {
      return Double.parseDouble(s.substring(start, i));
    } catch (NumberFormatException ex) {
      throw error("bad number");
    }
  }

  /* ---------------------------------------------------------- writing */

  /** JSON text for what parse() returns (Map, List, Double, String, Boolean, null). Numbers as JavaScript prints them where it matters: integers without ".0". */
  public static String stringify (Object v) {
    StringBuilder b = new StringBuilder();
    write(b, v);
    return b.toString();
  }

  private static void write (StringBuilder b, Object v) {
    if (v == null) { b.append("null"); return; }
    if (v instanceof Boolean) { b.append(v.toString()); return; }
    if (v instanceof Double || v instanceof Integer || v instanceof Long) {
      double d = ((Number) v).doubleValue();
      if (Double.isNaN(d) || Double.isInfinite(d)) { b.append("null"); return; }
      // exact round trip: Double.toString gives the shortest digits that parse back to the same double
      if (d == Math.rint(d) && Math.abs(d) < 1e15) b.append((long) d); else b.append(Double.toString(d));
      return;
    }
    if (v instanceof String) { quote(b, (String) v); return; }
    if (v instanceof Map) {
      b.append('{');
      boolean first = true;
      for (Map.Entry<?, ?> e : ((Map<?, ?>) v).entrySet()) {
        if (!first) b.append(',');
        first = false;
        quote(b, String.valueOf(e.getKey()));
        b.append(':');
        write(b, e.getValue());
      }
      b.append('}');
      return;
    }
    if (v instanceof List) {
      b.append('[');
      boolean first = true;
      for (Object x : (List<?>) v) { if (!first) b.append(','); first = false; write(b, x); }
      b.append(']');
      return;
    }
    throw new IllegalArgumentException("JSON: can't write " + v.getClass().getName());
  }

  private static void quote (StringBuilder b, String s) {
    b.append('"');
    for (int k = 0; k < s.length(); k++) {
      char c = s.charAt(k);
      switch (c) {
        case '"': b.append("\\\""); break;
        case '\\': b.append("\\\\"); break;
        case '\n': b.append("\\n"); break;
        case '\r': b.append("\\r"); break;
        case '\t': b.append("\\t"); break;
        default:
          if (c < 0x20) b.append(String.format("\\u%04x", (int) c)); else b.append(c);
      }
    }
    b.append('"');
  }

  /* ---------------------------------------------------------- lookups that never throw */

  /** Follows object keys; null when any step is missing or not an object. */
  public static Object at (Object root, String... path) {
    Object cur = root;
    for (String k : path) {
      if (!(cur instanceof Map)) return null;
      cur = ((Map<?, ?>) cur).get(k);
    }
    return cur;
  }

  /** model.ts num(): a finite number, else the default. */
  public static double num (Object v, double d) {
    if (v instanceof Double) {
      double x = (Double) v;
      if (!Double.isNaN(x) && !Double.isInfinite(x)) return x;
    }
    return d;
  }

  /** JavaScript truthiness for a parsed JSON value. */
  public static boolean truthy (Object v) {
    if (v == null) return false;
    if (v instanceof Boolean) return (Boolean) v;
    if (v instanceof Double) { double x = (Double) v; return x != 0 && !Double.isNaN(x); }
    if (v instanceof String) return !((String) v).isEmpty();
    return true;
  }
}
