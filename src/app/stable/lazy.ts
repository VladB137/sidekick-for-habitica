/*
 * The playground (engine, scenes, sprite catalogue) is a separate script, fetched the first time the Stable
 * opens, so the crit screens start no slower for it. Until it arrives the scene below just remembers what
 * the host said; then it mounts and catches up.
 */
import type { StableMount, StableScene } from './host';

export const lazyPlayground: StableMount = (el, ctx) => {
  let scene: StableScene | undefined;
  let shown = false, gone = false, insets = ctx.insets;
  import('./playground').then(m => {
    if (gone) return;
    scene = m.mountPlayground(el, { ...ctx, insets });
    if (shown) scene.show();
  }).catch(() => undefined); // a failed load leaves the stage empty; the next visit tries again
  return {
    show: () => { shown = true; scene?.show(); },
    hide: () => { shown = false; scene?.hide(); },
    insets: i => { insets = i; scene?.insets?.(i); },
    toys: () => scene?.toys?.(),
    destroy: () => { gone = true; scene?.destroy(); },
  };
};
