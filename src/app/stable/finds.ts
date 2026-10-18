/*
 * A collection quest's finds in the Stable (Stable ideas, 10), read-only and from what the app already reads:
 * while the party runs a collection quest, what it has found lies in the playground's grass, in Habitica's own
 * pictures (tools/gen-quest-finds.mjs), up to 8 of each kind, one for each eighth of what the quest needs. What
 * the player found since the last day change glints in the grass: Habitica hands those over, as whichever finds
 * the party still needs, only at the day change (Group._processCollectionQuest), so they have no kind yet.
 */
import findsJson from '../../data/quest-finds.json';
import { ITEMS } from '../model';

type Json = any;

/** pictures of each kind at most */
export const PER_KIND = 8;
/** glints at most */
export const GLINTS = 8;

export interface Find {
  /** '<quest>_<item>', the picture's key */
  key: string,
  /** Habitica's name for the find ("Fire Coral") */
  name: string,
  found: number,
  need: number,
  /** pictures in the grass */
  shown: number,
}
export interface QuestFinds { quest: string, name: string, finds: Find[], today: number }

/** the pictures' places on public/stable/finds.png: [x, y, w, h] */
export const FIND_PICTURES = (findsJson as unknown as { finds: Record<string, [number, number, number, number]> }).finds;

/** Pictures for `found` of `need`: one for each eighth begun, none before the first find. */
export const shownOf = (found: number, need: number) => (found > 0 && need > 0 ? Math.min(PER_KIND, Math.ceil(PER_KIND * Math.min(found, need) / need)) : 0);

/**
 * The party's running collection quest and what it has found (undefined: none). Today's finds are the player's
 * own, counted only while the player is in that quest.
 */
export function findsOf (party: Json, raw: Json): QuestFinds | undefined {
  const q = party?.quest, c = q?.active ? ITEMS.collectQuests[q.key] : undefined;
  if (!c) return undefined;
  const [name, wanted] = c, got = q.progress?.collect || {};
  const finds = Object.entries(wanted).map(([item, [text, need]]) => {
    const n = Number(got[item]), found = Number.isFinite(n) ? Math.max(0, Math.min(need, n)) : 0;
    return { key: `${q.key}_${item}`, name: text, found, need, shown: shownOf(found, need) };
  });
  const mine = raw?.party?.quest, t = Number(mine?.progress?.collectedItems);
  const today = mine?.key === q.key && Number.isFinite(t) ? Math.max(0, t) : 0;
  return { quest: q.key, name, finds, today };
}

/** Every find of a quest as if all were found (a won quest's last picture). */
export function allFound (quest: string): QuestFinds | undefined {
  const c = ITEMS.collectQuests[quest];
  if (!c) return undefined;
  return findsOf({ quest: { key: quest, active: true, progress: { collect: Object.fromEntries(Object.entries(c[1]).map(([k, [, n]]) => [k, n])) } } }, undefined);
}

/** "Fire Coral and Blue Fins lie in the grass: 10 of 20 and 6 of 20, 3 more found today", for TalkBack */
export function describeFinds (f: QuestFinds): string | undefined {
  const lying = f.finds.filter(x => x.found > 0);
  const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
  const today = f.today ? `${f.today === 1 ? '1 more' : `${f.today} more`} found today, counted at the day change` : '';
  if (!lying.length) return today ? `${f.name}: ${today}` : undefined;
  const lie = `${list(lying.map(x => x.name))} ${lying.length === 1 && lying[0].found === 1 ? 'lies' : 'lie'} in the grass: ${list(lying.map(x => `${x.found} of ${x.need}`))}`;
  return today ? `${lie}, ${today}` : lie;
}
