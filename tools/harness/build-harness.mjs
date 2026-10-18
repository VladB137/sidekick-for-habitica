// Bundles Habitica's own game code (a local clone of github.com/HabitRPG/habitica) into one
// self-contained CommonJS file that the parity tests and the mock server require().
// Usage: node tools/harness/build-harness.mjs [path/to/habitica]   (default: $HABITICA_DIR or ../habitica)
import { build } from 'esbuild';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const habitica = resolve(process.argv[2] || process.env.HABITICA_DIR || resolve(root, '../habitica'));
const common = `${habitica}/website/common/script`;
if (!existsSync(`${common}/ops/scoreTask.js`)) {
  console.error(`Habitica clone not found at ${habitica}`);
  process.exit(1);
}
const outDir = resolve(here, '.build');
mkdirSync(outDir, { recursive: true });

const modules = {
  scoreTask: 'ops/scoreTask',
  spells: 'content/spells',
  statsComputed: 'libs/statsComputed',
  buy: 'ops/buy/buy',
  sell: 'ops/sell',
  equip: 'ops/equip',
  allocate: 'ops/stats/allocate',
  revive: 'ops/revive',
  updateStats: 'fns/updateStats',
  crit: 'fns/crit',
  randomDrop: 'fns/randomDrop',
  feed: 'ops/feed',
  hatch: 'ops/hatch',
  predictableRandom: 'fns/predictableRandom',
  content: 'content/index',
  i18n: 'i18n',
};
const entry = Object.entries(modules)
  .map(([name, p]) => `import ${name} from '${common}/${p}';`).join('\n')
  + `\nimport { getScheduleMatchingGroup } from '${common}/content/constants/schedule';`
  + `\nimport { shouldDo, daysSince } from '${common}/cron';`
  + `\nexport { ${Object.keys(modules).join(', ')}, getScheduleMatchingGroup, shouldDo, daysSince };\n`;
const entryFile = resolve(outDir, 'entry.js');
writeFileSync(entryFile, entry);

let version = 'unknown';
try { version = execSync('git describe --tags --always', { cwd: habitica }).toString().trim(); } catch { /* not a git clone */ }

await build({
  entryPoints: [entryFile],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: resolve(outDir, 'habitica-core.cjs'),
  nodePaths: [resolve(root, 'node_modules')],
  banner: { js: `// Habitica ${version} game code, bundled by tools/harness/build-harness.mjs. GPL-3.0.` },
  logLevel: 'warning',
});
writeFileSync(resolve(outDir, 'version.txt'), `${version}\n`);
// which build script made this bundle: load.cjs refuses a bundle from an older script (a branch that changed the module list)
writeFileSync(resolve(outDir, 'script.sha'), createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'));
// English strings, so item names resolve (content text() calls i18n.t)
const locDir = `${habitica}/website/common/locales/en`;
const strings = {};
for (const f of readdirSync(locDir).filter(n => n.endsWith('.json'))) Object.assign(strings, JSON.parse(readFileSync(`${locDir}/${f}`, 'utf8')));
writeFileSync(resolve(outDir, 'strings-en.json'), JSON.stringify(strings));
console.log(`harness built from Habitica ${version} -> tools/harness/.build/habitica-core.cjs`);
