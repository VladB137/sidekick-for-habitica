/*
 * Inn advice on Now: shown only when the next day change would take the player's HP to 0, from their own open
 * Dailies and their share of the boss damage (engine dayChangeDanger). It names the fixes in the game's own order
 * (finish Dailies, CON gear, Health Potions) and then says what pausing damage would do. Pausing damage (the Inn)
 * is advice only: the app never toggles it and never ranks it as a suggestion (Vlad's pick #23, lever rule).
 * Not shown while a day change is pending: pausing damage then would skip a day already over.
 */
import { h, icon, button, fmt, plain } from '../ui/dom';
import { store } from '../store';
import { dayChange, dayChangeDanger, loadouts, withGear, RULES, type State } from '../../engine';
import { bossStr, loadoutName, missedDailies, openDailies, wearButton } from './classplan';

/** The danger for the player's current numbers, or null before the first read. Shared with anything that needs the same verdict. */
export function currentDanger () {
  const s = store.state; const snap = store.snap;
  if (!s || !snap) return null;
  return dayChangeDanger(s, missedDailies(), { stealth: snap.stealth, bossStr: bossStr(), sleeping: snap.sleeping });
}

const conLoadout = (s: State) => (store.gearCtx ? loadouts(store.gearCtx, s.cls, { con: { con: 1 } })[1] ?? null : null);

export function innCard (): HTMLElement | null {
  const s = store.state; const snap = store.snap;
  const d = currentDanger();
  if (!s || !snap || !d || d.level !== 'dies') return null;
  const opts = { stealth: snap.stealth, bossStr: bossStr(), sleeping: snap.sleeping };
  const open = openDailies(); // same order as missedDailies()

  const cause = [`${fmt.int(d.hpLoss)} from ${d.missed} open Dail${d.missed === 1 ? 'y' : 'ies'}`];
  if (d.bossLoss) cause.push(`${fmt.int(Math.ceil(d.bossLoss))} from the boss`);
  const rows: HTMLElement[] = [];

  if (d.dailiesToDo) {
    const names = d.dailiesFirst.map(i => open[i]).filter(Boolean).map(t => plain(t.text));
    rows.push(row('Finish Dailies', [
      d.dailiesToDo === d.missed ? 'Finish all of them: ' : `Finish ${d.dailiesToDo} of them, biggest loss first: `,
      h('b', null, names.join(', ')), '.']));
  } else if (d.missed) {
    rows.push(row('Finish Dailies', 'Even all of them done wouldn’t be enough on their own.'));
  }

  const con = conLoadout(s);
  if (con) {
    const after = dayChange(withGear(s, con.gear), missedDailies(), opts).hpAfter;
    if (after > d.hpAfter) {
      rows.push(row('Wear CON gear', `${loadoutName(con)} when the day changes: ${after > 0 ? `${fmt.int(Math.floor(after))} HP left` : 'still not enough on its own'}. The day change counts the gear you wear at that moment.`,
        wearButton('inn-con', loadoutName(con), (st, c) => loadouts(c, st.cls, { con: { con: 1 } })[1] ?? null)));
    }
  }

  if (d.potions) {
    const { heal, price } = RULES.healthPotion;
    rows.push(row('Health Potions', `${d.potions} potion${d.potions === 1 ? '' : 's'} (+${heal} HP, ${price} Gold each): ${fmt.gold(d.potionGold)}${d.potionsAffordable ? '' : `; you have ${fmt.gold(s.gp)}`}.`,
      d.potionsAffordable ? button('Buy one', () => { store.potion(); }, { disabled: store.busy || store.offline, k: 'inn-potion', label: `Buy a Health Potion for ${price} Gold` }) : null));
  } else if (s.hp < RULES.maxHealth) {
    rows.push(row('Health Potions', `Even at ${RULES.maxHealth} HP the day change would take it all.`));
  }

  const party = d.partyAdds ? ' Party members’ missed Dailies still reach you through the boss.' : '';
  return h('div', { class: 'card action danger-card', 'data-k': 'inn' },
    h('div', { class: 'card-head' }, icon('favorite'), h('h2', { class: 'card-title' }, 'The day change would take all your HP')),
    store.live ? null : h('div', { class: 'checking-note' }, icon('sync', 'spin-slow'), 'From the last read.'),
    h('div', { class: 'card-sub' },
      `${fmt.int(s.hp)} HP now; the day change takes ${cause.join(' and ')}${d.upperBound ? ' at most' : ''}. ` +
      `Running out costs ${s.lvl > 1 ? 'a level, ' : ''}all your Gold, a stat point and a piece of gear.` +
      (d.partyAdds ? ' Party members’ missed Dailies add to the boss damage on top.' : '')),
    rows.length ? h('ul', { class: 'list' }, rows) : null,
    h('div', { class: 'card-body inn-note' },
      h('p', { style: 'margin:0' },
        h('b', null, 'Resting in the Inn: '),
        `pausing damage in Habitica (Settings, Pause Damage) before the day changes means your missed Dailies don’t hurt you. Streaks don’t reset, the day change gives no mana, and your boss damage and collection finds wait until you unpause.${party} Sidekick never pauses it for you.`)));
}

function row (title: string, sub: string | Array<string | Node>, action?: HTMLElement | null): HTMLElement {
  return h('li', { class: 'li' }, h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, title), h('div', { class: 'li-sub' }, sub)), action || null);
}
