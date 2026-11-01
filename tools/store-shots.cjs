// Store listing pictures from the made-up account (Try it without an account), so no real account is ever shown:
// phone screenshots into fastlane/metadata/android/en-US/images/phoneScreenshots/ (F-Droid and IzzyOnDroid read that folder),
// the same five into docs/screenshots/ for the README, and the 512 px icon from public/icons/icon.svg.
// Usage: npm run build, then serve dist (node_modules/.bin/vite preview --host 127.0.0.1 --port 4173), then
//   APP_URL=http://127.0.0.1:4173/ node tools/store-shots.cjs
const { chromium } = require('playwright');
const fs = require('node:fs');

const APP = process.env.APP_URL || 'http://127.0.0.1:4173/';
const STORE = 'fastlane/metadata/android/en-US/images';
const PHONE = `${STORE}/phoneScreenshots`;
const exe = fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined;

(async () => {
  fs.mkdirSync(PHONE, { recursive: true });
  const browser = await chromium.launch(exe ? { executablePath: exe } : {});

  // a real 412 x 915 dp phone (1080 x 2400 px) is 2.625 device pixels per CSS pixel; at 2 the Stable would draw at
  // 1 device pixel per world pixel (grid.ts fits whole multiples), half the size any phone this wide shows it
  const shoot = async (scheme, shots) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, colorScheme: scheme, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    await ctx.addInitScript(() => { window.__noAutoRead = true; });
    const page = await ctx.newPage();
    await page.goto(APP);
    await page.waitForSelector('[data-k="intro-next"]');
    for (let i = 0; i < 6; i++) { await page.click('[data-k="intro-next"]'); await page.waitForTimeout(300); }
    await page.click('[data-k="intro-try"]');
    await page.waitForSelector('[data-k="mode-choice"]', { timeout: 30000 });
    await page.click('[data-k="choose-full"]');
    await page.waitForSelector('[data-k="coach-skip"]');
    await page.click('[data-k="coach-skip"]');
    await page.waitForSelector('.bottomnav');
    // the banner that says the account is made up: the listing says so in words instead
    await page.addStyleTag({ content: '[data-k="demo-banner"] { display: none !important; }' });
    for (const [tab, files] of shots) {
      await page.click(`[data-k="nav-${tab}"]`);
      await page.waitForSelector(`[data-k="main-${tab}"]`);
      await page.waitForTimeout(1500);
      for (const f of files) await page.screenshot({ path: f });
    }
    await ctx.close();
  };

  await shoot('light', [
    ['now', [`${PHONE}/1-now.png`, 'docs/screenshots/now.png']],
    ['tasks', [`${PHONE}/2-tasks.png`, 'docs/screenshots/tasks.png']],
    ['stable', [`${PHONE}/3-stable.png`, 'docs/screenshots/stable.png']],
    ['stats', [`${PHONE}/4-stats.png`, 'docs/screenshots/stats.png']],
  ]);
  await shoot('dark', [['now', [`${PHONE}/5-now-dark.png`, 'docs/screenshots/now-dark.png']]]);

  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await page.setContent(`<html><body style="margin:0;background:transparent">${fs.readFileSync('public/icons/icon.svg', 'utf8').replace('<svg', '<svg width="512" height="512"')}</body></html>`);
  await page.screenshot({ path: `${STORE}/icon.png`, omitBackground: true, clip: { x: 0, y: 0, width: 512, height: 512 } });
  await browser.close();
  console.log(`store pictures written to ${STORE} and docs/screenshots`);
})().catch(e => { console.error(e); process.exit(1); });
