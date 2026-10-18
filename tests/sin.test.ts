// Proves fdlibmSin() is bit-identical to Habitica's server sine.
// Under Node 20 (Habitica's runtime) Math.sin IS the reference; elsewhere only the recorded vectors are checked.
import { fdlibmSin, selfTest } from '../src/engine/fdlibm';

const buf = new Float64Array(2);
const u = new BigUint64Array(buf.buffer);
const same = (a: number, b: number) => { buf[0] = a; buf[1] = b; return u[0] === u[1]; };

const st = selfTest();
console.log(`recorded vectors: ${st.checked - st.failures}/${st.checked} identical`);
let failed = !st.ok;

if (process.versions.node.startsWith('20.')) {
  const N = Number(process.env.SIN_SEEDS || 3_000_000);
  let bad = 0; let firstBad = -1;
  for (let s = 0; s < N; s++) {
    if (!same(fdlibmSin(s + 1), Math.sin(s + 1))) { bad++; if (firstBad < 0) firstBad = s; }
  }
  console.log(`seeds 0..${N - 1}: ${N - bad}/${N} identical${bad ? ` (first mismatch at seed ${firstBad})` : ''}`);
  let seed = 7; const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  let badL = 0; const M = 300_000;
  for (let i = 0; i < M; i++) {
    const x = i % 3 === 0 ? Math.floor(rnd() * 2 ** 31) : i % 3 === 1 ? rnd() * 1e7 : Math.floor(rnd() * 1e15);
    if (!same(fdlibmSin(x), Math.sin(x))) badL++;
  }
  console.log(`random large/fractional arguments: ${M - badL}/${M} identical`);
  failed = failed || bad > 0 || badL > 0;
} else {
  console.log(`Node ${process.versions.node}: skipping the Math.sin comparison (reference is Node 20)`);
}
if (failed) { console.error('SIN TEST FAILED'); process.exit(1); }
console.log('sin: OK');
