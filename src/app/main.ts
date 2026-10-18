import './polyfills';
import '@fontsource/roboto/400.css';
import '@fontsource/roboto/500.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import '../styles.css';
import { store, AUTO_READ_MS } from './store';
import { h, icon, button, fmt, snackbar, menu, ripple, announce, buzz, handleBack, whenSettled, sheetOpen, morphChildren, setHour24 } from './ui/dom';
import { loginView } from './views/login';
import { introView } from './views/intro';
import { nowView } from './views/now';
import { tasksView } from './views/tasks';
import { statsView } from './views/stats';
import { planView } from './views/plan';
import { settingsView } from './views/settings';
import { stableView } from './views/stable';
import { syncStable, registerStable, type StableMount } from './stable/host';
import { lazyPlayground } from './stable/lazy';
import { watchStableWidget } from './stable/widget';
import { watchStableWallpaper } from './stable/wallpaper';
import { historyView } from './views/history';
import { sinSelfTest, RULES, skillByKey } from '../engine';
import { setNavigator, PARENT, type Route } from './nav';
import { confirmLogout } from './views/settings';
import { native } from './native';
import { demo, leftDemo, leaveDemo } from './demo';
import { repeatBanners } from './views/repeats';
import './almanac';
import { has, home, relaxed } from './mode';
import { choiceView, startCoach } from './views/modes';
import { headlineNow, bubbleLines, sayDayDone } from './views/headline';
import { text, bubbleKey } from './headline';
import { afterRender, critLanded } from './ui/motion';
import { meadowUrl } from './ui/meadow';
import { talker, speechBubble, stageStyle, fitBubble } from './ui/talk';
import { heroCharacter } from './ui/speaker';

const TABS: Array<{ id: Route, label: string, icon: string }> = [
  { id: 'now', label: 'Now', icon: 'bolt' },
  { id: 'stable', label: 'Stable', icon: 'pets' },
  { id: 'tasks', label: 'Tasks', icon: 'task_alt' },
  // Plan comes back with the day planner (milestone 3)
  { id: 'stats', label: 'Stats', icon: 'bar_chart' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];
const ROUTES: Route[] = ['now', 'tasks', 'plan', 'stats', 'settings', 'history', 'stable'];
/** no hash: where the mode opens (Now in Full, the Stable in Relaxed) */
const routeFromHash = (): Route => { const r = location.hash.slice(1) as Route; return ROUTES.includes(r) ? r : home(); };
let route: Route = routeFromHash();
// opened straight on another screen (a link, a reload): put the mode's home under it (Now, or the Stable in Relaxed),
// so Back goes there rather than out of the app
if (route !== home() && !history.state) {
  const at = route;
  history.replaceState(null, '', `#${home()}`);
  if (PARENT[at]) history.pushState({ tab: true }, '', `#${PARENT[at]}`);
  history.pushState(PARENT[at] ? { tab: true, sub: true } : { tab: true }, '', `#${at}`);
}
/** the Stable fills the screen, app bar and navigation slid away; it is a history entry of its own, so Back leaves it */
let full = route === 'stable' && !!history.state?.full;
const root = document.getElementById('app')!;
const sin = sinSelfTest();
/** Now scrolled far enough that the hero's headline is under the bar: the bar shows the compact verdict
 * (other screens always do) */
let collapsed = false;
/** the hero has scrolled away completely: the pinned bar casts its shadow over the content */
let lifted = false;
let loginEl: HTMLElement | undefined;
let introEl: HTMLElement | undefined;
let choiceEl: HTMLElement | undefined;
/** The intro comes before the login screen each time nobody is logged in, until Skip or Get started.
 *  A token Habitica stopped accepting goes straight to the login screen, which says why. */
let introPassed = leftDemo;
/** the made-up account (demo.ts) is being opened, or failed to open (the message) */
let demoOpening: { error?: string } | undefined = demo ? {} : undefined;
let wasLoggedIn = false;
/** when to re-read for the Habitica day change (ms), 0 = not scheduled */
let dayAt = 0;

/* ---------------------------------------------------------------- navigation
 * Back from any screen goes to the mode's home (Now in Full, the Stable in Relaxed), and Back there leaves the
 * app (Android convention): leaving home pushes one history entry, moving between other screens replaces it.
 * The Stable's full screen pushes one more on top (from the Stable tab or the Stats card), so Back
 * returns to where it was opened. */

/** where to go once Back has left a sub-screen (navigating away from one goes back first, so Back from the
 * tab it opened from still reaches Now) */
let afterBack: Route | undefined;
function navigate (to: Route) {
  whenSettled(() => {
    if (to === route) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    // a sub-screen or the Stable's full screen is an entry of its own: leave it first (the notification's Tasks
    // button can arrive in full screen), or Back from the new tab would land there instead of on Now
    if (history.state?.sub || history.state?.full || history.state?.layer) { afterBack = to; history.back(); return; }
    if (PARENT[to]) { history.pushState({ tab: true, sub: true }, '', `#${to}`); setRoute(to); return; }
    if (to === home() && history.state?.tab) { history.back(); return; } // popstate renders
    if (route === home()) history.pushState({ tab: true }, '', `#${to}`);
    else history.replaceState(history.state?.tab ? { tab: true } : null, '', `#${to}`);
    setRoute(to);
  });
}
function setRoute (r: Route) {
  route = r; collapsed = false; lifted = false;
  full = r === 'stable' && !!history.state?.full;
  window.scrollTo(0, 0);
  render();
  (document.getElementById('main') as HTMLElement | null)?.focus({ preventScroll: true });
}
// we reset scrolling ourselves; the browser restoring an old position would collapse the app bar
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
function setFull (on: boolean) {
  whenSettled(() => {
    if (on === full) return;
    if (!on) { history.back(); return; } // popstate renders
    history.pushState({ tab: true, full: true }, '', '#stable');
    if (route === 'stable') { full = true; render(); } else setRoute('stable');
  });
}
window.addEventListener('popstate', () => {
  // a sheet or a back layer (the Stable's barn) closed; leaving the barn for another tab goes on from here
  if (handleBack()) { if (afterBack && !history.state?.layer) { const to = afterBack; afterBack = undefined; navigate(to); } return; }
  let r = routeFromHash();
  // the bottom entry is always the home screen; after a mode switch it is still the other mode's, so it becomes this one's
  if (!history.state && location.hash !== `#${home()}`) { r = home(); history.replaceState(null, '', `#${r}`); }
  if (r !== route) setRoute(r);
  else if (full !== (r === 'stable' && !!history.state?.full)) { full = !full; render(); }
  if (afterBack) { const to = afterBack; afterBack = undefined; navigate(to); }
});
window.addEventListener('hashchange', () => { const r = routeFromHash(); if (r !== route) setRoute(r); });
setNavigator(navigate, setFull);
// the notification's Tasks button (Android)
native.onRoute(r => { if (ROUTES.includes(r as Route) && store.loggedIn) navigate(r as Route); });

/* ---------------------------------------------------------------- chrome */

function applyTheme () {
  const t = store.settings.theme;
  if (t === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  // the meadow behind the bar, the intro and the login screen (look S)
  document.documentElement.style.setProperty('--meadow', meadowUrl());
}
let statusBarColor = '';
function setStatusBar (look: 'live' | 'crit' | 'offline' | 'danger') {
  const color = look === 'crit' ? '#FFA000' : look === 'offline' ? '#263238' : look === 'danger' ? '#B71C1C' : '#004D40';
  if (color === statusBarColor) return;
  statusBarColor = color;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  native.setStatusBarColor(color);
}

/** Read Habitica now; resolves once nothing is being read any more. */
function doSync (): Promise<void> {
  if (store.busy) return whenIdle();
  if (store.budget() < 3) { snackbar(`Habitica’s request limit is used up for this minute. Try again in ${store.budgetResetIn() || 60} s.`, { error: true }); return Promise.resolve(); }
  return store.sync().then(ok => { if (ok) snackbar('Synced with Habitica'); return whenIdle(); });
}
const whenIdle = () => new Promise<void>(resolve => {
  if (!store.busy) { resolve(); return; }
  const off = store.on(() => { if (!store.busy) { off(); resolve(); } });
});

/** The overflow menu: what doesn't belong on any one screen. Syncing is the bar's own button and pull to refresh. */
function openMenu (e: Event) {
  menu(e.currentTarget as HTMLElement, [
    { icon: 'open_in_new', label: 'Open Habitica', href: 'https://habitica.com/', k: 'menu-habitica' },
    { icon: 'logout', label: demo ? 'Leave the made-up account' : 'Log out', run: confirmLogout, k: 'menu-logout' },
  ]);
}

function statusLine (): string {
  const at = store.syncedAt || store.lastServerAt;
  if (store.offline) return `Offline · last read ${fmt.time(at)}`;
  if (store.fromCache) return `Saved copy from ${fmt.time(at)} · checking…`;
  if (!store.live) return `Last read ${fmt.ago(Math.max(store.syncedAt, store.lastServerAt))} · checking…`;
  return `Live · read ${fmt.ago(Math.max(store.syncedAt, store.lastServerAt))}`;
}

/**
 * The app bar, and on Now the hero under it: the character's speech bubble says the most important thing right now
 * (headline.ts). Amber only for a crit waiting (Full); red when the day change would take all your HP; Relaxed never
 * mentions crits.
 */
function appBar (): HTMLElement {
  const conn = store.connection;
  const paused = store.paused;
  const f = headlineNow();
  const crit = f.tone === 'crit';
  const danger = f.tone === 'danger';
  const onNow = route === 'now';
  setStatusBar(crit ? 'crit' : danger ? 'danger' : conn === 'offline' ? 'offline' : 'live');
  const v = has('crit') ? store.verdict : undefined;
  const chips = !v ? [] : v.rolls.slice(1).filter(r => r.available || (store.snap!.state.classSelected && store.snap!.state.lvl >= (skillByKey(r.key)?.lvl ?? 99))).map(r => h('span', { class: `chip ${r.crit && conn === 'live' ? 'hit' : ''}` },
    icon(r.crit ? 'bolt' : 'casino'), `${r.name}: ${r.crit ? `crit ${fmt.mult(r.mult)}` : 'no crit'}`));
  const named = route === 'settings' ? 'Settings' : null;
  const subScreen = !!PARENT[route];
  // the bar's row is pinned; the hero below it scrolls away with the page like any content, so scrolling
  // stays on the browser's own (compositor) path and nothing is animated by script
  // in the Stable's full screen the bar is slid away: out of reach of Tab and screen readers too
  return h('header', { class: `appbar meadow ${relaxed() ? 'relaxed' : ''} ${crit ? 'crit' : ''} ${danger ? 'danger' : ''} ${conn} ${!onNow || collapsed ? 'collapsed' : ''} ${!onNow || lifted ? 'lifted' : ''} ${onNow ? '' : 'bare'}`, inert: full ? '' : undefined, 'data-says': f.id },
    h('div', { class: 'appbar-top' }, h('div', { class: `appbar-row ${subScreen ? 'sub' : ''}` },
      subScreen ? ripple(h('button', { class: 'btn btn-icon', type: 'button', title: 'Back', 'aria-label': 'Back', 'data-k': 'up', on: { click: () => navigate(PARENT[route]!) } }, icon('arrow_back'))) : null,
      h('h1', { class: 'appbar-title' },
        h('span', { class: 'full', 'aria-hidden': !onNow || collapsed ? 'true' : undefined }, 'Sidekick for Habitica'),
        h('span', { class: 'compact', 'aria-hidden': onNow && !collapsed ? 'true' : undefined }, named ?? (subScreen ? 'History' : f.compact))),
      syncButton(),
      ripple(h('button', { class: 'btn btn-icon', type: 'button', title: 'Menu', 'aria-label': 'Menu', 'aria-haspopup': 'menu', 'data-k': 'menu', on: { click: openMenu } }, icon('more_vert'))),
    )),
    onNow ? h('div', { class: 'hero' },
      heroStage(f),
      chips.length && !paused && conn !== 'offline' ? h('div', { class: 'chips' }, chips) : null,
      conn !== 'offline' ? h('div', { class: 'hero-status' }, statusLine()) : null,
    ) : null,
  );
}

/** The character and its speech bubble; the bubble first, since a change in what it shows ends a talk and the stage's hold. */
function heroStage (f: ReturnType<typeof headlineNow>): HTMLElement {
  const bubble = speechBubble(bubbleLines(f), bubbleKey(f));
  return h('div', { class: 'hero-stage', style: stageStyle() }, meadowCharacter(), bubble);
}

/** The character in the meadow (the one picked in Settings, ui/speaker.ts), which talks when tapped (ui/talk.ts). */
function meadowCharacter (): HTMLElement {
  if (!store.raw) return h('div', { class: 'avatar' });
  const c = heroCharacter();
  return talker(c.el, c.speaker);
}

/**
 * Where a newer build is. Only the browser goes there, on a tap: the app itself talks to habitica.com and nothing else.
 * /releases/latest skips pre-releases, so nobody is sent to the Latest dev build.
 */
const UPDATES_URL = 'https://github.com/VladB137/sidekick-for-habitica/releases/latest';
const updateLink = () => h('a', { class: 'btn btn-flat', href: UPDATES_URL, target: '_blank', rel: 'noopener', 'data-k': 'get-update' }, 'Get the update');

function banners (): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (demo) out.push(demoBanner());
  if (!sin.ok) out.push(h('div', { class: 'banner err', role: 'alert' }, icon('error'), h('div', null, `This browser’s arithmetic failed ${sin.failures} of ${sin.checked} self-test values. Predictions may be wrong here; please report it.`)));
  // Now has its own offline card
  // Habitica refused the app or the account: its own words, and nothing automatic until a read the player asks for works
  if (store.refused) out.push(h('div', { class: 'banner err', role: 'alert' }, icon('block'), h('div', { class: 'li-main' }, `${store.refused} Sidekick has stopped reading by itself.`), button('Retry', doSync, { k: 'retry-refused' })));
  if (store.offline && route !== 'now') out.push(h('div', { class: 'banner offline' }, icon('cloud_off'), h('div', { class: 'li-main' }, `Offline. Numbers from ${fmt.time(store.syncedAt || store.lastServerAt)}; nothing changes until you’re back.`), button('Retry', doSync, { k: 'retry' })));
  const newer = store.newerHabitica;
  if (newer) out.push(h('div', { class: 'banner warn' }, icon('info'), h('div', { class: 'li-main' }, `Habitica is now on version ${newer}; rules checked against ${RULES.checkedAgainst}. Every prediction is still checked against Habitica’s answer.`), updateLink()));
  if (store.drift) out.push(h('div', { class: 'banner warn' }, icon('warning'), h('div', { class: 'li-main' }, 'Two recent predictions didn’t match Habitica. Habitica may have changed a rule — check for a Sidekick update. ', store.lastMismatch ? h('span', { class: 'small muted' }, store.lastMismatch) : null), updateLink()));
  // a repeating To-Do is back: its one-tap Add
  if (route === 'now' || route === 'tasks') out.push(...repeatBanners(route === 'tasks'));
  const gi = store.gearIssue;
  if (!gi.ok) out.push(h('div', { class: 'banner warn' }, icon('warning'), h('div', null, gi.message)));
  // after travel or a clock change Habitica keeps the old zone until one of its own apps is opened: its days follow that
  const zone = store.zoneMismatch();
  if (zone && (route === 'now' || route === 'history')) out.push(h('div', { class: 'banner', 'data-k': 'zone' }, icon('schedule'), h('div', { class: 'li-main' },
    `Habitica still has your account on ${zone.account} (this phone is on ${zone.phone}), so your days change by that clock. Opening Habitica’s own app once updates it.`)));
  const left = store.budget();
  if (left < 8 && !store.offline) {
    const wait = store.budgetResetIn();
    out.push(h('div', { class: 'banner warn' }, icon('hourglass_empty'), h('div', null,
      `${left} of ${store.api?.rate.limit ?? 30} Habitica requests left this minute${wait ? ` (refills in ${wait} s)` : ''}. Suggestions with several steps wait until then.`)));
  }
  return out;
}

/** On every screen of the made-up account: whose numbers these are, and the way to your own. */
function demoBanner (): HTMLElement {
  return h('div', { class: 'banner demo', 'data-k': 'demo-banner' }, icon('info'),
    h('div', { class: 'li-main' }, h('b', null, 'A made-up account. '), 'Habitica’s own game code answers on this device; nothing goes to Habitica and nothing is kept.'),
    button('Use mine', leaveDemo, { k: 'demo-leave' }));
}

/**
 * Material 2017 shifting bottom navigation (five destinations): the current tab widens and shows its label,
 * the others are icons. Every tab keeps its name for screen readers and as a tooltip. The element stays on
 * screen across renders, so the widths, the icon's lift and the label's fade all ease from tab to tab.
 */
function bottomNav (): HTMLElement {
  return h('nav', { class: 'bottomnav shifting', 'aria-label': 'Sections', inert: full ? '' : undefined }, h('div', { class: 'bottomnav-inner' }, TABS.map(t => ripple(h('button', {
    class: `navitem ${(PARENT[route] || route) === t.id ? 'active' : ''}`, type: 'button', 'aria-current': (PARENT[route] || route) === t.id ? 'page' : undefined, 'aria-label': t.label, title: t.label, 'data-k': `nav-${t.id}`,
    on: { click: () => navigate(t.id) },
  }, icon(t.icon), h('span', { class: 'lbl', 'aria-hidden': 'true' }, t.label))))));
}

/** Read Habitica now. It turns while any read is under way (automatic ones too), so it doubles as the busy sign. */
function syncButton (): HTMLElement {
  return ripple(h('button', {
    class: `btn btn-icon sync ${store.busy ? 'spin' : ''}`, type: 'button', 'aria-label': 'Sync with Habitica', title: 'Sync with Habitica', 'data-k': 'sync',
    'aria-busy': store.busy ? 'true' : undefined,
    on: { click: () => { void doSync(); } },
  }, icon('sync')));
}

function content (): HTMLElement {
  // keyed by screen: a new screen is a new element (and fades in), the same screen is updated in place
  const main = h('main', { id: 'main', tabindex: '-1', 'data-k': `main-${route}` });
  main.append(...banners());
  main.append(route === 'now' ? nowView() : route === 'tasks' ? tasksView() : route === 'plan' ? planView() : route === 'stats' ? statsView()
    : route === 'history' ? historyView() : route === 'stable' ? stableView(full, has('crit') ? liveCrit() : null) : settingsView());
  return main;
}

/** The compact verdict when the next task crits right now (live, not paused), else null. */
function liveCrit (): string | null {
  const task = store.verdict?.rolls[0];
  return task?.crit && !store.paused && store.connection === 'live' ? `Next task: CRIT ${fmt.mult(task.mult)}` : null;
}

function loadingScreen (): HTMLElement {
  const err = store.lastError;
  return h('main', { class: 'login' },
    h('div', { class: 'login-hero' }, h('h1', null, 'Sidekick for Habitica'), h('p', null, err ? 'Couldn’t reach Habitica' : 'Reading your numbers…')),
    err ? h('div', { class: 'notice error', role: 'alert' }, err) : h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Loading' }),
    err ? h('div', { class: 'card-actions' },
      button('Try again', () => { store.lastError = undefined; firstSync(); }, { kind: 'raised', k: 'retry' }),
      button('Log out', () => store.logout(), { k: 'logout' })) : null);
}

/** The made-up account on its way (Habitica's code loads on the tap), or the reason it didn't open. */
function demoScreen (error?: string): HTMLElement {
  return h('main', { class: 'login' },
    h('div', { class: 'login-hero' }, h('h1', null, 'Sidekick for Habitica'), h('p', null, error ? 'The made-up account didn’t open' : 'Opening a made-up account…')),
    error ? h('div', { class: 'notice error', role: 'alert' }, error) : h('div', { class: 'progress', role: 'progressbar', 'aria-label': 'Loading' }),
    error ? h('div', { class: 'card-actions' }, button('Back', leaveDemo, { kind: 'raised', k: 'demo-back' })) : null);
}

/** Open the made-up account: Habitica's code, then a login to it, then the app as after any first login. */
async function openDemo () {
  render();
  try {
    const { openDemoAccount } = await import('./demo-account');
    await openDemoAccount();
    demoOpening = undefined;
    scheduleDayCheck();
  } catch (e) {
    console.warn('The made-up account failed to open', e);
    demoOpening = { error: 'Habitica’s game code for it didn’t load on this device. Go back and connect your own account, or restart the app and try again.' };
  }
  render();
}

/* ---------------------------------------------------------------- render */

let lastVerdict = '';
let lastConn = '';
let toldReady = false;
function render () {
  draw();
  // the first screen is up: the APK's native "didn't start" screen (MainActivity) isn't needed
  if (!toldReady && root.firstChild) { toldReady = true; native.ready(); }
}
function draw () {
  applyTheme();
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset?.k;
  if (!store.loggedIn && demoOpening) {
    setStatusBar('live');
    morphChildren(root, [demoScreen(demoOpening.error)]);
    return;
  }
  if (!store.loggedIn) {
    setStatusBar('live');
    // just logged out: the intro again, unless Habitica refused the token (the login screen says why,
    // and the intro must not come back while that login is under way)
    if (wasLoggedIn) { wasLoggedIn = false; introPassed = !!store.authError; }
    leaveStable();
    if (!introPassed && !store.authError) {
      if (!introEl || !root.contains(introEl)) { introEl = introView(leaveIntro); root.replaceChildren(introEl); }
      return;
    }
    // keep the same form across re-renders so typed input and errors survive
    if (!loginEl || !root.contains(loginEl)) {
      loginEl = loginView();
      if (introEl) loginEl.classList.add('enter');
      introEl = undefined;
      root.replaceChildren(loginEl);
      window.scrollTo(0, 0);
    }
    return;
  }
  // coming from the login form (scrolled down to Connect, keyboard up): the app opens at its top
  if (loginEl) window.scrollTo(0, 0);
  loginEl = undefined; introEl = undefined; wasLoggedIn = true;
  if (!store.snap) { leaveStable(); morphChildren(root, [loadingScreen()]); restoreFocus(focusKey); return; }
  // once per device, before the first tab (existing installs too): Full or Relaxed
  if (!store.settings.mode) {
    leaveStable();
    setStatusBar('live');
    if (!choiceEl || !root.contains(choiceEl)) { choiceEl = choiceView(modePicked); root.replaceChildren(choiceEl); window.scrollTo(0, 0); }
    return;
  }
  if (choiceEl) { choiceEl = undefined; root.replaceChildren(); }
  // patch what is on screen rather than replacing it (see morph in ui/dom.ts)
  const critLook = !!document.querySelector('.appbar.crit');
  morphChildren(root, [appBar(), content(), bottomNav(), ptr]);
  fitBubble();
  // classes on #app, not on morphed nodes (morph would strip them on the next render)
  root.classList.toggle('on-stable', route === 'stable');
  root.classList.toggle('stable-full', full);
  syncStableStage();
  revealCrit(critLook);
  afterRender();
  restoreFocus(focusKey);
  // a verdict change is announced once, not on every re-render
  lastConn = store.connection;
  // the bubble's headline, not its countdown (that changes every minute)
  const f = headlineNow();
  const v = store.verdict!.rolls[0];
  const said = f.id === 'newDay' ? 'A new day is waiting' : f.id === 'checking' ? 'Checking with Habitica'
    : f.id === 'crit' ? `Next task: critical hit ${fmt.mult(v.mult)}` : f.id === 'noCrit' ? 'Next task: no crit' : text(f.headline);
  if (said !== lastVerdict) { lastVerdict = said; announce(said); }
  sayDayDone(route === 'now');
}

/* One moment of motion that carries meaning: the bar turning amber spreads out from the verdict as a circle
 * (Material's circular reveal) instead of fading. Not on the first draw, not with reduced motion (it just turns). */
let revealTimer = 0;
let critShown: boolean | undefined;
function revealCrit (before: boolean) {
  const bar = root.querySelector<HTMLElement>('.appbar');
  const now = !!bar?.classList.contains('crit');
  const first = critShown === undefined;
  critShown = now;
  if (!bar || first || before || !now || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const from = (bar.querySelector('.headline') ?? bar.querySelector('.appbar-title'))!.getBoundingClientRect();
  const x = from.left + Math.min(from.width, 120) / 2;
  const y = Math.max(28, from.top + from.height / 2);
  root.style.setProperty('--rx', `${Math.round(x)}px`);
  root.style.setProperty('--ry', `${Math.round(y)}px`);
  root.classList.remove('revealing'); void root.offsetWidth; root.classList.add('revealing');
  window.clearTimeout(revealTimer);
  revealTimer = window.setTimeout(() => root.classList.remove('revealing'), 400);
}

/** No app screen (intro, login, loading): no stage and no full screen. */
function leaveStable () {
  root.classList.remove('on-stable', 'stable-full');
  syncStable(null, false, { top: 0, bottom: 0, full: false });
}
/** Hand the Stable's stage (or its absence) to the playground host, with what the chrome covers of it. */
function syncStableStage () {
  const stage = route === 'stable' ? root.querySelector<HTMLElement>('#stable-stage') : null;
  syncStable(stage, !!stage && document.visibilityState === 'visible', stableInsets());
}
function stableInsets () {
  const bar = root.querySelector<HTMLElement>('.appbar-top');
  const nav = root.querySelector<HTMLElement>('.bottomnav');
  if (route !== 'stable' || !bar || !nav) return { top: 0, bottom: 0, full };
  // full screen: only the system bars (the safe areas the chrome pads itself by) still cover the stage
  if (full) return { top: parseFloat(getComputedStyle(bar).paddingTop) || 0, bottom: parseFloat(getComputedStyle(nav).paddingBottom) || 0, full };
  return { top: bar.offsetHeight, bottom: nav.offsetHeight, full };
}

function leaveIntro () { introPassed = true; render(); }

/** The mode was just chosen: open where it opens, then its tips. */
function modePicked () {
  history.replaceState(null, '', `#${home()}`);
  setRoute(home());
  // once the screen has drawn (the Stable's stage lays out on the next frame)
  window.setTimeout(() => startCoach(true), 300);
}

function restoreFocus (k?: string) {
  if (!k || sheetOpen()) return;
  const el = root.querySelector<HTMLElement>(`[data-k="${CSS.escape(k)}"]`);
  if (el && document.activeElement !== el) el.focus({ preventScroll: true });
}

async function firstSync () {
  render();
  await store.sync({ quiet: !!store.snap });
  scheduleDayCheck();
}

/* ---------------------------------------------------------------- store events, haptics */

let lastToast: unknown;
let critBefore: boolean | undefined;
store.on(() => {
  render();
  const t = store.toast;
  if (t && t !== lastToast) {
    lastToast = t;
    snackbar(t.text, { action: t.action, crit: t.crit, error: t.error, ms: t.ms });
    if (t.crit && store.settings.haptics && has('crit')) buzz([30, 60, 30]);
    if (t.crit && has('crit')) critLanded();
  }
  // the day-change check needs a snapshot; after a login or a recovered first load it may not be set yet,
  // and while a new day is pending the next boundary is tomorrow's
  if (store.snap && (!dayAt || store.needsCron)) scheduleDayCheck();
  const v = store.verdict?.rolls[0];
  const critNow = !!v && v.crit && !store.paused && store.live && has('crit');
  if (critBefore === false && critNow && store.settings.haptics) buzz(20);
  critBefore = store.snap ? critNow : undefined;
});

/* ---------------------------------------------------------------- scrolling: collapse, pull to refresh */

window.addEventListener('scroll', () => {
  const y = window.scrollY;
  if (route === 'now') {
    const bar = document.querySelector('.appbar');
    const hero = bar?.querySelector<HTMLElement>('.hero');
    const c = y > 56;
    const l = !!hero && y >= hero.offsetHeight - 1;
    if (c !== collapsed) {
      collapsed = c; bar?.classList.toggle('collapsed', c);
      bar?.querySelector('.appbar-title .full')?.toggleAttribute('aria-hidden', c);
      bar?.querySelector('.appbar-title .compact')?.toggleAttribute('aria-hidden', !c);
    }
    if (l !== lifted) { lifted = l; bar?.classList.toggle('lifted', l); }
  }
}, { passive: true });

/* Pull to refresh, Material's swipe-refresh disc: it slides out from under the app bar with the finger,
 * its arc growing toward the point where letting go reads Habitica; let go past it and the disc rests below
 * the bar, spinning, until the read is done. Position and arc are written once per frame, never transitioned. */
const PTR_MAX = 128; const PTR_ARM = 64; const PTR_REST = 72;
const ARC = 2 * Math.PI * 8.75;
const ptr = h('div', { class: 'ptr', 'aria-hidden': 'true' });
ptr.innerHTML = '<svg viewBox="0 0 24 24" class="ptr-svg"><circle cx="12" cy="12" r="8.75"/></svg>';
const ptrSvg = ptr.firstElementChild as SVGSVGElement;
const ptrArc = ptrSvg.firstElementChild as SVGCircleElement;
let pullStart = -1; let pull = 0; let armed = false; let ptrFrame = 0; let refreshing = false;
function ptrDraw () {
  ptrFrame = 0;
  const p = Math.min(1, pull / PTR_ARM);
  ptr.style.transform = `translate(-50%, ${pull}px)`;
  ptr.style.opacity = String(Math.min(1, pull / 24));
  ptrSvg.style.transform = `rotate(${-90 + p * 200 + Math.max(0, pull - PTR_ARM) * 2}deg)`;
  ptrArc.style.strokeDasharray = `${(0.05 + p * 0.75) * ARC} ${ARC}`;
}
function ptrReset () {
  ptr.className = 'ptr';
  ptr.style.transform = ''; ptr.style.opacity = ''; ptrSvg.style.transform = ''; ptrArc.style.strokeDasharray = '';
}
/** let the disc glide (to rest, or back under the bar) with a transition, then hand over to fn */
function ptrGlide (cls: string, transform: string, fn?: () => void) {
  ptr.classList.add('settle', ...cls.split(' ').filter(Boolean));
  ptr.style.transform = transform;
  if (fn) window.setTimeout(fn, 200);
}
window.addEventListener('touchstart', (e: TouchEvent) => {
  // the Stable's stage is the playground's to touch (dragging a pet down must not read Habitica)
  const onStage = route === 'stable' && !!(e.target as Element | null)?.closest?.('.stable');
  pullStart = !refreshing && !onStage && window.scrollY <= 0 && e.touches.length === 1 && store.snap && !sheetOpen() ? e.touches[0].clientY : -1;
  pull = 0; armed = false;
}, { passive: true });
window.addEventListener('touchmove', (e: TouchEvent) => {
  if (pullStart < 0) return;
  const dy = e.touches[0].clientY - pullStart;
  // scrolling down the page, not pulling
  if (window.scrollY > 0 || (dy < 0 && pull === 0)) { if (pull > 0) { pull = 0; ptrReset(); } pullStart = -1; return; }
  // resistance: the disc follows quickly at first and eases toward PTR_MAX
  pull = PTR_MAX * (1 - Math.exp(-Math.max(0, dy) * 0.6 / PTR_MAX));
  const a = pull >= PTR_ARM;
  if (a !== armed) { armed = a; ptr.classList.toggle('armed', a); if (a && store.settings.haptics) buzz(8); }
  if (!ptrFrame) ptrFrame = requestAnimationFrame(ptrDraw);
}, { passive: true });
window.addEventListener('touchend', () => {
  if (pullStart < 0) return;
  pullStart = -1;
  if (ptrFrame) { cancelAnimationFrame(ptrFrame); ptrFrame = 0; ptrDraw(); }
  if (!armed) { pull = 0; ptrGlide('', 'translate(-50%, 0)', ptrReset); ptr.style.opacity = '0'; return; }
  refreshing = true;
  ptrSvg.style.transform = ''; ptrArc.style.strokeDasharray = '';
  ptrGlide('spinning', `translate(-50%, ${PTR_REST}px)`);
  const started = Date.now();
  void doSync().then(() => {
    // spin for at least a moment, so a fast read doesn't look like a flicker
    window.setTimeout(() => {
      ptr.style.transform = `translate(-50%, ${PTR_REST}px) scale(0)`;
      window.setTimeout(() => { ptrReset(); refreshing = false; pull = 0; armed = false; }, 200);
    }, Math.max(0, 450 - (Date.now() - started)));
  });
}, { passive: true });
window.addEventListener('touchcancel', () => { if (pullStart < 0) return; pullStart = -1; pull = 0; ptrReset(); }, { passive: true });

/* ---------------------------------------------------------------- staying current
 * No polling: Sidekick reads Habitica when it opens, when it comes back to the
 * foreground after a while, when the connection returns, and once when the Habitica day
 * turns over while it is on screen (preferences.dayStart in the account's time zone, store.nextDayStart). */

/** Android's 24-hour switch may have changed while the app was away; times are drawn its way. */
function readClock () {
  if (native.available) void native.hour24().then(h24 => { if (h24 !== undefined) { setHour24(h24); if (root.firstChild) render(); } });
}
readClock();

let hiddenAt = 0;
document.addEventListener('visibilitychange', () => {
  syncStableStage();
  // a bad habit waiting out its Undo goes now: the app may not come back
  if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); void store.flushDown(); return; }
  readClock();
  if (!store.loggedIn) return;
  // a few seconds away (copying something) isn't worth a re-read; longer, the official app may have been used
  if (hiddenAt && Date.now() - hiddenAt > 5000) store.changedElsewhere = true;
  store.syncIfStale().then(() => { scheduleDayCheck(); render(); });
});
window.addEventListener('online', () => { if (store.loggedIn && store.offline) void store.autoSync().then(() => render()); });
window.addEventListener('offline', () => { if (store.loggedIn) { store.offline = true; render(); } });

function scheduleDayCheck () { if (store.snap) dayAt = store.nextDayStart() + 10_000; }
setInterval(() => {
  if (document.visibilityState !== 'visible' || !store.snap) return;
  if (dayAt && Date.now() >= dayAt && !store.busy && !store.needsCron && !store.refused) {
    dayAt = 0;
    // a read held back by the spacing, or one that failed, tries again a turn later
    store.autoSync().then(ok => { if (ok) scheduleDayCheck(); else dayAt = Date.now() + AUTO_READ_MS; });
    return;
  }
  // re-read every 60 s while on screen (store.autoRead keeps Habitica's 30 s spacing for automatic calls);
  // end-to-end tests that count requests switch it off with window.__noAutoRead
  if (!(window as any).__noAutoRead) store.autoRead();
  // "live" turns into "checking" by the clock alone, so re-draw the verdict when that happens
  if (store.snap && store.connection !== lastConn) render();
  else { const st = document.querySelector('.hero-status'); if (st) st.textContent = statusLine(); }
}, Math.min(15_000, AUTO_READ_MS / 2));
// the Stable's playground; end-to-end builds log what the host tells it (VITE_TEST_API is never set for releases)
registerStable((import.meta as any).env?.VITE_TEST_API ? logged(lazyPlayground) : lazyPlayground);
function logged (fn: StableMount): StableMount {
  const w = window as any; w.__stableLog = [];
  const say = (x: string) => w.__stableLog.push(x);
  return (el, ctx) => {
    say(`mount ${ctx.insets.top > 0 && ctx.insets.bottom > 0 && !ctx.insets.full ? 'chrome' : JSON.stringify(ctx.insets)}`);
    const s = fn(el, ctx);
    w.__stableScene = s;
    return {
      show: () => { say('show'); s.show(); }, hide: () => { say('hide'); s.hide(); },
      insets: i => { say(i.full ? 'full' : 'chrome'); s.insets?.(i); }, toys: () => s.toys?.(), destroy: () => { say('destroy'); s.destroy(); },
    };
  };
}
if ((import.meta as any).env?.VITE_TEST_API) (window as any).__navigate = navigate;
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => render());

// the Android app reads its remembered token from the Keystore first; the website has it at once
const boot = () => { if (store.loggedIn) firstSync(); else render(); };
if (demo) void openDemo(); else if (native.available) store.restoreNative().then(boot, boot); else boot();
watchStableWidget();
watchStableWallpaper();

/* ---------------------------------------------------------------- offline support and updates (production builds) */

let updateAccepted = false;
// (the Android app ships its files inside the APK, so it needs no service worker)
if ('serviceWorker' in navigator && (import.meta as any).env?.PROD && !native.android) {
  navigator.serviceWorker.register('./sw.js').then(reg => {
    reg.addEventListener('updatefound', () => {
      const nw = reg.installing;
      nw?.addEventListener('statechange', () => {
        if (nw.state === 'installed' && navigator.serviceWorker.controller) {
          snackbar('A new version of Sidekick is ready.', { action: { label: 'Reload', run: () => { updateAccepted = true; nw.postMessage('skipWaiting'); } }, ms: 15000 });
        }
      });
    });
  }).catch(() => { /* offline support is optional */ });
  // reload only when the player accepted an update — not when the first install takes control
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (updateAccepted) { updateAccepted = false; location.reload(); } });
}
