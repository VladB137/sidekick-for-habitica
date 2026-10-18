// e2e: The Stable. Run by tests/e2e.cjs, in order, on its one page: each part starts where the one before it left off.
module.exports = async ({ API, ITEMS, SHOTS, UID, check, idle, mark, mockLog, mockState, page, post, snackAfter, stableSeen, sync, tab }) => {
  // ------------------------------------------------------------------ 14c. the Stable: shifting nav motion, the stage, full screen, Back, the Stats card
  {
    const navW = () => page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.bottomnav .navitem')].map(b => [b.getAttribute('aria-label'), b.getBoundingClientRect().width])));
    const iconY = name => page.evaluate(n => document.querySelector(`.bottomnav [aria-label="${n}"] .icon`).getBoundingClientRect().top, name);
    const before = await navW(); const yBefore = await iconY('Stable');
    // every frame of the first second: the canvas's box and backing store and the world's size, once there is a canvas
    await page.evaluate(() => {
      const seen = [], t0 = performance.now();
      window.__stableSizes = new Promise(done => {
        const f = () => {
          const c = document.querySelector('#stable-stage canvas.pg-canvas'), w = window.__stablePg?.world;
          // a new canvas's default 300 x 150 is resized before it is first painted (stage.ts), so it isn't counted
          if (c && c.width !== 300) {
            const k = `${c.clientWidth}x${c.clientHeight} back ${c.width}x${c.height} world ${w?.w}x${w?.h}`;
            if (seen[seen.length - 1] !== k) seen.push(k);
          }
          if (performance.now() - t0 < 1200) requestAnimationFrame(f); else done({ seen, vw: innerWidth, vh: innerHeight });
        };
        requestAnimationFrame(f);
      });
    });
    await page.click('.bottomnav button[aria-label="Stable"]');
    await page.waitForTimeout(70);
    const mid = await navW();
    await page.waitForTimeout(400);
    const after = await navW(); const yAfter = await iconY('Stable');
    check('shifting nav: the new tab widens and the old one narrows over time, not at once',
      before.Stable < mid.Stable && mid.Stable < after.Stable - 1 && after.Now < before.Now && after.Stable >= 96 && Math.round(after.Now) >= 56,
      `Stable ${before.Stable | 0} → ${mid.Stable | 0} → ${after.Stable | 0}, Now ${before.Now | 0} → ${after.Now | 0}`);
    check('shifting nav: the current icon lifts to make room for its label', yAfter < yBefore - 4, `${yBefore} → ${yAfter}`);
    const stage = await page.evaluate(() => { const r = document.getElementById('stable-stage')?.getBoundingClientRect(); return r && [r.top, r.left, r.width, r.height, innerWidth, innerHeight]; });
    check('Stable: the stage covers the whole window under the chrome', !!stage && stage[0] === 0 && stage[1] === 0 && stage[2] === stage[4] && stage[3] === stage[5], JSON.stringify(stage));
    {
      // the screen's fade must not move the stage: a transform on <main> would size it to main, then to the window (a jump)
      const sz = await page.evaluate(() => window.__stableSizes);
      check('Stable: opening the tab lays the meadow out once, at the window\u2019s size, with no resize or jump after', sz.seen.length === 1 && sz.seen[0].startsWith(`${sz.vw}x${sz.vh} `), JSON.stringify(sz));
    }
    const pg = () => page.evaluate(() => { const p = window.__stablePg; return p && { running: p.stage.running, still: p.stage.still, frames: p.stage.stats.frames, who: p.herd.creatures.map(c => c.id).join(','), hint: !p.hint.hidden, insets: { ...p.world.insets }, canvas: document.querySelector('#stable-stage > canvas.pg-canvas') === p.stage.canvas }; });
    await page.waitForTimeout(300);
    let st = await pg();
    check('Stable: the meadow mounts at once on the stage and starts', (await page.evaluate(() => window.__stableLog.join(','))) === 'mount chrome,show' && st?.canvas && st.running && !st.still && (await page.locator('#stable-stage .stable-empty').count()) === 0, JSON.stringify(st));
    const hintAt = Date.now();
    check('Stable: with no pet or mount out, the meadow says how to bring one', st?.who === '' && st.hint && /Choose one in Habitica/.test(await page.textContent('.stable-hint')), JSON.stringify(st));
    await page.screenshot({ path: `${SHOTS}/26-stable.png` });
    const fps = await page.evaluate(() => new Promise(done => { const s = window.__stablePg.stage.stats, f0 = s.frames, t0 = performance.now(); setTimeout(() => done((s.frames - f0) * 1000 / (performance.now() - t0)), 2000); }));
    check('Stable: the meadow draws at most 30 frames a second', fps >= 15 && fps <= 31, `${fps.toFixed(1)} fps`);
    {
      // the empty meadow's notice goes by itself after 7 s (shown about a second before hintAt), and a read with the same words doesn't bring it back
      const gone = await page.waitForFunction(() => document.querySelector('.stable-hint').hidden, null, { timeout: 10000, polling: 100 }).then(() => Date.now() - hintAt, () => -1);
      await sync(); await page.waitForTimeout(300);
      const back = await page.evaluate(() => !document.querySelector('.stable-hint').hidden);
      check('Stable: the empty meadow\u2019s notice disappears on its own after 7 seconds, and the next read leaves it gone', gone >= 5800 && gone <= 8000 && !back, JSON.stringify({ gone, back }));
    }
    const sheets = [], seenBefore = new Set(stableSeen);   // the feeding plan on Stats may have drawn this pet from the same sheet already
    const onReq = r => { if (!r.url().startsWith('data:')) sheets.push(new URL(r.url()).pathname); };
    page.on('request', onReq);
    await post('/mock/set', { items: { currentPet: 'Wolf-Base', currentMount: 'Dragon-Red' } });
    await sync(); await page.waitForTimeout(300);
    st = await pg();
    check('Stable: a read brings out the account’s current pet and mount, and leaves the stage alone', st.who === 'pet:Wolf-Base,mount:Dragon-Red' && !st.hint && st.canvas && (await page.evaluate(() => window.__stableLog.join(','))) === 'mount chrome,show', JSON.stringify(st));
    const nat = await page.evaluate(() => { const p = window.__stablePg, ls = p.world.layers.map(l => `${l.id}:${l.depth}`); return { natures: p.herd.creatures.map(c => `${c.id}:${c.nature ? c.nature.traits.join('+') || 'plain' : 'none'}`).join(','), spots: [...new Set(p.scene.spots(p.world).map(s => s.kind))].sort().join(','), glows: ls.indexOf('glows:back'), herd: ls.indexOf('creatures:front') }; });
    check('Stable: each creature brings its species’ nature (a mount its own extras), and the scene names its places', nat.natures === 'pet:Wolf-Base:snowLover+howl,mount:Dragon-Red:flame+sail' && /sun/.test(nat.spots), JSON.stringify(nat));
    check('Stable: the lights some creatures give off lie on the ground, under everyone', nat.glows > 0 && nat.herd > nat.glows, JSON.stringify(nat));
    {
      // hide and seek (stable ideas §12): with a pet and a mount out, at noon on the herd's clock, today's pet walks behind the
      // hiding spot (the other checks keep everyone out with __noHide)
      const P = () => page.evaluate(uid => {
        const p = window.__stablePg, h = p.play.hider;
        return { pg: p.state().current, hider: h ? h.id : null, hidden: !!h && h.clipBelow !== undefined, rec: JSON.parse(localStorage.getItem('critoracle:v2:play') || '{}')[uid] || null, label: p.stage.canvas.getAttribute('aria-label') };
      }, UID);
      let st;
      await page.evaluate(() => { const o = window.__stablePg.herd.o; window.__clock0 = o.clock; o.clock = () => new Date(2026, 5, 1, 12); window.__noHide = false; });
      await page.waitForFunction(() => { const h = window.__stablePg.play.hider; return h && h.clipBelow !== undefined; }, null, { timeout: 25000 }).catch(() => null);
      st = await P();
      check('hide and seek: a pet hides behind the spot, peeking, and TalkBack says so', !!st.hider && st.hider.startsWith('pet:') && st.hidden && /Someone is hiding behind the /.test(st.label), JSON.stringify(st));
      await page.screenshot({ path: `${SHOTS}/31e-stable-hiding.png` });
      const at = await page.evaluate(() => {
        const p = window.__stablePg, s = p.play.spot, f = p.stage.fit, r = p.stage.canvas.getBoundingClientRect(), d = devicePixelRatio;
        // the middle of the spot's solid part
        const x = s.x, y = s.solidTop() + 9;
        return [r.left + (x * f.scale + f.offX) / d, r.top + (y * f.scale + f.offY) / d];
      });
      await page.touchscreen.tap(at[0], at[1]);
      await page.waitForTimeout(400);
      const was = st.hider;
      st = await P();
      const today = await page.evaluate(() => { const n = new Date(), p = v => String(v).padStart(2, '0'); return `${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())}`; });
      check('hide and seek: a tap on the spot finds it: out in front, kept as found just now', !st.hider && st.rec?.found?.[st.pg]?.startsWith(`${today}T`) && !/hiding behind/.test(st.label)
        && (await page.evaluate(id => { const c = window.__stablePg.herd.byId(id); return !c.busy && c.off === 0 && c.clipBelow === undefined; }, was)), JSON.stringify(st));
      await page.screenshot({ path: `${SHOTS}/31f-stable-found.png` });
      await page.waitForTimeout(2500);
      check('hide and seek: just found, nobody hides again for now', !(await P()).hider);
      await page.evaluate(() => { window.__noHide = true; window.__stablePg.herd.o.clock = window.__clock0; });
    }
    {
      // the crits landed in the app today, before anyone lived here: one celebration, from your Habitica pet, once it's out
      const c = await page.evaluate(uid => { const p = window.__stablePg, d = p.today(); return { at: p.journal().filter(e => e.day === d).map(e => e.at), crits: window.__stableCrits || [], seen: JSON.parse(localStorage.getItem('critoracle:v2:stable-crit') || '{}')[uid] }; }, UID);
      const last = Math.max(...c.at);
      // (the journal is only in memory in this run: a reload before here leaves no crits to celebrate)
      check('Stable reactions: today’s crits set off confetti and a spinning hop from your pet once it’s here, once',
        c.at.length ? c.crits.join() === `pet:Wolf-Base@${last}` && c.seen === last : !c.crits.length && c.seen === undefined, JSON.stringify({ crits: c.crits, seen: c.seen, n: c.at.length }));
    }
    page.off('request', onReq);
    const own = sheets.filter(u => u.includes('/stable/'));
    // a sheet another screen already showed (the feeding card draws hatchable pets) may come from the page's memory cache with no request at all
    const want = ['/stable/pet/Wolf-Base.png', '/stable/mount/Dragon-Red.png'];
    check('Stable: their sheets come from the app itself, once each, and nothing else is fetched for them', own.length <= 2 && new Set(own).size === own.length && own.every(u => want.some(w => u.endsWith(w))) && sheets.filter(u => !u.includes('/stable/')).every(u => /\/api\/v3\/(user|tasks|groups|content|status)/.test(u)), sheets.join(' '));
    // freeze the loop (as the host does on hide), find a painted pixel of the pet and tap it there
    const spot = await page.evaluate(() => {
      const p = window.__stablePg, c = p.herd.creatures.find(x => x.id === 'pet:Wolf-Base'), b = p.world.box(c);
      p.stage.setShown(false);
      const r = p.stage.canvas.getBoundingClientRect(), f = p.stage.fit, k = r.width / f.backW;
      for (let y = b.y + (b.h >> 1); y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) {
        if (p.world.hitTest(x, y) === c) return { x: r.left + (f.offX + (x + 0.5) * f.scale) * k, y: r.top + (f.offY + (y + 0.5) * f.scale) * k };
      }
      return null;
    });
    if (spot) await page.mouse.click(spot.x, spot.y);
    const petted = await page.evaluate(() => { const p = window.__stablePg; const n = p.herd.particles.filter(q => q.kind === 'heart').length; const t = p.world.layers.find(l => l.id === 'name-tags').showing().join(); p.stage.setShown(true); return { n, t }; });
    check('Stable: tapping the pet where it is painted pets it (a heart)', !!spot && petted.n > 0, JSON.stringify({ spot, petted }));
    check('name tag: the tap also shows its name over its head', petted.t === 'pet:Wolf-Base', JSON.stringify(petted));
    {
      // P4, off the ground (trees, sky and flowers): up onto the horizon tree's crown, no shadow, a tap leaves it up there
      const up = await page.evaluate(() => new Promise(done => {
        const p = window.__stablePg, c = p.herd.creatures.find(x => x.id === 'pet:Wolf-Base'), b = p.herd.band;
        const tree = p.scene.spots(p.world).find(s => s.kind === 'tree');
        c.setPos(tree.x, Math.min(b.bottom, Math.max(b.top, tree.y))); c.tx = c.fx; c.ty = c.fy; c.idle(9999);
        c.st = 'act'; c.busy = 'act'; c.act = { a: { id: 'e2e', at: 'tree', script: [{ n: 9999, perch: 1 }] }, i: 0, t: 0, n: 9999, loops: 1 };
        const want = c.y - (tree.y - tree.h);
        setTimeout(() => {
          const hearts = p.herd.particles.filter(q => q.kind === 'heart').length;
          p.herd.pet(c.id);
          const r = { off: c.off, want, top: c.frame(p.world).top - Math.round(c.off / 3) * 3, crown: tree.y - tree.h, stays: c.st === 'act' && c.off === want, heart: p.herd.particles.filter(q => q.kind === 'heart').length > hearts };
          c.idle(30);
          setTimeout(() => done({ ...r, down: c.off === 0 && !c.act }), 200);
        }, 300);
      }));
      check('Stable: a perch lifts a creature to the top of the tree it stands at, a tap gives a heart and it stays up, and it comes down whole', up.off === up.want && up.want > 0 && up.top + 1 < up.crown && up.stays && up.heart && up.down, JSON.stringify(up));
    }
    // full screen: the chrome slides off, Back brings it back
    await page.click('[data-k="stable-full"]'); await page.waitForTimeout(400);
    const offscreen = await page.evaluate(() => {
      const bar = document.querySelector('.appbar-top').getBoundingClientRect(); const nav = document.querySelector('.bottomnav').getBoundingClientRect();
      return bar.bottom <= 0 && nav.top >= innerHeight && document.querySelector('.appbar').inert && document.querySelector('.bottomnav').inert;
    });
    check('Stable full screen: app bar and navigation slide away and can’t be reached', offscreen && (await page.evaluate(() => location.hash)) === '#stable');
    check('Stable full screen: the playground is told, not re-mounted, and its world reaches the edges', (await page.evaluate(() => window.__stableLog.join(','))) === 'mount chrome,show,full' && (await pg()).insets.top < st.insets.top && (await pg()).insets.bottom < st.insets.bottom, JSON.stringify([st.insets, (await pg()).insets]));
    await page.screenshot({ path: `${SHOTS}/27-stable-full.png` });
    const exitBtn = await page.evaluate(() => { const b = document.querySelector('[data-k="stable-exit"]'), r = b?.getBoundingClientRect(); return b && { label: b.getAttribute('aria-label'), icon: b.querySelector('.icon') && getComputedStyle(b).display, left: r.left, top: r.top, w: r.width, h: r.height, onTop: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-k="stable-exit"]') === b }; });
    check('Stable full screen: a Back button of its own in the top left corner, where the app bar’s was', !!exitBtn && exitBtn.label === 'Back' && exitBtn.left <= 16 && exitBtn.top <= 16 && exitBtn.w === 40 && exitBtn.h === 40 && exitBtn.onTop, JSON.stringify(exitBtn));
    await page.goBack(); await page.waitForTimeout(400);
    check('Stable full screen: Back leaves full screen, still on the Stable', await page.evaluate(() => !document.getElementById('app').classList.contains('stable-full') && document.querySelector('.bottomnav').getBoundingClientRect().bottom <= innerHeight + 1 && !document.querySelector('.bottomnav').inert && document.querySelector('.navitem.active').getAttribute('aria-label') === 'Stable'));
    const noExit = await page.locator('[data-k="stable-exit"]').count();
    await page.click('[data-k="stable-full"]'); await page.waitForTimeout(400);
    await page.click('[data-k="stable-exit"]'); await page.waitForTimeout(400);
    check('Stable full screen: its Back button leaves it as Back does (and is only there in full screen)', noExit === 0 && await page.evaluate(() => !document.getElementById('app').classList.contains('stable-full') && location.hash === '#stable' && !history.state?.full && !document.querySelector('[data-k="stable-exit"]') && document.querySelector('.navitem.active').getAttribute('aria-label') === 'Stable'));
    await tab('Settings');
    check('Stable: leaving the screen stops and releases the playground', (await page.evaluate(() => window.__stableLog.slice(-2).join(',') === 'hide,destroy' && !window.__stablePg.stage.running && !window.__stablePg.stage.canvas.isConnected)));
    // the Stats card opens the Stable full screen; Back returns to Stats
    await tab('Stats');
    {
      // a still picture of the meadow with who lives there: painted once at the world's size (16:9), not blank, kept crisp, no frame loop
      await page.waitForSelector('[data-k="stable-thumb"][data-shown="2"]', { timeout: 5000 }).catch(() => {});
      const pic = await page.evaluate(async () => {
        const img = document.querySelector('[data-k="stable-thumb"]');
        if (!img) return null;
        await img.decode().catch(() => {});
        const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data; const colours = new Set();
        for (let i = 0; i < d.length; i += 4) colours.add((d[i] << 16) | (d[i + 1] << 8) | d[i + 2]);
        return { w: img.naturalWidth, h: img.naturalHeight, colours: colours.size, sharp: getComputedStyle(img).imageRendering, canvases: document.querySelectorAll('main canvas').length, shown: img.dataset.shown };
      });
      check('Stats card: a still picture of the meadow with its two creatures', !!pic && pic.w === 480 && pic.h === 270 && pic.colours > 12 && pic.sharp === 'pixelated' && pic.canvases === 0 && pic.shown === '2', JSON.stringify(pic));
      check('Stats card: counts the creatures Habitica has out, before any choice', /Meadow · 2 creatures\./.test(await page.textContent('[data-k="stable-card-sub"]')));
    }
    await page.click('[data-k="open-stable"]'); await page.waitForTimeout(400);
    check('Stats card: opens the Stable full screen', await page.evaluate(() => document.getElementById('app').classList.contains('stable-full') && !!document.querySelector('#stable-stage > canvas.pg-canvas') && /^mount \{.*"full":true/.test(window.__stableLog.slice(-2)[0]) && window.__stableLog.slice(-1)[0] === 'show'));
    await page.goBack(); await page.waitForTimeout(400);
    check('Stats card: Back returns to Stats', await page.evaluate(() => document.querySelector('.navitem.active').getAttribute('aria-label') === 'Stats' && !document.getElementById('app').classList.contains('stable-full') && window.__stableLog.slice(-2).join(',') === 'hide,destroy'));
    await page.click('[data-k="open-stable"]'); await page.waitForTimeout(400);
    await page.click('[data-k="stable-exit"]'); await page.waitForTimeout(400);
    check('Stats card: the Stable’s own Back button returns to Stats too', await page.evaluate(() => document.querySelector('.navitem.active').getAttribute('aria-label') === 'Stats' && !document.getElementById('app').classList.contains('stable-full') && window.__stableLog.slice(-2).join(',') === 'hide,destroy'));
    // the notification's Tasks button while in full screen: Tasks, and Back from there still reaches Now
    await page.click('[data-k="open-stable"]'); await page.waitForTimeout(400);
    await page.evaluate(() => window.__navigate('tasks')); await page.waitForTimeout(500);
    const onTasks = await page.evaluate(() => location.hash === '#tasks' && !document.getElementById('app').classList.contains('stable-full'));
    await page.goBack(); await page.waitForTimeout(400);
    check('Stable full screen: a route to Tasks leaves it, and Back from Tasks goes to Now', onTasks && (await page.evaluate(() => location.hash)) === '#now');
    // reduced motion: a still picture, drawn once, with the pet and mount in it
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await tab('Stable'); await page.waitForTimeout(400);
    const s0 = await pg(); await page.waitForTimeout(600); const s1 = await pg();
    check('Stable under reduced motion: a still picture with the pet and mount, no frame loop', s1.still && !s1.running && s1.frames >= 1 && s1.frames === s0.frames && s1.who === 'pet:Wolf-Base,mount:Dragon-Red', JSON.stringify([s0, s1]));
    await page.screenshot({ path: `${SHOTS}/28-stable-pets.png` });
    await page.emulateMedia({ reducedMotion: null });

    // ---------------------------------------------------------------- 14d. pet picking: playgrounds, the picker, one playground per creature
    await post('/mock/set', { items: {
      pets: { 'Wolf-Base': 5, 'Fox-Desert': 10, 'Owl-Base': 5, 'Dragon-Golden': -1, 'Deer-Base': 0 },
      mounts: { 'Dragon-Red': true, 'Dragon-Golden': true, 'Horse-Base': null },
    } });
    await sync(); await page.waitForTimeout(300);
    const stored = () => page.evaluate(uid => JSON.parse(localStorage.getItem('critoracle:v2:stable') || '{}')[uid], UID);
    const pgState = () => page.evaluate(() => window.__stablePg.state());
    const herdIds = () => page.evaluate(() => window.__stablePg.herd.creatures.map(c => c.id).sort().join(','));
    // the names the Stable gave (seeded by the account, so read back rather than guessed)
    const names = () => page.evaluate(uid => JSON.parse(localStorage.getItem('critoracle:v2:names') || '{}')[uid] || {}, UID);
    const nm = async id => (await names())[id]?.name;
    let fox;
    const localToday = await page.evaluate(() => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; });
    const api = [];
    const onApi = r => { if (r.url().startsWith(API)) api.push(new URL(r.url()).pathname); };
    page.on('request', onApi);
    {
      const bar = await page.evaluate(() => ({
        name: document.querySelector('[data-k="pg-switch"] .pg-name')?.textContent, count: document.querySelector('[data-k="pg-count"]')?.textContent,
        chips: [...document.querySelectorAll('.pg-row .pg-chip:not(.add)')].map(b => b.getAttribute('aria-label')), add: !!document.querySelector('[data-k="pg-add"]'),
        barBottom: document.querySelector('.pg-bar').getBoundingClientRect().bottom, rowTop: document.querySelector('.pg-row').getBoundingClientRect().top,
        navTop: document.querySelector('.bottomnav').getBoundingClientRect().top, appBottom: document.querySelector('.appbar-top').getBoundingClientRect().bottom,
      }));
      check('Stable picking: the Meadow (the first playground) shows who is out in Habitica, as chips in the row with a + to add more (the ridden mount says so)',
        bar.name === 'Meadow' && bar.count === '2 of 10' && bar.chips.join() === `${await nm('pet:Wolf-Base')}, Base Wolf,${await nm('mount:Dragon-Red')}, Red Dragon mount, you’re riding it` && bar.add, JSON.stringify(bar));
      const n0 = await names();
      check('names: everyone in a playground has one from the list, different from each other, kept on the phone from today', Object.keys(n0).sort().join() === 'mount:Dragon-Red,pet:Wolf-Base'
        && Object.values(n0).every(r => /^\S/.test(r.name) && r.name.length <= 12 && !r.own && r.since === localToday) && n0['pet:Wolf-Base'].name !== n0['mount:Dragon-Red'].name, JSON.stringify(n0));
      check('Stable picking: the toolbar sits under the app bar and the row over the navigation', Math.abs(bar.barBottom - bar.appBottom - 48) <= 1 && Math.abs(bar.navTop - bar.rowTop - 64) <= 1, JSON.stringify(bar));
    }
    await page.click('[data-k="pg-picker"]'); await page.waitForSelector('.pk-dialog.open'); await page.waitForTimeout(300);
    {
      const pk = await page.evaluate(() => ({
        title: document.querySelector('.pk-dialog .fsd-title').textContent, tabs: [...document.querySelectorAll('.pk-tab')].map(t => t.textContent),
        tiles: [...document.querySelectorAll('#pk-pane-pet .pk-tile')].map(t => t.dataset.k), chosen: [...document.querySelectorAll('.pk-chip')].map(c => c.textContent),
        tally: document.querySelector('.pk-tally').textContent, sel: [...document.querySelectorAll('.pk-tile.sel')].map(t => t.dataset.k),
      }));
      check('picker: Pets and Mounts tabs count what the account owns (raised, released and unknown ones left out)',
        pk.title === 'Meadow' && pk.tabs.join('|') === 'Pets · 3|Mounts · 2' && pk.tiles.sort().join() === 'pk-pet:Fox-Desert,pk-pet:Owl-Base,pk-pet:Wolf-Base', JSON.stringify(pk));
      check('picker: who lives here are chosen, as chips at the top', pk.chosen.join() === `${await nm('pet:Wolf-Base')},${await nm('mount:Dragon-Red')}` && pk.tally === '2 of 10 chosen' && pk.sel.join() === 'pk-pet:Wolf-Base', JSON.stringify(pk));
      await page.fill('[data-k="pk-search"]', (await nm('pet:Wolf-Base')).toLowerCase());
      const byName = await page.evaluate(() => [...document.querySelectorAll('#pk-pane-pet .pk-tile')].filter(t => !t.hidden).map(t => t.dataset.k).join());
      check('picker: search finds a creature by its name too', byName === 'pk-pet:Wolf-Base', byName);
      await page.fill('[data-k="pk-search"]', 'fox');
      const found = await page.evaluate(() => [...document.querySelectorAll('#pk-pane-pet .pk-tile')].filter(t => !t.hidden).map(t => t.dataset.k).join());
      check('picker: search narrows the tiles', found === 'pk-pet:Fox-Desert', found);
      await page.screenshot({ path: `${SHOTS}/29-stable-picker.png` });
      await page.click('[data-k="pk-pet:Fox-Desert"]');
      await page.click('[data-k="pk-tab-mount"]');
      const mounts = await page.evaluate(() => [...document.querySelectorAll('#pk-pane-mount .pk-tile')].map(t => t.dataset.k).sort().join());
      check('picker: the Mounts tab lists owned mounts', mounts === 'pk-mount:Dragon-Golden,pk-mount:Dragon-Red', mounts);
      const hm = await mark();
      await page.click('[data-k="pk-save"]');
      const hello = await snackAfter(hm, 'Say hello'); await page.waitForTimeout(800);
      fox = await nm('pet:Fox-Desert');
      check('names: a newcomer gets a name, and the snackbar says hello with Rename', !!fox && hello === `Say hello to ${fox}, your Desert Fox.` && (await page.textContent('#snackbar .snack-action')) === 'Rename', hello);
    }
    check('picker: Save brings the chosen creature into the meadow and the row', (await herdIds()) === 'mount:Dragon-Red,pet:Fox-Desert,pet:Wolf-Base'
      && (await page.textContent('[data-k="pg-count"]')) === '3 of 10' && (await page.locator('.pg-row .pg-chip:not(.add)').count()) === 3, await herdIds());
    {
      const st = await stored();
      check('picks are stored on the phone, per account, and are now the player\u2019s own', !!st && st.auto === false && st.playgrounds[0].residents.map(r => r.id).join() === 'pet:Wolf-Base,mount:Dragon-Red,pet:Fox-Desert', JSON.stringify(st));
    }
    // a second playground
    await page.click('[data-k="pg-switch"]'); await page.waitForTimeout(250);
    check('switcher: the playground name opens a menu with each playground, then New playground, Change scene, What grows here, the barn (no Rename)',
      (await page.evaluate(() => [...document.querySelectorAll('.menu .menu-item')].map(b => b.dataset.k).join())) === 'pg-open-1,pg-new,pg-scene,pg-grows,pg-barn');
    await page.click('[data-k="pg-new"]'); await page.waitForSelector('[data-k="pg-form"].open'); await page.waitForTimeout(250);
    check('new playground: only scenes not in use, the first one chosen, no name to type',
      (await page.evaluate(() => [...document.querySelectorAll('[data-k="pg-form"] .sc-tile')].map(t => `${t.dataset.k}${t.getAttribute('aria-checked') === 'true' ? '*' : ''}`).join())) === 'pg-sc-lake*,pg-sc-pine,pg-sc-cove,pg-sc-bamboo,pg-sc-marsh,pg-sc-mushroom'
      && !(await page.$('[data-k="pg-name"]')));
    await page.click('[data-k="pg-sc-pine"]');
    await page.click('[data-k="pg-form-save"]'); await page.waitForTimeout(150);
    const dissolving = await page.evaluate(() => !!document.querySelector('#stable-stage .pg-dissolve'));
    await page.waitForTimeout(800);
    {
      const now = await page.evaluate(() => ({ scene: window.__stablePg.scene.options.scene, canvases: document.querySelectorAll('#stable-stage canvas').length, own: document.querySelector('#stable-stage > canvas.pg-canvas') === window.__stablePg.stage.canvas, running: window.__stablePg.stage.running, hint: document.querySelector('.stable-hint').textContent, hidden: document.querySelector('.stable-hint').hidden }));
      check('new playground: opens at once with its scene, a dither dissolve from the old one, then one canvas', dissolving && now.scene === 'pine' && now.canvases === 1 && now.own && now.running, JSON.stringify({ dissolving, ...now }));
      check('new playground: empty, and says how to bring creatures in', (await page.textContent('[data-k="pg-switch"] .pg-name')) === 'Pine hill' && !now.hidden && /No one lives in Pine hill yet/.test(now.hint) && (await herdIds()) === '', now.hint);
    }
    // Change scene: the playground becomes the other scene's, name and all; scenes in use aren't offered; Undo
    {
      await page.click('[data-k="pg-switch"]'); await page.waitForTimeout(250);
      await page.click('[data-k="pg-scene"]'); await page.waitForSelector('[data-k="pg-form"].open'); await page.waitForTimeout(250);
      check('change scene: offers this playground\u2019s scene and the unused ones, never the Meadow another playground has',
        (await page.evaluate(() => [...document.querySelectorAll('[data-k="pg-form"] .sc-tile')].map(t => `${t.dataset.k}${t.getAttribute('aria-checked') === 'true' ? '*' : ''}`).join())) === 'pg-sc-lake,pg-sc-pine*,pg-sc-cove,pg-sc-bamboo,pg-sc-marsh,pg-sc-mushroom');
      const mk = await mark();
      await page.click('[data-k="pg-sc-mushroom"]'); await page.click('[data-k="pg-form-save"]');
      const said = await snackAfter(mk, 'is now'); await page.waitForTimeout(800);
      check('change scene: the name follows the scene, and the snackbar says so', /Pine hill is now Mushroom glade/.test(said) && (await page.textContent('[data-k="pg-switch"] .pg-name')) === 'Mushroom glade'
        && (await page.evaluate(() => window.__stablePg.scene.options.scene)) === 'mushroom', said);
      await page.click('#snackbar .snack-action'); await page.waitForTimeout(800);
      check('change scene: Undo puts the old scene and name back', (await page.textContent('[data-k="pg-switch"] .pg-name')) === 'Pine hill' && (await page.evaluate(() => window.__stablePg.scene.options.scene)) === 'pine');
    }
    // one playground per creature: choosing the fox here moves it, with Undo
    await page.click('[data-k="pg-add"]'); await page.waitForSelector('.pk-dialog.open'); await page.waitForTimeout(300);
    check('picker: a tile says where a creature lives now', (await page.textContent('[data-k="pk-pet:Fox-Desert"] .pk-where')) === 'Meadow');
    let m = await mark();
    await page.click('[data-k="pk-pet:Fox-Desert"]'); await page.click('[data-k="pk-save"]');
    check('one playground per creature: choosing it moves it here, and says so', new RegExp(`${await nm('pet:Fox-Desert')} moved here from Meadow`).test(await snackAfter(m, 'moved here')) && (await herdIds()) === 'pet:Fox-Desert');
    {
      const st = await pgState();
      check('one playground per creature: it left the Meadow', st.playgrounds[0].residents.map(r => r.id).join() === 'pet:Wolf-Base,mount:Dragon-Red' && st.playgrounds[1].residents.map(r => r.id).join() === 'pet:Fox-Desert', JSON.stringify(st));
    }
    await page.screenshot({ path: `${SHOTS}/30-stable-moved.png` });
    await page.click('#snackbar .snack-action'); await page.waitForTimeout(500);
    {
      const st = await pgState();
      check('Undo puts it back where it lived', st.playgrounds[0].residents.map(r => r.id).join() === 'pet:Wolf-Base,mount:Dragon-Red,pet:Fox-Desert' && !st.playgrounds[1].residents.length && (await herdIds()) === '', JSON.stringify(st));
    }
    // switching back; the creature sheet's Find, Move and Remove
    await page.click('[data-k="pg-switch"]'); await page.waitForTimeout(250);
    await page.click('[data-k="pg-open-1"]'); await page.waitForTimeout(800);
    check('switcher: opens the other playground with its residents', (await page.textContent('[data-k="pg-switch"] .pg-name')) === 'Meadow' && (await herdIds()) === 'mount:Dragon-Red,pet:Fox-Desert,pet:Wolf-Base' && (await page.evaluate(() => window.__stablePg.scene.options.scene)) === 'meadow');
    await page.click('[data-k="pg-chip-pet:Wolf-Base"]'); await page.waitForSelector('.sheet.open'); await page.waitForTimeout(250);
    {
      const sh = await page.evaluate(() => ({ keys: [...document.querySelectorAll('.sheet.open .li-btn')].map(b => b.dataset.k).join(), title: document.querySelector('.sheet.open .sheet-title')?.textContent,
        kind: document.querySelector('.sheet.open [data-k="pg-sheet-kind"]')?.textContent, days: document.querySelector('.sheet.open [data-k="pg-sheet-days"]')?.textContent, about: document.querySelector('.sheet.open [data-k="pg-sheet-about"]')?.textContent, rename: document.querySelector('[data-k="pg-rename"]')?.textContent }));
      check('creature sheet: its name, Name, Find, Pet, Move and Remove, what it is, where it lives and since when', sh.keys === 'pg-rename,pg-find,pg-pet,pg-move,pg-remove'
        && sh.title === (await nm('pet:Wolf-Base')) && sh.kind === 'Base Wolf · lives in Meadow' && sh.days === 'Joined your playgrounds today' && sh.rename === `Name${sh.title}`, JSON.stringify(sh));
    }
    {
      // how it gets on here: Habitica's word for a Wolf, and its best friend among the Dragon and the Fox (no kin here)
      const about = await page.textContent('.sheet.open [data-k="pg-sheet-about"]');
      const friends = await Promise.all(['mount:Dragon-Red', 'pet:Fox-Desert'].map(nm));
      check('creature sheet: Habitica’s word for it and its best friend here', new RegExp(`^A loyal Wolf · best friends with (${friends.join('|')})$`).test(about), about);
    }
    // the name over its head: on Find, for a moment
    await page.click('[data-k="pg-find"]'); await page.waitForTimeout(300);
    const tagged = () => page.evaluate(() => window.__stablePg.world.layers.find(l => l.id === 'name-tags').showing().join());
    check('name tag: Find shows its name over its head', (await tagged()) === 'pet:Wolf-Base', await tagged());
    await page.waitForTimeout(2600);
    check('name tag: gone again after a moment', (await tagged()) === '', await tagged());
    // renaming: the Name dialog, ideas from the list, a name the meadow can't write, Habitica's name
    await page.click('[data-k="pg-chip-pet:Wolf-Base"]'); await page.waitForSelector('.sheet.open'); await page.waitForTimeout(250);
    await page.click('[data-k="pg-rename"]'); await page.waitForSelector('[data-k="nm"].open'); await page.waitForTimeout(250);
    {
      const dl = await page.evaluate(() => ({ value: document.getElementById('nm-text').value, ideas: [...document.querySelectorAll('.nm-idea')].map(b => b.textContent), plain: !!document.querySelector('[data-k="nm-plain"]') }));
      check('Name dialog: its name to edit, three ideas from the list, Habitica’s name as a choice', dl.value === (await nm('pet:Wolf-Base')) && dl.ideas.length === 3 && !dl.ideas.includes(dl.value) && dl.plain, JSON.stringify(dl));
      await page.click('[data-k="nm-shuffle"]');
      const again = await page.evaluate(() => [...document.querySelectorAll('.nm-idea')].map(b => b.textContent));
      check('Name dialog: the dice give three other ideas', again.length === 3 && again.join() !== dl.ideas.join(), again.join());
    }
    await page.fill('#nm-text', 'Lupu ☃'); await page.click('[data-k="nm-save"]'); await page.waitForTimeout(200);
    check('Name dialog: a character the meadow can’t write is refused, and says which', /can’t write “☃”/.test(await page.textContent('[data-k="nm"]')) && (await nm('pet:Wolf-Base')) !== 'Lupu ☃');
    await page.fill('#nm-text', 'Lupușor'); await page.click('[data-k="nm-save"]'); await page.waitForTimeout(500);
    check('Name dialog: Save renames it, everywhere it shows', (await nm('pet:Wolf-Base')) === 'Lupușor' && (await names())['pet:Wolf-Base'].own === true
      && (await page.getAttribute('[data-k="pg-chip-pet:Wolf-Base"]', 'aria-label')) === 'Lupușor, Base Wolf' && (await tagged()).includes('pet:Wolf-Base'));
    await page.screenshot({ path: `${SHOTS}/30a-stable-name-tag.png` });
    await page.click('[data-k="pg-chip-mount:Dragon-Red"]'); await page.waitForSelector('.sheet.open'); await page.waitForTimeout(250);
    await page.click('[data-k="pg-rename"]'); await page.waitForSelector('[data-k="nm"].open'); await page.waitForTimeout(250);
    await page.click('[data-k="nm-plain"]'); await page.waitForTimeout(400);
    check('Name dialog: Use Habitica’s name keeps Habitica’s, and no name shows over its head', (await nm('mount:Dragon-Red')) === '' && (await page.getAttribute('[data-k="pg-chip-mount:Dragon-Red"]', 'aria-label')) === 'Red Dragon mount, you’re riding it'
      && !(await page.evaluate(() => window.__stablePg.world.layers.find(l => l.id === 'name-tags').show('mount:Dragon-Red'))));
    await page.click('[data-k="pg-chip-pet:Wolf-Base"]'); await page.waitForSelector('.sheet.open'); await page.waitForTimeout(250);
    await page.click('[data-k="pg-pet"]'); await page.waitForTimeout(400);
    check('creature sheet: Pet gives the creature a heart (for TalkBack, the meadow is one canvas)', await page.evaluate(() => window.__stablePg.herd.particles.some(q => q.kind === 'heart' && q.owner === 'pet:Wolf-Base')));
    await page.click('[data-k="pg-chip-pet:Wolf-Base"]'); await page.waitForSelector('.sheet.open'); await page.waitForTimeout(250);
    await page.click('[data-k="pg-move"]'); await page.waitForTimeout(500);
    m = await mark();
    await page.click('[data-k="pg-move-2"]');
    check('creature sheet: Move takes it to the other playground', /Lupușor moved to Pine hill/.test(await snackAfter(m, 'moved to')) && (await herdIds()) === 'mount:Dragon-Red,pet:Fox-Desert'
      && (await pgState()).playgrounds[1].residents.map(r => r.id).join() === 'pet:Wolf-Base');
    await page.click('[data-k="pg-chip-mount:Dragon-Red"]'); await page.waitForSelector('.sheet.open'); await page.waitForTimeout(250);
    m = await mark();
    await page.click('[data-k="pg-remove"]');
    check('creature sheet: Remove takes it out of the playground (it stays in the Habitica stable)', /Red Dragon left Meadow/.test(await snackAfter(m, 'left')) && (await herdIds()) === 'pet:Fox-Desert' && !JSON.stringify(await pgState()).includes('mount:Dragon-Red'));
    // a pet raised into a mount leaves its playground on the next read, and its mount can come in
    await post('/mock/set', { items: { pets: { 'Wolf-Base': 5, 'Fox-Desert': -1, 'Owl-Base': 5, 'Dragon-Golden': -1 }, mounts: { 'Dragon-Red': true, 'Dragon-Golden': true, 'Fox-Desert': true } } });
    m = await mark();
    await sync();
    check('a read: a pet raised into a mount leaves, and the snackbar offers the mount', new RegExp(`${fox} grew into a mount\\. Add the mount\\?`).test(await snackAfter(m, 'grew into')) && (await herdIds()) === '');
    await page.click('#snackbar .snack-action'); await page.waitForTimeout(800);
    check('a read: Add brings the mount into the same playground', (await herdIds()) === 'mount:Fox-Desert' && (await stored()).playgrounds[0].residents.map(r => r.id).join() === 'mount:Fox-Desert');
    check('names: the grown-up keeps the pet’s name', (await nm('mount:Fox-Desert')) === fox && !(await names())['pet:Fox-Desert'], JSON.stringify(await names()));
    // full screen hides the Stable's own bars too
    await page.click('[data-k="stable-full"]'); await page.waitForTimeout(400);
    check('Stable full screen: the toolbar and the row slide away with the app\u2019s chrome', await page.evaluate(() => {
      const b = document.querySelector('.pg-bar').getBoundingClientRect(), r = document.querySelector('.pg-row').getBoundingClientRect();
      return b.bottom <= 0 && r.top >= innerHeight && getComputedStyle(document.querySelector('.pg-bar')).visibility === 'hidden';
    }));
    await page.goBack(); await page.waitForTimeout(400);
    // ---------------------------------------------------------------- 14d2. the postcard (stable ideas §14): the meadow stops, that frame goes on a card with the credit
    const card = async () => {
      await page.click('[data-k="pg-postcard"]');
      await page.waitForSelector('.sheet.open[data-k="postcard"]');
      await page.waitForTimeout(300);
      return page.evaluate(async () => {
        const src = document.querySelector('[data-k="postcard-pic"]').src, img = new Image();
        img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, c.width, c.height).data, at = (x, y) => d.slice((y * c.width + x) * 4, (y * c.width + x) * 4 + 3);
        // the credit: dark pixels on the paper under the picture
        let ink = 0;
        for (let y = Math.floor(c.height * 0.97); y < c.height; y++) for (let x = 0; x < c.width; x++) { const [r, gg, b] = at(x, y); if (r < 160 && gg < 160 && b < 160) ink++; }
        const t0 = window.__stablePg.stage.stats.ticks;
        await new Promise(r => setTimeout(r, 300));
        return { png: src.startsWith('data:image/png;base64,'), w: c.width, h: c.height, paper: at(2, 2).join(), ink, frozen: !window.__stablePg.stage.running && window.__stablePg.stage.stats.ticks === t0,
          rider: !!document.querySelector('[data-k="postcard-rider"]'), action: document.querySelector('.sheet.open .sheet-actions .primary').textContent.trim() };
      });
    };
    // Habitica's avatar images come from its asset server: a local stand-in, so the checks don't depend on the network
    await page.route('https://habitica-assets.s3.amazonaws.com/**', r => r.fulfill({ path: 'public/stable/pet/Wolf-Base.png', contentType: 'image/png' }));
    await sync(); await page.waitForTimeout(500);
    {
      const pc = await card();
      check('postcard: the camera stops the meadow and shows that frame on a white card, at least 1080 px wide, with the art credit written under it',
        pc.png && pc.w >= 1080 && pc.h > pc.w && pc.paper === '250,250,250' && pc.ink > 200 && pc.frozen, JSON.stringify(pc));
      check('postcard in a browser: the avatar on foot by the door is left out, and the card says why', pc.rider && (await page.evaluate(() => window.__stablePg.herd.avatar?.layers.length > 0)), JSON.stringify(pc));
      check('postcard: in a browser it is saved (no share sheet here)', pc.action === 'Save', pc.action);
      await page.screenshot({ path: `${SHOTS}/31b-stable-postcard.png` });
      await page.goBack(); await page.waitForTimeout(500);
      check('postcard: Back closes it and the meadow moves again', !(await page.locator('.sheet.open').count()) && (await page.evaluate(() => window.__stablePg.stage.running)));
    }
    // ---------------------------------------------------------------- 14d2b. the weekly almanac: the same postcard with the week written on it
    {
      const look = () => page.evaluate(async () => {
        const img = document.querySelector('[data-k="postcard-pic"]'), i = new Image();
        i.src = img.src; await i.decode();
        const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
        const g = c.getContext('2d'); g.drawImage(i, 0, 0);
        // the ribbon's parchment over the picture's top left (the picture starts 4% in)
        // (postcard.ts: the picture W wide starts pad = 4% of W in, the ribbon half a pad further, rs = 3.6% of W tall letters)
        const W = Math.round(i.width / 1.08), pad = Math.round(W * 0.04), rs = Math.max(14, Math.round(W * 0.036));
        const at = (x, y) => [...g.getImageData(x, y, 1, 1).data].slice(0, 3).join();
        return { w: i.width, h: i.height, ribbon: at(pad + Math.round(pad * 0.5) + Math.round(rs * 0.35), pad + Math.round(pad * 0.5) + Math.round(rs * 0.95)), alt: img.alt,
          kinds: [...document.querySelectorAll('[data-k="postcard-kinds"] [role="radio"]')].map(b => `${b.dataset.k}${b.getAttribute('aria-checked') === 'true' ? '*' : ''}`).join() };
      });
      // a crit this week (the journal lives only in memory in this run, so one is added as the store keeps them)
      await page.evaluate(() => { const p = window.__stablePg; p.journal().push({ at: Date.now(), day: p.today(), taskId: 'e2e-almanac', text: 'e2e', type: 'daily', mult: 1.75, exp: 11, gp: 7, mp: 0, dmg: 0 }); });
      await page.click('[data-k="pg-postcard"]');
      await page.waitForSelector('.sheet.open[data-k="postcard"]'); await page.waitForTimeout(300);
      const plain = await look();
      check('almanac: the postcard offers this week’s almanac beside the plain picture, plain first', plain.kinds === 'postcard-plain*,postcard-this', JSON.stringify(plain));
      await page.click('[data-k="postcard-this"]'); await page.waitForTimeout(300);
      const week = await look();
      check('almanac: this week’s card is the same frame with a parchment ribbon over it and the week’s lines under it, the crits first, all of them in its description',
        week.w === plain.w && week.h > plain.h && week.ribbon === '255,251,242' && /almanac of this week, \d.*\(\d+ crits? added \d+ Gold and \d+ XP(, the best | \()×\d\.\d\d\)?; \d+% of Dailies done/.test(week.alt) && week.kinds === 'postcard-plain,postcard-this*', JSON.stringify(week));
      await page.screenshot({ path: `${SHOTS}/31c-stable-almanac.png` });
      await page.goBack(); await page.waitForTimeout(400);
      await page.evaluate(() => { const j = window.__stablePg.journal(); for (let i = j.length - 1; i >= 0; i--) if (j[i].taskId === 'e2e-almanac') j.splice(i, 1); });
      // a new week: the record the phone kept moves back a week, a read freezes it, and the Stable offers it once
      await page.evaluate(uid => {
        const all = JSON.parse(localStorage.getItem('critoracle:v2:almanac') || '{}'), r = all[uid];
        r.cur.week -= 7; r.cur.from -= 7; delete r.last; delete r.offered;
        localStorage.setItem('critoracle:v2:almanac', JSON.stringify(all));
      }, UID);
      let m = await mark();
      await sync();
      const offered = await snackAfter(m, 'almanac', 5000);
      check('almanac: the first read of a new week in the Stable offers last week’s, once', /^Last week’s almanac is ready/.test(offered || ''), offered);
      await page.click('#snackbar .snack-action');
      await page.waitForSelector('.sheet.open[data-k="postcard"]'); await page.waitForTimeout(300);
      const last = await look();
      check('almanac: Show opens last week’s', last.kinds === 'postcard-plain,postcard-this,postcard-last*' && /almanac of last week, \d/.test(last.alt), JSON.stringify(last));
      await page.goBack(); await page.waitForTimeout(400);
      m = await mark(); await sync(); await page.waitForTimeout(500);
      check('almanac: offered once a week, not again on the next read', !(await page.evaluate(n => window.__snacks.slice(n).some(t => /almanac/.test(t)), m)));
    }
    // ---------------------------------------------------------------- 14d3. toys (stable ideas §13): the toy box and the playground's own toy
    {
      const OWN = { meadow: 'hay', lake: 'stones', pine: 'cones', cove: 'sandcastle', bamboo: 'top', marsh: 'bubbles', mushroom: 'cap' };
      const P = () => page.evaluate(uid => {
        const p = window.__stablePg, h = p.play.hider;
        return { scene: p.scene.options.scene, pg: p.state().current, out: p.play.out(), hider: h ? h.id : null, hidden: !!h && h.clipBelow !== undefined, pets: p.herd.creatures.filter(c => !c.mount).length, n: p.herd.creatures.length,
          rec: JSON.parse(localStorage.getItem('critoracle:v2:play') || '{}')[uid] || null, label: p.stage.canvas.getAttribute('aria-label') };
      }, UID);
      const box = await page.evaluate(() => { const t = document.querySelector('[data-k="stable-toys"]').getBoundingClientRect(), f = document.querySelector('[data-k="stable-full"]').getBoundingClientRect(); return { gap: f.left - t.right, dy: Math.abs(t.top - f.top), w: t.width }; });
      check('toy box: a round button just left of the full-screen one', box.w === 40 && box.dy < 1 && box.gap === 8, JSON.stringify(box));
      const openBox = async () => { await page.click('[data-k="stable-toys"]'); await page.waitForSelector('.sheet.open[data-k="toy-box-sheet"]'); await page.waitForTimeout(250); };
      await openBox();
      let st = await P();
      const rows = await page.evaluate(() => [...document.querySelectorAll('.sheet.open .li[data-k^="toy-"]')].map(e => `${e.dataset.k}${e.getAttribute('aria-checked') === 'true' ? '*' : ''}`).join());
      check('toy box: the ball (out), frisbee, stick and kite, and the playground’s own toy, always there', rows === `toy-ball*,toy-frisbee,toy-stick,toy-kite,toy-own-${OWN[st.scene]}`, rows);
      check('toy box: every toy has its picture', await page.evaluate(() => [...document.querySelectorAll('.sheet.open canvas.toy-pic')].every(c => c.width > 0 && c.height > 0)) && (await page.locator('.sheet.open canvas.toy-pic').count()) === 5);
      await page.screenshot({ path: `${SHOTS}/31c-stable-toy-box.png` });
      await page.click('[data-k="toy-frisbee"]');
      await page.waitForTimeout(500);
      const drop = await page.evaluate(() => { const t = window.__stablePg.play.toys.get('frisbee'); return t && { arriving: t.arriving, z: Math.round(t.z), sheet: !!document.querySelector('.sheet.open') }; });
      check('toy box: a toy chosen drops in from the sky with sparkles, the sheet closed', !!drop && drop.arriving && drop.z > 0 && !drop.sheet, JSON.stringify(drop));
      await page.waitForTimeout(2500);
      st = await P();
      check('toy box: it lands and stays out, kept for this playground', !(await page.evaluate(() => window.__stablePg.play.toys.get('frisbee').arriving)) && st.out.join() === 'ball,frisbee' && st.rec?.toys?.[st.pg]?.join() === 'ball,frisbee' && /Toys: .*frisbee/.test(st.label), JSON.stringify(st));
      await page.screenshot({ path: `${SHOTS}/31d-stable-frisbee.png` });
      await openBox();
      await page.click('[data-k="toy-ball"]');
      await page.waitForTimeout(400);
      st = await P();
      check('toy box: a toy put away goes back in the box', st.out.join() === 'frisbee' && st.rec.toys[st.pg].join() === 'frisbee' && (await page.evaluate(() => window.__stablePg.herd.ball.hidden)), JSON.stringify(st.out));
      await openBox();
      await page.click('[data-k="toy-ball"]');
      await page.waitForTimeout(300);
      check('toy box: and comes back out', (await P()).out.join() === 'ball,frisbee');

      // what a tap opens is marked (play/hint.ts): a thin rim round the hiding spot, the own toy, the frisbee and the ball, drawn
      // over the scene and under the creatures; the same frame drawn without the rims differs only next to those things
      const rims = await page.evaluate(() => {
        const p = window.__stablePg, w = p.world, h = p.hints, c = document.createElement('canvas');
        c.width = w.w; c.height = w.h;
        const g = c.getContext('2d'), was = h.style, av = p.herd.avatar, avHidden = av && av.hidden;
        // the avatar's pictures come from Habitica's image server and would taint the canvas: left out of both frames
        if (av) av.hidden = true;
        const frame = style => { h.style = style; g.clearRect(0, 0, w.w, w.h); w.draw(g); return g.getImageData(0, 0, w.w, w.h).data; };
        const off = frame('glint'), on = frame('line');
        h.style = was; if (av) av.hidden = avHidden;
        const things = p.play.things().map(b => ({ ...b, n: 0 })), t = p.scene.tappable(w), A = 3;
        const near = (b, x, y, m) => x >= b.x - m && x < b.x + b.w + m && y >= b.y - m && y < b.y + b.h + m;
        const scenery = t.trophies.map(b => ({ x: b.x0 * A, y: b.y0 * A, w: (b.x1 - b.x0) * A, h: (b.y1 - b.y0) * A }))
          .concat([{ x: t.house.x0 * A, y: t.house.y0 * A, w: (t.house.x1 - t.house.x0) * A, h: (t.house.y1 - t.house.y0) * A }]);
        let diff = 0, stray = 0, light = 0;
        for (let y = 0; y < w.h; y++) for (let x = 0; x < w.w; x++) {
          const i = (y * w.w + x) * 4;
          if (on[i] === off[i] && on[i + 1] === off[i + 1] && on[i + 2] === off[i + 2]) continue;
          diff++;
          if (on[i] + on[i + 1] + on[i + 2] > off[i] + off[i + 1] + off[i + 2]) light++;
          let mine = false;
          for (const b of things) if (near(b, x, y, 1)) { b.n++; mine = true; }
          if (!mine && !scenery.some(b => near(b, x, y, 14 * A))) stray++;
        }
        const ids = w.layers.map(l => l.id);
        return { style: was, diff, stray, light, each: things.map(b => b.n), order: ids.indexOf('hints') > ids.indexOf('scene') && w.layers.find(l => l.id === 'hints').depth === 'back' };
      });
      check('hints: a thin rim round the hiding spot, the own toy, the frisbee and the ball, over the scene and under everyone, nothing else touched',
        rims.style === 'line' && rims.order && rims.each.length === 4 && rims.each.every(n => n > 3) && rims.stray === 0 && (rims.light > rims.diff * 0.9 || rims.light < rims.diff * 0.1), JSON.stringify(rims));

      // the frisbee back in the box, so the later checks see the playground as before
      await openBox(); await page.click('[data-k="toy-frisbee"]'); await page.waitForTimeout(300);
    }
    page.off('request', onApi);
    check('pet picking never calls Habitica (only the two reads asked for)', api.every(u => /\/api\/v3\/(user|tasks|groups|content|status)/.test(u)) && !api.some(u => /equip|feed|hatch|release/.test(u)), api.join(' '));

    // ---------------------------------------------------------------- 14e. riding (spec §07): the Stable's one Habitica call, the avatar on the mount
    {
      const equips = [];
      const onEquip = r => { if (r.method() === 'POST' && r.url().includes('/user/equip/')) equips.push(new URL(r.url()).pathname.split('/').slice(-2).join('/')); };
      page.on('request', onEquip);
      const riders = () => page.evaluate(() => window.__stablePg.herd.creatures.filter(c => c.rider && c.rider.length).map(c => `${c.id}:${c.rider.length}`).join());
      const sheetKeys = () => page.evaluate(() => [...document.querySelectorAll('.sheet.open .li-btn')].map(b => `${b.dataset.k}${b.disabled ? '(off)' : ''}`).join());
      const chip = async id => { await page.click(`[data-k="pg-chip-${id}"]`); await page.waitForSelector('.sheet.open'); await page.waitForTimeout(250); };
      await sync();
      await chip('mount:Fox-Desert');
      check('mount sheet: Ride, between Pet and Move (pets have none)', (await sheetKeys()) === 'pg-rename,pg-find,pg-pet,pg-ride,pg-move,pg-remove' && /Your avatar rides it in Habitica/.test(await page.textContent('.sheet.open')), await sheetKeys());
      m = await mark();
      await page.click('[data-k="pg-ride"]');
      const rode = await snackAfter(m, 'riding');
      await page.waitForTimeout(600);
      check('Ride: one call to Habitica, and the snackbar says what its reply reports', rode === `You’re riding ${fox} the Desert Fox.` && equips.join() === 'mount/Fox-Desert', `${rode} | ${equips.join()}`);
      const saddled = await page.evaluate(() => ({ badge: !!document.querySelector('.pg-row .ridden [data-k="pg-saddle"]'), label: document.querySelector('[data-k="pg-chip-mount:Fox-Desert"]').getAttribute('aria-label') }));
      check('Ride: your avatar rides it in the meadow, and its chip wears the saddle', /^mount:Fox-Desert:\d+$/.test(await riders()) && saddled.badge && /you’re riding it/.test(saddled.label), JSON.stringify([await riders(), saddled]));
      await page.screenshot({ path: `${SHOTS}/31-stable-riding.png` });
      m = await mark();
      await page.click('#snackbar .snack-action');
      const undone = await snackAfter(m, 'Red Dragon'); await page.waitForTimeout(400);
      check('Ride: Undo is another tap, putting the previous mount back on', /You’re riding the Red Dragon\./.test(undone) && equips.join() === 'mount/Fox-Desert,mount/Dragon-Red' && (await riders()) === '' && !(await page.locator('[data-k="pg-saddle"]').count()), `${undone} | ${equips.join()}`);
      await chip('mount:Fox-Desert');
      m = await mark(); await page.click('[data-k="pg-ride"]'); await snackAfter(m, 'riding'); await page.waitForTimeout(400);
      // a browser can't copy Habitica's avatar pictures (no CORS): the postcard leaves the rider out, says so, and the meadow keeps it
      {
        const pc = await card();
        check('postcard while riding, in a browser: the card is made without the avatar and says why', pc.png && pc.rider && pc.ink > 200, JSON.stringify(pc));
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('.sheet.open .sheet-actions .primary')]);
        await page.waitForTimeout(500);
        check('postcard: Save downloads stable-postcard.png, the sheet closes and the avatar still rides in the meadow',
          dl?.suggestedFilename() === 'stable-postcard.png' && !(await page.locator('.sheet.open').count()) && /^mount:Fox-Desert:\d+$/.test(await riders()) && (await page.evaluate(() => window.__stablePg.stage.running)), `${dl?.suggestedFilename()} | ${await riders()}`);
      }
      await chip('mount:Fox-Desert');
      check('mount sheet: the ridden mount offers Get off instead', (await sheetKeys()) === 'pg-rename,pg-find,pg-pet,pg-getoff,pg-move,pg-remove' && /You’re riding this mount/.test(await page.textContent('.sheet.open')), await sheetKeys());
      m = await mark();
      await page.click('[data-k="pg-getoff"]');
      const off = await snackAfter(m, 'got off'); await page.waitForTimeout(400);
      check('Get off: one call, the avatar climbs down, the mount stays in its playground', off === `You got off ${fox} the Desert Fox.` && equips.slice(-1)[0] === 'mount/Fox-Desert' && equips.length === 4 && (await riders()) === '' && (await herdIds()) === 'mount:Fox-Desert', `${off} | ${equips.join()}`);
      // Habitica's reply decides: someone got on the fox elsewhere, so the toggle took them off; it's reported, not retried
      await post('/mock/set', { items: { currentMount: 'Fox-Desert' } });
      await chip('mount:Fox-Desert');
      m = await mark(); await page.click('[data-k="pg-ride"]');
      const told = await snackAfter(m, 'Habitica says'); await page.waitForTimeout(400);
      check('Ride: when Habitica’s reply differs, the snackbar says what it reports and nothing is retried', /Habitica says you’re not riding any mount\./.test(told) && equips.length === 5, `${told} | ${equips.join()}`);
      // offline: Ride is replaced by a line saying riding needs Habitica, and nothing is sent
      await page.route('**/api/v3/**', r => r.abort('internetdisconnected'));
      await page.click('.appbar [data-k="sync"]'); await page.waitForSelector('.appbar.offline', { timeout: 15000 });
      await chip('mount:Fox-Desert');
      check('offline: Ride is unavailable and says riding needs Habitica', (await sheetKeys()) === 'pg-rename,pg-find,pg-pet,pg-ride(off),pg-move,pg-remove' && /Riding needs Habitica\. You’re offline\./.test(await page.textContent('.sheet.open')), await sheetKeys());
      await page.goBack(); await page.waitForTimeout(300);
      await page.unroute('**/api/v3/**');
      await sync(); await page.waitForSelector('.appbar:not(.offline)', { timeout: 15000 });
      check('riding sent nothing it shouldn’t: five taps, five calls', equips.length === 5, equips.join());
      page.off('request', onEquip);
      await page.unroute('https://habitica-assets.s3.amazonaws.com/**');
    }
    // party members with their creatures out (made-up accounts), read with the party after the reload below; Habitica's
    // avatar images from a local stand-in again, for the avatar on foot and the visitors' riders
    const FRIENDS = [
      { _id: 'friend-a', profile: { name: 'Ana' }, stats: { class: 'rogue', lvl: 30, hp: 50, mp: 10, maxMP: 40, buffs: {} }, flags: { classSelected: true }, preferences: { size: 'broad', skin: 'c06534', shirt: 'green', hair: { color: 'black', base: 1, bangs: 2 } }, items: { currentPet: 'Fox-Golden', currentMount: '', gear: { equipped: { armor: 'armor_rogue_1' }, costume: {} } } },
      { _id: 'friend-b', profile: { name: 'Bo \u{1F43A} the Brave Wanderer' }, stats: { class: 'mage', lvl: 12, hp: 50, mp: 30, maxMP: 60, buffs: { snowball: false } }, flags: { classSelected: true }, preferences: { size: 'slim', skin: '915533', shirt: 'blue', hair: { color: 'red', base: 3, bangs: 1 } }, items: { currentPet: 'Cactus-Base', currentMount: 'Wolf-Red', gear: { equipped: { head: 'head_wizard_1' }, costume: {} } } },
      { _id: 'friend-c', profile: { name: 'Cy' }, stats: { class: 'healer', lvl: 5, hp: 50, mp: 10, maxMP: 20, buffs: {} }, flags: {}, preferences: {}, items: { currentPet: '', currentMount: '', gear: { equipped: {}, costume: {} } } },
    ];
    await post('/mock/set', { members: FRIENDS });
    await page.route('https://habitica-assets.s3.amazonaws.com/**', r => r.fulfill({ path: 'public/stable/pet/Wolf-Base.png', contentType: 'image/png' }));
    // stored on the phone: after a reload the Stable comes back as it was
    await tab('Now'); await page.reload(); await page.waitForSelector('.appbar .headline', { timeout: 15000 }); await page.waitForTimeout(300);
    await tab('Stable'); await page.waitForTimeout(800);
    check('after a reload the playgrounds, the open one and who lives where are kept', (await page.textContent('[data-k="pg-switch"] .pg-name')) === 'Meadow' && (await herdIds()) === 'mount:Fox-Desert'
      && (await pgState()).playgrounds.map(p => `${p.scene}:${p.residents.length}${'name' in p ? ':named' : ''}`).join() === 'meadow:1,pine:1');

    // ---------------------------------------------------------------- 14f. the avatar on foot by the door, the Inn, party visitors
    {
      const memberReads = [];
      const onMembers = r => { if (r.url().includes('/groups/party/members')) memberReads.push(r.url()); };
      page.on('request', onMembers);
      // ten in the morning on the herd's clock (CI runs in UTC, any hour): visitors come by day only, and the Fox's
      // twilight nature naps at noon
      // (whoever was napping by the real clock wakes on the herd's next tick)
      const noon = async () => {
        await page.evaluate(() => { window.__stablePg.herd.o.clock = () => new Date(2026, 5, 1, 10); });
        await page.waitForFunction(() => !window.__stablePg.herd.creatures.some(c => c.asleep), null, { timeout: 5000 }).catch(() => {});
      };
      await noon();
      await page.waitForFunction(() => window.__stablePg?.herd.avatar, null, { timeout: 5000 }).catch(() => {});
      const av = () => page.evaluate(() => {
        const p = window.__stablePg, a = p.herd.avatar, d = p.scene.door(p.world);
        return a && { x: a.x, y: a.y, door: d, hop: a.hop, files: a.layers.map(l => l.image.src.split('/').pop()), riders: p.herd.creatures.filter(c => c.rider).length };
      });
      let a = await av();
      check('avatar on foot: riding nothing here, your avatar stands beside the stable’s door, on foot',
        !!a && Math.abs(a.x - a.door.x) <= 45 && a.files.includes('head_0.png') && a.files.some(f => /^skin_/.test(f)) && !a.files.some(f => /Mount_|Pet-/.test(f)) && a.riders === 0, JSON.stringify(a));
      // tap it: it hops, and the nearest creature (the Desert Fox mount) comes over to say hello
      const at = await page.evaluate(() => {
        const p = window.__stablePg, a = p.herd.avatar, r = p.stage.canvas.getBoundingClientRect(), f = p.stage.fit, k = r.width / f.backW;
        return { x: r.left + (f.offX + (a.x + 0.5) * f.scale) * k, y: r.top + (f.offY + (a.y - 30 + 0.5) * f.scale) * k };
      });
      await page.mouse.click(at.x, at.y);
      const called = await page.evaluate(() => {
        const p = window.__stablePg, f = p.herd.byId('mount:Fox-Desert'), a = p.herd.avatar;
        return { hop: a.hop, greet: p.herd.creatures.filter(c => c.greet).map(c => c.id).join(), barn: !!document.querySelector('[data-k="barn-bar"]'),
          fox: f && { st: f.st, asleep: f.isAsleep, hearts: f.hearts, dx: Math.round(f.fx - a.x), dy: Math.round(f.fy - a.y) }, ids: p.herd.creatures.map(c => c.id).join() };
      });
      // called over, or (already standing beside it) greeting it at once with a heart
      const greeted = called.fox && called.fox.hearts > 0 && Math.abs(called.fox.dy) <= 40;
      check('avatar on foot: a tap makes it hop and calls the nearest creature over (and doesn’t open the barn behind it)', called.hop >= 0 && (called.greet === 'mount:Fox-Desert' || greeted) && !called.barn, JSON.stringify(called));
      const label = () => page.evaluate(() => window.__stablePg.stage.canvas.getAttribute('aria-label'));
      check('avatar on foot: TalkBack hears where you stand', /You stand by the stable’s door/.test(await label()), await label());
      // the Inn: Habitica's sleeping face and Zzz, the stable dims, the herd sleeps by the door at noon
      // (the sky reads the real clock, so it dims to dusk, or stays night when CI runs after 21:00)
      const prefs = (await mockState()).user.preferences;
      await post('/mock/set', { user: { preferences: { ...prefs, sleep: true } } });
      await sync(); await page.waitForTimeout(500);
      a = await av();
      const inn = await page.evaluate(() => { const p = window.__stablePg; const h = new Date().getHours(); return { dim: p.scene.options.dim, tod: p.scene.light().tod, real: h >= 21 || h < 6 ? 'night' : 'dusk', night: p.herd.night() }; });
      check('the Inn: your avatar sleeps (Habitica’s sleeping face and Zzz), the stable dims, the herd sleeps at noon',
        !!a && a.files.includes('zzz.png') && a.files.some(f => /^skin_.*_sleep\.png$/.test(f)) && inn.dim === true && inn.tod === inn.real && inn.night && /resting in the Inn/.test(await label()), JSON.stringify([a?.files, inn]));
      await page.screenshot({ path: `${SHOTS}/32-stable-inn.png` });
      await post('/mock/set', { user: { preferences: { ...prefs, sleep: false } } });
      await sync(); await page.waitForTimeout(500);
      a = await av();
      check('out of the Inn: awake again in the day’s light', !!a && !a.files.includes('zzz.png') && !(await page.evaluate(() => window.__stablePg.scene.options.dim)), JSON.stringify(a?.files));
      // riding the mount that lives here, the avatar leaves the door for the saddle; getting off, it's back on foot
      await post('/mock/set', { items: { currentMount: 'Fox-Desert' } }); await sync(); await page.waitForTimeout(500);
      a = await av();
      check('riding here: the avatar is in the saddle, not by the door', !a && (await page.evaluate(() => window.__stablePg.herd.creatures.filter(c => c.rider && c.rider.length).map(c => c.id).join())) === 'mount:Fox-Desert');
      await post('/mock/set', { items: { currentMount: '' } }); await sync(); await page.waitForTimeout(500);
      check('off the mount: on foot by the door again', !!(await av()));

      // party visitors: up to two at a time walk in from a side, stay a while, walk out; whose they are on a tap
      await page.evaluate(() => {
        const p = window.__stablePg, herd = p.herd, visit = herd.visit.bind(herd);
        window.__visits = [];
        herd.visit = (r, layers) => { visit(r, layers); const c = herd.byId(r.id); window.__visits.push({ id: r.id, x: c.fx, w: p.world.w, half: c.half(p.world), rider: c.rider ? c.rider.length : 0 }); };
      });
      const seen = new Set(), counts = [];
      let tagged = null;
      for (let batch = 0; batch < 100; batch++) {
        const here = await page.evaluate(() => { const p = window.__stablePg; for (let i = 0; i < 100; i++) p.world.step(); return p.herd.creatures.filter(c => c.visitor).map(c => c.id); });
        here.forEach(id => seen.add(id)); counts.push(here.length);
        // tap the first visitor seen standing in the meadow: its tag says whose it is
        if (!tagged && here.length) {
          const spot = await page.evaluate(id => {
            const p = window.__stablePg, c = p.herd.byId(id), b = p.world.box(c);
            if (c.fx < c.half(p.world) || c.fx > p.world.w - c.half(p.world)) return null;
            p.stage.setShown(false);
            const r = p.stage.canvas.getBoundingClientRect(), f = p.stage.fit, k = r.width / f.backW;
            for (let y = b.y + (b.h >> 1); y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (p.world.hitTest(x, y) === c) return { x: r.left + (f.offX + (x + 0.5) * f.scale) * k, y: r.top + (f.offY + (y + 0.5) * f.scale) * k };
            p.stage.setShown(true);
            return null;
          }, here[0]);
          if (spot) {
            await page.mouse.click(spot.x, spot.y);
            tagged = await page.evaluate(id => { const p = window.__stablePg, t = p.world.layers.find(l => l.id === 'name-tags'); const r = { id, showing: t.showing().includes(id), label: p.visitors.label(id), talk: p.stage.canvas.getAttribute('aria-label') }; p.stage.setShown(true); return r; }, here[0]);
          }
        }
        await page.waitForTimeout(40);
      }
      const visits = await page.evaluate(() => window.__visits);
      const want = { 'visitor:friend-a:pet:Fox-Golden': "Ana's Golden Fox", 'visitor:friend-b:mount:Wolf-Red': "Bo the Brave's Red Wolf" };
      check('visitors: each member’s creature out comes (a mount with its rider), never one with nothing out, never more than two at once',
        [...seen].sort().join() === Object.keys(want).sort().join() && Math.max(...counts) <= 2 && visits.find(v => v.id.includes('Wolf-Red'))?.rider > 0 && visits.every(v => !v.id.includes('friend-c')),
        JSON.stringify({ seen: [...seen], max: Math.max(...counts), visits }));
      check('visitors: they walk in from beyond a side of the meadow', visits.length >= 2 && visits.every(v => v.x <= -v.half || v.x >= v.w + v.half), JSON.stringify(visits));
      check('visitors: they stay a while, then walk out again', counts.some(n => n > 0) && counts.slice(counts.indexOf(Math.max(...counts))).some(n => n < Math.max(...counts)), counts.join(''));
      check('visitors: a tap shows whose it is, and TalkBack hears who’s visiting', !!tagged && tagged.showing && tagged.label === want[tagged.id] && /visiting/.test(tagged.talk), JSON.stringify(tagged));
      page.off('request', onMembers);
      check('visitors: nothing extra is asked of Habitica, and no member’s name or look is kept on the phone',
        !memberReads.length && !/Ana|Brave|Golden Fox/.test(await page.evaluate(() => JSON.stringify(localStorage))), memberReads.join(' '));
      await page.screenshot({ path: `${SHOTS}/33-stable-visitors.png` });
      await post('/mock/set', { members: [] });
      await page.unroute('https://habitica-assets.s3.amazonaws.com/**');
    }
    check('after a reload the names are kept', (await page.getAttribute('[data-k="pg-chip-mount:Fox-Desert"]', 'aria-label')) === `${fox}, Desert Fox mount` && (await nm('pet:Wolf-Base')) === 'Lupușor');
    // the still picture (reduced motion) draws the name too, and draws again when it goes
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.waitForTimeout(400);
    {
      const f0 = (await pg()).frames;
      await page.click('[data-k="pg-chip-mount:Fox-Desert"]'); await page.waitForSelector('.sheet.open'); await page.waitForTimeout(250);
      await page.click('[data-k="pg-find"]'); await page.waitForTimeout(400);
      const on = await page.evaluate(() => window.__stablePg.world.layers.find(l => l.id === 'name-tags').showing().join()), f1 = (await pg()).frames;
      await page.waitForTimeout(2800);
      const f2 = (await pg()).frames;
      check('name tag: in the still picture too, drawn when it shows and again when it goes', on === 'mount:Fox-Desert' && f1 > f0 && f2 > f1 && (await pg()).still, JSON.stringify({ on, f0, f1, f2 }));
    }
    await page.emulateMedia({ reducedMotion: null });
    await tab('Stats');
    check('Stats card: names the open playground and how many live there', /Meadow · 1 creature\./.test(await page.textContent('[data-k="stable-card-sub"]')));
    check('Stats card: after a reload the picture shows who lives there now', !!(await page.waitForSelector('[data-k="stable-thumb"][data-shown="1"]', { timeout: 5000 }).catch(() => null)));

    // ---------------------------------------------------------------- 14e. growth: from the account's numbers, named once, never shrinking
    {
      const grown = () => page.evaluate(uid => JSON.parse(localStorage.getItem('critoracle:v2:growth') || '{}')[uid], UID);
      const scene = () => page.evaluate(() => ({ ...window.__stablePg.scene.options.growth, done: window.__stablePg.scene.options.dailiesDone, sparkle: window.__stablePg.sparkle.active }));
      const first = await grown();
      // the water follows the longest Daily streak
      const dailies = (await mockState()).tasks.filter(t => t.type === 'daily'), longest = Math.max(0, ...dailies.map(t => t.streak || 0));
      check('growth: the first visit records what had grown, silently, the water from the Dailies\' streaks', !!first && first.checkIns === 0 && first.perfectDays === 0 && first.streakDays === longest && longest < 3 && first.quests === 1, JSON.stringify({ first, longest }));
      const streaky = dailies[0], streakWas = streaky.streak;
      const ach = { completedTask: true, streak: 0, perfect: 0, ultimateGearSets: {}, quests: { dilatoryDistress1: 1 } };
      await tab('Stable'); await page.waitForTimeout(600);
      check('growth: open Dailies give the soft morning light', (await scene()).done === false, JSON.stringify(await scene()));
      api.length = 0; page.on('request', onApi);
      await post('/mock/set', { user: { loginIncentives: 61, achievements: { ...ach, perfect: 7 } }, tasks: { [streaky._id]: { streak: 9 } } });
      m = await mark();
      await sync();
      const said = await snackAfter(m, 'grew');
      const g = await scene();
      check('growth: a read that reaches new stages names them once, with a sparkle', said === 'Your playground grew: 8 new trees, the first tree fully grown, 7 patches of flowers, stepping stones and a pond.' && g.sparkle
        && g.checkIns === 61 && g.perfectDays === 7 && g.streakDays === 9, JSON.stringify({ said, g }));
      check('growth: the phone remembers it has shown them', (await grown()).checkIns === 61);
      await page.screenshot({ path: `${SHOTS}/31-stable-grown.png` });
      await page.click('[data-k="pg-switch"]'); await page.waitForTimeout(250);
      await page.click('[data-k="pg-grows"]'); await page.waitForSelector('[data-k="pg-grows-sheet"]'); await page.waitForTimeout(300);
      const rows = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('[data-k="pg-grows-sheet"] li')].map(li => [li.dataset.k, li.textContent])));
      check('What grows here: each number, where the account is and the next stage',
        Object.keys(rows).join() === 'pg-grows-forest,pg-grows-flowers,pg-grows-water,pg-grows-stable,pg-grows-plaques,pg-grows-trophies,pg-grows-light'
        && /^Trophies.*0 of 38 of Habitica’s collection achievements\..*Next: /.test(rows['pg-grows-trophies'])
        && /61 days checked in: 9 trees, 2 still growing/.test(rows['pg-grows-forest']) && /Next: every tree fully grown at 70 days, 9 to go/.test(rows['pg-grows-forest'])
        && /7 Perfect Days: 7 patches of flowers/.test(rows['pg-grows-flowers']) && /Longest Daily streak: 9 days: a pond\./.test(rows['pg-grows-water']) && /still open today: soft morning light/.test(rows['pg-grows-light']), JSON.stringify(rows));
      const bars = await page.evaluate(() => ({
        total: document.querySelector('[data-k="pg-grows-total"]')?.textContent,
        parts: [...document.querySelectorAll('[data-k="pg-grows-sheet"] li')].map(li => li.querySelector('.pg-grows-bar')?.getAttribute('aria-valuenow') ?? null),
      }));
      check('What grows here: how far the playground and each part have grown, as bars', /^\d+% grown$/.test(bars.total || '') && bars.parts.slice(0, 6).every(v => v !== null) && bars.parts[2] === '42' && bars.parts[6] === null, JSON.stringify(bars));
      await page.screenshot({ path: `${SHOTS}/32-stable-what-grows.png` });
      await page.keyboard.press('Escape'); await page.waitForTimeout(300);
      // trophies: Habitica's collection achievements, a signpost halfway (10 of Plant Parent's 20 pets)
      const A = ITEMS.achievements, petsWas = (await mockState()).user.items.pets || {};
      const cactus = Object.fromEntries(A.dropPotions.map(p => [`Cactus-${p}`, 5]));
      m = await mark();
      await post('/mock/set', { user: { achievements: { ...ach, perfect: 7, backToBasics: true } }, items: { pets: { ...petsWas, ...cactus } } });
      await sync();
      const won = await snackAfter(m, 'grew'), tg = await scene();
      check('trophies: an achievement and a halfway one are named once, with a sparkle',
        won === `Your playground grew: a Base pennant for ${A.names.backToBasics[0]} and a signpost: ${A.names.plantParent[0]} is halfway.` && tg.sparkle
        && tg.trophies.join() === 'backToBasics' && tg.signs.join() === 'plantParent', JSON.stringify({ won, tg }));
      // tap each where it stands (the herd frozen, at a point no creature covers): Habitica's words, or how far
      const tapTrophy = key => page.evaluate(key => {
        const p = window.__stablePg, t = p.scene.ensure(p.world).trophies.find(s => s.key === key);
        if (!t) return null;
        p.stage.setShown(false);
        const r = p.stage.canvas.getBoundingClientRect(), f = p.stage.fit, k = r.width / f.backW;
        for (let ay = t.y1 - 2; ay > t.y0; ay--) for (let ax = t.x0 + 1; ax < t.x1 - 1; ax++) {
          const x = ax * 3 + 1, y = ay * 3 + 1;
          if (!p.world.hitTest(x, y)) return { x: r.left + (f.offX + (x + 0.5) * f.scale) * k, y: r.top + (f.offY + (y + 0.5) * f.scale) * k };
        }
        return null;
      }, key);
      const read = [];
      for (const key of ['backToBasics', 'plantParent']) {
        const at = await tapTrophy(key);
        m = await mark();
        if (at) await page.mouse.click(at.x, at.y);
        read.push(await snackAfter(m, A.names[key][0], 3000));
        await page.evaluate(() => window.__stablePg.stage.setShown(true));
      }
      check('trophies: a tap reads Habitica\'s name and line; on a signpost, the count so far',
        read[0] === `${A.names.backToBasics[0]}: ${A.names.backToBasics[1]}` && read[1] === `${A.names.plantParent[0]}, halfway: 10 of 20 pets. The trophy stands here when it’s done.`, JSON.stringify(read));
      check('trophies: the phone keeps them, and the offline copy keeps Habitica\'s flag',
        (await grown()).trophies.join() === 'backToBasics' && (await page.evaluate(() => JSON.parse(localStorage.getItem('critoracle:v2:cache') || '{}').raw?.achievements?.backToBasics)) === true);
      // a number that goes down (a death's level, a rebirth) takes nothing away, and says nothing
      // a broken streak too, and the pets given away
      await post('/mock/set', { user: { loginIncentives: 0, achievements: ach }, items: { pets: petsWas }, tasks: { [streaky._id]: { streak: streakWas } } });
      m = await mark();
      await sync(); await page.waitForTimeout(500);
      const after = await scene();
      check('growth: never shrinks, and a lower number is not news', after.checkIns === 61 && after.streakDays === 9 && after.trophies.join() === 'backToBasics' && after.signs.join() === 'plantParent' && !(await page.evaluate(m => window.__snacks.slice(m).some(t => /grew/.test(t)), m)), JSON.stringify(after));
      page.off('request', onApi);
      check('growth never calls Habitica (only the reads asked for)', api.every(u => /\/api\/v3\/(user|tasks|groups|content|status)/.test(u)), api.join(' '));
      await tab('Stats');
      await page.evaluate(() => localStorage.removeItem('critoracle:v2:growth'));
    }
    // ---------------------------------------------------------------- 14e2. the barn: a stall for every mount, the trophy wall, the pets come in
    {
      const api = [], onApi = q => { if (q.url().includes('/api/v3/')) api.push(`${q.method()} ${new URL(q.url()).pathname}`); };
      const SPR = require('../../src/data/sprites.json').mounts;
      // Habitica's stable families, as the barn groups them
      const fam = k => { const [e, p] = k.split('-'); return ITEMS.specialMounts[k] ? 'Special' : ITEMS.eggs[e]?.[2] === 'quest' ? 'Quest' : ITEMS.hatchingPotions[p]?.[2] === 'drop' ? 'Standard' : 'Magic Potion'; };
      const st0 = (await mockState()).user.items, mountsWas = st0.mounts || {};
      const more = ['Magic Potion', 'Quest', 'Special', 'Standard'].flatMap(f => Object.keys(SPR).filter(k => fam(k) === f && !mountsWas[k]).slice(0, 2));
      await post('/mock/set', { items: { mounts: { ...mountsWas, ...Object.fromEntries(more.map(k => [k, true])) } } });
      await tab('Stable'); await page.waitForTimeout(400); await sync(); await page.waitForTimeout(400);
      // the playground where Lupușor (the Base Wolf pup) lives
      const home = (await pgState()).playgrounds.find(p => p.residents.some(r => r.id === 'pet:Wolf-Base'));
      const was = (await pgState()).current;
      await page.click('[data-k="pg-switch"]'); await page.waitForTimeout(250);
      await page.click(`[data-k="pg-open-${home.id}"]`); await page.waitForTimeout(800);
      page.on('request', onApi);
      await page.click('[data-k="pg-switch"]'); await page.waitForTimeout(250);
      const sub = await page.textContent('[data-k="pg-barn"]');
      await page.click('[data-k="pg-barn"]');
      await page.waitForSelector('[data-k="barn-bar"]'); await page.waitForTimeout(1200);
      const barn = () => page.evaluate(() => {
        const b = window.__stableBarn, p = window.__stablePg;
        return b ? { stalls: b.row.stalls.map(s => s.id), families: b.row.stalls.filter(s => s.family).map(s => s.family), pets: b.herd.creatures.map(c => c.id), running: b.stage.running, label: b.stage.canvas.getAttribute('aria-label'),
          scroll: b.row.scroll, max: b.row.maxScroll(b.world), pg: p.stage.running, count: document.querySelector('[data-k="barn-count"]').textContent, toolbar: !!document.querySelector('[data-k="pg-bar"]').offsetParent, back: history.state?.layer === true } : null;
      });
      let b = await barn();
      const owned = Object.entries({ ...mountsWas, ...Object.fromEntries(more.map(k => [k, true])) }).filter(([k, v]) => v === true && SPR[k]).map(([k]) => `mount:${k}`);
      check('barn: in from the menu once the stable is built; a stall for every mount, in Habitica\'s families',
        !/level/.test(sub) && !!b && b.stalls.length === owned.length && owned.every(id => b.stalls.includes(id)) && b.families.join() === 'Standard,Magic Potion,Quest,Special'
        && b.stalls.every((id, i) => i === 0 || ['Standard', 'Magic Potion', 'Quest', 'Special'].indexOf(fam(b.stalls[i - 1].slice(6))) <= ['Standard', 'Magic Potion', 'Quest', 'Special'].indexOf(fam(id.slice(6))))
        && b.count === `${owned.length} mounts`, JSON.stringify({ sub, b, owned }));
      check('barn: the playground\'s pets come in, the playground stops under it, its own bar replaces the toolbar, Back leaves it',
        b.pets.join() === 'pet:Wolf-Base' && b.running && !b.pg && !b.toolbar && b.back && /Barn: \d+ mounts in their stalls, 0 of 38 trophies on the wall, 1 quest plaque\. Lupușor came in with you/.test(b.label), JSON.stringify(b));
      await page.screenshot({ path: `${SHOTS}/33-stable-barn.png` });
      // taps on the canvas, found in world pixels (the barn frozen)
      const tapAt = (fn, arg) => page.evaluate(([fn, arg]) => {
        const b = window.__stableBarn; b.stage.setShown(false);
        const w = new Function('b', 'arg', fn)(b, arg); if (!w) return null;
        const r = b.stage.canvas.getBoundingClientRect(), f = b.stage.fit, k = r.width / f.backW;
        return { x: r.left + (f.offX + (w.x + 0.5) * f.scale) * k, y: r.top + (f.offY + (w.y + 0.5) * f.scale) * k };
      }, [fn, arg]);
      const said = [];
      for (const key of ['beastMaster', 'backToBasics']) {
        const p = await tapAt('const t = b.layer.layout(b.world).trophies.find(t => t.key === arg); return t && { x: Math.round((t.x0 + t.x1) / 2) * 3 + 1, y: (t.y1 - 2) * 3 + 1 };', key);
        m = await mark(); if (p) await page.mouse.click(p.x, p.y);
        said.push(await snackAfter(m, ITEMS.achievements.names[key][0], 3000));
      }
      m = await mark();
      const pl = await tapAt('const t = b.layer.layout(b.world).plaques; return { x: (t.x0 + 3) * 3 + 1, y: (t.y0 + 3) * 3 + 1 };');
      await page.mouse.click(pl.x, pl.y);
      said.push(await snackAfter(m, 'plaque', 3000));
      check('barn: the trophy wall has every achievement, a tap says how far; the plaque board counts the quests',
        /^Beast Master: \d+ of 90 pets so far\.$/.test(said[0]) && /^Back to Basics: \d of 9 Base pets so far\.$/.test(said[1]) && said[2] === '1 quest finished: a plaque for each.', JSON.stringify(said));
      // a finger along the stalls scrolls them
      const from = await tapAt('const s = b.row.middle(b.world, 1); return { x: s.x + 60, y: s.y };');
      await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move(from.x - 60, from.y, { steps: 6 }); await page.mouse.move(from.x - 120, from.y, { steps: 6 }); await page.mouse.up();
      await page.waitForTimeout(200);
      const scrolled = await barn();
      check('barn: a finger along the stalls scrolls them, no further than the last', b.max > 0 && scrolled.scroll > 0 && scrolled.scroll <= b.max, JSON.stringify({ was: b.scroll, now: scrolled.scroll, max: b.max }));
      // a stall tapped: the mount's sheet with Ride, and Ride is the one call to Habitica
      const ride = await page.evaluate(() => { const b = window.__stableBarn, i = Math.ceil(b.row.scroll / (46 * 3)); return { i, id: b.row.stalls[i].id }; });
      const sp = await tapAt('return b.row.middle(b.world, arg);', ride.i);
      await page.mouse.click(sp.x, sp.y);
      await page.waitForSelector('.sheet.open [data-k="pg-ride"]', { timeout: 3000 }).catch(() => null);
      const kind = await page.textContent('.sheet.open [data-k="pg-sheet-kind"]').catch(() => '');
      m = await mark();
      await page.click('.sheet.open [data-k="pg-ride"]').catch(() => null);
      const rode = await snackAfter(m, 'riding', 5000);
      await page.waitForTimeout(300);
      check('barn: a stall tapped opens its mount\'s sheet; Ride rides it in Habitica', /Mount · (in its stall|lives in)/.test(kind) && /^You’re riding /.test(rode) && (await mockState()).user.items.currentMount === ride.id.slice(6), JSON.stringify({ ride, kind, rode }));
      await page.evaluate(() => window.__stableBarn.stage.setShown(true));
      // Back leaves the barn: the playground carries on
      await page.goBack(); await page.waitForTimeout(600);
      const out = await page.evaluate(() => ({ barn: !!window.__stableBarn, bar: !!document.querySelector('[data-k="barn-bar"]'), pg: window.__stablePg.stage.running, toolbar: !!document.querySelector('[data-k="pg-bar"]').offsetParent, hash: location.hash }));
      check('barn: Back comes out, the playground runs again with its toolbar', !out.barn && !out.bar && out.pg && out.toolbar && out.hash === '#stable', JSON.stringify(out));
      // tapping the stable building goes in too; the arrow comes out, and a tab tapped in the barn leaves it first
      const houseAt = () => {
        const p = window.__stablePg, h = p.scene.ensure(p.world).house; p.stage.setShown(false);
        const r = p.stage.canvas.getBoundingClientRect(), f = p.stage.fit, k = r.width / f.backW;
        for (let ay = h.y1 - 3; ay > h.y0; ay--) for (let ax = h.x0 + 4; ax < h.x1 - 2; ax++) {
          const x = ax * 3 + 1, y = ay * 3 + 1;
          if (!p.world.hitTest(x, y) && !p.scene.trophyAt(p.world, x, y)) return { x: r.left + (f.offX + (x + 0.5) * f.scale) * k, y: r.top + (f.offY + (y + 0.5) * f.scale) * k };
        }
        return null;
      };
      const house = await page.evaluate(houseAt);
      if (house) await page.mouse.click(house.x, house.y);
      const inByTap = !!(await page.waitForSelector('[data-k="barn-bar"]', { timeout: 3000 }).catch(() => null));
      await page.click('[data-k="barn-leave"]'); await page.waitForTimeout(500);
      const left = await page.evaluate(() => ({ barn: !!window.__stableBarn, layer: history.state?.layer === true, pg: window.__stablePg.stage.running }));
      check('barn: tapping the stable building goes in, the arrow comes out', !!house && inByTap && !left.barn && !left.layer && left.pg, JSON.stringify({ house, inByTap, left }));
      {
        // in full screen too: the barn keeps its bar, so its arrow is there to come out by (full screen's own Back gives way to it)
        await page.click('[data-k="stable-full"]'); await page.waitForTimeout(500);
        const at = await page.evaluate(houseAt);
        if (at) await page.mouse.click(at.x, at.y);
        const inFull = !!(await page.waitForSelector('[data-k="barn-bar"]', { timeout: 3000 }).catch(() => null));
        const seen = await page.evaluate(() => {
          const bar = document.querySelector('[data-k="barn-bar"]').getBoundingClientRect(), arrow = document.querySelector('[data-k="barn-leave"]'), r = arrow.getBoundingClientRect();
          return { full: document.getElementById('app').classList.contains('stable-full'), bar: [bar.top, bar.bottom], hit: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)?.closest('[data-k="barn-leave"]') === arrow,
            exit: !!document.querySelector('[data-k="stable-exit"]')?.offsetParent, below: (b => b.world.insets.top * b.stage.fit.scale * b.stage.canvas.getBoundingClientRect().height / b.stage.fit.backH)(window.__stableBarn) >= bar.bottom - 1 };
        });
        await page.click('[data-k="barn-leave"]'); await page.waitForTimeout(500);
        const out = await page.evaluate(() => ({ barn: !!window.__stableBarn, full: document.getElementById('app').classList.contains('stable-full'), exit: !!document.querySelector('[data-k="stable-exit"]')?.offsetParent, pg: window.__stablePg.stage.running }));
        check('barn in full screen: its bar and arrow stay on screen (the barn drawn under them), the arrow comes out to the full-screen playground',
          !!at && inFull && seen.full && seen.bar[0] >= 0 && seen.bar[0] < 40 && seen.hit && !seen.exit && seen.below && !out.barn && out.full && out.exit && out.pg, JSON.stringify({ at, inFull, seen, out }));
        await page.click('[data-k="stable-exit"]'); await page.waitForTimeout(500);
      }
      await page.click('[data-k="pg-switch"]'); await page.waitForTimeout(250); await page.click('[data-k="pg-barn"]'); await page.waitForSelector('[data-k="barn-bar"]');
      await tab('Now'); await page.waitForTimeout(600);
      const away = await page.evaluate(() => ({ hash: location.hash, barn: !!window.__stableBarn, state: history.state }));
      check('barn: another tab leaves it first, so Now is the bottom of history as from the Stable', away.hash === '#now' && !away.barn && away.state === null, JSON.stringify(away));
      page.off('request', onApi);
      check('barn: only Ride calls Habitica (and the reads asked for)', api.filter(u => !/^GET \/api\/v3\/(user|tasks|groups|content|status)/.test(u)).join() === `POST /api/v3/user/equip/mount/${ride.id.slice(6)}`, api.join(' '));
      // as it was: the mounts, and the playground that was open
      await post('/mock/set', { items: { mounts: mountsWas, currentMount: st0.currentMount } });
      await tab('Stable'); await page.waitForTimeout(400); await sync();
      await page.click('[data-k="pg-switch"]'); await page.waitForTimeout(250);
      await page.click(`[data-k="pg-open-${was}"]`); await page.waitForTimeout(800);
      await tab('Stats');
    }
    // ---------------------------------------------------------------- 14f. reactions: the boss in the sky, low HP, the level-up lantern, a crit in Relaxed
    {
      const r = () => page.evaluate(() => { const p = window.__stablePg; return { boss: p.boss.showing ? p.boss.place(p.world) : null, lit: p.lantern.lit, worried: p.herd.worried(), label: p.stage.canvas.getAttribute('aria-label') }; });
      const api = [], onApi = q => { if (q.url().includes('/api/v3/')) api.push(new URL(q.url()).pathname); };
      page.on('request', onApi);
      await tab('Stable'); await page.waitForTimeout(600);
      let s = await r();
      const [bw, bh] = require('../../src/data/boss-shapes.json').shapes.basilist, max = ITEMS.bossQuests.basilist[1];
      const hp = (await page.evaluate(() => (JSON.parse(localStorage.getItem('critoracle:v2:cache') || '{}').party || {}).quest?.progress?.hp));
      const k = 1 / 3 + 2 / 3 * Math.min(1, hp / max);
      check('boss quest: the boss’s silhouette is in the sky, sized by the HP it has left', !!s.boss && s.boss.w === Math.round(bw * k) && s.boss.h === Math.round(bh * k) && hp < max && /The Basi-List crosses the sky/.test(s.label), JSON.stringify({ boss: s.boss, hp }));
      await page.waitForTimeout(700);
      check('boss quest: it drifts across', (await r()).boss.x > s.boss.x, JSON.stringify([s.boss.x, (await r()).boss.x]));
      check('first visit since: the lantern is out', !s.lit && !s.worried);
      // low HP: they gather by the stable's door with a sweat drop; nothing pops up about it
      // at 10:00 on the herd's clock: from bedtime the creatures sleep, and a sleeper shows no sweat (CI runs in UTC, any hour);
      // not noon, when the Fox and the Cat nap (their twilight nature)
      await page.evaluate(() => { window.__stablePg.herd.o.clock = () => new Date(2026, 5, 1, 10); });
      const st0 = (await mockState()).user.stats;
      let m = await mark();
      await post('/mock/set', { stats: { hp: 12 } }); await sync();
      const sweat = await page.waitForFunction(() => window.__stablePg.herd.particles.some(q => q.kind === 'sweat'), null, { timeout: 8000 }).then(() => true, () => false);
      s = await r();
      check('low HP: the creatures worry, with a sweat drop, and TalkBack hears why', s.worried && sweat && /They gathered by the stable: your HP is low/.test(s.label), s.label);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${SHOTS}/33-stable-reactions.png` });
      await post('/mock/set', { stats: { hp: st0.hp } }); await sync(); await page.waitForTimeout(300);
      check('HP back up: they stop worrying', !(await r()).worried);
      // a level-up lights the lantern for the visit: at once when the Stable is open, else on the next visit
      await post('/mock/set', { stats: { lvl: st0.lvl + 1 } }); await sync(); await page.waitForTimeout(300);
      s = await r();
      check('level-up on screen: the lantern lights', s.lit && new RegExp(`The lantern is lit: you reached level ${st0.lvl + 1}`).test(s.label), s.label);
      await tab('Stats'); await tab('Stable'); await page.waitForTimeout(300);
      check('next visit with no new level: the lantern is out again', !(await r()).lit);
      await tab('Now');
      await post('/mock/set', { stats: { lvl: st0.lvl + 2 } }); await sync();
      await tab('Stable'); await page.waitForTimeout(300);
      check('level-up elsewhere: the lantern is lit on the next visit', (await r()).lit);
      // a boss quest won (Habitica raised its count): the boss breaks up in confetti, once, and leaves the sky,
      // though the party (read every 5 minutes) still says the quest is running
      // Habitica empties the party's quest as it hands out the rewards (Group.finishQuest); the app reads the party
      // every 5 minutes, so until then its last read still has the boss
      const { achievements: ach0, party: userParty0 } = (await mockState()).user;
      const party0 = { _id: 'party-1', type: 'party', name: 'Mock Party', memberCount: 1, quest: { key: 'basilist', active: true, leader: UID, progress: { hp, rage: 0 }, members: { [UID]: true } } };
      const wins = () => page.evaluate(() => (window.__stableWins || []).slice());
      let wonTimes = 0;
      const winQuest = () => post('/mock/set', { user: { achievements: { ...ach0, quests: { ...ach0.quests, basilist: ((ach0.quests || {}).basilist || 0) + (++wonTimes) } } } });
      const w0 = (await wins()).length;
      await post('/mock/set', { party: { ...party0, quest: {} } });
      await winQuest(); await sync();
      const beating = await page.waitForFunction(() => window.__stablePg.boss.beating, null, { timeout: 8000 }).then(() => true, () => false);
      await page.waitForTimeout(1000);
      await page.screenshot({ path: `${SHOTS}/34-stable-quest-won.png` });
      s = await r();
      check('boss quest won: the boss breaks up in confetti and leaves the sky, and TalkBack hears who won',
        beating && !s.boss && (await wins()).slice(w0).join() === 'basilist' && /Your party beat The Basi-List/.test(s.label) && !/crosses the sky/.test(s.label), JSON.stringify({ beating, boss: s.boss, wins: await wins(), label: s.label }));
      const over = await page.waitForFunction(() => !window.__stablePg.boss.beating, null, { timeout: 8000 }).then(() => true, () => false);
      await tab('Stats'); await tab('Stable'); await page.waitForTimeout(300);
      s = await r();
      check('quest won: the confetti is over in a few seconds, and the next visit has no second one', over && (await wins()).length === w0 + 1 && !s.boss && !/beat/.test(s.label), JSON.stringify({ over, wins: await wins(), label: s.label }));
      check('none of it pops up a message of its own', !(await page.evaluate(m => window.__snacks.slice(m).some(t => !/grew/.test(t) && /HP|lantern|level|boss|Basi/i.test(t)), m)), await page.evaluate(m => window.__snacks.slice(m).join(' | '), m));
      page.off('request', onApi);
      check('reactions never call Habitica (only the reads asked for)', api.every(u => /\/api\/v3\/(user|tasks|groups|content|status)/.test(u)), api.join(' '));
      await post('/mock/set', { stats: { lvl: st0.lvl } });
      // a crit landed in Relaxed is passed over for good; back in Full a new one is celebrated
      const modeTo = async m => { await tab('Settings'); await page.click(`[data-k="mode-row-${m}"]`); await page.waitForTimeout(300); };
      const crit = () => page.evaluate(() => { const p = window.__stablePg, at = Date.now(); p.journal().push({ at, day: p.today(), taskId: 'e2e', text: 'e2e', type: 'daily', mult: 1.5, exp: 0, gp: 0, mp: 0, dmg: 0 }); return at; });
      const seen = () => page.evaluate(uid => JSON.parse(localStorage.getItem('critoracle:v2:stable-crit') || '{}')[uid], UID);
      const crits = () => page.evaluate(() => (window.__stableCrits || []).slice());
      const n0 = (await crits()).length;
      await modeTo('relaxed');
      const at1 = await crit();
      await tab('Stable'); await page.waitForFunction(() => window.__stablePg?.herd.creatures.length > 0, null, { timeout: 10000 }); await page.waitForTimeout(300);
      check('Relaxed: a crit sets off nothing in the Stable, and is passed over', (await crits()).length === n0 && (await seen()) === at1, JSON.stringify(await seen()));
      await tab('Now'); await winQuest(); await sync(); await tab('Stable'); await page.waitForTimeout(300);
      const passed = await page.evaluate(uid => JSON.parse(localStorage.getItem('critoracle:v2:stable-quests') || '{}')[uid], UID);
      check('Relaxed: a quest won sets off nothing either, and is passed over', (await wins()).length === w0 + 1 && !(await page.evaluate(() => window.__stablePg.boss.beating)) && !passed.won && passed.counts.basilist === ((ach0.quests || {}).basilist || 0) + 2, JSON.stringify(passed));
      await modeTo('full');
      const at2 = await crit();
      await tab('Stable'); await page.waitForFunction(() => window.__stablePg?.herd.creatures.length > 0, null, { timeout: 10000 }); await page.waitForTimeout(300);
      const cs = (await crits()).slice(n0);
      check('Full: a crit landed while away is celebrated on the next visit, by someone who lives here', cs.length === 1 && cs[0] === `mount:Fox-Desert@${at2}` && (await seen()) === at2, cs.join());
      await post('/mock/set', { party: party0 }); await post('/mock/set', { user: { achievements: ach0, party: userParty0 } });
      // leave the journal as Habitica made it
      await page.evaluate(() => { const j = window.__stablePg.journal(); for (let i = j.length - 1; i >= 0; i--) if (j[i].taskId === 'e2e') j.splice(i, 1); localStorage.removeItem('critoracle:v2:growth'); });
      await tab('Now');
    }
    // ---------------------------------------------------------------- 14g. a collection quest's finds in the grass, and its win
    {
      const { achievements: ach0, party: userParty0 } = (await mockState()).user;
      const hp = await page.evaluate(() => (JSON.parse(localStorage.getItem('critoracle:v2:cache') || '{}').party || {}).quest?.progress?.hp);
      const party = quest => ({ _id: 'party-1', type: 'party', name: 'Mock Party', memberCount: 1, quest });
      const bossParty = party({ key: 'basilist', active: true, leader: UID, progress: { hp, rage: 0 }, members: { [UID]: true } });
      // the party is read every 5 minutes: a reload reads it at once
      const reload = async (to = 'Stable') => { await tab('Now'); await page.reload(); await page.waitForSelector('.appbar .headline', { timeout: 15000 }); await tab(to); if (to === 'Stable') await page.waitForFunction(() => !!window.__stablePg, null, { timeout: 10000 }); };
      await post('/mock/set', { party: party({ key: 'dilatoryDistress1', active: true, leader: UID, progress: { collect: { fireCoral: 10, blueFins: 5 } }, members: { [UID]: true } }) });
      await post('/mock/set', { user: { party: { _id: 'party-1', quest: { key: 'dilatoryDistress1', progress: { up: 0, down: 0, collectedItems: 3 } } } } });
      await reload();
      const lying = await page.waitForFunction(() => window.__stablePg.finds.showing, null, { timeout: 10000 }).then(() => true, () => false);
      await page.waitForFunction(() => performance.getEntriesByType('resource').some(e => /stable\/finds\.png/.test(e.name)), null, { timeout: 10000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${SHOTS}/35-stable-finds.png` });
      const f = await page.evaluate(() => {
        const p = window.__stablePg, s = p.finds.spots(p.world), b = p.scene.walk(p.world);
        return { n: s.length, inside: s.every(q => q.x >= b.left && q.x <= b.right && q.y >= b.top && q.y <= b.bottom), apart: new Set(s.map(q => `${q.x},${q.y}`)).size === s.length,
          sheet: performance.getEntriesByType('resource').some(e => /stable\/finds\.png/.test(e.name)), label: p.stage.canvas.getAttribute('aria-label') };
      });
      check('collection quest: its finds lie in the grass (4 Fire Coral, 2 Blue Fins), 3 found today glint, and TalkBack hears both',
        lying && f.n === 4 + 2 + 3 && f.inside && f.apart && f.sheet && /Fire Coral and Blue Fins lie in the grass: 10 of 20 and 5 of 20, 3 more found today, counted at the day change/.test(f.label), JSON.stringify(f));
      const again = await page.evaluate(() => { const p = window.__stablePg; return JSON.stringify(p.finds.spots(p.world)); });
      await tab('Stats'); await tab('Stable'); await page.waitForTimeout(300);
      check('collection quest: the finds lie in the same spots on the next visit', (await page.evaluate(() => { const p = window.__stablePg; return JSON.stringify(p.finds.spots(p.world)); })) === again);
      // won: the finds burst, once, and the grass is empty though the last party read still has the quest
      await post('/mock/set', { party: party({}) });
      await post('/mock/set', { user: { achievements: { ...ach0, quests: { ...ach0.quests, dilatoryDistress1: ((ach0.quests || {}).dilatoryDistress1 || 0) + 1 } } } });
      await sync();
      const popping = await page.waitForFunction(() => window.__stablePg.finds.popping, null, { timeout: 8000 }).then(() => true, () => false);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `${SHOTS}/36-stable-finds-won.png` });
      const w = await page.evaluate(() => { const p = window.__stablePg; return { showing: p.finds.showing, wins: window.__stableWins || [], label: p.stage.canvas.getAttribute('aria-label') }; });
      check('collection quest won: the finds burst in confetti once, the grass is empty, and TalkBack hears who won',
        popping && !w.showing && w.wins[w.wins.length - 1] === 'dilatoryDistress1' && /Your party finished Dilatory Distress, Part 1: Message in a Bottle/.test(w.label) && !/lie in the grass/.test(w.label), JSON.stringify(w));
      const over = await page.waitForFunction(() => !window.__stablePg.finds.popping, null, { timeout: 8000 }).then(() => true, () => false);
      check('collection quest won: the confetti is over in a few seconds', over);
      await post('/mock/set', { party: bossParty }); await post('/mock/set', { user: { achievements: ach0, party: userParty0 } });
      await reload('Now');
    }
    await post('/mock/set', { items: { pets: {}, mounts: {} } });
    await page.evaluate(() => localStorage.removeItem('critoracle:v2:stable'));

    await post('/mock/set', { items: { currentPet: '', currentMount: '' } });
    await tab('Now');
  }

  await tab('Stats');
  const how = await page.evaluate(() => {
    const s = [...document.querySelectorAll('details.fold > summary')].pop();
    const r = s.getBoundingClientRect(); const t = s.querySelector('.card-title').getBoundingClientRect();
    return { top: t.top - r.top, bottom: r.bottom - t.bottom };
  });
  check('“How the numbers work” is on Stats, title centred when closed', Math.abs(how.top - how.bottom) <= 1, JSON.stringify(how));
  await tab('Now');
  // the hero scrolls away with the page; the pinned row then shows the compact verdict
  await page.evaluate(() => window.scrollTo(0, 400)); await page.waitForTimeout(300);
  check('scrolled Now: compact verdict in the pinned bar', await page.evaluate(() => document.querySelector('.appbar').classList.contains('collapsed') && document.querySelector('.appbar-top').getBoundingClientRect().top === 0));
  await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(300);
  // pull to refresh: drag down from the top, let go past the threshold, the disc spins while Habitica is read
  {
    const before = (await mockLog()).length;
    const pull = (y) => page.evaluate(([y, type]) => {
      const t = new Touch({ identifier: 1, target: document.body, clientX: 200, clientY: y });
      document.body.dispatchEvent(new TouchEvent(type, { touches: type === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true }));
    }, y);
    await page.evaluate(() => { window.__spun = false; new MutationObserver(() => { if (document.querySelector('.ptr.spinning')) window.__spun = true; }).observe(document.querySelector('.ptr'), { attributes: true }); });
    await pull([200, 'touchstart']);
    for (let y = 220; y <= 520; y += 20) await pull([y, 'touchmove']);
    const armed = await page.evaluate(() => document.querySelector('.ptr').classList.contains('armed'));
    await pull([520, 'touchend']);
    await page.waitForTimeout(150); await idle(); await page.waitForTimeout(900);
    const reads = (await mockLog()).slice(before).filter(e => e.p === '/api/v3/user').length;
    const rest = await page.evaluate(() => document.querySelector('.ptr').className);
    check('pull to refresh: arms, spins, reads Habitica once, then tucks away', armed && (await page.evaluate(() => window.__spun)) && reads === 1 && rest === 'ptr', `armed ${armed}, reads ${reads}, ${rest}`);
    // a short pull does nothing
    const b2 = (await mockLog()).length;
    await pull([200, 'touchstart']); await pull([240, 'touchmove']); await pull([240, 'touchend']);
    await page.waitForTimeout(400);
    check('short pull: no read', (await mockLog()).slice(b2).filter(e => e.p === '/api/v3/user').length === 0);
  }
  await tab('Stats');
  check('Stats explains gear swaps', await page.locator('[data-k="numbers"] [data-k="gear-swaps"]').count() === 1);
  await page.emulateMedia({ colorScheme: 'dark' });
  await tab('Now');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/12-now-dark.png`, fullPage: true });
  await tab('Tasks');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${SHOTS}/13-tasks-dark.png`, fullPage: true });
  await page.emulateMedia({ colorScheme: 'light' });
};
