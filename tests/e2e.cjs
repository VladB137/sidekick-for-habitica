// End-to-end run of the built site against tools/mock-server.mjs (Habitica's own game code behind a local API).
//   VITE_TEST_API=http://127.0.0.1:3001 VITE_AUTO_READ_MS=3000 npx vite build --outDir dist-e2e
//   node tools/mock-server.mjs --port 3001 --rate 1000 &  node_modules/.bin/vite preview --outDir dist-e2e --port 4173 &
//   node tests/e2e.cjs [screenshot-dir]
const { chromium } = (() => { try { return require('playwright'); } catch { return require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright'); } })();
const CHROMIUM = process.env.CHROMIUM || (require('fs').existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const fs = require('fs');
const ITEMS = require('../src/data/items.json');
// the version the rules were checked against: the mock answers with it after a test pretends Habitica moved on
const CHECKED = fs.readFileSync(require('path').join(__dirname, '../src/engine/rules.ts'), 'utf8').match(/checkedAgainst: 'v?([^']+)'/)[1];

const APP = process.env.APP_URL || 'http://127.0.0.1:4173/';
const API = process.env.MOCK_URL || 'http://127.0.0.1:3001';
const SHOTS = process.argv[2] || 'screenshots';
const UID = '00000000-0000-4000-8000-000000000001';
const TOKEN = '00000000-0000-4000-8000-00000000c0de';
const AUTH = { 'x-api-user': UID, 'x-api-key': TOKEN, 'x-client': `${UID}-e2e` };
fs.mkdirSync(SHOTS, { recursive: true });

const post = (p, body) => fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body || {}) }).then(r => r.json());
const mockState = () => fetch(`${API}/mock/state`).then(r => r.json());
// the date n days after the account's Habitica day (its time zone and day start, as the app counts), as the app labels it;
// the browser's own date is a day behind once the account's midnight has passed (the mock user is UTC+2)
const accountDayPlus = async (page, n) => {
  const p = (await mockState()).user.preferences;
  const d = new Date(Date.now() - p.timezoneOffset * 6e4 - p.dayStart * 36e5);
  // labelled in the page, so the format is Chromium's, as the app's own
  return page.evaluate(([y, m, day]) => new Date(y, m, day, 12).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n]);
};
const mockLog = () => fetch(`${API}/mock/log`).then(r => r.json());
let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`); if (!ok) failures++; };

// the path each kind of step calls, for injecting a refusal
const STEP_PATH = [[/^Sell/, '/user/sell/'], [/^Buy your reward/, '/score/up'], [/^Cast/, '/class/cast/'], [/^Equip/, '/user/equip/'], [/^Drink/, '/buy-health-potion'], [/^Spend/, '/user/allocate'], [/^Buy/, '/user/buy-'], [/^Log/, '/score/down']];

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, colorScheme: 'light', isMobile: true, hasTouch: true });
  // every snackbar message, in order (they queue, so the visible one may lag)
  await ctx.addInitScript(() => {
    // automatic re-reads would add requests to the counts below; section 12b switches them on
    window.__noAutoRead = true;
    // nobody hides behind the Stable's hiding spot except in its own check
    window.__noHide = true;
    // the character sums up the day only in its own check (16c): it would talk over the bubble's other checks
    window.__noDaySummary = true;
    // snackbars stay up a quarter as long: most of the run was waiting for queued messages
    window.__snackScale = 0.25;
    window.__snacks = [];
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('snack-text')) window.__snacks.push(n.textContent); })
      .observe(document, { childList: true, subtree: true });
  });
  const page = await ctx.newPage();
  const stableSeen = new Set(); page.on('request', r => { if (r.url().includes('/stable/')) stableSeen.add(new URL(r.url()).pathname); });
  const errors = [];
  page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  const failedHosts = [];
  page.on('requestfailed', r => failedHosts.push(new URL(r.url()).host));

  const mark = () => page.evaluate(() => window.__snacks.length);
  const snackAfter = async (m, pred = '.', timeout = 15000) => {
    const h = await page.waitForFunction(([m, re]) => window.__snacks.slice(m).find(t => new RegExp(re).test(t)), [m, pred], { timeout }).catch(() => null);
    return h ? h.jsonValue() : (await page.evaluate(m => window.__snacks.slice(m).join(' | ') || '(none)', m));
  };
  const idle = () => page.waitForFunction(() => !document.querySelector('.sync.spin'), null, { timeout: 15000 });
  const tab = async (name) => { await page.click(`.bottomnav button[aria-label="${name}"]`); await page.waitForTimeout(150); };
  const sync = async () => { await page.click('.appbar [data-k="sync"]'); await page.waitForTimeout(100); await idle(); };
  const cardTitle = async () => (await page.textContent('main .card .card-title')).trim();
  const score = async (text) => {
    await tab('Tasks');
    await page.waitForSelector('.li-title');
    const row = page.locator('.li', { hasText: text }).first();
    const m = await mark();
    await row.locator('.hbtn.plus, .check').first().click();
    const txt = await snackAfter(m, '(XP|Gold|Level)');
    await idle();
    return txt;
  };
  const predictions = async () => {
    await tab('Stats');
    // the Prediction check appears once there is a first prediction
    const sec = page.locator('[data-k="predictions"] .pred-sub');
    if (await sec.count() === 0) return { matched: 0, total: 0, text: '' };
    const sub = await sec.textContent();
    const m = sub.match(/(\d+) of (\d+) predictions/);
    return { matched: Number(m[1]), total: Number(m[2]), text: sub };
  };
  const runFirstOption = async () => {
    const doIt = page.locator('.opt button', { hasText: 'Do it' }).first();
    if (await doIt.count() === 0) return null;
    const steps = (await page.locator('.opt').first().textContent()).replace(/\s+/g, ' ');
    await doIt.click();
    await page.waitForSelector('.sheet.open');
    const really = page.locator('.sheet.open #really');
    if (await really.count()) await really.check();
    const m = await mark();
    await page.locator('.sheet.open .sheet-actions button', { hasText: 'Do it' }).click();
    const msg = await snackAfter(m, '^(Done|Step \\d|Your numbers changed|This needs|A new day|You’re out of HP|Couldn’t re-read)');
    await idle();
    return { steps, msg };
  };
  const slideAt = () => page.evaluate(() => Number(document.querySelector('.ob').dataset.slide));

  // the parts of the run, in order (tests/e2e/): each one starts where the one before it left off
  const t = { API, APP, AUTH, CHECKED, ITEMS, SHOTS, STEP_PATH, TOKEN, UID, accountDayPlus, browser, cardTitle, check, ctx, errors, fs, idle, mark, mockLog, mockState, page, post, predictions, runFirstOption, score, slideAt, snackAfter, stableSeen, sync, tab };
  for (const part of ['login', 'crits', 'tasks', 'history', 'suggestions', 'day', 'offline', 'screens', 'stable', 'followups', 'classes', 'drops', 'repeats', 'android', 'relaxed', 'demo']) await require(`./e2e/${part}.cjs`)(t);

  // ------------------------------------------------------------------ 18. the playground engine (Stable), on its development page
  await require('./playground-e2e.cjs').playgroundChecks(browser, { APP, SHOTS, check });
  // ------------------------------------------------------------------ 19. the Stable creatures, on their development page
  await require('./creatures-e2e.cjs').creatureChecks(browser, { APP, SHOTS, check });
  // ------------------------------------------------------------------ 20. the Stable's scenes and props, on their development page
  await require('./scenes-e2e.cjs').scenesChecks(browser, { APP, SHOTS, check });

  // Habitica's sprite server is outside this test sandbox's network; aborted requests in the offline test are deliberate
  const real = errors.filter(e => !(/ERR_TUNNEL_CONNECTION_FAILED|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(e)));
  check('no page errors or CSP violations', real.length === 0, real.slice(0, 5).join(' || '));
  await browser.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\ne2e: OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
