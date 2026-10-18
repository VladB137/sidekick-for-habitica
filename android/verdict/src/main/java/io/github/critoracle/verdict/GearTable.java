package io.github.critoracle.verdict;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * src/data/gear.json: item key → 0 (no stats) or [str, con, int, per, class?].
 * The app ships the same file the web bundle is built from, so both read the same table.
 */
public final class GearTable {
  private static final class Row {
    final double str, con, intel, per;
    final String cls;
    Row (double str, double con, double intel, double per, String cls) { this.str = str; this.con = con; this.intel = intel; this.per = per; this.cls = cls; }
  }

  /** null value = an item without stats */
  private final Map<String, Row> rows = new HashMap<>();

  public static GearTable parse (String json) {
    Object root = Json.parse(json);
    if (!(root instanceof Map)) throw new IllegalArgumentException("gear table: not an object");
    GearTable t = new GearTable();
    for (Map.Entry<?, ?> e : ((Map<?, ?>) root).entrySet()) {
      Object v = e.getValue();
      if (v instanceof List) {
        List<?> a = (List<?>) v;
        t.rows.put((String) e.getKey(), new Row(
            (Double) a.get(0), (Double) a.get(1), (Double) a.get(2), (Double) a.get(3),
            a.size() > 4 && a.get(4) instanceof String ? (String) a.get(4) : null));
      } else {
        t.rows.put((String) e.getKey(), null);
      }
    }
    return t;
  }

  public int size () { return rows.size(); }

  public static final class Sum {
    public double str, con, intel, per;
    public final List<String> unknown = new ArrayList<>();
  }

  /** gearFromEquipped(): class gear counts (1 + classGearBonus) times; unknown keys are listed, not guessed. */
  public Sum sum (List<String> equippedKeys, String cls) {
    Sum g = new Sum();
    for (String key : equippedKeys) {
      if (key == null || key.isEmpty()) continue;
      if (!rows.containsKey(key)) { g.unknown.add(key); continue; }
      Row it = rows.get(key);
      if (it == null) continue;
      double mult = it.cls != null && !it.cls.isEmpty() && it.cls.equals(cls) ? 1 + Verdict.CLASS_GEAR_BONUS : 1;
      g.str += it.str * mult; g.con += it.con * mult; g.intel += it.intel * mult; g.per += it.per * mult;
    }
    return g;
  }

  public List<String> keys () { return Collections.unmodifiableList(new ArrayList<>(rows.keySet())); }
}
