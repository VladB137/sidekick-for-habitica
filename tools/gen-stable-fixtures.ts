// Test vectors for the live wallpaper's Java herd, weather and critters (android/verdict StableHerd, StableWeather,
// StableAmbient): the app's own TypeScript herd (src/playground/creatures.ts), weather (scenes/weather.ts) and
// critters (scenes/ambient.ts, placed by painting the scene) run headless,
// tick by tick, and every position, pose and drawing call is written down for the Java port to reproduce.
// Called from tools/gen-verdict-fixtures.ts. Synthetic creatures only.
import { writeFileSync } from 'node:fs';
import { World, Herd, hashSeed, looksOf, type Nature, type Resident, type Spot, type Sprite, type SpriteSource } from '../src/playground';
import { natureOf } from '../src/stable/natures';
import type { Bond, Temper } from '../src/playground/creatures';

/** a signature pair's part, as social.ts signaturesOf hands it over */
type Ways = Pick<Resident, 'lead' | 'guard' | 'orbit' | 'pounce' | 'flock' | 'fold' | 'meet' | 'elder'>;
import { WeatherLayer } from '../src/playground/scenes/weather';
import { drawLife, lifeOf, showerNight } from '../src/playground/scenes/ambient';
import { rainAt, rainbowAt } from '../src/playground/scenes/clock';
import { paintScene, NO_GROWTH, type SceneOptions } from '../src/playground/scenes/paint';

interface Look { id: string, species: string, kind: 'pet' | 'mount', gait: Sprite['gait'], facing: 'left' | 'right' | 'front', nocturnal?: boolean, w: number, h: number, ax: number, spot?: { x: number, y: number }, temper?: Temper, bonds?: Bond[], cold?: boolean, yours?: boolean, ways?: Ways, nature?: Nature }

/** a canvas stand-in that writes down what is drawn, with mirroring folded into a flag */
function recorder (looks: Look[], images: Map<object, [number, boolean | number]>) {
  const ops: string[] = [];
  // a quarter-turn matrix (turns.ts drawTurned) set by transform(), cleared by restore()
  let tr = { x: 0, y: 0, s: 1, m: null as number[] | null };
  const stack: typeof tr[] = [];
  const hex = (c: string) => c.replace('#', '').toUpperCase();
  const g = {
    fillStyle: '#000000',
    imageSmoothingEnabled: false,
    save () { stack.push({ ...tr }); },
    restore () { tr = stack.pop()!; },
    translate (x: number, y: number) { tr = { x: tr.x + tr.s * x, y: tr.y + y, s: tr.s }; },
    scale (sx: number) { tr = { ...tr, s: tr.s * sx }; },
    transform (a: number, b: number, c: number, d: number, e: number, f: number) { tr = { ...tr, m: [a, b, c, d, e, f] }; },
    fillRect (x: number, y: number, w: number, h: number) { ops.push(`r ${hex(g.fillStyle)} ${tr.x + x} ${tr.y + y} ${w} ${h}`); },
    drawImage (img: object, sx: number, sy: number, w: number, h: number, dx?: number, dy?: number) {
      const [n, head] = images.get(img)!;
      if (tr.m) {
        // turned: which quarter and whether mirrored, read back from the exact matrix; the box from its corners
        const [a, b, c, d, e, f] = tr.m;
        const q = b === 0 && c === 0 ? (d > 0 ? 0 : 2) : c < 0 ? 1 : 3;
        const mirror = q === 0 ? a < 0 : q === 1 ? b < 0 : q === 2 ? a > 0 : b > 0;
        const xs = [e, a * w + e, c * h + e, a * w + c * h + e], ys = [f, b * w + f, d * h + f, b * w + d * h + f];
        ops.push(`t ${n} ${head ? 1 : 0} ${sx} ${sy} ${w} ${h} ${Math.min(...xs)} ${Math.min(...ys)} ${mirror ? 1 : 0} ${q}`);
        return;
      }
      const flip = tr.s < 0;
      // the avatar on foot's picture, drawn whole: (img, x, y, w, h)
      if (n === -1) { ops.push(`a ${head} ${tr.x + sx} ${tr.y + sy}`); return; }
      // a rider's picture, drawn whole: (img, x, y, w, h)
      if (typeof head === 'number') { ops.push(`p ${n} ${head} ${flip ? tr.x - (sx + w) : tr.x + sx} ${tr.y + sy} ${flip ? 1 : 0}`); return; }
      const left = flip ? tr.x - (dx! + w) : tr.x + dx!;
      ops.push(`c ${n} ${head ? 1 : 0} ${sx} ${sy} ${w} ${h} ${left} ${tr.y + dy!} ${flip ? 1 : 0}`);
    },
  };
  void looks;
  return { g, ops };
}

function sprites (looks: Look[]): { src: SpriteSource, images: Map<object, [number, boolean | number]> } {
  const map = new Map<string, Sprite>(), images = new Map<object, [number, boolean | number]>();
  looks.forEach((l, n) => {
    const base = { w: l.w, h: l.h, anchor: { x: l.ax, y: l.h - 1 }, gait: l.gait, facing: l.facing, nocturnal: !!l.nocturnal };
    const body = {}, head = {};
    images.set(body, [n, false]); images.set(head, [n, true]);
    const key = l.kind === 'mount' ? `mount:${l.id}` : l.id;
    map.set(key, { key, image: body as CanvasImageSource, ...base });
    if (l.kind === 'mount') map.set(`${key}#head`, { key: `${key}#head`, image: head as CanvasImageSource, ...base });
  });
  return { src: { get: k => map.get(k), load: async () => {} }, images };
}

/** who rides from tick at (a mount's index, -1 for nobody) */
type Ride = [number, number];
/** the weather from tick at (scenes/weather.ts kind, null for none) */
type Sky = [number, string | null];
interface Scenario {
  name: string, seed: string, herdSeed: string, w: number, h: number, band: [number, number], door?: [number, number], shadow: string, looks: Look[], ticks: number,
  hours: [number, number][], pets: [number, number][], drawEvery: number, rides?: Ride[], skies?: Sky[],
  /** the scene's places (the pond and the newest flowers where creatures meet their kind among them), without natures */
  spots?: Spot[],
  /** each creature lives by its species' nature (src/stable/natures.ts), in a scene with these places, season and moon */
  natures?: { spots: Spot[], winter: boolean, moon: number },
  /** the avatar on foot from tick at (true) or gone (false); resting in the Inn from tick at */
  stands?: [number, boolean][], rests?: [number, boolean][],
  /** the still picture (animations off, Battery Saver) shown before tick at: at each of these hours in turn (who
   * perches up at their place, who keeps a still pose), the first with a tap on creature pet; then moving again */
  stills?: { at: number, hours: number[], pet?: number }[],
}

/** the avatar's pictures on a mount (ride.ts RiderPart with the image's size): above the saddle, reaching past the cell */
const RIDER: { x: number, y: number, w: number, h: number }[] = [
  { x: 6, y: -27, w: 90, h: 90 }, { x: 6, y: -27, w: 90, h: 90 }, { x: 9, y: -33, w: 90, h: 90 }, { x: -3, y: -24, w: 69, h: 69 },
];

/** the avatar on foot's pictures (ride.ts standingOf with the image's size): above the point under its feet, the Inn's Zzz last */
const STANDING: { x: number, y: number, w: number, h: number }[] = [
  { x: -57, y: -83, w: 90, h: 90 }, { x: -57, y: -83, w: 90, h: 90 }, { x: -57, y: -83, w: 90, h: 90 }, { x: -57, y: -83, w: 40, h: 40 },
];

const pet = (id: string, species: string, gait: Sprite['gait'], facing: Look['facing'], w: number, h: number, ax: number, extra: Partial<Look> = {}): Look => ({ id, species, kind: 'pet', gait, facing, w, h, ax, ...extra });
const mount = (id: string, species: string, gait: Sprite['gait'], facing: Look['facing'], w: number, h: number, ax: number, extra: Partial<Look> = {}): Look => ({ id, species, kind: 'mount', gait, facing, w, h, ax, ...extra });

const MIXED: Look[] = [
  pet('Wolf-Base', 'Wolf', 'four-legged', 'right', 60, 57, 30, { spot: { x: 0.3, y: 0.4 } }),
  pet('Wolf-Red', 'Wolf', 'four-legged', 'right', 60, 57, 30),
  mount('Dragon-Red', 'Dragon', 'four-legged', 'left', 105, 102, 55, { spot: { x: 0.7, y: 0.6 } }),
  pet('Egg-Base', 'Egg', 'sitting', 'front', 33, 39, 16),
  pet('Frog-Base', 'Frog', 'leaping', 'right', 45, 36, 22),
  pet('Snake-Base', 'Snake', 'legless', 'left', 54, 30, 27),
  pet('Owl-Base', 'Owl', 'flying', 'right', 48, 54, 24, { nocturnal: true }),
  mount('Gryphon-Base', 'Gryphon', 'flying', 'right', 102, 96, 51),
  mount('Turtle-Base', 'Turtle', 'sitting', 'left', 90, 66, 45),
];

/** bonds both ways, strongest first, as src/app/stable/social.ts hands them over */
function bonded (looks: Look[], pairs: [number, number, Bond['kind']][]): Look[] {
  const id = (l: Look) => `${l.kind}:${l.id}`;
  const out = looks.map(l => ({ ...l, bonds: [] as Bond[] }));
  const rank: Record<Bond['kind'], number> = { family: 0, kin: 1, friend: 2, cousin: 3, alike: 4 };
  for (const [a, b, kind] of pairs) { out[a].bonds.push({ id: id(out[b]), kind }); out[b].bonds.push({ id: id(out[a]), kind }); }
  for (const l of out) l.bonds.sort((x, y) => rank[x.kind] - rank[y.kind]);
  return out;
}

const TOGETHER: Look[] = bonded([
  mount('Wolf-Base', 'Wolf', 'four-legged', 'left', 99, 84, 53, { temper: 'close' }),
  pet('Wolf-Base', 'Wolf', 'four-legged', 'right', 54, 54, 26, { temper: 'close' }),
  pet('Fox-Red', 'Fox', 'four-legged', 'right', 57, 54, 28, { temper: 'aloof', spot: { x: 0.8, y: 0.3 } }),
  pet('Rat-Red', 'Rat', 'sitting', 'right', 60, 63, 35, { temper: 'close' }),
  pet('Owl-Base', 'Owl', 'sitting', 'front', 42, 54, 21, { temper: 'aloof', nocturnal: true }),
  pet('Cat-Base', 'Cat', 'sitting', 'right', 57, 60, 26, { temper: 'mischief' }),
  pet('Snake-Red', 'Snake', 'legless', 'front', 54, 30, 27, { temper: 'usual' }),
  pet('Squirrel-Base', 'Squirrel', 'sitting', 'right', 48, 51, 24, { temper: 'usual' }),
], [[0, 1, 'family'], [2, 4, 'cousin'], [2, 3, 'alike'], [3, 6, 'alike'], [5, 6, 'friend'], [3, 7, 'friend'], [2, 7, 'cousin']]);

/** two mischief makers for games of tag, a mount to lead the line home, a night owl to keep watch */
const PLAY: Look[] = bonded([
  mount('Horse-Base', 'Horse', 'four-legged', 'left', 105, 96, 52, { temper: 'usual' }),
  pet('Cat-Base', 'Cat', 'sitting', 'right', 57, 60, 26, { temper: 'mischief' }),
  pet('Monkey-Base', 'Monkey', 'four-legged', 'right', 54, 57, 27, { temper: 'mischief' }),
  pet('Bunny-Base', 'Bunny', 'sitting', 'right', 42, 48, 21, { temper: 'close' }),
  pet('Frog-Base', 'Frog', 'leaping', 'right', 45, 36, 22, { temper: 'usual' }),
  pet('Hedgehog-Base', 'Hedgehog', 'four-legged', 'right', 48, 42, 24, { temper: 'aloof' }),
  pet('Owl-Base', 'Owl', 'flying', 'right', 48, 54, 24, { temper: 'aloof', nocturnal: true }),
  pet('Snake-Base', 'Snake', 'legless', 'left', 54, 30, 27, { temper: 'usual' }),
], [[0, 3, 'kin'], [1, 3, 'friend'], [2, 4, 'friend'], [5, 6, 'cousin'], [4, 7, 'cousin']]);

/** a snowy day and night: the Polar Pro wolves and fox at home in it, the rest huddling */
const SNOW: Look[] = bonded([
  mount('Wolf-Base', 'Wolf', 'four-legged', 'left', 99, 84, 53, { temper: 'close', cold: true }),
  pet('Wolf-Base', 'Wolf', 'four-legged', 'right', 54, 54, 26, { temper: 'close', cold: true }),
  pet('Rat-Red', 'Rat', 'sitting', 'right', 60, 63, 35, { temper: 'close' }),
  pet('Bunny-Red', 'Bunny', 'sitting', 'right', 42, 48, 21, { temper: 'close' }),
  pet('Snake-Base', 'Snake', 'legless', 'front', 54, 30, 27, { temper: 'usual' }),
  pet('Fox-Red', 'Fox', 'four-legged', 'right', 57, 54, 28, { temper: 'aloof', cold: true }),
  pet('Turtle-Base', 'Turtle', 'sitting', 'left', 51, 39, 25, { temper: 'usual' }),
], [[0, 1, 'family'], [2, 3, 'friend'], [2, 5, 'alike'], [4, 6, 'cousin']]);

/** the player's pet walks beside the mount the player rides */
const YOURS: Look[] = bonded([
  mount('Dragon-Red', 'Dragon', 'four-legged', 'left', 105, 102, 55, { temper: 'usual' }),
  pet('Cat-Base', 'Cat', 'sitting', 'right', 57, 60, 26, { temper: 'mischief', yours: true }),
  pet('Rat-Red', 'Rat', 'sitting', 'right', 60, 63, 35, { temper: 'close' }),
  pet('Frog-Base', 'Frog', 'leaping', 'right', 45, 36, 22, { temper: 'usual', spot: { x: 0.9, y: 0.9 } }),
], [[1, 2, 'friend'], [0, 2, 'alike']]);

/** a Dragon and its friends on a snowy evening */
const HEARTH: Look[] = bonded([
  pet('Dragon-Base', 'Dragon', 'four-legged', 'right', 60, 60, 30, { temper: 'usual', spot: { x: 0.3, y: 0.5 } }),
  pet('Dog-Base', 'Dog', 'four-legged', 'right', 57, 54, 28, { temper: 'close' }), pet('Bunny-Base', 'Bunny', 'sitting', 'right', 42, 48, 21, { temper: 'close' }),
  mount('Horse-Base', 'Horse', 'four-legged', 'left', 105, 96, 52, { temper: 'usual' }), pet('Sheep-Base', 'Sheep', 'four-legged', 'left', 54, 48, 27, { temper: 'aloof' }),
  pet('Wolf-Base', 'Wolf', 'four-legged', 'right', 60, 57, 30, { temper: 'usual', cold: true }),
], [[1, 2, 'friend'], [0, 1, 'cousin'], [3, 4, 'alike']]);

/** what the later packages' poses do (the water's and the ground's): digging in with dirt thrown back, sunk and cut
 * at the ground, turning, a shake, popping up with its feet hidden; a made-up creature, so F tests them now */
const DIGGER: Nature = {
  traits: ['test'], families: [], schedule: { sleep: [21, 6], home: [19, 6] }, pace: { speed: 1, rest: 0.5 }, moods: [], likes: [],
  acts: [{ id: 'dig', p: 2, script: [
    { n: 4, sq: 1, fx: [{ kind: 'dirt', at: 'front', life: 12, side: -1 }, { kind: 'dirt', at: 'front', x: 1, life: 12 }] },
    { n: [6, 10], sink: 2 }, { n: 8, sink: 4, cut: 1, turn: true, dx: 1 }, { n: 5, lift: 1, cut: 0, leg: 1 }, { n: 3, sq: -1 },
  ], loops: [1, 2], rest: [20, 40] }, { id: 'look', at: 'tree', script: [{ n: 6, turn: true }, { n: 6, turn: true }] }],
};

/** signature pairs: a cat and yarn, a dragon guarding an egg, a squirrel circling a treeling, a Veteran the others seek */
const PAIRS: Look[] = bonded([
  pet('Cat-Base', 'Cat', 'sitting', 'right', 57, 60, 26, { temper: 'mischief', ways: { pounce: 'pet:Yarn-Base' } }),
  pet('Yarn-Base', 'Yarn', 'legless', 'front', 39, 33, 19, { temper: 'usual' }),
  mount('Dragon-Red', 'Dragon', 'four-legged', 'left', 105, 102, 55, { temper: 'usual', ways: { guard: 'pet:Egg-Base' } }),
  pet('Egg-Base', 'Egg', 'sitting', 'front', 33, 39, 16, { temper: 'usual' }),
  pet('Squirrel-Base', 'Squirrel', 'sitting', 'right', 48, 51, 24, { temper: 'usual', ways: { orbit: 'pet:Treeling-Base' } }),
  pet('Treeling-Base', 'Treeling', 'sitting', 'front', 51, 60, 25, { temper: 'usual' }),
  pet('Wolf-Veteran', 'Wolf', 'four-legged', 'right', 54, 54, 26, { temper: 'close', ways: { elder: true } }),
  pet('Rat-Red', 'Rat', 'sitting', 'right', 60, 63, 35, { temper: 'close' }),
], [[0, 1, 'friend'], [2, 3, 'friend'], [4, 5, 'friend'], [7, 6, 'cousin'], [0, 6, 'cousin'], [4, 7, 'cousin']]);

/** penguins single file, sea creatures at the pond, a bee and a butterfly over the flowers, a sheepdog and its sheep */
const GATHER: Look[] = bonded([
  pet('Penguin-Base', 'Penguin', 'sitting', 'right', 42, 48, 21, { temper: 'usual' }),
  pet('Penguin-Red', 'Penguin', 'sitting', 'right', 42, 48, 21, { temper: 'usual', ways: { lead: 'pet:Penguin-Base' } }),
  pet('Penguin-Shade', 'Penguin', 'sitting', 'right', 42, 48, 21, { temper: 'usual', ways: { lead: 'pet:Penguin-Red' } }),
  pet('Octopus-Base', 'Octopus', 'legless', 'right', 51, 42, 25, { temper: 'usual', ways: { meet: 'pond' } }),
  pet('Seahorse-Base', 'Seahorse', 'sitting', 'right', 39, 51, 19, { temper: 'usual', ways: { meet: 'pond' } }),
  pet('MagicalBee-Base', 'MagicalBee', 'flying', 'right', 42, 42, 21, { temper: 'usual', ways: { meet: 'flowers' } }),
  pet('Butterfly-Base', 'Butterfly', 'flying', 'right', 42, 39, 21, { temper: 'usual', ways: { meet: 'flowers' } }),
  pet('Dog-Base', 'Dog', 'four-legged', 'right', 54, 51, 27, { temper: 'close', ways: { flock: ['pet:Sheep-Base', 'pet:Sheep-Red'] } }),
  pet('Sheep-Base', 'Sheep', 'four-legged', 'right', 54, 48, 27, { temper: 'usual', spot: { x: 0.1, y: 0.2 }, ways: { fold: ['pet:Sheep-Red'] } }),
  pet('Sheep-Red', 'Sheep', 'four-legged', 'right', 54, 48, 27, { temper: 'usual', spot: { x: 0.9, y: 0.9 }, ways: { fold: ['pet:Sheep-Base'] } }),
], [[0, 1, 'kin'], [1, 2, 'kin'], [0, 2, 'kin'], [3, 4, 'friend'], [5, 6, 'friend'], [8, 9, 'kin'], [7, 8, 'friend']]);

/** a standing tree, one on the horizon (above the walking ground), a sapling, the stable's ridge, two flower
 * patches, the bamboo grove's edge */
const TREE_SPOTS: Spot[] = [
  { kind: 'tree', x: 90, y: 830, w: 45, h: 114 }, { kind: 'tree', x: 300, y: 770, w: 30, h: 90 }, { kind: 'tree', x: 200, y: 950, w: 12, h: 30 },
  { kind: 'roof', x: 470, y: 700, w: 84, h: 0 }, { kind: 'flowers', x: 250, y: 900, w: 18, h: 0 }, { kind: 'flowers', x: 380, y: 980, w: 18, h: 0 },
  { kind: 'bamboo', x: 270, y: 810, w: 500, h: 0 },
];
/** taps on creatures while they are up a tree, on the roof or in the sky */
const TREES_PETS: [number, number][] = [[400, 3], [1200, 2], [5000, 0], [8200, 5]];
const SKY_PETS: [number, number][] = [[1300, 3], [5700, 2]];

/** package W's creatures: amphibians, sea creatures, a mount of the sea, lurkers, a frog, a bear */
const WATER: Look[] = [
  pet('Otter-Base', 'Otter', 'sitting', 'left', 57, 66, 30, { spot: { x: 0.2, y: 0.75 } }), pet('Turtle-Base', 'Turtle', 'four-legged', 'right', 75, 48, 33, { spot: { x: 0.3, y: 0.8 } }),
  pet('Dolphin-Base', 'Dolphin', 'legless', 'right', 81, 57, 51), pet('Octopus-Base', 'Octopus', 'legless', 'front', 69, 54, 30),
  mount('Whale-Base', 'Whale', 'legless', 'left', 102, 102, 48, { spot: { x: 0.5, y: 0.05 } }), pet('Seahorse-Base', 'Seahorse', 'legless', 'right', 57, 57, 26),
  pet('Alligator-Base', 'Alligator', 'four-legged', 'right', 72, 54, 39), pet('Frog-Base', 'Frog', 'sitting', 'front', 54, 48, 38),
  pet('BearCub-Base', 'BearCub', 'sitting', 'right', 51, 48, 29), pet('Hippo-Base', 'Hippo', 'four-legged', 'right', 57, 57, 24),
];
/** the lake along the horizon (cut by the jetty), the pond and its bank, a marsh pool with a lily pad, the shore */
const WATER_SPOTS: Spot[] = [
  { kind: 'water', x: 150, y: 760, w: 300, h: 54, strip: true }, { kind: 'water', x: 430, y: 760, w: 190, h: 54, strip: true },
  { kind: 'water', x: 150, y: 960, w: 147, h: 39 }, { kind: 'shore', x: 150, y: 984, w: 120, h: 0 },
  { kind: 'water', x: 400, y: 900, w: 63, h: 9 }, { kind: 'lily', x: 412, y: 900, w: 21, h: 9 },
  { kind: 'shore', x: 270, y: 800, w: 500, h: 0 }, { kind: 'sun', x: 300, y: 870, w: 150, h: 0 },
];

const SCENARIOS: Scenario[] = [
  { name: 'day', seed: 'stable:u1:pg1', herdSeed: 'stable:pg1', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: MIXED, ticks: 3000, hours: [[0, 12]], pets: [[200, 0], [201, 0], [202, 0], [203, 0], [700, 4], [1500, 7]], drawEvery: 3 },
  { name: 'dusk', seed: 'stable:u2:home', herdSeed: 'stable:home', w: 360, h: 801, band: [531, 690], door: [301, 520], shadow: '#3F5A2A', looks: MIXED.slice(0, 6), ticks: 2400, hours: [[0, 19.5]], pets: [], drawEvery: 4 },
  { name: 'night', seed: 'stable:u3:pg9', herdSeed: 'stable:pg9', w: 720, h: 1599, band: [1068, 1390], door: [640, 1050], shadow: '#2A3550', looks: MIXED, ticks: 1500, hours: [[0, 20.5], [600, 21], [1200, 5.9]], pets: [[300, 2], [301, 1], [700, 3], [1300, 6]], drawEvery: 5 },
  { name: 'company', seed: 'stable:u4:x', herdSeed: 'stable:x', w: 480, h: 1068, band: [710, 930], shadow: '#4E6B34', looks: [
    pet('Fox-Base', 'Fox', 'four-legged', 'right', 57, 54, 28), pet('Fox-White', 'Fox', 'four-legged', 'right', 57, 54, 28), pet('Fox-Shade', 'Fox', 'four-legged', 'right', 57, 54, 28),
    pet('Bunny-Base', 'Bunny', 'sitting', 'right', 42, 48, 21), pet('Bunny-Red', 'Bunny', undefined as unknown as Sprite['gait'], 'right', 42, 48, 21), mount('Fox-Base', 'Fox', 'four-legged', 'left', 99, 96, 50),
  ], ticks: 3600, hours: [[0, 9]], pets: [[1000, 5]], drawEvery: 6 },
  // together (thread "Pets together"): company by temperament and bond, greetings with small hearts or a
  // sparkle, leaning in, a little one following its grown-up and copying its hop; then bedtime side by side
  { name: 'together', seed: 'stable:u6:pg2', herdSeed: 'stable:pg2', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: TOGETHER, ticks: 9000, hours: [[0, 10], [7000, 19.2], [8200, 21.5]], pets: [[400, 0], [2600, 0], [5000, 6]], drawEvery: 3 },
  { name: 'bedtime', seed: 'stable:u7:home', herdSeed: 'stable:home', w: 360, h: 801, band: [531, 690], door: [301, 520], shadow: '#3F5A2A', looks: TOGETHER.slice(0, 6), ticks: 3000, hours: [[0, 19.5], [1500, 22]], pets: [[2000, 1]], drawEvery: 4 },
  // part two: tag, then fireflies, the line home at dusk, a night owl watching over the sleepers
  { name: 'play', seed: 'stable:u8:pg3', herdSeed: 'stable:pg3', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: PLAY, ticks: 9000, hours: [[0, 11], [6000, 19.1], [7600, 22]], pets: [[2500, 1], [3400, 2]], drawEvery: 3, skies: [[0, null], [4800, 'fireflies'], [7000, null]] },
  { name: 'snow', seed: 'stable:u9:pg4', herdSeed: 'stable:pg4', w: 480, h: 1068, band: [710, 930], door: [420, 700], shadow: '#7A8A99', looks: SNOW, ticks: 6000, hours: [[0, 10], [3000, 19.4], [4800, 21.5]], pets: [], drawEvery: 4, skies: [[0, 'snow']] },
  { name: 'yours', seed: 'stable:u10:pg5', herdSeed: 'stable:pg5', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: YOURS, ticks: 3600, hours: [[0, 14]], pets: [], drawEvery: 4, rides: [[0, 0], [1800, -1], [1900, 0]] },
  // part three: signature pairs, by day and at bedtime; gatherings with somewhere to meet
  { name: 'pairs', seed: 'stable:u11:pg6', herdSeed: 'stable:pg6', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: PAIRS, ticks: 9000, hours: [[0, 10], [6500, 19.5], [8000, 22]], pets: [[3000, 0]], drawEvery: 3 },
  { name: 'gather', seed: 'stable:u12:pg7', herdSeed: 'stable:pg7', w: 720, h: 1599, band: [1068, 1390], door: [640, 1050], shadow: '#4E6B34', looks: GATHER, ticks: 7000, hours: [[0, 9]], pets: [], drawEvery: 5, spots: [{ kind: 'water', x: 159, y: 1330, w: 99, h: 27, pond: true }, { kind: 'flowers', x: 300, y: 1150, w: 18, h: 0 }, { kind: 'flowers', x: 420, y: 1200, w: 18, h: 0 }] },
  // natures (thread "Behaviours by species"): sprints with dust, a rat napping by day and scurrying, a crab going
  // sideways to the shore, popcorn, an egg's wobble, a rock that never walks, bounds, a sloth's crawl and long naps,
  // a lion lounging by the door, basking in the sun, a cactus in it; then dusk's slow moods
  { name: 'natures', seed: 'stable:u14:pg8', herdSeed: 'stable:pg8', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: [
    pet('Cheetah-Base', 'Cheetah', 'four-legged', 'right', 60, 57, 30), pet('Rat-Base', 'Rat', 'sitting', 'right', 60, 63, 35), pet('Crab-Base', 'Crab', 'four-legged', 'left', 54, 45, 27),
    pet('GuineaPig-Base', 'GuineaPig', 'sitting', 'right', 51, 45, 25), pet('Egg-Base', 'Egg', 'sitting', 'front', 33, 39, 16), pet('Rock-Base', 'Rock', 'sitting', 'front', 45, 36, 22),
    pet('Kangaroo-Base', 'Kangaroo', 'leaping', 'right', 57, 66, 28), pet('Sloth-Base', 'Sloth', 'sitting', 'right', 60, 51, 30), mount('Lion-Base', 'Lion', 'four-legged', 'left', 105, 102, 55),
    pet('Alligator-Base', 'Alligator', 'legless', 'left', 60, 36, 30), pet('Cactus-Base', 'Cactus', 'sitting', 'front', 42, 54, 21),
    pet('Digger-Base', 'Digger', 'four-legged', 'right', 51, 42, 25, { nature: DIGGER }),
    // ridden, it never digs in (the avatar would float); off again, it does
    mount('Digger-Base', 'Digger', 'four-legged', 'left', 99, 84, 50, { nature: DIGGER }),
  ], ticks: 6000, hours: [[0, 10], [3000, 16.5], [4500, 18.5]], pets: [[1500, 3], [2500, 4], [3600, 9]], drawEvery: 3, rides: [[0, 12], [3000, -1]],
  natures: { spots: [{ kind: 'sun', x: 200, y: 900, w: 150, h: 0 }, { kind: 'shore', x: 270, y: 805, w: 500, h: 0 }, { kind: 'tree', x: 60, y: 820, w: 30, h: 60 }], winter: false, moon: 2 } },
  // dawn: sleepers by the stable, the rooster up early crowing notes that wake its neighbours; the night creatures
  // turning in for day naps; the cat lively at twilight; then night, the night creatures about
  { name: 'dawn', seed: 'stable:u15:home', herdSeed: 'stable:home', w: 360, h: 801, band: [531, 690], door: [301, 520], shadow: '#3F5A2A', looks: [
    pet('Rooster-Base', 'Rooster', 'upright', 'right', 48, 54, 24, { spot: { x: 0.8, y: 0.1 } }), pet('Wolf-Base', 'Wolf', 'four-legged', 'right', 60, 57, 30, { spot: { x: 0.6, y: 0.1 } }),
    pet('Bunny-Base', 'Bunny', 'sitting', 'right', 42, 48, 21, { spot: { x: 0.95, y: 0.2 } }), pet('Owl-Base', 'Owl', 'flying', 'right', 48, 54, 24, { nocturnal: true }),
    pet('Hedgehog-Base', 'Hedgehog', 'four-legged', 'right', 45, 36, 22), pet('Cat-Base', 'Cat', 'sitting', 'right', 57, 60, 26),
    pet('Velociraptor-Base', 'Velociraptor', 'upright', 'right', 60, 60, 30), pet('Frog-Base', 'Frog', 'leaping', 'right', 45, 36, 22),
  ], ticks: 5000, hours: [[0, 5.5], [1500, 7.5], [3000, 19.5], [4000, 22.5]], pets: [[2000, 0]], drawEvery: 4,
  natures: { spots: [{ kind: 'sun', x: 120, y: 600, w: 120, h: 0 }], winter: false, moon: 4 } },
  // winter: snow lovers livelier with bounds in it, bears napping through the day by the door, the polar cub and the
  // Cerberus pup unlike their species
  { name: 'winter', seed: 'stable:u16:pg9', herdSeed: 'stable:pg9', w: 480, h: 1068, band: [710, 930], door: [420, 700], shadow: '#B9C8D6', looks: [
    pet('Penguin-Base', 'Penguin', 'upright', 'right', 42, 51, 21), mount('Wolf-Base', 'Wolf', 'four-legged', 'left', 99, 84, 53), pet('Bear-Base', 'Bear', 'four-legged', 'right', 60, 57, 30),
    pet('Fox-Base', 'Fox', 'four-legged', 'right', 57, 54, 28), mount('Mammoth-Base', 'Mammoth', 'four-legged', 'left', 105, 105, 52), pet('BearCub-Polar', 'BearCub', 'four-legged', 'right', 54, 51, 27),
    pet('Wolf-Cerberus', 'Wolf', 'four-legged', 'right', 60, 57, 30), pet('PandaCub-Base', 'PandaCub', 'sitting', 'right', 48, 48, 24),
  ], ticks: 4000, hours: [[0, 12], [2000, 18.5], [3200, 23]], pets: [[1000, 2]], drawEvery: 4,
  skies: [[0, 'snow']], natures: { spots: [{ kind: 'sun', x: 150, y: 800, w: 100, h: 0 }], winter: true, moon: 4 } },
  // touch by species (package B): a tap gives the ferret its war dance, the rock a heart and no hop, the treeling a
  // shake with leaves; again at night, waking them; a mount's tap reaction too; three hearts at most still holds
  { name: 'touch', seed: 'stable:u14:pg1', herdSeed: 'stable:pg1', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: [
    pet('Ferret-Base', 'Ferret', 'four-legged', 'right', 54, 45, 27), pet('Rock-Base', 'Rock', 'sitting', 'front', 45, 36, 22), pet('Treeling-Base', 'Treeling', 'upright', 'right', 48, 60, 24),
    mount('Ferret-Red', 'Ferret', 'four-legged', 'left', 99, 84, 50), pet('Deer-Base', 'Deer', 'four-legged', 'right', 57, 60, 28),
  ], ticks: 3000, hours: [[0, 11], [2000, 23]], pets: [[300, 0], [301, 0], [302, 0], [303, 0], [600, 1], [900, 2], [1200, 3], [1300, 4], [2300, 0], [2400, 2], [2500, 1]], drawEvery: 3,
  natures: { spots: [{ kind: 'sun', x: 200, y: 900, w: 150, h: 0 }], winter: false, moon: 2 } },
  // ground, light and night details (package G): grazing with grass flicked up, a cow's moo, a bunny burrowing out of
  // sight and coming up a way off, a dragon's flame puff from its nose, dust from the TRex's steps
  { name: 'pasture', seed: 'stable:u14:pg8', herdSeed: 'stable:pg8', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: [
    mount('Horse-Base', 'Horse', 'four-legged', 'left', 105, 96, 52), pet('Cow-Base', 'Cow', 'four-legged', 'right', 60, 54, 30), pet('Sheep-Base', 'Sheep', 'four-legged', 'left', 54, 48, 27),
    pet('Bunny-Base', 'Bunny', 'sitting', 'right', 42, 48, 21, { spot: { x: 0.95, y: 0.5 } }), pet('Bunny-Red', 'Bunny', 'sitting', 'left', 42, 48, 21),
    pet('Dragon-Base', 'Dragon', 'four-legged', 'right', 60, 60, 30), mount('Dragon-Red', 'Dragon', 'four-legged', 'left', 105, 102, 55),
    pet('TRex-Base', 'TRex', 'upright', 'right', 60, 60, 30), pet('Deer-Base', 'Deer', 'four-legged', 'right', 54, 57, 27),
  ], ticks: 7000, hours: [[0, 9], [4000, 15]], pets: [[2000, 3], [5200, 5]], drawEvery: 3,
  natures: { spots: [{ kind: 'sun', x: 200, y: 900, w: 150, h: 0 }], winter: false, moon: 1 } },
  // the evening and night of a full moon: the JackOLantern's and the Phoenix's light on the ground (embers), the
  // Unicorn's sparkle trail home, the Wolf howling and the creatures near it turning to look, then night: the Raccoon
  // rummaging at the lantern and the door, the Badger digging, the Snail's trail, the Robot's blinking light
  { name: 'moonlight', seed: 'stable:u15:pg9', herdSeed: 'stable:pg9', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#2A3550', looks: [
    pet('JackOLantern-Base', 'JackOLantern', 'sitting', 'front', 45, 42, 22), pet('Phoenix-Base', 'Phoenix', 'flying', 'right', 54, 57, 27),
    mount('Unicorn-Base', 'Unicorn', 'four-legged', 'left', 105, 102, 52), pet('Wolf-Base', 'Wolf', 'four-legged', 'right', 60, 57, 30, { spot: { x: 0.4, y: 0.5 } }),
    pet('Wolf-Red', 'Wolf', 'four-legged', 'right', 60, 57, 30, { spot: { x: 0.2, y: 0.4 } }), pet('Dog-Base', 'Dog', 'four-legged', 'right', 57, 54, 28, { spot: { x: 0.55, y: 0.5 } }),
    pet('Raccoon-Base', 'Raccoon', 'four-legged', 'right', 57, 51, 28), pet('Badger-Base', 'Badger', 'four-legged', 'left', 57, 45, 28),
    pet('Snail-Base', 'Snail', 'legless', 'right', 48, 36, 24), pet('Robot-Base', 'Robot', 'upright', 'front', 48, 57, 24),
  ], ticks: 9000, hours: [[0, 18.6], [600, 19.4], [3600, 22.5], [7000, 3]], pets: [[4000, 9], [6000, 0]], drawEvery: 3,
  natures: { spots: [{ kind: 'lantern', x: 420, y: 805, w: 0, h: 0 }, { kind: 'sun', x: 200, y: 900, w: 150, h: 0 }], winter: false, moon: 4 } },
  // winter: the Fox mousing in the snow, the Bunny burrowing through drifts, the grazers pawing at the snow
  { name: 'drifts', seed: 'stable:u16:pg7', herdSeed: 'stable:pg7', w: 480, h: 1068, band: [710, 930], door: [420, 700], shadow: '#B9C8D6', looks: [
    pet('Fox-Base', 'Fox', 'four-legged', 'right', 57, 54, 28), pet('Fox-Red', 'Fox', 'four-legged', 'left', 57, 54, 28), pet('Bunny-Base', 'Bunny', 'sitting', 'right', 42, 48, 21),
    mount('Horse-Base', 'Horse', 'four-legged', 'left', 105, 96, 52), mount('Mammoth-Base', 'Mammoth', 'four-legged', 'left', 105, 105, 52), pet('Alpaca-Base', 'Alpaca', 'four-legged', 'right', 54, 57, 27),
  ], ticks: 7000, hours: [[0, 10], [3500, 14]], pets: [[3000, 0]], drawEvery: 4,
  skies: [[0, 'snow']], natures: { spots: [{ kind: 'sun', x: 150, y: 800, w: 100, h: 0 }], winter: true, moon: 2 } },
  // a snowy evening with a Dragon (Pets together's Dragon ring, on the flame): it stays where it is, glowing, the rest
  // settle in a ring round it instead of by the door and sleep there; the polar Wolf keeps wandering
  { name: 'hearth', seed: 'stable:u17:pg4', herdSeed: 'stable:pg4', w: 480, h: 1068, band: [710, 930], door: [420, 700], shadow: '#B9C8D6', looks: HEARTH, ticks: 5000,
    hours: [[0, 18], [600, 19.5], [3500, 21.5]], pets: [[4200, 0]], drawEvery: 4, skies: [[0, 'snow']], natures: { spots: [], winter: true, moon: 2 } },
  // trees, sky and flowers (package T): perches on a crown and the ridge with the hover gone, the Falcon's swoop,
  // climbers, the Spider's thread of silk, the Pterodactyl soaring and gliding out and back, flower visits with
  // pollen, browsing, munching bamboo, a still Treeling (the 'sky' herd, with the Flying Pig's flight and the Parrot's perch); taps on whoever is up a tree; then night, the Owl's perch
  { name: 'trees', seed: 'stable:u14:pg8', herdSeed: 'stable:pg8', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: [
    pet('Owl-Base', 'Owl', 'flying', 'front', 48, 54, 24, { nocturnal: true }), pet('Falcon-Base', 'Falcon', 'sitting', 'right', 51, 54, 25), mount('Gryphon-Base', 'Gryphon', 'four-legged', 'left', 105, 105, 52),
    pet('Squirrel-Base', 'Squirrel', 'sitting', 'right', 48, 51, 24), pet('Monkey-Base', 'Monkey', 'four-legged', 'right', 54, 57, 27), pet('Spider-Base', 'Spider', 'sitting', 'front', 51, 39, 25),
  ], ticks: 9000, hours: [[0, 10], [4200, 22.5]], pets: TREES_PETS, drawEvery: 3, natures: { spots: TREE_SPOTS, winter: false, moon: 3 } },
  { name: 'sky', seed: 'stable:u15:pg9', herdSeed: 'stable:pg9', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: [
    mount('Giraffe-Base', 'Giraffe', 'four-legged', 'left', 105, 105, 52), pet('Butterfly-Base', 'Butterfly', 'flying', 'right', 54, 48, 27), pet('MagicalBee-Base', 'MagicalBee', 'flying', 'right', 48, 45, 24),
    pet('Pterodactyl-Base', 'Pterodactyl', 'flying', 'right', 60, 51, 30), pet('PandaCub-Base', 'PandaCub', 'sitting', 'right', 48, 48, 24), pet('Treeling-Base', 'Treeling', 'sitting', 'front', 45, 54, 22),
    pet('FlyingPig-RoyalPurple', 'FlyingPig', 'flying', 'right', 48, 48, 24),
    pet('Parrot-Base', 'Parrot', 'flying', 'right', 48, 48, 24),
  ], ticks: 7000, hours: [[0, 10]], pets: SKY_PETS, drawEvery: 3, natures: { spots: TREE_SPOTS, winter: false, moon: 3 } },
  // turns (package R): yarn rolling on every walk, the armadillo and hedgehog now and then (by night, when they're
  // about), the otter floating on its back in the pond (turned and cut), the sloth hanging upside down by a tree, the
  // penguin belly-sliding in the snow; a tap stops a roll; a ridden armadillo never rolls
  { name: 'turns', seed: 'stable:u15:pg3', herdSeed: 'stable:pg3', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#B9C8D6', looks: [
    pet('Yarn-Base', 'Yarn', 'sitting', 'front', 36, 36, 18), pet('Armadillo-Base', 'Armadillo', 'four-legged', 'right', 54, 42, 27), pet('Hedgehog-Base', 'Hedgehog', 'four-legged', 'right', 48, 42, 24),
    pet('Otter-Base', 'Otter', 'four-legged', 'right', 57, 48, 28), pet('Sloth-Base', 'Sloth', 'sitting', 'right', 60, 51, 30), pet('Penguin-Base', 'Penguin', 'upright', 'right', 42, 51, 21),
    mount('Armadillo-Red', 'Armadillo', 'four-legged', 'left', 99, 84, 50), pet('Yarn-Red', 'Yarn', 'sitting', 'left', 39, 33, 19, { spot: { x: 0.97, y: 0.5 } }),
  ], ticks: 9000, hours: [[0, 11], [4500, 23]], pets: [[600, 0], [1500, 7], [5200, 1], [5300, 2]], drawEvery: 3, rides: [[0, 6]],
  natures: { spots: [{ kind: 'water', x: 150, y: 960, w: 147, h: 39 }, { kind: 'tree', x: 420, y: 830, w: 30, h: 60 }], winter: true, moon: 2 } },
  // water (package W): wading through the pond, swims and dives with ripples and bubbles, coming up elsewhere, a
  // breach, a whale mount spouting in the lake off the walking ground, lurking, a frog on a lily pad, a bear fishing
  // from the pond's bank, a tap on a swimmer; places as the lake scene with a pond sends them
  { name: 'water', seed: 'stable:u14:pg8', herdSeed: 'stable:pg8', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: WATER, ticks: 9000, hours: [[0, 9.5], [6000, 14]], pets: [[2500, 0], [4000, 2], [5200, 1]], drawEvery: 3,
    natures: { spots: WATER_SPOTS, winter: false, moon: 2 } },
  // winter: the pond and the pools frozen (walked over, no swims), only the lake open; then none at all, and the sea
  // creatures rest more and wander less
  { name: 'ice', seed: 'stable:u15:pg9', herdSeed: 'stable:pg9', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#B9C8D6', looks: WATER.slice(0, 6), ticks: 4000, hours: [[0, 11]], pets: [], drawEvery: 4,
    natures: { spots: WATER_SPOTS.filter(s => !s.strip), winter: true, moon: 4 } },
  // a ridden mount: the avatar drawn between its body and head, moving with it, awake at night; off, then onto another
  // the avatar on foot by the door: creatures come to greet it; resting in the Inn they sleep by the door at noon; it leaves, comes back
  { name: 'avatar', seed: 'stable:u6:home', herdSeed: 'stable:home', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: MIXED, ticks: 4200, hours: [[0, 12]], pets: [[400, 3], [2500, 6]], drawEvery: 3, stands: [[0, true], [3300, false], [3600, true]], rests: [[2400, true], [3000, false]] },
  // no door: it stands a quarter of the way in
  { name: 'avatar-field', seed: 'stable:u7:x', herdSeed: 'stable:x', w: 480, h: 1068, band: [710, 930], shadow: '#4E6B34', looks: MIXED.slice(0, 6), ticks: 3000, hours: [[0, 10]], pets: [], drawEvery: 5, stands: [[0, true]] },
  // the still picture: perchers up at the nearest free place for the hour (one to a place, the Pterodactyl beside
  // whoever is up a tree), the Lion's lounge pose, a ridden Gryphon and anyone asleep or busy on the ground, a tap's
  // heart over a percher; moving again, everyone back where they stood
  { name: 'still', seed: 'stable:u18:pg8', herdSeed: 'stable:pg8', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: [
    pet('Lion-Base', 'Lion', 'four-legged', 'right', 60, 57, 30), pet('Owl-Base', 'Owl', 'flying', 'front', 48, 54, 24, { nocturnal: true }), pet('Falcon-Base', 'Falcon', 'sitting', 'right', 51, 54, 25),
    pet('Squirrel-Base', 'Squirrel', 'sitting', 'right', 48, 51, 24), pet('Monkey-Base', 'Monkey', 'four-legged', 'right', 54, 57, 27), pet('Pterodactyl-Base', 'Pterodactyl', 'flying', 'right', 60, 51, 30),
    pet('Butterfly-Base', 'Butterfly', 'flying', 'right', 54, 48, 27), pet('MagicalBee-Base', 'MagicalBee', 'flying', 'right', 48, 45, 24), pet('Sloth-Base', 'Sloth', 'sitting', 'right', 60, 51, 30),
    mount('Gryphon-Base', 'Gryphon', 'four-legged', 'left', 105, 105, 52), pet('LionCub-Base', 'LionCub', 'four-legged', 'right', 48, 45, 24), pet('Spider-Base', 'Spider', 'sitting', 'front', 51, 39, 25),
  ], ticks: 4000, hours: [[0, 10], [2000, 22.5], [3200, 10]], pets: [[500, 0]], drawEvery: 4, rides: [[0, 9], [2600, -1]],
  stills: [{ at: 1, hours: [10, 22.5, 14], pet: 3 }, { at: 900, hours: [10], pet: 2 }, { at: 1700, hours: [12, 23] }, { at: 2900, hours: [22.5, 4, 10] }, { at: 3700, hours: [10] }],
  natures: { spots: TREE_SPOTS, winter: false, moon: 3 } },
  { name: 'ride', seed: 'stable:u5:home', herdSeed: 'stable:home', w: 540, h: 1200, band: [801, 1043], door: [478, 790], shadow: '#4E6B34', looks: MIXED, ticks: 1800, hours: [[0, 20.5], [500, 22], [1400, 12]], pets: [[100, 2], [900, 7]], drawEvery: 3, rides: [[0, 2], [700, -1], [800, 7], [1500, 8]] },
];

function scenario (s: Scenario, out: string[]) {
  const { src, images } = sprites(s.looks);
  const world = new World(src, { seed: s.seed, w: s.w, h: s.h });
  let hour = s.hours[0][1], sky: string | null = null;
  const nat = s.natures;
  let resting = false, still = false;
  const herd = new Herd(world, {
    ...(nat ? { sky: () => ({ winter: nat.winter, moon: nat.moon }) } : {}), spots: () => nat?.spots ?? s.spots ?? [],
    seed: s.herdSeed, still: () => still, ball: false, resting: () => resting, weather: () => sky, clock: () => new Date(2026, 9, 14, Math.floor(hour), Math.round((hour % 1) * 60)),
    ground: () => ({ top: s.band[0], bottom: s.band[1] }), shadow: () => s.shadow, home: () => (s.door ? { x: s.door[0], y: s.door[1] } : null),
  });
  const social = (l: Look) => ({ ...(l.temper ? { temper: l.temper, bonds: l.bonds ?? [] } : {}), ...(l.cold ? { cold: true } : {}), ...l.ways });
  const ways = (w?: Ways) => {
    const kv = Object.entries(w ?? {}).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('|') : v === true ? 1 : v}`);
    return kv.length ? kv.join(',') : '-';
  };
  const nature = (l: Look) => (nat ? { nature: l.nature ?? natureOf(l.kind, l.id) } : {});
  const residents: Resident[] = s.looks.map(l => (l.kind === 'mount' ? { id: `mount:${l.id}`, sprite: `mount:${l.id}`, head: `mount:${l.id}#head`, kind: 'mount', species: l.species, spot: l.spot, ...social(l), ...nature(l) } : { id: `pet:${l.id}`, sprite: l.id, kind: 'pet', species: l.species, spot: l.spot, ...social(l), ...nature(l) }));
  herd.set(residents);
  const yours = s.looks.findIndex(l => l.yours && l.kind === 'pet');
  if (yours >= 0) herd.mine(residents[yours].id);
  const riders = RIDER.map((r, i) => { const img = {}; images.set(img, [0, i]); return { image: img as CanvasImageSource, ...r }; });
  const ride = (n: number) => {
    // the recorder names a rider's picture by the mount it is on
    riders.forEach((r, i) => images.set(r.image, [n, i]));
    herd.ride(n < 0 ? null : residents[n].id, n < 0 ? undefined : riders);
  };
  out.push(`scenario ${s.name} ${hashSeed(s.seed) | 0} ${s.herdSeed} ${s.w} ${s.h} ${s.band[0]} ${s.band[1]} ${s.door ? s.door.join(' ') : '- -'} ${s.shadow.slice(1)}`);
  s.looks.forEach((l, i) => {
    out.push(`look ${l.kind === 'mount' ? 'mount:' : 'pet:'}${l.id} ${l.species} ${l.kind === 'mount' ? 1 : 0} ${l.gait ?? '-'} ${l.facing} ${l.nocturnal ? 1 : 0} ${l.kind === 'mount' ? 1 : 0} ${l.w} ${l.h} ${l.ax} ${l.spot ? l.spot.x : 'NaN'} ${l.spot ? l.spot.y : 'NaN'} ${l.temper ?? '-'} ${l.temper && l.bonds?.length ? l.bonds.map(b => `${b.id}=${b.kind}`).join(',') : '-'} ${l.cold ? 1 : 0} ${l.yours ? 1 : 0} ${ways(l.ways)}`);
    // its nature as the app sends it to the wallpaper (scenery.ts)
    if (residents[i].nature) out.push(`nature ${JSON.stringify(residents[i].nature)}`);
  });
  if (nat || s.spots) out.push(`places ${nat?.winter ? 1 : 0} ${nat?.moon ?? 1} ${JSON.stringify(nat?.spots ?? s.spots)} ${JSON.stringify(looksOf(residents.map(r => r.nature)))}`);
  out.push(`hour ${hour}`);
  const skyLine = (k: string | null) => `sky ${k ?? '-'}`;
  for (const [at, k] of s.skies ?? []) if (at === 0) { sky = k; out.push(skyLine(k)); }
  const standing = STANDING.map((r, i) => { const img = {}; images.set(img, [-1, i]); return { image: img as CanvasImageSource, ...r }; });
  const stand = (on: boolean) => { herd.stand(on ? standing : null); out.push(`stand ${on ? STANDING.map(r => [r.x, r.y, r.w, r.h].join(',')).join(';') : '-'}`); };
  const rest = (on: boolean) => { resting = on; out.push(`rest ${on ? 1 : 0}`); };
  for (const [at, on] of s.stands ?? []) if (at === 0) stand(on);
  for (const [at, on] of s.rests ?? []) if (at === 0) rest(on);
  const rideLine = (n: number) => `ride ${n < 0 ? '-' : `${n} ${RIDER.map(r => [r.x, r.y, r.w, r.h].join(',')).join(';')}`}`;
  for (const [at, n] of s.rides ?? []) if (at === 0) { ride(n); out.push(rideLine(n)); }
  const cs = herd.creatures;
  const state = () => cs.map(c => [c.fx, c.fy, c.lift, c.sq, c.leg, c.dir, c.st, c.asleep ? 1 : 0, c.hearts, c.lean, c.wake, c.off, c.dx].join(',')).join(';');
  const draw = () => {
    const rec = recorder(s.looks, images);
    // the herd's back layer: the lights on the ground (behaviours Glow)
    for (const l of world.layers) if (l.depth === 'back') l.draw(rec.g as unknown as CanvasRenderingContext2D, world);
    for (const e of world.drawOrder()) e.draw?.(rec.g as unknown as CanvasRenderingContext2D, world, world.sprites.get(e.sprite));
    for (const l of world.layers) if (l.depth === 'front') l.draw(rec.g as unknown as CanvasRenderingContext2D, world);
    return rec.ops.join(';');
  };
  out.push(`tick 0 ${state()}`);
  out.push(`draw ${draw()}`);
  for (let t = 1; t <= s.ticks; t++) {
    for (const v of s.stills ?? []) {
      if (v.at !== t) continue;
      // nothing steps in the still picture; the herd settles again whenever it is drawn
      const back = hour;
      still = true;
      v.hours.forEach((h, i) => {
        hour = h;
        herd.settle();
        out.push(`still ${h}`, `pose ${state()}`, `draw ${draw()}`);
        if (i === 0 && v.pet !== undefined) { herd.pet(cs[v.pet].id); out.push(`pet ${v.pet}`, `draw ${draw()}`); }
      });
      still = false; hour = back;
      out.push(`move ${back}`);
    }
    for (const [at, h] of s.hours) if (at === t) { hour = h; out.push(`hour ${h}`); }
    for (const [at, k] of s.skies ?? []) if (at === t) { sky = k; out.push(skyLine(k)); }
    for (const [at, n] of s.pets) if (at === t) { herd.pet(cs[n].id); out.push(`pet ${n}`); }
    for (const [at, n] of s.rides ?? []) if (at === t) { ride(n); out.push(rideLine(n)); }
    for (const [at, on] of s.stands ?? []) if (at === t) stand(on);
    for (const [at, on] of s.rests ?? []) if (at === t) rest(on);
    world.step();
    out.push(`tick ${t} ${state()}`);
    if (t % s.drawEvery === 0) out.push(`draw ${draw()}`);
  }
  out.push('end');
}

function weather (out: string[]) {
  const cases: [string, 'winter' | 'autumn' | 'summer', 'day' | 'night' | 'dusk', string, number, number, number, number][] = [
    ['snow', 'winter', 'day', 'meadow', 540, 1200, 801, 1043], ['snow-night', 'winter', 'night', 'meadow', 360, 801, 531, 690],
    ['leaves', 'autumn', 'day', 'pine', 540, 1200, 801, 1043], ['fireflies', 'summer', 'dusk', 'lake', 720, 1599, 1068, 1390],
    ['glow', 'summer', 'night', 'mushroom', 480, 1068, 710, 930], ['rain', 'spring', 'day', 'meadow', 540, 1200, 801, 1043],
    ['rain-night', 'autumn', 'night', 'marsh', 360, 801, 531, 690],
  ];
  for (const [name, season, tod, scene, w, h, top, bottom] of cases) {
    const rain = name.startsWith('rain');
    const layer = new WeatherLayer({ light: () => ({ tod, season }), options: { scene }, walk: () => ({ top, bottom, left: 0, right: w - 1 }) } as never, { rain });
    out.push(`weather ${name} ${rain ? 'rain' : layer.kind()} ${w} ${h} ${top} ${bottom} ${tod === 'night' ? 1 : 0}`);
    for (let t = 0; t <= 2000; t += 13) {
      const rec = recorder([], new Map());
      layer.draw(rec.g as unknown as CanvasRenderingContext2D, { w, h, tick: t } as World);
      out.push(`at ${t} ${rec.ops.join(';')}`);
    }
    out.push('end');
  }
}

/** The scenery's critters and shooting stars, where a painted scene puts them, over a long stretch of ticks. */
function ambient (out: string[]) {
  const cases: [string, Partial<SceneOptions> & Pick<SceneOptions, 'scene' | 'tod' | 'season'>, number, boolean?][] = [
    ['meadow-day', { scene: 'meadow', tod: 'day', season: 'summer', growth: { ...NO_GROWTH, streakDays: 14, level: 12 } }, 0],
    ['marsh-dusk', { scene: 'marsh', tod: 'dusk', season: 'spring', growth: { ...NO_GROWTH, level: 3 } }, 0],
    ['cove-day', { scene: 'cove', tod: 'day', season: 'summer', growth: { ...NO_GROWTH, level: 22, streakDays: 30 } }, 0],
    ['lake-dawn', { scene: 'lake', tod: 'dawn', season: 'spring', growth: { ...NO_GROWTH, level: 1 } }, 0],
    ['bamboo-day', { scene: 'bamboo', tod: 'day', season: 'spring', growth: { ...NO_GROWTH, level: 16, streakDays: 8 } }, 0],
    ['meadow-night', { scene: 'meadow', tod: 'night', season: 'summer', growth: { ...NO_GROWTH, streakDays: 7 } }, 1],
    ['pine-shower', { scene: 'pine', tod: 'night', season: 'winter', growth: NO_GROWTH }, 2],
    ['meadow-rainbow', { scene: 'meadow', tod: 'day', season: 'autumn', growth: { ...NO_GROWTH, level: 12 } }, 0, true],
    ['lake-rainbow', { scene: 'lake', tod: 'dawn', season: 'spring', growth: NO_GROWTH }, 0, true],
  ];
  const sink = { fillStyle: '', fillRect () {} };
  for (const [name, o, rate, bow = false] of cases) {
    const W = 180, H = 400, opts: SceneOptions = { growth: NO_GROWTH, dailiesDone: true, ...o };
    const life = lifeOf(opts, paintScene(sink, { W, H, top: 20, bottom: 52 }, opts), W);
    out.push(`life ${name} ${rate} ${bow ? 1 : 0} ${life.sky ? life.sky.join(',') : '-'} ${life.bow ? life.bow.join(',') : '-'} ${life.critters.map(c => c.join(',')).join('|') || '-'}`);
    for (let t = 0; t <= (bow ? 600 : 12000); t += 5) {
      for (const front of [false, true]) {
        const rec = recorder([], new Map());
        drawLife(rec.g, life, front, t, rate, bow);
        out.push(`${front ? 'front' : 'back'} ${t} ${rec.ops.join(';')}`);
      }
    }
    out.push('end');
  }
  // the meteor showers' nights, by the phone's local time
  for (const [y, m, d, h] of [[2026, 7, 10, 23], [2026, 7, 11, 21], [2026, 7, 14, 5], [2026, 7, 14, 6], [2026, 11, 12, 3], [2026, 11, 12, 22], [2026, 11, 15, 4], [2026, 11, 15, 12], [2027, 0, 1, 1]]) {
    const at = new Date(y, m, d, h);
    out.push(`shower ${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}T${String(h).padStart(2, '0')}:00 ${showerNight(at) ? 1 : 0}`);
  }
  // the days' showers of rain and the rainbows after them, every hour of 120 days
  for (let i = 0; i < 120 * 24; i++) {
    const at = new Date(2026, 2, 1, i);
    const iso = `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}T${String(at.getHours()).padStart(2, '0')}:00`;
    out.push(`rain ${iso} ${rainAt(at) ? 1 : 0} ${rainbowAt(at) ? 1 : 0}`);
  }
}

/** Writes stable-herd.txt, stable-weather.txt and stable-ambient.txt; returns what it wrote, for the log. */
export function stableFixtures (dir: string): string {
  const herd: string[] = [];
  for (const s of SCENARIOS) scenario(s, herd);
  writeFileSync(`${dir}/stable-herd.txt`, herd.join('\n') + '\n');
  const w: string[] = [];
  weather(w);
  writeFileSync(`${dir}/stable-weather.txt`, w.join('\n') + '\n');
  const a: string[] = [];
  ambient(a);
  writeFileSync(`${dir}/stable-ambient.txt`, a.join('\n') + '\n');
  return `${SCENARIOS.length} herds (${SCENARIOS.reduce((n, s) => n + s.ticks, 0)} ticks), 7 weathers, 9 sceneries' critters`;
}
