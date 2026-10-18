/*
 * A pet or mount as a picture outside the Stable's canvas: the Stable's picker and residents row, Settings'
 * talking-character chooser, Now's meadow header. The sheets ship with the app (public/stable/), so this makes no
 * request of its own.
 */
import { h } from './dom';
import { spriteMeta } from '../../stable/sprites';
import { ITEMS } from '../model';
import { keyOf, kindOf, type CreatureId } from '../stable/picks';

/**
 * A creature drawn from its bundled sheet at a whole number of device pixels per art pixel, fitting a box of
 * `box` CSS px: an <img> per layer, clipped to one cell (a mount's head row over its body row), lazily loaded.
 */
export function creaturePic (id: CreatureId, box: number): HTMLElement {
  const m = spriteMeta(kindOf(id), keyOf(id));
  const wrap = h('span', { class: 'cpic', 'aria-hidden': 'true' });
  if (!m) return wrap;
  const dpr = window.devicePixelRatio || 1;
  const n = Math.max(1, Math.floor(box * dpr * 3 / Math.max(m.w, m.h)));
  const k = n / 3 / dpr;
  wrap.style.width = `${m.w * k}px`; wrap.style.height = `${m.h * k}px`;
  for (let layer = 0; layer < m.layers; layer++) {
    wrap.appendChild(h('img', {
      src: m.url, alt: '', loading: 'lazy', decoding: 'async', draggable: false,
      style: `top:${-layer * m.h * k}px;width:${m.frames * m.w * k}px;height:${m.layers * m.h * k}px`,
    }));
  }
  return wrap;
}

/** a picker group's heading: the egg's name, or what it grows into on the Mounts tab (Tiger Cub → Tiger) */
export const speciesName = (species: string, kind: 'pet' | 'mount') => (kind === 'mount' ? ITEMS.eggs[species]?.[3] : undefined) || ITEMS.eggs[species]?.[0] || species;
