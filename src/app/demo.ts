/*
 * "Try it": the whole app on a made-up account, answered on this device by Habitica's own game code (demo-account.ts),
 * for someone who wants to see it work before handing over a password-equivalent token. The visit leaves nothing behind
 * and reaches nothing real:
 *   - the app starts over in the made-up account (a reload, so no module keeps anything from before),
 *   - this device's storage is swapped for one in memory before any module reads it, so nothing is saved,
 *   - native.ts reports no Android side (no Keystore, notification, widget, tile, wallpaper or night gear),
 *   - every request is answered in the page; nothing goes to habitica.com,
 *   - leaving starts over again, on the login screen.
 * The mark is kept in sessionStorage: a reload keeps it, closing the app forgets it.
 */
const KEY = 'oracle:demo';
/** set when leaving: the login screen comes next, not the intro */
const LEFT = 'oracle:left-demo';

const get = (k: string): string | null => { try { return sessionStorage.getItem(k); } catch { return null; } };
const set = (k: string, v: string | null): boolean => {
  try { if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); return true; } catch { return false; }
};

/** Storage that lives as long as the page. */
class MemoryStorage {
  private m = new Map<string, string>();
  get length () { return this.m.size; }
  key (i: number) { return Array.from(this.m.keys())[i] ?? null; }
  getItem (k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem (k: string, v: string) { this.m.set(String(k), String(v)); }
  removeItem (k: string) { this.m.delete(k); }
  clear () { this.m.clear(); }
}

/** This visit is the made-up account: only when the device's storage could be set aside, so nothing of it is ever saved. */
export const demo: boolean = get(KEY) === '1' && (() => {
  try {
    Object.defineProperty(window, 'localStorage', { value: new MemoryStorage(), configurable: true });
    return localStorage instanceof MemoryStorage;
  } catch {
    set(KEY, null);
    return false;
  }
})();

/** Just left the made-up account: the login screen, not the intro. Read once. */
export const leftDemo: boolean = !demo && get(LEFT) === '1' && set(LEFT, null);

/** the app again from the start, without the screen's #route */
const restart = () => { history.replaceState(null, '', location.pathname + location.search); location.reload(); };

/** This browser keeps session storage, which the made-up account needs to know it is one. */
export function canDemo (): boolean {
  if (!set('oracle:probe', '1')) return false;
  set('oracle:probe', null);
  return true;
}

/** Open the made-up account. False when this browser keeps no session storage (then it can't be offered). */
export function enterDemo (): boolean {
  if (!set(KEY, '1')) return false;
  restart();
  return true;
}

/** Back to the login screen, the made-up account forgotten. */
export function leaveDemo () {
  set(KEY, null);
  set(LEFT, '1');
  restart();
}
