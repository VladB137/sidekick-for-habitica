/* The stage: puts a World on a canvas in the page. One canvas, no game library. It owns the pixel fit, the
 * frame loop, touch and the battery rules: at most 30 frames a second, nothing at all while the screen is
 * hidden, the app is in the background or the canvas is scrolled away, and a still picture (redrawn only
 * when something changes) when the phone asks for reduced motion. */
import { fitBacking, type Fit, type FitOptions } from './grid';
import { FrameGate } from './frame';
import { Gestures } from './gestures';
import type { World, Entity } from './world';

/** A point in the world: world pixels (may lie outside the visible world while dragging) and what is there. */
export interface WorldPoint { x: number, y: number, hit: Entity | null }

export interface Interaction {
  tap? (p: WorldPoint, stage: Stage): void;
  longPress? (p: WorldPoint, stage: Stage): void;
  longPressEnd? (p: WorldPoint, cancelled: boolean, stage: Stage): void;
  dragStart? (p: WorldPoint, long: boolean, stage: Stage): void;
  drag? (p: WorldPoint, stage: Stage): void;
  dragEnd? (p: WorldPoint, cancelled: boolean, stage: Stage): void;
}

export interface StageOptions extends FitOptions {
  world: World;
  interaction?: Interaction;
  /** force the still picture on or off (or ask each time); by default it follows the phone's reduced-motion setting */
  still?: boolean | (() => boolean);
  /** the canvas's accessible name */
  label?: string;
}

export interface Stage {
  readonly world: World;
  readonly canvas: HTMLCanvasElement;
  readonly fit: Fit;
  /** the loop is running now */
  readonly running: boolean;
  /** showing a still picture (reduced motion) */
  readonly still: boolean;
  /** frames drawn and ticks stepped so far (for tests and a debug overlay) */
  readonly stats: { frames: number, ticks: number };
  /** something changed outside the loop (a tap in the still picture, new sprites): draw again */
  invalidate (): void;
  /** the screen around it is showing (true) or not (another screen, phone locked): the loop runs only while
   * shown, on top of its own checks (page hidden, scrolled away). Shown from the start. */
  setShown (shown: boolean): void;
  /** CSS pixels of the top and bottom that the app's bars cover; becomes world.insets */
  setInsets (i: { top: number, bottom: number }): void;
  destroy (): void;
}

export function mountStage (container: HTMLElement, o: StageOptions): Stage {
  const { world } = o;
  const canvas = document.createElement('canvas');
  canvas.className = 'pg-canvas';
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', o.label ?? 'Playground');
  // the canvas takes every touch (petting and dragging); the page around it scrolls as usual
  canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;image-rendering:pixelated';
  container.appendChild(canvas);
  const g = canvas.getContext('2d', { alpha: false })!;
  const view = document.createElement('canvas');
  const vg = view.getContext('2d')!;

  const gate = new FrameGate();
  const stats = { frames: 0, ticks: 0 };
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let fit: Fit = fitBacking(1, 1, o);
  let frame = 0;
  let onScreen = true;
  let destroyed = false;
  let pending = false;
  let shown = true;
  let cssInsets = { top: 0, bottom: 0 };

  const still = () => typeof o.still === 'function' ? o.still() : o.still ?? !!reduce?.matches;
  const shouldRun = () => !destroyed && shown && !still() && document.visibilityState === 'visible' && onScreen && canvas.isConnected && fit.viewW > 1;
  /** bars' cover in world pixels, rounded out so nothing tappable hides under a bar's last pixel */
  const applyInsets = () => {
    const r = fit.backH / (canvas.getBoundingClientRect().height || fit.backH / devicePixelRatio);
    world.insets = { top: Math.ceil(cssInsets.top * r / fit.scale), bottom: Math.ceil(cssInsets.bottom * r / fit.scale) };
  };

  function draw () {
    world.draw(vg);
    g.imageSmoothingEnabled = false;
    if (fit.offX || fit.offY) { g.fillStyle = world.background; g.fillRect(0, 0, fit.backW, fit.backH); }
    g.drawImage(view, 0, 0, fit.viewW, fit.viewH, fit.offX, fit.offY, fit.viewW * fit.scale, fit.viewH * fit.scale);
    stats.frames++;
  }

  function loop (t: number) {
    frame = 0;
    if (!shouldRun()) return;
    const n = gate.frame(t);
    for (let i = 0; i < n; i++) { world.step(); stats.ticks++; }
    if (n) draw();
    frame = requestAnimationFrame(loop);
  }

  /** start or stop the loop to match the conditions; in the still picture, draw once */
  function update () {
    if (shouldRun()) { if (!frame) { gate.reset(); frame = requestAnimationFrame(loop); } return; }
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    if (!destroyed && shown && still() && canvas.isConnected) invalidate();
  }

  function invalidate () {
    if (frame || pending || destroyed) return; // the running loop draws anyway
    pending = true;
    requestAnimationFrame(() => { pending = false; if (!destroyed && fit.viewW > 1) draw(); });
  }

  function refit (backW: number, backH: number) {
    const f = fitBacking(backW, backH, o);
    if (f.backW === fit.backW && f.backH === fit.backH && f.scale === fit.scale) return;
    fit = f;
    canvas.width = f.backW; canvas.height = f.backH;
    view.width = f.viewW; view.height = f.viewH;
    applyInsets();
    world.resize(f.viewW, f.viewH);
    // now, not on the next frame: resizing clears the canvas to black (it has no alpha), and the browser paints before then
    if (!destroyed && f.viewW > 1) draw();
    update();
  }

  const ro = new ResizeObserver(([e]) => {
    const w = Math.round(e.contentRect.width * devicePixelRatio), h = Math.round(e.contentRect.height * devicePixelRatio);
    const dp = (e as ResizeObserverEntry & { devicePixelContentBoxSize?: ReadonlyArray<ResizeObserverSize> }).devicePixelContentBoxSize?.[0];
    // the exact device-pixel box where the browser reports one; emulated screens (DevTools, test browsers)
    // report CSS pixels there, so it is trusted only when it agrees with the estimate
    if (dp && Math.abs(dp.inlineSize - w) <= 1 && Math.abs(dp.blockSize - h) <= 1) refit(dp.inlineSize, dp.blockSize);
    else refit(w, h);
  });
  try { ro.observe(canvas, { box: 'device-pixel-content-box' }); } catch { ro.observe(canvas); }
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; update(); }) : null;
  io?.observe(canvas);
  const onVis = () => update();
  document.addEventListener('visibilitychange', onVis);
  reduce?.addEventListener?.('change', onVis);

  /* ---- touch */
  const point = (e: PointerEvent): WorldPoint => {
    const r = canvas.getBoundingClientRect();
    const dx = (e.clientX - r.left) * (fit.backW / (r.width || 1)) - fit.offX;
    const dy = (e.clientY - r.top) * (fit.backH / (r.height || 1)) - fit.offY;
    const x = Math.floor(dx / fit.scale), y = Math.floor(dy / fit.scale);
    const inside = x >= 0 && y >= 0 && x < fit.viewW && y < fit.viewH;
    return { x, y, hit: inside ? world.hitTest(x, y) : null };
  };
  const css = (e: PointerEvent) => ({ x: e.clientX, y: e.clientY });
  const it = o.interaction ?? {};
  const gestures = new Gestures<WorldPoint>({
    tap: p => it.tap?.(p, stage),
    longPress: p => it.longPress?.(p, stage),
    longPressEnd: (p, c) => it.longPressEnd?.(p, c, stage),
    dragStart: (p, long) => it.dragStart?.(p, long, stage),
    drag: p => it.drag?.(p, stage),
    dragEnd: (p, c) => it.dragEnd?.(p, c, stage),
  });
  const pdown = (e: PointerEvent) => {
    if (e.button > 0) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
    gestures.down(e.pointerId, css(e), point(e));
  };
  const pmove = (e: PointerEvent) => { if (gestures.active) gestures.move(e.pointerId, css(e), point(e)); };
  const pup = (e: PointerEvent) => gestures.up(e.pointerId, point(e));
  const pcancel = (e: PointerEvent) => gestures.cancel(e.pointerId);
  canvas.addEventListener('pointerdown', pdown);
  canvas.addEventListener('pointermove', pmove);
  canvas.addEventListener('pointerup', pup);
  canvas.addEventListener('pointercancel', pcancel);
  // a long press must not open the system's image menu
  canvas.addEventListener('contextmenu', e => e.preventDefault());

  const stage: Stage = {
    world, canvas, stats,
    get fit () { return fit; },
    get running () { return frame !== 0; },
    get still () { return still(); },
    invalidate,
    setShown (v) { if (v === shown) return; shown = v; update(); },
    setInsets (i) { cssInsets = { top: i.top, bottom: i.bottom }; applyInsets(); if (!frame) invalidate(); },
    destroy () {
      if (destroyed) return;
      destroyed = true;
      gestures.abort();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      ro.disconnect(); io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      reduce?.removeEventListener?.('change', onVis);
      canvas.remove();
    },
  };
  return stage;
}
