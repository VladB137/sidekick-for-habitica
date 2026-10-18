import { defineConfig, type Plugin } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { build as esbuild } from 'esbuild';
import flexGapFallback from './tools/flex-gap-fallback.mjs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const testApi = process.env.VITE_TEST_API || '';
// the playground's development pages (engine, creatures, scenes) go into test builds only, never into the app
const devPages = testApi ? { playground: 'playground.html', creatures: 'creatures.html', scenes: 'scenes.html' } : {};

/** Content-Security-Policy as a <meta> tag (GitHub Pages can't send headers). Build only: the dev server needs inline HMR. */
function csp (): Plugin {
  const connect = ['https://habitica.com', testApi].filter(Boolean).join(' ');
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https://habitica-assets.s3.amazonaws.com",
    "font-src 'self'",
    `connect-src 'self' ${connect}`,
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'self'",
    "form-action 'none'",
    "object-src 'none'",
  ].join('; ');
  return {
    name: 'csp-meta',
    apply: 'build',
    transformIndexHtml: html => html.replace('<!--CSP-->', `<meta http-equiv="Content-Security-Policy" content="${policy}">`),
  };
}

/** A small offline service worker listing every built file; the cache name changes with each build. */
function serviceWorker (): Plugin {
  return {
    name: 'service-worker',
    apply: 'build',
    generateBundle (_, bundle) {
      // precache the app plus the Latin Roboto files; other scripts' fonts load on demand
      // and not the made-up account's Habitica code (about 1.5 MB, fetched on the tap that asks for it)
      const files = Object.keys(bundle).filter(f => !f.endsWith('.map') && !(/roboto-/.test(f) && !/roboto-latin(-ext)?-[45]00-normal-[^.]+\.woff2$/.test(f)) && !/habitica-game-/.test(f));
      const statics = ['./', 'webview-check.js', 'webview-update.html', 'webview-update.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png'];
      const version = `${pkg.version}-${Date.now().toString(36)}`;
      const sw = readFileSync('./src/sw.js', 'utf8')
        .replace('__VERSION__', version)
        .replace('__FILES__', JSON.stringify([...statics, ...files]));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

/** Fails the build if an object literal still starts with a spread ({ ...a }): see `esbuild.supported` below. */
function noObjectSpread (): Plugin {
  return {
    name: 'no-object-spread',
    apply: 'build',
    generateBundle (_, bundle) {
      for (const f of Object.values(bundle)) {
        if (f.type === 'chunk' && /\{\.\.\./.test(f.code)) this.error(`${f.fileName} has an object spread ({...}): Chrome 70 and 71 can change the object it copies`);
      }
    },
  };
}

/**
 * `virtual:habitica-game`: Habitica's own game code (the harness, tools/harness/) and the habitica.com stand-in
 * (tools/mock/habitica-mock.mjs) for the made-up account behind "Try it" (src/app/demo/). Only that account imports it, so it
 * is a chunk of its own the app loads on the tap. Needs the harness at the Habitica release in src/engine/rules.ts.
 */
function habiticaGame (): Plugin {
  const ID = 'virtual:habitica-game';
  const dir = 'tools/harness/.build';
  return {
    name: 'habitica-game',
    resolveId: id => (id === ID ? `\0${ID}` : undefined),
    async load (id) {
      if (id !== `\0${ID}`) return undefined;
      if (!existsSync(`${dir}/habitica-core.cjs`)) this.error('The made-up account needs Habitica\'s code: git clone it at the tag in src/engine/rules.ts into ../habitica, then npm run harness -- ../habitica');
      const sha = createHash('sha256').update(readFileSync('tools/harness/build-harness.mjs')).digest('hex');
      if (readFileSync(`${dir}/script.sha`, 'utf8').trim() !== sha) this.error('The harness was built by an older tools/harness/build-harness.mjs: run npm run harness -- ../habitica again');
      const version = readFileSync(`${dir}/version.txt`, 'utf8').trim();
      const rules = readFileSync('src/engine/rules.ts', 'utf8').match(/checkedAgainst: '([^']+)'/)?.[1];
      if (version !== rules) this.warn(`the made-up account runs Habitica ${version}, the rules are checked against ${rules}`);
      const out = await esbuild({
        entryPoints: ['tools/demo/game.mjs'], bundle: true, write: false, format: 'esm', platform: 'browser', target: 'chrome66',
        supported: { 'object-rest-spread': false }, inject: ['tools/demo/shims.mjs'], logLevel: 'warning',
        define: { HABITICA_VERSION: JSON.stringify(version), 'process.env.CONTENT_SWITCHOVER_TIME_OFFSET': '0', global: 'globalThis' },
        banner: { js: `/*! Habitica ${version} game code (GPL-3.0, HabitRPG: github.com/HabitRPG/habitica), for Sidekick's made-up account. */` },
      });
      for (const f of ['tools/demo/game.mjs', 'tools/demo/shims.mjs', 'tools/mock/habitica-mock.mjs', `${dir}/habitica-core.cjs`, `${dir}/strings-en.json`]) this.addWatchFile(f);
      return out.outputFiles[0].text;
    },
  };
}

export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString().slice(0, 10)),
  },
  // Android 9 (minSdk 28) can run a WebView as old as Chrome 66 until Google Play updates it: syntax is lowered to that,
  // src/app/polyfills.ts fills in the library calls, public/webview-check.js covers anything older
  // flex `gap` came in Chrome 84: the same spacing as margins where it's missing (tools/flex-gap-fallback.mjs)
  css: { postcss: { plugins: [flexGapFallback()] } },
  // object spread is lowered to plain property copies even though Chrome 66 has it: Chrome 70 and 71 (V8 7.0, 7.1) copy a
  // number field of { ...a, x } by sharing its box, so setting x in the copy changed a.x too (the trees that stand among the
  // creatures all jumped to the top-left corner on an Android 9 phone). noObjectSpread() fails a build that still has one.
  esbuild: { supported: { 'object-rest-spread': false } },
  build: { target: ['chrome66', 'firefox68', 'safari13'], sourcemap: false, assetsInlineLimit: 0, rollupOptions: {
    input: { index: 'index.html', ...devPages },
    output: { manualChunks: id => (id.includes('virtual:habitica-game') ? 'habitica-game' : undefined) },
  } },
  plugins: [habiticaGame(), csp(), serviceWorker(), noObjectSpread()],
});
