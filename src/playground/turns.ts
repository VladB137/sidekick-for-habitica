/* P6, quarter turns (thread "Behaviours by species", package R): a creature drawn turned a quarter, a half
 * (upside down) or three quarters, still pixel-exact: the one Habitica frame is never scaled, only mirrored and
 * turned by whole quarters with an exact matrix, so every picture pixel lands on one screen pixel. Rolling, floating
 * on the back, hanging and lying on the belly are made of these.
 *
 * `rot` is quarter turns forward: the head going down the way the creature faces (clockwise on screen when it
 * faces right). The turned picture keeps its bottom on the ground, centred across on the art grid. A turned
 * creature is drawn whole (no squash, lean or trot slices); the cut line still cuts it short, arithmetically, so
 * android/verdict StableTurns can do the same without a clip. */
import { ART } from './particles';
import type { Ctx } from './world';

/** quarter turns clockwise on screen for `rot` quarter turns forward, facing `dir` (+1 right) */
export const screenTurns = (rot: number, dir: number): number => (((dir > 0 ? rot : -rot) % 4) + 4) % 4;

export interface Box { x: number, y: number, w: number, h: number }

/** Where a W x H picture whose unturned top-left is (left, top) sits turned q quarters clockwise: bottom kept,
 * centred across on the art grid. */
export function turnedBox (W: number, H: number, left: number, top: number, q: number): Box {
  const odd = q % 2 === 1, w = odd ? H : W, h = odd ? W : H;
  return { x: left + Math.floor((W - w) / 2 / ART) * ART, y: top + H - h, w, h };
}

/** The exact matrix (a, b, c, d, e, f as Canvas transform takes it) that draws a w x h picture mirrored when flip,
 * then turned q quarters clockwise, into the box whose top-left is (dx, dy). */
export function turnMatrix (q: number, flip: boolean, w: number, h: number, dx: number, dy: number): [number, number, number, number, number, number] {
  const s = flip ? -1 : 1, m = flip ? w : 0;
  switch (q) {
    case 1: return [0, s, -1, 0, dx + h, dy + m];
    case 2: return [-s, 0, 0, -1, dx + w - m, dy + h];
    case 3: return [0, -s, 1, 0, dx, dy + w - m];
    default: return [s, 0, 0, 1, dx + m, dy];
  }
}

/** One cell (sx, sy, w, h) of an image, mirrored when flip, turned q quarters, its box's top-left at (dx, dy). */
export function drawTurned (g: Ctx, img: CanvasImageSource, sx: number, sy: number, w: number, h: number, dx: number, dy: number, flip: boolean, q: number) {
  g.save();
  g.transform(...turnMatrix(q, flip, w, h, dx, dy));
  g.drawImage(img, sx, sy, w, h, 0, 0, w, h);
  g.restore();
}

/** The part of a turned picture above the cut line (world y, or undefined for whole): the cell's columns and rows
 * (picture pixels, not mirrored) and where that part's box sits; null when nothing is above it. */
export function turnedPart (W: number, H: number, flip: boolean, q: number, box: Box, cut: number | undefined): { x: number, y: number, w: number, h: number, dx: number, dy: number } | null {
  const k = cut === undefined ? box.h : Math.min(box.h, cut - box.y);
  if (k <= 0) return null;
  // the part as drawn (mirrored): rows from the top, columns from the left, rows from the bottom, columns from the right
  let ux = 0, uy = 0, uw = W, uh = H;
  if (k < box.h) {
    if (q === 0) uh = k;
    else if (q === 1) uw = k;
    else if (q === 2) { uy = H - k; uh = k; } else { ux = W - k; uw = k; }
  }
  let dx = box.x + ux, dy = box.y + uy;
  if (q === 1) { dx = box.x + H - uy - uh; dy = box.y + ux; } else if (q === 2) { dx = box.x + W - ux - uw; dy = box.y + H - uy - uh; } else if (q === 3) { dx = box.x + uy; dy = box.y + W - ux - uw; }
  return { x: flip ? W - ux - uw : ux, y: uy, w: uw, h: uh, dx, dy };
}

/** The picture pixel (not mirrored) under world (x, y) of a turned picture in its box, or null outside it. */
export function turnedPixel (W: number, H: number, flip: boolean, q: number, box: Box, x: number, y: number): { px: number, py: number } | null {
  const bx = x - box.x, by = y - box.y;
  if (bx < 0 || by < 0 || bx >= box.w || by >= box.h) return null;
  let u = bx, v = by;
  if (q === 1) { u = by; v = H - 1 - bx; } else if (q === 2) { u = W - 1 - bx; v = H - 1 - by; } else if (q === 3) { u = W - 1 - by; v = bx; }
  return { px: flip ? W - 1 - u : u, py: v };
}
