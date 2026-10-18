/**
 * Small motion that explains (brainstorm B3, B6), all off under reduced motion:
 * - a tapped checkbox draws its tick once Habitica has taken the score;
 * - a landed crit bursts amber sparks from what was tapped and counts its XP and Gold up in the snackbar.
 * The morph renderer keeps elements alive, so CSS transitions (bars gliding to a new length) need nothing here.
 */
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** the last tap: the nearest data-k (the morph renderer keeps it stable across redraws) and where the finger was */
let tap: { k?: string, x: number, y: number, at: number } | undefined;
const FRESH_MS = 15_000;

document.addEventListener('pointerdown', e => {
  const el = (e.target as Element | null)?.closest?.('[data-k]') as HTMLElement | null;
  tap = { k: el?.dataset.k, x: e.clientX, y: e.clientY, at: Date.now() };
}, { capture: true, passive: true });

const fresh = () => (tap && Date.now() - tap.at < FRESH_MS ? tap : undefined);
const byKey = (k: string) => document.querySelector<HTMLElement>(`[data-k="${CSS.escape(k)}"]`);

/** After each redraw: a checkbox tapped a moment ago that is now ticked draws its tick, once. */
export function afterRender () {
  const t = fresh();
  if (!t?.k || !t.k.startsWith('chk-') || reduced()) return;
  const box = byKey(t.k);
  if (!box?.classList.contains('on')) return;
  box.querySelector('svg')?.classList.add('tick-in');
  t.k = undefined;
}

/** A crit Habitica confirmed: sparks from the tapped control (or the finger), and the snackbar's numbers count up. */
export function critLanded () {
  if (reduced()) return;
  const t = fresh();
  const r = t?.k ? byKey(t.k)?.getBoundingClientRect() : undefined;
  const x = r ? r.left + r.width / 2 : t?.x ?? innerWidth / 2;
  const y = r ? r.top + r.height / 2 : t?.y ?? innerHeight / 2;
  burst(x, y);
  const text = document.querySelector<HTMLElement>('#snackbar .snack-text');
  if (text) countUp(text, 600);
}

function burst (x: number, y: number) {
  const n = 10;
  const box = document.createElement('div');
  box.className = 'sparks';
  box.setAttribute('aria-hidden', 'true');
  box.style.left = `${x}px`; box.style.top = `${y}px`;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.3;
    const d = 28 + (i % 3) * 10;
    const s = document.createElement('span');
    s.style.setProperty('--dx', `${Math.cos(a) * d}px`);
    s.style.setProperty('--dy', `${Math.sin(a) * d}px`);
    box.appendChild(s);
  }
  document.body.appendChild(box);
  window.setTimeout(() => box.remove(), 700);
}

/** "+12 XP · +3 Gold": each signed whole number climbs from 0 to its value; the final text is exactly the original. */
function countUp (el: HTMLElement, ms: number) {
  const final = el.textContent || '';
  const parts = final.split(/([+−]\d+)/);
  if (parts.length < 2) return;
  const start = performance.now();
  const step = (now: number) => {
    if (!el.isConnected || el.textContent === null) return;
    const p = Math.min(1, (now - start) / ms);
    const e = 1 - (1 - p) ** 3;
    el.textContent = parts.map(s => (/^[+−]\d+$/.test(s) ? s[0] + Math.round(Number(s.slice(1)) * e) : s)).join('');
    if (p < 1) requestAnimationFrame(step);
    else el.textContent = final;
  };
  requestAnimationFrame(step);
}
