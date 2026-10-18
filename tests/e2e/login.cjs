// e2e: Login, the intro and the mode choice. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ API, APP, SHOTS, TOKEN, UID, browser, check, ctx, page, post, slideAt, tab }) => {
  // ------------------------------------------------------------------ 0. login: a wrong token keeps the form and says why
  await post('/mock/reset?class=warrior&level=24');
  await page.goto(APP);

  // ------------------------------------------------------------------ 0a. intro before login: swipe, Next, Get started
  await page.waitForSelector('.ob');
  const nSlides = await page.locator('.ob-slide').count();
  check('intro: shown before login, first slide current', nSlides >= 4 && (await slideAt()) === 0 && (await page.locator('.ob-dot.on').count()) === 1, `${nSlides} slides`);
  await page.screenshot({ path: `${SHOTS}/00-intro-1.png` });
  // a real touch swipe, so the browser's snapping decides where it stops
  const cdp = await ctx.newCDPSession(page);
  const pagerAt = () => page.evaluate(() => { const t = document.querySelector('.ob-track'); return t.scrollLeft / t.clientWidth; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 330, y: 400 }] });
  for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 330 - i * 22, y: 400 }] }); await page.waitForTimeout(16); }
  const midway = await pagerAt();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(700);
  const snapped = await pagerAt();
  check('intro: a swipe follows the finger, then snaps to the next slide', midway > 0.2 && midway < 0.9 && (await slideAt()) === 1 && Math.abs(snapped - 1) < 0.01, `midway ${midway.toFixed(2)}, then ${snapped.toFixed(2)}`);
  await page.click('[data-k="intro-next"]');
  await page.waitForTimeout(700);
  check('intro: Next moves on and the dots follow', (await slideAt()) === 2 && (await page.locator('.ob-dot').nth(2).getAttribute('aria-current')) === 'step');
  for (let i = 2; i < nSlides; i++) {
    if (i > 2) { await page.click('[data-k="intro-next"]'); await page.waitForTimeout(700); }
    await page.screenshot({ path: `${SHOTS}/00-intro-${i + 1}.png` });
  }
  check('intro: the last slide offers Get started instead of Skip and Next',
    (await slideAt()) === nSlides - 1 && await page.isVisible('[data-k="intro-start"]') && !(await page.isVisible('[data-k="intro-skip"]')) && !(await page.isVisible('[data-k="intro-next"]')));
  await page.click('[data-k="intro-start"]');
  await page.waitForSelector('#uid');
  check('intro: Get started opens the login screen', (await page.locator('.ob').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/01-login.png`, fullPage: true });
  {
    // a guided login: a link to Habitica's page, the format checked as you type, both codes from one paste, the token note folded
    const link = await page.getAttribute('[data-k="open-api-page"]', 'href');
    await page.fill('#uid', UID.slice(0, 20));
    const short = await page.evaluate(() => { const e = document.querySelector('[data-k="uid-help"]'); return [e.textContent, e.className]; });
    await page.evaluate(([a, b]) => {
      const dt = new DataTransfer(); dt.setData('text/plain', `my notes: ${a}\napi ${b}`);
      document.getElementById('uid').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    }, [UID, TOKEN]);
    const both = [await page.inputValue('#uid'), await page.inputValue('#tok'), (await page.textContent('[data-k="uid-help"]')).trim(), (await page.textContent('[data-k="tok-help"]')).trim()];
    const more = await page.evaluate(() => { const d = document.querySelector('[data-k="token-more"]'); return !d.open && d.textContent.includes('Remember on this device') && /works like a password/.test(d.closest('.notice').textContent); });
    check('login: Habitica’s API page one tap away', link === 'https://habitica.com/user/settings/siteData', link);
    check('login: a short paste shows how many characters are missing', short[0].startsWith('20 of 36 characters') && short[1].includes('bad'), short.join(' | '));
    check('login: one paste holding both codes fills both fields', both[0] === UID && both[1] === TOKEN && both[2] === 'Looks right.' && both[3] === 'Looks right.', both.join(' | '));
    check('login: the token note is two lines, the rest under More', more);
    await page.fill('#tok', '');
  }
  await page.fill('#uid', UID);
  await page.fill('#tok', '00000000-0000-4000-8000-0000000bad00');
  await page.click('button[type=submit]');
  await page.waitForSelector('.notice.error:not([hidden])');
  const loginErr = await page.textContent('.notice.error');
  check('wrong token: error shown, form kept', loginErr.includes('didn’t accept') && (await page.inputValue('#uid')) === UID, loginErr);
  await page.fill('#tok', TOKEN);
  await page.click('button[type=submit]');
  // ------------------------------------------------------------------ 0b. after login: the mode choice once, then three tips
  await page.waitForSelector('[data-k="mode-choice"]', { timeout: 15000 });
  {
    const cards = await page.$$eval('.mode-card', cs => cs.map(c => c.dataset.k));
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('critoracle:v2:settings') || '{}').mode);
    check('mode choice: after login, two cards, nothing chosen yet, no app bar', cards.join(',') === 'choose-full,choose-relaxed' && before === undefined && (await page.locator('.appbar').count()) === 0, cards.join(','));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/01b-mode-choice.png`, fullPage: true });
    await page.click('[data-k="choose-full"]');
    await page.waitForSelector('[data-k="coach"]');
    await page.waitForTimeout(400);
    const tip = async () => [(await page.textContent('.coach-title')).trim(), (await page.textContent('.coach-count')).trim(), !(await page.locator('.coach-ring').evaluate(e => e.hidden))];
    const t1 = await tip();
    await page.screenshot({ path: `${SHOTS}/01c-coach-1.png` });
    await page.click('[data-k="coach-next"]');
    const t2 = await tip();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOTS}/01d-coach-2.png` });
    // a tap anywhere moves on too
    await page.mouse.click(200, 400);
    const t3 = await tip();
    const last = (await page.textContent('[data-k="coach-next"]')).trim();
    await page.click('[data-k="coach-next"]');
    await page.waitForTimeout(100);
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('critoracle:v2:settings')));
    check('mode choice: Full opens on Now', (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Now' && saved.mode === 'full', saved.mode);
    check('tips: three, each pointing at its part of the screen', t1[0] === 'Amber means go' && t1[1] === '1 of 3' && t1[2] && t2[0] === 'One tap, nothing hidden' && t3[0] === 'Everything else' && t3[1] === '3 of 3' && t3[2] && last === 'Got it', [t1, t2, t3].map(t => t.join('/')).join(' | '));
    check('tips: gone after the last, and remembered', (await page.locator('[data-k="coach-layer"]').count()) === 0 && saved.coach?.full === true);
  }
  await page.waitForSelector('.appbar .headline', { timeout: 15000 });
  await page.waitForTimeout(300);
  check('logs in and shows a verdict', true, (await page.textContent('.appbar .headline')).trim());
  await page.screenshot({ path: `${SHOTS}/02-now-warrior.png`, fullPage: true });
  {
    // Habitica's own words, each tappable: a sheet says what it means; never inside a label or another button
    const explain = async k => {
      await page.click(`[data-k="term-${k}"]`); await page.waitForSelector('.sheet.open');
      const got = [(await page.textContent('.sheet.open .sheet-title')).trim(), (await page.textContent(`.sheet.open [data-k="explain-${k}"]`)).trim()];
      await page.click('.sheet.open .sheet-actions button'); await page.waitForTimeout(250);
      return got;
    };
    const hp = await explain('hp');
    const chance = await page.locator('.hero [data-k="term-critChance"], .hero [data-k="term-crit"]').count();
    await tab('Stats');
    const str = await explain('str');
    const nested = await page.evaluate(() => document.querySelectorAll('label .term, button .term, a .term').length);
    await tab('Settings');
    const labels = await page.$$eval('.field label', ls => ls.map(l => l.textContent));
    const cards = (await page.locator('main .card-title').allTextContents()).map(x => x.trim());
    await tab('Now');
    check('words: tap HP on Now to learn it', hp[0] === 'HP (health)' && /Missed Dailies/.test(hp[1]), hp.join(' | '));
    check('words: the verdict’s crit wording explains itself', chance === 1);
    check('words: tap STR on Stats to learn it, nothing nested in a label or button', str[0] === 'STR (Strength)' && /crit chance/.test(str[1]) && nested === 0, `${str.join(' | ')} · nested ${nested}`);
    check('Settings asks questions', labels.includes('What should crits help with most?') && labels.includes('Where do you put your stat points?') && labels.includes('How many of each item should it keep?'), labels.join(' | '));
    check('Settings: App mode first, then Crits apart from Items and gear', cards.slice(0, 3).join(',') === 'App mode,Crits,Items and gear', cards.join(','));
  }
};
