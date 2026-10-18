/*
 * The meadow behind the app bar (look S, "Meadow stage"): the open playground's scene, painted once as a still
 * picture for this season, moon and growth, and kept as a data URL: by day in the light theme, at night in the dark
 * one (the Stable itself follows the clock). No creatures: those live on the Stable screen; the bar shows only your avatar standing in the grass.
 */
import { paintSceneCanvas, type TimeOfDay } from '../../playground/scenes';
import { store } from '../store';
import { grownFor } from '../stable/growth';
import { currentOf, loadStable } from '../stable/picks';

/** art pixels: wide enough for a phone at 3 CSS px each, tall enough for a hero */
const ART = { w: 144, h: 96 };
const cache = new Map<string, string>();

export function darkTheme (): boolean {
  const t = store.settings.theme;
  return t === 'dark' || (t === 'system' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
}

/** The picture as a CSS url(), or 'none' if the canvas can't be painted. */
export function meadowUrl (): string {
  const now = new Date();
  const scene = currentOf(loadStable(store.snap?.userId)).scene;
  const growth = grownFor(store.snap?.userId, store.raw);
  const tod: TimeOfDay = darkTheme() ? 'night' : 'day';
  const key = `${scene}|${tod}|${now.getMonth()}|${now.getDate()}|${JSON.stringify(growth)}`;
  let url = cache.get(key);
  if (url === undefined) {
    try {
      const { canvas } = paintSceneCanvas(ART.w, ART.h, { scene, growth, tod, now: () => now });
      const out = document.createElement('canvas');
      out.width = ART.w; out.height = ART.h;
      out.getContext('2d')!.drawImage(canvas, 0, 0);
      url = out.toDataURL('image/png');
    } catch { url = ''; }
    cache.set(key, url);
  }
  return url ? `url(${url})` : 'none';
}
