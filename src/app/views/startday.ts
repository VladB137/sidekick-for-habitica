import { h, icon, plain, ripple, button, fmt } from '../ui/dom';
import { store } from '../store';
import { dayChange } from '../../engine';
import { term } from '../ui/term';
import { bossStr } from './classplan';

/** What the unticked Dailies cost when the day changes: Habitica's own damage (engine dayChange), boss share included. */
function missedCost (missed: ReturnType<typeof store.yesterdailies>): string {
  const s = store.state; const snap = store.snap;
  if (!s || !snap || !missed.length) return '';
  if (snap.sleeping) return ' · no damage, you’re resting in the Inn';
  const d = dayChange(s, missed.map(t => ({ value: t.value, priority: t.priority, checklistDone: t.checklist.filter(c => c.completed).length, checklistTotal: t.checklist.length, group: t.team })),
    { stealth: snap.stealth, bossStr: bossStr() });
  const loss = d.hpLoss + d.bossLoss;
  return loss > 0 ? `: ${d.upperBound ? 'up to ' : ''}−${loss < 10 ? loss.toFixed(1) : fmt.int(loss)} HP` : '';
}

/** Ticks survive re-renders (any sync or snackbar re-draws the screen); they belong to one pending day change. */
const ticked = new Set<string>();
let tickedFor: string | undefined;

/** Habitica's "Record Yesterday's Activity": tick the Dailies you did yesterday, then the day changes. */
export function startDayCard (): HTMLElement {
  const due = store.yesterdailies();
  // a day change since the ticks were made (e.g. from another app) makes them stale
  const day = store.snap?.lastCron || '';
  if (day !== tickedFor) { ticked.clear(); tickedFor = day; }
  for (const id of [...ticked]) if (!due.some(t => t.id === id)) ticked.delete(id);
  const label = () => (ticked.size ? `Record ${ticked.size} and start the day` : 'Start new day');
  const go = button(label(), async () => {
    const ok = await store.startDay([...ticked]);
    if (ok) ticked.clear();
  }, { kind: 'raised', disabled: store.busy || store.offline, k: 'start-day' });
  const list = h('ul', { class: 'list' }, due.map(t => {
    const on = ticked.has(t.id);
    const box = ripple(h('button', {
      class: `check ${on ? 'on' : ''}`, type: 'button', role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'aria-label': `I did “${plain(t.text)}” yesterday`, 'data-k': `y-${t.id}`,
      // a re-render updates the screen in place, so it keeps focus and scroll
      on: { click: () => { if (ticked.has(t.id)) ticked.delete(t.id); else ticked.add(t.id); store.emit(); } },
    }, icon(on ? 'check_box' : 'check_box_outline_blank')));
    return h('li', { class: 'li' }, box, h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, plain(t.text))));
  }));
  const missed = due.length - ticked.size;
  return h('div', { class: 'card action startday' },
    h('div', { class: 'card-head' }, icon('wb_sunny'), h('h2', { class: 'card-title' }, 'A new day is waiting')),
    h('div', { class: 'card-sub' }, due.length
      ? ['Tick the Dailies you did yesterday, then start the ', term('new day', 'dayChange'), ' — the same as “Record Yesterday’s Activity” in the Habitica app.']
      : 'Nothing left unchecked from yesterday. Start the new day to continue, as Habitica’s app would.'),
    due.length ? list : null,
    // after the list, in the order the card asks for; it sticks above the navigation, so it's in reach however long the list is
    h('div', { class: 'card-actions startday-actions' },
      due.length ? h('span', { class: 'muted startday-count', 'data-k': 'start-count' }, missed ? `${missed} missed${missedCost(due.filter(t => !ticked.has(t.id)))}` : 'All done') : null,
      go),
  );
}
