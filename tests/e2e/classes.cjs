// e2e: Every class, forced crits for a Mage and a Rogue, the class card. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ API, SHOTS, TOKEN, UID, cardTitle, check, idle, mark, mockLog, mockState, page, post, runFirstOption, score, snackAfter, sync, tab }) => {
  // ------------------------------------------------------------------ 15. every class, plus a level-5 player without a class
  for (const [cls, lvl] of [['wizard', 30], ['rogue', 20], ['healer', 15], ['warrior', 5]]) {
    await post(`/mock/reset?class=${cls}&level=${lvl}`);
    await tab('Now');
    await sync();
    await page.waitForTimeout(200);
    const chips = await page.locator('.appbar .chip').allTextContents();
    const skills = await page.locator('.card-title', { hasText: /^Skills$/ }).count();
    const unlock = await page.locator('.card', { hasText: 'Level 11: your first skill' }).count();
    const expectChip = { wizard: 'Burst of Flames', rogue: 'Backstab', healer: null, warrior: null }[cls];
    check(`${cls} L${lvl}: class rolls shown`, expectChip ? chips.some(c => c.includes(expectChip)) : chips.length === 0, chips.join(' | '));
    check(`${cls} L${lvl}: skills card ${lvl >= 11 ? 'present' : 'absent, and when skills unlock is said'}`, (skills > 0) === (lvl >= 11) && (lvl >= 10 || unlock > 0));
    await page.screenshot({ path: `${SHOTS}/14-now-${cls}-${lvl}.png`, fullPage: true });
  }

  // ------------------------------------------------------------------ 16. force-and-score for a Mage and a Rogue too
  for (const [cls, lvl, habit] of [['wizard', 30, 'Take the stairs'], ['rogue', 20, 'Drink a glass of water']]) {
    await post(`/mock/reset?class=${cls}&level=${lvl}`);
    await tab('Now');
    await sync();
    if ((await cardTitle()) === 'Make the next task crit') await runFirstOption();
    const s = await score(habit);
    check(`${cls}: forced crit landed on the server`, s.startsWith('CRIT'), s);
  }
  // ------------------------------------------------------------------ 17. class card: Smash chain, mana bank swap and put back, Healer's day change and party
  {
    await post('/mock/reset?class=warrior&level=24');
    await post('/mock/set', { stats: { mp: 47 } });
    await tab('Now');
    await sync();
    const card = page.locator('[data-k="class-card"]');
    check('warrior: class card shown, folded to its title', await card.count() === 1 && (await card.locator('.fold-head').getAttribute('aria-expanded')) === 'false' && (await card.locator('.li').count()) === 0);
    await card.locator('.fold-head').click(); await page.waitForTimeout(100);
    check('warrior: class card opens on a tap', (await card.locator('.li').count()) > 0);
    const smashBtn = card.locator('button', { hasText: /smash ×\d+/i });
    const label = (await smashBtn.textContent().catch(() => '')).trim();
    const casts = Number((label.match(/×(\d+)/) || [])[1]);
    const before = (await mockState()).user.party.quest.progress.up || 0;
    const plan = (await card.locator('.li', { hasText: 'Brutal Smash' }).textContent()).replace(/,/g, '');
    // in better gear the row gives both figures; the button wears that gear
    const promised = Number((plan.match(/; (\d+) in your best/) || plan.match(/(\d+) boss damage/) || [])[1]);
    const eqBefore = JSON.stringify((await mockState()).user.items.gear.equipped);
    const logBefore = (await mockLog()).length;
    const m = await mark();
    await smashBtn.click();
    const snack = await snackAfter(m, '^Brutal Smash ×');
    await idle();
    const st = await mockState();
    const castCalls = (await mockLog()).slice(logBefore).filter(e => e.p.includes('/class/cast/smash')).length;
    check('warrior: Smash chain casts once per request until the MP runs out', casts === 4 && castCalls === 4 && st.user.stats.mp < 10, `${label}; ${castCalls} calls; mp ${st.user.stats.mp}`);
    check('warrior: the chain did the boss damage it promised', (st.user.party.quest.progress.up - before) === promised && snack.includes(`${promised} boss damage`), `${st.user.party.quest.progress.up - before} vs ${promised}; ${snack}`);
    check('warrior: gear worn for the chain goes back by itself', JSON.stringify(st.user.items.gear.equipped) === eqBefore, snack);
    // the INT bank: swap, then put back from the banner
    await post('/mock/set', { stats: { mp: 20 } });
    await sync();
    const eq0 = JSON.stringify((await mockState()).user.items.gear.equipped);
    const bank = page.locator('.li', { hasText: 'Bank mana in INT gear' });
    check('warrior: INT gear raises the mana cap', await bank.count() === 1, (await bank.textContent().catch(() => '')).replace(/\s+/g, ' ').slice(0, 120));
    if (await bank.count()) {
      await bank.locator('button', { hasText: 'Wear it' }).click();
      await page.waitForSelector('.banner:has-text("Done with the swap")', { timeout: 15000 });
      await idle();
      const comp = await fetch(`${API}/mock/computed`).then(r => r.json());
      check('warrior: wearing the INT set raises INT on the server', comp.equipped.eyewear === 'eyewear_armoire_plagueDoctorMask', JSON.stringify(comp.equipped));
      await page.locator('.banner button', { hasText: 'Put back' }).click();
      await page.waitForTimeout(300); await idle();
      check('warrior: the swap goes back from the banner', JSON.stringify((await mockState()).user.items.gear.equipped) === eq0);
    }
    await page.screenshot({ path: `${SHOTS}/15-class-warrior.png`, fullPage: true });

    await post('/mock/reset?class=healer&level=15');
    await post('/mock/set', { members: [{ _id: 'ally-1', profile: { name: 'Ally <b>Bold</b>' }, stats: { class: 'warrior', lvl: 20, hp: 21, mp: 5, maxMP: 70 }, flags: { classSelected: true }, preferences: {} }] });
    // the party and its members are read every 5 minutes: a fresh start reads them now
    await page.reload();
    if (await page.locator('#uid').count()) { await page.fill('#uid', UID); await page.fill('#tok', TOKEN); await page.click('button[type=submit]'); }
    await page.waitForSelector('.appbar .headline', { timeout: 15000 });
    await idle();
    const hcard = page.locator('[data-k="class-card"]');
    if ((await hcard.locator('.fold-head').getAttribute('aria-expanded')) === 'false') { await hcard.locator('.fold-head').click(); await page.waitForTimeout(100); }
    const day = (await hcard.locator('.li', { hasText: 'After the day change' }).textContent().catch(() => '')).replace(/\s+/g, ' ');
    check('healer: HP after the day change shown', /\d+ HP \(\d+ from \d+ open Dail/.test(day), day.slice(0, 160));
    const low = (await hcard.locator('.li', { hasText: 'Party HP' }).textContent().catch(() => '')).replace(/\s+/g, ' ');
    check('healer: party member with the lowest HP, name as text', low.includes('Ally <b>Bold</b> at 21 / 50 HP') && (await hcard.locator('.li b b').count()) === 0, low);
    await page.screenshot({ path: `${SHOTS}/16-class-healer.png`, fullPage: true });

    // Inn advice: only when the day change would take all HP; advice only, the app never pauses damage
    check('inn: no advice card at full HP', (await page.locator('.danger-card').count()) === 0);
    await post('/mock/set', { stats: { hp: 3, gp: 100 } });
    await sync();
    const inn = page.locator('.danger-card');
    const innText = (await inn.textContent().catch(() => '')).replace(/\s+/g, ' ');
    check('inn: a deadly day change shows the advice card first', (await page.locator('main .card').first().getAttribute('class')).includes('danger-card') && innText.includes('The day change would take all your HP'), innText.slice(0, 160));
    check('inn: names the Dailies to finish, potions and pausing damage', /Finish (all of them|\d+ of them)/.test(innText) && /\d+ potions? \(\+15 HP, 25 Gold each\)/.test(innText) && innText.includes('Pause Damage') && innText.includes('never pauses it for you'), innText);
    check('inn: no button pauses damage', (await inn.locator('button', { hasText: /pause|inn|rest/i }).count()) === 0);
    await inn.screenshot({ path: `${SHOTS}/17-inn-advice.png` });
    const mInn = await mark();
    await inn.locator('button', { hasText: 'Buy one' }).click();
    await snackAfter(mInn, 'Health Potion');
    await idle();
    let su = (await mockState()).user;
    check('inn: Buy one drinks one Health Potion on the server, nothing else', su.stats.hp === 18 && su.stats.gp === 75 && !su.preferences.sleep, `hp ${su.stats.hp} gp ${su.stats.gp} sleep ${su.preferences.sleep}`);
    await post('/mock/set', { stats: { hp: 3 }, user: { preferences: { ...su.preferences, sleep: true } } });
    await sync();
    const resting = (await hcard.locator('.li', { hasText: 'After the day change' }).textContent().catch(() => '')).replace(/\s+/g, ' ');
    check('inn: resting in the Inn hides the advice card', (await page.locator('.danger-card').count()) === 0 && resting.includes('resting in the Inn'), resting);
    su = (await mockState()).user;
    await post('/mock/set', { stats: { hp: 50 }, user: { preferences: { ...su.preferences, sleep: false } } });
    await sync();
  }

  // ------------------------------------------------------------------ 18. Burst of Flames' XP on its row; Worth buying on Stats
  {
    await post('/mock/reset?class=wizard&level=30');
    await tab('Now');
    await sync();
    const burst = (await page.locator('[data-k="skill-fireball"] .li-sub').textContent().catch(() => '')).replace(/\s+/g, ' ');
    check('mage: Burst of Flames says its XP on the bluest task', /on “[^”]+” · \+\d+ XP/.test(burst), burst);
    await post('/mock/reset?class=warrior&level=24');
    await sync();
    await tab('Stats');
    const worth = page.locator('[data-k="worth-buying"]');
    const rows = worth.locator('.li');
    const first = (await rows.first().textContent().catch(() => '')).replace(/\s+/g, ' ');
    check('Stats: Worth buying names gear on sale that adds to the aim, with its Gold', (await rows.count()) >= 1 && (await rows.count()) <= 3 && /\+[\d.]+% (XP|boss damage) from your tasks · [\d,]+ Gold/.test(first), first);
    const key = (await rows.first().getAttribute('data-k')).replace(/^buy-/, '');
    const log0 = (await mockLog()).length;
    await rows.first().locator('button', { hasText: 'Save for it' }).click();
    await page.waitForTimeout(200);
    const saved = (await page.locator(`[data-k="unsave-gear-${key}"]`).count()) === 1;
    check('Stats: Save for it adds it to Saving for, on the device only', saved && (await page.locator(`[data-k="buy-${key}"] .tag`, { hasText: 'Saving' }).count()) === 1 && (await mockLog()).length === log0, key);
    await page.screenshot({ path: `${SHOTS}/18-worth-buying.png`, fullPage: true });
    await page.locator(`[data-k="unsave-gear-${key}"]`).click();
    // the next part reloads, and the app bar's headline is only on Now
    await tab('Now');
  }
};
