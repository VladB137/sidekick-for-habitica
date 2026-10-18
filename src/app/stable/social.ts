/*
 * Who gets on with whom in a playground (thread "Pets together", Vlad 2026-10-15): each pair of creatures has at
 * most one bond, and each creature a temperament, both read from what Habitica already says about them, never
 * grown by petting or time. The herd (src/playground/creatures.ts) only acts on the result, and the live wallpaper
 * gets the same result with each creature, so these tables live here and nowhere else.
 *
 *   family     a pet and the mount with the same key: Habitica turns a pet into its mount and lets you hatch it
 *              again only then (ops/feed.js evolve, ops/hatch.js), so the mount is its grown-up
 *   kin        the same species, or species Habitica keeps apart that are one animal (Lion Cub and Lion)
 *   friend     two creatures left without family or kin here, paired up in a seeded order, so friendships are
 *              mutual and a newcomer only changes one when it outscores it
 *   cousin     in one of Habitica's animal families (its set achievements: Polar Pro, Rodent Ruler…)
 *   alike      hatched with the same potion (Base aside, which nearly everything starts as)
 *
 * Temperament comes from Habitica's own word for the egg ("a loyal" Wolf, "a perfidious" Otter, src/data/items.json
 * eggWords): close ones seek company often and stand near, aloof ones keep to themselves, mischief makers start games.
 *
 * Signature pairs are the handful of species that make a moment people recognise together (a Cat and Yarn, a
 * sheepdog and its sheep, a Dragon guarding an Egg, penguins single file…): they are friends whatever else, and
 * the herd gets what each one does (Resident.lead, guard, orbit, pounce, flock, fold, meet, elder, bold).
 */
import { hashSeed } from '../../playground/rng';
import type { Bond, BondKind, Resident, Temper } from '../../playground/creatures';
import { spriteMeta } from '../../stable/sprites';
import { ITEMS } from '../model';
import { keyOf, kindOf, type CreatureId } from './picks';

/** Habitica's words, by temperament; anything else is 'usual'. */
const WORDS: Record<Exclude<Temper, 'usual'>, string[]> = {
  close: ['sociable', 'friendly', 'loyal', 'snuggly', 'cuddly', 'gentle', 'trusting', 'giddy', 'happy', 'sweet', 'little', 'woolly', 'chipper', 'peaceful'],
  aloof: ['proud', 'regal', 'fierce', 'ferocious', 'perfidious', 'wily', 'cunning', 'prickly', 'spiky', 'armored', 'wise', 'perfectionist'],
  mischief: ['mischievous', 'chaotic', 'ravenous', 'tricky', 'clever', 'lively', 'whimsical'],
};

/** Species with no egg of their own (one-off pets) speak through their cub's. */
const EGG_OF: Record<string, string> = { Bear: 'BearCub', Lion: 'LionCub', Tiger: 'TigerCub' };

/** One animal under two or three species names. */
const ONE_ANIMAL: string[][] = [['Lion', 'LionCub'], ['Tiger', 'TigerCub'], ['Bear', 'BearCub'], ['Bunny', 'Jackalope'], ['Horse', 'Unicorn'], ['Gryphon', 'Hippogriff', 'Gryphatrice']];
/** Habitica's families too broad to mean much (twelve zodiac signs; every bird counted as a dinosaur). */
const BROAD = ['zodiacZookeeper', 'dinosaurDynasty'];

/* ---- signature pairs (thread "Pets together", Vlad 2026-10-15) */
/** always friends when together: Habitica's Rough Rider set, the slow club ("slow but steady", "peaceful", the
 * joke "speedy" Sloth), a Treeling and its Squirrel, a Dragon and an Egg, a Cat and Yarn, a bee and a butterfly */
const SIGNATURE = [['Hedgehog', 'Cactus', 'Rock'], ['Snail', 'Turtle', 'Sloth'], ['Treeling', 'Squirrel'], ['Dragon', 'Egg'], ['Cat', 'Yarn'], ['MagicalBee', 'Butterfly']];
/** walk in a line by day, each behind the one before: penguins, the dinosaur gang (Reptacular Rumble's), the slow club */
const TRAINS = [['Penguin'], ['TRex', 'Velociraptor', 'Triceratops', 'Pterodactyl'], ['Snail', 'Turtle', 'Sloth']];
/** Habitica's Cats set and the Cat: one big family, greeting each other first (kin) */
const CATS = ['Cat', 'Cheetah', 'LionCub', 'Lion', 'Sabretooth', 'TigerCub', 'Tiger'];
/** the sea creatures, who meet at the pond, and the flyers that meet over the flowers */
const SEA = ['Octopus', 'Cuttlefish', 'Seahorse', 'Nudibranch', 'SeaSerpent', 'MantisShrimp', 'Axolotl', 'Dolphin', 'Orca', 'Whale'];
const BLOOM = ['MagicalBee', 'Butterfly'];
/** sheepdogs */
const DOGS = ['Wolf', 'Dog'];
/** Habitica's words for the ones that face a boss */
const BOLD = ['brave', 'mighty', 'fierce', 'ferocious'];
const together = (a: string, b: string) => SIGNATURE.some(g => g.indexOf(a) >= 0 && g.indexOf(b) >= 0 && a !== b);

/* Built on first use, with plain loops: this module can load before src/app/polyfills.ts on an old WebView. */
let tables: { temper: Map<string, Temper>, animal: Map<string, string>, families: Set<string>[], polar: Set<string> } | undefined;
function T () {
  if (tables) return tables;
  const temper = new Map<string, Temper>(), animal = new Map<string, string>(), families: Set<string>[] = [], polar = new Set<string>();
  for (const t of Object.keys(WORDS) as (keyof typeof WORDS)[]) for (const w of WORDS[t]) temper.set(w, t);
  for (const g of ONE_ANIMAL) for (const s of g) animal.set(s, g[0]);
  const sets = ITEMS.animalSets || {};
  for (const k of Object.keys(sets)) if (BROAD.indexOf(k) < 0) families.push(new Set(sets[k]));
  for (const s of sets.polarPro || []) polar.add(s);
  return (tables = { temper, animal, families, polar });
}
const animal = (species: string) => T().animal.get(species) ?? species;

/** Habitica's word for its egg, as written: 'a loyal', 'woolen'; undefined when it has none. */
export function eggWord (species: string): string | undefined {
  return ITEMS.eggWords?.[EGG_OF[species] ?? species];
}

export function temperOf (species: string): Temper {
  const w = eggWord(species);
  return (w && T().temper.get(w.replace(/^(a|an) /, ''))) || 'usual';
}

interface Who { id: CreatureId, kind: 'pet' | 'mount', key: string, species: string, potion: string }
const whoOf = (id: CreatureId): Who | undefined => {
  const kind = kindOf(id), m = spriteMeta(kind, keyOf(id));
  return m && { id, kind, key: m.key, species: m.species, potion: m.potion };
};

/** The bond between two, family and kin first; undefined when none. ('friend' is handed out by socialOf.) */
export function bondOf (a: Who, b: Who): Exclude<BondKind, 'friend'> | undefined {
  if (a.key === b.key && a.kind !== b.kind) return 'family';
  if (animal(a.species) === animal(b.species)) return 'kin';
  if (CATS.indexOf(a.species) >= 0 && CATS.indexOf(b.species) >= 0) return 'kin';
  if (T().families.some(f => f.has(a.species) && f.has(b.species))) return 'cousin';
  if (a.potion === b.potion && a.potion !== 'Base') return 'alike';
  return undefined;
}

/** How strongly a bond pulls: which friend a creature walks to, and which greet with hearts. */
export const BOND_RANK: Record<BondKind, number> = { family: 0, kin: 1, friend: 2, cousin: 3, alike: 4 };

/** One of Habitica's Polar Pro animals (Wolf, Fox, Penguin, Whale, Bear): at home in the snow. */
export const coldOf = (species: string) => T().polar.has(EGG_OF[species] ?? species);

/** Everyone's temperament and bonds in one playground, by creature id. */
export function socialOf (ids: readonly CreatureId[]): Map<CreatureId, { temper: Temper, bonds: Bond[] }> {
  const who = ids.map(whoOf).filter((w): w is Who => !!w);
  const out = new Map(who.map(w => [w.id, { temper: temperOf(w.species), bonds: [] as Bond[] }]));
  const close = new Set<CreatureId>();
  const add = (a: Who, b: Who, kind: BondKind) => { out.get(a.id)!.bonds.push({ id: b.id, kind }); out.get(b.id)!.bonds.push({ id: a.id, kind }); };
  const loose: [number, Who, Who][] = [];
  const sig = (a: Who, b: Who) => together(a.species, b.species);
  for (let i = 0; i < who.length; i++) for (let j = i + 1; j < who.length; j++) {
    const a = who[i], b = who[j], k = bondOf(a, b);
    if (k === 'family' || k === 'kin') { add(a, b, k); close.add(a.id); close.add(b.id); } else if (sig(a, b)) { add(a, b, 'friend'); close.add(a.id); close.add(b.id); }
  }
  for (let i = 0; i < who.length; i++) for (let j = i + 1; j < who.length; j++) {
    const a = who[i], b = who[j], k = bondOf(a, b);
    if (k === 'family' || k === 'kin' || sig(a, b)) continue;
    if (!close.has(a.id) && !close.has(b.id)) loose.push([hashSeed(a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`), a, b]);
    else if (k) add(a, b, k);
  }
  // friends: the best-scoring pairs among those with no family or kin here, each creature in one pair at most
  loose.sort((x, y) => y[0] - x[0] || (x[1].id + x[2].id < y[1].id + y[2].id ? -1 : 1));
  const paired = new Set<CreatureId>();
  for (const [, a, b] of loose) {
    if (!paired.has(a.id) && !paired.has(b.id)) { paired.add(a.id); paired.add(b.id); add(a, b, 'friend'); continue; }
    const k = bondOf(a, b);
    if (k) add(a, b, k);
  }
  // the elders: everyone walks over to a Veteran now and then, bonded or not
  for (const v of who) if (v.potion === 'Veteran') for (const o of who) if (o !== v && !out.get(o.id)!.bonds.some(b => b.id === v.id)) add(o, v, 'cousin');
  for (const s of out.values()) s.bonds.sort((x, y) => BOND_RANK[x.kind] - BOND_RANK[y.kind]);
  return out;
}

/** What each signature creature does here (only fields that apply), by creature id. */
export function signaturesOf (ids: readonly CreatureId[]): Map<CreatureId, Partial<Resident>> {
  const who = ids.map(whoOf).filter((w): w is Who => !!w), out = new Map<CreatureId, Partial<Resident>>();
  const put = (w: Who, x: Partial<Resident>) => out.set(w.id, { ...out.get(w.id), ...x });
  const pets = who.filter(w => w.kind === 'pet'), of = (sp: string[]) => pets.filter(w => sp.indexOf(w.species) >= 0);
  // trains: each behind the one before (pets only: a mount in a pet's footsteps would trample it)
  for (const t of TRAINS) { const line = of(t); for (let i = 1; i < line.length; i++) if (!out.get(line[i].id)?.lead) put(line[i], { lead: line[i - 1].id }); }
  const egg = of(['Egg'])[0], treeling = who.find(w => w.species === 'Treeling'), yarn = of(['Yarn'])[0];
  for (const w of who) {
    if (w.species === 'Dragon' && egg) put(w, { guard: egg.id });
    if (w.kind === 'pet' && w.species === 'Squirrel' && treeling) put(w, { orbit: treeling.id });
    if (w.kind === 'pet' && w.species === 'Cat' && yarn) put(w, { pounce: yarn.id });
  }
  const sheep = of(['Sheep']), dogs = of(DOGS);
  if (sheep.length >= 2 && dogs.length) {
    for (const d of dogs) put(d, { flock: sheep.map(s => s.id) });
    for (const s of sheep) put(s, { fold: sheep.filter(o => o !== s).map(o => o.id) });
  }
  const sea = who.filter(w => SEA.indexOf(w.species) >= 0), bloom = who.filter(w => BLOOM.indexOf(w.species) >= 0);
  if (sea.length >= 2) for (const w of sea) put(w, { meet: 'pond' });
  if (bloom.length >= 2) for (const w of bloom) put(w, { meet: 'flowers' });
  for (const w of who) {
    const word = eggWord(w.species)?.replace(/^(a|an) /, '');
    if (w.potion === 'Veteran') put(w, { elder: true, bold: true });
    else if (word && BOLD.indexOf(word) >= 0) put(w, { bold: true });
  }
  return out;
}

/** The residents with their temperament and bonds filled in. */
export function withSocial (rs: readonly Resident[]): Resident[] {
  const ids = rs.map(r => r.id), s = socialOf(ids), sig = signaturesOf(ids);
  return rs.map(r => { const x = s.get(r.id); return x ? { ...r, temper: x.temper, bonds: x.bonds, ...(coldOf(r.species) ? { cold: true } : {}), ...sig.get(r.id) } : r; });
}

/**
 * The creature sheet's line about it: Habitica's word for it, and its strongest bond here.
 * "A loyal Wolf · its grown-up, Ruby, lives here", "A sociable Rat · best friends with Pip", "Woolen Yarn".
 */
export function aboutLine (id: CreatureId, here: readonly CreatureId[], name: (id: CreatureId) => string, species: (id: CreatureId) => string): string {
  const me = whoOf(id);
  if (!me) return '';
  const word = eggWord(me.species);
  const who = word ? `${word[0].toUpperCase()}${word.slice(1)} ${species(id)}` : '';
  const b = socialOf(here.includes(id) ? here : [...here, id]).get(id)?.bonds[0];
  const with_ = !b ? ''
    : b.kind === 'family' ? (me.kind === 'pet' ? `its grown-up, ${name(b.id)}, lives here` : `its little one, ${name(b.id)}, lives here`)
      : b.kind === 'friend' ? `best friends with ${name(b.id)}`
        : b.kind === 'kin' ? `keeps close to ${name(b.id)}`
          : '';
  if (!who) return with_ ? `${with_[0].toUpperCase()}${with_.slice(1)}` : '';
  return with_ ? `${who} · ${with_}` : who;
}
