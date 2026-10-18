/* The early riser (Rooster): to bed at 20:00, home from 18:30, up at 5:00, an hour before everyone else. */
import type { Trait } from './types';

export const EARLY: Trait = { id: 'early', schedule: { sleep: [20, 5], home: [18.5, 5] } };
