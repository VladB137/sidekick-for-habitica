/**
 * The Stable's sprite catalogue: every Habitica pet and mount, bundled with the app (public/stable/, built by
 * tools/gen-sprites.mjs from Habitica's own images), so the Stable makes no network request of its own.
 * One sheet per creature: columns = animation frames (only Habitica's few animated creatures have more than
 * one), rows = layers (mounts: 0 body, 1 head; a rider is drawn between them). Sizes are in Habitica's image
 * pixels, where one art pixel is 3 image pixels; draw at whole multiples of an image pixel to keep it crisp.
 */
import spritesJson from '../data/sprites.json';
import { gaitOf, type Gait, type Facing } from './gaits';

export type { Gait, Facing } from './gaits';
export type SpriteKind = 'pet' | 'mount';
/** how each gait moves (Stable design spec): only four-legged creatures trot */
export type Motion = 'trot' | 'hop' | 'bound' | 'scoot' | 'hover';
const MOTION: Record<Gait, Motion> = { 'four-legged': 'trot', sitting: 'hop', leaping: 'bound', legless: 'scoot', flying: 'hover' };

export interface SpriteMeta {
  /** Habitica's key, as in items.pets / items.mounts: 'Wolf-Base' */
  key: string;
  kind: SpriteKind;
  species: string;
  potion: string;
  /** one cell, cropped to the creature's opaque pixels over every frame and layer (so this is its opaque bounds) */
  w: number;
  h: number;
  /** ground contact inside the cell: middle of the legs (x), bottom edge (y) */
  ax: number;
  ay: number;
  /** mounts: where the cell's top-left was in Habitica's own (uncropped) image, which is where a rider is placed from */
  at?: { x: number, y: number };
  /** sheet rows: 1 for pets, 2 for mounts (body, head) */
  layers: 1 | 2;
  /** sheet columns, and how long each frame shows (empty when there is one frame) */
  frames: number;
  frameMs: number[];
  gait: Gait;
  motion: Motion;
  /** the body's direction as drawn, tail to head; mirror the cell to go the other way ('front' never mirrors) */
  facing: Facing;
  /** stays awake at night (owls) */
  nocturnal: boolean;
  /** sheet URL, relative to the page */
  url: string;
}

type Row = [number, number, number, number, number, number[]?];
const DATA = spritesJson as unknown as { habitica: string, images: string, pets: Record<string, Row>, mounts: Record<string, Row>, mountAt: Record<string, [number, number]> };
const VERSION = DATA.images.slice(0, 7);

/** Credit the Stable must show wherever the sprites appear. */
export const SPRITE_CREDIT = 'Pet and mount artwork © HabitRPG, Inc., CC BY-NC-SA 3.0, from Habitica. Not affiliated with or endorsed by Habitica.';
/** image pixels per art pixel in Habitica's sprites */
export const SPRITE_GRID = 3;

const metas = new Map<string, SpriteMeta>();
function build (kind: SpriteKind, key: string, row: Row): SpriteMeta {
  const [w, h, ax, ay, frames, ms] = row;
  const [species, ...rest] = key.split('-');
  const { gait, facing, nocturnal } = gaitOf(kind, key);
  return {
    key, kind, species, potion: rest.join('-'), w, h, ax, ay,
    ...(kind === 'mount' && DATA.mountAt[key] ? { at: { x: DATA.mountAt[key][0], y: DATA.mountAt[key][1] } } : {}),
    layers: kind === 'mount' ? 2 : 1, frames, frameMs: ms ?? [],
    gait, motion: MOTION[gait], facing, nocturnal,
    url: `stable/${kind}/${key}.png?v=${VERSION}`,
  };
}

export function spriteMeta (kind: SpriteKind, key: string): SpriteMeta | undefined {
  const id = `${kind}:${key}`;
  let m = metas.get(id);
  if (!m) {
    const row = (kind === 'pet' ? DATA.pets : DATA.mounts)[key];
    if (!row) return undefined;
    m = build(kind, key, row); metas.set(id, m);
  }
  return m;
}

/** Every catalogued creature, pets then mounts, in key order. */
export function allSprites (kind?: SpriteKind): SpriteMeta[] {
  const kinds: SpriteKind[] = kind ? [kind] : ['pet', 'mount'];
  return kinds.flatMap(k => Object.keys(k === 'pet' ? DATA.pets : DATA.mounts).map(key => spriteMeta(k, key)!));
}

/** Decoded sheets, most recently used last. Evicted entries are only dropped, never closed, so a bitmap a caller still holds stays drawable. */
const CACHE_MAX = 160;
const cache = new Map<string, Promise<ImageBitmap>>();

async function decode (url: string): Promise<ImageBitmap> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return createImageBitmap(img);
}

/** The creature's sheet, decoded once and kept in memory. Rejects if the file can't load (it ships with the app, so that's a build fault). */
export function loadSprite (m: SpriteMeta): Promise<ImageBitmap> {
  let p = cache.get(m.url);
  if (p) { cache.delete(m.url); cache.set(m.url, p); return p; }
  p = decode(m.url);
  p.catch(() => cache.delete(m.url));
  cache.set(m.url, p);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return p;
}

/** Source rectangle of one cell in a sheet, for drawImage(sheet, sx, sy, w, h, dx, dy, dw, dh). */
export function cell (m: SpriteMeta, frame = 0, layer = 0): { sx: number, sy: number, w: number, h: number } {
  return { sx: (frame % m.frames) * m.w, sy: layer * m.h, w: m.w, h: m.h };
}

/** Frame to show at time t (ms) for an animated creature; 0 for still ones. */
export function frameAt (m: SpriteMeta, t: number): number {
  if (m.frames < 2) return 0;
  const total = m.frameMs.reduce((a, b) => a + b, 0);
  let r = t % total;
  for (let f = 0; f < m.frames; f++) { r -= m.frameMs[f]; if (r < 0) return f; }
  return 0;
}

/** One frame with every layer drawn in place (a mount's head over its body), at the sheet's pixel size. */
export function composite (m: SpriteMeta, sheet: CanvasImageSource, frame = 0): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = m.w; c.height = m.h;
  const g = c.getContext('2d')!;
  for (let layer = 0; layer < m.layers; layer++) {
    const { sx, sy, w, h } = cell(m, frame, layer);
    g.drawImage(sheet, sx, sy, w, h, 0, 0, w, h);
  }
  return c;
}
