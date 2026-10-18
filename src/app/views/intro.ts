import { h, icon, ripple } from '../ui/dom';
import { native } from '../native';
import { scenePicture } from './stable';
import { MODE_INFO } from '../mode';
import { canDemo, enterDemo } from '../demo';

/*
 * The intro shown before login: a sideways pager (Material 2017 onboarding, "top user benefits").
 * Swiping is the browser's own scroll snapping, so it follows the finger on the compositor with no
 * script in the loop; the script only keeps the dots and the buttons in step with the position.
 * The pictures are small pieces of the real interface with made-up numbers.
 */

interface Slide { title: string, body: string, art: () => HTMLElement, chip?: string }

const bar = (cls: string, overline: string, headline: Node | string, sub: string, extra: Node | null = null) =>
  h('div', { class: `ob-bar ${cls}` }, h('div', { class: 'overline' }, overline), h('div', { class: 'ob-headline' }, headline), h('div', { class: 'ob-sub' }, sub), extra);

/**
 * The meadow at this hour and season, with three of Habitica's own pets standing in it (art pixels, 96 × 54).
 * The sprite catalogue loads with the Stable, not with the app, so the pets and their credit arrive a moment later.
 */
function meadowArt (): HTMLElement[] {
  const pic = scenePicture('meadow');
  const stage = h('div', { class: 'ob-meadow', 'data-k': 'intro-meadow' }, pic ? h('img', { class: 'ob-meadow-bg', src: pic, alt: '' }) : null);
  const credit = h('p', { class: 'ob-credit' });
  void import('../../stable/sprites').then(({ spriteMeta, SPRITE_CREDIT }) => {
    const pets: Array<[string, number, boolean]> = [['Fox-Base', 24, false], ['Cactus-Base', 50, false], ['BearCub-Base', 74, true]];
    for (const [key, x, flip] of pets) {
      const m = spriteMeta('pet', key);
      if (!m) continue;
      // sprites are 3 image pixels per art pixel; the picture is 96 art pixels wide, the ground about 1/7 up
      const pct = (px: number) => px / 3 / 96 * 100;
      // x is where the feet stand; a mirrored sprite has its feet the same distance from the other edge
      const left = x - (flip ? pct(m.w - m.ax) : pct(m.ax));
      stage.append(h('img', { class: `ob-pet${flip ? ' flip' : ''}`, src: m.url, alt: '', style: `width:${pct(m.w).toFixed(2)}%;left:${left.toFixed(2)}%;bottom:${(100 / 7).toFixed(2)}%` }));
    }
    credit.textContent = SPRITE_CREDIT;
  }).catch((e: unknown) => console.warn('Intro: the pets failed to load', e));
  return [stage, credit];
}

const HEAT = 'ddxdddmddddxdd-dddmdddddddd-xddd'.split('');

const SLIDES: Slide[] = [
  {
    title: 'Your Stable comes to life',
    body: 'Your pets and mounts live in playgrounds that follow your hour and season and grow with your Habitica account. Choose who lives where, tap them, play ball.',
    art: () => h('div', { class: 'ob-art' }, meadowArt()),
  },
  {
    title: 'Your days, at a glance',
    body: 'Every Daily and habit as a calendar, the streaks at risk tonight, the item drops left today and your stats as bars. All from what Habitica already keeps.',
    art: () => h('div', { class: 'ob-art' },
      h('div', { class: 'ob-card' },
        h('div', { class: 'ob-card-title' }, 'Gym'),
        h('div', { class: 'ob-heat', 'aria-hidden': 'true' }, HEAT.map(c => h('i', { class: `c ${c === 'd' ? 'done' : c === 'm' ? 'missed' : c === 'x' ? 'extra' : 'off'}` }))),
        h('div', { class: 'ob-opt' }, icon('local_fire_department'), h('div', null, h('div', { class: 'ob-tier' }, 'Streak'), h('div', null, '12 days, still open today'))),
        h('div', { class: 'ob-opt' }, icon('egg'), h('div', null, h('div', { class: 'ob-tier' }, 'Item drops'), h('div', null, '3 of 6 left today'))),
      )),
  },
  {
    title: 'No bad surprises at the day change',
    body: `If open Dailies would cost too much HP, the app says so first. ${native.available ? 'On this phone' : 'In the Android app'}, a notification, widget and tile can show your day too. They stay off until you switch them on, and they only ever read.`,
    art: () => h('div', { class: 'ob-art' },
      h('div', { class: 'ob-notif' },
        h('div', { class: 'ob-notif-app' }, icon('today'), 'Sidekick for Habitica · now'),
        h('div', { class: 'ob-notif-title' }, '2 Dailies left'),
        h('div', { class: 'ob-notif-text' }, 'Day change takes 9 HP: finish Gym, Read · New day in 2 h 10 min'),
      ),
      h('div', { class: 'ob-tiles' },
        h('div', { class: 'ob-tile on' }, icon('notifications'), h('span', null, 'Notification')),
        h('div', { class: 'ob-tile' }, icon('smartphone'), h('span', null, 'Widget')),
      )),
  },
  {
    title: 'Know before you tap',
    chip: 'Full mode',
    body: 'Habitica’s critical hits aren’t random: the roll is worked out from your own numbers. Sidekick reads them and tells you whether your next task will crit.',
    art: () => h('div', { class: 'ob-art' },
      bar('crit ob-hero', 'Next task', h('span', null, h('b', null, 'CRIT '), '×1.84'), 'Whatever you score next gets ×1.84.',
        h('div', { class: 'chips' }, h('span', { class: 'chip' }, icon('casino'), 'Brutal Smash: no crit')))),
  },
  {
    title: 'Make it crit, honestly',
    chip: 'Full mode',
    body: 'When it won’t crit, see what would make it certain: free moves first, then cheap ones. Nothing runs until you tap.',
    art: () => h('div', { class: 'ob-art' },
      h('div', { class: 'ob-card' },
        h('div', { class: 'ob-card-title' }, 'Make the next task crit'),
        ...[['Free', 'Swap a piece of gear; it goes back by itself', 'swap_horiz'], ['Free', 'Spend a stat point on the stat you chose', 'trending_up'], ['Cheap', 'Cast a skill with spare mana', 'auto_fix_high']]
          .map(([tier, what, ic]) => h('div', { class: 'ob-opt' }, icon(ic), h('div', null, h('div', { class: 'ob-tier' }, tier), h('div', null, what)))),
      )),
  },
  {
    title: 'Two ways to use it',
    body: 'Full adds the crit planner. Relaxed keeps your Stable, stats and day warnings and never mentions crits. You choose after logging in, and can switch any time in Settings.',
    art: () => h('div', { class: 'ob-art' },
      h('div', { class: 'ob-modes' }, (['full', 'relaxed'] as const).map(m => h('div', { class: `ob-card ob-mode ob-mode-${m}` },
        h('div', { class: 'ob-card-title' }, icon(m === 'full' ? 'bolt' : 'pets'), MODE_INFO[m].name),
        h('div', { class: 'ob-mode-text' }, MODE_INFO[m].short))))),
  },
  {
    title: 'Get started',
    body: 'Connect with your Habitica User ID and API Token. The token goes only to habitica.com, straight from this device. There’s no server, and nothing is collected.',
    art: () => h('div', { class: 'ob-art' }, h('img', { class: 'ob-appicon', src: './icons/icon.svg', alt: '' })),
  },
];

/** `done` runs on Skip and on Get started. */
export function introView (done: () => void): HTMLElement {
  const n = SLIDES.length;
  let at = 0;
  const reduce = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const slides = SLIDES.map((s, i) => h('section', {
    class: 'ob-slide', role: 'group', 'aria-roledescription': 'slide', 'aria-label': `${i + 1} of ${n}: ${s.title}`,
  },
  s.art(),
  h('div', { class: 'ob-text' },
    s.chip ? h('span', { class: 'ob-chip' }, icon('bolt'), s.chip) : null,
    h('h2', { class: 'ob-title' }, s.title),
    h('p', { class: 'ob-body' }, s.body),
    i === n - 1 ? ripple(h('button', { class: 'btn btn-raised accent ob-start', type: 'button', 'data-k': 'intro-start', on: { click: done } }, 'Get started')) : null,
    // the whole app on a made-up account first (demo.ts), before handing over a token
    i === n - 1 && canDemo() ? ripple(h('button', { class: 'btn ob-try', type: 'button', 'data-k': 'intro-try', on: { click: enterDemo } }, 'Try it without an account')) : null,
  )));
  const track = h('div', { class: 'ob-track', tabindex: '0', 'aria-label': 'What Sidekick does', 'aria-roledescription': 'carousel' }, slides);

  const go = (i: number) => track.scrollTo({ left: Math.max(0, Math.min(n - 1, i)) * track.clientWidth, behavior: reduce() ? 'auto' : 'smooth' });
  const dots = SLIDES.map((s, i) => h('button', { class: 'ob-dot', type: 'button', 'aria-label': `Slide ${i + 1}: ${s.title}`, on: { click: () => go(i) } }));
  const skip = ripple(h('button', { class: 'btn ob-skip', type: 'button', 'data-k': 'intro-skip', on: { click: done } }, 'Skip'));
  const next = ripple(h('button', { class: 'btn btn-icon ob-next', type: 'button', 'aria-label': 'Next', title: 'Next', 'data-k': 'intro-next', on: { click: () => go(at + 1) } }, icon('arrow_forward')));
  const el = h('div', { class: 'ob', 'data-slide': '0' },
    h('div', { class: 'ob-brand' }, 'Sidekick for Habitica'),
    track,
    h('div', { class: 'ob-nav' }, skip, h('div', { class: 'ob-dots' }, dots), next),
  );

  const show = (i: number) => {
    at = i;
    el.dataset.slide = String(i);
    el.classList.toggle('last', i === n - 1);
    dots.forEach((d, j) => { d.classList.toggle('on', j === i); if (j === i) d.setAttribute('aria-current', 'step'); else d.removeAttribute('aria-current'); });
    // the hidden buttons leave the tab order on the last slide (Get started takes over)
    skip.tabIndex = next.tabIndex = i === n - 1 ? -1 : 0;
  };
  show(0);
  // which slide is under the middle of the screen, as the finger moves (cheap: one division per frame)
  let raf = 0;
  track.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth)); if (i !== at) show(Math.max(0, Math.min(n - 1, i))); });
  }, { passive: true });
  track.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); go(at + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(at - 1); }
  });
  // a rotation or a resized window would leave the pager between two slides
  window.addEventListener('resize', () => { if (el.isConnected) track.scrollTo({ left: at * track.clientWidth }); });
  return el;
}
