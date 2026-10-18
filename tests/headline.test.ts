/*
 * What the character on Now says when nobody taps it (src/app/headline.ts): the most important fact first, Full's
 * verdict around it, and Relaxed never mentioning crits or turning amber.
 */
import { bubbleKey, daySummary, facts, headline, text, LATE_MS, type HeadlineInput } from '../src/app/headline';

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };

const H = 3600e3;
const base = (x: Partial<HeadlineInput> = {}): HeadlineInput => ({
  mode: 'relaxed', connection: 'live', readAt: '14:02', dead: false, needsCron: false,
  dailies: [{ name: 'Gym', done: false }, { name: 'Read', done: true }, { name: 'Floss', done: false }],
  danger: { level: 'safe', hpAfter: 40, finish: [] }, streaks: [], untilDay: 9 * H, points: 0, invite: null, boss: null, collect: null,
  raise: [], hatch: [], level: { lvl: 12, exp: 10, toNext: 300 }, ...x,
});
const say = (x: Partial<HeadlineInput>) => headline(base(x));
const all = (x: Partial<HeadlineInput>) => facts(base(x)).map(f => f.id).join(',');

// ---- Relaxed: the first fact on the list
{
  const f = say({});
  check('relaxed: a calm day says Dailies left and the day change', f.id === 'dailies' && text(f.headline) === '2 Dailies left' && text(f.sub) === 'New day in 9 h.' && f.tone === 'normal', JSON.stringify(f));
  check('relaxed: every Daily done', text(say({ dailies: [{ name: 'Gym', done: true }] }).headline) === 'All Dailies done');
  check('relaxed: no Dailies due', text(say({ dailies: [] }).headline) === 'No Dailies today');
  check('relaxed: before the tasks are read, just the day change', text(say({ dailies: null }).headline) === 'Your day' && text(say({ dailies: null }).sub) === 'New day in 9 h.');
  check('relaxed: one Daily, singular', text(say({ dailies: [{ name: 'Gym', done: false }] }).headline) === '1 Daily left');

  const d = say({ danger: { level: 'dies', hpAfter: -3, finish: ['Gym', 'Floss'] }, untilDay: 2 * H + 10 * 60e3 });
  check('relaxed: a deadly day change comes first, red, naming what to finish', d.id === 'danger' && d.tone === 'danger' && text(d.headline) === 'Your HP is in danger' && text(d.sub) === 'The day change would take all of it. Finish Gym and Floss first; new day in 2 h 10 min.', text(d.sub));
  const many = say({ danger: { level: 'dies', hpAfter: -3, finish: ['Inbox zero', 'Water the plants', 'Read 20 pages', 'Morning run', 'Practice guitar'] } });
  check('relaxed: five Dailies to finish: two named, the rest counted', text(many.sub) === 'The day change would take all of it. Finish Inbox zero, Water the plants and 3 more first; new day in 9 h.', text(many.sub));
  const p = say({ danger: { level: 'dies', hpAfter: -3, finish: [] } });
  check('relaxed: nothing to finish that helps: pause damage', text(p.sub).includes('Pause damage in Habitica first'), text(p.sub));
  const low = say({ danger: { level: 'low', hpAfter: 6.2, finish: [] } });
  check('relaxed: a day change leaving 10 HP or less, not red', low.id === 'lowHp' && low.tone === 'normal' && text(low.headline) === 'Day change leaves 7 HP', text(low.headline));

  const late = say({ untilDay: LATE_MS, streaks: [{ name: 'Gym', streak: 12 }] });
  check('relaxed: Dailies open in the last 4 h name themselves and the streak at risk', late.id === 'lateDailies' && text(late.sub) === 'New day in 4 h: Gym and Floss. Gym’s 12-day streak resets if left.', text(late.sub));
  const late2 = say({ untilDay: H, streaks: [{ name: 'Gym', streak: 12 }, { name: 'Floss', streak: 3 }] });
  check('relaxed: more streaks at risk', text(late2.sub).endsWith('Gym’s 12-day streak and 1 other reset if left.'), text(late2.sub));
  check('relaxed: all done late in the day is calm', say({ untilDay: H, dailies: [{ name: 'Gym', done: true }] }).id === 'dailies');

  const boss = { name: 'Basi-List', hit: 41.04, hp: 339.2, max: 900 };
  check('relaxed: a boss hit waiting', text(say({ boss }).headline) === '41.0 damage waiting' && text(say({ boss }).sub) === 'Basi-List takes it at your day change. 340 / 900 HP left.', text(say({ boss }).sub));
  const inv = say({ invite: 'The Basi-List' });
  check('relaxed: a quest invitation waiting, by name', inv.id === 'invite' && text(inv.headline) === 'Quest invitation waiting' && inv.overline === 'Quest'
    && text(inv.sub) === 'The Basi-List starts once everyone in the party has answered. Accept or Reject it in Habitica.', text(inv.sub));
  check('relaxed: a quest invitation for a quest the app doesn’t know', text(say({ invite: '' }).sub).startsWith('Your party’s quest starts once'));
  check('relaxed: no invitation, nothing said', all({ invite: null }) === 'dailies');
  check('relaxed: no hit, nothing to say about the boss', say({ boss: { ...boss, hit: 0 } }).id === 'dailies');
  check('relaxed: quest items found today', text(say({ collect: { found: 7, total: 20, today: 2 } }).headline) === '2 items found today');
  check('relaxed: stat points, on the chosen stat', text(say({ points: 2, allocateTo: 'str' }).headline) === '2 stat points to spend' && text(say({ points: 2, allocateTo: 'str' }).sub).startsWith('On STR'));
  const r = say({ raise: [{ pet: 'Shade Wolf', feeds: 3 }, { pet: 'Red Fox', feeds: 5 }] });
  check('relaxed: pets the food you hold raises', text(r.headline) === '2 pets can grow up' && text(r.sub) === '3 feeds of the food you hold make your Shade Wolf a mount. 1 other too. See Feeding and hatching on Stats.', text(r.sub));
  const r1 = say({ raise: [{ pet: 'Red Fox', feeds: 1 }] });
  check('relaxed: one pet, one feed, singular', text(r1.headline) === 'A pet can grow up' && text(r1.sub).startsWith('1 feed of the food you hold makes your Red Fox a mount.'), text(r1.sub));
  const hatch = say({ hatch: ['Red Wolf', 'Zombie Fox', 'Base Cactus', 'Skeleton Bear'] });
  check('relaxed: new pets to hatch', text(hatch.headline) === '4 new pets to hatch' && text(hatch.sub).startsWith('Red Wolf, Zombie Fox and 2 more: you hold the eggs and potions.'), text(hatch.sub));
  check('relaxed: one new pet to hatch', text(say({ hatch: ['Red Wolf'] }).headline) === 'A new pet to hatch' && text(say({ hatch: ['Red Wolf'] }).sub).includes('the egg and the potion'));
  check('relaxed: the next level close', text(say({ level: { lvl: 12, exp: 271, toNext: 300 } }).headline) === 'Level 13 is close' && text(say({ level: { lvl: 12, exp: 271, toNext: 300 } }).sub) === '29 XP to go. A new level fills your HP.');
  check('relaxed: the next level not close', say({ level: { lvl: 12, exp: 269, toNext: 300 } }).id === 'dailies');

  check('order: danger > low > late Dailies > boss > items > points > raise > hatch > level > Dailies',
    all({ danger: { level: 'dies', hpAfter: -1, finish: ['Gym'] }, untilDay: H, invite: 'Q', boss: { name: 'B', hit: 1, hp: 1, max: 2 }, collect: { found: 0, total: 1, today: 1 }, points: 1, raise: [{ pet: 'P', feeds: 1 }], hatch: ['Q'], level: { lvl: 1, exp: 99, toNext: 100 } })
      === 'danger,lateDailies,invite,bossHit,questItems,points,raise,hatch,level,dailies');
  check('order: low HP before late Dailies', all({ danger: { level: 'low', hpAfter: 5, finish: [] }, untilDay: H }) === 'lowHp,lateDailies,dailies');

  const off = say({ connection: 'offline', danger: { level: 'dies', hpAfter: -1, finish: [] } });
  check('relaxed: offline beats everything, Blue Grey, past tense', off.id === 'offline' && off.tone === 'offline' && off.overline === 'Last read 14:02' && text(off.sub) === 'These are your numbers from 14:02. Nothing can be ticked until you’re back online.');
  check('relaxed: out of HP', say({ dead: true }).id === 'dead' && all({ dead: true, points: 3 }) === 'dead');
  check('relaxed: new day waiting, nothing else', all({ needsCron: true, points: 3, untilDay: H }) === 'newDay');
  check('relaxed: checking keeps saying the facts (the status line says checking)', say({ connection: 'checking', points: 1 }).id === 'points');
  check('relaxed: danger needs the Dailies read', say({ dailies: null, danger: { level: 'dies', hpAfter: -1, finish: [] } }).id === 'dailies');
}

// ---- Full: the verdict around the most important fact
{
  const roll = { crit: false, mult: 1, chance: 0.0412 };
  const crit = { crit: true, mult: 2.4, chance: 0.0412 };
  const n = say({ mode: 'full', roll });
  check('full: no crit, with the chance', n.id === 'noCrit' && n.overline === 'Next task' && text(n.headline) === 'No crit' && text(n.sub) === 'Crit chance 4.1%.' && n.tone === 'normal', text(n.sub));
  check('full: the chance explains itself on a tap', n.sub.some(s => typeof s !== 'string' && 'key' in s && s.key === 'critChance'));
  const c = say({ mode: 'full', roll: crit });
  check('full: a crit, amber', c.id === 'crit' && c.tone === 'crit' && text(c.headline) === 'CRIT ×2.40' && text(c.sub) === 'Whatever you score next is a crit: 2.40× the XP and Gold.' && c.compact === 'Next task: CRIT ×2.40');
  const late = say({ mode: 'full', roll, untilDay: H });
  check('full: the day\'s most important fact rides under the verdict', late.id === 'noCrit' && text(late.sub) === 'Crit chance 4.1%. 2 Dailies left, new day in 1 h.', text(late.sub));
  check('full: a quest invitation rides under the verdict', text(say({ mode: 'full', roll, invite: 'The Basi-List' }).sub) === 'Crit chance 4.1%. A quest invitation is waiting for your answer in Habitica.', text(say({ mode: 'full', roll, invite: 'X' }).sub));
  check('full: points, pets and levels stay off the verdict', text(say({ mode: 'full', roll, points: 2, raise: [{ pet: 'P', feeds: 1 }], hatch: ['Q'], level: { lvl: 1, exp: 99, toNext: 100 } }).sub) === 'Crit chance 4.1%.');
  const dies = { level: 'dies' as const, hpAfter: -2, finish: ['Gym'] };
  const d = say({ mode: 'full', roll, danger: dies });
  check('full: a deadly day change takes the bubble when no crit, red', d.id === 'danger' && d.tone === 'danger');
  const cd = say({ mode: 'full', roll: crit, danger: dies });
  check('full: a crit beats it, the warning moves below', cd.id === 'crit' && cd.tone === 'crit' && text(cd.sub).endsWith(' But the day change would take all your HP: finish Gym first.'), text(cd.sub));
  const ck = say({ mode: 'full', roll: crit, connection: 'checking' });
  check('full: checking is never amber', ck.id === 'checking' && ck.tone === 'checking' && text(ck.sub) === 'The last read said a crit ×2.40. Confirming with Habitica.');
  const off = say({ mode: 'full', roll: crit, connection: 'offline' });
  check('full: offline, past tense', off.id === 'offline' && text(off.sub) === 'At 14:02 your next task was a crit ×2.40. Nothing can be scored until you’re back online.', text(off.sub));
  check('full: offline and out of HP', text(say({ mode: 'full', roll, connection: 'offline', dead: true }).sub).startsWith('At 14:02 your next task was blocked: out of HP.'));
  check('full: out of HP', say({ mode: 'full', roll: crit, dead: true }).id === 'dead');
  check('full: new day waiting', say({ mode: 'full', roll: crit, needsCron: true }).id === 'newDay');
}

// ---- the key that cuts a tapped line short
{
  const k = (x: Partial<HeadlineInput>) => bubbleKey(say(x));
  const roll = { crit: false, mult: 1, chance: 0.04 };
  check('key: the calm facts trading places keep it', k({ points: 2 }) === k({ hatch: ['Red Wolf'] }) && k({}) === k({ untilDay: H }) && k({ mode: 'full', roll }) === k({ mode: 'full', roll, untilDay: H }));
  const keys = new Set([k({}), k({ mode: 'full', roll: { ...roll, crit: true } }), k({ danger: { level: 'dies', hpAfter: -1, finish: [] } }), k({ connection: 'offline' }), k({ mode: 'full', roll, connection: 'checking' }), k({ dead: true }), k({ needsCron: true })]);
  check('key: a crit, danger, offline, checking, out of HP and a new day each change it', keys.size === 7, [...keys].join(' '));
}

// ---- Relaxed never mentions a crit, never amber; every fact fits a bubble; on random days
{
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
  let bad = '';
  let long = '';
  for (let i = 0; i < 4000; i++) {
    const x = base({
      mode: pick(['full', 'relaxed'] as const), connection: pick(['live', 'live', 'checking', 'offline'] as const), dead: rnd() < 0.05, needsCron: rnd() < 0.05,
      roll: { crit: rnd() < 0.3, mult: 1 + rnd() * 3, chance: rnd() * 0.2 },
      dailies: rnd() < 0.1 ? null : Array.from({ length: Math.floor(rnd() * 6) }, (_, k) => ({ name: `Daily ${k}`, done: rnd() < 0.5 })),
      danger: { level: pick(['safe', 'low', 'dies', 'resting'] as const), hpAfter: rnd() * 60 - 10, finish: rnd() < 0.5 ? ['Gym'] : [] },
      streaks: rnd() < 0.3 ? [{ name: 'Gym', streak: 4 }] : [], untilDay: rnd() * 24 * H, points: rnd() < 0.3 ? 2 : 0,
      invite: rnd() < 0.2 ? pick(['', 'Lunar Battle, Part 3: The Monstrous Moon']) : null,
      boss: rnd() < 0.3 ? { name: 'Basi-List', hit: rnd() * 50, hp: 400, max: 900 } : null,
      collect: rnd() < 0.2 ? { found: 3, total: 20, today: Math.floor(rnd() * 3) } : null,
      raise: rnd() < 0.3 ? [{ pet: 'Cotton Candy Blue Bear Cub', feeds: 3 }] : [], hatch: rnd() < 0.3 ? ['Cotton Candy Pink Hedgehog'] : [],
      level: { lvl: 20, exp: rnd() * 400, toNext: 400 },
    });
    if (x.mode === 'relaxed') x.roll = undefined;
    const f = headline(x);
    const words = [f.overline, text(f.headline), text(f.sub), f.compact].join(' ');
    if (x.mode === 'relaxed' && (/crit/i.test(words) || f.tone === 'crit')) bad ||= words;
    if (f.tone === 'crit' && (x.connection !== 'live' || x.dead || x.needsCron || !x.roll?.crit)) bad ||= `amber without a live crit: ${words}`;
    if (text(f.headline).length > 24) long ||= text(f.headline);
  }
  check('relaxed never mentions a crit; amber only for a live crit', !bad, bad);
  check('every headline fits a bubble (24 characters at most)', !long, long);
}

// ---- the day's summary, said once when the last Daily is ticked
{
  const none = { n: 0, gp: 0, exp: 0 };
  check('summary: Relaxed, Dailies only', daySummary('relaxed', 8, { n: 3, gp: 41.2, exp: 52 }) === 'All 8 Dailies done! The rest of the day is yours.');
  check('summary: Full with crits, what they added', daySummary('full', 8, { n: 3, gp: 41.2, exp: 52.6 }) === 'All 8 Dailies done! 3 crits today added 41 Gold and 53 XP.');
  check('summary: small gains to one decimal, one crit singular', daySummary('full', 2, { n: 1, gp: 2.44, exp: 7.25 }) === 'All 2 Dailies done! 1 crit today added 2.4 Gold and 7.3 XP.');
  check('summary: Full without a crit says nothing of crits', daySummary('full', 1, none) === 'Today’s Daily is done! The rest of the day is yours.');
}

if (failures) { console.log(`FAIL  headline: ${failures} of ${checks} checks failed`); process.exit(1); }
console.log(`PASS  headline: ${checks} checks`);
