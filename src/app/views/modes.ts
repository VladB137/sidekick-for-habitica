/*
 * The mode choice after login (shown once per device, existing installs included) and the first-run tips that
 * follow it: three coach marks pointing at the parts that matter in the chosen mode, each dismissed by a tap,
 * never shown again by themselves, replayable from Settings > About.
 */
import { h, icon, ripple } from '../ui/dom';
import { store } from '../store';
import { MODE_INFO, home, mode, setMode, type Mode } from '../mode';
import { go } from '../nav';

/** `picked` runs once the mode is saved. Nothing is preselected: a card is the choice. */
export function choiceView (picked: () => void): HTMLElement {
  const card = (m: Mode, ic: string) => {
    const info = MODE_INFO[m];
    return ripple(h('button', {
      class: `mode-card mode-${m}`, type: 'button', 'data-k': `choose-${m}`, 'aria-label': `${info.name}: ${info.short}`,
      on: { click: () => { void setMode(m).then(picked); } },
    },
    h('span', { class: 'mode-head' }, icon(ic, 'mode-icon'), h('span', { class: 'mode-name' }, info.name)),
    h('span', { class: 'mode-short' }, info.short),
    h('ul', { class: 'mode-gets' }, info.gets.map(g => h('li', null, icon('check_circle', 'mode-check'), g))),
    h('span', { class: 'mode-hides' }, info.hides)));
  };
  return h('main', { class: 'mode-choice', 'data-k': 'mode-choice' },
    h('div', { class: 'ob-brand' }, 'Sidekick for Habitica'),
    h('div', { class: 'mode-body' },
      h('h1', { class: 'ob-title' }, 'How do you want to use Sidekick?'),
      h('div', { class: 'mode-cards' }, card('full', 'bolt'), card('relaxed', 'pets')),
      h('p', { class: 'mode-foot' }, 'Change it any time in Settings > App mode.')));
}

/* ---------------------------------------------------------------- coach marks */

/** `at`: selectors tried in order; the first one on screen is pointed at */
interface Mark { at: string[], title: string, text: string }
const MARKS: Record<Mode, Mark[]> = {
  full: [
    { at: ['.appbar'], title: 'Amber means go', text: 'Up here is your next task’s verdict. Amber means a fresh read says it crits: act now. While the app is checking, actions wait.' },
    { at: ['main .opt.best', 'main .opt', 'main [data-k^="did-"]'], title: 'One tap, nothing hidden', text: 'Each way to a crit lists exactly what it will do in Habitica, and asks before anything happens.' },
    { at: ['.bottomnav'], title: 'Everything else', text: 'Your Stable with your pets and mounts, Tasks to tick, Stats and History, and Settings.' },
  ],
  relaxed: [
    { at: ['.appbar-top'], title: 'Your day at a glance', text: 'Up here: Dailies left and the time to your day change. It turns red if the day change would knock you out.' },
    { at: ['#stable-stage'], title: 'Your Stable', text: 'Your pets and mounts live here. Tap one to say hello, play with the ball, and choose who lives in each playground.' },
    { at: ['.bottomnav'], title: 'Everything else', text: 'Now for your bars and warnings, Tasks to tick, Stats and History, and Settings to switch modes.' },
  ],
};

let tour: HTMLElement | undefined;

/** The tips for the mode in use, from the first; `firstRun` only if they haven't been shown on this device. */
export function startCoach (firstRun = false) {
  const m = mode();
  if (firstRun && store.settings.coach?.[m]) return;
  store.settings.coach = { ...store.settings.coach, [m]: true };
  store.saveSettings();
  tour?.remove();
  let i = 0;
  const marks = MARKS[m];
  const ring = h('div', { class: 'coach-ring', 'aria-hidden': 'true' });
  const title = h('div', { class: 'coach-title', id: 'coach-title' });
  const text = h('p', { class: 'coach-text' });
  const count = h('span', { class: 'coach-count' });
  const next = ripple(h('button', { class: 'btn', type: 'button', 'data-k': 'coach-next', on: { click: (e: Event) => { e.stopPropagation(); step(1); } } }, 'Next'));
  const skip = ripple(h('button', { class: 'btn', type: 'button', 'data-k': 'coach-skip', on: { click: (e: Event) => { e.stopPropagation(); end(); } } }, 'Skip'));
  const bubble = h('div', { class: 'coach-bubble', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'coach-title', 'data-k': 'coach' },
    title, text, h('div', { class: 'coach-actions' }, count, skip, next));
  const el = h('div', { class: 'coach', 'data-k': 'coach-layer', on: { click: () => step(1) } }, ring, bubble);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') end(); };
  const place = () => {
    const mk = marks[i];
    const target = mk.at.map(q => [...document.querySelectorAll<HTMLElement>(q)].find(x => x.getClientRects().length > 0)).find(Boolean);
    title.textContent = mk.title; text.textContent = mk.text;
    count.textContent = `${i + 1} of ${marks.length}`;
    next.textContent = i === marks.length - 1 ? 'Got it' : 'Next';
    const vh = window.innerHeight;
    let r = target?.getBoundingClientRect();
    if (target && r && (r.top < 0 || r.bottom > vh) && r.height < vh / 2 && !target.closest('.appbar, .bottomnav')) {
      target.scrollIntoView({ block: 'center', behavior: 'instant' });
      // scrolling collapses the app bar, which moves the page: place again once that has settled
      requestAnimationFrame(() => requestAnimationFrame(() => { if (marks[i] === mk) place(); }));
      r = target.getBoundingClientRect();
    }
    if (!r || r.width === 0) { ring.hidden = true; bubble.style.top = `${Math.round(vh / 3)}px`; bubble.style.bottom = ''; return; }
    ring.hidden = false;
    const pad = 4;
    const top = Math.max(0, r.top - pad); const bottom = Math.min(vh, r.bottom + pad);
    Object.assign(ring.style, { left: `${Math.max(0, r.left - pad)}px`, top: `${top}px`, width: `${Math.min(window.innerWidth, r.width + 2 * pad)}px`, height: `${bottom - top}px` });
    // the bubble on the side with more room
    if (top > vh - bottom) { bubble.style.top = ''; bubble.style.bottom = `${Math.round(vh - top + 12)}px`; } else { bubble.style.bottom = ''; bubble.style.top = `${Math.round(bottom + 12)}px`; }
  };
  const step = (d: number) => { i += d; if (i >= marks.length) { end(); return; } place(); next.focus(); };
  const end = () => { el.remove(); window.removeEventListener('keydown', onKey); window.removeEventListener('resize', place); if (tour === el) tour = undefined; };
  tour = el;
  document.body.appendChild(el);
  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  place();
  next.focus();
}

export const coachOpen = () => !!tour?.isConnected;

/** Settings > About: back to where the mode opens, then the tips again. */
export function replayCoach () {
  go(home());
  // after the screen has changed and drawn
  window.setTimeout(() => startCoach(), 350);
}
