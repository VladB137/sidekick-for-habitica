/* The barn as engine pieces. InteriorLayer paints the still wall and floor (interior.ts) once per size, like
 * SceneLayer; StallRow is an entity that draws the stalls, the mounts standing in them and their half doors,
 * scrolled sideways. It stands at the world's top, so the pets on the straw are always drawn in front of it. */
import { ART } from './pixels';
import { DOOR_H, paintInterior, paintPost, paintStall, paintStallDoor, STALL_W, type InteriorLayout, type InteriorOptions } from './interior';
import { surface, type Surface } from './layer';
import { drawText, textRows, textWidth } from '../font';
import type { Box, TrophySpot } from './trophies';
import type { Ctx, Entity, Layer, World } from '../world';

type G2 = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
const ctx2d = (s: Surface) => s.getContext('2d') as G2;

export class InteriorLayer implements Layer {
  readonly id = 'interior';
  readonly depth = 'back' as const;
  private pic: Surface | null = null;
  private art: InteriorLayout | null = null;
  private built = { w: -1, h: -1, top: -1, bottom: -1, v: -1 };
  private version = 0;
  /** times the wall was painted (tests) */
  paints = 0;

  constructor (private o: InteriorOptions) {}

  get options (): Readonly<InteriorOptions> { return this.o; }
  set (o: Partial<InteriorOptions>) { this.o = { ...this.o, ...o }; this.version++; }

  layout (world: World): InteriorLayout {
    const b = this.built, top = Math.ceil(world.insets.top / ART), bottom = Math.ceil(world.insets.bottom / ART);
    if (this.art && b.w === world.w && b.h === world.h && b.top === top && b.bottom === bottom && b.v === this.version) return this.art;
    const W = Math.max(1, Math.ceil(world.w / ART)), H = Math.max(1, Math.ceil(world.h / ART));
    if (!this.pic || this.pic.width !== W || this.pic.height !== H) this.pic = surface(W, H);
    this.art = paintInterior(ctx2d(this.pic), W, H, { top, bottom }, this.o);
    this.paints++;
    this.built = { w: world.w, h: world.h, top, bottom, v: this.version };
    return this.art;
  }

  /** where the pets walk, world pixels */
  floor (world: World): { top: number, bottom: number } {
    const f = this.layout(world).floor;
    return { top: f.top * ART, bottom: f.bottom * ART + ART - 1 };
  }
  /** the trophy on the shelves or the rack at a world point */
  trophyAt (world: World, x: number, y: number): TrophySpot | undefined {
    return this.layout(world).trophies.find(t => inBox(t, x, y));
  }
  /** the quest plaque board is at a world point */
  plaquesAt (world: World, x: number, y: number): boolean { return inBox(this.layout(world).plaques, x, y); }

  resize (world: World) { this.layout(world); }

  draw (g: Ctx, world: World) {
    this.layout(world);
    const p = this.pic!;
    g.imageSmoothingEnabled = false;
    g.drawImage(p, 0, 0, p.width, p.height, 0, 0, p.width * ART, p.height * ART);
  }
}

const inBox = (b: Box, x: number, y: number) => { const ax = Math.floor(x / ART), ay = Math.floor(y / ART); return ax >= b.x0 && ax < b.x1 && ay >= b.y0 && ay < b.y1; };

/** one stall: the mount standing in it (its sprite keys), its name on the door, the family it starts */
export interface Stall { id: string, body: string, head?: string, name?: string, family?: string }

/** The stall row: every stall, scrolled; draws only the ones on screen. */
export class StallRow implements Entity {
  readonly id = 'stalls';
  x = 0; y = 0; sprite = ''; inert = true;
  stalls: readonly Stall[] = [];
  /** world pixels scrolled from the first stall */
  scroll = 0;
  private pics: { back: Surface, door: Surface, post: Surface } | null = null;

  /** @param need asked for the sheets of stalls on screen that aren't loaded yet */
  constructor (private layer: InteriorLayer, private need: (keys: string[]) => void = () => undefined) {}

  /** world pixels a stall takes */
  static readonly W = STALL_W * ART;

  /** how far it can scroll: the last stall's right post at the right edge */
  maxScroll (world: World) { return Math.max(0, this.stalls.length * StallRow.W + 2 * ART - world.w); }
  /** scroll to this (clamped); true if it moved */
  scrollTo (world: World, s: number): boolean {
    const n = Math.round(Math.max(0, Math.min(this.maxScroll(world), s)));
    if (n === this.scroll) return false;
    this.scroll = n;
    return true;
  }
  /** the stalls on screen now (indexes), and one either side */
  visible (world: World): [number, number] {
    const a = Math.floor(this.scroll / StallRow.W) - 1, b = Math.ceil((this.scroll + world.w) / StallRow.W) + 1;
    return [Math.max(0, a), Math.min(this.stalls.length, b)];
  }
  /** the stall at a world point (on its back, its mount or its door) */
  at (world: World, x: number, y: number): Stall | undefined {
    const s = this.layer.layout(world).stalls;
    if (y < s.beam * ART || y >= (s.floor + 1) * ART) return undefined;
    const i = Math.floor((x + this.scroll) / StallRow.W);
    return this.stalls[i];
  }
  /** a stall's middle, world pixels (for a test's tap, or bringing it on screen) */
  middle (world: World, i: number): { x: number, y: number } {
    const s = this.layer.layout(world).stalls;
    return { x: i * StallRow.W + StallRow.W / 2 - this.scroll, y: (s.door - 6) * ART };
  }

  private pictures (h: number) {
    if (this.pics && this.pics.back.height === h) return this.pics;
    const back = surface(STALL_W, h), door = surface(STALL_W, DOOR_H), post = surface(2, h);
    paintStall(ctx2d(back), h); paintStallDoor(ctx2d(door)); paintPost(ctx2d(post), h);
    return (this.pics = { back, door, post });
  }

  draw (g: Ctx, world: World) {
    const s = this.layer.layout(world).stalls, h = s.floor - s.top, p = this.pictures(h), W = StallRow.W;
    const [a, b] = this.visible(world), missing: string[] = [];
    g.imageSmoothingEnabled = false;
    for (let i = a; i < b; i++) {
      const st = this.stalls[i], x = i * W - this.scroll;
      g.drawImage(p.back, 0, 0, STALL_W, h, x, s.top * ART, W, h * ART);
      // the mount, feet on the floor line, behind the half door
      const cx = x + W / 2, foot = s.floor * ART - 1;
      for (const key of [st.body, st.head]) {
        const sp = key ? world.sprites.get(key) : undefined;
        if (key && !sp) missing.push(key);
        if (sp) g.drawImage(sp.image, sp.sx ?? 0, sp.sy ?? 0, sp.w, sp.h, Math.round(cx - sp.anchor.x), foot - sp.anchor.y, sp.w, sp.h);
      }
      g.drawImage(p.door, 0, 0, STALL_W, DOOR_H, x, s.door * ART, W, DOOR_H * ART);
      if (st.name) plate(g, st.name, cx, (s.door + 1) * ART, (STALL_W - 8) * ART, '#E8C04A', '#3A2412', false);
    }
    // the families' boards on the beam, over as many stalls as each has
    for (let i = a; i < b; i++) {
      const st = this.stalls[i];
      if (!st.family) continue;
      let n = 1;
      while (i + n < this.stalls.length && !this.stalls[i + n].family) n++;
      plate(g, st.family, i * W - this.scroll + Math.min(n * W, 2 * W) / 2, (s.beam + 1) * ART, Math.min(n, 2) * W - 4 * ART, '#C9A26B', '#2E1C0E', true);
    }
    if (b === this.stalls.length && b > 0) g.drawImage(p.post, 0, 0, 2, h, b * W - this.scroll, s.top * ART, 2 * ART, h * ART);
    if (missing.length) this.need(missing);
  }
}

/** a word on a little board centred at x, top at y, cut to fit max world pixels; edged in dark wood or not */
function plate (g: Ctx, text: string, x: number, y: number, max: number, board: string, ink: string, edge: boolean) {
  let t = text;
  while (t.length > 1 && (textWidth(t) + 4) * ART > max) t = t.slice(0, -1);
  const [r0, r1] = textRows(t), w = (textWidth(t) + 4) * ART, hgt = (r1 - r0 + 3) * ART, left = Math.round(x - w / 2);
  if (edge) { g.fillStyle = '#2E1C0E'; g.fillRect(left - ART, y - ART, w + 2 * ART, hgt + 2 * ART); }
  g.fillStyle = board; g.fillRect(left, y, w, hgt);
  drawText(g as CanvasRenderingContext2D, t, left + 2 * ART, y + ART - r0 * ART, ink);
}
