// The habitica.com stand-in's state and routes, without a server: tools/mock-server.mjs serves it over HTTP for
// the e2e tests, and the simulator (tools/sim/) answers the app's fetch() with it inside the page.
// H is Habitica's own game code (tools/harness/load.cjs in Node; the same bundle in the simulator).
// It implements only the endpoints Sidekick calls, with the live server's response shapes,
// CORS headers, x-client enforcement, rate-limit headers and whole-number save hook.
// Cron is simplified (missed Dailies go through the real cron scoring; no drops, no quest boss damage to you).

export const USER_ID = '00000000-0000-4000-8000-000000000001';
export const API_TOKEN = '00000000-0000-4000-8000-00000000c0de';

export function createMock (H, { rate: RATE = 30, cls: startClass = 'warrior', level: startLevel = 24 } = {}) {
  const content = H.content;

  let user; let tasks; let party;
  // what the seeded task history says happened, per task and Habitica day (for the History screen's e2e checks)
  let historyTruth = {};
  // POST /mock/set { dropRoll: 0 } makes every score roll this for its item drop (0 = always drops while under the cap); null = no drops
  let dropRoll = null;
  // other party members (public fields only), as POST /mock/set { members } gives them
  let members = [];

  const GEAR_SETS = {
    warrior: ['weapon_warrior_3', 'armor_warrior_3', 'head_warrior_3', 'shield_warrior_3'],
    wizard: ['weapon_wizard_3', 'armor_wizard_3', 'head_wizard_3'],
    rogue: ['weapon_rogue_3', 'armor_rogue_3', 'head_rogue_3', 'shield_rogue_3'],
    healer: ['weapon_healer_3', 'armor_healer_3', 'head_healer_3', 'shield_healer_3'],
  };
  const MAIN_STAT = { warrior: 'str', wizard: 'int', rogue: 'per', healer: 'con' };

  function task (id, type, text, extra = {}) {
    return {
      _id: id, id, userId: USER_ID, type, text, notes: '', value: 0, priority: 1, attribute: 'str', streak: 0,
      checklist: [], completed: false, isDue: type === 'daily', up: true, down: false, history: [], group: {}, challenge: {},
      counterUp: 0, counterDown: 0, tags: [], frequency: 'daily', everyX: 1, createdAt: new Date().toISOString(),
      startDate: new Date(Date.now() - 100 * 864e5).toISOString(), repeat: { su: true, m: true, t: true, w: true, th: true, f: true, s: true },
      daysOfMonth: [], weeksOfMonth: [], ...extra,
    };
  }
  const item = (id, text, completed = false) => ({ id, text, completed });
  const weekdayOnly = d => Object.fromEntries(['su', 'm', 't', 'w', 'th', 'f', 's'].map((k, i) => [k, i === d]));

  // the account's time zone is the machine's, as Habitica's own apps keep it (they send x-user-timezoneOffset with each
  // request): tests then see the phone's day and Habitica's day change together, whatever zone or hour they run in
  function reset (cls = 'warrior', lvl = 24) {
    members = [];
    const main = MAIN_STAT[cls];
    const alloc = { str: 0, con: 0, int: 0, per: 0 };
    alloc[main] = Math.floor(lvl * 0.7);
    alloc.con += Math.floor(lvl * 0.15);
    const points = lvl - Object.values(alloc).reduce((a, b) => a + b, 0) > 2 ? 2 : 0;
    alloc.int += Math.max(0, Math.min(lvl, 100) - Object.values(alloc).reduce((a, b) => a + b, 0) - points);
    const equipped = { weapon: 'weapon_base_0', armor: 'armor_base_0', head: 'head_base_0', shield: 'shield_base_0', back: 'back_base_0', body: 'body_base_0', headAccessory: 'headAccessory_base_0', eyewear: 'eyewear_base_0' };
    const owned = {};
    for (const k of GEAR_SETS[cls]) { equipped[content.gear.flat[k].type] = k; owned[k] = true; }
    for (const k of GEAR_SETS[cls].map(k => k.replace(/_3$/, '_2')).concat(GEAR_SETS[cls].map(k => k.replace(/_3$/, '_1')))) if (content.gear.flat[k]) owned[k] = true;
    for (const k of ['armor_armoire_gladiatorArmor', 'head_armoire_lunarCrown', 'eyewear_armoire_plagueDoctorMask']) if (content.gear.flat[k]) owned[k] = true;
    user = {
      _id: USER_ID, id: USER_ID, _tmp: {}, guilds: ['team-1'],
      auth: { local: { username: 'mockplayer' }, timestamps: { created: '2025-01-01T00:00:00.000Z', loggedin: new Date().toISOString() } },
      profile: { name: 'Mock Player' },
      party: { _id: 'party-1', quest: { key: 'basilist', progress: { up: 0, down: 0, collectedItems: 0 }, completed: null, RSVPNeeded: false } },
      stats: {
        hp: 43, mp: 20, exp: Math.floor(tnl(lvl) * 0.4), gp: 312, lvl, class: cls, points,
        str: alloc.str, con: alloc.con, int: alloc.int, per: alloc.per,
        buffs: { str: 0, int: 0, per: 0, con: 0, stealth: 0, streaks: false, snowball: false, spookySparkles: false, shinySeed: false, seafoam: false },
        training: { int: 0, per: 0, str: 0, con: 0 },
      },
      items: {
        gear: { equipped, owned, costume: { ...equipped } },
        quests: {}, food: { Meat: 6, Milk: 4, Potatoe: 9, Honey: 2, Saddle: 1 }, eggs: { Wolf: 3, Fox: 2 }, hatchingPotions: { Base: 4, Red: 1 },
        special: { snowball: 0, spookySparkles: 0, shinySeed: 0, seafoam: 0 }, lastDrop: { count: 0, date: new Date() }, pets: {}, mounts: {},
      },
      preferences: { automaticAllocation: false, allocationMode: 'flat', dayStart: 0, timezoneOffset: new Date().getTimezoneOffset(), disableClasses: false, autoEquip: true, language: 'en' },
      achievements: { completedTask: true, streak: 0, perfect: 0, ultimateGearSets: {}, quests: { dilatoryDistress1: 1 } },
      loginIncentives: 0,
      flags: { classSelected: lvl >= 10, levelDrops: { atom1: true, vice1: true, goldenknight1: true, moonstone1: true }, customizationsNotification: true, itemsEnabled: true, rebirthEnabled: true },
      tasksOrder: { habits: [], dailys: [], todos: [], rewards: [] }, contributor: {}, purchased: { plan: {} }, pinnedItems: [], balance: 0,
      lastCron: new Date().toISOString(), needsCron: false,
      addNotification () {}, markModified () {}, addAchievement () {},
    };
    tasks = [
      task('h-water', 'habit', 'Drink a glass of water', { value: 3.2, attribute: 'con' }),
      task('h-stairs', 'habit', 'Take the stairs', { value: -1.5 }),
      task('h-scroll', 'habit', 'Doomscroll', { value: -6.0, up: false, down: true, attribute: 'per' }),
      task('h-stretch', 'habit', 'Stretch', { value: 0.5, down: true }),
      task('d-run', 'daily', 'Morning run', { value: 4.7, streak: 12, checklist: [item('c1', 'Warm up'), item('c2', '5 km'), item('c3', 'Cool down')] }),
      task('d-read', 'daily', 'Read 20 pages', { value: 1.2, streak: 3, attribute: 'int' }),
      task('d-inbox', 'daily', 'Inbox zero', { value: -3.4, priority: 1.5 }),
      task('d-guitar', 'daily', 'Practice guitar', { value: 8.9, streak: 30, attribute: 'per' }),
      task('d-floss', 'daily', 'Floss', { value: 12.6, streak: 45, attribute: 'con' }),
      // weekly, on the weekday two days ago only: never due "yesterday", although its stored isDue says true
      task('d-plants', 'daily', 'Water the plants', { value: 0, frequency: 'weekly', repeat: weekdayOnly(new Date(Date.now() - 2 * 864e5).getDay()) }),
      task('t-passport', 'todo', 'Renew passport', { value: -12.4, priority: 2, checklist: [item('p1', 'Photos', true), item('p2', 'Form'), item('p3', 'Appointment')] }),
      task('t-brakes', 'todo', 'Fix bike brakes', { value: -2.0 }),
      task('t-dentist', 'todo', 'Book dentist', { value: 0 }),
      // shared tasks: skills can't target these; Searing Brightness skips the active ones
      task('h-chal', 'habit', 'Challenge: 10 push-ups', { value: 15.5, challenge: { id: 'chal-1', taskId: 'ct-1', shortName: 'Fit' } }),
      task('d-chal-broken', 'daily', 'Old challenge: meditate', { value: 19.0, challenge: { id: 'chal-2', taskId: 'ct-2', broken: 'CHALLENGE_DELETED' } }),
      task('t-team', 'todo', 'Team: send the report', { value: 18.0, group: { id: 'team-1', assignedUsers: [USER_ID], assignedUsersDetail: { [USER_ID]: { completed: false } }, approval: {} } }),
      task('r-coffee', 'reward', 'Coffee', { value: 3 }),
      task('r-dessert', 'reward', 'Dessert', { value: 7 }),
      task('r-episode', 'reward', 'Episode of a show', { value: 10 }),
      task('r-gaming', 'reward', 'Hour of gaming', { value: 25 }),
    ];
    user.tasksOrder = {
      habits: tasks.filter(t => t.type === 'habit').map(t => t.id), dailys: tasks.filter(t => t.type === 'daily').map(t => t.id),
      todos: tasks.filter(t => t.type === 'todo').map(t => t.id), rewards: tasks.filter(t => t.type === 'reward').map(t => t.id),
    };
    seedHistory();
    const boss = content.quests.basilist.boss;
    party = { _id: 'party-1', type: 'party', name: 'Mock Party', memberCount: 1, quest: { key: 'basilist', active: true, leader: USER_ID, progress: { hp: boss.hp - 23, rage: 0 }, members: { [USER_ID]: true } } };
  }

  /**
   * Ten weeks of task history as Habitica writes it (ops/scoreTask.js, server/libs/cron.js): a day change each
   * morning at 07:00 the player's time with a few days away, Dailies checked during the day or left for the next
   * cron to record as unchecked, habits scored a few times a day. Deterministic, so tests can check the screen.
   */
  function seedHistory () {
    const tz = user.preferences.timezoneOffset;
    const DAY = 864e5;
    const dayOf = t => Math.floor((t - tz * 6e4 - user.preferences.dayStart * 36e5) / DAY);
    const today = dayOf(Date.now());
    const hash = (s, n) => { let x = 2166136261; for (const ch of `${s}:${n}`) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } x ^= x >>> 13; x = Math.imul(x, 0x5bd1e995) >>> 0; x ^= x >>> 15; return (x >>> 0) / 4294967296; };
    const crons = [];
    for (let d = today - 70; d < today; d += 1) if (d % 11 !== 5) crons.push({ day: d, at: d * DAY + tz * 6e4 + 7 * 36e5 });
    crons.push({ day: today, at: Date.parse(user.lastCron) });
    user.history = { exp: crons.map(c => ({ date: new Date(c.at).toISOString(), value: 0 })), todos: [] };
    historyTruth = {};
    for (const t of tasks) {
      if (t.type !== 'daily' && t.type !== 'habit') continue;
      const truth = historyTruth[t.id] = {};
      t.history = [];
      for (let i = 0; i < crons.length - 1; i += 1) {
        const c = crons[i];
        const r = hash(t.id, c.day);
        if (t.type === 'habit') {
          if (r > 0.65) continue;
          const up = t.up ? 1 + Math.floor(hash(`${t.id}u`, c.day) * 4) : 0;
          const down = t.down && hash(`${t.id}d`, c.day) < (t.up ? 0.25 : 0.6) ? 1 : 0;
          if (!up && !down) continue;
          t.history.push({ date: c.at + 5 * 36e5, value: t.value, scoredUp: up, scoredDown: down });
          truth[c.day] = { up, down };
        } else {
          const due = H.shouldDo(new Date(c.at), t, { dayStart: user.preferences.dayStart, timezoneOffset: tz });
          if (r < 0.7) {
            t.history.push({ date: c.at + 3 * 36e5, value: t.value, isDue: due, completed: true });
            truth[c.day] = due ? 'done' : 'extra';
          } else {
            t.history.push({ date: crons[i + 1].at + 1000, value: t.value, isDue: due, completed: false });
            truth[c.day] = due ? 'missed' : 'off';
          }
        }
      }
    }
  }

  let fails = [];
  // what Habitica reports as appVersion (the live server's package.json version); /mock/set { appVersion } changes it
  let appVersion = String(H.version || '').replace(/^v/, '');

  function tnl (L) { return L < 5 ? 25 * L : L === 5 ? 150 : Math.round((L * L * 0.25 + 10 * L + 139.75) / 10) * 10; }

  function saveHook () {
    for (const k of ['hp', 'mp', 'exp', 'gp']) {
      if (user.stats[k] > 99999999) user.stats[k] = 99999999;
      else if (!Number.isInteger(user.stats[k])) user.stats[k] = Math.floor(user.stats[k]);
    }
  }

  const clean = o => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v)));
  function statsJSON () { const s = clean(user.stats); return s; }
  /** user.toJSON() as action responses carry it: no computed stats, no needsCron (only GET /user adds those) */
  function userDoc () { const u = clean(user); delete u._tmp; delete u.needsCron; return u; }
  /** GET /user: plus toNextLevel, maxHealth, maxMP and needsCron (server/libs/user/index.js) */
  function userJSON () {
    const u = clean(user);
    delete u._tmp;
    u.stats.toNextLevel = tnl(user.stats.lvl);
    u.stats.maxHealth = 50;
    u.stats.maxMP = H.statsComputed(user).maxMP;
    u.needsCron = !!user.needsCron;
    return u;
  }

  class HttpError extends Error { constructor (status, error, message) { super(message); this.status = status; this.error = error; } }
  const notAuthorized = m => new HttpError(401, 'NotAuthorized', m);
  const badRequest = m => new HttpError(400, 'BadRequest', m);
  const notFound = m => new HttpError(404, 'NotFound', m);

  // wrap Habitica's own errors (NotAuthorized etc.) into HTTP errors
  async function op (fn) {
    try { return await fn(); } catch (e) {
      if (e instanceof HttpError) throw e;
      const name = e.name || e.constructor?.name || 'BadRequest';
      const status = name === 'NotFound' ? 404 : name === 'NotAuthorized' ? 401 : 400;
      throw new HttpError(status, name, e.message);
    }
  }

  /** a ticked To-Do leaves user.tasksOrder.todos, an unticked one comes back (libs/tasks/index.js scoreTask) */
  function todoOrder (t) {
    if (t.type !== 'todo' || t.group?.id) return;
    const order = user.tasksOrder.todos;
    if (t.completed) { const i = order.indexOf(t.id); if (i >= 0) order.splice(i, 1); } else if (!order.includes(t.id)) order.unshift(t.id);
  }

  const ownTask = id => {
    const t = tasks.find(x => x.id === id || x._id === id || x.alias === id);
    if (!t) throw notFound('Task not found.');
    return t;
  };

  const routes = [];
  const route = (method, pattern, handler) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), handler });

  route('GET', '/api/v3/user', () => userJSON());
  // like the live server: ticked To-Dos only with ?type=completedTodos (newest first), never in the plain list (libs/tasks/index.js)
  route('GET', '/api/v3/tasks/user', ({ query }) => {
    if (query.type === 'completedTodos') return clean(tasks.filter(t => t.type === 'todo' && t.completed).sort((a, b) => Date.parse(b.dateCompleted || 0) - Date.parse(a.dateCompleted || 0)));
    return clean(tasks.filter(t => !(t.type === 'todo' && t.completed)));
  });
  // a new task (createTasks in libs/tasks/index.js): only the fields Sidekick sends; it goes to the top of its list
  let created = 0;
  route('POST', '/api/v3/tasks/user', ({ body }) => {
    if (!body || body.type !== 'todo') throw badRequest('Task type must be one of "habit", "daily", "todo", "reward".');
    if (!String(body.text || '').trim()) throw badRequest('Task text cannot be empty.');
    if (![0.1, 1, 1.5, 2].includes(body.priority ?? 1)) throw badRequest('Task priority is not valid.');
    created += 1;
    const id = `t-new-${created}`;
    const t = task(id, 'todo', String(body.text), {
      notes: String(body.notes || ''), priority: body.priority ?? 1,
      checklist: (body.checklist || []).map((c, i) => item(`${id}-c${i}`, String(c.text), !!c.completed)),
    });
    tasks.splice(tasks.findIndex(x => x.type === 'todo'), 0, t);
    user.tasksOrder.todos.unshift(id);
    return clean(t);
  });
  route('GET', '/api/v3/groups/party', () => { if (!party) throw notFound('Group not found or you don’t have access.'); return clean(party); });
  // members with includeAllPublicFields: the player plus the test's members, computed stats added (members.js)
  route('GET', '/api/v3/groups/party/members', () => {
    if (!party) throw notFound('Group not found or you don’t have access.');
    const me = userJSON();
    return [{ _id: me._id, profile: me.profile, stats: me.stats, flags: { classSelected: me.flags?.classSelected }, preferences: { disableClasses: !!me.preferences?.disableClasses } }, ...clean(members)];
  });
  route('GET', '/api/v3/shops/seasonal', () => {
    const m = H.getScheduleMatchingGroup('seasonalSpells');
    const spells = Object.values(content.spells.special).filter(s => s.previousPurchase && m.match(s.key))
      .map(s => ({ key: s.key, text: s.text(), value: s.value, currency: 'gold', purchaseType: 'spells' }));
    return { identifier: 'seasonalShop', categories: spells.length ? [{ identifier: 'spells', text: 'Spells', items: spells }] : [] };
  });

  route('POST', '/api/v3/tasks/:taskId/score/:direction', ({ params }) => op(() => {
    const t = ownTask(params.taskId);
    const direction = params.direction;
    if (!['up', 'down'].includes(direction)) throw badRequest('Invalid direction');
    if (t.type === 'daily' || t.type === 'todo') {
      if (t.completed && direction === 'up') throw notAuthorized('Your session is outdated. Please refresh or sync.');
      if (!t.completed && direction === 'down') throw notAuthorized('Your session is outdated. Please refresh or sync.');
    }
    const firstTask = !user.achievements.completedTask;
    const delta = H.scoreTask({ user, task: t, direction, times: 1, cron: false }, { language: 'en' });
    // item drops (server/libs/tasks/index.js): off unless a test sets dropRoll, since the live server rolls with Math.random
    if (direction === 'up' && !firstTask && dropRoll !== null) H.randomDrop(user, { task: t, predictableRandom: () => dropRoll }, { language: 'en' });
    if (t.group?.assignedUsersDetail?.[USER_ID]) t.group.assignedUsersDetail[USER_ID].completed = t.completed;
    todoOrder(t);
    saveHook();
    return { delta, _tmp: clean(user._tmp), ...statsJSON() };
  }));

  route('POST', '/api/v3/tasks/:taskId/checklist/:itemId/score', ({ params }) => {
    const t = ownTask(params.taskId);
    const it = t.checklist.find(c => c.id === params.itemId);
    if (!it) throw notFound('Checklist item not found.');
    it.completed = !it.completed;
    return clean(t);
  });

  route('POST', '/api/v3/user/class/cast/:spellId', ({ params, query, body }) => op(() => {
    const { spellId } = params;
    const quantity = (body && body.quantity) || 1;
    const klass = content.spells.special[spellId] ? 'special' : user.stats.class;
    const spell = H.spells[klass][spellId];
    if (!spell) throw notFound(`Skill "${spellId}" not found.`);
    if (spell.mana > user.stats.mp) throw notAuthorized('Not enough mana.');
    if (spell.value > user.stats.gp && !spell.previousPurchase) throw notAuthorized('Not enough Gold');
    if (spell.lvl > user.stats.lvl) throw notAuthorized(`You need to be level ${spell.lvl} to use this skill.`);
    const req = { language: 'en' };
    if (spell.target === 'task') {
      if (!query.targetId) throw badRequest('"targetId" must be a valid UUID.');
      const t = ownTask(query.targetId);
      if (t.challenge.id) throw badRequest('You can’t cast a skill on a challenge task.');
      if (t.group.id) throw badRequest('You can’t cast a skill on a task assigned to you.');
      for (let i = 0; i < quantity; i++) spell.cast(user, t, req);
      saveHook();
      return { user: userDoc(), task: clean(t) };
    }
    if (spell.target === 'self') {
      if (spellId === 'stealth') {
        const due = tasks.filter(t => t.type === 'daily' && !t.completed && t.isDue).length;
        if (user.stats.buffs.stealth >= due) throw badRequest('You already cast that.');
      }
      for (let i = 0; i < quantity; i++) spell.cast(user, null, req);
      saveHook();
      return { user: userDoc() };
    }
    if (spell.target === 'tasks') {
      // models/task.js taskIsGroupOrChallengeQuery: broken challenge/group tasks count again
      const own = tasks.filter(t => (!t.challenge.id || t.challenge.broken) && (!t.group.id || t.group.broken));
      for (let i = 0; i < quantity; i++) spell.cast(user, own, req);
      saveHook();
      // the live response's "tasks" starts with the saved user document
      return { tasks: [userDoc(), ...clean(own)], user: userDoc() };
    }
    if (spell.target === 'party') {
      if (spell.bulk) {
        // buffs go to the database with updateMany; the response's user is the in-memory document without them
        const data = { query: { 'party._id': party ? party._id : user._id } };
        const pre = { ...user.stats.buffs };
        spell.cast(user, data);
        saveHook();
        const response = { partyMembers: [clean({ profile: user.profile, stats: user.stats })], user: userDoc() };
        const excluded = data.query['stats.class'] && data.query['stats.class'].$ne === user.stats.class;
        if (!excluded) {
          for (const [path, inc] of Object.entries(data.update.$inc)) {
            const k = path.split('.').pop();
            if (path.startsWith('stats.buffs.')) user.stats.buffs[k] = pre[k] + inc; else user.stats[k] += inc;
          }
        }
        return response;
      }
      for (let i = 0; i < quantity; i++) spell.cast(user, [user], req);
      saveHook();
      return { partyMembers: [clean({ profile: user.profile, stats: user.stats })], user: userDoc() };
    }
    // 'user' target (seasonal transformation items): only self in the mock
    for (let i = 0; i < quantity; i++) spell.cast(user, user, req);
    saveHook();
    return { partyMembers: [clean({ profile: user.profile, stats: user.stats })], user: userDoc() };
  }));

  const buyRoute = (path, reqFor) => route('POST', path, ({ params, body }) => op(async () => {
    const req = { language: 'en', params: { ...params }, body: body || {}, ...reqFor(params, body) };
    const [data, message] = await H.buy(user, req);
    saveHook();
    return { __data: clean(data), __message: message };
  }));
  buyRoute('/api/v3/user/buy-health-potion', () => ({ type: 'potion', params: { key: 'potion' } }));
  buyRoute('/api/v3/user/buy-gear/:key', () => ({}));
  buyRoute('/api/v3/user/buy-quest/:key', () => ({ type: 'quest' }));
  buyRoute('/api/v3/user/buy-special-spell/:key', () => ({ type: 'special' }));
  route('POST', '/api/v3/user/purchase/:type/:key', ({ params, body }) => op(async () => {
    if (params.type !== 'gems' || params.key !== 'gem') throw badRequest('Not supported by the mock');
    const quantity = Number(body?.quantity) || 1;
    const [data, message] = await H.buy(user, { params: { ...params }, type: 'gems', quantity, body: { quantity }, language: 'en' });
    saveHook();
    return { __data: clean(data), __message: message };
  }));
  route('POST', '/api/v3/user/sell/:type/:key', ({ params, query }) => op(() => {
    const [data] = H.sell(user, { params, query: { amount: query.amount ? Number(query.amount) : 1 }, language: 'en' });
    saveHook();
    return clean(data);
  }));
  route('POST', '/api/v3/user/equip/:type/:key', ({ params }) => op(() => {
    const [data, message] = H.equip(user, { params, language: 'en' });
    return { __data: clean(data), __message: message };
  }));
  route('POST', '/api/v3/user/allocate', ({ query }) => op(() => {
    const [data] = H.allocate(user, { query: { stat: query.stat || 'str' }, language: 'en' });
    saveHook();
    return clean(data);
  }));
  route('POST', '/api/v3/user/revive', () => op(() => {
    if (user.stats.hp > 0) throw notAuthorized('Cannot revive if not dead');
    const [data, message] = H.revive(user, { language: 'en' });
    saveHook();
    return { __data: clean(data), __message: message };
  }));
  route('POST', '/api/v3/cron', () => op(() => {
    if (!user.needsCron) return {};
    const now = new Date();
    for (const t of tasks) {
      if (t.group?.id) continue; // team tasks aren't part of the player's own cron in this stand-in
      if (t.type === 'daily') {
        // server/libs/cron.js: an unchecked Daily's entry for the day that ended
        if (!t.completed) t.history.push({ date: Number(new Date()), value: t.value, isDue: t.isDue, completed: false });
        if (t.isDue && !t.completed) H.scoreTask({ user, task: t, direction: 'down', cron: true, times: 1 }, { language: 'en' });
        t.completed = false; t.checklist.forEach(c => { c.completed = false; });
      } else if (t.type === 'todo' && !t.completed) {
        H.scoreTask({ user, task: t, direction: 'down', cron: true, times: 1 }, { language: 'en' });
      }
    }
    Object.assign(user.stats.buffs, { str: 0, int: 0, per: 0, con: 0, stealth: 0, streaks: false });
    user.history.exp.push({ date: now.toISOString(), value: 0 });
    user.needsCron = false; user.lastCron = now.toISOString();
    saveHook();
    return {};
  }));

  // test hooks (not part of Habitica's API)
  route('POST', '/mock/reset', ({ query }) => { reset(query.class || 'warrior', Number(query.level || 24)); fails = []; dropRoll = null; buckets.clear(); log = []; appVersion = String(H.version || '').replace(/^v/, ''); return { ok: true }; });
  route('POST', '/mock/new-day', () => { user.needsCron = true; tasks.filter(t => t.type === 'daily').forEach(t => { t.isDue = true; }); return { ok: true }; });
  route('GET', '/mock/state', () => ({ user: userJSON(), tasks: clean(tasks), historyTruth }));
  route('GET', '/mock/log', () => log.slice(-200));
  // what Habitica's own crit roll gives right now (fns/crit.js), for checking a promised skill crit before casting it
  route('GET', '/mock/crit', ({ query }) => ({ mult: H.crit.crit(user, query.stat || 'str', Number(query.base) || 0.03) }));
  // stat totals as the server computes them, optionally as if one more piece were equipped (for tests that need a gear swap)
  route('GET', '/mock/computed', ({ query }) => {
    const u = clean(user); u.markModified = () => {}; u.addNotification = () => {};
    if (query.equip) H.equip(u, { params: { type: 'equipped', key: query.equip }, language: 'en' });
    const c = H.statsComputed(u);
    return { str: c.str, con: c.con, int: c.int, per: c.per, equipped: u.items.gear.equipped };
  });
  route('POST', '/mock/set', ({ body }) => {
    Object.assign(user.stats, body.stats || {});
    if (body.items) Object.assign(user.items, body.items);
    if (body.user) Object.assign(user, body.user);
    // { tasks: { <id>: { streak: 9 } } } changes fields of tasks that exist (a Daily's streak, for the Stable's water)
    if (body.tasks) for (const [id, fields] of Object.entries(body.tasks)) { const t = tasks.find(x => x._id === id); if (t) Object.assign(t, fields); }
    if (body.appVersion) appVersion = body.appVersion;
    if ('dropRoll' in body) dropRoll = body.dropRoll;
    if (body.members) members = body.members;
    if ('party' in body) { party = body.party; user.party = body.party ? { _id: body.party._id, quest: { key: body.party.quest?.key, progress: { up: 0, down: 0, collectedItems: 0 } } } : { quest: { progress: { up: 0, down: 0, collectedItems: 0 } } }; } // a player without a party still has the schema's quest progress (models/user/schema.js)
    return { ok: true };
  });
  // the next `times` requests whose path contains `path` fail with this status (a refused step in a chain)
  route('POST', '/mock/fail', ({ body }) => { if (body.clear) { fails = []; return { ok: true }; } fails.push({ times: 1, status: 400, error: 'BadRequest', message: 'Refused by the test.', ...body }); return { ok: true }; });
  // a tap in another app: the server's numbers move without this client knowing
  route('POST', '/mock/score-elsewhere', ({ body }) => {
    const t = ownTask(body.taskId);
    H.scoreTask({ user, task: t, direction: body.direction || 'up', times: 1, cron: false }, { language: 'en' });
    todoOrder(t);
    saveHook();
    return { ok: true, stats: clean(user.stats) };
  });
  // a task deleted in another app
  route('POST', '/mock/delete-task', ({ body }) => {
    const t = ownTask(body.taskId);
    tasks = tasks.filter(x => x !== t);
    for (const k of Object.keys(user.tasksOrder)) user.tasksOrder[k] = user.tasksOrder[k].filter(id => id !== t.id);
    return { ok: true };
  });
  // change a task's stored fields (e.g. dateCompleted, to pretend it was ticked days ago)
  route('POST', '/mock/task', ({ body }) => { const { taskId, ...patch } = body; Object.assign(ownTask(taskId), patch); return { ok: true }; });
  // a task made in another app, any type: { type, text, ...fields }; it goes to the end of its list
  route('POST', '/mock/add-task', ({ body }) => {
    const { type = 'todo', text = 'New task', id = `t-mock-${tasks.length}-${Math.random().toString(36).slice(2, 8)}`, ...fields } = body;
    const t = task(id, type, String(text), { isDue: type === 'daily', ...fields });
    tasks.push(t);
    user.tasksOrder[type === 'daily' ? 'dailys' : `${type}s`].push(id);
    return { ok: true, id };
  });
  // every task gone (an empty account)
  route('POST', '/mock/clear-tasks', () => { tasks = []; for (const k of Object.keys(user.tasksOrder)) user.tasksOrder[k] = []; return { ok: true }; });

  // rate limiting like the live server: 30 points per 60 s per user
  const buckets = new Map();
  function rateLimit (key) {
    const now = Date.now();
    let b = buckets.get(key);
    if (!b || now > b.reset) { b = { used: 0, reset: now + 60_000 }; buckets.set(key, b); }
    b.used += 1;
    return { limit: RATE, remaining: Math.max(0, RATE - b.used), reset: new Date(b.reset).toString(), over: b.used > RATE, retry: (b.reset - now) / 1000 };
  }

  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'OPTIONS,GET,POST,PUT,HEAD,DELETE',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,Content-Encoding,X-Requested-With,x-api-user,x-api-key,x-client',
    'Access-Control-Expose-Headers': 'X-RateLimit-Limit,X-RateLimit-Remaining,X-RateLimit-Reset,Retry-After',
  };


  reset(startClass, startLevel);
  let log = [];

  /** One request as the live server answers it: { method, path (with its query), headers (lower-case names), body (text) } → { status, headers, body (text) }. */
  async function handle ({ method, path, headers = {}, body: raw = '' }) {
    const url = new URL(path, 'http://x');
    const send = (status, obj, extra = {}) => ({ status, headers: { 'content-type': 'application/json', ...CORS, ...extra }, body: JSON.stringify(obj) });
    if (method === 'OPTIONS') return { status: 200, headers: CORS, body: '' };
    const body = raw ? JSON.parse(raw) : {};
    const r = routes.find(x => x.method === method && x.re.test(url.pathname));
    if (!r) return send(404, { success: false, error: 'NotFound', message: 'Not found.' });
    const params = url.pathname.match(r.re).groups || {};
    const query = Object.fromEntries(url.searchParams);
    if (url.pathname.startsWith('/api/')) {
      if (!headers['x-client']) return send(400, { success: false, error: 'BadRequest', message: 'Missing x-client headers' });
      // middlewares/auth.js: InvalidCredentialsError, code 'invalid_credentials' (libs/errors.js)
      if (headers['x-api-user'] !== USER_ID || headers['x-api-key'] !== API_TOKEN) return send(401, { success: false, error: 'invalid_credentials', message: 'There is no account that uses those credentials.' });
      const rl = rateLimit(headers['x-api-user']);
      const rlh = { 'X-RateLimit-Limit': String(rl.limit), 'X-RateLimit-Remaining': String(rl.remaining), 'X-RateLimit-Reset': rl.reset };
      // middlewares/rateLimiter.js: Retry-After = msBeforeNext / 1000 (fractional seconds)
      if (rl.over) return send(429, { success: false, error: 'TooManyRequests', message: 'Too many requests.' }, { ...rlh, 'Retry-After': String(rl.retry) });
      log.push({ t: Date.now(), m: method, p: url.pathname, q: url.search, client: headers['x-client'] });
      const f = fails.find(x => x.times > 0 && url.pathname.includes(x.path) && (!x.query || url.search.includes(x.query)));
      if (f) {
        f.times -= 1; fails = fails.filter(x => x.times > 0);
        return send(f.status, { success: false, error: f.error, message: f.message }, f.retryAfter ? { ...rlh, 'X-RateLimit-Remaining': '0', 'Retry-After': String(f.retryAfter) } : rlh);
      }
      try {
        const out = await r.handler({ params, query, body });
        if (out && out.__data !== undefined) return send(200, { success: true, data: out.__data, message: out.__message, notifications: [], appVersion }, rlh);
        return send(200, { success: true, data: out, notifications: [], appVersion }, rlh);
      } catch (e) {
        return send(e.status || 500, { success: false, error: e.error || 'InternalServerError', message: e.message }, rlh);
      }
    }
    try { return send(200, await r.handler({ params, query, body })); } catch (e) { return send(500, { error: e.message }); }
  }

  return { handle, version: H.version, get log () { return log; } };
}
