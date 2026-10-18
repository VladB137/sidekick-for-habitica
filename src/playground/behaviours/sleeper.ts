/* The long sleeper (Sloth): naps most of the day (about three minutes of every four) and crawls at a third of
 * the speed when awake, in small nudges. */
import type { Trait } from './types';

export const LONG_SLEEPER: Trait = {
  id: 'longSleeper',
  schedule: { naps: [{ when: { hours: [6, 21] }, cycle: 3000, on: 2200 }] },
};

export const CRAWL: Trait = { id: 'crawl', pace: { motion: 'scoot', speed: 1 / 3 } };
