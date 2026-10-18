/**
 * Each Habitica creature's nature in the Stable (thread "Behaviours by species", Vlad 2026-10-15: every
 * behaviour in the species list): which behaviour modules
 * (src/playground/behaviours, one trait each) it has, looked up like gaits.ts: the exact key over the potion over
 * the species, merged per axis (types.ts Trait), plus Habitica's own animal families.
 *
 * natureOf() resolves it into plain data (a Nature) that goes to the herd on the Resident and to the live wallpaper
 * with the creature's picture, so the Java herd keeps no table of its own.
 *
 * Built in packages (the coordinator's split): F the foundation (schedules, pace, the guard, places, particles),
 * W water, T trees/sky/flowers, G ground/light/night details, B ball and touch (app only), R turns. Each package
 * adds its traits to the lists below. The potion level is an empty slot until Vlad picks the potion behaviours
 * (thread "Behaviours by hatching potion").
 */
import { traitById, type Mood, type Nature, type Pace, type Schedule, type Trait } from '../playground';
import { DAY } from '../playground/behaviours/runner';

/** Habitica's animal sets at the tag in src/engine/rules.ts (content/constants/animalSetAchievements.js), and our
 * own groups for species in none of the habitat sets. */
export const FAMILIES: Readonly<Record<string, readonly string[]>> = {
  legendaryBestiary: ['Dragon', 'FlyingPig', 'Gryphon', 'SeaSerpent', 'Unicorn'],
  birdsOfAFeather: ['FlyingPig', 'Owl', 'Parrot', 'Pterodactyl', 'Gryphon', 'Falcon', 'Rooster', 'Peacock'],
  bonelessBoss: ['Beetle', 'Butterfly', 'Cuttlefish', 'Nudibranch', 'Octopus', 'Snail', 'Spider'],
  cats: ['Cheetah', 'LionCub', 'Sabretooth', 'TigerCub'],
  dinosaurDynasty: ['Falcon', 'Owl', 'Parrot', 'Peacock', 'Penguin', 'Rooster', 'Pterodactyl', 'TRex', 'Triceratops', 'Velociraptor'],
  domesticated: ['Ferret', 'GuineaPig', 'Rooster', 'FlyingPig', 'Rat', 'Bunny', 'Horse', 'Cow'],
  duneBuddy: ['Armadillo', 'Cactus', 'Fox', 'Frog', 'Snake', 'Spider'],
  plantParent: ['Cactus', 'Treeling'],
  polarPro: ['BearCub', 'Fox', 'Penguin', 'Whale', 'Wolf'],
  reptacularRumble: ['Alligator', 'Pterodactyl', 'Snake', 'Triceratops', 'TRex', 'Turtle', 'Velociraptor'],
  rodentRuler: ['Rat', 'GuineaPig', 'Squirrel'],
  roughRider: ['Cactus', 'Hedgehog', 'Rock'],
  woodlandWizard: ['Badger', 'BearCub', 'Deer', 'Fox', 'Frog', 'Hedgehog', 'Owl', 'Snail', 'Squirrel', 'Treeling'],
  zodiacZookeeper: ['Rat', 'Cow', 'Bunny', 'Snake', 'Horse', 'Sheep', 'Monkey', 'Rooster', 'Wolf', 'TigerCub', 'FlyingPig', 'Dragon'],
  // ours
  sea: ['Dolphin', 'Orca', 'Whale', 'Seahorse', 'Octopus', 'Cuttlefish', 'Nudibranch', 'SeaSerpent', 'MantisShrimp'],
  amphibious: ['Otter', 'Platypus', 'Penguin', 'Turtle', 'Frog', 'TigerCub', 'Tiger', 'Hippo', 'Alligator', 'Axolotl'],
  grazers: ['Horse', 'Unicorn', 'Deer', 'Cow', 'Sheep', 'Alpaca', 'Mammoth', 'Triceratops'],
};

/**
 * Every Habitica species and its traits. An empty list lives by the herd's usual ways (wandering, company, home at
 * dusk, asleep from 21:00 to 6:00); the packages after F fill in their rows.
 */
export const SPECIES_TRAITS: Readonly<Record<string, readonly string[]>> = {
  Alligator: ['bask', 'lurk'], Alpaca: ['graze'], Armadillo: ['night', 'roller'], Axolotl: ['sea'],
  Badger: ['night', 'dig'], Bear: ['winterNap', 'fishing'], BearCub: ['winterNap', 'fishing'], Beetle: ['pushBall'],
  Bunny: ['homebody', 'shy', 'burrow'], Butterfly: ['flowers'], Cactus: ['sunlover'], Cat: ['twilight', 'pounce'],
  Chameleon: ['bask'], Cheetah: ['sprint'], Cow: ['homebody', 'graze', 'moo'], Crab: ['sideways'],
  Cuttlefish: ['ink', 'sea'], Deer: ['shy', 'graze'], Dog: ['fetch'], Dolphin: ['noseBall', 'sea', 'breach'],
  Dragon: ['flame'], Egg: ['wobble'], Falcon: ['swoop'], Ferret: ['homebody', 'warDance'], FlyingPig: ['homebody', 'flutter'],
  Fox: ['twilight', 'snowLover', 'mousing'], Frog: ['night', 'swim', 'lily'], Giraffe: ['browse'],
  Gryphatrice: ['perch'], Gryphon: ['perch'], GuineaPig: ['homebody', 'popcorn'],
  Hedgehog: ['night', 'roller', 'curl'], Hippo: ['lurk'], Hippogriff: ['perch'], Horse: ['homebody', 'graze'],
  JackOLantern: ['night', 'lantern'], Jackalope: ['bounds'], Kangaroo: ['bounds'], Lion: ['lounge'],
  LionCub: ['lounge'], MagicalBee: ['pollen'], Mammoth: ['snowLover', 'graze'], MantisShrimp: ['sea'],
  Monkey: ['monkeyClimb'], Nudibranch: ['sea'], Octopus: ['night', 'ink', 'sea'], Orca: ['sea', 'breach'],
  Otter: ['float', 'swim'], Owl: ['night', 'owlPerch'], PandaCub: ['winterNap', 'bamboo'], Parrot: ['parrotPerch'], Peacock: [],
  Penguin: ['snowLover', 'bellySlide', 'swim'], Phoenix: ['embers', 'sail'], Platypus: ['swim'], Pterodactyl: ['soar'],
  Raccoon: ['night', 'rummage'], Rat: ['night', 'homebody', 'scurry'], Robot: ['robot'], Rock: ['rock', 'stony'],
  Rooster: ['early', 'crow', 'homebody'], Sabretooth: ['snowLover'], SeaSerpent: ['sea'], Seahorse: ['sea'],
  Sheep: ['graze'], Slime: ['splat'], Sloth: ['longSleeper', 'crawl', 'hang'], Snail: ['night', 'slime'],
  Snake: ['bask'], Spider: ['night', 'thread'], Squirrel: ['climb'], TRex: ['stomp'], Tiger: ['swim'],
  TigerCub: ['swim'], Treeling: ['rustle', 'treeling'], Triceratops: ['graze'], Turkey: [], Turtle: ['bask', 'swim'],
  Unicorn: ['graze', 'sparkle'], Velociraptor: ['night', 'dash'], Whale: ['snowLover', 'sea', 'spout'],
  Wolf: ['snowLover', 'howl'], Yarn: ['rolls'],
};

/** Hatching potions' traits: an empty slot until Vlad picks (thread "Behaviours by hatching potion"). */
export const POTION_TRAITS: Readonly<Record<string, readonly string[]>> = {};

/** Single creatures unlike their species: traits added, and the species' traits taken away. */
export const KEY_TRAITS: Readonly<Record<string, { add?: readonly string[], remove?: readonly string[] }>> = {
  // the Cerberus pup keeps the underworld's hours
  'Wolf-Cerberus': { add: ['night'], remove: ['snowLover'] },
  // the polar Bear cub loves the snow and the water instead of sleeping through winter
  'BearCub-Polar': { add: ['snowLover', 'swim'], remove: ['winterNap'] },
};

/** Mounts unlike their species' pets (mounts are separate drawings): traits added for every mount of the species,
 * before the potion's and its own. The Dragon pets are wingless babies (Fairy, Cupid and Vampire wait on the potion
 * choices); the Dragon mounts have wings and fly. */
export const MOUNT_TRAITS: Readonly<Record<string, readonly string[]>> = {
  Dragon: ['sail'],
};

let families: Map<string, string[]> | null = null;
/** the families a species belongs to, Habitica's sets first */
export function familiesOf (species: string): readonly string[] {
  if (!families) {
    families = new Map();
    for (const f in FAMILIES) for (const sp of FAMILIES[f]) { const l = families.get(sp) ?? []; l.push(f); families.set(sp, l); }
  }
  return families.get(species) ?? [];
}

/** a creature's trait ids, most general first: species (and a mount's), then potion, then its own */
export function traitsOf (key: string, kind: 'pet' | 'mount' = 'pet'): string[] {
  const [species, potion] = key.split('-');
  const own = KEY_TRAITS[key];
  const ids = [...(SPECIES_TRAITS[species] ?? []), ...(kind === 'mount' ? MOUNT_TRAITS[species] ?? [] : []), ...(POTION_TRAITS[potion] ?? []), ...(own?.add ?? [])];
  return ids.filter((id, i) => ids.indexOf(id) === i && !own?.remove?.includes(id));
}

/** Merge traits, later ones winning per axis: schedule hours and each pace field replaced, naps, moods, likes and
 * acts added up, `drop` taking acts away. */
export function merge (ts: readonly Trait[]): Omit<Nature, 'traits' | 'families'> {
  const schedule: { -readonly [K in keyof Schedule]: Schedule[K] } = { sleep: DAY.sleep, home: DAY.home, naps: [] };
  const pace: Pace = { speed: 1, rest: 1 };
  const moods: Mood[] = [];
  const out: Omit<Nature, 'traits' | 'families'> = { schedule, pace, moods, likes: [], acts: [] };
  for (const t of ts) {
    if (t.schedule?.sleep) schedule.sleep = t.schedule.sleep;
    if (t.schedule?.home) schedule.home = t.schedule.home;
    if (t.schedule?.naps) schedule.naps = [...schedule.naps!, ...t.schedule.naps];
    Object.assign(pace, t.pace);
    if (t.moods) moods.push(...t.moods);
    if (t.likes) out.likes = [...out.likes, ...t.likes];
    if (t.acts) out.acts = [...out.acts.filter(a => !t.acts!.some(b => b.id === a.id)), ...t.acts];
    if (t.drop) out.acts = out.acts.filter(a => !t.drop!.includes(a.id));
    if (t.still) out.still = t.still;
    if (t.glow) out.glow = t.glow;
    if (t.touch) out.touch = { ...out.touch, ...t.touch };
    if (t.ball) out.ball = t.ball;
  }
  return out;
}

/** A creature's resolved nature, by its kind and key ('Wolf-Base'); mounts share their species' ways, plus MOUNT_TRAITS. */
export function natureOf (kind: 'pet' | 'mount', key: string): Nature {
  const ids = traitsOf(key, kind);
  const ts = ids.map(id => traitById(id)).filter((t): t is Trait => !!t);
  return { traits: ts.map(t => t.id), families: familiesOf(key.split('-')[0]), ...merge(ts) };
}
