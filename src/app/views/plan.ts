import { h, icon, plain } from '../ui/dom';
import { store } from '../store';

/** Milestone 1: the day planner isn't wired into the app yet; the Tasks tab already marks free crit set-ups. */
export function planView (): HTMLElement {
  const pv = store.previews();
  const setups = store.paused ? [] : store.tasks.filter(t => pv.get(t.id)?.nextCrit && (t.type !== 'daily' || t.isDue));
  return h('div', null,
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, icon('event_note'), h('h2', { class: 'card-title' }, 'Plan today’s taps')),
      h('div', { class: 'card-body' },
        h('p', null, 'Coming in the next update: tell Sidekick what you’ve done today and it orders the scoring so as many as possible crit, using your class skills and the levers you allow.'),
        h('p', { class: 'muted' }, 'The planner already exists and has been replayed through Habitica’s own code; on typical days it gets 27–42% more out of the same tasks than tapping in random order. It needs its own screen first.'),
      )),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, icon('bolt'), h('h2', { class: 'card-title' }, 'Free set-ups right now')),
      setups.length
        ? h('ul', { class: 'list' }, setups.map(t => h('li', { class: 'li' }, h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, plain(t.text)), h('div', { class: 'li-sub' }, 'Already done? Score it first and the task after it crits.')))))
        : h('div', { class: 'card-body muted' }, 'None of your open tasks sets up a crit for the tap after it right now.'),
    ),
  );
}
