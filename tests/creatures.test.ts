/*
 * The Stable creatures without a browser (src/playground/creatures.ts): gaits and their speeds, facing and the
 * 2-tick turn, the art-pixel grid, petting, carrying, the ball and its chaser, dusk and sleep, determinism,
 * the still picture, and the row-slice drawing (nothing scaled, a squash hides one art row, a stretch repeats
 * one). The canvas side is checked in a real browser by tests/creatures-e2e.cjs.
 */
import { World } from '../src/playground/world';
import { Herd, Creature, motionOf, type Resident } from '../src/playground/creatures';
import { Gestures } from '../src/playground/gestures';
import { ART } from '../src/playground/particles';
import type { Gait, Facing, Sprite, SpriteSource } from '../src/playground/sprites';
import type { Stage } from '../src/playground/stage';

let failures = 0, passes = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); }
};

/** sprites with no picture (nothing is drawn here): key = gait_facing[_n], m prefix for a mount */
function source (): SpriteSource {
  const cache = new Map<string, Sprite>();
  return {
    get (key) {
      let s = cache.get(key);
      if (s) return s;
      const [gait, facing, noct] = key.split('_');
      const mount = key.startsWith('m');
      const w = mount ? 105 : 81, h = mount ? 105 : 99;
      const mask = new Uint8Array(w * h).fill(1);
      s = { key, image: {} as CanvasImageSource, w, h, anchor: { x: Math.floor(w / 2), y: h - 1 }, gait: gait.replace(/^m/, '') as Gait, facing: facing as Facing, nocturnal: noct === 'n', mask };
      cache.set(key, s);
      return s;
    },
    load: async () => {},
  };
}

interface Opts { hour?: number, still?: boolean, worried?: () => boolean, residents: Resident[], home?: boolean, onMoved?: (id: string, s: { x: number, y: number }) => void, haptic?: () => void, ball?: boolean, seed?: string }
function scene (o: Opts) {
  const w = new World(source(), { seed: o.seed ?? 'test' });
  const herd = new Herd(w, {
    seed: 's', clock: () => new Date(2026, 9, 14, o.hour ?? 12, 0), still: () => !!o.still, worried: o.worried,
    home: o.home ? () => ({ x: 60, y: 560 }) : undefined, onMoved: o.onMoved, haptic: o.haptic, ball: o.ball === false ? false : undefined,
  });
  herd.set(o.residents);
  w.resize(480, 640);
  return { w, herd };
}
const pet = (id: string, gait: string, facing = 'right', species = 'Wolf', spot?: { x: number, y: number }): Resident => ({ id, sprite: `${gait}_${facing}`, kind: gait.startsWith('m') ? 'mount' : 'pet', species, spot });
const run = (w: World, n: number) => { for (let i = 0; i < n; i++) w.step(); };

/* ---- gait tags */
check('motion: only four-legged trots (old tag upright too)', motionOf('four-legged') === 'trot' && motionOf('upright') === 'trot');
check('motion: sitting and tilted hop, untagged hops', motionOf('sitting') === 'hop' && motionOf('tilted') === 'hop' && motionOf(undefined) === 'hop');
check('motion: leaping bounds, legless scoots, flying hovers', motionOf('leaping') === 'bound' && motionOf('legless') === 'scoot' && motionOf('flying') === 'hover');

/* ---- facing and turning */
{
  const { w, herd } = scene({ residents: [pet('r', 'four-legged', 'right'), pet('l', 'four-legged', 'left'), pet('f', 'legless', 'front')], ball: false });
  const [r, l, f] = herd.creatures;
  r.dir = -1; l.dir = -1; f.dir = -1;
  check('facing: a right-facing body heading left is mirrored', r.flipped(w));
  check('facing: a left-facing body heading left is not', !l.flipped(w));
  check('facing: a front-facing sprite never mirrors', !f.flipped(w) && (f.dir = 1, !f.flipped(w)));
  r.dir = 1; r.setPos(240, 600); r.idle(9999);
  r.goTo(100, 600);
  check('turn: heading the other way turns first', r.st === 'turn' && r.dir === -1);
  const x0 = r.fx;
  run(w, 2);
  check('turn: pauses 2 ticks before setting off', r.fx === x0, `${r.fx} vs ${x0}`);
  run(w, 3);
  check('turn: then walks', r.fx < x0 && r.st === 'move');
}

/* ---- speeds and the grid */
{
  const { w, herd } = scene({ residents: [pet('t', 'four-legged'), pet('m', 'mfour-legged', 'left'), pet('h', 'sitting'), pet('b', 'leaping'), pet('s', 'legless'), pet('v', 'flying')], ball: false });
  const by = (id: string) => herd.byId(id)!;
  const start: Record<string, number> = {};
  for (const c of herd.creatures) { c.setPos(c.mount ? 200 : 140, 300 + herd.creatures.indexOf(c) * 50); c.dir = 1; c.goTo(c.fx + 400, c.fy); start[c.id] = c.fx; c.idle(0); c.st = 'move'; }
  let offGrid = 0, legsOnNonTrot = 0, maxLift: Record<string, number> = {};
  for (let i = 0; i < 66; i++) {
    w.step();
    for (const c of herd.creatures) {
      if (c.x % ART || c.y % ART) offGrid++;
      if (c.leg && c.motion(w) !== 'trot') legsOnNonTrot++;
      maxLift[c.id] = Math.max(maxLift[c.id] ?? 0, c.lift - c.base);
    }
  }
  const moved = (id: string) => by(id).fx - start[id];
  // 66 ticks = 2.2 s
  check('trot: a pet trots 10 art px a second', Math.abs(moved('t') - 10 * ART * 2.2) < 2, String(moved('t')));
  check('trot: a mount trots 14 art px a second', Math.abs(moved('m') - 14 * ART * 2.2) < 2, String(moved('m')));
  check('hop: 5 art px a hop, 16 ticks a hop', Math.abs(moved('h') - 5 * ART * 66 / 16) <= 5 * ART, String(moved('h')));
  check('bound: 9 art px a bound, 22 ticks a bound', Math.abs(moved('b') - 9 * ART * 3) <= 2, String(moved('b')));
  check('scoot: 2 art px a nudge, 6 ticks a nudge', Math.abs(moved('s') - 2 * ART * 11) <= 2, String(moved('s')));
  check('hover: 12 art px a second', Math.abs(moved('v') - 12 * ART * 2.2) < 2, String(moved('v')));
  check('hop arcs: hop 3, bound 5, scoot 1 art px', maxLift.h === 3 * ART && maxLift.b === 5 * ART && maxLift.s === 1 * ART, JSON.stringify(maxLift));
  check('hover: hovers 6 art px up, bobbing 1', by('v').base === 6 * ART && maxLift.v === ART, JSON.stringify([by('v').base, maxLift.v]));
  check('grid: drawn positions stay on whole art pixels', offGrid === 0, String(offGrid));
  check('trot: only four-legged creatures move their legs', legsOnNonTrot === 0 && by('t').leg !== undefined);
}

/* ---- wandering: idle breathing, walks of 10 to 50 art px, keeping apart, same seed same meadow */
{
  const rs = Array.from({ length: 10 }, (_, i) => pet(`c${i}`, ['four-legged', 'sitting', 'legless', 'leaping'][i % 4], 'right', ['Wolf', 'Fox'][i % 2]));
  const a = scene({ residents: rs, ball: false, seed: 'same' }), b = scene({ residents: rs, ball: false, seed: 'same' });
  let walks = 0, longWalk = 0, overlap = 0, samples = 0, breathed = 0;
  const from = new Map<string, [number, number]>();
  for (let i = 0; i < 3000; i++) {
    a.w.step(); b.w.step();
    for (const c of a.herd.creatures) {
      if (c.st === 'idle' && c.sq === 1) breathed++;
      if ((c.st === 'move' || c.st === 'turn') && c.t === 0) { walks++; from.set(c.id, [c.fx, c.fy]); const d = Math.hypot(c.tx - c.fx, c.ty - c.fy); if (d > 50 * ART + 1) longWalk++; }
    }
    if (i % 30 === 0) for (const c of a.herd.creatures) for (const o of a.herd.creatures) if (c !== o && c.st === 'idle' && o.st === 'idle') { samples++; if (Math.abs(c.fx - o.fx) < 2 * ART && Math.abs(c.fy - o.fy) < 2 * ART) overlap++; }
  }
  check('wander: creatures go for walks', walks > 50, String(walks));
  check('wander: no walk longer than 50 art px', longWalk === 0, String(longWalk));
  check('idle: standing creatures breathe', breathed > 100, String(breathed));
  check('wander: resting creatures rarely stand on top of each other', overlap <= samples * 0.01, `${overlap} of ${samples}`);
  check('seed: the same seed gives the same meadow', a.herd.creatures.every((c, i) => c.fx === b.herd.creatures[i].fx && c.fy === b.herd.creatures[i].fy));
  const band = a.herd.band;
  check('wander: everyone stays on the ground band and in the world', a.herd.creatures.every(c => c.fy >= band.top && c.fy <= band.bottom && c.fx >= 0 && c.fx <= a.w.w));
}

/* ---- petting */
{
  let buzz = 0;
  const { w, herd } = scene({ residents: [pet('p', 'four-legged'), pet('m', 'mfour-legged', 'left')], ball: false, haptic: () => buzz++ });
  const p = herd.byId('p')!, m = herd.byId('m')!;
  const results = [herd.pet('p'), herd.pet('p'), herd.pet('p'), herd.pet('p')];
  check('pet: a heart each tap, at most 3 at once', results.join() === 'true,true,true,false' && herd.particles.filter(q => q.kind === 'heart').length === 3);
  check('pet: a light haptic tick each heart', buzz === 3, String(buzz));
  check('pet: one happy hop', p.st === 'happy');
  let top = 0; for (let i = 0; i < 12; i++) { w.step(); top = Math.max(top, p.lift); }
  check('pet: the hop is 4 art px', top === 4 * ART, String(top));
  herd.pet('m'); top = 0; for (let i = 0; i < 12; i++) { w.step(); top = Math.max(top, m.lift); }
  check('pet: a mount hops a third higher', top === 5 * ART, String(top));
  run(w, 40);
  check('pet: hearts rise and go after 1.2 s', herd.particles.length === 0 && p.hearts === 0, String(herd.particles.length));
  check('pet: a heart can come again after', herd.pet('p'));
}

/* ---- carrying */
{
  const moved: string[] = [];
  const { w, herd } = scene({ residents: [pet('p', 'sitting')], ball: false, onMoved: (id, s) => moved.push(`${id} ${s.x.toFixed(2)} ${s.y.toFixed(2)}`) });
  const p = herd.byId('p')!;
  herd.pickUp(p, 300, 400);
  run(w, 3);
  check('carry: lifted at least 8 art px, under the finger', p.st === 'held' && p.lift >= 8 * ART && p.fx === 300, JSON.stringify([p.st, p.lift, p.fx]));
  const sway = new Set<number>(); for (let i = 0; i < 14; i++) { w.step(); sway.add(p.dx); }
  check('carry: dangles 1 art px side to side', sway.has(1) && sway.has(-1));
  herd.drop(p, 200, 450);
  check('drop: falls from where it was let go', p.st === 'fall' && p.lift > 0);
  let dust = 0; for (let i = 0; i < 60; i++) { w.step(); dust = Math.max(dust, herd.particles.filter(q => q.kind === 'dust').length); }
  check('drop: lands with a puff of dust both sides, shakes, then rests', dust === 2 && p.st === 'idle' && p.lift === 0 && p.dx === 0, JSON.stringify([dust, p.st, p.lift]));
  check('drop: its new place is saved', moved.length === 1 && moved[0].startsWith('p 0.4'), moved.join());
}

/* ---- the ball */
{
  const { w, herd } = scene({ residents: [pet('near', 'four-legged', 'right', 'Wolf', { x: 0.4, y: 0.5 }), pet('far', 'four-legged', 'right', 'Fox', { x: 0.95, y: 0.5 }), pet('bird', 'flying', 'right', 'Parrot', { x: 0.5, y: 0.5 })] });
  const b = herd.ball!;
  check('ball: starts on the ground band', b.fy >= herd.band.top && b.fy <= herd.band.bottom && b.z === 0);
  b.place(herd.byId('near')!.fx + 60, herd.byId('near')!.fy);
  b.flick(-2 * ART, 0);
  let chased: string | null = null, maxBumps = 0, chasedByBird = false, bounced = false, prevVz = 0;
  for (let i = 0; i < 900; i++) {
    w.step();
    for (const c of herd.creatures) if (c.st === 'chase') { chased ??= c.id; if (c.id === 'bird') chasedByBird = true; }
    if (prevVz < 0 && b.vz > 0) bounced = true;
    prevVz = b.vz;
    maxBumps = Math.max(maxBumps, b.bumps);
  }
  check('ball: the nearest awake pet chases it', chased === 'near', String(chased));
  check('ball: flyers don\'t chase', !chasedByBird);
  check('ball: bounces and comes to rest', bounced && !b.moving);
  check('ball: bumped back at most 3 times a flick', maxBumps >= 1 && maxBumps <= 3, String(maxBumps));
}
{
  // four pets in a row: up to 3 go after it at once and they take turns, so nobody bumps twice running
  const { w, herd } = scene({ residents: ['a', 'b', 'c', 'd'].map((id, i) => pet(id, 'four-legged', 'right', 'Wolf', { x: 0.2 + i * 0.2, y: 0.5 })) });
  const b = herd.ball!;
  run(w, 60);
  const bumpers = new Set<string>();
  let most = 0, twice = 0, after = 0, flicks = 0;
  for (let f = 0; f < 8; f++) {
    b.flick((f % 2 ? -1 : 1) * 4 * ART, 0.5 * ART);
    let seen = 0, last = '';
    for (let i = 0; i < 600; i++) {
      const before = herd.creatures.filter(c => c.st === 'chase');
      w.step();
      const chasing = herd.creatures.filter(c => c.st === 'chase').length;
      most = Math.max(most, chasing);
      if (b.bumps >= 3 && chasing) after++;
      if (b.bumps > seen) {
        seen = b.bumps;
        const by = before.find(c => c.st === 'happy')?.id;
        if (by) { if (by === last) twice++; bumpers.add(by); last = by; }
      }
    }
    if (seen === 3) flicks++;
  }
  check('ball: several pets chase it at once, 3 at most', most >= 2 && most <= 3, String(most));
  check('ball: the pets take turns bumping it', bumpers.size >= 3 && twice === 0, `${[...bumpers].join(' ')} twice ${twice}`);
  check('ball: everyone stops chasing after the third bump', after === 0 && flicks === 8, `${after} ${flicks}`);
}
{
  // alone with the ball: the same pet goes again
  const { w, herd } = scene({ residents: [pet('solo', 'four-legged', 'right', 'Wolf', { x: 0.5, y: 0.5 })] });
  const b = herd.ball!;
  b.place(herd.byId('solo')!.fx + 60, herd.byId('solo')!.fy);
  b.flick(2 * ART, 0);
  run(w, 900);
  check('ball: a pet on its own bumps it all 3 times', b.bumps === 3, String(b.bumps));
}

/* ---- dusk and sleep */
{
  const night = scene({ hour: 22, residents: [pet('w', 'four-legged'), pet('o', 'sitting', 'front_n', 'Owl'), pet('v', 'flying', 'right', 'Parrot')], ball: false });
  run(night.w, 400);
  const [wolf, owl, bird] = night.herd.creatures;
  check('night: pets fall asleep', wolf.isAsleep && bird.isAsleep);
  check('night: nocturnal pets stay up', !owl.isAsleep);
  check('night: flyers land to sleep', bird.lift === 0 && bird.base === 0);
  let zeds = 0; for (let i = 0; i < 100; i++) { night.w.step(); zeds = Math.max(zeds, night.herd.particles.filter(q => q.kind === 'zed').length); }
  check('night: Zzz rise from sleepers', zeds >= 1);
  night.herd.pet('w');
  check('night: petting wakes it for a while', !wolf.isAsleep);
  const dusk = scene({ hour: 19, home: true, residents: Array.from({ length: 4 }, (_, i) => pet(`d${i}`, 'four-legged', 'right', 'Wolf', { x: 0.9, y: 0.5 })), ball: false });
  const d0 = dusk.herd.creatures.map(c => Math.hypot(c.fx - 60, c.fy - 560));
  run(dusk.w, 1500);
  const d1 = dusk.herd.creatures.map(c => Math.hypot(c.fx - 60, c.fy - 560));
  const mean = (xs: number[]) => xs.reduce((x, y) => x + y, 0) / xs.length;
  check('dusk: pets amble toward the stable', d1.every((d, i) => d < d0[i]) && mean(d1) < mean(d0) / 2, JSON.stringify([d0.map(Math.round), d1.map(Math.round)]));
}

/* ---- low HP: the herd gathers by the stable's door with a sweat drop, by day, and lets go again */
{
  let low = true;
  const near = (h: ReturnType<typeof scene>) => h.herd.creatures.map(c => Math.hypot(c.fx - 60, c.fy - 560));
  const g = scene({ hour: 12, home: true, worried: () => low, residents: Array.from({ length: 3 }, (_, i) => pet(`g${i}`, 'four-legged', 'right', 'Wolf', { x: 0.9, y: 0.5 })), ball: false });
  const d0 = near(g);
  let sweat = 0;
  for (let i = 0; i < 1500; i++) { g.w.step(); sweat = Math.max(sweat, g.herd.particles.filter(q => q.kind === 'sweat').length); }
  const d1 = near(g);
  check('low HP: by day the creatures gather by the stable door', d1.every((d, i) => d < d0[i]) && d1.every(d => d < 60 * ART), JSON.stringify([d0.map(Math.round), d1.map(Math.round)]));
  check('low HP: sweat drops run down beside them', sweat >= 1);
  check('low HP: nobody falls asleep over it by day', g.herd.creatures.every(c => !c.asleep));
  low = false;
  g.herd.particles.length = 0;
  let after = 0;
  for (let i = 0; i < 300; i++) { g.w.step(); after += g.herd.particles.filter(q => q.kind === 'sweat').length; }
  check('low HP over: no more sweat drops', after === 0);
  const calm = scene({ hour: 12, home: true, residents: Array.from({ length: 3 }, (_, i) => pet(`c${i}`, 'four-legged', 'right', 'Wolf', { x: 0.9, y: 0.5 })), ball: false });
  run(calm.w, 1500);
  check('HP fine: by day nobody heads for the door', calm.herd.particles.every(q => q.kind !== 'sweat') && near(calm).some(d => d > 60 * ART), JSON.stringify(near(calm).map(Math.round)));
}

/* ---- the still picture (reduced motion) */
{
  const { w, herd } = scene({ still: true, residents: [pet('a', 'four-legged', 'right', 'Wolf', { x: 0.5, y: 0.5 }), pet('b', 'four-legged', 'right', 'Wolf', { x: 0.5, y: 0.5 }), pet('c', 'sitting', 'right', 'Wolf', { x: 0.52, y: 0.5 })], ball: false });
  const cs = herd.creatures;
  const apart = cs.every(c => cs.every(o => o === c || Math.abs(o.fx - c.fx) >= c.half(w) + o.half(w) - 4 * ART - 1 || Math.abs(o.fy - c.fy) >= 8 * ART));
  check('still: creatures saved on the same spot are spread so none overlap', apart, JSON.stringify(cs.map(c => c.fx)));
  herd.pet('a');
  check('still: a pet shows a heart but doesn\'t hop', cs[0].st === 'idle' && herd.particles.length === 1);
  herd.pickUp(cs[1], 100, 300); herd.drop(cs[1], 100, 300);
  check('still: a carried creature jumps straight to where it\'s let go', cs[1].st === 'idle' && cs[1].fx === 100 && cs[1].lift === 0);
}

/* ---- touch routing through the interaction */
{
  const { w, herd } = scene({ residents: [pet('a', 'four-legged', 'right', 'Wolf', { x: 0.5, y: 0.5 })] });
  const a = herd.creatures[0];
  const stage = { still: false, running: true, invalidate () {} } as unknown as Stage;
  herd.interaction.tap!({ x: a.x, y: a.y - 10, hit: a }, stage);
  check('tap: a creature is petted', a.st === 'happy' && a.hearts === 1);
  run(w, 60);
  a.dir = 1; a.idle(9999);
  herd.interaction.tap!({ x: a.fx - 60, y: a.fy, hit: null }, stage);
  check('tap the ground: creatures near turn to look', a.dir === -1 && a.st === 'idle');
  herd.interaction.longPress!({ x: a.x, y: a.y - 10, hit: a }, stage);
  check('long press: lifts it', a.st === 'held');
  herd.interaction.longPressEnd!({ x: a.x, y: a.y - 10, hit: a }, false, stage);
  check('long press released without a drag: it drops back down', a.st === 'fall');
  run(w, 60);
  herd.interaction.dragStart!({ x: a.x, y: a.y - 10, hit: a }, false, stage);
  herd.interaction.drag!({ x: a.x + 12, y: a.y - 10, hit: a }, stage);
  check('stroke: it leans into the finger', a.lean === 1);
  herd.interaction.dragEnd!({ x: a.x + 12, y: a.y - 10, hit: a }, false, stage);
  check('stroke: stands straight again when the finger lifts', a.lean === 0);
}

/* ---- gestures: a long press that ends without a drag is reported */
{
  const log: string[] = [];
  let fire: (() => void) | null = null;
  const g = new Gestures<string>({ longPress: a => log.push(`long ${a}`), longPressEnd: (a, c) => log.push(`end ${a} ${c}`), tap: () => log.push('tap') }, { set: f => { fire = f; return 1; }, clear: () => { fire = null; } });
  g.down(1, { x: 0, y: 0 }, 'a'); fire!(); g.up(1, 'b');
  g.down(2, { x: 0, y: 0 }, 'c'); fire!(); g.cancel(2);
  check('gestures: long press then lift reports longPressEnd', log.join('|') === 'long a|end b false|long c|end c true', log.join('|'));
}

/* ---- drawing: row slices, never scaled */
{
  const calls: number[][] = [];
  const g = {
    fillStyle: '', fillRect () {}, save () {}, restore () {}, translate () {}, scale () {},
    drawImage (...a: number[]) { calls.push(a.slice(1)); },
  } as unknown as CanvasRenderingContext2D;
  const { w, herd } = scene({ residents: [pet('t', 'four-legged')], ball: false });
  const c = herd.creatures[0] as Creature;
  const H = w.sprites.get(c.sprite)!.h;
  const drawn = () => { calls.length = 0; c.draw(g, w); return calls.reduce((n, a) => n + a[3], 0); };
  c.st = 'idle'; c.sq = 0; c.leg = 0; c.lean = 0;
  check('draw: the whole picture, no scaling', drawn() === H && calls.every(a => a[2] === a[6] && a[3] === a[7]));
  c.sq = 1;
  check('draw: a squash hides one art row', drawn() === H - ART);
  c.sq = -1;
  check('draw: a stretch repeats one art row', drawn() === H + ART);
  c.sq = 0; c.leg = 1; c.st = 'move';
  drawn();
  const legs = calls.filter(a => a[1] === H - 3 * ART);
  check('draw: the trot splits the bottom 3 art rows, each half 1 art px outward', legs.length === 2 && calls.every(a => Number.isInteger(a[4]) && Number.isInteger(a[5])), JSON.stringify(calls));
}

/* ---- riding: the avatar between the mount's body and head, it climbs on with a hop, never sleeps */
{
  const order: string[] = [];
  const img = (name: string) => ({ name } as unknown as CanvasImageSource);
  const g = {
    fillStyle: '', fillRect () {}, save () {}, restore () {}, translate () {}, scale () {},
    drawImage (im: { name?: string, key?: string }) { order.push(im.name ?? 'sheet'); },
  } as unknown as CanvasRenderingContext2D;
  const { w, herd } = scene({ hour: 22, residents: [{ ...pet('m', 'mfour-legged', 'left'), head: 'mfour-legged_left' }, pet('o', 'mfour-legged', 'left')], ball: false });
  run(w, 400);
  const [m, o] = herd.creatures;
  check('riding: mounts sleep at night before anyone rides', m.isAsleep && o.isAsleep);
  const rider = [{ image: img('skin'), x: -12, y: -48, w: 90, h: 90 }, { image: img('weapon'), x: -12, y: -48, w: 90, h: 90 }];
  herd.ride('m', rider);
  check('riding: the ridden mount wakes and hops, the other is left alone', m.rider === rider && !m.isAsleep && m.st === 'happy' && !o.rider && o.isAsleep);
  run(w, 400);
  check('riding: a ridden mount never falls asleep', !m.isAsleep && o.isAsleep);
  m.st = 'idle'; m.sq = 0; m.leg = 0; m.lean = 0;
  order.length = 0; m.draw(g, w);
  const at = order.indexOf('skin');
  check('riding: drawn as Habitica layers it: body, the avatar bottom first, then the head', at > 0 && order[at + 1] === 'weapon' && order.slice(0, at).every(x => x === 'sheet') && order.slice(at + 2).length > 0 && order.slice(at + 2).every(x => x === 'sheet'), order.join(','));
  const hp = o.headPoint(w).y;
  herd.ride('o', rider);
  check('riding: one rider at a time; hearts start over the rider', !m.rider && o.rider === rider && o.headPoint(w).y === hp - 48);
  herd.ride(null);
  check('riding: getting off clears the rider', !o.rider && !m.rider);
}

/* ---- the avatar on foot by the door: greetings, a tap calling someone over, the Inn */
{
  const img = (name: string) => ({ name } as unknown as CanvasImageSource);
  const standing = [{ image: img('skin'), x: -57, y: -83, w: 90, h: 90 }, { image: img('head'), x: -57, y: -83, w: 90, h: 90 }];
  let resting = false;
  const w = new World(source(), { seed: 'avatar' });
  const herd = new Herd(w, { seed: 's', clock: () => new Date(2026, 9, 14, 12, 0), still: () => false, home: () => ({ x: 120, y: 560 }), ball: false, resting: () => resting });
  herd.set([pet('a', 'four-legged'), pet('b', 'sitting'), pet('c', 'legless', 'left'), pet('d', 'mfour-legged', 'left')]);
  w.resize(480, 640);
  herd.stand(standing);
  const av = herd.avatar!;
  check('avatar on foot: stands beside the door, on the ground band, as a world entity', !!av && av.x === 120 + 14 * ART && av.y >= herd.band.top && av.y <= herd.band.bottom && w.entities.includes(av) && av.x % ART === 0 && av.y % ART === 0, JSON.stringify([av?.x, av?.y]));
  let greetings = 0, hops = 0;
  for (let i = 0; i < 9000; i++) {
    const before = herd.particles.filter(q => q.kind === 'heart').length;
    w.step();
    if (herd.particles.filter(q => q.kind === 'heart').length > before) greetings++;
    if (av.hop === 1) hops++;
  }
  check('avatar on foot: creatures come over now and then to greet it, with a heart, and it hops', greetings >= 3 && hops === greetings, `${greetings} greetings, ${hops} hops`);
  check('avatar on foot: hit by its body’s box, not off to the side', !!w.hitTest(av.x, av.y - 30) && w.hitTest(av.x, av.y - 30) !== null && !(w.hitTest(av.x + 60, av.y - 200) === av));
  // a tap: the nearest awake creature walks over and greets it
  for (const c of herd.creatures) c.idle(9999);
  const near = herd.creatures.reduce((x, y) => (Math.hypot(x.fx - av.x, x.fy - av.y) <= Math.hypot(y.fx - av.x, y.fy - av.y) ? x : y));
  const hearts = near.hearts;
  herd.call();
  check('avatar on foot: a tap makes it hop and calls the nearest creature over', av.hop === 0 && near.greet && near.st !== 'idle');
  // up to 20 s to get there (then it may wander off again, as anyone does)
  for (let i = 0; i < 600 && near.greet; i++) w.step();
  check('avatar on foot: the called creature arrives beside it and says hello', !near.greet && Math.abs(near.fx - av.x) <= near.half(w) + 8 * ART && near.hearts + herd.particles.filter(q => q.owner === near.id).length >= hearts, JSON.stringify([near.fx, av.x]));
  // the Inn: everyone sleeps by the door at noon
  resting = true;
  run(w, 2400);
  check('the Inn: the herd sleeps at noon', herd.night() && herd.creatures.every(c => c.isAsleep), herd.creatures.map(c => `${c.id}:${c.st}:${c.asleep}`).join());
  resting = false;
  run(w, 60);
  check('out of the Inn: awake again', herd.creatures.every(c => !c.asleep));
  herd.stand(null);
  check('avatar on foot: gone when it rides or can’t be drawn', !herd.avatar && !w.entities.some(e => e.id === 'avatar'));
}

/* ---- visitors: a party member's creature walks in from a side, stays apart from the residents, walks out */
{
  const { w, herd } = scene({ residents: [pet('home', 'four-legged')], ball: false });
  const rider = [{ image: {} as CanvasImageSource, x: 0, y: -40, w: 90, h: 90 }];
  herd.visit({ id: 'visitor:f:mount:Wolf-Red', sprite: 'mfour-legged_left', head: 'mfour-legged_left', kind: 'mount', species: 'Wolf' }, rider);
  const v = herd.byId('visitor:f:mount:Wolf-Red')!;
  check('visit: it starts just past a side of the meadow and walks in', !!v && v.visitor && (v.fx <= -v.half(w) || v.fx >= w.w + v.half(w)) && v.tx > 0 && v.tx < w.w && v.rider === rider, JSON.stringify([v?.fx, v?.tx]));
  run(w, 400);
  check('visit: it gets into the meadow', v.fx > 0 && v.fx < w.w, String(v.fx));
  herd.set([pet('home', 'four-legged'), pet('new', 'sitting')]);
  check('visit: choosing who lives here leaves visitors alone', !!herd.byId(v.id) && herd.creatures.length === 3);
  herd.ride('home', rider); herd.ride(null);
  check('visit: the player getting on and off a mount leaves a visitor’s rider alone', v.rider === rider);
  let moved = 0;
  const h2 = new Herd(new World(source(), { seed: 'x' }), { seed: 's', onMoved: () => { moved++; }, ball: false });
  h2.world.resize(480, 640);
  h2.visit({ id: 'visitor:x:pet:Fox-Base', sprite: 'four-legged_right', kind: 'pet', species: 'Fox' });
  h2.dropped(h2.creatures[0]);
  check('visit: dropping a visitor stores nothing', moved === 0);
  herd.celebrate();
  check('visit: a crit is celebrated by a resident, not a visitor', v.st !== 'spin');
  herd.leave(v.id);
  check('leave: it heads past the nearer edge', v.leaving && (v.tx < 0 || v.tx > w.w));
  run(w, 1500);
  check('leave: and is gone once past it', !herd.byId(v.id) && !w.entities.includes(v) && herd.creatures.length === 2);
}

if (failures) { console.log(`FAIL  creatures: ${failures} of ${passes + failures} checks failed`); process.exit(1); }
console.log(`PASS  creatures: all ${passes} checks (gaits, facing, petting, carrying, ball, sleep, still picture, row slices, avatar on foot, visitors)`);
