/*
 * What Android 9's oldest WebView (Chrome 66, before Google Play updates it) lacks of what the app calls. The build lowers the syntax
 * (vite.config.ts `target`); these fill in the library calls. Each one only where it's missing, so an up-to-date WebView runs its own.
 * public/webview-check.js shows a plain "update Android System WebView" page if the app still can't start.
 */
/* eslint-disable no-extend-native */

// tells public/webview-check.js the app's code parsed and started
(window as any).__oracleRan = true;

const define = (target: object, name: string, value: unknown) => {
  if (!(name in target)) Object.defineProperty(target, name, { value, writable: true, configurable: true });
};

if (typeof globalThis === 'undefined') (window as any).globalThis = window;

define(Object, 'fromEntries', (entries: Iterable<[PropertyKey, unknown]>) => {
  const o: Record<PropertyKey, unknown> = {};
  for (const [k, v] of entries) o[k] = v;
  return o;
});

define(Array.prototype, 'flat', function flat (this: unknown[], depth = 1): unknown[] {
  return depth < 1 ? this.slice() : this.reduce<unknown[]>((acc, v) => acc.concat(Array.isArray(v) ? (v as any).flat(depth - 1) : [v]), []);
});
define(Array.prototype, 'flatMap', function flatMap (this: unknown[], f: (v: unknown, i: number, a: unknown[]) => unknown, self?: unknown) {
  return (this.map(f, self) as any).flat(1);
});
define(Array.prototype, 'at', function at (this: unknown[], i: number) {
  const n = Math.trunc(i) || 0;
  return this[n < 0 ? this.length + n : n];
});

define(Promise, 'allSettled', (ps: Iterable<unknown>) => Promise.all([...ps].map(p => Promise.resolve(p).then(
  value => ({ status: 'fulfilled', value }),
  reason => ({ status: 'rejected', reason }),
))));

for (const proto of [Element.prototype, Document.prototype, DocumentFragment.prototype]) {
  define(proto, 'replaceChildren', function replaceChildren (this: ParentNode, ...nodes: Array<Node | string>) {
    while (this.lastChild) this.removeChild(this.lastChild);
    this.append(...nodes);
  });
}
define(Element.prototype, 'toggleAttribute', function toggleAttribute (this: Element, name: string, force?: boolean) {
  const on = force === undefined ? !this.hasAttribute(name) : force;
  if (on) this.setAttribute(name, ''); else this.removeAttribute(name);
  return on;
});

// Array.prototype.sort is stable from Chrome 70; before that, equal items in arrays over 10 long came out in any order, so two
// WebViews listed the same ties differently. Where it isn't stable, the same sort with the original order as the tiebreak.
{
  const probe = Array.from({ length: 24 }, (_, i) => ({ k: i % 3, i }));
  probe.sort((a, b) => a.k - b.k);
  if (probe.some((v, j) => j > 0 && v.k === probe[j - 1].k && v.i < probe[j - 1].i)) {
    const native = Array.prototype.sort;
    const byString = (a: unknown, b: unknown) => { const x = String(a), y = String(b); return x < y ? -1 : x > y ? 1 : 0; };
    Object.defineProperty(Array.prototype, 'sort', {
      value: function sort (this: unknown[], compare?: (a: any, b: any) => number) {
        const cmp = compare ?? byString;
        // as the native sort: undefined last, never handed to the comparator
        const items: Array<[unknown, number]> = [];
        let undef = 0;
        for (let i = 0; i < this.length; i++) { if (this[i] === undefined) undef++; else items.push([this[i], i]); }
        native.call(items, (a: [unknown, number], b: [unknown, number]) => cmp(a[0], b[0]) || a[1] - b[1]);
        for (let i = 0; i < items.length; i++) this[i] = items[i][0];
        for (let i = items.length; i < items.length + undef; i++) this[i] = undefined;
        return this;
      },
      writable: true, configurable: true,
    });
  }
}

// flex `gap` came in Chrome 84, and CSS.supports can't tell (grid's gap answers for it): measure it once. Without it the flex rules'
// margin stand-ins (tools/flex-gap-fallback.mjs) apply, and src/app/ui/dom.ts wraps loose text so it gets them too.
{
  const probe = document.createElement('div');
  probe.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
  probe.appendChild(document.createElement('div'));
  probe.appendChild(document.createElement('div'));
  document.documentElement.appendChild(probe);
  if (probe.scrollHeight !== 1) document.documentElement.classList.add('no-flex-gap');
  probe.remove();
}

// :focus-visible came in Chrome 86. Without it a tap that moves focus (a menu opening, a sheet) would draw the WebView's own focus
// ring: src/styles/old-webview.css hides rings under html.no-focus-visible until a key is pressed.
try { document.querySelector(':focus-visible'); } catch {
  const root = document.documentElement;
  root.classList.add('no-focus-visible');
  window.addEventListener('keydown', e => { if (!e.ctrlKey && !e.metaKey && !e.altKey) root.classList.add('kbd'); }, true);
  for (const ev of ['mousedown', 'touchstart', 'pointerdown']) window.addEventListener(ev, () => root.classList.remove('kbd'), true);
}

export {};
