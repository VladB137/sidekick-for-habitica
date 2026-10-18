/*
 * Creatures together (thread "Pets together"): bonds and temperaments read from Habitica's data
 * (src/app/stable/social.ts), and what the herd does with them (src/playground/creatures.ts): company by
 * temperament, greetings with small hearts or a sparkle, leaning in, a little one following its grown-up and
 * copying its hop, starting beside a friend, sleeping side by side and breathing in step; then tag, the line home
 * at dusk, huddling in the snow, watching fireflies, a night creature's watch and your pet beside your mount; then the
 * signature pairs (a cat and yarn, a dragon and its egg, a squirrel and a treeling, penguins single file, a sheepdog,
 * meeting at the pond, the elders) and the app's touch extras (passing the ball, my turn, a crit's spin, the boss). The live wallpaper's
 * Java herd is held to the same moves tick by tick by npm run android:test.
 */
import { World } from '../src/playground/world';
import { Herd, type Bond, type HerdOptions, type Resident } from '../src/playground/creatures';
import { ART, drawParticle } from '../src/playground/particles';
import type { Facing, Gait, Sprite, SpriteSource } from '../src/playground/sprites';
import { aboutLine, coldOf, eggWord, signaturesOf, socialOf, temperOf, withSocial } from '../src/app/stable/social';

let failures = 0, passes = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); }
};

/* ---------------------------------------------------------------- what Habitica says about them */

check('temper: Habitica calls the Wolf loyal, so it keeps close', temperOf('Wolf') === 'close' && eggWord('Wolf') === 'a loyal');
check('temper: the perfidious Otter and the regal Lion keep to themselves', temperOf('Otter') === 'aloof' && temperOf('Lion') === 'aloof');
check('temper: the mischievous Cat and Monkey make mischief', temperOf('Cat') === 'mischief' && temperOf('Monkey') === 'mischief');
check('temper: the mooing Cow is usual; one-offs speak through their cub (Bear: a brave Bear Cub)', temperOf('Cow') === 'usual' && eggWord('Bear') === 'a brave' && temperOf('Phoenix') === 'usual');
check('temper: Yarn is "woolen", without an article', eggWord('Yarn') === 'woolen');

const bondsOf = (ids: string[]) => socialOf(ids);
const kindOf = (s: ReturnType<typeof socialOf>, a: string, b: string) => s.get(a)?.bonds.find(x => x.id === b)?.kind;
{
  const s = bondsOf(['pet:Wolf-Base', 'mount:Wolf-Base']);
  check('bonds: a pet and the mount of its key are family, both ways', kindOf(s, 'pet:Wolf-Base', 'mount:Wolf-Base') === 'family' && kindOf(s, 'mount:Wolf-Base', 'pet:Wolf-Base') === 'family');
}
{
  const s = bondsOf(['pet:LionCub-Base', 'pet:Lion-Veteran', 'pet:Wolf-Red', 'mount:Wolf-Base']);
  check('bonds: a Lion Cub and a Lion are one animal (kin), as are any two Wolves', kindOf(s, 'pet:LionCub-Base', 'pet:Lion-Veteran') === 'kin' && kindOf(s, 'pet:Wolf-Red', 'mount:Wolf-Base') === 'kin');
}
{
  const s = bondsOf(['pet:Wolf-Base', 'pet:Wolf-Red', 'pet:Fox-Base', 'pet:Cow-Red']);
  check('bonds: a Fox and Wolves share a Habitica family (Polar Pro): cousins', kindOf(s, 'pet:Fox-Base', 'pet:Wolf-Base') === 'cousin');
  check('bonds: the same potion (not Base) makes look-alikes', kindOf(s, 'pet:Cow-Red', 'pet:Wolf-Red') === 'alike' && kindOf(s, 'pet:Cow-Red', 'pet:Wolf-Base') === undefined);
  check('bonds: the two left without family or kin are friends', kindOf(s, 'pet:Cow-Red', 'pet:Fox-Base') === 'friend');
}
{
  const ids = ['pet:Cow-Base', 'pet:Snake-Base', 'pet:Robot-Base', 'pet:Egg-Base', 'pet:Yarn-Base'];
  const s = bondsOf(ids);
  const friends = ids.map(id => s.get(id)!.bonds.filter(b => b.kind === 'friend'));
  check('bonds: those with no family or kin pair up as friends, one friend each', friends.every(f => f.length <= 1) && friends.filter(f => f.length === 1).length === 4);
  check('bonds: friendship is mutual', ids.every(id => friends[ids.indexOf(id)].every(f => s.get(f.id)!.bonds.some(b => b.id === id && b.kind === 'friend'))));
  const again = bondsOf([...ids].reverse());
  check('bonds: the same friends whatever the order', ids.every(id => JSON.stringify(again.get(id)!.bonds.filter(b => b.kind === 'friend')) === JSON.stringify(s.get(id)!.bonds.filter(b => b.kind === 'friend'))));
  const s2 = bondsOf([...ids, 'pet:Cactus-Base']);
  const kept = ids.filter(id => JSON.stringify(s2.get(id)!.bonds.filter(b => b.kind === 'friend')) === JSON.stringify(s.get(id)!.bonds.filter(b => b.kind === 'friend')));
  check('bonds: a newcomer changes at most one friendship', kept.length >= ids.length - 3, String(kept.length));
}
{
  const s = bondsOf(['pet:Wolf-Base', 'mount:Wolf-Base', 'pet:Wolf-Red', 'pet:Fox-Red']);
  const order = s.get('pet:Wolf-Base')!.bonds.map(b => b.kind);
  check('bonds: strongest first (family, kin, then the rest)', order[0] === 'family' && order[1] === 'kin', order.join(','));
}
{
  const ids = ['pet:Wolf-Base', 'mount:Wolf-Base', 'pet:Cow-Base'];
  const name = (id: string) => ({ 'pet:Wolf-Base': 'Pip', 'mount:Wolf-Base': 'Ruby', 'pet:Cow-Base': 'Bao' } as Record<string, string>)[id];
  const species = (id: string) => (id.includes('Cow') ? 'Cow' : 'Wolf');
  check('sheet: Habitica’s word and the grown-up', aboutLine('pet:Wolf-Base', ids, name, species) === 'A loyal Wolf · its grown-up, Ruby, lives here', aboutLine('pet:Wolf-Base', ids, name, species));
  check('sheet: the grown-up’s little one', aboutLine('mount:Wolf-Base', ids, name, species) === 'A loyal Wolf · its little one, Pip, lives here');
  check('sheet: just the word when it has no close bond here', aboutLine('pet:Cow-Base', ids, name, species) === 'A mooing Cow', aboutLine('pet:Cow-Base', ids, name, species));
}

/* ---------------------------------------------------------------- what the herd does with them */

function source (): SpriteSource {
  const cache = new Map<string, Sprite>();
  return {
    get (key) {
      let s = cache.get(key);
      if (s) return s;
      const [gait, facing, night] = key.split('_');
      const mount = key.startsWith('m');
      const w = mount ? 105 : 63, h = mount ? 105 : 63;
      s = { key, image: {} as CanvasImageSource, w, h, anchor: { x: Math.floor(w / 2), y: h - 1 }, gait: gait.replace(/^m/, '') as Gait, facing: facing as Facing, nocturnal: night === 'n', mask: new Uint8Array(w * h).fill(1) };
      cache.set(key, s);
      return s;
    },
    load: async () => {},
  };
}
const R = (id: string, gait: string, temper: Resident['temper'], bonds: Bond[], spot?: { x: number, y: number }, facing = 'right'): Resident =>
  ({ id, sprite: `${gait}_${facing}`, kind: gait.startsWith('m') ? 'mount' : 'pet', species: id.split(':')[1].split('-')[0], temper, bonds, spot });
function scene (rs: Resident[], hour = 12, seed = 'together', more: Partial<HerdOptions> = {}) {
  const w = new World(source(), { seed });
  let h = hour, sky: string | null = null;
  const herd = new Herd(w, { seed: 's', clock: () => new Date(2026, 9, 14, Math.floor(h), Math.round((h % 1) * 60)), still: () => false, ball: false, home: () => ({ x: 300, y: 560 }), weather: () => sky, ...more });
  w.resize(720, 640);
  herd.set(rs);
  return { w, herd, setHour: (x: number) => { h = x; }, setSky: (k: string | null) => { sky = k; } };
}
const run = (w: World, n: number, until?: () => boolean) => { for (let i = 0; i < n; i++) { w.step(); if (until?.()) return i + 1; } return n; };

{
  // two close friends, side by side and idle
  const { w, herd } = scene([
    R('pet:Rat-Base', 'four-legged', 'close', [{ id: 'pet:Cow-Base', kind: 'friend' }], { x: 0.4, y: 0.5 }),
    R('pet:Cow-Base', 'four-legged', 'close', [{ id: 'pet:Rat-Base', kind: 'friend' }], { x: 0.6, y: 0.5 }),
  ]);
  const [a, b] = herd.creatures;
  const tiny = () => herd.particles.filter(p => p.kind === 'tiny').length;
  let most = 0, met = false, faced = false, hopped = 0;
  run(w, 20000, () => {
    most = Math.max(most, tiny());
    if (herd.moments.length) {
      met = true;
      const m = herd.moments[0];
      if (m.t === 2) faced = (m.a.x < m.b.x ? m.a.dir === 1 && m.b.dir === -1 : m.a.dir === -1 && m.b.dir === 1);
      if (m.t === 12) hopped = [a, b].filter(c => c.st === 'happy').length;
    }
    return met && most >= 3 && herd.moments.length === 0;
  });
  check('greet: friends walk over and meet', met);
  check('greet: they turn to face each other', faced);
  check('greet: both hop', hopped >= 1);
  check('greet: a little group of three small hearts between them', most === 3, String(most));
  check('greet: once it’s over they are free again', !a.busy && !b.busy);
  let again = false;
  run(w, 850, () => { again ||= herd.moments.length > 0; return false; });
  check('greet: the same two don’t greet again within half a minute', !again);
}
{
  // kin greet with a sparkle, not hearts
  const { w, herd } = scene([
    R('pet:Wolf-Base', 'four-legged', 'close', [{ id: 'pet:Wolf-Red', kind: 'kin' }], { x: 0.4, y: 0.5 }),
    R('pet:Wolf-Red', 'four-legged', 'close', [{ id: 'pet:Wolf-Base', kind: 'kin' }], { x: 0.6, y: 0.5 }),
  ], 12, 'kin');
  let spark = false, tiny = false;
  run(w, 20000, () => { spark ||= herd.particles.some(p => p.kind === 'spark'); tiny ||= herd.particles.some(p => p.kind === 'tiny'); return spark; });
  check('greet: kin get a sparkle, small hearts are for family and friends', spark && !tiny);
}
{
  // a nuzzle: family lean into each other now and then, and a tap ends it
  const { w, herd } = scene([
    R('mount:Wolf-Base', 'mfour-legged', 'close', [{ id: 'pet:Wolf-Base', kind: 'family' }], { x: 0.3, y: 0.5 }, 'left'),
    R('pet:Wolf-Base', 'four-legged', 'close', [{ id: 'mount:Wolf-Base', kind: 'family' }], { x: 0.6, y: 0.5 }),
  ], 12, 'nuzzle');
  const [m, p] = herd.creatures;
  const n = run(w, 60000, () => m.lean !== 0 && p.lean !== 0);
  check('nuzzle: family lean into each other', m.lean !== 0 && p.lean === -m.lean, String(n));
  check('nuzzle: towards each other', (m.x < p.x) === (m.lean > 0));
  herd.pet(p.id);
  check('nuzzle: a tap ends it for both', m.lean === 0 && p.lean === 0 && !m.busy && !p.busy && herd.moments.length === 0 && p.st === 'happy');
}
{
  // the little one follows its grown-up, and copies its hop
  const { w, herd } = scene([
    R('mount:Wolf-Base', 'mfour-legged', 'close', [{ id: 'pet:Wolf-Base', kind: 'family' }], { x: 0.5, y: 0.5 }, 'left'),
    R('pet:Wolf-Base', 'four-legged', 'close', [{ id: 'mount:Wolf-Base', kind: 'family' }], { x: 0.3, y: 0.5 }),
  ], 12, 'follow');
  const [m, p] = herd.creatures;
  let follows = 0, walks = 0, wasMoving = false;
  run(w, 30000, () => {
    const moving = m.st === 'move' || m.st === 'turn';
    if (moving && !wasMoving) walks++;
    wasMoving = moving;
    if (p.follow) follows++;
    return false;
  });
  check('follow: the grown-up sets off and its little one is told to follow', walks > 3 && follows > 0, `${walks} walks, ${follows} ticks waiting`);
  // copy: tap the grown-up while the little one stands by
  run(w, 2000, () => m.st === 'idle' && p.st === 'idle' && !m.busy && !p.busy && Math.abs(m.fx - p.fx) < 60 * ART);
  herd.release(p); herd.release(m);
  herd.pet(m.id);
  const hopAt = run(w, 20, () => p.st === 'happy');
  check('copy: tap the grown-up and its little one hops 8 ticks later', hopAt === 8, String(hopAt));
}
{
  // a little one that has no saved spot starts beside its grown-up, facing it
  const { herd } = scene([
    R('mount:Wolf-Base', 'mfour-legged', 'close', [{ id: 'pet:Wolf-Base', kind: 'family' }], { x: 0.2, y: 0.5 }, 'left'),
    R('pet:Cow-Base', 'four-legged', 'usual', [], { x: 0.8, y: 0.9 }),
    R('pet:Wolf-Base', 'four-legged', 'close', [{ id: 'mount:Wolf-Base', kind: 'family' }]),
  ], 12, 'pairup');
  const [m, , p] = herd.creatures;
  check('placement: a free little one starts right beside its grown-up', Math.abs(p.fy - m.fy) < ART && Math.abs(Math.abs(p.fx - m.fx) - (p.half(herd.world) + m.half(herd.world) + 3 * ART)) < 4 * ART, `${p.fx} ${m.fx}`);
  check('placement: facing it', (m.fx > p.fx) === (p.dir > 0));
}
{
  // bedtime: friends lie down side by side and breathe in step
  const { w, herd, setHour } = scene([
    R('pet:Rat-Base', 'four-legged', 'close', [{ id: 'pet:Cow-Base', kind: 'friend' }], { x: 0.1, y: 0.2 }),
    R('pet:Cow-Base', 'four-legged', 'close', [{ id: 'pet:Rat-Base', kind: 'friend' }], { x: 0.9, y: 0.9 }),
    R('pet:Snake-Base', 'legless', 'usual', [], { x: 0.5, y: 0.1 }),
  ], 19.5, 'bed');
  run(w, 3000);
  setHour(22);
  run(w, 3000);
  const [a, b] = herd.creatures;
  const near = Math.abs(a.fx - b.fx) <= a.half(w) + b.half(w) + 12 * ART && Math.abs(a.fy - b.fy) <= 10 * ART;
  check('bedtime: friends lie down side by side', a.isAsleep && b.isAsleep && near, `${a.fx},${a.fy} ${b.fx},${b.fy}`);
  let same = true;
  for (let i = 0; i < 200; i++) { w.step(); if (a.sq !== b.sq) same = false; }
  check('bedtime: and breathe in step', !near || same);
}

/* ---------------------------------------------------------------- part two: games and the weather */
{
  // tag: the mischief maker starts it with the nearest pet free to play; tags swap who's it
  const { w, herd, setHour } = scene([
    R('pet:Cat-Base', 'four-legged', 'mischief', [], { x: 0.4, y: 0.5 }),
    R('pet:Rat-Base', 'hop', 'close', [], { x: 0.5, y: 0.5 }),
    R('mount:Horse-Base', 'mfour-legged', 'usual', [], { x: 0.9, y: 0.9 }, 'left'),
  ], 12, 'tag');
  const [cat, rat, horse] = herd.creatures;
  const n = run(w, 40000, () => !!herd.game);
  const g = herd.game;
  check('tag: a mischief maker starts a game with a pet nearby', !!g && g.it === cat && g.run === rat, String(n));
  check('tag: both run (chase), and neither is free for anything else', cat.st === 'chase' && rat.st === 'chase' && cat.busy && rat.busy);
  check('tag: mounts don’t play', !herd.inGame(horse));
  let tags = 0, swapped = false, spark = false;
  const it0 = g?.it;
  run(w, 5000, () => {
    if (herd.game && herd.game.it !== it0) swapped = true;
    if (herd.particles.some(p => p.kind === 'spark' && p.t === 0)) { spark = true; tags++; }
    return !herd.game;
  });
  check('tag: a touch is a tag, with a hop and a sparkle', tags >= 1 && spark, String(tags));
  check('tag: then the tagged one is it', swapped);
  check('tag: three or four tags at most, then back to grazing', tags <= 4 && !herd.game && !cat.busy && !rat.busy && cat.st !== 'chase' && rat.st !== 'chase');
  run(w, 60000, () => !!herd.game);
  const playing = !!herd.game;
  herd.pet(rat.id);
  check('tag: a tap on a player ends the game', playing && !herd.game && rat.st === 'happy' && cat.st !== 'chase');
  run(w, 60000, () => !!herd.game);
  setHour(19.5);
  w.step();
  check('tag: dusk ends it, everyone heads home', !herd.game && cat.st !== 'chase' && rat.st !== 'chase');
}
{
  // the line home at dusk: the largest mount leads, the rest walk behind each other
  const rs = [
    R('pet:Cow-Base', 'four-legged', 'usual', [], { x: 0.1, y: 0.2 }),
    R('mount:Horse-Base', 'mfour-legged', 'usual', [], { x: 0.9, y: 0.8 }, 'left'),
    R('pet:Rat-Base', 'four-legged', 'usual', [], { x: 0.5, y: 0.9 }),
    R('pet:Fox-Base', 'four-legged', 'usual', [], { x: 0.2, y: 0.9 }),
  ];
  const { w, herd } = scene(rs, 19.2, 'line');
  const [cow, horse, rat, fox] = herd.creatures;
  const ahead = (c: typeof cow) => (herd as unknown as { ahead: (c: typeof cow) => typeof cow | null }).ahead(c);
  check('line: the largest mount leads, then the rest in turn', ahead(horse) === null && ahead(cow) === horse && ahead(rat) === cow && ahead(fox) === rat);
  let behind = 0;
  const was = new Map(herd.creatures.map(c => [c, c.st]));
  run(w, 4000, () => {
    for (const c of herd.creatures) {
      const set = was.get(c) === 'idle' && c.st !== 'idle';
      was.set(c, c.st);
      const a = c === horse ? null : ahead(c);
      if (!set || !a) continue;
      const half = c.half(w), x = Math.max(half, Math.min(w.w - half, a.tx - a.dir * (a.half(w) + half + 3 * ART)));
      if (Math.abs(c.tx - x) < 1 && Math.abs(c.ty - a.ty) < 1) behind++;
    }
    return false;
  });
  check('line: they set off to just behind the one ahead', behind >= 2, String(behind));
}
{
  // snow: at night all but the Polar Pro animals sleep in one huddle
  const rs = [
    R('pet:Cow-Base', 'four-legged', 'usual', [], { x: 0.1, y: 0.2 }),
    R('pet:Rat-Base', 'four-legged', 'close', [], { x: 0.9, y: 0.9 }),
    R('pet:Snake-Base', 'legless', 'usual', [], { x: 0.5, y: 0.1 }),
    R('pet:Bunny-Base', 'hop', 'usual', [], { x: 0.7, y: 0.4 }),
  ];
  const { w, herd, setHour, setSky } = scene(rs, 19.5, 'snow');
  setSky('snow');
  run(w, 3000);
  setHour(22);
  run(w, 3000);
  const cs = herd.creatures;
  const touching = (a: typeof cs[0]) => cs.some(b => b !== a && Math.abs(a.fx - b.fx) <= a.half(w) + b.half(w) + 8 * ART && Math.abs(a.fy - b.fy) <= 10 * ART);
  check('snow: they sleep huddled together', cs.every(c => c.isAsleep) && cs.filter(touching).length >= 3, cs.map(c => `${Math.round(c.fx)},${Math.round(c.fy)}`).join(' '));
  check('snow: Habitica’s Polar Pro animals are at home in it', coldOf('Wolf') && coldOf('Penguin') && coldOf('Bear') && !coldOf('Cat'));
  const rs2 = withSocial([{ id: 'pet:Wolf-Base', sprite: 'x', kind: 'pet', species: 'Wolf' }, { id: 'pet:Cat-Base', sprite: 'x', kind: 'pet', species: 'Cat' }]);
  check('snow: the herd is told who’s cold-proof', rs2[0].cold === true && rs2[1].cold === undefined);
}
{
  // fireflies: idle creatures turn to the meadow's middle every 3 s; mischief makers jump for one
  const { w, herd, setSky } = scene([
    R('pet:Cat-Base', 'four-legged', 'mischief', [], { x: 0.1, y: 0.5 }),
    R('pet:Rat-Base', 'four-legged', 'close', [], { x: 0.9, y: 0.5 }),
  ], 12, 'fireflies');
  setSky('fireflies');
  const [cat, rat] = herd.creatures;
  let looked = 0, jumps = 0, beats = 0;
  run(w, 3000, () => {
    if (w.tick % 90 !== 0) return false;
    beats++;
    for (const c of [cat, rat]) if (c.st === 'idle' && !c.busy && c.dir === (w.w / 2 > c.fx ? 1 : -1)) looked++;
    if (cat.st === 'happy' && cat.t === 1) jumps++;
    return false;
  });
  check('fireflies: idle creatures turn to watch the middle', looked >= beats / 2, `${looked}/${beats}`);
  check('fireflies: the mischief maker jumps for one now and then', jumps >= 2, String(jumps));
}
{
  // night watch: a night creature sits by the sleepers
  const { w, herd } = scene([
    R('pet:Owl-Base', 'flying', 'aloof', [], { x: 0.9, y: 0.9 }, 'right_n'),
    R('pet:Rat-Base', 'four-legged', 'close', [], { x: 0.1, y: 0.2 }),
    R('pet:Cow-Base', 'four-legged', 'usual', [], { x: 0.5, y: 0.5 }),
  ], 22.5, 'watch');
  const [owl] = herd.creatures;
  let by = 0, facing = 0;
  run(w, 8000, () => {
    if (owl.st !== 'idle' || owl.isAsleep) return false;
    const s = herd.creatures.find(c => c !== owl && c.isAsleep && Math.abs(c.fx - owl.fx) <= c.half(w) + owl.half(w) + 10 * ART && Math.abs(c.fy - owl.fy) <= 8 * ART);
    if (s) { by++; if ((s.fx > owl.fx) === (owl.dir > 0)) facing++; }
    return false;
  });
  check('watch: the owl stays up and sits beside a sleeper', !owl.isAsleep && by > 500, String(by));
  check('watch: facing it', facing > by * 0.8, `${facing}/${by}`);
}
{
  // your pet walks beside the mount you ride
  const { w, herd } = scene([
    R('mount:Dragon-Base', 'mfour-legged', 'usual', [], { x: 0.5, y: 0.5 }, 'left'),
    R('pet:Cat-Base', 'four-legged', 'usual', [], { x: 0.1, y: 0.9 }),
    R('pet:Rat-Base', 'four-legged', 'usual', [], { x: 0.9, y: 0.1 }),
  ], 12, 'yours');
  const [m, cat, rat] = herd.creatures;
  herd.mine(cat.id);
  herd.ride(m.id, [{ image: {} as CanvasImageSource, x: 0, y: -20, w: 30, h: 30 }]);
  check('yours: climbing on calls your pet over', cat.follow?.of === m && !rat.follow);
  let follows = 0, walks = 0, wasMoving = false, near = 0;
  run(w, 20000, () => {
    const moving = m.st === 'move' || m.st === 'turn';
    if (moving && !wasMoving) { walks++; if (cat.follow?.of === m) follows++; }
    wasMoving = moving;
    if (Math.abs(cat.fx - m.fx) < cat.half(w) + m.half(w) + 20 * ART) near++;
    return false;
  });
  check('yours: it comes along every walk the mount takes', walks > 5 && follows >= walks * 0.8, `${follows}/${walks}`);
  check('yours: mostly at the mount’s side', near > 20000 * 0.5, String(near));
}

/* ---------------------------------------------------------------- part three: signature pairs */
{
  const sig = (ids: string[]) => signaturesOf(ids);
  const a = sig(['pet:Cat-Base', 'pet:Yarn-Base', 'mount:Dragon-Red', 'pet:Egg-Base', 'pet:Squirrel-Base', 'pet:Treeling-Base']);
  check('pairs: the cat pounces on the yarn, the dragon guards the egg, the squirrel circles the treeling',
    a.get('pet:Cat-Base')?.pounce === 'pet:Yarn-Base' && a.get('mount:Dragon-Red')?.guard === 'pet:Egg-Base' && a.get('pet:Squirrel-Base')?.orbit === 'pet:Treeling-Base');
  check('pairs: the dragon is "mighty", so it faces a boss', a.get('mount:Dragon-Red')?.bold === true && !a.get('pet:Cat-Base')?.bold);
  const p = sig(['pet:Penguin-Base', 'pet:Penguin-Red', 'pet:Penguin-Shade', 'pet:TRex-Base', 'pet:Velociraptor-Base']);
  check('pairs: penguins single file, each behind the one before; the dinosaurs too', !p.get('pet:Penguin-Base')?.lead && p.get('pet:Penguin-Red')?.lead === 'pet:Penguin-Base' && p.get('pet:Penguin-Shade')?.lead === 'pet:Penguin-Red' && p.get('pet:Velociraptor-Base')?.lead === 'pet:TRex-Base');
  const one = sig(['pet:Wolf-Base', 'pet:Sheep-Base']), two = sig(['pet:Wolf-Base', 'pet:Sheep-Base', 'pet:Sheep-Red']);
  check('pairs: a sheepdog needs a flock of two', !one.get('pet:Wolf-Base')?.flock && two.get('pet:Wolf-Base')?.flock?.length === 2 && two.get('pet:Sheep-Red')?.fold?.[0] === 'pet:Sheep-Base');
  const sea = sig(['pet:Octopus-Base', 'pet:Seahorse-Base', 'pet:MagicalBee-Base']);
  check('pairs: sea creatures meet at the pond; a lone bee has no one to meet', sea.get('pet:Octopus-Base')?.meet === 'pond' && !sea.get('pet:MagicalBee-Base')?.meet);
  const v = socialOf(['pet:Wolf-Veteran', 'pet:Cow-Base', 'pet:Rat-Red']);
  check('pairs: a Veteran is an elder everyone is drawn to', sig(['pet:Wolf-Veteran']).get('pet:Wolf-Veteran')?.elder === true && v.get('pet:Cow-Base')!.bonds.some(b => b.id === 'pet:Wolf-Veteran'));
  const h = socialOf(['pet:Hedgehog-Base', 'pet:Cactus-Base', 'pet:Rock-Base', 'pet:Cow-Base', 'pet:Robot-Base']);
  check('pairs: Hedgehog, Cactus and Rock are always friends together', kindOf(h, 'pet:Hedgehog-Base', 'pet:Cactus-Base') === 'friend' && kindOf(h, 'pet:Rock-Base', 'pet:Cactus-Base') === 'friend' && kindOf(h, 'pet:Cow-Base', 'pet:Robot-Base') === 'friend');
  check('pairs: the Cats family greet each other as kin', kindOf(socialOf(['pet:Cat-Base', 'pet:LionCub-Red']), 'pet:Cat-Base', 'pet:LionCub-Red') === 'kin');
  const rs = withSocial([{ id: 'pet:Cat-Base', sprite: 'x', kind: 'pet', species: 'Cat' }, { id: 'pet:Yarn-Base', sprite: 'x', kind: 'pet', species: 'Yarn' }]);
  check('pairs: the herd is told', rs[0].pounce === 'pet:Yarn-Base' && kindOf(socialOf(['pet:Cat-Base', 'pet:Yarn-Base']), 'pet:Cat-Base', 'pet:Yarn-Base') === 'friend');
}
{
  // a cat and yarn: the cat pounces, the yarn rolls off, the cat goes again; the yarn is never it
  const { w, herd } = scene([
    { ...R('pet:Cat-Base', 'four-legged', 'mischief', [{ id: 'pet:Yarn-Base', kind: 'friend' }], { x: 0.3, y: 0.5 }), pounce: 'pet:Yarn-Base' },
    R('pet:Yarn-Base', 'legless', 'usual', [{ id: 'pet:Cat-Base', kind: 'friend' }], { x: 0.5, y: 0.5 }, 'front'),
  ], 12, 'pounce');
  const [cat, yarn] = herd.creatures;
  run(w, 40000, () => !!herd.game);
  check('pounce: the cat goes for the yarn', !!herd.game?.pounce && herd.game.it === cat);
  let landed = 0, yarnIt = false;
  run(w, 3000, () => { if (herd.game?.it === yarn) yarnIt = true; if (cat.st === 'happy' && cat.t === 1 && herd.game) landed++; return !herd.game; });
  check('pounce: it lands on it with a hop, two or three times', landed >= 1 && landed <= 3 && !herd.game, String(landed));
  check('pounce: the yarn never chases the cat', !yarnIt);
}
{
  // a dragon keeps near its egg by day, faces outward, and sleeps beside it
  const { w, herd, setHour } = scene([
    { ...R('mount:Dragon-Red', 'mfour-legged', 'usual', [], { x: 0.9, y: 0.9 }, 'left'), guard: 'pet:Egg-Base' },
    R('pet:Egg-Base', 'hop', 'usual', [], { x: 0.2, y: 0.3 }, 'front'),
  ], 12, 'guard');
  const [d, egg] = herd.creatures;
  let near = 0, out = 0, idle = 0, away = 0;
  run(w, 12000, () => {
    if (Math.abs(d.fx - egg.fx) <= d.half(w) + egg.half(w) + 45 * ART) near++;
    if (Math.abs(d.fx - egg.fx) > d.half(w) + egg.half(w) + 30 * ART) away++;
    if (d.st === 'idle' && Math.abs(d.fx - egg.fx) > ART) { idle++; if ((d.fx > egg.fx) === (d.dir > 0)) out++; }
    return false;
  });
  check('guard: the dragon stays near its egg most of the time', near > 12000 * 0.6, String(near));
  check('guard: but not all of it (Vlad, 15 Oct: closeness only some of the time)', away > 12000 * 0.05, String(away));
  check('guard: facing outward', out > idle * 0.7, `${out}/${idle}`);
  setHour(19.5); run(w, 3000); setHour(22); run(w, 2000);
  check('guard: and sleeps right beside it', d.isAsleep && Math.abs(d.fx - egg.fx) <= d.half(w) + egg.half(w) + 8 * ART && Math.abs(d.fy - egg.fy) <= 8 * ART, `${d.fx},${d.fy} ${egg.fx},${egg.fy}`);
}
{
  // a squirrel hops circles around its treeling, then sits beside it
  const { w, herd } = scene([
    { ...R('pet:Squirrel-Base', 'hop', 'usual', [{ id: 'pet:Treeling-Base', kind: 'friend' }], { x: 0.3, y: 0.5 }), orbit: 'pet:Treeling-Base' },
    R('pet:Treeling-Base', 'hop', 'aloof', [{ id: 'pet:Squirrel-Base', kind: 'friend' }], { x: 0.5, y: 0.5 }, 'front'),
  ], 12, 'orbit');
  const [sq, tr] = herd.creatures;
  const sides = new Set<string>();
  run(w, 12000, () => { if (Math.hypot(sq.fx - tr.fx, sq.fy - tr.fy) < 60 * ART) sides.add(`${sq.fx > tr.fx ? 'r' : 'l'}${sq.fy > tr.fy ? 'b' : 'f'}`); return false; });
  check('orbit: the squirrel goes all the way round the treeling', sides.size >= 3, [...sides].join(','));
  check('orbit: its laps', sq.lap >= 5, String(sq.lap));
}
{
  // penguins single file: each sets off behind the one before
  const { w, herd } = scene([
    R('pet:Penguin-Base', 'hop', 'usual', [], { x: 0.5, y: 0.5 }),
    { ...R('pet:Penguin-Red', 'hop', 'usual', [], { x: 0.3, y: 0.5 }), lead: 'pet:Penguin-Base' },
    { ...R('pet:Penguin-Shade', 'hop', 'usual', [], { x: 0.1, y: 0.5 }), lead: 'pet:Penguin-Red' },
  ], 12, 'train');
  const [p0, p1, p2] = herd.creatures;
  let f1 = 0, f2 = 0;
  run(w, 20000, () => { if (p1.follow?.of === p0) f1++; if (p2.follow?.of === p1) f2++; return false; });
  check('train: the second follows the first, the third the second', f1 > 0 && f2 > 0, `${f1} ${f2}`);
}
{
  // a sheepdog circles its flock; a sheep that strays walks back to the others
  const { w, herd } = scene([
    { ...R('pet:Dog-Base', 'four-legged', 'close', [], { x: 0.5, y: 0.5 }), flock: ['pet:Sheep-Base', 'pet:Sheep-Red'] },
    { ...R('pet:Sheep-Base', 'four-legged', 'usual', [], { x: 0.05, y: 0.1 }), fold: ['pet:Sheep-Red'] },
    { ...R('pet:Sheep-Red', 'four-legged', 'usual', [], { x: 0.95, y: 0.9 }), fold: ['pet:Sheep-Base'] },
  ], 12, 'sheep');
  const [dog, a, b] = herd.creatures;
  const apart0 = Math.hypot(a.fx - b.fx, a.fy - b.fy);
  let together = 0, dogNear = 0;
  run(w, 12000, () => {
    if (Math.hypot(a.fx - b.fx, a.fy - b.fy) < 60 * ART) together++;
    if (Math.hypot(dog.fx - (a.fx + b.fx) / 2, dog.fy - (a.fy + b.fy) / 2) < 70 * ART) dogNear++;
    return false;
  });
  check('sheep: strays walk back to each other', apart0 > 150 * ART && together > 12000 * 0.5, `${Math.round(apart0 / ART)} ${together}`);
  check('sheep: the dog keeps close to its flock', dogNear > 12000 * 0.5, String(dogNear));
}
{
  // sea creatures meet at the pond
  const pond = { x: 150, y: 590 };
  const { w, herd } = scene([
    { ...R('pet:Octopus-Base', 'legless', 'usual', [], { x: 0.9, y: 0.1 }), meet: 'pond' },
    { ...R('pet:Seahorse-Base', 'hop', 'usual', [], { x: 0.8, y: 0.2 }), meet: 'pond' },
  ], 12, 'pond', { spots: () => [{ kind: 'water', ...pond, w: 99, h: 27, pond: true }] });
  let by = 0;
  run(w, 12000, () => { by += herd.creatures.filter(c => Math.abs(c.fx - pond.x) < 40 * ART && Math.abs(c.fy - pond.y) < 15 * ART).length; return false; });
  check('pond: sea creatures spend time by the pond', by > 12000 * 0.4, String(by));
}
{
  // elders: a Veteran draws the others three times as strongly
  const { w, herd } = scene([
    R('pet:Rat-Red', 'four-legged', 'close', [{ id: 'pet:Cow-Red', kind: 'cousin' }, { id: 'pet:Wolf-Veteran', kind: 'cousin' }], { x: 0.5, y: 0.5 }),
    R('pet:Cow-Red', 'four-legged', 'aloof', [{ id: 'pet:Rat-Red', kind: 'cousin' }], { x: 0.1, y: 0.5 }),
    { ...R('pet:Wolf-Veteran', 'four-legged', 'aloof', [{ id: 'pet:Rat-Red', kind: 'cousin' }], { x: 0.9, y: 0.5 }), elder: true },
  ], 12, 'elder');
  const [rat, cow, vet] = herd.creatures;
  let toVet = 0, toCow = 0;
  run(w, 60000, () => {
    if (rat.mate === vet && rat.t === 0) toVet++;
    if (rat.mate === cow && rat.t === 0) toCow++;
    return false;
  });
  check('elders: the others walk over to the Veteran first', toVet > toCow * 1.8, `${toVet} vs ${toCow}`);
}

/* ---------------------------------------------------------------- part three: the app's touch extras */
{
  // my turn: pet one, and its close friends nearby come over and wait beside it
  const { w, herd } = scene([
    R('pet:Rat-Red', 'four-legged', 'close', [{ id: 'pet:Cow-Red', kind: 'friend' }], { x: 0.3, y: 0.5 }),
    R('pet:Cow-Red', 'four-legged', 'close', [{ id: 'pet:Rat-Red', kind: 'friend' }], { x: 0.5, y: 0.5 }),
  ], 12, 'myturn', { extras: true });
  const [rat, cow] = herd.creatures;
  run(w, 2000, () => rat.st === 'idle' && cow.st === 'idle' && !rat.busy && !cow.busy && Math.abs(rat.fx - cow.fx) < 70 * ART);
  herd.pet(cow.id);
  check('my turn: pet one and its friend walks over', (rat.st === 'move' || rat.st === 'turn') && rat.mate === cow);
  const gap = Math.abs(rat.tx - cow.fx) - rat.half(w) - cow.half(w);
  run(w, 600, () => rat.st === 'idle');
  check('my turn: and waits right beside it', gap === 2 * ART && rat.st === 'idle' && rat.fx === rat.tx && rat.wait > 30, `${gap / ART}`);
}
{
  // a crit's spin: friends nearby hop along, one after another
  const { w, herd } = scene([
    R('pet:Rat-Red', 'four-legged', 'close', [{ id: 'pet:Cow-Red', kind: 'friend' }, { id: 'pet:Fox-Red', kind: 'alike' }], { x: 0.4, y: 0.5 }),
    R('pet:Cow-Red', 'four-legged', 'close', [{ id: 'pet:Rat-Red', kind: 'friend' }], { x: 0.5, y: 0.5 }),
    R('pet:Fox-Red', 'four-legged', 'aloof', [{ id: 'pet:Rat-Red', kind: 'alike' }], { x: 0.3, y: 0.5 }),
  ], 12, 'spin', { extras: true });
  const [rat, cow, fox] = herd.creatures;
  run(w, 3000, () => herd.creatures.every(c => c.st === 'idle' && !c.busy) && Math.abs(cow.fx - rat.fx) < 50 * ART && Math.abs(fox.fx - rat.fx) < 50 * ART);
  herd.celebrate(rat.id);
  const hops: number[] = [];
  for (let t = 1; t <= 12; t++) { w.step(); for (const c of [cow, fox]) if (c.st === 'happy' && c.t === 1) hops.push(t); }
  check('crit: friends nearby join the spin, a hop each, 3 ticks apart', rat.st === 'spin' && hops.length === 2 && hops[1] - hops[0] === 3, hops.join(','));
}
{
  // pass the ball: a pet knocks it toward a friend, who chases it next
  const w = new World(source(), { seed: 'ball' });
  const herd = new Herd(w, { seed: 's', clock: () => new Date(2026, 9, 14, 12), still: () => false, extras: true, home: () => null });
  w.resize(720, 640);
  herd.set([
    R('pet:Rat-Red', 'four-legged', 'close', [{ id: 'pet:Cow-Red', kind: 'friend' }], { x: 0.45, y: 0.5 }),
    R('pet:Cow-Red', 'four-legged', 'close', [{ id: 'pet:Rat-Red', kind: 'friend' }], { x: 0.75, y: 0.5 }),
  ]);
  const [rat, cow] = herd.creatures;
  const b = herd.ball!;
  b.place(rat.fx + 20 * ART, rat.fy);
  b.flick(-0.5 * ART, 0);
  const chasers: string[] = [];
  let last: string | null = null;
  run(w, 1500, () => { const c = herd.creatures.find(x => x.st === 'chase'); const id = c?.id ?? null; if (id && id !== last) chasers.push(id); last = id; return false; });
  check('ball: friends pass it back and forth', chasers.length >= 2 && chasers[0] !== chasers[1] && chasers.includes(cow.id) && chasers.includes(rat.id), chasers.join(' > '));
}
{
  // the boss in the sky: the bold walk toward it and face it, close ones tuck in behind
  let bossX: number | null = 600;
  const { w, herd } = scene([
    { ...R('mount:Dragon-Red', 'mfour-legged', 'usual', [], { x: 0.2, y: 0.5 }, 'left'), bold: true },
    R('pet:Rat-Red', 'four-legged', 'close', [], { x: 0.1, y: 0.8 }),
  ], 12, 'boss', { boss: () => bossX });
  const [d] = herd.creatures;
  let facing = 0, idle = 0;
  run(w, 6000, () => { if (d.st === 'idle' && !d.fid) { idle++; if ((bossX! > d.fx) === (d.dir > 0)) facing++; } return false; });
  check('boss: the bold face the boss', facing > idle * 0.9, `${facing}/${idle}`);
  check('boss: and walk toward its side', d.fx > 300, String(Math.round(d.fx)));
  bossX = null;
}

/* ---------------------------------------------------------------- the hearts */
{
  const rects: number[][] = [];
  const g = { fillStyle: '', fillRect: (x: number, y: number, w: number, h: number) => rects.push([x, y, w, h]) } as unknown as CanvasRenderingContext2D;
  drawParticle(g, { kind: 'heart', x: 30, y: 30, t: 0, life: 36 });
  const xs = rects.map(r => r[0]), ys = rects.map(r => r[1]);
  const wide = (Math.max(...xs) - Math.min(...xs)) / ART + 1, tall = (Math.max(...ys) - Math.min(...ys)) / ART + 1;
  check('hearts: your petting’s heart is bigger, 7 art pixels by 6', wide === 7 && tall === 6, `${wide}x${tall}`);
  check('hearts: still centred where the old one was', (Math.max(...xs) + ART + Math.min(...xs)) / 2 === 30 + 2.5 * ART);
  rects.length = 0;
  drawParticle(g, { kind: 'tiny', x: 30, y: 30, t: 0, life: 30 });
  const tw = (Math.max(...rects.map(r => r[0])) - Math.min(...rects.map(r => r[0]))) / ART + 1;
  check('hearts: a friend’s heart is small, 3 art pixels', tw === 3);
}

/* ---------------------------------------------------------------- part four: lively, never clumped (Vlad, 15 Oct) */
const herdOf = (n: number, seed: string, more: Partial<HerdOptions> = {}) => {
  const tempers: Resident['temper'][] = ['close', 'usual', 'aloof', 'mischief'];
  const rs = Array.from({ length: n }, (_, i) => R(`pet:Cow-P${i}`, i % 3 ? 'four-legged' : 'hop', tempers[i % 4], [{ id: `pet:Cow-P${i ^ 1}`, kind: 'friend' as const }]));
  return scene(rs, 12, seed, more);
};
{
  // eight creatures with their best friends: spread over the meadow, not in a corner, not in clumps
  let n = 0, corner = 0, clump = 0, friend = 0;
  for (const seed of ['l1', 'l2', 'l3']) {
    const { w, herd } = herdOf(8, seed);
    run(w, 12000, () => {
      if (w.tick % 10) return false;
      for (const c of herd.creatures) {
        n++;
        if (c.fx < w.w * 0.15 || c.fx > w.w * 0.85) corner++;
        if (herd.creatures.filter(o => o !== c && Math.hypot(o.fx - c.fx, o.fy - c.fy) < 40 * ART).length >= 3) clump++;
        const f = herd.byId(c.bonds[0].id)!;
        if (Math.abs(f.fx - c.fx) <= f.half(w) + c.half(w) + 12 * ART && Math.abs(f.fy - c.fy) <= 10 * ART) friend++;
      }
      return false;
    });
  }
  check('lively: the herd spreads out, seldom by the sides (they are 30% of the meadow)', corner < n * 0.25, `${Math.round(corner / n * 100)}%`);
  check('lively: seldom three or more round one', clump < n * 0.15, `${Math.round(clump / n * 100)}%`);
  check('lively: best friends together some of the time, not all of it', friend > n * 0.05 && friend < n * 0.5, `${Math.round(friend / n * 100)}%`);
}
{
  // company ebbs: right after time together it goes off on its own for a while
  const { w, herd } = herdOf(2, 'ebb');
  const [a] = herd.creatures;
  let walks = 0, toFriend = 0, afterFriend = 0, again = 0, wasFriend = false;
  run(w, 30000, () => {
    if (a.st !== 'turn' && a.st !== 'move') return false;
    if (a.t !== 0 && !(a.st === 'move' && a.t === 0)) return false;
    return false;
  });
  // count walks by watching each wander's choice through its mate
  const wander = herd.wander.bind(herd);
  herd.wander = (c) => {
    wander(c);
    if (c !== a || (c.st !== 'move' && c.st !== 'turn')) return;
    walks++;
    const f = !!c.mate;
    if (f) toFriend++;
    if (wasFriend) { afterFriend++; if (f) again++; }
    wasFriend = f;
  };
  run(w, 30000);
  check('ebb: it walks to its friend now and then', toFriend > walks * 0.1, `${toFriend}/${walks}`);
  check('ebb: seldom twice running', again < afterFriend * 0.35, `${again}/${afterFriend}`);
  check('ebb: company fills up and drains', a.fill >= 0 && a.fill <= 1);
}
{
  // a crowd round the avatar: the next one doesn't join it
  const { w, herd } = herdOf(6, 'crowd', { home: () => ({ x: 360, y: 560 }) });
  herd.stand([{ image: {} as CanvasImageSource, x: -9, y: -30, w: 18, h: 30 }]);
  const av = herd.avatar!;
  const [a, b, c] = herd.creatures;
  a.setPos(av.x - 25 * ART, av.y); a.tx = a.fx; a.ty = a.fy;
  b.setPos(av.x + 25 * ART, av.y); b.tx = b.fx; b.ty = b.fy;
  check('crowd: two by the avatar make a crowd there', herd.crowded(c, av.x, av.y) && !herd.crowded(c, 40, herd.band.top));
  let toAv = 0;
  for (let i = 0; i < 200; i++) { c.setPos(40, herd.band.bottom); c.idle(999); c.fill = 0; herd.wander(c); if (c.greet) toAv++; }
  check('crowd: nobody else walks over to greet it then', toAv === 0, String(toAv));
}
{
  // standing about: they look round, sniff the ground, scratch, stretch and hop, as their temper likes; never asleep
  const kinds = new Set<number>();
  let asleepFidget = 0, looks = 0, back = 0;
  for (const seed of ['f1', 'f2']) {
    const { w, herd, setHour } = herdOf(6, seed);
    run(w, 6000, () => {
      for (const c of herd.creatures) {
        if (c.fid) { kinds.add(c.fid.k); if (c.fid.k === 0 && c.fid.t === 1) { looks++; if (c.dir === -c.fid.back) back++; } }
        if (c.st === 'happy') kinds.add(4);
      }
      return false;
    });
    setHour(23);
    run(w, 3000, () => { asleepFidget += herd.creatures.filter(c => c.isAsleep && (c.fid || c.dx)).length; return false; });
  }
  check('fidget: looking round, sniffing, scratching, stretching and hopping all happen', kinds.size === 5, [...kinds].join(','));
  check('fidget: looking round faces the other way', looks > 0 && back === looks, `${back}/${looks}`);
  check('fidget: never asleep', asleepFidget === 0, String(asleepFidget));
}
{
  // hello: arriving next to another standing about, now and then the two turn to each other and sniff
  const { w, herd } = herdOf(2, 'hello');
  const [a, b] = herd.creatures;
  let hellos = 0;
  for (let i = 0; i < 60; i++) {
    b.setPos(300, 560); b.tx = b.fx; b.ty = b.fy; b.idle(999); b.dir = 1;
    a.setPos(300 + b.half(w) + a.half(w) + 30 * ART, 560); a.idle(999); a.fill = 1;
    a.goTo(300 + b.half(w) + a.half(w) + 4 * ART, 560);
    run(w, 200, () => a.st === 'idle');
    if (a.fid?.k === 1 && b.fid?.k === 1 && a.dir === -1 && b.dir === 1) hellos++;
  }
  check('hello: as often as it seeks company (a close one: 6 in 10)', hellos > 20 && hellos < 50, String(hellos));
}

if (failures) { console.log(`FAIL  together: ${failures} of ${passes + failures} checks failed`); process.exit(1); }
console.log(`PASS  together: all ${passes} checks (bonds, greetings, following, bedtime, tag, the line home, snow, fireflies, night watch, your pet, signature pairs, touch extras, hearts, lively)`);
