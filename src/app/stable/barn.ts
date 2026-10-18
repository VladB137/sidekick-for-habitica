/*
 * The barn (Stable idea 18; Vlad's picks, 15 Oct): once the stable is built (level 10), tap it, or "Go into the
 * barn" in the playground's menu, and walk in. Every mount the account has stands in a stall, in the families
 * Habitica's own stable shows (Standard, Magic Potion, Quest, Special), and the row scrolls sideways under a
 * finger; tapping a stall opens the mount's sheet with Ride. The back wall holds every collection achievement
 * (earned in colour, the rest as shapes in the wood; tap one for Habitica's words and the count so far), the
 * pennant rack and a plaque per different quest finished. The open playground's pets come in and wander on the
 * straw. Lamplit at any hour. Nothing here calls Habitica but Ride, and the barn is never on the wallpaper or
 * the widget. Back, or the bar's arrow, leaves it.
 */
import { World, Herd, Creature, mountStage, type Interaction, type Resident, type Stage } from '../../playground';
import { InteriorLayer, StallRow, withProps, type Stall } from '../../playground/scenes';
import { stableSprites } from '../../stable/source';
import { h, icon, ripple } from '../ui/dom';
import { keyOf, type CreatureId, type StableItems } from './picks';
import { barnMounts, familyOf } from './stalls';

export interface BarnHooks {
  reducedMotion (): boolean;
  /** the open playground's pets, who come in */
  pets (): Resident[];
  items (): StableItems | undefined;
  /** a creature's own name ('' for none) */
  name (id: CreatureId): string;
  /** the achievements earned, and different quests finished */
  have (): ReadonlySet<string>;
  quests (): number;
  /** a stall tapped: the mount's sheet */
  stall (id: CreatureId): void;
  /** a trophy tapped (earned or not), or the plaque board */
  trophy (key: string, earned: boolean): void;
  plaques (): void;
  /** the bar's arrow */
  leave (): void;
  haptic (): void;
}

export interface Barn {
  readonly stage: Stage;
  /** the account changed (a read): stalls, wall and pets follow */
  refresh (): void;
  setShown (shown: boolean): void;
  /** how much of the stage the bars cover, CSS px (as the playground's stage) */
  setInsets (top: number, bottom: number): void;
  destroy (): void;
}

export function openBarn (el: HTMLElement, hooks: BarnHooks, uid: string): Barn {
  const world = new World(withProps(stableSprites()), { seed: `barn:${uid}` });
  world.background = '#2E1C0E';
  const layer = new InteriorLayer({ have: hooks.have(), quests: hooks.quests() });
  world.addLayer(layer);
  const row = world.add(new StallRow(layer, keys => need(keys)));
  const herd = new Herd(world, { seed: 'barn', ground: w => layer.floor(w), shadow: () => '#9C7A34', ball: false, haptic: () => hooks.haptic() });

  const title = h('span', { class: 'pg-name' }, 'Barn');
  const tally = h('span', { class: 'pg-count', 'data-k': 'barn-count' });
  const bar = h('div', { class: 'pg-bar barn-bar', 'data-k': 'barn-bar' },
    ripple(h('button', { class: 'btn btn-icon', type: 'button', 'aria-label': 'Leave the barn', title: 'Leave the barn', 'data-k': 'barn-leave', on: { click: () => hooks.leave() } }, icon('arrow_back'))),
    title, tally);
  el.appendChild(bar);

  let live = true, stallsKey = '', petsKey = '';
  const loaded = new Set<string>();
  /** the sheets of the stalls on screen (and one either side), loaded as the row scrolls */
  function load () {
    const [a, b] = row.visible(world);
    need(row.stalls.slice(a, b).flatMap(s => [s.body, s.head!]));
  }
  function need (keys: string[]) {
    const fresh = keys.filter(k => !loaded.has(k));
    if (!fresh.length) return;
    for (const k of fresh) loaded.add(k);
    world.sprites.load(fresh).catch(() => undefined).then(() => { if (live) stage.invalidate(); });
  }

  const t = herd.interaction;
  let pan: { x: number, s: number } | null = null;
  const interaction: Interaction = {
    ...t,
    tap: (p, s) => {
      if (p.hit instanceof Creature) { t.tap?.(p, s); return; }
      const tr = layer.trophyAt(world, p.x, p.y);
      if (tr) { hooks.trophy(tr.key, !tr.sign); return; }
      if (layer.plaquesAt(world, p.x, p.y)) { hooks.plaques(); return; }
      const st = row.at(world, p.x, p.y);
      if (st) { hooks.stall(st.id); return; }
      t.tap?.(p, s);
    },
    // a finger on the stalls or the wall scrolls the stalls; on the straw it strokes and carries as outside
    dragStart: (p, long, s) => {
      if (!long && !(p.hit instanceof Creature) && p.y < layer.floor(world).top) { pan = { x: p.x, s: row.scroll }; return; }
      t.dragStart?.(p, long, s);
    },
    drag: (p, s) => {
      if (!pan) { t.drag?.(p, s); return; }
      if (row.scrollTo(world, pan.s - (p.x - pan.x))) { load(); s.invalidate(); }
    },
    dragEnd: (p, c, s) => { if (pan) { pan = null; return; } t.dragEnd?.(p, c, s); },
  };
  const stage = mountStage(el, { world, minW: 480, minH: 640, maxScale: 8, label: 'Barn', still: () => hooks.reducedMotion(), interaction });
  herd.attach(stage);
  stage.canvas.classList.add('barn-canvas');

  function refresh () {
    const have = hooks.have(), quests = hooks.quests(), o = layer.options;
    if (quests !== o.quests || have.size !== o.have.size || [...have].some(k => !o.have.has(k))) { layer.set({ have, quests }); stage.invalidate(); }
    const ids = barnMounts(hooks.items());
    const stalls: Stall[] = ids.map((id, i) => {
      const key = keyOf(id), fam = familyOf(key);
      return { id, body: `mount:${key}`, head: `mount:${key}#head`, name: hooks.name(id) || undefined, family: i === 0 || familyOf(keyOf(ids[i - 1])) !== fam ? fam : undefined };
    });
    const sk = JSON.stringify(stalls);
    if (sk !== stallsKey) { stallsKey = sk; row.stalls = stalls; row.scrollTo(world, row.scroll); load(); stage.invalidate(); }
    tally.textContent = ids.length === 1 ? '1 mount' : `${ids.length} mounts`;
    const rs = hooks.pets(), pk = rs.map(r => r.id).join();
    if (pk !== petsKey) {
      petsKey = pk;
      world.sprites.load(Herd.keys(rs)).catch(() => undefined).then(() => { if (live && petsKey === pk) { herd.set(rs); stage.invalidate(); describe(); } });
    }
    describe();
  }

  /** what the barn shows, for TalkBack (it is one canvas) */
  function describe () {
    const n = row.stalls.length, pets = herd.creatures.map(c => hooks.name(c.id)).filter(Boolean);
    const here = herd.creatures.length ? `. ${pets.length === herd.creatures.length && pets.length <= 3 ? pets.join(' and ') : herd.creatures.length === 1 ? 'A pet' : `${herd.creatures.length} pets`} came in with you` : '';
    stage.canvas.setAttribute('aria-label', `Barn: ${n === 1 ? '1 mount' : `${n} mounts`} in their stalls, ${layer.options.have.size} of 38 trophies on the wall, ${layer.options.quests === 1 ? '1 quest plaque' : `${layer.options.quests} quest plaques`}${here}`);
  }

  refresh();
  // end-to-end builds only
  if ((import.meta as any).env?.VITE_TEST_API) (window as any).__stableBarn = { stage, world, layer, row, herd };

  return {
    stage, refresh,
    setShown: v => stage.setShown(v),
    setInsets: (top, bottom) => stage.setInsets({ top, bottom }),
    destroy: () => {
      live = false;
      stage.destroy(); bar.remove();
      if ((import.meta as any).env?.VITE_TEST_API) delete (window as any).__stableBarn;
    },
  };
}
