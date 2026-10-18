/*
 * Species natures without a browser (thread "Behaviours by species"): the table and its lookup
 * (src/stable/natures.ts), the runner's rules (src/playground/behaviours/runner.ts) in a herd, the cut line and
 * the particle looks. The wallpaper's Java does the same, tick by tick (tools/gen-stable-fixtures.ts).
 */
import { World } from '../src/playground/world';
import { Herd, type Resident } from '../src/playground/creatures';
import { ART, drawParticle } from '../src/playground/particles';
import { busyMax, canAct, choose, holds, inHours, paceNow, places, sleepy, startAct, waterAt, BUSY_MAX, ROOM, WADE } from '../src/playground/behaviours/runner';
import { particleLook, traitById, traitIds } from '../src/playground/behaviours';
import { FAMILIES, KEY_TRAITS, MOUNT_TRAITS, SPECIES_TRAITS, natureOf, traitsOf } from '../src/stable/natures';
import { PET_GAITS } from '../src/stable/gaits';
import type { Nature, Spot } from '../src/playground/behaviours/types';
import type { Gait, Facing, Sprite, SpriteSource } from '../src/playground/sprites';

let failures = 0, passes = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); }
};

/** sprites with no picture: key = gait_facing, m prefix for a mount */
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

interface Opts { hour: number, winter?: boolean, residents: Resident[], spots?: Spot[], seed?: string, still?: boolean }
function scene (o: Opts) {
  const w = new World(source(), { seed: o.seed ?? 'natures' });
  const at = { hour: o.hour };
  const herd = new Herd(w, {
    seed: 's', clock: () => new Date(2026, 9, 14, Math.floor(at.hour), Math.round((at.hour % 1) * 60)), still: () => !!o.still, ball: false,
    home: () => ({ x: 400, y: 560 }), spots: () => o.spots ?? [], sky: () => ({ winter: !!o.winter, moon: 2 }),
  });
  herd.set(o.residents);
  w.resize(480, 640);
  return { w, herd, at };
}
const creature = (key: string, gait = 'four-legged', facing = 'right', spot?: { x: number, y: number }, nature?: Nature): Resident => {
  const mount = gait.startsWith('m');
  return { id: `${mount ? 'mount' : 'pet'}:${key}`, sprite: `${gait}_${facing}`, kind: mount ? 'mount' : 'pet', species: key.split('-')[0], spot, nature: nature ?? natureOf(mount ? 'mount' : 'pet', key) };
};
const run = (w: World, n: number, each?: () => void) => { for (let i = 0; i < n; i++) { w.step(); each?.(); } };

/* ---- the table */
{
  const species = Object.keys(PET_GAITS);
  check('table: every Habitica species has a row', species.every(s => s in SPECIES_TRAITS), species.filter(s => !(s in SPECIES_TRAITS)).join(','));
  const used = new Set([...Object.values(SPECIES_TRAITS).flat(), ...Object.values(MOUNT_TRAITS).flat(), ...Object.values(KEY_TRAITS).flatMap(k => [...(k.add ?? []), ...(k.remove ?? [])])]);
  check('table: every trait named is a module', [...used].every(id => !!traitById(id)), [...used].filter(id => !traitById(id)).join(','));
  check('table: every module is used', traitIds().every(id => used.has(id)), traitIds().filter(id => !used.has(id)).join(','));
  check('table: families only name species in the table', Object.values(FAMILIES).flat().every(s => s in SPECIES_TRAITS));
  check('lookup: species, then the creature itself (Cerberus pup keeps night hours, no snow)', traitsOf('Wolf-Cerberus').join() === 'howl,night' && traitsOf('Wolf-Base').join() === 'snowLover,howl');
  check('lookup: the polar cub loves snow and swims instead of sleeping through winter', traitsOf('BearCub-Polar').join() === 'fishing,snowLover,swim' && traitsOf('BearCub-Base').join() === 'winterNap,fishing');
  const rooster = natureOf('pet', 'Rooster-Base');
  check('merge: the rooster sleeps early, crows, stays near home', rooster.schedule.sleep!.join() === '20,5' && rooster.acts.map(a => a.id).join() === 'crow' && rooster.likes.some(l => l.at === 'door'));
  check('merge: families come from Habitica\'s sets', rooster.families.includes('domesticated') && rooster.families.includes('birdsOfAFeather'));
  const rat = natureOf('pet', 'Rat-Base');
  check('merge: pace fields replaced one by one, the rest kept (scurrying rat)', rat.pace.range!.join() === '8,26' && rat.pace.rest === 0.6 && rat.pace.speed === 1 && !!rat.pace.sprint);
  check('merge: a plain species keeps the herd\'s day', natureOf('pet', 'Dog-Base').schedule.sleep!.join() === '21,6' && natureOf('pet', 'Dog-Base').acts.length === 0);
  check('nature: mounts share their species\' ways', JSON.stringify(natureOf('mount', 'Lion-Base')) === JSON.stringify(natureOf('pet', 'Lion-Base')));
  const all = species.map(s => natureOf('pet', `${s}-Base`));
  check('nature: plain data (survives JSON, as the wallpaper gets it)', all.every(n => JSON.stringify(JSON.parse(JSON.stringify(n))) === JSON.stringify(n) && !('tap' in n)));
}

/* ---- hours */
check('hours: [from, to) and wrapping past midnight', inHours(21, [21, 6]) && inHours(3, [21, 6]) && !inHours(6, [21, 6]) && inHours(12, [9, 17]) && !inHours(17, [9, 17]));
check('hours: [x, x] never', !inHours(0, [0, 0]) && !inHours(12, [0, 0]));
{
  const n = (winter: boolean, moon: number, water = true) => ({ hour: 1, winter, moon, water });
  check('when: winter and moon must hold too', holds({ winter: true }, n(true, 0)) && !holds({ winter: true }, n(false, 0)) && holds({ moon: [4] }, n(false, 4)) && !holds({ moon: [4] }, n(false, 3)));
  check('when: water, or none yet', holds({ water: true }, n(false, 0)) && !holds({ water: true }, n(false, 0, false)) && holds({ water: false }, n(false, 0, false)));
}
{
  const owl = natureOf('pet', 'Owl-Base').schedule, cat = natureOf('pet', 'Cat-Base').schedule;
  const at = (hour: number) => ({ hour, winter: false, moon: 2, water: false });
  check('schedule: a night creature is up all night', !sleepy(owl, at(23), 0, 0) && !sleepy(owl, at(3), 500, 0));
  let bouts = 0;
  for (let t = 0; t < 1800; t++) if (sleepy(owl, at(12), t, 0)) bouts++;
  check('schedule: and naps in bouts by day (2 of 3)', bouts === 1200, `${bouts}`);
  check('schedule: a twilight cat is up at dusk and asleep late', !sleepy(cat, at(21), 0, 0) && sleepy(cat, at(23), 0, 0) && !sleepy(cat, at(5.5), 0, 0));
}

/* ---- in the herd */
{
  // night: the plain pets sleep, the night creatures don't
  const { w, herd } = scene({ hour: 23, residents: [creature('Dog-Base'), creature('Hedgehog-Base'), creature('Velociraptor-Base', 'four-legged')] });
  run(w, 400);
  const [dog, hog, raptor] = herd.creatures;
  check('herd: at night the plain dog sleeps, the hedgehog and raptor are about', dog.asleep && !hog.asleep && !raptor.asleep);
  check('herd: a night creature counts as up at night (keeps watch)', hog.nocturnal(w) && !dog.nocturnal(w));
}
{
  // dawn: the rooster crows; neighbours asleep wake for a while; notes rise
  const { w, herd } = scene({ hour: 5.5, residents: [creature('Rooster-Base', 'four-legged', 'right', { x: 0.5, y: 0.5 }), creature('Dog-Base', 'four-legged', 'right', { x: 0.7, y: 0.5 }), creature('Cow-Base', 'four-legged', 'right', { x: 0.05, y: 0.0 })] });
  run(w, 3);
  const [rooster, dog] = herd.creatures;
  check('crow: before 6 the neighbours sleep, the rooster is up', dog.asleep && !rooster.asleep);
  rooster.st = 'idle';
  startAct(rooster, rooster.nature!.acts[0]);
  let notes = 0, woke = false;
  run(w, 40, () => { notes = Math.max(notes, herd.particles.filter(p => p.kind === 'note').length); woke ||= dog.wake > 0; });
  check('crow: notes rise from its head', notes >= 2, `${notes}`);
  check('crow: wakes a sleeper nearby', woke && !dog.isAsleep);
  // (it may well crow again soon after)
  let done = false;
  run(w, 60, () => { done ||= rooster.st !== 'act' && !rooster.act && rooster.busy === undefined; });
  check('crow: done, it goes back to idle', done);
}
{
  // the pacing guard: never more than half the herd (at least BUSY_MAX) in (or walking to) an act
  const pigs = Array.from({ length: 8 }, (_, i) => creature(`GuineaPig-P${i}`, 'sitting'));
  for (const p of pigs) p.nature = natureOf('pet', 'GuineaPig-Base');
  const { w, herd } = scene({ hour: 12, residents: pigs });
  let most = 0, acts = 0;
  run(w, 6000, () => { const n = herd.acting(); most = Math.max(most, n); acts += herd.creatures.filter(c => c.st === 'act').length; });
  check('guard: popcorn happens', acts > 0);
  check(`guard: at most ${busyMax(8)} of 8 at once, and at least ${BUSY_MAX} of any herd`, busyMax(8) === 4 && busyMax(2) === BUSY_MAX && most <= 4 && most > 0, `${most}`);
}
{
  // often enough to notice (Vlad, 15 Oct: the acts were too rarely seen): a horse grazing, a bunny burrowing and a
  // dragon puffing flame between them start an act every 5 s or so at noon (about 65 in 10 minutes before)
  const { w, herd } = scene({ hour: 12, residents: [creature('Horse-Base', 'mfour-legged'), creature('Bunny-Base', 'sitting'), creature('Dragon-Base')] });
  let starts = 0;
  const was = new Map<string, unknown>();
  run(w, 10 * 60 * 30, () => { for (const c of herd.creatures) { if (c.act && was.get(c.id) !== c.act.a) starts++; was.set(c.id, c.act?.a ?? null); } });
  check('guard: three creatures with acts start one every 5 s or so (twice as often as 1 wander in 4 did)', starts >= 120, `${starts} in 10 minutes`);
}
{
  // the rock never walks; the crab never turns round; the sloth crawls
  const { w, herd } = scene({ hour: 12, residents: [creature('Rock-Base', 'sitting', 'front'), creature('Crab-Base', 'four-legged', 'left'), creature('Sloth-Base', 'sitting')] });
  const [rock, crab, sloth] = herd.creatures;
  const x0 = rock.fx, y0 = rock.fy;
  let crabDir = true;
  const d0 = crab.dir;
  run(w, 3000, () => { crabDir &&= crab.dir === d0; });
  check('rock: never moves on its own', rock.fx === x0 && rock.fy === y0);
  check('crab: walks without turning round', crabDir && crab.st !== 'turn');
  check('sloth: crawls', sloth.motion(w) === 'scoot');
  crab.setPos(240, 560); crab.idle(9999);
  crab.goTo(crab.fx - 60 * d0, 560);
  check('crab: even when the goal is behind it', crab.st === 'move' && crab.dir === d0);
}
{
  // the cheetah sprints now and then, with dust
  const { w, herd } = scene({ hour: 12, residents: [creature('Cheetah-Base')] });
  let sprints = 0, dust = 0;
  run(w, 6000, () => { if (herd.creatures[0].sprinting) sprints++; dust = Math.max(dust, herd.particles.filter(p => p.kind === 'dust').length); });
  check('sprint: it sprints', sprints > 0);
  check('sprint: and kicks up dust', dust > 0);
}
{
  // basking in the sun spot (an act at a place: walks there, then lies flat)
  const sun: Spot = { kind: 'sun', x: 120, y: 600, w: 90, h: 0 };
  const { w, herd } = scene({ hour: 12, residents: [creature('Alligator-Base', 'legless', 'left')], spots: [sun] });
  let basked = false;
  run(w, 9000, () => { const c = herd.creatures[0]; basked ||= c.st === 'act' && c.act?.a.id === 'bask' && Math.abs(c.fx - sun.x) <= sun.w; });
  check('bask: goes to the sun and basks there', basked);
}
{
  // the cut line, sinking and the shake, and a tap ends it
  const dig: Nature = {
    traits: ['test'], families: [], schedule: { sleep: [21, 6], home: [19, 6] }, pace: { speed: 1, rest: 1 }, moods: [], likes: [],
    acts: [{ id: 'dig', script: [{ n: 3, fx: [{ kind: 'dirt', at: 'front', life: 12 }] }, { n: 5, sink: 2, cut: 1, dx: 1, turn: true }, { n: 5 }] }],
  };
  const { w, herd } = scene({ hour: 12, residents: [creature('Mole-Base', 'four-legged', 'right', undefined, dig)] });
  const c = herd.creatures[0];
  c.setPos(240, 600); c.idle(9999); c.dir = 1;
  startAct(c, dig.acts[0]);
  run(w, 4);
  check('cut: sunk 2 art pixels, drawn only above 1 art pixel over its feet', c.off === -2 * ART && c.clipBelow === c.y + 1 - ART && c.dx === 1 && c.dir === -1);
  check('dirt: thrown from its front', herd.particles.some(p => p.kind === 'dirt'));
  const ops: string[] = [];
  const g = { fillStyle: '', fillRect: () => ops.push('rect'), drawImage: (...a: number[]) => ops.push(`img ${a[4]}`), save () {}, restore () {}, translate () {}, scale () {} };
  c.draw(g as unknown as CanvasRenderingContext2D, w, w.sprites.get(c.sprite));
  const hs = ops.filter(o => o.startsWith('img')).map(o => Number(o.split(' ')[1]));
  check('cut: no shadow, slices cut short at the line', !ops.includes('rect') && hs.reduce((a, b) => a + b, 0) < 60, hs.join(','));
  c.rider = [{ image: {} as CanvasImageSource, x: 0, y: -40, w: 60, h: 60 }];
  let dug = 0;
  for (let i = 0; i < 400; i++) if (choose(herd, c, herd.now())?.act?.id === 'dig') dug++;
  c.rider = undefined;
  check('ridden: never an act that sinks it (the avatar would float)', dug === 0);
  herd.pet(c.id);
  check('cut: a tap ends the act, whole again', !c.act && c.off === 0 && c.clipBelow === undefined && c.st === 'happy');
}
{
  // particle looks: frames by age, pop, mirrored when sent back
  const note = particleLook('note')!;
  const px = (vx: number, t: number) => {
    const out: string[] = [];
    const g = { fillStyle: '', fillRect (x: number, y: number) { out.push(`${x},${y}`); } };
    drawParticle(g as unknown as CanvasRenderingContext2D, { kind: 'note', x: 30, y: 30, t, life: 40, vx });
    return out;
  };
  check('looks: a note is drawn from its rows, sitting on (x, y)', px(1, 0).length === note.frames[0].rows.join('').replace(/\./g, '').length);
  check('looks: mirrored when it goes the other way', px(-1, 0).join() !== px(1, 0).join() && px(-1, 0).length === px(1, 0).length);
  check('looks: pops at the end', px(1, 39).length === 1);
  check('looks: dust keeps the old two-pixel puff', particleLook('dust')!.frames[0].rows.length === 2);
}

/* ---- water (package W) */
{
  // a pond (an oval, freezes in winter), a stretch of the lake (a band above the walking ground) and a pool too
  // small for anyone
  const pond: Spot = { kind: 'water', x: 240, y: 560, w: 150, h: 39 };
  const lake: Spot = { kind: 'water', x: 240, y: 200, w: 400, h: 54, strip: true };
  const pool: Spot = { kind: 'water', x: 60, y: 600, w: 63, h: 9 };
  const spots = [pond, lake, pool];
  const mk = (winter: boolean) => scene({ hour: 12, winter, spots, residents: [creature('Otter-Base'), creature('Dolphin-Base', 'mfour-legged')] });
  {
    const { herd } = mk(false);
    const [otter, dolphin] = herd.creatures;
    check('places: a pet swims in the pond and the lake, not a pool it doesn\'t fit', places(herd, otter, 'water').join() === [pond, lake].join() && 2 * otter.half(herd.world) + ROOM * ART > pool.w);
    check('places: a mount only in the lake', places(herd, dolphin, 'water').length === 1 && places(herd, dolphin, 'water')[0] === lake);
    check('now: the scene has water', herd.now().water);
  }
  {
    const { w, herd } = mk(true);
    const [otter] = herd.creatures;
    check('winter: the pond is ice, the lake stays open', places(herd, otter, 'water').length === 1 && places(herd, otter, 'water')[0] === lake);
    const only = scene({ hour: 12, winter: true, spots: [pond], residents: [creature('Dolphin-Base')] });
    check('winter: with only the pond, no water (sea creatures rest)', !only.herd.now().water && paceNow(only.herd.creatures[0].nature, only.herd.now()).rest === 2.5);
    otter.setPos(pond.x, pond.y); otter.idle(9999);
    run(w, 2);
    check('winter: walks on the ice, not wading', !waterAt(herd, otter) && otter.off === 0 && otter.clipBelow === undefined);
  }
  {
    const { w, herd } = mk(false);
    const [otter] = herd.creatures;
    otter.setPos(pond.x + 20, pond.y + 4); otter.idle(9999);
    run(w, 2);
    check('wading: feet in the water, drawn cut at the waterline with some of it under', otter.wet && otter.off === -Math.round(60 * WADE / ART) * ART && otter.clipBelow === otter.y + 1);
    check('wading: a swim can start here', canAct(herd, otter, otter.nature!.acts[0]));
    otter.setPos(pond.x, pond.y + pond.h); otter.idle(9999);
    run(w, 2);
    check('wading: out of the water, whole again', !otter.wet && otter.off === 0 && otter.clipBelow === undefined && !canAct(herd, otter, otter.nature!.acts[0]));
    otter.rider = [{ image: {} as CanvasImageSource, x: 0, y: -40, w: 60, h: 60 }];
    let swims = 0;
    for (let i = 0; i < 400; i++) if (choose(herd, otter, herd.now())?.act) swims++;
    otter.rider = undefined;
    check('ridden: never a swim or a dive (the avatar would float)', swims === 0);
  }
  {
    // left to itself, the otter walks to the water, swims and dives inside it, never past the edge
    const { w, herd } = mk(false);
    const [otter] = herd.creatures;
    let swam = 0, dove = 0, out = 0, under = false, came = false, breaths = 0, bubbles = false, ripples = false;
    let x0 = 0;
    run(w, 30000, () => {
      bubbles ||= herd.particles.some(p => p.kind === 'bubble');
      ripples ||= herd.particles.some(p => p.kind === 'ripple');
      const a = otter.act;
      if (!a) return;
      if (a.a.id === 'swim') swam++;
      if (a.a.id === 'dive') {
        dove++;
        const p = a.a.script[a.i];
        under ||= p.depth === 1 && otter.off === -60;
        if (p.elsewhere && a.t === 1) { came = true; if (otter.fx !== x0) breaths++; }
        x0 = otter.fx;
      }
      const s = waterAt(herd, otter);
      if (!s || Math.abs(otter.fx - s.x) > s.w / 2) out++;
    });
    check('swim: the otter swims', swam > 0, `${swam}`);
    check('dive: and dives, all under, up somewhere else', dove > 0 && under && came && breaths > 0, `${dove} ${under} ${came} ${breaths}`);
    check('swim: always in the water', out === 0, `${out}`);
    check('swim: ripples at the waterline, bubbles as it goes under', ripples && bubbles);
  }
  {
    // the dolphin mount walks up off the walking ground into the lake and breaches there
    const { w, herd } = mk(false);
    const dolphin = herd.creatures[1];
    let lake0 = false, top = 0, splash = false;
    run(w, 40000, () => {
      if (dolphin.act && waterAt(herd, dolphin) === lake) lake0 = true;
      if (dolphin.act?.a.id === 'breach') top = Math.max(top, dolphin.lift);
      splash ||= herd.particles.some(p => p.kind === 'splash');
    });
    check('lake: a mount swims out there, above the walking ground', lake0 && herd.band.top > lake.y + lake.h / 2);
    check('breach: leaps clear of the water and splashes back', top >= 7 * ART && splash, `${top}`);
  }
  {
    // the others, each left to itself: the alligator lurks, the frog sits on a lily pad, the bear fishes from the
    // bank, the whale spouts out on the lake
    const lily: Spot = { kind: 'lily', x: 300, y: 560, w: 21, h: 9 };
    const shore: Spot = { kind: 'shore', x: 240, y: 590, w: 120, h: 0 };
    const { w, herd } = scene({ hour: 12, spots: [...spots, lily, shore], residents: [creature('Alligator-Base', 'legless', 'left'), creature('Frog-Base', 'sitting'), creature('Bear-Base', 'mfour-legged'), creature('Whale-Base', 'mlegless', 'left')] });
    const [gator, frog, bear, whale] = herd.creatures;
    let lurked = 0, padded = false, fished = false, spouted = false;
    run(w, 40000, () => {
      if (gator.act?.a.id === 'lurk' && gator.act.i === 1) lurked = Math.max(lurked, gator.act.n);
      padded ||= frog.act?.a.id === 'lily' && Math.abs(frog.fx - lily.x) <= lily.w && frog.off < 0;
      fished ||= bear.act?.a.id === 'fish' && herd.particles.some(p => p.kind === 'fish');
      spouted ||= whale.act?.a.id === 'spout' && waterAt(herd, whale) === lake && herd.particles.some(p => p.kind === 'spout');
    });
    check('lurk: lies low in the water a long while', lurked >= 300, `${lurked}`);
    check('lily: the frog sits on a lily pad', padded);
    check('fishing: the bear stands at the bank and a fish jumps', fished);
    check('spout: the whale spouts out on the lake', spouted);
  }
}

{
  // the still picture (reduced motion, the widget): the Lion lies low (its nature's still pose), never while held
  const { w, herd } = scene({ hour: 12, still: true, residents: [creature('Lion-Base', 'four-legged', 'right', { x: 0.3, y: 0.5 }), creature('Wolf-Base', 'four-legged', 'right', { x: 0.7, y: 0.5 })] });
  const [lion, wolf] = herd.creatures;
  const rows = (c: typeof lion) => {
    let h = 0;
    const g = { fillRect () {}, drawImage (..._a: number[]) { h += _a[4]; }, save () {}, restore () {}, translate () {}, scale () {} } as unknown as CanvasRenderingContext2D;
    c.draw(g, w);
    return h;
  };
  check('still pose: the Lion\'s nature has one (lounge), the Wolf\'s none', lion.stillPose()?.sq === 1 && wolf.stillPose() === undefined);
  const low = rows(lion);
  herd.pickUp(lion, 100, 300);
  const held = rows(lion);
  check('still pose: drawn squashed in the still picture (an art row hidden), whole while held', lion.stillPose() === undefined && low < held, `${low} vs ${held}`);
}

if (failures) { console.log(`FAIL  natures: ${failures} of ${passes + failures} checks failed`); process.exit(1); }
console.log(`PASS  natures: all ${passes} checks (table, lookup, hours, night and dawn, crow, guard, rock, crab, sprint, bask, cut line, looks, water, still pose)`);
