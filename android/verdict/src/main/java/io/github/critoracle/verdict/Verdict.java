package io.github.critoracle.verdict;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * The crit verdict for the native surfaces (notification, widget, Quick Settings tile):
 * a line-by-line port of seedOf, rollOf, totals, gearFromEquipped, verdicts and the stats part
 * of snapshotFromUser in src/engine/core.ts and src/app/model.ts. Everything else (levers,
 * suggestions, planning) stays in the TypeScript engine inside the WebView.
 *
 * Exactness: Habitica's server computes Math.sin with fdlibm (Node 20, V8 11.3), and
 * java.lang.StrictMath.sin is specified to return fdlibm's results, so the roll is bit-identical.
 * Additions are done in the same order as the TypeScript (floating-point addition is not associative).
 * Checked by VerdictTest against vectors exported from the TypeScript engine.
 */
public final class Verdict {
  private Verdict () {}

  // src/engine/rules.ts
  public static final double CRIT_BASE = 0.03;
  public static final double BACKSTAB_CRIT_BASE = 0.3;
  public static final int MAX_LEVEL = 100;
  public static final int CLASS_GEAR_BONUS = 1;

  public enum Stat { STR, CON, INT, PER }

  /** A skill whose result can crit (core.ts SKILLS entries with `crit`). */
  public static final class CritSkill {
    public final String key, name, cls;
    public final int mana, lvl;
    public final Stat stat;
    public final double base;
    CritSkill (String key, String cls, String name, int mana, int lvl, Stat stat, double base) {
      this.key = key; this.cls = cls; this.name = name; this.mana = mana; this.lvl = lvl; this.stat = stat; this.base = base;
    }
  }

  /** In core.ts SKILLS order. */
  public static final List<CritSkill> CRIT_SKILLS = Collections.unmodifiableList(java.util.Arrays.asList(
      new CritSkill("fireball", "wizard", "Burst of Flames", 10, 11, Stat.PER, CRIT_BASE),
      new CritSkill("smash", "warrior", "Brutal Smash", 10, 11, Stat.CON, CRIT_BASE),
      new CritSkill("backStab", "rogue", "Backstab", 15, 12, Stat.STR, BACKSTAB_CRIT_BASE)));

  /** The numbers the roll depends on (core.ts State, without what only the planner needs). */
  public static final class State {
    public double hp, mp, exp, gp, lvl = 1, points, str, con, intel, per;
    public double buffStr, buffCon, buffInt, buffPer;
    public double gearStr, gearCon, gearInt, gearPer;
    public String cls = "warrior";
    public boolean classSelected;
  }

  public static final class Totals {
    public final double str, con, intel, per, levelBonus;
    Totals (double str, double con, double intel, double per, double levelBonus) {
      this.str = str; this.con = con; this.intel = intel; this.per = per; this.levelBonus = levelBonus;
    }
    public double of (Stat s) {
      switch (s) { case STR: return str; case CON: return con; case INT: return intel; default: return per; }
    }
  }

  public static final class Roll {
    public final String key, name;
    public final Stat stat;
    public final double chance, mult;
    public final boolean crit, available;
    Roll (String key, String name, Stat stat, double chance, double mult, boolean crit, boolean available) {
      this.key = key; this.name = name; this.stat = stat; this.chance = chance; this.mult = mult; this.crit = crit; this.available = available;
    }
  }

  public static final class Result {
    public final double seed, roll;
    /** the task roll first, then the player's class skills that can crit */
    public final List<Roll> rolls;
    Result (double seed, double roll, List<Roll> rolls) { this.seed = seed; this.roll = roll; this.rolls = rolls; }
    public Roll task () { return rolls.get(0); }
  }

  /** predictableRandom(): the numeric user.stats fields summed in schema order. */
  public static double seedOf (State s) {
    return 0 + s.hp + s.mp + s.exp + s.gp + s.lvl + s.points + s.str + s.con + s.intel + s.per;
  }

  /** frac(sin(seed + 1) × 10000). */
  public static double rollOf (double seed) {
    double x = StrictMath.sin(seed + 1) * 10000;
    return x - Math.floor(x);
  }

  public static double critChance (double stat, double base) { return base * (1 + stat / 100); }
  public static double critMultiplier (double stat) { return 1.5 + (4 * stat) / (stat + 200); }

  /** statsComputed(): gear + allocated + buff + floor(min(lvl, 100) / 2). */
  public static Totals totals (State s) {
    double lb = Math.floor((s.lvl > MAX_LEVEL ? MAX_LEVEL : s.lvl) / 2);
    return new Totals(
        s.gearStr + s.str + s.buffStr + lb,
        s.gearCon + s.con + s.buffCon + lb,
        s.gearInt + s.intel + s.buffInt + lb,
        s.gearPer + s.per + s.buffPer + lb,
        lb);
  }

  public static Result verdicts (State s) {
    double seed = seedOf(s);
    double roll = rollOf(seed);
    Totals tot = totals(s);
    List<Roll> rolls = new ArrayList<>();
    double taskChance = critChance(tot.str, CRIT_BASE);
    rolls.add(new Roll("task", "Task", Stat.STR, taskChance, critMultiplier(tot.str), roll <= taskChance, true));
    for (CritSkill k : CRIT_SKILLS) {
      if (!k.cls.equals(s.cls)) continue;
      double v = tot.of(k.stat);
      double chance = critChance(v, k.base);
      rolls.add(new Roll(k.key, k.name, k.stat, chance, critMultiplier(v), roll <= chance,
          s.classSelected && s.lvl >= k.lvl && s.mp >= k.mana));
    }
    return new Result(seed, roll, Collections.unmodifiableList(rolls));
  }

  /* ---------------------------------------------------------- from GET /user */

  /** What the native surfaces need from one read of the user. */
  public static final class Snapshot {
    public final State state;
    public final boolean needsCron;
    public final List<String> unknownGear;
    public Snapshot (State state, boolean needsCron, List<String> unknownGear) { this.state = state; this.needsCron = needsCron; this.unknownGear = unknownGear; }
    public boolean dead () { return state.hp <= 0; }
  }

  /** snapshotFromUser(), the parts the verdict reads. `user` is the parsed `data` of GET /api/v3/user. */
  public static Snapshot fromUser (Object user, GearTable gear) {
    Object st = Json.at(user, "stats");
    Object b = Json.at(st, "buffs");
    State s = new State();
    s.hp = Json.num(Json.at(st, "hp"), 0);
    s.mp = Json.num(Json.at(st, "mp"), 0);
    s.exp = Json.num(Json.at(st, "exp"), 0);
    s.gp = Json.num(Json.at(st, "gp"), 0);
    s.lvl = Json.num(Json.at(st, "lvl"), 1);
    s.points = Json.num(Json.at(st, "points"), 0);
    s.str = Json.num(Json.at(st, "str"), 0);
    s.con = Json.num(Json.at(st, "con"), 0);
    s.intel = Json.num(Json.at(st, "int"), 0);
    s.per = Json.num(Json.at(st, "per"), 0);
    s.buffStr = Json.num(Json.at(b, "str"), 0);
    s.buffCon = Json.num(Json.at(b, "con"), 0);
    s.buffInt = Json.num(Json.at(b, "int"), 0);
    s.buffPer = Json.num(Json.at(b, "per"), 0);
    // `u.stats?.class || 'warrior'`
    Object c = Json.at(st, "class");
    s.cls = Json.truthy(c) && c instanceof String ? (String) c : "warrior";
    // common/script/libs/hasClass.js: level 10+, classes enabled, class chosen; `(u.stats?.lvl || 0) >= 10`
    Object rawLvl = Json.at(st, "lvl");
    double lvlOrZero = Json.truthy(rawLvl) && rawLvl instanceof Double ? (Double) rawLvl : 0;
    s.classSelected = Json.truthy(Json.at(user, "flags", "classSelected"))
        && !Json.truthy(Json.at(user, "preferences", "disableClasses"))
        && lvlOrZero >= 10;
    List<String> equipped = new ArrayList<>();
    Object eq = Json.at(user, "items", "gear", "equipped");
    if (eq instanceof Map) for (Object v : ((Map<?, ?>) eq).values()) equipped.add(v instanceof String ? (String) v : null);
    GearTable.Sum g = gear.sum(equipped, s.cls);
    s.gearStr = g.str; s.gearCon = g.con; s.gearInt = g.intel; s.gearPer = g.per;
    return new Snapshot(s, Json.truthy(Json.at(user, "needsCron")), g.unknown);
  }
}
