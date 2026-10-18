package io.github.critoracle.verdict;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;

/**
 * A creature's nature as the app sends it with its picture (src/playground/behaviours/types.ts Nature, resolved by
 * src/stable/natures.ts): when it sleeps, how it walks, where it likes to be and the special things it does, as
 * plain data, so the wallpaper keeps no table of its own. The rules that read it are behaviours/runner.ts, line by
 * line; the act runner itself is in {@link StableHerd}. Also a particle's look (types.ts ParticleLook) and a
 * scene's place (Spot).
 */
public final class StableNature {
  /** a condition on the moment (types.ts When); null fields don't count */
  public static final class When {
    final double[] hours;
    final Boolean winter;
    final int[] moon;
    /** only where the scene has (open) water, or only where it has none */
    Boolean water;
    When (double[] hours, Boolean winter, int[] moon) { this.hours = hours; this.winter = winter; this.moon = moon; }

    boolean holds (double hour, boolean isWinter, int moonNow, boolean wet) {
      if (water != null && water != wet) return false;
      if (hours != null && !inHours(hour, hours)) return false;
      if (winter != null && winter != isWinter) return false;
      if (moon != null) {
        boolean any = false;
        for (int m : moon) if (m == moonNow) any = true;
        if (!any) return false;
      }
      return true;
    }
  }

  public static final class Nap { final When when; final int cycle, on; Nap (When w, int c, int o) { when = w; cycle = c; on = o; } }
  public static final class Mood { final When when; final double speed, rest; Mood (When w, double s, double r) { when = w; speed = s; rest = r; } }
  public static final class Like { final When when; final String at; final double p; Like (When w, String a, double p) { when = w; at = a; this.p = p; } }
  public static final class Emit {
    final String kind, at;
    final double x, y;
    final int life, side;
    Emit (String kind, String at, double x, double y, int life, int side) { this.kind = kind; this.at = at; this.x = x; this.y = y; this.life = life; this.side = side; }
  }
  /** one pose of a script (types.ts Pose): n ticks, or drawn from [lo, hi] when range; cut is NaN for none */
  public static final class Pose {
    final int lo, hi, sq, dx, leg, fwd;
    final boolean range, turn, inward;
    final double lift, sink, cut, wake, perch, soar;
    final List<Emit> fx;
    /** idle creatures within look art pixels turn to face it */
    double look;
    /** P6: quarter turns forward; art pixels a tick along the way it faces */
    int rot;
    double go;
    /** in the water (package W): this much of its height under the waterline (NaN: not), swimming art pixels a
     * second, coming up somewhere else */
    double depth = Double.NaN, glide;
    boolean elsewhere;
    Pose (int lo, int hi, boolean range, double lift, double sink, double cut, int sq, int dx, int leg, boolean turn, List<Emit> fx, double wake, double perch, double soar, int fwd, boolean inward) {
      this.lo = lo; this.hi = hi; this.range = range; this.lift = lift; this.sink = sink; this.cut = cut; this.sq = sq; this.dx = dx; this.leg = leg; this.turn = turn; this.fx = fx; this.wake = wake;
      this.perch = perch; this.soar = soar; this.fwd = fwd; this.inward = inward;
    }
  }
  public static final class Act {
    public final String id;
    final When when;
    final String at;
    final double p;
    final List<Pose> script;
    final int[] loops, rest;
    /** its script sinks the creature or cuts it at a line (runner.ts sinks) */
    final boolean sinks;
    Act (String id, When when, String at, double p, List<Pose> script, int[] loops, int[] rest) {
      this.id = id; this.when = when; this.at = at; this.p = p; this.script = script; this.loops = loops; this.rest = rest;
      boolean s = false;
      for (Pose q : script) if (q.sink != 0 || !Double.isNaN(q.cut) || q.rot != 0 || !Double.isNaN(q.depth)) s = true;
      sinks = s;
    }
  }
  public static final class Sprint {
    final double p, mul;
    final int[] range;
    final int every;
    final Emit fx;
    Sprint (double p, double mul, int[] range, int every, Emit fx) { this.p = p; this.mul = mul; this.range = range; this.every = every; this.fx = fx; }
  }
  /** P6: a walk is now and then a roll (chance p), a quarter turn forward every `every` ticks */
  public static final class Roll {
    final double p;
    final int every;
    Roll (double p, int every) { this.p = p; this.every = every; }
  }

  /** particles while it walks (types.ts Pace.trail) */
  public static final class Trail {
    final When when;
    final int every;
    final Emit fx;
    Trail (When when, int every, Emit fx) { this.when = when; this.every = every; this.fx = fx; }
  }

  /** the light it gives off (types.ts Glow): a pool of art pixels on the ground, r across each way (0: none), and
   * particles every `every` ticks, taking turns */
  public static final class Glow {
    final When when;
    final int r, every;
    final int[] cols;
    final boolean flicker;
    final List<Emit> fx;
    Glow (When when, int r, int[] cols, boolean flicker, List<Emit> fx, int every) { this.when = when; this.r = r; this.cols = cols; this.flicker = flicker; this.fx = fx; this.every = every; }
  }

  /** a place of the scene (types.ts Spot), world pixels */
  public static final class Spot {
    public final String kind;
    public final double x, y, w, h;
    /** strip: a band above the walking ground; pond: the pond a Daily streak grows (where sea creatures meet) */
    public final boolean strip, pond;
    public Spot (String kind, double x, double y, double w, double h, boolean strip, boolean pond) { this.kind = kind; this.x = x; this.y = y; this.w = w; this.h = h; this.strip = strip; this.pond = pond; }
  }

  /** a particle's look (types.ts ParticleLook) */
  public static final class Look {
    final List<String[]> frames = new ArrayList<>();
    final List<Integer> until = new ArrayList<>();
    String[] pop;
    final java.util.HashMap<Character, Integer> cols = new java.util.HashMap<>();
    /** every, dx, dy, from, to */
    final List<int[]> move = new ArrayList<>();
    boolean mirror;

    String[] rows (int t, boolean popping) {
      if (popping && pop != null) return pop;
      for (int i = 0; i < frames.size(); i++) if (until.get(i) > t) return frames.get(i);
      return frames.get(frames.size() - 1);
    }
  }

  public final List<String> traits = new ArrayList<>();
  public double[] sleep, home;
  public final List<Nap> naps = new ArrayList<>();
  public String motion;
  public double speed = 1, rest = 1;
  public int[] range;
  public boolean sideways, still;
  /** its pose in the still picture (types.ts Nature.still), when not the plain standing one; null: none */
  public Pose stillPose;
  public Sprint sprint;
  public Trail trail;
  public Glow glow;
  public Roll roll;
  public final List<Mood> moods = new ArrayList<>();
  public final List<Like> likes = new ArrayList<>();
  public final List<Act> acts = new ArrayList<>();
  /** a tap's reaction instead of the happy hop (types.ts Touch.tap), or null; an empty script: no hop at all */
  public Act tap;

  /** the rule before natures: asleep from bedtime to morning, home from dusk (runner.ts DAY), and the Owl's */
  static final StableNature DAY = new StableNature(), OWL = new StableNature();
  static {
    DAY.sleep = new double[] { StableHerd.BEDTIME, StableHerd.MORNING }; DAY.home = new double[] { StableHerd.DUSK, StableHerd.MORNING };
    OWL.sleep = new double[] { 0, 0 }; OWL.home = new double[] { StableHerd.DUSK, StableHerd.MORNING };
  }

  /** [from, to) on the clock, wrapping past midnight when from > to; [x, x] never */
  static boolean inHours (double h, double[] w) { return w[0] <= w[1] ? h >= w[0] && h < w[1] : h >= w[0] || h < w[1]; }

  /** asleep now: its sleeping hours, or a nap bout at its own phase */
  boolean sleepy (double hour, boolean winter, int moon, boolean wet, int tick, int phase) {
    if (sleep != null && inHours(hour, sleep)) return true;
    for (Nap z : naps) if (z.when.holds(hour, winter, moon, wet) && (tick + phase) % z.cycle < z.on) return true;
    return false;
  }

  boolean homeward (double hour) { return home != null && inHours(hour, home); }

  /** speed and rest now, with the moods that hold */
  double[] paceNow (double hour, boolean winter, int moon, boolean wet) {
    double s = speed, r = rest;
    for (Mood m : moods) if (m.when.holds(hour, winter, moon, wet)) { s *= m.speed; r *= m.rest; }
    return new double[] { s, r };
  }

  /* ---------------------------------------------------------- reading the app's JSON (Json.parse) */

  private static Map<?, ?> obj (Object v) { return v instanceof Map ? (Map<?, ?>) v : Collections.emptyMap(); }
  private static List<?> list (Object v) { return v instanceof List ? (List<?>) v : Collections.emptyList(); }
  private static double num (Object v, double d) { return Json.num(v, d); }
  private static String str (Object v) { return v instanceof String ? (String) v : null; }
  private static double[] pair (Object v) { List<?> l = list(v); return l.size() == 2 ? new double[] { num(l.get(0), 0), num(l.get(1), 0) } : null; }
  private static int[] ints (Object v) {
    if (!(v instanceof List)) return null;
    List<?> l = (List<?>) v;
    int[] out = new int[l.size()];
    for (int i = 0; i < out.length; i++) out[i] = (int) num(l.get(i), 0);
    return out;
  }

  static When when (Object v) {
    if (v == null) return new When(null, null, null);
    Map<?, ?> o = obj(v);
    Object w = o.get("winter"), wa = o.get("water");
    When out = new When(pair(o.get("hours")), w instanceof Boolean ? (Boolean) w : null, ints(o.get("moon")));
    if (wa instanceof Boolean) out.water = (Boolean) wa;
    return out;
  }

  static Emit emit (Object v) {
    Map<?, ?> o = obj(v);
    return new Emit(str(o.get("kind")), str(o.get("at")), num(o.get("x"), 0), num(o.get("y"), 0), (int) num(o.get("life"), 0), (int) num(o.get("side"), 1));
  }

  static Pose pose (Object v) {
    Map<?, ?> o = obj(v);
    Object n = o.get("n");
    int lo, hi;
    boolean range = n instanceof List;
    if (range) { int[] r = ints(n); lo = r[0]; hi = r[1]; } else { lo = hi = (int) num(n, 1); }
    List<Emit> fx = new ArrayList<>();
    for (Object e : list(o.get("fx"))) fx.add(emit(e));
    Pose p = new Pose(lo, hi, range, num(o.get("lift"), 0), num(o.get("sink"), 0), o.get("cut") instanceof Double ? (Double) o.get("cut") : Double.NaN,
        (int) num(o.get("sq"), 0), (int) num(o.get("dx"), 0), (int) num(o.get("leg"), 0), Boolean.TRUE.equals(o.get("turn")), fx, num(o.get("wake"), 0),
        num(o.get("perch"), 0), num(o.get("soar"), 0), (int) num(o.get("fwd"), 0), Boolean.TRUE.equals(o.get("inward")));
    p.look = num(o.get("look"), 0);
    p.rot = (int) num(o.get("rot"), 0);
    p.go = num(o.get("go"), 0);
    if (o.get("depth") instanceof Double) p.depth = (Double) o.get("depth");
    p.glide = num(o.get("glide"), 0);
    p.elsewhere = Boolean.TRUE.equals(o.get("elsewhere"));
    return p;
  }

  static int rgb (Object v) { return Integer.parseInt(((String) v).substring(1), 16); }

  static Act act (Object v) {
    Map<?, ?> q = obj(v);
    List<Pose> script = new ArrayList<>();
    for (Object ps : list(q.get("script"))) script.add(pose(ps));
    return new Act(str(q.get("id")), when(q.get("when")), str(q.get("at")), num(q.get("p"), 1), script, ints(q.get("loops")), ints(q.get("rest")));
  }

  /** a nature from the app's JSON (Json.parse of SceneryCreature.nature), or null for none */
  public static StableNature of (Object v) {
    if (!(v instanceof Map)) return null;
    Map<?, ?> o = (Map<?, ?>) v;
    StableNature n = new StableNature();
    for (Object t : list(o.get("traits"))) n.traits.add(str(t));
    Map<?, ?> s = obj(o.get("schedule"));
    n.sleep = pair(s.get("sleep"));
    n.home = pair(s.get("home"));
    for (Object z : list(s.get("naps"))) { Map<?, ?> m = obj(z); n.naps.add(new Nap(when(m.get("when")), (int) num(m.get("cycle"), 1), (int) num(m.get("on"), 0))); }
    Map<?, ?> p = obj(o.get("pace"));
    n.motion = str(p.get("motion"));
    n.speed = num(p.get("speed"), 1); n.rest = num(p.get("rest"), 1);
    n.range = ints(p.get("range"));
    n.sideways = Boolean.TRUE.equals(p.get("sideways")); n.still = Boolean.TRUE.equals(p.get("still"));
    if (p.get("sprint") instanceof Map) {
      Map<?, ?> q = obj(p.get("sprint"));
      n.sprint = new Sprint(num(q.get("p"), 0), num(q.get("mul"), 1), ints(q.get("range")), (int) num(q.get("every"), 4), q.get("fx") instanceof Map ? emit(q.get("fx")) : null);
    }
    if (p.get("trail") instanceof Map) { Map<?, ?> q = obj(p.get("trail")); n.trail = new Trail(when(q.get("when")), (int) num(q.get("every"), 1), emit(q.get("fx"))); }
    if (o.get("glow") instanceof Map) {
      Map<?, ?> q = obj(o.get("glow"));
      List<?> cs = list(q.get("cols"));
      List<Emit> fx = new ArrayList<>();
      for (Object e : list(q.get("fx"))) fx.add(emit(e));
      n.glow = new Glow(when(q.get("when")), (int) num(q.get("r"), 0), cs.size() == 2 ? new int[] { rgb(cs.get(0)), rgb(cs.get(1)) } : null,
          Boolean.TRUE.equals(q.get("flicker")), fx, (int) num(q.get("every"), 0));
    }
    if (p.get("roll") instanceof Map) { Map<?, ?> q = obj(p.get("roll")); n.roll = new Roll(num(q.get("p"), 0), (int) num(q.get("every"), 1)); }
    for (Object m : list(o.get("moods"))) { Map<?, ?> q = obj(m); n.moods.add(new Mood(when(q.get("when")), num(q.get("speed"), 1), num(q.get("rest"), 1))); }
    for (Object l : list(o.get("likes"))) { Map<?, ?> q = obj(l); n.likes.add(new Like(when(q.get("when")), str(q.get("at")), num(q.get("p"), 0))); }
    for (Object a : list(o.get("acts"))) n.acts.add(act(a));
    if (o.get("still") instanceof Map) n.stillPose = pose(o.get("still"));
    Object tap = obj(o.get("touch")).get("tap");
    if (tap instanceof Map) n.tap = act(tap);
    return n;
  }

  /** the places of a scene from the app's JSON (StableScenery.spots) */
  public static List<Spot> spots (Object v) {
    List<Spot> out = new ArrayList<>();
    for (Object s : list(v)) {
      Map<?, ?> o = obj(s);
      out.add(new Spot(str(o.get("kind")), num(o.get("x"), 0), num(o.get("y"), 0), num(o.get("w"), 0), num(o.get("h"), 0), Boolean.TRUE.equals(o.get("strip")), Boolean.TRUE.equals(o.get("pond"))));
    }
    return out;
  }

  /** particle looks by kind from the app's JSON (StableScenery.particles) */
  public static java.util.Map<String, Look> looks (Object v) {
    java.util.Map<String, Look> out = new java.util.HashMap<>();
    for (Map.Entry<?, ?> e : obj(v).entrySet()) {
      Map<?, ?> o = obj(e.getValue());
      Look l = new Look();
      for (Object f : list(o.get("frames"))) {
        Map<?, ?> fo = obj(f);
        l.frames.add(rows(fo.get("rows")));
        l.until.add(fo.get("until") instanceof Double ? (int) num(fo.get("until"), 0) : Integer.MAX_VALUE);
      }
      if (o.get("pop") instanceof List) l.pop = rows(o.get("pop"));
      for (Map.Entry<?, ?> c : obj(o.get("cols")).entrySet()) l.cols.put(((String) c.getKey()).charAt(0), Integer.parseInt(((String) c.getValue()).substring(1), 16));
      for (Object m : list(o.get("move"))) {
        Map<?, ?> mo = obj(m);
        l.move.add(new int[] { (int) num(mo.get("every"), 1), (int) num(mo.get("dx"), 0), (int) num(mo.get("dy"), 0), (int) num(mo.get("from"), 0),
            mo.get("to") instanceof Double ? (int) num(mo.get("to"), 0) : Integer.MAX_VALUE });
      }
      l.mirror = Boolean.TRUE.equals(o.get("mirror"));
      out.put((String) e.getKey(), l);
    }
    return out;
  }

  private static String[] rows (Object v) {
    List<?> l = list(v);
    String[] out = new String[l.size()];
    for (int i = 0; i < out.length; i++) out[i] = str(l.get(i));
    return out;
  }
}
