/*
 * The home-screen widget's pictures (Android): the open playground as a still frame, once for each light of the
 * day (dawn, day, dusk, night), so the phone can show the right one at any hour without the app (StableWidget.java
 * picks it by the clock, with clock.ts's hours). Same world, scene, weather and creatures as the Stable, stepped
 * once with the herd held still; at night they sleep as they would there.
 *
 * Everything drawn comes with the app (our scenes, Habitica's bundled sheets), so the canvas stays readable. The
 * rider is left out on purpose: the avatar's images come from Habitica's image server without CORS and would
 * taint the canvas (the live stage has the same problem, which is why this never copies it).
 *
 * The Stats card's picture is painted the same way, once, at the phone's hour (views/stable.ts).
 *
 * Loaded on demand with the playground: by stable/widget.ts only when a widget is on the home screen, and by the Stats card.
 */
import { World, Herd, type Resident } from '../../playground';
import { AmbientLayer, SceneLayer, WeatherLayer, withProps, ballPicture, type Growth, type MoonPhase, type SceneId, type Season, type TimeOfDay } from '../../playground/scenes';
import { stableSprites } from '../../stable/source';
import type { Feast } from '../../playground/scenes/feasts';

/** world pixels (Habitica's image pixels; the scene is 3 x 3 art pixels): 2:1, a 4 x 2 widget's shape */
export const STILL = { w: 540, h: 270 };
export const LIGHTS: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
/** an hour inside each light, for the herd's clock (creatures.ts: asleep from BEDTIME to MORNING) */
const HOUR: Record<TimeOfDay, number> = { dawn: 7, day: 12, dusk: 20, night: 23 };

export interface StillOptions {
  /** the playground's world seed, as the Stable uses it */
  seed: string
  /** the herd's seed (where creatures without a saved spot stand) */
  herdSeed: string
  scene: SceneId
  growth: Growth
  dailiesDone: boolean
  season: Season
  /** the moon's shape in the night pictures (clock.ts moonPhase) */
  moon: MoonPhase
  residents: Resident[]
  /** Habitica's feast days on today (stable/calendar.ts), and the years for the anniversary */
  feasts?: readonly Feast[]
  years?: number
}

/** One PNG data URL per light. */
export async function paintStills (o: StillOptions): Promise<Record<TimeOfDay, string>> {
  const { src, residents } = await sheets(o.residents);
  const out = {} as Record<TimeOfDay, string>;
  for (const tod of LIGHTS) out[tod] = paintOne(o, residents, src, tod, new Date(2000, 0, 1, HOUR[tod]), STILL);
  return out;
}

/** world pixels of the Stats card's picture: 16:9, as wide as the Stable's narrowest world, so creatures stand at the size they have there */
export const CARD = { w: 480, h: 270 };

/** The Stats card's picture: one PNG at this moment's light and clock (who sleeps now lies down), and how many creatures it shows. */
export async function paintCard (o: StillOptions & { tod: TimeOfDay, now: Date }): Promise<{ url: string, shown: number }> {
  const { src, residents } = await sheets(o.residents);
  return { url: paintOne(o, residents, src, o.tod, o.now, CARD), shown: residents.length };
}

async function sheets (all: Resident[]) {
  const src = withProps(stableSprites());
  // a creature whose sheet won't load is left out rather than drawn as nothing
  await src.load(Herd.keys(all)).catch(() => undefined);
  return { src, residents: all.filter(r => src.get(r.sprite) && (!r.head || src.get(r.head))) };
}

function paintOne (o: StillOptions, residents: Resident[], src: ReturnType<typeof withProps>, tod: TimeOfDay, clock: Date, size: { w: number, h: number }): string {
  const world = new World(src, { seed: o.seed, w: size.w, h: size.h });
  const layer = new SceneLayer({ scene: o.scene, growth: o.growth, dailiesDone: o.dailiesDone, tod, season: o.season, moon: o.moon, feasts: o.feasts, years: o.years });
  world.addLayer(layer);
  // the date's events (a meteor shower, a shower of rain, a rainbow) stay out of pictures kept for a whole day
  world.addLayer(new AmbientLayer(layer, 'back', { shower: false, rainbow: false }));
  world.addLayer(new AmbientLayer(layer, 'front'));
  world.addLayer(new WeatherLayer(layer, { rain: false }));
  const herd = new Herd(world, {
    seed: o.herdSeed, still: () => true, clock: () => clock,
    ground: w => layer.walk(w), shadow: () => layer.shadow(), home: w => layer.door(w),
    spots: w => layer.spots(w), sky: () => ({ winter: o.season === 'winter', moon: o.moon }),
    ball: { draw: ballPicture(layer) },
  });
  herd.set(residents);
  // one tick: who sleeps at this hour lies down (still, nobody walks off)
  world.step();
  const canvas = document.createElement('canvas');
  canvas.width = size.w; canvas.height = size.h;
  const g = canvas.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  world.draw(g);
  return canvas.toDataURL('image/png');
}
