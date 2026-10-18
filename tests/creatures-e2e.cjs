// The Stable creatures in a real browser, on their development page (creatures.html, test builds only): a herd
// of every gait moving at 30 fps, a tap that pets (heart drawn, haptic asked), press-hold-drag-drop that lands
// and saves its spot, a flicked ball that rolls, species' own ways (a ferret's dance, an octopus's ink, a dog
// fetching), and the still picture under reduced motion (no loop; a tap
// still shows a heart and redraws). Called from tests/e2e.cjs with its browser; also runs alone:
// node tests/creatures-e2e.cjs [shots]
const fs = require('fs');

async function creatureChecks (browser, { APP, SHOTS, check }) {
  const URL_ = new URL('creatures.html', APP).href;
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
  /** CSS point of world pixel (x, y) */
  const css = (page, x, y) => page.evaluate(([x, y]) => {
    const { stage } = window.__pg; const f = stage.fit; const r = stage.canvas.getBoundingClientRect();
    return { x: r.left + (f.offX + (x + 0.5) * f.scale) * r.width / f.backW, y: r.top + (f.offY + (y + 0.5) * f.scale) * r.height / f.backH };
  }, [x, y]);
  /** a painted pixel of a creature, in world pixels */
  const on = (page, id) => page.evaluate(id => {
    const { world } = window.__pg; const c = world.byId(id);
    for (let y = c.y - 4; y > c.y - 90; y -= 3) for (let x = c.x - 30; x < c.x + 30; x += 3) if (c.hit(x, y, world) && world.hitTest(x, y) === c) return { x, y };
    return null;
  }, id);
  const log = page => page.evaluate(() => window.__pg.log.slice());
  const wait = (page, ms) => page.waitForTimeout(ms);

  // ---- moving herd
  {
    const { ctx, page } = await open('?seed=e2e&n=10&still=0&hour=12');
    await wait(page, 1500);
    const a = await page.evaluate(() => window.__pg.herd.creatures.map(c => [c.x, c.y]));
    await wait(page, 1500);
    const b = await page.evaluate(() => ({ pos: window.__pg.herd.creatures.map(c => [c.x, c.y]), grid: window.__pg.herd.creatures.every(c => c.x % 3 === 0 && c.y % 3 === 0), running: window.__pg.stage.running }));
    check('creatures: the herd wanders', b.running && b.pos.some((p, i) => p[0] !== a[i][0] || p[1] !== a[i][1]));
    check('creatures: they stand on whole art pixels', b.grid);
    await page.screenshot({ path: `${SHOTS}/creatures.png` });

    // freeze one in place for touch: tell it to rest
    await page.evaluate(() => { for (const c of window.__pg.herd.creatures) c.idle(99999); });
    await wait(page, 100);
    const p = await on(page, 'c0');
    const pt = await css(page, p.x, p.y);
    await page.touchscreen.tap(pt.x, pt.y);
    await wait(page, 120);
    const pet = await page.evaluate(() => ({ hearts: window.__pg.herd.particles.filter(q => q.kind === 'heart').length, st: window.__pg.herd.byId('c0').st }));
    check('creatures: a tap pets it (heart, happy hop, haptic)', pet.hearts === 1 && pet.st === 'happy' && (await log(page)).includes('haptic'), JSON.stringify(pet));
    await wait(page, 1500);

    const q = await on(page, 'c2');
    const s = await css(page, q.x, q.y);
    await page.mouse.move(s.x, s.y); await page.mouse.down();
    await wait(page, 600);
    const held = await page.evaluate(() => window.__pg.herd.byId('c2').st);
    await page.mouse.move(s.x + 40, s.y + 30, { steps: 5 }); await page.mouse.up();
    await wait(page, 1200);
    const after = await page.evaluate(() => window.__pg.herd.byId('c2').st);
    check('creatures: press and hold lifts it, a drag carries it, it lands and its spot is saved', held === 'held' && after === 'idle' && (await log(page)).some(t => t.startsWith('moved c2 ')), JSON.stringify([held, after, await log(page)]));

    // flick the ball
    const ball = await page.evaluate(() => { const b = window.__pg.herd.ball; return { x: b.x, y: b.y - 10, fx: b.fx }; });
    const bs = await css(page, ball.x, ball.y);
    await page.mouse.move(bs.x, bs.y); await page.mouse.down();
    await page.mouse.move(bs.x - 60, bs.y - 10, { steps: 3 }); await page.mouse.up();
    await wait(page, 600);
    const rolled = await page.evaluate(() => window.__pg.herd.ball.fx);
    check('creatures: a flick sends the ball rolling', Math.abs(rolled - ball.fx) > 30, JSON.stringify([ball.fx, rolled]));
    await ctx.close();
  }

  // ---- species (package B, src/playground/behaviours/touch.ts and balls.ts): a tap's own reaction, ink on a
  // pick-up, a dog fetching the flicked ball
  {
    const { ctx, page } = await open('?seed=e2e&n=2&still=0&hour=11&species=Ferret,Octopus');
    await page.evaluate(() => { for (const c of window.__pg.herd.creatures) c.idle(9999); });
    const f = await on(page, 'c0');
    const fp = await css(page, f.x, f.y);
    await page.touchscreen.tap(fp.x, fp.y);
    await wait(page, 100);
    const dance = await page.evaluate(() => { const c = window.__pg.herd.byId('c0'); return { st: c.st, act: c.act && c.act.a.id, hearts: c.hearts }; });
    check('creatures: a tap on a ferret starts its war dance (and a heart)', dance.st === 'act' && dance.act === 'tap' && dance.hearts === 1, JSON.stringify(dance));
    const o = await on(page, 'c1');
    const op = await css(page, o.x, o.y);
    await page.mouse.move(op.x, op.y); await page.mouse.down(); await wait(page, 700);
    const ink = await page.evaluate(() => ({ st: window.__pg.herd.byId('c1').st, ink: window.__pg.herd.particles.filter(p => p.kind === 'ink').length }));
    await page.mouse.up();
    check('creatures: picking up an octopus leaves a puff of ink', ink.st === 'held' && ink.ink === 2, JSON.stringify(ink));
    await page.screenshot({ path: `${SHOTS}/creatures-species.png` });
    await ctx.close();
  }
  {
    const { ctx, page } = await open('?seed=e2e&n=1&still=0&hour=11&species=Dog');
    await page.evaluate(() => {
      const { herd } = window.__pg, b = herd.ball, d = herd.byId('c0');
      d.setPos(b.fx + 60, b.fy); d.tx = d.fx; d.ty = d.fy; d.idle(20);
    });
    const ball = await page.evaluate(() => { const b = window.__pg.herd.ball; return { x: b.x, y: b.y - 6 }; });
    const bs = await css(page, ball.x, ball.y);
    await page.touchscreen.tap(bs.x, bs.y);
    let carried = false;
    for (let i = 0; i < 60 && !carried; i++) {
      await wait(page, 100);
      carried = await page.evaluate(() => window.__pg.herd.byId('c0').busy === 'ball' && window.__pg.herd.ball.held);
    }
    check('creatures: a dog catches the flicked ball and carries it back', carried);
    await ctx.close();
  }

  // ---- reduced motion: a still diorama, feedback still shows
  {
    const { ctx, page } = await open('?seed=e2e&n=6', { reducedMotion: 'reduce' });
    await wait(page, 600);
    const s0 = await page.evaluate(() => ({ ...window.__pg.stage.stats, running: window.__pg.stage.running }));
    check('creatures: reduced motion shows a still picture', !s0.running && s0.ticks === 0, JSON.stringify(s0));
    const p = await on(page, 'c1');
    const pt = await css(page, p.x, p.y);
    await page.touchscreen.tap(pt.x, pt.y);
    await wait(page, 150);
    const s1 = await page.evaluate(() => ({ frames: window.__pg.stage.stats.frames, hearts: window.__pg.herd.particles.length, st: window.__pg.herd.byId('c1').st }));
    check('creatures: a tap in the still picture shows a heart, no hop', s1.hearts === 1 && s1.st === 'idle' && s1.frames > s0.frames, JSON.stringify(s1));
    await wait(page, 1400);
    check('creatures: the heart goes after 1.2 s', await page.evaluate(() => window.__pg.herd.particles.length === 0));
    await page.screenshot({ path: `${SHOTS}/creatures-still.png` });
    await ctx.close();
  }

  check('creatures: no page errors', errors.length === 0, errors.slice(0, 5).join(' || '));
}

module.exports = { creatureChecks };

if (require.main === module) {
  const { chromium } = require('playwright');
  const CHROMIUM = process.env.CHROMIUM || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
  const SHOTS = process.argv[2] || 'screenshots';
  fs.mkdirSync(SHOTS, { recursive: true });
  let failures = 0;
  const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  ${extra}` : ''}`); if (!ok) failures++; };
  (async () => {
    const browser = await chromium.launch({ executablePath: CHROMIUM });
    await creatureChecks(browser, { APP: process.env.APP_URL || 'http://127.0.0.1:4173/', SHOTS, check });
    await browser.close();
    process.exit(failures ? 1 : 0);
  })().catch(e => { console.error(e); process.exit(1); });
}
