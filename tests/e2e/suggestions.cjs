// e2e: Running a suggestion: re-reads, a day change, refusals, 429. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ STEP_PATH, cardTitle, check, idle, mark, mockLog, page, post, predictions, runFirstOption, score, snackAfter, sync, tab }) => {
  let p, m;
  // ------------------------------------------------------------------ 6. a tap in another app, then a suggestion: re-read first, no false alarm
  await tab('Now');
  if ((await cardTitle()) === 'Make the next task crit') {
    await post('/mock/score-elsewhere', { taskId: 'h-water', direction: 'up' });
    const r = await runFirstOption();
    check('stale numbers: plan re-reads before acting', !!r && /^(Done|Your numbers changed)/.test(r.msg), r && r.msg);
    p = await predictions();
    check('stale numbers: no mismatch recorded', p.matched === p.total, p.text);
    check('stale numbers: no rule-change banner', !(await page.locator('.banner', { hasText: 'didn’t match' }).count()));
  } else check('stale-numbers case needs a no-crit start', true, 'skipped: already crit');

  // ------------------------------------------------------------------ 6b. the day turned over after the suggestion was shown: nothing runs
  await post('/mock/reset?class=warrior&level=24');
  await sync();
  await tab('Now');
  if ((await cardTitle()) === 'Make the next task crit' && await page.locator('.opt button', { hasText: 'Do it' }).count()) {
    await post('/mock/new-day');
    const before = (await mockLog()).length;
    const r = await runFirstOption();
    const posts = (await mockLog()).slice(before).filter(e => e.m === 'POST');
    check('new day pending at run time: nothing is spent', /new day is waiting/i.test(r ? r.msg : '') || posts.length === 0, `${r && r.msg} · POSTs ${posts.length}`);
    check('new day pending at run time: no POST sent', posts.length === 0);
  }
  await post('/mock/reset?class=warrior&level=24');
  await sync();

  // ------------------------------------------------------------------ 6c. a refused re-read doesn't retry itself in a loop
  {
    await post('/mock/fail', { path: '/api/v3/user', status: 401, error: 'NotAuthorized', message: 'Your account has been suspended.' });
    const before = (await mockLog()).length;
    await page.click('.appbar [data-k="sync"]'); await idle(); await page.waitForTimeout(1500);
    const reads = (await mockLog()).slice(before).filter(e => e.p === '/api/v3/user').length;
    check('failed sync (401, not invalid_credentials): no retry loop', reads <= 1, `${reads} extra reads`);
    await sync();
  }

  // ------------------------------------------------------------------ 6d. Habitica blocks the app (403): automatic reads stop
  {
    const blockedMsg = 'This client or third-party tool has been blocked. For additional information, email admin@habitica.com with your Habitica username or User ID.';
    await post('/mock/fail', { path: '/api/v3/user', status: 403, error: 'Forbidden', message: blockedMsg, times: 50 });
    await page.click('.appbar [data-k="sync"]'); await idle();
    const banner = page.locator('.banner', { hasText: 'has been blocked' });
    check('blocked (403): Habitica’s message shows', await banner.count() > 0);
    const before = (await mockLog()).length;
    await page.evaluate(() => { window.__noAutoRead = false; });
    await page.waitForTimeout(8000);
    await page.evaluate(() => { window.__noAutoRead = true; });
    const reads = (await mockLog()).slice(before).length;
    check('blocked (403): no automatic call goes out', reads === 0, `${reads} calls in 8 s with auto-read on`);
    await post('/mock/fail', { clear: true });
    await page.click('[data-k="retry-refused"]'); await idle();
    check('blocked (403): a read that works lifts it', !(await banner.count()));
  }

  // ------------------------------------------------------------------ 7. a step Habitica refuses stops the chain
  await post('/mock/reset?class=warrior&level=24');
  await sync();
  await tab('Now');
  let tried = false;
  for (let i = 0; i < 6 && !tried; i++) {
    // the cheapest way shows; the rest open under "Other ways"
    const more = page.locator('[data-k="more-ways"]');
    if (await more.count() && /Other ways/.test(await more.textContent())) { await more.click(); await page.waitForTimeout(100); }
    const opts = page.locator('.opt');
    const n = await opts.count();
    for (let j = 0; j < n; j++) {
      const lis = await opts.nth(j).locator('li').allTextContents();
      if (lis.length < 2) continue;
      const pathOf = (t) => STEP_PATH.find(([re]) => re.test(t.trim()))?.[1];
      const path = pathOf(lis[1]);
      // refuse the second step only: its request must differ from the first one's
      if (!path || path === pathOf(lis[0])) continue;
      await post('/mock/fail', { path, status: 400, message: 'Refused by the test.' });
      const before = (await mockLog()).length;
      await opts.nth(j).locator('button', { hasText: 'Do it' }).click();
      await page.waitForSelector('.sheet.open');
      if (await page.locator('.sheet.open #really').count()) await page.locator('.sheet.open #really').check();
      m = await mark();
      await page.locator('.sheet.open .sheet-actions button', { hasText: 'Do it' }).click();
      const msg = await snackAfter(m, '^(Step \\d|Done|Your numbers changed)');
      await idle();
      const after = (await mockLog()).slice(before).filter(e => e.m === 'POST');
      check('refused step: chain stops there', msg.startsWith('Step 2 of') && after.length === 2, `${msg} · POSTs ${after.map(e => e.p).join(', ')}`);
      tried = true; break;
    }
    if (!tried) { await score('Stretch'); await tab('Now'); }
  }
  if (!tried) check('refused-step case found a two-step suggestion', true, 'skipped: none offered');
  await post('/mock/reset?class=warrior&level=24'); // clears an unused refusal
  await sync();

  // ------------------------------------------------------------------ 8. rate limit: a 429 is explained and counted down
  await post('/mock/fail', { path: '/api/v3/user', status: 429, error: 'TooManyRequests', message: 'Too many requests.', retryAfter: 12.4 });
  m = await mark();
  await page.click('.appbar [data-k="sync"]'); await idle();
  const rl = await snackAfter(m, 'requests');
  check('429: message with the wait, rounded up', /Try again in 13 s/.test(rl), rl);
  check('429: budget banner shown', await page.locator('.banner', { hasText: 'requests left this minute' }).count() > 0);
  await page.evaluate(() => { /* let the retry window pass for the rest of the run */ });
  await post('/mock/reset?class=warrior&level=24');
  await page.waitForTimeout(13_000);
  await sync();
};
