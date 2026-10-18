/*
 * Ground, light and night details (thread "Ground and night behaviours", package G of the species build plan):
 * grazing, burrowing and digging, mousing in the snow, rummaging, the lights, the flame puff, trails and the
 * full-moon howl, run in a headless herd. The wallpaper's Java replays the same (tools/gen-stable-fixtures.ts).
 */
import { World } from '../src/playground/world';
import { Herd, type Resident } from '../src/playground/creatures';
import { ART } from '../src/playground/particles';
import { emitPoint, glowing, startAct } from '../src/playground/behaviours/runner';
import { looksOf } from '../src/playground/behaviours';
import { natureOf } from '../src/stable/natures';
import type { Spot } from '../src/playground/behaviours/types';
import type { Gait, Facing, Sprite, SpriteSource } from '../src/playground/sprites';

let failures = 0, passes = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); }
};

function source (): SpriteSource {
  const cache = new Map<string, Sprite>();
  return {
    get (key) {
      let s = cache.get(key);
      if (s) return s;
      const [gait, facing] = key.split('_');
      const mount = key.startsWith('m');
      const w = mount ? 105 : 60, h = mount ? 105 : 60;
      s = { key, image: {} as CanvasImageSource, w, h, anchor: { x: w / 2, y: h - 1 }, gait: gait.replace(/^m/, '') as Gait, facing: facing as Facing, mask: new Uint8Array(w * h).fill(1) };
      cache.set(key, s);
      return s;
    },
    load: async () => {},
  };
}

interface Opts { hour: number, winter?: boolean, moon?: number, residents: Resident[], spots?: Spot[], seed?: string, still?: boolean, weather?: string }
function scene (o: Opts) {
  const w = new World(source(), { seed: o.seed ?? 'ground' });
  const at = { hour: o.hour };
  const herd = new Herd(w, {
    seed: 's', clock: () => new Date(2026, 9, 14, Math.floor(at.hour), Math.round((at.hour % 1) * 60)), still: () => !!o.still, ball: false,
    home: () => ({ x: 400, y: 560 }), spots: () => o.spots ?? [], sky: () => ({ winter: !!o.winter, moon: o.moon ?? 2 }), weather: () => o.weather ?? null,
  });
  herd.set(o.residents);
  w.resize(480, 640);
  return { w, herd, at };
}
const creature = (key: string, gait = 'four-legged', facing = 'right', spot?: { x: number, y: number }): Resident => {
  const mount = gait.startsWith('m');
  return { id: `${mount ? 'mount' : 'pet'}:${key}`, sprite: `${gait}_${facing}`, kind: mount ? 'mount' : 'pet', species: key.split('-')[0], spot, nature: natureOf(mount ? 'mount' : 'pet', key) };
};
const run = (w: World, n: number, each?: () => void) => { for (let i = 0; i < n; i++) { w.step(); each?.(); } };
const ids = (key: string) => natureOf('pet', key).acts.map(a => a.id).join();
/** does it, by itself, within n ticks (several creatures of a kind, so the pacing guard has its say) */
function happens (o: Opts, id: string, n: number, each?: (h: Herd) => void) {
  const { w, herd } = scene(o);
  let seen = false;
  run(w, n, () => { seen ||= herd.creatures.some(c => c.st === 'act' && c.act?.a.id === id); each?.(herd); });
  return { seen, herd, w };
}

/* ---- the table */
for (const s of ['Horse', 'Unicorn', 'Deer', 'Cow', 'Sheep', 'Alpaca', 'Mammoth', 'Triceratops']) check(`graze: ${s} grazes (and paws snow in winter)`, ids(`${s}-Base`).includes('graze,grazeSnow'));
check('table: Bunny burrows, Badger digs, Fox mouses, Raccoon rummages, Dragon puffs flame, Wolf howls, Cow moos',
  ids('Bunny-Base').includes('burrow') && ids('Badger-Base') === 'dig' && ids('Fox-Base').includes('mousing') && ids('Raccoon-Base') === 'rummageDoor,rummageLantern'
  && ids('Dragon-Base') === 'flame' && ids('Wolf-Base').includes('howl') && ids('Cow-Base').includes('moo'));
check('table: lights and trails', !!natureOf('pet', 'JackOLantern-Base').glow && !!natureOf('pet', 'Phoenix-Base').glow?.fx && !!natureOf('pet', 'Robot-Base').glow
  && !!natureOf('pet', 'Unicorn-Base').pace.trail && !!natureOf('pet', 'Snail-Base').pace.trail && !!natureOf('pet', 'TRex-Base').pace.trail);
check('table: the Wolf stays out until 20:30, the Cerberus pup keeps the night', natureOf('pet', 'Wolf-Base').schedule.home!.join() === '20.5,6' && natureOf('pet', 'Wolf-Cerberus').schedule.home!.join() === '0,0');
{
  const looks = looksOf(['Horse', 'Bunny', 'Fox', 'Raccoon', 'Phoenix', 'Robot', 'Dragon', 'Unicorn', 'Snail', 'TRex', 'Wolf'].map(s => natureOf('pet', `${s}-Base`)));
  const want = ['grass', 'snowbit', 'mound', 'drift', 'dirt', 'scrap', 'ember', 'led', 'flame', 'twinkle', 'slime', 'dust', 'note'];
  check('looks: every particle they give off goes to the wallpaper', want.every(k => k in looks), want.filter(k => !(k in looks)).join());
  check('nature: still plain data', JSON.stringify(JSON.parse(JSON.stringify(natureOf('pet', 'Phoenix-Base')))) === JSON.stringify(natureOf('pet', 'Phoenix-Base')));
}

/* ---- grazing */
{
  const herds = ['Horse', 'Cow', 'Sheep', 'Deer'].map((s, i) => creature(`${s}-Base`, 'four-legged', 'right', { x: 0.15 + i * 0.25, y: 0.5 }));
  let grass = 0, snow = 0, down = false;
  const r = happens({ hour: 10, residents: herds }, 'graze', 6000, h => {
    grass = Math.max(grass, h.particles.filter(p => p.kind === 'grass').length); snow += h.particles.filter(p => p.kind === 'snowbit').length;
    down ||= h.creatures.some(c => c.act?.a.id === 'graze' && c.sq === 1);
  });
  check('graze: they graze by day, heads down, grass flicking up', r.seen && down && grass > 0 && snow === 0);
  check('graze: winter paws the snow instead', happens({ hour: 10, winter: true, residents: herds }, 'grazeSnow', 6000).seen);
  check('graze: never at night', !happens({ hour: 23, residents: herds.map(h => ({ ...h, nature: { ...h.nature!, schedule: { sleep: [0, 0], home: [0, 0] } } })) }, 'graze', 3000).seen);
}

/* ---- under the ground */
{
  const { w, herd } = scene({ hour: 12, residents: [creature('Bunny-Base', 'sitting')] });
  const c = herd.creatures[0];
  c.setPos(240, 600); c.idle(9999); c.dir = 1;
  const x0 = c.fx;
  startAct(c, c.nature!.acts.find(a => a.id === 'burrow')!);
  let hidden = false, mounds = 0, x1 = 0, under = false, done = false, whole = false;
  run(w, 400, () => {
    if (done) return;
    if (c.st !== 'act') { done = true; whole = c.st === 'idle' && c.off === 0 && c.clipBelow === undefined && c.tx === c.fx; return; }
    hidden ||= c.off <= -40 * ART && c.clipBelow === c.y + 1;
    under ||= hidden && herd.particles.filter(p => p.kind === 'mound').length >= 1;
    mounds = Math.max(mounds, herd.particles.filter(p => p.kind === 'mound').length);
    x1 = c.fx;
  });
  check('burrow: sinks out of sight below the ground, a mound where it went in', hidden && under);
  check('burrow: comes up 18 art pixels along, through a second mound', Math.abs(x1 - (x0 + 18 * ART)) <= ART && mounds === 2, `${x1 - x0} ${mounds}`);
  check('burrow: then whole again, idle', done && whole);
  const edge = scene({ hour: 12, residents: [creature('Bunny-Base', 'sitting')] });
  const e = edge.herd.creatures[0];
  e.setPos(470, 600); e.idle(9999); e.dir = 1;
  startAct(e, e.nature!.acts.find(a => a.id === 'burrow')!);
  run(edge.w, 400);
  check('burrow: never comes up outside the world', e.fx <= 480 - e.half(edge.w));
  check('burrow: in winter through snow drifts', happens({ hour: 12, winter: true, residents: [creature('Bunny-A', 'sitting'), creature('Bunny-B', 'sitting')].map(r => ({ ...r, nature: natureOf('pet', 'Bunny-Base') })) }, 'burrowSnow', 12000).seen);
}
{
  const r = happens({ hour: 1, residents: ['A', 'B'].map(k => ({ ...creature(`Badger-${k}`), nature: natureOf('pet', 'Badger-Base') })) }, 'dig', 12000);
  let deepest = 0;
  const { w, herd } = scene({ hour: 1, residents: [creature('Badger-Base')] });
  const c = herd.creatures[0];
  c.idle(9999); startAct(c, c.nature!.acts[0]);
  run(w, 200, () => { deepest = Math.min(deepest, c.off); });
  check('dig: the badger digs at night, down 3 art pixels into its hole, dirt flying', r.seen && deepest === -3 * ART);
  check('dig: leaves a mound', herd.particles.some(p => p.kind === 'mound'));
}
{
  const fox = ['A', 'B', 'C'].map(k => ({ ...creature(`Fox-${k}`), nature: natureOf('pet', 'Fox-Base') }));
  let high = 0, buried = false;
  const r = happens({ hour: 10, winter: true, residents: fox }, 'mousing', 12000, h => {
    for (const c of h.creatures) if (c.act?.a.id === 'mousing') { high = Math.max(high, c.lift); buried ||= c.off === -8 * ART && c.clipBelow !== undefined; }
  });
  check('mousing: in the snow, a high leap and a dive to the shoulders', r.seen && high >= 9 * ART && buried, `${high}`);
  check('mousing: never without snow', !happens({ hour: 10, residents: fox }, 'mousing', 6000).seen);
}

/* ---- rummaging */
{
  const lantern: Spot = { kind: 'lantern', x: 100, y: 560, w: 0, h: 0 };
  let near = false;
  const r = happens({ hour: 22, residents: ['A', 'B'].map(k => ({ ...creature(`Raccoon-${k}`), nature: natureOf('pet', 'Raccoon-Base') })), spots: [lantern] }, 'rummageLantern', 15000, h => {
    for (const c of h.creatures) if (c.act?.a.id === 'rummageLantern') near ||= Math.abs(c.fx - lantern.x) < 20 * ART;
  });
  check('rummage: walks to the lantern at night and rummages there', r.seen && near);
  check('rummage: and by the door', happens({ hour: 22, residents: ['A', 'B'].map(k => ({ ...creature(`Raccoon-${k}`), nature: natureOf('pet', 'Raccoon-Base') })) }, 'rummageDoor', 15000).seen);
  check('rummage: not by day', !happens({ hour: 12, residents: ['A', 'B'].map(k => ({ ...creature(`Raccoon-${k}`), nature: natureOf('pet', 'Raccoon-Base') })), spots: [lantern] }, 'rummageLantern', 6000).seen);
}

/* ---- lights */
function glowOps (key: string, hour: number, still = false) {
  const { w, herd } = scene({ hour, residents: [creature(key, 'sitting')], still });
  const ops: string[] = [];
  const g = { fillStyle: '', fillRect (x: number, y: number) { ops.push(`${g.fillStyle} ${x} ${y}`); }, drawImage () {}, save () {}, restore () {}, translate () {}, scale () {} };
  for (const l of w.layers) if (l.id === 'glows') l.draw(g as unknown as CanvasRenderingContext2D, w);
  return { ops, c: herd.creatures[0], w, herd };
}
{
  const night = glowOps('JackOLantern-Base', 22), day = glowOps('JackOLantern-Base', 12);
  const c = night.c;
  check('glow: the JackOLantern lights the ground around it at night, none by day', night.ops.length > 10 && day.ops.length === 0, `${night.ops.length}`);
  check('glow: a pool of art pixels around its feet, 7 across each way, a third as deep', night.ops.every(o => {
    const [, x, y] = o.split(' ').map(Number);
    return (x - c.x) % ART === 0 && Math.abs(x - c.x) <= 7 * ART && Math.abs(y - (c.y + 1)) <= 2 * ART;
  }));
  check('glow: inner half denser, warm colours', night.ops.some(o => o.startsWith('#FFCC80')) && night.ops.some(o => o.startsWith('#FB8C00')));
  night.w.tick += 8;
  const later: string[] = [];
  const g = { fillStyle: '', fillRect (x: number, y: number) { later.push(`${g.fillStyle} ${x} ${y}`); } };
  for (const l of night.w.layers) if (l.id === 'glows') l.draw(g as unknown as CanvasRenderingContext2D, night.w);
  check('glow: it flickers', later.join() !== night.ops.join());
  check('glow: on the ground under everyone (a back layer, before the creatures)', night.w.layers.findIndex(l => l.id === 'glows') < night.w.layers.findIndex(l => l.id === 'creatures') && night.w.layers.find(l => l.id === 'glows')!.depth === 'back');
  const still = glowOps('JackOLantern-Base', 22, true);
  check('glow: shown in the still picture too', still.ops.length > 10);
}
{
  const { w, herd } = scene({ hour: 22, residents: [creature('Phoenix-Base', 'flying')] });
  let embers = 0, rose = false;
  const seen = new Map<object, number>();
  run(w, 300, () => {
    for (const p of herd.particles) if (p.kind === 'ember') { if (!seen.has(p)) seen.set(p, p.y); else rose ||= p.y < seen.get(p)!; }
    embers = Math.max(embers, herd.particles.filter(p => p.kind === 'ember').length);
  });
  check('embers: the Phoenix glows and gives off rising embers at night', !!glowing(herd.creatures[0], herd.now()) && embers >= 2 && rose);
  const day = scene({ hour: 12, residents: [creature('Phoenix-Base', 'flying')] });
  run(day.w, 300);
  check('embers: none by day', !day.herd.particles.some(p => p.kind === 'ember'));
}
{
  const { w, herd } = scene({ hour: 23, residents: [creature('Robot-Base', 'four-legged', 'front')] });
  const leds = new Set<object>();
  run(w, 400, () => { for (const p of herd.particles) if (p.kind === 'led') leds.add(p); });
  const led = leds.size;
  check('robot: powered down at night (asleep) with a blinking light every 2 s', herd.creatures[0].asleep && led >= 5 && led <= 8, `${led}`);
}

/* ---- the flame puff */
{
  for (const dir of [1, -1]) {
    const { w, herd } = scene({ hour: 12, residents: [creature('Dragon-Base')] });
    const c = herd.creatures[0];
    c.setPos(240, 600); c.idle(9999); c.dir = dir;
    const nose = emitPoint(c, { kind: 'flame', at: 'nose', life: 1 }, w);
    check(`nose: the front edge, a quarter down (facing ${dir})`, nose.x === c.x + dir * c.half(w) && nose.y === c.y - 59 + 15);
    startAct(c, c.nature!.acts[0]);
    let ahead = true, smoke = false, n = 0;
    run(w, 40, () => {
      for (const p of herd.particles) if (p.kind === 'flame') { n++; ahead &&= dir * (p.x - c.x) >= c.half(w); smoke ||= p.t >= 12 && p.t < p.life; }
    });
    check(`flame: puffs from its nose, ahead of it whichever way it faces (${dir})`, n > 0 && ahead && smoke);
  }
}

/* ---- taps (Ball and touch's Touch.tap) */
{
  const { w, herd } = scene({ hour: 12, residents: [creature('Dragon-Base', 'four-legged', 'right', { x: 0.3, y: 0.5 }), creature('Robot-Base', 'four-legged', 'front', { x: 0.7, y: 0.5 })] });
  const [dragon, robot] = herd.creatures;
  run(w, 2);
  herd.pet(dragon.id); herd.pet(robot.id);
  const kinds = new Set<string>();
  run(w, 12, () => { for (const p of herd.particles) kinds.add(p.kind); });
  check('tap: the Dragon puffs flame instead of the happy hop, heart as usual', dragon.act?.a.id === 'tap' && kinds.has('flame') && kinds.has('heart'));
  check('tap: the Robot beeps and blinks', robot.act?.a.id === 'tap' && kinds.has('beep') && kinds.has('led'));
}

/* ---- trails */
{
  const trail = (key: string, gait: string, kind: string, hour: number) => {
    const { w, herd } = scene({ hour, residents: [creature(key, gait)] });
    const c = herd.creatures[0];
    c.setPos(100, 600); c.idle(9999);
    c.goTo(400, 600);
    let k = 0, behind = true;
    run(w, 90, () => { for (const p of herd.particles) if (p.kind === kind && p.t === 0) { k++; behind &&= p.x < c.x; } });
    return { k, behind };
  };
  const dusk = trail('Unicorn-Base', 'four-legged', 'twinkle', 19), noon = trail('Unicorn-Base', 'four-legged', 'twinkle', 12);
  check('sparkle: the Unicorn trots with a sparkle trail in the evening, none by day', dusk.k >= 10 && dusk.behind && noon.k === 0, `${dusk.k}`);
  const snail = trail('Snail-Base', 'legless', 'slime', 23);
  check('slime: the Snail leaves a shiny trail behind it', snail.k >= 10 && snail.behind, `${snail.k}`);
  const rex = trail('TRex-Base', 'upright', 'dust', 12);
  check('stomp: the TRex\'s steps puff dust', rex.k >= 8 && rex.behind, `${rex.k}`);
}

/* ---- the howl */
{
  const pack = (moon: number) => scene({ hour: 19.5, moon, residents: [creature('Wolf-Base', 'four-legged', 'right', { x: 0.5, y: 0.5 }), creature('Dog-Base', 'four-legged', 'right', { x: 0.8, y: 0.5 })] });
  const full = pack(4);
  const [wolf, dog] = full.herd.creatures;
  wolf.idle(9999); dog.idle(9999); dog.dir = 1;
  startAct(wolf, wolf.nature!.acts.find(a => a.id === 'howl')!);
  let notes = 0;
  run(full.w, 50, () => { notes = Math.max(notes, full.herd.particles.filter(p => p.kind === 'note').length); });
  check('howl: at the full moon it sits, lifts its head and howls', notes >= 2 && dog.dir === -1);
  check('howl: the creatures near it turn to look', dog.dir === (wolf.fx > dog.fx ? 1 : -1));
  check('howl: on its own on a full-moon evening', happens({ hour: 19.5, moon: 4, residents: ['A', 'B'].map(k => ({ ...creature(`Wolf-${k}`), nature: natureOf('pet', 'Wolf-Base') })) }, 'howl', 9000).seen);
  check('howl: never on other nights', !happens({ hour: 19.5, moon: 3, residents: ['A', 'B'].map(k => ({ ...creature(`Wolf-${k}`), nature: natureOf('pet', 'Wolf-Base') })) }, 'howl', 6000).seen);
}
/* ---- the Dragon's ring on snowy nights (Pets together's signature pair, on the flame) */
{
  const social = (r: Resident): Resident => ({ ...r, temper: 'usual', bonds: [] });
  const { w, herd } = scene({ hour: 19.5, winter: true, weather: 'snow', residents: [
    social(creature('Dragon-Base', 'four-legged', 'right', { x: 0.2, y: 0.5 })), social(creature('Dog-Base', 'four-legged', 'right', { x: 0.9, y: 0.1 })),
    social(creature('Bunny-Base', 'sitting', 'right', { x: 0.6, y: 0.9 })), social(creature('Cow-Base', 'four-legged', 'right', { x: 0.8, y: 0.6 })),
    social(creature('Sheep-Base', 'four-legged', 'right', { x: 0.5, y: 0.2 })), { ...creature('Wolf-Base', 'four-legged', 'right', { x: 0.95, y: 0.95 }), temper: 'usual', bonds: [], cold: true },
  ] });
  const [dragon, ...rest] = herd.creatures;
  const x0 = dragon.fx, y0 = dragon.fy;
  run(w, 4000);
  const round = rest.slice(0, 4).filter(c => Math.abs(c.fx - dragon.fx) <= dragon.half(w) + c.half(w) + 16 * ART && Math.abs(c.fy - dragon.fy) <= 20 * ART);
  check('hearth: on a snowy evening the Dragon stays where it is, not at the door', dragon.fx === x0 && dragon.fy === y0);
  check('hearth: the others settle round it, on both sides', round.length >= 3 && round.some(c => c.fx < dragon.fx) && round.some(c => c.fx > dragon.fx), rest.map(c => `${Math.round(c.fx)},${Math.round(c.fy)}`).join(' '));
  check('hearth: it glows on winter nights', !!glowing(dragon, herd.now()));
  const plain = scene({ hour: 19.5, winter: true, residents: [social(creature('Dragon-Base', 'four-legged', 'right', { x: 0.2, y: 0.5 })), social(creature('Dog-Base'))] });
  run(plain.w, 2000);
  check('hearth: without snow the Dragon goes home like everyone', Math.abs(plain.herd.creatures[0].fx - 400) < 40 * ART);
}
check('moo: the Cow moos by day', happens({ hour: 10, residents: ['A', 'B'].map(k => ({ ...creature(`Cow-${k}`), nature: natureOf('pet', 'Cow-Base') })) }, 'moo', 12000).seen);

if (failures) { console.log(`FAIL  ground natures: ${failures} of ${passes + failures} checks failed`); process.exit(1); }
console.log(`PASS  ground natures: all ${passes} checks (grazing, burrow, dig, mousing, rummage, lights, flame, taps, trails, howl, moo, the Dragon's ring)`);
