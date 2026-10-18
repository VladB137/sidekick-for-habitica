/*
 * Play in the Stable without a browser: the toy box's record and hide and seek's daily pick (src/app/stable/toybox.ts),
 * and the engine (src/playground/play): hiding behind the spot and being found, nobody hiding at night or a mount,
 * someone walking over to hide, the toy box's toys dropping in and flying away, the ball put away, each
 * playground's own toy, and a herd with no Play attached playing none of it. Pictures are not drawn here.
 */
import { World } from '../src/playground/world';
import { Herd, type Resident } from '../src/playground/creatures';
import { ART } from '../src/playground/particles';
import { Rng } from '../src/playground/rng';
import type { Gait, Facing, Sprite, SpriteSource } from '../src/playground/sprites';
import type { SceneLayer } from '../src/playground/scenes/layer';
import { SCENE_IDS, type SceneId } from '../src/playground/scenes/palettes';
import { BOX_TOYS, OWN_TOY, Play, SPOTS, TOY_ART } from '../src/playground/play';
import { rimPixels } from '../src/playground/play/hint';
import type { PineCones } from '../src/playground/play/toys';
import { natureOf } from '../src/stable/natures';
import { POUNCE_ACT } from '../src/playground/ballplay';
import { hiderFor, justFound, loadPlay, markFound, normalizePlay, roundOf, savePlay, setToys, toysOut, HIDE_AGAIN, TOY_NAMES } from '../src/app/stable/toybox';

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };

const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } };

// ---- the record
{
  const empty = normalizePlay(undefined);
  const noon = new Date(2026, 9, 15, 12, 0, 0), later = (ms: number) => new Date(noon.getTime() + ms);
  check('a fresh record: the ball is out, nobody found', JSON.stringify(toysOut(empty, 3)) === '["ball"]' && !justFound(empty, 3, noon) && roundOf(empty, 3, '2026-10-15') === '2026-10-15');
  const r = normalizePlay({ toys: { 1: ['kite', 'frisbee', 'yo-yo', 'kite'], x: ['ball'], 2: 'ball' }, found: { 1: '2026-10-15', 2: 'yesterday', 3: 5, 4: '2026-10-15T09:30:05', 5: '2026-10-15T9:30' } });
  check('a stored record is read entry by entry (unknown toys, broken days and times dropped)', JSON.stringify(r) === JSON.stringify({ toys: { 1: ['frisbee', 'kite'] }, found: { 1: '2026-10-15', 4: '2026-10-15T09:30:05' } }), JSON.stringify(r));
  check('an older record (the day only) reads as found at midnight: hiding again', !justFound(r, 1, noon) && justFound(r, 1, new Date(2026, 9, 15, 0, 1)) && roundOf(r, 1, '2026-10-15') === '2026-10-15');
  check('everything put away stays put away', JSON.stringify(toysOut(setToys(empty, 4, []), 4)) === '[]');
  check('toys are kept in the toy box\'s order', JSON.stringify(toysOut(setToys(empty, 4, ['kite', 'ball']), 4)) === '["ball","kite"]');
  const f = markFound(empty, 2, noon);
  check('found: nobody hides there for two minutes, then a new round, per playground', justFound(f, 2, later(HIDE_AGAIN - 1000)) && !justFound(f, 2, later(HIDE_AGAIN)) && !justFound(f, 1, noon) && HIDE_AGAIN === 120_000);
  check('found: the next round is seeded by the find; tomorrow by the day again', roundOf(f, 2, '2026-10-15') === '2026-10-15T12:00:00' && roundOf(f, 2, '2026-10-16') === '2026-10-16');
  const pets = Array.from({ length: 6 }, (_, i) => `pet:Wolf-P${i}` as const);
  const rounds = new Set(Array.from({ length: 12 }, (_, i) => hiderFor('u1', 2, roundOf(markFound(empty, 2, later(i * HIDE_AGAIN)), 2, '2026-10-15'), pets)));
  check('found: later rounds pick other pets too', rounds.size >= 3, `${rounds.size} different`);
  savePlay('u1', setToys(f, 2, ['stick']));
  savePlay(undefined, setToys(f, 2, ['kite']));
  check('saved per account', JSON.stringify(toysOut(loadPlay('u1'), 2)) === '["stick"]' && JSON.stringify(toysOut(loadPlay('u2'), 2)) === '["ball"]' && justFound(loadPlay('u1'), 2, later(1000)));
  mem.set('critoracle:v2:play', '{broken');
  check('a broken store reads as fresh', JSON.stringify(loadPlay('u1')) === JSON.stringify(empty));
}

// ---- today's hider
{
  const two = ['pet:Wolf-Base', 'mount:Dragon-Red'];
  check('nobody hides where one creature lives', hiderFor('u', 1, '2026-10-15', ['pet:Wolf-Base']) === undefined);
  check('mounts don\'t hide', hiderFor('u', 1, '2026-10-15', ['mount:Wolf-Base', 'mount:Dragon-Red']) === undefined);
  check('a pet hides among a pet and a mount', hiderFor('u', 1, '2026-10-15', two) === 'pet:Wolf-Base');
  const many = ['pet:Wolf-Base', 'pet:Fox-Desert', 'pet:BearCub-Golden', 'pet:Cactus-Red', 'mount:Dragon-Red'];
  const days = Array.from({ length: 40 }, (_, i) => `2026-11-${String(1 + (i % 28)).padStart(2, '0')}`);
  const picks = days.map(d => hiderFor('u', 1, d, many));
  check('the same account, playground and day pick the same pet', hiderFor('u', 1, '2026-10-15', many) === hiderFor('u', 1, '2026-10-15', many));
  check('different days pick different pets, never the mount', new Set(picks).size >= 3 && !picks.includes('mount:Dragon-Red'), JSON.stringify([...new Set(picks)]));
}

// ---- the engine
function source (): SpriteSource {
  const cache = new Map<string, Sprite>();
  return {
    get (key) {
      let s = cache.get(key);
      if (s) return s;
      const [gait, facing] = key.split('_');
      const mount = key.startsWith('m');
      const w = mount ? 105 : 81, h = mount ? 105 : 99;
      const mask = new Uint8Array(w * h);
      // a body in the lower two thirds, so the painted rows are not the whole cell
      for (let y = Math.floor(h / 3); y < h; y++) for (let x = 10; x < w - 10; x++) mask[y * w + x] = 1;
      s = { key, image: {} as CanvasImageSource, w, h, anchor: { x: Math.floor(w / 2), y: h - 1 }, gait: gait.replace(/^m/, '') as Gait, facing: facing as Facing, nocturnal: false, mask };
      cache.set(key, s);
      return s;
    },
    load: async () => {},
  };
}
const pet = (id: string, gait = 'walk'): Resident => ({ id, sprite: `${gait}_right`, kind: gait.startsWith('m') ? 'mount' : 'pet', species: 'Wolf' });
/** the scene layer's parts Play uses */
const layer = { tone: (c: string) => c, lightKey: () => 'day', horizon: () => 300, lantern: () => ({ x: 400, y: 290 }) } as unknown as SceneLayer;

function scene (o: { scene?: SceneId, hour?: number, residents?: Resident[], seek?: () => string | undefined, still?: boolean, play?: boolean } = {}) {
  const w = new World(source(), { seed: 'play' });
  const herd = new Herd(w, { seed: 's', clock: () => new Date(2026, 9, 15, o.hour ?? 12, 0), still: () => !!o.still });
  const found: string[] = [], told: (string | null)[] = [];
  const play: Play | undefined = o.play === false ? undefined : new Play({
    world: w, herd, layer, scene: o.scene ?? 'meadow', rng: new Rng('p'), still: () => !!o.still, seek: o.seek, onFound: id => found.push(id), onHiding: () => told.push(play!.hider?.id ?? null),
  });
  herd.set(o.residents ?? [pet('pet:a'), pet('pet:b'), pet('mount:c', 'mwalk')]);
  w.resize(480, 640);
  return { w, herd, play: play!, found, told };
}
const run = (w: World, n: number, each?: () => boolean | void) => { for (let i = 0; i < n; i++) { w.step(); if (each?.()) return; } };

{
  const { w, herd, play, found, told } = scene();
  const a = herd.byId('pet:a')!;
  check('hide: a pet goes behind the spot', play.hide('pet:a') && play.hider === a && a.busy === 'hide');
  const s = play.spot.solidTop();
  check('hide: it is sunk and cut off below the spot\'s solid part, with no shadow', a.off < 0 && a.clipBelow === s + 2 * ART, `off ${a.off}, clip ${a.clipBelow}, solid ${s}`);
  // its top 40% of painted rows shows above the solid part: painted rows 33..98 (66 rows) → 26 rows show, snapped
  const top = a.y - 98 - (a.restHeight(w) + a.off), shown = s - (top + 33);
  check('hide: about 40% of it peeks over', Math.abs(shown - 26) <= ART, `${shown} px show`);
  const at = [a.fx, a.fy];
  run(w, 600);
  check('hide: it stays there, not wandering off', play.hider === a && a.fx === at[0] && a.fy === at[1] && a.busy === 'hide');
  check('hide: only one at a time, and a mount never', !play.hide('pet:b') && !play.hide('mount:c'));
  check('found: by id, once', play.found() === 'pet:a' && found.join() === 'pet:a' && play.found() === undefined);
  check('TalkBack is told when someone hides and when it is found', told.join() === 'pet:a,', JSON.stringify(told));
  check('found: it comes out in front, drawn whole again', !a.busy && a.off === 0 && a.clipBelow === undefined && a.fy > play.spot.y && play.hider === null);
}
{
  const { play } = scene({ hour: 22 });
  check('nobody hides at night', !play.hide('pet:a') && play.hider === null);
}
{
  const { w, herd, play } = scene({ hour: 12 });
  play.hide('pet:a');
  (herd as any).o.clock = () => new Date(2026, 9, 15, 20, 0);
  run(w, 2);
  const a = herd.byId('pet:a')!;
  check('at dusk the hider comes out by itself', play.hider === null && !a.busy && a.off === 0);
}
{
  const { w, herd, play } = scene({ residents: [pet('pet:a'), pet('pet:b')] });
  herd.set([pet('pet:b')]);
  play.hide('pet:b');
  herd.set([pet('pet:a')]);
  run(w, 2);
  check('a hider who leaves the playground lets go of the spot', play.hider === null);
}
{
  let asked = 0;
  const { w, herd, play } = scene({ seek: () => { asked++; return 'pet:b'; } });
  run(w, 31);
  const b = herd.byId('pet:b')!;
  check('seek: someone walks over to hide while you watch', asked === 1 && play.hider === b && b.clipBelow === undefined && (b.st === 'move' || b.st === 'turn'), b.st);
  run(w, 460);
  check('seek: once there it hides', play.hider === b && b.clipBelow !== undefined && Math.abs(b.fx - play.spot.x) <= 8 * ART, `${b.fx} vs ${play.spot.x}`);
}
{
  const { w, herd, play } = scene();
  check('the ball is out to begin with', play.has('ball') && JSON.stringify(play.out()) === '["ball"]');
  play.setOut(['frisbee']);
  check('setOut: the ball put away, the frisbee simply there', !play.has('ball') && herd.ball!.hidden && play.has('frisbee') && w.entities.includes(play.toys.get('frisbee')!));
  herd.ball!.flick(3 * ART, 0);
  herd.ball!.hidden = true;
  run(w, 60);
  check('a ball in the toy box is chased by nobody and stays put', herd.creatures.every(c => c.st !== 'chase'));
  play.add('kite');
  const kite = play.toys.get('kite')!;
  check('add: the kite drops in from above', (kite as any).arriving === true || kite.z > 0, JSON.stringify({ z: kite.z }));
  run(w, 240);
  check('add: then it has landed', !(kite as any).arriving);
  play.remove('kite');
  check('remove: it flies up and away', !play.has('kite') && w.entities.includes(kite));
  run(w, 300);
  check('remove: then it is gone from the playground', !w.entities.includes(kite) && kite.done);
  play.add('ball');
  check('add: the ball comes back out', play.has('ball') && !herd.ball!.hidden);
  play.remove('ball');
  check('remove: the ball is put away', !play.has('ball'));
}
{
  for (const id of SCENE_IDS) {
    const { w, play } = scene({ scene: id });
    check(`${id}: its own toy and hiding spot are in the playground`, w.entities.includes(play.own) && w.entities.includes(play.spot) && play.own.fx > 0 && play.spot.x > 0 && !!SPOTS[id].name && !!TOY_NAMES[OWN_TOY[id]]);
    // each own toy, tapped: something happens and nothing breaks over a while
    const { herd } = { herd: (play as any).o.herd as Herd };
    play.own.tap(play.own.fx, play.own.fy);
    let engaged = false;
    for (let i = 0; i < 400; i++) { w.step(); if (herd.creatures.some(c => c.busy)) engaged = true; }
    run(w, 1200);
    check(`${id}: a tap on it gets someone playing, and after a while everyone is free again`, engaged && herd.creatures.every(c => !c.busy && c.off === 0 && c.clipBelow === undefined),
      JSON.stringify(herd.creatures.map(c => [c.id, c.busy, c.off, c.st])));
  }
  check('every toy has a picture and a name', [...BOX_TOYS, ...Object.values(OWN_TOY)].every(k => !!TOY_ART[k] && !!TOY_NAMES[k]));
}
{
  // the Pine hill cones play by species like the ball (ballplay.ts): a Dog carries one back to the pile, a Beetle
  // pushes one along, a Cat pounces; each lets go when the cone is gone
  const one = (key: string) => {
    const r: Resident = { id: `pet:${key}`, sprite: 'four-legged_right', kind: 'pet', species: key.split('-')[0], nature: natureOf('pet', key) };
    const { w, herd, play } = scene({ scene: 'pine', residents: [r], hour: 10 }); // (the Cat naps at noon)
    run(w, 2);
    const c = herd.creatures[0], cones = play.own as PineCones;
    // standing a little way off to the right of the pile, the cone sent its way
    c.setPos(cones.fx + 50 * ART, cones.fy); c.tx = c.fx; c.ty = c.fy; c.idle(9999);
    let k = 0;
    while (cones.rollers().length === 0 || cones.rollers()[0].x < cones.fx) { cones.stop(); cones.tap(); if (++k > 40) break; }
    return { w, herd, c, cones };
  };
  {
    const { w, herd, c, cones } = one('Dog-Base');
    let carried = false;
    run(w, 900, () => { const r = cones.rollers()[0]; if (r && herd.plays.playing(r) && herd.plays.has(c) && r.z > 0) carried = true; return carried && !cones.rollers().length; });
    check('cones: a Dog fetches a cone back to the pile in its mouth', carried && !cones.rollers().length && !c.busy, JSON.stringify({ carried, left: cones.rollers().length, busy: c.busy }));
  }
  {
    const { w, herd, c, cones } = one('Beetle-Base');
    let pushed = false;
    run(w, 600, () => { if (herd.plays.has(c) && cones.rollers().length && herd.plays.playing(cones.rollers()[0])) pushed = true; return pushed; });
    check('cones: a Beetle pushes a cone along', pushed);
    cones.stop();
    run(w, 2);
    check('cones: put away mid-game, the Beetle lets go', !herd.plays.has(c) && !c.busy);
  }
  {
    const { w, c } = one('Cat-Base');
    let pounced = false;
    run(w, 600, () => { if (c.act?.a === POUNCE_ACT) pounced = true; return pounced; });
    check('cones: a Cat pounces on a cone', pounced);
    run(w, 900);
    check('cones: after the pounce the Cat is free again', !c.busy);
  }
  {
    const { w, c, cones } = one('Wolf-Base');
    let batted = false;
    run(w, 600, () => { if (c.st === 'happy' && cones.rollers().length) batted = true; return batted; });
    check('cones: a species with no ball play still bats it back with a hop', batted);
  }
}
{
  // the wallpaper's herd: no Play, so nothing hides and the creatures' new fields stay at rest
  const { w, herd } = scene({ play: false });
  run(w, 900);
  check('without Play no one is busy, sunk or cut off', herd.creatures.every(c => !c.busy && c.off === 0 && c.clipBelow === undefined));
}


// ---- the rim that marks what a tap opens (hint.ts)
{
  // a 6 x 6 square in a 6 x 6 box: the line one pixel out on its top and sides, corners closed, nothing under it
  const r = rimPixels(() => true, 6, 6, 'line', '#FFFAE4');
  const a = (x: number, y: number) => r.data[((y + r.pad) * r.W + x + r.pad) * 4 + 3];
  let top = 0, sides = 0, under = 0, inside = 0;
  for (let x = -1; x <= 6; x++) { if (a(x, -1)) top++; if (a(x, 6)) under++; }
  for (let y = 0; y < 6; y++) { if (a(-1, y)) sides++; if (a(6, y)) sides++; }
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) if (a(x, y)) inside++;
  check('rim line: one image pixel round the top (corners too) and both sides, none underneath or over the picture',
    r.pad === 1 && top === 8 && sides === 12 && under === 0 && inside === 0 && a(0, -1) === Math.round(0.7 * 255), JSON.stringify({ top, sides, under, inside }));
  check('rim line: the colour asked for', r.data[((0) * r.W + 1) * 4] === 0xFF && r.data[((0) * r.W + 1) * 4 + 2] === 0xE4);
  const g = rimPixels((x, y) => x === 4 && y === 4, 9, 9, 'glow', '#FFECAA');
  const ga = (x: number, y: number) => g.data[((y + g.pad) * g.W + x + g.pad) * 4 + 3];
  check('rim glow: four pixels out, fading', g.pad === 4 && ga(3, 4) > ga(2, 4) && ga(2, 4) > ga(1, 4) && ga(1, 4) > ga(0, 4) && ga(0, 4) > 0 && ga(-1, 4) === 0 && ga(4, 5) === 0);
}

console.log(`play: ${checks - failures}/${checks} passed`);
if (failures) process.exit(1);
