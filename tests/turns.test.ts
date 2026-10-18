/*
 * Quarter turns without a browser (package R, P6): the turn arithmetic (src/playground/turns.ts) pixel by pixel,
 * and the behaviours built on it in a herd: rolling, the Hedgehog's curl, the Otter floating on its back, the Sloth
 * hanging, the Penguin's belly slide; never under a rider. The wallpaper's Java does the same, tick by tick
 * (tools/gen-stable-fixtures.ts scenario "turns").
 */
import { World } from '../src/playground/world';
import { Herd, type Resident } from '../src/playground/creatures';
import { ART } from '../src/playground/particles';
import { choose, startAct } from '../src/playground/behaviours/runner';
import { screenTurns, turnMatrix, turnedBox, turnedPart, turnedPixel } from '../src/playground/turns';
import { natureOf } from '../src/stable/natures';
import type { Spot } from '../src/playground/behaviours/types';
import type { Gait, Facing, Sprite, SpriteSource } from '../src/playground/sprites';

let failures = 0, passes = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); }
};

/* ---- the arithmetic, pixel by pixel */

/** where each picture pixel lands when drawn through the matrix: pixel centres, as a canvas samples them */
function land (q: number, flip: boolean, W: number, H: number, sx: number, sy: number, w: number, h: number, dx: number, dy: number) {
  const [a, b, c, d, e, f] = turnMatrix(q, flip, w, h, dx, dy);
  const out = new Map<string, string>();
  for (let v = 0; v < h; v++) {
    for (let u = 0; u < w; u++) {
      const x = a * (u + 0.5) + c * (v + 0.5) + e, y = b * (u + 0.5) + d * (v + 0.5) + f;
      out.set(`${Math.floor(x)},${Math.floor(y)}`, `${sx + u},${sy + v}`);
    }
  }
  void W; void H;
  return out;
}

{
  let exact = true, inverse = true, cuts = true, rotation = true;
  for (const [W, H] of [[60, 57], [42, 51], [36, 36], [45, 31]]) {
    for (const flip of [false, true]) {
      for (let q = 0; q < 4; q++) {
        const box = turnedBox(W, H, 100, 200, q);
        const whole = land(q, flip, W, H, 0, 0, W, H, box.x, box.y);
        // every picture pixel on its own world pixel, all inside the box
        exact &&= whole.size === W * H && [...whole.keys()].every(k => { const [x, y] = k.split(',').map(Number); return x >= box.x && y >= box.y && x < box.x + box.w && y < box.y + box.h; });
        // hit-testing reads back the same pixel
        inverse &&= [...whole].every(([k, v]) => { const [x, y] = k.split(',').map(Number), p = turnedPixel(W, H, flip, q, box, x, y); return !!p && `${p.px},${p.py}` === v; });
        // the definition: mirror, then turn clockwise: the picture's top-left pixel goes where it should
        const tl = whole.get(q === 0 ? (flip ? `${box.x + W - 1},${box.y}` : `${box.x},${box.y}`)
          : q === 1 ? (flip ? `${box.x + H - 1},${box.y + W - 1}` : `${box.x + H - 1},${box.y}`)
            : q === 2 ? (flip ? `${box.x},${box.y + H - 1}` : `${box.x + W - 1},${box.y + H - 1}`)
              : (flip ? `${box.x},${box.y}` : `${box.x},${box.y + W - 1}`));
        rotation &&= tl === '0,0';
        // cut short at any line: exactly the whole picture's pixels above it
        for (let k = 1; k < box.h; k += 7) {
          const cut = box.y + k, p = turnedPart(W, H, flip, q, box, cut)!;
          const part = land(q, flip, W, H, p.x, p.y, p.w, p.h, p.dx, p.dy);
          const want = [...whole].filter(([key]) => Number(key.split(',')[1]) < cut);
          cuts &&= part.size === want.length && want.every(([key, v]) => part.get(key) === v);
        }
        cuts &&= turnedPart(W, H, flip, q, box, box.y) === null;
      }
    }
  }
  check('turns: every picture pixel lands on one world pixel inside the box', exact);
  check('turns: mirrored first, then turned clockwise', rotation);
  check('turns: hit-testing maps a world pixel back to its picture pixel', inverse);
  check('turns: the cut line keeps exactly the rows above it', cuts);
  const odd = turnedBox(42, 51, 100, 200, 1), even = turnedBox(42, 51, 100, 200, 2);
  check('turns: the bottom stays on the ground, centred on the art grid', odd.y + odd.h === 251 && even.y === 200 && (odd.x - 100) % ART === 0 && odd.w === 51);
  check('turns: forward is clockwise facing right, anticlockwise facing left', screenTurns(1, 1) === 1 && screenTurns(1, -1) === 3 && screenTurns(2, -1) === 2 && screenTurns(0, -1) === 0);
}

/* ---- in a herd */

function source (): SpriteSource {
  const cache = new Map<string, Sprite>();
  return {
    get (key) {
      let s = cache.get(key);
      if (s) return s;
      const [gait, facing] = key.split('_');
      const mount = key.startsWith('m');
      const w = mount ? 105 : 51, h = mount ? 105 : 45;
      s = { key, image: {} as CanvasImageSource, w, h, anchor: { x: Math.floor(w / 2), y: h - 1 }, gait: gait.replace(/^m/, '') as Gait, facing: facing as Facing, mask: new Uint8Array(w * h).fill(1) };
      cache.set(key, s);
      return s;
    },
    load: async () => {},
  };
}

interface Opts { hour: number, winter?: boolean, residents: Resident[], spots?: Spot[] }
function scene (o: Opts) {
  const w = new World(source(), { seed: 'turns' });
  const herd = new Herd(w, {
    seed: 's', clock: () => new Date(2026, 9, 14, Math.floor(o.hour), Math.round((o.hour % 1) * 60)), still: () => false, ball: false,
    home: () => ({ x: 400, y: 560 }), spots: () => o.spots ?? [], sky: () => ({ winter: !!o.winter, moon: 2 }),
  });
  herd.set(o.residents);
  w.resize(480, 640);
  return { w, herd };
}
const creature = (key: string, gait = 'four-legged', facing = 'right'): Resident => {
  const mount = gait.startsWith('m');
  return { id: `${mount ? 'mount' : 'pet'}:${key}`, sprite: `${gait}_${facing}`, kind: mount ? 'mount' : 'pet', species: key.split('-')[0], nature: natureOf(mount ? 'mount' : 'pet', key) };
};
const run = (w: World, n: number, each?: () => void) => { for (let i = 0; i < n; i++) { w.step(); each?.(); } };

/** what a creature draws: plain cells, or turned ones (with the quarter read off the matrix) */
function drawn (c: Herd['creatures'][number], w: World) {
  const ops: string[] = [];
  let m: number[] | null = null;
  const g = {
    fillStyle: '', fillRect: () => ops.push('shadow'), save () {}, restore () { m = null; }, translate () {}, scale () {},
    transform (...a: number[]) { m = a; },
    drawImage (...a: number[]) { ops.push(m ? `turned ${m.join(',')} ${a[3]}x${a[4]}` : `cell ${a[3]}x${a[4]}`); },
  };
  c.draw(g as unknown as CanvasRenderingContext2D, w);
  return ops;
}

{
  check('table: Yarn rolls on every walk, Armadillo and Hedgehog now and then', natureOf('pet', 'Yarn-Base').pace.roll?.p === 1 && natureOf('pet', 'Armadillo-Base').pace.roll!.p < 1 && natureOf('pet', 'Hedgehog-Base').pace.roll!.p < 1);
  check('table: the Hedgehog curls up when held', natureOf('pet', 'Hedgehog-Base').touch?.hold?.rot === 1);
  check('table: Otter floats, Sloth hangs, Penguin belly-slides', ['Otter-Base:float', 'Sloth-Base:hang', 'Penguin-Base:bellySlide'].every(s => { const [k, id] = s.split(':'); return natureOf('pet', k).acts.some(a => a.id === id); }));
}
{
  // Yarn: every walk a roll, a quarter turn forward every 8 ticks, upright again when it stops
  const { w, herd } = scene({ hour: 12, residents: [creature('Yarn-Base', 'sitting', 'front')] });
  const c = herd.creatures[0];
  const seen = new Set<number>();
  let idleTurned = false, stepped = true, last = -1, moving = 0;
  run(w, 3000, () => {
    if (c.st === 'move') { moving++; seen.add(c.rot); if (last >= 0 && c.rot !== last && c.rot !== (last + 1) % 4) stepped = false; last = c.rot; } else { last = -1; }
    if (c.st === 'idle' && c.rot) idleTurned = true;
  });
  check('roll: yarn rolls through all four quarters as it goes, a quarter at a time', moving > 100 && seen.size === 4 && stepped, [...seen].join());
  check('roll: upright again when it stops', !idleTurned);
  // turned while rolling: drawn whole through an exact quarter matrix, its shadow the turned width
  run(w, 3000, () => {});
  for (let i = 0; i < 2000 && !(c.st === 'move' && c.rot % 2 === 1); i++) w.step();
  const ops = drawn(c, w);
  check('roll: drawn turned, one cell, integers only', ops.length === 2 && ops[0] === 'shadow' && /^turned (-?[01],){4}-?\d+,-?\d+ 51x45$/.test(ops[1]), ops.join(' | '));
  // a tap stops the roll
  herd.pet(c.id);
  w.step();
  check('roll: a tap makes it hop upright', c.st === 'happy' && c.rot === 0);
}
{
  // a ridden armadillo mount never rolls, and nothing turned is chosen for it
  const { w, herd } = scene({ hour: 23, residents: [creature('Armadillo-Red', 'mfour-legged', 'left'), creature('Penguin-Base', 'upright', 'right')], winter: true });
  const m = herd.creatures[0], p = herd.creatures[1];
  herd.ride(m.id, [{ image: {} as CanvasImageSource, x: 6, y: -27, w: 90, h: 90 }]);
  let rolled = false;
  run(w, 6000, () => { rolled ||= m.rolling || m.rot !== 0; });
  check('ridden: never rolls', !rolled);
  p.rider = [{ image: {} as CanvasImageSource, x: 0, y: -40, w: 60, h: 60 }];
  let slid = 0;
  for (let i = 0; i < 400; i++) if (choose(herd, p, herd.now())?.act?.id === 'bellySlide') slid++;
  p.rider = undefined;
  check('ridden: never an act that turns it', slid === 0);
}
{
  // the Hedgehog, picked up: curled a quarter forward in the hand, uncurled once it has landed
  const { w, herd } = scene({ hour: 23, residents: [creature('Hedgehog-Base', 'four-legged', 'right')] });
  const c = herd.creatures[0];
  run(w, 5);
  c.idle(9999);
  c.st = 'held'; c.hx = c.fx; c.hy = c.fy - 30 * ART;
  run(w, 3);
  check('curl: curled up while held', c.st === 'held' && c.rot === 1, `${c.st} ${c.rot}`);
  c.st = 'fall'; c.t = 0;
  run(w, 80);
  check('curl: uncurled after the drop', c.rot === 0 && c.st !== 'held' && c.st !== 'fall', `${c.st} ${c.rot}`);
}
{
  // the Otter in the pond: on its back (upside down), sunk and cut at the water
  const pond: Spot = { kind: 'water', x: 200, y: 560, w: 147, h: 39 };
  const { w, herd } = scene({ hour: 12, residents: [creature('Otter-Base', 'four-legged', 'right')], spots: [pond] });
  const c = herd.creatures[0];
  const act = c.nature!.acts.find(a => a.id === 'float')!;
  c.setPos(200, 560); c.idle(9999);
  startAct(c, act);
  let back = false, cut = false, shadow = false;
  run(w, 300, () => { if (c.rot === 2) { back = true; cut ||= c.clipBelow !== undefined && c.off < 0; shadow ||= drawn(c, w).includes('shadow'); } });
  check('float: on its back in the water, sunk and cut at the surface', back && cut);
  check('float: no shadow in the water', !shadow);
  // just after the float (later it may well do something else)
  let after = false;
  run(w, 400, () => { if (!after && c.st !== 'act') after = c.rot === 0 && (c.clipBelow === undefined || c.wet); });
  check('float: rolls on round, upright again (wading, whole once out of the water)', after);
}
{
  // the Sloth by a tree: climbs halfway up it (P4 perch), hangs upside down, comes down
  const tree: Spot = { kind: 'tree', x: 300, y: 560, w: 30, h: 60 };
  const { w, herd } = scene({ hour: 12, residents: [creature('Sloth-Base', 'sitting', 'right')], spots: [tree] });
  const c = herd.creatures[0];
  c.setPos(300, 560); c.idle(9999);
  startAct(c, c.nature!.acts.find(a => a.id === 'hang')!);
  let hung = false, end = -1;
  run(w, 1000, () => { hung ||= c.rot === 2 && Math.abs(c.off - 0.5 * (c.y - (tree.y - tree.h))) < 1; if (end < 0 && c.st !== 'act') end = c.rot + c.lift + c.off; });
  check('hang: upside down, halfway up the tree', hung);
  check('hang: back on the ground the right way up', end === 0);
}
{
  // the Penguin: belly slides only in winter, along the way it faces, never out of the world
  const sum = (winter: boolean) => {
    const { w, herd } = scene({ hour: 12, winter, residents: [creature('Penguin-Base', 'upright', 'right')] });
    const c = herd.creatures[0];
    let slid = 0;
    run(w, 9000, () => { if (c.act?.a.id === 'bellySlide') slid++; });
    return slid;
  };
  check('slide: in the snow, never without it', sum(true) > 0 && sum(false) === 0);
  const { w, herd } = scene({ hour: 12, winter: true, residents: [creature('Penguin-Base', 'upright', 'right')] });
  const c = herd.creatures[0], half = c.half(w);
  c.setPos(200, 560); c.idle(9999); c.dir = 1;
  const slide = c.nature!.acts.find(a => a.id === 'bellySlide')!;
  startAct(c, slide);
  const x0 = c.fx;
  let flat = false, snow = false;
  run(w, 30, () => { flat ||= c.rot === 1; snow ||= herd.particles.some(p => p.kind === 'snowSpray'); });
  check('slide: flat on its belly, sliding forward, throwing snow', flat && c.fx > x0 + 10 * ART && snow);
  c.setPos(w.w - half - ART, 560); c.idle(9999); c.dir = 1;
  startAct(c, slide);
  run(w, 60);
  check('slide: stops at the edge of the world', c.fx <= w.w - half);
}

if (failures) { console.log(`FAIL  turns: ${failures} of ${passes + failures} checks failed`); process.exit(1); }
console.log(`PASS  turns: all ${passes} checks (arithmetic, cut, hit, roll, ridden, curl, float, hang, slide)`);
