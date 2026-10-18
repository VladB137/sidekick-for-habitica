// e2e: Forcing a crit, the free gear swap, skills, Brutal Smash. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ API, SHOTS, cardTitle, check, idle, mark, mockLog, mockState, page, post, predictions, runFirstOption, score, snackAfter, sync, tab }) => {
  // ------------------------------------------------------------------ 1. make the next task crit, score, confirm the server's roll
  for (let round = 0; round < 4; round++) {
    await tab('Now');
    await page.waitForSelector('.card-title');
    const eqStart = JSON.stringify((await mockState()).user.items.gear.equipped);
    if ((await cardTitle()) === 'Make the next task crit') {
      // suggestions come free → cheap → costly: each option's tier tag never goes back up, and the first is the raised one
      const card = page.locator('main .card', { has: page.locator('.card-title', { hasText: 'Make the next task crit' }) });
      const more = card.locator('[data-k="more-ways"]');
      if (await more.count() && /Other ways/.test(await more.textContent())) { await more.click(); await page.waitForTimeout(100); }
      const heads = await card.locator('.opt .tag.tier').allTextContents();
      const order = ['Free', 'Cheap', 'Costs something', 'Last resort', 'If you’ve already done it', 'Only if it really happened'];
      const idx = heads.map(x => order.indexOf(x.trim()));
      const best = await card.locator('.opt').first().evaluate(o => o.classList.contains('best') && !!o.querySelector('.btn-raised'));
      check(`round ${round}: suggestions ordered free → cheap → costly, cheapest raised`, idx.every((v, i) => v >= 0 && (i === 0 || v >= idx[i - 1])) && best, heads.join(' | '));
      if (round === 0) await page.evaluate(() => { window.__revealed = false; new MutationObserver(() => { if (document.getElementById('app').classList.contains('revealing')) window.__revealed = true; }).observe(document.getElementById('app'), { attributes: true }); });
      const r = await runFirstOption();
      if (!r) { check(`round ${round}: a suggestion exists`, false); break; }
      if (round === 0) check('the bar turns amber with a circular reveal', await page.evaluate(() => window.__revealed));
      if (round === 0) await page.screenshot({ path: `${SHOTS}/03-after-plan.png` });
      check(`round ${round}: suggestion runs (${r.steps.slice(0, 70)}…)`, r.msg.includes('will crit'), r.msg);
    }
    const head = (await page.textContent('.appbar .headline')).trim();
    check(`round ${round}: app bar says CRIT before the tap`, head.startsWith('CRIT'), head);
    if (round === 0) {
      await tab('Tasks');
      const amber = await page.locator('.out.crit').count(), bestMarks = await page.locator('.out.crit.best').filter({ hasText: /^BEST · / }).count();
      check('crit waiting: amber chips on Tasks, one marked best', amber > 1 && bestMarks === 1, `${amber} amber, ${bestMarks} best`);
      await tab('Now');
    }
    if (round === 0) await page.screenshot({ path: `${SHOTS}/04-now-crit.png`, fullPage: true });
    if (round === 0) await page.evaluate(() => { window.__sparks = 0; new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('sparks')) window.__sparks++; }).observe(document.body, { childList: true }); });
    const snack = await score(['Take the stairs', 'Drink a glass of water', 'Stretch', 'Take the stairs'][round]);
    check(`round ${round}: Habitica (mock) rolled the promised crit`, snack.startsWith('CRIT'), snack);
    if (round === 0) {
      // the landed crit: sparks burst once and clear; the snackbar's counted-up numbers end on Habitica's exact ones
      const gone = await page.waitForFunction(() => !document.querySelector('.sparks'), null, { timeout: 3000 }).then(() => true, () => false);
      const shown = await page.evaluate(() => window.__sparks);
      const now = await page.evaluate(() => document.querySelector('#snackbar.show .snack-text')?.textContent ?? null);
      check('a landed crit bursts amber sparks once, then they clear, and its numbers end exact', shown === 1 && gone && (now === null || now === snack || !now.startsWith('CRIT')), `${shown} burst, gone ${gone}, “${now}”`);
    }
    // gear swapped for the crit goes back by itself once the crit is used
    await page.waitForTimeout(600); await idle();
    const eqEnd = JSON.stringify((await mockState()).user.items.gear.equipped);
    check(`round ${round}: gear is as it was after the crit`, eqEnd === eqStart && !(await page.locator('.banner', { hasText: 'Put back' }).count()));
  }

  // ------------------------------------------------------------------ 1b. a free gear swap: suggested first, and the gear goes back by itself after the crit
  {
    const get = q => fetch(`${API}/mock/computed${q}`).then(r => r.json());
    const st = await mockState();
    const eq = st.user.items.gear.equipped;
    const owned = Object.keys(st.user.items.gear.owned).filter(k => st.user.items.gear.owned[k] && !Object.values(eq).includes(k));
    const base = await get('');
    let best = null;
    for (const k of owned) { const c = await get(`?equip=${k}`); if (c.str > base.str && (!best || c.str > best.str)) best = { k, str: c.str }; }
    // a Gold amount whose roll misses the current crit bar but clears the one after the swap (the same Math.sin as the mock)
    const S = st.user.stats;
    const rest = S.hp + S.mp + S.exp + S.lvl + S.points + S.str + S.con + S.int + S.per;
    const c0 = 0.03 * (1 + base.str / 100); const c1 = best ? 0.03 * (1 + best.str / 100) : 0;
    let gp = -1;
    for (let g = 50; g < 20000 && best; g++) { const x = Math.sin(rest + g + 1) * 10000; const roll = x - Math.floor(x); if (roll > c0 && roll <= c1) { gp = g; break; } }
    if (gp < 0) check('gear-swap case: a Gold amount exists', false, JSON.stringify({ best, c0, c1 }));
    else {
      await post('/mock/set', { stats: { gp } });
      await tab('Now'); await sync();
      const firstOpt = (await page.locator('.opt').first().textContent()).replace(/\s+/g, ' ');
      check('a free gear swap is suggested first', /^Equip/.test(firstOpt.trim()) && (await page.locator('.opt').first().locator('.tag.tier').textContent()).trim() === 'Free', firstOpt.slice(0, 90));
      await runFirstOption();
      const swapped = JSON.stringify((await mockState()).user.items.gear.equipped) !== JSON.stringify(eq);
      const mk = await mark();
      const snack = await score('Stretch');
      check('the swap delivered the crit', swapped && snack.startsWith('CRIT'), snack);
      const back = await snackAfter(mk, 'gear is back');
      await idle();
      check('gear went back by itself after the crit', /gear is back/.test(back) && JSON.stringify((await mockState()).user.items.gear.equipped) === JSON.stringify(eq), back);
    }
  }

  let p;
  // ------------------------------------------------------------------ 2. skills: never aimed at challenge or team tasks
  await tab('Now');
  await post('/mock/set', { stats: { mp: 80 } });
  await sync();
  const skillsCard = page.locator('.card', { has: page.locator('.card-title', { hasText: /^Skills$/ }) });
  const smashRow = skillsCard.locator('.li', { hasText: 'Brutal Smash' });
  const smashSub = await smashRow.locator('.li-sub').textContent();
  check('task skills skip challenge and team tasks (bluest own task is Floss)', smashSub.includes('Floss'), smashSub);
  let m = await mark();
  await smashRow.locator('button', { hasText: 'Cast' }).click();
  check('Brutal Smash cast', (await snackAfter(m, 'Brutal Smash')).includes('Brutal Smash'));
  await idle();
  const gaze = page.locator('.li', { hasText: 'Intimidating Gaze' }).locator('button', { hasText: 'Cast' });
  if (await gaze.count() && !(await gaze.isDisabled())) {
    m = await mark();
    await gaze.click();
    await snackAfter(m, 'Intimidating Gaze');
    await idle();
    const buff = (await mockState()).user.stats.buffs.con;
    p = await predictions();
    check('party skill: buff that only reaches the database is picked up (prediction matched)', buff > 0 && p.matched === p.total, `con buff ${buff} · ${p.text}`);
    await tab('Now');
  }

  // ------------------------------------------------------------------ 2b. make the next Brutal Smash crit: Habitica's own roll agrees before the cast
  {
    let ran = null;
    for (let mp = 80; mp > 60 && !ran; mp -= 1) {
      await post('/mock/set', { stats: { mp } });
      await sync();
      // the skill's own "Make it crit" opens its ways in a sheet (no second option card on Now)
      const ways = page.locator('[data-k="ways-smash"]');
      if (!(await ways.count()) || await ways.isDisabled()) continue;
      await ways.click();
      await page.waitForSelector('.sheet.open');
      const card = page.locator('.sheet.open');
      check('Brutal Smash plan: its sheet names the skill', (await card.locator('.sheet-title').textContent()).includes('Make Brutal Smash crit'));
      if (!(await card.locator('.opt button', { hasText: 'Do it' }).count())) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); continue; }
      const steps = (await card.locator('.opt').first().textContent()).replace(/\s+/g, ' ');
      await card.locator('.opt button', { hasText: 'Do it' }).first().click();
      await page.waitForSelector('.sheet.open .sheet-actions button:has-text("Do it")');
      check('Brutal Smash plan: confirmation names the skill', (await page.textContent('.sheet.open')).includes('Make Brutal Smash crit'));
      if (await page.locator('.sheet.open #really').count()) await page.locator('.sheet.open #really').check();
      m = await mark();
      await page.locator('.sheet.open .sheet-actions button', { hasText: 'Do it' }).click();
      ran = { steps, msg: await snackAfter(m, '^(Done|Step \\d|Your numbers changed)') };
      await idle();
    }
    if (ran) {
      check(`Brutal Smash plan runs (${ran.steps.slice(0, 60)}…)`, ran.msg.includes('Brutal Smash will crit'), ran.msg);
      const real = await fetch(`${API}/mock/crit?stat=con&base=0.03`).then(r => r.json());
      check('Brutal Smash plan: Habitica’s own roll is a crit before casting', real.mult > 1, `×${real.mult}`);
      const st = (await mockState()).user.stats;
      check('Brutal Smash plan: mana left to cast it', st.mp >= 10, `${st.mp} MP`);
      m = await mark();
      await page.locator('.card', { has: page.locator('.card-title', { hasText: /^Skills$/ }) }).locator('.li', { hasText: 'Brutal Smash' }).locator('button', { hasText: 'Cast' }).click();
      const cs = await snackAfter(m, 'Brutal Smash');
      check('Brutal Smash then crits', cs.includes('CRIT'), cs);
      await idle();
    } else check('Brutal Smash plan: found a state that needs one', false);
  }

  // ------------------------------------------------------------------ 1z. tap the character in the meadow: it says a line, typed out as it talks
  {
    await tab('Now');
    // the account has a Habitica background: the speaking avatar stands without it, on the meadow
    const prefs = (await mockState()).user.preferences;
    await post('/mock/set', { user: { preferences: { ...prefs, background: 'blue' } } });
    await sync();
    await page.evaluate(() => { window.scrollTo(0, 0); window.__talkScale = 0.1; });
    await page.waitForTimeout(200);
    const bg = await page.evaluate(() => [document.querySelectorAll('.hero-stage .avatar img[src*="background_"]').length, document.querySelectorAll('.hero-stage .avatar img').length]);
    check('talk: the speaking avatar has no Habitica background behind it', bg[0] === 0 && bg[1] > 3, `${bg[0]} background of ${bg[1]} layers`);
    // how far the bubble's inside reaches past its widest line of text (the screen-reader copy aside)
    const slack = () => page.evaluate(() => {
      const b = document.querySelector('.hero-stage .bubble'); const cs = getComputedStyle(b);
      const inner = b.getBoundingClientRect().right - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingRight);
      const r = document.createRange(); const w = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let right = -1;
      for (let n = w.nextNode(); n; n = w.nextNode()) {
        if (!n.nodeValue.trim() || n.parentElement.closest('.sr')) continue;
        r.selectNodeContents(n); for (const q of r.getClientRects()) right = Math.max(right, q.right);
      }
      return right < 0 ? null : Math.round((inner - right) * 10) / 10;
    });
    const fitInfo = await slack();
    check('talk: the bubble is as wide as its longest line', fitInfo !== null && fitInfo >= -0.5 && fitInfo <= 3, `${fitInfo} px to spare`);
    const who = page.locator('.hero-stage .talker');
    const info = (await page.textContent('.hero-stage .bubble')).replace(/\s+/g, ' ').trim();
    const label = await who.getAttribute('aria-label');
    const mouth = await page.evaluate(() => { const m = document.querySelector('.talker .mouth'); const skin = m && m.previousElementSibling; return !!skin && /skin_/.test(skin.getAttribute('src')); });
    check('talk: the avatar in the meadow is a button, its mouth drawn over its skin', (await who.count()) === 1 && (await who.evaluate(e => e.tagName)) === 'BUTTON' && /^Talk to \S/.test(label || '') && mouth, label);
    const calls = (await mockLog()).length;
    // the talk frame by frame
    await page.evaluate(() => {
      const rec = window.__talk = [];
      const tick = () => {
        const b = document.querySelector('.hero-stage .bubble'); const w = document.querySelector('.talker');
        const t = b && b.querySelector('.said .typed'); const u = b && b.querySelector('.said .untyped');
        rec.push({ h: b ? b.offsetHeight : 0, cls: w ? w.className : '', typed: t ? t.textContent : null, rest: u ? u.textContent : null, hidden: u ? getComputedStyle(u).visibility === 'hidden' : null });
        if (rec.length < 600 && !document.querySelector('.said:not(.typing)')) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await who.click();
    await page.waitForTimeout(250);
    await page.locator('.appbar').screenshot({ path: `${SHOTS}/05-talk.png` });
    await page.waitForSelector('.said:not(.typing)', { timeout: 10000 });
    const fitSaid = await slack();
    const f = await page.evaluate(() => window.__talk.filter(x => x.typed !== null));
    const end = f[f.length - 1] || { typed: '', rest: '' };
    const line = end.typed + end.rest;
    const lens = f.map(x => x.typed.length);
    const heights = [...new Set(f.map(x => x.h))];
    const typedOut = f.length > 10 && lens[0] < line.length / 2 && lens.every((n, i) => !i || n >= lens[i - 1]) && f.every(x => x.typed + x.rest === line && x.hidden) && end.rest === '';
    check('talk: a tap types a line out letter by letter, the bubble at its final size from the first letter', typedOut && heights.length === 1 && line.length > 10, `${f.length} frames, ${lens[0]}→${lens[lens.length - 1]} of ${line.length}, heights ${heights.join(',')}`);
    check('talk: the character bobs as it types, its mouth opening and shutting', f.some(x => /\bsay\b/.test(x.cls) && /\bopen\b/.test(x.cls)) && f.some(x => /\bsay\b/.test(x.cls) && !/\bopen\b/.test(x.cls)) && !/\b(say|open)\b/.test(await who.getAttribute('class')));
    check('talk: the bubble fits the line it says, too', fitSaid !== null && fitSaid >= -0.5 && fitSaid <= 3, `${fitSaid} px to spare`);
    check('talk: TalkBack hears the whole line once; the letters as they type are hidden from it', (await page.textContent('#live')) === line && (await page.locator('.said .typed[aria-hidden="true"]').count()) === 1 && (await page.locator('.said .sr').textContent()) === line, line);
    // a tap after a line: the next one; a tap while it types: the whole line at once
    await who.click();
    await page.waitForTimeout(150);
    const mid = await page.evaluate(() => [document.querySelector('.said .typed').textContent, document.querySelector('.said .untyped').textContent]);
    await who.click();
    await page.waitForTimeout(50);
    const done = await page.evaluate(() => [document.querySelector('.said .typed').textContent, document.querySelector('.said .untyped').textContent]);
    check('talk: a tap after a line starts another; a tap while it types finishes it', mid[1].length > 0 && done[1] === '' && done[0] === mid[0] + mid[1] && done[0] !== line, `${mid[0]}|${done[0]}`);
    await page.waitForSelector('.hero-stage .bubble .headline', { timeout: 5000 }).catch(() => null);
    const back = (await page.textContent('.hero-stage .bubble')).replace(/\s+/g, ' ').trim();
    check('talk: then the bubble shows what it showed before, and nothing was sent to Habitica', back === info && (await mockLog()).length === calls, back);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await who.click();
    await page.waitForTimeout(30);
    const calm = await page.evaluate(() => [document.querySelector('.said .untyped')?.textContent, document.querySelector('.talker').className]);
    check('talk: with reduced motion the line appears whole and nothing moves', calm[0] === '' && !/\b(say|boing\d)\b/.test(calm[1]), calm.join(' | '));
    await page.emulateMedia({ reducedMotion: null });
    await page.waitForSelector('.hero-stage .bubble .headline', { timeout: 5000 }).catch(() => null);
    await post('/mock/set', { user: { preferences: prefs } });
    await sync();
  }
};
