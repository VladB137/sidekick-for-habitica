// @ts-check
/*
 * PostCSS plugin (vite.config.ts): spacing for flex layouts on WebViews without flex `gap` (before Chrome 84; Android 9 can have 66).
 * For every flex rule with a gap it adds the same spacing as margins, scoped to `html.no-flex-gap`, which src/app/polyfills.ts sets
 * only where a measured flex gap comes out as nothing. A current WebView never matches these rules.
 *   row       → every child but the last gets margin-right (column gap)
 *   column    → every child but the last gets margin-bottom (row gap)
 * On the side before the next child, so a positioned first child (a colour bar) doesn't push the next one, and a child's own
 * margin-left (auto, to push it to the end) stays. A child's own margin on that side is replaced: src/styles/old-webview.css corrects the few that matter.
 *   wrap      → as row; the row gap between wrapped lines is left out, since margins for it would change the container's
 *               own height when nothing wraps (lines wrap only when the screen is squeezed)
 * Text sitting directly in a flex container next to elements is wrapped in <x-t> by src/app/ui/dom.ts on those WebViews,
 * so it counts as a child here.
 */

/** `a b` → [row, column]; `a` → [a, a] */
function gaps (decls) {
  let row = null, col = null;
  for (const d of decls) {
    if (d.prop === 'gap') { const [a, b] = d.value.trim().split(/\s+/); row = a; col = b ?? a; }
    if (d.prop === 'row-gap') row = d.value.trim();
    if (d.prop === 'column-gap') col = d.value.trim();
  }
  return { row, col };
}

const isZero = v => v == null || /^0(px|em|rem)?$/.test(v) || v === 'normal';

export default function flexGapFallback () {
  return {
    postcssPlugin: 'flex-gap-fallback',
    Once (root, { Rule }) {
      // what each selector is, across the top-level rules (a later `.li { flex-wrap: wrap }` makes .li a wrapping row)
      const layout = new Map();
      const note = (sel, prop, value) => { const l = layout.get(sel) ?? {}; l[prop] = value; layout.set(sel, l); };
      root.each(node => {
        if (node.type !== 'rule') return;
        node.each(d => {
          if (d.type !== 'decl') return;
          for (const sel of node.selectors) {
            if (d.prop === 'display') note(sel, 'display', d.value);
            if (d.prop === 'flex-direction') note(sel, 'dir', d.value);
            if (d.prop === 'flex-wrap') note(sel, 'wrap', d.value);
            if (d.prop === 'flex-flow') { for (const v of d.value.split(/\s+/)) note(sel, /wrap/.test(v) ? 'wrap' : 'dir', v); }
          }
        });
      });
      const added = [];
      root.walkRules(rule => {
        if (rule.selector.includes('no-flex-gap')) return;
        const decls = rule.nodes.filter(n => n.type === 'decl');
        const { row, col } = gaps(decls);
        if (isZero(row) && isZero(col)) return;
        for (const sel of rule.selectors) {
          const l = layout.get(sel) ?? {};
          const own = (prop, fallback) => decls.filter(d => d.prop === prop).pop()?.value ?? fallback;
          const display = own('display', l.display);
          if (display !== 'flex' && display !== 'inline-flex') continue;
          const dir = own('flex-direction', l.dir) ?? 'row';
          const scope = `html.no-flex-gap ${sel}`;
          const before = `${scope} > :not(:last-child):not(.ripple-box)`;
          const out = [];
          if (dir.startsWith('column')) {
            if (!isZero(row)) out.push([before, { [dir === 'column' ? 'margin-bottom' : 'margin-top']: row }]);
          } else {
            if (!isZero(col)) out.push([before, { [dir === 'row' ? 'margin-right' : 'margin-left']: col }]);
          }
          for (const [selector, props] of out) {
            const r = new Rule({ selector });
            for (const [prop, value] of Object.entries(props)) r.append({ prop, value });
            added.push([rule, r]);
          }
        }
      });
      // right after the rule they stand in for, inside the same @media, so later rules still win as before
      for (const [rule, r] of added.reverse()) rule.after(r);
    },
  };
}
flexGapFallback.postcss = true;
