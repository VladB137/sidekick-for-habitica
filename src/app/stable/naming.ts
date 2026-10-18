/* Giving creatures their names (names.ts says how names work): the list and the order it's offered in. In the
 * Stable's own chunk, so the list (src/data/pet-names.json) loads only with the Stable. */
import bank from '../../data/pet-names.json';
import { Rng } from '../../playground/rng';
import { MAX_NAME, type NameRec, type Names } from './names';
import { idOf, keyOf, kindOf, type CreatureId, type StableState } from './picks';

const BANK = bank as { potions: Record<string, string[]>, eggs: Record<string, string[]>, anyone: string[] };

const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase();

/** The names the list offers a creature, best first, in this account's order: its egg's and potion's, then anyone's. */
export function candidates (id: CreatureId, seed: string): string[] {
  const key = keyOf(id), i = key.indexOf('-');
  const egg = key.slice(0, i), potion = key.slice(i + 1);
  const rng = new Rng(`${seed}:${id}`);
  const shuffle = (xs: string[]) => {
    const a = [...xs];
    for (let j = a.length - 1; j > 0; j--) { const k = rng.int(0, j); [a[j], a[k]] = [a[k], a[j]]; }
    return a;
  };
  const own = shuffle([...new Set([...(BANK.eggs[egg] ?? []), ...(BANK.potions[potion] ?? [])])]);
  return [...new Set([...own, ...shuffle(BANK.anyone)])];
}

/** Everyone living in a playground, in the order they live there. */
export const residentIds = (s: StableState): CreatureId[] => s.playgrounds.flatMap(p => p.residents.map(r => r.id));

/**
 * Name everyone in a playground who has no name yet. `owned`: the pets the account has now (to tell whether a
 * mount's pet grew up into it). Returns the same object when nothing changed, and who got a new name.
 */
export function assign (names: Names, ids: readonly CreatureId[], seed: string, today: string, petsOwned?: (key: string) => boolean): { names: Names, given: CreatureId[] } {
  const missing = ids.filter(id => !names[id]);
  if (!missing.length) return { names, given: [] };
  const out: Record<CreatureId, NameRec> = { ...names };
  const used = new Set(Object.values(out).map(r => fold(r.name)).filter(Boolean));
  const given: CreatureId[] = [];
  for (const id of missing) {
    const key = keyOf(id);
    if (kindOf(id) === 'mount') {
      // a pet raised into this mount: the mount keeps its name (and its days)
      const pet = idOf('pet', key), was = out[pet];
      if (was && !petsOwned?.(key)) { out[id] = was; delete out[pet]; continue; }
    } else {
      const big = out[idOf('mount', key)]?.name;
      const little = big ? `Little ${big}` : '';
      if (little && [...little].length <= MAX_NAME && !used.has(fold(little))) {
        out[id] = { name: little, since: today }; used.add(fold(little)); given.push(id); continue;
      }
    }
    let name = candidates(id, seed).find(n => !used.has(fold(n)));
    // more creatures than names (never with 70 in playgrounds and 800 names): number them
    for (let n = 2; !name; n++) { const c = `${BANK.anyone[0]} ${n}`; if (!used.has(fold(c))) name = c; }
    out[id] = { name, since: today };
    used.add(fold(name));
    given.push(id);
  }
  return { names: out, given };
}

