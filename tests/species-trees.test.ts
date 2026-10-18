/*
 * Trees, sky and flowers (thread "Behaviours by species", package T): the perch pose (P4), the soar and the
 * glide's forward offset, and the behaviours built on them: the Owl's and the gryphons' perches, the Falcon's
 * swoop, climbers, the Spider's thread, the Pterodactyl, the Flying Pig, the Dragon and the Phoenix, the Parrot, flower visits with pollen, the Giraffe's browsing, the
 * Panda cub's bamboo, the Treeling. The wallpaper's Java runs the same poses (tools/gen-stable-fixtures.ts 'trees').
 */
import { World } from '../src/playground/world';
import { Herd, type Creature, type Resident } from '../src/playground/creatures';
import { ART } from '../src/playground/particles';
import { placeTop, startAct, topPose } from '../src/playground/behaviours/runner';
import { natureOf, traitsOf } from '../src/stable/natures';
import type { Act, Spot } from '../src/playground/behaviours/types';
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

/* the default band of a 480 x 640 world: 384 to 628 */
const TREE: Spot = { kind: 'tree', x: 120, y: 420, w: 36, h: 90 };
const SAPLING: Spot = { kind: 'tree', x: 330, y: 420, w: 12, h: 24 };
const ROOF: Spot = { kind: 'roof', x: 420, y: 330, w: 60, h: 0 };
const FLOWERS: Spot = { kind: 'flowers', x: 240, y: 500, w: 18, h: 0 };
const BAMBOO: Spot = { kind: 'bamboo', x: 240, y: 400, w: 400, h: 0 };

function scene (hour: number, residents: Resident[], spots: Spot[] = [TREE, SAPLING, ROOF, FLOWERS], still = { on: false }) {
  const w = new World(source(), { seed: 'trees' });
  const herd = new Herd(w, {
    seed: 's', clock: () => new Date(2026, 9, 14, Math.floor(hour), Math.round((hour % 1) * 60)), still: () => still.on, ball: false,
    home: () => ({ x: 400, y: 560 }), spots: () => spots, sky: () => ({ winter: false, moon: 2 }),
  });
  herd.set(residents);
  w.resize(480, 640);
  return { w, herd };
}
const creature = (key: string, gait = 'four-legged', facing = 'right'): Resident => {
  const mount = gait.startsWith('m');
  return { id: `${mount ? 'mount' : 'pet'}:${key}`, sprite: `${gait}_${facing}`, kind: mount ? 'mount' : 'pet', species: key.split('-')[0], nature: natureOf(mount ? 'mount' : 'pet', key) };
};
const run = (w: World, n: number, each?: () => void) => { for (let i = 0; i < n; i++) { w.step(); each?.(); } };
const actOf = (c: Creature, id: string) => c.nature!.acts.find(a => a.id === id)!;
/** stands c at (x, y), idle, then starts an act there */
function at (c: Creature, x: number, y: number, a: Act, dir = 1) { c.setPos(x, y); c.tx = c.fx; c.ty = c.fy; c.idle(9999); c.dir = dir; startAct(c, a); }

/* ---- the table */
{
  const has = (key: string, id: string) => traitsOf(key).includes(id);
  check('table: Owl, Falcon and the gryphons perch', has('Owl-Base', 'owlPerch') && has('Falcon-Base', 'swoop') && ['Gryphon', 'Hippogriff', 'Gryphatrice'].every(s => has(`${s}-Base`, 'perch')));
  check('table: climbers, the Spider, the Giraffe, the Treeling', has('Squirrel-Base', 'climb') && has('Monkey-Base', 'monkeyClimb') && has('Spider-Base', 'thread') && has('Giraffe-Base', 'browse') && has('Treeling-Base', 'treeling'));
  check('table: flowers, bamboo, the sky', has('Butterfly-Base', 'flowers') && has('MagicalBee-Base', 'pollen') && has('PandaCub-Base', 'bamboo') && has('Pterodactyl-Base', 'soar'));
  check('table: the Owl keeps its night hours and the Spider its naps', traitsOf('Owl-Base')[0] === 'night' && traitsOf('Spider-Base')[0] === 'night');
}

/* ---- the place's top */
{
  const { herd } = scene(12, [creature('Squirrel-Base', 'sitting')]);
  const c = herd.creatures[0];
  c.setPos(TREE.x + 9, TREE.y);
  check('place: at a standing tree, its height', placeTop(herd, c, 'tree') === c.y - (TREE.y - TREE.h), `${placeTop(herd, c, 'tree')}`);
  c.setPos(TREE.x + 9, 450);
  check('place: in front of it, up to the same crown', placeTop(herd, c, 'tree') === 450 - (TREE.y - TREE.h));
  c.setPos(TREE.x + 60, TREE.y);
  check('place: beside no tree, nowhere to climb', placeTop(herd, c, 'tree') === -1);
  c.setPos(ROOF.x, 420);
  check('place: under the roof, up to its ridge', placeTop(herd, c, 'roof') === 420 - ROOF.y);
  check('place: a kind the scene lacks', placeTop(herd, c, 'bamboo') === -1 && placeTop(herd, c, undefined) === -1);
}

/* ---- the Owl's perch at night */
{
  const { w, herd } = scene(23, [creature('Owl-Base', 'flying', 'front')]);
  const owl = herd.creatures[0];
  run(w, 2);
  check('owl: a flyer hovers when idle', owl.base === 6 * ART);
  at(owl, TREE.x, TREE.y, actOf(owl, 'owlPerch:tree'));
  let top = 0, hoot = false, lift = Infinity;
  run(w, 60, () => {
    top = Math.max(top, owl.off); if (owl.off >= TREE.h) lift = Math.min(lift, owl.lift);
    hoot ||= herd.particles.some(p => p.kind === 'note');
  });
  run(w, 300, () => { hoot ||= herd.particles.some(p => p.kind === 'note'); });
  check('owl: up to the top of the crown', top === TREE.h + (owl.y - TREE.y) && owl.off === top, `${top} ${owl.off}`);
  check('owl: sits on it, its hover gone', lift === 0 && owl.lift === 0, `${lift}`);
  check('owl: hoots once settled', hoot);
  const ops: string[] = [];
  const g = { fillStyle: '', fillRect: () => ops.push('rect'), drawImage: () => ops.push('img'), save () {}, restore () {}, translate () {}, scale () {} };
  owl.draw(g as unknown as CanvasRenderingContext2D, w);
  check('owl: no shadow up there', !ops.includes('rect'));
  const hearts = herd.particles.filter(p => p.kind === 'heart').length;
  herd.pet(owl.id);
  check('owl: a tap gives a heart and it stays on its perch', owl.st === 'act' && owl.off === top && herd.particles.filter(p => p.kind === 'heart').length === hearts + 1);
  let down = false;
  run(w, 1500, () => { down ||= !owl.act && owl.off === 0 && owl.st === 'idle' && owl.lift >= owl.base; });
  check('owl: comes down again and hovers', down);
  check('owl: perches only at night', actOf(owl, 'owlPerch:roof').when!.hours!.join() === '20,6');
}
{
  // a perch on the roof; carried off it, whole again
  const { w, herd } = scene(23, [creature('Owl-Base', 'flying', 'front')]);
  const owl = herd.creatures[0];
  at(owl, ROOF.x + 10, 420, actOf(owl, 'owlPerch:roof'));
  run(w, 40);
  check('roof: up on the ridge', owl.off === 420 - ROOF.y, `${owl.off}`);
  owl.st = 'held'; run(w, 1);
  check('roof: picked up, back to its own height', !owl.act && owl.off === 0);
}

/* ---- the Falcon's swoop */
{
  const { w, herd } = scene(12, [creature('Falcon-Base', 'sitting', 'right')]);
  const f = herd.creatures[0];
  at(f, TREE.x, TREE.y, actOf(f, 'swoop:tree'), 1);
  let out = 0, low = Infinity, turned = false, back = false;
  const top = TREE.h;
  run(w, 600, () => {
    if (f.st !== 'act') return;
    out = Math.max(out, f.dx * f.dir > 0 ? f.dx : 0);
    if (f.dx) low = Math.min(low, f.off);
    turned ||= f.dir === -1;
    back ||= turned && f.off === top && f.dx === 0;
  });
  check('swoop: down and out ahead of it', out === 16 && low < top * 0.1, `${out} ${low}`);
  check('swoop: turns at the bottom and goes back up to its perch', turned && back);
}

/* ---- climbers */
{
  const { w, herd } = scene(12, [creature('Squirrel-Base', 'sitting')]);
  const s = herd.creatures[0];
  at(s, TREE.x, TREE.y, actOf(s, 'climb'));
  let most = 0, steps = new Set<number>();
  run(w, 120, () => { most = Math.max(most, s.off); steps.add(s.off); });
  check('climb: up the trunk in steps into the crown', Math.abs(most - 0.65 * TREE.h) < 1e-9 && steps.size >= 8, `${most} ${steps.size}`);
  // (and may go up again later)
  let down = false;
  run(w, 900, () => { down ||= !s.act && s.off === 0; });
  check('climb: and back down', down);
}
{
  const { w, herd } = scene(12, [creature('Monkey-Base', 'four-legged')]);
  const m = herd.creatures[0];
  at(m, TREE.x, TREE.y, actOf(m, 'climb'));
  let swung = 0;
  run(w, 600, () => { if (m.dx && m.off > 0) swung++; });
  check('monkey: swings a little up there', swung > 0);
}

/* ---- the Spider's thread */
{
  const { w, herd } = scene(23, [creature('Spider-Base', 'sitting', 'front')]);
  const sp = herd.creatures[0];
  at(sp, TREE.x, TREE.y, actOf(sp, 'thread'));
  let most = 0, below = 0, silkLeft = -1;
  run(w, 1200, () => {
    most = Math.max(most, herd.particles.filter(p => p.kind === 'silk').length);
    if (sp.off + sp.lift < 0) below++;
    if (sp.act && sp.act.i === sp.act.a.script.length - 1) silkLeft = herd.particles.filter(p => p.kind === 'silk').length;
  });
  check('thread: a pixel of silk for each step down', most === 10, `${most}`);
  check('thread: gone as it climbs back past it', silkLeft === 0, `${silkLeft}`);
  check('thread: never below the ground', below === 0);
  // on a sapling the thread would reach the ground: it stops there
  const s2 = scene(23, [creature('Spider-Base', 'sitting', 'front')]);
  const sp2 = s2.herd.creatures[0];
  at(sp2, SAPLING.x, SAPLING.y, actOf(sp2, 'thread'));
  let under = 0, ground = false;
  run(s2.w, 1200, () => { if (sp2.off + sp2.lift < 0) under++; ground ||= sp2.off > 0 && sp2.off + sp2.lift === 0; });
  check('thread: from a sapling it touches down and goes no lower', under === 0 && ground);
}

/* ---- the Pterodactyl soars */
{
  const { w, herd } = scene(12, [creature('Pterodactyl-Base', 'flying', 'right')]);
  const p = herd.creatures[0];
  at(p, 120, 600, actOf(p, 'soar'), 1);
  const sky = 600 - herd.band.top / 2;
  let high = 0, far = 0, turns = 0, d = p.dir, landed = false;
  run(w, 600, () => {
    // one soar (standing about after it, it may look round)
    if (landed) return;
    high = Math.max(high, p.off); far = Math.max(far, Math.abs(p.dx));
    if (p.dir !== d) { turns++; d = p.dir; }
    landed ||= !p.act && p.off === 0 && p.dx === 0 && p.fx === 120;
  });
  check('soar: up to halfway between the top and the ground, above the trees', Math.abs(high - sky) < 1e-9, `${high} ${sky}`);
  check('soar: glides 40 art pixels out and back, turning twice', far === 40 && turns === 2, `${far} ${turns}`);
  check('soar: lands where it took off', landed);
  check('soar: by day only', actOf(p, 'soar').when!.hours!.join() === '8,18');
  at(p, 420, 600, actOf(p, 'soar'), 1);
  run(w, 1);
  check('soar: near the edge it turns to the middle first, so the glide stays on screen', p.dir === -1);
}

/* ---- the Flying Pig flies */
{
  const { w, herd } = scene(12, [creature('FlyingPig-RoyalPurple', 'flying', 'right')]);
  const p = herd.creatures[0];
  check('flutter: the Flying Pig has it, whatever its potion', ['FlyingPig-Base', 'FlyingPig-RoyalPurple'].every(k => traitsOf(k).includes('flutter')));
  const a = actOf(p, 'flutter');
  at(p, 120, 600, { ...a, loops: [1, 1] }, 1);
  const sky = 600 - herd.band.top / 2;
  let high = 0, far = 0, turns = 0, d = p.dir, landed = false;
  run(w, 600, () => {
    if (landed) return;
    high = Math.max(high, p.off); far = Math.max(far, Math.abs(p.dx));
    if (p.dir !== d) { turns++; d = p.dir; }
    landed ||= !p.act && p.off === 0 && p.dx === 0 && p.fx === 120;
  });
  check('flutter: up to about the treetops, lower than the Pterodactyl', Math.abs(high - 0.55 * sky) < 1e-9 && high > 600 - (TREE.y - TREE.h) - 60, `${high} ${sky}`);
  check('flutter: flaps 34 art pixels out and back, turning once', far === 34 && turns === 1, `${far} ${turns}`);
  check('flutter: lands where it took off', landed);
  check('flutter: by day, once or twice', a.when!.hours!.join() === '8,19' && a.loops!.join() === '1,2');
  check('flutter: always on its way up there, so the still picture keeps it on its hover', a.script.every(q => !q.soar || !!q.fwd) && topPose(a) === null);
}

/* ---- the Dragon (its mounts) and the Phoenix sail */
{
  check('sail: the Phoenix and Dragon mounts, not the wingless Dragon pets', traitsOf('Phoenix-Base').includes('sail') && traitsOf('Dragon-Red', 'mount').includes('sail')
    && !traitsOf('Dragon-Red').includes('sail') && natureOf('mount', 'Dragon-Hydra').traits.includes('sail') && !natureOf('pet', 'Dragon-Base').traits.includes('sail'));
  const { w, herd } = scene(12, [creature('Phoenix-Base', 'flying', 'right')]);
  const p = herd.creatures[0];
  const a = actOf(p, 'sail');
  at(p, 120, 600, a, 1);
  const sky = 600 - herd.band.top / 2;
  let high = 0, out = 0, back = 0, turns = 0, d = p.dir, landed = false;
  run(w, 900, () => {
    if (landed) return;
    high = Math.max(high, p.off); out = Math.max(out, p.dx); back = Math.min(back, p.dx);
    if (p.dir !== d) { turns++; d = p.dir; }
    landed ||= !p.act && p.off === 0 && p.dx === 0 && p.fx === 120;
  });
  check('sail: as high as the Pterodactyl', Math.abs(high - sky) < 1e-9, `${high} ${sky}`);
  check('sail: 49 art pixels out, back 13 past where it took off, turning twice', out === 49 && back === -13 && turns === 2, `${out} ${back} ${turns}`);
  check('sail: lands where it took off', landed);
  check('sail: by day, rarer than the soar', a.when!.hours!.join() === '9,18' && a.rest![0] > actOf(scene(12, [creature('Pterodactyl-Base', 'flying', 'right')]).herd.creatures[0], 'soar').rest![1]);
  check('sail: the still picture keeps it where it stands', topPose(a) === null);
}

/* ---- the Parrot perches */
{
  const { w, herd } = scene(12, [creature('Parrot-Base', 'flying', 'right')]);
  const p = herd.creatures[0];
  const a = actOf(p, 'parrotPerch:tree');
  at(p, TREE.x, TREE.y, a);
  let top = 0, landed = false;
  run(w, 600, () => {
    if (landed) return;
    top = Math.max(top, p.off);
    landed ||= top > 0 && !p.act && p.off === 0;
  });
  check('parrot: up to the crown and back down', Math.abs(top - (TREE.y - (TREE.y - TREE.h))) < 1e-9 && landed, `${top}`);
  check('parrot: on a crown or the ridge, by day', p.nature!.acts.map(x => x.at).join() === 'tree,roof' && a.when!.hours!.join() === '7,19');
  check('parrot: a short while up there, shorter than the gryphons', a.script.reduce((n, q) => n + (typeof q.n === 'number' ? q.n : q.n[1]), 0) < 300);
}

/* ---- flowers */
{
  const { w, herd } = scene(12, [creature('MagicalBee-Base', 'flying', 'right'), creature('Butterfly-Base', 'flying', 'right')]);
  const [bee, fly] = herd.creatures;
  at(bee, FLOWERS.x, FLOWERS.y, actOf(bee, 'flowers'));
  at(fly, FLOWERS.x + 3, FLOWERS.y, actOf(fly, 'flowers'));
  let landed = false, pollen = 0;
  run(w, 40, () => { landed ||= bee.lift === ART && bee.base === 6 * ART; pollen = Math.max(pollen, herd.particles.filter(p => p.kind === 'pollen').length); });
  check('flowers: down onto the patch, its hover gone', landed);
  check('flowers: the bee leaves pollen, the butterfly none of its own', pollen >= 2 && !natureOf('pet', 'Butterfly-Base').acts.some(a => a.script.some(s => s.fx?.length)));
  const snowy = scene(12, [creature('Butterfly-Base', 'flying', 'right')], [TREE]);
  const visits = snowy.herd.creatures[0].nature!.acts.filter(a => a.at === 'flowers');
  check('flowers: no patches (snow), no visits', visits.length > 0 && visits.every(a => snowy.herd.spots(a.at!).length === 0));
}
{
  // the bee finds the flowers itself
  const { w, herd } = scene(12, [creature('MagicalBee-Base', 'flying', 'right')]);
  let visited = false;
  run(w, 9000, () => { const c = herd.creatures[0]; visited ||= c.act?.a.id === 'flowers' && Math.abs(c.fx - FLOWERS.x) < 60; });
  check('flowers: the bee flies there on its own and visits', visited);
}

/* ---- the Giraffe, the Panda cub, the Treeling */
{
  const { w, herd } = scene(12, [creature('Giraffe-Base', 'trotting', 'right')]);
  const g = herd.creatures[0];
  at(g, TREE.x + 20, TREE.y, actOf(g, 'browse'));
  let leaves = 0, tall = 0;
  run(w, 200, () => { leaves = Math.max(leaves, herd.particles.filter(p => p.kind === 'leaf').length); if (g.sq === -1) tall++; });
  check('browse: stretches up and leaves fall', leaves > 0 && tall > 30);
}
{
  const { w, herd } = scene(12, [creature('PandaCub-Base', 'sitting')], [BAMBOO]);
  let munched = false;
  run(w, 9000, () => { munched ||= herd.creatures[0].act?.a.id === 'munch'; });
  check('bamboo: the Panda cub sits munching in the grove', munched);
  const meadow = scene(12, [creature('PandaCub-Base', 'sitting')], [TREE]);
  let elsewhere = false;
  run(meadow.w, 6000, () => { elsewhere ||= meadow.herd.creatures[0].act?.a.id === 'munch'; });
  check('bamboo: not where there is none', !elsewhere);
}
{
  const { w, herd } = scene(12, [creature('Treeling-Base', 'sitting', 'front')]);
  const t = herd.creatures[0];
  at(t, TREE.x + 20, TREE.y, actOf(t, 'stillAsATree'));
  run(w, 4);
  let moved = false;
  const x = t.fx, y = t.fy;
  run(w, 280, () => { moved ||= t.sq !== 0 || t.lift !== 0 || t.fx !== x || t.fy !== y; });
  check('treeling: stands as still as a tree (not even breathing)', !moved);
}

/* ---- the still picture (reduced motion, the widget): perchers up at their places */
{
  const W = 480, B = { top: 384, bottom: 628 };
  /** standing at world (x, y) when not perched */
  const standing = (r: Resident, x: number, y: number): Resident => ({ ...r, spot: { x: x / W, y: (y - B.top) / (B.bottom - B.top) } });
  const still = (hour: number, rs: Resident[], spots?: Spot[]) => { const on = { on: true }; return { on, ...scene(hour, rs, spots, on) }; };
  const shownTop = (c: Creature) => c.y - c.shownLift(true);

  const s = still(23, [standing(creature('Owl-Base', 'flying', 'front'), 140, 500), standing({ ...creature('Owl-Base', 'flying', 'right'), id: 'pet:owl2' }, 150, 520)]);
  const [owl, owl2] = s.herd.creatures;
  check('still: the Owl at night is up on the nearest crown', owl.perched !== null && owl.x === TREE.x && owl.y === TREE.y && shownTop(owl) === TREE.y - TREE.h, `${owl.x},${owl.y} top ${shownTop(owl)}`);
  check('still: perched, its hover gone and no shadow', owl.base === 6 * ART && owl.shownLift(true) === owl.off && owl.stillPose() === owl.perched?.pose);
  check('still: the pose it holds longest up there (no swoop, no hoot)', owl.perched?.pose.perch === 1 && !owl.perched.pose.fx && !owl.perched.pose.sq);
  check('still: one to a place, the second to the next nearest (the sapling)', owl2.perched !== null && Math.abs(owl2.x - SAPLING.x) <= ART && shownTop(owl2) === SAPLING.y - SAPLING.h, `${owl2.x} ${shownTop(owl2)}`);
  const head = owl.headPoint(s.w);
  check('still: hearts start over its head up there', head.y < shownTop(owl) - 50, `${head.y}`);
  check('still: a tap finds it where it is drawn', owl.hit(owl.x, shownTop(owl) - 30, s.w) && !owl.hit(owl.x, owl.y - 10, s.w));
  const crowd = still(23, [0, 1, 2, 3].map(i => standing({ ...creature('Owl-Base', 'flying', 'front'), id: `pet:owl${i}` }, 120 + i * 10, 500)));
  const up = crowd.herd.creatures.filter(c => c.perched);
  check('still: four owls, three places (tree, sapling, roof): the fourth stays down', up.length === 3 && new Set(up.map(c => c.x)).size === 3 && crowd.herd.creatures[3].perched === null && crowd.herd.creatures[3].off === 0);

  // the same meadow, the same picture
  const again = still(23, [standing(creature('Owl-Base', 'flying', 'front'), 140, 500), standing({ ...creature('Owl-Base', 'flying', 'right'), id: 'pet:owl2' }, 150, 520)]);
  check('still: nothing random', again.herd.creatures.every((c, i) => c.x === s.herd.creatures[i].x && c.y === s.herd.creatures[i].y && c.off === s.herd.creatures[i].off));

  // carried down, it stays where it was put
  s.herd.pickUp(owl, 300, 560);
  check('still: picked up, off its perch', owl.perched === null && owl.off === 0);
  s.herd.drop(owl, 300, 560);
  check('still: put down, it stays on the ground there', owl.perched === null && Math.abs(owl.fx - 300) < 1 && owl.grounded);

  // the meadow moves again: everyone back where they stood
  const stood = owl2.perched!.fx;
  s.on.on = false;
  run(s.w, 1);
  check('still: in motion again, back down where it stood', owl2.perched === null && owl2.off === 0 && owl2.fx === stood && !owl.grounded);

  const day = still(12, [standing(creature('Owl-Base', 'flying', 'front'), 140, 500)]);
  check('still: the Owl by day stays down (it perches at night)', day.herd.creatures[0].perched === null);
  // the widget's one tick: the night owl stays up; who sleeps now lies on the ground
  const widget = still(23, [standing(creature('Owl-Base', 'flying', 'front'), 140, 500)]);
  run(widget.w, 1);
  const wo = widget.herd.creatures[0];
  check('still: after the widget\'s one tick, still up there', wo.perched !== null && shownTop(wo) === TREE.y - TREE.h, `${shownTop(wo)}`);
  const asleep = still(12, [standing(creature('Spider-Base', 'sitting', 'front'), 140, 500)]);
  run(asleep.w, 1);
  check('still: asleep, on the ground', asleep.herd.creatures[0].isAsleep && asleep.herd.creatures[0].perched === null);

  const others = still(12, [
    standing(creature('Squirrel-Base', 'sitting'), 130, 450), standing(creature('Sloth-Base', 'four-legged'), 330, 450),
    standing(creature('Butterfly-Base', 'flying', 'right'), 250, 520), standing(creature('Pterodactyl-Base', 'flying', 'right'), 60, 600),
    standing(creature('Falcon-Base', 'sitting', 'right'), 410, 450), standing(creature('Wolf-Base'), 200, 600),
  ]);
  const [sq, sloth, fly, ptero, falcon, wolf] = others.herd.creatures;
  check('still: the Squirrel sits in its crown', sq.perched?.pose.perch === 0.65 && Math.abs(sq.off - 0.65 * (sq.y - (TREE.y - TREE.h))) < 1e-9, `${sq.off}`);
  check('still: the Sloth hangs upside down from its tree', sloth.perched !== null && sloth.stillPose()?.rot === 2 && Math.abs(sloth.x - SAPLING.x) <= ART);
  check('still: the butterfly on the flowers', fly.perched !== null && Math.abs(fly.x - FLOWERS.x) <= ART && fly.shownLift(true) === ART, `${fly.shownLift(true)}`);
  check('still: the Pterodactyl high in the sky where it stood', ptero.perched?.pose.soar === 1 && Math.abs(ptero.fx - 60) < 1 && Math.abs(ptero.off - (ptero.y - others.herd.band.top / 2)) < 1e-9);
  check('still: the Falcon on the ridge by day', falcon.perched !== null && shownTop(falcon) === ROOF.y, `${shownTop(falcon)}`);
  const under = still(12, [standing(creature('Squirrel-Base', 'sitting'), 130, 450), standing(creature('Pterodactyl-Base', 'flying', 'right'), 125, 600)]);
  const [sq2, pt2] = under.herd.creatures;
  check('still: the Pterodactyl over a tree with someone up it soars beside them, not on their head', pt2.perched !== null && Math.abs(pt2.x - sq2.x) >= 60 && pt2.perched.fx !== pt2.fx, `${pt2.x} ${sq2.x}`);
  check('still: who never goes up stays down', wolf.perched === null && wolf.off === 0);
  const fliers = still(12, [standing(creature('Parrot-Base', 'flying', 'right'), 130, 450), standing(creature('Phoenix-Base', 'flying', 'right'), 300, 600), standing(creature('FlyingPig-Base', 'flying', 'right'), 200, 600)]);
  const [parrot, phoenix, pig] = fliers.herd.creatures;
  check('still: the Parrot on a crown by day; the Phoenix and the Flying Pig where they stand', parrot.perched !== null && phoenix.perched === null && phoenix.off === 0 && pig.perched === null && pig.off === 0);
  others.herd.ride(falcon.id, [{ image: {} as CanvasImageSource, x: 0, y: -30, w: 60, h: 60 }]);
  check('still: none of it while ridden', falcon.perched === null && falcon.off === 0);
}

if (failures) { console.log(`FAIL  trees: ${failures} of ${passes + failures} checks failed`); process.exit(1); }
console.log(`PASS  trees: all ${passes} checks (table, places, owl, roof, swoop, climbers, thread, soar, flutter, sail, parrot, flowers, browse, bamboo, treeling, still picture)`);
