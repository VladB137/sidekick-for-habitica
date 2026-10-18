/*
 * Settings → Notification: what the ongoing notification shows. A live preview drawn like an Android 9
 * notification with the player's real numbers (tap it to expand or collapse), Automatic or own order, the lines
 * with a switch and a drag handle each, and whether the home-screen widget shows the same.
 */
import { h, icon, ripple, snackbar, fullscreen, morphChildren, type Screen } from '../ui/dom';
import { store } from '../store';
import { native, type NativeStatus } from '../native';
import { buildLines, trimParty, trimTasks, LINE_INFO, MAX_ROWS, type LineId, type LinesInput, type LinesOut, type NightInfo } from '../lines';

let screen: Screen | undefined;
let expanded = true;
let status: () => NativeStatus | undefined = () => undefined;
/** rows on screen in the preview, so a line that appears can slide in */
let shownIds: LineId[] = [];
let dragging = false;
let off: (() => void) | undefined;
let tick = 0;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The same input the phone builds (LastRead.lines), from the app's own last read. */
function input (lines: LineId[] = store.linePrefs.lines, order = store.settings.notification.order): LinesInput {
  const raw = store.raw;
  const n = status()?.night;
  const night: NightInfo | null = n ? { on: n.on, mode: n.mode, swapAt: n.swapAt, backOn: n.backOn, backAt: n.backAt, phase: n.phase } : null;
  return {
    user: store.creds ? raw ?? null : null,
    tasks: raw ? trimTasks(store.tasks) : null,
    // the party only while the player is in a running quest, as on the phone
    party: raw?.party?.quest?.key && store.party ? trimParty(store.party) : null,
    prefs: { ...store.linePrefs, lines, order },
    night,
    now: Date.now(),
    readAt: Math.max(store.syncedAt, store.lastServerAt),
    offline: store.offline,
    tzOffsetMin: store.utcOffsetMin(),
  };
}

export function openNotificationScreen (nativeStatus: () => NativeStatus | undefined) {
  status = nativeStatus;
  shownIds = [];
  screen = fullscreen('Notification', 'notif-screen');
  const sc = screen;
  render();
  off = store.on(() => render());
  // "Read 2 min ago" and the countdown move with the clock
  tick = window.setInterval(() => { if (!sc.panel.isConnected) { stop(); return; } render(); }, 20_000);
  const stop = () => { off?.(); off = undefined; window.clearInterval(tick); };
  const watch = new MutationObserver(() => { if (!sc.panel.isConnected) { stop(); watch.disconnect(); if (screen === sc) screen = undefined; } });
  watch.observe(document.body, { childList: true });
}

function save () {
  store.saveSettings();
  render();
}

function render () {
  if (!screen || dragging) return;
  morphChildren(screen.body, [preview(), orderCard(), linesCard(), widgetCard()]);
}

/* ---------------------------------------------------------------- the preview */

const LOOK_COLOR: Record<string, string> = { CRIT: '#FFA000', OFFLINE: '#455A64', LIVE: '#00796B', CHECKING: '#00796B', NONE: '#00796B' };

function preview (): HTMLElement {
  const out: LinesOut = buildLines(input());
  const crit = out.look === 'CRIT';
  const ids = out.rows.map(r => r.id);
  const fresh = new Set(ids.filter(id => shownIds.length && !shownIds.includes(id)));
  shownIds = ids;
  const rows = expanded ? h('div', { class: 'np-rows', 'data-k': 'np-rows' },
    out.rows.map(r => h('div', { class: `np-row tone-${r.tone} ${fresh.has(r.id) && !reduced() ? 'arrive' : ''}`, 'data-k': `np-${r.id}` },
      icon(r.icon, 'np-icon'),
      r.bars?.length === 3
        ? h('div', { class: 'np-bars' }, r.bars.map((b, i) => h('div', { class: 'np-barcol', 'data-k': `bar-${i}` }, h('div', { class: 'np-label' }, b.label || ''), bar(b.value, b.max, r.tone))))
        : h('div', { class: 'np-main' }, h('div', { class: 'np-text' }, r.text), r.bars?.length ? bar(r.bars[0].value, r.bars[0].max, r.tone) : null),
    )),
    h('div', { class: 'np-footer', 'data-k': 'np-footer' }, out.footer),
    h('div', { class: 'np-actions', 'data-k': 'np-actions' }, ['Open', 'Tasks', 'Refresh'].map(a => h('span', { class: 'np-action' }, a))),
  ) : null;
  const toggle = () => { expanded = !expanded; render(); };
  return h('section', { class: 'np-wrap', 'data-k': 'np-wrap' },
    h('div', { class: 'np-caption' }, 'Preview with your numbers · tap to ', expanded ? 'collapse' : 'expand'),
    ripple(h('div', {
      class: `np ${crit ? 'crit' : ''} ${expanded ? 'expanded' : ''}`, role: 'button', tabindex: '0', 'aria-expanded': expanded ? 'true' : 'false',
      'aria-label': `Notification preview: ${out.title}. ${expanded ? 'Expanded' : 'Collapsed'}; activate to ${expanded ? 'collapse' : 'expand'}.`, 'data-k': 'np',
      style: `--look:${LOOK_COLOR[out.look] || LOOK_COLOR.LIVE}`,
      on: { click: toggle, keydown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } } },
    },
    h('div', { class: 'np-head' }, icon('bolt', 'np-small'), h('span', { class: 'np-app' }, 'Sidekick for Habitica'), h('span', { class: 'np-when' }, ` · ${out.footer.replace(/^(Offline · )?[Rr]ead /, '')}`), icon(expanded ? 'expand_less' : 'expand_more', 'np-chevron')),
    // expanded, Android shows the rows under the app name alone
    expanded ? null : h('div', { class: 'np-title' }, out.title),
    expanded ? null : h('div', { class: 'np-text1' }, out.text),
    rows)));
}

function bar (value: number, max: number, tone: string): HTMLElement {
  const p = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  return h('div', { class: `np-bar tone-${tone}` }, h('div', { class: 'np-fill', style: `transform:scaleX(${p.toFixed(3)})` }));
}

/* ---------------------------------------------------------------- order */

function orderCard (): HTMLElement {
  const n = store.settings.notification;
  return h('div', { class: 'card', 'data-k': 'np-order' },
    h('ul', { class: 'list' }, h('li', null, h('label', { class: 'li switch-row' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Most urgent first'),
        h('span', { class: 'li-sub' }, n.order === 'auto'
          ? `Automatic: ${store.relaxed ? '' : 'a crit, '}running out of HP and Dailies still open in the last hours of the day move to the top. The rest keep your order.`
          : 'Off: always your order below.')),
      h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: n.order === 'auto', 'data-k': 'np-auto',
        on: { change: (e: Event) => { n.order = (e.currentTarget as HTMLInputElement).checked ? 'auto' : 'mine'; save(); } } })))));
}

/* ---------------------------------------------------------------- the lines */

function linesCard (): HTMLElement {
  const lines = store.modeLines;
  const on = lines.filter(([, v]) => v).length;
  // the count the preview above shows, so "6 on" next to five rows reads as intended, not as a bug
  const shown = shownIds.length;
  return h('div', { class: 'card', 'data-k': 'np-lines' },
    h('div', { class: 'card-head' }, icon('notifications'), h('h2', { class: 'card-title' }, 'Lines')),
    h('div', { class: 'card-sub', 'data-k': 'np-count' }, shown < on
      ? `${on} on, ${shown} shown now: a line with nothing to say right now is left out. Up to ${MAX_ROWS} show at once; fewer with large text. Drag to reorder.`
      : `${on} on. Up to ${MAX_ROWS} show at once, fewer with large text; a line with nothing to say steps aside for the next. Drag to reorder.`),
    h('ul', { class: 'list np-list', role: 'list' }, lines.map(([id, v], i) => lineRow(id, v, i))),
    h('div', { class: 'card-body muted small' }, 'The last row always says when your numbers were read. Lines marked “1 more read” make the phone read your tasks or your party too, never sooner than 30 s after the read before.'),
  );
}

/** what the line would say right now, or, when it has nothing to say, an example */
function sample (id: LineId): HTMLElement {
  const out = buildLines(input([id], 'mine'));
  const now = out.rows[0]?.text;
  return h('span', { class: `li-sub np-sample ${now ? '' : 'example'}` }, now ?? `Example: ${LINE_INFO[id].example}`);
}

function lineRow (id: LineId, on: boolean, index: number): HTMLElement {
  const info = LINE_INFO[id];
  const all = store.modeLines;
  const set = (e: Event) => {
    const v = (e.currentTarget as HTMLInputElement).checked;
    const was = store.modeLines.filter(([, x]) => x).length;
    store.modeLines = store.modeLines.map(([k, x]) => [k, k === id ? v : x] as [LineId, boolean]);
    save();
    if (v && was >= MAX_ROWS) snackbar(`Up to ${MAX_ROWS} lines show at once, fewer with large text. Lower ones show when one above has nothing to say.`);
  };
  return h('li', { class: `np-line ${on ? '' : 'off'}`, 'data-k': `line-${id}`, 'data-id': id },
    h('label', { class: 'li switch-row' },
      icon(info.icon, 'np-line-icon'),
      h('span', { class: 'li-main' },
        h('span', { class: 'li-title' }, info.name, info.extra ? h('span', { class: 'np-extra' }, '1 more read') : null),
        sample(id)),
      h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: on, 'data-k': `np-on-${id}`, 'aria-label': info.name, on: { change: set } })),
    h('button', {
      class: 'np-handle', type: 'button', 'aria-label': `Move ${info.name} (position ${index + 1} of ${all.length}); arrow keys move it`, 'data-k': `np-move-${id}`,
      on: { pointerdown: dragStart, keydown: (e: KeyboardEvent) => keyMove(e, id) },
    }, icon('drag_indicator')));
}

function move (id: LineId, to: number) {
  const now = store.modeLines;
  const from = now.findIndex(([k]) => k === id);
  to = Math.max(0, Math.min(now.length - 1, to));
  if (from < 0 || from === to) return false;
  const lines = now.slice();
  const [it] = lines.splice(from, 1);
  lines.splice(to, 0, it);
  store.modeLines = lines;
  save();
  return true;
}

function keyMove (e: KeyboardEvent, id: LineId) {
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  e.preventDefault();
  const from = store.modeLines.findIndex(([k]) => k === id);
  if (move(id, from + (e.key === 'ArrowUp' ? -1 : 1))) {
    screen?.body.querySelector<HTMLElement>(`[data-k="np-move-${id}"]`)?.focus();
  }
}

/**
 * Drag to reorder, Material 2017 style: the row lifts (shadow) and follows the finger, the others slide out of its
 * way; let go and the order is saved. Only transforms move, so nothing re-lays out while dragging.
 */
function dragStart (e: PointerEvent) {
  if (e.button !== 0) return;
  const handle = e.currentTarget as HTMLElement;
  const li = handle.closest('li') as HTMLElement | null;
  const list = li?.parentElement;
  const scroller = handle.closest('.screen') as HTMLElement | null;
  if (!li || !list || !scroller) return;
  e.preventDefault();
  const items = [...list.children] as HTMLElement[];
  const from = items.indexOf(li);
  // positions at the start; scrolling moves them all alike, so it is added to the finger's distance
  const tops = items.map(x => x.getBoundingClientRect().top);
  const heights = items.map(x => x.getBoundingClientRect().height);
  const height = heights[from];
  const startY = e.clientY;
  const startScroll = scroller.scrollTop;
  let y = e.clientY;
  let to = from;
  let frame = 0;
  dragging = true;
  handle.setPointerCapture(e.pointerId);
  li.classList.add('dragging');
  list.classList.add('sorting');
  const layout = () => {
    const dy = y - startY + scroller.scrollTop - startScroll;
    li.style.transform = `translateY(${dy}px)`;
    const mid = tops[from] + dy + height / 2;
    to = from;
    for (let i = 0; i < items.length; i++) {
      const c = tops[i] + heights[i] / 2;
      if (i > from && mid > c) to = Math.max(to, i);
      if (i < from && mid < c) to = Math.min(to, i);
    }
    items.forEach((x, i) => {
      if (x === li) return;
      const shift = from < to && i > from && i <= to ? -height : from > to && i >= to && i < from ? height : 0;
      x.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  };
  // near the top or bottom edge the screen scrolls along, faster the closer the finger is
  const edge = () => {
    frame = 0;
    if (!dragging) return;
    const r = scroller.getBoundingClientRect();
    const top = r.top + 56 + 48; const bottom = r.bottom - 48;
    const v = y < top ? -Math.min(16, (top - y) / 3) : y > bottom ? Math.min(16, (y - bottom) / 3) : 0;
    if (v) { scroller.scrollTop += v; layout(); frame = requestAnimationFrame(edge); }
  };
  const moveTo = (ev: PointerEvent) => {
    y = ev.clientY;
    layout();
    if (!frame) frame = requestAnimationFrame(edge);
  };
  const end = () => {
    handle.removeEventListener('pointermove', moveTo);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    if (frame) cancelAnimationFrame(frame);
    dragging = false;
    list.classList.remove('sorting');
    li.classList.remove('dragging');
    for (const x of items) x.style.transform = '';
    const id = li.dataset.id as LineId;
    if (!move(id, to)) render();
  };
  handle.addEventListener('pointermove', moveTo);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/* ---------------------------------------------------------------- the widget */

function widgetCard (): HTMLElement {
  const n = store.settings.notification;
  return h('div', { class: 'card', 'data-k': 'np-widget' },
    h('ul', { class: 'list' }, h('li', null, h('label', { class: 'li switch-row' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Same for the widget'),
        h('span', { class: 'li-sub' }, store.relaxed ? 'In Relaxed mode the home-screen widget and the Quick Settings tile always show the first lines.' : 'The home-screen widget shows the first two lines, in this order, instead of the crit verdict alone.')),
      h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: n.widget || store.relaxed, disabled: store.relaxed, 'data-k': 'np-widget-on',
        on: { change: (e: Event) => { n.widget = (e.currentTarget as HTMLInputElement).checked; save(); } } })))),
    native.available ? null : h('div', { class: 'card-body muted small' }, native.android ? 'With your own account only.' : 'On the Android app only.'));
}

