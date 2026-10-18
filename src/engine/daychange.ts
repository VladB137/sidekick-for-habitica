/*
 * Danger at the next day change: does the player's own HP survive it, and what would keep it above 0.
 * Built on dayChange() (classplan.ts, parity suite H). Death = HP at 0 or below (ops/revive.js refuses above 0).
 * Used by the Inn advice card on Now; meant for any other place that says "the day change would kill you"
 * (notification lines, widget). Advice only: nothing here pauses damage, buys or scores anything.
 */
import { dayChange, type DayChange, type MissedDaily } from './classplan';
import { RULES } from './rules';
import type { State } from './core';

/** 'dies': HP 0 or less after the day change. 'low': 10 HP or less. 'resting': damage paused (the Inn). */
export type DangerLevel = 'resting' | 'safe' | 'low' | 'dies';

export interface DayChangeDanger extends DayChange {
  level: DangerLevel
  /**
   * Fewest open Dailies to finish before the day changes so HP stays above 0 (biggest loss first), 0 when not
   * dying, null when even finishing all of them isn't enough (the boss's share from party members aside).
   */
  dailiesToDo: number | null
  /** indices into `missed` of those Dailies, biggest loss first (empty unless dailiesToDo is a number above 0) */
  dailiesFirst: number[]
  /** Health Potions (+15 HP, 25 Gold, HP capped at 50) to drink first so HP stays above 0; null when no number is enough */
  potions: number | null
  /** the potions' price, and whether the player has that much Gold */
  potionGold: number
  potionsAffordable: boolean
  /** a boss quest is running: party members' missed Dailies add to the boss damage, unseen here, and still hit while resting */
  partyAdds: boolean
}

export const LOW_HP = 10;

const levelOf = (hpAfter: number): DangerLevel => (hpAfter <= 0 ? 'dies' : hpAfter <= LOW_HP ? 'low' : 'safe');

/**
 * What the next day change does to the player's HP, for their own missed Dailies and their share of the boss
 * damage, and the smallest fixes. `opts` as dayChange (stealth from Stealth casts, bossStr of the active boss
 * quest the player is in, sleeping = damage paused).
 */
export function dayChangeDanger (s: State, missed: MissedDaily[], opts: { stealth?: number, bossStr?: number, sleeping?: boolean } = {}): DayChangeDanger {
  const d = dayChange(s, missed, opts);
  const partyAdds = (opts.bossStr ?? 0) > 0;
  if (opts.sleeping) return { ...d, level: 'resting', dailiesToDo: 0, dailiesFirst: [], potions: 0, potionGold: 0, potionsAffordable: true, partyAdds };
  const level = levelOf(d.hpAfter);
  if (level !== 'dies') return { ...d, level, dailiesToDo: 0, dailiesFirst: [], potions: 0, potionGold: 0, potionsAffordable: true, partyAdds };

  // Dailies: drop the costliest first; the fewest that leave HP above 0 (greedy is optimal for a sum of losses)
  const cost = (m: MissedDaily) => { const one = dayChange(s, [m], { bossStr: opts.bossStr }); return one.hpLoss + one.bossLoss; };
  const order = missed.map((m, i) => ({ m, i, c: cost(m) })).sort((a, b) => b.c - a.c);
  let dailiesToDo: number | null = null;
  let dailiesFirst: number[] = [];
  for (let n = 1; n <= order.length; n++) {
    const done = new Set(order.slice(0, n).map(x => x.i));
    if (dayChange(s, missed.filter((_, i) => !done.has(i)), opts).hpAfter > 0) { dailiesToDo = n; dailiesFirst = order.slice(0, n).map(x => x.i); break; }
  }

  // Potions: HP after drinking is capped at max, so past a point more potions don't help
  let potions: number | null = null;
  const { heal, price } = RULES.healthPotion;
  if (s.hp > 0) {
    for (let n = 1; s.hp + heal * (n - 1) < RULES.maxHealth; n++) {
      const hp = Math.min(RULES.maxHealth, s.hp + heal * n);
      if (dayChange({ ...s, hp }, missed, opts).hpAfter > 0) { potions = n; break; }
    }
  }
  const potionGold = potions ? potions * price : 0;
  return { ...d, level, dailiesToDo, dailiesFirst, potions, potionGold, potionsAffordable: potionGold <= s.gp, partyAdds };
}
