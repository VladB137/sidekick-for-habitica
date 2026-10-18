/**
 * The character in Now's meadow talks when tapped: a line from sayings.ts is typed into its speech bubble, quickly,
 * while the character bobs and (the avatar) flaps its mouth in time with the vowels, pausing at commas and full
 * stops. A tap while it types finishes the line; a tap after it starts the next one. The line stays a few seconds,
 * then the bubble goes back to what it was showing. If what the bubble shows changes underneath (a crit comes up,
 * the connection drops), the talk stops at once: the information wins.
 *
 * The line's whole text is laid out from the first letter (the untyped rest is invisible), so the bubble takes its
 * final size once and nothing reflows while it types. The bubble is as wide as its longest line (fitBubble), whatever
 * it says; while a line is up the meadow keeps at least the height it had, so a shorter line doesn't pull the page up. Typing touches only the line's two text nodes and the
 * character's classes; every redraw renders the same state, so the morph renderer keeps it as it is.
 * Under reduced motion the line appears whole and nothing moves.
 */
import { h, announce, buzz, type Child } from './dom';
import { reduced } from './motion';
import { store } from '../store';
import { pickSaying, type SayingContext } from '../sayings';
import { today } from '../stable/calendar';

type Speaker = SayingContext['speaker'];

/** ms per letter, and the extra pause after , ; : and after . ! ? … inside a line */
const LETTER_MS = 30;
const COMMA_MS = 150;
const STOP_MS = 300;
/** a comic beat the line asks for (its `beats`) */
const BEAT_MS = 450;
/** the mouth opens and shuts at most this often (a syllable, not a letter) */
const FLAP_MS = 90;
/** how long a finished line stays: longer lines longer (end-to-end tests shorten it with window.__talkScale) */
const holdMs = (line: string) => Math.max(4000, Math.min(9000, 2500 + line.length * 45)) * ((window as any).__talkScale || 1);
/** the ids of the lines said lately, newest last, kept on this device so a tap doesn't repeat one soon */
const RECENT = 60;
const RECENT_KEY = 'critoracle:v2:said';

interface Talk {
  line: string
  /** indices into line where typing stops for a beat */
  beats: number[]
  /** letters typed so far */
  shown: number
  done: boolean
  mouth: boolean
  pause: boolean
  flipAt: number
  /** the stage's height when tapped (character and bubble): it keeps it while the line is up, so the meadow doesn't jump */
  minH: number
  /** what the bubble was showing (speechBubble's key); a different one ends the talk */
  key: string
  timer?: number
}
let talk: Talk | undefined;
let boing = { n: 0, until: 0 };
/** the information is back: it fades in once */
let backUntil = 0;
let recent: string[] = [];
try { const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); if (Array.isArray(r)) recent = r.filter(x => typeof x === 'string').slice(-RECENT); } catch { /* none yet */ }
/** where the speech marks go, px in the character's box: by the avatar's face, or measured off a creature's picture */
let marksAt: [number, number] | undefined;
/** what the bubble showed at the last redraw (speechBubble's key) */
let lastKey = '';

const AVATAR_MARKS: [number, number] = [110, 56];
const VOWEL = /[aeiouyàáâăäåèéêëìíîïòóôöùúûüșț]/i;

/**
 * The character, tappable. `character` is whatever draws it: avatarView with `mouth: true` for the avatar, so its
 * mouth flaps (unless a helmet or a beard covers it); any element for a pet or a mount. Whoever it is bobs as it
 * talks, and speech marks flicker beside its head: by the avatar's face, or at the top right of a creature's picture
 * (ui/speaker.ts: `.speaker-art` inside the character).
 */
export function talker (character: HTMLElement, speaker: Speaker): HTMLElement {
  const t = talk;
  // Habitica's avatar box: the face ends at x 99, the helmet horns a little further, the mouth is at y 75
  const marks = character.classList.contains('avatar') ? AVATAR_MARKS : marksAt;
  const now = Date.now();
  const cls = ['talker',
    t && !t.done ? 'say' : '', t?.mouth ? 'open' : '', t?.pause ? 'pause' : '',
    now < boing.until ? `boing${boing.n % 2}` : ''].filter(Boolean).join(' ');
  return h('button', {
    class: cls, type: 'button', 'data-k': 'talker', 'aria-label': `Talk to ${speaker.name}`,
    on: { click: () => tapped(speaker) },
  }, character, h('span', { class: 'talk-marks', 'aria-hidden': 'true', style: marks ? `left:${marks[0]}px;top:${marks[1]}px` : undefined }, h('i'), h('i'), h('i')));
}

/**
 * The speech bubble: `normal` (what it shows untapped) or, while the character talks, the line being typed.
 * `key` names what `normal` is about (crit or not, the connection, a danger): when it changes, the talk ends.
 */
export function speechBubble (normal: Child[], key: string, cls = ''): HTMLElement {
  lastKey = key;
  if (talk && talk.key !== key) stop();
  const t = talk;
  const back = !t && Date.now() < backUntil;
  return h('div', { class: `bubble ${t ? 'talking' : ''} ${back ? 'back' : ''} ${cls}`.replace(/\s+/g, ' ').trim(), 'data-k': 'bubble' },
    t ? said(t) : normal);
}

/** The stage's style while a line is up: at least as tall as before the tap. */
export const stageStyle = (): string | undefined => (talk ? `min-height:${talk.minH}px` : undefined);

/**
 * The bubble as wide as its longest line, after each render (main.ts), a resize and the font's arrival. Text that wraps
 * leaves its box as wide as the space it had, which shows as a gap on the right; this measures the lines as laid out
 * (every text and picture inside, the untyped rest of a line too, never the screen-reader copy) and narrows the box to
 * the widest, which wraps the same words the same way. A transform (the crit's pop) is divided out.
 */
export function fitBubble () {
  const b = document.querySelector<HTMLElement>('.hero-stage .bubble');
  if (!b) return;
  b.style.width = '';
  const box = b.getBoundingClientRect();
  const k = b.offsetWidth ? box.width / b.offsetWidth : 1;
  if (!k) return;
  const cs = getComputedStyle(b);
  const sides = parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderRightWidth);
  const left = box.left + (parseFloat(cs.borderLeftWidth) + parseFloat(cs.paddingLeft)) * k;
  let right = left;
  const range = document.createRange();
  const walk = document.createTreeWalker(b, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n instanceof Element ? n : n.parentElement;
    if (el?.closest('.sr')) continue;
    if (n instanceof Element) {
      if (n.tagName.toLowerCase() === 'svg' || n.tagName === 'IMG') right = Math.max(right, n.getBoundingClientRect().right);
      continue;
    }
    if (!n.nodeValue?.trim()) continue;
    range.selectNodeContents(n);
    const rects = range.getClientRects();
    for (let i = 0; i < rects.length; i++) if (rects[i].width) right = Math.max(right, rects[i].right);
  }
  // 2 px to spare: a line typed into two spans may shape a hair wider than whole
  const w = Math.ceil((right - left) / k + sides + 2);
  if (right > left && w < b.offsetWidth) b.style.width = `${w}px`;
}

// the lines wrap anew when the screen turns or Nunito arrives
window.addEventListener('resize', () => fitBubble());
if (document.fonts) document.fonts.addEventListener('loadingdone', () => fitBubble());

function said (t: Talk): HTMLElement {
  return h('div', { class: `said ${t.done ? '' : 'typing'}`.trim(), 'data-k': 'said' },
    h('span', { class: 'said-text' },
      h('span', { class: 'typed', 'aria-hidden': 'true' }, t.line.slice(0, t.shown)),
      h('span', { class: 'untyped', 'aria-hidden': 'true' }, t.line.slice(t.shown)),
      h('span', { class: 'sr' }, t.line)));
}

function tapped (speaker: Speaker) {
  if (store.settings.haptics) buzz(8);
  if (!reduced()) {
    boing = { n: boing.n + 1, until: Date.now() + 320 };
    // the squash is over: the bob takes the character back (no redraw needed)
    window.setTimeout(() => { if (Date.now() >= boing.until) document.querySelector('.talker')?.classList.remove('boing0', 'boing1'); }, 330);
  }
  const t = talk;
  // still typing: the whole line at once
  if (t && !t.done) { t.shown = t.line.length; finish(t); store.emit(); return; }
  start(speaker);
}

function start (speaker: Speaker) {
  const mode = store.settings.mode === 'relaxed' ? 'relaxed' : 'full';
  const conn = store.connection;
  const roll = store.verdict?.rolls[0];
  const crit = mode === 'full' && conn === 'live' && !store.paused && !!roll?.crit;
  const now = new Date();
  const raw = store.raw;
  const cls = raw?.flags?.classSelected ? raw?.stats?.class : undefined;
  const said = pickSaying({
    mode, conn, crit, speaker, now, feasts: raw ? today(raw, now).feasts : undefined,
    cls: cls === 'warrior' || cls === 'wizard' || cls === 'healer' || cls === 'rogue' ? cls : undefined,
    lvl: raw?.stats?.lvl, resting: !!raw?.preferences?.sleep, user: raw, tasks: store.tasks,
  }, recent);
  recent = recent.filter(id => id !== said.id).concat(said.id).slice(-RECENT);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent)); } catch { /* private mode or full */ }
  begin(said.text, said.beats || []);
}

/**
 * The character says `line` now, untapped (the day's summary, views/headline.ts), if it is on the screen and not
 * already talking. Returns whether it does.
 */
export function sayLine (line: string): boolean {
  if (talk || !document.querySelector('.talker')) return false;
  begin(line, []);
  return true;
}

function begin (line: string, beats: number[]) {
  // the bubble's own height, not the last line's
  const was = talk?.minH;
  stop();
  const stage = document.querySelector<HTMLElement>('.hero-stage');
  const minH = was ?? (stage ? stage.offsetHeight : 0);
  measureMarks();
  const quick = reduced();
  const t: Talk = { line, beats, shown: quick ? line.length : 0, done: false, mouth: false, pause: false, flipAt: 0, minH, key: lastKey };
  talk = t;
  announce(line);
  if (quick) finish(t);
  else t.timer = window.setTimeout(step, 120);
  store.emit();
}

function step () {
  const t = talk;
  if (!t || t.done) return;
  const typed = document.querySelector('.bubble .said .typed');
  const untyped = document.querySelector('.bubble .said .untyped');
  const who = document.querySelector('.talker');
  // gone from the screen (another tab): the talk is over
  if (!typed || !untyped || !who) { stop(); return; }
  t.shown += 1;
  const c = t.line.charAt(t.shown - 1);
  const last = t.shown >= t.line.length;
  const beat = !last && t.beats.includes(t.shown) ? BEAT_MS : 0;
  const wait = last ? 0 : Math.max(beat, /[,;:]/.test(c) ? COMMA_MS : /[.!?…]/.test(c) ? STOP_MS : 0);
  t.pause = wait > 0;
  const now = Date.now();
  const want = !t.pause && VOWEL.test(c);
  if (t.pause) t.mouth = false;
  else if (want !== t.mouth && now - t.flipAt >= FLAP_MS) { t.mouth = want; t.flipAt = now; }
  typed.textContent = t.line.slice(0, t.shown);
  untyped.textContent = t.line.slice(t.shown);
  who.classList.toggle('open', t.mouth);
  who.classList.toggle('pause', t.pause);
  if (last) { finish(t); store.emit(); return; }
  t.timer = window.setTimeout(step, LETTER_MS + wait);
}

function finish (t: Talk) {
  window.clearTimeout(t.timer);
  t.done = true; t.mouth = false; t.pause = false;
  t.timer = window.setTimeout(() => {
    if (talk !== t) return;
    talk = undefined;
    backUntil = Date.now() + 300;
    store.emit();
  }, holdMs(t.line));
}

/** End the talk now, without a redraw (the caller is drawing, or the talk's screen is gone). */
function stop () {
  if (!talk) return;
  window.clearTimeout(talk.timer);
  talk = undefined;
}

/** A creature's picture: the marks at its top right, where its head is (it faces the bubble). */
function measureMarks () {
  const who = document.querySelector<HTMLElement>('.talker');
  const art = who?.querySelector<HTMLElement>('.speaker-art');
  if (!who || !art) { marksAt = undefined; return; }
  const a = art.getBoundingClientRect(), w = who.getBoundingClientRect();
  marksAt = [Math.round(a.right - w.left - 6), Math.round(a.top - w.top + 4)];
}
