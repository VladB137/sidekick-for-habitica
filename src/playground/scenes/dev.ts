/* The scenes' development page (scenes.html, test builds only). Query:
 *   scene=meadow|lake|pine|cove|bamboo|marsh|mushroom  tod=dawn|day|dusk|night  season=spring|summer|autumn|winter
 *   moon=0..7 (new, waxing crescent, first quarter, waxing gibbous, full, waning gibbous, last quarter, waning crescent)
 *   days, perfect, streak (longest Daily streak, days), level, quests (growth)  dailies=0|1  ball=0|1  still=0|1  top, bottom (bar insets, CSS px)
 *   shower=0|1 (a meteor shower tonight)  rain=0|1  rainbow=0|1 (else all three from the date)  tick=n (start the world's clock here)
 *   feast=birthday,habitoween,... (feasts.ts) years=N (anniversary)  pets=Wolf-Base,mount:Horse-Base,... (Habitica's sprites, spots seeded)
 *   gallery=1: every scene side by side, still. The ball can be dragged and flicked. */
import { World, Herd, mountStage, placeholderSprites, type Resident, type Stage } from '../index';
import { stableSprites } from '../../stable/source';
import { spriteMeta } from '../../stable/sprites';
import { NameTagLayer } from '../../app/stable/nametag';
import { SweetheartsLayer } from '../../app/stable/sweethearts';
import { FireworksLayer } from './fireworks';
import type { Feast } from './feasts';
import { TROPHY_KEYS } from './trophies';
import { AmbientLayer, SceneLayer, WeatherLayer, withProps, ballPicture, SCENE_IDS, SCENES, type SceneId, type SceneLayerOptions, type TimeOfDay, type Season, type MoonPhase } from './index';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => q.has(k) ? Number(q.get(k)) : d;
// trophies=all, or a comma list of Habitica achievement keys
const trophiesQ = () => (q.get('trophies') === 'all' ? TROPHY_KEYS : (q.get('trophies') || '').split(',').filter(Boolean));
const opts = (scene: SceneId): SceneLayerOptions => ({
  scene,
  tod: (q.get('tod') as TimeOfDay) || undefined,
  season: (q.get('season') as Season) || undefined,
  moon: q.has('moon') ? (Number(q.get('moon')) as MoonPhase) : undefined,
  dailiesDone: q.get('dailies') !== '0',
  feasts: (q.get('feast')?.split(',').filter(Boolean) as Feast[] | undefined) ?? undefined,
  years: q.has('years') ? Number(q.get('years')) : undefined,
  growth: { checkIns: num('days', 420), perfectDays: num('perfect', 64), streakDays: num('streak', 14), level: num('level', 34), quests: num('quests', 5), trophies: trophiesQ() },
});

function build (host: HTMLElement, scene: SceneId, still: boolean | undefined, withBall: boolean) {
  const pets = (q.get('pets') ?? '').split(',').filter(Boolean);
  const world = new World(withProps(pets.length ? stableSprites() : placeholderSprites()), { seed: `scenes:${scene}` });
  const layer = new SceneLayer(opts(scene));
  world.addLayer(layer);
  const flag = (k: string) => q.has(k) ? q.get(k) === '1' : undefined;
  world.addLayer(new AmbientLayer(layer, 'back', { shower: flag('shower'), rainbow: flag('rainbow') }));
  world.addLayer(new AmbientLayer(layer, 'front'));
  world.addLayer(new WeatherLayer(layer, { rain: flag('rain') }));
  if (q.has('tick')) world.tick = num('tick', 0);
  // New Year's rockets (still=0 at dusk or night)
  const fireworks = new FireworksLayer(layer, () => stage.still);
  fireworks.on = !!layer.options.feasts?.includes('nye');
  world.addLayer(fireworks);
  // no creatures here (that is creatures.html): the herd brings the ball and its flick
  const herd = new Herd(world, {
    seed: `scenes:${scene}`, ground: w => layer.walk(w), shadow: () => layer.shadow(), home: w => layer.door(w),
    ball: withBall ? { draw: ballPicture(layer) } : false,
  });
  // Valentine's hearts between two of a kind standing close (still=0, with pets=)
  const hearts = new SweetheartsLayer(herd);
  hearts.on = !!layer.options.feasts?.includes('valentines');
  world.addLayer(hearts);
  const stage: Stage = mountStage(host, { world, minW: 480, minH: 640, maxScale: 8, still, label: `${SCENES[scene].name} scene`, interaction: herd.interaction });
  herd.attach(stage);
  if (pets.length) {
    const rs = pets.flatMap((k, i): Resident[] => {
      const mount = k.startsWith('mount:'), m = spriteMeta(mount ? 'mount' : 'pet', mount ? k.slice(6) : k);
      if (!m) return [];
      return [mount ? { id: `c${i}`, sprite: `mount:${m.key}`, head: `mount:${m.key}#head`, kind: 'mount', species: m.species } : { id: `c${i}`, sprite: m.key, kind: 'pet', species: m.species }];
    });
    void world.sprites.load(Herd.keys(rs)).then(() => {
      herd.set(rs);
      // tags=1: every name over its head, as on Naming Day
      if (q.get('tags') === '1') {
        const names = ['Ruby', 'Pip', 'Bao', 'Clover', 'Mira', 'Tudor', 'Ana', 'Fig'];
        const tags = new NameTagLayer(herd, id => names[Number(id.slice(1)) % names.length]);
        world.addLayer(tags);
        for (const r of rs) tags.show(r.id, Infinity);
      }
      stage.invalidate();
    });
  }
  if (q.has('top') || q.has('bottom')) stage.setInsets({ top: num('top', 0), bottom: num('bottom', 0) });
  return { stage, world, layer, herd, ball: herd.ball, fireworks, hearts };
}

const root = document.getElementById('pg')!;
const stillQ = q.get('still');
if (q.get('gallery') === '1') {
  root.id = 'gallery';
  root.style.position = 'static';
  const tiles = SCENE_IDS.map(id => {
    const fig = document.createElement('figure');
    const tile = document.createElement('div'); tile.className = 'tile';
    const cap = document.createElement('figcaption'); cap.textContent = SCENES[id].name;
    fig.append(tile, cap); root.appendChild(fig);
    return build(tile, id, true, true);
  });
  Object.assign(window, { __scenes: { tiles } });
} else {
  const scene = (q.get('scene') as SceneId) || 'meadow';
  const pg = build(root, scene, stillQ === null ? undefined : stillQ === '1', q.get('ball') !== '0');
  // for tests/scenes-e2e.cjs
  Object.assign(window, { __scenes: pg });
}
