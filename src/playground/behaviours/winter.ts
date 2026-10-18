/* Winter. Snow lovers (Habitica's Polar Pro: the polar Bear cub, Fox, Penguin, Whale, Wolf; and the Mammoth and
 * Sabretooth) are livelier when snow lies (half the rest, a quarter quicker) and bound about in it now and then.
 * Winter sleepers (Bear cub, Bear, Panda cub) take long naps by the stable on winter days. */
import type { Trait } from './types';

export const SNOW_LOVER: Trait = {
  id: 'snowLover',
  moods: [{ when: { winter: true }, rest: 0.5, speed: 1.25 }],
  acts: [{
    id: 'snowBound', when: { winter: true },
    script: [{ n: 1, sq: -1 }, { n: 2, lift: 2 }, { n: 2, lift: 4 }, { n: 3, lift: 5 }, { n: 2, lift: 4 }, { n: 2, lift: 2 }, { n: 2, sq: 1 }, { n: 4 }],
    loops: [2, 3],
  }],
};

export const WINTER_NAP: Trait = {
  id: 'winterNap',
  schedule: { naps: [{ when: { winter: true, hours: [10, 17] }, cycle: 3600, on: 2700 }] },
  likes: [{ at: 'door', p: 0.7, when: { winter: true, hours: [6, 19] } }],
};
