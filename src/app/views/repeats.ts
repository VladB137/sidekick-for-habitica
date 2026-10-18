/*
 * Repeating To-Dos on screen: the card on Tasks, the "is back" banners on Now and Tasks, and the editor (a Material
 * 2017 full-screen dialog). The logic and the storage are in ../repeats.ts.
 */
import { h, icon, button, plain, ripple, sheet, snackbar, fullDialog, morphChildren, whenSettled } from '../ui/dom';
import { store } from '../store';
import { foldCard } from '../ui/fold';
import { hint } from '../ui/term';
import { go } from '../nav';
import {
  repeats, statusOf, dueNow, addNow, create, edit, remove, habiticaDay, addDays, daysBetween, dateLabel, whenLabel, every,
  PRIORITIES, MAX_DAYS, MAX_CHECKLIST, type Repeat, type Priority, type Status,
} from '../repeats';

const QUICK = [1, 3, 7, 14, 30];
const STATUS_ICON: Record<Status['kind'], string> = { open: 'event_repeat', ticked: 'schedule', first: 'schedule', due: 'notifications_active', paused: 'pause' };

/** Adding needs Habitica: online, nothing else running. */
const canAdd = () => !store.offline && !store.busy && !!store.snap;

function subline (r: Repeat, st: Status): string {
  const ev = `${every(r.everyDays).replace(/^e/, 'E')}`;
  switch (st.kind) {
    case 'open': return st.task?.completed ? `${ev} · ticked, coming back` : `${ev} · in your To-Dos`;
    case 'ticked': return `${ev} · back ${whenLabel(st.back)}`;
    case 'first': return `${ev} · first one ${whenLabel(st.back)}`;
    case 'due': return st.since === habiticaDay() ? 'Back today' : `Back since ${dateLabel(st.since)}`;
    case 'paused': return 'Paused: its copy was deleted in Habitica';
  }
}

function row (r: Repeat): HTMLElement {
  const st = statusOf(r);
  const waiting = st.kind === 'ticked' || st.kind === 'first';
  // how far along the wait is, from the tick (or from when it was made) to the day it is back
  const from = st.kind === 'ticked' ? st.done : st.kind === 'first' ? addDays(st.back, -r.everyDays) : '';
  const pct = waiting ? Math.max(0.04, Math.min(1, daysBetween(from, habiticaDay()) / Math.max(1, daysBetween(from, (st as { back: string }).back)))) : 0;
  const add = st.kind === 'due' || st.kind === 'paused';
  return h('li', { 'data-k': `rp-${r.id}` }, h('div', { class: `li rp-row s-${st.kind}` },
    h('span', { class: 'rp-icon', 'aria-hidden': 'true' }, icon(STATUS_ICON[st.kind])),
    ripple(h('button', { class: 'li-btn li-main rp-open', type: 'button', 'data-k': `rp-edit-${r.id}`, 'aria-label': `Edit “${plain(r.text)}”, ${subline(r, st)}`, on: { click: () => openEditor(r.id) } },
      h('span', { class: 'li-title' }, plain(r.text)),
      h('span', { class: 'li-sub' }, subline(r, st)),
      waiting ? h('span', { class: 'rp-progress', 'aria-hidden': 'true' }, h('span', { style: `transform:scaleX(${pct.toFixed(3)})` })) : null,
    )),
    add ? h('div', { class: 'li-end' }, button(st.kind === 'paused' ? 'Add again' : 'Add', () => { void addNow(r.id); }, {
      kind: st.kind === 'due' ? 'raised' : 'flat', disabled: !canAdd() || repeats.adding(r.id), k: `rp-add-${r.id}`, label: `Add “${plain(r.text)}” to your To-Dos`,
    })) : null,
  ));
}

/** The card on Tasks, after the To-Dos; it folds like the lists above it. */
export function repeatsCard (): HTMLElement {
  const head = { icon: 'event_repeat', title: 'Repeating To-Dos' };
  const about = hint('Repeating To-Dos', ['A To-Do that comes back a set number of days after you tick it: water the plants a week after you last did, change the sheets every two weeks.',
    'Late is fine: it just waits, with no damage. It is kept on this device, and goes into Habitica only when you tap Add.'], 'repeats');
  if (!repeats.available) {
    return foldCard('repeats', head, [
      h('div', { class: 'card-sub' }, 'To-Dos that come back a set number of days after you tick them. They need “Remember on this device”: log in again with it ticked. ', about)], { label: 'Repeating To-Dos' });
  }
  const list = [...repeats.list].sort((a, b) => order(a) - order(b) || a.text.localeCompare(b.text));
  const back = list.filter(r => statusOf(r).kind === 'due').length;
  return foldCard('repeats', { ...head, count: back ? `${back} back` : list.length ? String(list.length) : '' }, [
    list.length
      ? h('ul', { class: 'list' }, list.map(row))
      : h('div', { class: 'card-sub' }, 'To-Dos that come back a set number of days after you tick them. ', about),
    h('div', { class: 'card-actions start' }, button('New repeating To-Do', () => openEditor(), { icon: 'add', k: 'rp-new' })),
  ], { label: 'Repeating To-Dos' });
}
const ORDER: Record<Status['kind'], number> = { due: 0, paused: 1, open: 2, ticked: 3, first: 3 };
const order = (r: Repeat) => ORDER[statusOf(r).kind] * 1000 + (r.dueDay ? daysBetween(habiticaDay(), r.dueDay) : 0);

/** "Water plants is back" with its Add button, on Now and Tasks; several at once fold into one line. */
export function repeatBanners (onTasks: boolean): HTMLElement[] {
  if (!repeats.available || store.offline) return [];
  const due = dueNow();
  if (!due.length) return [];
  if (due.length > 2 && !onTasks) {
    return [h('div', { class: 'banner rp-banner', 'data-k': 'rp-banner' }, icon('notifications_active'),
      h('div', { class: 'li-main' }, `${due.length} repeating To-Dos are back.`),
      button('Show', () => go('tasks'), { k: 'rp-banner-show' }))];
  }
  if (onTasks) return []; // the card lists them with their buttons
  return due.map(r => h('div', { class: 'banner rp-banner', 'data-k': `rp-banner-${r.id}` }, icon('notifications_active'),
    h('div', { class: 'li-main' }, h('b', null, plain(r.text)), ' is back.'),
    button('Add', () => { void addNow(r.id); }, { kind: 'raised', disabled: !canAdd() || repeats.adding(r.id), k: `rp-banner-add-${r.id}`, label: `Add “${plain(r.text)}” to your To-Dos` })));
}

/** On a To-Do that is a repeating one's copy: "Comes back every 7 days". */
export function repeatMark (taskId: string): HTMLElement | null {
  const r = repeats.forTask(taskId);
  return r ? h('span', { class: 'rp-mark' }, icon('event_repeat'), `Comes back ${every(r.everyDays)}`) : null;
}

/* ---------------------------------------------------------------- the editor */

interface Form { text: string, notes: string, priority: Priority, everyDays: number, checklist: string[], from: string, now: boolean, err: string }

export function openEditor (id?: string) {
  const r = id ? repeats.find(id) : undefined;
  if (id && !r) return;
  // open To-Dos of your own that aren't a repeating one's copy yet can become one
  const candidates = r ? [] : store.tasks.filter(t => t.type === 'todo' && !t.completed && !t.challenge && !t.team && !t.noCast && !repeats.forTask(t.id));
  const f: Form = r
    ? { text: r.text, notes: r.notes, priority: r.priority, everyDays: r.everyDays, checklist: [...r.checklist], from: '', now: false, err: '' }
    : { text: '', notes: '', priority: 1, everyDays: 7, checklist: [], from: '', now: true, err: '' };
  let draftItem = '';

  const paint = () => morphChildren(dlg.body, [form()]);
  const set = (patch: Partial<Form>) => { Object.assign(f, patch); paint(); };
  const days = (n: number) => Math.max(1, Math.min(MAX_DAYS, Math.round(n) || 1));
  const addItem = (input: HTMLInputElement) => {
    const t = input.value.trim();
    if (!t || f.checklist.length >= MAX_CHECKLIST) return;
    f.checklist.push(t); draftItem = ''; input.value = '';
    paint();
    input.focus();
  };

  function form (): HTMLElement {
    const today = habiticaDay();
    const back = addDays(today, f.everyDays);
    const fromTask = candidates.find(t => t.id === f.from);
    const st = r ? statusOf(r) : undefined;
    return h('div', { class: 'rp-form', 'data-k': 'rp-form' },
      candidates.length ? h('div', { class: 'field' },
        h('select', { id: 'rp-from', 'data-k': 'rp-from', on: { change: (e: Event) => {
          const v = (e.currentTarget as HTMLSelectElement).value;
          const t = candidates.find(x => x.id === v);
          set(t ? { from: v, text: t.text, notes: t.notes, priority: (PRIORITIES.find(([p]) => p === t.priority)?.[0] ?? 1), checklist: t.checklist.map(c => c.text), err: '' } : { from: '' });
        } } },
        h('option', { value: '', selected: !f.from }, 'A new To-Do'),
        candidates.map(t => h('option', { value: t.id, selected: f.from === t.id }, plain(t.text)))),
        h('label', { for: 'rp-from' }, 'Start from')) : null,
      h('div', { class: `field ${f.err ? 'invalid' : ''}` },
        h('input', { id: 'rp-text', 'data-k': 'rp-text', placeholder: ' ', value: f.text, maxlength: 200, autocomplete: 'off', 'aria-invalid': f.err ? 'true' : undefined,
          'data-autofocus': !f.text ? '' : undefined, disabled: !!fromTask,
          on: { input: (e: Event) => { f.text = (e.currentTarget as HTMLInputElement).value; if (f.err && f.text.trim()) set({ err: '' }); } } }),
        h('label', { for: 'rp-text' }, 'Title')),
      f.err ? h('div', { class: 'field-error', role: 'alert' }, f.err) : null,
      h('div', { class: 'field' },
        h('input', { id: 'rp-notes', 'data-k': 'rp-notes', placeholder: ' ', value: f.notes, maxlength: 500, autocomplete: 'off', disabled: !!fromTask,
          on: { input: (e: Event) => { f.notes = (e.currentTarget as HTMLInputElement).value; } } }),
        h('label', { for: 'rp-notes' }, 'Notes (optional)')),

      h('h3', { class: 'rp-head' }, 'Difficulty'),
      h('div', { class: 'rp-chips', role: 'radiogroup', 'aria-label': 'Difficulty' }, PRIORITIES.map(([p, label]) => ripple(h('button', {
        class: `rp-chip ${f.priority === p ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': f.priority === p ? 'true' : 'false', 'data-k': `rp-pri-${label}`,
        disabled: !!fromTask, on: { click: () => set({ priority: p }) },
      }, label)))),

      h('h3', { class: 'rp-head' }, 'Comes back'),
      h('div', { class: 'rp-stepper' },
        ripple(h('button', { class: 'btn btn-icon rp-step', type: 'button', 'aria-label': 'One day fewer', 'data-k': 'rp-minus', disabled: f.everyDays <= 1, on: { click: () => set({ everyDays: days(f.everyDays - 1) }) } }, icon('remove'))),
        h('label', { class: 'rp-days' },
          h('input', { class: 'rp-num', type: 'number', inputmode: 'numeric', min: 1, max: MAX_DAYS, value: String(f.everyDays), 'data-k': 'rp-days', 'aria-label': 'Days after you tick it',
            on: { input: (e: Event) => { const v = Number((e.currentTarget as HTMLInputElement).value); if (v >= 1) set({ everyDays: days(v) }); },
              blur: (e: Event) => { (e.currentTarget as HTMLInputElement).value = String(f.everyDays); } } }),
          h('span', { class: 'rp-unit' }, f.everyDays === 1 ? 'day after you tick it' : 'days after you tick it')),
        ripple(h('button', { class: 'btn btn-icon rp-step', type: 'button', 'aria-label': 'One day more', 'data-k': 'rp-plus', disabled: f.everyDays >= MAX_DAYS, on: { click: () => set({ everyDays: days(f.everyDays + 1) }) } }, icon('add'))),
      ),
      h('div', { class: 'rp-chips center' }, QUICK.map(n => ripple(h('button', {
        class: `rp-chip small ${f.everyDays === n ? 'on' : ''}`, type: 'button', 'data-k': `rp-quick-${n}`, 'aria-pressed': f.everyDays === n ? 'true' : 'false',
        on: { click: () => set({ everyDays: n }) },
      }, n === 1 ? '1 day' : n === 7 ? '1 week' : n === 14 ? '2 weeks' : `${n} days`)))),
      // the rule at a glance: tick it on a day, it is back N days later
      h('div', { class: 'rp-line', 'aria-label': `Tick it today and it is back ${whenLabel(back, today)}, ${dateLabel(back)}.`, role: 'img' },
        h('span', { class: 'rp-end' }, h('span', { class: 'rp-dot' }, icon('check_box')), h('span', { class: 'small muted' }, 'Ticked'), h('b', null, 'today')),
        h('span', { class: 'rp-track' }, h('span', { class: 'rp-len' }, f.everyDays === 1 ? '1 day' : `${f.everyDays} days`)),
        h('span', { class: 'rp-end' }, h('span', { class: 'rp-dot back' }, icon('event_repeat')), h('span', { class: 'small muted' }, 'Back'), h('b', { 'data-k': 'rp-back' }, dateLabel(back))),
      ),
      h('p', { class: 'small muted rp-note' }, 'Late is fine: it waits in your To-Dos and turns red like any To-Do, with no damage at your day change.'),

      h('h3', { class: 'rp-head' }, 'Checklist'),
      f.checklist.length ? h('ul', { class: 'rp-cl' }, f.checklist.map((c, i) => h('li', { 'data-k': `rp-cl-${i}-${c}` },
        icon('check_box_outline_blank', 'muted'), h('span', { class: 'li-main' }, c),
        fromTask ? null : ripple(h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': `Remove “${c}”`, 'data-k': `rp-cl-del-${i}`, on: { click: () => { f.checklist.splice(i, 1); paint(); } } }, icon('close')))))) : null,
      fromTask ? null : h('div', { class: 'rp-cl-add' },
        h('div', { class: 'field' },
          h('input', { id: 'rp-cl-new', 'data-k': 'rp-cl-new', placeholder: ' ', maxlength: 200, autocomplete: 'off', value: draftItem, disabled: f.checklist.length >= MAX_CHECKLIST,
            on: { input: (e: Event) => { draftItem = (e.currentTarget as HTMLInputElement).value; }, keydown: (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); addItem(e.currentTarget as HTMLInputElement); } } } }),
          h('label', { for: 'rp-cl-new' }, 'Add an item')),
        ripple(h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Add the item', 'data-k': 'rp-cl-add', on: { click: (e: Event) => addItem((e.currentTarget as HTMLElement).parentElement!.querySelector('input')!) } }, icon('add')))),

      // a new one: its first copy now (the Save tap adds it), or in N days
      !r && !fromTask ? h('label', { class: 'li switch-row rp-now' },
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Add it to my To-Dos now'),
          h('span', { class: 'li-sub' }, f.now ? 'Saving adds the first one to Habitica.' : `The first one comes ${whenLabel(back, today)}, ${dateLabel(back)}.`)),
        h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: f.now, 'data-k': 'rp-now', on: { change: (e: Event) => set({ now: (e.currentTarget as HTMLInputElement).checked }) } })) : null,
      fromTask ? h('p', { class: 'notice' }, 'That To-Do becomes the first one: nothing new is added now. Its title, difficulty and checklist come back each time.') : null,

      r ? h('div', { class: 'rp-foot' },
        h('p', { class: 'small muted' }, st?.kind === 'open'
          ? 'Changes count from the next time it comes back. The copy in your To-Dos stays as it is.'
          : 'Changes count from the next time it comes back.'),
        h('div', { class: 'card-actions start' },
          st && st.kind !== 'open' ? button(st.kind === 'paused' ? 'Add again now' : 'Add now', async () => { if (await addNow(r.id)) dlg.close(); }, { icon: 'add', disabled: !canAdd(), k: 'rp-dlg-add' }) : null,
          button('Stop repeating', () => confirmRemove(r, dlg.close), { icon: 'delete', cls: 'danger', k: 'rp-delete' }))) : null,
    );
  }

  const dlg = fullDialog(r ? 'Repeating To-Do' : 'New repeating To-Do', h('div'), {
    action: 'Save', k: 'rp-dialog',
    run: async () => {
      const text = f.text.trim();
      if (!text) { set({ err: 'Give it a title.' }); dlg.body.querySelector<HTMLInputElement>('#rp-text')?.focus(); return false; }
      const pending = draftItem.trim();
      if (pending && f.checklist.length < MAX_CHECKLIST) { f.checklist.push(pending); draftItem = ''; }
      const draft = { text, notes: f.notes, priority: f.priority, checklist: f.checklist, everyDays: f.everyDays };
      if (r) return edit(r.id, draft);
      const from = f.from || undefined;
      if (!from && f.now && store.offline) { snackbar('You’re offline. Turn off “Add it to my To-Dos now”, or try again when you’re back.', { error: true }); return false; }
      return create(draft, { from, now: f.now });
    },
  });
  paint();
  dlg.body.querySelector<HTMLElement>('[data-autofocus]')?.focus({ preventScroll: true });
}

function confirmRemove (r: Repeat, after: () => void) {
  sheet(`Stop repeating “${plain(r.text)}”?`, h('p', null, r.taskId && !r.doneDay
    ? 'It is deleted from this device and won’t come back. The copy in your To-Dos stays as a plain To-Do.'
    : 'It is deleted from this device and won’t come back.'),
  // the sheet's own Back entry goes first, then the dialog's
  [{ label: 'Cancel', run: () => {} }, { label: 'Stop repeating', primary: true, run: () => whenSettled(() => { after(); void remove(r.id); }) }]);
}
