/*
 * What the character on Now says when nobody taps it: the one most important thing right now, as the speech
 * bubble's overline, headline and line below (look S). Tapping the character says something else for a moment;
 * when that ends, the bubble goes back to this.
 *
 * The order, most important first:
 *   offline · out of HP or a new day waiting · (Full) checking · (Full) a crit waiting · the day change would take
 *   all your HP · (Full) no crit · the day change would leave 10 HP or less · Dailies open in the last 4 h before
 *   the day change · a quest invitation waiting for your answer · your boss hit waiting · quest items found today · stat points to spend · a pet the food you hold
 *   raises into a mount · a new pet you can hatch · the next level close · Dailies left (always there)
 * In Full the crit verdict stays the headline unless the day change would take all your HP (a crit beats even that:
 * the warning moves to the line below); the most important fact after it rides in the line below. Relaxed never
 * mentions crits and is never amber: it says the first fact on the list.
 *
 * Pure: every number comes from the engine through `headlineInput` (views/headline.ts), so it can be tested on its own.
 */
import { duration } from './lines';

export type Tone = 'normal' | 'crit' | 'danger' | 'offline' | 'checking';
export type FactId =
  | 'offline' | 'dead' | 'newDay' | 'checking' | 'crit' | 'noCrit' | 'danger' | 'lowHp' | 'lateDailies'
  | 'invite' | 'bossHit' | 'questItems' | 'points' | 'raise' | 'hatch' | 'level' | 'dailies';
/** A piece of text: plain, bold, or a word that explains itself on a tap (ui/term.ts, glossary key). */
export type Seg = string | { b: string } | { term: string, key: string };

export interface Fact {
  id: FactId
  tone: Tone
  /** the small line above, "Your day" or "Next task" */
  overline: string
  /** the bubble's big words: a few, so they fit beside the character */
  headline: Seg[]
  /** a material icon before the headline (offline) */
  icon?: string
  /** the line below: the detail, in a sentence or two */
  sub: Seg[]
  /** the app bar's title once Now is scrolled */
  compact: string
  /** in a few words, for the line below another fact's headline */
  short: string
}

export interface HeadlineInput {
  mode: 'full' | 'relaxed'
  connection: 'live' | 'checking' | 'offline'
  /** clock time of the last read, already formatted ("14:02") */
  readAt: string
  dead: boolean
  needsCron: boolean
  /** Full: the next task's roll */
  roll?: { crit: boolean, mult: number, chance: number }
  /** some equipped gear is newer than the app's item table: it only adds stats, so a crit stays a crit (its
   * multiplier a floor), but no crit may be one (fns/crit.js) */
  gearUnknown?: boolean
  /** today's due Dailies (names as plain text), or null before the tasks are read */
  dailies: Array<{ name: string, done: boolean }> | null
  /** the next day change for HP (engine dayChangeDanger); `finish` = the Dailies to finish first, biggest loss first */
  danger: { level: 'resting' | 'safe' | 'low' | 'dies', hpAfter: number, finish: string[] } | null
  /** streaks the next day change resets (engine streaksLost), longest first */
  streaks: Array<{ name: string, streak: number }>
  /** ms to the next day change in the account's time zone */
  untilDay: number
  /** resting in the Inn: quest progress waits for the first day change after leaving (libs/cron.js) */
  sleeping?: boolean
  points: number
  /** the stat the player chose for points, 'str' … */
  allocateTo?: string
  /**
   * a quest invitation waiting for your answer (GET /user party.quest.RSVPNeeded): the quest's name, '' when unknown.
   * The quest starts once everyone in the party has answered (api-v3/quests.js canStartQuestAutomatically).
   */
  invite: string | null
  /** an active boss quest: its name, the damage your day change deals, its HP left and full */
  boss: { name: string, hit: number, hp: number, max: number } | null
  /** an active collection quest: items found by the party, needed, and found by you today (counted at your day change) */
  collect: { found: number, total: number, today: number } | null
  /** pets the food you hold raises into mounts (engine feedingPlan raise with ready), fewest feeds first */
  raise: Array<{ pet: string, feeds: number }>
  /** new pets you can hatch with the eggs and potions you hold (engine feedingPlan hatch), most useful first */
  hatch: string[]
  level: { lvl: number, exp: number, toNext: number }
}

/** Dailies still open count as urgent this close to the day change (the notification's DAILIES_URGENT_MS). */
export const LATE_MS = 4 * 3600e3;
/** The next level counts as close within this share of the level's XP. */
export const LEVEL_CLOSE = 0.1;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (names: string[]): string => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`);
/** up to two names, then how many more */
const few = (names: string[]): string => (names.length <= 3 ? list(names) : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`);
const dec1 = (x: number) => Math.max(0, x).toFixed(1);
const mult = (m: number) => `×${m.toFixed(2)}`;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Every fact true right now, most important first. The bubble says the first; Full builds its verdict around it. */
export function facts (x: HeadlineInput): Fact[] {
  const out: Fact[] = [];
  const day = 'Your day';
  const until = `New day in ${duration(Math.max(0, x.untilDay))}`;

  if (x.connection === 'offline') {
    const was = x.mode === 'full' && x.roll
      ? `At ${x.readAt} your next task was ${x.dead ? 'blocked: out of HP' : x.needsCron ? 'waiting for a new day' : x.roll.crit ? `a crit ${mult(x.roll.mult)}` : `no crit (chance ${pct(x.roll.chance)})`}. Nothing can be scored until you’re back online.`
      : `These are your numbers from ${x.readAt}. Nothing can be ticked until you’re back online.`;
    out.push({ id: 'offline', tone: 'offline', overline: `Last read ${x.readAt}`, icon: 'cloud_off', headline: ['Offline'], sub: [was], compact: 'Offline', short: 'Offline' });
  }
  if (x.dead) out.push({ id: 'dead', tone: 'normal', overline: day, headline: ['Out of HP'], sub: ['Revive to continue.'], compact: 'Out of HP', short: 'Out of HP' });
  else if (x.needsCron) out.push({ id: 'newDay', tone: 'normal', overline: day, headline: ['New day waiting'], sub: ['Start the new day to continue.'], compact: 'New day waiting', short: 'New day waiting' });
  const paused = x.dead || x.needsCron;

  const full = x.mode === 'full' && x.roll;
  if (full && x.connection === 'checking' && !paused) {
    const last = x.roll!.crit ? `a crit ${mult(x.roll!.mult)}` : `no crit (chance ${pct(x.roll!.chance)})`;
    out.push({ id: 'checking', tone: 'checking', overline: 'Next task', headline: ['Checking…'], sub: [`The last read said ${last}. Confirming with Habitica.`], compact: 'Checking…', short: 'Checking' });
  }
  if (paused) return out;

  const open = x.dailies?.filter(d => !d.done) ?? [];
  const late = x.untilDay <= LATE_MS;
  const d = x.dailies ? x.danger : null;
  if (d?.level === 'dies') {
    const fix = d.finish.length ? `Finish ${few(d.finish)} first` : 'Pause damage in Habitica first';
    out.push({ id: 'danger', tone: 'danger', overline: day, headline: ['Your HP is in danger'],
      sub: [`The day change would take all of it. ${fix}; ${lower(until)}.`], compact: 'Day change takes all your HP', short: `the day change would take all your HP: ${lower(fix)}` });
  }
  if (d?.level === 'low') {
    const left = Math.ceil(Math.max(0, d.hpAfter));
    out.push({ id: 'lowHp', tone: 'normal', overline: day, headline: [`Day change leaves ${left} HP`],
      sub: [`${open.length ? 'Each Daily you finish keeps more. ' : ''}${until}.`], compact: `Day change leaves ${left} HP`, short: `the day change leaves you ${left} HP` });
  }
  if (late && open.length) {
    const risk = x.streaks[0];
    const streak = risk ? ` ${risk.name}’s ${risk.streak}-day streak${x.streaks.length > 1 ? ` and ${plural(x.streaks.length - 1, 'other', 'others')}` : ''} reset${x.streaks.length > 1 ? '' : 's'} if left.` : '';
    const head = `${plural(open.length, 'Daily', 'Dailies')} left`;
    out.push({ id: 'lateDailies', tone: 'normal', overline: day, headline: [head], sub: [`${until}: ${few(open.map(o => o.name))}.${streak}`],
      compact: `${head} · ${lower(until)}`, short: `${head}, ${lower(until)}` });
  }
  if (x.invite !== null) {
    out.push({ id: 'invite', tone: 'normal', overline: 'Quest', headline: ['Quest invitation waiting'],
      sub: [`${x.invite || 'Your party’s quest'} starts once everyone in the party has answered. Accept or Reject it in Habitica.`],
      compact: 'Quest invitation waiting', short: 'a quest invitation is waiting for your answer in Habitica' });
  }
  if (x.boss && x.boss.hit > 0) {
    out.push({ id: 'bossHit', tone: 'normal', overline: 'Quest', headline: [`${dec1(x.boss.hit)} damage waiting`],
      sub: [`${x.boss.name} takes it ${x.sleeping ? 'at the first day change after you leave the Inn' : 'at your day change'}. ${Math.ceil(Math.max(0, x.boss.hp))} / ${x.boss.max} HP left.`], compact: `Boss hit waiting: ${dec1(x.boss.hit)}`, short: `${dec1(x.boss.hit)} boss damage waiting` });
  }
  if (x.collect && x.collect.today > 0) {
    out.push({ id: 'questItems', tone: 'normal', overline: 'Quest', headline: [`${plural(x.collect.today, 'item', 'items')} found${x.sleeping ? '' : ' today'}`],
      sub: [`They count ${x.sleeping ? 'at the first day change after you leave the Inn' : 'at your day change'}. The party has ${x.collect.found} / ${x.collect.total}.`], compact: `${plural(x.collect.today, 'quest item', 'quest items')} found`, short: `${plural(x.collect.today, 'quest item', 'quest items')} found today` });
  }
  if (x.points > 0) {
    const head = `${plural(x.points, 'stat point', 'stat points')} to spend`;
    out.push({ id: 'points', tone: 'normal', overline: 'Stats', headline: [head],
      sub: [x.allocateTo ? `On ${x.allocateTo.toUpperCase()}, as you chose: see Stats.` : 'Spend them on Stats.'], compact: head, short: head });
  }
  if (x.raise.length) {
    const r = x.raise[0];
    const head = x.raise.length === 1 ? 'A pet can grow up' : `${x.raise.length} pets can grow up`;
    const more = x.raise.length > 1 ? ` ${plural(x.raise.length - 1, 'other', 'others')} too.` : '';
    out.push({ id: 'raise', tone: 'normal', overline: 'Stable', headline: [head],
      sub: [`${plural(r.feeds, 'feed', 'feeds')} of the food you hold make${r.feeds === 1 ? 's' : ''} your ${r.pet} a mount.${more} See Feeding and hatching on Stats.`], compact: head, short: lower(head) });
  }
  if (x.hatch.length) {
    const head = x.hatch.length === 1 ? 'A new pet to hatch' : `${x.hatch.length} new pets to hatch`;
    const names = few(x.hatch);
    out.push({ id: 'hatch', tone: 'normal', overline: 'Stable', headline: [head],
      sub: [`${names}: you hold the ${x.hatch.length === 1 ? 'egg and the potion' : 'eggs and potions'}. See Feeding and hatching on Stats.`], compact: head, short: lower(head) });
  }
  const need = Math.ceil(x.level.toNext - x.level.exp);
  if (x.level.toNext > 0 && need > 0 && need <= x.level.toNext * LEVEL_CLOSE) {
    const head = `Level ${x.level.lvl + 1} is close`;
    out.push({ id: 'level', tone: 'normal', overline: 'Your level', headline: [head], sub: [`${need} XP to go. A new level fills your HP.`], compact: head, short: `level ${x.level.lvl + 1} in ${need} XP` });
  }
  {
    const due = x.dailies?.length ?? 0;
    const head = x.dailies === null ? 'Your day' : !due ? 'No Dailies today' : open.length ? `${plural(open.length, 'Daily', 'Dailies')} left` : 'All Dailies done';
    out.push({ id: 'dailies', tone: 'normal', overline: day, headline: [head], sub: [`${until}.`], compact: `${head} · ${lower(until)}`, short: x.dailies === null ? lower(until) : `${head}, ${lower(until)}` });
  }
  return out;
}

/** Facts that take the bubble in Full too: the app's own state. */
const STATE_FACTS: FactId[] = ['offline', 'dead', 'newDay', 'checking'];
/** The facts that may ride under Full's verdict: what the day needs from you, not the rest. */
const DAY_FACTS: FactId[] = ['danger', 'lowHp', 'lateDailies', 'invite', 'bossHit', 'questItems'];

/** What the character says when nobody taps it. */
export function headline (x: HeadlineInput): Fact {
  const all = facts(x);
  const top = all[0];
  if (x.mode !== 'full' || !x.roll || STATE_FACTS.includes(top.id)) return top;
  // Full, live, nothing paused: the verdict, unless the day change would take all your HP and no crit can help
  const next = all.find(f => DAY_FACTS.includes(f.id));
  if (x.roll.crit) {
    const sub: Seg[] = ['Whatever you score next is a ', { term: 'crit', key: 'crit' }, `: ${x.gearUnknown ? 'at least ' : ''}${x.roll.mult.toFixed(2)}× the XP and Gold.`];
    if (next?.id === 'danger') sub.push(` But ${next.short}.`);
    return { id: 'crit', tone: 'crit', overline: 'Next task', headline: [{ b: 'CRIT ' }, mult(x.roll.mult)], sub, compact: `Next task: CRIT ${mult(x.roll.mult)}`, short: `CRIT ${mult(x.roll.mult)}` };
  }
  if (top.id === 'danger') return top;
  const sub: Seg[] = [{ term: 'Crit chance', key: 'critChance' }, ` ${x.gearUnknown ? 'at least ' : ''}${pct(x.roll.chance)}.`];
  if (x.gearUnknown) sub.push(' Gear newer than the app may still make it one.');
  else if (next) sub.push(` ${next.short.charAt(0).toUpperCase()}${next.short.slice(1)}.`);
  return { id: 'noCrit', tone: 'normal', overline: 'Next task', headline: [x.gearUnknown ? 'Likely no crit' : 'No crit'], sub, compact: 'Next task: no crit', short: 'no crit' };
}

/** Crits of the day from the journal: how many, and the Gold and XP they added over the same taps without them. */
export interface DayCrits { n: number, gp: number, exp: number }

/** a gain as words: whole above 10, else to one decimal ("2.4", "41") */
const gain = (x: number): string => (x >= 10 ? String(Math.round(x)) : String(Math.round(Math.max(0, x) * 10) / 10));

/**
 * What the character says, once, when the last due Daily of the day is ticked (Vlad's F3, 2026-10-17): how many
 * Dailies, and in Full what the day's crits added. Relaxed never mentions crits.
 */
export function daySummary (mode: 'full' | 'relaxed', due: number, crits: DayCrits): string {
  const done = due === 1 ? 'Today’s Daily is done!' : `All ${due} Dailies done!`;
  if (mode !== 'full' || crits.n < 1) return `${done} The rest of the day is yours.`;
  return `${done} ${plural(crits.n, 'crit', 'crits')} today added ${gain(crits.gp)} Gold and ${gain(crits.exp)} XP.`;
}

/** The words alone, for a label or a test. */
export const text = (s: Seg[]): string => s.map(p => (typeof p === 'string' ? p : 'b' in p ? p.b : p.term)).join('');

/**
 * Changes exactly when what the bubble says should cut a tapped line short: a crit, a deadly day change, offline,
 * checking, out of HP or a new day waiting coming or going. The calm facts trading places doesn't.
 */
export const bubbleKey = (f: Fact): string => `${f.tone}|${f.id === 'dead' || f.id === 'newDay' ? f.id : ''}`;
