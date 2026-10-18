/* The scene as an engine layer. It paints the still scene once, at art resolution, and keeps it until
 * something it depends on changes (the world's size, the bars' insets, the scene, growth, the hour, the
 * season); every frame just copies it at 3 x. Time of day and season follow the phone's clock unless given. */
import { ART, type Paint } from './pixels';
import { paintScene, paintTree, treeLook, NO_GROWTH, type Growth, type GrowthMark, type SceneLayout, type SceneOptions, type StandingTree } from './paint';
import type { TrophySpot } from './trophies';
import { moonPhase, seasonOf, southernRegion, timeOfDay, type MoonPhase, type Season, type TimeOfDay } from './clock';
import { SCENES, toner, type SceneId } from './palettes';
import { lifeOf, NO_LIFE, type Life } from './ambient';
import type { Feast } from './feasts';
import type { Ctx, Entity, Layer, World } from '../world';
import type { Sprite, SpriteSource } from '../sprites';
import type { Spot } from '../behaviours/types';

export interface SceneLayerOptions {
  scene: SceneId;
  growth?: Growth;
  /** all of today's Dailies done: full sun instead of the soft morning light */
  dailiesDone?: boolean;
  /** fixed hour and season; when left out they follow now() */
  tod?: TimeOfDay;
  season?: Season;
  /** fixed moon shape; when left out it follows now() */
  moon?: MoonPhase;
  now?: () => Date;
  southern?: boolean;
  /** the player rests in Habitica's Inn: the stable dims (dusk's light instead of dawn's or the day's) */
  dim?: boolean;
  /** Habitica's feast days (and the anniversary) to decorate for, and the years for the anniversary */
  feasts?: readonly Feast[];
  years?: number;
}

/** a box in world pixels */
export interface WorldBand { top: number, bottom: number, left: number, right: number }

export type Surface = HTMLCanvasElement | OffscreenCanvas;
/** an off-screen canvas to paint into */
export function surface (w: number, h: number): Surface {
  if (typeof OffscreenCanvas === 'function') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
}

/** Paint a scene into a canvas of artW x artH art pixels (a picker thumbnail, the Stats card's still frame). */
export function paintSceneCanvas (artW: number, artH: number, o: SceneLayerOptions & { top?: number, bottom?: number }): { canvas: Surface, layout: SceneLayout } {
  const canvas = surface(artW, artH);
  const g = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  const now = o.now?.() ?? new Date();
  const layout = paintScene(g, { W: artW, H: artH, top: o.top ?? 0, bottom: o.bottom ?? 0 }, {
    scene: o.scene, growth: o.growth ?? NO_GROWTH, dailiesDone: o.dailiesDone ?? true,
    tod: o.tod ?? timeOfDay(now), season: o.season ?? seasonOf(now, o.southern ?? southernRegion()),
    moon: o.moon ?? moonPhase(now), southern: o.southern ?? southernRegion(), feasts: o.feasts, years: o.years,
  });
  return { canvas, layout };
}

/**
 * A pen that paints into g (W x H art pixels) and remembers what each pixel shows: 1 the stable, 2 a trophy or signpost
 * (SceneOptions.part says which is being painted), 0 the rest. Only those parts claim pixels: the grass, flowers and
 * feast things painted later over the stable's foot don't take them back (its outline would follow every tuft).
 */
export function partsPen (g: Paint, W: number, H: number) {
  const owner = new Uint8Array(W * H);
  let at = 0;
  const pen: Paint = {
    get fillStyle () { return g.fillStyle; },
    set fillStyle (v) { g.fillStyle = v; },
    fillRect (x, y, w, h) {
      g.fillRect(x, y, w, h);
      if (!at) return;
      const x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(H, y + h);
      for (let r = y0; r < y1; r++) owner.fill(at, r * W + x0, r * W + Math.max(x0, x1));
    },
  };
  return { pen, owner, part: (p: 'house' | 'trophies' | null) => { at = p === 'house' ? 1 : p === 'trophies' ? 2 : 0; } };
}

/** sprites the scene makes for itself (trees standing among the creatures); withProps() serves them */
export const PROP_SPRITES = new Map<string, Sprite>();
/** The creatures' sprite source plus the scene's own sprites ('prop:' keys). */
export function withProps (src: SpriteSource): SpriteSource {
  return {
    get: key => PROP_SPRITES.get(key) ?? src.get(key),
    load: keys => src.load(keys.filter(k => !k.startsWith('prop:'))),
  };
}

/** a standing tree's picture, art pixels, with its foot at (ax, ay) */
const TREE_BOX = { w: 64, h: 76, ax: 32, ay: 72 };
let layers = 0;

export class SceneLayer implements Layer {
  readonly id = 'scene';
  readonly depth = 'back' as const;
  private o: SceneLayerOptions;
  private pic: Surface | null = null;
  /** the sky alone (before anything stands in it), and from it the mask of where the sky shows */
  private skyPic: Surface | null = null;
  private skyOpen: Surface | null = null;
  private art: SceneLayout | null = null;
  /** what each art pixel of the picture shows: 0 scenery, 1 the stable, 2 a trophy or signpost (what a tap opens) */
  private owner: Uint8Array = new Uint8Array(0);
  private lives: Life = NO_LIFE;
  private built = { w: -1, h: -1, top: -1, bottom: -1, tod: '', season: '', moon: -1, v: -1 };
  private version = 0;
  private clockCheckedAt = -Infinity;
  private clock = { tod: 'day' as TimeOfDay, season: 'summer' as Season, moon: 0 as MoonPhase };
  /** times the still scene was painted (tests) */
  paints = 0;
  private standing: Entity[] = [];
  private readonly uid = ++layers;

  constructor (o: SceneLayerOptions) { this.o = { ...o }; }

  get options (): Readonly<SceneLayerOptions> { return this.o; }
  /** change the scene, growth, light...; it repaints on the next frame */
  set (o: Partial<SceneLayerOptions>) { this.o = { ...this.o, ...o }; this.version++; this.clockCheckedAt = -Infinity; }

  /** the light now: given, or from the clock (looked at no more than once a minute) */
  light (): { tod: TimeOfDay, season: Season } {
    const { tod, season } = this.sky();
    return { tod, season };
  }

  /** the light and the moon's shape: given, or from the clock */
  private sky (): { tod: TimeOfDay, season: Season, moon: MoonPhase } {
    const s = this.clockSky();
    return this.o.dim && s.tod !== 'night' ? { ...s, tod: 'dusk' } : s;
  }

  private clockSky (): { tod: TimeOfDay, season: Season, moon: MoonPhase } {
    const o = this.o;
    if (o.tod && o.season && o.moon !== undefined) return { tod: o.tod, season: o.season, moon: o.moon };
    const t = Date.now();
    if (t - this.clockCheckedAt > 60_000) {
      const d = o.now?.() ?? new Date(t);
      this.clock = { tod: timeOfDay(d), season: seasonOf(d, o.southern ?? southernRegion()), moon: moonPhase(d) };
      this.clockCheckedAt = t;
    }
    return { tod: o.tod ?? this.clock.tod, season: o.season ?? this.clock.season, moon: o.moon ?? this.clock.moon };
  }

  /** tonight's moon: given, or from the clock */
  moon (): MoonPhase { return this.sky().moon; }
  /** the light's colour shift, as the scene paints it */
  tone (c: string): string { return toner({ ...this.light(), dailiesDone: this.o.dailiesDone ?? true })(c); }
  /** names the current light (for caching things toned by it) */
  lightKey (): string { const l = this.light(); return `${l.tod}:${l.season}:${this.o.dailiesDone ?? true}`; }
  /** the colour of shadows on this ground */
  shadow (): string { return this.tone(this.light().season === 'winter' && this.o.scene !== 'cove' && this.o.scene !== 'mushroom' ? '#B9C8D6' : SCENES[this.o.scene].shadow); }

  private ensure (world: World): SceneLayout {
    const l = this.sky(), b = this.built;
    const top = Math.ceil(world.insets.top / ART), bottom = Math.ceil(world.insets.bottom / ART);
    if (this.art && b.w === world.w && b.h === world.h && b.top === top && b.bottom === bottom && b.tod === l.tod && b.season === l.season && b.moon === l.moon && b.v === this.version) return this.art;
    const W = Math.max(1, Math.ceil(world.w / ART)), H = Math.max(1, Math.ceil(world.h / ART));
    if (!this.pic || this.pic.width !== W || this.pic.height !== H) this.pic = surface(W, H);
    const g = this.pic.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    const own = partsPen(g, W, H);
    this.owner = own.owner;
    const opts: SceneOptions = {
      scene: this.o.scene, growth: this.o.growth ?? NO_GROWTH, dailiesDone: this.o.dailiesDone ?? true, ...l, southern: this.o.southern ?? southernRegion(), standing: 'return', feasts: this.o.feasts, years: this.o.years,
      afterSky: () => {
        if (!this.skyPic || this.skyPic.width !== W || this.skyPic.height !== H) this.skyPic = surface(W, H);
        const s = this.skyPic.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
        s.clearRect(0, 0, W, H); s.drawImage(this.pic!, 0, 0);
      },
      part: own.part,
    };
    this.art = paintScene(own.pen, { W, H, top, bottom }, opts);
    this.lives = lifeOf(opts, this.art, W);
    this.skyOpen = null;
    this.plantStanding(world, this.art.standing, opts);
    this.paints++;
    this.built = { w: world.w, h: world.h, top, bottom, tod: l.tod, season: l.season, moon: l.moon, v: this.version };
    return this.art;
  }

  /** Trees on the walking ground become inert entities, so a creature behind one is drawn behind it. */
  private plantStanding (world: World, trees: StandingTree[], o: SceneOptions) {
    for (const e of this.standing) { world.remove(e); PROP_SPRITES.delete(e.sprite); }
    this.standing = trees.map((t, i) => {
      const art = surface(TREE_BOX.w, TREE_BOX.h);
      paintTree(art.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, { ...t, x: TREE_BOX.ax, y: TREE_BOX.ay }, o, treeLook(o));
      const image = surface(TREE_BOX.w * ART, TREE_BOX.h * ART);
      const g = image.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
      g.imageSmoothingEnabled = false;
      g.drawImage(art, 0, 0, image.width, image.height);
      const key = `prop:tree:${this.uid}:${i}`;
      PROP_SPRITES.set(key, { key, image, w: image.width, h: image.height, anchor: { x: TREE_BOX.ax * ART, y: TREE_BOX.ay * ART + ART - 1 }, gait: 'legless' });
      return world.add({ id: `tree:${this.uid}:${i}`, sprite: key, x: t.x * ART, y: t.y * ART + ART - 1, inert: true });
    });
  }

  /** where creatures' feet may go, world pixels (inside the bars, below the horizon) */
  walk (world: World): WorldBand {
    const w = this.ensure(world).walk;
    return { top: w.top * ART, bottom: w.bottom * ART + ART - 1, left: w.left * ART, right: Math.min(world.w - 1, w.right * ART + ART - 1) };
  }
  /** the stable's door, world pixels: where pets gather at dusk */
  door (world: World): { x: number, y: number } {
    const d = this.ensure(world).door;
    return { x: d.x * ART + 1, y: d.y * ART + ART - 1 };
  }
  /** where a grown thing stands (the newest tree, a flower patch, the water, the stable), world pixels */
  mark (world: World, part: GrowthMark): { x: number, y: number } {
    const m = this.ensure(world).marks[part];
    return { x: m.x * ART, y: m.y * ART };
  }
  /** the places creatures' natures go to (behaviours/types.ts Spot), world pixels */
  spots (world: World): Spot[] {
    return this.ensure(world).spots.map(p => ({ kind: p.kind, x: p.x * ART + 1, y: p.y * ART + ART - 1, w: p.w * ART, h: p.h * ART, ...(p.strip ? { strip: true } : {}), ...(p.pond ? { pond: true } : {}) }));
  }
  /** the scenery's critters and the open sky at this light (ambient.ts) */
  life (world: World): Life { this.ensure(world); return this.lives; }
  /** the trophy or signpost at a world point, if one stands there */
  trophyAt (world: World, x: number, y: number): TrophySpot | undefined {
    const ax = Math.floor(x / ART), ay = Math.floor(y / ART);
    // the nearest first, as they are drawn
    return [...this.ensure(world).trophies].reverse().find(t => ax >= t.x0 && ax < t.x1 && ay >= t.y0 && ay < t.y1);
  }
  /** What a tap opens in the painted picture (play/hint.ts rims it): which art pixels show the stable (1) or a trophy (2),
   * the trophies' and the stable's boxes, art pixels, and how many times the picture has been painted (it changes with it). */
  tappable (world: World): { W: number, H: number, owner: Uint8Array, trophies: TrophySpot[], house: SceneLayout['house'], paints: number } {
    const a = this.ensure(world), W = this.pic!.width;
    return { W, H: this.pic!.height, owner: this.owner, trophies: a.trophies, house: a.house, paints: this.paints };
  }
  /** a world point is on the stable building */
  houseAt (world: World, x: number, y: number): boolean {
    const b = this.ensure(world).house, ax = Math.floor(x / ART), ay = Math.floor(y / ART);
    return ax >= b.x0 && ax < b.x1 && ay >= b.y0 && ay < b.y1;
  }
  /** the stable building's middle, world pixels */
  house (world: World): { x: number, y: number } {
    const b = this.ensure(world).house;
    return { x: Math.round((b.x0 + b.x1) / 2) * ART, y: Math.round((b.y0 + b.y1) / 2) * ART };
  }
  /** the first ground row, world pixels */
  horizon (world: World): number { return this.ensure(world).horizon * ART; }
  /** the foot of the lantern post beside the stable, world pixels */
  lantern (world: World): { x: number, y: number } {
    const p = this.ensure(world).lantern;
    return { x: p.x * ART, y: p.y * ART };
  }

  /**
   * Where the open sky shows (art pixels, opaque there, clear wherever a hill, tree or building stands in it),
   * so something crossing the sky passes behind the scenery. Made once per painted scene.
   */
  skyMask (world: World): Surface | null {
    this.ensure(world);
    if (this.skyOpen || !this.pic || !this.skyPic) return this.skyOpen;
    const W = this.pic.width, H = this.pic.height;
    const ctx = (c: Surface) => c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    const all = ctx(this.pic).getImageData(0, 0, W, H).data, sky = ctx(this.skyPic).getImageData(0, 0, W, H).data;
    const out = new ImageData(W, H);
    for (let i = 0; i < all.length; i += 4) {
      if (all[i] === sky[i] && all[i + 1] === sky[i + 1] && all[i + 2] === sky[i + 2]) out.data[i + 3] = 255;
    }
    this.skyOpen = surface(W, H);
    ctx(this.skyOpen).putImageData(out, 0, 0);
    return this.skyOpen;
  }

  resize (world: World) { this.ensure(world); }

  draw (g: Ctx, world: World) {
    this.ensure(world);
    const p = this.pic!;
    g.imageSmoothingEnabled = false;
    g.drawImage(p, 0, 0, p.width, p.height, 0, 0, p.width * ART, p.height * ART);
  }
}
