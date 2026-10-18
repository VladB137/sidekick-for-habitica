/* Rollers (P6, quarter turns). Yarn is a ball: every walk is a roll, a quarter turn forward every 8 ticks. The
 * Armadillo and the Hedgehog curl up and roll now and then (a walk in three). The Hedgehog also curls up when
 * picked up, held a quarter turn forward (app only: nothing picks creatures up on the wallpaper). */
import type { Trait } from './types';

export const ROLLS: Trait = { id: 'rolls', pace: { roll: { p: 1, every: 8 } } };

export const ROLLER: Trait = { id: 'roller', pace: { roll: { p: 0.35, every: 6 } } };

export const CURL: Trait = { id: 'curl', touch: { hold: { n: 1, rot: 1 } } };
