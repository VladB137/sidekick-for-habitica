// e2e: Repeating To-Dos. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ SHOTS, TOKEN, UID, accountDayPlus, check, idle, mark, mockLog, mockState, page, post, predictions, score, snackAfter, sync, tab }) => {
  let p;
  // ------------------------------------------------------------------ 18. repeating To-Dos: a template that comes back N days after the tick, added only on a tap
  {
    await post('/mock/reset?class=warrior&level=24');
    await tab('Tasks');
    await sync();
    const card = page.locator('[data-k="repeats"]');
    check('repeats: the card on Tasks explains them when there are none', (await card.count()) === 1 && /come back a set number of days after you tick them/.test(await card.textContent()));
    const creates = async () => (await mockLog()).filter(e => e.m === 'POST' && e.p === '/api/v3/tasks/user').length;
    const reads = async () => (await mockLog()).length;
    const seed = s => ['hp', 'mp', 'exp', 'gp', 'lvl', 'points', 'str', 'con', 'int', 'per'].map(k => s[k]).join(',');
    const seed0 = seed((await mockState()).user.stats);

    // the editor: a full-screen dialog; Save needs a title
    await page.click('[data-k="rp-new"]');
    await page.waitForSelector('.fsd.open');
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${SHOTS}/17-repeat-new.png` });
    await page.click('[data-k="rp-dialog-save"]');
    await page.waitForTimeout(150);
    check('repeats: Save without a title says so and keeps the dialog', await page.isVisible('.fsd.open .field-error') && (await creates()) === 0);
    await page.fill('#rp-text', 'Change the bed sheets');
    await page.click('[data-k="rp-pri-Medium"]');
    await page.click('[data-k="rp-quick-7"]');
    await page.click('[data-k="rp-plus"]');
    const back8 = (await page.textContent('[data-k="rp-back"]')).trim();
    await page.click('[data-k="rp-minus"]');
    const back7 = (await page.textContent('[data-k="rp-back"]')).trim();
    const want7 = await accountDayPlus(page, 7);
    check('repeats: the stepper moves the day it comes back', (await page.inputValue('[data-k="rp-days"]')) === '7' && back7 === want7 && back8 !== back7, `${back8} → ${back7} (want ${want7})`);
    await page.fill('#rp-cl-new', 'Pillowcases');
    await page.press('#rp-cl-new', 'Enter');
    await page.fill('#rp-cl-new', 'Duvet cover');
    await page.click('[data-k="rp-cl-add"]');
    check('repeats: checklist items are added with Enter and with +', (await page.locator('.rp-cl li').count()) === 2);
    await page.screenshot({ path: `${SHOTS}/17-repeat-filled.png`, fullPage: true });
    let m = await mark();
    await page.click('[data-k="rp-dialog-save"]');
    let snack = await snackAfter(m, 'in your To-Dos');
    await page.waitForSelector('.fsd', { state: 'detached' });
    await idle();
    let st = await mockState();
    const sheets = st.tasks.find(t => t.text === 'Change the bed sheets');
    check('repeats: Save adds the first one to Habitica, once, with difficulty and checklist', (await creates()) === 1 && !!sheets && sheets.priority === 1.5
      && sheets.checklist.map(c => c.text).join('|') === 'Pillowcases|Duvet cover' && st.user.tasksOrder.todos[0] === sheets.id, snack);
    check('repeats: adding a To-Do moves none of the numbers the crit roll reads', seed(st.user.stats) === seed0);
    const rowOf = text => card.locator('.rp-row', { hasText: text });
    check('repeats: the template shows it is in your To-Dos, and the To-Do says it comes back',
      /Every 7 days · in your To-Dos/.test(await rowOf('Change the bed sheets').textContent())
      && (await page.locator('.li', { hasText: 'Change the bed sheets' }).first().locator('.rp-mark').textContent()).includes('Comes back every 7 days'));

    // ticked here: back in 7 days; the read after it needs no lookup
    await score('Change the bed sheets');
    await tab('Tasks');
    const ticked = (await rowOf('Change the bed sheets').textContent()).replace(/\s+/g, ' ');
    let n0 = await reads();
    await sync();
    const lookups = (await mockLog()).slice(n0).filter(e => e.p === '/api/v3/tasks/user' && e.m === 'GET').length;
    const after = (await rowOf('Change the bed sheets').textContent()).replace(/\s+/g, ' ');
    check('repeats: ticked here, it comes back in 7 days, with the wait shown as a bar', ticked.includes(`back on ${want7}`) && after.includes(`back on ${want7}`)
      && (await rowOf('Change the bed sheets').locator('.rp-progress').count()) === 1, `${ticked} / ${after}`);
    check('repeats: no extra read when the tick was seen here', lookups === 1, `${lookups} task reads`);

    // an existing To-Do becomes one (nothing added); ticked elsewhere 5 days ago, so a 3-day one is back
    await page.click('[data-k="rp-new"]');
    await page.waitForSelector('.fsd.open');
    await page.selectOption('#rp-from', 't-brakes');
    check('repeats: starting from a To-Do fills its title and adds nothing now', (await page.inputValue('#rp-text')) === 'Fix bike brakes' && (await page.locator('[data-k="rp-now"]').count()) === 0);
    await page.click('[data-k="rp-quick-3"]');
    await page.click('[data-k="rp-dialog-save"]');
    await page.waitForSelector('.fsd', { state: 'detached' });
    await idle();
    check('repeats: no task created for an existing To-Do', (await creates()) === 1);
    await post('/mock/score-elsewhere', { taskId: 't-brakes' });
    await post('/mock/task', { taskId: 't-brakes', dateCompleted: new Date(Date.now() - 5 * 864e5).toISOString() });
    // and one deleted elsewhere: it pauses
    await page.click('[data-k="rp-new"]');
    await page.waitForSelector('.fsd.open');
    await page.selectOption('#rp-from', 't-dentist');
    await page.click('[data-k="rp-dialog-save"]');
    await page.waitForSelector('.fsd', { state: 'detached' });
    await idle();
    await post('/mock/delete-task', { taskId: 't-dentist' });
    n0 = await reads();
    await sync();
    await page.waitForTimeout(500);
    await idle();
    const looked = (await mockLog()).slice(n0).filter(e => e.p === '/api/v3/tasks/user').length;
    const brakes = (await rowOf('Fix bike brakes').textContent()).replace(/\s+/g, ' ');
    check('repeats: ticked in another app 5 days ago, a 3-day one is back, found with one read of the ticked To-Dos', /Back since/.test(brakes) && looked === 2, `${brakes}; ${looked} task reads`);
    check('repeats: a copy deleted in Habitica pauses its template', /Paused: its copy was deleted/.test(await rowOf('Book dentist').textContent()));
    await page.screenshot({ path: `${SHOTS}/17-repeat-card.png`, fullPage: true });

    // back: the banner on Now, one tap adds it
    await tab('Now');
    const banner = page.locator('.rp-banner', { hasText: 'Fix bike brakes' });
    check('repeats: Now says it is back, with an Add button', (await banner.count()) === 1);
    await page.screenshot({ path: `${SHOTS}/17-repeat-banner.png` });
    m = await mark();
    // a double tap: the second lands while the first is still on its way, and adds nothing
    await banner.locator('button', { hasText: 'Add' }).evaluate(b => { b.click(); b.click(); });
    snack = await snackAfter(m, 'in your To-Dos');
    await idle();
    await page.waitForTimeout(300);
    st = await mockState();
    check('repeats: one tap (a double tap too) adds one fresh copy and the banner goes', (await creates()) === 2 && st.tasks.some(t => t.text === 'Fix bike brakes' && !t.completed && t.id.startsWith('t-new-'))
      && (await page.locator('.rp-banner').count()) === 0, snack);

    // edit: a new interval counts from the tick
    await tab('Tasks');
    await rowOf('Change the bed sheets').locator('.rp-open').click();
    await page.waitForSelector('.fsd.open');
    await page.fill('[data-k="rp-days"]', '10');
    await page.click('[data-k="rp-dialog-save"]');
    await page.waitForSelector('.fsd', { state: 'detached' });
    const want10 = await accountDayPlus(page, 10);
    check('repeats: editing the interval moves the day it comes back', (await rowOf('Change the bed sheets').textContent()).includes(want10), want10);
    // Back closes the editor without saving
    await rowOf('Change the bed sheets').locator('.rp-open').click();
    await page.waitForSelector('.fsd.open');
    await page.fill('#rp-text', 'Something else');
    await page.goBack();
    await page.waitForSelector('.fsd', { state: 'detached' });
    check('repeats: Back closes the editor without saving, still on Tasks', (await rowOf('Change the bed sheets').count()) === 1 && page.url().endsWith('#tasks'));
    // stop repeating
    await rowOf('Book dentist').locator('.rp-open').click();
    await page.waitForSelector('.fsd.open');
    await page.click('[data-k="rp-delete"]');
    await page.waitForSelector('.sheet.open');
    await page.locator('.sheet.open .sheet-actions button', { hasText: 'Stop repeating' }).click();
    await page.waitForSelector('.fsd', { state: 'detached' });
    await page.waitForTimeout(300);
    check('repeats: Stop repeating deletes the template, and history is back where it was', (await rowOf('Book dentist').count()) === 0 && page.url().endsWith('#tasks') && !(await page.isVisible('.sheet.open')));
    // kept on this device
    await page.reload();
    await page.waitForSelector('.bottomnav', { timeout: 15000 });
    await idle();
    await tab('Tasks');
    check('repeats: kept on this device across a restart', (await card.locator('.rp-row').count()) === 2);
    check('repeats: nothing was added without a tap', (await creates()) === 2);

    // a copy gone from the list while Habitica refuses the look-up: one try, then a minute's wait, not one per redraw
    st = await mockState();
    const copy = st.tasks.find(t => t.text === 'Fix bike brakes' && !t.completed);
    await post('/mock/delete-task', { taskId: copy.id });
    await post('/mock/fail', { path: '/tasks/user', query: 'completedTodos', status: 500, error: 'InternalServerError', times: 50 });
    n0 = (await mockLog()).length;
    await sync();
    await page.waitForTimeout(4000);
    await idle();
    const tries = (await mockLog()).slice(n0).filter(e => /completedTodos/.test(e.q || '')).length;
    check('repeats: a refused look-up of the ticked To-Dos is tried once, not again on every redraw', tries === 1, `${tries} look-ups in 4 s`);
    await post('/mock/fail', { clear: true });
  }

  // ------------------------------------------------------------------ 18b. back up to a file and restore it (Settings → Account): never the token, nothing sent
  {
    const fs = require('fs'), os = require('os'), path = require('path');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-backup-'));
    await sync();
    await page.evaluate(uid => localStorage.setItem('critoracle:v2:names', JSON.stringify({ [uid]: { 'pet:Wolf-Base': { name: 'Biscuit', own: true } } })), UID);
    await tab('Tasks');
    const card = page.locator('[data-k="repeats"]');
    const rowsBefore = (await card.locator('.rp-row').allTextContents()).map(t => t.replace(/\s+/g, ' '));
    await tab('Settings');
    const n0 = (await mockLog()).length;
    let m = await mark();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-k="backup"]')]);
    const file = path.join(dir, dl.suggestedFilename());
    await dl.saveAs(file);
    const text = fs.readFileSync(file, 'utf8');
    const b = JSON.parse(text);
    const snack = await snackAfter(m, 'Backup');
    check('backup: one file with the repeating To-Dos, pet names and settings, and never the token or the User ID',
      /^sidekick-backup-\d{4}-\d\d-\d\d\.json$/.test(dl.suggestedFilename()) && b.app === 'Sidekick for Habitica' && b.kind === 'backup' && b.v === 1 && /^[0-9a-f]{16}$/.test(b.account)
      && b.repeats.length === rowsBefore.length && b.stable.names['pet:Wolf-Base'].name === 'Biscuit' && b.settings.theme && Array.isArray(b.journal) && b.records?.crits === b.journal.length && b.almanac?.cur
      && !text.includes(TOKEN) && !text.includes(UID) && !('cache' in b) && /Backup downloaded/.test(snack), `${dl.suggestedFilename()} · ${b.repeats.length} repeats · ${snack}`);

    // a new phone, as far as the app can tell: nothing kept, then the file restores it
    await page.evaluate(() => { localStorage.removeItem('critoracle:v2:names'); localStorage.removeItem('critoracle:v2:repeats'); });
    await page.reload();
    await page.waitForSelector('.bottomnav', { timeout: 15000 });
    await idle();
    await tab('Tasks');
    const emptied = await card.locator('.rp-row').count();
    await tab('Settings');
    const restoreFrom = async (f) => {
      const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-k="restore"]')]);
      await fc.setFiles(f);
    };
    await restoreFrom(file);
    await page.waitForSelector('.sheet.open[data-k="restore-sheet"]');
    const asked = (await page.textContent('.sheet.open .sheet-body')).replace(/\s+/g, ' ');
    const other0 = await page.locator('.sheet.open [data-k="restore-other"]').count();
    m = await mark();
    await page.locator('.sheet.open .sheet-actions button', { hasText: 'Restore' }).click();
    const done = await snackAfter(m, 'Restored');
    await tab('Tasks');
    const rowsAfter = (await card.locator('.rp-row').allTextContents()).map(t => t.replace(/\s+/g, ' '));
    const names = await page.evaluate(uid => JSON.parse(localStorage.getItem('critoracle:v2:names') || '{}')[uid], UID);
    check('restore: asks first, saying what comes back, then the repeating To-Dos and pet names are back as they were',
      emptied === 0 && new RegExp(`^From .*: ${rowsBefore.length} repeating To-Dos, 1 pet and mount name`).test(asked) && other0 === 0 && done === 'Restored.'
      && rowsAfter.join('|') === rowsBefore.join('|') && names?.['pet:Wolf-Base']?.name === 'Biscuit', `${emptied} · ${asked} · ${done} · ${rowsAfter.join('|')}`);
    check('backup and restore: nothing sent to Habitica', (await mockLog()).slice(n0).every(e => e.m === 'GET'), (await mockLog()).slice(n0).map(e => `${e.m} ${e.p}`).join(', '));

    // a file from another account: settings and names come, its To-Dos come back as ones to add here
    await tab('Settings');
    const otherFile = path.join(dir, 'other.json');
    fs.writeFileSync(otherFile, JSON.stringify({ ...b, account: '0123456789abcdef' }));
    await restoreFrom(otherFile);
    await page.waitForSelector('.sheet.open[data-k="restore-sheet"]');
    const other = await page.locator('.sheet.open [data-k="restore-other"]').count();
    await page.locator('.sheet.open .sheet-actions button', { hasText: 'Restore' }).click();
    await page.waitForTimeout(300);
    await tab('Tasks');
    const rowsOther = (await card.locator('.rp-row').allTextContents()).map(t => t.replace(/\s+/g, ' '));
    // one whose copy was in the other account's To-Dos is back today; one still waiting for its day keeps it
    const linked = b.repeats.filter(r => r.taskId && !r.paused).map(r => r.text), waiting = b.repeats.filter(r => !r.taskId).map(r => r.text);
    const rowFor = (rows, text) => rows.find(t => t.startsWith(text)) || '';
    check('restore: a file from another account says so; To-Dos it had in Habitica are back today to add with a tap, the others keep their day',
      other === 1 && rowsOther.length === b.repeats.length && linked.length > 0 && linked.every(x => rowFor(rowsOther, x).includes('Back today'))
      && waiting.every(x => rowFor(rowsOther, x) === rowFor(rowsAfter, x)), `${linked} / ${waiting} · ${rowsOther.join(' | ')}`);

    // anything else is refused with a word, and changes nothing
    await tab('Settings');
    const junk = path.join(dir, 'junk.json');
    fs.writeFileSync(junk, '{"hello": 1}');
    m = await mark();
    await restoreFrom(junk);
    const refused = await snackAfter(m, 'backup');
    check('restore: a file that isn’t a backup is refused, no sheet', /isn’t a Sidekick backup/.test(refused) && !(await page.isVisible('.sheet.open')), refused);
    // back as before for the rest of the run
    await restoreFrom(file);
    await page.waitForSelector('.sheet.open[data-k="restore-sheet"]');
    await page.locator('.sheet.open .sheet-actions button', { hasText: 'Restore' }).click();
    await page.waitForTimeout(300);
    await page.evaluate(() => localStorage.removeItem('critoracle:v2:names'));
    fs.rmSync(dir, { recursive: true, force: true });
  }

  p = await predictions();
  check('all predictions matched Habitica at the end', p.matched === p.total, p.text);
};
