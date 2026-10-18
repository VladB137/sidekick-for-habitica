import { h, icon, ripple, button } from '../ui/dom';
import { openToyBox, stableReady } from '../stable/host';
import { setStableFull } from '../nav';
import { store } from '../store';
import { moonPhase, paintSceneCanvas, seasonOf, southernRegion, timeOfDay, type SceneId } from '../../playground/scenes';
import { currentOf, followHabitica, loadStable, owned, pgName, reconcile, type Playground, type StableItems } from '../stable/picks';
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

/**
 * The Stable card on Stats: a still picture of the open playground at this hour and season with whoever lives
 * there, and the way in (Back returns). The scene shows at once; the creatures join it as soon as their sheets
 * (bundled with the app) are loaded, painted once like the widget's pictures (stable/still.ts), never animated.
 */
export function stableCard (): HTMLElement {
  const uid = store.snap?.userId, items = store.raw?.items as StableItems | undefined;
  // the same playground the Stable opens on: Habitica's current pet and mount until the player chooses
  const pg = currentOf(reconcile(followHabitica(loadStable(uid), items), owned(items), items).state);
  const n = pg.residents.length;
  const herd = n ? herdPicture(uid, pg) : undefined;
  const pic = herd?.url || scenePicture(pg.scene, CARD_ART);
  return h('div', { class: 'card stable-card', 'data-k': 'stable-card' },
    h('div', { class: 'card-head' }, icon('pets'), h('h2', { class: 'card-title' }, 'Stable')),
    pic ? h('button', { class: 'stable-thumb', type: 'button', 'aria-label': 'Open the Stable', on: { click: () => setStableFull(true) } },
      h('img', {
        src: pic, alt: '', width: String(CARD_ART.w * 3), height: String(CARD_ART.h * 3), 'data-k': 'stable-thumb',
        'data-shown': herd?.url ? String(herd.shown) : '0',
      })) : null,
    h('div', { class: 'card-sub', 'data-k': 'stable-card-sub' }, n
      ? `${pgName(pg)} · ${n === 1 ? '1 creature' : `${n} creatures`}.`
      : 'Your pets and mounts, in playgrounds that grow with your account.'),
    h('div', { class: 'card-actions' },
      button('Open full screen', () => setStableFull(true), { icon: 'fullscreen', k: 'open-stable' })));
}

/** the card's picture in art pixels (16:9): the still's world (stable/still.ts CARD) at 3 image pixels per art pixel */
const CARD_ART = { w: 160, h: 90 };
let herdPic = { key: '', url: '', shown: 0 };
/** the key being painted, and the one the card drawn last asked for */
let painting = '';
let wanted = '';
/**
 * The open playground with its creatures, kept as an image per playground, residents and their spots, light,
 * season, moon, growth and morning haze. The first time for a key it starts painting and returns no url (the card
 * shows the bare scene meanwhile); when done, the card's picture is swapped in place if it still wants that key.
 */
function herdPicture (uid: string | undefined, pg: Playground): { url: string, shown: number } {
  const now = new Date(), tod = timeOfDay(now), season = seasonOf(now, southernRegion()), moon = moonPhase(now);
  const open = openDailies(store.tasks) > 0, growth = grownFor(uid, store.raw, store.tasks);
  // the hour too: who sleeps (creatures.ts: from BEDTIME to MORNING) changes within a light
  const cal = today(store.raw, now);
  const key = JSON.stringify([uid, pg.id, pg.scene, pg.residents, tod, now.getHours(), season, moon, open, growth, cal]);
  wanted = key;
  if (herdPic.key === key) return herdPic;
  if (painting !== key) {
    painting = key;
    void (async () => {
      try {
        const [{ paintCard }, { residentOf }] = await Promise.all([import('../stable/still'), import('../stable/playground')]);
        const residents = pg.residents.map(p => residentOf(p, cal.swap)).filter(r => !!r);
        const { url, shown } = await paintCard({
          seed: `stable:${uid ?? ''}:${pg.id}`, herdSeed: `stable:${pg.id}`,
          scene: pg.scene, growth, dailiesDone: !open, season, moon, tod, now, residents, feasts: cal.feasts, years: cal.years,
        });
        if (painting !== key) return;
        herdPic = { key, url, shown };
        const img = document.querySelector<HTMLImageElement>('img[data-k="stable-thumb"]');
        if (img && wanted === key) { img.src = url; img.dataset.shown = String(shown); }
      } catch (e) {
        // the bare scene stays; tried again when the card is drawn for another key
        console.warn('Stable card: the creatures\' picture failed', e);
      }
    })();
  }
  return { url: '', shown: 0 };
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
    if (warnedKey !== key) { warnedKey = key; console.warn('Stable card: the meadow picture failed', e); }
    return '';
  }
  return thumb.url;
}
