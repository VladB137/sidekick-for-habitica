/*
 * Trophies (Stable idea 7): Habitica's collection achievements, and how far the account is from each one,
 * counted the way Habitica counts when it awards them (v5.51.0: ops/hatch.js for the colour pets, the species
 * sets and Bone to Pick, ops/feed.js for the colour mounts, models/user/hooks.js and count.js for Beast
 * Master, Mount Master and Triad Bingo). Halfway there, a signpost stands where the trophy will (Vlad,
 * 15 Oct). Pure: reads only the user object the app already has.
 */
import itemsJson from '../../data/items.json';
import { PROP_OF, TROPHY_KEYS } from '../../playground/scenes/trophies';

type Json = any;

interface AchievementData {
  dropEggs: string[]; questEggs: string[]; dropPotions: string[];
  colours: [potion: string, pet: string, mount: string][];
  sets: Record<string, [type: 'pet' | 'petMount', species: string[]]>;
  petSets: [potion: string, key: string][];
  names: Record<string, [name: string, text: string]>;
}
const A = (itemsJson as unknown as { achievements: AchievementData }).achievements;

/** Habitica's name and line for an achievement: ['Polar Pro', 'Has hatched all standard colors of Polar pets: ...'] */
export const trophyName = (key: string): [string, string] => A.names[key] ?? [key, ''];
/** what stands in the playground for it: 'an igloo' */
export const trophyProp = (key: string): string => PROP_OF[key] ?? 'a trophy';

/** how far an achievement is: have of need, and what is counted ('Base pets') */
export interface Progress { key: string, have: number, need: number, what: string }

const potionName = (p: string) => p.replace(/([a-z])([A-Z])/g, '$1 $2');

/** Each trophy's progress, in the trophies' order (pennants, sets, masters). */
export function progressAll (raw: Json): Progress[] {
  const pets: Record<string, number> = raw?.items?.pets ?? {}, mounts: Record<string, unknown> = raw?.items?.mounts ?? {};
  const count = (keys: string[], ok: (k: string) => boolean) => keys.filter(ok).length;
  const combos = (species: string[], potions: string[]) => species.flatMap(s => potions.map(p => `${s}-${p}`));
  const out: Progress[] = [];
  for (const [potion, pet, mount] of A.colours) {
    const keys = A.dropEggs.map(e => `${e}-${potion}`);
    out.push({ key: pet, have: count(keys, k => pets[k] > 0), need: keys.length, what: `${potionName(potion)} pets` });
    out.push({ key: mount, have: count(keys, k => !!mounts[k]), need: keys.length, what: `${potionName(potion)} mounts` });
  }
  for (const [key, [type, species]] of Object.entries(A.sets)) {
    const keys = combos(species, A.dropPotions);
    // hatch.js: a pet counts unless missing or raised to a mount (-1)
    const p = count(keys, k => !!pets[k] && pets[k] !== -1);
    out.push(type === 'petMount'
      ? { key, have: p + count(keys, k => !!mounts[k]), need: keys.length * 2, what: 'pets and mounts' }
      : { key, have: p, need: keys.length, what: 'pets' });
  }
  for (const [potion, key] of A.petSets) {
    const keys = [...A.dropEggs, ...A.questEggs].map(e => `${e}-${potion}`);
    out.push({ key, have: count(keys, k => pets[k] > 0), need: keys.length, what: `${potionName(potion)} pets` });
  }
  const drop = combos(A.dropEggs, A.dropPotions);
  out.push({ key: 'beastMaster', have: count(drop, k => pets[k] > 0 || pets[k] === -1), need: drop.length, what: 'pets' });
  out.push({ key: 'mountMaster', have: count(drop, k => !!mounts[k]), need: drop.length, what: 'mounts' });
  out.push({ key: 'triadBingo', have: count(drop, k => pets[k] > 0) + count(drop, k => !!mounts[k]), need: drop.length * 2, what: 'pets and mounts' });
  return out;
}

/** The achievements earned (Habitica's booleans) and the ones halfway there but not earned. */
export function trophiesOf (raw: Json): { trophies: string[], signs: string[] } {
  const ach = raw?.achievements ?? {};
  const trophies = TROPHY_KEYS.filter(k => ach[k] === true);
  const have = new Set(trophies);
  const signs = progressAll(raw).filter(p => !have.has(p.key) && p.need > 0 && p.have * 2 >= p.need).map(p => p.key);
  return { trophies, signs };
}

/** the earned and halfway sets in the trophies' own order, from any order */
export const inOrder = (keys: Iterable<string>) => { const s = new Set(keys); return TROPHY_KEYS.filter(k => s.has(k)); };
