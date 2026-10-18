// Habitica's own game code and the habitica.com stand-in, for the app's made-up account ("Try it", src/app/demo/account.ts).
// vite.config.ts bundles this with esbuild into the module `virtual:habitica-game`, which only the made-up account loads.
import H from '../harness/.build/habitica-core.cjs';
import strings from '../harness/.build/strings-en.json';

/* global HABITICA_VERSION */
H.i18n.strings = strings;
H.version = HABITICA_VERSION;
export default H;
export { createMock, USER_ID, API_TOKEN } from '../mock/habitica-mock.mjs';
