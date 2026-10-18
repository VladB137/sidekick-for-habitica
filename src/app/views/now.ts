import { h, icon, button, fmt, sprite, plain, sheet, whenSettled, type Sheet } from '../ui/dom';
import { avatarView } from '../ui/avatar';
import { store, rollName, type Objective } from '../store';
import { availableSkills, castSkill, dropOdds, xpGained, RULES, rollHits, rollReady, skillByKey, skillRoll, totals, toNextLevel, type ForceOption, type RollKey, type TaskPreview } from '../../engine';
import { ITEMS, type UiTask } from '../model';
import { startDayCard } from './startday';
import { classCard, plainClassCard } from './classplan';
import { dropsRow } from './feeding';
import { hint, term } from '../ui/term';
import { foldCard } from '../ui/fold';
import { innCard } from './inn';
import { riskCard, streakRisks } from './history';
import { has } from '../mode';
import { companion, petPicture } from '../ui/pet';

export const OBJ_LABEL: Record<Objective, string> = { damage: 'boss damage', xp: 'XP', gold: 'Gold', drops: 'drop chance' };

/** UI state that must survive re-renders */
const ui = { moreWays: false, otherSkills: false, classOpen: false };
/** the open "Make it crit" sheet of a skill: closed before its confirmation opens */
let waysSheet: Sheet | null = null;

export function gainOf (p: TaskPreview, t: UiTask, obj: Objective): number {
  if (obj === 'damage') return p.dmg;
  if (obj === 'gold') return p.dGp;
  // the drop and collection-quest chance of scoring t now, crit included (fns/randomDrop.js)
  if (obj === 'drops') return store.snap ? dropOdds(store.state!, t, store.snap.drops).quest : 0;
  return p.dExp;
}

export function outcomeText (p: TaskPreview): string {
  const parts: string[] = [];
  parts.push(p.leveled ? `level up (+${fmt.int(p.dExp)} XP)` : `${fmt.signed(p.dExp)} XP`);
  if (p.dGp) parts.push(`${fmt.signed(p.dGp)} Gold`);
  if (p.dmg && store.bossActive) parts.push(`${fmt.int(p.dmg)} damage`);
  return parts.join(' · ');
}

/** Open tasks the player could score now: habits with +, due Dailies and To-Dos not yet done (own and shared). */
function openTasks (previews: Map<string, TaskPreview>): UiTask[] {
  return store.tasks.filter(t => previews.has(t.id) && !previews.get(t.id)!.error && (t.type !== 'daily' || t.isDue));
}

/* ---------------------------------------------------------------- costs */

function costTags (o: ForceOption): string[] {
  const tags: string[] = [];
  let gold = 0; let mana = 0; let earned = 0;
  const sold = [0, 0, 0, 0];
  for (const st of o.steps) {
    if (st.kind === 'reward' || st.kind === 'buy') gold += st.kind === 'buy' && st.buyKind === 'gems' ? 20 * (st.count || 1) : st.price;
    if (st.kind === 'potion') gold += 25;
    if (st.kind === 'sell') { sold[st.tier ?? 1] += st.amount; earned += st.amount * (unitValue(st.type, st.key) ?? 0); }
    if (st.kind === 'cast') mana += skillByKey(st.spellId)?.mana || 0;
  }
  // one net Gold figure: what the option does to your purse
  const net = earned - gold;
  if (gold || earned) tags.push(net === 0 ? '±0 Gold' : `${net > 0 ? '+' : '−'}${fmt.gold(Math.abs(net))}`);
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  if (sold[1]) tags.push(`${n(sold[1], 'spare item', 'spare items')} sold`);
  if (sold[2]) tags.push(`${n(sold[2], 'item', 'items')} your stable needs or rare`);
  if (sold[3]) tags.push(`${n(sold[3], 'rare item', 'rare items')} your stable needs`);
  if (mana) tags.push(`−${mana} MP`);
  if (o.kinds.includes('allocate')) tags.push('1 stat point');
  if (o.kinds.includes('gear') && tags.length === 0) tags.push('free, reversible');
  else if (o.kinds.includes('gear')) tags.push('gear swap, reversible');
  if (o.kinds.includes('purchase')) tags.push('you were buying it anyway');
  if (o.conditional) tags.push('−HP, only if it happened');
  if (o.ifDone) tags.push('only if you’ve done it');
  return tags;
}
function unitValue (type: string, key: string): number | undefined {
  return type === 'food' ? ITEMS.food[key]?.[1] : type === 'eggs' ? ITEMS.eggs[key]?.[1] : ITEMS.hatchingPotions[key]?.[1];
}
const tagRow = (tags: string[]) => h('div', { class: 'cost' }, tags.map(c => h('span', { class: 'tag' }, c)));

/* ---------------------------------------------------------------- confirmations */

/** Scoring from the Now screen is only for tasks the player has already done. */
function confirmDid (t: UiTask, p: TaskPreview, note?: string) {
  sheet(`Score “${plain(t.text)}”?`, h('div', null,
    h('p', null, 'Only if you’ve done it. This scores it in Habitica now, the same as ticking it in the app.'),
    h('p', { class: 'muted' }, `You get ${outcomeText(p)}${p.crit ? `, a crit ${fmt.mult(p.mult)}` : ''}.`),
    note ? h('p', { class: 'muted' }, note) : null,
  ), [{ label: 'Cancel', run: () => {} }, { label: 'Score it', primary: true, run: () => { store.score(t, 'up'); } }]);
}

const makeTitle = (roll: RollKey) => (roll === 'task' ? 'Make the next task crit' : `Make ${rollName(roll).replace(/^your next /, '')} crit`);

function confirmRun (o: ForceOption, roll: RollKey = 'task') {
  if (waysSheet) { const w = waysSheet; waysSheet = null; w.close(); whenSettled(() => confirmRun(o, roll)); return; }
  const confirmBox = o.conditional || o.ifDone ? h('input', { type: 'checkbox', id: 'really' }) : null;
  const really = o.conditional && o.ifDone ? 'I did the task, and this really happened. Do it.' : o.conditional ? 'This really happened. Log it.' : 'I’ve already done the task it scores.';
  const s = sheet(makeTitle(roll), h('div', null,
    h('p', { class: 'muted' }, 'Sidekick does these in Habitica now, in this order:'),
    h('ol', { class: 'steps' }, o.steps.map(st => h('li', null, st.label))),
    tagRow(costTags(o)),
    o.kinds.includes('gear') ? h('label', { class: 'checkbox' },
      h('input', { type: 'checkbox', checked: store.settings.autoRestore, on: { change: (e: Event) => { store.settings.autoRestore = (e.target as HTMLInputElement).checked; store.saveSettings(); } } }),
      'Put my gear back by itself once the crit is used') : null,
    h('p', { class: 'muted' }, 'It re-reads your account first. If anything changed, you get fresh options instead, and it stops at the first step Habitica refuses.'),
    confirmBox ? h('label', { class: 'checkbox notice' }, confirmBox, really) : null,
  ), [
    { label: 'Cancel', run: () => {} },
    { label: 'Do it', primary: true, disabled: !!confirmBox, run: () => { store.runPlan(o, roll); } },
  ]);
  confirmBox?.addEventListener('change', () => { s.buttons[1].disabled = !confirmBox.checked; });
}

function confirmRevive () {
  const pv = store.revivePreview();
  const s = store.state!;
  if (!pv) return;
  const STAT: Record<string, string> = { str: 'Strength', con: 'Constitution', int: 'Intelligence', per: 'Perception' };
  sheet('Revive?', h('div', null,
    h('p', null, 'Habitica charges the same in every app:'),
    h('ul', { class: 'steps' },
      s.lvl > 1 ? h('li', null, `Level ${s.lvl} → ${s.lvl - 1}`) : null,
      h('li', null, `All ${fmt.gold(pv.gpLost)} and your XP toward the next level`),
      pv.stat ? h('li', null, `1 point of ${STAT[pv.stat]}`) : null,
      pv.item ? h('li', null, `Your ${ITEMS.gear[pv.item]?.[2] || pv.item} (you can buy it again)`) : null,
    ),
    h('p', { class: 'muted' }, 'Which point and which piece Habitica takes is decided by your numbers, so this list is exact.'),
  ), [{ label: 'Cancel', run: () => {} }, { label: 'Revive', primary: true, run: () => { store.revive(); } }]);
}

/* ---------------------------------------------------------------- cards */

function taskRow (t: UiTask, p: TaskPreview, sub: string, note?: string): HTMLElement {
  return h('li', { class: 'li' },
    h('div', { class: 'li-main' },
      h('div', { class: 'li-title' }, plain(t.text)),
      h('div', { class: 'li-sub' }, sub)),
    button('I did it', () => confirmDid(t, p, note), { label: `I did it: ${plain(t.text)}`, disabled: store.busy, k: `did-${t.id}` }),
  );
}

function critCard (previews: Map<string, TaskPreview>): HTMLElement {
  const v = store.verdict!.rolls[0];
  const obj = store.objective;
  const best = openTasks(previews)
    .sort((a, b) => gainOf(previews.get(b.id)!, b, obj) - gainOf(previews.get(a.id)!, a, obj))
    .slice(0, 3);
  const live = store.live;
  return h('div', { class: 'card action' },
    h('div', { class: 'card-head' }, icon('bolt', live ? 'accent-icon' : ''), h('h2', { class: 'card-title' }, live ? `Your next task crits ${fmt.mult(v.mult)}` : `Last read: your next task crits ${fmt.mult(v.mult)}`)),
    live ? null : checkingNote(),
    h('div', { class: 'card-sub' }, best.length
      ? `Whatever you score next gets it. Biggest payoff in ${OBJ_LABEL[obj]}:`
      : 'No open tasks right now. The crit waits for the next one you score.'),
    best.length ? h('ul', { class: 'list' }, best.map(t => taskRow(t, previews.get(t.id)!, outcomeText(previews.get(t.id)!)))) : null,
  );
}

const TIER_LABEL = ['Free', 'Cheap', 'Costs something', 'Last resort'];
const tierOf = (o: ForceOption) => (o.conditional ? 'Only if it really happened' : o.ifDone ? 'If you’ve already done it' : TIER_LABEL[o.tier]);

/** One way to crit. Its tier leads the cost tags; the cheapest way gets the raised button, so the answer looks like one. */
function optionRow (o: ForceOption, roll: RollKey = 'task', best = false): HTMLElement {
  return h('div', { class: `opt ${best ? 'best' : ''} ${o.conditional ? 'conditional' : ''} tier-${o.tier}` },
    h('div', { class: 'opt-main' },
      o.steps.length > 1 ? h('ol', null, o.steps.map(st => h('li', null, st.label))) : h('div', { class: 'opt-one' }, o.steps[0].label),
      h('div', { class: 'cost' }, h('span', { class: 'tag tier' }, tierOf(o)), costTags(o).map(c => h('span', { class: 'tag' }, c)))),
    button('Do it', () => confirmRun(o, roll), { kind: best ? 'raised' : 'flat', label: `Do it: ${o.steps.map(st => st.label).join(', then ')}`, disabled: store.busy || store.offline, k: `do-${o.summary}` }));
}

/**
 * The ways to make one roll crit: tasks already done that set it up, then the cheapest way, with the rest folded
 * under "Other ways". Folded, never a last-resort, done-task or only-if-it-happened option first unless nothing else
 * exists. `all` (a skill's sheet) lists every way at once.
 */
function waysToCrit (card: HTMLElement, roll: RollKey, previews: Map<string, TaskPreview>, all = false): boolean {
  const f = store.force(roll);
  const then = roll === 'task' ? 'the task after it crits' : `your next ${skillByKey(roll)?.name} crits`;
  const setups = openTasks(previews).filter(t => { const p = previews.get(t.id)!; return rollHits(p.after, roll) && rollReady(p.after, roll); }).slice(0, 3);
  // a done task alone is the list above; the engine's single done-task option repeats it
  const options = (f?.options || []).filter(o => !(o.ifDone && o.steps.length === 1));
  const easy = options.filter(o => !o.conditional && !o.ifDone && o.tier < 3);
  const best = easy[0] || options[0];
  const rest = options.filter(o => o !== best);
  const open = all || ui.moreWays;
  if (setups.length) {
    card.append(
      h('h3', { class: 'subheader' }, 'Free, if you’ve already done it'),
      h('div', { class: 'card-sub' }, `Score one of these first and ${then}.`),
      h('ul', { class: 'list' }, setups.map(t => taskRow(t, previews.get(t.id)!, outcomeText(previews.get(t.id)!), `Then ${then}.`))),
    );
  }
  if (best) card.append(h('h3', { class: 'subheader' }, 'Cheapest way'), optionRow(best, roll, true));
  if (rest.length && open) card.append(h('h3', { class: 'subheader' }, 'Other ways'), ...rest.map(o => optionRow(o, roll)));
  if (rest.length && !all) {
    card.append(h('div', { class: 'card-actions start' },
      button(open ? 'Fewer ways' : `Other ways (${rest.length})`, () => { ui.moreWays = !ui.moreWays; store.emit(); },
        { icon: open ? 'expand_less' : 'expand_more', k: 'more-ways' })));
  }
  return setups.length > 0 || options.length > 0;
}

function forceCard (previews: Map<string, TaskPreview>): HTMLElement {
  const v = store.verdict!.rolls[0];
  // no task to score: nothing is offered to spend on a crit no task can take yet
  const none = !openTasks(previews).length;
  const card = h('div', { class: 'card action' },
    h('div', { class: 'card-head' }, icon('casino'), h('h2', { class: 'card-title' }, 'Make the next task crit')),
    store.live ? null : checkingNote(),
    h('div', { class: 'card-sub' }, none ? 'No open tasks right now. Ways to make one crit show up once there’s one to score.' : `Chance ${fmt.pct(v.chance)} now. Any of these makes it certain:`),
  );
  if (none) return card;
  if (!waysToCrit(card, 'task', previews)) {
    card.append(h('div', { class: 'card-body muted' }, 'Nothing you own or allow makes it crit right now. Look again after your next task, or allow more ways in Settings.'));
  }
  return card;
}

/** How to make the next cast of a skill that can crit (Brutal Smash, Burst of Flames, Backstab) crit, in a sheet. */
function openSkillWays (key: string) {
  const s = store.state; const def = skillByKey(key); const r = s && skillRoll(s, key);
  if (!s || !def || !r) return;
  const roll = key as RollKey;
  const body = h('div', { class: 'ways-sheet' }, h('p', { class: 'muted' }, `Chance ${fmt.pct(r.chance)} now. Any of these makes it certain and leaves the ${def.mana} MP to cast it:`));
  if (!waysToCrit(body, roll, store.previews(), true)) {
    body.append(h('p', { class: 'muted' }, `Nothing you own or allow makes your next ${def.name} crit right now. Look again after your next task or cast.`));
  }
  waysSheet = sheet(makeTitle(roll), body, [{ label: 'Close', run: () => { waysSheet = null; } }]);
}

function restoreBanner (): HTMLElement | null {
  const todo = store.restoreTodo();
  if (!todo.length) return null;
  const armed = store.restorePending?.armed;
  const names = todo.map(k => (k.startsWith('-') ? `take off ${ITEMS.gear[k.slice(1)]?.[2] || k.slice(1)}` : ITEMS.gear[k]?.[2] || k));
  return h('div', { class: 'banner warn' }, icon('swap_horiz'),
    h('div', { class: 'li-main' }, armed ? 'Crit landed? Put your gear back: ' : 'Done with the swap? Put your gear back: ', names.join(', ')),
    button('Put back', () => store.restoreGear(), { disabled: store.busy || store.offline, k: 'restore' }));
}

/** Burst of Flames' XP on a task: a bluer task multiplies it (ceil((value + 1) × 0.075)), so it aims at the bluest. */
function burstXp (s: NonNullable<typeof store.state>, value: number): string {
  try {
    const r = castSkill({ ...s, mp: Math.max(s.mp, 10) }, 'fireball', { targetValue: value });
    return `+${fmt.int(xpGained(s, r.state))} XP`;
  } catch { return ''; }
}

function skillsCard (): HTMLElement | null {
  const s = store.state!;
  if (!s.classSelected || s.lvl < 11) return null;
  const skills = availableSkills(s, { includeUnaffordable: true });
  const own = store.tasks.filter(t => !t.noCast && t.type !== 'reward');
  const defaultTarget = (key: string) => {
    if (key === 'smash' && store.settings.smashTarget) return own.find(t => t.id === store.settings.smashTarget) || own.slice().sort((a, b) => b.value - a.value)[0];
    return own.slice().sort((a, b) => b.value - a.value)[0];
  };
  // skills that can crit first; the ones that never do fold away, since only their mana moves the roll
  const crits = skills.filter(d => skillRoll(s, d.key));
  const others = skills.filter(d => !skillRoll(s, d.key));
  const row = (def: typeof skills[number]) => {
    const r = skillRoll(s, def.key);
    const tgt = def.target === 'task' ? defaultTarget(def.key) : undefined;
    const short = s.mp < def.mana;
    // the text keeps the row's width; the buttons sit under it, so a narrow phone (or large text) never squeezes the name
    return h('li', { class: 'li skill-row', 'data-k': `skill-${def.key}` },
      sprite(`shop_${def.key}`),
      h('div', { class: 'li-main' },
        h('div', { class: 'li-title' }, def.name, ' ', h('span', { class: 'tag' }, `${def.mana} MP`)),
        h('div', { class: 'li-sub' },
          r ? (r.crit ? h('b', { class: 'crit-text' }, `CRIT now ${fmt.mult(r.mult)}`) : 'no crit now') : 'never crits',
          tgt ? ` · on “${plain(tgt.text || '')}”` : '',
          def.key === 'fireball' && tgt ? ` · ${burstXp(s, tgt.value)}` : '',
          short ? ` · ${def.mana - s.mp} MP short` : ''),
        h('div', { class: 'li-actions' },
          r && !r.crit && def.crit && store.inventory?.targets.length ? button('Make it crit', () => openSkillWays(def.key), {
            label: `Make ${def.name} crit`, disabled: store.busy || store.offline, k: `ways-${def.key}`,
          }) : null,
          button('Cast', () => store.cast(def.key, tgt?.id), {
            disabled: short || (def.target === 'task' && !tgt) || store.busy || store.offline,
            label: `Cast ${def.name}${tgt ? ` on ${plain(tgt.text || '')}` : ''}`, k: `cast-${def.key}`,
          })),
      ),
    );
  };
  const open = ui.otherSkills || !crits.length;
  return foldCard('skills', { icon: 'auto_fix_high', title: 'Skills', count: `${fmt.int(s.mp)} MP` }, [
    h('div', { class: 'card-sub' }, has('crit') ? ['Casting spends ', term('mana', 'mp'), ' and moves the ', term('roll', 'roll'), '. '] : ['Casting spends ', term('mana', 'mp'), '. '], 'Task skills aim at your ', term('bluest task', 'bluest'), '.'),
    h('ul', { class: 'list' }, crits.map(row), open ? others.map(row) : null),
    crits.length && others.length ? h('div', { class: 'card-actions start' },
      button(open ? 'Fewer skills' : `Other skills (${others.length})`, () => { ui.otherSkills = !ui.otherSkills; store.emit(); },
        { icon: open ? 'expand_less' : 'expand_more', k: 'other-skills' })) : null]);
}

/** You: your avatar, name, level and the bars every Habitica player knows, first on Now. */
function youCard (): HTMLElement {
  const s = store.state!;
  const snap = store.snap!;
  const t = totals(s);
  const tnl = toNextLevel(s.lvl);
  const bar = (cls: string, label: string, val: number, max: number) => h('div', {
    class: `bar ${cls}`, role: 'meter', 'aria-label': label, 'aria-valuemin': '0', 'aria-valuemax': String(max), 'aria-valuenow': String(Math.round(val)),
  }, h('span', { style: `transform:scaleX(${Math.max(0, Math.min(1, val / max)).toFixed(3)})` }));
  const crit = has('crit');
  const toNext = `${fmt.int(tnl - s.exp)} XP to level ${s.lvl + 1}.`;
  // classes switched off: no class or skills ahead; level 10 and up without one: choosing it is what's next
  const next = snap.classesDisabled ? toNext
    : s.lvl >= 10 && !s.classSelected ? `Choose your class in Habitica to unlock ${crit ? 'skills, another way to move the roll' : 'class skills'}.`
    : s.lvl < 10 ? `Level 10: choose a class. Level 11: your first ${crit ? 'skill, another way to move the roll' : 'class skill'}.`
    : s.lvl < 11 ? `Level 11: your first class skill${crit ? ', another way to move the roll' : ''}.`
      : toNext;
  return h('div', { class: 'card', 'data-k': 'you' },
    h('div', { class: 'you' },
      store.raw ? avatarView(store.raw, 0.8) : null,
      h('div', { class: 'you-main' },
        h('div', { class: 'you-name' }, snap.name),
        h('div', { class: 'you-sub' }, term(`Level ${s.lvl}`, 'level'), `${s.classSelected ? ` ${className(s.cls)}` : ''} · ${fmt.gold(s.gp)}`),
        h('div', { class: 'bars' },
          h('span', null, term('HP', 'hp')), bar('hp', 'Health', s.hp, RULES.maxHealth), h('span', { class: 'mono' }, `${fmt.int(s.hp)}/${RULES.maxHealth}`),
          h('span', null, term('MP', 'mp')), bar('mp', 'Mana', s.mp, t.maxMP), h('span', { class: 'mono' }, `${fmt.int(s.mp)}/${t.maxMP}`),
          h('span', null, term('XP', 'xp')), bar('xp', 'Experience', s.exp, tnl), h('span', { class: 'mono' }, `${fmt.int(s.exp)}/${fmt.int(tnl)}`),
          dropsRow(),
        ),
      )),
    h('div', { class: 'you-next card-sub' }, next),
    dailiesDone());
}

/** Every Daily due today ticked: one of the player's own pets says so (B2). Nothing while one is still open. */
function dailiesDone (): HTMLElement | null {
  const due = store.tasks.filter(t => t.type === 'daily' && t.isDue);
  if (!due.length || due.some(t => !t.completed)) return null;
  return h('div', { class: 'you-done', 'data-k': 'dailies-done' },
    petPicture(companion(store.raw?.items), 'cheer'), h('span', null, due.length === 1 ? 'Today’s Daily is done.' : `All ${due.length} of today’s Dailies are done.`));
}

function bossCard (): HTMLElement | null {
  const party = store.party;
  const qk = party?.quest?.active ? party.quest.key : undefined;
  const boss = qk ? ITEMS.bossQuests?.[qk] : undefined;
  if (!boss || !party.quest.progress) return null;
  const hp = Number(party.quest.progress.hp) || 0;
  return foldCard('boss', { icon: 'whatshot', title: boss[2] || boss[0], count: `${Math.round(hp / boss[1] * 100)}%` }, [
    h('div', { class: 'card-body' },
      h('div', { class: 'bars' }, h('span', null, 'Boss'),
        h('div', { class: 'bar boss', role: 'meter', 'aria-label': 'Boss health', 'aria-valuemin': '0', 'aria-valuemax': String(boss[1]), 'aria-valuenow': String(Math.round(hp)) }, h('span', { style: `transform:scaleX(${Math.max(0, Math.min(1, hp / boss[1])).toFixed(3)})` })),
        h('span', { class: 'mono' }, `${fmt.int(hp)} / ${fmt.int(boss[1])}`)),
      h('p', { class: 'muted', style: 'margin:12px 0 0' }, 'Your ', term('damage', 'boss'), store.snap!.sleeping ? ' waiting until the first day change after you leave the Inn' : ' waiting for the next ', store.snap!.sleeping ? '' : term('day change', 'dayChange'), `: ${fmt.int(store.snap!.quest.pendingDamage)}`),
    )]);
}

/* ---------------------------------------------------------------- screen */

/** Shown on cards while the numbers aren't confirmed yet (saved copy, back from another app, a missed re-read). */
function checkingNote (): HTMLElement {
  return h('div', { class: 'checking-note' }, icon('sync', 'spin-slow'), 'Checking with Habitica. This is the last read.');
}

/** Offline: what the numbers were, what can't happen now, and a way to retry. Nothing here can act. */
function offlineCard (): HTMLElement {
  return h('div', { class: 'card offline-card' },
    h('div', { class: 'card-head' }, icon('cloud_off'), h('h2', { class: 'card-title' }, 'You’re offline')),
    h('div', { class: 'card-body offline-body' },
      h('p', { style: 'margin:0' }, 'Nothing waits to be sent later. Tasks and Stats stay readable.',
        has('crit') ? hint('Why nothing waits', 'A crit is only certain for the exact numbers it was worked out from. A tap saved up and sent later would land on different numbers, so Sidekick sends nothing while offline.', 'offline') : null),
      // a pet napping until Habitica answers again (B2)
      (() => { const pet = petPicture(companion(store.raw?.items), 'asleep'); return pet ? h('div', { class: 'nap' }, pet, h('span', { class: 'zz', 'aria-hidden': 'true' }, 'z', h('span', null, 'z'))) : null; })()),
    h('div', { class: 'card-actions' }, button('Try again', () => { store.sync({ quiet: true }); }, { kind: 'raised', k: 'offline-retry', disabled: store.busy })));
}

export function nowView (): HTMLElement {
  const main = h('div');
  if (store.offline) {
    main.append(offlineCard(), youCard());
    const bc = bossCard(); if (bc) main.append(bc);
    return main;
  }
  // Out of HP or a new day pending: the official apps allow nothing else first, so neither does this screen
  if (store.dead) {
    const s = store.state!;
    main.append(h('div', { class: 'card action hue-red' },
      h('div', { class: 'card-head' }, icon('favorite'), h('h2', { class: 'card-title' }, 'You ran out of HP')),
      h('div', { class: 'card-sub' }, `Reviving costs ${s.lvl > 1 ? 'a level, ' : ''}all your Gold, a stat point and a piece of gear. You see exactly which before you confirm.`),
      h('div', { class: 'card-actions' }, button('Revive…', confirmRevive, { kind: 'raised', disabled: store.busy || store.offline, k: 'revive' }))));
    main.append(youCard());
    return main;
  }
  if (store.needsCron) {
    main.append(startDayCard(), youCard());
    return main;
  }
  const previews = store.previews();
  const inn = innCard(); if (inn) main.append(inn);
  main.append(youCard());
  if (has('crit')) main.append(store.verdict!.rolls[0].crit ? critCard(previews) : forceCard(previews));
  // Relaxed: the streaks that reset tonight take the crit card's place, and only when there are some
  else if (streakRisks().length) main.append(riskCard());
  const rb = has('gear') ? restoreBanner() : null; if (rb) main.append(rb);
  const sk = has('skills') ? skillsCard() : null; if (sk) main.append(sk);
  const fold = { open: ui.classOpen, toggle: () => { ui.classOpen = !ui.classOpen; store.emit(); } };
  const cc = has('classTips') ? classCard(fold) : plainClassCard(fold); if (cc) main.append(cc);
  const bc = bossCard(); if (bc) main.append(bc);
  return main;
}

export function className (cls: string): string {
  return ({ warrior: 'Warrior', wizard: 'Mage', rogue: 'Rogue', healer: 'Healer' } as Record<string, string>)[cls] || cls;
}
