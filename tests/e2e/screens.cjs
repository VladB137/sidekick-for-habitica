// e2e: Settings, Stats, dark theme, in-place updates. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ SHOTS, TOKEN, UID, check, ctx, mark, mockLog, mockState, page, post, snackAfter, sync, tab }) => {
  // ------------------------------------------------------------------ 14. Plan tab hidden until the planner exists, Settings, Stats fits a phone, dark theme
  check('Plan tab hidden until the planner exists', (await page.locator('.bottomnav button[aria-label="Plan"]').count()) === 0);
  await page.setViewportSize({ width: 360, height: 800 });
  await tab('Stats');
  {
    // friendly first: the bars and gear before the workings, which fold into one card at the end
    const order = await page.evaluate(() => [...document.querySelectorAll('main .card')].map(c => c.dataset.k || c.querySelector('.card-title')?.textContent));
    check('Stats: History first, then your stats and gear, the workings folded last', order.indexOf('history-card') < order.indexOf('stat-bars') && order.indexOf('stat-bars') < order.indexOf('equipped') && order.at(-1) === 'numbers' && !(await page.isVisible('[data-k="server-stats"]')), order.join(' > '));
  }
  await page.click('[data-k="how"]');
  const fits = await page.evaluate(() => [...document.querySelectorAll('.table-wrap')].every(w => w.scrollWidth > 0 && w.scrollWidth <= w.clientWidth + 1));
  check('Stats tables fit a 360 px phone', fits);
  {
    // each bar's parts add up to the table's total; the dial shows the task row's chance
    const bars = await page.evaluate(() => ['str', 'con', 'int', 'per'].map(k => document.querySelector(`[data-k="bar-${k}"] .sb-total`).textContent));
    const table = await page.locator('[data-k="server-stats"] tbody tr').evaluateAll(rs => rs.map(r => r.querySelector('td b').textContent));
    const widths = await page.evaluate(() => ['str', 'con', 'int', 'per'].map(k => [...document.querySelectorAll(`[data-k="bar-${k}"] .sb-bar i`)].reduce((a, i) => a + i.getBoundingClientRect().width, 0)));
    const ratio = widths.map((w, i) => w / Number(bars[i].replace(/\D/g, '')));
    const dial = (await page.textContent('[data-k="crit-dial"] .dial-num')).trim();
    const task = (await page.locator('[data-k="crit-chances"] tbody tr').first().locator('td').nth(2).textContent()).trim();
    check('Stats bars: totals match the table and lengths match the totals', JSON.stringify(bars) === JSON.stringify(table) && Math.max(...ratio) - Math.min(...ratio) < 0.05 * Math.max(...ratio), `${bars} vs ${table}; ${ratio.map(r => r.toFixed(2))}`);
    check('Stats dial: the task crit chance, as a percentage', parseFloat(dial) > 0 && Math.abs(parseFloat(dial) - parseFloat(task)) < 0.051 && dial.endsWith('%'), `${dial} vs ${task}`);
  }
  await page.click('[data-k="how"]');
  {
    // accessories without stats (Green Headband, Half-Moon Eyeglasses) are known items, not "unknown item"
    const gear = (await mockState()).user.items.gear;
    await post('/mock/set', { items: { gear: { ...gear, equipped: { ...gear.equipped, headAccessory: 'headAccessory_special_greenHeadband', eyewear: 'eyewear_special_blackHalfMoon' } } } });
    await sync();
    const row = async name => (await page.locator('.li', { hasText: name }).first().textContent().catch(() => '')).replace(/\s+/g, ' ');
    const [band, specs] = [await row('Green Headband'), await row('Black Half-Moon Eyeglasses')];
    check('stat-less accessories show as known items', /headAccessory · no stats/.test(band) && /eyewear · no stats/.test(specs), `${band} | ${specs}`);
    await post('/mock/set', { items: { gear } });
    await sync();
  }
  await page.setViewportSize({ width: 412, height: 915 });
  await tab('Settings');
  await page.waitForSelector('text=What may it suggest?');
  await page.screenshot({ path: `${SHOTS}/11-settings.png`, fullPage: true });
  await page.waitForTimeout(300);
  const labels = await page.locator('.bottomnav .navitem .lbl').allTextContents();
  const shown = await page.locator('.bottomnav .navitem').evaluateAll(bs => bs.filter(b => Number(getComputedStyle(b.querySelector('.lbl')).opacity) > 0.5).map(b => b.getAttribute('aria-label')));
  const named = await page.locator('.bottomnav .navitem').evaluateAll(bs => bs.every(b => b.getAttribute('aria-label') && b.title === b.getAttribute('aria-label')));
  check('five tabs, shifting: only the current one shows its label, every one keeps its name', labels.join(',') === 'Now,Stable,Tasks,Stats,Settings' && shown.join(',') === 'Settings' && named, `${labels.join(',')} | shown: ${shown.join(',')}`);
  await page.click('.appbar button[aria-label="Menu"]');
  await page.waitForSelector('.menu.open');
  const items = (await page.locator('.menu.open .menu-item').allTextContents()).map(x => x.trim());
  check('overflow menu: anchored, just Open Habitica and Log out', items.join(',') === 'Open Habitica,Log out' && (await page.locator('.sheet.open').count()) === 0, items.join(','));
  await page.keyboard.press('Escape'); await page.waitForTimeout(300);
  check('overflow menu: Escape closes it', (await page.locator('.menu').count()) === 0);
  // tidier screens: cards fold from their header and stay as left; a narrow phone never squeezes a row's text; History leads Stats
  {
    await page.setViewportSize({ width: 360, height: 800 });
    await tab('Tasks');
    const dailies = page.locator('[data-k="tasks-dailies"]');
    const count = (await dailies.locator('.fold-count').textContent()).trim();
    await dailies.locator('summary').click(); await page.waitForTimeout(200);
    const closed = !(await dailies.evaluate(d => d.open)) && !(await page.isVisible('[data-k="tasks-dailies"] .list'));
    await tab('Stats'); await tab('Tasks');
    const still = !(await page.locator('[data-k="tasks-dailies"]').evaluate(d => d.open));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('critoracle:v2:folds') || '{}')['tasks-dailies']);
    check('folds: Dailies close from the header, keep their count, and stay closed after leaving the tab', closed && still && saved === false && /^\d+ of \d+ done$|^none due$/.test(count), `${count} · ${saved}`);
    await page.locator('[data-k="tasks-dailies"] summary').click(); await page.waitForTimeout(200);
    check('folds: open again on a tap', await page.isVisible('[data-k="tasks-dailies"] .list'));
    await tab('Now');
    const rows = await page.locator('.skill-row .li-main').evaluateAll(ms => ms.map(m => m.getBoundingClientRect().width));
    check('skills: at 360 px each row keeps its text wide, buttons under it', rows.length === 0 || rows.every(w => w > 200), rows.map(Math.round).join(','));
    await tab('Stats');
    const first = await page.evaluate(() => [...document.querySelectorAll('main .card')].map(c => c.dataset.k).filter(k => k !== undefined)[0]);
    const squares = await page.locator('[data-k="mini-heat"] .c').count();
    check('Stats: History leads (after unspent points), with two weeks of Dailies as squares', ['history-card', undefined].includes(first) && (squares === 14 || squares === 0), `${first} · ${squares}`);
    await page.click('[data-k="hint-points"], [data-k="hint-sell"]').catch(() => {});
    await page.waitForTimeout(300);
    const hintSheet = await page.locator('.sheet.open').count();
    if (hintSheet) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
    check('a (?) opens the longer explanation in a sheet', hintSheet === 1);
    await page.setViewportSize({ width: 412, height: 915 });
    await tab('Settings'); await page.waitForSelector('text=What may it suggest?');
  }
  // the allowed ways live in their own sheet; a switch there saves and the count on Settings follows
  {
    const count = async () => (await page.locator('[data-k="allowed-ways"] .li-sub').textContent()).trim();
    const before = await count();
    await page.click('[data-k="allowed-ways"]'); await page.waitForSelector('.sheet.open');
    await page.locator('.sheet.open [data-k="lever-seasonal"]').click();
    const after = await count();
    await page.locator('.sheet.open [data-k="lever-seasonal"]').click();
    await page.locator('.sheet.open .sheet-actions button', { hasText: 'Done' }).click(); await page.waitForTimeout(300);
    const n = s => Number(s.split(' ')[0]);
    check('allowed ways: a switch in the sheet saves at once', n(after) === n(before) - 1 && (await count()) === before, `${before} → ${after} → ${await count()}`);
  }
  // Report a problem (About): the lines shown first, nothing from the account; Copy, and GitHub's bug form opened with them filled in
  {
    const name = (await mockState()).user.profile.name;
    await page.click('[data-k="report"]'); await page.waitForSelector('.sheet.open [data-k="report-details"]');
    const details = await page.textContent('.sheet.open [data-k="report-details"]');
    check('report a problem: the app’s and the phone’s versions, nothing from the account',
      /^App: Sidekick for Habitica \S+ \(\d{4}-\d\d-\d\d\), website$/m.test(details) && /^Rules: Habitica v\d/m.test(details) && /^Browser: Chrome \d/m.test(details) && /^Predictions: /m.test(details)
      && !details.includes(UID) && !details.includes(TOKEN) && !details.includes(name), details.replace(/\n/g, ' | '));
    await ctx.grantPermissions(['clipboard-read', 'clipboard-write']);
    const m = await mark();
    await page.locator('.sheet.open .sheet-actions button', { hasText: 'Copy' }).click();
    const copied = await snackAfter(m, 'Copied');
    const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(e => String(e));
    check('report a problem: Copy puts the same lines on the clipboard, the sheet stays', copied === 'Copied.' && clip === details && await page.isVisible('.sheet.open [data-k="report-details"]'), `${copied} · ${clip.slice(0, 60)}`);
    const n0 = (await mockLog()).length;
    await ctx.route('https://github.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>GitHub</p>' }));
    const [gh] = await Promise.all([ctx.waitForEvent('page'), page.locator('.sheet.open .sheet-actions button', { hasText: 'Open GitHub' }).click()]);
    await gh.waitForLoadState().catch(() => {});
    const url = new URL(gh.url());
    await gh.close();
    await ctx.unroute('https://github.com/**');
    await page.waitForTimeout(300);
    check('report a problem: GitHub’s bug form opens in the browser with the lines filled in, and the app sends nothing',
      url.origin === 'https://github.com' && /\/issues\/new$/.test(url.pathname) && url.searchParams.get('template') === 'bug_report.yml' && url.searchParams.get('details') === details
      && (await mockLog()).length === n0 && !(await page.isVisible('.sheet.open')), url.href.slice(0, 120));
  }
  // who talks on Now: the avatar until a pet or mount the account owns is chosen; one it no longer owns shows the avatar and is kept
  {
    const was = (await mockState()).user.items;
    await post('/mock/set', { items: { pets: { 'Wolf-Base': 5, 'Fox-Desert': -1, 'Deer-Base': 0 }, mounts: { 'Dragon-Red': true, 'Fox-Desert': true, 'Owl-Base': false } } });
    await sync();
    const who = async () => (await page.locator('[data-k="set-speaker-who"]').textContent()).trim();
    const first = await who();
    await page.click('[data-k="set-speaker"]'); await page.waitForSelector('.fsd.open [data-k="sp-tab-pet"]');
    const tabs = (await page.locator('.fsd.open .pk-tab').allTextContents()).map(x => x.trim());
    const youSel = await page.locator('.fsd.open [data-k="sp-avatar"]').getAttribute('aria-checked');
    const petTiles = await page.locator('.fsd.open #sp-pane-pet .pk-tile').evaluateAll(ts => ts.map(t => t.dataset.k));
    await page.click('.fsd.open [data-k="sp-tab-mount"]');
    const mountTiles = await page.locator('.fsd.open #sp-pane-mount .pk-tile').evaluateAll(ts => ts.map(t => t.dataset.k));
    await page.click('.fsd.open [data-k="sp-mount:Dragon-Red"]');
    const sel = await page.locator('.fsd.open .pk-tile.sel').evaluateAll(ts => ts.map(t => t.dataset.k));
    await page.click('.fsd.open [data-k="sp-save"]'); await page.waitForTimeout(300);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('critoracle:v2:settings')).speaker);
    check('who talks: the avatar first; the chooser offers only what the account owns, one choice, saved in Settings',
      first === 'Your avatar' && tabs.join(',') === 'Pets · 1,Mounts · 2' && youSel === 'true' && petTiles.join() === 'sp-pet:Wolf-Base'
      && mountTiles.join() === 'sp-mount:Dragon-Red,sp-mount:Fox-Desert' && sel.join() === 'sp-mount:Dragon-Red' && saved === 'mount:Dragon-Red' && /Red Dragon mount$/.test(await who()),
      `${first} · ${tabs} · ${youSel} · ${petTiles} · ${mountTiles} · ${sel} · ${saved} · ${await who()}`);
    // reopened, it starts on the mounts with the dragon chosen; search finds by name
    await page.click('[data-k="set-speaker"]'); await page.waitForSelector('.fsd.open [data-k="sp-tab-mount"]');
    const onMounts = await page.locator('.fsd.open [data-k="sp-tab-mount"]').getAttribute('aria-selected');
    await page.fill('.fsd.open [data-k="sp-search"]', 'fox');
    const found = await page.locator('.fsd.open #sp-pane-mount .pk-tile:not([hidden])').evaluateAll(ts => ts.map(t => t.dataset.k));
    const youHidden = await page.locator('.fsd.open .sp-you').evaluate(s => s.hidden);
    await page.click('.fsd.open [data-k="sp-close"]'); await page.waitForTimeout(300);
    check('who talks: the chooser opens on the chosen one\'s tab; search filters by name', onMounts === 'true' && found.join() === 'sp-mount:Fox-Desert' && youHidden, `${onMounts} · ${found} · ${youHidden}`);
    // the dragon gone from the account: the avatar talks, the choice stays for when it's back
    await post('/mock/set', { items: { mounts: { 'Dragon-Red': false, 'Fox-Desert': true } } });
    await sync();
    const gone = await who();
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem('critoracle:v2:settings')).speaker);
    await post('/mock/set', { items: { mounts: { 'Dragon-Red': true, 'Fox-Desert': true } } });
    await sync();
    const back = await who();
    check('who talks: a creature the account no longer owns gives way to the avatar and comes back with it', gone === 'Your avatar' && kept === 'mount:Dragon-Red' && /Red Dragon mount$/.test(back), `${gone} · ${kept} · ${back}`);
    // a pet talks half as big again as Habitica draws it (as long as it fits the avatar's box); a mount at Habitica's scale
    const drawn = async () => { await tab('Now'); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
      const r = await page.evaluate(() => { const c = document.querySelector('.hero-stage .speaker-art .cpic'); return c && [c.getBoundingClientRect().width, c.getBoundingClientRect().height]; });
      await tab('Settings'); return r; };
    const mountAt = await drawn();
    await page.click('[data-k="set-speaker"]'); await page.waitForSelector('.fsd.open [data-k="sp-tab-pet"]');
    await page.click('.fsd.open [data-k="sp-tab-pet"]'); await page.click('.fsd.open [data-k="sp-pet:Wolf-Base"]'); await page.click('.fsd.open [data-k="sp-save"]'); await page.waitForTimeout(300);
    const petAt = await drawn();
    const SPR = require('../../src/data/sprites.json');
    const [dw, dh] = SPR.mounts['Dragon-Red']; const [ww, wh] = SPR.pets['Wolf-Base'];
    const petWant = Math.min(1.5, 104 / wh, 137 / ww);
    check('who talks: a pet is drawn half as big again as Habitica draws it, a mount at Habitica\'s scale',
      !!mountAt && !!petAt && Math.abs(mountAt[0] / dw - 1) < 0.1 && Math.abs(mountAt[1] / dh - 1) < 0.1 && petWant > 1.3 && Math.abs(petAt[0] / ww - petWant) < 0.1 && Math.abs(petAt[1] / wh - petWant) < 0.1,
      `mount ${mountAt} of ${dw}×${dh}, pet ${petAt} of ${ww}×${wh} (want ×${petWant.toFixed(2)})`);
    // back to the avatar for the rest of the run
    await page.click('[data-k="set-speaker"]'); await page.waitForSelector('.fsd.open [data-k="sp-avatar"]');
    await page.click('.fsd.open [data-k="sp-avatar"]'); await page.click('.fsd.open [data-k="sp-save"]'); await page.waitForTimeout(300);
    const reset = await page.evaluate(() => 'speaker' in JSON.parse(localStorage.getItem('critoracle:v2:settings')));
    check('who talks: choosing You again forgets the creature', !reset && (await who()) === 'Your avatar');
    await post('/mock/set', { items: { pets: was.pets, mounts: was.mounts } });
    await sync();
  }

  // ------------------------------------------------------------------ 14b. smooth updates: a read patches the screen in place
  await tab('Now');
  await page.evaluate(() => { window.__bar = document.querySelector('.appbar'); window.__nav = document.querySelector('.bottomnav'); window.__card = document.querySelector('main .card'); });
  await sync();
  check('a read updates the app bar, nav and cards in place', await page.evaluate(() => window.__bar === document.querySelector('.appbar') && window.__nav === document.querySelector('.bottomnav') && window.__card === document.querySelector('main .card')));
  check('no floating button over the content', (await page.locator('.fab').count()) === 0);
};
