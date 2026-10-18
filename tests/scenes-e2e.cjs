// The Stable's scenes in a real browser, on their development page (scenes.html, test builds only): every
// scene paints on the 3 x 3 art grid at a fractional-DPR phone's whole-number scale, the still scene is
// painted once and reused every frame, the lake and the sea open water above the walking ground, the bars' insets repaint it, the ball can be flicked and settles,
// weather holds still under reduced motion, Habitica's feast days decorate it, and the gallery shows all seven.
// Called from tests/e2e.cjs with its browser; also runs alone: node tests/scenes-e2e.cjs [shots]
const fs = require('fs');

const SCENES = ['meadow', 'lake', 'pine', 'cove', 'bamboo', 'marsh', 'mushroom'];

async function scenesChecks (browser, { APP, SHOTS, check }) {
  const URL_ = new URL('scenes.html', APP).href;
  const errors = [];
  const open = async (query, opts = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true, ...opts });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`pageerror: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    page.on('response', r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });
    await page.goto(URL_ + query);
    await page.waitForFunction(() => window.__scenes && (window.__scenes.stage ? window.__scenes.stage.stats.frames > 0 : window.__scenes.tiles.every(t => t.stage.stats.frames > 0)));
    return { ctx, page };
  };
  const stats = page => page.evaluate(() => ({ ...window.__scenes.stage.stats, running: window.__scenes.stage.running, still: window.__scenes.stage.still, fit: window.__scenes.stage.fit, paints: window.__scenes.layer.paints }));
  const wait = (page, ms) => page.waitForTimeout(ms);
  /** art pixels (3 x 3 world pixels) whose device pixels are not all one colour, sampled */
  const offGrid = page => page.evaluate(() => {
    const { stage } = window.__scenes; const f = stage.fit, A = 3 * f.scale;
    const d = stage.canvas.getContext('2d').getImageData(0, 0, f.backW, f.backH).data;
    let bad = 0, n = 0;
    for (let ay = 0; ay + 1 < f.viewH / 3; ay += 2) for (let ax = 0; ax + 1 < f.viewW / 3; ax += 2) {
      n++;
      const x0 = f.offX + ax * A, y0 = f.offY + ay * A, i0 = (y0 * f.backW + x0) * 4;
      outer: for (let y = y0; y < y0 + A; y++) for (let x = x0; x < x0 + A; x++) {
        const i = (y * f.backW + x) * 4;
        if (d[i] !== d[i0] || d[i + 1] !== d[i0 + 1] || d[i + 2] !== d[i0 + 2]) { bad++; break outer; }
      }
    }
    return { bad, n };
  });
  const colours = page => page.evaluate(() => { const c = window.__scenes.stage.canvas; const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 37) seen.add(d[i] * 65536 + d[i + 1] * 256 + d[i + 2]); return seen.size; });

  // ---- each scene, still, without the ball or weather: our art is whole 3 x 3 blocks
  const looks = [];
  for (const scene of SCENES) {
    const { ctx, page } = await open(`?scene=${scene}&tod=day&season=summer&still=1&ball=0`);
    await wait(page, 200);
    const g = await offGrid(page);
    check(`scenes: ${scene} is painted in whole art pixels`, g.n > 1000 && g.bad === 0, JSON.stringify(g));
    const n = await colours(page);
    check(`scenes: ${scene} is painted (sky, horizon, ground, stable)`, n >= 12, `${n} colours`);
    if (scene === 'lake' || scene === 'cove') {
      const water = await page.evaluate(() => { const p = window.__scenes; return { strips: p.layer.spots(p.world).filter(s => s.kind === 'water' && s.strip).map(s => [s.x, s.y, s.w]), top: p.herd.band.top }; });
      check(`scenes: ${scene} has open water above the walking ground for swimmers`, water.strips.length > 0 && water.strips.every(s => s[1] < water.top && s[2] >= 24), JSON.stringify(water));
    }
    looks.push(await page.evaluate(() => window.__scenes.stage.canvas.toDataURL().length));
    await page.screenshot({ path: `${SHOTS}/scene-${scene}.png` });
    await ctx.close();
  }
  check('scenes: the seven look different', new Set(looks).size === SCENES.length);

  // ---- running: the still scene is painted once; the bars repaint it; the ball flies and settles
  {
    const { ctx, page } = await open('?scene=meadow&tod=day&season=autumn&still=0');
    const a = await stats(page); await wait(page, 1200); const b = await stats(page);
    check('scenes: running at most 30 frames a second', b.running && (b.frames - a.frames) / 1.2 <= 33, JSON.stringify([a.frames, b.frames]));
    check('scenes: the still scene is painted once, not every frame', b.paints === a.paints && b.paints <= 2, JSON.stringify([a.paints, b.paints]));
    const h0 = await page.evaluate(() => window.__scenes.layer.horizon(window.__scenes.world));
    await page.evaluate(() => window.__scenes.stage.setInsets({ top: 56, bottom: 0 }));
    await wait(page, 150);
    const after = await page.evaluate(() => ({ h: window.__scenes.layer.horizon(window.__scenes.world), paints: window.__scenes.layer.paints, band: window.__scenes.layer.walk(window.__scenes.world), insets: window.__scenes.world.insets }));
    check('scenes: the app bar covering the top repaints the scene with a lower horizon', after.h > h0 && after.paints === b.paints + 1 && after.band.top > after.insets.top, JSON.stringify({ h0, ...after }));

    // flick the ball (the creatures' Herd ball, 21 world px, feet at ball.y): press on it, swipe, let go
    const p = await page.evaluate(() => {
      const { stage, ball } = window.__scenes;
      const f = stage.fit, r = stage.canvas.getBoundingClientRect();
      const x = ball.x, y = ball.y - 11;
      return { x: r.left + (f.offX + (x + 0.5) * f.scale) * r.width / f.backW, y: r.top + (f.offY + (y + 0.5) * f.scale) * r.height / f.backH, start: { x: ball.x, y: ball.y } };
    });
    await page.mouse.move(p.x, p.y); await page.mouse.down();
    await page.mouse.move(p.x + 40, p.y - 10, { steps: 2 }); await page.mouse.move(p.x + 90, p.y - 20, { steps: 2 }); await page.mouse.up();
    await wait(page, 120);
    const fly = await page.evaluate(() => ({ moving: window.__scenes.ball.moving, z: window.__scenes.ball.z }));
    check('scenes: a flick throws the ball', fly.moving, JSON.stringify(fly));
    await page.waitForFunction(() => !window.__scenes.ball.moving, null, { timeout: 8000 }).catch(() => {});
    const rest = await page.evaluate(() => { const { ball, layer, world } = window.__scenes; const b = layer.walk(world); return { x: ball.x, y: ball.y, moving: ball.moving, b, w: world.w }; });
    check('scenes: the ball settles inside the walking band, away from where it was', !rest.moving && rest.x !== p.start.x && rest.y >= rest.b.top && rest.y <= rest.b.bottom + 2 && rest.x >= 0 && rest.x <= rest.w, JSON.stringify(rest));
    await page.screenshot({ path: `${SHOTS}/scene-meadow-autumn.png` });
    await ctx.close();
  }

  // ---- reduced motion: one still picture; snow lies still; a flick leaves the ball where it is put
  {
    const { ctx, page } = await open('?scene=pine&tod=night&season=winter&level=50&streak=21', { reducedMotion: 'reduce' });
    await wait(page, 800);
    const s = await stats(page);
    check('scenes: reduced motion shows one still picture', s.still && !s.running && s.ticks === 0 && s.frames <= 3, JSON.stringify(s));
    const shot1 = await page.evaluate(() => window.__scenes.stage.canvas.toDataURL());
    await wait(page, 500);
    check('scenes: under reduced motion the snow holds still', shot1 === await page.evaluate(() => window.__scenes.stage.canvas.toDataURL()));
    await page.screenshot({ path: `${SHOTS}/scene-pine-winter-night.png` });
    await ctx.close();
  }

  // ---- Habitica's feast days: each decorates the still scene, on the grid; New Year's fireworks after dark; on Naming Day
  // every name shows; the joke pets of April Fools load from the app like any other sheet
  {
    const base = '&tod=day&season=autumn&still=1&ball=0&days=40&level=12';
    const plain = await open(`?scene=meadow${base}`);
    await wait(plain.page, 200);
    const before = await plain.page.evaluate(() => window.__scenes.stage.canvas.toDataURL());
    await plain.ctx.close();
    for (const feast of ['birthday', 'habitoween', 'harvestFeast', 'anniversary']) {
      const { ctx, page } = await open(`?scene=meadow${base}&feast=${feast}&years=3`);
      await wait(page, 200);
      const g = await offGrid(page);
      check(`scenes: ${feast} decorates the meadow, in whole art pixels`, g.bad === 0 && before !== await page.evaluate(() => window.__scenes.stage.canvas.toDataURL()), JSON.stringify(g));
      await page.screenshot({ path: `${SHOTS}/scene-feast-${feast}.png` });
      await ctx.close();
    }
    const night = await open('?scene=pine&tod=night&season=winter&still=1&ball=0&feast=nye');
    await wait(night.page, 200);
    check('scenes: New Year\'s fireworks after dark', (await offGrid(night.page)).bad === 0);
    await night.page.screenshot({ path: `${SHOTS}/scene-feast-nye-night.png` });
    await night.ctx.close();
    // the rockets themselves: only when allowed to move, and only after dusk; they draw something in the sky
    const rockets = await open('?scene=pine&tod=night&season=summer&still=0&ball=0&feast=nye');
    await wait(rockets.page, 300);
    const fw = await rockets.page.evaluate(async () => {
      const { world, fireworks, stage } = window.__scenes, lit = [];
      for (let i = 0; i < 8; i++) {
        const c = document.createElement('canvas'); c.width = stage.canvas.width; c.height = stage.canvas.height;
        fireworks.draw(c.getContext('2d'), world);
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let n = 0; for (let k = 3; k < d.length; k += 4) if (d[k]) n++;
        lit.push(n);
        await new Promise(r => setTimeout(r, 150));
      }
      return { showing: fireworks.showing, lit };
    });
    check('scenes: New Year\'s rockets rise and burst in the night sky when the scene moves', fw.showing && fw.lit.some(n => n > 0) && new Set(fw.lit).size > 1, JSON.stringify(fw));
    await rockets.ctx.close();
    const noon = await open('?scene=pine&tod=day&season=summer&still=0&ball=0&feast=nye');
    check('scenes: no rockets by day', !(await noon.page.evaluate(() => window.__scenes.fireworks.showing)));
    await noon.ctx.close();
    // Valentine's: two of a kind standing close send up hearts, two of different kinds don't
    const love = await open('?scene=meadow&tod=day&season=spring&still=0&ball=0&feast=valentines&pets=Wolf-Base,Wolf-Red,Fox-Base');
    await love.page.waitForFunction(() => window.__scenes.herd.creatures.length === 3);
    const pairs = await love.page.evaluate(() => {
      const { herd, hearts, world } = window.__scenes, [a, b, c] = herd.creatures;
      // noon on the herd's clock: sleepers send no hearts, and CI runs in UTC at any hour
      herd.o.clock = () => new Date(2026, 1, 14, 12); world.step(); world.step();
      const at = (cr, x) => cr.setPos(x, a.fy);
      at(b, a.fx + 30); at(c, a.fx + 3000);
      const near = hearts.pairs().map(p => p.map(x => x.id).join('+'));
      at(c, a.fx + 15);
      const fox = hearts.pairs().map(p => p.map(x => x.id).join('+'));
      return { near, fox };
    });
    check('scenes: on Valentine\'s two close Wolves send up hearts, a Fox beside them doesn\'t', pairs.near.join() === 'c0+c1' && pairs.fox.join() === 'c0+c1', JSON.stringify(pairs));
    await love.ctx.close();
    const fools = await open('?scene=meadow&tod=day&season=spring&still=1&ball=0&tags=1&feast=namingDay&pets=Wolf-Veggie,BearCub-Veggie,Dragon-Veggie,mount:Horse-Base');
    await fools.page.waitForFunction(() => window.__scenes.herd.creatures.length === 4);
    await wait(fools.page, 200);
    const shown = await fools.page.evaluate(() => window.__scenes.world.layers.find(l => l.id === 'name-tags')?.showing().length);
    check('scenes: April Fools\' joke pets load from the app, and every name shows on Naming Day', shown === 4, String(shown));
    await fools.page.screenshot({ path: `${SHOTS}/scene-feast-fools-naming.png` });
    await fools.ctx.close();
  }

  // ---- the gallery: every scene side by side
  {
    const { ctx, page } = await open('?gallery=1&tod=day&season=summer', { viewport: { width: 900, height: 760 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
    const n = await page.evaluate(() => window.__scenes.tiles.filter(t => t.stage.stats.frames > 0).length);
    check('scenes: the gallery shows all seven', n === SCENES.length, `${n}`);
    await page.screenshot({ path: `${SHOTS}/scenes-gallery.png`, fullPage: true });
    await ctx.close();
  }

  check('scenes: no page errors', errors.length === 0, errors.slice(0, 5).join(' || '));
}

module.exports = { scenesChecks };

if (require.main === module) {
  const { chromium } = require('playwright');
  const CHROMIUM = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const SHOTS = process.argv[2] || 'screenshots';
  fs.mkdirSync(SHOTS, { recursive: true });
  let failures = 0;
  const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`); if (!ok) failures++; };
  (async () => {
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    await scenesChecks(browser, { APP: process.env.APP_URL || 'http://127.0.0.1:4173/', SHOTS, check });
    await browser.close();
    process.exit(failures ? 1 : 0);
  })().catch(e => { console.error(e); process.exit(1); });
}
