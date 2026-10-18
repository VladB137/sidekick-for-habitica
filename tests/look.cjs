// Viewport screenshots of the built site against the mock server, for a visual check.
//   node tests/look.cjs <dir>   (servers as in tests/e2e.cjs)
const { chromium } = (() => { try { return require('playwright'); } catch { return require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); } })();
const CHROMIUM = process.env.CHROMIUM || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const APP = process.env.APP_URL || 'http://127.0.0.1:4173/';
const API = process.env.MOCK_URL || 'http://127.0.0.1:3001';
const dir = process.argv[2] || 'screenshots';
require('fs').mkdirSync(dir, { recursive: true });
const post = p => fetch(API + p, { method: 'POST' });
(async () => {
  const b = await chromium.launch({ executablePath: CHROMIUM });
  for (const scheme of ['light', 'dark']) {
    await post('/mock/reset?class=warrior&level=24');
    const ctx = await b.newContext({ viewport: { width: 412, height: 860 }, deviceScaleFactor: 2, colorScheme: scheme, isMobile: true, hasTouch: true });
    const p = await ctx.newPage();
    await p.goto(APP);
    await p.waitForSelector('.ob');
    const n = await p.locator('.ob-slide').count();
    for (let i = 0; i < n; i++) {
      if (i) { await p.click('[data-k="intro-next"]'); await p.waitForTimeout(700); }
      await p.screenshot({ path: `${dir}/v-${scheme}-intro-${i + 1}.png` });
    }
    await p.click('[data-k="intro-start"]');
    await p.waitForSelector('#uid');
    await p.fill('#uid', '00000000-0000-4000-8000-000000000001');
    await p.fill('#tok', '00000000-0000-4000-8000-00000000c0de');
    if (scheme === 'light') await p.screenshot({ path: `${dir}/v-login.png` });
    await p.click('button[type=submit]');
    await p.waitForSelector('[data-k="mode-choice"]');
    await p.screenshot({ path: `${dir}/v-${scheme}-mode-choice.png` });
    await p.click('[data-k="choose-full"]');
    await p.waitForSelector('[data-k="coach"]');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${dir}/v-${scheme}-coach.png` });
    await p.click('[data-k="coach-skip"]');
    await p.waitForSelector('.appbar .headline');
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${dir}/v-${scheme}-now.png` });
    await p.mouse.wheel(0, 700); await p.waitForTimeout(500);
    await p.screenshot({ path: `${dir}/v-${scheme}-now-scrolled.png` });
    for (const tab of ['Tasks', 'Stats']) {
      await p.click(`.bottomnav button[aria-label="${tab}"]`); await p.waitForTimeout(400);
      await p.screenshot({ path: `${dir}/v-${scheme}-${tab.toLowerCase()}.png` });
    }
    await p.click('.bottomnav button[aria-label="Now"]'); await p.waitForTimeout(300);
    const doIt = p.locator('.opt button', { hasText: 'Do it' }).first();
    if (await doIt.count()) { await doIt.click(); await p.waitForTimeout(400); await p.screenshot({ path: `${dir}/v-${scheme}-sheet.png` }); await p.keyboard.press('Escape'); }
    await ctx.close();
  }
  await b.close();
  console.log('ok');
})();
