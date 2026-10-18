/*
 * The Stable widget on Android's home screen: a still picture of the open playground that opens the Stable
 * when tapped. Widgets can't run the canvas, so the app paints the pictures (stable/still.ts, one per light of
 * the day) and hands them to the phone, which shows the one for the hour (StableWidget.java). Only while a
 * Stable widget is on the home screen and the login is remembered; nothing here talks to Habitica.
 *
 * A picture is painted again only when something it shows changed: the playground, who lives there and where,
 * what has grown, whether today's Dailies are done, the season, the moon's shape, Habitica's feast days and
 * April Fools. The phone keeps the key of what it has, so a restart doesn't repaint for nothing. Checked after each read and when the app goes to the background (the
 * moment after the player rearranged the Stable).
 */
import { native } from '../native';
import { store } from '../store';
import { moonPhase, seasonOf, southernRegion } from '../../playground/scenes/clock';
import { currentOf, followHabitica, loadStable, owned, reconcile, type StableItems } from './picks';
import { grownFor, openDailies } from './growth';
import { today } from './calendar';

/** bumped when the pictures change for the same inputs (a new look), so phones repaint */
const VERSION = 4;

let placed = false;
/** what the phone has (or is being sent) */
let have = '';
let painting = false;
let again = false;

/** What the picture would show now, or undefined when there is nothing to show (the wallpaper shows the same). */
export function wanted () {
  const uid = store.snap?.userId;
  if (!uid || !store.raw || !store.remember) return undefined;
  const items = store.raw.items as StableItems | undefined;
  const state = reconcile(followHabitica(loadStable(uid), items), owned(items), items).state;
  const pg = currentOf(state);
  const growth = grownFor(uid, store.raw, store.tasks), dailiesDone = openDailies(store.tasks) === 0;
  const now = new Date(), season = seasonOf(now, southernRegion()), moon = moonPhase(now);
  // Habitica's feast days and April Fools' joke pets (stable/calendar.ts)
  const cal = today(store.raw, now);
  const key = JSON.stringify([VERSION, uid, pg.id, pg.scene, pg.residents, growth, dailiesDone, season, moon, cal]);
  return { uid, pg, growth, dailiesDone, season, moon, cal, key };
}

async function update () {
  if (!placed) return;
  const w = wanted();
  if (!w || w.key === have) return;
  if (painting) { again = true; return; }
  painting = true;
  try {
    const [{ paintStills }, { residentsFor }] = await Promise.all([import('./still'), import('./playground')]);
    const residents = residentsFor(w.pg.residents, w.cal.swap);
    const pics = await paintStills({
      seed: `stable:${w.uid}:${w.pg.id}`, herdSeed: `stable:${w.pg.id}`,
      scene: w.pg.scene, growth: w.growth, dailiesDone: w.dailiesDone, season: w.season, moon: w.moon, residents, feasts: w.cal.feasts, years: w.cal.years,
    });
    // logged out or switched account meanwhile: not this one's
    if (store.snap?.userId !== w.uid || !store.remember) return;
    // kept or refused, not tried again for the same picture (a refusal would otherwise repaint on every read)
    await native.setStablePicture({ key: w.key, ...pics });
    have = w.key;
  } catch (e) {
    have = w.key;
    console.warn('Stable widget: the picture failed', e);
  } finally {
    painting = false;
    if (again) { again = false; void update(); }
  }
}

/** Ask the phone whether a Stable widget is placed (and what it shows), then paint if needed. */
async function check () {
  const s = await native.stableWidget();
  placed = !!s?.placed;
  have = s?.key ?? '';
  void update();
}

export function watchStableWidget () {
  if (!native.available) return;
  store.on(() => { void update(); });
  // a widget was just put on the home screen while the app runs
  native.onStableWidget(() => { void check(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void update(); else void check(); });
  void check();
}
