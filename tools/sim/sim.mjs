// The simulator: the web build answering itself. Loaded before the app (tools/build-sim.mjs puts it first), it
//   - answers every fetch() to SIM_API with tools/mock/habitica-mock.mjs running Habitica's own game code in the page,
//   - serves the bundled pet, mount and shop pictures from a few packed files (a published page can't hold 4,000),
//   - shows a Simulator panel to pick a made-up account and to throw edge cases at the app.
// Nothing here talks to habitica.com and nothing holds a real token: the login is the mock's made-up one.
import H from '../harness/.build/habitica-core.cjs';
import strings from '../harness/.build/strings-en.json';
import { createMock, USER_ID, API_TOKEN } from '../mock/habitica-mock.mjs';

/* global SIM_API, SIM_HABITICA */
const KEY = 'sim:v1';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } })();
const keep = patch => { Object.assign(saved, patch); try { localStorage.setItem(KEY, JSON.stringify(saved)); } catch { /* private mode */ } };

// ---- the phone's clock: an offset chosen in the panel, applied before anything reads the date
const shift = Number(saved.clockHours || 0) * 36e5;
if (shift) {
  const Real = Date;
  class SimDate extends Real {
    constructor (...a) { if (a.length) super(...a); else super(Real.now() + shift); }
    static now () { return Real.now() + shift; }
  }
  globalThis.Date = SimDate;
}

// ---- Habitica, in the page
H.i18n.strings = strings;
H.version = SIM_HABITICA;
let mock;
const call = (method, path, body) => mock.handle({ method, path, body: body ? JSON.stringify(body) : '' }).then(r => JSON.parse(r.body || '{}'));

const net = { offline: false, slowMs: 0 };
const realFetch = globalThis.fetch.bind(globalThis);
const requests = [];
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (!url.startsWith(SIM_API)) return realFetch(input, init);
  await ready;
  const path = url.slice(SIM_API.length);
  const method = (init.method || 'GET').toUpperCase();
  requests.push({ at: Date.now(), method, path });
  if (requests.length > 200) requests.shift();
  drawLog();
  const wait = net.slowMs + 60 + Math.random() * 120;
  await new Promise((resolve, reject) => {
    const t = setTimeout(resolve, wait);
    init.signal?.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); });
  });
  if (net.offline) throw new TypeError('Failed to fetch');
  const headers = {};
  new Headers(init.headers || {}).forEach((v, k) => { headers[k] = v; });
  const out = await mock.handle({ method, path, headers, body: typeof init.body === 'string' ? init.body : '' });
  return new Response(out.body || null, { status: out.status, headers: out.headers });
};

// ---- made-up accounts: each starts from the mock's account and changes it with the mock's own hooks
const day = 864e5;
const SCENARIOS = [
  { id: 'warrior', name: 'Warrior, level 24', note: 'The default: a party, a boss quest, gear to swap.', run: () => reset('warrior', 24) },
  { id: 'wizard', name: 'Mage, level 40', run: () => reset('wizard', 40) },
  { id: 'rogue', name: 'Rogue, level 30', run: () => reset('rogue', 30) },
  { id: 'healer', name: 'Healer, level 30', note: 'With three party members who need healing; their pets visit the Stable.', run: async () => { await reset('healer', 30); await set({ members: members() }); } },
  { id: 'new', name: 'New player, level 3', note: 'No class yet, little gold.', run: async () => { await reset('warrior', 3); await set({ stats: { gp: 12, mp: 0, points: 0 } }); } },
  { id: 'lvl10', name: 'Level 10, class just chosen', run: async () => { await reset('rogue', 10); await set({ stats: { points: 1 } }); } },
  { id: 'veteran', name: 'Level 150 Warrior, rich', note: 'Big numbers everywhere.', run: async () => { await reset('warrior', 150); await set({ stats: { gp: 98765, mp: 120, exp: 100 } }); } },
  { id: 'nomagic', name: 'Classes turned off', run: async () => { await reset('warrior', 24); await prefs({ disableClasses: true }); } },
  { id: 'lowhp', name: 'Low HP, deadly day change', note: 'HP 4 with Dailies open: the Inn advice and red warnings.', run: async () => { await reset('warrior', 24); await set({ stats: { hp: 4 } }); } },
  { id: 'dead', name: 'Out of HP', note: 'HP 0: revive preview.', run: async () => { await reset('wizard', 24); await set({ stats: { hp: 0 } }); } },
  { id: 'newday', name: 'A new day waiting', note: 'Habitica wants to start the day: record yesterday’s Dailies.', run: async () => { await reset('warrior', 24); await call('POST', '/mock/new-day'); } },
  { id: 'perfect', name: 'Every Daily done', run: async () => { await reset('healer', 24); const s = await state(); for (const t of s.tasks.filter(t => t.type === 'daily' && !t.completed && !t.challenge?.id)) await call('POST', '/mock/score-elsewhere', { taskId: t.id }); } },
  { id: 'broke', name: 'No gold, no mana', run: async () => { await reset('rogue', 24); await set({ stats: { gp: 0, mp: 0 } }); } },
  { id: 'buffed', name: 'Buffs on, stealth on', run: async () => { await reset('rogue', 30); await set({ stats: { buffs: { str: 12, int: 9, per: 30, con: 7, stealth: 2, streaks: true, snowball: false, spookySparkles: false, shinySeed: false, seafoam: false } } }); } },
  { id: 'solo', name: 'No party, no quest', run: async () => { await reset('wizard', 30); await set({ party: null }); } },
  { id: 'stable', name: 'Full stable, riding', note: 'Many pets and mounts, riding one, a pet out.', run: async () => { await reset('warrior', 40); await set({ items: stable() }); } },
  { id: 'empty', name: 'Empty account', note: 'No tasks at all.', run: async () => { await reset('warrior', 12); await call('POST', '/mock/clear-tasks'); } },
  { id: 'odd', name: 'Odd task names', note: 'Very long, emoji, markdown, right-to-left, HTML-looking.', run: async () => { await reset('wizard', 24); await oddNames(); } },
  { id: 'many', name: '120 tasks', run: async () => { await reset('warrior', 24); await manyTasks(); } },
  { id: 'daystart', name: 'Day starts at 04:00', note: 'Habitica’s Custom Day Start, with the phone near it.', run: async () => { await reset('warrior', 24); await prefs({ dayStart: 4 }); } },
  { id: 'travel', name: 'Phone in another time zone', note: 'Habitica set to New York (UTC−5) while the phone is wherever it is.', run: async () => { await reset('wizard', 24); await prefs({ timezoneOffset: 300 }); } },
  { id: 'newer', name: 'Habitica updated', note: 'Habitica reports a newer version than this build knows.', run: async () => { await reset('warrior', 24); await set({ appVersion: '9.99.0' }); } },
];

const reset = (cls, lvl) => call('POST', `/mock/reset?class=${cls}&level=${lvl}`);
const set = body => call('POST', '/mock/set', body);
const state = () => call('GET', '/mock/state');
const prefs = async p => set({ user: { preferences: { ...(await state()).user.preferences, ...p } } });
const members = () => [
  { _id: 'm-1', profile: { name: 'Ana' }, stats: { hp: 12, maxHealth: 50, mp: 30, maxMP: 60, lvl: 18, class: 'wizard', exp: 10, toNextLevel: 400, gp: 5, str: 0, con: 0, int: 10, per: 0, buffs: {} }, flags: { classSelected: true }, preferences: { disableClasses: false, size: 'broad', skin: 'c06534', shirt: 'green', hair: { color: 'black', base: 1, bangs: 2 } }, items: { currentPet: 'Dragon-Red', currentMount: '', gear: { equipped: { armor: 'armor_wizard_2', head: 'head_wizard_2' }, costume: {} } } },
  { _id: 'm-2', profile: { name: 'A name long enough to need wrapping on a small phone' }, stats: { hp: 49, maxHealth: 50, mp: 5, maxMP: 40, lvl: 7, class: 'warrior', exp: 1, toNextLevel: 150, gp: 5, str: 0, con: 0, int: 0, per: 0, buffs: {} }, flags: { classSelected: false }, preferences: { disableClasses: false, size: 'slim', skin: '915533', shirt: 'blue', hair: { color: 'red', base: 3, bangs: 1 } }, items: { currentPet: 'Wolf-Base', currentMount: 'Fox-Desert', gear: { equipped: { armor: 'armor_warrior_1' }, costume: {} } } },
  { _id: 'm-3', profile: { name: '<b>Bob</b> 🐉' }, stats: { hp: 0.4, maxHealth: 50, mp: 0, maxMP: 30, lvl: 60, class: 'rogue', exp: 1, toNextLevel: 1500, gp: 5, str: 0, con: 0, int: 0, per: 0, buffs: { snowball: true } }, flags: { classSelected: true }, preferences: { disableClasses: false }, items: { currentPet: 'Cactus-Base', currentMount: '', gear: { equipped: {}, costume: {} } } },
];
function stable () {
  const pets = {}; const mounts = {};
  const species = ['Wolf', 'Fox', 'Dragon', 'Cactus', 'BearCub', 'TigerCub', 'PandaCub', 'LionCub', 'FlyingPig', 'Egg'];
  const colors = ['Base', 'White', 'Desert', 'Red', 'Shade', 'Skeleton', 'Zombie', 'CottonCandyPink', 'CottonCandyBlue', 'Golden'];
  species.forEach((s, i) => colors.forEach((c, j) => { const k = `${s}-${c}`; if ((i + j) % 3) pets[k] = 5 + ((i * j) % 45); else mounts[k] = true; }));
  return { pets, mounts, currentPet: 'Fox-Golden', currentMount: 'Wolf-Shade', food: { Meat: 30, Milk: 12, Potatoe: 9, Strawberry: 5, Chocolate: 7, CottonCandyPink: 2, Honey: 4, Saddle: 3 } };
}
async function oddNames () {
  const s = await state();
  const names = [
    'A very long Daily name that goes on and on to see whether every screen wraps it properly instead of pushing the layout sideways, with a 🧹 broom and some more words at the end',
    '**Bold** _markdown_ [link](https://example.com) `code`',
    'قراءة القرآن — right to left',
    '<img src=x onerror=alert(1)> looks like HTML',
    '🏃‍♀️🔥💧🧘‍♂️',
    'Supercalifragilisticexpialidocious_without_any_spaces_at_all_for_wrapping',
  ];
  const own = s.tasks.filter(t => !t.challenge?.id && !t.group?.id && t.type !== 'reward');
  for (let i = 0; i < own.length; i++) await call('POST', '/mock/task', { taskId: own[i].id, text: names[i % names.length], notes: i % 2 ? names[(i + 1) % names.length] : '' });
}
async function manyTasks () {
  const kinds = ['habit', 'daily', 'todo'];
  for (let i = 0; i < 120; i++) {
    const type = kinds[i % 3];
    await call('POST', '/mock/add-task', { type, text: `${type === 'habit' ? 'Habit' : type === 'daily' ? 'Daily' : 'To-Do'} number ${i + 1}`, value: Math.round((Math.sin(i) * 20) * 10) / 10, priority: [0.1, 1, 1.5, 2][i % 4], streak: i % 17, completed: type === 'daily' && i % 5 === 0, checklist: i % 7 ? [] : [{ id: `c${i}a`, text: 'Step one', completed: true }, { id: `c${i}b`, text: 'Step two', completed: false }], startDate: new Date(Date.now() - 30 * day).toISOString() });
  }
}

// ---- things that happen while the app is open
const EVENTS = [
  { name: 'A tap in another app', note: 'Scores an open Daily or a habit behind the app’s back.', run: async () => {
    const s = await state();
    const t = s.tasks.find(t => t.type === 'daily' && !t.completed && !t.challenge?.id && !t.group?.id) || s.tasks.find(t => t.type === 'habit' && t.up);
    if (!t) return 'No task to score.';
    await call('POST', '/mock/score-elsewhere', { taskId: t.id, direction: 'up' });
    return `Scored “${t.text}” elsewhere.`;
  } },
  { name: 'The day changes', note: 'Habitica now wants to start a new day.', run: async () => { await call('POST', '/mock/new-day'); return 'A new day is waiting.'; } },
  { name: 'Next action refused', note: 'Habitica says no to the next score, cast or purchase.', run: async () => { for (const path of ['/score/', '/cast/', '/buy', '/equip/', '/sell/', '/allocate', '/revive', '/cron', '/tasks/user']) await call('POST', '/mock/fail', { path, status: 401, error: 'NotAuthorized', message: 'Refused by the simulator.', times: 1 }); return 'The next action will be refused once.'; } },
  { name: 'Too many requests', note: 'The next request gets a 429 with a 30 s wait.', run: async () => { await call('POST', '/mock/fail', { path: '/api/v3/', status: 429, error: 'TooManyRequests', message: 'Too many requests.', retryAfter: 30, times: 1 }); return 'The next request will get a 429.'; } },
  { name: 'Habitica is down', note: 'The next three requests answer 503.', run: async () => { await call('POST', '/mock/fail', { path: '/api/v3/', status: 503, error: 'ServiceUnavailable', message: 'Habitica is down for maintenance.', times: 3 }); return 'The next three requests will fail with 503.'; } },
  { name: 'Token reset elsewhere', note: 'Every request is now refused as a wrong token, until the account is picked again.', run: async () => { await call('POST', '/mock/fail', { path: '/api/v3/', status: 401, error: 'invalid_credentials', message: 'There is no account that uses those credentials.', times: 1000 }); return 'The token no longer works.'; } },
  { name: 'Lose 20 HP', note: 'A boss or a bad habit elsewhere.', run: async () => { const s = await state(); await set({ stats: { hp: Math.max(0, s.user.stats.hp - 20) } }); return 'HP down by 20.'; } },
  { name: 'Level up', run: async () => { const s = await state(); await set({ stats: { exp: s.user.stats.toNextLevel - 1 } }); await call('POST', '/mock/score-elsewhere', { taskId: s.tasks.find(t => t.type === 'habit' && t.up && !t.challenge?.id).id }); return 'Levelled up elsewhere.'; } },
  { name: 'Delete a task elsewhere', run: async () => { const s = await state(); const t = s.tasks.find(t => t.type === 'todo' && !t.group?.id) || s.tasks[0]; if (!t) return 'No task to delete.'; await call('POST', '/mock/delete-task', { taskId: t.id }); return `Deleted “${t.text}”.`; } },
];

// ---- the bundled pictures, unpacked on demand (tools/build-sim.mjs packs public/stable and public/shop)
const PACKED = /(?:^|\/)((?:stable|shop)\/[^?#]+)/;
let index;
const chunks = new Map();
const urls = new Map();
// Habitica's avatar layers come from its image server, which a published page can't load: the ones the made-up
// accounts wear are packed too (tools/sim/avatar-files.json)
const AVATAR = 'https://habitica-assets.s3.amazonaws.com/mobileApp/images/';
const keyOf = v => {
  if (typeof v !== 'string' || v.startsWith('blob:') || v.startsWith('data:') || !index) return null;
  if (v.startsWith(AVATAR)) { const k = `avatar/${v.slice(AVATAR.length).split('?')[0]}`; return k in index ? k : null; }
  const m = PACKED.exec(new URL(v, location.href).pathname);
  return m && m[1] in index ? m[1] : null;
};
function load (key) {
  if (urls.has(key)) return Promise.resolve(urls.get(key));
  const n = index[key];
  if (!chunks.has(n)) chunks.set(n, realFetch(`simpack/${n}.json`).then(r => r.json()));
  return chunks.get(n).then(c => {
    if (!urls.has(key)) {
      const bin = atob(c[key]); const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      urls.set(key, URL.createObjectURL(new Blob([bytes], { type: 'image/png' })));
    }
    return urls.get(key);
  });
}
const imgSrc = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
const pending = new WeakMap();
const setAttr = Element.prototype.setAttribute;
Object.defineProperty(HTMLImageElement.prototype, 'src', {
  configurable: true, enumerable: true,
  get () { return imgSrc.get.call(this); },
  set (v) {
    const k = keyOf(v);
    if (!k) return imgSrc.set.call(this, v);
    if (urls.has(k)) return imgSrc.set.call(this, urls.get(k));
    pending.set(this, load(k).then(u => imgSrc.set.call(this, u), () => imgSrc.set.call(this, v)));
  },
});
const decode = HTMLImageElement.prototype.decode;
HTMLImageElement.prototype.decode = function () { const p = pending.get(this); return p ? p.then(() => decode.call(this)) : decode.call(this); };
const CSS_URL = /url\((["']?)([^"')]+)\1\)/g;
Element.prototype.setAttribute = function (name, value) {
  if (name === 'src' && this instanceof HTMLImageElement) { this.src = value; return; }
  if (name === 'style' && typeof value === 'string' && value.includes('url(')) {
    const keys = [...value.matchAll(CSS_URL)].map(m => keyOf(m[2])).filter(Boolean);
    if (keys.length) {
      const swap = () => value.replace(CSS_URL, (all, q, u) => { const k = keyOf(u); return k && urls.has(k) ? `url("${urls.get(k)}")` : all; });
      if (keys.every(k => urls.has(k))) return setAttr.call(this, name, swap());
      Promise.all(keys.map(load)).then(() => { if (this.getAttribute('style') === value) setAttr.call(this, name, swap()); });
    }
  }
  return setAttr.call(this, name, value);
};

// ---- no service worker in the simulator (a published page can't have one, and the old one would serve stale files)
try { if (navigator.serviceWorker) navigator.serviceWorker.register = () => new Promise(() => {}); } catch { /* not there */ }

// ---- start: the chosen account, then the app
const chosen = SCENARIOS.find(s => s.id === saved.scenario) || SCENARIOS[0];
const ready = (async () => {
  index = await realFetch('simpack/index.json').then(r => r.json()).catch(() => ({}));
  mock = createMock(H, { rate: 30 });
  await chosen.run();
})();

// ---- the panel
let log; let toast;
function drawLog () {
  if (!log || log.hidden) return;
  log.replaceChildren(...requests.slice(-40).reverse().map(r => el('li', {}, `${new Date(r.at).toTimeString().slice(0, 8)}  ${r.method} ${r.path.replace('/api/v3', '')}`)));
}
function el (tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) setAttr.call(e, k, v === true ? '' : v); }
  e.append(...kids.flat().filter(k => k != null && k !== false));
  return e;
}
function say (text) { toast.textContent = text; toast.hidden = false; clearTimeout(say.t); say.t = setTimeout(() => { toast.hidden = true; }, 3500); }

const STYLE = `
:host { all: initial; }
* { box-sizing: border-box; }
.fab { position: fixed; z-index: 2147483000; right: 0; top: 42%; writing-mode: vertical-rl; font: 600 10px/1 system-ui, sans-serif; letter-spacing: .12em; color: #fff; background: #37474F; border: 0; border-radius: 8px 0 0 8px; padding: 8px 3px; padding-right: max(3px, env(safe-area-inset-right, 0px)); box-shadow: 0 1px 4px rgba(0,0,0,.3); cursor: pointer; opacity: .75; }
.fab:focus-visible, button:focus-visible, select:focus-visible { outline: 2px solid #FFC400; outline-offset: 2px; }
.scrim { position: fixed; inset: 0; z-index: 2147483001; background: rgba(0,0,0,.4); }
.sheet { position: fixed; z-index: 2147483002; left: 0; right: 0; bottom: 0; max-height: 85%; overflow: auto; background: var(--bg); color: var(--fg); border-radius: 12px 12px 0 0; padding: 16px max(16px, env(safe-area-inset-right, 0px)) calc(16px + env(safe-area-inset-bottom, 0px)) max(16px, env(safe-area-inset-left, 0px)); font: 14px/1.4 system-ui, sans-serif; box-shadow: 0 -4px 16px rgba(0,0,0,.3); max-width: 640px; margin: 0 auto; }
.sheet { --bg: #FAFAFA; --fg: #212121; --muted: #616161; --line: #E0E0E0; --chip: #fff; --on: #00796B; }
@media (prefers-color-scheme: dark) { .sheet { --bg: #263238; --fg: #ECEFF1; --muted: #B0BEC5; --line: #37474F; --chip: #2E3C43; --on: #4DB6AC; } }
h2 { font-size: 16px; margin: 0 0 4px; }
h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 16px 0 8px; }
p { margin: 0 0 8px; color: var(--muted); }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.opt { text-align: left; font: inherit; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 8px; padding: 8px 10px; cursor: pointer; min-height: 44px; }
.opt small { display: block; color: var(--muted); font-size: 12px; margin-top: 2px; }
.opt[aria-pressed="true"] { border-color: var(--on); box-shadow: inset 0 0 0 1px var(--on); }
.row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
label { display: flex; gap: 6px; align-items: center; min-height: 44px; }
select { font: inherit; padding: 6px; min-height: 40px; color: var(--fg); background: var(--chip); border: 1px solid var(--line); border-radius: 6px; }
code { font: 12px ui-monospace, monospace; user-select: all; overflow-wrap: anywhere; }
ol { font: 11px/1.5 ui-monospace, monospace; padding: 0; margin: 0; list-style: none; max-height: 180px; overflow: auto; color: var(--muted); }
.toast { position: fixed; z-index: 2147483003; left: 50%; transform: translateX(-50%); bottom: calc(env(safe-area-inset-bottom, 0px) + 96px); background: #37474F; color: #fff; padding: 10px 14px; border-radius: 8px; font: 13px system-ui, sans-serif; max-width: 90%; }
.close { float: right; font: inherit; background: none; border: 0; color: var(--on); font-weight: 600; min-height: 40px; cursor: pointer; }
`;

function panel () {
  const host = el('div', { id: 'sim-panel' });
  const root = host.attachShadow({ mode: 'open' });
  root.append(el('style', {}, STYLE));
  const fab = el('button', { class: 'fab', 'aria-label': 'Simulator', onclick: () => open() }, 'SIM');
  toast = el('div', { class: 'toast', role: 'status', hidden: true });
  root.append(fab, toast);
  let sheet; let scrim;
  const close = () => { sheet?.remove(); scrim?.remove(); sheet = null; };
  const pick = id => { keep({ scenario: id }); location.reload(); };
  function open () {
    if (sheet) return close();
    scrim = el('div', { class: 'scrim', onclick: close });
    log = el('ol', { 'aria-label': 'Requests' });
    sheet = el('div', { class: 'sheet', role: 'dialog', 'aria-label': 'Simulator' },
      el('button', { class: 'close', onclick: close }, 'Close'),
      el('h2', {}, 'Simulator'),
      el('p', {}, `A made-up Habitica account answered inside this page by Habitica’s own game code (${SIM_HABITICA}). Nothing goes to habitica.com. Reloading starts the account again.`),
      el('p', {}, 'Login: User ID ', el('code', {}, USER_ID), ' and API Token ', el('code', {}, API_TOKEN), ' (filled in for you).'),
      el('h3', {}, 'Account'),
      el('div', { class: 'grid' }, SCENARIOS.map(s => el('button', { class: 'opt', 'aria-pressed': String(s === chosen), onclick: () => pick(s.id) }, s.name, s.note && el('small', {}, s.note)))),
      el('h3', {}, 'Happens now'),
      el('div', { class: 'grid' }, EVENTS.map(e => el('button', { class: 'opt', onclick: async () => { close(); say(await e.run().catch(err => `Failed: ${err.message}`)); } }, e.name, e.note && el('small', {}, e.note)))),
      el('h3', {}, 'Connection'),
      el('div', { class: 'row' },
        el('label', {}, el('input', { type: 'checkbox', checked: net.offline, onchange: e => { net.offline = e.target.checked; say(net.offline ? 'Offline: requests fail.' : 'Back online.'); } }), 'Offline'),
        el('label', {}, el('input', { type: 'checkbox', checked: net.slowMs > 0, onchange: e => { net.slowMs = e.target.checked ? 4000 : 0; say(net.slowMs ? 'Each request now takes 4 s.' : 'Normal speed.'); } }), 'Slow (4 s)')),
      el('h3', {}, 'Phone clock'),
      el('div', { class: 'row' },
        el('select', { id: 'sim-clock', 'aria-label': 'Move the phone clock', onchange: e => { keep({ clockHours: Number(e.target.value) }); location.reload(); } },
          [[0, 'Real time'], [-12, '12 hours earlier'], [-6, '6 hours earlier'], [3, '3 hours later'], [6, '6 hours later'], [12, '12 hours later'], [24 * 30, 'A month later'], [24 * 120, 'Four months later (another season)']]
            .map(([v, t]) => el('option', { value: String(v), selected: Number(saved.clockHours || 0) === v }, t)))),
      el('h3', {}, 'Start over'),
      el('div', { class: 'row' }, el('button', { class: 'opt', onclick: () => { try { localStorage.clear(); } catch { /* blocked */ } location.reload(); } }, 'Forget everything', el('small', {}, 'Like a fresh install: intro, login, mode choice.'))),
      el('h3', {}, 'Requests the app sent'),
      log);
    root.append(scrim, sheet);
    drawLog();
  }
  document.body.append(host);
}

// the login form: fill in the made-up account so nobody types (or pastes) a real one here
function autofill () {
  const uid = document.getElementById('uid'); const tok = document.getElementById('tok');
  if (uid && tok && !uid.value && !tok.value && !uid.dataset.simFilled) {
    uid.dataset.simFilled = '1';
    uid.value = USER_ID; tok.value = API_TOKEN;
    for (const i of [uid, tok]) i.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
const boot = () => { panel(); new MutationObserver(autofill).observe(document.body, { childList: true, subtree: true }); autofill(); };
if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
// for tools that drive the simulator (tests/sweep.cjs)
window.__sim = {
  call, state, net, requests, scenario: chosen.id,
  scenarios: SCENARIOS.map(s => s.id), events: EVENTS.map(e => e.name),
  event: name => EVENTS.find(e => e.name === name).run(),
};
