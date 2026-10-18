/*
 * The two app modes (Vlad, 2026-10-14; spec in the project's app-modes/README.md):
 *   Full     everything: the crit planner and all the rest.
 *   Relaxed  the Stable, stats, history and the warnings that protect your day. Nothing that plans, forces or
 *            explains a crit, and crits are never mentioned; the app bar never turns amber.
 * Both read exactly the same from Habitica; Relaxed only draws less. Views ask `has(feature)` rather than
 * the mode, so a mode is a list of feature groups (a later "Customize" list would only change that list).
 */
import { store } from './store';
import { native, type NightGear } from './native';
import type { Route } from './nav';

export type Mode = 'full' | 'relaxed';
/**
 * crit: verdicts, ways to crit, crit chips and chances, the roll, the prediction check, Aim and the allowed ways
 * skills: casting class skills · gear: gear swaps for a crit and putting them back · selling: items to sell
 * journal: the crit journal · classTips: the class card on Now with its gear, skill and Smash plans (without it,
 * Now shows the plain class card: no buttons, nothing about crits)
 */
export type Feature = 'crit' | 'skills' | 'gear' | 'selling' | 'journal' | 'classTips';

const FEATURES: Record<Mode, readonly Feature[]> = {
  full: ['crit', 'skills', 'gear', 'selling', 'journal', 'classTips'],
  relaxed: [],
};

/** The mode in use; Full until one is chosen (the choice screen comes first anyway). */
export const mode = (): Mode => store.settings.mode ?? 'full';
export const relaxed = () => store.settings.mode === 'relaxed';
export const has = (f: Feature) => FEATURES[mode()].includes(f);
/** Where the app opens and where Back ends: the Stable in Relaxed, Now in Full. */
export const home = (): Route => (relaxed() ? 'stable' : 'now');

export const MODE_INFO: Record<Mode, { name: string, short: string, gets: string[], hides: string }> = {
  full: {
    name: 'Full',
    short: 'The crit planner and everything else',
    gets: ['Whether your next task crits, before you tap', 'The cheapest honest way to make it crit', 'Your Stable, stats, history and day warnings'],
    hides: 'Nothing is hidden.',
  },
  relaxed: {
    name: 'Relaxed',
    short: 'Your Stable and stats, no crit planning',
    gets: ['Your pets and mounts in living playgrounds', 'History, streaks at risk and item drops', 'A warning before the day change hurts'],
    hides: 'Hidden: crit planning, skills, gear swaps and selling.',
  },
};

/**
 * Choose a mode. Night gear (the app's one automatic write, Android) pauses while Relaxed is on, since no card
 * there explains it, and comes back with Full; the times and the choice of gear are kept.
 */
export async function setMode (m: Mode) {
  const st = store.settings;
  const was = st.mode;
  st.mode = m;
  store.saveSettings();
  if (!native.available || was === m) return;
  const n = (await native.status())?.night;
  if (!n) return;
  const plain = (on: boolean): NightGear => ({ on, mode: n.mode, swapAt: n.swapAt, backOn: n.backOn, backAt: n.backAt });
  if (m === 'relaxed' && n.on) {
    st.nightPaused = true; store.saveSettings();
    await native.setNightGear(plain(false));
  } else if (m === 'full' && st.nightPaused) {
    st.nightPaused = false; store.saveSettings();
    await native.setNightGear(plain(true));
  }
  store.emit();
}
