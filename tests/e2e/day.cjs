// e2e: Out of HP, the new day, bad habits, Back. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ API, AUTH, ITEMS, SHOTS, cardTitle, check, idle, mark, mockLog, mockState, page, post, predictions, score, snackAfter, sync, tab }) => {
  let m, p;
  // ------------------------------------------------------------------ 9. out of HP: nothing but reviving, and the preview is exact
  await post('/mock/set', { stats: { hp: 0 } });
  await sync();
  await tab('Now');
  check('dead: Now shows only the revive card', (await cardTitle()) === 'You ran out of HP' && !(await page.locator('.opt').count()));
  await tab('Tasks');
  check('dead: scoring disabled on Tasks', await page.locator('.hbtn.plus').first().isDisabled());
  await tab('Now');
  await page.click('button:has-text("Revive…")');
  await page.waitForSelector('.sheet.open');
  const preview = (await page.locator('.sheet.open .steps').textContent()).replace(/\s+/g, ' ');
  await page.screenshot({ path: `${SHOTS}/07-revive.png` });
  const before = (await mockState()).user;
  m = await mark();
  await page.locator('.sheet.open .sheet-actions button', { hasText: 'Revive' }).click();
  await snackAfter(m, 'Revived');
  await idle();
  const after = (await mockState()).user;
  const lostItem = Object.keys(before.items.gear.owned).find(k => before.items.gear.owned[k] && after.items.gear.owned[k] === false);
  const lostStat = ['str', 'con', 'int', 'per'].find(k => after.stats[k] === before.stats[k] - 1);
  const STATN = { str: 'Strength', con: 'Constitution', int: 'Intelligence', per: 'Perception' };
  check('revive: preview named the lost stat point', !lostStat || preview.includes(STATN[lostStat]), `${lostStat} · ${preview}`);
  const itemName = lostItem ? ITEMS.gear[lostItem][2] : '';
  check('revive: preview named the lost piece of gear', !lostItem || preview.includes(itemName), `${itemName} · ${preview}`);
  p = await predictions();
  check('revive: prediction matched', p.matched === p.total, p.text);

  // ------------------------------------------------------------------ 10. new day: pause, record yesterday, cron; aborts if another app already started the day
  await post('/mock/new-day');
  await tab('Now');
  await sync();
  await page.waitForSelector('text=A new day is waiting');
  const asked = await page.locator('.card', { hasText: 'A new day is waiting' }).locator('.li-title').allTextContents();
  check('new day: only Dailies due yesterday are asked about (Habitica’s shouldDo)', asked.includes('Morning run') && !asked.includes('Water the plants'), asked.join(' | '));
  check('new day: the start button follows the list and is in reach above the navigation', await page.evaluate(() => {
    const card = [...document.querySelectorAll('.card')].find(c => c.textContent.includes('A new day is waiting'));
    const btn = card.querySelector('.btn-raised'); const list = card.querySelector('.list');
    const nav = document.querySelector('.bottomnav').getBoundingClientRect();
    const b = btn?.getBoundingClientRect();
    return !!btn && !!list && (list.compareDocumentPosition(btn) & Node.DOCUMENT_POSITION_FOLLOWING) && b.bottom <= nav.top + 1 && b.top >= 0;
  }));
  const startCount = await page.locator('[data-k="start-count"]').textContent();
  check('new day: says how many will count as missed', /\d+ missed|All done/.test(startCount), startCount);
  check('new day: says what the missed Dailies cost in HP', /All done|missed: (up to )?−[\d.,]+ HP|resting in the Inn/.test(startCount), startCount);
  await tab('Tasks');
  check('new day: scoring paused on Tasks', await page.locator('.check').first().isDisabled());
  await tab('Now');
  await page.screenshot({ path: `${SHOTS}/08-new-day.png`, fullPage: true });
  // the official app starts the day first
  await fetch(`${API}/api/v3/cron`, { method: 'POST', headers: AUTH });
  await page.locator('.card', { hasText: 'A new day is waiting' }).locator('.li .check').first().click();
  m = await mark();
  await page.locator('button', { hasText: /start the day|Start new day/ }).click();
  const already = await snackAfter(m, 'already started');
  const st3 = await mockState();
  check('new day started elsewhere: nothing scored for the wrong day', already.includes('already started') && st3.tasks.filter(t => t.type === 'daily').every(t => !t.completed), already);
  await post('/mock/new-day');
  await sync();
  await page.locator('.card', { hasText: 'A new day is waiting' }).locator('.li .check').first().click();
  await sync(); // a re-render keeps the tick
  const ticked = await page.locator('.card', { hasText: 'A new day is waiting' }).locator('.li .check[aria-checked="true"]').count();
  check('new day: ticks survive a re-render', ticked === 1);
  await page.locator('button', { hasText: /start the day/ }).click();
  await page.waitForFunction(() => !document.body.textContent.includes('A new day is waiting'), null, { timeout: 15000 });
  check('start-of-day flow runs cron', (await mockState()).user.needsCron === false);
  // every Daily done → next day there is nothing to ask about, and the day starts by itself (as Habitica's web client does)
  for (const t of (await mockState()).tasks.filter(x => x.type === 'daily' && !x.completed && !x.group.id)) await post('/mock/score-elsewhere', { taskId: t.id, direction: 'up' });
  await post('/mock/new-day');
  m = await mark();
  await sync();
  const auto = await snackAfter(m, 'nothing to record');
  check('new day with nothing to record starts by itself', /nothing to record/.test(auto) && (await mockState()).user.needsCron === false, auto);

  // ------------------------------------------------------------------ 10b. Tasks: a bad habit logs without a sheet, with Undo; only the row being sent waits
  await tab('Tasks');
  {
    const doom = page.locator('.li', { hasText: 'Doomscroll' });
    const chip = (await doom.locator('.li-end .out').textContent().catch(() => '')).trim();
    check('Tasks: a bad-only habit shows what logging it costs, from the engine', /^−\d+(\.\d)? HP$/.test(chip), chip);
    const downs = async () => (await mockLog()).filter(e => e.m === 'POST' && /\/score\/down$/.test(e.p)).length;
    const d0 = await downs();
    let m = await mark();
    await doom.locator('.hbtn.minus').click();
    const pending = await snackAfter(m, '^Logging');
    const noSheet = !(await page.locator('.sheet.open').count());
    await page.locator('#snackbar .snack-action', { hasText: 'Undo' }).click();
    const undone = await snackAfter(m, '^Not logged');
    await page.waitForTimeout(5600);
    check('Tasks: "−" on a bad habit asks nothing, offers Undo, and Undo sends nothing', noSheet && pending.includes(chip) && /^Not logged/.test(undone) && (await downs()) === d0, `${pending} / ${undone}`);
    const hp0 = (await mockState()).user.stats.hp;
    m = await mark();
    await doom.locator('.hbtn.minus').click();
    const res = await snackAfter(m, '^[+−]\\d+ XP', 12000);
    await idle();
    const hp1 = (await mockState()).user.stats.hp;
    check('Tasks: without Undo the log goes to Habitica once, costing the HP its chip said', (await downs()) === d0 + 1 && `−${(hp0 - hp1).toFixed(1).replace(/\.0$/, '')} HP` === chip, `${res}; ${hp0} → ${hp1}, chip ${chip}`);
    // a slow score: only its own row waits; a tap on another row says so and sends nothing
    await page.route('**/api/v3/tasks/*/score/up', async r => { await new Promise(res => setTimeout(res, 1500)); await r.continue(); });
    const ups = async () => (await mockLog()).filter(e => e.m === 'POST' && /\/score\/up$/.test(e.p)).length;
    const u0 = await ups();
    m = await mark();
    await page.locator('.li', { hasText: 'Drink a glass of water' }).first().locator('.hbtn.plus').click();
    await page.waitForTimeout(300);
    const own = await page.locator('.li', { hasText: 'Drink a glass of water' }).first().locator('.hbtn.plus').isDisabled();
    const other = page.locator('.li', { hasText: 'Take the stairs' }).first().locator('.hbtn.plus');
    const live = !(await other.isDisabled()) && !(await page.locator('.li', { hasText: 'Read 20 pages' }).locator('.check').isDisabled());
    await other.click();
    const wait = await snackAfter(m, '^One moment', 8000);
    await snackAfter(m, '^[+−]\\d+ XP');
    await idle();
    await page.unroute('**/api/v3/tasks/*/score/up');
    check('Tasks: while a score is sent only its row waits; a tap elsewhere says "One moment…" and sends nothing', own && live && /^One moment/.test(wait) && (await ups()) === u0 + 1, `own disabled ${own}, others live ${live}, ${wait}, ${(await ups()) - u0} sent`);
    await page.screenshot({ path: `${SHOTS}/10b-tasks-bad-habit.png` });
  }

  // ------------------------------------------------------------------ 11. Back closes a sheet first; Back from a tab returns to Now
  await tab('Stats');
  await page.click('[data-k="add-saving"]');
  await page.waitForSelector('.sheet.open');
  await page.goBack();
  await page.waitForTimeout(300);
  check('Back closes the sheet, stays on Stats', !(await page.locator('.sheet.open').count()) && (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Stats');
  await tab('Tasks');
  await page.goBack();
  await page.waitForTimeout(300);
  check('Back from another tab goes to Now', (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Now');
  // opened straight on Stats (a reload there): Back goes to Now, not out of the app
  await page.evaluate(() => { location.hash = '#stats'; });
  await page.reload();
  await page.waitForSelector('.bottomnav', { timeout: 15000 });
  await idle();
  await page.goBack();
  await page.waitForTimeout(300);
  check('opened on Stats, Back goes to Now', (await page.evaluate(() => location.hash)) === '#now' && (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Now');
};
