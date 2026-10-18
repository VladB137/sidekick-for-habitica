/*
 * Ball and touch by species without a browser (package B: src/playground/behaviours/touch.ts and balls.ts, run by
 * creatures.ts and src/playground/ballplay.ts): a tap's own reaction (Ferret's war dance, the pet rock's heart with
 * no hop, the Treeling's leaves), ink on a pick-up, the Slime's splat, a carried pose, the shy Deer bounding away
 * from a tap on the ground, and the ball: the Dog fetching it, the Beetle pushing it, the Cat pouncing, the
 * Dolphin bouncing it on its nose in the water, and every game letting go when something else takes over. The
 * wallpaper's taps run the same reactions (tools/gen-stable-fixtures.ts scenario "touch").
 */
import { World } from '../src/playground/world';
import { Herd, type Creature, type Resident } from '../src/playground/creatures';
import { ART } from '../src/playground/particles';
import { NOSE_ACT, POUNCE_ACT } from '../src/playground/ballplay';
import { natureOf } from '../src/stable/natures';
import { looksOf } from '../src/playground/behaviours';
import type { Nature, Spot } from '../src/playground/behaviours/types';
import type { Gait, Facing, Sprite, SpriteSource } from '../src/playground/sprites';
import type { Stage } from '../src/playground/stage';

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

interface Opts { hour?: number, residents: Resident[], spots?: Spot[], still?: boolean, winter?: boolean, ball?: boolean, onMoved?: (id: string) => void }
function scene (o: Opts) {
  const w = new World(source(), { seed: 'ballplay' });
  const herd = new Herd(w, {
    seed: 's', clock: () => new Date(2026, 9, 14, o.hour ?? 11, 0), still: () => !!o.still, ball: o.ball === false ? false : undefined,
    home: () => ({ x: 400, y: 560 }), spots: () => o.spots ?? [], sky: () => ({ winter: !!o.winter, moon: 2 }), onMoved: o.onMoved,
  });
  herd.set(o.residents);
  w.resize(480, 640);
  return { w, herd };
}
const stage = { still: false, running: true, invalidate () {} } as unknown as Stage;
const creature = (key: string, gait = 'four-legged', spot?: { x: number, y: number }, nature?: Nature): Resident => {
  const mount = gait.startsWith('m');
  return { id: `${mount ? 'mount' : 'pet'}:${key}`, sprite: `${gait}_right`, kind: mount ? 'mount' : 'pet', species: key.split('-')[0], spot, nature: nature ?? natureOf(mount ? 'mount' : 'pet', key) };
};
const run = (w: World, n: number, each?: () => boolean | void) => { for (let i = 0; i < n; i++) { w.step(); if (each?.()) return i + 1; } return n; };
/** someone stands still where we put it */
const hold = (c: Creature, x: number, y: number) => { c.setPos(x, y); c.tx = x; c.ty = y; c.idle(9999); };

/* ---- the table */
{
  const n = (k: string) => natureOf('pet', k);
  check('table: Ferret dances, Rock is stony, Treeling rustles on a tap', !!n('Ferret-Base').touch?.tap?.script.length && n('Rock-Base').touch?.tap?.script.length === 0 && !!n('Treeling-Base').touch?.tap);
  check('table: Octopus and Cuttlefish ink, Slime splats, Deer and Bunny are shy', !!n('Octopus-Base').touch?.lift && !!n('Cuttlefish-Base').touch?.lift && !!n('Slime-Base').touch?.land && !!n('Deer-Base').touch?.shy && !!n('Bunny-Base').touch?.shy);
  check('table: Dog fetches, Beetle pushes, Cat pounces, Dolphin noses', n('Dog-Base').ball === 'fetch' && n('Beetle-Base').ball === 'push' && n('Cat-Base').ball === 'pounce' && n('Dolphin-Base').ball === 'nose');
  check('table: a Wolf has none of it', !n('Wolf-Base').touch && !n('Wolf-Base').ball);
  check('merge: touch fields add up, the later trait winning per field', JSON.stringify(n('Ferret-Base').touch) === JSON.stringify({ tap: n('Ferret-Base').touch!.tap }));
  check('looks: the wallpaper gets the leaf of a tap (not the app-only ink)', 'leaf' in looksOf([n('Treeling-Base')]) && !('ink' in looksOf([n('Octopus-Base')])));
}

/* ---- a tap */
{
  const { w, herd } = scene({ residents: [creature('Ferret-Base', 'four-legged', { x: 0.3, y: 0.5 }), creature('Rock-Base', 'sitting', { x: 0.6, y: 0.5 }), creature('Treeling-Base', 'upright', { x: 0.8, y: 0.5 }), creature('Wolf-Base', 'four-legged', { x: 0.1, y: 0.2 })], ball: false });
  run(w, 2);
  const [ferret, rock, tree, wolf] = herd.creatures;
  for (const c of herd.creatures) hold(c, c.fx, c.fy);
  herd.pet(ferret.id);
  check('tap: the ferret gets its heart and starts the war dance', ferret.hearts === 1 && ferret.st === 'act' && ferret.act?.a.id === 'tap');
  const dirs = new Set<number>(), dxs = new Set<number>();
  const n = run(w, 200, () => { dirs.add(ferret.dir); dxs.add(ferret.dx); return ferret.st !== 'act'; });
  check('tap: the war dance hops sideways and turns, then it rests', dirs.size === 2 && Math.max(...dxs) === 3 && ferret.st === 'idle' && ferret.dx === 0 && n > 50 && n < 200, `${n} ticks`);
  herd.pet(rock.id);
  check('tap: the pet rock gets a heart and no hop', rock.hearts === 1 && rock.st === 'idle' && rock.lift === rock.base);
  run(w, 3);
  check('tap: ... and still no hop after', rock.lift === rock.base && rock.st === 'idle');
  const before = herd.particles.length;
  herd.pet(tree.id);
  run(w, 8);
  check('tap: the treeling shakes off leaves', herd.particles.filter(p => p.kind === 'leaf').length >= 2 && herd.particles.length > before);
  herd.pet(wolf.id);
  check('tap: a wolf still hops', wolf.st === 'happy');
}
{
  const { herd } = scene({ residents: [creature('Ferret-Base', 'four-legged', { x: 0.3, y: 0.5 })], ball: false, still: true });
  const [ferret] = herd.creatures;
  herd.pet(ferret.id);
  check('tap, still picture: a heart and no dance', ferret.hearts === 1 && ferret.st !== 'act');
}
{
  const { w, herd } = scene({ residents: [creature('Ferret-Red', 'mfour-legged', { x: 0.5, y: 0.5 })], ball: false });
  run(w, 2);
  const [m] = herd.creatures;
  herd.pet(m.id);
  check('tap: a mount dances like its species', m.st === 'act' && m.act?.a.id === 'tap');
}

/* ---- picked up, dropped, carried */
{
  const moved: string[] = [];
  const { w, herd } = scene({ residents: [creature('Octopus-Base', 'legless', { x: 0.3, y: 0.5 }), creature('Slime-Base', 'legless', { x: 0.7, y: 0.5 })], ball: false, onMoved: id => moved.push(id) });
  run(w, 2);
  const [oct, slime] = herd.creatures;
  herd.interaction.longPress!({ x: oct.x, y: oct.y - 10, hit: oct }, stage);
  check('pick-up: the octopus leaves two puffs of ink where it sat', herd.particles.filter(p => p.kind === 'ink').length === 2 && herd.particles.every(p => p.kind !== 'ink' || p.y === oct.y));
  herd.interaction.longPressEnd!({ x: oct.x, y: oct.y - 10, hit: oct }, false, stage);
  herd.interaction.longPress!({ x: slime.x, y: slime.y - 10, hit: slime }, stage);
  check('pick-up: the slime leaves no ink', herd.particles.filter(p => p.kind === 'ink').length === 2);
  herd.interaction.longPressEnd!({ x: slime.x, y: slime.y - 60, hit: slime }, false, stage);
  let flat = false, goo = false;
  run(w, 120, () => { if (slime.st === 'act' && slime.sq === 1 && slime.off < 0) flat = true; if (herd.particles.some(p => p.kind === 'goo')) goo = true; });
  check('drop: the slime splats flat with a spatter, then pulls itself together', flat && goo && slime.st !== 'act' && slime.off === 0 && slime.clipBelow === undefined);
  check('drop: the slime\'s new place is saved, like any landing', moved.includes(slime.id) && moved.includes(oct.id));
}
{
  const curl: Nature = { ...natureOf('pet', 'Wolf-Base'), touch: { hold: { sq: 1, dx: 2, lift: 1 } } };
  const { w, herd } = scene({ residents: [creature('Hedgehog-Base', 'four-legged', { x: 0.5, y: 0.5 }, curl)], ball: false });
  run(w, 2);
  const [c] = herd.creatures;
  herd.interaction.longPress!({ x: c.x, y: c.y - 10, hit: c }, stage);
  run(w, 10);
  check('carried: its own pose instead of the dangle, above the finger', c.st === 'held' && c.sq === 1 && c.dx === 2 && c.lift >= 9 * ART);
  herd.interaction.longPressEnd!({ x: c.x, y: c.y - 10, hit: c }, false, stage);
  check('carried: let go, the pose is gone', c.dx === 0 && c.sq === 0 && c.off === 0);
}

/* ---- a tap on the ground */
{
  const { w, herd } = scene({ residents: [creature('Deer-Base', 'four-legged', { x: 0.5, y: 0.5 }), creature('Wolf-Base', 'four-legged', { x: 0.5, y: 0.2 })], ball: false });
  run(w, 2);
  const [deer, wolf] = herd.creatures;
  hold(deer, 240, 560); hold(wolf, 240, 470);
  herd.interaction.tap!({ x: 210, y: 520, hit: null }, stage);
  check('ground tap: the deer bounds away, fast', (deer.st === 'move' || deer.st === 'turn') && deer.tx > deer.fx + 20 * ART && deer.bolt);
  check('ground tap: the wolf turns to look', wolf.st === 'idle' && wolf.dir === -1);
  const x0 = deer.fx;
  const n = run(w, 200, () => deer.st === 'idle');
  check('ground tap: ... 24 art pixels off, quicker than a walk', deer.fx - x0 > 20 * ART && n < 40 && !deer.bolt, `${n} ticks`);
  hold(deer, 470 - 31, 560);
  herd.interaction.tap!({ x: 400, y: 560, hit: null }, stage);
  check('ground tap: at the edge it bounds the other way', deer.tx < deer.fx);
}

/* ---- the ball */
const flick = (herd: Herd) => herd.interaction.tap!({ x: herd.ball!.x, y: herd.ball!.y - 6, hit: herd.ball! }, stage);
{
  const { w, herd } = scene({ residents: [creature('Dog-Base', 'four-legged', { x: 0.5, y: 0.5 }), creature('Wolf-Base', 'four-legged', { x: 0.2, y: 0.2 })] });
  run(w, 2);
  const [dog, wolf] = herd.creatures, b = herd.ball!;
  hold(dog, 300, 560); hold(wolf, 20, 470); dog.wait = 30;
  b.place(240, 560); flick(herd);
  const home = { x: b.fx, y: b.fy };
  run(w, 300, () => dog.busy === 'ball');
  check('fetch: the dog catches the ball and carries it', dog.busy === 'ball' && b.held && b.z > 0 && herd.plays.has(dog));
  let carried = true;
  run(w, 600, () => { if (dog.busy === 'ball' && Math.abs(b.fx - dog.fx) > 15 * ART) carried = false; return dog.busy !== 'ball'; });
  check('fetch: ... in its mouth all the way', carried);
  check('fetch: ... and puts it down where it was flicked from, with a hop', !b.held && b.z === 0 && Math.abs(b.fx - home.x) < 16 * ART && dog.st === 'happy' && !dog.busy, `${b.fx} vs ${home.x}`);
  check('fetch: nobody else is left chasing', herd.creatures.every(c => c.st !== 'chase'));
  // the finger takes it back mid-fetch
  flick(herd);
  run(w, 300, () => dog.busy === 'ball');
  herd.interaction.dragStart!({ x: b.x, y: b.y - 6, hit: b }, false, stage);
  run(w, 2);
  check('fetch: the finger takes the ball, the dog lets go', !dog.busy && !herd.plays.has(dog) && b.held);
  herd.interaction.dragEnd!({ x: b.x, y: b.y - 6, hit: b }, false, stage);
  run(w, 200, () => dog.busy === 'ball');
  herd.pet(dog.id);
  run(w, 2);
  check('fetch: a tap on the dog drops the ball where it is', !dog.busy && !b.held);
}
{
  const { w, herd } = scene({ residents: [creature('Beetle-Base', 'four-legged', { x: 0.5, y: 0.5 })] });
  run(w, 2);
  const [beetle] = herd.creatures, b = herd.ball!;
  hold(beetle, 100, 560); beetle.wait = 30;
  b.place(160, 560); b.flick(0.5 * ART, 0);
  run(w, 300, () => beetle.busy === 'ball');
  check('push: the beetle gets behind the ball', beetle.busy === 'ball' && b.held && b.z === 0);
  const x0 = b.fx;
  let ahead = true;
  run(w, 600, () => { if (beetle.busy === 'ball' && Math.sign(b.fx - beetle.fx) !== beetle.dir) ahead = false; return beetle.busy !== 'ball'; });
  check('push: ... and rolls it along in front of it, 30 to 50 art pixels', ahead && Math.abs(b.fx - x0) >= 25 * ART && !b.held, `${(b.fx - x0) / ART}`);
  check('push: ... a last nudge rolls it on', b.moving);
}
{
  // (not at midday: a cat naps then)
  const { w, herd } = scene({ hour: 17, residents: [creature('Cat-Base', 'four-legged', { x: 0.5, y: 0.5 })] });
  run(w, 2);
  const [cat] = herd.creatures, b = herd.ball!;
  hold(cat, 60, 560); cat.wait = 30;
  b.place(200, 560); b.flick(0.3 * ART, 0);
  run(w, 300, () => cat.st === 'act');
  check('pounce: the cat stops short and crouches', cat.act?.a === POUNCE_ACT && cat.busy === 'ball' && Math.hypot(b.fx - cat.fx, b.fy - cat.fy) > 8 * ART);
  const x0 = cat.fx, bumps = b.bumps;
  let up = 0, wiggle = false;
  run(w, 120, () => { up = Math.max(up, cat.lift); if (cat.dx) wiggle = true; return cat.st !== 'act'; });
  check('pounce: wiggles, leaps and lands on it', wiggle && up >= 5 * ART && Math.abs(cat.fx - x0) > 8 * ART);
  run(w, 1);
  check('pounce: ... then bats it away (a bump) and is done', b.bumps === bumps + 1 && !cat.busy && b.moving, `${bumps} -> ${b.bumps}`);
}
{
  const water: Spot = { kind: 'water', x: 240, y: 560, w: 147, h: 39 };
  const { w, herd } = scene({ residents: [creature('Dolphin-Base', 'legless', { x: 0.5, y: 0.5 })], spots: [water] });
  run(w, 2);
  const [dol] = herd.creatures, b = herd.ball!;
  hold(dol, 60, 560); dol.wait = 30;
  b.place(240, 560);
  run(w, 300, () => dol.st === 'act');
  check('nose: a ball lying in the pond calls the dolphin, which swims low', dol.act?.a === NOSE_ACT && dol.off < 0 && dol.busy === 'ball');
  let high = 0, low = Infinity;
  run(w, 50, () => { high = Math.max(high, b.z); low = Math.min(low, b.z); });
  check('nose: the ball bounces on its nose', b.held && high - low >= 5 * ART);
  run(w, 40, () => !b.held);
  check('nose: ... then a flick of the head sends it back toward the grass', !b.held && b.moving);
  run(w, 200, () => dol.st !== 'act');
  run(w, 1);
  // (still in the water, it wades: cut at the waterline like anyone else there)
  check('nose: and the dolphin is free again', !dol.busy && dol.st !== 'act' && (dol.off === 0 || dol.wet));
}
{
  const water: Spot = { kind: 'water', x: 240, y: 560, w: 147, h: 39 };
  const { w, herd } = scene({ residents: [creature('Dolphin-Base', 'legless', { x: 0.5, y: 0.5 })], spots: [water], winter: true });
  run(w, 2);
  const [dol] = herd.creatures, b = herd.ball!;
  hold(dol, 60, 560); b.place(240, 560);
  run(w, 200);
  check('nose: not on a frozen pond', !dol.busy && dol.st !== 'act');
}
{
  const { w, herd } = scene({ residents: [creature('Dolphin-Base', 'legless', { x: 0.5, y: 0.5 })], spots: [{ kind: 'water', x: 240, y: 300, w: 480, h: 40, strip: true }] });
  run(w, 2);
  const [dol] = herd.creatures, b = herd.ball!;
  hold(dol, 60, 560); b.place(240, 560);
  run(w, 200);
  check('nose: not for a ball on the grass', !dol.busy);
}

if (failures) { console.log(`ballplay: ${failures} of ${failures + passes} checks failed`); process.exit(1); }
console.log(`PASS  ballplay: all ${passes} checks (tap reactions, ink, splat, carried pose, shy, fetch, push, pounce, nose)`);
