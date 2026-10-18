/* P9, the ball by species (package B; app only, the wallpaper has no ball): what it does when it reaches the
 * ball, or anything else that rolls, after a flick. The herd's ball play (src/playground/ballplay.ts) runs them;
 * everyone else bumps it back as before.
 *
 *   Dog      fetches: carries it back to where it was flicked from and puts it down
 *   Beetle   pushes it along in front of it, like a dung beetle
 *   Cat      crouches, wiggles, and pounces on it, then bats it away
 *   Dolphin  when it lies in the water, comes and bounces it on its nose, then flips it back to the grass */
import type { Trait } from './types';

export const FETCH: Trait = { id: 'fetch', ball: 'fetch' };
export const PUSH_BALL: Trait = { id: 'pushBall', ball: 'push' };
export const POUNCE: Trait = { id: 'pounce', ball: 'pounce' };
export const NOSE_BALL: Trait = { id: 'noseBall', ball: 'nose' };
