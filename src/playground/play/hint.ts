/* Hints (Vlad, 2026-10-15: "a way to make interactible stuff more easy to see, such as a faint glow or half pixel
 * outline"): what a tap does something to, beyond the creatures, is marked, so it stands out from the scenery: the
 * hiding spot, the playground's own toy, the toy box's toys and the ball, the trophies and their signposts, and the
 * stable once the barn is open.
 *
 * A rim is one image pixel wide: a third of one of our art pixels, the finest line the world can draw. It hugs the
 * thing's painted pixels from outside (its top and sides), so the picture itself is untouched, and is drawn just before
 * it, so whatever stands in front covers it as it covers the thing.
 *
 * App only: the wallpaper and the screen saver have nothing to tap, so nothing here has a Java twin. */
import { ART } from '../particles';
import { surface, type SceneLayer, type Surface } from '../scenes/layer';
import { NATURE, SCENES } from '../scenes/palettes';
import { mix } from '../scenes/pixels';
import type { Ctx, Layer, World } from '../world';
import { look, type Picture, type Tone } from './art';

/** line: a thin light rim, always; glow: a soft halo, slowly breathing; glint: no rim, a twinkle on one thing at a
 * time; reveal: the thin rim for a few seconds when the playground opens and after a tap on empty ground */
export type HintStyle = 'line' | 'glow' | 'glint' | 'reveal';
export const HINT_STYLES: readonly HintStyle[] = ['line', 'glow', 'glint', 'reveal'];

/** a box in world pixels */
export interface HintBox { x: number, y: number, w: number, h: number }

interface Rim { img: Surface, pad: number }
export type Shape = 'line' | 'glow';
/** how far out the rim reaches (image pixels) and how strong it is at each distance */
const SHAPES: Record<Shape, { pad: number, alpha: readonly number[] }> = {
  line: { pad: 1, alpha: [0.7] },
  glow: { pad: 4, alpha: [0.55, 0.36, 0.2, 0.09] },
};
/** the rim's colour on dark and mid ground (grass, moss, the glade); on pale ground (sand, snow) it is the ground's own
 * shade, darkened, since a light line vanishes there */
const LIGHT: Record<Shape, string> = { line: '#FFFAE4', glow: '#FFECAA' };
const rgb = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const luma = (h: string) => { const [r, g, b] = rgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255; };
/** reveal: how long the rim stays, then fades (ticks) */
const REVEAL = 120, FADE = 30;
/** glint: a twinkle every this many ticks */
const GLINT_EVERY = 75;

/**
 * The rim around whatever `on` says is painted, in a w x h box (world pixels): RGBA pixels (pad) bigger on every side,
 * each pixel outside the shape coloured by how near the shape it is. No canvas, so a test can look at it.
 */
export function rimPixels (on: (x: number, y: number) => boolean, w: number, h: number, shape: Shape, colour: string) {
  const s = SHAPES[shape], col = rgb(colour), pad = s.pad, W = w + 2 * pad, H = h + 2 * pad;
  const data = new Uint8ClampedArray(W * H * 4);
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && on(x, y);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const sx = x - pad, sy = y - pad;
      if (inside(sx, sy)) continue;
      let best = Infinity;
      // only from the side or above: nothing under the thing's foot, where it meets the ground (a line along the ground
      // reads as a sticker's edge, and the grass painted over the stable's foot would notch it)
      for (let dy = 0; dy <= pad; dy++) {
        for (let dx = -pad; dx <= pad; dx++) {
          if (!inside(sx + dx, sy + dy)) continue;
          // the line takes the diagonal neighbours too, so it closes round corners; the glow fades as a circle
          const k = shape === 'line' ? Math.max(Math.abs(dx), Math.abs(dy)) : Math.hypot(dx, dy);
          if (k < best) best = k;
        }
      }
      if (best > pad) continue;
      const a = s.alpha[Math.max(0, Math.ceil(best) - 1)], i = (y * W + x) * 4;
      data[i] = col[0]; data[i + 1] = col[1]; data[i + 2] = col[2]; data[i + 3] = Math.round(a * 255);
    }
  }
  return { data, W, H, pad };
}

/** the rim as a picture to draw */
function rimOf (on: (x: number, y: number) => boolean, w: number, h: number, shape: Shape, colour: string): Rim {
  const r = rimPixels(on, w, h, shape, colour);
  const img = surface(r.W, r.H);
  const g = img.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const d = g.createImageData(r.W, r.H);
  d.data.set(r.data);
  g.putImageData(d, 0, 0);
  return { img, pad: r.pad };
}

const imageRims = new WeakMap<Surface, Map<string, Rim>>();
/** the rim around a picture's painted pixels (its alpha), made once per shape and colour */
function rimOfImage (src: Surface, shape: Shape, colour: string): Rim {
  let m = imageRims.get(src);
  if (!m) { m = new Map(); imageRims.set(src, m); }
  let r = m.get(`${shape}${colour}`);
  if (!r) {
    const w = src.width, h = src.height;
    const a = (src.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D).getImageData(0, 0, w, h).data;
    r = rimOf((x, y) => a[(y * w + x) * 4 + 3] > 127, w, h, shape, colour);
    m.set(`${shape}${colour}`, r);
  }
  return r;
}

export interface HintOptions {
  scene: SceneLayer;
  still: () => boolean;
  /** the stable can be entered (the barn is built) */
  barn: () => boolean;
  /** the things on the ground that a tap plays with, world pixels (for the glint) */
  things: () => HintBox[];
  /** a twinkle at (x, y), world pixels */
  twinkle: (x: number, y: number) => void;
}

export class Hints implements Layer {
  readonly id = 'hints';
  readonly depth = 'back' as const;
  style: HintStyle = 'line';
  /** the tick of the last reveal (the playground opening, a tap on empty ground) */
  private revealed = 0;
  private glints = 0;
  private sceneRims: { at: number, barn: boolean, shape: Shape, colour: string, rims: { rim: Rim, x: number, y: number }[] } | null = null;

  constructor (private o: HintOptions) {}

  /** how strongly the rims show now, 0..1 */
  strength (w: World): number {
    // a light line stands out more on dark ground: fainter at dusk, fainter still at night
    const tod = this.o.scene.light().tod;
    return this.level(w) * (tod === 'night' ? 0.5 : tod === 'dusk' ? 0.75 : 1);
  }
  private level (w: World): number {
    const still = this.o.still();
    switch (this.style) {
      case 'line': return 1;
      case 'glow': return still ? 1 : 0.7 + 0.3 * Math.sin(w.tick / 30 * Math.PI * 2 / 2.5);
      case 'glint': return 0;
      case 'reveal': {
        const t = w.tick - this.revealed;
        if (still) return t < REVEAL * 3 ? 1 : 0;
        return t < REVEAL ? 1 : t < REVEAL + FADE ? 1 - (t - REVEAL) / FADE : 0;
      }
    }
  }
  private get shape (): Shape { return this.style === 'glow' ? 'glow' : 'line'; }
  /** the rim's colour on this scene's ground in this light */
  private colour (): string {
    const sc = this.o.scene, id = sc.options.scene, l = sc.light();
    const snowy = l.season === 'winter' && id !== 'cove' && id !== 'mushroom';
    const ground = snowy ? NATURE.snow : SCENES[id].ground;
    return luma(ground[0]) > 0.6 ? sc.tone(mix(ground[2], '#2A1E10', 0.7)) : LIGHT[this.shape];
  }

  /** show the rims again for a while (reveal) */
  reveal (w: World) { this.revealed = w.tick; }

  /** the rim of a picture drawn with its top-left at world (x, y) (snapped to the art grid as art.ts draws it) */
  picture (g: Ctx, w: World, p: Picture, tone: Tone, light: string, x: number, y: number) {
    const a = this.strength(w);
    if (a <= 0) return;
    this.put(g, rimOfImage(look(p, tone, light).img, this.shape, this.colour()), Math.round(x / ART) * ART, Math.round(y / ART) * ART, a);
  }

  /** the rim of an image drawn at world (x, y) */
  image (g: Ctx, w: World, img: Surface, x: number, y: number) {
    const a = this.strength(w);
    if (a <= 0) return;
    this.put(g, rimOfImage(img, this.shape, this.colour()), x, y, a);
  }

  private put (g: Ctx, r: Rim, x: number, y: number, a: number) {
    g.globalAlpha = a;
    g.drawImage(r.img, x - r.pad, y - r.pad);
    g.globalAlpha = 1;
  }

  update (w: World) {
    if (this.style !== 'glint' || this.o.still() || w.tick % GLINT_EVERY !== 0) return;
    const all = this.o.things().concat(this.sceneThings(w));
    if (!all.length) return;
    const b = all[this.glints++ % all.length];
    this.o.twinkle(b.x + Math.round(b.w * 0.7), b.y + Math.round(b.h * 0.25));
  }

  /** the trophies and signposts, and the stable once the barn is open: boxes in world pixels */
  private sceneThings (w: World): HintBox[] {
    const t = this.o.scene.tappable(w), out: HintBox[] = t.trophies.map(b => ({ x: b.x0 * ART, y: b.y0 * ART, w: (b.x1 - b.x0) * ART, h: (b.y1 - b.y0) * ART }));
    if (this.o.barn() && t.house) out.push({ x: t.house.x0 * ART, y: t.house.y0 * ART, w: (t.house.x1 - t.house.x0) * ART, h: (t.house.y1 - t.house.y0) * ART });
    return out;
  }

  /** the rims of what the scene painted (trophies, the stable), made once per painted scene */
  draw (g: Ctx, w: World) {
    const a = this.strength(w);
    if (a <= 0) return;
    const t = this.o.scene.tappable(w), barn = this.o.barn(), shape = this.shape, colour = this.colour();
    let s = this.sceneRims;
    if (!s || s.at !== t.paints || s.barn !== barn || s.shape !== shape || s.colour !== colour) {
      const rims: { rim: Rim, x: number, y: number }[] = [];
      // one rim round all the trophies (the pennant line with its posts included) and one round the stable, from the
      // door's wall rightwards (the fence and the lantern post left of it are not the way in)
      const around = (part: number, left: number) => {
        let x0 = t.W, y0 = t.H, x1 = -1, y1 = -1;
        for (let y = 0; y < t.H; y++) for (let x = left; x < t.W; x++) if (t.owner[y * t.W + x] === part) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        if (x1 < 0) return;
        const on = (x: number, y: number) => t.owner[(y0 + Math.floor(y / ART)) * t.W + x0 + Math.floor(x / ART)] === part;
        rims.push({ rim: rimOf(on, (x1 - x0 + 1) * ART, (y1 - y0 + 1) * ART, shape, colour), x: x0 * ART, y: y0 * ART });
      };
      if (t.trophies.length) around(2, 0);
      if (barn) around(1, Math.max(0, t.house.x0));
      s = this.sceneRims = { at: t.paints, barn, shape, colour, rims };
    }
    for (const r of s.rims) this.put(g, r.rim, r.x, r.y, a);
  }
}
