/**
 * Pets outside the Stable (brainstorm B2): a small, still picture of one of the player's own pets for quiet moments
 * (offline, every Daily done). The sheets ship with the app (public/stable/), so this makes no request of its own.
 */
import { h } from './dom';
import { spriteMeta } from '../../stable/sprites';

interface PetItems { currentPet?: string, pets?: Record<string, number> }

/** The pet out now, else the first pet the player has hatched, else none (the app never shows a pet they don't have). */
export function companion (items: PetItems | undefined): string | undefined {
  const cur = items?.currentPet;
  if (cur && spriteMeta('pet', cur)) return cur;
  return Object.keys(items?.pets ?? {}).sort().find(k => (items!.pets![k] ?? 0) > 0 && spriteMeta('pet', k));
}

/** The pet's first frame at one CSS pixel per image pixel (an art pixel is 3), or null for an unknown key. */
export function petPicture (key: string | undefined, cls = ''): HTMLElement | null {
  const m = key ? spriteMeta('pet', key) : undefined;
  if (!m) return null;
  return h('span', {
    class: `pet-pic ${cls}`.trim(), 'aria-hidden': 'true', 'data-k': `pet-${m.key}`,
    style: `width:${m.w}px;height:${m.h}px;background-image:url("${m.url}")`,
  });
}
