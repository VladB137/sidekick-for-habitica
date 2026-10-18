/*
 * The Stable as Android's live wallpaper and screen saver: the open playground moving on the home screen, and
 * with a clock while the phone charges. The phone moves the creatures (StableWallpaper.java, StableDream.java,
 * one StableStage each); the app paints what it can't (stable/scenery.ts) and hands it over, one scenery for
 * both, only while the Stable is the wallpaper or the screen saver (or about to be, from Settings) and the login
 * is remembered. Painted again
 * only when something it shows changes: the same things as the widget's pictures, plus the screen's size, the
 * avatar on the ridden mount or on foot by the door, and resting in the Inn. Nothing here talks to Habitica; the phone fetches the rider's images from
 * Habitica's image server (the same files the app shows the avatar with), once per look.
 */
import { native } from '../native';
import { store } from '../store';
import { idOf } from './picks';
import { resting, riderOf, standingOf } from './ride';
import { wanted } from './widget';

/** about this many world pixels across the screen (the Stable's stage shows at least 480) */
const ACROSS = 400;

/**
 * The world for a phone screen (portrait, device pixels): a whole number of device pixels per world pixel,
 * so the art stays sharp, and a whole number of art pixels each way. The bars are a guess at the status bar
 * and the home screen's dock: creatures walk above the dock.
 */
export function worldFor (screen: { w: number, h: number }) {
  const k = Math.max(1, Math.floor(screen.w / ACROSS));
  const art = (v: number) => Math.ceil(Math.ceil(v / k) / 3) * 3;
  const w = art(screen.w), h = art(screen.h);
  return { w, h, insets: { top: Math.round(h * 0.05), bottom: Math.round(h * 0.13) } };
}

/** bumped when the scenery changes for the same inputs (a new look), so phones repaint */
const VERSION = 11;

let set = false;
/** the Settings button asked: paint even though it isn't the wallpaper yet, so Android's preview shows the Stable */
let preparing = false;
let screen = { w: 1080, h: 2400 };
/** what the phone has (or is being sent) */
let have = '';
let running: Promise<void> | undefined;
let again = false;

async function paint () {
  if (!set && !preparing) return;
  const w = wanted();
  if (!w) return;
  const world = worldFor(screen);
  // the avatar on the ridden mount, when that mount lives in this playground
  const r = riderOf(store.raw), rid = r && idOf('mount', r.mount);
  const rider = rid && w.pg.residents.some(p => p.id === rid) ? { id: rid, parts: r!.parts } : undefined;
  // the current pet, when it lives here, walks beside the ridden mount
  const pet: string | undefined = store.raw?.items?.currentPet || undefined, mine = pet ? idOf('pet', pet) : undefined;
  const yours = mine && w.pg.residents.some(p => p.id === mine) ? mine : undefined;
  // else on foot by the door, as in the Stable
  const avatar = rider ? undefined : standingOf(store.raw), rest = resting(store.raw);
  const key = JSON.stringify([VERSION, w.key, world.w, world.h, rider ?? null, yours ?? null, avatar ?? null, rest]);
  if (key === have) return;
  try {
    const [{ paintScenery }, { residentsFor }] = await Promise.all([import('./scenery'), import('./playground')]);
    const residents = residentsFor(w.pg.residents, w.cal.swap);
    const scenery = await paintScenery({
      key, world, seed: `stable:${w.uid}:${w.pg.id}`, herdSeed: `stable:${w.pg.id}`,
      scene: w.pg.scene, growth: w.growth, dailiesDone: w.dailiesDone, season: w.season, moon: w.moon, residents, rider, yours, avatar, resting: rest, feasts: w.cal.feasts, years: w.cal.years,
    });
    // logged out or switched account meanwhile: not this one's
    if (wanted()?.uid !== w.uid) return;
    // kept or refused, not tried again for the same scenery (a refusal would otherwise repaint on every read)
    await native.setStableScenery(scenery);
    have = key;
  } catch (e) {
    have = key;
    console.warn('Stable wallpaper: the scenery failed', e);
  }
}

/** One paint at a time; a change meanwhile paints once more after it. */
function update (): Promise<void> {
  if (running) { again = true; return running; }
  running = paint().finally(() => {
    running = undefined;
    if (again) { again = false; void update(); }
  });
  return running;
}

/** Ask the phone whether the Stable is the wallpaper (and what it has), then paint if needed. */
async function check () {
  const s = await native.stableWallpaper();
  set = !!s?.set;
  have = s?.key ?? '';
  if (s?.screen?.w && s.screen.h) screen = { w: s.screen.w, h: s.screen.h };
  await update();
}

/** Paint the scenery now even if nothing shows the Stable yet, so Android's preview already shows this Stable. */
async function prepare () {
  preparing = true;
  try {
    await check();
    if (running) await running;
  } finally {
    preparing = false;
  }
}

/**
 * Settings' "Set": paint the scenery first, then open Android's preview of the wallpaper.
 * Setting it there is the player's own tap. False when the phone can't (an older APK, no live wallpapers).
 */
export async function openStableWallpaper (): Promise<boolean> {
  await prepare();
  return native.openStableWallpaper();
}

/**
 * Settings' screen saver "Choose": paint the scenery first (Android's "Start now" shows it at once), then open
 * Android's screen saver settings, where choosing it is the player's own tap. False when the phone can't.
 */
export async function openStableDream (): Promise<boolean> {
  await prepare();
  return native.openStableDream();
}

export function watchStableWallpaper () {
  if (!native.available) return;
  store.on(() => { void update(); });
  // the wallpaper or the screen saver just started showing (set from Android's own picker, say) while the app runs
  native.onStableWallpaper(() => { void check(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') void update(); else void check(); });
  void check();
}
