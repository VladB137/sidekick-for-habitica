/*
 * The class card on Now: what the player's class is best at, worked out for their numbers and the gear they own.
 * Warrior: boss damage (Brutal Smash chains, the INT mana bank). Mage: XP and the party's mana. Rogue: Gold.
 * Healer: HP after the day change, for themselves and the party. Every class: the gear for their next task and
 * buffs cast at their peak. Gear swaps re-read first and can be put back from the banner; nothing is spent
 * without a tap. The reasoning and the code it was checked against: docs/class-strategies.md.
 * Relaxed gets `plainClassCard`: the class's number and the stat that raises it, the Healer's HP rows and mana
 * above the max, in plain words, with no buttons, gear or skill plans and no crits.
 */
import { h, icon, button, fmt, plain } from '../ui/dom';
import { store } from '../store';
import {
  brightnessNextStep, dayChange, gearForTask, manaBank, skillByKey, skillPeaks, smashPlan, toNextLevel, totals, withGear,
  type GearContext, type Loadout, type MissedDaily, type State, type StatKey,
} from '../../engine';
import { ITEMS, type UiTask } from '../model';
import { OBJ_LABEL } from './now';

const STAT_UP: Record<StatKey, string> = { str: 'STR', con: 'CON', int: 'INT', per: 'PER' };
export const loadoutName = (l: Loadout) => `your best ${l.key.split('+').map(k => STAT_UP[k as StatKey] || k.toUpperCase()).join('+')} gear`;

const TITLE: Record<string, [string, string]> = {
  warrior: ['sports_martial_arts', 'Warrior: boss damage'],
  wizard: ['auto_fix_high', 'Mage: XP and the party’s mana'],
  rogue: ['monetization_on', 'Rogue: Gold'],
  healer: ['healing', 'Healer: keeping everyone alive'],
};

/** The class skills whose effect a gear swap can raise, per class, in the order they're shown. */
const PEAK_SKILLS: Record<string, string[]> = {
  warrior: ['valorousPresence', 'defensiveStance', 'intimidate'],
  wizard: ['earth', 'mpheal'],
  rogue: ['toolsOfTrade', 'stealth', 'pickPocket'],
  healer: ['protectAura', 'heal', 'healAll', 'brightness'],
};
const UNIT: Record<string, (n: number) => string> = {
  defensiveStance: n => `+${n} CON for you`, valorousPresence: n => `+${n} STR for the party`, intimidate: n => `+${n} CON for the party`,
  earth: n => `+${n} INT for the party`, mpheal: n => `+${n} MP to each other non-Mage`, toolsOfTrade: n => `+${n} PER for the party`,
  stealth: n => `${n} Daily${n === 1 ? '' : 's'} hidden`, pickPocket: n => `+${n} Gold`,
  protectAura: n => `+${n} CON for the party`, heal: n => `+${n} HP`, healAll: n => `+${n} HP to each member`, brightness: n => `+${n} to each task’s value`,
};

const ownTargets = () => store.tasks.filter(t => !t.noCast && t.type !== 'reward');
function smashTarget (): UiTask | undefined {
  const own = ownTargets();
  return (store.settings.smashTarget && own.find(t => t.id === store.settings.smashTarget)) || own.slice().sort((a, b) => b.value - a.value)[0];
}

/** The player's own Dailies due today and not done, in the order missedDailies() lists them (team-board ones never reach their day change). */
export const openDailies = (): UiTask[] => store.tasks.filter(t => t.type === 'daily' && t.isDue && !t.completed && !t.board);
/** The Dailies the next day change counts as missed: due today, not done. */
export function missedDailies (): MissedDaily[] {
  return openDailies().map(t => ({
    value: t.value, priority: t.priority, checklistDone: t.checklist.filter(c => c.completed).length, checklistTotal: t.checklist.length, group: t.team,
  }));
}
/** Strength of the boss of the active boss quest the player takes part in (multiplies missed Dailies into damage), or 0. */
export function bossStr (): number {
  const q = store.party?.quest;
  const k = store.bossActive && q?.members?.[store.snap?.userId ?? ''] ? q.key : undefined;
  return k ? ITEMS.bossQuests[k]?.[3] ?? 1 : 0;
}

function row (title: string, sub: string | Node | Array<string | Node>, action?: HTMLElement | null, cls = ''): HTMLElement {
  return h('li', { class: `li ${cls}`.trim() }, h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, title), h('div', { class: 'li-sub' }, sub)), action || null);
}

/** "Wear it" for a loadout computed by `pick` (called again on the fresh read before anything is equipped). */
export function wearButton (k: string, label: string, pick: (s: State, ctx: GearContext) => Loadout | null): HTMLElement {
  return button('Wear it', () => {
    store.wearLoadout(label, () => {
      const s = store.state; const ctx = store.gearCtx;
      const l = s && ctx ? pick(s, ctx) : null;
      return l && l.equip.length ? l.equip : null;
    });
  }, { disabled: store.busy || store.offline, k: `wear-${k}`, label: `Wear ${label}` });
}

/* ---------------------------------------------------------------- rows */

/** Every class: the owned gear that makes the next task worth the most, toward the aim set in Settings. */
function taskGearRow (s: State, ctx: GearContext): HTMLElement | null {
  const goal = store.objective;
  let best: { t: UiTask, g: NonNullable<ReturnType<typeof gearForTask>> } | null = null;
  for (const t of store.tasks) {
    if (t.type === 'reward' || t.completed || (t.type === 'daily' && !t.isDue) || (t.type === 'habit' && !t.up)) continue;
    const g = gearForTask(s, ctx, t, goal);
    if (g && (!best || g.gain - g.now > best.g.gain - best.g.now)) best = { t, g };
  }
  if (!best) return null;
  const { t, g } = best;
  const amount = (n: number) => (goal === 'drops' ? `${n.toFixed(2)}× the drop odds` : goal === 'damage' ? `${fmt.int(n)} damage` : goal === 'gold' ? fmt.gold(n) : `${fmt.int(n)} XP`);
  const critNote = g.crit && !g.critNow ? ', and it crits' : '';
  return row('Gear for your next task',
    `“${plain(t.text)}” gives ${amount(g.gain)} in ${loadoutName(g.loadout)} instead of ${amount(g.now)}${critNote}. Aim: ${OBJ_LABEL[goal]}, only if you’ve done it.`,
    wearButton('task', loadoutName(g.loadout), (st, c) => {
      const tt = store.tasks.find(x => x.id === t.id);
      return tt ? gearForTask(st, c, tt, store.objective)?.loadout ?? null : null;
    }));
}

/** Warrior: every Smash the MP pays for, in the gear worn and in the gear that does the most boss damage. */
function smashRow (s: State, ctx: GearContext): HTMLElement | null {
  const def = skillByKey('smash')!;
  if (s.lvl < def.lvl) return null;
  const target = smashTarget();
  if (!target) return null;
  if (!store.bossActive) return row('Brutal Smash', 'No boss quest running: Smash only makes a task bluer now. Save the MP for the next boss.');
  const p = smashPlan(s, ctx, target.value);
  if (!p) return row('Brutal Smash', `${def.mana} MP per cast; you have ${fmt.int(s.mp)}.`);
  const crits = (n: number) => (n ? `, ${n} crit${n === 1 ? '' : 's'}` : '');
  const swap = p.loadout.equip.length > 0;
  const sub = swap
    ? `${p.now.casts} casts: ${fmt.int(p.now.dmg)} boss damage in your gear${crits(p.now.crits)}; ${fmt.int(p.best.dmg)} in ${loadoutName(p.loadout)}${crits(p.best.crits)}, which it puts on first${store.settings.autoRestore ? ' and takes off after' : ''}. Uses all your MP, on “${plain(target.text)}”.`
    : `${p.now.casts} casts: ${fmt.int(p.now.dmg)} boss damage${crits(p.now.crits)}. Uses all your MP, on “${plain(target.text)}”.`;
  const run = () => store.smashChain(target.id, () => {
    const st = store.state; const c = store.gearCtx; const tt = store.tasks.find(x => x.id === target.id);
    if (!st || !c || !tt) return null;
    const q = smashPlan(st, c, tt.value);
    return q ? { keys: q.loadout.equip, casts: q.best.casts } : null;
  });
  return row(`Brutal Smash ×${p.best.casts}`, sub,
    button(`Smash ×${p.best.casts}`, run, { disabled: store.busy || store.offline, k: 'smash-chain', label: `Cast Brutal Smash ${p.best.casts} times${swap ? ` in ${loadoutName(p.loadout)}` : ''}` }));
}

/** Mana: what INT gear adds to the cap and the day-change MP, and MP that scoring a task would cut. */
function manaRows (s: State, ctx: GearContext): HTMLElement[] {
  const b = manaBank(s, ctx);
  const out: HTMLElement[] = [];
  if (b.overMax > 0) {
    out.push(row('Spend MP before you score', `You have ${fmt.int(b.overMax)} MP above the ${fmt.int(b.maxMP)} max of the gear you wear. Scoring any task cuts MP back to the max, so cast first or put INT gear back on.`, null, 'notice'));
  }
  if (b.loadout && b.bankMaxMP - b.maxMP >= 10) {
    const cron = b.cronBank > b.cronNow ? `, and the day change adds up to ${fmt.int(b.cronBank)} MP instead of ${fmt.int(b.cronNow)}` : '';
    const swap = s.cls === 'warrior' ? 'switch to STR and CON gear only to Smash' : 'switch only to cast what needs other gear';
    out.push(row('Bank mana in INT gear',
      `Max MP ${fmt.int(b.maxMP)} → ${fmt.int(b.bankMaxMP)}${cron}. Wear it while you score tasks and when your day changes; ${swap}.`,
      wearButton('mana', 'your best INT gear', (st, c) => manaBank(st, c).loadout)));
  }
  return out;
}

/** Skills whose effect is bigger in other gear you own (buffs stay at the cast value until your day changes). */
function peakRows (s: State, ctx: GearContext): HTMLElement[] {
  const keys = PEAK_SKILLS[s.cls] || [];
  const out: HTMLElement[] = [];
  for (const p of skillPeaks(s, ctx, keys, { dailyCount: store.snap?.dailyCount, targetValue: smashTarget()?.value })) {
    const def = skillByKey(p.key)!;
    if (p.key === 'brightness') {
      const int = totals(s).int; const next = brightnessNextStep(int);
      const sub = `${UNIT.brightness(p.now)} per cast.${p.loadout && p.best > p.now ? ` In ${loadoutName(p.loadout)}: ${UNIT.brightness(p.best)}.` : next ? ` INT ${next} would make it +${p.now + 1}; you have ${int}.` : ''}`;
      out.push(row(def.name, sub, p.loadout && p.best > p.now ? wearButton(p.key, loadoutName(p.loadout), (st, c) => skillPeaks(st, c, [p.key])[0]?.loadout ?? null) : null));
      continue;
    }
    if (!p.loadout || p.best <= p.now) continue;
    const party = def.target === 'party' ? partyNote(p.key, p.best) : '';
    out.push(row(def.name,
      `${UNIT[p.key](p.now)} per cast in your gear, ${UNIT[p.key](p.best)} in ${loadoutName(p.loadout)}.${def.target === 'party' || p.key === 'defensiveStance' ? ' Cast it there, then swap back: the buff keeps its size until the day changes.' : ''}${party}`,
      wearButton(p.key, loadoutName(p.loadout), (st, c) => {
        const q = skillPeaks(st, c, [p.key], { dailyCount: store.snap?.dailyCount, targetValue: smashTarget()?.value })[0];
        return q && q.best > q.now ? q.loadout : null;
      })));
  }
  return out;
}

/** What a party skill reaches, from the party's member list. */
function partyNote (key: string, amount: number): string {
  const ms = store.partyMembers.filter(m => m.id !== store.snap?.userId);
  if (!ms.length) return '';
  if (key === 'mpheal') {
    const n = ms.filter(m => m.cls !== 'wizard').length;
    const warriors = ms.filter(m => m.cls === 'warrior' && m.classSelected).length;
    return n ? ` Reaches ${n} member${n === 1 ? '' : 's'}${warriors ? `; each Warrior gets ${Math.floor(amount / 10)} Brutal Smash${Math.floor(amount / 10) === 1 ? '' : 'es'} out of it` : ''}.` : ' No non-Mage members to reach.';
  }
  return ` Reaches you and ${ms.length} member${ms.length === 1 ? '' : 's'}.`;
}

/** Healer: HP after the day change for the player's own missed Dailies, in the gear worn and in the best CON gear. */
function dayChangeRow (s: State, ctx: GearContext): HTMLElement | null {
  const snap = store.snap!;
  const missed = missedDailies();
  const opts = { stealth: snap.stealth, bossStr: bossStr(), sleeping: snap.sleeping };
  const d = dayChange(s, missed, opts);
  if (snap.sleeping) return row('After the day change', 'You’re resting in the Inn: missed Dailies do no damage.');
  if (!d.missed) return row('After the day change', `No damage from your own Dailies: none is due and open. ${fmt.int(s.hp)} HP.`);
  const parts = [`${fmt.int(d.hpLoss)} from ${d.missed} open Dail${d.missed === 1 ? 'y' : 'ies'}`];
  if (d.bossLoss) parts.push(`${fmt.int(Math.ceil(d.bossLoss))} from the boss`);
  const after = Math.floor(d.hpAfter);
  const con = skillPeaks(s, ctx, ['protectAura'])[0]; // the CON set is the one that cuts the damage
  let alt = '';
  let wear: HTMLElement | null = null;
  if (con?.loadout) {
    const d2 = dayChange(withGear(s, con.loadout.gear), missed, opts);
    if (d2.hpLoss < d.hpLoss) {
      alt = ` Wearing ${loadoutName(con.loadout)} when the day changes: ${fmt.int(Math.floor(d2.hpAfter))} HP.`;
      wear = wearButton('daychange', loadoutName(con.loadout), (st, c) => skillPeaks(st, c, ['protectAura'])[0]?.loadout ?? null);
    }
  }
  const sub = `${after <= 0 ? 'You’d run out of HP: ' : ''}${fmt.int(after)} HP (${parts.join(', ')}${d.upperBound ? ', at most' : ''}). Party members’ missed Dailies add to the boss damage.${alt}`;
  return row('After the day change', sub, wear, after <= 10 ? 'notice' : '');
}
/** Healer: the party member most in need of a heal. */
function partyHpRow (s: State): HTMLElement | null {
  const ms = store.partyMembers.filter(m => m.id !== store.snap?.userId);
  if (!ms.length || s.lvl < 14) return null;
  const low = ms.slice().sort((a, b) => a.hp - b.hp)[0];
  if (low.hp >= 50) return row('Party HP', `All ${ms.length} member${ms.length === 1 ? ' is' : 's are'} at full HP.`);
  return row('Party HP', [`Lowest: `, h('b', null, low.name), ` at ${fmt.int(low.hp)} / 50 HP. Blessing heals everyone in the party.`]);
}

/* ---------------------------------------------------------------- card */

/** The class card, folded to its title and a count until opened (fold given), or always open (no fold). */
export function classCard (fold?: { open: boolean, toggle: () => void }): HTMLElement | null {
  const s = store.state; const ctx = store.gearCtx;
  if (!s || !ctx || !s.classSelected) return null;
  const [ic, title] = TITLE[s.cls] || ['person', 'Your class'];
  const rows: Array<HTMLElement | null> = [];
  if (s.cls === 'healer') { rows.push(dayChangeRow(s, ctx), partyHpRow(s)); }
  if (s.cls === 'warrior') rows.push(smashRow(s, ctx));
  if (s.lvl >= 11) rows.push(...manaRows(s, ctx));
  rows.push(taskGearRow(s, ctx));
  if (s.lvl >= 11) rows.push(...peakRows(s, ctx));
  const list = rows.filter((r): r is HTMLElement => !!r);
  if (fold && list.length) {
    return h('div', { class: 'card', 'data-k': 'class-card' },
      h('button', { class: 'fold-head', type: 'button', 'aria-expanded': String(fold.open), 'data-k': 'class-fold', on: { click: fold.toggle } },
        icon(ic), h('h2', { class: 'card-title' }, `${title.split(':')[0]} tips`), h('span', { class: 'count' }, String(list.length)), icon(fold.open ? 'expand_less' : 'expand_more')),
      h('div', { class: 'card-sub' }, goalLine(s)),
      fold.open ? [
        store.live ? null : h('div', { class: 'checking-note' }, icon('sync', 'spin-slow'), 'From the last read. Anything you run re-reads first.'),
        h('ul', { class: 'list' }, list)] : null);
  }
  return h('div', { class: 'card' },
    h('div', { class: 'card-head' }, icon(ic), h('h2', { class: 'card-title' }, title)),
    store.live ? null : h('div', { class: 'checking-note' }, icon('sync', 'spin-slow'), 'From the last read. Anything you run re-reads first.'),
    h('div', { class: 'card-sub' }, goalLine(s)),
    list.length ? h('ul', { class: 'list' }, list) : null);
}

/** The class's own number, in one line. */
function goalLine (s: State): string {
  const others = store.partyMembers.filter(m => m.id !== store.snap?.userId).length;
  const party = others ? ` Your party: you and ${others} other${others === 1 ? '' : 's'}.` : '';
  switch (s.cls) {
    case 'warrior': return store.bossActive
      ? `${fmt.int(store.snap!.quest.pendingDamage)} boss damage waiting for your next day change. Brutal Smash is your biggest hit; mana is what limits it.`
      : 'No boss quest running. Your strength is boss damage: bank mana for the next one.';
    case 'wizard': return `${fmt.int(toNextLevel(s.lvl) - s.exp)} XP to level ${s.lvl + 1}. INT raises the XP of every task and the mana you share.${party}`;
    case 'rogue': return `${fmt.gold(s.gp)}. PER raises the Gold of every task and your drop odds; Backstab crits from 30%.${party}`;
    default: return `${fmt.int(s.hp)} / 50 HP. CON and INT make your heals bigger; CON also cuts the damage of missed Dailies.${party}`;
  }
}

/* ---------------------------------------------------------------- Relaxed */

/** Relaxed: what the class is good at, in plain words, and the facts that protect the day. No buttons, no gear or skill plans, no crits. */
export function plainClassCard (fold?: { open: boolean, toggle: () => void }): HTMLElement | null {
  const s = store.state; const ctx = store.gearCtx;
  if (!s || !ctx || !s.classSelected) return null;
  const [ic, title] = TITLE[s.cls] || ['person', 'Your class'];
  const rows: Array<HTMLElement | null> = [];
  if (s.cls === 'healer') rows.push(plainDayChangeRow(s), plainPartyHpRow(s));
  if (s.lvl >= 11) {
    const b = manaBank(s, ctx);
    if (b.overMax > 0) rows.push(row('Mana over your max', `You have ${fmt.int(b.overMax)} MP more than your max of ${fmt.int(b.maxMP)}. Your next task drops it back to ${fmt.int(b.maxMP)}, so cast a skill first if you want it.`, null, 'notice'));
  }
  const list = rows.filter((r): r is HTMLElement => !!r);
  const name = `${title.split(':')[0]} tips`;
  const note = store.live ? null : h('div', { class: 'checking-note' }, icon('sync', 'spin-slow'), 'From the last read.');
  if (fold && list.length) {
    return h('div', { class: 'card class-plain', 'data-k': 'class-card' },
      h('button', { class: 'fold-head', type: 'button', 'aria-expanded': String(fold.open), 'data-k': 'class-fold', on: { click: fold.toggle } },
        icon(ic), h('h2', { class: 'card-title' }, name), h('span', { class: 'count' }, String(list.length)), icon(fold.open ? 'expand_less' : 'expand_more')),
      h('div', { class: 'card-sub' }, plainGoalLine(s)),
      fold.open ? [note, h('ul', { class: 'list' }, list)] : null);
  }
  return h('div', { class: 'card class-plain', 'data-k': 'class-card' },
    h('div', { class: 'card-head' }, icon(ic), h('h2', { class: 'card-title' }, name)),
    note,
    h('div', { class: 'card-sub' }, plainGoalLine(s)),
    list.length ? h('ul', { class: 'list' }, list) : null);
}

/** One line: the class's number and the stat that raises it (scoreTask.js _addPoints, _subtractPoints, the quest progress). */
function plainGoalLine (s: State): string {
  switch (s.cls) {
    case 'warrior': return store.bossActive
      ? `${store.snap!.quest.pendingDamage > 0 ? `${fmt.int(store.snap!.quest.pendingDamage)} boss damage waits for your next day change.` : 'A boss quest is running: every task you finish hits the boss.'} More STR makes every task hit harder.`
      : 'Warriors hit bosses hardest: more STR makes every task do more boss damage. No boss quest is running now.';
    case 'wizard': return `${fmt.int(toNextLevel(s.lvl) - s.exp)} XP to level ${s.lvl + 1}. More INT gives every task more XP.`;
    case 'rogue': return `${fmt.gold(s.gp)}. More PER gives every task more Gold and better odds of an item drop.`;
    default: return `${fmt.int(s.hp)} / 50 HP. More CON makes missed Dailies take less HP.`;
  }
}

/** Healer: HP left after the day change, from your own open Dailies (and the boss), in the gear you wear. */
function plainDayChangeRow (s: State): HTMLElement | null {
  const snap = store.snap!;
  if (snap.sleeping) return row('After the day change', 'You’re resting in the Inn: missed Dailies take no HP.');
  const d = dayChange(s, missedDailies(), { stealth: snap.stealth, bossStr: bossStr(), sleeping: snap.sleeping });
  if (!d.missed) return row('After the day change', `No Daily takes HP tonight: you keep your ${fmt.int(s.hp)} HP.`);
  const after = Math.floor(d.hpAfter);
  const loss = Math.ceil(d.hpLoss + d.bossLoss);
  const what = `${d.missed} open Dail${d.missed === 1 ? 'y' : 'ies'}${d.bossLoss ? ' and the boss' : ''}`;
  const sub = after <= 0
    ? `${what} would take all your HP. Finish some first.`
    : `${what} would take ${d.upperBound ? 'up to ' : ''}${fmt.int(loss)} HP, leaving ${fmt.int(after)}.`;
  return row('After the day change', sub, null, after <= 10 ? 'notice' : '');
}

/** Healer: the party member with the least HP. */
function plainPartyHpRow (s: State): HTMLElement | null {
  const ms = store.partyMembers.filter(m => m.id !== store.snap?.userId);
  if (!ms.length || s.lvl < 14) return null;
  const low = ms.slice().sort((a, b) => a.hp - b.hp)[0];
  if (low.hp >= 50) return row('Party HP', 'Everyone in your party has full HP.');
  return row('Party HP', [h('b', null, low.name), ` has ${fmt.int(low.hp)} / 50 HP. Your Blessing heals the whole party.`]);
}
