// e2e: Bundled sprites under the CSP; the Android side. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ APP, SHOTS, TOKEN, UID, browser, check, errors, fs, idle, mockLog, mockState, page, post, sync, tab }) => {
  // ------------------------------------------------------------------ 16b. the Stable's sprites ship with the build and load under the app's CSP
  {
    const cat = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '../../src/data/sprites.json'), 'utf8'));
    const v = cat.images.slice(0, 7);
    const want = [['pet', 'Wolf-Base', 1], ['mount', 'Wolf-Base', 2], ['pet', 'Wolf-Cerberus', 1]].map(([k, key, rows]) => {
      const [w, h, , , frames] = cat[k === 'pet' ? 'pets' : 'mounts'][key];
      return { url: `stable/${k}/${key}.png?v=${v}`, w: w * frames, h: h * rows };
    });
    const got = await page.evaluate(list => Promise.all(list.map(async ({ url }) => {
      const img = new Image(); img.src = url;
      try { await img.decode(); const bmp = await createImageBitmap(img); return [bmp.width, bmp.height]; } catch (e) { return String(e); }
    })), want);
    check('Stable sprites: a pet, a mount and an animated sheet load from the app itself at their catalogued size',
      want.every((x, i) => Array.isArray(got[i]) && got[i][0] === x.w && got[i][1] === x.h), JSON.stringify(got));
  }

  // ------------------------------------------------------------------ 17a. Android: what the notification shows (a stand-in for the phone's side)
  {
    await post('/mock/reset?class=warrior&level=24');
    const nctx = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, colorScheme: 'light', isMobile: true, hasTouch: false });
    await nctx.addInitScript(() => {
      window.__noAutoRead = true;
      window.__noDaySummary = true;
      window.__snackScale = 0.25;
      window.__snacks = [];
      new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.classList.contains('snack-text')) window.__snacks.push(n.textContent); })
        .observe(document, { childList: true, subtree: true });
      // what the Android plugin answers (src/app/native.ts); calls are recorded for the checks
      const calls = window.__nativeCalls = [];
      let creds = {};
      const ok = name => o => { calls.push([name, o]); return Promise.resolve(); };
      window.__fakeNative = {
        getCredentials: () => Promise.resolve(creds),
        setCredentials: o => { creds = o; calls.push(['setCredentials', { userId: o.userId }]); return Promise.resolve(); },
        setClient: ok('setClient'), clearCredentials: ok('clearCredentials'), reportRead: ok('reportRead'), setNightPlan: ok('setNightPlan'),
        // window.__statusPatch: what a test changes on the phone (blocked notifications, a night swap under way)
        status: () => Promise.resolve({ notification: true, notificationsAllowed: true, notificationsEnabled: true, usageAccess: false, backgroundRefresh: false, night: { on: true, mode: 'int', swapAt: 1410, backOn: true, backAt: 480, phase: 'idle', last: '', lastAt: 0 }, ...(window.__statusPatch || {}) }),
        setNotification: o => Promise.resolve({ on: o.on }), setBackgroundRefresh: ok('setBackgroundRefresh'), openUsageAccess: ok('openUsageAccess'),
        openNotificationSettings: ok('openNotificationSettings'),
        setStatusBarColor: () => Promise.resolve(), setNightGear: ok('setNightGear'),
        reportExtras: ok('reportExtras'), setLines: ok('setLines'),
        takeRoute: () => Promise.resolve({}),
        nextAutoAt: () => Promise.resolve({ at: window.__nextAuto || 0 }),
        repeatsGet: () => Promise.resolve({}), repeatsSet: ok('repeatsSet'), repeatsPermission: () => Promise.resolve({ granted: true }),
        // the Stable widget: window.__stableWidget says whether one is on the home screen
        stableWidget: () => Promise.resolve(window.__stableWidget || { placed: false }),
        setStablePicture: o => { calls.push(['setStablePicture', o]); window.__stableWidget = { ...window.__stableWidget, key: o.key }; return Promise.resolve(); },
        // the Stable wallpaper: window.__stableWallpaper says whether it's set, which scenery the phone has and its screen
        stableWallpaper: () => Promise.resolve(window.__stableWallpaper || { set: false, screen: { w: 1080, h: 2400 } }),
        setStableScenery: o => { calls.push(['setStableScenery', o]); window.__stableWallpaper = { ...(window.__stableWallpaper || { set: false, screen: { w: 1080, h: 2400 } }), key: o.key }; return Promise.resolve(); },
        openStableWallpaper: ok('openStableWallpaper'), openStableDream: ok('openStableDream'),
        // the avatar's pictures as the phone hands them over (a magenta square each, so a postcard shows where they went)
        avatarPicture: o => {
          calls.push(['avatarPicture', o]);
          const c = document.createElement('canvas'); c.width = c.height = 12;
          const g = c.getContext('2d'); g.fillStyle = '#FF00FF'; g.fillRect(0, 0, 12, 12);
          return Promise.resolve({ picture: c.toDataURL('image/png') });
        },
        sharePicture: o => { calls.push(['sharePicture', o]); return Promise.resolve(); },
        // a backup through Android's save dialog: the player picks a place (window.__saveCancel: they backed out)
        saveFile: o => { calls.push(['saveFile', o]); return Promise.resolve({ saved: !window.__saveCancel }); },
        openHabitica: () => { calls.push(['openHabitica', {}]); return Promise.resolve({ app: true }); },
        addListener: (ev, fn) => { if (ev === 'route') window.__routeFn = fn; if (ev === 'stableWidget') window.__stableWidgetFn = fn; if (ev === 'stableWallpaper') window.__stableWallpaperFn = fn; return Promise.resolve({ remove () {} }); },
      };
    });
    const np = await nctx.newPage();
    np.on('pageerror', e => errors.push(`pageerror (notification): ${e.message}`));
    np.on('console', m => { if (m.type() === 'error') errors.push(`console (notification): ${m.text()}`); });
    await np.goto(APP);
    await np.waitForSelector('.ob');
    await post('/mock/set', { stats: { hp: 3 } }); // the next day change would take all HP
    await np.click('[data-k="intro-skip"]');
    await np.waitForSelector('#uid');
    // on the phone, Open Habitica settings asks the phone (Habitica's own app, or the website without it) instead of following the link
    await np.click('[data-k="open-api-page"]');
    await np.waitForTimeout(200);
    check('login on the phone: Open Habitica settings opens Habitica through the phone, the login stays', (await np.evaluate(() => window.__nativeCalls.filter(c => c[0] === 'openHabitica').length)) === 1 && (await np.locator('#uid').count()) === 1 && np.context().pages().length === 1);
    await np.fill('#uid', UID); await np.fill('#tok', TOKEN);
    await np.click('button[type=submit]');
    await np.waitForSelector('[data-k="choose-full"]', { timeout: 15000 });
    await np.click('[data-k="choose-full"]');
    await np.waitForSelector('[data-k="coach-skip"]');
    await np.click('[data-k="coach-skip"]');
    await np.waitForSelector('.appbar .headline', { timeout: 15000 });
    await np.waitForTimeout(400);
    const calls = name => np.evaluate(n => window.__nativeCalls.filter(c => c[0] === n).map(c => c[1]), name);
    const lastLines = async () => { const l = await calls('setLines'); return l.length ? JSON.parse(l[l.length - 1].lines) : null; };
    const extras = await calls('reportExtras');
    const ex = extras[extras.length - 1];
    const exTasks = ex ? JSON.parse(ex.tasks) : [];
    const exParty = ex?.party ? JSON.parse(ex.party) : null;
    check('notification: the full read hands its Dailies and the party quest to the phone', exTasks.length > 0 && exTasks.every(t => t.type === 'daily' && 'isDue' in t && !('notes' in t)) && exParty?.quest?.key === 'basilist' && ex.partyAt > 0,
      `${exTasks.length} dailies, quest ${exParty?.quest?.key}`);
    const first = await lastLines();
    check('notification: the default lines go to the phone at login', first && first.order === 'auto' && first.lines.join(',') === 'crit,danger,invite,countdown,bars,points,saving,night' && first.widget === false, JSON.stringify(first));

    // the phone made an automatic call moments ago (night gear, the 15-minute refresh): the app's own auto-read waits for it
    {
      const reads = async () => (await mockLog()).filter(e => e.p === '/api/v3/user').length;
      await np.evaluate(() => { window.__nextAuto = Date.now() + 60_000; window.__noAutoRead = false; });
      const r0 = await reads();
      await np.waitForTimeout(5000);
      const held = (await reads()) - r0;
      await np.evaluate(() => { window.__nextAuto = 0; });
      await np.waitForTimeout(5000);
      const after = (await reads()) - r0 - held;
      await np.evaluate(() => { window.__noAutoRead = true; });
      check('auto-read: waits for the phone’s own automatic calls, then reads', held === 0 && after >= 1, `${held} reads while held, ${after} after`);
    }

    await np.click('.bottomnav button[aria-label="Settings"]');
    await np.waitForSelector('[data-k="notif-lines"]');
    const summary = (await np.textContent('[data-k="notif-lines"] .li-sub')).trim();
    check('notification: Settings sums up the choice', /^Crit verdict, Day change danger and 6 more · most urgent first$/.test(summary), summary);
    await np.click('[data-k="notif-lines"]');
    await np.waitForSelector('.screen.open .np');
    await np.waitForTimeout(300);
    const rowIds = () => np.$$eval('.screen .np-row', rs => rs.map(r => r.dataset.k.replace('np-', '')));
    const pv = await rowIds();
    const danger = (await np.textContent('.screen [data-k="np-danger"]').catch(() => '')).trim();
    check('notification: a deadly day change leads, in red, naming the Dailies to finish', pv[0] === 'danger' && /^Day change takes all your HP: finish \S/.test(danger) && (await np.locator('.screen [data-k="np-danger"].tone-danger').count()) === 1, danger);
    const dropsSample = (await np.textContent('.screen [data-k="line-drops"] .np-sample').catch(() => '')).trim();
    check('notification: the drops line shows today\'s drops left as its sample', /^(\d+ of \d+ item drops left today|No item drops left today \(\d+ a day\))$/.test(dropsSample), dropsSample);
    check('notification: the preview shows the default lines that have something to say', pv[1] === 'crit' && pv.includes('countdown') && pv.includes('bars') && pv.includes('night') && !pv.includes('boss'), pv.join(','));
    const nightText = (await np.textContent('.screen [data-k="np-night"]')).trim();
    check('notification: night gear line from the phone’s settings', nightText === 'INT night gear goes on at 23:30', nightText);
    check('notification: HP, MP and XP as three labelled bars', (await np.locator('.screen [data-k="np-bars"] .np-bar').count()) === 3 && /^HP \d+ \/ 50$/.test((await np.locator('.screen [data-k="np-bars"] .np-label').first().textContent()).trim()));
    await np.screenshot({ path: `${SHOTS}/40-notification-settings.png` });

    // a line that needs the party: switched on, it shows the boss and goes to the phone
    await np.locator('.screen [data-k="np-on-boss"]').click();
    await np.waitForTimeout(300);
    const boss = (await np.textContent('.screen [data-k="np-boss"]').catch(() => '')).trim();
    const sent = await lastLines();
    check('notification: the boss line appears in the preview with its HP bar', /^The Basi-List: 77 \/ 100 HP/.test(boss) && (await np.locator('.screen [data-k="np-boss"] .np-bar').count()) === 1, boss);
    check('notification: the choice reaches the phone at once', sent.lines.includes('boss'), sent.lines.join(','));
    check('notification: lines needing another read are marked', (await np.locator('.screen [data-k="line-boss"] .np-extra').textContent()).trim() === '1 more read' && (await np.locator('.screen [data-k="line-streaks"] .np-extra').count()) === 1 && (await np.locator('.screen [data-k="line-crit"] .np-extra').count()) === 0);
    const streakSample = (await np.textContent('.screen [data-k="line-streaks"] .np-sample').catch(() => '')).trim();
    check('notification: the streaks line names the streaks the day change resets', /^(\d+ streaks? at risk: .+ \(\d+\)|Example: .+)$/.test(streakSample), streakSample);
    // a seventh line: a snackbar explains that at most six show
    const m0 = await np.evaluate(() => window.__snacks.length);
    await np.locator('.screen [data-k="np-on-dailies"]').click();
    const snack = await np.waitForFunction(m => window.__snacks.slice(m).find(t => /Up to 6 lines show/.test(t)), m0, { timeout: 5000 }).then(h => h.jsonValue()).catch(() => '(none)');
    check('notification: turning on a seventh line says at most six show', /Up to 6 lines show at once/.test(snack), snack);
    check('notification: the preview never shows more than six rows', (await np.locator('.screen .np-row').count()) <= 6);

    // drag the night gear line to the top with the handle
    await np.locator('.screen .np-list').evaluate(e => e.scrollIntoView({ block: 'center' }));
    await np.waitForTimeout(100);
    const handle = np.locator('.screen [data-k="np-move-night"]');
    const target = await np.locator('.screen [data-k="line-crit"]').boundingBox();
    const hb = await handle.boundingBox();
    await np.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
    await np.mouse.down();
    for (let i = 1; i <= 10; i++) { await np.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2 + (target.y - hb.y - 10) * i / 10); await np.waitForTimeout(16); }
    const lifted = await np.locator('.screen [data-k="line-night"]').evaluate(e => e.classList.contains('dragging') && getComputedStyle(e).boxShadow !== 'none');
    await np.mouse.up();
    await np.waitForTimeout(300);
    const order = await np.$$eval('.screen .np-list > li', ls => ls.map(l => l.dataset.id));
    check('notification: a dragged row lifts and lands where it is dropped', lifted && order[0] === 'night' && (await lastLines()).lines[0] === 'night', order.join(','));
    // the keyboard moves it back down
    await np.focus('.screen [data-k="np-move-night"]');
    await np.keyboard.press('ArrowDown');
    await np.waitForTimeout(200);
    const order2 = await np.$$eval('.screen .np-list > li', ls => ls.map(l => l.dataset.id));
    check('notification: arrow keys move a line too', order2[0] === 'crit' && order2[1] === 'night' && (await np.evaluate(() => document.activeElement?.dataset.k)) === 'np-move-night', order2.join(','));
    // own order: night gear right under the crit
    await np.locator('.screen [data-k="np-auto"]').click();
    await np.waitForTimeout(200);
    const mine = await lastLines();
    const rows2 = await rowIds();
    check('notification: own order when most-urgent-first is off', mine.order === 'mine' && rows2[0] === 'crit' && rows2[1] === 'night', rows2.join(','));
    // collapsed: the first two lines
    await np.click('.screen .np');
    await np.waitForTimeout(150);
    const col = [(await np.textContent('.screen .np-title')).trim(), (await np.textContent('.screen .np-text1')).trim()];
    check('notification: a tap on the preview collapses it to the first two lines', (await np.locator('.screen .np-row').count()) === 0 && /^Next task:/.test(col[0]) && col[1] === nightText, col.join(' | '));
    await np.click('.screen .np');
    await np.locator('.screen [data-k="np-widget-on"]').click();
    await np.waitForTimeout(150);
    check('notification: the widget can mirror the choice', (await lastLines()).widget === true);
    // dark theme
    await np.emulateMedia({ colorScheme: 'dark' });
    await np.waitForTimeout(200);
    await np.screenshot({ path: `${SHOTS}/41-notification-settings-dark.png` });
    await np.locator('.screen .np-list').evaluate(e => e.scrollIntoView({ block: 'center' }));
    await np.screenshot({ path: `${SHOTS}/42-notification-lines-dark.png` });
    await np.locator('.screen').evaluate(e => { e.scrollTop = 0; });
    await np.emulateMedia({ colorScheme: 'light' });
    // Back closes the screen and stays on Settings
    await np.goBack();
    await np.waitForTimeout(400);
    check('notification: Back closes the screen', (await np.locator('.screen').count()) === 0 && (await np.locator('[data-k="notif-lines"]').count()) === 1);
    const summary2 = (await np.textContent('[data-k="notif-lines"] .li-sub')).trim();
    check('notification: the summary follows', /your order$/.test(summary2) && /and 8 more/.test(summary2), summary2);
    // the notification's Tasks button opens the Tasks tab
    await np.evaluate(() => window.__routeFn({ route: 'tasks' }));
    await np.waitForTimeout(300);
    check('notification: its Tasks button opens Tasks', (await np.locator('.navitem.active').getAttribute('aria-label')) === 'Tasks');

    // the Stable widget: pictures only once one is on the home screen, one per light, painted again only on a change
    {
      const pics = () => calls('setStablePicture');
      check('stable widget: nothing painted while no widget is on the home screen', (await pics()).length === 0);
      await post('/mock/set', { items: { currentPet: 'Wolf-Base', currentMount: 'Dragon-Red' } });
      await np.click('.appbar [data-k="sync"]');
      await np.waitForTimeout(600);
      await np.evaluate(() => { window.__stableWidget = { placed: true }; window.__stableWidgetFn(); });
      await np.waitForFunction(() => window.__nativeCalls.some(c => c[0] === 'setStablePicture'), null, { timeout: 15000 }).catch(() => {});
      const first = (await pics())[0];
      const sizes = first ? await np.evaluate(o => Promise.all(['dawn', 'day', 'dusk', 'night'].map(async l => {
        const img = new Image(); img.src = o[l]; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data;
        let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
        return { l, w: img.width, h: img.height, bright: Math.round(sum / (d.length / 4)), png: o[l].startsWith('data:image/png;base64,') };
      })), first) : [];
      const by = Object.fromEntries(sizes.map(x => [x.l, x]));
      check('stable widget: a widget placed while the app runs gets four PNG pictures (dawn, day, dusk, night) at 540 × 270',
        sizes.length === 4 && sizes.every(x => x.png && x.w === 540 && x.h === 270) && by.night.bright < by.day.bright, JSON.stringify(sizes));
      const key = first ? JSON.parse(first.key) : [];
      check('stable widget: the pictures show the open playground with whoever is out in Habitica', JSON.stringify(key[4] || []).includes('pet:Wolf-Base') && JSON.stringify(key[4] || []).includes('mount:Dragon-Red'), first?.key);
      if (first) {
        // the four pictures side by side, for the screenshots
        await np.evaluate(o => {
          const d = document.createElement('div'); d.id = 'widget-shots';
          d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#222;display:grid;grid-template-columns:1fr;gap:6px;padding:6px;overflow:auto';
          for (const l of ['dawn', 'day', 'dusk', 'night']) { const i = new Image(); i.src = o[l]; i.style.cssText = 'width:100%;image-rendering:pixelated;border-radius:16px'; d.appendChild(i); }
          document.body.appendChild(d);
        }, first);
        await np.waitForTimeout(200);
        await np.screenshot({ path: `${SHOTS}/44-stable-widget.png` });
        fs.writeFileSync(`${SHOTS}/44-stable-widget-day.png`, Buffer.from(first.day.split(',')[1], 'base64'));
        await np.evaluate(() => document.getElementById('widget-shots').remove());
      }
      // a read that changes nothing the picture shows: nothing sent
      await np.click('.appbar [data-k="sync"]');
      await np.waitForTimeout(800);
      check('stable widget: a read that changes nothing it shows paints nothing', (await pics()).length === 1, `${(await pics()).length} sends`);
      // the phone already has these pictures (after a restart of the app): nothing sent either
      await np.evaluate(() => window.__stableWidgetFn());
      await np.waitForTimeout(500);
      check('stable widget: the phone’s key matches, so nothing is painted again', (await pics()).length === 1);
      // another pet comes out in Habitica: the Meadow follows, and so does the widget
      await post('/mock/set', { items: { currentPet: 'Fox-Base' } });
      await np.click('.appbar [data-k="sync"]');
      await np.waitForFunction(() => window.__nativeCalls.filter(c => c[0] === 'setStablePicture').length > 1, null, { timeout: 15000 }).catch(() => {});
      const all = await pics();
      check('stable widget: a new pet out in Habitica paints the widget again', all.length === 2 && all[1].key.includes('pet:Fox-Base') && !all[1].key.includes('pet:Wolf-Base'), `${all.length} sends`);
      // a tap on the widget opens the Stable
      await np.evaluate(() => window.__routeFn({ route: 'stable' }));
      await np.waitForTimeout(300);
      check('stable widget: a tap opens the Stable', (await np.locator('.navitem.active').getAttribute('aria-label')) === 'Stable');

      // the Stable wallpaper: scenery only once it's set (or being set from Settings), painted again only on a change
      const scen = () => calls('setStableScenery');
      check('stable wallpaper: nothing painted while it isn’t the wallpaper', (await scen()).length === 0);
      await np.click('.bottomnav button[aria-label="Settings"]');
      await np.waitForSelector('[data-k="native-wallpaper"]');
      check('stable wallpaper: Settings offers to set it', (await np.textContent('[data-k="native-wallpaper"]')).trim() === 'Set');
      await np.click('[data-k="native-wallpaper"]');
      await np.waitForFunction(() => window.__nativeCalls.some(c => c[0] === 'openStableWallpaper'), null, { timeout: 20000 }).catch(() => {});
      const order = await np.evaluate(() => window.__nativeCalls.map(c => c[0]).filter(n => n === 'setStableScenery' || n === 'openStableWallpaper'));
      check('stable wallpaper: Set paints the scenery first, then opens Android’s preview', JSON.stringify(order) === '["setStableScenery","openStableWallpaper"]', JSON.stringify(order));
      const sc = (await scen())[0];
      const look = sc ? await np.evaluate(async o => {
        const dec = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
        const bright = img => {
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let sum = 0; for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
          return Math.round(sum / (d.length / 4));
        };
        const lights = {};
        for (const l of ['dawn', 'day', 'dusk', 'night']) {
          const L = o.lights[l], bg = await dec(L.picture);
          const trees = await Promise.all(L.trees.map(async t => { const i = await dec(t.picture); return i.width > 0 && t.foot > t.top && t.foot <= o.world.h; }));
          lights[l] = { w: bg.width, h: bg.height, bright: bright(bg), shadow: /^#[0-9A-Fa-f]{6}$/.test(L.shadow), trees: trees.every(Boolean) };
        }
        const creatures = await Promise.all(o.creatures.map(async c => {
          const b = await dec(c.body), hd = c.head ? await dec(c.head) : null;
          return { id: c.id, fits: b.width === c.w && b.height === c.h && (!hd || (hd.width === c.w && hd.height === c.h)), head: !!hd, mount: c.mount, ax: c.ax >= 0 && c.ax < c.w };
        }));
        return { world: o.world, band: o.band, door: o.door, seed: Number.isInteger(o.seed), herd: typeof o.herdSeed === 'string', lights, creatures };
      }, sc) : null;
      check('stable wallpaper: four PNG backgrounds the size of the world for a 1080 × 2400 screen (540 × 1200), night darker than day',
        !!look && look.world.w === 540 && look.world.h === 1200 && ['dawn', 'day', 'dusk', 'night'].every(l => look.lights[l].w === 540 && look.lights[l].h === 1200 && look.lights[l].shadow && look.lights[l].trees) && look.lights.night.bright < look.lights.day.bright, JSON.stringify(look));
      check('stable wallpaper: the ground band and the stable’s door lie inside the world, with the seeds to wander by',
        !!look && look.band.top < look.band.bottom && look.band.bottom < 1200 && look.door.x > 0 && look.door.x < 540 && look.seed && look.herd, JSON.stringify(look && { band: look.band, door: look.door }));
      check('stable wallpaper: each creature out in Habitica comes with its picture (a mount with its head)',
        !!look && look.creatures.length === 2 && look.creatures.some(c => c.id === 'pet:Fox-Base' && !c.head && c.fits && c.ax) && look.creatures.some(c => c.id === 'mount:Dragon-Red' && c.head && c.fits && c.mount), JSON.stringify(look?.creatures));
      // riding in Habitica: the avatar goes with the mount, as the list of its pictures the phone fetches itself
      const rideOk = cr => Array.isArray(cr?.rider) && cr.rider.length >= 3 && cr.rider.every(p => /^[A-Za-z0-9_.-]+\.(png|gif)$/.test(p.file) && Number.isInteger(p.x) && Number.isInteger(p.y)) && cr.rider.some(p => p.y < 0);
      check('stable wallpaper: the ridden mount carries the avatar riding it (its pictures and where they sit), the pet none',
        !!sc && rideOk(sc.creatures.find(c => c.id === 'mount:Dragon-Red')) && !sc.creatures.find(c => c.id === 'pet:Fox-Base')?.rider, JSON.stringify(sc?.creatures.map(c => ({ id: c.id, rider: c.rider }))));
      if (sc) {
        // what the wallpaper shows at noon, for the screenshots: the background with the creatures where they'd stand first
        await np.evaluate(async o => {
          const dec = async src => { const i = new Image(); i.src = src; await i.decode(); return i; };
          const c = document.createElement('canvas'); c.width = o.world.w; c.height = o.world.h;
          const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
          g.drawImage(await dec(o.lights.day.picture), 0, 0);
          for (const t of o.lights.day.trees) g.drawImage(await dec(t.picture), t.left, t.top);
          const band = o.band;
          for (const [i, cr] of o.creatures.entries()) {
            const x = Math.round(o.world.w * (0.3 + 0.4 * i)), y = Math.round(band.top + (band.bottom - band.top) * 0.5);
            g.drawImage(await dec(cr.body), x - cr.ax, y - cr.h + 1);
            if (cr.head) g.drawImage(await dec(cr.head), x - cr.ax, y - cr.h + 1);
          }
          const d = document.createElement('div'); d.id = 'wallpaper-shot';
          d.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#000;display:flex;justify-content:center';
          c.style.cssText = 'height:100%;image-rendering:pixelated';
          d.appendChild(c); document.body.appendChild(d);
        }, sc);
        await np.waitForTimeout(200);
        await np.screenshot({ path: `${SHOTS}/45-stable-wallpaper.png` });
        await np.evaluate(() => document.getElementById('wallpaper-shot').remove());
      }
      // now it is the wallpaper, with the scenery the phone already has: nothing painted again
      await np.evaluate(() => { window.__stableWallpaper = { ...window.__stableWallpaper, set: true }; window.__stableWallpaperFn(); });
      await np.waitForTimeout(500);
      await np.click('.appbar [data-k="sync"]');
      await np.waitForTimeout(800);
      check('stable wallpaper: the phone’s key matches and a read changes nothing it shows, so nothing is painted again', (await scen()).length === 1, `${(await scen()).length} sends`);
      // another pet comes out in Habitica: the wallpaper follows
      await post('/mock/set', { items: { currentPet: 'Wolf-Base' } });
      await np.click('.appbar [data-k="sync"]');
      await np.waitForFunction(() => window.__nativeCalls.filter(c => c[0] === 'setStableScenery').length > 1, null, { timeout: 20000 }).catch(() => {});
      const sAll = await scen();
      check('stable wallpaper: a new pet out in Habitica paints the scenery again', sAll.length === 2 && sAll[1].creatures.some(c => c.id === 'pet:Wolf-Base') && !sAll[1].creatures.some(c => c.id === 'pet:Fox-Base'), `${sAll.length} sends`);
      const wolf = sAll[1]?.creatures.find(c => c.id === 'pet:Wolf-Base');
      check('stable wallpaper: the Wolf goes with its full-moon howl, and the notes it gives off with the scenery', !!wolf?.nature?.acts.some(a => a.id === 'howl') && !!sAll[1].particles?.note, JSON.stringify(Object.keys(sAll[1]?.particles ?? {})));
      // a new look on the avatar (different hair): the rider's pictures change, so the scenery is sent again
      const hairBefore = JSON.stringify(sAll[1]?.creatures.find(c => c.id === 'mount:Dragon-Red')?.rider);
      const prefsNow = (await mockState()).user.preferences;
      await post('/mock/set', { user: { preferences: { ...prefsNow, hair: { ...(prefsNow.hair || {}), color: 'blond' } } } });
      await np.click('.appbar [data-k="sync"]');
      await np.waitForFunction(() => window.__nativeCalls.filter(c => c[0] === 'setStableScenery').length > 2, null, { timeout: 20000 }).catch(() => {});
      const sHair = await scen();
      const hairAfter = JSON.stringify(sHair[2]?.creatures.find(c => c.id === 'mount:Dragon-Red')?.rider);
      check('stable wallpaper: a new look on the rider sends the scenery again with the new pictures', sHair.length === 3 && rideOk({ rider: JSON.parse(hairAfter || 'null') }) && hairAfter !== hairBefore, `${sHair.length} sends`);

      // the screen saver: the wallpaper's scenery with a clock, chosen in Android's own settings
      await np.click('.bottomnav button[aria-label="Settings"]');
      await np.waitForSelector('[data-k="native-dream"]');
      check('stable screen saver: Settings offers to choose it', (await np.textContent('[data-k="native-dream"]')).trim() === 'Choose');
      // the phone shows the Stable nowhere now: a change paints nothing, until Choose paints it, then opens Android's screen saver settings
      await np.evaluate(() => { window.__stableWallpaper = { ...window.__stableWallpaper, set: false }; window.__stableWallpaperFn(); });
      await post('/mock/set', { items: { currentPet: 'Fox-Base' } });
      await np.click('.appbar [data-k="sync"]');
      await np.waitForTimeout(800);
      check('stable screen saver: nothing painted while neither the wallpaper nor the screen saver shows the Stable', (await scen()).length === 3, `${(await scen()).length} sends`);
      const nCalls = await np.evaluate(() => window.__nativeCalls.length);
      await np.click('[data-k="native-dream"]');
      await np.waitForFunction(() => window.__nativeCalls.some(c => c[0] === 'openStableDream'), null, { timeout: 20000 }).catch(() => {});
      const dOrder = await np.evaluate(n => window.__nativeCalls.slice(n).map(c => c[0]).filter(c => c === 'setStableScenery' || c === 'openStableDream'), nCalls);
      const dScen = (await scen())[3];
      check('stable screen saver: Choose paints the scenery first (with the change), then opens Android’s screen saver settings',
        JSON.stringify(dOrder) === '["setStableScenery","openStableDream"]' && !!dScen && dScen.creatures.some(c => c.id === 'pet:Fox-Base'), JSON.stringify(dOrder));
      // chosen in Android's settings: Settings says so
      await np.evaluate(() => { window.__statusPatch = { stableDream: true }; window.__stableWallpaper = { ...window.__stableWallpaper, set: true }; });
      await np.waitForTimeout(2100); // Settings asks the phone at most every 2 s
      await np.click('.bottomnav button[aria-label="Tasks"]');
      await np.waitForTimeout(200);
      await np.click('.bottomnav button[aria-label="Settings"]');
      await np.waitForSelector('[data-k="native-dream"]');
      check('stable screen saver: once chosen, Settings says it shows while the phone charges', (await np.textContent('[data-k="native-dream"]')).trim() === 'Change'
        && /show while the phone charges/.test(await np.evaluate(() => document.querySelector('[data-k="native-dream"]').closest('li').textContent)));
      await np.evaluate(() => { window.__statusPatch = {}; });
      await np.click('.bottomnav button[aria-label="Stable"]');
      await np.waitForTimeout(200);
      // the postcard on the phone: the rider's pictures came through the phone, so the card carries the avatar, and Share hands it to Android
      {
        await np.waitForFunction(() => window.__stablePg?.herd.creatures.some(c => c.rider && c.rider.length), null, { timeout: 10000 }).catch(() => {});
        await np.click('[data-k="pg-postcard"]');
        await np.waitForSelector('.sheet.open[data-k="postcard"]');
        await np.waitForTimeout(300);
        const ui = await np.evaluate(() => ({ rider: !!document.querySelector('[data-k="postcard-rider"]'), action: document.querySelector('.sheet.open .sheet-actions .primary').textContent.trim() }));
        await np.click('.sheet.open .sheet-actions .primary');
        await np.waitForTimeout(500);
        const shared = await calls('sharePicture');
        const look = shared.length ? await np.evaluate(async url => {
          const img = new Image(); img.src = url; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
          const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data;
          let magenta = 0; for (let i = 0; i < d.length; i += 4) if (d[i] === 255 && d[i + 1] === 0 && d[i + 2] === 255) magenta++;
          return { w: c.width, h: c.height, magenta };
        }, shared[0].picture) : null;
        const fetched = await calls('avatarPicture');
        check('postcard on the phone: the avatar’s pictures come through the phone (no token, no canvas taint), so the rider is on the card',
          fetched.length > 0 && fetched.every(f => /^[A-Za-z0-9_.-]+\.(png|gif)$/.test(f.file)) && !ui.rider && !!look && look.magenta > 100, JSON.stringify({ fetched: fetched.length, ui, look }));
        check('postcard on the phone: Share hands one PNG to Android’s share sheet and the meadow moves again',
          ui.action === 'Share' && shared.length === 1 && Object.keys(shared[0]).join() === 'picture' && /^data:image\/png;base64,/.test(shared[0].picture) && look.w >= 1080
            && (await np.evaluate(() => window.__stablePg.stage.running)), JSON.stringify({ ui, n: shared.length, look }));
      }
      await post('/mock/set', { items: { currentPet: '', currentMount: '' } });
      await np.click('.bottomnav button[aria-label="Tasks"]');
      await np.waitForTimeout(200);
    }

    // Relaxed on the phone: Night gear pauses, the notification loses its crit line, the widget shows the day
    {
      await np.click('.bottomnav button[aria-label="Settings"]');
      await np.waitForSelector('[data-k="mode-relaxed"]');
      const n0 = (await calls('setNightGear')).length;
      await np.click('[data-k="mode-row-relaxed"]');
      await np.waitForTimeout(400);
      const night = (await calls('setNightGear')).slice(n0);
      const rl = await lastLines();
      const bar = await np.evaluate(() => { const b = document.querySelector('.appbar'); return { cls: b.className, color: getComputedStyle(b.querySelector('.appbar-title .compact')).backgroundColor, head: b.querySelector('.headline')?.textContent.trim() || '' }; });
      check('relaxed (phone): Night gear pauses, its times kept', night.length === 1 && night[0].on === false && night[0].swapAt === 1410 && (await np.locator('[data-k="night-paused"]').count()) === 1, JSON.stringify(night));
      check('relaxed (phone): the notification has no crit line, Dailies left and the widget on', rl.relaxed === true && !rl.lines.includes('crit') && rl.lines.includes('dailies') && rl.lines.includes('countdown') && rl.widget === true, JSON.stringify(rl));
      check('relaxed (phone): a deadly day change turns the title pill red, never amber', /\bdanger\b/.test(bar.cls) && !/\bcrit\b/.test(bar.cls) && bar.color === 'rgb(198, 40, 40)', `${bar.cls} · ${bar.color}`);
      await np.click('.bottomnav button[aria-label="Now"]');
      await np.waitForTimeout(300);
      const head = (await np.textContent('.appbar .headline')).trim();
      const sub = (await np.textContent('.appbar .hero-sub')).trim();
      check('relaxed (phone): the bubble says the warning first: what to finish and the day change', head === 'Your HP is in danger' && /^The day change would take all of it\. (Finish .+|Pause damage in Habitica) first; new day in .+\.$/.test(sub), `${head} · ${sub}`);
      await np.screenshot({ path: `${SHOTS}/43-relaxed-danger.png` });
      // the day changes at day start in the account's time zone (Habitica's cron uses it; this app never moves it), not the phone's
      {
        const prefs = (await mockState()).user.preferences;
        const away = new Date().getTimezoneOffset() + 240; // the account 4 h further west, as after a trip
        const npSync = async () => { await np.click('.appbar [data-k="sync"]'); await np.waitForTimeout(100); await np.waitForFunction(() => !document.querySelector('.sync.spin'), null, { timeout: 15000 }); };
        await post('/mock/set', { user: { preferences: { ...prefs, timezoneOffset: away } } });
        await npSync();
        const sub2 = (await np.textContent('.appbar .hero-sub')).trim();
        const day = 864e5, into = (((Date.now() - away * 6e4 - prefs.dayStart * 36e5) % day) + day) % day, want = Math.floor((day - into) / 6e4);
        const m = /new day in (?:(\d+) h ?)?(?:(\d+) min)?/i.exec(sub2), got = m ? Number(m[1] || 0) * 60 + Number(m[2] || 0) : -1;
        check('relaxed (phone): the day changes at day start in the account’s time zone, not the phone’s', Math.abs(got - want) <= 1, `${sub2} (want ${want} min)`);
        await post('/mock/set', { user: { preferences: prefs } });
        await npSync();
      }
      await np.click('.bottomnav button[aria-label="Settings"]');
      await np.waitForSelector('[data-k="mode-full"]');
      const n1 = (await calls('setNightGear')).length;
      await np.click('[data-k="mode-row-full"]');
      await np.waitForTimeout(400);
      const back = (await calls('setNightGear')).slice(n1);
      check('relaxed (phone): back to Full, Night gear resumes', back.length === 1 && back[0].on === true && (await lastLines()).lines.includes('crit'), JSON.stringify(back));      // leave Settings as the checks below expect to open it afresh
      await np.click('.bottomnav button[aria-label="Tasks"]');
      await np.waitForTimeout(200);
    }

    // notifications blocked in Android's settings: Settings says so, with a button to Android's screen for the app
    check('notification: nothing about blocked notifications while they show', (await np.locator('[data-k="notif-blocked"]').count()) === 0);
    await np.evaluate(() => { window.__statusPatch = { notificationsEnabled: false }; });
    await np.waitForTimeout(2100); // Settings asks the phone at most every 2 s
    await np.click('.bottomnav button[aria-label="Settings"]');
    const blocked = await np.waitForSelector('[data-k="notif-blocked"]', { timeout: 5000 }).then(e => e.textContent(), () => '');
    await np.click('[data-k="notif-open-settings"]');
    await np.waitForTimeout(100);
    check('notification: blocked notifications are explained, with a button to Android’s settings', /Notifications are blocked for Sidekick/.test(blocked) && (await calls('openNotificationSettings')).length === 1, blocked);

    // a backup on the phone goes through Android's save dialog, never as a download, and without the token
    {
      const m0 = await np.evaluate(() => window.__snacks.length);
      await np.click('[data-k="backup"]');
      await np.waitForTimeout(400);
      const saved = await calls('saveFile');
      const f = saved[saved.length - 1];
      const snack = await np.evaluate(m => window.__snacks.slice(m).join(' | '), m0);
      check('backup (phone): handed to Android’s save dialog by name, without the token or User ID', saved.length === 1 && /^sidekick-backup-\d{4}-\d\d-\d\d\.json$/.test(f.name)
        && JSON.parse(f.text).app === 'Sidekick for Habitica' && !f.text.includes(TOKEN) && !f.text.includes(UID) && /Backup saved/.test(snack), `${f?.name} · ${snack}`);
      await np.evaluate(() => { window.__saveCancel = true; });
      const m1 = await np.evaluate(() => window.__snacks.length);
      await np.click('[data-k="backup"]');
      await np.waitForFunction(m => window.__snacks.slice(m).some(t => /backup/i.test(t)), m1, { timeout: 8000 }).catch(() => {});
      const snack2 = await np.evaluate(m => window.__snacks.slice(m).join(' | '), m1);
      check('backup (phone): backing out of the save dialog says nothing was saved', /No backup saved/.test(snack2), snack2);
    }
    // phones that put apps to sleep: On this phone says where Samsung, Xiaomi and Huawei hide the switch
    {
      await np.click('[data-k="keep-running"]');
      const txt = await np.waitForSelector('.sheet.open [data-k="keep-running-sheet"]', { timeout: 5000 }).then(e => e.textContent(), () => '');
      await np.locator('.sheet.open .sheet-actions button', { hasText: 'Done' }).click();
      await np.waitForTimeout(300);
      check('keep running: a row on the phone explains battery savers, maker by maker', /Samsung:.*Sleeping apps/.test(txt) && /Xiaomi.*Autostart/.test(txt) && /Huawei.*App launch/.test(txt) && /Unrestricted/.test(txt) && !(await np.isVisible('.sheet.open')), txt.slice(0, 120));
    }

    // logging out while the phone's night gear is on: asked first, and "Put it back" equips what was worn before
    {
      const st = await mockState();
      const eq = st.user.items.gear.equipped;
      const owned = Object.keys(st.user.items.gear.owned).filter(k => st.user.items.gear.owned[k]);
      let slot = '', before = '';
      for (const s of ['armor', 'head', 'headAccessory', 'eyewear', 'body', 'back']) {
        const alt = owned.find(k => k.startsWith(`${s}_`) && !k.endsWith('_base_0') && k !== eq[s]);
        if (alt) { slot = s; before = alt; break; }
      }
      const base = { ...eq, [slot]: before };
      await np.evaluate(b => { window.__statusPatch = { night: { on: true, mode: 'int', swapAt: 1410, backOn: true, backAt: 480, phase: 'swapped', last: '', lastAt: 0, base: JSON.stringify(b) } }; }, base);
      const cleared0 = (await calls('clearCredentials')).length;
      await np.click('.appbar button[aria-label="Menu"]');
      await np.click('[data-k="menu-logout"]');
      await np.waitForSelector('.sheet.open', { timeout: 5000 });
      const title = (await np.textContent('.sheet.open .sheet-title')).trim();
      const labels = await np.$$eval('.sheet.open .sheet-actions button', bs => bs.map(b => b.textContent.trim()));
      check('log out: with night gear on, the phone asks to put the gear back first', title === 'Your night gear is still on' && labels.includes('Put it back and log out') && labels.includes('Log out anyway'), `${title}: ${labels.join(' / ')}`);
      await np.locator('.sheet.open .sheet-actions button', { hasText: 'Put it back and log out' }).click();
      await np.waitForSelector('.ob', { timeout: 15000 }).catch(() => {});
      const after = (await mockState()).user.items.gear.equipped;
      check('log out: "Put it back" equips the gear from before the night swap, then logs out', !!slot && after[slot] === before && (await np.locator('.ob').count()) === 1 && (await calls('clearCredentials')).length > cleared0,
        `${slot}: ${eq[slot]} → ${after[slot]} (want ${before})`);
    }
    await nctx.close();
    await post('/mock/set', { stats: { hp: 50 } });
  }
};
