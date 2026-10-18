// e2e: No tasks at all; refused automatic follow-ups. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ API, APP, TOKEN, UID, browser, check, idle, mark, mockLog, mockState, page, post, score, snackAfter, sync, tab }) => {
  let m;
  // ------------------------------------------------------------------ 14b2. no tasks at all: nothing offered for a crit that no task can take
  {
    await post('/mock/clear-tasks');
    await sync(); await tab('Now'); await page.waitForTimeout(300);
    const card = await page.evaluate(() => [...document.querySelectorAll('main .card.action')].map(c => c.textContent).join(' | '));
    check('no tasks: the crit card says there is no open task and offers nothing to spend', /No open tasks right now\./.test(card) && (await page.locator('main .opt button').count()) === 0, card.slice(0, 160));
    await post('/mock/reset?class=warrior&level=24');
    await sync();
  }

  // ------------------------------------------------------------------ 14c. automatic follow-ups Habitica refuses don't turn into request loops
  // (a refused day change or gear put-back used to retry at once, hundreds of requests a minute, 429s included)
  for (const which of ['cron', 'restore']) {
    await post('/mock/reset?class=warrior&level=24');
    const st = await mockState();
    if (which === 'cron') {
      for (const t of st.tasks.filter(x => x.type === 'daily' && !x.completed && !x.group.id)) await post('/mock/score-elsewhere', { taskId: t.id, direction: 'up' });
      await post('/mock/new-day');
      await post('/mock/fail', { path: '/api/v3/cron', status: 500, error: 'InternalServerError', message: 'Refused by the test.', times: 3 });
    } else await post('/mock/fail', { path: '/user/equip/', status: 400, message: 'Refused by the test.', times: 3 });
    const eq = st.user.items.gear.equipped;
    const spare = Object.keys(st.user.items.gear.owned).find(k => st.user.items.gear.owned[k] && k.startsWith('armor_') && k !== eq.armor);
    const c2 = await browser.newContext({ viewport: { width: 412, height: 915 } });
    await c2.addInitScript(([uid, tok, which, spare]) => {
      window.__noAutoRead = true;
      window.__noDaySummary = true;
      localStorage.setItem('critoracle:v2:creds', JSON.stringify({ userId: uid, apiToken: tok }));
      localStorage.setItem('critoracle:v2:settings', JSON.stringify({ mode: 'full', coach: { full: true } }));
      // gear the app swapped for a crit that has since been used, so it puts it back by itself
      if (which === 'restore') localStorage.setItem('critoracle:v2:restore', JSON.stringify({ userId: uid, base: { armor: spare }, armedSeed: 1 }));
    }, [UID, TOKEN, which, spare]);
    const p2 = await c2.newPage();
    let sent = 0;
    p2.on('request', r => { if (r.url().startsWith(API)) sent++; });
    await p2.goto(APP);
    await p2.waitForTimeout(4000);
    const calls = (await mockLog()).filter(e => e.p.includes(which === 'cron' ? '/cron' : '/user/equip/')).length;
    check(`refused ${which === 'cron' ? 'day change' : 'gear put-back'}: tried once, then waits`, calls === 1 && sent <= 8, `${calls} tries, ${sent} requests in 4 s`);
    await c2.close();
  }
  // a tap during a 429 wait sends nothing and says how long to wait
  {
    await post('/mock/reset?class=warrior&level=24');
    await post('/mock/fail', { path: '/api/v3/user', status: 429, error: 'TooManyRequests', message: 'Too many requests.', retryAfter: 5 });
    await tab('Now');
    await page.click('.appbar [data-k="sync"]'); await idle();
    const before = (await mockLog()).length;
    m = await mark();
    await page.click('.appbar [data-k="sync"]'); await idle();
    await tab('Tasks');
    const row = page.locator('.li', { hasText: 'Take the stairs' }).first();
    await row.locator('.hbtn.plus').first().click();
    const said = await snackAfter(m, 'Try again in');
    check('429 wait: taps send nothing until Retry-After has passed', (await mockLog()).length === before && /Try again in [1-5] s/.test(said), said);
    await page.waitForTimeout(5500);
    await sync();
  }
};
