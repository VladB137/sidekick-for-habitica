/*
 * Habitica's Check-In Rewards (content/loginIncentives.js, in src/data/items.json as checkIns): which one comes next.
 * Each day change Habitica counts a check-in (cron.js: loginIncentives += 1) and hands over the reward for that count,
 * so a count already reached is already given: the next reward is the first one past it.
 */
import itemsJson from '../data/items.json';

const CHECK_INS = (itemsJson as unknown as { checkIns: Array<[number, string]> }).checkIns;

export interface NextCheckIn {
  /** the check-in count that brings it */
  at: number
  /** check-ins still to go, 1 or more */
  left: number
  /** Habitica's words for it, as its notification says them ("Royal Purple Potion", "Bardic Lute") */
  reward: string
}

/** The next Check-In Reward after `count` check-ins (GET /user loginIncentives), or null once the last one is given. */
export function nextCheckIn (count: unknown): NextCheckIn | null {
  if (typeof count !== 'number' || !Number.isFinite(count) || count < 0) return null;
  const n = Math.floor(count);
  const next = CHECK_INS.find(([at]) => at > n);
  return next ? { at: next[0], left: next[0] - n, reward: next[1] } : null;
}
