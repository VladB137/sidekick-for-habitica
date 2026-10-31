/*
 * Every game rule the engine depends on, in one place, each stamped with the
 * Habitica version it was checked against. When Habitica changes a rule, the
 * daily CI job (.github/workflows/habitica-watch.yml) fails with the exact case,
 * and the fix is usually a one-line edit here.
 */
export const RULES = {
  /** Habitica release every rule below was verified against (tests/parity.test.ts). */
  checkedAgainst: 'v5.52.0',

  // crit roll — fns/crit.js, fns/predictableRandom.js (unchanged since 2016–2017)
  critBase: 0.03,
  backstabCritBase: 0.3,

  // stat totals — libs/statsComputed.js
  /** Class gear counts twice: item stat + the same again as class bonus. Since v5.49.0 (commit 301e5cb). */
  classGearBonus: 1,
  /** The Android and iOS apps still display the old 0.5 bonus (UserStatComputer.kt, checked 23 Sep 2026). */
  androidDisplayedClassBonus: 0.5,

  // task values — ops/scoreTask.js
  maxTaskValue: 21.27,
  minTaskValue: -47.27,
  closeEnough: 0.00001,

  // server save hook — server/models/user/hooks.js: hp/mp/exp/gp floored to whole numbers. Since v5.49.0 (#15631).
  wholeNumberStats: true,
  maxFieldHardCap: 99999999,

  // constants.js
  maxHealth: 50,
  maxLevel: 100,
  maxStatPoints: 100,
  maxLevelHardCap: 9999,

  // shops
  healthPotion: { price: 25, heal: 15 },
  gemGoldPrice: 20, // libs/planGemLimits.js convRate (subscribers only)
} as const;
