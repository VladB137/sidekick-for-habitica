/*
 * Choosing who talks on Now (Vlad, 2026-10-17): the player's avatar, or any pet or mount the account owns. The
 * Stable's picker, one choice instead of ten: a "You" tile for the avatar, then Pets and Mounts tabs grouped by
 * species, with search. Saved in Settings (store.settings.speaker), on this phone only.
 */
import { h, icon, ripple, fullDialog } from '../ui/dom';
import { creaturePic, speciesName } from '../ui/creature';
import { avatarFigure, speakerName, speakerOf, type SpeakerId } from '../ui/speaker';
import { spriteMeta } from '../../stable/sprites';
import { creatureName, keyOf, kindOf, known, owned, type CreatureId, type StableItems } from '../stable/picks';
import { loadNames, nameOf } from '../stable/names';
import { store } from '../store';

export function openSpeakerPicker () {
  const items = store.raw?.items as StableItems | undefined;
  const names = loadNames(store.snap?.userId);
  let chosen: SpeakerId = speakerOf(store.settings.speaker, items);
  const offer = [...(owned(items) ?? [])].filter(known);
  const groups = (kind: 'pet' | 'mount') => {
    const by = new Map<string, CreatureId[]>();
    for (const id of offer) {
      if (kindOf(id) !== kind) continue;
      const sp = spriteMeta(kind, keyOf(id))!.species;
      if (!by.has(sp)) by.set(sp, []);
      by.get(sp)!.push(id);
    }
    return [...by.entries()].map(([sp, ids]) => [speciesName(sp, kind), ids.sort((a, b) => creatureName(a).localeCompare(creatureName(b)))] as const)
      .sort((a, b) => a[0].localeCompare(b[0]));
  };
  const pets = groups('pet'), mounts = groups('mount');
  const n = (g: typeof pets) => g.reduce((a, [, ids]) => a + ids.length, 0);
  // open on the tab that holds the current choice
  let tab: 'pet' | 'mount' = chosen !== 'avatar' ? kindOf(chosen) : n(pets) || !n(mounts) ? 'pet' : 'mount';
  let query = '';

  const tiles = new Map<SpeakerId, HTMLButtonElement>();
  const tile = (who: SpeakerId, pic: Element) => {
    const t = ripple(h('button', {
      class: 'pk-tile', type: 'button', role: 'radio', 'data-k': `sp-${who}`, title: speakerName(who), 'aria-label': speakerName(who),
      on: { click: () => { chosen = who; refresh(); } },
    }, pic, h('span', { class: 'pk-ck', 'aria-hidden': 'true' }, icon('check'))));
    tiles.set(who, t);
    return t;
  };
  const you = h('section', { class: 'pk-group sp-you', role: 'radiogroup', 'aria-label': 'You' },
    h('h3', { class: 'pk-head' }, 'You'),
    h('div', { class: 'pk-tiles' }, tile('avatar', store.raw ? avatarFigure(store.raw, 1, 'sp-avatar-pic') : icon('person'))));
  const panes = {
    pet: h('div', { class: 'pk-pane', role: 'tabpanel', id: 'sp-pane-pet', 'aria-labelledby': 'sp-tab-pet' }),
    mount: h('div', { class: 'pk-pane', role: 'tabpanel', id: 'sp-pane-mount', 'aria-labelledby': 'sp-tab-mount', hidden: true }),
  };
  /** tiles are built the first time their tab shows, then only filtered */
  const built = { pet: false, mount: false };
  const build = (kind: 'pet' | 'mount') => {
    if (built[kind]) return;
    built[kind] = true;
    const g = kind === 'pet' ? pets : mounts;
    panes[kind].append(...(g.length ? g.map(([label, ids]) => h('section', { class: 'pk-group', role: 'radiogroup', 'aria-label': label, 'data-group': label },
      h('h3', { class: 'pk-head' }, label), h('div', { class: 'pk-tiles' }, ids.map(id => tile(id, creaturePic(id, 60))))))
      : [h('p', { class: 'pk-none' }, kind === 'pet'
        ? 'No pets yet. Pets hatch in Habitica from an egg and a hatching potion, and the ones you have show up here.'
        : 'No mounts yet. Feed a pet in Habitica until it grows into a mount, and it shows up here.')]));
  };
  const tabBtn = (kind: 'pet' | 'mount', label: string) => ripple(h('button', {
    class: 'pk-tab', type: 'button', role: 'tab', id: `sp-tab-${kind}`, 'aria-controls': `sp-pane-${kind}`, 'data-k': `sp-tab-${kind}`,
    on: { click: () => { tab = kind; refresh(); } },
  }, label));
  const tabs = { pet: tabBtn('pet', `Pets · ${n(pets)}`), mount: tabBtn('mount', `Mounts · ${n(mounts)}`) };
  const search = h('input', {
    class: 'pk-search-in', type: 'search', placeholder: 'Search', 'aria-label': 'Search your pets and mounts', autocomplete: 'off', 'data-k': 'sp-search',
    on: { input: () => { query = search.value.trim().toLocaleLowerCase(); refresh(); } },
  });
  const body = h('div', { class: 'pk' },
    h('div', { class: 'pk-top' },
      h('div', { class: 'pk-tabs', role: 'tablist' }, tabs.pet, tabs.mount),
      h('label', { class: 'pk-search' }, icon('search'), search)),
    you, panes.pet, panes.mount);

  function refresh () {
    build(tab);
    for (const k of ['pet', 'mount'] as const) {
      panes[k].hidden = k !== tab;
      tabs[k].setAttribute('aria-selected', String(k === tab));
      tabs[k].tabIndex = k === tab ? 0 : -1;
    }
    search.placeholder = tab === 'pet' ? 'Search your pets' : 'Search your mounts';
    for (const [who, t] of tiles) {
      t.classList.toggle('sel', who === chosen);
      t.setAttribute('aria-checked', String(who === chosen));
      // by Habitica's name or its own
      t.hidden = who !== 'avatar' && !!query && !`${creatureName(who)}\n${nameOf(names, who)}`.toLocaleLowerCase().includes(query);
    }
    you.hidden = !!query;
    for (const g of panes[tab].querySelectorAll<HTMLElement>('.pk-group')) g.hidden = ![...g.querySelectorAll<HTMLElement>('.pk-tile')].some(t => !t.hidden);
  }
  refresh();

  const dlg = fullDialog('Who talks on Now', body, {
    action: 'Save', k: 'sp',
    run: () => {
      const next = chosen === 'avatar' ? undefined : chosen;
      if (next !== store.settings.speaker) {
        if (next) store.settings.speaker = next; else delete store.settings.speaker;
        store.saveSettings();
      }
      return true;
    },
  });
  dlg.panel.classList.add('pk-dialog');
}

/** Settings' row: who talks now, with their picture; a tap opens the chooser. */
export function speakerRow (): HTMLElement {
  const who = speakerOf(store.settings.speaker, store.raw?.items as StableItems | undefined);
  const pic = who === 'avatar'
    ? (store.raw ? avatarFigure(store.raw, 0.6, 'set-speaker-pic') : icon('person'))
    : creaturePic(who, 40);
  return h('li', null, ripple(h('button', { class: 'li li-btn sp-row', type: 'button', 'data-k': 'set-speaker', on: { click: () => openSpeakerPicker() } },
    h('span', { class: 'sp-row-pic', 'aria-hidden': 'true' }, pic),
    h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Who talks on Now'), h('span', { class: 'li-sub', 'data-k': 'set-speaker-who' }, speakerName(who))),
    icon('chevron_right'))));
}
