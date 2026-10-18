// e2e: Relaxed mode, every Daily done, logging out. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ APP, SHOTS, TOKEN, UID, check, idle, mark, mockLog, mockState, page, post, predictions, score, slideAt, sync, tab }) => {
  // ------------------------------------------------------------------ 16b. Relaxed mode: the same reads, nothing about crits
  {
    await page.reload();
    if (await page.locator('#uid').count()) { await page.fill('#uid', UID); await page.fill('#tok', TOKEN); await page.click('button[type=submit]'); }
    await page.waitForSelector('.bottomnav', { timeout: 15000 });
    await idle();
    await tab('Settings');
    const before = (await mockLog()).length;
    await page.click('[data-k="mode-row-relaxed"]');
    await page.waitForTimeout(300);
    const cards = (await page.locator('main .card-title').allTextContents()).map(x => x.trim());
    // the meadow header: its title pill keeps the bubble's colour (amber only for a crit, red only before a dangerous day change)
    const bar = await page.evaluate(() => {
      const b = document.querySelector('.appbar');
      const t = document.createElement('i'); t.style.color = 'var(--bubble)'; document.body.append(t); const want = getComputedStyle(t).color; t.remove();
      return { cls: b.className, color: getComputedStyle(b.querySelector('.appbar-title .compact')).backgroundColor, want };
    });
    check('relaxed: switching is instant and sends nothing to Habitica', (await mockLog()).length === before && (await page.isChecked('[data-k="mode-relaxed"]')));
    check('relaxed: Settings keeps App mode first, without Crits or Items and gear', cards[0] === 'App mode' && !cards.includes('Crits') && !cards.includes('Items and gear') && (await page.locator('[data-k="replay-tips"]').count()) === 1, cards.join(','));
    check('relaxed: the app bar is the meadow with a plain title pill, never amber', /\brelaxed\b/.test(bar.cls) && /\bmeadow\b/.test(bar.cls) && !/\b(crit|danger)\b/.test(bar.cls) && bar.color === bar.want, `${bar.cls} · ${bar.color} vs ${bar.want}`);
    // nothing on any screen plans, forces or explains a crit
    const critWords = () => page.evaluate(() => { const m = document.querySelector('main'); return m ? (m.innerText.match(/\bcrit\w*/gi) || []).length : -1; });
    await tab('Now');
    const head = (await page.textContent('.appbar .headline')).trim();
    const now = [await page.locator('main .card-title', { hasText: /crit/i }).count(), await page.locator('[data-k="skills"], [data-k="smash-chain"], [data-k^="wear-"]').count(), await critWords()];
    await page.screenshot({ path: `${SHOTS}/60-relaxed-now.png`, fullPage: true });
    check('relaxed: Now shows your day, no crit or skill cards', /^(\d+ Dailies left|1 Daily left|All Dailies done|No Dailies today|\d+ stat points? to spend)$/.test(head) && now.every(n => n === 0), `${head} · ${now.join(',')}`);
    // the bubble says the most important thing first (src/app/headline.ts): here the account's unspent points, then the pets its eggs and potions hatch
    {
      const says = async () => [await page.getAttribute('.appbar', 'data-says'), (await page.textContent('.appbar .headline')).trim(), (await page.textContent('.appbar .hero-sub')).trim()];
      const pts = (await mockState()).user.stats.points;
      const a = await says();
      await post('/mock/set', { stats: { points: 0 } });
      await sync();
      const b = await says();
      await post('/mock/set', { stats: { points: pts } });
      await sync();
      check('relaxed: the bubble says unspent stat points, then the next thing once they are spent (eggs to hatch here)', (pts > 0 ? a[0] === 'points' && a[1] === `${pts} stat point${pts === 1 ? '' : 's'} to spend` : true) && b[0] === 'hatch' && /^\d+ new pets to hatch$/.test(b[1]) && /See Feeding and hatching on Stats\.$/.test(b[2]), `${a.join(' · ')} → ${b.join(' · ')}`);
      // a quest invitation waiting for an answer (party.quest.RSVPNeeded) comes before them, and goes once answered
      const party = (await mockState()).user.party;
      await post('/mock/set', { user: { party: { ...party, quest: { ...party.quest, key: 'basilist', RSVPNeeded: true } } } });
      await sync();
      const c = await says();
      await post('/mock/set', { user: { party } });
      await sync();
      const d = await says();
      check('relaxed: the bubble says a quest invitation is waiting, by name, until it is answered', c[0] === 'invite' && c[1] === 'Quest invitation waiting' && c[2] === 'The Basi-List starts once everyone in the party has answered. Accept or Reject it in Habitica.' && d[0] !== 'invite', `${c.join(' · ')} → ${d.join(' · ')}`);
    }
    // the character's lines in Relaxed never mention crits (reduced motion: each line whole at once)
    {
      await page.evaluate(() => { window.scrollTo(0, 0); window.__talkScale = 0.1; });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const said = [];
      for (let i = 0; i < 12; i++) { await page.click('.hero-stage .talker'); await page.waitForTimeout(40); said.push(await page.textContent('.said .sr')); }
      await page.emulateMedia({ reducedMotion: null });
      await page.waitForSelector('.hero-stage .bubble .headline', { timeout: 5000 }).catch(() => null);
      check('relaxed: the character talks when tapped, never about crits', said.every(Boolean) && !said.some(l => /crit/i.test(l)), said.filter(l => /crit/i.test(l || '')).join(' | '));
    }
    // the plain class card: the class's number and stat in one line, no buttons, nothing about crits
    {
      const card = page.locator('[data-k="class-card"]');
      if (await card.locator('.fold-head[aria-expanded="false"]').count()) { await card.locator('.fold-head').click(); await page.waitForTimeout(100); }
      const txt = (await card.textContent().catch(() => '')).replace(/\s+/g, ' ');
      check('relaxed: a plain Warrior card, no buttons, nothing about crits or gear', await card.count() === 1 && /class-plain/.test(await card.getAttribute('class')) && txt.includes('Warrior tips') && /STR makes every task/.test(txt) && (await card.locator('.li button, .card-sub button, [data-k^="wear-"]').count()) === 0 && !/crit|gear|Smash|Wear/i.test(txt), txt.slice(0, 200));
      await post('/mock/reset?class=healer&level=15');
      await post('/mock/set', { members: [{ _id: 'ally-1', profile: { name: 'Ally <b>Bold</b>' }, stats: { class: 'warrior', lvl: 20, hp: 21, mp: 5, maxMP: 70 }, flags: { classSelected: true }, preferences: {} }] });
      // the party and its members are read every 5 minutes: a fresh start reads them now
      await page.reload();
      if (await page.locator('#uid').count()) { await page.fill('#uid', UID); await page.fill('#tok', TOKEN); await page.click('button[type=submit]'); }
      await page.waitForSelector('.bottomnav', { timeout: 15000 });
      await idle();
      await tab('Now');
      const hcard = page.locator('[data-k="class-card"]');
      if (await hcard.locator('.fold-head[aria-expanded="false"]').count()) { await hcard.locator('.fold-head').click(); await page.waitForTimeout(100); }
      const day = (await hcard.locator('.li', { hasText: 'After the day change' }).textContent().catch(() => '')).replace(/\s+/g, ' ');
      const low = (await hcard.locator('.li', { hasText: 'Party HP' }).textContent().catch(() => '')).replace(/\s+/g, ' ');
      await hcard.screenshot({ path: `${SHOTS}/63-relaxed-class.png` });
      check('relaxed: the Healer card says the HP left after the day change in one sentence', /(No Daily takes HP tonight|\d+ open Dail(y|ies)( and the boss)? would take (up to )?\d+ HP, leaving \d+\.|would take all your HP)/.test(day) && !/gear|Wear/i.test(day), day.slice(0, 160));
      check('relaxed: the Healer card names the lowest party HP as text, no buttons', low.includes('Ally <b>Bold</b> has 21 / 50 HP') && (await hcard.locator('.li b b').count()) === 0 && (await hcard.locator('button:not(.fold-head)').count()) === 0 && (await critWords()) === 0, low);
    }
    await tab('Tasks');
    const chips = [await page.locator('.out.crit, .out.setup, .out.best').count(), await page.locator('.out').count(), await critWords()];
    check('relaxed: task chips are plain XP, nothing about crits', chips[0] === 0 && chips[1] > 0 && chips[2] === 0, chips.join(','));
    await tab('Stats');
    const stats = [await page.locator('[data-k="crit-dial"], [data-k="crit-chances"], [data-k="roll"], [data-k="gear-swaps"], [data-k="predictions"]').count(), await page.locator('main .card-title', { hasText: 'Items you can sell' }).count(), await critWords()];
    await page.screenshot({ path: `${SHOTS}/61-relaxed-stats.png`, fullPage: true });
    check('relaxed: Stats without the crit dial, crit tables or selling', stats.every(n => n === 0), stats.join(','));
    // the next Check-In Reward, from the account's check-ins (Habitica's loginIncentives table)
    {
      const was = (await mockState()).user.loginIncentives;
      await post('/mock/set', { user: { loginIncentives: 3 } });
      await sync();
      const one = (await page.textContent('[data-k="next-check-in"]').catch(() => '')).trim();
      await post('/mock/set', { user: { loginIncentives: 40 } });
      await sync();
      const five = (await page.textContent('[data-k="next-check-in"]').catch(() => '')).trim();
      await post('/mock/set', { user: { loginIncentives: was } });
      await sync();
      check('relaxed: Stats names the next Check-In Reward and how many check-ins away', one === 'Your next check-in brings a Check-In Reward: Royal Purple Potion.' && five === '5 check-ins to your next Check-In Reward: Royal Purple Potion.', `${one} · ${five}`);
    }
    const str = await (async () => { await page.click('[data-k="term-str"]'); await page.waitForSelector('.sheet.open'); const t = (await page.textContent('.sheet.open [data-k="explain-str"]')).trim(); await page.click('.sheet.open .sheet-actions button'); await page.waitForTimeout(250); return t; })();
    check('relaxed: tap-to-explain words never mention crits', !/crit/i.test(str), str);
    await page.click('[data-k="open-history"]');
    await page.waitForTimeout(300);
    check('relaxed: History without the crit journal', (await page.locator('[data-k="journal"]').count()) === 0 && (await critWords()) === 0);
    // the tips again, from Settings > About: they start where Relaxed opens, the Stable
    await tab('Settings');
    await page.click('[data-k="replay-tips"]');
    await page.waitForSelector('[data-k="coach"]');
    await page.waitForTimeout(300);
    const t1 = (await page.textContent('.coach-title')).trim();
    const ring = await page.evaluate(() => { const r = document.querySelector('.coach-ring'); const a = document.querySelector('.appbar-top').getBoundingClientRect(); return !r.hidden && Math.abs(r.getBoundingClientRect().top - Math.max(0, a.top - 4)) < 2; });
    await page.screenshot({ path: `${SHOTS}/62-relaxed-tips.png` });
    await page.click('[data-k="coach-skip"]');
    check('relaxed: Show the tips again starts on the Stable', t1 === 'Your day at a glance' && ring && (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Stable' && (await page.locator('[data-k="coach-layer"]').count()) === 0, t1);
    // the app opens on the Stable, and Back from another tab ends there
    await page.goto(APP);
    await page.waitForSelector('.appbar.relaxed', { timeout: 15000 });
    await page.waitForTimeout(300);
    check('relaxed: the app opens on the Stable, no choice or tips again', (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Stable' && (await page.locator('[data-k="mode-choice"], [data-k="coach"]').count()) === 0);
    await tab('Settings');
    await page.click('[data-k="mode-row-full"]');
    await page.waitForTimeout(300);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('critoracle:v2:settings')));
    check('relaxed: back to Full brings Crits back, settings kept', (await page.locator('main .card-title', { hasText: 'Crits' }).count()) === 1 && kept.mode === 'full', kept.mode);
    await tab('Now');
  }

  // ------------------------------------------------------------------ 16c. every Daily done: one of your own pets says so on Now
  {
    await post('/mock/set', { items: { currentPet: 'Fox-Base' } });
    await tab('Now'); await sync();
    const before = await page.locator('[data-k="dailies-done"]').count();
    for (const t of (await mockState()).tasks.filter(t => t.type === 'daily' && !t.completed)) await post('/mock/score-elsewhere', { taskId: t.id });
    await page.evaluate(() => { window.__noDaySummary = false; window.__talkScale = 0.1; });
    await sync(); await page.waitForTimeout(200);
    // the last due Daily ticked between two reads: the character sums up the day, once (src/app/headline.ts daySummary)
    const summary = await page.waitForSelector('.hero-stage .said .sr', { timeout: 5000 }).then(e => e.textContent()).catch(() => '');
    const summed = await page.evaluate(() => localStorage.getItem('critoracle:v2:daySummed'));
    await page.waitForSelector('.hero-stage .bubble .headline', { timeout: 5000 }).catch(() => null);
    await sync(); await page.waitForTimeout(300);
    const again = await page.locator('.hero-stage .said').count();
    await page.evaluate(() => { window.__noDaySummary = true; window.__talkScale = 1; });
    check('every Daily done: the character sums up the day once, with what the day’s crits added (Full)', /^(All \d+ Dailies done!|Today’s Daily is done!) (\d+ crits? today added [\d.]+ Gold and [\d.]+ XP\.|The rest of the day is yours\.)$/.test(summary) && !!summed && again === 0, `${summary} · ${summed} · ${again}`);
    const done = page.locator('[data-k="dailies-done"]');
    check('every Daily done: your own pet says so on Now (and not before)', before === 0 && (await done.locator('[data-k="pet-Fox-Base"]').count()) === 1 && /of today’s Dailies are done|Daily is done/.test(await done.textContent()), `${before} before · ${await done.count() ? await done.textContent() : 'none'}`);
    await page.screenshot({ path: `${SHOTS}/40-dailies-done.png` });
    await post('/mock/set', { items: { currentPet: '' } });
    // section 17 logs out from Tasks, as before this check
    await tab('Tasks');
  }

  // ------------------------------------------------------------------ 17. logging out shows the intro again; Skip goes to the login screen
  // from Now, through the menu's own sheet: closing the menu and then the confirm sheet must land on the entry they started from
  // (one back too many leaves the app when Now is the first entry)
  await tab('Now'); await page.waitForTimeout(300);
  await page.evaluate(() => history.replaceState({ ...(history.state || {}), mark: 'before-logout' }, '', location.hash));
  await page.click('.appbar button[aria-label="Menu"]');
  await page.click('[data-k="menu-logout"]');
  await page.locator('.sheet.open .sheet-actions button', { hasText: 'Log out' }).click();
  await page.waitForSelector('.ob', { timeout: 15000 });
  await page.waitForTimeout(300);
  check('log out from Now: the menu and its confirm sheet go back exactly to where they opened', await page.evaluate(() => history.state?.mark === 'before-logout' && location.hash === '#now'), await page.evaluate(() => `${JSON.stringify(history.state)} ${location.href}`));
  check('log out: the intro comes back', (await slideAt()) === 0);
  check('log out: repeating To-Dos are deleted from this device', await page.evaluate(() => localStorage.getItem('critoracle:v2:repeats')) === null);
  await page.click('[data-k="intro-skip"]');
  await page.waitForSelector('#uid');
  check('intro: Skip opens the login screen', (await page.locator('.ob').count()) === 0);
  // a fresh login asks Full or Relaxed again, nothing chosen, as on a first login
  check('log out: the mode is forgotten', await page.evaluate(() => JSON.parse(localStorage.getItem('critoracle:v2:settings') || '{}').mode) === undefined);
  await page.fill('#uid', UID); await page.fill('#tok', TOKEN);
  await page.click('button[type=submit]');
  await page.waitForSelector('[data-k="mode-choice"]', { timeout: 15000 });
  check('log in again: the mode choice comes back, nothing chosen, no app bar', (await page.locator('.mode-card').count()) === 2 && (await page.locator('.mode-card[aria-checked="true"], .mode-card.on, .mode-card.sel').count()) === 0 && (await page.locator('.appbar').count()) === 0);
};
