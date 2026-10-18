// The stylesheet the app ships (after the build lowered what it could), checked against the oldest Android 9 WebView, Chrome 66:
// every CSS feature newer than that must either have a fallback the check can see, or be listed below with why it's fine.
//   npm run build && node tools/check-css.mjs [built.css ...]      (npm run lint runs it after eslint)
import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import DoIUse from 'doiuse/lib/DoIUse.js';

const BROWSERS = ['chrome >= 66'];

/** features that are fine as they are, and why (caniuse names) */
const FINE = {
  'css-focus-visible': 'src/app/polyfills.ts marks keyboard use (html.no-focus-visible), so a tap draws no ring; the focus styles are extras',
  'prefers-color-scheme': "an old WebView stays light; the app's own theme setting still works",
  'prefers-reduced-motion': 'an old WebView animates as before',
  'css-not-sel-list': 'only one selector inside each :not(), which Chrome 66 reads',
  'css-overflow': 'one-value overflow only (the partial support is the two-value form)',
  'css-sticky': 'sticky on ordinary boxes (the partial support is table parts)',
  'css-appearance': 'the -webkit- form sits beside it',
  'css-snappoints': 'scroll-snap-type and -align work from Chrome 69; scroll-snap-stop is a nicety before 75',
  'css-scrollbar': '::-webkit-scrollbar hides the bar on Chromium; scrollbar-width is for others',
  'text-decoration': 'the dotted underline works; its thickness is a nicety',
  'css-masks': 'clip-path: inset() works from Chrome 55 (the partial support is other shapes)',
  'css-clip-path': 'clip-path: inset() works from Chrome 55 (the partial support is other shapes)',
  'extended-system-fonts': 'the next font in the list takes over',
};

/* what caniuse (doiuse) doesn't know yet: the Chrome version each arrived in */
const NEWER = {
  props: { 'aspect-ratio': 88, 'accent-color': 93, translate: 104, rotate: 104, scale: 104, 'backdrop-filter': 76, 'content-visibility': 85, 'container-type': 105, 'text-wrap': 114 },
  values: { 'color-mix(': 111, 'light-dark(': 123, dvh: 108, svh: 108, lvh: 108, dvw: 108, cqw: 105, cqh: 105 },
  selectors: { ':is(': 88, ':where(': 88, ':has(': 105, ':focus-visible': 86 },
  atrules: { container: 105, layer: 99, property: 85 },
};
/** single uses that are fine as they are, and why ("selector { property }") */
const FINE_USES = {
  '.stable-thumb img { aspect-ratio }': 'the picture itself is 16:9, so its height comes out the same',
};
/** at-rules that are fine as they are, and why */
const FINE_AT = {
  property: "without it the crit reveal's amber circle shows at once instead of growing",
};

const files = process.argv.slice(2).length ? process.argv.slice(2)
  : fs.readdirSync('dist/assets').filter(f => f.endsWith('.css')).map(f => path.join('dist/assets', f));
if (!files.length) { console.error('no built CSS: run npm run build first'); process.exit(1); }

let problems = 0;
for (const file of files) {
  const css = fs.readFileSync(file, 'utf8');
  const root = postcss.parse(css, { from: file });
  // every flex gap needs the margin stand-in from tools/flex-gap-fallback.mjs
  const standIns = new Set();
  root.walkRules(r => { for (const s of r.selectors) { const m = /^html\.no-flex-gap (.+?)\s*>\s*:not\(:last-child\)/.exec(s); if (m) standIns.add(m[1].trim()); } });

  // selectors a `@supports not (property…)` block gives another way (pseudo-elements count for their element)
  const otherWay = new Map();
  root.walkAtRules('supports', a => {
    const m = /^not\s*\(\s*([\w-]+)\s*:/.exec(a.params.trim());
    if (m) a.walkRules(r => { for (const sel of r.selectors) otherWay.set(`${sel.replace(/::?(before|after)$/, '').replace(/\s*>.*$/, '').trim()} ${m[1]}`, true); });
  });
  const guarded = node => {
    if (node.type === 'decl' && node.parent.selectors?.every(sel => otherWay.has(`${sel} ${node.prop}`) || FINE_USES[`${sel} { ${node.prop} }`])) return true;
    // inside @supports (feature): a WebView without it skips the block
    for (let p = node.parent; p && p.type !== 'root'; p = p.parent) if (p.type === 'atrule' && p.name === 'supports' && !/^not\b/.test(p.params.trim())) return true;
    // an earlier declaration of the same property in the rule is the fallback
    if (node.type === 'decl') { for (let s = node.prev(); s; s = s.prev()) if (s.type === 'decl' && s.prop === node.prop) return true; }
    return false;
  };

  const report = (feature, where, message) => { console.log(`${feature}: ${where}\n    ${message}`); problems++; };
  root.walk(node => {
    if (guarded(node)) return;
    if (node.type === 'decl') {
      const v = NEWER.props[node.prop];
      if (v) report(node.prop, `${node.parent.selector} { ${node.prop}: ${node.value} }`, `Chrome ${v}+`);
      for (const [f, c] of Object.entries(NEWER.values)) if (f.endsWith('(') ? node.value.includes(f) : new RegExp(`\\d${f}\\b`).test(node.value)) report(f, `${node.parent.selector} { ${node.prop}: ${node.value} }`, `Chrome ${c}+`);
    } else if (node.type === 'rule') {
      for (const [f, c] of Object.entries(NEWER.selectors)) if (node.selector.includes(f) && !(f === ':focus-visible' && FINE['css-focus-visible'])) report(f, node.selector, `Chrome ${c}+: the whole rule is dropped`);
    } else if (node.type === 'atrule' && NEWER.atrules[node.name] && !FINE_AT[node.name]) report(`@${node.name}`, `@${node.name} ${node.params}`, `Chrome ${NEWER.atrules[node.name]}+`);
  });

  await postcss([new DoIUse({
    browsers: BROWSERS,
    onFeatureUsage: ({ feature, usage: node, message }) => {
      if (FINE[feature] || guarded(node)) return;
      // minmax() in a grid track reads as min()
      if (feature === 'css-math-functions' && node.type === 'decl' && !/(^|[^x])(min|max|clamp)\(/.test(node.value.replace(/minmax\(/g, ''))) return;
      if (feature === 'flexbox-gap' && (node.type === 'rule' ? node : node.parent).selectors?.every(s => standIns.has(s))) return;
      const where = node.type === 'decl' ? `${node.parent.selector ?? `@${node.parent.name} ${node.parent.params}`} { ${node.prop}: ${node.value} }`
        : node.type === 'rule' ? node.selector : `@${node.name} ${node.params}`;
      report(feature, where, message.replace(/^.*?: /, ''));
    },
  })]).process(css, { from: file });
}
console.log(problems ? `\n${problems} use(s) of CSS newer than Chrome 66 without a fallback (src/styles/; see tools/check-css.mjs)` : 'CSS: nothing newer than Chrome 66 without a fallback');
process.exit(problems ? 1 : 0);
