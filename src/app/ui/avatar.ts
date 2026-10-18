import { h, SPRITES } from './dom';
import { avatarLayers, AVATAR_W, AVATAR_H } from '../avatar';
import { foolPet, foolsSwap } from '../stable/calendar';

const missing = new Set<string>();

import type { Json } from '../../api/client';

/**
 * The avatar at `scale` CSS px per Habitica image px, in a box AVATAR_W × AVATAR_H × scale (a mount may reach past
 * its edge, as in Habitica). Each image keeps its natural size; the whole stack is scaled once. Images Habitica
 * doesn't have (an old key) are simply left out. On April Fools the pet is Habitica's joke pet, as Habitica draws it.
 * `mouth`: a mouth that can open (ui/talk.ts), over the skin's own and under everything after it, so a beard, a
 * mask or a visual buff still covers it.
 */
export function avatarView (u: Json, scale = 1, opts: { avatarOnly?: boolean, background?: boolean, k?: string, mouth?: boolean } = {}): HTMLElement {
  // April Fools: the avatar's pet is Habitica's joke pet of the year, as on Habitica's own avatar (avatar.vue petClass)
  const swap = foolsSwap(new Date());
  const layers = avatarLayers(u, swap ? { ...opts, fool: pet => foolPet(pet, swap) } : opts);
  const hasBg = layers.some(l => l.part === 'background');
  return h('div', {
    class: `avatar ${hasBg ? 'with-bg' : ''}`, role: 'img', 'aria-label': 'Your Habitica avatar', 'data-k': opts.k || 'avatar',
    style: `width:${AVATAR_W * scale}px;height:${AVATAR_H * scale}px`,
  }, h('div', { class: 'avatar-stack', style: `width:${AVATAR_W}px;height:${AVATAR_H}px;transform:scale(${scale})` }, layers.map((l, i) => {
    const src = `${SPRITES}${l.file}`;
    const pos = l.bottom ? `left:${l.x}px;bottom:${l.y}px` : `left:${l.x}px;top:${l.y}px`;
    const img = h('img', {
      alt: '', src, referrerpolicy: 'no-referrer', draggable: 'false', 'data-k': `${i}-${l.name}`,
      style: `${pos}${missing.has(src) ? ';visibility:hidden' : ''}`,
      on: { error: (e: Event) => { missing.add(src); (e.currentTarget as HTMLElement).style.visibility = 'hidden'; } },
    });
    if (!opts.mouth || !l.name.startsWith('skin_')) return img;
    return [img, h('i', { class: 'mouth', 'data-k': 'mouth', style: `left:${l.x + MOUTH.x}px;top:${l.y + MOUTH.y}px` })];
  })));
}

/** The mouth on every skin image (90 × 90, 3 px to a pixel of the art): a 2 × 1 line at (54, 51). */
const MOUTH = { x: 54, y: 51 };
