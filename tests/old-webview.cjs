// The app on the oldest WebView an Android 9 phone can have (Chromium 67, before Google Play updates it) next to a current
// Chromium: both go through the same screens against tools/mock-server.mjs, neither may throw, and each screen must look the same.
//   (e2e build, mock and preview as for tests/e2e.cjs)  node --experimental-websocket tests/old-webview.cjs [out-dir]
// tools/e2e-local.sh runs it after tests/e2e.cjs; CI's e2e job too, and uploads the pictures.
// Both browsers are driven over the DevTools protocol directly (Playwright can't talk to a Chromium this old), with the same steps.
// OLD_CHROME: a Chromium 67 binary; without it the snapshot is downloaded once into ~/.cache/sidekick/.
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const APP = process.env.APP_URL || 'http://127.0.0.1:4173/';
const API = process.env.MOCK_URL || 'http://127.0.0.1:3001';
const OUT = process.argv[2] || 'old-webview';
const UID = '00000000-0000-4000-8000-000000000001';
const TOKEN = '00000000-0000-4000-8000-00000000c0de';
// Chromium snapshot 550430 is 67.0.3396.0, the WebView Android 9 shipped with on many phones
const SNAPSHOT = '550430';
const NEW_CHROME = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : chromium.executablePath());
// a screen "looks the same" when at most this share of its pixels differ (see compare): what's left after the one-pixel
// allowance is synthetic bold and image scaling, under 0.1%; a 4 px shift of a card, a grey checkbox or a lost gap is far above it
const MAX_DIFF = Number(process.env.MAX_DIFF || 0.002);
fs.mkdirSync(OUT, { recursive: true });

let failures = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`); if (!ok) failures++; };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function oldChrome () {
  if (process.env.OLD_CHROME) return process.env.OLD_CHROME;
  const dir = path.join(os.homedir(), '.cache', 'sidekick', `chromium-${SNAPSHOT}`);
  const exe = path.join(dir, 'chrome-linux', 'chrome');
  if (!fs.existsSync(exe)) {
    fs.mkdirSync(dir, { recursive: true });
    const zip = path.join(dir, 'chrome.zip');
    execFileSync('curl', ['-sSfL', '--retry', '3', '-o', zip, `https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${SNAPSHOT}/chrome-linux.zip`], { stdio: 'inherit' });
    execFileSync('unzip', ['-q', '-o', zip, '-d', dir], { stdio: 'inherit' });
    fs.unlinkSync(zip);
  }
  return exe;
}

/** One headless Chromium and its page, over the DevTools protocol. */
async function open (exe, label) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), `ow-${label}-`));
  // the same text rendering in both, whatever the machine's fontconfig says: GitHub's runners ask for subpixel (coloured) text,
  // which today's Chromium draws and Chromium 67 headless doesn't, so every letter edge would differ
  const fonts = path.join(profile, 'fonts.conf');
  fs.writeFileSync(fonts, `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include ignore_missing="yes">/etc/fonts/fonts.conf</include>
<match target="font"><edit name="antialias" mode="assign"><bool>true</bool></edit><edit name="rgba" mode="assign"><const>none</const></edit>
<edit name="hinting" mode="assign"><bool>false</bool></edit><edit name="hintstyle" mode="assign"><const>hintnone</const></edit></match></fontconfig>\n`);
  const proc = spawn(exe, ['--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--font-render-hinting=none', '--disable-lcd-text', '--force-color-profile=srgb',
    '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'], env: { ...process.env, FONTCONFIG_FILE: fonts } });
  const port = await new Promise((resolve, reject) => {
    let err = '';
    const t = setTimeout(() => reject(new Error(`${label}: no DevTools port\n${err}`)), 30000);
    proc.stderr.on('data', d => { err += d; const m = /DevTools listening on ws:\/\/[^:]+:(\d+)\//.exec(err); if (m) { clearTimeout(t); resolve(Number(m[1])); } });
  });
  let target;
  for (let i = 0; i < 50 && !target; i++) { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); if (!target) await sleep(100); }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
  let id = 0;
  const waiting = new Map();
  const errors = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && waiting.has(m.id)) { const w = waiting.get(m.id); waiting.delete(m.id); if (m.error) w.reject(new Error(`${label}: ${m.error.message}`)); else w.resolve(m.result); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  };
  // a call made while the page navigates can go unanswered: give up after 20 s rather than hang
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    id += 1; const n = id;
    const t = setTimeout(() => { waiting.delete(n); reject(new Error(`${label}: ${method} got no answer`)); }, 20000);
    waiting.set(n, { resolve: v => { clearTimeout(t); resolve(v); }, reject: e => { clearTimeout(t); reject(e); } });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true });
  // automatic re-reads off, as in tests/e2e.cjs; snackbars shorter. No service worker, as in the Android app (native.available skips it):
  // headless Chromium 67 crashes its page process once one registers.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__noAutoRead = true; window.__noDaySummary = true; window.__snackScale = 0.25; delete Navigator.prototype.serviceWorker;' });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${label}: ${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
    return r.result.value;
  };
  return {
    label, errors, send, evaluate,
    close: () => { try { ws.close(); } catch { /* gone */ } proc.kill(); },
  };
}

// the same steps on both browsers, side by side
const both = (pages, f) => Promise.all(pages.map(f));
const waitFor = async (p, sel, ms = 15000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await p.evaluate(`!!document.querySelector(${JSON.stringify(sel)})`).catch(() => false)) return; await sleep(200); }
  throw new Error(`${p.label}: ${sel} never appeared`);
};
const click = (p, sel) => p.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('no ' + ${JSON.stringify(sel)}); e.click(); })()`);
const fill = (p, sel, v) => p.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); e.focus(); e.value = ${JSON.stringify(v)}; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); e.blur(); })()`);

/** The whole page as one PNG: animations stopped, the Stable's moving canvas hidden (it never paints the same frame twice)
 * unless the screen's canvases are still pictures. The picker's sticky header is held in place (the page is at its top anyway):
 * today's Chromium sometimes draws that layer half a pixel off, smoothing its text and pictures. */
async function shot (p, canvas = false) {
  await p.evaluate(`(() => {
    let s = document.getElementById('__still');
    if (!s) { s = document.createElement('style'); s.id = '__still'; document.head.appendChild(s); }
    s.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; } .pk-top { position: relative !important; }${canvas ? '' : ' canvas { visibility: hidden !important; }'}';
    window.scrollTo(0, 0);
  })()`);
  await sleep(300);
  const h = Math.min(4000, await p.evaluate('Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)'));
  await p.send('Emulation.setDeviceMetricsOverride', { width: 412, height: h, deviceScaleFactor: 1, mobile: true });
  await sleep(300);
  const { data } = await p.send('Page.captureScreenshot', { format: 'png' });
  await p.send('Emulation.setDeviceMetricsOverride', { width: 412, height: 915, deviceScaleFactor: 1, mobile: true });
  await p.evaluate(`document.getElementById('__still').textContent = ''`);
  return { data, h };
}

(async () => {
  await fetch(`${API}/mock/reset?class=warrior&level=24`, { method: 'POST' });
  // pets and mounts (made up), so the Stable's row and picker have creature pictures to compare, and a ridden mount's saddle
  await fetch(`${API}/mock/set`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ items: {
    pets: { 'Wolf-Base': 5, 'Fox-Desert': 10, 'Owl-Base': 5, 'Dragon-Golden': 5, 'Cactus-Base': 5 },
    mounts: { 'Dragon-Red': true, 'Horse-Base': true }, currentPet: 'Wolf-Base', currentMount: 'Horse-Base',
    // eggs with more than one pet to hatch into, so the feeding card has an egg's full list to open
    hatchingPotions: { Base: 4, Red: 1, Golden: 1 },
  } }) });
  const pages = [await open(oldChrome(), 'chromium67'), await open(NEW_CHROME, 'current')];
  const versions = await both(pages, p => p.evaluate('navigator.userAgent.match(/Chrome\\/([\\d.]+)/)[1]'));
  console.log(`old: Chrome ${versions[0]} · current: Chrome ${versions[1]}`);
  check('the old browser really is the oldest Android 9 WebView (Chrome 67 or older)', Number(versions[0].split('.')[0]) <= 67, versions[0]);

  // a viewer for the comparisons: decodes both PNGs and counts differing pixels in a canvas
  const viewer = await chromium.launch({ executablePath: NEW_CHROME });
  const cmp = await viewer.newPage();
  const compare = (a, b) => cmp.evaluate(async ([a, b]) => {
    const load = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `data:image/png;base64,${src}`; });
    const [ia, ib] = await Promise.all([load(a), load(b)]);
    const w = Math.max(ia.width, ib.width), h = Math.max(ia.height, ib.height);
    const px = i => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.fillStyle = '#f0f'; g.fillRect(0, 0, w, h); g.drawImage(i, 0, 0); return g.getImageData(0, 0, w, h); };
    const da = px(ia), db = px(ib);
    const out = document.createElement('canvas'); out.width = w; out.height = h;
    const og = out.getContext('2d'); const od = og.createImageData(w, h);
    // a pixel differs when nothing within one pixel of it in the other picture has its colour: glyphs that land a subpixel apart
    // (Chromium 67 and today place text a little differently) don't count, a moved edge or a missing control does
    const near = (p, q, x, y) => {
      const k = (y * w + x) * 4;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = (yy * w + xx) * 4;
          if (Math.max(Math.abs(p[k] - q[j]), Math.abs(p[k + 1] - q[j + 1]), Math.abs(p[k + 2] - q[j + 2])) <= 48) return true;
        }
      }
      return false;
    };
    let diff = 0;
    for (let k = 0; k < da.data.length; k += 4) {
      const x = (k / 4) % w, y = Math.floor(k / 4 / w);
      const bad = !near(da.data, db.data, x, y) || !near(db.data, da.data, x, y);
      if (bad) diff++;
      const grey = (da.data[k] + da.data[k + 1] + da.data[k + 2]) / 3;
      od.data[k] = bad ? 255 : grey * 0.3 + 178; od.data[k + 1] = bad ? 0 : grey * 0.3 + 178; od.data[k + 2] = bad ? 0 : grey * 0.3 + 178; od.data[k + 3] = 255;
    }
    og.putImageData(od, 0, 0);
    return { ratio: diff / (w * h), ha: ia.height, hb: ib.height, png: out.toDataURL('image/png').split(',')[1] };
  }, [a, b]);

  const screen = async (name, step, { canvas = false } = {}) => {
    console.log(`… ${name}`);
    try { await step(); } catch (e) { check(`${name}: the steps run in both browsers`, false, e.message); return; }
    const [o, n] = await both(pages, p => shot(p, canvas));
    fs.writeFileSync(path.join(OUT, `${name}-chromium67.png`), Buffer.from(o.data, 'base64'));
    fs.writeFileSync(path.join(OUT, `${name}-current.png`), Buffer.from(n.data, 'base64'));
    const r = await compare(o.data, n.data);
    fs.writeFileSync(path.join(OUT, `${name}-diff.png`), Buffer.from(r.png, 'base64'));
    check(`${name}: looks the same in Chrome 67 as today`, r.ha === r.hb && r.ratio <= MAX_DIFF, `${(r.ratio * 100).toFixed(2)}% of pixels differ, height ${r.ha} vs ${r.hb}`);
    // Chrome 67 lays a <button> out as a block whatever its display: grid says (its children sit top-left): buttons centre with flex
    const grid = await pages[1].evaluate(`[...document.querySelectorAll('button')].filter(b => /grid/.test(getComputedStyle(b).display)).map(b => b.className || b.dataset.k).join()`);
    check(`${name}: no button is a grid container`, !grid, grid);
  };
  const tab = name => both(pages, async p => { await click(p, `.bottomnav button[aria-label="${name}"]`); await sleep(1500); });

  await both(pages, p => p.send('Page.navigate', { url: APP }));
  await both(pages, p => waitFor(p, '[data-k="intro-skip"]'));
  await sleep(1000);
  check('the app starts in both (not the "update WebView" page)', (await both(pages, p => p.evaluate('location.pathname.endsWith("webview-update.html")'))).every(x => !x));
  await screen('01-intro', async () => {});
  await screen('02-login', () => both(pages, async p => { await click(p, '[data-k="intro-skip"]'); await waitFor(p, '#uid'); }));
  await screen('03-mode-choice', () => both(pages, async p => {
    await fill(p, '#uid', UID); await fill(p, '#tok', TOKEN); await click(p, 'button[type=submit]'); await waitFor(p, '[data-k="choose-full"]');
  }));
  await both(pages, async p => { await click(p, '[data-k="choose-full"]'); await waitFor(p, '[data-k="coach-skip"]'); await sleep(400); });
  await screen('04-tips', async () => {});
  await screen('05-now', () => both(pages, async p => { await click(p, '[data-k="coach-skip"]'); await waitFor(p, '.appbar .headline'); await sleep(800); }));
  {
    // the character in the meadow talks the same way: typed out while it bobs, then the bubble's own words again
    const said = await both(pages, async p => {
      await p.evaluate('window.__talkScale = 0.1');
      await click(p, '.hero-stage .talker');
      await sleep(350);
      // sampled mid-line, outside the short stops after , . ! ? (the bob rests there), which a random line can put at any moment
      let mid = null;
      for (let i = 0; i < 20; i++) {
        mid = await p.evaluate(`(() => { const t = document.querySelector('.said .typed'), u = document.querySelector('.said .untyped'), w = document.querySelector('.talker'); return t && u ? [t.textContent.length, u.textContent.length, /\\bsay\\b/.test(w.className), getComputedStyle(w.firstElementChild).animationName, getComputedStyle(u).visibility, /\\bpause\\b/.test(w.className)] : null; })()`);
        if (!mid || !mid[5]) break;
        await sleep(15);
      }
      await waitFor(p, '.hero-stage .bubble .headline', 10000).catch(() => null);
      return { mid, back: await p.evaluate(`!!document.querySelector('.hero-stage .bubble .headline')`) };
    });
    for (const [i, r] of said.entries()) {
      const m = r.mid;
      check(`${pages[i].label}: tapping the character types a line while it bobs, then the bubble's words come back`, !!m && m[0] > 0 && m[1] > 0 && m[2] && m[3] === 'talk-bob' && m[4] === 'hidden' && r.back, JSON.stringify(r));
    }
  }
  await screen('06-tasks', () => tab('Tasks'));
  await screen('07-stats', () => tab('Stats'));
  await screen('07b-hatch-list', () => both(pages, async p => { await click(p, '[data-k="egg-Wolf"] summary'); await sleep(500); }));
  await screen('08-history', () => both(pages, async p => { await click(p, '[data-k="open-history"]'); await waitFor(p, '[data-k="streaks"]'); await sleep(500); }));
  await screen('09-stable', () => both(pages, async p => { await click(p, `.bottomnav button[aria-label="Stable"]`); await waitFor(p, '.stable-stage.mounted'); await sleep(2500); }));
  await screen('10-stable-full', () => both(pages, async p => { await click(p, '[data-k="stable-full"]'); await sleep(800); }));
  await both(pages, async p => { await click(p, '[data-k="stable-full"]'); await sleep(800); });
  await screen('13-stable-picker', () => both(pages, async p => {
    await click(p, '[data-k="pg-add"]'); await waitFor(p, '.pk-dialog.open');
    for (const id of ['Fox-Desert', 'Owl-Base', 'Dragon-Golden', 'Cactus-Base']) await click(p, `[data-k="pk-pet:${id}"]`);
    await sleep(1200);
  }));
  await screen('14-stable-row', () => both(pages, async p => {
    await click(p, '[data-k="pk-tab-mount"]'); await click(p, '[data-k="pk-mount:Dragon-Red"]'); await click(p, '[data-k="pk-save"]');
    await sleep(1500);
  }));
  await screen('11-settings', () => tab('Settings'));
  await screen('12-menu', () => both(pages, async p => { await click(p, '.appbar button[aria-label="Menu"]'); await sleep(400); }));
  // the screens above hide the playground's canvas: here every scene fully grown (all the trees, the ones standing among the
  // creatures included, the biggest stable, flowers, water), painted still at a fixed hour, season and moon
  await screen('15-scenes-grown', () => both(pages, async p => {
    await p.send('Page.navigate', { url: `${APP}scenes.html?gallery=1&days=420&perfect=64&streak=40&level=100&quests=20&tod=day&season=summer&moon=4&rain=0&rainbow=0&shower=0&feast=` });
    await waitFor(p, '#gallery canvas'); await sleep(2000);
  }), { canvas: true });

  // Try it without an account: Habitica's own game code running in the page (src/app/demo-account.ts) must work in Chrome 67 too
  await screen('16-demo-now', () => both(pages, async p => {
    await p.evaluate('localStorage.clear()');
    await p.send('Page.navigate', { url: APP });
    await waitFor(p, '[data-k="intro-skip"]'); await click(p, '[data-k="intro-skip"]');
    await waitFor(p, '[data-k="try-demo"]'); await click(p, '[data-k="try-demo"]');
    await waitFor(p, '[data-k="choose-full"]', 30000); await click(p, '[data-k="choose-full"]');
    await waitFor(p, '[data-k="coach-skip"]'); await click(p, '[data-k="coach-skip"]');
    await waitFor(p, '[data-k="demo-banner"]'); await waitFor(p, '.appbar .headline'); await sleep(800);
  }));
  {
    const scored = await both(pages, async p => {
      await click(p, '.bottomnav button[aria-label="Tasks"]'); await waitFor(p, '.li-title'); await sleep(500);
      await p.evaluate(`[...document.querySelectorAll('.li')].find(l => /Drink a glass of water/.test(l.textContent)).querySelector('.hbtn.plus').click()`);
      for (let i = 0; i < 40; i++) { const t = await p.evaluate(`[...document.querySelectorAll('.snack-text')].map(s => s.textContent).join(' ')`); if (/XP|Gold/.test(t)) return t; await sleep(250); }
      return '';
    });
    for (const [i, t] of scored.entries()) check(`${pages[i].label}: the made-up account scores a task with Habitica's code in the page`, /XP|Gold/.test(t), t);
  }

  const [oe, ne] = pages.map(p => p.errors);
  check('no errors in Chrome 67', oe.length === 0, oe.slice(0, 3).join(' || '));
  check('no errors today', ne.length === 0, ne.slice(0, 3).join(' || '));
  pages.forEach(p => p.close());
  await viewer.close();
  console.log(failures ? `\n${failures} check(s) failed (pictures in ${OUT}/)` : '\nold WebView: OK');
  process.exit(failures ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
