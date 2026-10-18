/*
 * Habitica's own words, one sentence or two each, for the tap-to-explain sheets (ui/term.ts). The app keeps
 * Habitica's terms (STR, MP, crit) so players meet the same words in Habitica; these say what they mean.
 * Every fact here is one the app's engine or Habitica's code (at the rules.ts tag) already relies on.
 */
export interface GlossaryEntry { title: string, text: string }

export const GLOSSARY = {
  crit: { title: 'Crit', text: 'A critical hit: a bonus that multiplies the XP, Gold, mana and boss damage of one scored task, and its chance of an item drop. In Habitica it isn’t luck. Your own numbers decide it, which is how Sidekick can see it coming.' },
  critChance: { title: 'Crit chance', text: 'How often a task would crit with your Strength, out of all possible rolls. For your next task the roll is already decided by your numbers, so Sidekick tells you yes or no; the chance says how rare a yes is. More Strength raises it.' },
  roll: { title: 'The roll', text: 'A number Habitica works out from your HP, MP, XP, Gold, level, unspent points and stats each time you score. If it is under your crit chance, the task crits. Changing one of those numbers by a known amount moves the roll to another known value. Stats → How the numbers work shows yours.' },
  hp: { title: 'HP (health)', text: 'Missed Dailies and bad habits cost HP. At 0 you lose a level, all your Gold and XP, and one piece of gear. Levelling up fills it again, and Health Potions restore 15. The most is 50.' },
  mp: { title: 'MP (mana)', text: 'Class skills spend it. You get some back from doing tasks, and at the day change for the Dailies you did. Your most MP is 30 plus 2 for every point of Intelligence.' },
  xp: { title: 'XP (experience)', text: 'Every task you complete gives XP. Fill the bar and you go up a level, which also fills your HP.' },
  level: { title: 'Level', text: 'Goes up with XP. At level 10 you choose a class, and class skills start at 11. Every two levels add 1 to each of your stats, up to level 100.' },
  gold: { title: 'Gold', text: 'Tasks give Gold. You spend it on your own rewards, gear, Health Potions and quest scrolls.' },
  str: { title: 'STR (Strength)', text: 'Raises your crit chance and how big a crit is, and the damage you do to a boss.' },
  con: { title: 'CON (Constitution)', text: 'Lowers the HP you lose from missed Dailies and bad habits.' },
  int: { title: 'INT (Intelligence)', text: 'Gives more XP from tasks and raises your most MP.' },
  per: { title: 'PER (Perception)', text: 'Gives more Gold from tasks and a better chance of item drops.' },
  gear: { title: 'Gear', text: 'What you wear. Each piece adds to some stats, and a piece made for your class counts twice on Habitica’s server. Equipping costs nothing.' },
  points: { title: 'Stat points', text: 'You get one each time you level up and choose the stat it goes to. Spending one moves the roll, so Sidekick may suggest when to spend it, but only on the stat you picked in Settings.' },
  buffs: { title: 'Buffs', text: 'Short boosts to your stats from your own or your party’s skills. They end at your next day change.' },
  dayChange: { title: 'Day change', text: 'When your Habitica day starts. Dailies left unchecked count as missed and cost HP, streaks of missed Dailies reset, buffs end, and your MP refills for the Dailies you did. Habitica runs it the next time you open Habitica, or this app, after your day start.' },
  bluest: { title: 'Bluest task', text: 'Habitica colours every task by how well you keep it up: red when you skip it, blue when you do it often. The bluest is the one you’ve kept up best. Skills aimed at a task use it unless you pick another in Settings.' },
  drops: { title: 'Item drops', text: 'Completing a task can drop an egg, a hatching potion or food, up to a limit each day. A crit raises the chance. Pets eat the food; eggs and potions hatch new pets.' },
  streak: { title: 'Streak', text: 'How many due days in a row you did a Daily. Each day of streak adds to that Daily’s rewards. Missing it at the day change resets it to 0, unless you’re resting in the Inn or protected by a skill.' },
  boss: { title: 'Boss damage', text: 'In a boss quest, every task you complete stores damage for the boss. It lands at your next day change, and a crit multiplies it.' },
} satisfies Record<string, GlossaryEntry>;

export type TermKey = keyof typeof GLOSSARY;

/** Relaxed mode never mentions crits: the same facts without them, for the entries that bring one up. */
export const RELAXED_TEXT: Partial<Record<TermKey, string>> = {
  str: 'Raises the damage you do to a boss, and adds a little to what your tasks can give.',
  points: 'You get one each time you level up and choose the stat it goes to. Each point raises that stat for good.',
  drops: 'Completing a task can drop an egg, a hatching potion or food, up to a limit each day. Pets eat the food; eggs and potions hatch new pets.',
  boss: 'In a boss quest, every task you complete stores damage for the boss. It lands at your next day change.',
};
