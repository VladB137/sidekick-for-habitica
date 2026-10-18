/* Drawing in art pixels. The scenes are painted at Habitica's art resolution (one art pixel = 3 x 3 image
 * pixels, the size its pets are drawn in) into a small canvas, which the layer then shows 3 times bigger:
 * every pixel of our own art is a 3 x 3 block on the world's grid, matching the sprites beside it.
 * Only fillStyle and fillRect are used, so a test can paint into a plain array instead of a canvas. */

/** what a painter needs from a 2D context (a canvas's, or a test's fake) */
export interface Paint {
  fillStyle: unknown;
  fillRect (x: number, y: number, w: number, h: number): void;
}

/** world (image) pixels per art pixel */
export const ART = 3;

export type Rand = () => number;

export const rect = (c: Paint, x: number, y: number, w: number, h: number, col: string) => {
  c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
};
export const dot = (c: Paint, x: number, y: number, col: string) => {
  c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), 1, 1);
};

/** a filled pixel circle of radius r */
export function disc (c: Paint, cx: number, cy: number, r: number, col: string) {
  c.fillStyle = col;
  for (let y = -r; y <= r; y++) {
    const k = r * r + r * 0.6 - y * y;
    if (k < 0) continue;
    const half = Math.floor(Math.sqrt(k));
    c.fillRect(Math.round(cx - half), Math.round(cy + y), half * 2 + 1, 1);
  }
}

/** a filled pixel ellipse, radii rx and ry */
export function oval (c: Paint, cx: number, cy: number, rx: number, ry: number, col: string) {
  c.fillStyle = col;
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5))));
    c.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1);
  }
}

/** a hand-authored picture as rows of characters; '.' is empty, every other character looks up its colour */
export function stamp (c: Paint, rows: readonly string[], x: number, y: number, colours: Record<string, string>, mirror = false) {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    for (let i = 0; i < row.length; i++) {
      const col = colours[row[i]];
      if (col) dot(c, x + (mirror ? row.length - 1 - i : i), y + r, col);
    }
  }
}

const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
/** blend two #rrggbb colours, t = 0 gives a, 1 gives b */
export function mix (a: string, b: string, t: number): string {
  const A = hex(a), B = hex(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}

/** Ordered dithering: paint col on a share of the pixels in the box (1 = a quarter, 2 = half, 3 = three
 * quarters), on a fixed 2 x 2 pattern so neighbouring patches line up. The pixel-art way to blend two
 * colours without a third. */
export function dither (c: Paint, x: number, y: number, w: number, h: number, col: string, level: 1 | 2 | 3) {
  c.fillStyle = col;
  x = Math.round(x); y = Math.round(y);
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    // Bayer 2 x 2: 0 2 / 3 1
    const b = (i & 1) === 0 ? ((j & 1) === 0 ? 0 : 3) : ((j & 1) === 0 ? 2 : 1);
    if (b < level) c.fillRect(i, j, 1, 1);
  }
}

/** a dithered ellipse (soft shadows, haloes) */
export function ditherOval (c: Paint, cx: number, cy: number, rx: number, ry: number, col: string, level: 1 | 2 | 3) {
  for (let y = -ry; y <= ry; y++) {
    const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry + 0.5))));
    dither(c, Math.round(cx - hw), Math.round(cy + y), hw * 2 + 1, 1, col, level);
  }
}
