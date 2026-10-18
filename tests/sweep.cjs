// A bug sweep over the simulator (tools/build-sim.mjs): every made-up account in both modes, at two phone widths and
// both themes, each tab and the screens behind it, then everything the simulator can make happen while the app is open,
// checking each screen for what should never show: page errors, sideways scrolling, content past the screen's edge,
// clipped text, and NaN / undefined / [object Object] / Infinity in what the player reads.
//   node tools/build-sim.mjs && node_modules/.bin/vite preview --outDir dist-sim --port 4300 &
//   SIM_URL=http://127.0.0.1:4300/ node tests/sweep.cjs [report.json]
// Exit code 1 when anything is found. Habitica's avatar images (habitica-assets) are listed in the report, so
// tools/sim/avatar-files.json can be refreshed from it (the published simulator can't load them from that host).
const { chromium } = require('playwright');
const fs = require('fs');
const CHROMIUM = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const SIM = process.env.SIM_URL || 'http://127.0.0.1:4300/';
const OUT = process.argv[2] || 'sweep-report.json';
const ONLY = process.env.SWEEP_ONLY ? process.env.SWEEP_ONLY.split(',') : null;
const UID = '00000000-0000-4000-8000-000000000001';
const TOKEN = '00000000-0000-4000-8000-00000000c0de';
const TAPS = Number(process.env.SWEEP_TAPS ?? 40);
const TABS = ['Now', 'Tasks', 'Stats', 'Stable', 'Settings'];

/** What should never be on screen, checked in the page. */
function inspect () {
  const out = [];
  const W = document.documentElement.clientWidth;
  const name = e => {
    const k = e.closest('[data-k]')?.dataset.k;
    const cls = typeof e.className === 'string' ? e.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    return `${e.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${k ? ` in [data-k=${k}]` : ''}`;
  };
  const visible = e => { for (let x = e; x && x !== document.body; x = x.parentElement) { const s = getComputedStyle(x); if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false; } return true; };
  const clipsX = e => { for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) { const o = getComputedStyle(x).overflowX; if (o !== 'visible') return true; } return false; };
  if (document.documentElement.scrollWidth > W + 1) out.push({ kind: 'sideways', what: `the page scrolls sideways (${document.documentElement.scrollWidth} px wide on a ${W} px screen)` });
  for (const e of document.querySelectorAll('#app *')) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || !visible(e)) continue;
    if (r.right > W + 1 && r.left < W && !clipsX(e) && getComputedStyle(e).position !== 'fixed') out.push({ kind: 'edge', what: `${name(e)} reaches ${Math.round(r.right)} px on a ${W} px screen`, text: e.textContent.trim().slice(0, 60) });
    // text cut off without an ellipsis: a leaf whose text is wider than its box, in a box that hides the rest
    if (!e.children.length && e.textContent.trim() && e.clientWidth > 2 && !e.classList.contains('sr') && e.scrollWidth > e.clientWidth + 1) {
      const s = getComputedStyle(e);
      if ((s.overflowX === 'hidden' || s.overflowX === 'clip') && s.textOverflow !== 'ellipsis') out.push({ kind: 'clipped', what: `${name(e)} cuts its text off`, text: e.textContent.trim().slice(0, 60) });
    }
  }
  const walker = document.createTreeWalker(document.getElementById('app') || document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n.textContent;
    if (!/\b(NaN|undefined|Infinity)\b|\[object |\bnull\b/.test(t)) continue;
    const e = n.parentElement;
    if (!e || !visible(e) || e.closest('input, textarea, .li-title, .li-notes')) continue; // a task's own text says whatever the player wrote
    out.push({ kind: 'text', what: `${name(e)} says “${t.trim().slice(0, 80)}”` });
  }
  // the label of every button and link, for screen readers
  for (const b of document.querySelectorAll('#app button, #app a, #app [role="button"]')) {
    if (!visible(b) || !b.getBoundingClientRect().width) continue;
    const label = (b.getAttribute('aria-label') || b.textContent || b.getAttribute('title') || '').trim();
    if (!label && !b.getAttribute('aria-labelledby')) out.push({ kind: 'a11y', what: `${name(b)} has no name for TalkBack` });
  }
  return out;
}

(async () => {
  const browser = await chromium.launch({ executablePath: CHROMIUM });
  const findings = new Map(); // key → { kind, what, text?, where: [] }
  const avatar = new Set();
  let screens = 0;
  const snacks = new Set();
  const note = (f, where) => {
    const key = `${f.kind}|${f.what}`;
    if (!findings.has(key)) findings.set(key, { ...f, where: [] });
    const x = findings.get(key);
    if (x.where.length < 6) x.where.push(where);
    x.count = (x.count || 0) + 1;
  };

  // the report so far, after every run (a long sweep stopped half-way still says what it found)
  const save = () => fs.writeFileSync(OUT, JSON.stringify({ screens, runs: runs.length, findings: [...findings.values()], messages: [...snacks].sort(), avatarFiles: [...avatar].sort() }, null, 2));
  const runs = [];
  const probe = await browser.newPage();
  await probe.goto(SIM); await probe.waitForFunction(() => window.__sim);
  const { scenarios, events } = await probe.evaluate(() => ({ scenarios: window.__sim.scenarios, events: window.__sim.events }));
  await probe.close();
  scenarios.filter(s => !ONLY || ONLY.includes(s)).forEach((s, i) => {
    for (const mode of ['full', 'relaxed']) runs.push({ scenario: s, mode, width: (i + (mode === 'full' ? 0 : 1)) % 2 ? 360 : 412, dark: (i + (mode === 'full' ? 1 : 0)) % 2 === 1, clock: 0 });
  });
  // the day's other ends: early morning, the evening before the day change, another season
  // (a number is a local time of day to move the phone's clock to; days: a jump forward)
  const toHour = h => { const d = new Date(); const now = d.getHours() + d.getMinutes() / 60; return Math.round(((h - now + 24) % 24) * 100) / 100 || 0.01; };
  for (const [s, at] of [['warrior', 6.5], ['lowhp', 23.9], ['newday', 0.2], ['daystart', 3.5], ['daystart', 4.5], ['travel', 23.5], ['stable', { days: 120 }]]) {
    if (!ONLY || ONLY.includes(s)) runs.push({ scenario: s, mode: 'full', width: 412, dark: false, clock: typeof at === 'number' ? toHour(at) : at.days * 24 });
  }

  for (const run of runs) {
    const label = `${run.scenario} · ${run.mode} · ${run.width}px · ${run.dark ? 'dark' : 'light'}${run.clock ? ` · clock ${run.clock > 0 ? '+' : ''}${run.clock} h` : ''}`;
    const ctx = await browser.newContext({ viewport: { width: run.width, height: 800 }, deviceScaleFactor: 1, colorScheme: run.dark ? 'dark' : 'light', isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => {
      window.__snacks = [];
      new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('snack-text')) window.__snacks.push(n.textContent); })
        .observe(document, { childList: true, subtree: true });
    });
    await ctx.addInitScript(([uid, tok, run]) => {
      if (sessionStorage.getItem('swept')) return;
      sessionStorage.setItem('swept', '1');
      localStorage.setItem('sim:v1', JSON.stringify({ scenario: run.scenario, clockHours: run.clock }));
      localStorage.setItem('critoracle:v2:creds', JSON.stringify({ userId: uid, apiToken: tok }));
      localStorage.setItem('critoracle:v2:settings', JSON.stringify({ mode: run.mode, coach: { full: true, relaxed: true } }));
    }, [UID, TOKEN, run]);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(`page error: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error' && !/habitica-assets|Failed to load resource/.test(m.text())) errors.push(`console: ${m.text().slice(0, 200)}`); });
    page.on('request', r => { const u = new URL(r.url()); if (u.host === 'habitica-assets.s3.amazonaws.com') avatar.add(u.pathname.split('/').pop()); });
    const where = async (screen) => `${label} · ${screen}`;
    const look = async (screen) => {
      screens += 1;
      await page.waitForTimeout(250);
      for (const f of await page.evaluate(inspect)) note(f, await where(screen));
      for (const e of errors.splice(0)) note({ kind: 'error', what: e }, await where(screen));
    };
    const tab = async name => { const b = page.locator(`.bottomnav button[aria-label="${name}"]`); if (await b.count()) { await b.click(); await page.waitForTimeout(700); return true; } return false; };
    try {
      await page.goto(SIM);
      await page.waitForSelector('.bottomnav', { timeout: 20000 });
      await page.waitForTimeout(1500);
      for (const t of TABS) {
        if (!(await tab(t))) { note({ kind: 'nav', what: `no ${t} tab` }, await where(t)); continue; }
        await look(t);
        // everything folded, unfolded
        const opened = await page.evaluate(() => { let n = 0; for (const d of document.querySelectorAll('#app details:not([open])')) { d.open = true; n++; } return n; });
        if (opened) await look(`${t}, every fold open`);
        if (t === 'Stats') {
          const hist = page.locator('[data-k="history"], button:has-text("History")').first();
          if (await hist.count()) { await hist.click().catch(() => {}); await page.waitForTimeout(800); await look('History'); await page.goBack().catch(() => {}); await page.waitForTimeout(400); }
        }
      }
      // taps: Habitica's words explained, a few tasks scored, the first suggestion run; every message read
      const idle = () => page.waitForFunction(() => !document.querySelector('.sync.spin'), null, { timeout: 15000 }).catch(() => {});
      await tab('Now');
      for (const k of (await page.$$eval('#app .term', ts => [...new Set(ts.map(t => t.dataset.k))])).slice(0, 4)) {
        await page.locator(`#app [data-k="${k}"]`).first().click().catch(() => {});
        await page.waitForTimeout(350); await look(`explained word ${k}`);
        await page.locator('.sheet.open .sheet-actions button').first().click().catch(() => {}); await page.waitForTimeout(300);
      }
      if (run.clock === 0) {
        const doIt = page.locator('.opt button', { hasText: 'Do it' }).first();
        if (await doIt.count()) {
          await doIt.click().catch(() => {}); await page.waitForTimeout(400);
          const really = page.locator('.sheet.open #really'); if (await really.count()) await really.check().catch(() => {});
          await page.locator('.sheet.open .sheet-actions button', { hasText: 'Do it' }).click().catch(() => {});
          await page.waitForTimeout(2500); await idle(); await look('after running the first suggestion');
        }
        await tab('Tasks');
        const taps = await page.$$eval('#app [data-k^="up-"]:not([disabled]), #app [data-k^="chk-"]:not([disabled])', bs => bs.map(b => b.dataset.k));
        for (const k of [...taps.filter(k => k.startsWith('up-')).slice(0, 3), ...taps.filter(k => k.startsWith('chk-')).slice(0, 3)]) {
          await page.locator(`#app [data-k="${k}"]`).first().click().catch(() => {});
          await page.waitForTimeout(400);
          // a ticked Daily asks before unticking: say yes
          const ask = page.locator('.sheet.open .sheet-actions button').last();
          if (await ask.count()) await ask.click().catch(() => {});
          await page.waitForTimeout(500); await idle();
        }
        await look('Tasks after scoring');
        await tab('Stats');
        const pred = await page.locator('[data-k="predictions"] .pred-sub').textContent().catch(() => '');
        const m = /(\d+) of (\d+) predictions/.exec(pred || '');
        if (m && m[1] !== m[2]) note({ kind: 'prediction', what: `predictions missed Habitica: ${pred}` }, label);
      }
      for (const t of await page.evaluate(() => window.__snacks.splice(0))) {
        if (/\b(NaN|undefined|Infinity|null)\b|\[object /.test(t)) note({ kind: 'text', what: `a message says “${t.slice(0, 100)}”` }, label);
        snacks.add(t.replace(/\d+(\.\d+)?/g, '#'));
      }
      // random taps (seeded per run, so a finding replays): anything enabled on screen except links out of the app
      if (run.clock === 0 && TAPS) {
        let seed = [...label].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
        const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
        const trail = [];
        for (let i = 0; i < TAPS; i++) {
          const targets = await page.evaluate(() => {
            const all = [...document.querySelectorAll('#app button:not([disabled]), #app [role="button"], #app [role="checkbox"], #app [role="tab"], #app input[type="checkbox"], #app summary, #app .bottomnav button, .sheet.open button, .menu button')];
            return all.map((e, i) => { e.dataset.monkey = String(i); const r = e.getBoundingClientRect(); return { i, ok: r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight && !e.closest('a[target]'), t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 40) }; }).filter(x => x.ok);
          });
          if (!targets.length) { note({ kind: 'stuck', what: 'nothing to tap on screen' }, `${label} · after ${trail.slice(-3).join(' → ')}`); break; }
          const t = targets[Math.floor(rnd() * targets.length)];
          trail.push(t.t || `#${t.i}`);
          await page.locator(`[data-monkey="${t.i}"]`).first().click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(450);
          const where = `${label} · random taps: ${trail.slice(-4).join(' → ')}`;
          const appEmpty = await page.evaluate(() => !document.querySelector('#app')?.children.length || !document.querySelector('#app')?.textContent.trim());
          if (appEmpty) note({ kind: 'blank', what: 'the screen went blank' }, where);
          for (const f of await page.evaluate(inspect)) note(f, where);
          for (const e of errors.splice(0)) note({ kind: 'error', what: e }, where);
          const spinning = await page.evaluate(() => !!document.querySelector('.sync.spin'));
          if (spinning) { const done = await page.waitForFunction(() => !document.querySelector('.sync.spin'), null, { timeout: 25000 }).then(() => true, () => false); if (!done) note({ kind: 'stuck', what: 'still reading after 25 s' }, where); }
          screens += 1;
        }
      }
      // the menu
      const menu = page.locator('.appbar [data-k="menu"], .appbar button[aria-label*="enu"], .appbar button[aria-label*="options" i]').first();
      if (await menu.count()) { await menu.click().catch(() => {}); await page.waitForTimeout(300); await look('menu'); await page.keyboard.press('Escape'); }
      // things happening while the app is open, each followed by a read
      if (run.clock === 0 && run.mode === 'full' || run.scenario === 'warrior') {
        for (const ev of events) {
          const msg = await page.evaluate(n => window.__sim.event(n), ev).catch(e => `failed: ${e.message}`);
          await tab('Now');
          const sync = page.locator('.appbar [data-k="sync"]');
          if (await sync.count()) { await sync.click().catch(() => {}); await page.waitForTimeout(1500); }
          await look(`after “${ev}” (${msg})`);
          for (const t of ['Tasks', 'Stats']) { await tab(t); await look(`${t} after “${ev}”`); }
          // the account starts again for the next one
          if (/Token|refused|down|many/i.test(ev)) { await page.evaluate(() => window.__sim.call('POST', '/mock/fail', { clear: true })); }
        }
      }
    } catch (e) {
      note({ kind: 'stuck', what: `the sweep could not go on: ${e.message.split('\n')[0]}` }, label);
      await page.screenshot({ path: `${OUT.replace(/\.json$/, '')}-stuck-${run.scenario}-${run.mode}.png` }).catch(() => {});
    }
    await ctx.close();
    process.stdout.write(`${label}: ${findings.size} kinds of finding so far\n`);
    save();
  }
  // left open: the automatic reads keep Habitica's 30 s gap (the app reads about once a minute while on screen)
  if (process.env.SWEEP_IDLE !== '0' && (!ONLY || ONLY.includes('warrior'))) {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 800 } });
    await ctx.addInitScript(([uid, tok]) => {
      if (sessionStorage.getItem('swept')) return;
      sessionStorage.setItem('swept', '1');
      localStorage.setItem('sim:v1', JSON.stringify({ scenario: 'warrior' }));
      localStorage.setItem('critoracle:v2:creds', JSON.stringify({ userId: uid, apiToken: tok }));
      localStorage.setItem('critoracle:v2:settings', JSON.stringify({ mode: 'full', coach: { full: true, relaxed: true } }));
    }, [UID, TOKEN]);
    const page = await ctx.newPage();
    await page.goto(SIM); await page.waitForSelector('.bottomnav', { timeout: 20000 });
    await page.waitForTimeout(150_000);
    const reqs = await page.evaluate(() => window.__sim.requests.map(r => ({ at: r.at, what: `${r.method} ${r.path.split('?')[0]}` })));
    const reads = reqs.filter(r => r.what === 'GET /api/v3/user');
    const gaps = reads.slice(1).map((r, i) => r.at - reads[i].at);
    const short = gaps.filter(g => g < 30_000);
    if (short.length) note({ kind: 'traffic', what: `automatic reads less than 30 s apart: ${gaps.map(g => `${Math.round(g / 1000)} s`).join(', ')}` }, 'warrior, left open 150 s');
    if (reqs.length > 4 * (reads.length + 1)) note({ kind: 'traffic', what: `${reqs.length} requests in 150 s left alone` }, 'warrior, left open 150 s');
    console.log(`left open 150 s: ${reqs.length} requests, reads ${gaps.map(g => `${Math.round(g / 1000)} s`).join(', ')} apart`);
    await ctx.close();
  }
  await browser.close();
  const list = [...findings.values()].sort((a, b) => a.kind.localeCompare(b.kind) || b.count - a.count);
  fs.writeFileSync(OUT, JSON.stringify({ screens, runs: runs.length, findings: list, messages: [...snacks].sort(), avatarFiles: [...avatar].sort() }, null, 2));
  console.log(`\n${screens} screens in ${runs.length} runs, ${list.length} kinds of finding:`);
  for (const f of list) console.log(`- [${f.kind}] ${f.what}${f.text ? ` (“${f.text}”)` : ''} ×${f.count}\n    e.g. ${f.where[0]}`);
  process.exit(list.length ? 1 : 0);
})();
