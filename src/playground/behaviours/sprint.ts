/* Sprinters. The Cheetah now and then runs a long walk at two and a half times the speed, puffing dust; the
 * Velociraptor (a night hunter) dashes short and quick; the Rat scurries, in short quick dashes with short
 * rests. */
import type { Emit, Trait } from './types';

const dust: Emit = { kind: 'dust', at: 'back', life: 9, side: -1 };

export const SPRINT: Trait = { id: 'sprint', pace: { sprint: { p: 0.3, mul: 2.5, range: [60, 110], every: 4, fx: dust } } };

export const DASH: Trait = { id: 'dash', pace: { sprint: { p: 0.5, mul: 2.2, range: [12, 40], every: 5, fx: dust } } };

export const SCURRY: Trait = { id: 'scurry', pace: { range: [8, 26], rest: 0.6, sprint: { p: 0.7, mul: 2, range: [8, 26] } } };
