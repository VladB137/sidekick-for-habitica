/*
 * Pins the clock for the parity suite. Habitica's code (and these tests) read the current date, so
 * unpinned runs draw different cases on different days and "identical" would only mean "identical today".
 * The clock starts at PARITY_NOW (default below) and ticks normally from there.
 *
 *   PARITY_NOW=now npm run test:parity       (today's real clock, to look for date-dependent cases)
 *   PARITY_NOW=2027-01-01T08:00:00Z npm run test:parity
 */
const at = process.env.PARITY_NOW || '2026-09-24T12:00:00Z';
if (at !== 'now') {
  const Real = Date;
  const start = Real.parse(at);
  if (!Number.isFinite(start)) throw new Error(`PARITY_NOW: not a date: ${at}`);
  const offset = start - Real.now();
  const now = () => Real.now() + offset;
  // a function, not a subclass, so Date() without `new` still returns a string as it should
  const Fake = function (this: unknown, ...args: unknown[]) {
    if (!new.target) return new Real(now()).toString();
    return args.length ? new (Real as any)(...args) : new Real(now());
  } as unknown as DateConstructor;
  Object.setPrototypeOf(Fake, Real);
  (Fake as any).prototype = Real.prototype;
  (Fake as any).now = now;
  globalThis.Date = Fake;
}
export const clockLabel = at === 'now' ? 'real clock' : `clock pinned to ${at}`;
