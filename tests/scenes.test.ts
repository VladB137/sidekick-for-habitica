/*
 * The Stable's scenes without a browser: each of the seven paints deterministically on whole art pixels with
 * real colours, they look different from each other, every growth stage (forest, flowers, water, the stable,
 * plaques) changes the picture exactly at its threshold and stops at its cap, the walking band stays inside
 * the bars, the scenery's critters and shooting stars stay where they belong, and the clock gives the right hour
 * and season (the ball's physics are tests/creatures.test.ts'). The canvas side is checked in
 * a real browser by tests/scenes-e2e.cjs.
 */
import { paintScene, NO_GROWTH, type Growth, type SceneOptions, type Frame } from '../src/playground/scenes/paint';
import { SCENE_IDS, SCENES, toner, type SceneId } from '../src/playground/scenes/palettes';
import { PROPS } from '../src/playground/scenes/props';
import { FEASTS, usesYard, yardOf } from '../src/playground/scenes/feasts';
import { timeOfDay, seasonOf, southernRegion, moonAge, moonPhase, showerOf, rainAt, rainbowAt, type MoonPhase, type Season, type TimeOfDay } from '../src/playground/scenes/clock';
import { drawLife, lifeOf, showerNight, BUTTERFLY, FISH, FROG, BIRD, CRAB, type Life } from '../src/playground/scenes/ambient';
import { WeatherLayer } from '../src/playground/scenes/weather';
import { partsPen } from '../src/playground/scenes/layer';

let failures = 0, passes = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) passes++; else { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); }
};

/** a fake 2D context that paints into an array, and notices anything off the art grid or not a colour */
class Raster {
  fillStyle: unknown = '#000000';
  readonly px: Uint32Array;
  bad: string[] = [];
  constructor (readonly W: number, readonly H: number) { this.px = new Uint32Array(W * H); }
  fillRect (x: number, y: number, w: number, h: number) {
    if (![x, y, w, h].every(Number.isInteger)) { this.bad.push(`fractional rect ${x},${y},${w},${h}`); return; }
    const s = String(this.fillStyle);
    if (!/^#[0-9a-f]{6}$/i.test(s)) { this.bad.push(`colour ${s}`); return; }
    const v = parseInt(s.slice(1), 16) | 0xff000000;
    for (let j = Math.max(0, y); j < Math.min(this.H, y + h); j++) for (let i = Math.max(0, x); i < Math.min(this.W, x + w); i++) this.px[j * this.W + i] = v;
  }
  hash () { let h = 0x811c9dc5; for (const v of this.px) { h ^= v; h = Math.imul(h, 0x01000193); } return h >>> 0; }
  blank () { return this.px.some(v => v === 0); }
}

const FRAME: Frame = { W: 160, H: 300, top: 0, bottom: 0 };
const opts = (scene: SceneId, o: Partial<SceneOptions> = {}): SceneOptions => ({ scene, growth: NO_GROWTH, tod: 'day', season: 'summer', dailiesDone: true, ...o });
const paint = (o: SceneOptions, f = FRAME) => { const r = new Raster(f.W, f.H); const layout = paintScene(r, f, o); return { r, layout }; };
const hashOf = (o: SceneOptions, f = FRAME) => paint(o, f).r.hash();

/* ---- every scene, hour and season */
{
  const tods: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'], seasons: Season[] = ['spring', 'summer', 'autumn', 'winter'];
  const grown: Growth = { checkIns: 420, perfectDays: 64, streakDays: 21, level: 50, quests: 9 };
  for (const scene of SCENE_IDS) for (const tod of tods) for (const season of seasons) for (const growth of [NO_GROWTH, grown]) {
    const o = opts(scene, { tod, season, growth });
    const { r } = paint(o);
    check(`scene ${scene} ${tod} ${season}: whole art pixels, real colours`, r.bad.length === 0, r.bad.slice(0, 3).join('; '));
    check(`scene ${scene} ${tod} ${season}: every pixel painted`, !r.blank());
    check(`scene ${scene} ${tod} ${season}: the same picture every time`, r.hash() === hashOf(o));
  }
  check('seven scenes', SCENE_IDS.length === 7 && SCENE_IDS.map(s => SCENES[s].name).join(',') === 'Meadow,Lakeside,Pine hill,Sandy cove,Bamboo grove,Misty marsh,Mushroom glade');
  const hashes = new Set(SCENE_IDS.map(s => hashOf(opts(s))));
  check('every scene looks different', hashes.size === 7);
  const styles = new Set(SCENE_IDS.map(s => SCENES[s].house)), trees = new Set(SCENE_IDS.map(s => SCENES[s].tree));
  check('every scene has its own stable building and its own forest', styles.size === 7 && trees.size === 7);
  check('every scene has hand-authored props', SCENE_IDS.every(s => PROPS[s].length >= 2));
  // colour variety: how much of each scene's palette differs from every other's ground
  const grounds = new Set(SCENE_IDS.map(s => SCENES[s].ground[0]));
  check('every scene has its own ground colour', grounds.size === 7);
  for (const tod of ['dawn', 'dusk', 'night'] as const) check(`the light of ${tod} changes the picture`, hashOf(opts('meadow', { tod })) !== hashOf(opts('meadow')));
  check('open Dailies give a softer light than all done', hashOf(opts('meadow', { dailiesDone: false })) !== hashOf(opts('meadow')));
  check('all Dailies done in the day: the palette as it is', toner({ tod: 'day', season: 'summer', dailiesDone: true })('#5FAE4E') === '#5FAE4E');
  check('winter changes the picture (snow)', hashOf(opts('meadow', { season: 'winter' })) !== hashOf(opts('meadow')));
  check('autumn turns the oaks', hashOf(opts('meadow', { season: 'autumn', growth: { ...NO_GROWTH, checkIns: 200 } })) !== hashOf(opts('meadow', { growth: { ...NO_GROWTH, checkIns: 200 } })));
}

/* ---- growth: each stage changes the picture at its threshold and nothing changes past the cap */
{
  const g = (o: Partial<Growth>): Growth => ({ ...NO_GROWTH, level: 30, ...o });
  for (const scene of SCENE_IDS) {
    const h = (o: Partial<Growth>, season: Season = 'summer') => hashOf(opts(scene, { growth: g(o), season }));
    const steps = (label: string, key: keyof Growth, pairs: [number, number][], same: [number, number][], season: Season = 'summer') => {
      for (const [a, b] of pairs) check(`${scene}: ${label} ${a} -> ${b} grows something`, h({ [key]: a }, season) !== h({ [key]: b }, season));
      for (const [a, b] of same) check(`${scene}: ${label} ${a} and ${b} look the same`, h({ [key]: a }, season) === h({ [key]: b }, season));
    };
    // a tree every 5 check-ins up to 9; each grows for 30 days, a little every day; a giant tree at 100
    steps('check-ins', 'checkIns', [[2, 3], [4, 5], [29, 30], [39, 40], [69, 70], [99, 100]], [[0, 1], [70, 99], [100, 2000]]);
    // a flower patch per Perfect Day, up to 30 patches
    steps('Perfect Days', 'perfectDays', [[0, 1], [1, 2], [29, 30]], [[30, 500]]);
    // the longest Daily streak: 3 stepping stones, 7 a pond, 14 a bridge, 21 a waterfall
    steps('Daily streak days', 'streakDays', [[2, 3], [6, 7], [13, 14], [20, 21]], [[0, 2], [3, 6], [21, 400]]);
    // 1 fence, 5 shelter, 10 the building, 15 banner, 20 the hall (the last stage)
    steps('level', 'level', [[4, 5], [9, 10], [14, 15], [19, 20]], [[1, 4], [5, 9], [20, 100], [20, 9999]]);
    // plaques on the stable wall, up to 6 shown
    steps('quests', 'quests', [[0, 1], [5, 6]], [[6, 40]]);
  }
}

/* ---- the pond: 49 x 13 art px on a phone, so a pet fits in it with water round it (Vlad, 15 Oct), the same share
 * of the width in the small thumbnails, clear of the left edge and of the stepping stones */
{
  const changed = (a: Raster, b: Raster) => {
    let x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
    for (let y = 0; y < a.H; y++) for (let x = 0; x < a.W; x++) if (a.px[y * a.W + x] !== b.px[y * a.W + x]) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    return { x: x0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  };
  const at = (scene: SceneId, streakDays: number, f: Frame) => paint(opts(scene, { growth: { ...NO_GROWTH, streakDays } }), f).r;
  for (const [f, w, h] of [[FRAME, 49, 13], [{ W: 400, H: 300, top: 0, bottom: 0 }, 49, 13], [{ W: 96, H: 120, top: 0, bottom: 0 }, 29, 9]] as const) {
    for (const scene of SCENE_IDS) {
      const pond = changed(at(scene, 6, f), at(scene, 7, f));
      check(`${scene} ${f.W} wide: the pond is ${w} x ${h} art px`, pond.w === w && pond.h === h, JSON.stringify(pond));
      check(`${scene} ${f.W} wide: the pond keeps clear of the left edge`, pond.x >= 4, JSON.stringify(pond));
      const stones = changed(at(scene, 2, f), at(scene, 3, f));
      check(`${scene} ${f.W} wide: the stepping stones lie right of the pond`, stones.x > pond.x + pond.w, JSON.stringify({ pond, stones }));
    }
  }
}

/* ---- layout: horizon, walking band and door inside the bars */
{
  for (const scene of SCENE_IDS) {
    const plain = paint(opts(scene)).layout;
    const f: Frame = { W: 160, H: 300, top: 19, bottom: 40 };
    const barred = paint(opts(scene), f).layout;
    check(`${scene}: the walking band is below the horizon and inside the bars`, barred.walk.top > barred.horizon && barred.walk.bottom <= f.H - f.bottom - 1 && barred.walk.top < barred.walk.bottom, JSON.stringify(barred));
    check(`${scene}: the horizon sits in the open part between the bars`, barred.horizon > f.top + 20 && barred.horizon < f.H - f.bottom - 20, JSON.stringify(barred));
    check(`${scene}: an app bar on top moves the horizon down`, paint(opts(scene), { ...f, bottom: 0 }).layout.horizon > plain.horizon);
    check(`${scene}: the stable door is on the ground, inside the view`, barred.door.y >= barred.horizon && barred.door.x > 0 && barred.door.x < f.W, JSON.stringify(barred.door));
  }
  // a landscape phone: short and wide
  const wide = paint(opts('lake'), { W: 300, H: 140, top: 19, bottom: 19 });
  check('landscape: paints and keeps a band to walk in', wide.r.bad.length === 0 && wide.layout.walk.bottom - wide.layout.walk.top >= 10, JSON.stringify(wide.layout));
}

/* ---- trees standing on the walking ground (the layer sorts them among the creatures) */
{
  const grown = { ...NO_GROWTH, checkIns: 420 };
  for (const scene of SCENE_IDS) {
    const all = paint(opts(scene, { growth: grown }));
    const ret = paint(opts(scene, { growth: grown, standing: 'return' }));
    check(`${scene}: painting everything lists no standing trees`, all.layout.standing.length === 0);
    // by the lake and the sea the trees along the horizon stand among the creatures too (a swimmer goes behind them)
    const shore = scene === 'lake' || scene === 'cove';
    const grove = ret.layout.standing.filter(t => t.y >= ret.layout.walk.top);
    check(`${scene}: a full forest has groves down both sides of the meadow`, grove.length === 4 && grove.every(t => t.y <= ret.layout.walk.bottom) && grove.some(t => t.x < 20) && grove.some(t => t.x > FRAME.W - 20), JSON.stringify(ret.layout.standing));
    check(`${scene}: ${shore ? 'every tree stands among the creatures' : 'only the groves stand among the creatures'}`, ret.layout.standing.length === (shore ? 10 : 4));
    check(`${scene}: standing trees are left out of the picture`, all.r.hash() !== ret.r.hash());
    const young = paint(opts(scene, { growth: { ...NO_GROWTH, checkIns: 9 }, standing: 'return' }));
    check(`${scene}: the first trees grow along the horizon`, young.layout.standing.every(t => t.y < young.layout.walk.top) && young.layout.standing.length === (shore ? 2 : 0));
  }
}

/* ---- the moon */
{
  // all eight shapes paint cleanly, each its own picture, in the night sky and the glade's always-starry one
  for (const scene of ['meadow', 'marsh', 'mushroom'] as const) {
    const tod: TimeOfDay = scene === 'mushroom' ? 'day' : 'night';
    const seen = new Set<number>();
    for (let m = 0; m < 8; m++) {
      const { r } = paint(opts(scene, { tod, moon: m as MoonPhase }));
      check(`moon ${m} over ${scene}: whole art pixels, real colours`, r.bad.length === 0, r.bad.slice(0, 3).join('; '));
      seen.add(r.hash());
    }
    check(`moon over ${scene}: eight different shapes`, seen.size === 8);
    check(`moon over ${scene}: south of the equator the lit side is mirrored`, hashOf(opts(scene, { tod, moon: 1, southern: true })) !== hashOf(opts(scene, { tod, moon: 1 })));
  }
  check('moon: not in the daytime sky', hashOf(opts('meadow', { moon: 0 })) === hashOf(opts('meadow', { moon: 4 })));
  check('moon: full south of the equator is the same full moon', hashOf(opts('meadow', { tod: 'night', moon: 4, southern: true })) === hashOf(opts('meadow', { tod: 'night', moon: 4 })));
  // against eclipses, which only happen at new moon (solar) and full moon (lunar): NASA's eclipse catalogue
  const near = (age: number, to: number) => Math.min(Math.abs(age - to), 1 - Math.abs(age - to)) < 1 / 29.53;
  const eclipses: [string, string, 0 | 4][] = [
    ['annular solar eclipse', '2026-02-17T12:12Z', 0], ['total lunar eclipse', '2026-03-03T11:33Z', 4],
    ['total solar eclipse', '2026-08-12T17:46Z', 0], ['partial lunar eclipse', '2026-08-28T04:13Z', 4],
    ['total solar eclipse', '2024-04-08T18:17Z', 0], ['total lunar eclipse', '2025-03-14T06:58Z', 4],
    ['total solar eclipse', '2027-08-02T10:07Z', 0], ['total lunar eclipse', '2029-06-26T03:22Z', 4],
  ];
  for (const [what, when, phase] of eclipses) {
    const d = new Date(when);
    check(`moon: ${what} ${when.slice(0, 10)} is ${phase ? 'full' : 'new'} moon`, moonPhase(d) === phase && near(moonAge(d), phase / 8), `age ${moonAge(d).toFixed(3)}`);
  }
  check('moon: a week after new moon is first quarter', moonPhase(new Date('2026-08-19T17:00Z')) === 2);
}

/* ---- the scenery's own life (ambient.ts) and the night sky's events */
{
  /** every art pixel a drawing puts down, by colour */
  const pixels = (life: Life, front: boolean, t: number, rate = 0, bow = false) => {
    const out: { x: number, y: number, c: number }[] = [], bad: string[] = [];
    const g = { fillStyle: '' as unknown, fillRect (x: number, y: number, w: number, h: number) {
      if (![x, y].every(v => Number.isInteger(v) && v % 3 === 0) || w !== 3 || h !== 3) bad.push(`rect ${x},${y},${w},${h}`);
      if (!/^#[0-9a-f]{6}$/i.test(String(g.fillStyle))) bad.push(`colour ${String(g.fillStyle)}`);
      out.push({ x: x / 3, y: y / 3, c: parseInt(String(g.fillStyle).slice(1), 16) });
    } };
    drawLife(g, life, front, t, rate, bow);
    return { out, bad };
  };
  const lifeAt = (o: SceneOptions, f = FRAME) => lifeOf(o, paint(o, f).layout, f.W);
  const kinds = (l: Life) => new Set(l.critters.map(c => c[0]));
  const grown: Growth = { checkIns: 0, perfectDays: 0, streakDays: 21, level: 3, quests: 0 };
  const F: Frame = { W: 180, H: 400, top: 20, bottom: 52 };
  for (const scene of SCENE_IDS) for (const tod of ['dawn', 'day', 'dusk', 'night'] as const) for (const season of ['spring', 'summer', 'autumn', 'winter'] as const) {
    const o = opts(scene, { tod, season, growth: grown }), life = lifeAt(o, F), k = kinds(life);
    let bad: string[] = [], outside = 0;
    for (let t = 0; t < 3000; t += 7) for (const front of [false, true]) {
      const p = pixels(life, front, t, tod === 'night' ? 2 : 0);
      bad = bad.concat(p.bad);
      // a bird flying off may leave by the side
      outside += p.out.filter(q => q.x < -30 || q.y < 0 || q.x > F.W + 30 || q.y >= F.H - F.bottom).length;
    }
    const at = `${scene} ${tod} ${season}`;
    check(`life ${at}: whole art pixels, real colours`, bad.length === 0, bad.slice(0, 3).join('; '));
    check(`life ${at}: stays above the bottom bar and below the top`, outside === 0, `${outside} outside`);
    check(`life ${at}: butterflies only on spring to autumn days (Pine hill: summer)`, !k.has(BUTTERFLY) || ((tod === 'day' || tod === 'dawn') && (season === 'summer' || (season !== 'winter' && scene !== 'pine'))));
    check(`life ${at}: no bird or crab at night`, tod !== 'night' || (!k.has(BIRD) && !k.has(CRAB)));
    check(`life ${at}: frogs only in the marsh, crabs only on the cove`, (!k.has(FROG) || (scene === 'marsh' && season !== 'winter')) && (!k.has(CRAB) || scene === 'cove'));
    check(`life ${at}: a bird on every fence by day`, tod === 'night' || scene === 'mushroom' || k.has(BIRD));
    check(`life ${at}: no clear sky over the marsh`, (life.sky === null) === (scene === 'marsh'));
    if (k.has(FISH)) check(`life ${at}: fish only in open water`, season !== 'winter' || scene === 'cove');
  }
  check('life: the meadow has butterflies, a pond fish and a bird on a summer day', ['0', '1', '3'].every(n => kinds(lifeAt(opts('meadow', { growth: grown }), F)).has(Number(n))));
  check('life: butterflies over the meadow on an autumn day too', kinds(lifeAt(opts('meadow', { season: 'autumn' }), F)).has(BUTTERFLY));
  check('life: the lake has fish all the time, the pond only from a 7-day streak', kinds(lifeAt(opts('lake'), F)).has(FISH) && !kinds(lifeAt(opts('meadow'), F)).has(FISH));
  // each kind moves, and keeps to its place
  const meadow = lifeAt(opts('meadow', { growth: { ...grown, level: 12 } }), F), marsh = lifeAt(opts('marsh', { tod: 'dusk' }), F), cove = lifeAt(opts('cove', { growth: grown }), F);
  for (const [name, life, kind] of [['butterfly', meadow, BUTTERFLY], ['pond fish', meadow, FISH], ['bird', meadow, BIRD], ['frog', marsh, FROG], ['crab', cove, CRAB]] as const) {
    const one: Life = { critters: life.critters.filter(c => c[0] === kind).slice(0, 1), sky: null }, c = one.critters[0];
    const seen = new Set<string>();
    let strays = 0;
    for (let t = 0; t < 12000; t += 3) {
      const p = pixels(one, kind === BUTTERFLY, t).out;
      seen.add(p.map(q => `${q.x},${q.y}`).join(' '));
      for (const q of p) {
        if (kind === BUTTERFLY && (Math.abs(q.x - c[2]) > c[4] + 3 || Math.abs(q.y - c[3]) > c[5] + 4)) strays++;
        if (kind === BIRD && q.y > c[3] - 1) strays++;
        if (kind === FISH && q.c === c[6] && (q.x < c[2] - 1 || q.x >= c[2] + c[4] || q.y < c[3] || q.y >= c[3] + c[5])) strays++;
        if (kind === CRAB && (q.x < c[2] - 1 || q.x > c[4] + 5 || q.y > c[3])) strays++;
      }
    }
    check(`life: the ${name} moves`, seen.size > 5, `${seen.size} pictures`);
    check(`life: the ${name} keeps to its place`, strays === 0, `${strays} pixels astray`);
  }
  // shooting stars: a shower is many more than an ordinary night, all in the upper sky, none by day
  const night = lifeAt(opts('meadow', { tod: 'night' }), F), sky = night.sky!;
  const streaks = (rate: number) => {
    let n = 0, low = 0;
    for (let t = 0; t < 12000; t++) {
      const p = pixels({ ...night, critters: [] }, false, t, rate).out;
      if (p.some(q => q.c === 0xFFFFFF)) n++;
      low += p.filter(q => q.y > sky[1] || q.y < sky[0]).length;
    }
    return { n, low };
  };
  const ordinary = streaks(1), shower = streaks(2);
  check('meteors: a shower night has many, an ordinary night a few', shower.n > 10 * ordinary.n && ordinary.n > 0, `${shower.n} vs ${ordinary.n} ticks`);
  check('meteors: they stay in the upper sky', shower.low === 0 && ordinary.low === 0);
  // often enough to notice (Vlad, 15 Oct: events "happen too rarely"): starts in 10 minutes of an ordinary night
  let starts = 0, was = false;
  for (let t = 0; t < 18000; t++) {
    const on = pixels({ ...night, critters: [] }, false, t, 1).out.length > 0;
    if (on && !was) starts++;
    was = on;
  }
  check('meteors: an ordinary night has one about every 40 s', starts >= 10 && starts <= 25, `${starts} in 10 minutes`);
  // the pond's fish rings (or leaps) in nearly every 5 s, the fence's bird flies off and back about every 20 s
  const fishOne: Life = { critters: meadow.critters.filter(c => c[0] === FISH).slice(0, 1), sky: null };
  let rings = 0;
  for (let k = 0; k < 120; k++) {
    let any = false;
    for (let t = k * 150; t < (k + 1) * 150 && !any; t++) any = pixels(fishOne, false, t).out.length > 0;
    if (any) rings++;
  }
  check('life: the pond rings in nearly every 5 s', rings >= 95, `${rings} of 120`);
  const birdOne: Life = { critters: meadow.critters.filter(c => c[0] === BIRD).slice(0, 1), sky: null };
  let flights = 0, sat = true;
  for (let t = 0; t < 18000; t += 2) {
    const on = pixels(birdOne, false, t).out.length > 0;
    if (!on && sat) flights++;
    sat = on;
  }
  check('life: the bird flies off at least 15 times in 10 minutes', flights >= 15, `${flights} flights`);
  check('meteors: they start left of the moon', sky[3] < Math.round(F.W * 0.8) - 6);
  const dates: [Date, boolean][] = [
    [new Date(2026, 7, 12, 23), true], [new Date(2026, 7, 13, 3), true], [new Date(2026, 7, 10, 23), false], [new Date(2026, 7, 14, 6), false],
    [new Date(2026, 11, 13, 22), true], [new Date(2026, 11, 15, 4), true], [new Date(2026, 11, 15, 12), false], [new Date(2026, 9, 15, 23), false],
  ];
  for (const [d, want] of dates) check(`meteors: ${d.toString().slice(0, 21)} is ${want ? '' : 'not '}a shower night`, showerNight(d) === want);
  // the aurora: Pine hill, winter, night; green in the sky there and nowhere else; that night is clear
  const green = (o: SceneOptions) => { const { r } = paint(o, F); let n = 0; for (const v of r.px) if (((v >> 8) & 0xff) > ((v >> 16) & 0xff) + 40 && ((v >> 8) & 0xff) > (v & 0xff)) n++; return n; };
  const auroraPx = green(opts('pine', { tod: 'night', season: 'winter' })) - green(opts('pine', { tod: 'night', season: 'autumn' }));
  check('aurora: over Pine hill on a winter night', auroraPx > 200, `${auroraPx} green pixels more`);
  check('aurora: not over the meadow', green(opts('meadow', { tod: 'night', season: 'winter' })) < 50);
  const weather = (scene: SceneId, tod: TimeOfDay, season: Season) => new WeatherLayer({ light: () => ({ tod, season }), options: { scene } } as never).kind();
  // rain from the date: about one day in three, by day; a rainbow the hour after a shower that ends before dusk
  let days = 0, wet = 0, early = 0, bowsOk = true, rainOk = true;
  for (let i = 0; i < 3 * 365; i++) {
    const s = showerOf(new Date(2026, 0, 1 + i));
    days++;
    if (!s) continue;
    wet++;
    if (s.from < 7 || s.from > 17 || s.to - s.from < 1 || s.to - s.from > 3) rainOk = false;
    for (let h = 0; h < 24; h++) {
      const at = new Date(2026, 0, 1 + i, h, 30);
      if (rainAt(at) !== (h >= s.from && h < s.to)) rainOk = false;
      if (rainbowAt(at) !== (h === s.to && s.to < 19)) bowsOk = false;
      if (rainbowAt(at)) early++;
    }
  }
  check('rain: about one day in three has a shower', wet / days > 0.28 && wet / days < 0.39, `${wet} of ${days}`);
  check('rain: showers start between 07:00 and 17:00 and last 1 to 3 hours', rainOk);
  check('rain: a rainbow only for the hour after a shower, before dusk', bowsOk && early > 0);
  check('rain: never in winter or in the glade', lifeAt(opts('meadow', { season: 'winter' }), F).bow === null && lifeAt(opts('mushroom'), F).bow === null && lifeAt(opts('meadow'), F).bow !== null);
  const bowLife = lifeAt(opts('meadow', { growth: { ...grown, level: 20 } }), F), [bx, by, br] = bowLife.bow!;
  const arc = pixels({ ...bowLife, critters: [] }, false, 0, 0, true).out, plain = pixels({ ...bowLife, critters: [] }, false, 0, 0).out;
  const stable = paint(opts('meadow', { growth: { ...grown, level: 20 } }), F).layout.door.x - 20;
  check('rainbow: six bands drawn only with the flag', plain.length === 0 && new Set(arc.map(q => q.c)).size === 6 && arc.length > 200, `${arc.length} pixels`);
  check('rainbow: above the horizon, left of the stable, on every other pixel', arc.every(q => q.y < by - 4 && q.x < stable && q.x >= bx - br && (q.x + q.y) % 2 === 0));
  const rainy = new WeatherLayer({ light: () => ({ tod: 'day', season: 'summer' }), options: { scene: 'meadow' }, walk: () => ({ top: 600, bottom: 900, left: 0, right: 479 }) } as never, { rain: true });
  const drops: string[] = [];
  rainy.draw({ fillStyle: '', fillRect (x: number, y: number) { drops.push(`${x},${y}`); } } as never, { w: 480, h: 1000, tick: 40 } as never);
  check('rain: falls in streaks over the summer meadow when it rains', drops.length >= 100);
  check('aurora: Pine hill winter nights are clear; its days and other scenes still snow', weather('pine', 'night', 'winter') === null && weather('pine', 'day', 'winter') === 'snow' && weather('meadow', 'night', 'winter') === 'snow');
}

/* ---- clock */
{
  const at = (h: number, m = 0) => new Date(2026, 5, 1, h, m);
  check('clock: 05:59 is night', timeOfDay(at(5, 59)) === 'night');
  check('clock: 06:00 is dawn', timeOfDay(at(6)) === 'dawn');
  check('clock: 08:00 is day', timeOfDay(at(8)) === 'day');
  check('clock: 19:00 is dusk', timeOfDay(at(19)) === 'dusk');
  check('clock: 21:00 is night', timeOfDay(at(21)) === 'night');
  check('season: January is winter in the north', seasonOf(new Date(2026, 0, 15)) === 'winter');
  check('season: January is summer in the south', seasonOf(new Date(2026, 0, 15), true) === 'summer');
  check('season: October is autumn in the north, spring in the south', seasonOf(new Date(2026, 9, 14)) === 'autumn' && seasonOf(new Date(2026, 9, 14), true) === 'spring');
  check('region: Australia and Brazil are south, the US and plain English are not', southernRegion('en-AU') && southernRegion('pt-BR') && !southernRegion('en-US') && !southernRegion('en') && !southernRegion('ro-RO'));
}

/* ---- Habitica's feast days (feasts.ts): each one decorates every scene, at every light, on the grid */
{
  for (const scene of SCENE_IDS) for (const tod of ['day', 'night'] as const) {
    const plain = hashOf(opts(scene, { tod, season: 'autumn' }));
    for (const f of FEASTS) {
      const o = opts(scene, { tod, season: 'autumn', feasts: [f], years: 3 }), { r } = paint(o);
      check(`feast ${f} in ${scene} by ${tod}: whole art pixels, real colours`, r.bad.length === 0, r.bad.slice(0, 3).join('; '));
      check(`feast ${f} in ${scene} by ${tod}: decorates`, r.hash() !== plain);
      check(`feast ${f} in ${scene} by ${tod}: the same picture every time`, r.hash() === hashOf(o));
    }
  }
  check('feasts: no feast is the plain scene', hashOf(opts('meadow', { feasts: [] })) === hashOf(opts('meadow')));
  check('feasts: the anniversary cake counts the years', hashOf(opts('meadow', { feasts: ['anniversary'], years: 2 })) !== hashOf(opts('meadow', { feasts: ['anniversary'], years: 5 })));
  check('feasts: New Year has fireworks at night, a different sky from the day', hashOf(opts('pine', { tod: 'night', feasts: ['nye'] })) !== hashOf(opts('pine', { tod: 'night' })));
  check('feasts: two at once paint both', hashOf(opts('meadow', { feasts: ['habitoween', 'anniversary'], years: 1 })) !== hashOf(opts('meadow', { feasts: ['habitoween'] })));
  // the Meadow's cart stands in the yard: it makes room for the table, and is back the day after
  const x0 = FRAME.W - 36, yard = yardOf(x0, paint(opts('meadow')).layout.horizon);
  const inYard = PROPS.meadow.filter(p => Math.abs(Math.round(4 + p.x * (FRAME.W - 48)) - yard.x) < 20);
  check('feasts: a scene prop in the yard makes room on a yard feast', inYard.length === 1 && inYard[0].id === 'cart' && usesYard(['birthday']) && !usesYard(['nye']), inYard.map(p => p.id).join(','));
}


/* ---- what a tap opens, told apart in the picture (the playground's rims, play/hint.ts) */
{
  const growth: Growth = { checkIns: 120, perfectDays: 10, streakDays: 7, level: 24, quests: 2, trophies: ['beastMaster', 'backToBasics', 'dustDevil'], signs: ['rodentRuler'] };
  for (const scene of SCENE_IDS) {
    const r = new Raster(FRAME.W, FRAME.H), own = partsPen(r, FRAME.W, FRAME.H), order: string[] = [];
    const layout = paintScene(own.pen, FRAME, opts(scene, { growth, part: p => { order.push(String(p)); own.part(p); } }));
    check(`parts ${scene}: the stable, then the trophies, each closed`, order.join() === 'house,null,trophies,null', order.join());
    check(`parts ${scene}: the pen paints the same picture`, r.hash() === hashOf(opts(scene, { growth })));
    // the stable's pixels sit in its tap box (its fence and lantern post a little left of it, a roof or flag a little
    // above); every trophy's tap box has a trophy's pixels, which stay near the boxes (the pennant line's posts)
    const near = (b: { x0: number, y0: number, x1: number, y1: number }, x: number, y: number, m: number) => x >= b.x0 - m && x < b.x1 + m && y >= b.y0 - m && y < b.y1 + m;
    let house = 0, inHouse = 0, stray = 0;
    const hit = layout.trophies.map(() => 0);
    for (let y = 0; y < FRAME.H; y++) for (let x = 0; x < FRAME.W; x++) {
      const k = own.owner[y * FRAME.W + x];
      if (k === 1) { house++; if (near(layout.house, x, y, 0)) inHouse++; else if (!near(layout.house, x, y, 8)) stray++; }
      if (k === 2) { layout.trophies.forEach((t, i) => { if (near(t, x, y, 0)) hit[i]++; }); if (!layout.trophies.some(t => near(t, x, y, 14))) stray++; }
    }
    check(`parts ${scene}: the stable's pixels and every trophy's are told apart, nothing elsewhere`, inHouse > 100 && inHouse > house * 0.8 && hit.length === 4 && hit.every(n => n > 0) && stray === 0,
      `house ${inHouse}/${house}, trophies ${hit.join()}, stray ${stray}`);
  }
}

console.log(`scenes: ${passes} passed${failures ? `, ${failures} FAILED` : ''}`);
process.exit(failures ? 1 : 0);
