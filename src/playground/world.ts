/* The world: what is in the playground and how it changes tick by tick. Headless and deterministic (a seed,
 * fixed 1/30 s ticks, positions in world pixels: Habitica's image pixels), so it runs the same in a test, on a still screen and on a
 * phone. Scenery arrives as layers and creatures as entities; their looks and behaviour live in their own
 * modules and plug in here. */
import { Rng } from './rng';
import { TICK_MS } from './frame';
import type { Sprite, SpriteSource } from './sprites';

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Scenery: sky, ground, trees, props. 'back' layers are drawn under the creatures, 'front' ones over them. */
export interface Layer {
  id: string;
  depth: 'back' | 'front';
  /** the visible world changed size (a rotation, a resize): rebuild what depends on it */
  resize? (world: World): void;
  update? (world: World): void;
  draw (g: Ctx, world: World): void;
}

/** Anything standing in the world. (x, y) is where its sprite's anchor touches the ground, in world pixels;
 * fractions are allowed for smooth speeds but drawing rounds, so it moves whole pixels. (How coarse a step
 * looks right, one pixel or one 3-pixel art pixel, is the creatures module's call.) */
export interface Entity {
  id: string;
  x: number; y: number;
  sprite: string;
  /** mirrored (facing the other way) */
  flip?: boolean;
  /** world pixels above the ground (a hop), drawn and hit-tested there without moving its place in the crowd */
  lift?: number;
  hidden?: boolean;
  /** not tappable (a shadow, a particle) */
  inert?: boolean;
  update? (world: World): void;
  /** draw it yourself (squash, shifted rows...); the default draws the sprite at its anchor. An entity that
   * draws itself is drawn even when its sprite isn't in the SpriteSource (a ball, a particle). */
  draw? (g: Ctx, world: World, sprite: Sprite | undefined): void;
  /** hit-test it yourself (several layers, no catalogue sprite): world pixel (x, y) is on it */
  hit? (x: number, y: number, world: World): boolean;
}

export interface Box { x: number, y: number, w: number, h: number }

export class World {
  /** visible size, world pixels */
  w: number; h: number;
  /** ticks stepped so far, and the world time they add up to */
  tick = 0;
  get timeMs () { return this.tick * TICK_MS; }
  readonly rng: Rng;
  readonly layers: Layer[] = [];
  readonly entities: Entity[] = [];
  /** fills the world before the first layer (and the margin around it on the canvas) */
  background = '#000';
  /** how much of the top and bottom of the view the app's bars cover (world pixels): keep the ground and
   * anything tappable between them. The stage sets it; it changes without a resize (full screen). */
  insets = { top: 0, bottom: 0 };

  constructor (readonly sprites: SpriteSource, opts: { seed: number | string, w?: number, h?: number }) {
    this.rng = new Rng(opts.seed);
    this.w = opts.w ?? 1; this.h = opts.h ?? 1;
  }

  addLayer (l: Layer) { this.layers.push(l); l.resize?.(this); return l; }
  add<E extends Entity> (e: E): E { this.entities.push(e); return e; }
  remove (e: Entity) { const i = this.entities.indexOf(e); if (i >= 0) this.entities.splice(i, 1); }
  byId (id: string) { return this.entities.find(e => e.id === id); }

  resize (w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    for (const l of this.layers) l.resize?.(this);
  }

  step () {
    this.tick++;
    for (const l of this.layers) l.update?.(this);
    // a copy: an update may add or remove entities
    for (const e of [...this.entities]) e.update?.(this);
  }

  /** Painter's order: further back (smaller y) first; ties keep the order they were added in. */
  drawOrder (): Entity[] {
    return this.entities.map((e, i) => ({ e, i })).filter(({ e }) => !e.hidden)
      .sort((a, b) => Math.round(a.e.y) - Math.round(b.e.y) || a.i - b.i).map(({ e }) => e);
  }

  draw (g: Ctx) {
    g.imageSmoothingEnabled = false;
    g.fillStyle = this.background;
    g.fillRect(0, 0, this.w, this.h);
    for (const l of this.layers) if (l.depth === 'back') l.draw(g, this);
    for (const e of this.drawOrder()) {
      const s = this.sprites.get(e.sprite);
      if (e.draw) { e.draw(g, this, s); continue; }
      if (!s) continue;
      const b = this.box(e, s);
      const sx = s.sx ?? 0, sy = s.sy ?? 0;
      if (e.flip) { g.save(); g.translate(b.x + b.w, b.y); g.scale(-1, 1); g.drawImage(s.image, sx, sy, s.w, s.h, 0, 0, s.w, s.h); g.restore(); }
      else g.drawImage(s.image, sx, sy, s.w, s.h, b.x, b.y, s.w, s.h);
    }
    for (const l of this.layers) if (l.depth === 'front') l.draw(g, this);
  }

  /** Where an entity's sprite sits, whole world pixels. A mirrored sprite mirrors its anchor too. */
  box (e: Entity, s = this.sprites.get(e.sprite)): Box {
    if (!s) return { x: Math.round(e.x), y: Math.round(e.y), w: 0, h: 0 };
    const ax = e.flip ? s.w - 1 - s.anchor.x : s.anchor.x;
    return { x: Math.round(e.x) - ax, y: Math.round(e.y) - s.anchor.y - Math.round(e.lift ?? 0), w: s.w, h: s.h };
  }

  /** The front-most entity painted at world pixel (x, y), or null. Uses the sprite's mask where it has one. */
  hitTest (x: number, y: number): Entity | null {
    const order = this.drawOrder();
    for (let i = order.length - 1; i >= 0; i--) {
      const e = order[i];
      if (e.inert) continue;
      if (e.hit) { if (e.hit(x, y, this)) return e; continue; }
      const s = this.sprites.get(e.sprite);
      if (!s) continue;
      const b = this.box(e, s);
      if (x < b.x || y < b.y || x >= b.x + b.w || y >= b.y + b.h) continue;
      if (!s.mask) return e;
      const sx = e.flip ? b.w - 1 - (x - b.x) : x - b.x;
      if (s.mask[(y - b.y) * s.w + sx]) return e;
    }
    return null;
  }
}
