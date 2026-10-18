// e2e: History. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ SHOTS, check, mockState, page, tab }) => {
  // ------------------------------------------------------------------ 5b. History: streaks at risk, heatmaps from Habitica's task history, crit journal
  {
    await tab('Stats');
    const hc = (await page.locator('[data-k="history-card"] .card-sub').first().textContent()).trim();
    await page.click('[data-k="open-history"]');
    await page.waitForSelector('[data-k="streaks"]');
    const title = (await page.textContent('.appbar-title .compact')).trim();
    check('History: titled, with an up arrow, Stats tab marked', title === 'History' && await page.isVisible('[data-k="up"]') && (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Stats' && page.url().endsWith('#history'), `${title} · ${page.url()}`);
    const st = await mockState();
    const DAY = 864e5;
    const prefs = st.user.preferences;
    const dayOf = t => Math.floor((Date.parse(t) - prefs.timezoneOffset * 6e4 - prefs.dayStart * 36e5) / DAY);
    const today = dayOf(st.user.lastCron);
    // streaks at risk = due, unchecked Dailies with a streak (no Inn, Frost or Stealth in this account)
    const want = st.tasks.filter(t => t.type === 'daily' && t.isDue && !t.completed && t.streak > 0).map(t => `${t.text}:${t.streak}`).sort();
    const got = (await page.locator('[data-k="streaks"] .li').evaluateAll(ls => ls.map(l => `${l.querySelector('.li-title').textContent}:${l.querySelector('.streak-num').textContent}`))).sort();
    check('History: streaks at risk are exactly the due, unchecked Dailies with a streak', JSON.stringify(got) === JSON.stringify(want) && got.length > 0, got.join(' | '));
    check('Stats card counts the same streaks at risk', hc.startsWith(`${want.length} streak`), hc);
    // three of each first: streaks at risk (longest first), then the most active habits; the rest behind "All"
    {
      const shown = async k => page.locator(`[data-k="hist-${k}"] .hist .li-title`).allTextContents();
      const dl = st.tasks.filter(t => t.type === 'daily'); const hb = st.tasks.filter(t => t.type === 'habit');
      const risky = st.tasks.filter(t => t.type === 'daily' && t.isDue && !t.completed && t.streak > 0).sort((a, b) => b.streak - a.streak).map(t => t.text);
      const [d3, h3] = [await shown('dailies'), await shown('habits')];
      check('History: three Dailies first, streaks at risk leading, the rest behind All', d3.length === Math.min(3, dl.length) && JSON.stringify(d3.slice(0, Math.min(3, risky.length))) === JSON.stringify(risky.slice(0, 3)) &&
        (dl.length <= 3 || (await page.textContent('[data-k="all-dailies"]')).includes(`All Dailies (${dl.length})`)), d3.join(' | '));
      check('History: three habits first', h3.length === Math.min(3, hb.length) && (hb.length <= 3 || await page.isVisible('[data-k="all-habits"]')), h3.join(' | '));
      if (dl.length > 3) await page.click('[data-k="all-dailies"]');
      if (hb.length > 3) await page.click('[data-k="all-habits"]');
      check('History: All shows every Daily and habit', (await shown('dailies')).length === dl.length && (await shown('habits')).length === hb.length);
    }
    // every square of every Daily and habit matches what the seeded history says happened
    let squares = 0; const wrong = [];
    for (const t of st.tasks.filter(x => x.type === 'daily' || x.type === 'habit')) {
      const truth = st.historyTruth[t.id] || {};
      const cells = await page.locator(`[data-k="hist-${t.id}"] .c[data-d]`).evaluateAll(cs => cs.map(c => [Number(c.dataset.d), c.className]));
      for (const [d, cls] of cells) {
        if (d >= today) continue;
        squares += 1;
        const tr = truth[d];
        const exp = t.type === 'daily' ? (tr || 'none') : (!tr ? 'none' : tr.down > tr.up ? 'neg' : `up${Math.min(4, tr.up)}`);
        if (!cls.split(' ').includes(exp)) wrong.push(`${t.text} ${d}: ${cls} vs ${exp}`);
      }
    }
    check('History: every past square matches Habitica’s task history', squares > 300 && !wrong.length, `${squares} squares${wrong.length ? `; ${wrong.slice(0, 3).join('; ')}` : ''}`);
    // completion rate of a Daily over the last 30 days
    const run = st.tasks.find(t => t.id === 'd-run');
    let due = 0, done = 0;
    for (let d = today - 30; d < today; d++) { const m = st.historyTruth[run.id][d]; if (m === 'done') { due++; done++; } else if (m === 'missed') due++; }
    const rate = await page.textContent(`[data-k="hist-${run.id}"] .li-sub`);
    check('History: completion rate over the last 30 days', rate.includes(`(${done} of ${due})`), rate);
    // crit journal: one entry per crit Habitica rolled for a task, newest first, with its multiplier
    const crits = await page.evaluate(() => window.__snacks.filter(t => /^CRIT ×/.test(t)));
    const entries = await page.locator('[data-k="journal"] .crit-mult').allTextContents();
    const head = await page.textContent('[data-k="journal-head"]');
    check('Crit journal: every task crit so far, newest first, same multiplier',
      entries.length === crits.length && crits.length >= 4 && entries[0] === crits[crits.length - 1].match(/^CRIT (×[\d.]+)/)[1], `${entries.length} entries, ${crits.length} crits; ${entries[0]}`);
    check('Crit journal: this week’s total names what the crits added, and which were set up', new RegExp(`^${crits.length} crits this week added .*Gold.*XP.*set up by Sidekick`).test(head.trim()), head);
    // crit records on top of the journal: the biggest multiplier, the most in a day, days in a row, every crit together
    const rec = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-k="records"] .record')].map(r => [r.dataset.k, r.querySelector('.record-value').textContent])));
    const mults = crits.map(t => Number(t.match(/^CRIT ×([\d.]+)/)[1]));
    // crits per day, from the journal's own rows (every crit so far is listed: fewer than its 20)
    const days = await page.evaluate(() => { const by = {}; for (const r of document.querySelectorAll('[data-k="journal"] .li-sub')) { const d = r.textContent.split(',')[0]; by[d] = (by[d] || 0) + 1; } return Math.max(...Object.values(by)); });
    check('Crit records: the biggest crit, the most in a day and every crit counted, from the journal',
      rec['record-best'] === `×${Math.max(...mults).toFixed(2)}` && rec['record-day'] === String(days) && rec['record-all'] === `${crits.length} crits` && /^\d+ days?$/.test(rec['record-run'] || ''), JSON.stringify(rec));
    await page.screenshot({ path: `${SHOTS}/06b-history.png`, fullPage: true });
    await page.goBack();
    await page.waitForTimeout(300);
    check('Back from History returns to Stats, then Back goes to Now', (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Stats' && !page.url().endsWith('#history'));
    await page.goBack();
    await page.waitForTimeout(300);
    check('…and Back again reaches Now', (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Now');
    // the up arrow and the bottom navigation leave History the same way
    await tab('Stats'); await page.click('[data-k="open-history"]'); await page.waitForSelector('[data-k="streaks"]');
    await tab('Tasks');
    const atRisk = await page.locator('.li', { hasText: want[0].split(':')[0] }).first().textContent();
    check('Tasks marks a streak at risk', atRisk.includes('at risk'), atRisk.replace(/\s+/g, ' ').slice(0, 80));
    await page.goBack(); await page.waitForTimeout(300);
    check('a tab opened from History still goes Back to Now', (await page.locator('.navitem.active').getAttribute('aria-label')) === 'Now');
  }
};
