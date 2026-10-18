/* The barn's stalls (barn.ts): every mount the account has, in the order and families of Habitica's own stable
 * page. Pure, so it is tested without a browser. */
import { ITEMS } from '../model';
import { idOf, known, type CreatureId, type StableItems } from './picks';

/** Habitica's stable groups its mounts this way */
export const FAMILIES = ['Standard', 'Magic Potion', 'Quest', 'Special'] as const;
export type Family = typeof FAMILIES[number];

export function familyOf (key: string): Family {
  if (ITEMS.specialMounts[key]) return 'Special';
  const [egg, potion] = key.split('-');
  if (ITEMS.eggs[egg]?.[2] === 'quest') return 'Quest';
  return ITEMS.hatchingPotions[potion]?.[2] === 'drop' ? 'Standard' : ITEMS.eggs[egg] ? 'Magic Potion' : 'Special';
}

const EGGS = Object.keys(ITEMS.eggs), POTIONS = Object.keys(ITEMS.hatchingPotions), SPECIAL = Object.keys(ITEMS.specialMounts);
const at = (list: string[], k: string) => { const i = list.indexOf(k); return i < 0 ? list.length : i; };

/** Every mount the account has that the Stable can draw, in Habitica's stable order: family, egg, potion. */
export function barnMounts (items: StableItems | undefined): CreatureId[] {
  const keys = Object.entries(items?.mounts ?? {}).filter(([k, v]) => v === true && known(idOf('mount', k))).map(([k]) => k);
  const order = (k: string) => {
    const f = familyOf(k), [egg, potion] = k.split('-');
    return [FAMILIES.indexOf(f), f === 'Special' ? at(SPECIAL, k) : at(EGGS, egg), f === 'Special' ? 0 : at(POTIONS, potion)];
  };
  return keys.map(k => ({ k, o: order(k) }))
    .sort((a, b) => a.o[0] - b.o[0] || a.o[1] - b.o[1] || a.o[2] - b.o[2] || a.k.localeCompare(b.k))
    .map(({ k }) => idOf('mount', k));
}
