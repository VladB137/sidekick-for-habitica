package io.github.critoracle.verdict;

/**
 * P6, quarter turns: a line by line port of src/playground/turns.ts. A creature's picture mirrored, then turned whole
 * quarters with an exact matrix, so every picture pixel lands on one screen pixel; the cut line cuts it short
 * arithmetically, without a clip.
 */
public final class StableTurns {
  private StableTurns () {}

  /** quarter turns clockwise on screen for `rot` quarter turns forward, facing dir (+1 right) */
  public static int screen (int rot, int dir) { return Math.floorMod(dir > 0 ? rot : -rot, 4); }

  /** where a W x H picture whose unturned top-left is (left, top) sits turned q quarters clockwise: {x, y, w, h} */
  public static int[] box (int W, int H, int left, int top, int q) {
    boolean odd = q % 2 == 1;
    int w = odd ? H : W, h = odd ? W : H;
    return new int[] { left + (int) Math.floor((W - w) / 2.0 / StableHerd.ART) * StableHerd.ART, top + H - h, w, h };
  }

  /** the exact matrix {a, b, c, d, e, f} (x' = a x + c y + e, y' = b x + d y + f) drawing a w x h picture mirrored when
   * flip, turned q quarters clockwise, into the box whose top-left is (dx, dy) */
  public static float[] matrix (int q, boolean flip, int w, int h, int dx, int dy) {
    int s = flip ? -1 : 1, m = flip ? w : 0;
    switch (q) {
      case 1: return new float[] { 0, s, -1, 0, dx + h, dy + m };
      case 2: return new float[] { -s, 0, 0, -1, dx + w - m, dy + h };
      case 3: return new float[] { 0, -s, 1, 0, dx, dy + w - m };
      default: return new float[] { s, 0, 0, 1, dx + m, dy };
    }
  }

  /** the part above the cut line (NaN: whole): the cell's {x, y, w, h} (not mirrored) and its box's {dx, dy}, or null */
  public static int[] part (int W, int H, boolean flip, int q, int[] box, double cut) {
    int k = Double.isNaN(cut) ? box[3] : (int) Math.min(box[3], cut - box[1]);
    if (k <= 0) return null;
    int ux = 0, uy = 0, uw = W, uh = H;
    if (k < box[3]) {
      if (q == 0) uh = k;
      else if (q == 1) uw = k;
      else if (q == 2) { uy = H - k; uh = k; } else { ux = W - k; uw = k; }
    }
    int dx = box[0] + ux, dy = box[1] + uy;
    if (q == 1) { dx = box[0] + H - uy - uh; dy = box[1] + ux; } else if (q == 2) { dx = box[0] + W - ux - uw; dy = box[1] + H - uy - uh; } else if (q == 3) { dx = box[0] + uy; dy = box[1] + W - ux - uw; }
    return new int[] { flip ? W - ux - uw : ux, uy, uw, uh, dx, dy };
  }

  /** the picture pixel {px, py} (not mirrored) under world (x, y) of a turned picture in its box, or null outside it */
  public static int[] pixel (int W, int H, boolean flip, int q, int[] box, int x, int y) {
    int bx = x - box[0], by = y - box[1];
    if (bx < 0 || by < 0 || bx >= box[2] || by >= box[3]) return null;
    int u = bx, v = by;
    if (q == 1) { u = by; v = H - 1 - bx; } else if (q == 2) { u = W - 1 - bx; v = H - 1 - by; } else if (q == 3) { u = W - 1 - by; v = bx; }
    return new int[] { flip ? W - 1 - u : u, v };
  }
}
