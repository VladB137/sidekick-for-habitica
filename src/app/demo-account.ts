/*
 * The made-up account behind "Try it" (demo.ts): Habitica's own game code answering the app's requests on this device,
 * through the same stand-in for habitica.com the end-to-end tests and the simulator use (tools/mock/habitica-mock.mjs).
 * Loaded only when the made-up account opens: Habitica's code and its English text are a chunk of their own.
 */
import H, { createMock, USER_ID, API_TOKEN } from 'virtual:habitica-game';
import { store } from './store';
import type { Send } from '../api/client';
import { choose, freshState, saveStable } from './stable/picks';

/** A name that can't resolve: nothing addressed to it could leave the device even if it were sent. */
const BASE = 'https://habitica.made-up.invalid';

/** A few pets and mounts of Habitica's, so the Stable has someone in it. */
const PETS: Record<string, number> = {
  'Fox-Red': 25, 'Wolf-Base': 15, 'Cactus-Base': 30, 'BearCub-White': 10, 'TigerCub-Desert': 20, 'PandaCub-CottonCandyPink': 5,
  'LionCub-Shade': 35, 'Dragon-Golden': 5, 'FlyingPig-Base': 12, 'Owl-Base': 5, 'Turtle-Base': 5, 'Penguin-Base': 5,
};
const MOUNTS = ['Wolf-Shade', 'Fox-Desert', 'Dragon-Red', 'LionCub-Golden'];
/** who lives in the Meadow (a player arranges this in the Stable; here it's done for them) */
const MEADOW = ['pet:Fox-Red', 'pet:Wolf-Base', 'pet:Cactus-Base', 'pet:BearCub-White', 'pet:FlyingPig-Base', 'pet:Owl-Base', 'mount:Dragon-Red'];

/** Start the made-up account and log the app in to it (no "Remember": nothing is kept). */
export async function openDemoAccount (): Promise<void> {
  // Habitica's real limit, 30 requests a minute, as the app would meet it
  const mock = createMock(H, { rate: 30 });
  const set = (body: unknown) => mock.handle({ method: 'POST', path: '/mock/set', body: JSON.stringify(body) });
  await set({
    user: { profile: { name: 'Made-up Hero' } },
    items: { pets: PETS, mounts: Object.fromEntries(MOUNTS.map(k => [k, true])), currentPet: 'Fox-Red' },
  });
  // kept in the made-up account's storage, in memory (demo.ts)
  saveStable(USER_ID, choose(freshState(), freshState().current, MEADOW).state);
  const send: Send = async (url, init) => {
    const u = new URL(url);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => { headers[k] = v; });
    // a moment's wait, as over a network, so the app's busy signs show as they would
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 80 + Math.random() * 120);
      init.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new TypeError('aborted')); });
    });
    // only Habitica's API: the stand-in's own test hooks (/mock/…) are not reachable from the app
    const out = u.pathname.startsWith('/api/v3/')
      ? await mock.handle({ method: (init.method || 'GET').toUpperCase(), path: u.pathname + u.search, headers, body: typeof init.body === 'string' ? init.body : '' })
      : { status: 404, headers: { 'content-type': 'application/json' }, body: '{"success":false,"error":"NotFound","message":"Not found."}' };
    return new Response(out.body || null, { status: out.status, headers: out.headers });
  };
  await store.login({ userId: USER_ID, apiToken: API_TOKEN }, false, { base: BASE, send });
}
