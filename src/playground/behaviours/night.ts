/* Night creatures (Owl, Hedgehog, Raccoon, Badger, Armadillo, Rat, Frog, Spider, Snail, Octopus, JackOLantern,
 * the Cerberus pup, Velociraptor): up and wandering at night while the rest sleep by the stable, never walking
 * home at dusk; by day they doze in short bouts where they are (40 s of every minute) and wake for a tap. */
import type { Trait } from './types';

export const NIGHT: Trait = {
  id: 'night',
  schedule: { sleep: [0, 0], home: [0, 0], naps: [{ when: { hours: [7, 19] }, cycle: 1800, on: 1200 }] },
};
