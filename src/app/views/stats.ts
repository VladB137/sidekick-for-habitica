import { h, icon, button, fmt, sprite, sheet } from '../ui/dom';
import { store } from '../store';
import { critChance, critMultiplier, RULES, SKILLS, totals, type StatKey } from '../../engine';
import { GEAR, ITEMS, purchasable, type SavingFor, type UiTask } from '../model';
import { gearBuys, type GearBuy, type TaskGoal } from '../../engine/classplan';
import { OBJ_LABEL } from './now';
import { stableCard } from './stable';
import { go } from '../nav';
import { dailiesOverview, streakRisks, stateDay } from './history';
import { weekOf } from '../../engine';
import { feedingCard } from './feeding';
import { term } from '../ui/term';
import { has } from '../mode';
import { foldCard } from '../ui/fold';
import { hint } from '../ui/term';
import { nextCheckIn } from '../checkins';

export const STATS: StatKey[] = ['str', 'con', 'int', 'per'];
export const STAT_NAME: Record<StatKey, string> = { str: 'Strength', con: 'Constitution', int: 'Intelligence', per: 'Perception' };

function classGearBreakdown () {
  const snap = store.snap!;
  const cls = snap.state.cls;
  const item: Record<StatKey, number> = { str: 0, con: 0, int: 0, per: 0 };
  const bonus: Record<StatKey, number> = { str: 0, con: 0, int: 0, per: 0 };
  for (const key of Object.values(snap.equipped)) {
    const row = GEAR[key];
    if (!row) continue;
    const vals = [row[0], row[1], row[2], row[3]];
    STATS.forEach((k, i) => { item[k] += vals[i]; if (row[4] && row[4] === cls) bonus[k] += vals[i] * RULES.classGearBonus; });
  }
  return { item, bonus };
}

export function statsView (): HTMLElement {
  const s = store.state!;
  const snap = store.snap!;
  const main = h('div');

  // friendly first: what you can act on, what you wear, your history and pets; the workings fold away at the end
  // ---------------------------------------------------------------- stat points
  if (s.points > 0 && s.classSelected && !store.offline) {
    const to = store.settings.allocateTo;
    main.append(h('div', { class: 'card hue-blue' },
      h('div', { class: 'card-head' }, icon('trending_up'), h('h2', { class: 'card-title' }, `${s.points} unspent point${s.points === 1 ? '' : 's'}`)),
      h('div', { class: 'card-sub' }, !has('crit')
        ? `${to ? `Usually to ${STAT_NAME[to]} (Settings). ` : ''}Each raises one stat for good.`
        : to
          ? `They go to ${STAT_NAME[to]} (Settings). Now may time one to land a crit.`
          : 'Pick where they go in Settings, and Now can time one to land a crit.',
      ' ', hint('Stat points', ['Each point raises one stat for good. A point on INT also adds 1 MP.',
        ...(has('crit') ? ['Spending a point changes one of the numbers the crit roll reads, so Sidekick may suggest spending one at the moment it lands a crit, only on the stat you chose in Settings. It never picks a build for you.'] : [])], 'points')),
      h('div', { class: 'card-actions' }, STATS.map(k => button(`+1 ${k.toUpperCase()}`, () => store.allocate(k), { disabled: store.busy || store.offline, label: `Spend a point on ${STAT_NAME[k]}`, k: `alloc-${k}` }))),
    ));
  }
  // your Dailies at a glance, then the bars; the reference cards below each fold (remembered on this device)
  main.append(historyCard());
  main.append(statBarsCard());

  // ---------------------------------------------------------------- gear
  const eq = Object.entries(snap.equipped).filter(([, k]) => k && !k.endsWith('_base_0'));
  main.append(foldCard('equipped', { icon: 'shield', title: 'Equipped', count: `${snap.owned.length} owned` }, [
    eq.length ? h('ul', { class: 'list' }, eq.map(([slot, key]) => {
      const row = GEAR[key];
      // 0 = a known item without stats (headbands, eyewear, most costumes); only a key missing from the table is unknown
      const stats = row === undefined ? 'unknown item' : row ? STATS.map((k, i) => (row[i] ? `${k.toUpperCase()} ${row[i]}${row[4] === s.cls ? ` (+${row[i]})` : ''}` : '')).filter(Boolean).join(' · ') : '';
      return h('li', { class: 'li' }, sprite(`shop_${key}`), h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, ITEMS.gear[key]?.[2] || key), h('div', { class: 'li-sub' }, `${slot} · ${stats || 'no stats'}`)));
    })) : h('div', { class: 'card-body muted' }, 'Nothing equipped.'),
  ]));

  main.append(stableCard());
  const fc = feedingCard(); if (fc) main.append(fc);

  // ---------------------------------------------------------------- items to sell
  if (has('selling')) main.append(sellCard());
  main.append(savingCard());
  main.append(numbersCard());
  return main;
}

function sellCard (): HTMLElement {
  const sellables = store.inventory?.sellables || [];
  const keep = store.settings.keepItems;
  return foldCard('sell', { icon: 'sell', title: 'Items you can sell', count: sellables.length ? String(sellables.length) : '' }, [
    h('div', { class: 'card-sub' }, keep ? `Keeping the last ${keep} of each. ` : '', store.settings.protectStable ? 'What your pets need is marked. ' : 'Everything counts as spare. ',
      hint('Selling items', [store.settings.protectStable
        ? 'Items your pets and mounts still need are marked, and only suggested as a costly way to land a crit.'
        : 'Every item counts as spare: “Don’t sell what my pets still need” is off in Settings.', 'Keep a few of each with the setting under Items and gear.'], 'sell')),
    sellables.length ? h('ul', { class: 'list' }, sellables.map(it => h('li', { class: 'li' },
      h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, it.name), h('div', { class: 'li-sub' },
        `${it.count} ${(it.tier ?? 1) === 1 ? 'spare' : (it.tier === 3 ? 'rare, and your stable needs them' : 'your stable needs, or rare')} · ${fmt.gold(it.value)} each`)),
      store.offline ? null : button('Sell 1', () => store.sell(it.type, it.key, 1), { disabled: store.busy, label: `Sell 1 ${it.name} for ${fmt.gold(it.value)}`, k: `sell-${it.type}-${it.key}-${it.tier ?? 1}` })))) : h('div', { class: 'card-body muted' }, 'Nothing to sell.'),
  ]);
}

// ---------------------------------------------------------------- saving for
function savingCard (): HTMLElement {
  const s = store.state!;
  const snap = store.snap!;
  const saving = store.settings.savingFor;
  const shop = store.shop;
  return foldCard('saving', { icon: 'savings', title: 'Saving for', count: saving.length ? String(saving.length) : '' }, [
    h('div', { class: 'card-sub' }, has('crit')
      ? 'Things you’ll buy anyway. Now says when buying one lands a crit.'
      : 'Things you’ll buy, and the Gold each still needs.'),
    saving.length ? h('ul', { class: 'list' }, saving.map(sv => {
      const price = sv.kind === 'gems' ? 20 * (sv.count || 1) : sv.price;
      const can = purchasable(sv, snap, shop);
      const why = can ? (s.gp >= price ? 'affordable now' : `${fmt.gold(price - s.gp)} to go`) : sv.kind === 'gear' && snap.owned.includes(sv.key) ? 'already owned' : 'not for sale to you right now';
      return h('li', { class: 'li' },
        h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, sv.name), h('div', { class: 'li-sub' }, `${fmt.gold(price)} · ${why}`)),
        button('Remove', () => { store.settings.savingFor = saving.filter(x => x !== sv); store.saveSettings(); }, { label: `Stop saving for ${sv.name}`, k: `unsave-${sv.kind}-${sv.key}` }));
    })) : null,
    worthBuying(),
    h('div', { class: 'card-actions' }, button('Add', () => addSaving(), { icon: 'add', k: 'add-saving' })),
  ]);
}

/** Class gear from the Market (in tier order) and this season's set for your class: what Habitica sells you for Gold now. */
function gearForSale (): SavingFor[] {
  const s = store.state!;
  const out: SavingFor[] = [];
  // Armoire and Mystery items aren't sold for Gold
  for (const [key, m] of Object.entries(ITEMS.gear)) {
    if (m[1] <= 0 || (m[3] !== s.cls && m[3] !== 'special')) continue;
    const o: SavingFor = { kind: 'gear', key, name: m[2], price: m[1] };
    if (purchasable(o, store.snap!, store.shop)) out.push(o);
  }
  return out;
}

// the search runs every scoreable task through every set of gear for each piece on sale, so it's kept until the
// account, the tasks or the aim change
let buysMemo: { snap: unknown, tasks: unknown, shop: unknown, goal: TaskGoal, buys: GearBuy[] } | null = null;
function buys (goal: TaskGoal): GearBuy[] {
  const { snap, tasks, shop } = store;
  if (buysMemo && buysMemo.snap === snap && buysMemo.tasks === tasks && buysMemo.shop === shop && buysMemo.goal === goal) return buysMemo.buys;
  const ctx = store.gearCtx;
  // the tasks a player scores up: Dailies, open To-Dos, habits with a +
  const own = tasks.filter((t: UiTask) => t.type === 'daily' || (t.type === 'todo' && !t.completed) || (t.type === 'habit' && t.up)).slice(0, 60);
  const out = ctx && store.state ? gearBuys(store.state, ctx, gearForSale(), goal, own) : [];
  buysMemo = { snap, tasks, shop, goal, buys: out };
  return out;
}

/** The gear on sale that raises what the player's own tasks give toward the aim, best gain per Gold first. */
function worthBuying (): HTMLElement | null {
  if (store.paused || !store.tasks.length) return null;
  const goal = store.objective;
  const list = buys(goal).slice(0, 3);
  if (!list.length) return null;
  const saving = store.settings.savingFor;
  const pct = (b: GearBuy) => { const p = (b.after - b.now) / b.now * 100; return `${p < 10 ? p.toFixed(1) : Math.round(p)}%`; };
  return h('div', { 'data-k': 'worth-buying' },
    h('div', { class: 'card-sub' }, `Worth buying for ${OBJ_LABEL[goal]}: `,
      hint('Worth buying', [
        `Each piece Habitica sells you for Gold is tried in the best set of gear you’d own with it, and every open task of yours is scored once in that set${has('crit') ? ', crits weighed by how likely they are' : ''}. The figure is how much more ${OBJ_LABEL[goal]} that adds up to.`,
        `Best value for the Gold first. ${has('crit') ? 'The aim is set in Settings → Crits. ' : ''}Buying is up to you, in Habitica or from Saving for.`,
      ], 'worth-buying')),
    h('ul', { class: 'list' }, list.map(b => {
      const m = ITEMS.gear[b.key];
      const on = saving.some(sv => sv.kind === 'gear' && sv.key === b.key);
      return h('li', { class: 'li', 'data-k': `buy-${b.key}` },
        sprite(`shop_${b.key}`),
        h('div', { class: 'li-main' }, h('div', { class: 'li-title' }, m[2]), h('div', { class: 'li-sub' }, `+${pct(b)} ${OBJ_LABEL[goal]} from your tasks · ${fmt.gold(b.price)}`)),
        on ? h('span', { class: 'tag' }, 'Saving')
          : button('Save for it', () => { store.settings.savingFor.push({ kind: 'gear', key: b.key, name: m[2], price: b.price }); store.saveSettings(); }, { label: `Save for ${m[2]}`, k: `save-${b.key}` }));
    })));
}

/* ---------------------------------------------------------------- your stats, as bars */
const PARTS = ['level', 'gear', 'points', 'buffs'] as const;
const PART_NAME: Record<typeof PARTS[number], string> = { level: 'level', gear: 'gear', points: 'points', buffs: 'buffs' };

/** The four stats as stacked bars (level · gear · points · buffs) and the task crit chance as a dial. Same numbers as the table under "How the numbers work". */
function statBarsCard (): HTMLElement {
  const s = store.state!;
  const t = totals(s);
  const parts = (k: StatKey) => ({ level: t.levelBonus, gear: s.gear[k], points: s[k], buffs: Math.max(0, s.buffs[k]) });
  const top = Math.max(1, ...STATS.map(k => PARTS.reduce((a, p) => a + parts(k)[p], 0)));
  const chance = critChance(t.str);
  const R = 26; const C = 2 * Math.PI * R;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag: string, attrs: Record<string, string>) => { const e = document.createElementNS(NS, tag); for (const [a, v] of Object.entries(attrs)) e.setAttribute(a, v); return e; };
  const dial = svg('svg', { viewBox: '0 0 64 64', class: 'dial', 'aria-hidden': 'true' });
  dial.append(svg('circle', { cx: '32', cy: '32', r: String(R), class: 'dial-track' }),
    svg('circle', { cx: '32', cy: '32', r: String(R), class: 'dial-fill', 'stroke-dasharray': `${(Math.min(1, chance) * C).toFixed(2)} ${C.toFixed(2)}`, transform: 'rotate(-90 32 32)' }));
  return foldCard('stat-bars', { icon: 'bar_chart', title: 'Your stats', count: has('crit') ? `${fmt.pct(chance, 1)} crit` : '' }, [
    !has('crit') ? null : h('div', { class: 'crit-dial', 'data-k': 'crit-dial' }, dial,
      h('div', null,
        h('div', { class: 'dial-num' }, fmt.pct(chance, 1)),
        h('div', { class: 'li-sub' }, term('chance', 'critChance'), ' that a task ', term('crits', 'crit'), `, for ${critMultiplier(t.str).toFixed(2)}× its XP and Gold. `, term('Strength', 'str'), ' raises both.'))),
    h('ul', { class: 'statbars' }, STATS.map(k => {
      const p = parts(k);
      const said = PARTS.filter(x => p[x]).map(x => `${fmt.int(p[x])} from ${PART_NAME[x]}`).join(', ');
      return h('li', { 'data-k': `bar-${k}` },
        h('span', { class: 'sb-name' }, term(k.toUpperCase(), k)),
        h('span', { class: 'sb-bar', role: 'img', 'aria-label': `${STAT_NAME[k]} ${fmt.int(t[k])}: ${said}` },
          PARTS.map(x => p[x] > 0 ? h('i', { class: `sb-${x}`, style: `width:${(p[x] / top * 100).toFixed(2)}%` }) : null)),
        h('b', { class: 'sb-total' }, fmt.int(t[k])));
    })),
    h('div', { class: 'heat-legend' }, PARTS.map(x => h('span', null, h('i', { class: `c sb-${x}`, 'aria-hidden': 'true' }), term(PART_NAME[x], x)))),
  ]);
}

/* ---------------------------------------------------------------- how the numbers work */
/** Everything that explains rather than shows, in one fold: the exact table, every roll, the roll itself, gear swaps, the prediction check. */
function numbersCard (): HTMLElement {
  const s = store.state!;
  const t = totals(s);
  const { item, bonus } = classGearBreakdown();
  const sec = (k: string, ic: string, title: string, ...body: Array<Node | Node[] | string | null>) =>
    h('section', { class: 'sub-sec', 'data-k': k }, h('h3', { class: 'sub-title' }, icon(ic), title), ...body);

  // five narrow columns fit a 360 px phone; the level bonus is the same for every stat, so it goes below
  const rows = STATS.map(k => h('tr', null,
    h('th', { scope: 'row' }, k.toUpperCase()),
    h('td', null, h('b', null, fmt.int(t[k]))),
    h('td', null, fmt.int(item[k] + bonus[k])), h('td', null, fmt.int(s[k])), h('td', null, fmt.int(s.buffs[k]))));
  const androidShows = Math.round(t.str - bonus.str * (1 - RULES.androidDisplayedClassBonus));
  const table = sec('server-stats', 'bar_chart', 'Stats the server uses',
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['', 'Total', 'Gear', 'Points', 'Buffs'].map(x => h('th', { scope: 'col' }, x || h('span', { class: 'sr' }, 'Stat'))))),
      h('tbody', null, rows))),
    h('p', { class: 'muted' },
      `Totals include +${fmt.int(t.levelBonus)} from your level. Gear includes the class bonus (class gear counts twice). `,
      bonus.str + bonus.con + bonus.int + bonus.per > 0
        ? `Your Android app counts class gear at half value, so it shows Strength ${fmt.int(androidShows)}; Habitica’s server uses ${fmt.int(t.str)}. Sidekick uses the server’s numbers.`
        : ''));

  const rollRows: HTMLElement[] = [h('tr', null, h('td', null, 'Task (all classes)'), h('td', null, 'STR'), h('td', null, fmt.pct(critChance(t.str), 2)), h('td', null, fmt.mult(critMultiplier(t.str))))];
  for (const def of SKILLS.filter(k => k.crit && k.cls === s.cls)) {
    const v = t[def.crit!.stat];
    rollRows.push(h('tr', null, h('td', null, def.name), h('td', null, def.crit!.stat.toUpperCase()), h('td', null, fmt.pct(Math.min(1, critChance(v, def.crit!.base)), 2)), h('td', null, fmt.mult(critMultiplier(v)))));
  }
  const chances = sec('crit-chances', 'casino', 'Crit chances',
    h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
      h('thead', null, h('tr', null, ['Roll', 'Stat', 'Chance', 'Multiplier'].map(x => h('th', null, x)))), h('tbody', null, rollRows))),
    h('p', { class: 'muted' }, 'A crit multiplies XP, Gold, mana, boss damage and the chance of an item drop. Which roll lands is decided by your numbers, not by luck.'));

  // nothing to report before the first prediction ("0 of 0" means nothing)
  const rec = store.record;
  const recent = rec.log.slice(-12).reverse();
  const predictions = rec.predicted ? sec('predictions', 'task_alt', 'Prediction check',
    h('p', { class: 'pred-sub' }, `${rec.matched} of ${rec.predicted} predictions matched Habitica exactly. Crits landed: ${rec.crits}. Crits set up: ${rec.forced}.`),
    recent.length ? h('ul', { class: 'list' }, recent.map(e => h('li', { class: 'li' },
      icon(e.ok ? 'check_circle' : 'error'),
      h('div', { class: 'li-main' }, h('div', { class: 'li-title', style: 'font-size:14px' }, e.action), e.detail ? h('div', { class: 'li-sub small' }, e.detail) : null),
      h('span', { class: 'small muted' }, fmt.time(e.t))))) : null,
    h('div', { class: 'card-actions' }, button('Reset counter', () => store.forgetRecord(), { k: 'reset-record' }))) : null;

  const crit = has('crit');
  return foldCard('numbers', { icon: 'help_outline', title: 'How the numbers work' },
    [h('div', { class: 'card-body' }, table, crit ? [chances, rollSection(sec)] : null, has('gear') ? gearSwapSection(sec) : null, crit ? predictions : null)], { open: false, headK: 'how' });
}

/** History, near the top: today's Dailies, the last two weeks of them at a glance, streaks at risk, this week's crits. */
function historyCard (): HTMLElement {
  const lost = streakRisks().filter(r => r.cover === 'none');
  const week = weekOf(stateDay());
  const crits = store.journal.filter(e => weekOf(e.day) === week).length;
  const o = dailiesOverview(14);
  const next = nextCheckIn(store.raw?.loginIncentives);
  return h('div', { class: 'card', 'data-k': 'history-card' },
    h('div', { class: 'card-head' }, icon('history'), h('h2', { class: 'card-title' }, 'History')),
    h('div', { class: 'card-sub' }, [
      lost.length ? `${lost.length} streak${lost.length === 1 ? '' : 's'} at risk today.` : 'No streak at risk today.',
      o.dueToday ? `${o.doneToday} of ${o.dueToday} Dailies done.` : '',
      has('journal') ? `${crits} crit${crits === 1 ? '' : 's'} this week.` : '',
    ].filter(Boolean).join(' ')),
    // Habitica's Check-In Rewards: one for some day changes, the next named (checkins.ts)
    next ? h('div', { class: 'card-sub', 'data-k': 'next-check-in' }, next.left === 1
      ? `Your next check-in brings a Check-In Reward: ${next.reward}.`
      : `${next.left} check-ins to your next Check-In Reward: ${next.reward}.`) : null,
    o.cells.some(c => c.cls !== 'off') ? [
      h('div', { class: 'heat mini-heat', role: 'img', 'data-k': 'mini-heat', 'aria-label': `Dailies over the last two weeks${o.rate === null ? '' : `: ${fmt.pct(o.rate, 0)} of due days done in the last 30`}` },
        o.cells.map((c, i) => h('i', { class: `c ${c.cls} ${i === o.cells.length - 1 ? 'today' : ''}`, title: c.tip }))),
      h('div', { class: 'mini-heat-label', 'aria-hidden': 'true' }, h('span', null, 'Dailies, 2 weeks'), h('span', null, o.rate === null ? 'today' : `${fmt.pct(o.rate, 0)} done in 30 days`)),
    ] : null,
    h('div', { class: 'card-actions' }, button('Open history', () => go('history'), { icon: 'chevron_right', k: 'open-history' })),
  );
}

type Sec = (k: string, ic: string, title: string, ...body: Array<Node | Node[] | string | null>) => HTMLElement;

/** What a gear swap is for and what happens, step by step: the roll itself never mentions gear. */
function gearSwapSection (sec: Sec): HTMLElement {
  const st = store.settings;
  const off = store.settings.allow.gear === false;
  return sec('gear-swaps', 'swap_horiz', 'How gear swaps work',
    h('p', null, 'A task crits when its roll is at or under your crit threshold. The roll comes from your HP, MP, XP, Gold, level and stat points, so gear never changes it. The threshold rises with your Strength, and gear does change that.'),
    h('p', null, 'When the roll misses by a little, wearing a piece you own with more Strength can lift the threshold past it:'),
    h('ol', { class: 'steps' },
      h('li', null, 'Now lists the swap under Free. Equipping costs nothing in Habitica.'),
      h('li', null, 'Tap Do it. The piece goes on in Habitica, and your next task is a certain crit.'),
      h('li', null, 'Score a task you’ve done. It crits, and the extra Strength also raises the crit’s multiplier.'),
      h('li', null, st.autoRestore
        ? 'Your usual piece goes back on by itself once the crit is used.'
        : 'Tap Put back on Now to wear your usual piece again. Turn on “Put swapped gear back by itself” in Settings to skip that tap.'),
    ),
    h('p', { class: 'muted' }, off
      ? 'Gear swaps are switched off in Settings, under the ways that may be suggested.'
      : 'Only gear you already own, one piece at a time. Nothing is bought or sold, and your usual outfit comes back after the crit.'));
}

/** The roll explained, with the player's own numbers. */
function rollSection (sec: Sec): HTMLElement {
  const v = store.verdict!;
  const task = v.rolls[0];
  const rate = store.api?.rate;
  return sec('roll', 'help_outline', 'How the roll works',
    h('p', null, 'Habitica adds up ten of your numbers — HP, MP, XP, Gold, level, unspent points and your four allocated stats — and takes the fractional part of sin(sum + 1) × 10000. If that is at most 3% × (1 + STR/100), your next task scores a crit.'),
    h('p', null, 'Since August 2026 all of those numbers are whole, so the roll is known in advance. Anything that changes one of them by a known amount — buying a reward, selling food, casting a skill — moves the roll to a different, equally known value.'),
    h('div', { class: 'kv' },
      h('span', null, 'Sum of your numbers'), h('span', { class: 'mono' }, fmt.int(v.seed)),
      h('span', null, 'Roll'), h('span', { class: 'mono' }, v.roll.toFixed(5)),
      h('span', null, 'Crit if the roll is at most'), h('span', { class: 'mono' }, task.chance.toFixed(5)),
      rate?.remaining !== undefined ? [h('span', null, 'Habitica requests left this minute'), h('span', { class: 'mono' }, `${store.budget()} / ${rate.limit ?? 30}`)] : null,
    ),
    h('p', { class: 'muted' }, 'Every suggestion is simulated with a port of Habitica’s own code, tested case by case against it.'));
}

function addSaving () {
  const snap = store.snap!;
  const q = h('input', { id: 'sq', placeholder: ' ', autocomplete: 'off', type: 'search' });
  const results = h('ul', { class: 'list' });
  const have = new Set(store.settings.savingFor.map(sv => `${sv.kind}:${sv.key}`));
  const options: SavingFor[] = gearForSale();
  for (const [key, [name, price]] of Object.entries(ITEMS.quests)) {
    const o: SavingFor = { kind: 'quest', key, name: `${name} (quest scroll)`, price };
    if (purchasable(o, snap, store.shop)) options.push(o);
  }
  if (snap.subscribed && snap.gemsLeft > 0) options.push({ kind: 'gems', key: 'gem', name: 'Gems with Gold (1)', price: 20, count: 1 });
  const draw = () => {
    const term = q.value.trim().toLowerCase();
    const list = options.filter(o => !have.has(`${o.kind}:${o.key}`) && (!term || o.name.toLowerCase().includes(term))).slice(0, 30);
    results.replaceChildren(...(list.length ? list.map(o => h('li', null, h('button', {
      class: 'li li-btn', type: 'button', on: { click: () => { store.settings.savingFor.push(o); store.saveSettings(); sh.close(); } },
    },
    o.kind === 'gear' ? sprite(`shop_${o.key}`) : icon(o.kind === 'quest' ? 'redeem' : 'savings'),
    h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, o.name), h('span', { class: 'li-sub' }, fmt.gold(o.price)))))) : [h('li', { class: 'li muted' }, term ? 'Nothing matches.' : 'Nothing you can buy with Gold right now.')]));
  };
  q.addEventListener('input', draw);
  draw();
  const sh = sheet('Add something you’re saving for', h('div', null,
    h('div', { class: 'field' }, q, h('label', { for: 'sq' }, 'Search gear and quests')),
    h('p', { class: 'muted' }, 'Only what Habitica sells you for Gold right now: your class’s next Market tiers, this season’s set and quest scrolls you’ve unlocked.'),
    results), [{ label: 'Close', run: () => {} }]);
}
