// Generates the app's game data from Habitica's own content definitions (via the harness):
//   src/data/gear.json   key -> 0 | [str, con, int, per] | [str, con, int, per, class]
//   src/data/items.json  names/prices/slots the app needs for levers and the shop, and Habitica's repeating events
// The clock is set years ahead so every pre-dated Armoire/seasonal item is already in the table.
// Usage: npm run gen:data   (after npm run harness)
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const RealDate = Date;
const AHEAD = RealDate.now() + 5 * 365 * 86400e3;
globalThis.Date = class extends RealDate {
  constructor (...a) { if (a.length === 0) super(AHEAD); else super(...a); }
  static now () { return AHEAD; }
};
const require = createRequire(import.meta.url);
const H = require('./harness/load.cjs');
// content is built lazily on first access, so the clock stays mocked until extraction is done

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../src/data');
mkdirSync(out, { recursive: true });
const c = H.content;
const classes = ['warrior', 'rogue', 'healer', 'wizard'];

const gear = {};
const gearMeta = {};
let withStats = 0;
for (const [key, it] of Object.entries(c.gear.flat)) {
  const s = [it.str || 0, it.con || 0, it.int || 0, it.per || 0];
  const cls = classes.includes(it.klass) ? it.klass : (classes.includes(it.specialClass) ? it.specialClass : '');
  if (!s.some(Boolean)) gear[key] = 0;
  else { gear[key] = cls ? [...s, cls] : s; withStats += 1; }
  gearMeta[key] = [it.type, it.value || 0, it.text(), it.klass || '', it.specialClass || '', it.twoHanded ? 1 : 0, it.index === undefined ? '' : String(it.index)];
}

// eggs: [name, sell value = Market price in Gems, 'drop' | 'quest', the grown mount's name when it differs (Tiger Cub -> Tiger)];
// hatching potions: [name, value, 'drop' | 'premium' | 'wacky']
const eggs = Object.fromEntries(Object.entries(c.eggs).map(([k, v]) => {
  const e = [v.text(), v.value, c.dropEggs[k] ? 'drop' : 'quest'];
  const m = v.mountText ? v.mountText() : e[0];
  return [k, m !== e[0] ? [...e, m] : e];
}));
// Habitica's own word for what each egg hatches into ("a loyal" Wolf, "woolen" Yarn), as its hatching message says it:
// the Stable reads a creature's temperament from it (src/app/stable/social.ts)
const eggWords = Object.fromEntries(Object.entries(c.eggs).filter(([, v]) => v.adjective).map(([k, v]) => [k, v.adjective()]));
// Habitica's animal families (its set achievements: Polar Pro, Rodent Ruler…): species lists, cousins in the Stable
const animalSets = Object.fromEntries(Object.entries(c.animalSetAchievements).map(([k, v]) => [k, v.species]));
// Habitica's own names for the special pets and mounts (Cerberus Pup, Woolly Mammoth), which aren't "Potion Egg"
const specialNames = o => Object.fromEntries(Object.entries(o).map(([k, s]) => [k, H.i18n.t(s)]));
const specialPets = specialNames(c.specialPets), specialMounts = specialNames(c.specialMounts);
const potionKind = k => (c.dropHatchingPotions[k] ? 'drop' : c.wackyHatchingPotions?.[k] ? 'wacky' : 'premium');
const hatchingPotions = Object.fromEntries(Object.entries(c.hatchingPotions).map(([k, v]) => [k, [v.text(), v.value, potionKind(k)]]));
// food: [name, value, favourite of pets hatched with this potion]
const food = Object.fromEntries(Object.entries(c.food).filter(([k]) => k !== 'Saddle').map(([k, v]) => [k, [v.text(), v.value, v.target || '']]));
const quests = Object.fromEntries(Object.values(c.quests).filter(q => q.goldValue).map(q => [q.key, q.prereqQuests?.length ? [q.text(), q.goldValue, q.prereqQuests] : [q.text(), q.goldValue]]));
// boss quests: [name, boss HP, boss name, boss strength (multiplies the damage of missed Dailies)]
const bossQuests = Object.fromEntries(Object.values(c.quests).filter(q => q.boss && q.boss.hp).map(q => [q.key, [q.text(), q.boss.hp, q.boss.name ? q.boss.name() : '', q.boss.str || 1]]));
// collection quests: [name, { item key: [item name, count needed] }]
const collectQuests = Object.fromEntries(Object.values(c.quests).filter(q => q.collect).map(q => [q.key, [q.text(), Object.fromEntries(Object.entries(q.collect).map(([k, v]) => [k, [v.text(), v.count]]))]]));
// Habitica's repeating events (constants/events.js): [start, end] as ISO instants, the year 1970 standing for every year
// (the Stable's calendar decorates the feasts among them, stable/calendar.ts)
const events = Object.fromEntries(Object.entries(c.repeatingEvents).map(([k, e]) => [k, [e.start.toISOString(), e.end.toISOString()]]));
// the collection achievements the Stable shows as trophies (hatch.js, feed.js): what each asks, and Habitica's own name
// and line for it. colours: [potion, pet achievement, mount achievement]; sets: key -> ['pet' | 'petMount', species];
// petSets: [potion, achievement] over drop and quest eggs (Bone to Pick); names: key -> [name, text]
const up = k => k.charAt(0).toUpperCase() + k.slice(1);
const achName = k => [H.i18n.t(`achievement${up(k)}`), H.i18n.t(`achievement${up(k)}Text`)];
const achievements = {
  dropEggs: Object.keys(c.dropEggs), questEggs: Object.keys(c.questEggs), dropPotions: Object.keys(c.dropHatchingPotions),
  colours: c.animalColorAchievements.map(a => [a.color, a.petAchievement, a.mountAchievement]),
  sets: Object.fromEntries(Object.values(c.animalSetAchievements).map(a => [a.achievementKey, [a.type, a.species]])),
  petSets: c.petSetCompleteAchievs.map(a => [a.color, a.petAchievement]),
  names: {},
};
for (const [, p, m] of achievements.colours) { achievements.names[p] = achName(p); achievements.names[m] = achName(m); }
for (const k of Object.keys(achievements.sets)) achievements.names[k] = achName(k);
for (const [, k] of achievements.petSets) achievements.names[k] = achName(k);
for (const k of ['beastMaster', 'mountMaster', 'triadBingo']) achievements.names[k] = [H.i18n.t(`${k}Name`), H.i18n.t(`${k}Text`)];
// Check-In Rewards (content/loginIncentives.js): [check-in count, the reward in Habitica's words], in order, worded as
// cron.js's awardLoginIncentives words its notification (rewardName wins; a Royal Purple potion is "… Potion")
const checkIns = [];
for (const [n, li] of Object.entries(c.loginIncentives)) {
  if (!li.rewardKey) continue;
  let said = '';
  li.reward.forEach((r, i) => {
    if (r.text) { said += r.text(); if (r.key === 'RoyalPurple') said = H.i18n.t('potion', { potionType: said }); }
    else if (li.rewardKey[0] === 'background_blue') said = H.i18n.t('incentiveBackgrounds');
    if (i < li.reward.length - 1) said += ', ';
  });
  checkIns.push([Number(n), li.rewardName ? H.i18n.t(li.rewardName) : said]);
}
checkIns.sort((a, b) => a[0] - b[0]);
const special = Object.fromEntries(Object.entries(c.spells.special).map(([k, v]) => [k, [v.text(), v.value, c.cardTypes[k] ? 'card' : (v.previousPurchase ? 'transformation' : 'debuff')]]));

globalThis.Date = RealDate;
writeFileSync(resolve(out, 'gear.json'), JSON.stringify(gear));
writeFileSync(resolve(out, 'items.json'), JSON.stringify({
  habitica: H.version,
  generated: new RealDate().toISOString().slice(0, 10),
  gear: gearMeta,
  food, eggs, eggWords, animalSets, hatchingPotions, quests, special, bossQuests, collectQuests, specialPets, specialMounts, events, achievements, checkIns,
}));
console.log(`Habitica ${H.version}: ${Object.keys(gear).length} gear items (${withStats} with stats), ${Object.keys(food).length} food, ${Object.keys(c.eggs).length} eggs, ${Object.keys(c.hatchingPotions).length} hatching potions, ${Object.keys(quests).length} gold quests, ${Object.keys(special).length} special items`);
