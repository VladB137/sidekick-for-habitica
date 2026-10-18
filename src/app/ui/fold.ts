/*
 * A card that folds: its header is a <summary>, tap it to open or close. Whether each card is open is
 * remembered on this device (one small map in localStorage), so a card you closed stays closed.
 * morph() keeps a <details>'s open state as the player left it, so re-renders never fight a tap.
 */
import { h, icon } from './dom';

const KEY = 'critoracle:v2:folds';
let saved: Record<string, boolean> | undefined;
function all (): Record<string, boolean> {
  if (!saved) {
    try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); saved = v && typeof v === 'object' ? v : {}; } catch { saved = {}; }
  }
  return saved!;
}

/** Whether the card keyed `k` is open: as the player last left it, else `def`. */
export function foldOpen (k: string, def = true): boolean {
  const v = all()[k];
  return typeof v === 'boolean' ? v : def;
}

function remember (k: string, open: boolean) {
  const m = all();
  if (m[k] === open) return;
  m[k] = open;
  try { localStorage.setItem(KEY, JSON.stringify(m)); } catch { /* private mode or full */ }
}

type Child = Node | string | null | undefined | false | Child[];
export interface FoldHead {
  title: string
  icon?: string
  /** a short summary kept in the header, so a closed card still says what's inside ("3 of 5 done") */
  count?: Child
  /** the small grey list header (Tasks, History) instead of a card title */
  sub?: boolean
}

/** A folding card keyed `k` (also its data-k). Open the first time unless `open: false`. */
export function foldCard (k: string, head: FoldHead, body: Child[], opts: { open?: boolean, cls?: string, label?: string, headK?: string } = {}): HTMLElement {
  return h('details', {
    class: `card fold ${head.sub ? 'fold-sub' : ''} ${opts.cls || ''}`.replace(/\s+/g, ' ').trim(), 'data-k': k, 'aria-label': opts.label,
    open: foldOpen(k, opts.open ?? true),
    on: { toggle: (e: Event) => remember(k, (e.currentTarget as HTMLDetailsElement).open) },
  },
  h('summary', { class: head.sub ? 'subheader fold-summary' : 'card-head', 'data-k': opts.headK || `${k}-sum` },
    head.icon ? icon(head.icon) : null,
    h('h2', { class: head.sub ? 'fold-name' : 'card-title' }, head.title),
    head.count !== undefined && head.count !== null && head.count !== false ? h('span', { class: 'fold-count' }, head.count as any) : null,
    icon('expand_more', 'chev')),
  h('div', { class: 'fold-body' }, body as any));
}
