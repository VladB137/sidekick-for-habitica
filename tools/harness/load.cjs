// Loads the bundled Habitica code with English strings attached. Build it first: npm run harness
const { existsSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const dir = resolve(__dirname, '.build');
if (!existsSync(`${dir}/habitica-core.cjs`)) throw new Error('Harness not built: run `npm run harness -- /path/to/habitica`');
// a bundle from an older build script lacks modules the tests now replay, and they fail as mismatches rather than say so
const want = require('node:crypto').createHash('sha256').update(readFileSync(resolve(__dirname, 'build-harness.mjs'))).digest('hex');
const have = existsSync(`${dir}/script.sha`) ? readFileSync(`${dir}/script.sha`, 'utf8').trim() : '';
if (have !== want) throw new Error('Harness out of date (tools/harness/build-harness.mjs changed since it was built): run `npm run harness -- /path/to/habitica`');
const H = require(`${dir}/habitica-core.cjs`);
H.i18n.strings = JSON.parse(readFileSync(`${dir}/strings-en.json`, 'utf8'));
H.version = readFileSync(`${dir}/version.txt`, 'utf8').trim();
module.exports = H;
