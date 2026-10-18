/*
 * The Stable's own controls around the meadow (design spec §06): a thin toolbar (the playground's name opens the
 * switcher menu; the count; the postcard; the picker), the row of residents under the meadow (each a real button, so TalkBack
 * reaches every creature), the creature sheet (Name, Find, Pet, Move, Remove) and its Name dialog, the picker (a full-screen dialog with
 * Pets and Mounts tabs, search and the chosen creatures as chips) and the scene chooser (New playground, Change scene).
 *
 * All of it stays inside the Stable screen. It only changes the phone's own record (picks.ts) through
 * hooks.commit; the one thing that reaches Habitica is a mount sheet's Ride or Get off, through hooks.ride.
 */
import { h, icon, ripple, sheet, menu, fullDialog, snackbar, whenSettled, button } from '../ui/dom';
import { spriteMeta } from '../../stable/sprites';
import { SCENES, SCENE_IDS, paintSceneCanvas, timeOfDay, seasonOf, southernRegion, moonPhase, type SceneId } from '../../playground/scenes';
import { store } from '../store';
import { grownFor, grownPercent, growthRows, openDailies, trophyProgress } from './growth';
import {
  MAX_RESIDENTS, addPlayground, byId, changeScene, choose, creatureName, currentOf, deletePlayground, freeScenes, keyOf, kindOf, known,
  moveTo, nameOf, open, owned, pgName, remove, whereIs,
  type CreatureId, type StableItems, type StableState,
} from './picks';
import { MAX_NAME, called, calledFull, cleanName, daysSince, localDay, nameOf as ownName, type Names } from './names';
import { candidates } from './naming';
import { aboutLine } from './social';
import { creaturePic, speciesName } from '../ui/creature';

/** toolbar and residents row heights, CSS px: the meadow's ground is drawn between them */
export const BAR_H = 48;
export const ROW_H = 64;

export interface ChromeHooks {
  state (): StableState;
  items (): StableItems | undefined;
  /** keep this as the new arrangement; with undo, a snackbar names the change and can put the old one back */
  commit (next: StableState, undo?: string): void;
  pet (id: CreatureId): void;
  find (id: CreatureId): void;
  /** the mount the latest read says the player rides, if the Stable knows it */
  riding (): CreatureId | undefined;
  /** the app's look: Ride works only when it's live */
  look (): 'live' | 'checking' | 'offline';
  /** Ride (on) or Get off: the one Habitica call (§07) */
  ride (id: CreatureId, on: boolean): void;
  /** creatures' names (names.ts) */
  names (): Names;
  /** the player names one ('' = Habitica's name for it) */
  rename (id: CreatureId, name: string): void;
  /** freeze the meadow and offer it as a postcard (postcard.ts) */
  postcard (): void;
  /** go into the barn (it says why not when it's shut) */
  barn (): void;
  /** why the barn is shut ('' when it's open) */
  barnShut (): string;
}

/** Mounts are drawn with room around them: in the small round chips they get a bigger box (clipped by the chip). */
const pictureBox = (id: CreatureId, box: number) => (kindOf(id) === 'mount' ? Math.round(box * 1.5) : box);

/** the thumbnail in art pixels, the Stats card's size (smaller ones crowd the scene's trees); shown scaled down */
const THUMB = { w: 96, h: 54 };
const thumbs = new Map<string, string>();
/** A still picture of a scene at this hour and season, kept as an image. */
export function sceneThumb (scene: SceneId): HTMLImageElement {
  const now = new Date(), growth = grownFor(store.snap?.userId, store.raw, store.tasks);
  const key = `${scene}|${timeOfDay(now)}|${seasonOf(now, southernRegion())}|${moonPhase(now)}|${JSON.stringify(growth)}`;
  let url = thumbs.get(key);
  if (url === undefined) {
    try {
      const { canvas } = paintSceneCanvas(THUMB.w, THUMB.h, { scene, growth, now: () => now });
      const out = document.createElement('canvas');
      out.width = THUMB.w; out.height = THUMB.h;
      out.getContext('2d')!.drawImage(canvas, 0, 0);
      url = out.toDataURL('image/png');
    } catch { url = ''; }
    thumbs.set(key, url);
  }
  return h('img', { class: 'scene-thumb', src: url || undefined, alt: '', width: String(THUMB.w), height: String(THUMB.h) });
}

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ---- the toolbar and the residents row */

export function makeChrome (el: HTMLElement, hooks: ChromeHooks) {
  const name = h('span', { class: 'pg-name' });
  const switcher = ripple(h('button', {
    class: 'pg-switch', type: 'button', 'aria-haspopup': 'menu', 'data-k': 'pg-switch',
    on: { click: () => openSwitcher(switcher) },
  }, name, icon('arrow_drop_down')));
  const tally = h('span', { class: 'pg-count', 'data-k': 'pg-count' });
  const pickBtn = ripple(h('button', {
    class: 'btn btn-icon', type: 'button', 'aria-label': 'Choose who lives here', title: 'Choose who lives here', 'data-k': 'pg-picker',
    on: { click: () => openPicker() },
  }, icon('pets')));
  const cardBtn = ripple(h('button', {
    class: 'btn btn-icon', type: 'button', 'aria-label': 'Make a postcard', title: 'Make a postcard', 'data-k': 'pg-postcard',
    on: { click: () => hooks.postcard() },
  }, icon('photo_camera')));
  const bar = h('div', { class: 'pg-bar', 'data-k': 'pg-bar' }, switcher, tally, cardBtn, pickBtn);
  const row = h('div', { class: 'pg-row', role: 'list', 'aria-label': 'Who lives here', 'data-k': 'pg-row' });
  el.append(bar, row);

  let drawn = '';
  function render () {
    const s = hooks.state(), pg = currentOf(s), riding = hooks.riding();
    const nm = hooks.names();
    const key = JSON.stringify([pg.id, pgName(pg), pg.residents.map(r => [r.id, ownName(nm, r.id)]), riding]);
    if (key === drawn) return;
    drawn = key;
    name.textContent = pgName(pg);
    switcher.setAttribute('aria-label', `${pgName(pg)}. Switch playground`);
    tally.textContent = `${pg.residents.length} of ${MAX_RESIDENTS}`;
    const had = (document.activeElement as HTMLElement | null)?.closest?.('.pg-row') ? (document.activeElement as HTMLElement).dataset.k : undefined;
    row.replaceChildren(
      ...pg.residents.map(r => h('div', { role: 'listitem', class: r.id === riding ? 'ridden' : undefined }, ripple(h('button', {
        class: 'pg-chip', type: 'button', 'data-k': `pg-chip-${r.id}`, title: calledFull(nm, r.id),
        'aria-label': r.id === riding ? `${calledFull(nm, r.id)}, you’re riding it` : calledFull(nm, r.id),
        on: { click: () => openCreature(r.id) },
      }, creaturePic(r.id, pictureBox(r.id, 34)))), r.id === riding ? h('span', { class: 'pg-saddle', 'data-k': 'pg-saddle', 'aria-hidden': 'true' }, icon('check')) : '')),
      pg.residents.length < MAX_RESIDENTS ? h('div', { role: 'listitem' }, ripple(h('button', {
        class: 'pg-chip add', type: 'button', 'aria-label': 'Add creatures', title: 'Add creatures', 'data-k': 'pg-add', on: { click: () => openPicker() },
      }, icon('add')))) : '',
    );
    if (had) row.querySelector<HTMLElement>(`[data-k="${CSS.escape(had)}"]`)?.focus({ preventScroll: true });
  }

  /* ---- switching playgrounds */
  function openSwitcher (anchor: HTMLElement) {
    const s = hooks.state(), pg = currentOf(s);
    const full = !freeScenes(s).length;
    const allUsed = () => snackbar('Every scene has its playground already. Delete one to use its scene again.');
    menu(anchor, [
      ...s.playgrounds.map(p => ({
        icon: '', art: h('span', { class: 'menu-art' }, sceneThumb(p.scene)), label: pgName(p), sub: count(p.residents.length, 'creature'),
        checked: p.id === pg.id, k: `pg-open-${p.id}`, run: () => hooks.commit(open(hooks.state(), p.id)),
      })),
      { divider: true, icon: 'add', label: 'New playground', sub: full ? 'One per scene: all in use' : undefined, k: 'pg-new',
        run: () => full ? allUsed() : whenSettled(() => sceneForm('new')) },
      { icon: 'landscape', label: 'Change scene', sub: full ? 'Every scene is in use' : undefined, k: 'pg-scene',
        run: () => full ? allUsed() : whenSettled(() => sceneForm('scene')) },
      ...(s.playgrounds.length > 1 ? [{ icon: 'delete', label: 'Delete playground', k: 'pg-delete', run: () => {
        const now = hooks.state(), p = currentOf(now), next = deletePlayground(now, p.id);
        if (next) hooks.commit(next, `${pgName(p)} deleted.`);
      } }] : []),
      { divider: true, icon: 'yard', label: 'What grows here', k: 'pg-grows', run: () => whenSettled(() => openGrowth()) },
      { icon: 'warehouse', label: 'Go into the barn', sub: hooks.barnShut() || undefined, k: 'pg-barn', run: () => whenSettled(() => hooks.barn()) },
    ], { align: 'left' });
  }

  /**
   * New playground and Change scene: a playground is its scene, so the form is only the scenes no other
   * playground uses (and, for Change scene, the one it has). Changing the scene changes the name with it.
   */
  function sceneForm (mode: 'new' | 'scene') {
    const s = hooks.state(), pg = currentOf(s);
    const offer = mode === 'new' ? freeScenes(s) : SCENE_IDS.filter(id => id === pg.scene || freeScenes(s).includes(id));
    let scene: SceneId = mode === 'new' ? offer[0] : pg.scene;
    const tiles = offer.map(id => ripple(h('button', {
      class: 'sc-tile', type: 'button', role: 'radio', 'aria-checked': String(id === scene), 'data-k': `pg-sc-${id}`,
      on: { click: () => pick(id) },
    }, sceneThumb(id), h('span', null, SCENES[id].name))));
    function pick (id: SceneId) {
      scene = id;
      tiles.forEach((t, i) => t.setAttribute('aria-checked', String(offer[i] === id)));
    }
    const body = h('div', { class: 'pg-form' },
      h('p', { class: 'pg-form-sub' }, mode === 'new'
        ? 'One playground per scene. Every scene grows from the same Habitica numbers.'
        : `Who lives in ${pgName(pg)} moves along. One playground per scene, so scenes in use aren’t offered.`),
      h('div', { class: 'sc-grid', role: 'radiogroup', 'aria-label': 'Scene' }, tiles));
    fullDialog(mode === 'new' ? 'New playground' : 'Change scene', body, {
      action: 'Save', k: 'pg-form',
      run: () => {
        const now = hooks.state();
        if (mode === 'new') { const next = addPlayground(now, scene); if (next) hooks.commit(next); return true; }
        if (byId(now, pg.id)?.scene === scene) return true;
        const next = changeScene(now, pg.id, scene);
        if (next) hooks.commit(next, `${nameOf(now, pg.id, 'The playground')} is now ${SCENES[scene].name}.`);
        return true;
      },
    });
  }

  /* ---- what grows here: each Habitica number, where the account is, and the next stage */
  function openGrowth () {
    const pg = currentOf(hooks.state()), now = new Date();
    const read = store.syncedAt > 0 || store.tasks.length > 0;
    const g = grownFor(store.snap?.userId, store.raw, store.tasks);
    const rows = growthRows(g, pg.scene, read ? openDailies(store.tasks) : undefined, { winter: seasonOf(now, southernRegion()) === 'winter', progress: trophyProgress(store.raw) });
    // how far each part has grown, as a bar (the whole playground as one number above)
    const bar = (label: string, p: number) => h('div', { class: 'bar pg-grows-bar', role: 'meter', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.floor(p * 100)) },
      h('span', { style: `transform:scaleX(${p.toFixed(3)})` }));
    const pct = grownPercent(g);
    const body = h('div', { class: 'pg-sheet pg-grows', 'data-k': 'pg-grows-sheet' },
      h('p', { class: 'li-sub pg-grows-intro' }, `${pgName(pg)} grows from numbers your Habitica account already has. What has grown stays, even if a number goes down.`),
      h('div', { class: 'pg-grows-total', 'data-k': 'pg-grows-total' }, h('span', { class: 'li-title' }, pct >= 100 ? 'Fully grown' : `${pct}% grown`), bar('The whole playground', pct / 100)),
      h('ul', { class: 'list' }, rows.map(r => h('li', { class: 'li', 'data-k': `pg-grows-${r.part}` }, icon(r.icon),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, r.title), h('span', { class: 'li-sub' }, r.now),
          r.progress === undefined ? null : bar(r.title, r.progress), h('span', { class: 'li-sub' }, r.next))))));
    sheet('What grows here', body);
  }

  /* ---- one creature: Find, Pet, Move, Remove */
  function openCreature (id: CreatureId) {
    const s = hooks.state(), home = whereIs(s, id);
    if (!home) return;
    const names = hooks.names(), own = ownName(names, id);
    const days = daysSince(names[id]?.since, localDay());
    // Habitica's word for it and its strongest bond here (thread "Pets together")
    const about = aboutLine(id, home.residents.map(p => p.id), o => called(names, o), o => speciesName(spriteMeta(kindOf(o), keyOf(o))?.species ?? '', kindOf(o)));
    let sh: ReturnType<typeof sheet> | undefined;
    const item = sheetItem(() => sh?.close());
    const ride = rideItem(id, item);
    const body = h('div', { class: 'pg-sheet' },
      h('div', { class: 'pg-sheet-head' }, h('div', { class: 'pg-sheet-art' }, creaturePic(id, 64)),
        h('div', { class: 'pg-sheet-who' },
          h('div', { class: 'li-sub', 'data-k': 'pg-sheet-kind' }, `${own ? creatureName(id, true) : kindOf(id) === 'mount' ? 'Mount' : 'Pet'} · lives in ${pgName(home)}`),
          days === undefined ? null : h('div', { class: 'li-sub', 'data-k': 'pg-sheet-days' }, days === 0 ? 'Joined your playgrounds today' : `In your playgrounds for ${days === 1 ? '1 day' : `${days} days`}`),
          about ? h('div', { class: 'li-sub', 'data-k': 'pg-sheet-about' }, about) : null)),
      h('ul', { class: 'list' },
        item('edit', 'Name', 'pg-rename', () => openRename(id), own || `Habitica’s name: ${creatureName(id)}`),
        item('my_location', 'Find in the meadow', 'pg-find', () => hooks.find(id)),
        item('favorite', 'Pet', 'pg-pet', () => hooks.pet(id)),
        ride,
        item('swap_horiz', 'Move to another playground', 'pg-move', () => openMove(id)),
        item('close', `Remove from ${pgName(home)}`, 'pg-remove', () => hooks.commit(remove(hooks.state(), id), `${called(names, id)} left ${pgName(home)}.`), 'It stays in your Habitica stable.')));
    sh = sheet(own || creatureName(id, true), body);
  }

  /** a sheet's list item; tapping it closes the sheet, then runs */
  const sheetItem = (close: () => void) => (ic: string, label: string, k: string, run: () => void, sub?: string, off = false) => h('li', null, ripple(h('button', {
    class: 'li li-btn', type: 'button', 'data-k': k, disabled: off, on: { click: () => { close(); whenSettled(run); } },
  }, icon(ic), h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, label), sub ? h('span', { class: 'li-sub' }, sub) : null))));

  /** a mount's Ride, or Get off for the one ridden: only in the Live look (§07) */
  function rideItem (id: CreatureId, item: ReturnType<typeof sheetItem>) {
    const look = hooks.look(), on = hooks.riding() === id;
    return kindOf(id) !== 'mount' ? null
      : look === 'offline' ? item('airline_seat_recline_normal', 'Ride', 'pg-ride', () => undefined, 'Riding needs Habitica. You’re offline.', true)
        : look === 'checking' ? item(on ? 'directions_walk' : 'airline_seat_recline_normal', on ? 'Get off' : 'Ride', on ? 'pg-getoff' : 'pg-ride', () => undefined, 'Waiting for Habitica', true)
          : on ? item('directions_walk', 'Get off', 'pg-getoff', () => hooks.ride(id, false), 'You’re riding this mount.')
            : item('airline_seat_recline_normal', 'Ride', 'pg-ride', () => hooks.ride(id, true), 'Your avatar rides it in Habitica.');
  }

  /** a mount's stall in the barn: its sheet with Ride, and where it lives if it lives in a playground */
  function openStall (id: CreatureId) {
    const own = ownName(hooks.names(), id), home = whereIs(hooks.state(), id);
    let sh: ReturnType<typeof sheet> | undefined;
    const body = h('div', { class: 'pg-sheet' },
      h('div', { class: 'pg-sheet-head' }, h('div', { class: 'pg-sheet-art' }, creaturePic(id, 64)),
        h('div', { class: 'pg-sheet-who' },
          h('div', { class: 'li-sub', 'data-k': 'pg-sheet-kind' }, `${own ? creatureName(id, true) : 'Mount'} · ${home ? `lives in ${pgName(home)}` : 'in its stall'}`))),
      h('ul', { class: 'list' }, rideItem(id, sheetItem(() => sh?.close()))));
    sh = sheet(own || creatureName(id, true), body);
  }

  /**
   * Its name: typed, one of three ideas from the list (Shuffle for three more), or Habitica's name for it. Up to
   * 12 letters the meadow's pixel font can write (it shows over the creature's head when it's tapped).
   */
  function openRename (id: CreatureId) {
    const names = hooks.names(), now = ownName(names, id);
    const taken = new Set(Object.entries(names).filter(([k]) => k !== id).map(([, r]) => r.name.toLocaleLowerCase()));
    const ideas = candidates(id, `${store.snap?.userId ?? ''}:ideas`).filter(n => !taken.has(n.toLocaleLowerCase()) && n !== now);
    let at = 0;
    const input = h('input', {
      id: 'nm-text', 'data-k': 'nm-text', placeholder: ' ', value: now, maxlength: MAX_NAME, autocomplete: 'off', autocapitalize: 'words', spellcheck: false,
      'data-autofocus': '', on: { input: () => check() },
    });
    const help = h('div', { class: 'field-help', 'data-k': 'nm-help', 'aria-live': 'polite' });
    const field = h('div', { class: 'field' }, input, h('label', { for: 'nm-text' }, 'Name'));
    const row = h('div', { class: 'nm-ideas', 'data-k': 'nm-ideas' });
    function check () {
      const v = input.value;
      const c = v.trim() ? cleanName(v) : undefined;
      const bad = c && 'error' in c ? c.error : '';
      field.classList.toggle('invalid', !!bad);
      input.setAttribute('aria-invalid', bad ? 'true' : 'false');
      help.classList.toggle('bad', !!bad);
      help.textContent = bad || `Up to ${MAX_NAME} letters. It shows over its head when you tap it.`;
    }
    function deal () {
      const three = ideas.length ? [0, 1, 2].map(i => ideas[(at + i) % ideas.length]).filter((n, i, a) => a.indexOf(n) === i) : [];
      row.replaceChildren(
        ...three.map(n => ripple(h('button', { class: 'nm-idea', type: 'button', 'data-k': 'nm-idea', on: { click: () => { input.value = n; check(); } } }, n))),
        button('', () => { at = (at + 3) % Math.max(1, ideas.length); deal(); }, { kind: 'icon', icon: 'casino', title: 'Three other ideas', k: 'nm-shuffle' }));
    }
    const body = h('div', { class: 'pg-form nm-form', 'data-k': 'nm-form' },
      h('div', { class: 'nm-who' }, creaturePic(id, 48), h('span', { class: 'li-sub' }, creatureName(id, true))),
      field, help,
      h('p', { class: 'pg-form-sub nm-ideas-label' }, 'Ideas'), row,
      h('div', { class: 'nm-plain' }, button('Use Habitica’s name', () => { hooks.rename(id, ''); dlg.close(); }, { k: 'nm-plain' })));
    deal();
    check();
    const dlg = fullDialog('Name', body, {
      action: 'Save', k: 'nm',
      run: () => {
        const c = cleanName(input.value);
        if ('error' in c) { help.textContent = c.error; help.classList.add('bad'); field.classList.add('invalid'); input.focus(); return false; }
        if (c.name !== now) hooks.rename(id, c.name);
        return true;
      },
    });
  }

  function openMove (id: CreatureId) {
    const s = hooks.state(), home = whereIs(s, id);
    if (!home) return;
    const others = s.playgrounds.filter(p => p.id !== home.id);
    let sh: ReturnType<typeof sheet> | undefined;
    const body = others.length
      ? h('ul', { class: 'list' }, others.map(p => {
        const fullUp = p.residents.length >= MAX_RESIDENTS;
        return h('li', null, ripple(h('button', {
          class: 'li li-btn', type: 'button', disabled: fullUp, 'data-k': `pg-move-${p.id}`,
          on: { click: () => {
            sh?.close();
            const next = moveTo(hooks.state(), id, p.id);
            if (next) hooks.commit(next, `${called(hooks.names(), id)} moved to ${pgName(p)}.`);
          } },
        }, h('span', { class: 'menu-art' }, sceneThumb(p.scene)),
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, pgName(p)), h('span', { class: 'li-sub' }, fullUp ? `Full: ${MAX_RESIDENTS} live there` : `${p.residents.length} of ${MAX_RESIDENTS}`)))));
      }))
      : h('p', { class: 'pg-sheet-note' }, 'There is no other playground yet. Make one with New playground in the menu under the playground’s name.');
    sh = sheet(`Move ${called(hooks.names(), id)} to`, body);
  }

  /* ---- the picker */
  function openPicker () {
    const s = hooks.state(), pg = currentOf(s);
    const have = owned(hooks.items()), names = hooks.names();
    let chosen = pg.residents.map(r => r.id);
    // everything the account owns that the app can draw, plus whoever lives here already
    const offer = [...new Set([...(have ?? []), ...chosen])].filter(known);
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
    let tab: 'pet' | 'mount' = n(pets) || !n(mounts) ? 'pet' : 'mount';
    let query = '';

    const tiles = new Map<CreatureId, HTMLButtonElement>();
    const tile = (id: CreatureId) => {
      const t = ripple(h('button', {
        class: 'pk-tile', type: 'button', 'data-k': `pk-${id}`, title: calledFull(names, id),
        on: { click: () => toggle(id) },
      }, creaturePic(id, 60), h('span', { class: 'pk-ck', 'aria-hidden': 'true' }, icon('check')), h('span', { class: 'pk-where' })));
      tiles.set(id, t);
      return t;
    };
    const panes = { pet: h('div', { class: 'pk-pane', role: 'tabpanel', id: 'pk-pane-pet', 'aria-labelledby': 'pk-tab-pet' }), mount: h('div', { class: 'pk-pane', role: 'tabpanel', id: 'pk-pane-mount', 'aria-labelledby': 'pk-tab-mount', hidden: true }) };
    /** tiles are built the first time their tab shows, then only filtered */
    const built = { pet: false, mount: false };
    const build = (kind: 'pet' | 'mount') => {
      if (built[kind]) return;
      built[kind] = true;
      const g = kind === 'pet' ? pets : mounts;
      panes[kind].append(...(g.length ? g.map(([label, ids]) => h('section', { class: 'pk-group', 'data-group': label },
        h('h3', { class: 'pk-head' }, label), h('div', { class: 'pk-tiles' }, ids.map(tile))))
        : [h('p', { class: 'pk-none' }, kind === 'pet'
          ? 'No pets yet. Pets hatch in Habitica from an egg and a hatching potion, and the ones you have show up here.'
          : 'No mounts yet. Feed a pet in Habitica until it grows into a mount, and it shows up here.')]));
    };
    const tabBtn = (kind: 'pet' | 'mount', label: string) => ripple(h('button', {
      class: 'pk-tab', type: 'button', role: 'tab', id: `pk-tab-${kind}`, 'aria-controls': `pk-pane-${kind}`, 'data-k': `pk-tab-${kind}`,
      on: { click: () => { tab = kind; refresh(); } },
    }, label));
    const tabs = { pet: tabBtn('pet', `Pets · ${n(pets)}`), mount: tabBtn('mount', `Mounts · ${n(mounts)}`) };
    const chips = h('div', { class: 'pk-chips', 'data-k': 'pk-chips' });
    const tallyLine = h('div', { class: 'pk-tally', 'aria-live': 'polite' });
    const search = h('input', {
      class: 'pk-search-in', type: 'search', placeholder: 'Search', 'aria-label': 'Search your pets and mounts', autocomplete: 'off', 'data-k': 'pk-search',
      on: { input: () => { query = search.value.trim().toLocaleLowerCase(); refresh(); } },
    });
    const body = h('div', { class: 'pk' },
      h('div', { class: 'pk-top' },
        h('div', { class: 'pk-tabs', role: 'tablist' }, tabs.pet, tabs.mount),
        h('div', { class: 'pk-chosen' }, tallyLine, chips),
        h('label', { class: 'pk-search' }, icon('search'), search)),
      panes.pet, panes.mount);

    function toggle (id: CreatureId) {
      if (chosen.includes(id)) chosen = chosen.filter(x => x !== id);
      else if (chosen.length >= MAX_RESIDENTS) { snackbar(`Up to ${MAX_RESIDENTS} live in one playground. Take one out first.`); return; }
      else chosen = [...chosen, id];
      refresh();
    }

    function refresh () {
      const now = hooks.state();
      build(tab);
      for (const k of ['pet', 'mount'] as const) {
        panes[k].hidden = k !== tab;
        tabs[k].setAttribute('aria-selected', String(k === tab));
        tabs[k].tabIndex = k === tab ? 0 : -1;
      }
      search.placeholder = tab === 'pet' ? 'Search your pets' : 'Search your mounts';
      const atMax = chosen.length >= MAX_RESIDENTS;
      for (const [id, t] of tiles) {
        const on = chosen.includes(id);
        const elsewhere = whereIs(now, id);
        const lives = elsewhere && elsewhere.id !== pg.id ? pgName(elsewhere) : '';
        t.classList.toggle('sel', on);
        t.classList.toggle('dim', atMax && !on);
        t.setAttribute('aria-pressed', String(on));
        t.setAttribute('aria-label', `${calledFull(names, id)}${lives ? `, lives in ${lives}` : ''}`);
        (t.querySelector('.pk-where') as HTMLElement).textContent = lives;
        // by Habitica's name or its own
        t.hidden = !!query && !`${creatureName(id)}\n${ownName(names, id)}`.toLocaleLowerCase().includes(query);
      }
      for (const g of panes[tab].querySelectorAll<HTMLElement>('.pk-group')) g.hidden = ![...g.querySelectorAll<HTMLElement>('.pk-tile')].some(t => !t.hidden);
      tallyLine.textContent = `${chosen.length} of ${MAX_RESIDENTS} chosen`;
      chips.replaceChildren(...chosen.map(id => ripple(h('button', {
        class: 'pk-chip', type: 'button', 'data-k': `pk-chip-${id}`, 'aria-label': `Take out ${calledFull(names, id)}`,
        on: { click: () => toggle(id) },
      }, creaturePic(id, pictureBox(id, 24)), h('span', null, called(names, id)), icon('close')))));
    }
    refresh();

    const dlg = fullDialog(pgName(pg), body, {
      action: 'Save', k: 'pk',
      run: () => {
        const now = hooks.state();
        const before = currentOf(now).residents.map(r => r.id);
        if (before.join() === chosen.join() && !now.auto) return true;
        const { state: next, moved } = choose(now, pg.id, chosen);
        const from = (m: { from: number }) => nameOf(now, m.from, 'another playground');
        hooks.commit(next, moved.length === 1 ? `${called(names, moved[0].id)} moved here from ${from(moved[0])}.`
          : moved.length > 1 ? `${moved.length} creatures moved here from other playgrounds.` : undefined);
        return true;
      },
    });
    dlg.panel.classList.add('pk-dialog');
  }

  return {
    bar, row, render, openPicker, openRename, openStall,
    destroy: () => { bar.remove(); row.remove(); },
  };
}
