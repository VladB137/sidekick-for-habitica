/* The pixel grid. The world is measured in Habitica's own image pixels (its art is drawn 3 image pixels to an
 * art pixel, and a few sprites sit off that 3 x 3 grid, so the image pixel is the one unit everything shares).
 * It is shown at a whole number of device pixels per world pixel: no smoothing, no half pixels, nothing blurs.
 * A bigger screen shows more meadow rather than bigger pixels past the fit. */

export interface Fit {
  /** device pixels per world pixel (whole number, at least 1) */
  scale: number;
  /** the canvas backing store, in device pixels */
  backW: number; backH: number;
  /** the visible world, in world pixels */
  viewW: number; viewH: number;
  /** where the world starts on the canvas (device pixels): the leftover under one world pixel, split evenly */
  offX: number; offY: number;
}

export interface FitOptions {
  /** the world shows at least this much in each direction (world pixels); the scale is the largest that fits it */
  minW: number; minH: number;
  /** never more than this many device pixels per world pixel (a tablet shouldn't get giant pixels) */
  maxScale?: number;
}

/** Fit the world into a box of cssW x cssH CSS pixels on a screen with devicePixelRatio dpr. */
export function fitGrid (cssW: number, cssH: number, dpr: number, o: FitOptions): Fit {
  return fitBacking(Math.round(cssW * dpr), Math.round(cssH * dpr), o);
}

/** The same from the backing store's exact size in device pixels (ResizeObserver's devicePixelContentBoxSize,
 * where the browser has it: no rounding guess, so world pixels land exactly on device pixels). */
export function fitBacking (backW: number, backH: number, o: FitOptions): Fit {
  backW = Math.max(1, backW); backH = Math.max(1, backH);
  let scale = Math.floor(Math.min(backW / o.minW, backH / o.minH));
  scale = Math.max(1, Math.min(o.maxScale ?? Infinity, scale));
  const viewW = Math.floor(backW / scale), viewH = Math.floor(backH / scale);
  return { scale, backW, backH, viewW, viewH, offX: Math.floor((backW - viewW * scale) / 2), offY: Math.floor((backH - viewH * scale) / 2) };
}

/** A point on the canvas element (CSS pixels from its top-left corner) to world pixels, or null outside the world. */
export function toWorld (f: Fit, cssX: number, cssY: number, cssW: number, cssH: number): { x: number, y: number } | null {
  const dx = cssX * (f.backW / cssW) - f.offX, dy = cssY * (f.backH / cssH) - f.offY;
  const x = Math.floor(dx / f.scale), y = Math.floor(dy / f.scale);
  return x < 0 || y < 0 || x >= f.viewW || y >= f.viewH ? null : { x, y };
}
