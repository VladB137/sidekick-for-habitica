# Class strategies: each class's strongest loop, and how the app adapts

2026-10-13. Every rule below was read in Habitica's code at **v5.51.0** (newest release; `content/spells.js`, `fns/crit.js`, `libs/statsComputed.js`, `server/libs/spells.js`, `server/libs/cron.js` are identical to v5.50.5, and `ops/scoreTask.js` differs only in a streak notification). Community pages were used as leads only ([Skills](https://habitica.fandom.com/wiki/Skills), [Class System](https://habitica.fandom.com/wiki/Class_System), [Habitican Wardrobes](https://habitica.fandom.com/wiki/Habitican_Wardrobes); the wiki itself is unreachable from the cloud sandbox, so only search snippets were seen). Numbers come from the formulas, not from a live account.

## 1. The mechanic every loop rests on

Four facts from the code make gear swapping a per-action decision for every class, not a Warrior trick.

1. **Every action reads your stats at that moment.** `statsComputed(user)` (gear + class bonus + points + buffs + level/2) is called inside each skill's `cast`, inside `scoreTask` (crit, XP, gold, boss damage, MP gain) and at cron. Changing gear is a free `equip` call, so each action can have its own best loadout.
2. **Buffs keep the value from the moment of casting until your own cron.** Party/self buffs add `ceil(DR(stat − same buff))` to `stats.buffs.*`, and only `cron.js` (and rebirth) resets buffs. Cast in your best gear for that stat, swap back, the buff stays. Because the cast subtracts the existing buff before computing, repeat casts add the same amount each time (they stack linearly).
3. **MP is never cut when you take INT gear off.** Max MP is `2 × INT + 30`, but the only clamps are in `_gainMP` (`scoreTask.js:103`, when MP ≥ max) and at cron. So MP banked in INT gear survives a swap to STR gear. **Trap:** scoring any task while MP is above the current max cuts MP down to that max. Spend first, then score.
4. **Cron uses whatever you're wearing when the day is started.** Cron runs only when a client calls `POST /cron` (`cronWrapper` has that one caller; other requests never start the day), so that is the moment that counts, not the day-start hour itself. MP regen at cron is `max(10, 0.1 × maxMP) × share of Dailies done`; HP lost to missed Dailies is cut by CON (`1 − CON/250`, floor 0.1); both read the gear equipped at cron. Buffs from the day before still apply to that damage (the reset happens after the Daily loop, `cron.js:332`).

Gear never enters the crit seed (it is the sum of the numeric fields of `user.stats`; buffs and gear aren't numbers there), so a swap moves only the threshold. That is what the engine already uses for crit forcing.

Off-class gear: the Market sells class gear only to that class (`buyMarketGear.js:27`), and the class bonus (×2) applies only to your own class's items. A Warrior's INT gear is whatever INT-bearing pieces they already own: gear kept from an earlier class, seasonal and special sets, owned Armoire pieces (wearing them is fine; buying from the Armoire stays excluded). The optimizer must work from owned gear only.

## 2. Per class

Figures below are per cast or per action at the stated totals.

### Warrior: boss damage

| | formula (code) | STR/CON 100 | STR/CON 200 |
|---|---|---|---|
| Brutal Smash, 10 MP | `ceil(DR(STR × crit, 55, 70))`, crit by **CON** | 33, crit 45 | 41, crit 50 |
| Scoring a Daily/To-Do | `ceil(delta × crit × (1 + STR/200))` | ~2 | ~2 |
| Mage's Burst of Flames, 10 MP, for comparison | `ceil(INT × 0.1)`, no crit | 10 | 20 |

Smash is the damage. It saturates at 55, so past STR ~100 a crit (CON) is worth more than more STR. The binding resource is MP, which comes from INT:

| INT | max MP | cron regen | MP per Daily |
|---|---|---|---|
| 50 | 130 | 13 | 2 |
| 100 | 230 | 23 | 3 |
| 150 | 330 | 33 | 4 |

Going from INT 50 to 150 at cron is two more Smashes a day (~80 damage), and the bank holds twenty more. Your model is right, with numbers:

- **Bank phase**, INT gear: wear it at cron and while scoring tasks, so the regen, the per-task MP and the cap all use the higher max MP.
- **Spend phase**, STR gear plus CON where it turns the next Smash into a crit: cast Smashes until MP drops below the INT-free max. Only then score tasks (the trap in fact 3).
- **Party**: Valorous Presence (STR buff to the party) cast at peak STR raises everyone's task crit chance and boss damage until their cron; it also raises your own next Smash.

What the Oracle adds that no other tool can: each Smash changes MP by −10, so the next seed is known. The app can plan a whole Smash chain: which casts crit, and which CON swap makes a missed one crit. `levers.ts` already has `smash` as a roll; the chain and the bank/spend gear schedule are new.

Smash also raises the targeted task's value, which shrinks what that task pays later. The best target is a real task where that costs least (a Habit already at or above 21.27, whose delta is capped, or a To-Do you are about to finish anyway). A dummy task kept only for targeting is a fake task under the lever rule, so the app never suggests making one.

### Mage: XP and the party's mana

- Every task: XP × `(1 + INT × 0.025)`. INT is XP for every class; Mages just carry the most.
- Burst of Flames: XP `ceil(DR(INT × crit × ceil((value+1) × 0.075), 75))`, crit by **PER**. The task-value factor is a step: 1 up to value 12.33, 2 above, 3 above 25.67. Targeting a task bluer than 12.33 doubles the XP of that cast (a target choice, deterministic). Boss damage `ceil(INT × 0.1)`, never crits.
- Ethereal Surge (30 MP): each non-Mage party member gets `ceil(DR(INT, 25, 125))` MP (12 at INT 100). This is the Warrior's fuel: one Surge is a Smash for every Warrior in the party.
- Earthquake: party INT buff (10 at INT 100). Chilling Frost: protects streaks once per day (the parity-D bug was a second cast).
- Loop: INT gear by default (it is both damage and mana); PER swap only when it turns the next Burst into a crit, which the app already predicts (`fireball` roll).

### Rogue: Gold, drops, and the 30% crit

- Backstab: crit base **0.30** (vs 0.03 for everything else), by **STR**. The one skill where crit forcing is cheap. XP and Gold both scale.
- Pickpocket: Gold `ceil(DR(value + 1 + PER/2, 25, 75))` (11 at PER 100).
- Every task: Gold × `(1 + PER × 0.02)`; drop chance × `(1 + PER/100)`; drops per day `5 + floor(PER/25)`.
- Tools of the Trade (25 MP): party PER `ceil(DR(PER, 100, 50))`: 67 at PER 100, 80 at PER 200, per cast, stacking. The biggest buff per MP in the game (Protective Aura is bigger per cast at high CON but costs 30). It also raises Mages' Burst crit chance.
- Stealth: Dailies dodged at cron `ceil(DR(PER, Dailies × 0.64, 55))`. PER at cast decides it.
- Loop: PER gear for Tools (stack it), Stealth and task scoring; STR gear for Backstab, swapped in only when it makes the next one crit.
- Limit: item drops and collection-quest finds use `Math.random()` (`randomDrop.js`, no seed), so the app can show their expected value but never promise one.

### Healer: survival, for self and party

- Healing Light (self) `ceil((CON + INT + 5) × 0.075)`, Blessing (party) `× 0.04`: 8 / 5 HP at CON+INT 100, 16 / 9 at 200. Linear, so a CON+INT swap before healing pays fully.
- Protective Aura (30 MP): party CON `ceil(DR(CON, 200, 200))`: 67 at CON 100, 100 at CON 200, stacking. A party member at CON 30 who gets +67 takes 0.61× instead of 0.88× of the HP loss from their own missed Dailies at cron.
- Searing Brightness (15 MP): every own non-challenge, non-group task gains `ceil(4 × INT/(INT+40))`, a step function: 1 below INT 14, 2 up to 40, 3 up to 120, 4 from 121. Swapping only makes sense to cross a step, and the app can say exactly which piece does it. Bluer tasks hurt less when missed (and pay less when done).
- **Correction to a common belief:** CON does not reduce boss damage. `_processBossQuest` applies `progress.down × boss.str` straight to HP (`group.js:1120`); `progress.down` is the Daily's value delta, before CON. Protective Aura shields only the missed-Daily HP loss. The app should not claim otherwise.
- What the Oracle adds: an exact "HP after cron" forecast for the player (own missed Dailies with CON, own share of boss damage from the quest's `boss.str`), and the heal/aura/gear plan that keeps it above 0. `revivePreview` already shows the cost of dying.

## 3. Loops that look good but fail

| Idea | Why not |
|---|---|
| Cast with `quantity: N` in the API body | `castSpell` checks `mana > mp` once, then casts N times and subtracts N × mana (`server/libs/spells.js:157–176`, `content/spells.js` wrapper): it overspends into negative MP. Habitica's own client never sends it. Exploit; the app must never send `quantity`. Worth a bug report to admin@habitica.com (draft on request). |
| A dummy task to aim Smash or Burst at | Fake task (exploit list). Target choice among real tasks is fine. |
| Count on drops or collection-quest items | True random; expected value only. |
| CON gear "against the boss" | Has no effect on boss damage (above). |
| Buying from the Armoire to get swap gear | Excluded. Owned Armoire pieces are fine. |
| The wiki's "Swap HP or XP for MP" techniques | Page unreachable; from the title it trades HP/XP for MP via scoring, which risks the uncheck/recheck and bad-habit rules. Not used unless Vlad wants it checked. |

## 4. Decision record: how class loops plug into the engine

**Context.** The engine today answers one question for every class: will the next roll crit, and what is the cheapest honest way to make it (`forceOptions` over `leverActions`, tiers Free → Last resort). The loops above need three more things: a per-action gear choice, multi-step plans (bank then spend; buff then act), and a goal other than "crit" (damage, XP, Gold, HP). All four classes share the same mechanic (section 1); they differ in which actions matter and what they maximise.

**Options.**

- **A. One planner per class.** Four separate modules, four UIs. Fits each class tightly; four times the parity surface; shared fixes (the MP clamp trap, the seed chain) get written four times.
- **B. One shared kernel plus a per-class strategy table** (recommended). The kernel adds a gear optimizer (best owned loadout for one action under an objective, two-handed rules included) and a short-horizon sequencer (chain of casts/scores with known seeds, MP clamp and buff carry-over modelled). Each class supplies data: its goal metric, its actions, its buff casts, and how the Now screen headlines it. Crit forcing becomes one objective among several and stays as is.
- **C. Keep crit-only, add class tips as text.** Cheapest; gives nothing the wiki doesn't.

**Choice: B.** The difference between classes is which numbers to maximise, not how the game computes them, so one verified simulator serves all four. Every new kernel function is a port of code already read above and gets a parity suite against Habitica's own functions, like suites A–G.

**Consequences.**
- New engine pieces: `bestLoadout(state, owned, action, objective)`, `planChain(state, steps)`, per-class `STRATEGY` table. Ranking keeps the Free > Cheap > Costs something > Last resort tiers; a gear swap that is put back is Free.
- The app gains a class goal line on Now (Warrior: "pending boss damage today", already read as `party.quest.progress.up`; Mage: XP to next level; Rogue: Gold; Healer: HP after cron).
- Android: the Java verdict port does not need any of this unless the notification starts showing class goals.
- Party-wide plans (Surge for Warriors, Aura for the party, boss HP left) need `GET /groups/party` and `/members` reads. Those go through the same 30 s gate and add no host, but they are new reads.
- Out of scope until Vlad says otherwise: anything automatic. Every swap and cast stays a tap.

## 5. What Vlad picked, and where it lives

Picked 2026-10-13: 1 to 6. The bug report about `quantity` (7) Vlad sends himself.

| Pick | Where |
|---|---|
| 1. Class goal on Now + the owned gear for the next task | `src/app/views/classplan.ts` (`classCard`), `gearForTask` in `src/engine/classplan.ts` |
| 2. Warrior Smash planner | `smashPlan`, `manaBank`; `store.smashChain` casts one request per cast, never `quantity`, and puts the gear back |
| 3. Buffs at their peak | `skillPeaks`, `skillEffect` (parity suite I) |
| 4. Night gear | Settings > On this phone > Night gear (Android). Off by default. At the set hour: one read, a task read in Automatic, then one equip per piece, 30 s apart. Swap-back at the second hour, or once the new day has started if that's later, since cron reads the gear worn at `POST /cron`. Skipped if the gear isn't what the app last read, and not put back if the player changed it in between. `android/verdict/.../NightSwap.java`. |
| 5. Healer HP after the day change | `dayChange` (parity suite H) |
| 6. Party reads | `GET /groups/party/members?includeAllPublicFields=true`, read with the party every 5 minutes |

Parity suite J replays the Smash chains and the best-set-for-a-task through Habitica's own code.
