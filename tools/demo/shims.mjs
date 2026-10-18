// What Habitica's code calls that the oldest Android 9 WebView (Chrome 66) lacks, for the made-up account only
// (esbuild `inject`: the game's free references to these names use them). Habitica copies its event calendar, plain
// objects, arrays and dates, with structuredClone (Chrome 98).
const copy = v => {
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(copy);
  if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = copy(v[k]); return o; }
  return v;
};
const native = typeof globalThis.structuredClone === 'function' ? globalThis.structuredClone.bind(globalThis) : null;
export const structuredClone = native || copy;
