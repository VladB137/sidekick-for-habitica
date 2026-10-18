package io.github.critoracle.verdict;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import java.io.BufferedReader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;
import org.junit.Test;

/**
 * The live wallpaper's herd and weather against the app's own (tools/gen-stable-fixtures.ts): every creature's
 * position, pose and state after every tick, and every drawing call, must be the same; in the still picture too
 * (who perches where, still poses), at every hour it is shown.
 */
public class StableHerdTest {
  private static Path fixture (String name) { return Paths.get(System.getProperty("fixtures", "build/fixtures"), name); }

  /** records drawing calls in the fixtures' words */
  private static final class Rec implements StableHerd.Paint {
    final List<String> ops = new ArrayList<>();
    @Override public void cell (int n, boolean head, int sx, int sy, int w, int h, int dx, int dy, boolean flip) {
      ops.add("c " + n + " " + (head ? 1 : 0) + " " + sx + " " + sy + " " + w + " " + h + " " + dx + " " + dy + " " + (flip ? 1 : 0));
    }
    @Override public void rect (int rgb, int x, int y, int w, int h) { ops.add(String.format("r %06X %d %d %d %d", rgb, x, y, w, h)); }
    @Override public void rider (int n, int part, int dx, int dy, boolean flip) { ops.add("p " + n + " " + part + " " + dx + " " + dy + " " + (flip ? 1 : 0)); }
    @Override public void turned (int n, boolean head, int sx, int sy, int w, int h, int dx, int dy, boolean flip, int q) {
      ops.add("t " + n + " " + (head ? 1 : 0) + " " + sx + " " + sy + " " + w + " " + h + " " + dx + " " + dy + " " + (flip ? 1 : 0) + " " + q);
    }
    @Override public void avatar (int part, int dx, int dy) { ops.add("a " + part + " " + dx + " " + dy); }
    String joined () { return String.join(";", ops); }
  }

  private static String state (StableHerd herd) {
    List<String> out = new ArrayList<>();
    for (StableHerd.Creature c : herd.creatures) {
      out.add(c.fx + "," + c.fy + "," + c.lift + "," + c.sq + "," + c.leg + "," + c.dir + "," + c.state() + "," + (c.asleep ? 1 : 0) + "," + c.hearts + "," + c.lean + "," + c.wake + "," + c.off + "," + c.dx);
    }
    return String.join(";", out);
  }

  /** "a,b,c;..." from either side, compared as numbers where they are numbers */
  private static void sameState (String where, String want, String got) {
    String[] w = want.split(";", -1), g = got.split(";", -1);
    assertEquals(where + " creatures", w.length, g.length);
    for (int i = 0; i < w.length; i++) {
      String[] a = w[i].split(","), b = g[i].split(",");
      for (int k = 0; k < a.length; k++) {
        boolean num = k != 6;
        boolean eq = num ? Double.parseDouble(a[k]) == Double.parseDouble(b[k]) : a[k].equals(b[k]);
        if (!eq) throw new AssertionError(where + " creature " + i + " field " + k + ": want " + w[i] + " got " + g[i]);
      }
    }
  }

  @Test
  public void theHerdMovesAndDrawsLikeTheApps () throws Exception {
    int scenarios = 0, ticks = 0, draws = 0, rides = 0, natures = 0, stands = 0, stills = 0;
    try (BufferedReader r = Files.newBufferedReader(fixture("stable-herd.txt"))) {
      String line, name = null;
      StableHerd herd = null;
      List<StableHerd.Look> looks = new ArrayList<>();
      String[] head = null, places = null;
      while ((line = r.readLine()) != null) {
        String[] p = line.split(" ", 2);
        switch (p[0]) {
          case "scenario":
            head = line.split(" ");
            name = head[1];
            looks.clear();
            herd = null;
            places = null;
            break;
          case "look": {
            String[] l = line.split(" ");
            looks.add(new StableHerd.Look(l[1], l[2], "1".equals(l[3]), StableHerd.motionOf("-".equals(l[4]) ? null : l[4]), l[5], "1".equals(l[6]), "1".equals(l[7]),
                Integer.parseInt(l[8]), Integer.parseInt(l[9]), Integer.parseInt(l[10]), Double.parseDouble(l[11]), Double.parseDouble(l[12])));
            if (!"-".equals(l[13])) {
              String[] bs = "-".equals(l[14]) ? new String[0] : l[14].split(",");
              String[] ids = new String[bs.length], kinds = new String[bs.length];
              for (int i = 0; i < bs.length; i++) { String[] kv = bs[i].split("="); ids[i] = kv[0]; kinds[i] = kv[1]; }
              looks.get(looks.size() - 1).social(l[13], ids, kinds);
            }
            looks.get(looks.size() - 1).cold = "1".equals(l[15]);
            looks.get(looks.size() - 1).yours = "1".equals(l[16]);
            if (!"-".equals(l[17])) for (String kv : l[17].split(",")) {
              StableHerd.Look look = looks.get(looks.size() - 1);
              String k = kv.substring(0, kv.indexOf('=')), v = kv.substring(kv.indexOf('=') + 1);
              switch (k) {
                case "lead": look.lead = v; break;
                case "guard": look.guard = v; break;
                case "orbit": look.orbit = v; break;
                case "pounce": look.pounce = v; break;
                case "meet": look.meet = v; break;
                case "elder": look.elder = "1".equals(v); break;
                case "flock": look.flock = v.split("\\|"); break;
                case "fold": look.fold = v.split("\\|"); break;
                default: throw new AssertionError("unknown way " + kv);
              }
            }
            break;
          }
          case "nature": looks.get(looks.size() - 1).nature(StableNature.of(Json.parse(p[1]))); natures++; break;
          case "places": places = line.split(" "); break;
          case "hour":
            if (herd == null) {
              double[] door = "-".equals(head[8]) ? null : new double[] { Double.parseDouble(head[8]), Double.parseDouble(head[9]) };
              herd = new StableHerd(Integer.parseInt(head[2]), head[3], Integer.parseInt(head[4]), Integer.parseInt(head[5]),
                  Integer.parseInt(head[6]), Integer.parseInt(head[7]), door, Integer.parseInt(head[10], 16));
              herd.hour = Double.parseDouble(p[1]);
              if (places != null) {
                herd.winter = "1".equals(places[1]); herd.moon = Integer.parseInt(places[2]);
                herd.spots = StableNature.spots(Json.parse(places[3])); herd.looks = StableNature.looks(Json.parse(places[4]));
              }
              herd.set(looks);
            } else herd.hour = Double.parseDouble(p[1]);
            break;
          case "ride": {
            String[] q = line.split(" ");
            rides++;
            if ("-".equals(q[1])) { herd.ride(null, null); break; }
            String[] parts = q[2].split(";");
            int[][] layers = new int[parts.length][];
            for (int i = 0; i < parts.length; i++) {
              String[] v = parts[i].split(",");
              layers[i] = new int[] { Integer.parseInt(v[0]), Integer.parseInt(v[1]), Integer.parseInt(v[2]), Integer.parseInt(v[3]) };
            }
            herd.ride(herd.creatures.get(Integer.parseInt(q[1])), layers);
            break;
          }
          case "sky": herd.weather = "-".equals(p[1]) ? null : p[1]; break;
          case "stand": {
            stands++;
            if ("-".equals(p[1])) { herd.stand(null); break; }
            String[] parts = p[1].split(";");
            int[][] layers = new int[parts.length][];
            for (int i = 0; i < parts.length; i++) {
              String[] v = parts[i].split(",");
              layers[i] = new int[] { Integer.parseInt(v[0]), Integer.parseInt(v[1]), Integer.parseInt(v[2]), Integer.parseInt(v[3]) };
            }
            herd.stand(layers);
            break;
          }
          case "rest": herd.resting = "1".equals(p[1]); break;
          // the still picture at this hour: settled again, as StableStage does whenever it draws it
          case "still": herd.still = true; herd.hour = Double.parseDouble(p[1]); herd.settle(); stills++; break;
          case "pose": sameState(name + " still at " + herd.hour, p[1], state(herd)); break;
          case "move": herd.still = false; herd.hour = Double.parseDouble(p[1]); break;
          case "pet": herd.pet(herd.creatures.get(Integer.parseInt(p[1]))); break;
          case "tick": {
            String[] t = p[1].split(" ", 2);
            int n = Integer.parseInt(t[0]);
            if (n > 0) herd.step();
            sameState(name + " tick " + n, t[1], state(herd));
            ticks++;
            break;
          }
          case "draw": {
            Rec rec = new Rec();
            herd.drawGlows(rec);
            for (StableHerd.Figure f : herd.figures()) f.draw(rec);
            herd.drawParticles(rec);
            assertEquals(name + " draw at tick " + herd.tick, p.length > 1 ? p[1] : "", rec.joined());
            draws++;
            break;
          }
          case "end": scenarios++; break;
          default: throw new AssertionError("unknown line " + line);
        }
      }
    }
    assertEquals(28, scenarios);
    assertEquals(115, natures);
    assertEquals(12, rides);
    assertEquals(4, stands);
    assertEquals(10, stills);
    assertTrue(ticks > 10000 && draws > 2000);
  }

  @Test
  public void theWeatherFallsLikeTheApps () throws Exception {
    int cases = 0;
    List<String> lines = Files.readAllLines(fixture("stable-weather.txt"));
    StableWeather w = null;
    String[] head = null;
    for (String line : lines) {
      String[] p = line.split(" ", 3);
      if (p[0].equals("weather")) { head = line.split(" "); w = new StableWeather(); continue; }
      if (p[0].equals("end")) { cases++; continue; }
      Rec rec = new Rec();
      w.draw(rec, "null".equals(head[2]) ? null : head[2], Integer.parseInt(head[3]), Integer.parseInt(head[4]), Integer.parseInt(head[5]), Integer.parseInt(head[6]), "1".equals(head[7]), Integer.parseInt(p[1]));
      assertEquals(head[1] + " at " + p[1], p.length > 2 ? p[2] : "", rec.joined());
    }
    assertEquals(7, cases);
  }

  @Test
  public void theCrittersLiveLikeTheApps () throws Exception {
    int cases = 0, showers = 0, drawn = 0, hours = 0, wet = 0, bows = 0;
    int[][] critters = null;
    int[] sky = null, bow = null;
    int rate = 0;
    boolean rainbow = false;
    String name = null;
    for (String line : Files.readAllLines(fixture("stable-ambient.txt"))) {
      String[] p = line.split(" ", 3);
      switch (p[0]) {
        case "life": {
          String[] h = line.split(" ");
          name = h[1]; rate = Integer.parseInt(h[2]); rainbow = "1".equals(h[3]);
          sky = h[4].equals("-") ? null : ints(h[4]);
          bow = h[5].equals("-") ? null : ints(h[5]);
          if (h[6].equals("-")) critters = new int[0][];
          else {
            String[] cs = h[6].split("\\|");
            critters = new int[cs.length][];
            for (int i = 0; i < cs.length; i++) critters[i] = ints(cs[i]);
          }
          continue;
        }
        case "end": cases++; continue;
        case "shower": {
          String[] h = line.split(" ");
          assertEquals(h[1], "1".equals(h[2]), StableAmbient.showerNight(java.time.LocalDateTime.parse(h[1])));
          showers++;
          continue;
        }
        case "rain": {
          String[] h = line.split(" ");
          java.time.LocalDateTime at = java.time.LocalDateTime.parse(h[1]);
          assertEquals("rain " + h[1], "1".equals(h[2]), StableWeather.rainAt(at));
          assertEquals("rainbow " + h[1], "1".equals(h[3]), StableWeather.rainbowAt(at));
          hours++;
          if ("1".equals(h[2])) wet++;
          if ("1".equals(h[3])) bows++;
          continue;
        }
        default: {
          Rec rec = new Rec();
          StableAmbient.draw(rec, critters, sky, p[0].equals("front"), Integer.parseInt(p[1]), rate, rainbow ? bow : null);
          String want = p.length > 2 ? p[2] : "";
          if (!want.isEmpty()) drawn++;
          assertEquals(name + " " + p[0] + " at " + p[1], want, rec.joined());
        }
      }
    }
    assertEquals(9, cases);
    assertEquals(9, showers);
    assertEquals(120 * 24, hours);
    assertTrue(wet > 20 && bows > 5);
    assertTrue(drawn > 5000);
  }

  private static int[] ints (String csv) {
    String[] xs = csv.split(",");
    int[] out = new int[xs.length];
    for (int i = 0; i < xs.length; i++) out[i] = Integer.parseInt(xs[i]);
    return out;
  }
}
