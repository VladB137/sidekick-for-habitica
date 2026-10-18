/* The engine's development page (playground.html): placeholder ground and grey placeholder creatures that
 * wander, hop when tapped and can be lifted with a long press. It exercises the core only; the look belongs
 * to the Stable design spec. Query: ?n=creatures&seed=text&still=1|0&sprites=real (Habitica's own pets and mounts) */
import { World, mountStage, placeholderSprites, type Entity, type Layer, type Stage } from './index';
import { stableSprites, parseKey } from '../stable/source';

const q = new URLSearchParams(location.search);
const real = q.get('sprites') === 'real';
const sprites = real ? stableSprites() : placeholderSprites();
const world = new World(sprites, { seed: q.get('seed') || 'dev' });
world.background = '#90A4AE';

const ground: Layer = {
  id: 'placeholder-ground', depth: 'back',
  draw (g, w) {
    const top = Math.floor(w.h * 0.35);
    g.fillStyle = '#78909C'; g.fillRect(0, top, w.w, w.h - top);
    g.fillStyle = '#546E7A'; g.fillRect(0, top, w.w, 3);
  },
};
world.addLayer(ground);

/** A stand-in creature: picks a spot, walks there a pixel at a time, rests; hops when tapped. */
interface Walker extends Entity { tx: number, ty: number, rest: number, hop: number, held: boolean }
const n = Math.max(0, Math.min(10, Number(q.get('n') ?? 5)));
const keys = real ? ['Wolf-Base', 'mount:Horse-Base', 'Cactus-Base', 'Raccoon-Base', 'Wolf-Cerberus'] : ['placeholder-pet', 'placeholder-hopper', 'placeholder-mount'];
/** which way a sprite points as drawn: mirror only to go the other way, and never a front-facing one */
const facing = (key: string) => (real ? parseKey(key)?.meta.facing ?? 'right' : 'right');
const rng = world.rng.fork('dev-walkers');
const groundTop = () => Math.floor(world.h * 0.35) + 12;
for (let i = 0; i < n; i++) {
  const e: Walker = {
    id: `c${i}`, sprite: keys[i % keys.length], x: 0, y: 0, tx: 0, ty: 0, rest: rng.int(0, 60), hop: 0, held: false,
    update (w) {
      if (this.hop > 0) { this.hop--; const t = this.hop / 12; this.lift = Math.round(24 * 4 * t * (1 - t)); }
      if (this.held) return;
      if (this.rest > 0) { this.rest--; return; }
      const dx = this.tx - this.x, dy = this.ty - this.y, d = Math.hypot(dx, dy);
      if (d < 1) { this.rest = rng.int(30, 120); this.tx = rng.int(24, w.w - 24); this.ty = rng.int(groundTop() + 60, w.h - w.insets.bottom - 2); return; }
      const v = 1.5; // world pixels per tick (45 a second: one 3-pixel art pixel every other tick)
      this.x += dx / d * Math.min(v, d); this.y += dy / d * Math.min(v, d);
      const f = facing(this.sprite);
      if (Math.abs(dx) > 0.5 && f !== 'front') this.flip = (dx < 0) === (f === 'right');
    },
  };
  world.add(e);
}
// spread them out once the world has a size
let placed = false;
const place: Layer = {
  id: 'dev-place', depth: 'back', draw () {},
  resize (w) {
    if (w.w < 120) return;
    for (const e of w.entities as Walker[]) {
      if (!placed) { e.x = rng.int(30, w.w - 30); e.y = rng.int(groundTop() + 60, w.h - 2); e.tx = e.x; e.ty = e.y; }
      e.x = Math.min(e.x, w.w - 12); e.y = Math.min(e.y, w.h - 2);
    }
    placed = true;
  },
};
world.addLayer(place);

const log: string[] = [];
const stillQ = q.get('still');
const stage: Stage = mountStage(document.getElementById('pg')!, {
  world, minW: 480, minH: 640, maxScale: 8, label: 'Playground engine test scene',
  still: stillQ === null ? undefined : stillQ === '1',
  interaction: {
    tap (p, s) { log.push(`tap ${p.hit ? p.hit.id : '-'} ${p.x},${p.y}`); const e = p.hit as Walker | null; if (e) { e.hop = 12; s.invalidate(); } },
    longPress (p) { log.push(`long ${p.hit ? p.hit.id : '-'}`); const e = p.hit as Walker | null; if (e) e.held = true; },
    drag (p, s) { const e = world.entities.find(x => (x as Walker).held) as Walker | undefined; if (e) { e.x = p.x; e.y = p.y; e.tx = p.x; e.ty = p.y; s.invalidate(); } },
    dragEnd (_, c) { log.push(`drop${c ? ' cancelled' : ''}`); for (const e of world.entities as Walker[]) e.held = false; },
  },
});
if (real) void sprites.load(keys).then(() => stage.invalidate());
// for tests/playground-e2e.cjs
Object.assign(window, { __pg: { stage, world, log, facing } });
