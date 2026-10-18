/* Time of day and season, from the phone's clock and calendar only (no request, no location): night from
 * 21:00 to 06:00 with dusk and dawn either side, seasons by month, flipped south of the equator; and the
 * day's shower, from the date alone, so every phone agrees. */
import { Rng } from '../rng';

export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** dawn 06:00-08:00, day 08:00-19:00, dusk 19:00-21:00, night 21:00-06:00 (local time) */
export function timeOfDay (d: Date): TimeOfDay {
  const h = d.getHours();
  if (h >= 21 || h < 6) return 'night';
  if (h < 8) return 'dawn';
  if (h >= 19) return 'dusk';
  return 'day';
}

const NORTH: Season[] = ['winter', 'winter', 'spring', 'spring', 'spring', 'summer', 'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter'];
const FLIP: Record<Season, Season> = { winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring' };

/** meteorological seasons: winter is Dec-Feb in the north, Jun-Aug in the south */
export function seasonOf (d: Date, southern = false): Season {
  const s = NORTH[d.getMonth()];
  return southern ? FLIP[s] : s;
}

/** Southern hemisphere from the phone's region (navigator.language's country), when it says so; else north. */
export function southernRegion (lang = typeof navigator === 'undefined' ? '' : navigator.language): boolean {
  const region = /[-_]([A-Za-z]{2})\b/.exec(lang)?.[1]?.toUpperCase() ?? '';
  return SOUTH.has(region);
}
// countries wholly or mostly south of the equator
const SOUTH = new Set(['AR', 'AU', 'BO', 'BR', 'BW', 'CL', 'FJ', 'LS', 'MG', 'MU', 'MW', 'MZ', 'NA', 'NZ', 'PE', 'PY', 'SZ', 'TO', 'UY', 'WS', 'ZA', 'ZM', 'ZW']);

/** the moon's eight shapes: 0 new, 1 waxing crescent, 2 first quarter, 3 waxing gibbous, 4 full, 5 waning
 * gibbous, 6 last quarter, 7 waning crescent */
export type MoonPhase = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
export const MOON_NAMES = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'] as const;

/** the mean synodic month (days) and a new moon it counts from: 2000-01-06 18:14 UTC (Meeus, Astronomical
 * Algorithms ch. 49, k = 0) */
const SYNODIC = 29.530588853, NEW_MOON_2000 = Date.UTC(2000, 0, 6, 18, 14);

/** Where the moon is in its month, 0 (new) to 1 (new again), from the date alone: the mean phase, within
 * about 15 hours of the true one, which is well inside one of the eight shapes (3.7 days each). */
export function moonAge (d: Date): number {
  const days = (d.getTime() - NEW_MOON_2000) / 86_400_000;
  return (((days / SYNODIC) % 1) + 1) % 1;
}

/** The shape the moon has on this date (the nearest of eight). */
export const moonPhase = (d: Date): MoonPhase => (Math.round(moonAge(d) * 8) % 8) as MoonPhase;

/** The day's shower, from the date alone: about one day in three has one, starting on the hour between 07:00 and
 * 17:00 and lasting 1 to 3 hours (local time); null for a dry day. */
export function showerOf (d: Date): { from: number, to: number } | null {
  const r = new Rng(`rain:${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`);
  if (!r.chance(1 / 3)) return null;
  const from = r.int(7, 17);
  return { from, to: from + r.int(1, 3) };
}

/** It is raining now (where it can rain at all: ambient.ts lifeOf's bow). */
export const rainAt = (d: Date) => { const s = showerOf(d), h = d.getHours(); return !!s && h >= s.from && h < s.to; };
/** A rainbow, for the hour after a shower that ends before dusk. */
export const rainbowAt = (d: Date) => { const s = showerOf(d); return !!s && s.to < 19 && d.getHours() === s.to; };
