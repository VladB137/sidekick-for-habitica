// e2e: Try it without an account (src/app/demo.ts, demo-account.ts). Run by tests/e2e.cjs after the other parts, on a page of its
// own as a phone (a stand-in Android side records every call): the made-up account must answer itself, never reach the mock
// server (habitica.com's stand-in), the Android side or the device's storage, and leave nothing behind.
module.exports = async ({ APP, SHOTS, browser, check, errors, mockLog }) => {
  // ------------------------------------------------------------------ 21. Try it without an account
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, colorScheme: 'light', isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => {
    window.__noAutoRead = true;
    window.__snackScale = 0.25;
    window.__snacks = [];
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('snack-text')) window.__snacks.push(n.textContent); })
      .observe(document, { childList: true, subtree: true });
    // the Android side: every call is recorded (a remembered login is waiting in its Keystore, which the made-up account must not touch)
    const calls = window.__nativeCalls = [];
    const rec = (name, answer) => o => { calls.push(name); return Promise.resolve(typeof answer === 'function' ? answer(o) : answer); };
    window.__fakeNative = new Proxy({}, {
      get: (_, name) => name === 'then' ? undefined
        : name === 'getCredentials' ? rec(name, {})
          : name === 'status' ? rec(name, { notification: false, notificationsAllowed: true, usageAccess: false, backgroundRefresh: false })
            : name === 'addListener' ? rec(name, { remove () {} })
              : rec(String(name), {}),
    });
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(`pageerror (demo): ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console (demo): ${m.text()}`); });
  const hosts = new Set();
  page.on('request', r => hosts.add(new URL(r.url()).host));
  const sent = (await mockLog()).length;
  // what this load of the page asked of the phone's side, besides the screen's own parts (status bar colour, start-up screen)
  const touched = async () => [...new Set(await page.evaluate(() => window.__nativeCalls.slice()))].filter(c => !['setStatusBarColor', 'ready'].includes(c));
  const untouched = [];
  const intoApp = async (modeK = 'choose-full') => {
    await page.waitForSelector('[data-k="mode-choice"]', { timeout: 20000 });
    await page.click(`[data-k="${modeK}"]`);
    await page.waitForSelector('[data-k="coach-skip"]');
    await page.click('[data-k="coach-skip"]');
    await page.waitForSelector('.bottomnav');
  };

  await page.goto(APP);
  await page.waitForSelector('.ob');
  // what this device already keeps (a returning player's settings): the visit must leave it exactly as it was
  await page.evaluate(() => { localStorage.setItem('critoracle:v2:settings', JSON.stringify({ theme: 'light' })); localStorage.setItem('e2e:marker', 'kept'); });
  const stored = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
  const before = await stored();

  // the intro's last slide offers it under Get started
  for (let i = 0; i < 6; i++) { await page.click('[data-k="intro-next"]'); await page.waitForTimeout(350); }
  await page.waitForSelector('[data-k="intro-try"]', { state: 'visible' });
  await page.click('[data-k="intro-try"]');
  await intoApp();
  const now = await page.evaluate(() => ({
    banner: document.querySelector('[data-k="demo-banner"]')?.textContent || '',
    headline: !!document.querySelector('.hero-stage .bubble'),
    memory: Object.getPrototypeOf(localStorage) !== Storage.prototype,
  }));
  check('try it: the intro’s Try it opens the whole app on a made-up account, saying so', /made-up account/.test(now.banner) && now.headline, JSON.stringify(now));
  check('try it: the device’s storage is set aside (in memory while it lasts)', now.memory);
  await page.screenshot({ path: `${SHOTS}/60-demo-now.png` });

  // a tap works as with a real account, answered by Habitica's own code in the page
  await page.click('.bottomnav button[aria-label="Tasks"]');
  await page.waitForSelector('.li-title');
  const m = await page.evaluate(() => window.__snacks.length);
  await page.locator('.li', { hasText: 'Drink a glass of water' }).first().locator('.hbtn.plus').click();
  const snack = await page.waitForFunction(m => window.__snacks.slice(m).find(t => /XP|Gold/.test(t)), m, { timeout: 15000 }).then(h => h.jsonValue()).catch(() => '(none)');
  check('try it: scoring a task works, answered on the device', /XP|Gold/.test(snack), snack);
  untouched.push(...await touched());

  // a reload is a fresh made-up account; leaving lands on the login screen with the device as it was
  await page.reload();
  await intoApp('choose-relaxed');
  check('try it: a reload starts the made-up account over (the mode is asked again)', (await page.locator('[data-k="demo-banner"]').count()) === 1);
  await page.click('[data-k="demo-leave"]');
  await page.waitForSelector('#uid', { timeout: 15000 });
  check('try it: Use mine goes to the login screen, not the intro', (await page.locator('.ob').count()) === 0);
  check('try it: nothing of it is kept on the device', (await stored()) === before, await stored());

  // the login screen offers it too; Settings' account card leads back
  await page.click('[data-k="try-demo"]');
  await intoApp();
  await page.click('.bottomnav button[aria-label="Settings"]');
  const card = await page.locator('main .card', { hasText: 'Account' }).last().textContent();
  check('try it: Settings says it’s a made-up account and leaves through Use my account', /A made-up account/.test(card) && /Use my account/.test(card), card.replace(/\s+/g, ' '));
  untouched.push(...await touched());
  await page.click('[data-k="logout"]');
  await page.waitForSelector('#uid', { timeout: 15000 });
  check('try it: back on the login screen, the device as it was', (await stored()) === before && (await page.evaluate(() => sessionStorage.getItem('oracle:demo'))) === null);

  check('try it: the phone’s side is never asked for anything (no Keystore, notification, widget, wallpaper, night gear)', untouched.length === 0, untouched.join(', '));
  check('try it: nothing went to Habitica (the mock server saw no request)', (await mockLog()).length === sent, `${(await mockLog()).length - sent} requests`);
  const other = [...hosts].filter(h => h !== new URL(APP).host && h !== 'habitica-assets.s3.amazonaws.com');
  check('try it: no other host is contacted (only the avatar pictures, as with any account)', other.length === 0, other.join(', '));
  await ctx.close();
};
