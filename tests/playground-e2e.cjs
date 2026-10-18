// The playground engine in a real browser, on its development page (playground.html, test builds only):
// whole-number pixel scaling on a fractional-DPR phone, show/hide and bar insets from the Stable screen, the 30 fps cap, stopping when hidden or scrolled away,
// the still picture under reduced motion, tap / long-press / drag hit-testing, resizing and teardown.
// Called from tests/e2e.cjs with its browser; also runs alone: node tests/playground-e2e.cjs [shots]
const fs = require('fs');

async function playgroundChecks (browser, { APP, SHOTS, check }) {
  const URL_ = new URL('playground.html', APP).href;
  const errors = [];
  const open = async (query, opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, ...opts });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(URL_ + query);
    await page.waitForFunction(() => window.__pg && window.__pg.stage.stats.frames > 0);
    return { ctx, page };
  };
  const stats = page => page.evaluate(() => ({ ...window.__pg.stage.stats, running: window.__pg.stage.running, still: window.__pg.stage.still, fit: window.__pg.stage.fit }));
  /** CSS point over the first painted pixel of an entity (from its box and mask) */
  const over = (page, id) => page.evaluate(id => {
    const { stage, world } = window.__pg; const e = world.byId(id); const s = world.sprites.get(e.sprite); const b = world.box(e, s);
    const f = stage.fit; const r = stage.canvas.getBoundingClientRect();
    let px = null;
    for (let y = s.h - 1; y >= 0 && !px; y--) for (let x = 0; x < s.w && !px; x++) if (!s.mask || s.mask[y * s.w + (e.flip ? s.w - 1 - x : x)]) px = { x: b.x + x, y: b.y + y };
    // the centre of that world pixel, in CSS pixels
    return { x: r.left + (f.offX + (px.x + 0.5) * f.scale) * r.width / f.backW, y: r.top + (f.offY + (px.y + 0.5) * f.scale) * r.height / f.backH, art: px };
  }, id);
  const log = page => page.evaluate(() => window.__pg.log.slice());
  const wait = (page, ms) => page.waitForTimeout(ms);

  // ---- moving scene
  {
    const { ctx, page } = await open('?seed=e2e&n=10&still=0');
    const s0 = await stats(page);
    const f = s0.fit;
    check('playground: backing store is the exact device-pixel size (412 x 915 at 2.625)', f.backW === Math.round(412 * 2.625) && f.backH === Math.round(915 * 2.625), JSON.stringify(f));
    check('playground: whole-number scale, at least the minimum world', Number.isInteger(f.scale) && f.viewW >= 480 && f.viewH >= 640, JSON.stringify(f));
    // every world pixel is a uniform scale x scale block of device pixels: nothing smoothed, nothing half-drawn
    const blocks = await page.evaluate(() => {
      const { stage } = window.__pg; const f = stage.fit;
      const d = stage.canvas.getContext('2d').getImageData(0, 0, f.backW, f.backH).data;
      let bad = 0, n = 0;
      for (let ay = 0; ay < f.viewH; ay += 5) for (let ax = 0; ax < f.viewW; ax += 5) {
        n++;
        const x0 = f.offX + ax * f.scale, y0 = f.offY + ay * f.scale, i0 = (y0 * f.backW + x0) * 4;
        for (let y = y0; y < y0 + f.scale; y++) for (let x = x0; x < x0 + f.scale; x++) {
          const i = (y * f.backW + x) * 4;
          if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1] || d[i + 2] !== d[i0 + 2]) { bad++; y = Infinity; break; }
        }
      }
      return { bad, n };
    });
    check('playground: every world pixel is a crisp block of device pixels', blocks.n > 1000 && blocks.bad === 0, JSON.stringify(blocks));
    const a = await stats(page); await wait(page, 2000); const b = await stats(page);
    const fps = (b.frames - a.frames) / 2, tps = (b.ticks - a.ticks) / 2;
    check('playground: draws at most 30 frames a second', fps <= 33 && fps >= 20, `${fps} fps, ${tps} ticks/s`);
    check('playground: steps 30 ticks a second', tps >= 27 && tps <= 33, `${tps} ticks/s`);
    const moved = await page.evaluate(() => window.__pg.world.entities.some(e => e.x !== e.tx || e.y !== e.ty));
    check('playground: creatures move', b.running && moved);
    await page.screenshot({ path: `${SHOTS}/playground-engine.png` });

    // hidden (screen off, app in the background): the loop stops and nothing draws
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    const h0 = await stats(page); await wait(page, 600); const h1 = await stats(page);
    check('playground: hidden page stops the loop', !h1.running && h1.frames === h0.frames, JSON.stringify([h0.frames, h1.frames]));
    await page.evaluate(() => { delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
    await wait(page, 300);
    const h2 = await stats(page);
    check('playground: visible again restarts it without catching up the time away', h2.running && h2.frames > h1.frames && h2.ticks - h1.ticks <= 15, JSON.stringify([h1.ticks, h2.ticks]));

    // the Stable screen hides it (another tab, phone locked) and shows it again
    await page.evaluate(() => window.__pg.stage.setShown(false));
    const s0b = await stats(page); await wait(page, 500); const s1b = await stats(page);
    check('playground: hidden by its screen, the loop stops', !s1b.running && s1b.frames === s0b.frames);
    await page.evaluate(() => window.__pg.stage.setShown(true));
    await wait(page, 200);
    check('playground: shown again, it runs', (await stats(page)).running);
    // the app bar and nav cover the top and bottom: insets in world pixels, rounded out
    const ins = await page.evaluate(() => { window.__pg.stage.setInsets({ top: 56, bottom: 56 }); return { ...window.__pg.world.insets, scale: window.__pg.stage.fit.scale }; });
    check('playground: bar insets reach the world in world pixels', ins.top === Math.ceil(56 * 2.625 / ins.scale) && ins.bottom === ins.top, JSON.stringify(ins));

    // scrolled out of view
    await page.evaluate(() => { document.getElementById('pg').style.top = '5000px'; });
    await wait(page, 300);
    const o0 = await stats(page); await wait(page, 500); const o1 = await stats(page);
    check('playground: off screen stops the loop', !o1.running && o1.frames === o0.frames);
    await page.evaluate(() => { document.getElementById('pg').style.top = '0'; });
    await wait(page, 300);
    check('playground: back on screen runs again', (await stats(page)).running);

    // a rotation / resize refits on whole pixels
    await page.setViewportSize({ width: 915, height: 412 });
    await wait(page, 300);
    const r = await stats(page);
    check('playground: resize refits on a whole-number scale', Number.isInteger(r.fit.scale) && r.fit.backW === Math.round(915 * 2.625) && r.fit.viewH >= 640 && r.fit.viewW >= 480 && await page.evaluate(() => window.__pg.world.w === window.__pg.stage.fit.viewW), JSON.stringify(r.fit));

    // teardown
    await page.evaluate(() => window.__pg.stage.destroy());
    const d0 = await stats(page); await wait(page, 300); const d1 = await stats(page);
    check('playground: destroy stops drawing and removes the canvas', !d1.running && d1.frames === d0.frames && await page.locator('canvas').count() === 0);
    await ctx.close();
  }

  // ---- reduced motion: a still picture; touch still works
  {
    const { ctx, page } = await open('?seed=e2e&n=5', { reducedMotion: 'reduce' });
    await wait(page, 1000);
    const s = await stats(page);
    check('playground: reduced motion shows a still picture (no loop, no ticks)', s.still && !s.running && s.ticks === 0 && s.frames >= 1 && s.frames <= 3, JSON.stringify(s));
    const painted = await page.evaluate(() => { const c = window.__pg.stage.canvas; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 97) seen.add(d[i] * 65536 + d[i + 1] * 256 + d[i + 2]); return seen.size; });
    check('playground: the still picture is drawn (sky, ground and creatures)', painted >= 4, `${painted} colours`);
    await page.screenshot({ path: `${SHOTS}/playground-engine-still.png` });

    // tap a creature on its painted pixels, then the empty ground
    const p = await over(page, 'c0');
    await page.touchscreen.tap(p.x, p.y);
    await wait(page, 150);
    const l1 = await log(page);
    check('playground: tapping a creature hits it', l1.some(t => t.startsWith('tap c0 ')), `${l1.join(' | ')} @ ${JSON.stringify(p.art)}`);
    const s2 = await stats(page);
    check('playground: a tap in the still picture redraws once', s2.frames > s.frames && !s2.running, JSON.stringify([s.frames, s2.frames]));
    const empty = await page.evaluate(() => { const { world, stage } = window.__pg; const f = stage.fit; const r = stage.canvas.getBoundingClientRect();
      for (let y = 2; y < world.h; y += 9) for (let x = 2; x < world.w; x += 9) if (!world.hitTest(x, y)) return { x: r.left + (f.offX + (x + 0.5) * f.scale) * r.width / f.backW, y: r.top + (f.offY + (y + 0.5) * f.scale) * r.height / f.backH }; });
    await page.touchscreen.tap(empty.x, empty.y);
    await wait(page, 150);
    check('playground: tapping empty ground hits nothing', (await log(page)).some(t => t.startsWith('tap - ')));

    // long press lifts a creature, a drag carries it, release drops it
    const q = await over(page, 'c1');
    const before = await page.evaluate(() => { const e = window.__pg.world.byId('c1'); return { x: e.x, y: e.y }; });
    await page.mouse.move(q.x, q.y); await page.mouse.down();
    await wait(page, 600);
    await page.mouse.move(q.x + 60, q.y + 40, { steps: 5 }); await page.mouse.up();
    await wait(page, 150);
    const l2 = await log(page);
    const after = await page.evaluate(() => { const e = window.__pg.world.byId('c1'); return { x: e.x, y: e.y }; });
    check('playground: long press, drag and drop', l2.includes('long c1') && l2.includes('drop') && after.x > before.x && after.y > before.y, `${l2.join(' | ')} ${JSON.stringify([before, after])}`);
    check('playground: a long press is not also a tap', !l2.some(t => t.startsWith('tap c1')));
    await ctx.close();
  }

  // ---- Habitica's own sprites through src/stable/source.ts: sheets load, masks hit, and each creature mirrors only to walk the other way
  {
    const { ctx, page } = await open('?seed=e2e&n=5&still=0&sprites=real');
    await page.waitForFunction(() => { const s = window.__pg.world.sprites; return ['Wolf-Base', 'mount:Horse-Base', 'Wolf-Cerberus'].every(k => s.get(k) && s.get(k).mask); });
    await page.evaluate(() => window.__pg.world.sprites.load(['Owl-Base']));
    const sp = await page.evaluate(() => { const s = window.__pg.world.sprites.get('Wolf-Base'); return { w: s.w, h: s.h, ax: s.anchor.x, ay: s.anchor.y, gait: s.gait, painted: s.mask.reduce((a, b) => a + b, 0) }; });
    check('playground: real sprites load with a paint mask and a ground anchor', sp.painted > 100 && sp.painted < sp.w * sp.h && sp.ay === sp.h - 1 && sp.ax > 0 && sp.ax < sp.w && sp.gait === 'four-legged', JSON.stringify(sp));
    const mt = await page.evaluate(() => { const s = window.__pg.world.sprites; const b = s.get('mount:Horse-Base'), h = s.get('mount:Horse-Base#head'), o = s.get('Owl-Base');
      return { same: !!h && h.w === b.w && h.h === b.h && h.anchor.x === b.anchor.x && h.anchor.y === b.anchor.y, apart: !!h && b.mask.some((v, i) => v !== h.mask[i]), facing: b.facing, owl: o && [o.facing, o.nocturnal] }; });
    check('playground: a mount\'s head is its own sprite over the body\'s box, with facing and nocturnal passed on', mt.same && mt.apart && mt.facing === 'left' && JSON.stringify(mt.owl) === '["front",true]', JSON.stringify(mt));
    // sampled while walking (a resting creature has already picked its next spot but not turned yet)
    const dir = [];
    await wait(page, 4000);
    for (let i = 0; i < 12; i++) {
      await wait(page, 300);
      dir.push(...await page.evaluate(() => window.__pg.world.entities.filter(e => e.rest === 0 && !e.held).map(e => {
        const f = window.__pg.facing(e.sprite); const dx = e.tx - e.x;
        return { id: e.id, f, dx, flip: !!e.flip, ok: f === 'front' ? !e.flip : Math.abs(dx) <= 0.5 || e.flip === ((dx < 0) === (f === 'right')) };
      })));
    }
    check('playground: creatures walk head first (mirrored only against their drawn facing)', dir.length >= 10 && dir.every(d => d.ok) && dir.some(d => d.f === 'left') && dir.some(d => d.f === 'right'), `${dir.length} samples ${JSON.stringify(dir.filter(d => !d.ok))}`);
    // hold everyone still (the dev walkers rest), then tap c0 where its sprite has paint
    await page.evaluate(() => { for (const e of window.__pg.world.entities) { e.rest = 1e9; e.hop = 0; e.lift = 0; } });
    await wait(page, 100);
    const p = await over(page, 'c0');
    await page.touchscreen.tap(p.x, p.y);
    await wait(page, 150);
    const l = await log(page);
    check('playground: tapping a real sprite on its paint hits it', l.some(t => t.startsWith('tap c0 ')), `${l.join(' | ')} @ ${JSON.stringify(p.art)}`);
    await page.screenshot({ path: `${SHOTS}/playground-engine-real.png` });
    await ctx.close();
  }

  check('playground: no page errors', errors.length === 0, errors.slice(0, 5).join(' || '));
}

module.exports = { playgroundChecks };

if (require.main === module) {
  const { chromium } = require('playwright');
  const CHROMIUM = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const SHOTS = process.argv[2] || 'screenshots';
  fs.mkdirSync(SHOTS, { recursive: true });
  let failures = 0;
  const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`); if (!ok) failures++; };
  (async () => {
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    await playgroundChecks(browser, { APP: process.env.APP_URL || 'http://127.0.0.1:4173/', SHOTS, check });
    await browser.close();
    process.exit(failures ? 1 : 0);
  })().catch(e => { console.error(e); process.exit(1); });
}
