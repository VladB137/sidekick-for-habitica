import { h, icon, ripple } from '../ui/dom';
import { openToyBox, stableReady } from '../stable/host';
import { setStableFull } from '../nav';
import { store } from '../store';
import { moonPhase, paintSceneCanvas, seasonOf, southernRegion, timeOfDay, type SceneId } from '../../playground/scenes';
import { grownFor, openDailies } from '../stable/growth';
import { today } from '../stable/calendar';

/**
 * The Stable: a stage the playground draws into (see stable/host.ts), the full-screen switch, the toy box beside it
 * (shown once a playground is there), and in full screen what the hidden app bar must not take with it: a way back
 * and a live crit. Nothing here talks to Habitica.
 */
export function stableView (full: boolean, crit: string | null): HTMLElement {
  return h('section', { class: 'stable', 'data-k': 'stable', 'aria-label': 'Stable' },
    // data-own: once on screen, re-renders leave the stage and everything in it alone
    h('div', { id: 'stable-stage', class: 'stable-stage', 'data-own': '' }, stableReady() ? null : emptyState()),
    // full screen's own way out, where the app bar's would be (Back does the same): to wherever full screen was opened from
    full ? ripple(h('button', {
      class: 'stable-exit', type: 'button', 'data-k': 'stable-exit', 'aria-label': 'Back', title: 'Back',
      on: { click: () => setStableFull(false) },
    }, icon('arrow_back'))) : null,
    full && crit ? ripple(h('button', {
      class: 'stable-crit', type: 'button', 'data-k': 'stable-crit', 'aria-label': `${crit}. Leave full screen`,
      on: { click: () => setStableFull(false) },
    }, icon('bolt'), crit)) : null,
    ripple(h('button', {
      class: 'stable-toys', type: 'button', 'data-k': 'stable-toys', 'aria-label': 'Toy box', title: 'Toy box',
      on: { click: () => openToyBox() },
    }, icon('sports_baseball'))),
    ripple(h('button', {
      class: 'stable-full', type: 'button', 'data-k': 'stable-full',
      'aria-label': full ? 'Leave full screen' : 'Full screen', title: full ? 'Leave full screen' : 'Full screen',
      on: { click: () => setStableFull(!full) },
    }, icon(full ? 'fullscreen_exit' : 'fullscreen'))),
  );
}

function emptyState (): HTMLElement {
  return h('div', { class: 'stable-empty' },
    icon('pets', 'stable-empty-icon'),
    h('h2', { class: 'stable-empty-title' }, 'Your Stable is on its way'),
    h('p', null, 'Your pets and mounts will live here, in a meadow that grows with your Habitica account.'));
}

/** the intro's meadow in art pixels (16:9); shown at 3 x, like the playground, and scaled to its box */
const THUMB = { w: 96, h: 54 };
let thumb = { key: '', url: '' };
let warnedKey = '';
/** The scene painted once per scene, size, hour-of-day, season, morning haze and growth, kept as an image; no frame loop. */
export function scenePicture (scene: SceneId, art = THUMB): string {
  const now = new Date();
  const open = openDailies(store.tasks) > 0, growth = grownFor(store.snap?.userId, store.raw, store.tasks);
  const { feasts, years } = today(store.raw, now);
  const key = `${scene}|${art.w}x${art.h}|${timeOfDay(now)}|${seasonOf(now, southernRegion())}|${moonPhase(now)}|${open}|${JSON.stringify(growth)}|${feasts.join(',')}:${years}`;
  if (thumb.key === key) return thumb.url;
  try {
    const { canvas } = paintSceneCanvas(art.w, art.h, { scene, growth, dailiesDone: !open, now: () => now, feasts, years });
    const out = document.createElement('canvas');
    out.width = art.w; out.height = art.h;
    out.getContext('2d')!.drawImage(canvas, 0, 0);
    thumb = { key, url: out.toDataURL('image/png') };
  } catch (e) {
    // not cached, so the next redraw tries again; warned once per hour/season key
    if (warnedKey !== key) { warnedKey = key; console.warn('Intro: the meadow picture failed', e); }
    return '';
  }
  return thumb.url;
}
