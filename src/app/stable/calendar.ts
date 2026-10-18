/*
 * Habitica's calendar for the Stable: which of Habitica's feast days is on (its repeating events, copied from its
 * code by npm run gen:data into src/data/items.json, so the daily version watch follows any date Habitica moves),
 * the account's own anniversary in Habitica, and April Fools' pet swap.
 *
 * Each event covers the same calendar days as in Habitica, kept on the phone's own calendar, midnight to midnight
 * (Vlad, 2026-10-15): Habitica's dates are instants in US Eastern time with its day starting at 04:00
 * (website/common/script/content/constants/events.js at the tag), so Habitoween's 30 Oct 04:00 to 1 Nov 23:59 is
 * 30 October to 1 November here, whatever the phone's time zone. tests/calendar.test.ts checks every day of three
 * years against Habitica's own getRepeatingEvents at midday in New York. The anniversary is the phone's calendar day too.
 *
 * April Fools is Habitica's joke as its own site plays it (content/constants/aprilFools.js, and the client's
 * mixins/foolPet.js and components/avatar.vue at the tag): every pet shows as the year's joke potion; mounts stay.
 *
 * Pure: give it the date.
 */
import itemsJson from '../../data/items.json';
import type { Feast } from '../../playground/scenes/feasts';

const items = itemsJson as unknown as {
  events: Record<string, [string, string]>;
  eggs: Record<string, [string, number, 'drop' | 'quest', string?]>;
  specialPets: Record<string, string>;
};

type Day = [month: number, day: number];
/** The calendar days a yearly event (dated 1970) covers in Habitica's own time, first and last ([month 0-11, day]).
 * Its start is 04:00 Eastern (08:00 or 09:00 UTC) on the first day, its end 03:59 on the day after the last
 * (07:59 or 08:59 UTC) or 23:59 on the last (03:59 UTC after it): 8 hours before the start, and 9 before the end, fall
 * on those days in UTC under either offset. Undefined for a one-off event (a sale with its own year). */
export function eventDays ([s, e]: [string, string]): [Day, Day] | undefined {
  const a = new Date(Date.parse(s) - 8 * 3600_000), b = new Date(Date.parse(e) - 9 * 3600_000);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || new Date(s).getUTCFullYear() !== 1970) return undefined;
  return [[a.getUTCMonth(), a.getUTCDate()], [b.getUTCMonth(), b.getUTCDate()]];
}

/** Habitica's yearly events on the phone's calendar day of now, by key ('habitoween'). */
export function habiticaEvents (now: Date, table: Record<string, [string, string]> = items.events): string[] {
  const today = now.getMonth() * 100 + now.getDate(), on: string[] = [];
  for (const [key, ends] of Object.entries(table)) {
    const days = eventDays(ends);
    if (!days) continue;
    const from = days[0][0] * 100 + days[0][1], to = days[1][0] * 100 + days[1][1];
    // New Year's runs over the turn of the year
    if (from <= to ? today >= from && today <= to : today >= from || today <= to) on.push(key);
  }
  return on;
}

/** Habitica's events the Stable decorates for (the rest are sales). */
const DECORATED: Record<string, Feast> = {
  nye: 'nye', birthday: 'birthday', valentines: 'valentines', piDay: 'piDay', namingDay: 'namingDay', habitoween: 'habitoween', harvestFeast: 'harvestFeast',
};

/** Whole years in Habitica on the phone's calendar day the account was made, else 0 (also before the first year is up). */
export function anniversary (now: Date, created: unknown): number {
  const c = typeof created === 'string' || typeof created === 'number' ? new Date(created) : undefined;
  if (!c || Number.isNaN(c.getTime())) return 0;
  const years = now.getFullYear() - c.getFullYear();
  if (years < 1) return 0;
  let m = c.getMonth(), d = c.getDate();
  // a 29 February account has its day on the 28th in other years
  if (m === 1 && d === 29 && new Date(now.getFullYear(), 1, 29).getMonth() !== 1) d = 28;
  return now.getMonth() === m && now.getDate() === d ? years : 0;
}

/** The feasts the playground shows now, and the years for the anniversary's cake. */
export function feastsOn (now: Date, created?: unknown): { feasts: Feast[], years: number } {
  const feasts = habiticaEvents(now).flatMap(k => (DECORATED[k] ? [DECORATED[k]] : []));
  const years = anniversary(now, created);
  if (years) feasts.push('anniversary');
  return { feasts, years };
}

/** Habitica's joke potions in turn from 2020 (aprilFools.js SWAPS): 2026 Alien, 2027 Veggie. */
export const SWAPS = ['Veggie', 'Dessert', 'VirtualPet', 'TeaShop', 'Fungi', 'Cryptid', 'Alien'] as const;

/** The joke potion while Habitica's April Fools is on, else undefined. */
export function foolsSwap (now: Date): string | undefined {
  if (!habiticaEvents(now).includes('aprilFools')) return undefined;
  return SWAPS[(((now.getFullYear() - 2020) % SWAPS.length) + SWAPS.length) % SWAPS.length];
}

/**
 * The pet Habitica shows on April Fools in place of this one (a pet key, 'Wolf-Base'; none = the avatar without a pet):
 * a special pet is a Dragon of the joke potion, a drop egg's pet keeps its species, a quest egg's is a Bear Cub, and
 * anything else a Dragon; no pet is a Wolf (makeSubstitutionMap and foolPet).
 */
export function foolPet (pet: string | undefined, swap: string): string {
  if (!pet) return `Wolf-${swap}`;
  if (items.specialPets[pet] !== undefined) return `Dragon-${swap}`;
  const egg = items.eggs[pet.slice(0, pet.indexOf('-'))];
  if (pet.includes('-') && egg) return egg[2] === 'drop' ? `${pet.slice(0, pet.indexOf('-'))}-${swap}` : `BearCub-${swap}`;
  return `Dragon-${swap}`;
}

/** Habitica's own name for a joke potion ('Veggie' is "Garden"). */
export const potionName = (swap: string): string => ((itemsJson as any).hatchingPotions?.[swap]?.[0] as string | undefined) ?? swap;

/** What the Stable shows today for this account (the user object as read): Habitica's feasts, the anniversary, April Fools. */
export interface Today { feasts: Feast[], years: number, swap?: string }
export function today (raw: unknown, now = new Date()): Today {
  const created = (raw as { auth?: { timestamps?: { created?: unknown } } } | undefined)?.auth?.timestamps?.created;
  const { feasts, years } = feastsOn(now, created);
  const swap = foolsSwap(now);
  return swap ? { feasts, years, swap } : { feasts, years };
}
