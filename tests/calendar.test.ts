/*
 * The Stable's calendar (src/app/stable/calendar.ts) against Habitica's own code at the rules.ts tag: which yearly
 * events are on, day by day over three years on the phone's calendar in time zones either side of Habitica's, against
 * Habitica's getRepeatingEvents (through the harness) at midday in New York, and April Fools' pet for every pet the app bundles (Habitica's substitution map from the
 * harness, read with the client's own foolPet, website/client/src/mixins/foolPet.js). Then the account's
 * anniversary and the feasts the playground gets.
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import spritesJson from '../src/data/sprites.json';
import itemsJson from '../src/data/items.json';
import { avatarLayers } from '../src/app/avatar';
import { SWAPS, anniversary, feastsOn, foolPet, foolsSwap, habiticaEvents } from '../src/app/stable/calendar';

const require = createRequire(import.meta.url);
const H = require('../tools/harness/load.cjs');
const HABITICA = process.env.HABITICA_DIR || resolve(import.meta.dirname ?? __dirname, '../../habitica');

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };

// ---- the events table is Habitica's, and on exactly when Habitica's are
{
  const theirs = H.content.repeatingEvents as Record<string, { start: Date, end: Date }>;
  const ours = (itemsJson as any).events as Record<string, [string, string]>;
  check('events: items.json has every repeating event, with its dates', Object.keys(theirs).length === Object.keys(ours).length
    && Object.entries(theirs).every(([k, e]) => ours[k]?.[0] === e.start.toISOString() && ours[k]?.[1] === e.end.toISOString()), 'run npm run gen:data');
  const zone = process.env.TZ;
  const yearly = Object.keys(ours).filter(k => ours[k][0].startsWith('1970'));
  // Habitica's own answer for a calendar day: its events at midday in New York (13:00 or 12:00 there), hours from any edge
  process.env.TZ = 'America/New_York';
  const habitica = new Map<string, string>();
  for (let t = Date.UTC(2025, 11, 1, 16); t < Date.UTC(2029, 0, 15); t += 86_400_000) {
    const d = new Date(t);
    habitica.set(d.toISOString().slice(0, 10), (H.content.getRepeatingEventsOnDate(d) as { key: string }[]).map(e => e.key).filter(k => yearly.includes(k)).sort().join(','));
  }
  check('events: Habitica\'s own answer has every yearly event in a year', yearly.every(k => [...habitica.values()].some(v => v.split(',').includes(k))), yearly.join(','));
  for (const tz of ['UTC', 'Europe/Bucharest', 'America/New_York', 'America/Los_Angeles', 'Pacific/Auckland']) {
    process.env.TZ = tz;
    const diffs: string[] = [];
    // every day of three years, just after midnight, at midday and just before midnight on the phone's clock
    for (const [day, want] of habitica) {
      const [y, m, dd] = day.split('-').map(Number);
      for (const h of [0, 12, 23]) {
        const got = habiticaEvents(new Date(y, m - 1, dd, h, h === 23 ? 59 : 1)).sort().join(',');
        if (got !== want && diffs.length < 3) diffs.push(`${day} ${h}h: Habitica ${want || '-'}, ours ${got || '-'}`);
      }
    }
    check(`events in ${tz}: the same calendar days as Habitica's, midnight to midnight`, diffs.length === 0, diffs.join('; '));
  }
  process.env.TZ = 'Europe/Bucharest';
  const on = (k: string, y: number, m: number, d: number, h = 12) => habiticaEvents(new Date(y, m - 1, d, h)).includes(k);
  check('events: Habitoween is 30 October to 1 November, from midnight to midnight', !on('habitoween', 2026, 10, 29, 23) && on('habitoween', 2026, 10, 30, 0) && on('habitoween', 2026, 11, 1, 23) && !on('habitoween', 2026, 11, 2, 0));
  check('events: New Year runs over the turn of the year', on('nye', 2026, 12, 28, 0) && on('nye', 2027, 1, 3, 23) && !on('nye', 2027, 1, 4, 0) && !on('nye', 2026, 12, 27, 23));
  check('events: a sale with its own year is never a feast', !habiticaEvents(new Date(2026, 9, 29, 12)).includes('spookyGemSale'));
  if (zone === undefined) delete process.env.TZ; else process.env.TZ = zone;
}

// ---- April Fools, pet by pet, as Habitica's site shows it
{
  const src = readFileSync(`${HABITICA}/website/common/script/content/constants/aprilFools.js`, 'utf8');
  const swaps = [...(/const SWAPS = \[([^\]]*)\]/.exec(src)?.[1] ?? '').matchAll(/'(\w+)'/g)].map(m => m[1]);
  check('fools: the joke potions in Habitica\'s order', swaps.join(',') === SWAPS.join(','), swaps.join(','));
  check('fools: the year counts from 2020', /year - 2020/.test(src));
  const subs = H.content.repeatingEvents.aprilFools.spriteSubstitutions.pets as Record<string, string>;
  const year = new Date().getFullYear(), swap = SWAPS[(year - 2020) % SWAPS.length];
  check(`fools: Habitica's map is ${year}'s ${swap}`, subs.default === `Pet-Dragon-${swap}`, subs.default);
  check('fools: 2026 was Alien, 2027 is Veggie (Garden), on the whole of 1 April', foolsSwap(new Date(2026, 3, 1, 9)) === 'Alien' && foolsSwap(new Date(2027, 3, 1, 0, 5)) === 'Veggie' && foolsSwap(new Date(2033, 3, 1, 23, 55)) === 'Alien');
  check('fools: only on Habitica\'s April Fools', foolsSwap(new Date(2027, 3, 2, 0, 5)) === undefined && foolsSwap(new Date(2027, 2, 31, 23, 55)) === undefined && foolsSwap(new Date(2027, 9, 15, 12)) === undefined);
  void (async () => {
    const mixin = (await import(pathToFileURL(`${HABITICA}/website/client/src/mixins/foolPet.js`).href)).default;
    const theirs = (pet: string) => mixin.methods.foolPet(pet, subs) as string;
    const pets = Object.keys((spritesJson as any).pets);
    const wrong = pets.filter(k => theirs(`Pet-${k}`) !== `Pet-${foolPet(k, swap)}`);
    check(`fools: every bundled pet (${pets.length}) turns into what Habitica shows`, pets.length > 1000 && wrong.length === 0, wrong.slice(0, 5).map(k => `${k}: ${theirs(`Pet-${k}`)} vs ${foolPet(k, swap)}`).join('; '));
    check('fools: no pet out is Habitica\'s Wolf', theirs('Pet-') === `Pet-${foolPet(undefined, swap)}` && theirs('Pet-undefined') !== '');
    const missing = pets.map(k => foolPet(k, swap)).concat(SWAPS.flatMap(s => pets.map(k => foolPet(k, s)))).filter(k => !(spritesJson as any).pets[k]);
    check('fools: every joke pet of every year is bundled', missing.length === 0, [...new Set(missing)].slice(0, 5).join(','));

    // the avatar's pet, as Habitica's avatar.vue shows it
    const petOf = (u: unknown, o = {}) => avatarLayers(u, o).filter(l => l.part === 'pet').map(l => l.name).join(',');
    const fool = (p: string | undefined) => foolPet(p, 'Veggie');
    check('fools: the avatar\'s pet is the joke pet, no pet a Wolf, a quest pet a Bear Cub', petOf({ items: {} }, { fool }) === 'Pet-Wolf-Veggie'
      && petOf({ items: { currentPet: 'Gryphon-Red' } }, { fool }) === 'Pet-BearCub-Veggie' && petOf({ items: { currentPet: 'Fox-Golden' } }, { fool }) === 'Pet-Fox-Veggie');
    check('fools: any other day the avatar keeps its pet, and an avatar alone has none', petOf({ items: { currentPet: 'Fox-Golden' } }) === 'Pet-Fox-Golden' && petOf({ items: {} }) === '' && petOf({ items: {} }, { fool, avatarOnly: true }) === '');

    // ---- the anniversary, on the phone's calendar
    const c = '2023-10-15T09:30:00.000Z';
    check('anniversary: three years to the day', anniversary(new Date(2026, 9, 15, 12), c) === 3);
    check('anniversary: not the day before or after', anniversary(new Date(2026, 9, 14, 12), c) === 0 && anniversary(new Date(2026, 9, 16, 12), c) === 0);
    check('anniversary: not on the day the account was made', anniversary(new Date('2023-10-15T12:00:00Z'), c) === 0);
    check('anniversary: 29 February is the 28th in other years', anniversary(new Date(2025, 1, 28, 12), new Date(2024, 1, 29, 12).toISOString()) === 1 && anniversary(new Date(2028, 1, 29, 12), new Date(2024, 1, 29, 12).toISOString()) === 4 && anniversary(new Date(2028, 1, 28, 12), new Date(2024, 1, 29, 12).toISOString()) === 0);
    check('anniversary: no date, no anniversary', anniversary(new Date(), undefined) === 0 && anniversary(new Date(), 'soon') === 0 && anniversary(new Date(), {}) === 0);

    // ---- what the playground gets
    const f = feastsOn(new Date(2026, 9, 31, 12), c);
    check('feasts: Habitoween, and the spooky gem sale is no feast', f.feasts.join(',') === 'habitoween' && f.years === 0, JSON.stringify(f));
    check('feasts: Habitoween on an anniversary', feastsOn(new Date(2026, 9, 31, 12), new Date(2020, 9, 31, 12).toISOString()).feasts.join(',') === 'habitoween,anniversary');
    check('feasts: April Fools is a swap, not a decoration', feastsOn(new Date(2027, 3, 1, 12)).feasts.length === 0);
    check('feasts: an ordinary day has none', feastsOn(new Date(2026, 5, 10, 12)).feasts.length === 0);

    console.log(`calendar: ${checks - failures}/${checks} passed${failures ? `, ${failures} FAILED` : ''}`);
    process.exit(failures ? 1 : 0);
  })().catch(e => { console.log(`FAIL  ${e}`); process.exit(1); });
}
