/*
 * The live wallpaper's scenery (Android): what the phone can't draw itself. A native wallpaper can't run the
 * playground's canvas, so the app paints, once per light of the day, the scene as one picture and the trees
 * that stand on the walking ground (creatures pass behind them), and cuts each creature's picture out of its
 * sheet. The phone moves the creatures, the weather and the scenery's critters with the same numbers as the
 * Stable (android/verdict StableHerd, StableWeather and StableAmbient, tested tick by tick against creatures.ts,
 * weather.ts and ambient.ts).
 *
 * Everything painted here comes with the app (our scenes, Habitica's bundled sheets), so the canvases stay
 * readable. The rider on a ridden mount can't be painted here (the avatar's images come from Habitica's image
 * server without CORS and would taint the canvas), so it goes over as the list of the avatar's pictures and
 * where they sit (stable/ride.ts), and the phone fetches those images itself; so does the avatar on foot.
 *
 * Loaded on demand (stable/wallpaper.ts), only when the Stable is the phone's wallpaper or is being set.
 */
import { World, Herd, hashSeed, looksOf, type Resident, type Spot } from '../../playground';
import { SceneLayer, WeatherLayer, withProps } from '../../playground/scenes';
import { PROP_SPRITES } from '../../playground/scenes/layer';
import { stableSprites } from '../../stable/source';
import type { SceneryCreature, SceneryLight, SceneryRider, StableScenery } from '../native';
import { LIGHTS, type StillOptions } from './still';

const png = (source: CanvasImageSource, sx: number, sy: number, w: number, h: number): string => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(source, sx, sy, w, h, 0, 0, w, h);
  return c.toDataURL('image/png');
};

export async function paintScenery (o: StillOptions & {
  key: string, world: { w: number, h: number, insets: { top: number, bottom: number } },
  /** the player's avatar on the mount it rides, when that mount lives here */
  rider?: { id: string, parts: SceneryRider[] },
  /** the player's current pet, when it lives here (it walks beside the ridden mount) */
  yours?: string,
  /** else the avatar on foot by the door */
  avatar?: SceneryRider[],
  /** resting in the Inn */
  resting?: boolean,
}): Promise<StableScenery> {
  const src = withProps(stableSprites());
  // a creature whose sheet won't load is left out rather than drawn as nothing
  await src.load(Herd.keys(o.residents)).catch(() => undefined);
  const residents = o.residents.filter(r => src.get(r.sprite) && (!r.head || src.get(r.head)));
  const { w, h, insets } = o.world;
  let band = { top: 0, bottom: 0 }, door = { x: 0, y: 0 }, spots: Spot[] = [];
  const lights = {} as Record<(typeof LIGHTS)[number], SceneryLight>;
  for (const tod of LIGHTS) {
    const world = new World(src, { seed: o.seed, w, h });
    world.insets = { ...insets };
    const layer = new SceneLayer({ scene: o.scene, growth: o.growth, dailiesDone: o.dailiesDone, tod, season: o.season, moon: o.moon, feasts: o.feasts, years: o.years });
    // painting it plants the standing trees as entities
    world.addLayer(layer);
    const b = layer.walk(world);
    band = { top: b.top, bottom: b.bottom };
    door = layer.door(world);
    spots = layer.spots(world);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    layer.draw(g, world);
    const trees = world.drawOrder().map(e => {
      const s = world.sprites.get(e.sprite)!;
      const box = world.box(e, s);
      return { picture: png(s.image, s.sx ?? 0, s.sy ?? 0, s.w, s.h), left: box.x, top: box.y, foot: Math.round(e.y) };
    });
    // the trees' pictures are kept in a shared map until their layer is painted again: this one won't be
    for (const e of world.entities) PROP_SPRITES.delete(e.sprite);
    lights[tod] = { picture: c.toDataURL('image/png'), shadow: layer.shadow(), weather: new WeatherLayer(layer).kind(), trees, life: layer.life(world) };
  }
  return {
    key: o.key, world: { w, h }, band, door, seed: hashSeed(o.seed) | 0, herdSeed: o.herdSeed, lights,
    creatures: residents.map(r => creature(src, r, o.rider?.id === r.id ? o.rider.parts : undefined, o.yours === r.id)),
    spots, sky: { winter: o.season === 'winter', moon: o.moon }, particles: looksOf(residents.map(r => r.nature)),
    ...(o.avatar?.length ? { avatar: o.avatar.map(p => ({ file: p.file, x: p.x, y: p.y })) } : {}),
    ...(o.resting ? { resting: true } : {}),
  };
}

function creature (src: ReturnType<typeof withProps>, r: Resident, rider: SceneryRider[] | undefined, yours: boolean): SceneryCreature {
  const body = src.get(r.sprite)!, head = r.head ? src.get(r.head) : undefined;
  const mount = r.kind === 'mount';
  return {
    id: r.id, species: r.species, mount, gait: body.gait, facing: body.facing ?? (mount ? 'left' : 'right'), nocturnal: !!body.nocturnal,
    w: body.w, h: body.h, ax: body.anchor.x, ...(r.spot ? { spot: r.spot } : {}),
    ...(r.temper ? { temper: r.temper, bonds: (r.bonds ?? []).map(b => ({ id: b.id, kind: b.kind })) } : {}),
    ...(r.nature ? { nature: r.nature } : {}),
    ...(r.cold ? { cold: true } : {}), ...(yours ? { yours: true } : {}),
    ...(r.lead ? { lead: r.lead } : {}), ...(r.guard ? { guard: r.guard } : {}), ...(r.orbit ? { orbit: r.orbit } : {}), ...(r.pounce ? { pounce: r.pounce } : {}),
    ...(r.flock ? { flock: [...r.flock] } : {}), ...(r.fold ? { fold: [...r.fold] } : {}), ...(r.meet ? { meet: r.meet } : {}), ...(r.elder ? { elder: true } : {}),
    body: png(body.image, body.sx ?? 0, body.sy ?? 0, body.w, body.h),
    ...(head ? { head: png(head.image, head.sx ?? 0, head.sy ?? 0, head.w, head.h) } : {}),
    ...(rider?.length && mount ? { rider: rider.map(p => ({ file: p.file, x: p.x, y: p.y })) } : {}),
  };
}
