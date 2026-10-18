/*
 * The Stable screen's mount point. main.ts owns the screen (route, app bar, nav, full screen, Back);
 * whatever draws the playground plugs in here with registerStable() and owns everything inside the stage.
 *
 * The stage (#stable-stage) always covers the whole viewport, under the app bar and the bottom navigation,
 * so going full screen only slides the chrome away (transform, no relayout) and never resizes the canvas.
 * `insets` says how much of the stage the chrome covers right now; draw the ground inside it.
 *
 * Lifecycle, all called by main.ts after each render:
 *   mount   once per stage element, when the Stable screen appears (the stage is morph-proof: the app's
 *           re-renders never touch its children). Return a scene.
 *   show    the stage is on screen and the app is in the foreground: start the frame loop.
 *   hide    another screen, the app in the background or the phone locked: stop every timer and frame.
 *   insets  the chrome moved (full screen on or off, safe areas changed). Also passed to mount.
 *   destroy the Stable screen is gone (the stage element is detached); release everything.
 *   toys    the toy box button beside the full-screen one was tapped.
 * show/hide are only called on a change, and hide always comes before destroy.
 */

export interface StableInsets {
  /** px of the stage the app bar covers; in full screen only the status bar's safe area */
  top: number
  /** px of the stage the bottom navigation covers; in full screen only the gesture bar's safe area */
  bottom: number
  full: boolean
}
export interface StableContext {
  insets: StableInsets
  /** the system's reduced-motion setting, read live (draw a still scene while it is on) */
  reducedMotion (): boolean
}
export interface StableScene {
  show (): void
  hide (): void
  insets? (i: StableInsets): void
  toys? (): void
  destroy (): void
}
export type StableMount = (stage: HTMLElement, ctx: StableContext) => StableScene;

let mountFn: StableMount | undefined;
let stage: HTMLElement | undefined;
let scene: StableScene | undefined;
let shown = false;
/** the stage on screen before any playground registered, and whether it could be seen */
let waiting: { el: HTMLElement, visible: boolean } | undefined;
let last: StableInsets = { top: 0, bottom: 0, full: false };
const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** The playground calls this once at start-up. */
export function registerStable (fn: StableMount) {
  mountFn = fn;
  if (waiting) { const w = waiting; waiting = undefined; syncStable(w.el, w.visible, last); }
}

/** Whether a playground has registered (the Stable screen shows its own empty state until one has). */
export const stableReady = () => !!mountFn;

/** The view's toy box button: the playground opens its toy box. */
export function openToyBox () { scene?.toys?.(); }

/** main.ts: the stage now on screen (or null), whether it can be seen, and the chrome's insets. */
export function syncStable (el: HTMLElement | null, visible: boolean, insets: StableInsets) {
  if (stage && stage !== el) {
    if (shown) scene?.hide();
    scene?.destroy();
    scene = undefined; stage = undefined; shown = false;
    document.getElementById('app')?.classList.remove('stage-mounted');
  }
  const moved = insets.top !== last.top || insets.bottom !== last.bottom || insets.full !== last.full;
  last = insets;
  waiting = el && !mountFn ? { el, visible } : undefined;
  if (!el || !mountFn) return;
  if (!stage) {
    stage = el;
    // the empty state was the view's; from here on the stage belongs to the playground
    el.replaceChildren();
    el.classList.add('mounted');
    // for src/styles/stable.css: the snackbar and the full-screen button make room for the residents row (no :has() before Chrome 105)
    document.getElementById('app')?.classList.add('stage-mounted');
    scene = mountFn(el, { insets, reducedMotion });
  } else if (moved) scene?.insets?.(insets);
  const vis = visible && !!el.isConnected;
  if (vis !== shown) { shown = vis; if (vis) scene?.show(); else scene?.hide(); }
}
