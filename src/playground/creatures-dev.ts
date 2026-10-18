/* The creatures' development page (creatures.html, test builds only): a herd of every gait on placeholder
 * ground, with the ball. Placeholder sprites until the sprite catalogue's adapter lands; the meadow's look
 * belongs to the scenes module. Query: ?n=creatures&seed=text&still=1|0&hour=0-23 (phone clock)
 * &species=Dog,Ferret,... (in place of the list's, each living by its species' nature, src/stable/natures.ts) */
import { World, Herd, mountStage, placeholderSprites, type Layer, type Resident } from './index';
import { natureOf } from '../stable/natures';

const q = new URLSearchParams(location.search);
const world = new World(placeholderSprites(), { seed: q.get('seed') || 'creatures' });
world.background = '#B3E5FC';

const ground: Layer = {
  id: 'placeholder-ground', depth: 'back',
  draw (g, w) {
    const top = Math.floor(w.h * 0.5 / 3) * 3;
    g.fillStyle = '#9CCC65'; g.fillRect(0, top, w.w, w.h - top);
    g.fillStyle = '#7CB342'; g.fillRect(0, top, w.w, 3);
  },
};
world.addLayer(ground);

const KEYS: [string, Resident['kind'], string][] = [
  ['placeholder-pet', 'pet', 'Wolf'], ['placeholder-sitter', 'pet', 'LionCub'], ['placeholder-leaper', 'pet', 'Deer'],
  ['placeholder-hopper', 'pet', 'Snake'], ['placeholder-flyer', 'pet', 'Parrot'], ['placeholder-mount', 'mount', 'Wolf'],
  ['placeholder-pet', 'pet', 'Wolf'], ['placeholder-sitter', 'pet', 'TigerCub'], ['placeholder-pet', 'pet', 'Fox'], ['placeholder-hopper', 'pet', 'Cactus'],
];
const n = Math.max(0, Math.min(10, Number(q.get('n') ?? 6)));
const hour = q.get('hour');
const log: string[] = [];
const herd = new Herd(world, {
  seed: 'dev',
  shadow: () => '#689F38',
  home: w => ({ x: Math.round(w.w * 0.2), y: Math.round(w.h * 0.6) }),
  clock: hour === null ? undefined : () => { const d = new Date(2026, 9, 14, Number(hour), 0); return d; },
  onMoved: (id, spot) => log.push(`moved ${id} ${spot.x.toFixed(2)},${spot.y.toFixed(2)}`),
  haptic: () => log.push('haptic'),
});
const species = q.get('species')?.split(',');
herd.set(KEYS.slice(0, n).map(([sprite, kind, sp], i) => {
  const own = species?.[i];
  return own ? { id: `c${i}`, sprite, kind, species: own, nature: natureOf(kind, `${own}-Base`) } : { id: `c${i}`, sprite, kind, species: sp };
}));

const stillQ = q.get('still');
const stage = mountStage(document.getElementById('pg')!, {
  world, minW: 480, minH: 640, maxScale: 8, label: 'Stable creatures test scene',
  still: stillQ === null ? undefined : stillQ === '1',
  interaction: herd.interaction,
});
herd.attach(stage);
// for tests/creatures-e2e.cjs
Object.assign(window, { __pg: { stage, world, herd, log } });
