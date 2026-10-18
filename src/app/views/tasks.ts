import { h, icon, button, fmt, plain, valueClass, ripple, sheet } from '../ui/dom';
import { store, hpText } from '../store';
import { go } from '../nav';
import { ITEMS, type UiTask } from '../model';
import type { DropOdds, TaskPreview } from '../../engine';
import { gainOf } from './now';
import { repeatsCard, repeatMark } from './repeats';
import { streakRisks } from './history';
import { has } from '../mode';
import { foldCard } from '../ui/fold';
import { hint } from '../ui/term';

const expanded = new Set<string>();
/** While the next task crits, the one task where that crit pays most (for the chosen aim): the only amber chip. */
let bestId: string | undefined;

/**
 * What a tap gives. While a crit is waiting every task would get it, and the app bar already says so in amber;
 * the chips then show the crit-inclusive gain, and only the task where it pays most is amber.
 */
function outChip (t: UiTask, p: TaskPreview | undefined): HTMLElement | null {
  if (!p || p.error) return null;
  const txt = p.leveled ? 'level up' : `${fmt.signed(p.dExp)} XP`;
  // Relaxed: what the tap gives, plainly (the same number, never called a crit)
  if (!has('crit')) return h('span', { class: 'out' }, txt);
  const best = p.crit && t.id === bestId;
  return h('span', { class: 'row', style: 'gap:4px' },
    p.nextCrit ? h('span', { class: 'out setup', title: 'Score this, and the task after it crits' }, icon('bolt'), 'sets up crit') : null,
    best
      ? h('span', { class: 'out crit best', title: `Biggest payoff for your aim: CRIT ${fmt.mult(p.mult)}` }, icon('star'), `BEST · ${txt}`)
      : h('span', { class: `out ${p.crit ? 'crit' : ''}`, title: p.crit ? `CRIT ${fmt.mult(p.mult)}` : undefined }, txt));
}

function badges (t: UiTask): HTMLElement | null {
  if (!t.challenge && !t.team) return null;
  return h('span', { class: 'tag' }, t.team ? 'Team' : 'Challenge');
}

function checklist (t: UiTask, locked: boolean): HTMLElement | null {
  if (!t.checklist.length) return null;
  const open = expanded.has(t.id);
  const toggle = h('button', {
    class: 'btn btn-dense', type: 'button', 'aria-expanded': open ? 'true' : 'false', 'aria-label': `Checklist, ${t.checked} of ${t.checklist.length} done`, 'data-k': `cl-${t.id}`,
    on: { click: (e: Event) => { e.stopPropagation(); if (open) expanded.delete(t.id); else expanded.add(t.id); store.emit(); } },
  }, icon(open ? 'expand_less' : 'expand_more'), `${t.checked}/${t.checklist.length}`);
  return h('div', null, toggle, open ? h('ul', { class: 'checklist' }, t.checklist.map(c => h('li', null,
    ripple(h('button', {
      class: `check ${c.completed ? 'on' : ''}`, type: 'button', role: 'checkbox', 'aria-checked': c.completed ? 'true' : 'false', 'aria-label': plain(c.text), 'data-k': `ci-${t.id}-${c.id}`,
      disabled: store.sendingFor === t.id || locked || (t.type === 'todo' && t.completed), on: { click: () => store.checklist(t, c.id) },
    }, icon(c.completed ? 'check_box' : 'check_box_outline_blank'))),
    h('span', null, plain(c.text)),
  ))) : null);
}

/** Offline: the same rows with no controls at all, so nothing looks tappable. */
let readOnly = false;
/** The drop chance of scoring each open task now; a collection quest's item chance once today's drops are used up. */
let drops = new Map<string, DropOdds>();
let collecting = false;
/** every row shows its chance only when the aim is drops; otherwise just the ones that stand out */
let allDrops = false;
/** a chance at least this high stands out (1.5 × the median over the open tasks) */
let standOut = Infinity;

/** The chance a row shows: the item drop, or a collection quest's item once today's drops are used up. */
const chanceOf = (d: DropOdds) => (d.capped ? (collecting ? d.quest : 0) : d.drop);

function dropText (t: UiTask): string {
  const d = drops.get(t.id);
  if (!d || readOnly) return '';
  if (d.firstDrops) return 'first egg and potion';
  const x = chanceOf(d);
  if (!x || !(allDrops || d.crit || x >= standOut)) return '';
  const pct = fmt.pct(x, x < 0.1 ? 1 : 0);
  return d.capped ? `quest item ${pct}` : `drop ${pct}`;
}

/** 1.5 × the median chance over the open tasks: near-constant figures stay off the rows. */
function standOutAt (): number {
  const xs = [...drops.values()].map(chanceOf).filter(x => x > 0).sort((a, b) => a - b);
  if (!xs.length) return Infinity;
  const mid = xs.length >> 1;
  return 1.5 * (xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2);
}

function habitRow (t: UiTask, p: TaskPreview | undefined, paused: boolean): HTMLElement {
  if (readOnly) {
    return h('li', { class: 'li' }, h('span', { class: `vbar ${valueClass(t.value)}` }), h('span', { class: 'hbtn-space' }),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, plain(t.text), ' ', badges(t)), t.notes ? h('div', { class: 'li-sub' }, plain(t.notes)) : null));
  }
  return h('li', { class: 'li' },
    h('span', { class: `vbar ${valueClass(t.value)}` }),
    t.up ? ripple(h('button', { class: 'hbtn plus', type: 'button', 'aria-label': `Score “${plain(t.text)}” up`, 'data-k': `up-${t.id}`, disabled: store.sendingFor === t.id || paused, on: { click: () => store.score(t, 'up') } }, icon('add'))) : h('span', { class: 'hbtn-space' }),
    h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, plain(t.text), ' ', badges(t)), t.notes ? h('div', { class: 'li-sub' }, plain(t.notes)) : null,
      t.up && dropText(t) ? h('div', { class: 'li-sub small' }, dropText(t)) : null),
    h('div', { class: 'li-end' }, t.up ? outChip(t, p) : costChip(t),
      t.down ? ripple(h('button', { class: 'hbtn minus', type: 'button', 'aria-label': `Log “${plain(t.text)}” (minus)`, 'data-k': `down-${t.id}`, disabled: store.sendingFor === t.id || paused, on: { click: () => store.logDown(t) } }, icon('remove'))) : null),
  );
}

/** What logging a bad-only habit costs, from the engine's preview: grey, like the XP chips. */
let downs = new Map<string, TaskPreview>();
function costChip (t: UiTask): HTMLElement | null {
  const d = downs.get(t.id);
  if (!t.down || !d || d.error || !d.dHp) return null;
  return h('span', { class: 'out', 'data-k': `cost-${t.id}`, title: 'What logging it costs' }, hpText(d.dHp));
}

/** Dailies whose streak the coming day change resets, unless they're checked */
let atRisk = new Set<string>();

function checkRow (t: UiTask, p: TaskPreview | undefined, paused: boolean): HTMLElement {
  const done = !!t.completed;
  const notDue = t.type === 'daily' && !t.isDue;
  if (readOnly) {
    return h('li', { class: `li ${done ? 'done' : ''} ${notDue ? 'notdue' : ''}` }, h('span', { class: `vbar ${valueClass(t.value)}` }),
      h('span', { class: 'check static', role: 'img', 'aria-label': done ? 'done' : 'not done' }, icon(done ? 'check_box' : 'check_box_outline_blank')),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, plain(t.text), ' ', badges(t)), t.notes ? h('div', { class: 'li-sub' }, plain(t.notes)) : null,
        t.checklist.length ? h('div', { class: 'li-sub small' }, `Checklist ${t.checked}/${t.checklist.length}`) : null));
  }
  return h('li', { class: `li ${done ? 'done' : ''} ${notDue ? 'notdue' : ''}` },
    h('span', { class: `vbar ${valueClass(t.value)}` }),
    ripple(h('button', {
      class: `check ${done ? 'on' : ''}`, type: 'button', role: 'checkbox', 'aria-checked': done ? 'true' : 'false', 'aria-label': plain(t.text), 'data-k': `chk-${t.id}`,
      disabled: store.sendingFor === t.id || paused,
      on: { click: () => (done ? confirmUncheck(t) : store.score(t, 'up')) },
    }, icon(done ? 'check_box' : 'check_box_outline_blank'))),
    h('div', { class: 'li-main' },
      h('div', { class: 'li-title' }, plain(t.text), ' ', badges(t)),
      t.notes ? h('div', { class: 'li-sub' }, plain(t.notes)) : null,
      (() => {
        const line = [t.type === 'daily' && t.streak ? `Streak ${t.streak}${atRisk.has(t.id) ? ' at risk' : ''}` : '', notDue ? 'not due today' : '', done ? '' : dropText(t)].filter(Boolean).join(' · ');
        return line ? h('div', { class: 'li-sub small' }, line) : null;
      })(),
      t.type === 'todo' ? repeatMark(t.id) : null,
      checklist(t, paused),
    ),
    h('div', { class: 'li-end' }, done ? null : outChip(t, p)),
  );
}

function confirmUncheck (t: UiTask) {
  sheet(`Uncheck “${plain(t.text)}”?`, h('p', null, 'This reverses the score in Habitica, the same as unticking it in the official app. Use it to fix a mistaken tap.'),
    [{ label: 'Cancel', run: () => {} }, { label: 'Uncheck', primary: true, run: () => { store.score(t, 'down'); } }]);
}

function rewardRow (t: UiTask, paused: boolean): HTMLElement {
  const gp = store.state?.gp ?? 0;
  const short = t.value > gp;
  if (readOnly) return h('li', { class: 'li' }, h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, plain(t.text))), h('span', { class: 'tag' }, fmt.gold(t.value)));
  return h('li', { class: 'li' },
    h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, plain(t.text)), t.notes ? h('div', { class: 'li-sub' }, plain(t.notes)) : null,
      short ? h('div', { class: 'li-sub small' }, `needs ${fmt.gold(t.value - gp)} more`) : null),
    h('div', { class: 'li-end' }, button(fmt.gold(t.value), () => store.score(t, 'up'), {
      icon: 'monetization_on', disabled: store.sendingFor === t.id || paused || short, label: `Buy “${plain(t.text)}” for ${fmt.gold(t.value)}`, k: `buy-${t.id}`,
    })),
  );
}

/** Today's item drops, above the lists; each row then shows its own chance. */
function dropLine (): HTMLElement | null {
  const d = store.dropsLeft();
  if (!d) return null;
  return h('div', { class: 'drop-line', 'data-k': 'drop-line' }, icon('egg'), h('span', null, d.left
    ? `${d.left} of ${d.cap} item drops left today. ${store.objective === 'drops' && has('crit') ? 'Each task shows its chance.' : 'A task shows its chance when it stands out.'}`
    : `No item drops left today: all ${d.cap} found.${collecting ? ' Quest items can still turn up.' : ''}`,
  hint('Item drops', [`Habitica gives up to ${d.cap} item drops a day: eggs, hatching potions and food. Which item you get is luck; the chance of getting one is not.`,
    has('crit') ? 'A crit raises the chance. With your aim set to item drops (Settings), every task shows its chance; otherwise only the ones that stand out do.' : 'Tasks show their chance when it stands out from the rest.',
    'The count starts again with your next day.'], 'drops')));
}

export function tasksView (): HTMLElement {
  const tasks = store.tasks;
  const pv = store.previews();
  const paused = store.paused || store.offline;
  readOnly = store.offline;
  atRisk = new Set(streakRisks().filter(r => r.cover === 'none').map(r => r.id));
  drops = store.dropOdds();
  downs = store.downPreviews();
  collecting = !!store.party?.quest?.active && !!ITEMS.collectQuests?.[store.party.quest.key] && store.raw?.party?.quest?.key === store.party.quest.key;
  allDrops = store.objective === 'drops';
  standOut = standOutAt();
  // amber means verified moments ago, as in the app bar
  const open = !store.live || store.paused || !has('crit') ? [] : tasks.filter(t => { const p = pv.get(t.id); return p && !p.error && p.crit && t.type !== 'reward' && !t.completed && (t.type !== 'habit' || t.up) && (t.type !== 'daily' || t.isDue); });
  bestId = open.sort((a, b) => gainOf(pv.get(b.id)!, b, store.objective) - gainOf(pv.get(a.id)!, a, store.objective))[0]?.id;
  // every list folds; a closed one still says how much is in it, and where the best crit is
  const section = (k: string, title: string, items: HTMLElement[], empty: string, count: string, ids: string[] = []) =>
    foldCard(`tasks-${k}`, { title, sub: true, count: [bestId && ids.includes(bestId) ? icon('star', 'accent-icon') : null, count] }, [
      items.length ? h('ul', { class: 'list' }, items) : h('div', { class: 'card-body muted' }, empty)], { label: title });
  const habits = tasks.filter(t => t.type === 'habit');
  const dailies = tasks.filter(t => t.type === 'daily').sort((a, b) => Number(!a.isDue) - Number(!b.isDue) || Number(!!a.completed) - Number(!!b.completed));
  const todos = tasks.filter(t => t.type === 'todo' && !t.completed);
  const due = dailies.filter(t => t.isDue);
  const rewards = tasks.filter(t => t.type === 'reward');
  // offline: the app-wide offline banner explains it
  const note = store.offline
    ? null
    : store.dead
    ? h('div', { class: 'banner err' }, icon('favorite'), h('div', { class: 'li-main' }, 'You’re out of HP. Scoring waits until you revive.'), button('Revive', () => go('now'), { k: 'to-revive' }))
    : store.needsCron
      ? h('div', { class: 'banner warn' }, icon('wb_sunny'), h('div', { class: 'li-main' }, 'A new day is waiting. Scoring waits until it starts, so taps count for the right day.'), button('Start day', () => go('now'), { k: 'to-start' }))
      : null;
  return h('div', null,
    note,
    note || readOnly ? null : dropLine(),
    section('habits', 'Habits', habits.map(t => habitRow(t, pv.get(t.id), paused)), 'No habits.', String(habits.length), habits.map(t => t.id)),
    section('dailies', 'Dailies', dailies.map(t => checkRow(t, pv.get(t.id), paused)), 'No Dailies.', due.length ? `${due.filter(t => t.completed).length} of ${due.length} done` : 'none due', dailies.map(t => t.id)),
    section('todos', 'To-Dos', todos.map(t => checkRow(t, pv.get(t.id), paused)), 'No open To-Dos.', `${todos.length} open`, todos.map(t => t.id)),
    repeatsCard(),
    section('rewards', 'Rewards', rewards.map(t => rewardRow(t, paused)), 'No custom rewards.', rewards.length ? String(rewards.length) : ''),
  );
}
