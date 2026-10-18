// e2e: Offline, automatic re-read, a newer Habitica, a revoked token. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ CHECKED, SHOTS, TOKEN, UID, check, idle, mockState, page, post, score, sync, tab }) => {
  // ------------------------------------------------------------------ 12. offline: the saved copy opens with a banner, and recovers
  // a pet out, so the offline card has someone to nap (read once, then kept in the saved copy)
  await post('/mock/set', { items: { currentPet: 'Fox-Base' } }); await sync();
  await page.route('**/api/v3/**', r => r.abort('internetdisconnected'));
  await page.reload();
  await page.waitForSelector('.appbar .headline', { timeout: 15000 });
  await page.waitForSelector('.appbar.offline', { timeout: 15000 });
  await page.screenshot({ path: `${SHOTS}/09-offline-now.png` });
  const offHead = (await page.textContent('.appbar .headline')).trim();
  check('offline: the overline gives the time of the last read', /^Last read /i.test((await page.textContent('.appbar .overline')).trim()));
  check('offline start: its own look, no verdict claimed as current', offHead === 'Offline' && !(await page.locator('.appbar.crit').count()) && (await page.locator('text=You’re offline').count()) > 0, offHead);
  check('offline: your pet naps on the offline card', (await page.locator('.offline-card .nap [data-k="pet-Fox-Base"]').count()) === 1);
  check('offline: no suggestions or skills to run', (await page.locator('.opt').count()) === 0 && (await page.locator('button', { hasText: 'Cast' }).count()) === 0);
  await tab('Tasks');
  check('offline: Tasks read-only (no controls)', (await page.locator('main .hbtn, main button.check, main .li-end .btn').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/09-offline.png` });
  await page.unroute('**/api/v3/**');
  await tab('Now');
  await page.locator('button', { hasText: 'Try again' }).click();
  await idle(); await page.waitForTimeout(200);
  check('back online: live again', !(await page.locator('.appbar.offline').count()) && (await page.locator('text=You’re offline').count()) === 0);
  await post('/mock/set', { items: { currentPet: '' } }); await sync();

  // ------------------------------------------------------------------ 12b. a tap in another app shows up by itself (automatic re-read, test timing)
  {
    await tab('Now');
    await page.evaluate(() => { window.__noAutoRead = false; });
    const gp0 = (await mockState()).user.stats.gp;
    await post('/mock/score-elsewhere', { taskId: 'h-water', direction: 'up' });
    const gp1 = Math.floor((await mockState()).user.stats.gp);
    const seen = await page.waitForFunction(g => [...document.querySelectorAll('.you-sub')].some(e => g.some(x => e.textContent.includes(`${x.toLocaleString('en-US')} Gold`))), [gp1, gp1 + 1], { timeout: 20000 }).then(() => true).catch(() => false);
    check('change made elsewhere appears without a tap', seen && gp1 !== gp0, `${gp0} → ${gp1}`);
    await page.evaluate(() => { window.__noAutoRead = true; });
  }

  // ------------------------------------------------------------------ 12c. Habitica ships a newer version: say so
  await post('/mock/set', { appVersion: '9.0.0' });
  await sync();
  const newerBanner = page.locator('.banner', { hasText: 'Habitica is now on version 9.0.0' });
  check('newer Habitica version is flagged', await newerBanner.count() > 0);
  check('the banner links to the newest build (a tap, not a call from the app)', /\/releases\//.test(await newerBanner.locator('a', { hasText: 'Get the update' }).getAttribute('href').catch(() => '')));
  await post('/mock/set', { appVersion: CHECKED });
  await sync();

  // ------------------------------------------------------------------ 13. a token Habitica stops accepting logs out with an explanation
  // the same player reconnects: their crit journal and repeating To-Dos stay on the device (kept by User ID)
  const hadKept = await page.evaluate(uid => {
    if (localStorage.getItem('critoracle:v2:journal') === null) localStorage.setItem('critoracle:v2:journal', JSON.stringify({ userId: uid, entries: [] }));
    return ['critoracle:v2:journal', 'critoracle:v2:repeats'].filter(k => localStorage.getItem(k) !== null);
  }, UID);
  await post('/mock/fail', { path: '/api/v3/user', status: 401, error: 'invalid_credentials', message: 'There is no account that uses those credentials.' });
  await page.click('.appbar [data-k="sync"]');
  await page.waitForSelector('#uid', { timeout: 15000 });
  const why = await page.textContent('.notice.error');
  check('revoked token: back to login with the reason, no intro', why.includes('no longer accepts') && (await page.locator('.ob').count()) === 0, why);
  const kept = await page.evaluate(() => Object.keys(localStorage).filter(k => /creds|cache/.test(k)));
  check('revoked token: token and saved copy deleted', kept.length === 0, kept.join(','));
  const stays = await page.evaluate(ks => ks.filter(k => localStorage.getItem(k) !== null), hadKept);
  check('revoked token: crit journal and repeating To-Dos kept for the same player', hadKept.length > 0 && stays.length === hadKept.length, `${hadKept.join(',')} → ${stays.join(',')}`);
  await page.evaluate(() => { window.__obSeen = false; new MutationObserver(() => { if (document.querySelector('.ob')) window.__obSeen = true; }).observe(document.getElementById('app'), { childList: true }); });
  await page.fill('#uid', UID); await page.fill('#tok', TOKEN);
  await page.click('button[type=submit]');
  await page.waitForSelector('.appbar .headline', { timeout: 15000 });
  check('revoked token: connecting again doesn’t flash the intro', !(await page.evaluate(() => window.__obSeen)));
};
