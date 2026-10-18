/**
 * The sprite catalogue as the playground engine's SpriteSource. Keys:
 *   'Wolf-Base'            a pet
 *   'mount:Wolf-Base'      a mount's body
 *   'mount:Wolf-Base#head' its head (same box and anchor, drawn over the rider; each layer's mask is its own paint only)
 * and '@<frame>' at the end for one of an animated creature's frames ('Wolf-Cerberus@3'); no suffix = frame 0.
 * Sprites point at a cell of the creature's sheet, so a sheet is decoded once for all its frames and layers.
 */
import { alphaMask, type Sprite, type SpriteSource } from '../playground';
import { spriteMeta, loadSprite, cell, type SpriteMeta } from './sprites';

interface Parsed { meta: SpriteMeta, layer: number, frame: number }

export function parseKey (key: string): Parsed | undefined {
  const at = key.lastIndexOf('@');
  const frame = at < 0 ? 0 : Number(key.slice(at + 1));
  const base = at < 0 ? key : key.slice(0, at);
  let kind: 'pet' | 'mount' = 'pet'; let rest = base; let layer = 0;
  if (base.startsWith('mount:')) {
    kind = 'mount'; rest = base.slice(6);
    if (rest.endsWith('#head')) { rest = rest.slice(0, -5); layer = 1; }
  }
  const meta = spriteMeta(kind, rest);
  if (!meta || !Number.isInteger(frame) || frame < 0 || frame >= meta.frames) return undefined;
  return { meta, layer, frame };
}

/** 1 where the cell has paint (alpha at least half), row by row. */
function maskOf (sheet: ImageBitmap, sx: number, sy: number, w: number, h: number): Uint8Array | undefined {
  try {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(sheet, sx, sy, w, h, 0, 0, w, h);
    return alphaMask(g.getImageData(0, 0, w, h).data);
  } catch { return undefined; } // without a mask a tap anywhere in the box counts
}

export function stableSprites (): SpriteSource {
  const sheets = new Map<string, ImageBitmap>();
  const sprites = new Map<string, Sprite>();
  return {
    get (key) {
      const hit = sprites.get(key);
      if (hit) return hit;
      const p = parseKey(key);
      const sheet = p && sheets.get(p.meta.url);
      if (!p || !sheet) return undefined;
      const { sx, sy, w, h } = cell(p.meta, p.frame, p.layer);
      const s: Sprite = {
        key, image: sheet, sx, sy, w, h,
        // the engine's anchor is a pixel (it mirrors as w - 1 - x): the bottom row, under the legs' middle
        anchor: { x: Math.min(p.meta.ax, w - 1), y: h - 1 },
        gait: p.meta.gait, facing: p.meta.facing, nocturnal: p.meta.nocturnal,
        mask: maskOf(sheet, sx, sy, w, h),
      };
      sprites.set(key, s);
      return s;
    },
    async load (keys) {
      const metas = new Set(keys.map(k => parseKey(k)?.meta).filter((m): m is SpriteMeta => !!m));
      // one sheet that fails to load must not keep the others off screen: its sprites just stay undrawn
      await Promise.allSettled([...metas].map(async m => { if (!sheets.has(m.url)) sheets.set(m.url, await loadSprite(m)); }));
    },
  };
}
