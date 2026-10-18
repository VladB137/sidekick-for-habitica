/*
 * Report a problem (Settings → About): what the app can say about itself for a bug report, and the GitHub issue
 * it opens in the browser with those lines filled in. Nothing from the account goes in: no token, User ID, name,
 * task text or numbers. A prediction that missed says what it was (a score, a cast) and which values differed,
 * never the values. The app sends nothing itself; the player reads it before anything leaves the phone.
 */
import { store } from './store';
import { native } from './native';
import { RULES } from '../engine';
import { ITEMS } from './model';

// the public repo (the private one it grew in stays private)
export const REPO = 'https://github.com/VladB137/sidekick-for-habitica';

/** "Score a task: hp, exp" from the last missed prediction, with the task's words and every number left out. */
export function mismatchSummary (log: ReadonlyArray<{ action: string, ok: boolean, detail?: string }>): string | undefined {
  const miss = [...log].reverse().find(e => !e.ok);
  if (!miss) return undefined;
  const action = miss.action.replace(/“[^”]*”/g, 'a task').replace(/\s+\d+\s+/g, ' ');
  const fields = (miss.detail || '').split(', ').map(p => (/^crit predicted/.test(p) ? 'crit' : p.split(' ')[0])).filter(f => /^[a-zA-Z]+$/.test(f));
  return fields.length ? `${action}: ${fields.join(', ')}` : action;
}

/** Android and WebView versions and the phone's model, from the WebView's user agent (the browser's on the web). */
export function deviceOf (ua: string): { android?: string, model?: string, browser?: string } {
  const android = /Android ([\d.]+)/.exec(ua)?.[1];
  const model = /Android [\d.]+; ([^;)]+?)(?: Build\/[^;)]*)?[;)]/.exec(ua)?.[1]?.trim();
  const chrome = /Chrome\/([\d.]+)/.exec(ua)?.[1];
  const firefox = /Firefox\/([\d.]+)/.exec(ua)?.[1];
  const browser = chrome ? `${/; wv\)/.test(ua) ? 'WebView' : 'Chrome'} ${chrome}` : firefox ? `Firefox ${firefox}` : undefined;
  return { android, model: model && model !== 'K' ? model : undefined, browser };
}

/** The lines a bug report starts with: about the app and the phone only. */
export function reportDetails (): string {
  const d = deviceOf(navigator.userAgent);
  const rec = store.record;
  const miss = mismatchSummary(rec.log);
  const lines: Array<[string, string | undefined]> = [
    ['App', `Sidekick for Habitica ${__APP_VERSION__} (${__BUILD_DATE__}), ${native.available ? 'Android app' : 'website'}`],
    ['Rules', `Habitica ${RULES.checkedAgainst}; items from ${ITEMS.habitica}`],
    ['Habitica now', store.api?.appVersion],
    ['Android', d.android ? `${d.android}${d.model ? ` (${d.model})` : ''}` : undefined],
    ['Browser', d.browser],
    ['Screen', `${window.innerWidth}×${window.innerHeight} at ${window.devicePixelRatio || 1}x`],
    ['Mode', `${store.settings.mode === 'relaxed' ? 'Relaxed' : 'Full'}, theme ${store.settings.theme}`],
    ['Connection', store.loggedIn ? store.connection : 'logged out'],
    ['Predictions', rec.predicted ? `${rec.matched} of ${rec.predicted} matched` : 'none checked yet'],
    ['Last miss', miss],
  ];
  return lines.filter((l): l is [string, string] => !!l[1]).map(([k, v]) => `${k}: ${v}`).join('\n');
}

/** A new issue on the bug form (.github/ISSUE_TEMPLATE/bug_report.yml), its details field filled in. */
export const issueUrl = (details: string): string => `${REPO}/issues/new?template=bug_report.yml&details=${encodeURIComponent(details)}`;

/** Put text on the clipboard; false when the phone refused. */
export async function copyText (text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall back below */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { ok = false; }
  ta.remove();
  return ok;
}

/** Open a page in the browser, as the app's other outside links do (on the phone, Android opens it). */
export function openOutside (url: string) {
  const a = document.createElement('a');
  a.href = url; a.target = '_blank'; a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
