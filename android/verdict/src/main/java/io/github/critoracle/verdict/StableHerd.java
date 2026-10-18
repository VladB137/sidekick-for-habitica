package io.github.critoracle.verdict;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * The Stable's creatures for the live wallpaper: a line-by-line port of the parts of src/playground/creatures.ts
 * a home screen needs (wandering, the five gaits, turning, breathing, company, heading home at dusk, sleeping
 * with Zzz, a tap's happy hop and heart, the player's avatar on the ridden mount or on foot by the door with
 * creatures coming to greet it, the Inn's sleep, and being together: walking
 * over to a friend, greeting, leaning in, a little one following its grown-up, sleeping side by side and
 * breathing in step, and each species' nature: its hours, pace, favourite places and acts, see {@link StableNature};
 * in the still picture its still pose and the perches, see {@link #settle}),
 * drawn the same way (row slices
 * of the one frame, never scaled). Same seeds, same numbers: tested tick by tick against the TypeScript herd
 * (npm run android:test). Left out because a wallpaper has no use for them: the ball and its chase, carrying and
 * dropping, stroking, celebrations.
 *
 * Units are world pixels (Habitica's image pixels); ART = 3 of them make one art pixel. Pure Java: whatever
 * draws it implements {@link Paint}.
 */
public final class StableHerd {
  public static final int ART = 3;
  /** hours: from dusk pets head home, from bedtime they sleep there until morning (creatures.ts) */
  public static final int DUSK = 19, BEDTIME = 21, MORNING = 6;
  /** a heart's life: 1.2 s at 30 ticks a second */
  public static final int HEART_LIFE = 36;
  private static final int APART = 6 * ART, WALK_MIN = 10 * ART, WALK_MAX = 50 * ART;
  /** two bonded creatures greet at most twice a minute */
  private static final int GREET_EVERY = 900;
  /** where a greeting's small hearts rise, art pixels from the point between the two heads */
  private static final int[][] TINY_AT = { { -3, 0 }, { 2, -1 }, { -1, -3 } };
  /** tag: a playmate within 50 art pixels, a dodge of 24, a round over after 10 s without a tag */
  private static final int TAG_RANGE = 50 * ART, TAG_FLEE = 24 * ART, TAG_ROUND = 300;
  /** a cat pounces on yarn within 90 art pixels, which rolls 8 away */
  private static final int POUNCE_RANGE = 90 * ART, POUNCE_ROLL = 8 * ART;
  /** the avatar on foot: half its body's width, and how often a creature choosing a walk goes to greet it */
  private static final int AV_HALF = 6 * ART;
  private static final double GREET = 0.3;

  /** One creature's picture and nature, from the sprite catalogue. */
  public static final class Look {
    public final String id, species, motion, facing;
    public final boolean mount, nocturnal, head;
    /** the cell's size; the anchor is (ax, h - 1) */
    public final int w, h, ax;
    /** where it was dropped (0..1 across the world, 0..1 down the ground band), or NaN */
    public final double spotX, spotY;
    /** how it gets on with others ("close", "usual", "aloof", "mischief"), or null: company with its own species only */
    public String temper;
    /** whom it's bonded to here, strongest first: ids and kinds ("family", "kin", "friend", "cousin", "alike") */
    public String[] bondIds = new String[0], bondKinds = new String[0];
    /** one of Habitica's Polar Pro animals (never huddles in the snow); the player's current pet (walks beside the ridden mount) */
    public boolean cold, yours;
    /** its signature pair's part (creatures.ts Resident): whom it walks behind, guards, circles, pounces on;
     * the sheep it herds or keeps with; where it meets its kind ("pond", "flowers"); a Veteran the others seek */
    public String lead, guard, orbit, pounce, meet;
    public String[] flock = new String[0], fold = new String[0];
    public boolean elder;

    public Look (String id, String species, boolean mount, String motion, String facing, boolean nocturnal, boolean head, int w, int h, int ax, double spotX, double spotY) {
      this.id = id; this.species = species; this.mount = mount; this.motion = motion; this.facing = facing; this.nocturnal = nocturnal;
      this.head = head; this.w = w; this.h = h; this.ax = ax; this.spotX = spotX; this.spotY = spotY;
    }

    /** its species' ways (src/stable/natures.ts), or null: the herd's old rules */
    public StableNature nature;

    /** its nature (StableNature.of the app's JSON); returns itself */
    public Look nature (StableNature n) { this.nature = n; return this; }

    /** its temperament and bonds (src/app/stable/social.ts works them out); returns itself */
    public Look social (String temper, String[] ids, String[] kinds) {
      this.temper = temper; this.bondIds = ids; this.bondKinds = kinds;
      return this;
    }
  }

  /** how often it walks over to company (a mount half as often), and how near it stands (art pixels) */
  static double seek (String temper) {
    switch (temper) { case "close": return 0.6; case "aloof": return 0.2; default: return 0.4; }
  }
  /** company ebbs (creatures.ts FILL, KEEP); a little one or a train follower sets off after its lead this often (times 1 - fill) */
  static final double FILL = 0.6, KEEP = 0.8, FOLLOW = 0.75;
  /** the usual rest between walks, ticks (runner.ts REST) */
  static final int REST_LO = 30, REST_HI = 120;
  /** standing about, a check every FIDGET_EVERY ticks for a little something (creatures.ts FIDGETS): look, sniff, scratch, stretch, hop */
  static final int FIDGET_EVERY = 20, LOOK_ROUND = 0, SNIFF = 1, SCRATCH = 2, STRETCH = 3, HOP = 4;
  static double fidget (String temper) {
    switch (temper) { case "close": return 0.5; case "aloof": return 0.35; case "mischief": return 0.6; default: return 0.45; }
  }
  static int[] fidgets (String temper) {
    switch (temper) {
      case "close": return new int[] { 2, 2, 1, 1, 2 };
      case "aloof": return new int[] { 3, 2, 1, 2, 0 };
      case "mischief": return new int[] { 1, 1, 2, 1, 3 };
      default: return new int[] { 2, 2, 1, 1, 1 };
    }
  }
  static int gap (String temper) {
    switch (temper) { case "close": return 3; case "aloof": return 10; default: return 6; }
  }
  /** how strongly a bond draws it over */
  static int pull (String kind) {
    switch (kind) { case "family": return 6; case "kin": case "friend": return 4; case "cousin": return 2; default: return 1; }
  }
  /** bonds that lie down together and breathe in step */
  static boolean snug (String kind) { return "family".equals(kind) || "friend".equals(kind) || "kin".equals(kind); }

  /** two bonded creatures together for a moment: a greeting, perhaps a lean together */
  static final class Moment {
    final Creature a, b;
    int t;
    final boolean close, back, nuzzle, family;
    Moment (Creature a, Creature b, boolean close, boolean back, boolean nuzzle, boolean family) { this.a = a; this.b = b; this.close = close; this.back = back; this.nuzzle = nuzzle; this.family = family; }
  }

  /** a game of tag: `it` chases `run`, who dodges away and waits; a touch is a tag, and after a breath they swap */
  static final class Game {
    Creature it, run;
    int left, t, pause;
    final boolean pounce;
    Game (Creature it, Creature run, int left, boolean pounce) { this.it = it; this.run = run; this.left = left; this.pounce = pounce; }
  }

  /** What draws the herd. Colours are 0xRRGGBB. */
  public interface Paint {
    /** part of creature n's picture (its head layer when head): the cell's (sx, sy, w, h) at world (dx, dy), mirrored when flip */
    void cell (int n, boolean head, int sx, int sy, int w, int h, int dx, int dy, boolean flip);
    void rect (int rgb, int x, int y, int w, int h);
    /** picture `part` of the rider on creature n, whole and unscaled, its top-left at world (dx, dy), mirrored when flip */
    void rider (int n, int part, int dx, int dy, boolean flip);
    /** P6: part of creature n's picture, the cell's (sx, sy, w, h) mirrored when flip, then turned q quarters clockwise, its
     * box's top-left at world (dx, dy) (StableTurns.matrix places it exactly) */
    void turned (int n, boolean head, int sx, int sy, int w, int h, int dx, int dy, boolean flip, int q);
    /** picture `part` of the avatar on foot, whole and unscaled, its top-left at world (dx, dy) */
    void avatar (int part, int dx, int dy);
  }

  /** A creature or the avatar on foot: drawn in painter's order by where it stands. */
  public interface Figure {
    /** where it stands, world pixels down */
    double foot ();
    void draw (Paint g);
  }

  /** gait tag (sprites.ts) to how it moves: only four-legged creatures trot; untagged ones hop */
  public static String motionOf (String gait) {
    if (gait == null) return "hop";
    switch (gait) {
      case "four-legged": case "upright": return "trot";
      case "leaping": return "bound";
      case "legless": return "scoot";
      case "flying": return "hover";
      default: return "hop";
    }
  }

  private static final int[][] ARC = { { 1, 2, 3, 3, 3, 2, 1 }, { 1, 2, 3, 4, 5, 5, 5, 4, 3, 2, 1 }, { 1, 1 } };
  private static final int[] DIST = { 5, 9, 2 }, REST = { 6, 8, 1 };
  private static final int[] HAPPY_ARC = { 0, 2, 3, 4, 4, 3, 2, 0 };

  static double snap (double v) { return Math.round(v / ART) * ART; }
  static double clamp (double v, double lo, double hi) { return Math.max(lo, Math.min(hi, v)); }
  /** Math.hypot as V8 computes it (normalised Kahan sum), so distances round the same as in the app */
  static double hypot (double a, double b) {
    a = Math.abs(a); b = Math.abs(b);
    double max = Math.max(a, b);
    if (max == Double.POSITIVE_INFINITY) return max;
    if (Double.isNaN(a) || Double.isNaN(b)) return Double.NaN;
    if (max == 0) return 0;
    double sum = 0, comp = 0;
    for (double v : new double[] { a, b }) {
      double n = v / max, summand = n * n - comp, pre = sum + summand;
      comp = (pre - sum) - summand;
      sum = pre;
    }
    return Math.sqrt(sum) * max;
  }

  enum St { IDLE, TURN, MOVE, CHASE, HAPPY, ACT }

  public static final int ZED = 0, HEART = 1, TINY = 2, SPARK = 3, LOOK = 4;
  /** a crow wakes sleepers for this many ticks; the pacing guard: an act on 1 wander in 2, 3 creatures at most or half the herd */
  static final int WOKEN = 300, BUSY_MAX = 3;
  static final double GUARD = 0.5;
  static int busyMax (int n) { return Math.max(BUSY_MAX, (n + 1) / 2); }

  /** A Zzz, a heart (yours), a small heart (two friends), a sparkle, or one of the behaviours' looks (dust, a note...). */
  public static final class Particle {
    public final int kind;
    public double x, y;
    public int t;
    public final int life;
    final Creature owner;
    /** a behaviour's look, and the way it goes (+1 right) */
    final String look;
    final int side;
    Particle (int kind, double x, double y, int life, Creature owner) { this(kind, x, y, life, owner, null, 1); }
    Particle (int kind, double x, double y, int life, Creature owner, String look, int side) { this.kind = kind; this.x = x; this.y = y; this.life = life; this.owner = owner; this.look = look; this.side = side; }
  }

  /** an act going on: its script, the pose, ticks in it and its length, loops left */
  static final class ActRun {
    final StableNature.Act a;
    int i, t, n, loops;
    /** how far above its feet the top of the place it is at stands (NaN until its first tick; -1 at none) */
    double top = Double.NaN;
    ActRun (StableNature.Act a) { this.a = a; }
  }

  /** in the still picture, up at the place of an act that goes up (P4; settle): where it stood, and the pose it holds up there */
  static final class Perch {
    final double fx, fy;
    final StableNature.Pose pose;
    Perch (double fx, double fy, StableNature.Pose pose) { this.fx = fx; this.fy = fy; this.pose = pose; }
  }

  public final class Creature implements Figure {
    public final Look look;
    public final int n;
    public double x, y, fx, fy, tx, ty, lift, base;
    public int dir = 1, t, cyc, wait, sq, leg, hearts, wake;
    St st = St.IDLE;
    final int breathEvery, breathAt;
    boolean asleep;
    /** walking over to greet the avatar on foot */
    boolean greet;
    /** the avatar riding it: each picture's {x, y, w, h} from the top-left of the cell (creatures.ts RiderLayer), or null */
    int[][] rider;
    /** leaning into a friend: -1, 0, +1 (screen direction) */
    public int lean;
    /** bonded creatures here, strongest first, and how */
    final List<Creature> bonds = new ArrayList<>();
    final List<String> bondKinds = new ArrayList<>();
    Creature mate, followOf;
    int followIn, copy;
    /** what it is busy with ('moment' with another creature, 'act' one of its species' ways), or null */
    String busy;
    /** drawn this much higher (negative: sunk), world pixels; drawn only above clip (NaN: whole); sideways shake, art pixels */
    double off, clip = Double.NaN;
    /** off and clip are its wading (runner.ts wade) */
    boolean wet;
    int dx;
    /** its nature, the act it's doing and the one it walks to, and whether this walk is a sprint */
    final StableNature nature;
    ActRun act;
    StableNature.Act plan;
    boolean sprinting;
    /** circles hopped around the one it orbits */
    int lap;
    /** how much company it has had lately, 0 to 1 */
    double fill;
    /** a fidget: its kind (-1 none), tick, length, and the way it faced before */
    int fidK = -1, fidT, fidN, fidBack;
    /** P6: quarter turns forward it is drawn turned this tick, and whether this walk is a roll */
    public int rot;
    boolean rolling;
    /** up at its place in the still picture (settle), or null */
    Perch perched;
    final StableRng rng;

    Creature (Look l, int n) {
      look = l; this.n = n; nature = l.nature;
      rng = StableHerd.this.rng.fork("creature:" + l.id);
      breathEvery = rng.nextInt(48, 72);
      breathAt = rng.nextInt(0, breathEvery - 1);
      wait = rng.nextInt(20, 110);
    }

    String motion () { return nature != null && nature.motion != null ? nature.motion : look.motion; }
    int half () { return (int) Math.ceil(look.w / 2.0); }
    private double M () { return look.mount ? 4.0 / 3 : 1; }
    private double art (int k) { return Math.round(k * M()) * ART; }
    boolean flipped () { String f = look.facing; return !"front".equals(f) && (dir < 0) != "left".equals(f); }
    void setPos (double nx, double ny) { fx = nx; fy = ny; x = snap(nx); y = snap(ny); }
    double restHeight () { return "hover".equals(motion()) && !isAsleep() ? (look.mount ? 8 : 6) * ART : 0; }
    public boolean isAsleep () { return asleep && wake <= 0; }
    public String state () { return st.name().toLowerCase(); }

    void update () {
      step();
      wade(this);
    }

    private void step () {
      // something else took over from its act: back to its own height, uncut
      if (act != null && st != St.ACT) quitAct(this);
      // and from a fidget
      if (fidK >= 0 && (st != St.IDLE || isAsleep() || lean != 0 || busy != null)) unfidget();
      t++;
      rot = 0;
      if (wake > 0) wake--;
      base = restHeight();
      if (st == St.ACT) { stepAct(this); return; }
      if (st == St.HAPPY) {
        sq = t == 1 ? -1 : t == 9 ? 1 : 0;
        lift = base + art(t < HAPPY_ARC.length ? HAPPY_ARC[t] : 0);
        if (t > 10) idle(rng.nextInt(30, 60));
        return;
      }
      if (isAsleep()) {
        lift = 0; leg = 0; lean = 0;
        sq = Math.floorMod((tick + breathOf(this)) / 40, 2) != 0 ? 1 : 0;
        return;
      }
      if (lean != 0) { sq = 0; return; }
      if (st == St.TURN) { lift = base; if (t >= 2) { st = St.MOVE; t = 0; cyc = 0; } return; }
      if (st == St.IDLE) {
        boolean hover = "hover".equals(motion());
        leg = 0;
        lift = base + (hover ? ((tick + breathAt) / 8 % 2) * ART : 0);
        sq = !hover && (tick + breathAt) % breathEvery < 8 ? 1 : 0;
        if (copy > 0 && --copy == 0) { st = St.HAPPY; t = 0; return; }
        if (followOf != null && --followIn <= 0) {
          Creature f = followOf;
          followOf = null;
          trail(this, f);
          if (st != St.IDLE) return;
        }
        if (fidK < 0 && busy == null && wait > 20 && (tick + breathAt) % FIDGET_EVERY == 0) fidget();
        if (fidK >= 0) fidgeting();
        if (st == St.IDLE && --wait <= 0) wander(this);
        return;
      }
      travel();
    }

    void idle (int w) { st = St.IDLE; t = 0; wait = w; lift = base; sq = 0; leg = 0; dx = 0; plan = null; sprinting = false; rolling = false; fidK = -1; }

    /** standing about: now and then a little something, by its temper (creatures.ts fidget) */
    private void fidget () {
      String tp = look.temper != null ? look.temper : "usual";
      if (!rng.chance(StableHerd.fidget(tp))) return;
      int[] ws = fidgets(tp);
      if ("front".equals(look.facing) || sideways()) ws[LOOK_ROUND] = 0;
      if ("hover".equals(motion())) ws[SNIFF] = 0;
      int sum = 0;
      for (int k : ws) sum += k;
      double r = rng.next() * sum;
      int k = ws.length - 1;
      for (int i = 0; i < ws.length; i++) { if (r < ws[i]) { k = i; break; } r -= ws[i]; }
      if (k == HOP) { hop(this); return; }
      startFidget(k, k == LOOK_ROUND ? rng.nextInt(30, 60) : k == SNIFF ? rng.nextInt(24, 40) : k == SCRATCH ? rng.nextInt(12, 20) : rng.nextInt(10, 18));
    }

    void startFidget (int k, int n) {
      fidK = k; fidT = 0; fidN = n; fidBack = dir;
      if (k == LOOK_ROUND) dir = -dir;
    }

    private void fidgeting () {
      if (fidK == SNIFF) sq = (fidT / 5) % 2 != 0 ? 0 : 1;
      else if (fidK == SCRATCH) dx = (fidT / 2) % 2 != 0 ? 1 : -1;
      else if (fidK == STRETCH) sq = -1;
      if (++fidT >= fidN) unfidget();
    }

    /** turned to face something by the herd: any fidget over, no looking back */
    void face (int d) { if (fidK >= 0) { fidK = -1; dx = 0; } dir = d; }

    private void unfidget () {
      int k = fidK;
      fidK = -1;
      dx = 0;
      if (k == LOOK_ROUND && dir == -fidBack) dir = fidBack;
    }

    boolean sideways () { return nature != null && nature.sideways; }

    /** up at night: its nature's schedule keeps it awake at midnight, or (no nature) its sprite is a night one */
    boolean nocturnal () { return nature != null ? nature.sleep == null || !StableNature.inHours(0, nature.sleep) : look.nocturnal; }

    /** after a moving target, set again each tick: no pause to turn, and it never stops on arrival */
    void chase (double gx, double gy) { if (fidK >= 0) unfidget(); tx = gx; ty = gy; plan = null; sprinting = false; rolling = false; st = St.CHASE; t = 0; }

    void goTo (double gx, double gy) {
      if (fidK >= 0) unfidget();
      tx = gx; ty = gy; plan = null; sprinting = false; rolling = false; greet = false;
      int want = gx > fx + 0.5 ? 1 : gx < fx - 0.5 ? -1 : dir;
      if (want != dir && !sideways()) { dir = want; st = St.TURN; } else st = St.MOVE;
      t = 0; cyc = 0;
    }

    private void travel () {
      boolean chase = st == St.CHASE;
      double dx = tx - fx, dy = ty - fy, d = hypot(dx, dy);
      int want = dx > 0.5 ? 1 : dx < -0.5 ? -1 : dir;
      boolean grounded = lift <= base;
      if (want != dir && grounded && !sideways()) {
        dir = want;
        // a walk pauses 2 ticks after turning; a chase can't wait
        if (!chase) { st = St.TURN; t = 0; leg = 0; sq = 0; return; }
      }
      if (d < 1) {
        StableNature.Act p = plan;
        if (!chase) idle(rested(this, rng.nextInt(REST_LO, REST_HI)));
        lift = base; sq = 0; leg = 0;
        if (!chase) arrived(this, p != null);
        if (greet) greeted(this);
        // there to do something (still the time for it): it does it now
        if (p != null && st == St.IDLE && busy == null && p.when.holds(hour, winter, moon, wet()) && canAct(this, p)) startAct(this, p);
        return;
      }
      StableNature.Sprint sprint = sprinting ? nature.sprint : null;
      double mul = chase ? 1.6 : sprint != null ? sprint.mul : 1, sp = nature != null ? nature.paceNow(hour, winter, moon, wet())[0] : 1;
      if (sprint != null && sprint.fx != null && t % sprint.every == 0) emitFrom(this, sprint.fx);
      StableNature.Trail trail = nature != null ? nature.trail : null;
      if (trail != null && t % trail.every == 0 && trail.when.holds(hour, winter, moon, wet())) emitFrom(this, trail.fx);
      String m = motion();
      StableNature.Roll roll = rolling ? nature.roll : null;
      double adv = 0;
      if (roll != null) {
        // rolling along: steady, a quarter turn forward every few ticks
        adv = (look.mount ? 14 : 10) * ART / 30.0 * mul * sp;
        leg = 0; sq = 0; lift = base; rot = t / roll.every % 4;
      } else if ("trot".equals(m)) {
        adv = (look.mount ? 14 : 10) * ART / 30.0 * mul * sp;
        leg = t / 4 % 2; sq = 0; lift = base;
      } else if ("hover".equals(m)) {
        adv = 12 * ART / 30.0 * mul * sp; sq = 0;
        lift = base + (tick / 8 % 2) * ART;
      } else {
        int k = "bound".equals(m) ? 1 : "scoot".equals(m) ? 2 : 0;
        int[] arc = ARC[k];
        int len = arc.length, cycle = 1 + len + 2 + Math.max(0, (int) Math.round(REST[k] / mul));
        int f = cyc++ % cycle;
        if (f == 0) { sq = -1; lift = base; }
        else if (f <= len) {
          sq = 0;
          lift = base + (k == 2 ? arc[f - 1] * ART : art(arc[f - 1]));
          adv = (double) DIST[k] * ART / len * (k == 2 ? 1 : M()) * (chase ? 1.2 : sprint != null ? 1.5 : 1) * sp;
        }
        else if (f <= len + 2) { sq = 1; lift = base; }
        else { sq = 0; lift = base; }
      }
      if (adv != 0) { double s = Math.min(adv, d); setPos(fx + dx / d * s, fy + dy / d * s); }
    }

    /** above its head (over a rider, over the rider's head), where hearts and Zzz start */
    double[] headPoint () {
      int top = 0;
      if (rider != null) for (int[] l : rider) top = Math.min(top, l[1]);
      // in the still picture where it's drawn (a perch, a still pose)
      double up = still ? shownLift() : snap(lift) + snap(off);
      return new double[] { x - 2 * ART, y - (look.h - top) - up - 7 * ART };
    }

    /** Its pose in the still picture, never ridden or asleep: up at its place, the pose it holds there (perched,
     * settle, its height in off), else its nature's (Nature.still); null: the plain standing one. */
    StableNature.Pose stillPose () {
      return rider != null || isAsleep() ? null : perched != null ? perched.pose : nature != null ? nature.stillPose : null;
    }

    /** How high its picture is drawn: in motion where it is now, in the still picture its resting height (less of it
     * the higher it perches, as in stepAct) plus its still pose's lift. */
    double shownLift () {
      if (!still) return snap(lift) + snap(off);
      StableNature.Pose p = stillPose();
      double k = perched != null && p != null ? p.perch : 0;
      return snap(base * (1 - k)) + (p != null ? p.lift : 0) * ART + snap(off);
    }

    @Override public double foot () { return y; }

    /** Its shadow, body and head (when still: the resting pose, up at its place, or its nature's still one). */
    @Override public void draw (Paint g) {
      boolean flip = flipped();
      int ax = flip ? look.w - 1 - look.ax : look.ax, ay = look.h - 1;
      StableNature.Pose sp = still ? stillPose() : null;
      int l = (int) shownLift();
      int s = still ? (sp != null ? sp.sq : 0) : sq, lg = still ? (sp != null ? sp.leg : 0) : leg;
      int ddx = still ? (sp != null ? sp.dx + sp.fwd * dir : 0) : dx;
      int left = (int) x - ax + ddx * ART, top = (int) y - ay - l;
      int liftArt = (int) Math.round(l / (double) ART);
      // turned a quarter (P6, never under a rider): drawn whole, body then head
      int q = rider != null ? 0 : StableTurns.screen(still ? (sp != null ? sp.rot : 0) : rot, dir);
      int sw = Math.max(1, (int) Math.round((q % 2 != 0 ? look.h : look.w) / (double) ART * 0.6) - 2 * Math.min(3, Math.floorDiv(liftArt, 2)));
      if (off == 0 && Double.isNaN(clip)) g.rect(shadow, (int) x - sw / 2 * ART, (int) y + 1, sw * ART, (look.mount ? 2 : 1) * ART);
      if (q != 0) {
        turned(g, false, flip, left, top, q);
        if (look.head) turned(g, true, flip, left, top, q);
        return;
      }
      slices(g, false, flip, left, top, s, lg);
      if (rider != null) ridden(g, flip, left, top, s);
      if (look.head) slices(g, true, flip, left, top, s, lg);
    }

    boolean familyOf (Creature o) {
      for (int i = 0; i < bonds.size(); i++) if (bonds.get(i) == o && "family".equals(bondKinds.get(i))) return true;
      return false;
    }

    /** The rider moves with the top half of the body: down a row in a squash, up in a stretch. */
    private void ridden (Paint g, boolean flip, int left, int top, int s) {
      int ox = lean * ART, oy = s > 0 ? ART : s < 0 ? -ART : 0;
      for (int i = 0; i < rider.length; i++) {
        int[] l = rider[i];
        g.rider(n, i, (flip ? left + (look.w - l[0]) - l[2] : left + l[0]) + ox, top + l[1] + oy, flip);
      }
    }

    /** the whole picture turned q quarters clockwise, cut short at the cut line */
    private void turned (Paint g, boolean head, boolean flip, int left, int top, int q) {
      int[] p = StableTurns.part(look.w, look.h, flip, q, StableTurns.box(look.w, look.h, left, top, q), clip);
      if (p != null) g.turned(n, head, p[0], p[1], p[2], p[3], p[4], p[5], flip, q);
    }

    private void slices (Paint g, boolean head, boolean flip, int left, int top, int s, int lg) {
      int W = look.w, H = look.h, A = ART;
      int m = Math.max(A, (int) Math.floor(H / 2.0 / A) * A);
      int legs = lg != 0 ? Math.min(3 * A, H - m - A) : 0;
      int ly = H - legs, lx = lean * A;
      if (s > 0) { put(g, head, flip, left, top, 0, 0, W, m, lx, A); put(g, head, flip, left, top, 0, m + A, W, ly - m - A, 0, 0); }
      else if (s < 0) { put(g, head, flip, left, top, 0, 0, W, m + A, lx, -A); put(g, head, flip, left, top, 0, m, W, ly - m, 0, 0); }
      else { put(g, head, flip, left, top, 0, 0, W, m, lx, 0); put(g, head, flip, left, top, 0, m, W, ly - m, 0, 0); }
      if (legs != 0) {
        int mid = look.ax + 1, back = flip ? 1 : -1;
        put(g, head, flip, left, top, 0, ly, mid, legs, back * A, 0);
        put(g, head, flip, left, top, mid, ly, W - mid, legs, -back * A, 0);
      }
    }

    private void put (Paint g, boolean head, boolean flip, int left, int top, int px, int py, int w, int h, int ox, int oy) {
      // below the cut line each slice is cut short
      if (!Double.isNaN(clip)) h = Math.min(h, (int) clip - (top + py + oy));
      if (w <= 0 || h <= 0) return;
      int dx = flip ? left + (look.w - px - w) + ox : left + px + ox;
      g.cell(n, head, px, py, w, h, dx, top + py + oy, flip);
    }

    /** a painted pixel of it at world (px, py), by its box (the caller checks the picture's own pixels) */
    public int[] box () {
      boolean flip = flipped();
      int ax = flip ? look.w - 1 - look.ax : look.ax;
      int l = (int) shownLift();
      return new int[] { (int) x - ax, (int) y - (look.h - 1) - l, look.w, look.h, flip ? 1 : 0 };
    }

    /** the picture pixel {px, py} drawn at world (wx, wy), turned (P6) and cut as drawn, or null (the caller checks
     * the picture's own pixels) */
    public int[] pixelAt (int wx, int wy) {
      int[] b = box();
      if (!Double.isNaN(clip) && wy >= clip) return null;
      StableNature.Pose sp = still ? stillPose() : null;
      int q = rider != null ? 0 : StableTurns.screen(still ? (sp != null ? sp.rot : 0) : rot, dir);
      if (q != 0) return StableTurns.pixel(look.w, look.h, b[4] == 1, q, StableTurns.box(look.w, look.h, b[0], b[1], q), wx, wy);
      if (wx < b[0] || wy < b[1] || wx >= b[0] + b[2] || wy >= b[1] + b[3]) return null;
      return new int[] { b[4] == 1 ? b[2] - 1 - (wx - b[0]) : wx - b[0], wy - b[1] };
    }
  }

  /** The player's avatar on foot beside the door: its pictures' {x, y, w, h} from the point under its feet. */
  public final class Avatar implements Figure {
    public final int[][] layers;
    public double x, y, lift;
    /** ticks into a hop; -1 = standing */
    public int hop = -1;
    Avatar (int[][] layers) { this.layers = layers; }

    @Override public double foot () { return y; }

    @Override public void draw (Paint g) {
      int l = still ? 0 : (int) snap(lift);
      g.rect(shadow, (int) x - 4 * ART, (int) y + 1, 8 * ART, ART);
      for (int i = 0; i < layers.length; i++) g.avatar(i, (int) x + layers[i][0], (int) y + layers[i][1] - l);
    }
  }

  private final StableRng rng;
  public final List<Creature> creatures = new ArrayList<>();
  /** the avatar on foot, or null */
  public Avatar avatar;
  /** creatures added before it (painter's order breaks ties by who came first) */
  private int avatarAt;
  public final List<Particle> particles = new ArrayList<>();
  /** greetings and nuzzles going on now, and when each pair last met (tick) */
  final List<Moment> moments = new ArrayList<>();
  private final java.util.Map<String, Integer> met = new java.util.HashMap<>();
  public final int w, h;
  private final double bandTop, bandBottom;
  private final double[] door;
  public int shadow;
  /** ticks stepped (the world's tick) */
  public int tick;
  /** the phone's hour, with minutes as a fraction */
  public double hour = 12;
  /** reduced motion or battery saving: the still picture, nothing travels */
  public boolean still;
  /** winter (the scene's season) and tonight's moon (0 new, 4 full), for natures' conditions */
  public boolean winter;
  public int moon = 1;
  /** the scene's places (scenery's spots), and the behaviours' particle looks by kind */
  public List<StableNature.Spot> spots = new ArrayList<>();
  public java.util.Map<String, StableNature.Look> looks = new java.util.HashMap<>();
  /** the scene's weather now (StableWeather's kind, or null): snow huddles them together, fireflies hold their eyes */
  public String weather;
  /** the game of tag going on, if any; the player's current pet, when it lives here */
  Game game;
  Creature yours;

  Creature byId (String id) {
    for (Creature c : creatures) if (c.look.id.equals(id)) return c;
    return null;
  }
  /** the player rests in Habitica's Inn: the herd sleeps by the door, day or night */
  public boolean resting;

  /**
   * @param worldSeed the world's seed as rng.ts hashes it (hashSeed of the app's seed string)
   * @param herdSeed  the herd's own seed string
   * @param door      the stable's door (world pixels), or null
   */
  public StableHerd (int worldSeed, String herdSeed, int w, int h, int bandTop, int bandBottom, double[] door, int shadow) {
    this.rng = new StableRng(worldSeed).fork("herd:" + herdSeed);
    this.w = w; this.h = h; this.bandTop = bandTop; this.bandBottom = bandBottom; this.door = door; this.shadow = shadow;
  }

  /** Who lives here, placed where they were dropped (or at the seeded random spots) and nudged apart. */
  public void set (List<Look> looks) {
    // one at a time, as the app does: a creature's own generator forks from the herd's after the one before was placed
    for (Look l : looks) {
      Creature c = new Creature(l, creatures.size());
      creatures.add(c);
      placeOne(c);
      pairUp(c);
    }
    for (Creature c : creatures) {
      for (int i = 0; i < c.look.bondIds.length; i++) {
        for (Creature o : creatures) if (o != c && o.look.id.equals(c.look.bondIds[i])) { c.bonds.add(o); c.bondKinds.add(c.look.bondKinds[i]); break; }
      }
      if (c.look.yours && !c.look.mount) yours = c;
    }
    spread();
    settle();
  }

  /** with no saved spot, it starts beside its closest friend placed before it (family, friend or kin), facing it */
  private void pairUp (Creature c) {
    if (!Double.isNaN(c.look.spotX) || !Double.isNaN(c.look.spotY)) return;
    // the creatures placed before it are all there is yet
    Creature p = null;
    for (int i = 0; i < c.look.bondIds.length && p == null; i++) {
      if (!snug(c.look.bondKinds[i])) continue;
      for (Creature o : creatures) if (o != c && o.look.id.equals(c.look.bondIds[i])) { p = o; break; }
    }
    if (p == null) return;
    int side = p.fx < w / 2.0 ? 1 : -1, half = c.half();
    c.setPos(clamp(p.fx + side * (p.half() + half + 3 * ART), half, w - half), p.fy);
    if (!"front".equals(c.look.facing)) c.dir = p.fx > c.fx ? 1 : p.fx < c.fx ? -1 : c.dir;
    c.tx = c.fx; c.ty = c.fy;
  }

  private void placeOne (Creature c) {
    int half = c.half();
    double sx = Double.isNaN(c.look.spotX) ? rng.next() : c.look.spotX;
    double sy = Double.isNaN(c.look.spotY) ? rng.next() : c.look.spotY;
    c.setPos(clamp(sx * w, half, w - half), bandTop + clamp(sy, 0, 1) * (bandBottom - bandTop));
    c.dir = "left".equals(c.look.facing) ? -1 : 1;
    c.base = c.restHeight(); c.lift = c.base;
    c.tx = c.fx; c.ty = c.fy;
  }

  private void spread () {
    for (int pass = 0; pass < 12; pass++) {
      boolean moved = false;
      for (int i = 0; i < creatures.size(); i++) for (int j = i + 1; j < creatures.size(); j++) {
        Creature a = creatures.get(i), c = creatures.get(j);
        double need = a.half() + c.half() - 4 * ART;
        double dx = c.fx - a.fx, dy = c.fy - a.fy;
        if (Math.abs(dx) >= need || Math.abs(dy) >= 8 * ART) continue;
        double push = (need - Math.abs(dx)) / 2 + 1;
        int s = dx >= 0 ? 1 : -1;
        a.setPos(a.fx - s * push, a.fy); c.setPos(c.fx + s * push, c.fy);
        moved = true;
      }
      for (Creature c : creatures) { int hf = c.half(); c.setPos(clamp(c.fx, hf, w - hf), clamp(c.fy, bandTop, bandBottom)); c.tx = c.fx; c.ty = c.fy; }
      if (!moved) break;
    }
  }

  public boolean night () { return resting || hour >= BEDTIME || hour < MORNING; }
  public boolean dusk () { return hour >= DUSK && hour < BEDTIME; }

  /** One tick (1/30 s) of the world: sleep and Zzz, particles, then each creature. */
  public void step () {
    tick++;
    Avatar a = avatar;
    if (a != null && a.hop >= 0) {
      a.hop++;
      a.lift = (a.hop < HAPPY_ARC.length ? HAPPY_ARC[a.hop] : 0) * ART;
      if (a.hop > 10) { a.hop = -1; a.lift = 0; }
    }
    for (Creature c : creatures) {
      // a ridden mount never falls asleep
      // resting in the Inn: everyone sleeps, whatever their hours
      boolean sleeper = (resting || scheduleOf(c).sleepy(hour, winter, moon, wet(), tick, c.breathAt * 37)) && c.rider == null;
      if (sleeper && !c.asleep && c.st == St.IDLE) { c.asleep = true; c.leg = 0; }
      if (!sleeper && c.asleep) c.asleep = false;
      if (c.isAsleep() && c.st == St.IDLE && (tick + c.breathAt * 7) % 48 == 0) {
        double[] p = c.headPoint();
        particles.add(new Particle(ZED, p[0] + 6 * ART, p[1] + 4 * ART, 40, null));
      }
      // its light's turn to give off a particle (embers, a blink), at its own phase (runner.ts glowFx)
      StableNature.Glow gl = glowing(c);
      if (gl != null && !gl.fx.isEmpty() && gl.every > 0) {
        int k = tick + c.breathAt * 3;
        if (k % gl.every == 0) emitFrom(c, gl.fx.get(k / gl.every % gl.fx.size()));
      }
    }
    // the still picture's perches for who is awake now; in motion, back down
    settle();
    for (Particle p : particles) {
      p.t++;
      if (p.kind == HEART || p.kind == TINY) { if (p.t % 4 == 0) p.y -= ART; }
      else if (p.kind == ZED && p.t % 8 == 0) { p.y -= ART; if (p.t % 16 == 0) p.x += ART; }
      else if (p.kind == LOOK) {
        StableNature.Look l = looks.get(p.look);
        if (l != null) for (int[] m : l.move) {
          if (p.t < m[3] || p.t >= m[4] || p.t % m[0] != 0) continue;
          p.x += m[1] * p.side * ART; p.y += m[2] * ART;
        }
      }
    }
    age();
    for (Moment m : new ArrayList<>(moments)) moment(m);
    play();
    fireflies();
    for (Creature c : creatures) c.update();
  }

  /** The still picture's clock: particles live out their life where they appeared, nothing moves. */
  public void stillTick () {
    for (Particle p : particles) p.t++;
    age();
  }

  private void age () {
    for (int i = particles.size() - 1; i >= 0; i--) {
      Particle p = particles.get(i);
      if (p.t < p.life) continue;
      particles.remove(i);
      if (p.owner != null) p.owner.hearts = Math.max(0, p.owner.hearts - 1);
    }
  }

  /* ---- together */

  /** its breathing phase asleep: the lowest of its own and any family, friend or kin asleep against it */
  int breathOf (Creature c) {
    int ph = c.breathAt;
    for (int i = 0; i < c.bonds.size(); i++) {
      if (!snug(c.bondKinds.get(i))) continue;
      Creature o = c.bonds.get(i);
      if (o.isAsleep() && Math.abs(o.fx - c.fx) <= o.half() + c.half() + 12 * ART && Math.abs(o.fy - c.fy) <= 10 * ART) ph = Math.min(ph, o.breathAt);
    }
    return ph;
  }

  /** arrived where it was walking: beside a friend, it turns to face it, and they may greet */
  void arrived (Creature c, boolean planned) {
    Creature m = c.mate;
    c.mate = null;
    // circling: on to the next quarter soon; guarding: facing outward
    if (c.look.orbit != null && c.lap % 5 != 0) c.wait = c.rng.nextInt(6, 16);
    Creature g = m == null && c.look.guard != null ? byId(c.look.guard) : null;
    if (g != null && !"front".equals(c.look.facing)) c.dir = g.fx > c.fx ? -1 : 1;
    if (m == null) { if (!planned) hello(c); return; }
    if (!creatures.contains(m)) return;
    if (!"front".equals(c.look.facing)) c.dir = m.fx > c.fx ? 1 : m.fx < c.fx ? -1 : c.dir;
    if (still || c.busy != null || m.busy != null || c.isAsleep() || m.isAsleep() || m.st != St.IDLE || c.lean != 0 || m.lean != 0) return;
    if (Math.abs(m.fx - c.fx) > m.half() + c.half() + 20 * ART || Math.abs(m.fy - c.fy) > 12 * ART) return;
    String key = c.look.id.compareTo(m.look.id) < 0 ? c.look.id + "|" + m.look.id : m.look.id + "|" + c.look.id;
    Integer last = met.get(key);
    if (last != null && tick - last < GREET_EVERY) return;
    int k = c.bonds.indexOf(m);
    if (k < 0) return;
    String kind = c.bondKinds.get(k);
    met.put(key, tick);
    boolean close = "family".equals(kind) || "friend".equals(kind);
    boolean back = !"aloof".equals(m.look.temper) || rng.chance(0.5);
    boolean nuzzle = close && rng.chance(0.25);
    if (!"front".equals(m.look.facing)) m.face(c.fx > m.fx ? 1 : c.fx < m.fx ? -1 : m.dir);
    m.fill = Math.min(1, m.fill + FILL);
    c.busy = "moment"; m.busy = "moment";
    moments.add(new Moment(c, m, close, back, nuzzle, "family".equals(kind)));
  }

  private boolean away (Creature c) { return !creatures.contains(c) || c.isAsleep() || (c.st != St.IDLE && c.st != St.HAPPY); }
  private static void hop (Creature c) { c.st = St.HAPPY; c.t = 0; c.tx = c.fx; c.ty = c.fy; c.leg = 0; }

  private void moment (Moment m) {
    Creature a = m.a, b = m.b;
    m.t++;
    if (away(a) || away(b)) { endMoment(m); return; }
    for (Creature c : new Creature[] { a, b }) if (c.st == St.IDLE) c.wait = Math.max(c.wait, 2);
    if (m.t == 6) hop(a);
    if (m.t == 10 && m.back) hop(b);
    double[] pa = a.headPoint(), pb = b.headPoint();
    double mx = (pa[0] + pb[0]) / 2, my = Math.min(pa[1], pb[1]) + 2 * ART;
    if (m.close) {
      int at = m.t == 8 ? 0 : m.t == 13 ? 1 : m.t == 18 ? 2 : -1;
      if (at >= 0) particles.add(new Particle(TINY, mx + TINY_AT[at][0] * ART, my + TINY_AT[at][1] * ART, 30, null));
    } else if (m.t == 8) particles.add(new Particle(SPARK, mx, my, 30, null));
    if (m.nuzzle && m.t == 26 && a.st == St.IDLE && b.st == St.IDLE) {
      a.lean = b.x >= a.x ? 1 : -1;
      if (m.family) b.lean = -a.lean;
    }
    if (m.t >= (m.nuzzle ? 56 : 26)) endMoment(m);
  }

  private void endMoment (Moment m) {
    moments.remove(m);
    for (Creature c : new Creature[] { m.a, m.b }) {
      c.busy = null;
      if (m.nuzzle) c.lean = 0;
      if (c.st == St.IDLE) c.wait = c.rng.nextInt(45, 120);
    }
  }

  /** arrived on a walk of its own next to anyone standing about: now and then they turn to each other and sniff hello */
  private void hello (Creature c) {
    if (still || c.greet || c.busy != null || c.look.temper == null) return;
    Creature o = null;
    double bd = Double.POSITIVE_INFINITY;
    for (Creature x : creatures) {
      if (x == c || x.st != St.IDLE || x.isAsleep() || x.busy != null || x.lean != 0) continue;
      if (Math.abs(x.fx - c.fx) > x.half() + c.half() + 12 * ART || Math.abs(x.fy - c.fy) > 8 * ART) continue;
      double d = hypot(x.fx - c.fx, x.fy - c.fy);
      if (d < bd) { bd = d; o = x; }
    }
    if (o == null || !rng.chance(seek(c.look.temper))) return;
    for (Creature[] ab : new Creature[][] { { c, o }, { o, c } }) {
      Creature a = ab[0], b = ab[1];
      a.face(!"front".equals(a.look.facing) && Math.abs(b.fx - a.fx) >= ART ? (b.fx > a.fx ? 1 : -1) : a.dir);
      a.startFidget(SNIFF, 20);
    }
  }

  /** touched: out of any moment, and no longer about to follow or copy anyone */
  void release (Creature c) {
    c.followOf = null; c.copy = 0;
    if (inGame(c)) endGame();
    for (Moment m : new ArrayList<>(moments)) if (m.a == c || m.b == c) {
      moments.remove(m);
      for (Creature o : new Creature[] { m.a, m.b }) { o.busy = null; if (m.nuzzle && o != c) o.lean = 0; }
      if (m.nuzzle) c.lean = 0;
    }
  }

  /** a grown-up sets off: its little ones here follow a moment later, most times */
  private void leadLittleOnes (Creature c) {
    for (Creature p : creatures) {
      if (p == c || p.look.mount || p.st != St.IDLE || p.isAsleep() || p.busy != null || p.followOf != null) continue;
      if (!c.familyOf(p) || Math.abs(p.fx - c.fx) >= 90 * ART) continue;
      if (rng.chance(FOLLOW * (1 - p.fill))) { p.followOf = c; p.followIn = rng.nextInt(6, 12); }
    }
  }

  /** the player's current pet comes along when the mount the player rides sets off (or is climbed on); on a walk of its own, as soon as it gets there */
  private void leadYours (Creature c) {
    Creature p = yours;
    if (p == null || p == c || p.look.mount || (p.st != St.IDLE && p.st != St.MOVE && p.st != St.TURN) || p.isAsleep() || p.busy != null || p.followOf != null) return;
    p.followOf = c; p.followIn = rng.nextInt(6, 12);
  }

  /** a little one walks to just behind where its grown-up is heading */
  void trail (Creature p, Creature lead) {
    if (!creatures.contains(lead) || p.busy != null || p.isAsleep()) return;
    int half = p.half();
    double x = clamp(lead.tx - lead.dir * (lead.half() + half + 3 * ART), half, w - half), y = clamp(lead.ty, bandTop, bandBottom);
    if (hypot(x - p.fx, y - p.fy) < ART || !roomAt(p, x, y)) return;
    p.goTo(x, y);
    p.mate = lead;
    p.fill = Math.min(1, p.fill + FILL);
    if (!dusk() && !night()) leadTrain(p);
  }

  /** a creature sets off by day: whoever walks behind it follows a moment later */
  private void leadTrain (Creature c) {
    for (Creature p : creatures) {
      if (!c.look.id.equals(p.look.lead) || p.st != St.IDLE || p.isAsleep() || p.busy != null || p.followOf != null) continue;
      if (rng.chance(FOLLOW * (1 - p.fill))) { p.followOf = c; p.followIn = rng.nextInt(6, 12); }
    }
  }

  /** the middle of these creatures here, or null when none is */
  private double[] middle (String[] ids) {
    double x = 0, y = 0;
    int n = 0;
    for (String id : ids) { Creature o = byId(id); if (o != null) { x += o.fx; y += o.fy; n++; } }
    return n > 0 ? new double[] { x / n, y / n } : null;
  }

  /** by day, a signature pair's walk: keeping near the egg, circling the treeling, herding, a stray sheep's way back,
   * meeting at the pond or the flowers ({x, y} and the mate in mateOut[0]); null: none now. (The app's boss isn't here.) */
  private double[] signature (Creature c, Creature[] mateOut, double keen) {
    // each only now and then, the less the more company it has had lately (keen, wander)
    Creature guard = c.look.guard != null ? byId(c.look.guard) : null;
    if (guard != null && rng.chance(0.7 * keen)) {
      double r = guard.half() + c.half() + 20 * ART;
      return new double[] { guard.tx + (rng.next() - 0.5) * 2 * r, guard.ty + (rng.next() - 0.5) * 16 * ART };
    }
    Creature orbit = c.look.orbit != null ? byId(c.look.orbit) : null;
    if (orbit != null && rng.chance(0.6 * keen)) {
      int lap = c.lap++ % 5;
      if (lap == 4) { mateOut[0] = orbit; return beside(c, orbit, c.fx < orbit.tx ? -1 : 1, 2); }
      double r = orbit.half() + c.half() + 8 * ART, a = lap * Math.PI / 2;
      return new double[] { orbit.tx + StrictMath.cos(a) * r, orbit.ty + StrictMath.sin(a) * r * 0.5 };
    }
    double[] flock = c.look.flock.length > 0 ? middle(c.look.flock) : null;
    if (flock != null && rng.chance(0.5 * keen)) {
      double r = 30 * ART + c.half(), a = rng.next() * Math.PI * 2;
      return new double[] { flock[0] + StrictMath.cos(a) * r, flock[1] + StrictMath.sin(a) * r * 0.5 };
    }
    double[] fold = c.look.fold.length > 0 ? middle(c.look.fold) : null;
    if (fold != null && hypot(fold[0] - c.fx, fold[1] - c.fy) > 40 * ART && rng.chance(0.7 * keen)) return fold;
    double[] spot = c.look.meet != null ? meetAt(c.look.meet) : null;
    if (spot != null && rng.chance(0.3 * keen)) {
      // around the pond's edge, over the flowers (unless a crowd is there already)
      double ring = "pond".equals(c.look.meet) ? (18 + rng.next() * 6) * ART * (rng.chance(0.5) ? 1 : -1) : (rng.next() - 0.5) * 12 * ART;
      double[] goal = { spot[0] + ring, spot[1] + (rng.next() - 0.5) * 6 * ART };
      if (!crowded(c, goal[0], goal[1])) return goal;
    }
    return null;
  }

  /** at dusk, beside a family member, friend or kin already heading to (or lying) by the door */
  private Creature nightMate (Creature c, double[] home) {
    for (int i = 0; i < c.bonds.size(); i++) {
      if (!snug(c.bondKinds.get(i))) continue;
      Creature o = c.bonds.get(i);
      if (Math.abs(o.tx - home[0]) <= 30 * ART && Math.abs(o.ty - home[1]) <= 14 * ART) return o;
    }
    return null;
  }

  /* ---- natures (behaviours/runner.ts) */

  StableNature scheduleOf (Creature c) { return c.nature != null ? c.nature : c.look.nocturnal ? StableNature.OWL : StableNature.DAY; }

  /** a rest of `ticks`, stretched by its pace */
  int rested (Creature c, int ticks) { return c.nature != null ? (int) Math.round(ticks * c.nature.paceNow(hour, winter, moon, wet())[1]) : ticks; }

  /** the scene's places of a kind (the door is the stable's) */
  List<StableNature.Spot> spots (String kind) {
    List<StableNature.Spot> out = new ArrayList<>();
    if ("door".equals(kind)) { if (door != null) out.add(new StableNature.Spot(kind, door[0], door[1], 40 * ART, 0, false, false)); return out; }
    for (StableNature.Spot s : spots) if (s.kind.equals(kind)) out.add(s);
    return out;
  }

  /** where creatures meet their own kind: the pond a Daily streak grows, or the newest flower patch (the last) */
  double[] meetAt (String kind) {
    StableNature.Spot out = null;
    for (StableNature.Spot s : spots) if ("pond".equals(kind) ? s.pond : s.kind.equals("flowers")) { out = s; if ("pond".equals(kind)) break; }
    return out != null ? new double[] { out.x, out.y } : null;
  }

  /** creatures doing an act, or walking to one (the pacing guard counts them) */
  int acting () {
    int k = 0;
    for (Creature c : creatures) if (c.st == St.ACT || c.plan != null) k++;
    return k;
  }

  /** what a wander turns into: an act now (goal null), an act at a place, a favourite place */
  static final class Choice {
    final StableNature.Act act;
    final double[] goal;
    Choice (StableNature.Act act, double[] goal) { this.act = act; this.goal = goal; }
  }

  Choice choose (Creature c) {
    StableNature n = c.nature;
    List<StableNature.Act> ok = new ArrayList<>();
    // ridden, nothing that sinks or cuts it: the avatar would be left floating
    boolean wet = wet();
    for (StableNature.Act a : n.acts) if (a.when.holds(hour, winter, moon, wet) && (a.at == null || !places(c, a.at).isEmpty()) && !(c.rider != null && a.sinks)) ok.add(a);
    if (!ok.isEmpty() && acting() < busyMax(creatures.size()) && c.rng.chance(GUARD)) {
      double sum = 0;
      for (StableNature.Act a : ok) sum += a.p;
      double r = c.rng.next() * sum;
      StableNature.Act act = ok.get(ok.size() - 1);
      for (StableNature.Act a : ok) { if (r < a.p) { act = a; break; } r -= a.p; }
      return new Choice(act, act.at != null ? spotGoal(c, act.at) : null);
    }
    for (StableNature.Like l : n.likes) {
      if (!l.when.holds(hour, winter, moon, wet) || places(c, l.at).isEmpty() || !c.rng.chance(l.p)) continue;
      // a favourite place, unless a crowd is there already
      double[] goal = spotGoal(c, l.at);
      if (!crowded(c, goal[0], goal[1])) return new Choice(null, goal);
    }
    return null;
  }

  /** somewhere in a place of this kind; in the lake or the sea a few art pixels out from the shore, with a third
   * number 1: the walk may leave the walking ground to get there */
  private double[] spotGoal (Creature c, String kind) {
    List<StableNature.Spot> ss = places(c, kind);
    StableNature.Spot s = ss.get((int) Math.floor(c.rng.next() * ss.size()));
    double x = s.x + (c.rng.next() - 0.5) * s.w * 0.6;
    return s.strip ? new double[] { x, s.y + s.h / 2 - (2 + c.rng.nextInt(0, 3)) * ART, 1 } : new double[] { x, s.y };
  }

  /* ---- water (runner.ts, package W): wading, swimming, diving */

  static final double WADE = 0.3;
  static final int ROOM = 6;

  /** the pond and the pools freeze in winter; the lake and the sea never do */
  static boolean open (StableNature.Spot s, boolean winter) { return s.strip || !winter; }

  /** the scene has open water (When.water) */
  boolean wet () {
    for (StableNature.Spot s : spots) if (s.kind.equals("water") && open(s, winter)) return true;
    return false;
  }

  /** the places of a kind it can use: open water it fits in with room to spare, a mount only in the lake or the sea */
  List<StableNature.Spot> places (Creature c, String kind) {
    List<StableNature.Spot> ss = spots(kind);
    if (!"water".equals(kind)) return ss;
    double wide = 2 * c.half() + ROOM * ART;
    List<StableNature.Spot> out = new ArrayList<>();
    for (StableNature.Spot s : ss) if (open(s, winter) && s.w >= wide && (s.strip || !c.look.mount)) out.add(s);
    return out;
  }

  static boolean inside (StableNature.Spot s, double x, double y) {
    double hw = s.w / 2, hh = s.h / 2;
    if (s.strip) return Math.abs(x - s.x) <= hw && Math.abs(y - s.y) <= hh;
    double u = (x - s.x) / hw, v = (y - s.y) / hh;
    return u * u + v * v <= 1;
  }

  StableNature.Spot waterAt (Creature c) {
    for (StableNature.Spot s : spots) if (s.kind.equals("water") && open(s, winter) && inside(s, c.fx, c.fy)) return s;
    return null;
  }

  static double reach (StableNature.Spot s, double y, double half) {
    double hw = s.w / 2, v = (y - s.y) / (s.h / 2);
    return (s.strip ? hw : hw * Math.sqrt(Math.max(0, 1 - v * v))) - half;
  }

  boolean canAct (Creature c, StableNature.Act a) { return !"water".equals(a.at) || waterAt(c) != null; }

  void wade (Creature c) {
    // perched only ever in the still picture (settle), which never steps
    if (c.act != null || c.busy != null || c.perched != null) return;
    boolean wet = c.base == 0 && c.rider == null && waterAt(c) != null;
    if (wet) { c.off = -Math.round(c.look.h * WADE / ART) * ART; c.clip = c.y + 1; c.wet = true; }
    else if (c.wet) { c.wet = false; c.off = 0; c.clip = Double.NaN; }
  }

  private void swim (Creature c, double glide) {
    StableNature.Spot s = waterAt(c);
    if (s == null) return;
    double lim = reach(s, c.fy, c.half()), nx = c.fx + c.dir * glide * ART / 30;
    if (Math.abs(nx - s.x) > lim && (nx - s.x) * c.dir > 0) { c.dir = -c.dir; return; }
    c.setPos(nx, c.fy);
  }

  private void surface (Creature c) {
    StableNature.Spot s = waterAt(c);
    if (s == null) return;
    double lim = reach(s, c.fy, c.half());
    if (lim > 0) c.setPos(s.x + (c.rng.next() * 2 - 1) * lim, c.fy);
    c.dir = c.rng.chance(0.5) ? 1 : -1;
  }

  private static int ticksOf (Creature c, StableNature.Pose p) { return p.range ? c.rng.nextInt(p.lo, p.hi) : p.lo; }

  void startAct (Creature c, StableNature.Act a) {
    c.plan = null;
    c.st = St.ACT; c.t = 0; c.busy = "act";
    ActRun r = new ActRun(a);
    r.loops = a.loops != null ? c.rng.nextInt(a.loops[0], a.loops[1]) : 1;
    c.act = r;
    r.n = ticksOf(c, a.script.get(0));
  }

  /** one tick of an act: the pose's start (turn, particles, waking), its shape, then on to the next */
  void stepAct (Creature c) {
    ActRun r = c.act;
    StableNature.Pose p = r.a.script.get(r.i);
    if (Double.isNaN(r.top)) {
      // an act that goes up its place, when it didn't get to one (crowded there), isn't played
      r.top = goesUp(r.a) ? placeTop(c, r.a.at) : 0;
      if (r.top < 0) { quitAct(c); c.idle(rested(c, c.rng.nextInt(REST_LO, REST_HI))); return; }
    }
    if (r.t == 0) {
      if (p.inward) c.dir = c.x < w / 2.0 ? 1 : -1;
      if (p.elsewhere) surface(c);
      if (p.turn) c.dir = -c.dir;
      for (StableNature.Emit e : p.fx) emitFrom(c, e);
      if (p.wake != 0) wakeNear(c, p.wake);
      if (p.look != 0) lookAt(c, p.look);
    }
    if (p.glide != 0) swim(c, p.glide);
    double k = p.perch;
    c.lift = c.base * (1 - k) + p.lift * ART;
    c.off = -p.sink * ART;
    if (k != 0) {
      c.off += k * r.top;
      if (c.off + c.lift < 0) c.lift = -c.off;
    }
    if (p.soar != 0) c.off += p.soar * (c.y - bandTop / 2);
    c.clip = !Double.isNaN(p.cut) || p.sink != 0 ? c.y + 1 - (Double.isNaN(p.cut) ? 0 : p.cut) * ART : Double.NaN;
    if (!Double.isNaN(p.depth)) { c.off = -Math.round(c.look.h * p.depth / ART) * ART; c.clip = c.y + 1; }
    c.sq = p.sq; c.dx = p.dx + p.fwd * c.dir; c.leg = p.leg;
    c.rot = p.rot;
    if (p.go != 0) {
      int half = c.half();
      c.setPos(Math.max(half, Math.min(w - half, c.fx + c.dir * p.go * ART)), c.fy);
      c.tx = c.fx; c.ty = c.fy;
    }
    if (++r.t < r.n) return;
    r.t = 0;
    if (++r.i >= r.a.script.size()) {
      if (--r.loops <= 0) {
        StableNature.Act a = r.a;
        quitAct(c);
        c.idle(rested(c, a.rest != null ? c.rng.nextInt(a.rest[0], a.rest[1]) : c.rng.nextInt(REST_LO, REST_HI)));
        return;
      }
      r.i = 0;
    }
    r.n = ticksOf(c, r.a.script.get(r.i));
  }

  /** an act that goes up its place (P4: a perch) */
  static boolean goesUp (StableNature.Act a) {
    for (StableNature.Pose q : a.script) if (q.perch != 0) return true;
    return false;
  }

  /** P4: how far above its feet the top of the place it is at stands: the nearest of that kind across, when it
   * stands within it, else -1 (runner.ts placeTop) */
  double placeTop (Creature c, String kind) {
    if (kind == null) return -1;
    StableNature.Spot best = null;
    for (StableNature.Spot s : spots(kind)) if (best == null || Math.abs(s.x - c.x) < Math.abs(best.x - c.x)) best = s;
    if (best == null || Math.abs(best.x - c.x) > best.w / 2 + 2 * ART) return -1;
    return Math.max(0, c.y - (best.y - best.h));
  }

  /** The pose an act holds longest at its highest point over its place (P4: a perch, a soar), for the still picture
   * (settle): not one swooping away from it (fwd) or hanging below it on a thread (lift < 0); null when it never
   * goes up (runner.ts topPose). */
  static StableNature.Pose topPose (StableNature.Act a) {
    StableNature.Pose out = null;
    double hi = 0;
    int len = 0;
    for (StableNature.Pose p : a.script) {
      double up = p.perch != 0 ? p.perch : p.soar;
      int n = p.range ? p.hi : p.lo;
      if (up <= 0 || p.fwd != 0 || p.lift < 0) continue;
      if (up > hi || (up == hi && n > len)) { out = p; hi = up; len = n; }
    }
    return out;
  }

  /** one place, told apart from the rest of its kind */
  static String spotKey (StableNature.Spot s) { return s.kind + ":" + s.x + ":" + s.y; }

  /** Everyone up at a place back down where they stood. */
  private void unperch () {
    for (Creature c : creatures) {
      Perch p = c.perched;
      if (p == null) continue;
      c.perched = null; c.off = 0;
      c.setPos(p.fx, p.fy); c.tx = c.fx; c.ty = c.fy;
    }
  }

  /**
   * The still picture (animations off, Battery Saver) shows a creature whose act goes up (P4) up there whenever
   * that act may happen now, in the pose it holds longest at the top (topPose): on a crown or the ridge, in a crown,
   * hanging, on the flowers, high in the sky (beside anyone up there rather than over them). Each goes to the free
   * place nearest where it stands, one to a place, in the herd's order; none is free, it stays on the ground.
   * Nothing random, so the same meadow always makes the same picture. Asleep, ridden or busy: on the ground. In
   * motion everyone is back where they stood (creatures.ts Herd.settle). Call it again after the hour changes.
   */
  public void settle () {
    unperch();
    if (!still) return;
    boolean wet = wet();
    java.util.Set<String> taken = new java.util.HashSet<>();
    List<Creature> soarers = new ArrayList<>();
    List<StableNature.Pose> soars = new ArrayList<>();
    for (Creature c : creatures) {
      if (c.nature == null || (c.st != St.IDLE && c.st != St.MOVE && c.st != St.TURN) || c.act != null || c.busy != null || c.rider != null || c.isAsleep()) continue;
      StableNature.Spot at = null;
      StableNature.Pose pose = null, soar = null;
      for (StableNature.Act a : c.nature.acts) {
        if (!a.when.holds(hour, winter, moon, wet)) continue;
        StableNature.Pose p = topPose(a);
        if (p == null) continue;
        if (a.at == null) { if (p.soar != 0 && soar == null) soar = p; continue; }
        for (StableNature.Spot s : places(c, a.at)) {
          if (taken.contains(spotKey(s)) || (at != null && Math.abs(s.x - c.fx) >= Math.abs(at.x - c.fx))) continue;
          at = s; pose = p;
        }
      }
      if (at != null) {
        taken.add(spotKey(at));
        int half = c.half();
        c.perched = new Perch(c.fx, c.fy, pose);
        // where it would walk to for it (on the walking ground under a horizon tree or the roof), as high up as there
        c.setPos(clamp(at.x, half, w - half), clamp(at.y, bandTop, bandBottom)); c.tx = c.fx; c.ty = c.fy;
        c.off = pose.perch * Math.max(0, c.y - (at.y - at.h));
      } else if (soar != null) { soarers.add(c); soars.add(soar); }
    }
    // high in the sky where it stands, or beside whoever is up a tree or another flyer there, not on their heads
    List<Creature> up = new ArrayList<>();
    for (Creature c : creatures) if (c.perched != null) up.add(c);
    for (int i = 0; i < soarers.size(); i++) {
      Creature c = soarers.get(i);
      StableNature.Pose pose = soars.get(i);
      int half = c.half();
      double x = c.fx;
      if (!clear(up, x, half)) {
        for (Creature o : up) {
          for (double v : new double[] { o.x - o.half() - half - ART, o.x + o.half() + half + ART }) {
            if (v < half || v > w - half || !clear(up, v, half)) continue;
            if (x == c.fx || Math.abs(v - c.fx) < Math.abs(x - c.fx)) x = v;
          }
        }
      }
      c.perched = new Perch(c.fx, c.fy, pose);
      c.setPos(x, c.fy); c.tx = c.fx; c.ty = c.fy;
      c.off = pose.soar * (c.y - bandTop / 2);
      up.add(c);
    }
  }

  /** nobody up there is in the way of a picture this wide across x */
  private static boolean clear (List<Creature> up, double x, int half) {
    for (Creature o : up) if (Math.abs(o.x - x) < o.half() + half) return false;
    return true;
  }

  /** out of its act: back to its own height, uncut */
  static void quitAct (Creature c) {
    if (c.act == null) return;
    c.act = null; c.off = 0; c.clip = Double.NaN; c.dx = 0;
    if ("act".equals(c.busy)) c.busy = null;
  }

  /** a pose's particle, from where it stands (runner.ts emitPoint) */
  void emitFrom (Creature c, StableNature.Emit e) {
    int d = c.dir;
    double x = c.x, y = c.y;
    if ("head".equals(e.at)) y = c.y - (c.look.h - 1) - snap(c.lift) - snap(c.off);
    else if ("front".equals(e.at)) x = c.x + d * c.half();
    else if ("back".equals(e.at)) x = c.x - d * c.half();
    else if ("nose".equals(e.at)) { x = c.x + d * c.half(); y = c.y - (c.look.h - 1) - snap(c.lift) - snap(c.off) + snap(c.look.h / 4.0); }
    particles.add(new Particle(LOOK, x + d * e.x * ART, y + e.y * ART, e.life, null, e.kind, d * e.side));
  }

  /** a crow: sleepers within r art pixels wake for a while */
  void wakeNear (Creature c, double r) {
    for (Creature o : creatures) {
      if (o != c && o.asleep && Math.abs(o.fx - c.fx) <= r * ART && Math.abs(o.fy - c.fy) <= r * ART) o.wake = Math.max(o.wake, WOKEN);
    }
  }

  /** a howl: idle creatures within r art pixels turn to face it */
  void lookAt (Creature c, double r) {
    for (Creature o : creatures) {
      if (o == c || o.st != St.IDLE || o.isAsleep() || o.busy != null || o.lean != 0 || "front".equals(o.look.facing)) continue;
      double dx = c.fx - o.fx;
      if (Math.abs(dx) <= r * ART && Math.abs(c.fy - o.fy) <= r * ART && Math.abs(dx) > ART) o.face(dx > 0 ? 1 : -1);
    }
  }

  /** its light now, if it gives one off */
  StableNature.Glow glowing (Creature c) { return c.nature != null && c.nature.glow != null && c.nature.glow.when.holds(hour, winter, moon, wet()) ? c.nature.glow : null; }

  /** The lights some give off (runner.ts drawGlow): pools of art pixels on the ground around their feet, drawn
   * before anyone stands on them. */
  public void drawGlows (Paint g) {
    for (Creature c : creatures) {
      StableNature.Glow gl = glowing(c);
      if (gl == null || gl.r <= 0 || gl.cols == null) continue;
      int R = gl.r, Ry = Math.max(1, (int) Math.round(R / 3.0));
      int f = gl.flicker && !still ? Math.floorMod(Math.floorDiv(tick + c.breathAt, 8), 2) : 0, all = R * R * Ry * Ry;
      for (int j = -Ry; j <= Ry; j++) {
        for (int i = -R; i <= R; i++) {
          int e = i * i * Ry * Ry + j * j * R * R;
          if (e > all) continue;
          boolean inner = 4 * e <= all;
          if (inner ? Math.floorMod(i + j + f, 2) != 0 : Math.floorMod(i + 2 * j + f, 4) != 0) continue;
          g.rect(gl.cols[inner ? 0 : 1], (int) c.x + i * ART, (int) c.y + 1 + j * ART, ART, ART);
        }
      }
    }
  }

  /** a night creature's watch: the nearest sleeper it isn't already sitting beside */
  private Creature sleeperNear (Creature c) {
    Creature best = null;
    double bd = Double.POSITIVE_INFINITY;
    for (Creature o : creatures) {
      if (o == c || !o.isAsleep()) continue;
      double d = hypot(o.fx - c.fx, o.fy - c.fy);
      if (d < bd) { bd = d; best = o; }
    }
    if (best != null && Math.abs(best.fx - c.fx) <= best.half() + c.half() + 10 * ART && Math.abs(best.fy - c.fy) <= 8 * ART) return null;
    return best;
  }

  /** in the snow, the creature nearest to it already heading to (or lying) by the door, to huddle against */
  private Creature huddle (Creature c, double[] home) {
    Creature best = null;
    double bd = Double.POSITIVE_INFINITY;
    for (Creature o : creatures) {
      if (o == c || Math.abs(o.tx - home[0]) > 30 * ART || Math.abs(o.ty - home[1]) > 14 * ART) continue;
      double d = hypot(o.tx - c.fx, o.ty - c.fy);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** the Dragon the others sleep round on snowy nights (with its flame): the first not ridden */
  private Creature hearth () {
    for (Creature o : creatures) if (o.rider == null && o.nature != null && o.nature.traits.contains("flame")) return o;
    return null;
  }

  /** its place in the ring round the Dragon: everyone who settles there evenly round it, in the herd's order */
  private double[] ringSpot (Creature c, Creature d) {
    List<Creature> ring = new ArrayList<>();
    for (Creature o : creatures) if (o != d && o.look.temper != null && !o.look.cold) ring.add(o);
    double a = 2 * Math.PI * ring.indexOf(c) / ring.size(), r = d.half() + c.half() + 2 * ART;
    return new double[] { d.tx + StrictMath.cos(a) * r, d.ty + StrictMath.sin(a) * 12 * ART };
  }

  /** the line home at dusk: the largest mount leads (no mount: whoever has most bonds); the one it walks behind */
  private Creature ahead (Creature c) {
    List<Creature> line = new ArrayList<>();
    for (Creature o : creatures) if (o.look.temper != null) line.add(o);
    Creature lead = null;
    int size = -2;
    for (Creature o : line) {
      int s = o.look.mount ? o.look.w * o.look.h : -1;
      if (s > size) { size = s; lead = o; }
    }
    if (lead != null && !lead.look.mount) for (Creature o : line) if (o.bonds.size() > lead.bonds.size()) lead = o;
    if (lead == null || lead == c) return null;
    List<Creature> order = new ArrayList<>();
    order.add(lead);
    for (Creature o : line) if (o != lead) order.add(o);
    int i = order.indexOf(c);
    return i > 0 ? order.get(i - 1) : null;
  }

  /** beside another, gap art pixels from its edge on this side, where it stands or is heading */
  private double[] beside (Creature c, Creature o, int side, int gap) {
    return new double[] { o.tx + side * (o.half() + c.half() + gap * ART), o.ty };
  }

  void wander (Creature c) {
    int half = c.half();
    StableNature n = c.nature;
    c.followOf = null;
    // a pet rock: never on its own
    if (n != null && n.still) { c.wait = rested(c, c.rng.nextInt(REST_LO, REST_HI)); return; }
    // company ebbs; in a crowd, none at all
    c.fill *= KEEP;
    double keen = crowded(c, c.fx, c.fy) ? 0 : 1 - c.fill;
    boolean social = false;
    double[] goal = null;
    Creature mate = null;
    boolean greet = false;
    Avatar av = avatar;
    StableNature.Act plan = null;
    boolean far = false;
    Choice pick = null;
    boolean dusk = dusk(), night = night(), snow = "snow".equals(weather);
    String temper = c.look.temper;
    double[] home = resting || scheduleOf(c).homeward(hour) ? door : null;
    Creature guard = home != null && c.look.guard != null ? byId(c.look.guard) : null;
    // a snowy evening with a Dragon here: it stays where it is, warm (by its egg, if it has one), and the rest settle
    // in a ring round it
    Creature hearth = home != null && snow ? hearth() : null;
    if (hearth == c && guard == null) { c.wait = rested(c, c.rng.nextInt(REST_LO, REST_HI)); return; }
    Creature watch = guard == null && night && temper != null && c.nocturnal() ? sleeperNear(c) : null;
    Creature ring = guard == null && watch == null && hearth != null && hearth != c && temper != null && !c.look.cold ? hearth : null;
    Creature snug = guard == null && watch == null && ring == null && home != null && temper != null ? nightMate(c, home) : null;
    Creature huddle = guard == null && watch == null && ring == null && snug == null && home != null && snow && temper != null && !c.look.cold ? huddle(c, home) : null;
    Creature ahead = guard == null && watch == null && ring == null && snug == null && huddle == null && home != null && dusk && !snow && temper != null ? ahead(c) : null;
    if (guard != null) {
      // a dragon sleeps right beside its egg
      goal = beside(c, guard, c.fx < guard.tx ? -1 : 1, 2);
      mate = guard;
    } else if (watch != null && rng.chance(0.6)) {
      goal = beside(c, watch, c.fx < watch.fx ? -1 : 1, 4);
      mate = watch;
    } else if (ring != null) {
      goal = ringSpot(c, ring);
      mate = ring;
    } else if (snug != null && lying(c, snug, 12)) {
      // already lying beside it by the door: it stays
      c.wait = rested(c, c.rng.nextInt(REST_LO, REST_HI)); return;
    } else if (snug != null && rng.chance(0.7)) {
      goal = beside(c, snug, rng.chance(0.5) ? 1 : -1, 3);
    } else if (huddle != null && huddled(c, home)) {
      // already huddled up against someone: it stays
      c.wait = rested(c, c.rng.nextInt(REST_LO, REST_HI)); return;
    } else if (huddle != null && rng.chance(0.8)) {
      goal = beside(c, huddle, c.fx < huddle.tx ? -1 : 1, 1);
    } else if (ahead != null && Math.abs(ahead.tx - home[0]) <= 60 * ART && Math.abs(ahead.ty - home[1]) <= 20 * ART && rng.chance(0.6)) {
      goal = beside(c, ahead, -ahead.dir, 3);
    } else if (home != null) goal = new double[] { home[0] + (rng.next() - 0.5) * 40 * ART, home[1] + rng.next() * 10 * ART };
    else if (av != null && !crowded(c, av.x, av.y) && rng.chance(GREET * keen)) {
      // over to say hello to the avatar (not when a crowd is there already)
      int side = rng.chance(0.5) ? 1 : -1;
      goal = new double[] { av.x + side * (half + AV_HALF + ART), av.y + (rng.next() - 0.5) * 6 * ART };
      greet = true; social = true;
    } else if (n != null && (pick = choose(c)) != null) {
      // its nature: an act here and now, or a place to go (for an act there, or because it likes it)
      if (pick.goal == null) { startAct(c, pick.act); return; }
      goal = pick.goal; plan = pick.act; far = true;
    } else if (temper != null) {
      if (pounceOn(c) || tag(c)) return;
      double sk = seek(temper);
      Creature[] sigMate = new Creature[1];
      double[] sig = signature(c, sigMate, keen);
      if (sig != null) { goal = sig; mate = sigMate[0]; social = true; }
      else if (snow && !c.look.cold && creatures.size() > 1 && rng.chance(0.15 * keen)) {
        // a cold day: up against anyone at all for warmth
        List<Creature> others = new ArrayList<>();
        for (Creature o : creatures) if (o != c) others.add(o);
        Creature o = others.get((int) Math.floor(rng.next() * others.size()));
        goal = beside(c, o, c.fx < o.tx ? -1 : 1, 1); social = true;
      } else if (rng.chance((c.look.mount ? sk / 2 : sk) * keen)) {
        if (!c.bonds.isEmpty()) {
          // elders (Veterans) draw three times as strongly
          int sum = 0;
          for (int i = 0; i < c.bonds.size(); i++) sum += pull(c.bondKinds.get(i)) * (c.bonds.get(i).look.elder ? 3 : 1);
          double r = rng.next() * sum;
          Creature f = c.bonds.get(c.bonds.size() - 1);
          for (int i = 0; i < c.bonds.size(); i++) { int k = pull(c.bondKinds.get(i)) * (c.bonds.get(i).look.elder ? 3 : 1); if (r < k) { f = c.bonds.get(i); break; } r -= k; }
          int side = rng.chance(0.5) ? 1 : -1;
          // not into a crowd round it
          if (!crowded(c, f.fx, f.fy)) {
            goal = new double[] { f.fx + side * (f.half() + half + gap(temper) * ART), f.fy + (rng.next() - 0.5) * 6 * ART };
            mate = f; social = true;
          }
        }
      }
    }
    else if (!c.look.mount && rng.chance(0.4 * keen)) {
      List<Creature> friends = new ArrayList<>();
      for (Creature o : creatures) if (o != c && o.look.species.equals(c.look.species)) friends.add(o);
      if (!friends.isEmpty()) {
        Creature f = friends.get((int) Math.floor(rng.next() * friends.size()));
        int side = rng.chance(0.5) ? 1 : -1;
        goal = new double[] { f.fx + side * (f.half() + half + APART), f.fy + (rng.next() - 0.5) * 6 * ART };
        social = true;
      }
    }
    if (social) c.fill = Math.min(1, c.fill + FILL);
    // a walk of its own may be a sprint, with its own lengths
    StableNature.Sprint sprint = goal == null && n != null && n.sprint != null && c.rng.chance(n.sprint.p) ? n.sprint : null;
    int[] range = sprint != null && sprint.range != null ? sprint.range : n != null ? n.range : null;
    double lo = range != null ? range[0] * ART : WALK_MIN, hi = range != null ? range[1] * ART : WALK_MAX;
    double across = n != null && n.sideways ? 0.15 : 0.5;
    double x = c.fx, y = c.fy, best = -1, bx = x, by = y;
    int found = 0;
    for (int tries = 0; tries < 10; tries++) {
      if (goal != null && tries < 8) {
        double r = tries * 10 * ART, a = rng.next() * Math.PI * 2;
        double gx = goal[0] + StrictMath.cos(a) * r, gy = goal[1] + StrictMath.sin(a) * r * 0.5;
        double dx = gx - c.fx, dy = gy - c.fy, d = hypot(dx, dy);
        // a place it means to reach: all the way
        double go = far ? d : Math.min(d, hi);
        x = d > 0 ? c.fx + dx / d * go : c.fx; y = d > 0 ? c.fy + dy / d * go : c.fy;
      } else {
        double a = rng.next() * Math.PI * 2, dist = lo + rng.next() * (hi - lo);
        x = c.fx + StrictMath.cos(a) * dist; y = c.fy + StrictMath.sin(a) * dist * across;
      }
      // into the lake or the sea: off the walking ground, up to the place it means to reach
      x = clamp(x, half, w - half); y = clamp(y, goal != null && goal.length > 2 ? Math.min(bandTop, goal[1]) : bandTop, bandBottom);
      if (goal != null) {
        // up a tree or onto the roof (P4) it won't stand in anyone's way: straight to its place
        if (roomAt(c, x, y) || (tries == 0 && plan != null && goesUp(plan))) break;
        continue;
      }
      // a walk of its own: the roomiest of three places with room
      if (!roomAt(c, x, y)) continue;
      double o = openness(c, x, y);
      if (o > best) { best = o; bx = x; by = y; }
      if (++found >= 3) break;
    }
    if (goal == null && best >= 0) { x = bx; y = by; }
    if (hypot(x - c.fx, y - c.fy) < ART) {
      // already there: an act it came for starts now
      if (plan != null && canAct(c, plan)) { startAct(c, plan); return; }
      c.wait = rested(c, c.rng.nextInt(REST_LO, REST_HI)); return;
    }
    c.goTo(x, y);
    c.mate = mate; c.plan = plan; c.sprinting = sprint != null; c.greet = greet;
    // P6: a walk may be a roll (never under a rider)
    if (n != null && n.roll != null && c.rng.chance(n.roll.p)) c.rolling = c.rider == null;
    if (c.look.mount && temper != null) leadLittleOnes(c);
    if (c.rider != null) leadYours(c);
    if (home == null) leadTrain(c);
  }

  /* ---- tag */

  boolean inGame (Creature c) { return game != null && (game.it == c || game.run == c); }

  /** a mischief maker, now and then, starts a game of tag with the nearest pet free to play */
  private boolean tag (Creature c) {
    if (game != null || c.look.mount || !"mischief".equals(c.look.temper) || !rng.chance(1.0 / 3)) return false;
    Creature run = null;
    double bd = TAG_RANGE;
    for (Creature o : creatures) {
      if (o == c || o.look.mount || o.st != St.IDLE || o.isAsleep() || o.busy != null || o.followOf != null || o.lean != 0) continue;
      double d = hypot(o.fx - c.fx, o.fy - c.fy);
      if (d < bd) { bd = d; run = o; }
    }
    if (run == null) return false;
    game = new Game(c, run, rng.nextInt(3, 4), false);
    c.busy = "tag"; run.busy = "tag"; c.mate = null; run.mate = null; run.copy = 0;
    round();
    return true;
  }

  /** a cat with yarn about, now and then: it stalks it and pounces, the yarn rolls off a little; two or three goes */
  private boolean pounceOn (Creature c) {
    if (game != null || c.look.pounce == null) return false;
    Creature y = byId(c.look.pounce);
    if (y == null || y.st != St.IDLE || y.isAsleep() || y.busy != null || y.followOf != null || y.lean != 0 || hypot(y.fx - c.fx, y.fy - c.fy) >= POUNCE_RANGE || !rng.chance(0.3)) return false;
    game = new Game(c, y, rng.nextInt(2, 3), true);
    c.busy = "tag"; y.busy = "tag"; c.mate = null; y.mate = null; y.copy = 0;
    round();
    return true;
  }

  /** a round: `it` sets off after `run`, who dodges away */
  private void round () {
    Game g = game;
    g.t = 0;
    g.it.chase(g.run.fx, g.run.fy);
    Creature r = g.run;
    int half = r.half(), s = r.fx >= g.it.fx ? 1 : -1, flee = g.pounce ? POUNCE_ROLL : TAG_FLEE;
    double x = r.fx + s * flee;
    if (x < half || x > w - half) x = r.fx - s * flee;
    r.chase(clamp(x, half, w - half), clamp(r.fy + (rng.next() - 0.5) * 20 * ART, bandTop, bandBottom));
  }

  private boolean gone (Creature c) { return !creatures.contains(c) || c.isAsleep(); }

  /** one tick of the game: the chase, a tag, the breath before they swap; over at dusk */
  private void play () {
    Game g = game;
    if (g == null) return;
    Creature it = g.it, run = g.run;
    if (gone(it) || gone(run) || dusk() || night()) { endGame(); return; }
    if (g.pause > 0) {
      // tag: now the other one is it; a cat goes again
      if (--g.pause == 0) { if (!g.pounce) { g.it = run; g.run = it; } round(); }
      return;
    }
    if (it.st != St.CHASE || run.st != St.CHASE || ++g.t > TAG_ROUND) { endGame(); return; }
    // dodged: it waits, watching
    if (hypot(run.tx - run.fx, run.ty - run.fy) < 1 && !"front".equals(run.look.facing)) run.dir = it.fx > run.fx ? 1 : -1;
    it.tx = run.fx; it.ty = run.fy;
    if (Math.abs(it.fx - run.fx) < it.half() + run.half() - 6 * ART && Math.abs(it.fy - run.fy) < 6 * ART) {
      // tagged: a hop and a sparkle; pounced on: the cat lands with a hop, the yarn just stops
      Creature hop = g.pounce ? it : run;
      if (g.pounce) run.idle(40); else it.idle(40);
      hop.st = St.HAPPY; hop.t = 0; hop.tx = hop.fx; hop.ty = hop.fy; hop.leg = 0;
      double[] p = run.headPoint();
      particles.add(new Particle(SPARK, p[0] + ART, p[1], 30, null));
      if (--g.left <= 0) endGame(); else g.pause = 14;
    }
  }

  private void endGame () {
    Game g = game;
    if (g == null) return;
    game = null;
    for (Creature c : new Creature[] { g.it, g.run }) { c.busy = null; if (c.st == St.CHASE) c.idle(c.rng.nextInt(45, 120)); }
  }

  /** fireflies: every 3 s whoever is idle turns to watch the meadow's middle, and mischief makers jump for one */
  private void fireflies () {
    if (tick % 90 != 0 || !"fireflies".equals(weather) || still) return;
    for (Creature c : creatures) {
      if (c.look.temper == null || c.st != St.IDLE || c.isAsleep() || c.busy != null || c.lean != 0) continue;
      if (!"front".equals(c.look.facing)) c.face(w / 2.0 > c.fx ? 1 : -1);
      if ("mischief".equals(c.look.temper) && !c.look.mount && rng.chance(0.5)) hop(c);
    }
  }

  /**
   * The player's avatar stands by the door with these pictures ({x, y, w, h} from the point under its feet);
   * null or none: it isn't here.
   */
  public void stand (int[][] layers) {
    if (layers == null || layers.length == 0) { avatar = null; return; }
    avatar = new Avatar(layers);
    avatarAt = creatures.size();
    double x, y;
    if (door != null) {
      x = door[0] + 14 * ART;
      if (x > w - AV_HALF - ART) x = door[0] - 14 * ART;
      y = door[1] + 6 * ART;
    } else { x = w * 0.3; y = bandTop + (bandBottom - bandTop) * 0.25; }
    avatar.x = snap(clamp(x, AV_HALF, w - AV_HALF));
    avatar.y = snap(clamp(y, bandTop, bandBottom));
  }

  /** A creature walked over to greet the avatar: if it got there, it turns to it with a heart and the avatar hops. */
  void greeted (Creature c) {
    c.greet = false;
    Avatar a = avatar;
    if (a == null || Math.abs(c.fx - a.x) > c.half() + AV_HALF + 12 * ART || Math.abs(c.fy - a.y) > 10 * ART) return;
    c.dir = a.x > c.fx ? 1 : -1;
    heart(c);
    a.hop = 0;
  }

  private boolean heart (Creature c) {
    if (c.hearts >= 3) return false;
    c.hearts++;
    double[] p = c.headPoint();
    particles.add(new Particle(HEART, p[0] + (c.hearts - 2) * ART, p[1], HEART_LIFE, c));
    return true;
  }

  /** two or more others stand, or are heading, around this point: a crowd it keeps out of (creatures.ts crowded) */
  boolean crowded (Creature c, double x, double y) {
    int k = 0;
    for (Creature o : creatures) {
      if (o == c) continue;
      double r = o.half() + c.half() + 12 * ART;
      if ((Math.abs(o.fx - x) <= r && Math.abs(o.fy - y) <= 10 * ART) || (Math.abs(o.tx - x) <= r && Math.abs(o.ty - y) <= 10 * ART)) k++;
    }
    return k >= 2;
  }

  /** how open a place is (creatures.ts openness) */
  private double openness (Creature c, double x, double y) {
    int half = c.half();
    double near = 60 * ART;
    for (Creature o : creatures) {
      if (o == c) continue;
      near = Math.min(near, Math.min(hypot(o.fx - x, (o.fy - y) * 2), hypot(o.tx - x, (o.ty - y) * 2)));
    }
    return near + Math.min(Math.min(x - half, w - half - x), 40 * ART) + Math.min(Math.min(y - bandTop, bandBottom - y), 12 * ART);
  }

  /** side by side with another standing still, no more than gap art pixels between them (creatures.ts lying) */
  private boolean lying (Creature c, Creature o, int gap) {
    return Math.abs(o.fx - c.fx) <= o.half() + c.half() + gap * ART && Math.abs(o.fy - c.fy) <= 10 * ART && hypot(o.tx - o.fx, o.ty - o.fy) < ART;
  }

  /** up against someone by the door in the snow */
  private boolean huddled (Creature c, double[] home) {
    for (Creature o : creatures) if (o != c && Math.abs(o.tx - home[0]) <= 30 * ART && Math.abs(o.ty - home[1]) <= 14 * ART && lying(c, o, 8)) return true;
    return false;
  }

  private boolean roomAt (Creature c, double x, double y) {
    for (Creature o : creatures) {
      if (o == c) continue;
      double need = o.half() + c.half() - 8 * ART + APART;
      if (!(Math.abs(o.fx - x) >= need || Math.abs(o.fy - y) >= 8 * ART)) return false;
      if (!(Math.abs(o.tx - x) >= need || Math.abs(o.ty - y) >= 8 * ART)) return false;
    }
    return true;
  }

  /** A tap: one happy hop (or its nature's own reaction) and a heart, at most 3 hearts at a time. False when it has 3 already. */
  public boolean pet (Creature c) {
    if (!heart(c)) return false;
    release(c);
    if (c.isAsleep() || c.asleep) c.wake = 50;
    // up on a perch or in the sky (P4): the heart, and it stays up there
    if (!still && !(c.st == St.ACT && c.off > 0)) {
      quitAct(c);
      // its own reaction (Touch.tap) instead of the hop; an empty one, none at all
      StableNature.Act tap = c.nature != null ? c.nature.tap : null;
      c.tx = c.fx; c.ty = c.fy; c.leg = 0;
      if (tap == null) { c.st = St.HAPPY; c.t = 0; } else if (!tap.script.isEmpty()) startAct(c, tap); else if (c.st == St.MOVE || c.st == St.TURN) c.idle(c.rng.nextInt(30, 60));
      // its little ones nearby copy the hop
      if (c.look.mount) {
        for (Creature q : creatures) {
          if (q.look.mount || q.st != St.IDLE || q.isAsleep() || q.busy != null || !c.familyOf(q)) continue;
          if (Math.abs(q.fx - c.fx) < 60 * ART && Math.abs(q.fy - c.fy) < 30 * ART) q.copy = 8;
        }
      }
    }
    return true;
  }

  /**
   * The player's avatar climbs on this mount (and off any other); with null or no pictures, off whoever has a
   * rider. Getting on is a happy hop, no heart.
   */
  public void ride (Creature target, int[][] layers) {
    for (Creature c : creatures) {
      if (c != target || layers == null || layers.length == 0) { c.rider = null; continue; }
      boolean on = c.rider == null;
      c.rider = layers;
      if (on && !still) { c.st = St.HAPPY; c.t = 0; c.tx = c.fx; c.ty = c.fy; c.leg = 0; c.asleep = false; leadYours(c); }
    }
    settle();
  }

  /** Creatures in painter's order: further back (smaller y) first, ties in the order they came. */
  public List<Creature> drawOrder () {
    List<Creature> l = new ArrayList<>(creatures);
    Collections.sort(l, (a, b) -> a.y != b.y ? Long.compare(Math.round(a.y), Math.round(b.y)) : Integer.compare(a.n, b.n));
    return l;
  }

  /** Creatures and the avatar on foot in painter's order (as drawOrder, the avatar after those that came before it). */
  public List<Figure> figures () {
    List<Figure> l = new ArrayList<>(creatures);
    if (avatar != null) l.add(avatar);
    Collections.sort(l, (a, b) -> {
      long ya = Math.round(a.foot()), yb = Math.round(b.foot());
      return ya != yb ? Long.compare(ya, yb) : Integer.compare(order(a), order(b));
    });
    return l;
  }

  private int order (Figure f) { return f instanceof Creature ? 2 * ((Creature) f).n : 2 * avatarAt - 1; }

  private static final String[] HEART_L = { ".##.##.", "#######", "#######", ".#####.", "..###..", "...#..." }, HEART_M = { ".#.#.", "#####", "#####", ".###.", "..#.." },
      HEART_S = { "#.#", "###", ".#." }, ZEDS = { "###", ".#.", "###" }, SPARKS = { ".#.", "###", ".#." };
  public static final int HEART_RGB = 0xFF5C8A, SHINE_RGB = 0xFFD1DE, ZED_RGB = 0xE8ECFF, SPARK_RGB = 0xFFFFFF;

  /** Hearts, small hearts, sparkles and Zzz (particles.ts drawParticle): drawn over everything, leaving with a 2-frame pop. */
  public void drawParticles (Paint g) {
    for (Particle p : particles) {
      int x = (int) snap(p.x), y = (int) snap(p.y);
      boolean pop = p.life - p.t <= 2;
      switch (p.kind) {
        case HEART:
          if (pop) mask(g, HEART_M, x, y + ART, HEART_RGB);
          else { mask(g, HEART_L, x - ART, y, HEART_RGB); g.rect(SHINE_RGB, x, y + ART, ART, ART); }
          break;
        case TINY:
          if (pop) g.rect(HEART_RGB, x + ART, y + ART, ART, ART); else mask(g, HEART_S, x, y, HEART_RGB);
          break;
        case SPARK:
          if (!pop && p.t / 4 % 2 == 0) mask(g, SPARKS, x, y, SPARK_RGB); else g.rect(SPARK_RGB, x + ART, y + ART, ART, ART);
          break;
        case LOOK: {
          // a behaviour's look: its picture for this age (or its pop), sitting on (x, y), mirrored when sent back
          StableNature.Look l = looks.get(p.look);
          if (l == null) break;
          String[] rows = l.rows(p.t, pop);
          boolean flip = l.mirror && p.side < 0;
          int top = y - rows.length * ART;
          for (int r = 0; r < rows.length; r++) {
            String row = rows[r];
            for (int i = 0; i < row.length(); i++) {
              char ch = row.charAt(flip ? row.length() - 1 - i : i);
              if (ch == '.') continue;
              Integer rgb = l.cols.get(ch);
              if (rgb != null) g.rect(rgb, x + i * ART, top + r * ART, ART, ART);
            }
          }
          break;
        }
        default:
          if (pop) g.rect(ZED_RGB, x + ART, y + ART, ART, ART); else mask(g, ZEDS, x, y, ZED_RGB);
      }
    }
  }

  private static void mask (Paint g, String[] m, int x, int y, int rgb) {
    for (int r = 0; r < m.length; r++) for (int i = 0; i < m[r].length(); i++) if (m[r].charAt(i) == '#') g.rect(rgb, x + i * ART, y + r * ART, ART, ART);
  }
}
