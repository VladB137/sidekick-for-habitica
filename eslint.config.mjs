// Only one question is asked here: does the app call anything the oldest Android 9 WebView (Chrome 66) lacks?
// eslint-plugin-compat checks the calls against browserslist (package.json); what src/app/polyfills.ts fills in is listed below.
// The CSS side is tools/check-css.mjs, on the built stylesheet.
import tseslint from 'typescript-eslint';
import compat from 'eslint-plugin-compat';

export default [
  { ignores: ['dist/**', 'dist-e2e/**', 'android/**', 'node_modules/**'] },
  {
    files: ['src/**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { compat },
    settings: {
      // src/app/polyfills.ts
      // (the plugin names instance methods both ways: Array.at, Array.prototype.at)
      polyfills: ['globalThis', 'Object.fromEntries', 'Promise.allSettled',
        ...['flat', 'flatMap', 'at', 'sort'].flatMap(m => [`Array.${m}`, `Array.prototype.${m}`]),
        ...['Element', 'Document', 'DocumentFragment'].flatMap(o => [`${o}.replaceChildren`, `${o}.prototype.replaceChildren`]),
        'Element.toggleAttribute', 'Element.prototype.toggleAttribute'],
    },
    linterOptions: { reportUnusedDisableDirectives: 'off' },
    rules: {
      'compat/compat': 'error',
      // a module in a shared chunk runs before the entry's own code, polyfills.ts included: no filled-in call at a module's top level
      'no-restricted-syntax': ['error', {
        selector: 'CallExpression[callee.property.name=/^(flat|flatMap|at|fromEntries|allSettled|replaceChildren|toggleAttribute)$/]:not(:function CallExpression)',
        message: 'Filled in by src/app/polyfills.ts, which may not have run yet at a module\'s top level (Chrome 66): call it inside a function, or write it without.',
      }],
    },
  },
  { files: ['src/app/polyfills.ts'], rules: { 'no-restricted-syntax': 'off' } },
];
