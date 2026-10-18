/*
 * Feeding and hatching plan: which pets the food you hold raises into mounts, and which
 * eggs and potions to hatch. Rules from website/common/script/ops/feed.js and ops/hatch.js:
 *  - a pet's favourite food (food.target = its potion) adds 5, any other food 2; magic-potion
 *    (premium) pets like every food; it becomes a mount at 50 (hatching starts it at 5);
 *  - special and wacky pets can't be fed; a Saddle raises any pet at once;
 *  - magic and wacky potions only hatch drop eggs; a pet still growing can't be hatched again.
 * `hatch` picks one pet per egg and potion you hold; `byEgg` lists every pet each egg can become.
 * Advice only: feeding and hatching stay a tap in Habitica.
 */

export interface StableCatalogue {
  /** food key → the potion whose pets love it ('' = none) */
  foodTarget: Record<string, string>
  eggKind: Record<string, 'drop' | 'quest'>
  potionKind: Record<string, 'drop' | 'premium' | 'wacky'>
}

export interface StableHoldings {
  /** growth by "Egg-Potion": > 0 growing, -1 raised into a mount */
  pets: Record<string, number>
  mounts: Record<string, boolean>
  food: Record<string, number>
  eggs: Record<string, number>
  hatchingPotions: Record<string, number>
}

export interface FeedStep { food: string, count: number }
export interface PetFeed {
  pet: string
  growth: number
  /** magic potion pet: every food counts as its favourite */
  magic: boolean
  /** favourite foods to give now, from what you hold */
  steps: FeedStep[]
  /** the steps raise it into a mount */
  ready: boolean
  /** favourite feeds still missing after the steps */
  short: number
  /** foods it likes (empty for magic pets: all of them) */
  likes: string[]
  /** feeds of food nobody in your stable needs (+2 each) that would finish it instead; 0 = not enough of those either */
  otherFeeds: number
}
export interface HatchOption {
  egg: string
  potion: string
  pet: string
  /** also gives a mount to raise (no mount yet, and not a wacky pet) */
  mount: boolean
  /** after the plan's feeding, you hold enough favourite food to raise the new pet too */
  foodReady: boolean
}
export interface HatchChoice extends HatchOption {
  /** the plan's `hatch` list hatches this one */
  planned: boolean
  /** potions of this kind you hold */
  potions: number
}
export interface HatchEgg {
  egg: string
  /** eggs of this kind you hold */
  count: number
  /** every pet this egg hatches with a potion you hold: the plan's picks first, then new pets with a mount to raise, then the rest */
  pets: HatchChoice[]
}
export interface FeedingPlan {
  /** pets the food you hold raises into mounts, fewest feeds first */
  raise: PetFeed[]
  /** pets still growing that your food can't finish yet */
  growing: PetFeed[]
  /** what to hatch with the eggs and potions you hold, most useful first; each unit used once */
  hatch: HatchOption[]
  /** every egg you hold that hatches something, with every pet it can become; eggs the plan uses first */
  byEgg: HatchEgg[]
  saddles: number
}

/** Favourite feeds from `growth` to a mount: feed.js turns the pet into a mount once growth reaches 50. */
export const feedsToMount = (growth: number, perFeed = 5): number => Math.max(0, Math.ceil((50 - growth) / perFeed));

const split = (key: string): [string, string] => { const i = key.indexOf('-'); return [key.slice(0, i), key.slice(i + 1)]; };

export function feedingPlan (st: StableHoldings, cat: StableCatalogue): FeedingPlan {
  const left: Record<string, number> = {};
  for (const [k, n] of Object.entries(st.food)) if (k !== 'Saddle' && k in cat.foodTarget && n > 0) left[k] = Math.floor(n);
  // smallest stacks first, so plenty of each kind stays (and stays sellable)
  const take = (foods: string[], want: number): FeedStep[] => {
    const steps: FeedStep[] = [];
    for (const f of foods.slice().sort((a, b) => left[a] - left[b] || (a < b ? -1 : 1))) {
      if (want <= 0) break;
      const n = Math.min(want, left[f] || 0);
      if (n > 0) { steps.push({ food: f, count: n }); left[f] -= n; want -= n; }
    }
    return steps;
  };

  const feedable: PetFeed[] = [];
  for (const [pet, growth] of Object.entries(st.pets)) {
    if (!(growth > 0) || st.mounts[pet]) continue;
    const [egg, potion] = split(pet);
    const pk = cat.potionKind[potion];
    // quest eggs only hatch with drop potions: any other pairing is a special pet; special and wacky pets can't be fed
    if (!(egg in cat.eggKind) || !pk || pk === 'wacky' || (cat.eggKind[egg] !== 'drop' && pk !== 'drop')) continue;
    const magic = pk === 'premium';
    const likes = magic ? [] : Object.keys(cat.foodTarget).filter(f => cat.foodTarget[f] === potion);
    feedable.push({ pet, growth, magic, steps: [], ready: false, short: feedsToMount(growth), likes, otherFeeds: 0 });
  }
  const order = (a: PetFeed, b: PetFeed) => a.short - b.short || (a.pet < b.pet ? -1 : 1);
  // favourite food first, pet by pet with the fewest feeds to go: that raises the most mounts from a shared pile
  for (const p of feedable.filter(x => !x.magic).sort(order)) {
    const pool = p.likes.filter(f => (left[f] || 0) > 0);
    const have = pool.reduce((n, f) => n + left[f], 0);
    if (!have) continue;
    p.steps = take(pool, p.short);
    p.short -= p.steps.reduce((n, s) => n + s.count, 0);
  }
  // magic pets eat anything at +5: they get what the others don't need
  for (const p of feedable.filter(x => x.magic).sort(order)) {
    p.steps = take(Object.keys(left), p.short);
    p.short -= p.steps.reduce((n, s) => n + s.count, 0);
  }
  for (const p of feedable) p.ready = p.short === 0;
  // food nobody needs now, at +2 a feed, for the pets still short
  let spare = Object.values(left).reduce((a, b) => a + b, 0);
  for (const p of feedable.filter(x => !x.ready).sort(order)) {
    const growthAfter = p.growth + 5 * p.steps.reduce((n, s) => n + s.count, 0);
    const need = feedsToMount(growthAfter, 2);
    if (need <= spare) { p.otherFeeds = need; spare -= need; }
  }

  // hatching: every egg × potion pairing you hold, a new pet and mount before a pet you raised already
  const eggs: Record<string, number> = {}; const pots: Record<string, number> = {};
  for (const [k, n] of Object.entries(st.eggs)) if (k in cat.eggKind && n > 0) eggs[k] = Math.floor(n);
  for (const [k, n] of Object.entries(st.hatchingPotions)) if (k in cat.potionKind && n > 0) pots[k] = Math.floor(n);
  const eggsHeld = Object.assign({}, eggs); const potsHeld = Object.assign({}, pots);
  const options: HatchOption[] = [];
  for (const egg of Object.keys(eggs)) {
    for (const potion of Object.keys(pots)) {
      const pk = cat.potionKind[potion];
      if (pk !== 'drop' && cat.eggKind[egg] !== 'drop') continue;
      const pet = `${egg}-${potion}`;
      if ((st.pets[pet] || 0) > 0) continue;
      const mount = pk !== 'wacky' && !st.mounts[pet];
      options.push({ egg, potion, pet, mount, foodReady: false });
    }
  }
  // scarce kinds first, so one pairing doesn't use up the only potion another egg could take
  // (the pairings sharing its egg or its potion, itself once: each egg and potion pair once), counted once each
  const perEgg: Record<string, number> = {}; const perPotion: Record<string, number> = {};
  for (const o of options) { perEgg[o.egg] = (perEgg[o.egg] || 0) + 1; perPotion[o.potion] = (perPotion[o.potion] || 0) + 1; }
  const ways = new Map(options.map(o => [o, perEgg[o.egg] + perPotion[o.potion] - 1]));
  options.sort((a, b) => Number(b.mount) - Number(a.mount) || ways.get(a)! - ways.get(b)! || (a.pet < b.pet ? -1 : 1));
  const hatch: HatchOption[] = [];
  const ownedOrPlanned = new Set<string>();
  for (const o of options) {
    if (!eggs[o.egg] || !pots[o.potion] || ownedOrPlanned.has(o.pet)) continue;
    eggs[o.egg] -= 1; pots[o.potion] -= 1; ownedOrPlanned.add(o.pet);
    if (o.mount) {
      const pk = cat.potionKind[o.potion];
      const foods = pk === 'premium' ? Object.keys(left) : Object.keys(left).filter(f => cat.foodTarget[f] === o.potion);
      const need = feedsToMount(5);
      if (foods.reduce((n, f) => n + left[f], 0) >= need) { o.foodReady = true; take(foods, need); }
    }
    hatch.push(o);
  }
  hatch.sort((a, b) => Number(b.mount) - Number(a.mount) || Number(b.foodReady) - Number(a.foodReady));

  // every pairing, egg by egg: the plan picks one pet per egg and potion, the player may want another
  const wacky = (o: HatchOption) => cat.potionKind[o.potion] === 'wacky';
  const byEgg: HatchEgg[] = [];
  const hatchAt = new Map<string, number>(); const eggAt = new Map<string, number>();
  hatch.forEach((o, i) => { if (!hatchAt.has(o.pet)) hatchAt.set(o.pet, i); if (!eggAt.has(o.egg)) eggAt.set(o.egg, i); });
  const plannedSet = new Set(hatch);
  for (const egg of Object.keys(eggsHeld)) {
    const pets: HatchChoice[] = options.filter(o => o.egg === egg).map(o => {
      const planned = plannedSet.has(o);
      return { egg, potion: o.potion, pet: o.pet, mount: o.mount, foodReady: planned && o.foodReady, planned, potions: potsHeld[o.potion] };
    });
    if (!pets.length) continue;
    const at = (c: HatchChoice) => hatchAt.get(c.pet) ?? hatch.length;
    pets.sort((a, b) => at(a) - at(b) || Number(b.mount) - Number(a.mount) || Number(wacky(a)) - Number(wacky(b)) || (a.potion < b.potion ? -1 : 1));
    byEgg.push({ egg, count: eggsHeld[egg], pets });
  }
  const first = (e: HatchEgg) => eggAt.get(e.egg) ?? hatch.length;
  byEgg.sort((a, b) => first(a) - first(b) || (a.egg < b.egg ? -1 : 1));

  const raise = feedable.filter(p => p.ready).sort((a, b) => a.steps.reduce((n, s) => n + s.count, 0) - b.steps.reduce((n, s) => n + s.count, 0) || (a.pet < b.pet ? -1 : 1));
  const growing = feedable.filter(p => !p.ready).sort(order);
  return { raise, growing, hatch, byEgg, saddles: Math.max(0, Math.floor(st.food.Saddle || 0)) };
}
