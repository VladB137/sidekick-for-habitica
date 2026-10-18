/* What the playground needs to know about a sprite. The sprite catalogue (its own module) loads Habitica's
 * pets and mounts, keeps them on the phone and tags each one's gait; the engine only draws what it is given.
 * An adapter over the catalogue provides SpriteSource; until it lands, placeholderSprites() stands in. */

/** How a creature may move (the design spec's five tags): only 'four-legged' trots; 'sitting' hops, 'leaping'
 * bounds, 'legless' scoots, 'flying' hovers. The catalogue's first tags are still accepted: 'upright' means
 * four-legged, 'tilted' sitting. Anything untagged moves as 'sitting'. */
export type Gait = 'four-legged' | 'sitting' | 'leaping' | 'legless' | 'flying' | 'upright' | 'tilted';
/** Which way the body points as drawn, tail to head (a 3/4 view looking at you still has one); 'front' only for
 * symmetric sprites, which never mirror. */
export type Facing = 'left' | 'right' | 'front';

export interface Sprite {
  key: string;
  /** the picture (or a sheet holding it), at Habitica's own pixels: one image pixel = one world pixel */
  image: CanvasImageSource;
  /** where the picture sits in image (a sheet cell); 0, 0 when it is the whole image */
  sx?: number; sy?: number;
  /** size in world pixels */
  w: number; h: number;
  /** the point that stands on the ground, from the top-left (feet centre, bottom edge) */
  anchor: { x: number, y: number };
  gait: Gait;
  /** body direction as drawn; missing = 'right' */
  facing?: Facing;
  /** awake at night (owls) */
  nocturnal?: boolean;
  /** 1 where the sprite has paint, row by row (w * h); without it a tap anywhere in the box counts */
  mask?: Uint8Array;
}

export interface SpriteSource {
  /** a sprite that is already loaded, or undefined (the engine skips drawing it until it is) */
  get (key: string): Sprite | undefined;
  /** load these (from the phone first; the engine never asks Habitica for anything) */
  load (keys: readonly string[]): Promise<void>;
}

/** 1 where alpha is above half, else 0: a hit mask from RGBA pixels (getImageData of a sprite's cell). */
export function alphaMask (rgba: Uint8ClampedArray | Uint8Array): Uint8Array {
  const m = new Uint8Array(rgba.length / 4);
  for (let i = 0; i < m.length; i++) m[i] = rgba[i * 4 + 3] >= 128 ? 1 : 0;
  return m;
}

/* ---------------------------------------------------------------- placeholders
 * Grey outlined blobs in a creature's footprint (Habitica's canvas sizes, drawn in 3 x 3 blocks like its art),
 * one per gait. They exist only to exercise the engine until the catalogue lands; they never ship in a screen. */

const PLACEHOLDER: Record<string, { w: number, h: number, gait: Gait }> = {
  'placeholder-pet': { w: 81, h: 99, gait: 'upright' },
  'placeholder-hopper': { w: 81, h: 99, gait: 'legless' },
  'placeholder-mount': { w: 135, h: 135, gait: 'upright' },
  'placeholder-sitter': { w: 81, h: 99, gait: 'sitting' },
  'placeholder-leaper': { w: 81, h: 99, gait: 'leaping' },
  'placeholder-flyer': { w: 81, h: 99, gait: 'flying' },
};

export function placeholderSprites (): SpriteSource {
  const cache = new Map<string, Sprite>();
  const make = (key: string): Sprite | undefined => {
    const p = PLACEHOLDER[key];
    if (!p) return undefined;
    // an ellipse filling the lower part of the box, on a grid of 3 x 3 blocks, with a one-block outline
    const B = 3, cw = p.w / B, ch = p.h / B;
    const rx = (cw - 3) / 2, ry = Math.round(ch * 0.35), cx = cw / 2, cy = ch - ry - 1;
    const cell = new Uint8Array(cw * ch);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) cell[y * cw + x] = 1;
    }
    const canvas = document.createElement('canvas');
    canvas.width = p.w; canvas.height = p.h;
    const g = canvas.getContext('2d')!;
    const mask = new Uint8Array(p.w * p.h);
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (!cell[y * cw + x]) continue;
      const edge = x === 0 || x === cw - 1 || !cell[y * cw + x - 1] || !cell[y * cw + x + 1] || !cell[(y - 1) * cw + x] || !cell[(y + 1) * cw + x];
      g.fillStyle = edge ? '#37474F' : p.gait === 'upright' ? '#B0BEC5' : '#CFD8DC';
      g.fillRect(x * B, y * B, B, B);
      for (let j = 0; j < B; j++) mask.fill(1, (y * B + j) * p.w + x * B, (y * B + j) * p.w + x * B + B);
    }
    // a 'head' block at the right end, so facing and mirroring show
    g.fillStyle = '#37474F';
    const hx = Math.round(cx + rx * 0.55), hy = Math.round(cy - ry * 0.3);
    g.fillRect(hx * B, hy * B, B * 2, B * 2);
    for (let j = 0; j < B * 2; j++) mask.fill(1, (hy * B + j) * p.w + hx * B, (hy * B + j) * p.w + hx * B + B * 2);
    return { key, image: canvas, w: p.w, h: p.h, anchor: { x: Math.floor(p.w / 2), y: p.h - 1 }, gait: p.gait, facing: 'right', mask };
  };
  return {
    get: key => { let s = cache.get(key); if (!s) { s = make(key); if (s) cache.set(key, s); } return s; },
    load: async () => {},
  };
}
