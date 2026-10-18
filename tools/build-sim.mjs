// Builds the simulator into dist-sim/: the web build with tools/sim/sim.mjs in front of it, answering its own
// Habitica requests with Habitica's game code (needs the harness: npm run harness -- ../habitica).
// The bundled pictures (thousands of files) are packed into a few simpack/*.json files the page unpacks on demand,
// and page.html is written without <html>/<head>/<body> so it can be published as a page in the Claude project.
//   node tools/build-sim.mjs        then serve dist-sim/ (node_modules/.bin/vite preview --outDir dist-sim)
import { build as vite } from 'vite';
import { build as esbuild } from 'esbuild';
import { readFileSync, writeFileSync, readdirSync, rmSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const OUT = 'dist-sim';
// a name that can't resolve: every request to it is answered in the page, and nothing could reach a real host
const SIM_API = 'https://habitica.simulator.invalid';
const version = readFileSync('tools/harness/.build/version.txt', 'utf8').trim();

rmSync(OUT, { recursive: true, force: true });
process.env.VITE_TEST_API = SIM_API;
await vite({ build: { outDir: OUT, emptyOutDir: true }, logLevel: 'warn' });

await esbuild({
  entryPoints: ['tools/sim/sim.mjs'],
  bundle: true, format: 'iife', platform: 'browser', target: 'es2020', minify: true, outfile: `${OUT}/sim.js`,
  define: { SIM_API: JSON.stringify(SIM_API), SIM_HABITICA: JSON.stringify(version), 'process.env.CONTENT_SWITCHOVER_TIME_OFFSET': '0', global: 'globalThis' },
  banner: { js: '// Sidekick simulator, with Habitica\'s game code (GPL-3.0, HabitRPG).' },
  logLevel: 'warning',
});

// pack the pictures: chunks of about 1.5 MB, so a screen fetches only what it shows
const files = [];
const walk = dir => { for (const n of readdirSync(join(OUT, dir)).sort()) { const p = `${dir}/${n}`; if (statSync(join(OUT, p)).isDirectory()) walk(p); else files.push(p); } };
walk('stable'); walk('shop');
// Habitica's avatar layers the made-up accounts wear (tests/sweep.cjs lists them), fetched once into a cache
const AVATAR = 'https://habitica-assets.s3.amazonaws.com/mobileApp/images/';
const CACHE = 'node_modules/.cache/sim-avatar';
mkdirSync(CACHE, { recursive: true });
const avatars = JSON.parse(readFileSync('tools/sim/avatar-files.json', 'utf8'));
let missing = 0;
for (const name of avatars) {
  const at = join(CACHE, name);
  if (!existsSync(at)) {
    try { const r = await fetch(AVATAR + name); if (!r.ok) throw new Error(r.status); writeFileSync(at, Buffer.from(await r.arrayBuffer())); } catch { missing += 1; continue; }
  }
  files.push(`avatar/${name}`);
}
if (missing) console.warn(`${missing} avatar pictures could not be fetched; the simulator shows those layers empty`);
const bytesOf = f => readFileSync(f.startsWith('avatar/') ? join(CACHE, f.slice(7)) : join(OUT, f));
const index = {}; const chunks = [[]]; let size = 0;
for (const f of files) {
  const b = bytesOf(f);
  if (size + b.length > 1.5e6 && chunks.at(-1).length) { chunks.push([]); size = 0; }
  chunks.at(-1).push([f, b.toString('base64')]); size += b.length;
  index[f] = chunks.length - 1;
}
mkdirSync(`${OUT}/simpack`);
chunks.forEach((c, i) => writeFileSync(`${OUT}/simpack/${i}.json`, JSON.stringify(Object.fromEntries(c))));
writeFileSync(`${OUT}/simpack/index.json`, JSON.stringify(index));
for (const d of ['stable', 'shop']) rmSync(join(OUT, d), { recursive: true });
// the playground's development pages come with test builds; the simulator is the app only
for (const f of ['playground.html', 'creatures.html', 'scenes.html', 'sw.js']) rmSync(join(OUT, f), { force: true });

// the page as the project publishes it: its contents without the document skeleton, the simulator first
const html = readFileSync(`${OUT}/index.html`, 'utf8');
const head = html.match(/<head>([\s\S]*)<\/head>/)[1]
  .replace(/<meta charset[^>]*>|<meta name="viewport"[^>]*>|<meta http-equiv="Content-Security-Policy"[^>]*>|<link rel="manifest"[^>]*>/g, '')
  .replace('<title>Sidekick for Habitica</title>', '<title>Sidekick for Habitica simulator</title>');
const body = html.match(/<body>([\s\S]*)<\/body>/)[1];
const page = `<script src="./sim.js"></script>\n${head.trim()}\n${body.trim()}\n`;
writeFileSync(`${OUT}/page.html`, page);
// the same as a whole document, for serving it locally (vite preview, tests/sweep.cjs)
writeFileSync(`${OUT}/index.html`, `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page}</body>\n</html>\n`);

const count = []; const all = d => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) all(p); else count.push(p); } };
all(OUT);
console.log(`simulator in ${OUT}/: ${count.length} files, ${files.length} pictures in ${chunks.length} packs, Habitica ${version}`);
