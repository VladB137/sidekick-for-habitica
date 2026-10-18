import { h, button, fmt, icon } from '../ui/dom';
import { store } from '../store';
import { feedsToMount, type FeedStep, type PetFeed, type HatchChoice, type HatchEgg } from '../../engine';
import { hint, term } from '../ui/term';
import { foldCard } from '../ui/fold';
import { itemName, petName, ITEMS } from '../model';
import { spriteMeta, SPRITE_CREDIT } from '../../stable/sprites';
import { loadNames, nameOf } from '../stable/names';

/** UI state that must survive re-renders */
const open = { growing: false, hatch: false };
const SHOW = 5;

const steps = (st: FeedStep[]) => st.map(s => `${s.count} ${itemName('food', s.food)}`).join(', ');
const likes = (p: PetFeed) => p.likes.map(f => itemName('food', f)).join(', ');

/** "Ruby (Red Wolf)" for a pet named in the Stable, else Habitica's name for it. */
function petTitle (key: string): string {
  const n = nameOf(loadNames(store.snap?.userId), `pet:${key}`);
  return n ? `${n} (${petName(key)})` : petName(key);
}

/** Two CSS pixels per art pixel (3 image pixels): whole device pixels at 1x, 2x and 3x, and every pet keeps its size relative to the others. */
const PET_SCALE = 2 / 3;

/** The pet's first frame from the sheet bundled with the app, standing on the bottom of its box; an empty box if it isn't catalogued. */
function petSprite (key: string): HTMLElement {
  const m = spriteMeta('pet', key);
  if (!m) return h('span', { class: 'sprite pet', 'aria-hidden': 'true', 'data-k': `pet-${key}` });
  const px = (n: number) => `${n * PET_SCALE}px`;
  return h('span', { class: 'sprite pet', 'aria-hidden': 'true', 'data-k': `pet-${key}` },
    h('span', { class: 'pet-cell', style: `width:${px(m.w)};height:${px(m.h)};background-image:url("${m.url}");background-size:${px(m.w * m.frames)} ${px(m.h)}` }));
}

function raiseRow (p: PetFeed): HTMLElement {
  return h('li', { class: 'li', 'data-k': `raise-${p.pet}` }, petSprite(p.pet),
    h('div', { class: 'li-main' },
      h('div', { class: 'li-title' }, petTitle(p.pet)),
      h('div', { class: 'li-sub' }, `Feed ${steps(p.steps)}, and it becomes a mount.`)),
    h('span', { class: 'tag' }, `${p.growth}/50`));
}

function growingRow (p: PetFeed): HTMLElement {
  const now = p.steps.length ? `Feed ${steps(p.steps)} now; ` : '';
  const more = p.magic ? `${p.short} more food of any kind to become a mount` : `${p.short} more of its favourite food (${likes(p)}) to become a mount`;
  const other = p.otherFeeds ? `, or ${p.otherFeeds} spare food it doesn’t like (+2 each)` : '';
  return h('li', { class: 'li', 'data-k': `grow-${p.pet}` }, petSprite(p.pet),
    h('div', { class: 'li-main' },
      h('div', { class: 'li-title' }, petTitle(p.pet)),
      h('div', { class: 'li-sub' }, `${now}${more}${other}.`)),
    h('span', { class: 'tag' }, `${p.growth}/50`));
}

/** What hatching this pairing gives you. */
function gives (o: HatchChoice): string {
  if (!o.mount) return ITEMS.hatchingPotions[o.potion]?.[2] === 'wacky' ? 'a pet (wacky pets never grow up)' : 'the pet back (you have its mount)';
  return o.foodReady ? `new pet, and you hold the ${feedsToMount(5)} food to raise it` : 'new pet and a mount to raise';
}

const held = (n: number) => (n > 1 ? ` (${n})` : '');

/** One pet this egg can become, in the egg's full list. */
function choiceRow (o: HatchChoice): HTMLElement {
  return h('li', { class: 'li', 'data-k': `can-${o.pet}` }, petSprite(o.pet),
    h('div', { class: 'li-main' },
      h('div', { class: 'li-title' }, petName(o.pet)),
      h('div', { class: 'li-sub' }, `${itemName('hatchingPotions', o.potion)}${held(o.potions)} · ${gives(o)}`)),
    o.planned ? h('span', { class: 'tag' }, 'Plan') : null);
}

/**
 * One egg you hold: the pet the plan hatches from it first (or the best it can become, if the plan gives the potions to
 * other eggs), and a tap opens every pet it can become with the potions you hold.
 */
function eggRow (e: HatchEgg): HTMLElement {
  const top = e.pets[0];
  const picks = e.pets.filter(o => o.planned);
  const more = picks.slice(1).map(o => petName(o.pet));
  const then = more.length ? ` Then ${more.join(', ')} with your other ${more.length === 1 ? 'egg' : `${more.length} eggs`}.` : '';
  const what = top.planned ? gives(top) : `${gives(top)}, if you keep the potion for it (the plan gives it to another egg)`;
  const head = [petSprite(top.pet),
    h('div', { class: 'li-main' },
      h('div', { class: 'li-title' }, petName(top.pet)),
      h('div', { class: 'li-sub' }, `${itemName('eggs', e.egg)}${held(e.count)} + ${itemName('hatchingPotions', top.potion)} · ${what}.${then}`))];
  if (e.pets.length === 1) return h('li', { class: 'li', 'data-k': `hatch-${top.pet}` }, ...head);
  return h('li', { 'data-k': `egg-${e.egg}` },
    h('details', { class: 'hatch-egg' },
      h('summary', { class: 'li', 'data-k': `hatch-${top.pet}`, 'aria-label': `${petName(top.pet)}: show all ${e.pets.length} pets your ${itemName('eggs', e.egg)} can hatch into` },
        ...head,
        h('span', { class: 'hatch-n' }, `${e.pets.length} pets`, icon('expand_more', 'hatch-chev'))),
      h('ul', { class: 'list hatch-all' }, e.pets.map(choiceRow))));
}

function folded<T> (items: T[], row: (x: T) => HTMLElement, key: 'growing' | 'hatch'): HTMLElement[] {
  const shown = open[key] ? items : items.slice(0, SHOW);
  const out = shown.map(row);
  if (items.length > SHOW) {
    out.push(h('li', { class: 'li li-more' }, button(open[key] ? 'Show fewer' : `Show all ${items.length}`, () => { open[key] = !open[key]; store.emit(); },
      { icon: open[key] ? 'expand_less' : 'expand_more', k: `feed-more-${key}` })));
  }
  return out;
}

/**
 * Stats: which pets the food you hold raises into mounts, what else your growing pets need, and what to hatch.
 * Advice only (feed.js, hatch.js rules): feeding and hatching stay a tap in Habitica.
 */
export function feedingCard (): HTMLElement | null {
  const plan = store.feedingPlan();
  if (!plan) return null;
  const sub = (text: string) => h('h3', { class: 'subheader' }, text);
  const body: Array<HTMLElement | null> = [];
  if (plan.raise.length) body.push(sub('Ready to become mounts'), h('ul', { class: 'list' }, plan.raise.map(raiseRow)));
  if (plan.growing.length) body.push(sub('Still growing'), h('ul', { class: 'list' }, folded(plan.growing, growingRow, 'growing')));
  if (plan.byEgg.length) body.push(sub('Hatch'), h('ul', { class: 'list', 'data-k': 'hatching' }, folded(plan.byEgg, eggRow, 'hatch')));
  if (!body.length) body.push(h('div', { class: 'card-body muted' }, 'No pet is growing and nothing you hold hatches into something new.'));
  const saddles = plan.saddles
    ? h('div', { class: 'card-body small muted' }, `You hold ${plan.saddles} Saddle${plan.saddles === 1 ? '' : 's'}: each turns any pet into a mount at once. The plan above leaves ${plan.saddles === 1 ? 'it' : 'them'} alone.`)
    : null;
  return foldCard('feeding', { icon: 'pets', title: 'Feeding and hatching', count: plan.raise.length ? `${plan.raise.length} ready` : '' }, [
    h('div', { class: 'card-sub' }, 'A pet becomes a mount at 50. Feed and hatch in Habitica. ',
      hint('Feeding', ['Favourite food adds 5 and any other food 2; a pet becomes a mount at 50.', 'The plan uses your smallest stacks first. Sidekick only advises: feeding and hatching stay a tap in Habitica.'], 'feeding')),
    ...body, saddles,
    h('div', { class: 'card-body small muted' }, SPRITE_CREDIT)]);
}

/** "3 of 5 left" and the meter for the drops row on Now. */
export function dropsRow (): HTMLElement[] | null {
  const d = store.dropsLeft();
  if (!d) return null;
  return [
    h('span', null, term('Drops', 'drops')),
    h('div', { class: 'bar drops', role: 'meter', 'aria-label': 'Item drops left today', 'aria-valuemin': '0', 'aria-valuemax': String(d.cap), 'aria-valuenow': String(d.left) },
      h('span', { style: `transform:scaleX(${d.cap ? Math.max(0, Math.min(1, d.left / d.cap)).toFixed(3) : 0})` })),
    h('span', { class: 'mono' }, `${fmt.int(d.left)} / ${fmt.int(d.cap)} left`),
  ];
}
