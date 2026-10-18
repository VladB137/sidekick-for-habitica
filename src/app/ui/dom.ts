/* Tiny DOM helpers: element builder, icons, ripples, snackbar queue, bottom sheets. User text is always set as text, never HTML. */
import { ICONS } from './icons';
import { images as shopImages } from '../../data/shop-icons.json';

export type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { class?: string, on?: Record<string, (e: any) => void>, style?: string };

/* Event handlers live in a map rather than on the element, so morph() can hand an element that stays on
   screen the handlers of the freshly rendered copy (their closures see the newest state). */
const handlers = new WeakMap<EventTarget, Record<string, (e: any) => void>>();
function dispatch (this: EventTarget, e: Event) { handlers.get(this)?.[e.type]?.call(this, e); }

export function h<K extends keyof HTMLElementTagNameMap> (tag: K, attrs: Attrs | null = null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'on') {
        handlers.set(el, { ...(v as Record<string, (e: Event) => void>) });
        for (const ev of Object.keys(v as object)) el.addEventListener(ev, dispatch);
      }
      else if (k === 'class') el.className = String(v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k in el && k !== 'list' && typeof v !== 'string') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  if (noFlexGap) wrapLooseText(el);
  return el;
}

/* A WebView without flex gap (src/app/polyfills.ts) spaces flex children with margins, which bare text can't take:
   text next to elements goes into an <x-t> (inline, unstyled) so it is spaced like the icon beside it. */
const noFlexGap = typeof document !== 'undefined' && document.documentElement.classList.contains('no-flex-gap');
function wrapLooseText (el: Element) {
  if (!el.firstElementChild) return;
  for (const n of Array.from(el.childNodes)) {
    if (n.nodeType !== Node.TEXT_NODE || !n.textContent?.trim()) continue;
    const t = document.createElement('x-t');
    el.replaceChild(t, n);
    t.appendChild(n);
  }
}

function append (el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const SVGNS = 'http://www.w3.org/2000/svg';
export function icon (name: string, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', `icon ${cls}`.trim());
  // icon markup comes from our own generated file, never from user data
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

/** Material ripple on pointer down. */
export function ripple<T extends HTMLElement> (el: T): T {
  el.classList.add('ripple-host');
  el.addEventListener('pointerdown', rippleDown);
  return el;
}
function rippleDown (this: HTMLElement, e: PointerEvent) {
  const el = this;
  if (el.hasAttribute('disabled')) return;
  const r = el.getBoundingClientRect();
  const d = Math.max(r.width, r.height) * 2;
  // ripples live in their own clipping box, so the host can have a touch area larger than itself; first, so the host's last
  // child stays last (tools/flex-gap-fallback.mjs spaces every child but the last)
  let box = el.querySelector<HTMLElement>(':scope > .ripple-box');
  if (!box) { box = document.createElement('span'); box.className = 'ripple-box'; el.insertBefore(box, el.firstChild); }
  const dot = document.createElement('span');
  dot.className = 'ripple';
  dot.style.width = dot.style.height = `${d}px`;
  dot.style.left = `${e.clientX - r.left - d / 2}px`;
  dot.style.top = `${e.clientY - r.top - d / 2}px`;
  box.appendChild(dot);
  setTimeout(() => dot.remove(), 600);
}

/* ------------------------------------------------------------ morph: update the screen in place
 * Every store change re-renders the whole screen from state. Swapping in the new tree would restart
 * every transition, cut ripples short, reload images and stop a fling; morph() instead patches the nodes
 * already on screen to match it, so only what changed changes. Siblings are matched by data-k or id,
 * else by tag in order; a node that can't be matched is moved in as it is. An element marked data-own is left
 * exactly as it is once on screen (something else draws inside it). */

const keyOf = (n: Node): string | undefined => (n instanceof Element ? n.getAttribute('data-k') || n.id || undefined : undefined);
/** nodes added by the browser side of things (ripples) that a render never produces */
const transient = (n: Node) => n instanceof Element && n.classList.contains('ripple-box');

export function morph (from: Node, to: Node): Node {
  if (from === to) return from;
  if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName || keyOf(from) !== keyOf(to)) {
    from.parentNode?.replaceChild(to, from);
    return to;
  }
  if (!(from instanceof Element)) {
    if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
    return from;
  }
  // an element something else draws into (the Stable's stage): its attributes and children are its owner's
  if (from.hasAttribute('data-own')) return from;
  const t = to as Element;
  for (const a of [...from.attributes]) {
    if (t.hasAttribute(a.name)) continue;
    // a <details> keeps whatever the player opened or closed
    if (a.name === 'open' && from.nodeName === 'DETAILS') continue;
    from.removeAttribute(a.name);
  }
  for (const a of [...t.attributes]) {
    if (a.name === 'open' && from.nodeName === 'DETAILS') continue;
    if (from.getAttribute(a.name) !== a.value) from.setAttribute(a.name, a.value);
  }
  const on = handlers.get(t);
  if (on) { handlers.set(from, on); for (const ev of Object.keys(on)) from.addEventListener(ev, dispatch); }
  else handlers.delete(from);
  if (t.classList.contains('ripple-host')) from.addEventListener('pointerdown', rippleDown as EventListener);
  morphChildren(from, t);
  // live state the attributes don't carry
  if (from instanceof HTMLInputElement) {
    const n = t as HTMLInputElement;
    if (from.checked !== n.checked) from.checked = n.checked;
    if (from.value !== n.value && document.activeElement !== from) from.value = n.value;
  } else if (from instanceof HTMLOptionElement) {
    if (from.selected !== (t as HTMLOptionElement).selected) from.selected = (t as HTMLOptionElement).selected;
  } else if (from instanceof HTMLSelectElement) {
    if (from.value !== (t as HTMLSelectElement).value) from.value = (t as HTMLSelectElement).value;
  }
  return from;
}

/** Make parent's children match next (a node, or a list of nodes to become the children). */
export function morphChildren (parent: Node, next: Node | Node[]) {
  const want = Array.isArray(next) ? next : [...next.childNodes];
  const have: Node[] = [...parent.childNodes].filter(n => !transient(n));
  const keyed = new Map<string, Node>();
  const loose = new Map<string, Node[]>();
  for (const n of have) {
    const k = keyOf(n);
    if (k) keyed.set(k, n);
    else { const q = loose.get(n.nodeName); if (q) q.push(n); else loose.set(n.nodeName, [n]); }
  }
  const result: Node[] = [];
  for (const n of want) {
    if (have.includes(n)) { result.push(n); continue; }
    const k = keyOf(n);
    let old: Node | undefined;
    if (k) { old = keyed.get(k); if (old) keyed.delete(k); }
    else old = loose.get(n.nodeName)?.shift();
    if (old && old.nodeName === n.nodeName) result.push(morph(old, n));
    else result.push(n);
  }
  const keep = new Set(result);
  for (const n of have) if (!keep.has(n) && n.parentNode === parent) parent.removeChild(n);
  let cur: Node | null = parent.firstChild;
  const skip = () => { while (cur && transient(cur)) cur = cur.nextSibling; };
  skip();
  for (const n of result) {
    if (n === cur) { cur = cur.nextSibling; skip(); continue; }
    parent.insertBefore(n, cur);
  }
}

export interface ButtonOpts {
  kind?: 'flat' | 'raised' | 'icon'
  icon?: string
  cls?: string
  disabled?: boolean
  /** tooltip; also the accessible name of icon buttons */
  title?: string
  /** accessible name when the visible label isn't enough ("Do it" → "Do it: sell 3 eggs") */
  label?: string
  /** stable key so focus survives a re-render */
  k?: string
}
export function button (text: string, onClick: () => void, opts: ButtonOpts = {}): HTMLButtonElement {
  const kind = opts.kind || 'flat';
  const b = h('button', {
    class: `btn btn-${kind} ${opts.cls || ''}`.trim(), type: 'button', disabled: !!opts.disabled,
    'aria-label': opts.label || (kind === 'icon' ? opts.title : undefined), title: opts.title, 'data-k': opts.k,
    on: { click: (e: Event) => { e.stopPropagation(); onClick(); } },
  }, opts.icon ? icon(opts.icon) : null, kind === 'icon' ? null : text);
  return ripple(b);
}

/**
 * Clock times in English sentences: the phone's 12- or 24-hour habit (Android's switch once main.ts asks for it,
 * else the language's), never its digits or month names ("17 oct.", Arabic digits).
 */
let hour12: boolean | undefined;
export function setHour24 (h24: boolean | undefined) { hour12 = h24 === undefined ? undefined : !h24; }
const twelve = () => hour12 ?? (() => { try { return !!new Intl.DateTimeFormat([], { hour: 'numeric' }).resolvedOptions().hour12; } catch { return false; } })();

export const fmt = {
  int: (n: number) => Math.round(n).toLocaleString('en-US'),
  pct: (x: number, d = 1) => `${(x * 100).toFixed(d)}%`,
  mult: (m: number) => `×${m.toFixed(2)}`,
  signed: (n: number, unit = '') => `${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt.int(Math.abs(n))}${unit ? ` ${unit}` : ''}`,
  gold: (n: number) => `${fmt.int(n)} Gold`,
  time: (t: number) => new Date(t).toLocaleTimeString(twelve() ? 'en-US' : 'en-GB', { hour: '2-digit', minute: '2-digit', hour12: twelve() }),
  /** "Sat 17 Oct"-style pieces: `o` as toLocaleDateString's, always in English */
  date: (t: number, o: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }) => new Date(t).toLocaleDateString('en-GB', o),
  ago: (t: number, now = Date.now()) => {
    const s = Math.max(0, Math.round((now - t) / 1000));
    if (s < 45) return 'just now';
    if (s < 90) return '1 min ago';
    if (s < 3600) return `${Math.round(s / 60)} min ago`;
    if (s < 86400) return `at ${fmt.time(t)}`;
    return fmt.date(t);
  },
};

/* ------------------------------------------------------------ screen-reader announcements */

/** Polite announcement through a live region that stays in the DOM across re-renders. */
export function announce (text: string) {
  let live = document.getElementById('live');
  if (!live) { live = h('div', { id: 'live', class: 'sr', 'aria-live': 'polite', 'aria-atomic': 'true' }); document.body.appendChild(live); }
  if (live.textContent !== text) live.textContent = text;
}

/* ------------------------------------------------------------ snackbar queue */

export interface SnackOpts { action?: { label: string, run: () => void }, crit?: boolean, error?: boolean, ms?: number }
const queue: Array<{ text: string, opts: SnackOpts }> = [];
let showing = false;
let snackTimer: number | undefined;

/** Material snackbars show one at a time; later ones wait. Errors are announced assertively. */
export function snackbar (text: string, opts: SnackOpts = {}) {
  // a burst of messages (e.g. a multi-step plan) keeps only the newest of the waiting ones
  if (queue.length >= 2) queue.splice(0, queue.length - 1);
  queue.push({ text, opts });
  if (!showing) nextSnack();
}

function nextSnack () {
  const item = queue.shift();
  const bar = snackEl();
  if (!item) { showing = false; bar.className = ''; document.body.classList.remove('has-snack'); return; }
  showing = true;
  const { text, opts } = item;
  const kids: Node[] = [h('span', { class: 'snack-text', role: opts.error ? 'alert' : undefined }, text)];
  if (opts.action) kids.push(button(opts.action.label, () => { dismissSnack(); opts.action!.run(); }, { cls: 'snack-action' }));
  bar.replaceChildren(...kids);
  bar.className = `show ${opts.crit ? 'crit' : ''} ${opts.error ? 'error' : ''}`;
  document.body.classList.add('has-snack');
  window.clearTimeout(snackTimer);
  // longer for actions and for anything the next message would otherwise cut short
  // end-to-end tests shorten every message with window.__snackScale: they wait for each queued one in turn
  const ms = (opts.ms ?? (opts.action ? 7000 : opts.error ? 6000 : 4000)) * ((window as any).__snackScale || 1);
  snackTimer = window.setTimeout(dismissSnack, queue.length ? Math.min(ms, 2500) : ms);
}

function snackEl (): HTMLElement {
  let bar = document.getElementById('snackbar');
  if (!bar) { bar = h('div', { id: 'snackbar', role: 'status', 'aria-live': 'polite' }); document.body.appendChild(bar); }
  return bar;
}

export function dismissSnack () {
  window.clearTimeout(snackTimer);
  const bar = snackEl();
  bar.className = '';
  document.body.classList.remove('has-snack');
  window.setTimeout(nextSnack, queue.length ? 200 : 0);
}

/* ------------------------------------------------------------ modal bottom sheet */

export interface SheetAction { label: string, run: () => void | Promise<void>, primary?: boolean, disabled?: boolean, keepOpen?: boolean }
export interface Sheet { close: () => void, panel: HTMLElement, buttons: HTMLButtonElement[] }

const openSheets: Array<(fromBack: boolean) => void> = [];
let swallowPops = 0;
let afterPops: Array<() => void> = [];

/** Run fn once history has settled (a sheet closed by a button pops its history entry asynchronously). */
export function whenSettled (fn: () => void) {
  if (swallowPops > 0) afterPops.push(fn); else fn();
}

/**
 * Android Back: the app calls this first on popstate. Closes the top sheet (true) or lets the
 * app handle navigation (false). A sheet closed by a button pops its own history entry.
 */
export function handleBack (): boolean {
  if (swallowPops > 0) {
    swallowPops -= 1;
    if (swallowPops === 0) { const fns = afterPops; afterPops = []; for (const fn of fns) fn(); }
    return true;
  }
  const top = openSheets[openSheets.length - 1];
  if (top) { top(true); return true; }
  return false;
}
/** back layers are not modal: the page around them still works */
const layers = new Set<(fromBack: boolean) => void>();
export const sheetOpen = () => openSheets.some(c => !layers.has(c));

/**
 * A place inside a screen (the Stable's barn): one history entry of its own, so Back leaves it, as it closes a
 * sheet. onLeave runs however it is left; close() is its own leave button; drop() forgets it without touching
 * history (the screen around it went away).
 */
export function backLayer (onLeave: () => void): { close (): void, drop (): void } {
  let done = false;
  const closer = (fromBack: boolean) => {
    if (done) return;
    done = true;
    const i = openSheets.indexOf(closer);
    if (i >= 0) openSheets.splice(i, 1);
    layers.delete(closer);
    if (!fromBack) { swallowPops += 1; history.back(); }
    onLeave();
  };
  openSheets.push(closer); layers.add(closer);
  history.pushState({ sheet: true, layer: true }, '');
  return {
    close: () => closer(false),
    drop: () => { if (done) return; done = true; const i = openSheets.indexOf(closer); if (i >= 0) openSheets.splice(i, 1); layers.delete(closer); },
  };
}

/** opts.onClose: after it closes, however (an action, Back, the scrim, Escape); opts.k: data-k on the panel */
export function sheet (title: string, body: Node, actions: SheetAction[] = [], opts: { onClose?: () => void, k?: string } = {}): Sheet {
  const back = document.activeElement as HTMLElement | null;
  const titleId = `sheet-${Math.random().toString(36).slice(2, 8)}`;
  const scrim = h('div', { class: 'scrim', on: { click: () => close() } });
  const buttons = actions.map(a => button(a.label, async () => {
    if (!a.keepOpen) close();
    await a.run();
  }, { cls: a.primary ? 'primary' : '', disabled: a.disabled }));
  const panel = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-k': opts.k },
    h('div', { class: 'sheet-title', id: titleId }, title),
    h('div', { class: 'sheet-body' }, body),
    buttons.length ? h('div', { class: 'sheet-actions' }, buttons) : null,
  );
  const focusables = () => [...panel.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select, a[href], [tabindex]:not([tabindex="-1"])')];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key !== 'Tab') return;
    // keep focus inside the dialog
    const f = focusables();
    if (!f.length) return;
    const first = f[0]; const last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };
  let closed = false;
  const closer = (fromBack: boolean) => {
    if (closed) return;
    closed = true;
    const i = openSheets.indexOf(closer);
    if (i >= 0) openSheets.splice(i, 1);
    if (!fromBack) { swallowPops += 1; history.back(); }
    panel.classList.remove('open'); scrim.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { panel.remove(); scrim.remove(); }, 220);
    // return focus to what opened the sheet, if it is still on the page
    if (back && document.contains(back)) back.focus({ preventScroll: true });
    opts.onClose?.();
  };
  function close () { closer(false); }
  openSheets.push(closer);
  history.pushState({ sheet: true }, '');
  document.body.append(scrim, panel);
  document.addEventListener('keydown', onKey);
  // commit the closed position first, or the browser may skip straight to the open one
  void panel.offsetHeight;
  requestAnimationFrame(() => {
    scrim.classList.add('open'); panel.classList.add('open');
    (panel.querySelector('.sheet-actions .primary:not([disabled])') as HTMLElement | null ?? focusables()[0])?.focus();
  });
  return { close, panel, buttons };
}

/* ------------------------------------------------------------ full-screen dialog (Material 2017) */

export interface Screen { close: () => void, body: HTMLElement, panel: HTMLElement }

/**
 * A full-screen dialog: its own app bar with a close button and the title, sliding up over the app. Back, Escape
 * and the close button shut it; like a sheet it has a history entry of its own. The caller fills and re-fills `body`.
 */
export function fullscreen (title: string, k: string): Screen {
  const back = document.activeElement as HTMLElement | null;
  const titleId = `screen-${Math.random().toString(36).slice(2, 8)}`;
  const closeBtn = ripple(h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Close', title: 'Close', 'data-k': `${k}-close`, on: { click: () => close() } }, icon('close')));
  const body = h('div', { class: 'screen-body' });
  const panel = h('div', { class: 'screen', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-k': k },
    h('header', { class: 'screen-bar' }, closeBtn, h('h1', { class: 'screen-title', id: titleId }, title)),
    body);
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) { e.preventDefault(); close(); } };
  let closed = false;
  const closer = (fromBack: boolean) => {
    if (closed) return;
    closed = true;
    const i = openSheets.indexOf(closer);
    if (i >= 0) openSheets.splice(i, 1);
    if (!fromBack) { swallowPops += 1; history.back(); }
    panel.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('screen-open');
    setTimeout(() => panel.remove(), 220);
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  };
  function close () { closer(false); }
  openSheets.push(closer);
  history.pushState({ sheet: true }, '');
  document.body.append(panel);
  document.addEventListener('keydown', onKey);
  void panel.offsetHeight;
  requestAnimationFrame(() => { panel.classList.add('open'); document.body.classList.add('screen-open'); closeBtn.focus({ preventScroll: true }); });
  return { close, body, panel };
}

/* ------------------------------------------------------------ full-screen form dialog (Material 2017)
 * For a form: rises from the bottom over everything, a close button and the title on the left of its bar, the one
 * action (Save) on the right. Back, Escape and the close button leave it without saving. */

export interface FullDialog { close: () => void, panel: HTMLElement, body: HTMLElement, action: HTMLButtonElement }

export function fullDialog (title: string, body: Node, opts: { action: string, run: () => Promise<boolean> | boolean, k?: string }): FullDialog {
  const back = document.activeElement as HTMLElement | null;
  const titleId = `dlg-${Math.random().toString(36).slice(2, 8)}`;
  let working = false;
  const action = h('button', {
    class: 'btn fsd-action', type: 'button', 'data-k': opts.k ? `${opts.k}-save` : undefined,
    on: { click: async () => {
      if (working) return;
      working = true; action.disabled = true; panel.classList.add('working');
      try { if (await opts.run()) close(); } finally { working = false; action.disabled = false; panel.classList.remove('working'); }
    } },
  }, opts.action);
  ripple(action);
  const shut = ripple(h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Close without saving', title: 'Close', 'data-k': opts.k ? `${opts.k}-close` : undefined, on: { click: () => close() } }, icon('close')));
  const bodyEl = h('div', { class: 'fsd-body' }, body);
  const panel = h('div', { class: 'fsd', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, 'data-k': opts.k },
    h('div', { class: 'fsd-bar' }, shut, h('h2', { class: 'fsd-title', id: titleId }, title), action, h('div', { class: 'fsd-busy', 'aria-hidden': 'true' })),
    bodyEl,
  );
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  let closed = false;
  const closer = (fromBack: boolean) => {
    if (closed) return;
    closed = true;
    const i = openSheets.indexOf(closer);
    if (i >= 0) openSheets.splice(i, 1);
    if (!fromBack) { swallowPops += 1; history.back(); }
    panel.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    document.body.classList.remove('fsd-on');
    setTimeout(() => panel.remove(), 220);
    if (back && document.contains(back)) back.focus({ preventScroll: true });
  };
  function close () { closer(false); }
  openSheets.push(closer);
  history.pushState({ sheet: true }, '');
  document.body.append(panel);
  document.body.classList.add('fsd-on');
  document.addEventListener('keydown', onKey);
  void panel.offsetHeight;
  // a new form starts in the field marked data-autofocus; an edit starts on the close button, without the keyboard
  const first = panel.querySelector<HTMLElement>('.fsd-body [data-autofocus]');
  requestAnimationFrame(() => { panel.classList.add('open'); (first ?? shut).focus({ preventScroll: true }); });
  return { close, panel, body: bodyEl, action };
}

/* ------------------------------------------------------------ simple menu (Material 2017 overflow menu) */

export interface MenuItem {
  icon: string, label: string, k: string, run?: () => void, href?: string
  /** a second line under the label */
  sub?: string
  /** a picture in place of the icon (the Stable's scene thumbnails) */
  art?: Node
  /** the current choice: marked with a check */
  checked?: boolean
  /** a divider line above this item */
  divider?: boolean
}

/**
 * A menu anchored to the button that opened it, over a clear scrim: it grows from the anchor's corner,
 * closes on a choice, a tap outside, Escape or Back, and gives focus back to the anchor.
 */
export function menu (anchor: HTMLElement, items: MenuItem[], opts: { align?: 'left' | 'right' } = {}): { close: () => void } {
  const r = anchor.getBoundingClientRect();
  const scrim = h('div', { class: 'scrim clear', on: { click: () => close() } });
  const at = opts.align === 'left' ? `left:${Math.round(r.left + 4)}px` : `right:${Math.round(window.innerWidth - r.right + 4)}px`;
  const face = (it: MenuItem) => [it.art ?? icon(it.icon), it.sub ? h('span', { class: 'menu-label' }, it.label, h('small', null, it.sub)) : it.label,
    it.checked ? icon('check', 'menu-check') : null];
  const list = h('ul', { class: `menu ${opts.align === 'left' ? 'from-left' : ''}`.trim(), role: 'menu', style: `top:${Math.round(r.top + 4)}px;${at};max-height:${Math.max(160, Math.round(window.innerHeight - r.top - 12))}px` },
    items.map(it => [it.divider ? h('li', { role: 'separator', class: 'menu-divider' }) : null, h('li', { role: 'none' }, ripple(it.href
      ? h('a', { class: 'menu-item', role: 'menuitem', href: it.href, target: '_blank', rel: 'noopener', 'data-k': it.k, on: { click: () => close() } }, face(it))
      : h('button', { class: `menu-item ${it.sub ? 'two' : ''}`.trim(), role: it.checked !== undefined ? 'menuitemradio' : 'menuitem', 'aria-checked': it.checked === undefined ? undefined : String(it.checked), type: 'button', 'data-k': it.k, on: { click: () => { close(); whenSettled(() => it.run?.()); } } }, face(it))))]));
  const entries = () => [...list.querySelectorAll<HTMLElement>('.menu-item')];
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const f = entries(); const i = f.indexOf(document.activeElement as HTMLElement);
    f[(i + (e.key === 'ArrowDown' ? 1 : f.length - 1)) % f.length]?.focus();
  };
  let closed = false;
  const closer = (fromBack: boolean) => {
    if (closed) return;
    closed = true;
    const i = openSheets.indexOf(closer);
    if (i >= 0) openSheets.splice(i, 1);
    if (!fromBack) { swallowPops += 1; history.back(); }
    list.classList.remove('open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => { list.remove(); scrim.remove(); }, 150);
    if (document.contains(anchor)) anchor.focus({ preventScroll: true });
  };
  function close () { closer(false); }
  openSheets.push(closer);
  history.pushState({ sheet: true }, '');
  document.body.append(scrim, list);
  document.addEventListener('keydown', onKey);
  void list.offsetHeight;
  requestAnimationFrame(() => { list.classList.add('open'); entries()[0]?.focus(); });
  return { close };
}

/** Strip the most common Markdown so task text reads cleanly; the result is still inserted as text. */
export function plain (s: string): string {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>]+/g, '')
    .replace(/:([a-z0-9_+-]+):/g, '')
    .trim();
}

/** Habitica's task colour bands by value. */
export function valueClass (v: number): string {
  if (v < -20) return 'v-worst';
  if (v < -10) return 'v-worse';
  if (v < -1) return 'v-bad';
  if (v < 1) return 'v-neutral';
  if (v < 5) return 'v-good';
  if (v < 10) return 'v-better';
  return 'v-best';
}

/** Habitica's asset server: only the avatar's layers still load from it (thousands of images, too many to bundle). */
export const SPRITES = 'https://habitica-assets.s3.amazonaws.com/mobileApp/images/';
const SHOP_V = shopImages.slice(0, 7);
/** icons that failed to load (an item newer than this build): their box stays reserved, empty */
const missing = new Set<string>();
/**
 * An item or skill icon, `shop_<key>`: Habitica's own 68 × 68 shop image (CC BY-NC-SA 3.0, HabitRPG), bundled in
 * public/shop/ by tools/gen-shop-icons.mjs, so it shows offline and needs no other host. Its box stays reserved
 * if it can't load, so rows don't jump.
 */
export function sprite (name: string, cls = 'sprite'): HTMLImageElement {
  const src = `shop/${name}.png?v=${SHOP_V}`;
  return h('img', {
    class: cls, alt: '', loading: 'lazy', src, style: missing.has(src) ? 'visibility:hidden' : undefined,
    on: { error: (e: Event) => { missing.add(src); (e.currentTarget as HTMLElement).style.visibility = 'hidden'; } },
  });
}

/** Short vibration if the device has one and the player allows it. */
export function buzz (pattern: number | number[]) {
  try { navigator.vibrate?.(pattern); } catch { /* not supported */ }
}
