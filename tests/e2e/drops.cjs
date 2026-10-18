// e2e: Item drops, feeding and hatching. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ SHOTS, TOKEN, UID, check, idle, mockState, page, post, score, sync, tab }) => {
  // ------------------------------------------------------------------ 16b. item drops: chance per task, drops left today, the last one found; feeding and hatching plan
  {
    await post('/mock/reset?class=warrior&level=24');
    await page.reload();
    if (await page.locator('#uid').count()) { await page.fill('#uid', UID); await page.fill('#tok', TOKEN); await page.click('button[type=submit]'); }
    await page.waitForSelector('.appbar .headline', { timeout: 15000 });
    await idle();
    await tab('Now');
    // Now leads with you: avatar, name, level and bars first, the crit answer after
    const firstCard = page.locator('main .card').first();
    const layers = await firstCard.locator('.avatar img').evaluateAll(els => els.map(e => e.getAttribute('src').split('/').pop()));
    check('you card first on Now, with the avatar layered as Habitica draws it', (await firstCard.getAttribute('data-k')) === 'you' && layers.indexOf('skin_915533.png') >= 0 && layers.indexOf('skin_915533.png') < layers.indexOf('head_0.png') && layers[layers.length - 1].startsWith('weapon_'), layers.join(' '));
    check('you card says the XP to the next level', /\d[\d,]* XP to level 25\./.test(await firstCard.textContent()));
    check('one cheapest way shows, the rest fold under Other ways', (await page.locator('main .opt').count()) === 1 && /Other ways \(\d+\)/.test(await page.locator('[data-k="more-ways"]').textContent().catch(() => '')));
    const row = (await page.locator('.bars').first().textContent()).replace(/\s+/g, ' ');
    const m0 = row.match(/Drops\s*(\d+) \/ (\d+) left/);
    check('drops: Now shows the drops left today', !!m0 && m0[1] === m0[2], row.slice(-60));
    const cap = m0 ? Number(m0[2]) : 5;
    await tab('Tasks');
    const line = (await page.locator('.drop-line').textContent().catch(() => '')).trim();
    check('drops: Tasks says how many are left', line.startsWith(`${cap} of ${cap} item drops left today`), line);
    const chanceRows = async () => (await page.locator('.li .li-sub', { hasText: /^drop \d/ }).count()) + (await page.locator('.li .li-sub', { hasText: / · drop \d/ }).count());
    // another aim: near-constant chances stay off the rows; only one that stands out (a crit, or 1.5 × the median) shows
    const few = await chanceRows();
    check('drops: with another aim, only a chance that stands out shows on its row', few < 8 && /stands out/.test(line), `${few} rows`);
    await tab('Settings'); await page.selectOption('#obj', 'drops'); await tab('Tasks');
    const water = (await page.locator('.li', { hasText: 'Drink a glass of water' }).first().textContent()).replace(/\s+/g, ' ');
    const done = await page.locator('.li.done').count();
    check('drops: aimed at drops, every open task shows its drop chance', /drop \d+(\.\d)?%/.test(water) && (await chanceRows()) >= 8 && (await chanceRows()) > few, `${water} (${done} done)`);
    await tab('Settings'); await page.selectOption('#obj', 'auto'); await tab('Tasks');
    // one drop left today, and the next score finds it (mock rolls 0: Habitica's own randomDrop gives a Golden potion)
    await post('/mock/set', { items: { lastDrop: { count: cap - 1, date: new Date().toISOString() } }, dropRoll: 0 });
    await sync();
    const before = (await mockState()).user.items.hatchingPotions.Golden || 0;
    const msg = await score('Drink a glass of water');
    check('drops: the snackbar names the item found', /found Golden hatching potion/.test(msg), msg);
    const st = (await mockState()).user.items;
    check('drops: Habitica counted the drop', st.lastDrop.count === cap && (st.hatchingPotions.Golden || 0) === before + 1, JSON.stringify(st.lastDrop));
    const after = (await page.locator('.drop-line').textContent().catch(() => '')).trim();
    check('drops: no drops left, without a re-read', after.startsWith(`No item drops left today: all ${cap} found.`) && (await page.locator('.li .li-sub', { hasText: /drop \d/ }).count()) === 0, after);
    await post('/mock/set', { dropRoll: null });

    // feeding plan: Base Wolf at 40 eats 2 Meat (its favourite) into a mount; Red Fox has no Strawberries; a Veteran Wolf can't be fed
    await post('/mock/set', { items: { pets: { 'Wolf-Base': 40, 'Fox-Red': 10, 'Wolf-Veteran': 5 }, mounts: {}, hatchingPotions: { Base: 4, Red: 1 } } });
    await sync();
    await tab('Stats');
    const fc = page.locator('.card', { hasText: 'Feeding and hatching' });
    const ready = (await fc.locator('[data-k="raise-Wolf-Base"]').textContent().catch(() => '')).replace(/\s+/g, ' ');
    check('feeding: the food you hold raises a mount', ready.includes('Base Wolf') && ready.includes('Feed 2 Meat, and it becomes a mount'), ready);
    const wolf = await page.evaluate(uid => JSON.parse(localStorage.getItem('critoracle:v2:names') || '{}')[uid]?.['pet:Wolf-Base']?.name, UID);
    check('feeding: a pet named in the Stable goes by its name, Habitica’s in brackets', wolf === 'Lupușor' && ready.includes('Lupușor (Base Wolf)'), `${wolf} | ${ready}`);
    const grow = (await fc.locator('[data-k="grow-Fox-Red"]').textContent().catch(() => '')).replace(/\s+/g, ' ');
    check('feeding: a pet short of its food says what it needs', /8 more of its favourite food \(Strawberry.*\) to become a mount/.test(grow), grow);
    check('feeding: special pets are left out', (await fc.locator('[data-k="grow-Wolf-Veteran"], [data-k="raise-Wolf-Veteran"]').count()) === 0);
    const hatch = (await fc.locator('[data-k^="hatch-"]').allTextContents()).map(t => t.replace(/\s+/g, ' '));
    check('feeding: hatching suggests only new pairings', hatch.length === 2 && hatch.some(t => t.includes('Red Wolf')) && hatch.some(t => t.includes('Base Fox')) && hatch.every(t => /new pet/.test(t)), hatch.join(' | '));
    // every pet an egg can hatch into: the plan's pick shows first, a tap opens the rest (one Golden potion, two eggs that want it)
    await post('/mock/set', { items: { hatchingPotions: { Base: 4, Red: 1, Golden: 1 } } });
    await sync();
    const eggRows = fc.locator('details.hatch-egg');
    check('feeding: an egg with more than one pet to hatch into folds them under its first pick', (await eggRows.count()) === 2 && /2 pets/.test(await fc.locator('[data-k="egg-Wolf"] summary').textContent()) && /2 pets/.test(await fc.locator('[data-k="egg-Fox"] summary').textContent()),
      (await fc.locator('[data-k^="egg-"] summary').allTextContents()).join(' | '));
    check('feeding: the full list starts closed', (await eggRows.evaluateAll(els => els.filter(e => e.open).length)) === 0 && (await fc.locator('[data-k^="can-"]:visible').count()) === 0);
    await fc.locator('[data-k="egg-Wolf"] summary').click();
    await fc.locator('[data-k="egg-Fox"] summary').click();
    const can = (await fc.locator('[data-k^="can-"]').evaluateAll(els => els.map(e => [e.dataset.k.slice(4), e.getBoundingClientRect().height > 40, !!e.querySelector('.pet-cell'), e.textContent.replace(/\s+/g, ' '), e.querySelector('.tag')?.textContent === 'Plan'])));
    const planned = can.filter(c => c[4]).map(c => c[0]);
    check('feeding: a tap shows every pet the egg can hatch with the potions you hold, each drawn, the plan\'s picks tagged',
      can.map(c => c[0]).sort().join() === 'Fox-Base,Fox-Golden,Wolf-Golden,Wolf-Red' && can.every(c => c[1] && c[2]) && planned.length === 3 && planned.filter(k => k.endsWith('-Golden')).length === 1, JSON.stringify(can));
    check('feeding: the egg the plan gives no Golden potion to still lists it', can.filter(c => c[0].endsWith('-Golden') && !c[4]).length === 1 && can.filter(c => c[0].endsWith('-Golden') && !c[4]).every(c => /new pet and a mount to raise/.test(c[3])));
    await fc.locator('[data-k="hatching"]').screenshot({ path: `${SHOTS}/16b-feeding-hatch-open.png` }).catch(() => {});
    await fc.locator('[data-k="egg-Wolf"] summary').click();
    await fc.locator('[data-k="egg-Fox"] summary').click();
    await post('/mock/set', { items: { hatchingPotions: { Base: 4, Red: 1 } } });
    await sync();
    check('feeding: the Saddle is mentioned, not spent', (await fc.textContent()).includes('You hold 1 Saddle'));
    const pic = await fc.locator('[data-k="raise-Wolf-Base"] .pet-cell').evaluate(async el => {
      const cs = getComputedStyle(el);
      const url = /url\("?([^")]+)"?\)/.exec(cs.backgroundImage)?.[1] || '';
      const img = new Image(); img.src = url;
      try { await img.decode(); } catch { return { url, ok: false }; }
      return { url, ok: true, w: el.offsetWidth, h: el.offsetHeight, bw: img.naturalWidth, bh: img.naturalHeight };
    }).catch(e => ({ url: String(e), ok: false }));
    check('feeding: pet pictures come from the sprites bundled with the app, first frame, two CSS pixels per art pixel',
      pic.ok && new URL(pic.url).origin === new URL(page.url()).origin && pic.url.includes('/stable/pet/Wolf-Base.png') && pic.w * 3 === pic.bw * 2 && pic.h * 3 === pic.bh * 2, JSON.stringify(pic));
    check('feeding: the sprite credit is shown', (await fc.textContent()).includes('CC BY-NC-SA 3.0'));
    // item, skill and pet pictures ship with the app (public/shop/, public/stable/): none comes from another host
    await page.waitForFunction(() => /stable\/pet\/Wolf-Base\.png/.test(document.querySelector('[data-k="pet-Wolf-Base"] .pet-cell')?.style.backgroundImage || ''), null, { timeout: 5000 }).catch(() => {});
    const petBg = await fc.locator('[data-k="pet-Wolf-Base"] .pet-cell').first().evaluate(e => e.style.backgroundImage).catch(() => '');
    const gearIcons = async () => page.evaluate(async () => Promise.all([...document.querySelectorAll('main img.sprite')].map(async i => { i.loading = 'eager'; try { await i.decode(); } catch { /* reported below */ } return [i.getAttribute('src'), i.naturalWidth]; })));
    const eqIcons = await gearIcons();
    await tab('Now');
    const skillIcons = await gearIcons();
    const okIcon = ([src, w]) => /^shop\/shop_\w+\.png\?v=\w{7}$/.test(src) && w > 0;
    check('icons: gear on Stats, skills on Now and pets in the feeding plan load from the app itself',
      /stable\/pet\/Wolf-Base\.png/.test(petBg) && eqIcons.length >= 3 && eqIcons.every(okIcon) && skillIcons.some(([s]) => /shop_smash|shop_fireball|shop_backStab|shop_heal/.test(s)) && skillIcons.every(okIcon),
      `${petBg} · ${JSON.stringify(eqIcons.filter(x => !okIcon(x)).concat(skillIcons.filter(x => !okIcon(x))).slice(0, 4))} · ${eqIcons.length}/${skillIcons.length}`);
    await tab('Stats');
    await page.screenshot({ path: `${SHOTS}/16b-feeding.png`, fullPage: true });
    await fc.screenshot({ path: `${SHOTS}/16b-feeding-card.png` });
  }
};
