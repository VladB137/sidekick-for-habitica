import { h, icon, button, plain, sheet, ripple, snackbar, fmt } from '../ui/dom';
import { store, type Objective, type Theme } from '../store';
import { RULES, type LeverKind, type StatKey } from '../../engine';
import { ITEMS } from '../model';
import { className } from './now';
import { STATS, STAT_NAME } from './stats';
import { native, type NativeStatus, type NightGear } from '../native';
import { openNotificationScreen } from './notification';
import { LINE_INFO } from '../lines';
import { has, mode, relaxed, setMode, MODE_INFO, type Mode } from '../mode';
import { replayCoach } from './modes';
import { openStableDream, openStableWallpaper } from '../stable/wallpaper';
import { hint } from '../ui/term';
import { foldCard } from '../ui/fold';
import { speakerRow } from './speaker';
import { demo, leaveDemo } from '../demo';
import { REPO, copyText, issueUrl, openOutside, reportDetails } from '../report';
import { describe, makeBackup, parseBackup, pickFile, restoreBackup, sameAccount, saveBackupFile } from '../backup';

const LEVER_NAME: Record<LeverKind, [string, string]> = {
  reward: ['Buy your own custom rewards', 'Only rewards you created, at their price.'],
  sell: ['Sell spare food, eggs and hatching potions', 'Food +1 Gold, eggs +3, hatching potions +2 or more.'],
  potion: ['Health Potion', 'Only when you’re missing HP. 25 Gold for up to 15 HP.'],
  skill: ['Class skills', 'Casting spends mana, which moves the roll.'],
  allocate: ['Spend a stat point', 'Only on the stat you choose above.'],
  gear: ['Swap gear you own', 'One piece, or your best set for the roll, with a button to put it back.'],
  purchase: ['Time purchases you’re saving for', 'Buy it when the price lands a crit.'],
  seasonal: ['Seasonal transformation items', 'Snowballs, Spooky Sparkles and the like, when on sale.'],
  done: ['Tasks you’ve already done', 'Score one you haven’t ticked yet, combined with another way. You confirm you did it each time.'],
  habitDown: ['Log a bad habit', 'Only if it really happened; costs HP. You confirm it each time.'],
};

export function confirmLogout () {
  // the made-up account has nothing to lose: straight back to the login screen
  if (demo) { leaveDemo(); return; }
  if (!native.available) { logoutSheet(); return; }
  // mid night swap on the phone: logging out would leave the night gear on in Habitica, so ask first
  void native.status().then(st => {
    const base = nightBase(st);
    if (!base) { logoutSheet(); return; }
    sheet('Your night gear is still on', h('p', null, 'Put your gear back first? Sidekick puts back what you wore before the night swap, then logs out. If you log out anyway, the night gear stays on in Habitica.'),
      [{ label: 'Cancel', run: () => {} }, { label: 'Log out anyway', run: () => store.logout() },
        { label: 'Put it back and log out', primary: true, run: async () => { if (await store.putBackNightGear(base)) store.logout(); } }]);
  });
}

/** The gear from before the phone's night swap, while night gear may be on (android NightSwap.baseGear). */
function nightBase (st: NativeStatus | undefined): Record<string, string> | undefined {
  const n = st?.night;
  if (!n?.base || !['equip', 'swapped', 'back'].includes(n.phase)) return undefined;
  try {
    const b = JSON.parse(n.base);
    return b && typeof b === 'object' && Object.keys(b).length ? b as Record<string, string> : undefined;
  } catch { return undefined; }
}

function logoutSheet () {
  sheet('Log out?', h('p', null, store.remember
    ? 'Sidekick forgets your User ID, API Token and its saved copy of your numbers on this device. Your Habitica account is not affected.'
    : 'Sidekick forgets your User ID and API Token. Your Habitica account is not affected.'),
  [{ label: 'Cancel', run: () => {} }, { label: 'Log out', primary: true, run: () => store.logout() }]);
}

function select<T extends string> (id: string, label: string, value: T | undefined, options: Array<[T | '', string]>, onChange: (v: T | '') => void): HTMLElement {
  const sel = h('select', { id, 'data-k': `set-${id}`, on: { change: (e: Event) => onChange((e.target as HTMLSelectElement).value as T | '') } },
    options.map(([v, text]) => h('option', { value: v, selected: (value ?? '') === v }, text)));
  return h('div', { class: 'field' }, sel, h('label', { for: id }, label));
}

function switchRow (title: string, sub: string, on: boolean, set: (v: boolean) => void, k: string): HTMLElement {
  return h('li', null, h('label', { class: 'li switch-row' },
    h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, title), h('span', { class: 'li-sub' }, sub)),
    h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: on, 'data-k': k, on: { change: (e: Event) => set((e.target as HTMLInputElement).checked) } })));
}

/** Every way a suggestion may use, each with its switch. A switch saves at once; Settings re-draws behind the sheet. */
function allowedWays () {
  const allow = store.settings.allow;
  sheet('Allowed ways', h('div', null,
    h('ul', { class: 'list' }, (Object.keys(LEVER_NAME) as LeverKind[]).map(k => h('li', null, h('label', { class: 'li switch-row' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, LEVER_NAME[k][0]), h('span', { class: 'li-sub' }, LEVER_NAME[k][1])),
      h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: allow[k] !== false, 'data-k': `lever-${k}`, on: { change: (e: Event) => { allow[k] = (e.target as HTMLInputElement).checked; store.saveSettings(); } } }),
    )))),
    h('p', { class: 'muted' }, 'It never suggests creating tasks or rewards, padding checklists, unchecking and re-checking, day-change or time-zone tricks, or editing stats, and it never scores a task you haven’t done.'),
  ), [{ label: 'Done', primary: true, run: () => {} }]);
}

export function settingsView (): HTMLElement {
  const s = store.state!;
  const st = store.settings;
  const save = () => store.saveSettings();
  const main = h('div');

  // ---------------------------------------------------------------- app mode
  main.append(modeCard());
  if (!has('crit')) { appendRest(main, st, save); return main; }

  // ---------------------------------------------------------------- aim
  const autoText = !s.classSelected ? 'XP (no class yet)' : s.cls === 'warrior' ? (store.bossActive ? 'boss damage (boss quest on)' : 'XP (no boss quest)') : s.cls === 'rogue' ? 'Gold' : 'XP';
  const targets = store.tasks.filter(x => !x.noCast && x.type !== 'reward');
  const kinds = Object.keys(LEVER_NAME) as LeverKind[];
  const on = kinds.filter(k => st.allow[k] !== false).length;
  main.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, icon('bolt'), h('h2', { class: 'card-title' }, 'Crits')),
    h('div', { class: 'card-body' },
      select<Objective | 'auto'>('obj', 'What should crits help with most?', st.objective, [
        ['auto', `Let the app decide: ${autoText}`], ['damage', 'Boss fights (boss damage)'], ['xp', 'Levelling up (XP)'], ['gold', 'Gold'], ['drops', 'Item drops and collection items'],
      ], v => { st.objective = (v || 'auto') as Objective | 'auto'; save(); }),
      h('p', { class: 'muted' }, 'Picks which of your done tasks a crit goes to.'),
      select<StatKey>('alloc', 'Where do you put your stat points?', st.allocateTo, [['', 'Not set (never suggested)'], ...STATS.map(k => [k, STAT_NAME[k]] as [StatKey, string])],
        v => { st.allocateTo = (v || undefined) as StatKey | undefined; save(); }),
      s.cls === 'warrior' && s.classSelected
        ? select<string>('smash', 'Which task should Brutal Smash hit?', st.smashTarget, [['', 'Your bluest task (default)'], ...targets.map(x => [x.id, plain(x.text)] as [string, string])],
          v => { st.smashTarget = v || undefined; save(); })
        : null,
    ),
    // levers: one row here, the switches in their own sheet
    h('ul', { class: 'list' }, h('li', null, ripple(h('button', { class: 'li li-btn', type: 'button', 'data-k': 'allowed-ways', on: { click: () => allowedWays() } },
      h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'What may it suggest?'), h('span', { class: 'li-sub' }, `${on} of ${kinds.length} ways on`)),
      icon('chevron_right'))))),
  ));

  // ---------------------------------------------------------------- items and gear
  main.append(h('div', { class: 'card hue-brown' },
    h('div', { class: 'card-head' }, icon('tune'), h('h2', { class: 'card-title' }, 'Items and gear')),
    h('div', { class: 'card-body' },
      select<string>('keep', 'How many of each item should it keep?', String(st.keepItems), [['0', 'None: any can be sold'], ['1', 'Keep 1 of each'], ['2', 'Keep 2 of each'], ['5', 'Keep 5 of each'], ['10', 'Keep 10 of each']],
        v => { st.keepItems = Number(v) || 0; save(); }),
    ),
    h('ul', { class: 'list' },
      switchRow('Don’t sell what my pets still need', 'Suggested only after everything cheaper.', st.protectStable, v => { st.protectStable = v; save(); }, 'protect'),
      switchRow('Put swapped gear back by itself', 'Once the crit has been used.', st.autoRestore, v => { st.autoRestore = v; save(); }, 'auto-restore'),
    )));

  appendRest(main, st, save);
  return main;
}

/** Full or Relaxed: two radio rows; a change shows at once and loses nothing (hidden settings keep their values). */
function modeCard (): HTMLElement {
  const now = mode();
  const row = (m: Mode) => h('li', null, h('label', { class: 'li switch-row', 'data-k': `mode-row-${m}` },
    h('input', { type: 'radio', name: 'app-mode', class: 'radio', checked: now === m, 'data-k': `mode-${m}`,
      on: { change: () => { void setMode(m); } } }),
    h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, MODE_INFO[m].name), h('span', { class: 'li-sub' }, MODE_INFO[m].short))));
  return h('div', { class: 'card', 'data-k': 'mode-card' },
    h('div', { class: 'card-head' }, icon('tune'), h('h2', { class: 'card-title' }, 'App mode')),
    h('ul', { class: 'list', role: 'radiogroup', 'aria-label': 'App mode' }, row('full'), row('relaxed')),
    h('div', { class: 'card-body small muted' }, relaxed()
      ? `${MODE_INFO.relaxed.hides} Your choices for them are kept for when you switch back.${store.settings.nightPaused ? ' Night gear is paused until then.' : ''}`
      : 'Relaxed hides crit planning, skills, gear swaps and selling, and opens on your Stable.'));
}

/** The cards both modes have: display, the phone, account, about. */
function appendRest (main: HTMLElement, st: typeof store.settings, save: () => void) {
  const s = store.state!;
  // ---------------------------------------------------------------- look and feel
  main.append(h('div', { class: 'card hue-blue' },
    h('div', { class: 'card-head' }, icon('palette'), h('h2', { class: 'card-title' }, 'Display')),
    h('div', { class: 'card-body' },
      select<Theme>('theme', 'Theme', st.theme, [['system', 'Follow the system'], ['light', 'Light'], ['dark', 'Dark']], v => { st.theme = (v || 'system') as Theme; save(); }),
    ),
    h('ul', { class: 'list' }, speakerRow(), has('crit') ? h('li', null, h('label', { class: 'li switch-row' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Vibrate on crits'), h('span', { class: 'li-sub' }, 'When a crit lands or your next task becomes one.')),
      h('input', { type: 'checkbox', role: 'switch', class: 'switch', checked: st.haptics, 'data-k': 'haptics', on: { change: (e: Event) => { st.haptics = (e.target as HTMLInputElement).checked; save(); } } }),
    )) : null),
  ));

  // ---------------------------------------------------------------- Android extras
  if (native.available) main.append(androidCard());

  // ---------------------------------------------------------------- account
  const name = store.snap?.name || 'your account';
  if (demo) main.append(h('div', { class: 'card hue-brown' },
    h('div', { class: 'card-head' }, icon('lock'), h('h2', { class: 'card-title' }, 'Account')),
    h('div', { class: 'card-body' },
      h('p', null, `A made-up account, ${name}${s.classSelected ? `, ${className(s.cls)}` : ''}.`),
      h('p', { class: 'muted' }, 'Habitica’s own game code answers on this device, so everything works as with a real account. Nothing goes to Habitica, nothing is kept, and the phone’s notification, widgets and wallpaper wait for your own account.')),
    h('div', { class: 'card-actions' }, button('Use my account', leaveDemo, { icon: 'key', k: 'logout' })),
  ));
  else main.append(h('div', { class: 'card hue-brown' },
    h('div', { class: 'card-head' }, icon('lock'), h('h2', { class: 'card-title' }, 'Account')),
    h('div', { class: 'card-body' },
      h('p', null, `Connected as ${name}${s.classSelected ? `, ${className(s.cls)}` : ''}.`),
      h('p', { class: 'muted' }, 'Your API Token goes only to habitica.com. ', store.remember ? 'It is stored on this device; logging out deletes it. ' : 'It is not stored. ',
        hint('Your API Token', ['Your API Token works like a password. Sidekick sends it only to habitica.com and never logs it.', store.remember
          ? 'Because you chose “Remember on this device”, it is stored on this device (in Android’s Keystore on a phone), with a copy of your last numbers so the app opens instantly. Logging out deletes both.'
          : 'It is not stored: it is forgotten when you close the app.'], 'token')),
    ),
    h('ul', { class: 'list' },
      navRow('Back up to a file', 'Repeating To-Dos, pet names, playgrounds, the crit journal and settings, for a new phone. Never your API Token.', () => { void backUp(); }, 'backup'),
      navRow('Restore from a file', 'A backup saved by Sidekick replaces what this phone keeps.', () => { void restore(); }, 'restore')),
    h('div', { class: 'card-actions' }, button('Log out', confirmLogout, { icon: 'logout', k: 'logout' })),
  ));

  // ---------------------------------------------------------------- about
  main.append(foldCard('about', { icon: 'info', title: 'About' }, [
    h('div', { class: 'card-body' },
      h('p', null, `Sidekick for Habitica ${__APP_VERSION__} (${__BUILD_DATE__}). Game rules checked against Habitica ${RULES.checkedAgainst}; item table from Habitica ${ITEMS.habitica}.`),
      h('p', null, 'Independent and open source (GPL-3.0). Not affiliated with or endorsed by Habitica. ', h('a', { href: REPO, target: '_blank', rel: 'noopener' }, 'Source code'), '.'),
      h('p', null, button('Show the tips again', () => replayCoach(), { icon: 'help_outline', k: 'replay-tips' })),
      h('p', null, button('Report a problem', () => reportSheet(), { icon: 'bug_report', k: 'report' })),
      h('p', { class: 'small muted' }, 'Game logic ported from Habitica (GPL-3.0). Item, skill, pet and mount artwork © HabitRPG, Inc., ',
        h('a', { href: 'https://creativecommons.org/licenses/by-nc-sa/3.0/', target: '_blank', rel: 'noopener' }, 'CC BY-NC-SA 3.0'),
        ', bundled with the app (cropped and re-encoded) and staying under that licence; the avatar’s layers load from Habitica’s asset server. Material Icons © Google (Apache 2.0). Roboto and Nunito (SIL OFL 1.1).'),
    ),
  ]));
}

/** A row that opens something: title, a line under it, a chevron. */
function navRow (title: string, sub: string, run: () => void, k: string): HTMLElement {
  return h('li', null, ripple(h('button', { class: 'li li-btn', type: 'button', 'data-k': k, on: { click: run } },
    h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, title), h('span', { class: 'li-sub' }, sub)),
    icon('chevron_right'))));
}

/**
 * Phones that put apps to sleep (Samsung, Xiaomi, Huawei and others) stop the notification, the refresh, night gear
 * and reminders without a word. The app can't change that; this says where the player can, in Android's settings.
 */
function keepRunning () {
  const step = (who: string, how: string) => h('li', null, h('b', null, who), ` ${how}`);
  sheet('Keep running on this phone', h('div', { 'data-k': 'keep-running-sheet' },
    h('p', null, 'Some phones stop apps they think you aren’t using, even with notifications allowed. The verdict notification, the 15-minute refresh, night gear and repeating To-Do reminders then stop until you open the app again. Sidekick can’t switch this off itself; it’s in Android’s settings:'),
    h('ul', { class: 'keep-steps' },
      step('Every phone:', 'Settings → Apps → Sidekick for Habitica → Battery → Unrestricted (on some phones “Don’t optimise”).'),
      step('Samsung:', 'Settings → Battery → Background usage limits: take Sidekick for Habitica out of Sleeping apps and Deep sleeping apps, or add it to Never sleeping apps.'),
      step('Xiaomi, Redmi, POCO:', 'Settings → Apps → Manage apps → Sidekick for Habitica: switch Autostart on, and set Battery saver to No restrictions.'),
      step('Huawei, Honor:', 'Settings → Battery → App launch → Sidekick for Habitica: switch to Manage manually, with Auto-launch, Secondary launch and Run in background on.')),
    h('p', { class: 'muted' }, 'The names move a little between Android versions. dontkillmyapp.com has the steps for other makers.'),
  ), [
    { label: 'dontkillmyapp.com', run: () => openOutside('https://dontkillmyapp.com/') },
    { label: 'Done', primary: true, run: () => {} },
  ], { k: 'keep-running' });
}

/** The details a bug report starts with, shown before anything leaves the phone; GitHub opens in the browser. */
function reportSheet () {
  const details = reportDetails();
  sheet('Report a problem', h('div', null,
    h('p', null, 'This opens a new issue on GitHub in your browser with these lines filled in. Say there what you did and what happened.'),
    h('pre', { class: 'report-details', 'data-k': 'report-details' }, details),
    h('p', { class: 'muted' }, 'Nothing from your Habitica account is in them. Never paste your API Token into an issue.'),
  ), [
    { label: 'Copy', keepOpen: true, run: async () => { snackbar(await copyText(details) ? 'Copied.' : 'This phone didn’t let the app copy. Select the lines and copy them.'); } },
    { label: 'Open GitHub', primary: true, run: () => openOutside(issueUrl(details)) },
  ], { k: 'report-sheet' });
}

async function backUp () {
  const b = await makeBackup();
  if (await saveBackupFile(b)) snackbar(native.available ? 'Backup saved.' : 'Backup downloaded. Keep the file somewhere safe.');
  else if (native.available) snackbar('No backup saved.');
}

async function restore () {
  const text = await pickFile();
  if (text === undefined) return;
  const b = parseBackup(text);
  if (typeof b === 'string') { snackbar(b, { error: true }); return; }
  const same = await sameAccount(b);
  const made = new Date(b.made);
  const when = Number.isFinite(made.getTime()) ? made.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) : 'an earlier day';
  sheet('Restore this backup?', h('div', null,
    h('p', null, `From ${when}: ${describe(b, same).join(', ')}. It replaces what this phone keeps for ${store.snap?.name || 'this account'}; your Habitica account itself is not changed.`),
    same ? null : h('p', { class: 'muted', 'data-k': 'restore-other' }, 'It was made on another Habitica account, so its crit journal stays out and its repeating To-Dos come back as To-Dos to add here.'),
  ), [{ label: 'Cancel', run: () => {} }, { label: 'Restore', primary: true, run: async () => {
    const { skipped } = await restoreBackup(b);
    snackbar(skipped.length
      ? `Restored, except ${skipped.join(' and ')}: they need “Remember on this device”.`
      : 'Restored.', { error: skipped.length > 0 });
  } }], { k: 'restore-sheet' });
}

/** What Android last said about the notification, usage access and the refresh job. Asked again each time
 * Settings is drawn after a pause (coming back from Android's usage-access screen, say), then re-drawn. */
let nativeStatus: NativeStatus | undefined;
let askedAt = 0;
function refreshNativeStatus () {
  if (Date.now() - askedAt < 2000) return;
  askedAt = Date.now();
  void native.status().then(st => { if (st) { nativeStatus = st; store.emit(); } });
}

/** The notification, the Habitica-closed trigger and the 15-minute refresh. All need the token remembered (Keystore). */
function androidCard (): HTMLElement {
  const can = store.remember;
  refreshNativeStatus();
  const st = nativeStatus;
  const notif = h('input', {
    type: 'checkbox', role: 'switch', class: 'switch', disabled: !st || !can, checked: !!st?.notification, 'data-k': 'native-notification',
    on: { change: (e: Event) => { const on = (e.currentTarget as HTMLInputElement).checked; void native.setNotification(on).then(r => { if (r && nativeStatus) { nativeStatus.notification = r.on; store.emit(); } }); } },
  });
  const refresh = h('input', {
    type: 'checkbox', role: 'switch', class: 'switch', disabled: !st || !can, checked: !!st?.backgroundRefresh, 'data-k': 'native-refresh',
    on: { change: (e: Event) => { const on = (e.currentTarget as HTMLInputElement).checked; if (nativeStatus) nativeStatus.backgroundRefresh = on; void native.setBackgroundRefresh(on); } },
  });
  const usageSub = h('span', { class: 'li-sub' }, !st ? 'Checking…' : st.usageAccess
    ? 'Allowed: one read each time Habitica closes.'
    : 'Needs usage access, granted in Android’s settings. Used only to notice Habitica closing.');
  const usageBtn = button(st?.usageAccess ? 'Change' : 'Allow', () => { void native.openUsageAccess(); }, { k: 'native-usage' });
  // blocked in Android's settings (or the permission denied): the notification and the reminders can't show
  const blocked = st?.notificationsEnabled === false
    ? h('li', { 'data-k': 'notif-blocked' }, h('div', { class: 'li switch-row' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Notifications are blocked for Sidekick'),
        h('span', { class: 'li-sub' }, 'The verdict notification and repeating To-Do reminders can’t show until you allow them in Android’s settings.')),
      button('Open settings', () => { void native.openNotificationSettings(); }, { k: 'notif-open-settings' })))
    : null;
  const row = (title: string, sub: HTMLElement | string, control: HTMLElement) => h('li', null, h('label', { class: 'li switch-row' },
    h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, title), typeof sub === 'string' ? h('span', { class: 'li-sub' }, sub) : sub), control));
  return foldCard('phone', { icon: 'smartphone', title: 'On this phone' }, [
    h('ul', { class: 'list' },
      blocked,
      relaxed()
        ? row('Day notification', 'Dailies left, the day change, your bars: the lines you choose.', notif)
        : row('Verdict notification', '“Next task: crit or not” and the lines you choose.', notif),
      h('li', null, ripple(h('button', { class: 'li li-btn', type: 'button', 'data-k': 'notif-lines', on: { click: () => openNotificationScreen(() => nativeStatus) } },
        h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'What the notification shows'),
          h('span', { class: 'li-sub' }, linesSummary())),
        icon('chevron_right')))),
      row('Read when Habitica closes', usageSub, usageBtn),
      row('Refresh every 15 minutes', 'For the notification, widget and tile, while the app is closed.', refresh),
      navRow('Keep running on this phone', 'If the notification or reminders stop by themselves, the phone is putting the app to sleep.', keepRunning, 'keep-running'),
      st ? row('Stable wallpaper', st.stableWallpaper ? 'Your open playground is on your home screen.' : 'Your open playground on your home screen, in the light of the hour.',
      button(st.stableWallpaper ? 'Change' : 'Set', () => {
        void openStableWallpaper().then(ok => { if (!ok) snackbar('This phone can’t show live wallpapers.'); });
      }, { k: 'native-wallpaper', disabled: !can })) : null,
      st && native.canOpenStableDream() ? row('Stable screen saver', st.stableDream ? 'Your open playground and a clock show while the phone charges.' : 'Your open playground and a clock while the phone charges.',
      button(st.stableDream ? 'Change' : 'Choose', () => {
        void openStableDream().then(ok => { if (!ok) snackbar('This phone has no screen saver settings.'); });
      }, { k: 'native-dream', disabled: !can })) : null,
    ),
    relaxed()
      ? (store.settings.nightPaused ? h('div', { class: 'card-body muted', 'data-k': 'night-paused' }, 'Night gear is paused while Relaxed mode is on. It comes back, with your times, when you switch to Full.') : null)
      : nightGear(st, can),
    h('div', { class: 'card-body muted' }, can
      ? ['Widgets: from your home screen. Tile: from the Quick Settings editor. ', hint('Widgets, tile, wallpaper and screen saver', [
        `The widgets and the “Crit verdict” tile show the last read${relaxed() ? ' (in Relaxed mode, your notification’s first lines)' : ''}; a tap on the tile reads once.`,
        'They only read your numbers: anything that spends or scores still needs a tap in the app.',
        'The Stable wallpaper moves only while you can see it, and stands still with Android’s animations off or Battery Saver on.',
        'The screen saver is chosen in Android’s Settings → Display → Screen saver. It runs only while the phone charges and ends when the charger comes out.'], 'widgets')]
      : 'These need “Remember on this device” (the token is kept in Android’s Keystore). Log out and log in again with it ticked to use them.'),
  ]);
}

/** "Crit verdict, Day change countdown and 4 more · most urgent first" */
function linesSummary (): string {
  const n = store.settings.notification;
  const on = n.lines.filter(([, v]) => v).map(([id]) => LINE_INFO[id].name);
  const names = on.length === 0 ? 'Nothing but the last read' : on.length <= 2 ? on.join(' and ') : `${on.slice(0, 2).join(', ')} and ${on.length - 2} more`;
  return `${names} · ${n.order === 'auto' ? 'most urgent first' : 'your order'}`;
}

const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const minutes = (v: string): number | undefined => { const m = /^(\d{1,2}):(\d{2})/.exec(v); return m ? Number(m[1]) * 60 + Number(m[2]) : undefined; };

/**
 * Night gear (Vlad's pick 4): at a set hour the phone puts on the best INT or CON gear by itself, and puts the
 * old gear back at a second hour once the new day has started. Equips only; nothing is scored or spent.
 */
function nightGear (st: NativeStatus | undefined, can: boolean): HTMLElement {
  const n = st?.night;
  if (!st || !n) return h('div', { hidden: true });
  const set = (patch: Partial<NightGear>) => {
    const next: NightGear = { on: n.on, mode: n.mode, swapAt: n.swapAt, backOn: n.backOn, backAt: n.backAt, ...patch };
    Object.assign(n, next);
    store.emit();
    void native.setNightGear(next);
  };
  const time = (k: string, value: number, onSet: (m: number) => void, disabled: boolean) => h('input', {
    type: 'time', class: 'time', value: hhmm(value), disabled, 'data-k': k, 'aria-label': 'Time',
    on: { change: (e: Event) => { const m = minutes((e.currentTarget as HTMLInputElement).value); if (m !== undefined) onSet(m); } },
  });
  const off = !can || !n.on;
  const last = n.last ? `${n.last} (${fmt.date(n.lastAt, { weekday: 'short' })} ${fmt.time(n.lastAt)})` : '';
  return h('div', { class: 'card-body night-gear', 'data-k': 'night-gear' },
    h('label', { class: 'li switch-row' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Night gear'),
        h('span', { class: 'li-sub' }, 'Your best gear for the day change, put on at a set time.')),
      h('input', { type: 'checkbox', role: 'switch', class: 'switch', disabled: !can, checked: n.on, 'data-k': 'night-on',
        on: { change: (e: Event) => set({ on: (e.currentTarget as HTMLInputElement).checked }) } })),
    select<NightGear['mode']>('night-mode', 'Night gear', n.mode, [
      ['auto', 'Automatic: CON if Dailies are still open, else INT'], ['int', 'Most INT: more mana at your day change'], ['con', 'Most CON: less damage from missed Dailies'],
    ], v => set({ mode: (v || 'auto') as NightGear['mode'] })),
    h('div', { class: 'time-row' }, h('span', null, 'Put it on at'), time('night-at', n.swapAt, m => set({ swapAt: m }), off)),
    h('label', { class: 'li switch-row' },
      h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, 'Put my gear back'),
        h('span', { class: 'li-sub' }, 'At this time, or once your new day has started if that’s later.')),
      h('input', { type: 'checkbox', role: 'switch', class: 'switch', disabled: off, checked: n.backOn, 'data-k': 'night-back',
        on: { change: (e: Event) => set({ backOn: (e.currentTarget as HTMLInputElement).checked }) } })),
    h('div', { class: 'time-row' }, h('span', null, 'Put it back at'), time('night-back-at', n.backAt, m => set({ backAt: m }), off || !n.backOn)),
    h('p', { class: 'muted' }, 'Only gear you own. Open the app once after changing gear. ', hint('Night gear', [
      'Your day changes when you next open Habitica, with the gear you wear then. Night gear puts on your best INT or CON gear before that, and can put back what you wore once the new day has started; never before, since that would undo the point.',
      'It works from the app’s last read, so open the app once after changing gear. If your gear isn’t what the app last saw at that time, or you change it before it goes back, it is left alone.',
      'Android may run it up to a few minutes late; a night it would run more than 2 hours late (phone off) is skipped. Every request is 30 s apart.'], 'night')),
    last ? h('p', { class: 'small', 'data-k': 'night-last' }, `Last: ${last}`) : null,
  );
}
