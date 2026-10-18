// e2e: Tasks: checklists, rewards, team tasks, undo; predictions so far. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ SHOTS, UID, check, idle, mark, mockState, page, predictions, score, snackAfter, tab }) => {
  let m, p;
  // ------------------------------------------------------------------ 3. tasks: checklist, reward, team task
  await tab('Tasks');
  await page.waitForSelector('.li-title');
  await page.screenshot({ path: `${SHOTS}/05-tasks.png`, fullPage: true });
  const runRow = page.locator('.li', { hasText: 'Morning run' }).first();
  await runRow.locator('button', { hasText: '0/3' }).click();
  await runRow.locator('.checklist .check').first().click();
  await idle();
  check('checklist tick reaches Habitica', (await mockState()).tasks.find(t => t.id === 'd-run').checklist[0].completed === true);
  m = await mark();
  await page.locator('.li', { hasText: 'Coffee' }).locator('button').click();
  const rs = await snackAfter(m, 'Gold');
  check('reward purchase', rs.includes('−3 Gold'), rs);
  await idle();
  const teamSnack = await score('Team: send the report');
  check('team task scores for this player', (await mockState()).tasks.find(t => t.id === 't-team').group.assignedUsersDetail[UID].completed === true, teamSnack);

  // ------------------------------------------------------------------ 4. undo a Daily and a To-Do with a checklist through the snackbar
  await page.evaluate(() => { window.__ticked = false; new MutationObserver(ms => { for (const m of ms) if (m.target.classList?.contains('tick-in')) window.__ticked = true; }).observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true }); });
  for (const [text, id] of [['Read 20 pages', 'd-read'], ['Renew passport', 't-passport']]) {
    const s = await score(text);
    if (id === 'd-read') check('a ticked Daily draws its tick once Habitica takes the score', await page.evaluate(() => window.__ticked));
    const undo = page.locator('#snackbar .snack-action');
    check(`${text}: score shows UNDO`, await undo.count() > 0, s);
    await undo.click();
    await idle(); await page.waitForTimeout(300);
    check(`${text}: undo reverts it in Habitica`, (await mockState()).tasks.find(t => t.id === id).completed === false);
  }

  // ------------------------------------------------------------------ 5. every prediction so far matched Habitica exactly
  p = await predictions();
  check('all predictions matched Habitica', p.matched === p.total && p.total > 8, p.text);
  await page.screenshot({ path: `${SHOTS}/06-stats.png`, fullPage: true });
};
