/*
 * sin(x) exactly as Habitica's server computes it.
 *
 * Habitica runs on Node 20, whose V8 (11.3) implements Math.sin with fdlibm
 * (deps/v8/src/base/ieee754.cc). Current Chrome, and therefore the Android
 * WebView, uses a different sine that is 1 ulp off for about 3% of the seeds
 * the crit roll sees. That never flipped a decision in our tests, but the roll
 * is chaotic, so we compute it the server's way on every browser.
 *
 * This is a line-by-line port of fdlibm 5.3's sin, __kernel_sin, __kernel_cos,
 * __ieee754_rem_pio2 and __kernel_rem_pio2 as they appear in Node v20.20.2's V8.
 * Plain IEEE double arithmetic in JavaScript is exact to the C semantics here
 * (no extended precision, no fused multiply-add), so results are bit-identical.
 *
 * Original code: Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.
 * Developed at SunPro, a Sun Microsystems, Inc. business. Permission to use,
 * copy, modify, and distribute this software is freely granted, provided that
 * this notice is preserved.
 */

import { SIN_VECTORS } from './sinVectors';

const f64 = new Float64Array(1);
const u32 = new Uint32Array(f64.buffer);
// Little-endian platforms store the low word first.
const LE = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const HI = LE ? 1 : 0;
const LO = LE ? 0 : 1;

function highWord (d: number): number { f64[0] = d; return u32[HI] | 0; }
function lowWord (d: number): number { f64[0] = d; return u32[LO] >>> 0; }
function fromWords (hi: number, lo: number): number { u32[HI] = hi >>> 0; u32[LO] = lo >>> 0; return f64[0]; }
function setHighWord (d: number, hi: number): number { f64[0] = d; u32[HI] = hi >>> 0; return f64[0]; }
function setLowWord (d: number, lo: number): number { f64[0] = d; u32[LO] = lo >>> 0; return f64[0]; }

// scalbn(x, n) for the small |n| used here: multiply by an exact power of two.
function pow2 (n: number): number { return fromWords(((n + 1023) << 20) >>> 0, 0); }
function scalbn (x: number, n: number): number {
  // split large exponents so each factor stays a normal number
  while (n > 1000) { x *= pow2(1000); n -= 1000; }
  while (n < -1000) { x *= pow2(-1000); n += 1000; }
  return x * pow2(n);
}

const trunc32 = (x: number): number => Math.trunc(x) | 0;

function kernelSin (x: number, y: number, iy: number): number {
  const half = 5.00000000000000000000e-01;
  const S1 = -1.66666666666666324348e-01;
  const S2 = 8.33333333332248946124e-03;
  const S3 = -1.98412698298579493134e-04;
  const S4 = 2.75573137070700676789e-06;
  const S5 = -2.50507602534068634195e-08;
  const S6 = 1.58969099521155010221e-10;
  const ix = highWord(x) & 0x7FFFFFFF;
  if (ix < 0x3E400000) {
    if (trunc32(x) === 0) return x;
  }
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  if (iy === 0) return x + v * (S1 + z * r);
  return x - ((z * (half * y - v * r) - y) - v * S1);
}

function kernelCos (x: number, y: number): number {
  const one = 1.0;
  const C1 = 4.16666666666666019037e-02;
  const C2 = -1.38888888888741095749e-03;
  const C3 = 2.48015872894767294178e-05;
  const C4 = -2.75573143513906633035e-07;
  const C5 = 2.08757232129817482790e-09;
  const C6 = -1.13596475577881948265e-11;
  const ix = highWord(x) & 0x7FFFFFFF;
  if (ix < 0x3E400000) {
    if (trunc32(x) === 0) return one;
  }
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  if (ix < 0x3FD33333) {
    return one - (0.5 * z - (z * r - x * y));
  }
  let qx: number;
  if (ix > 0x3FE90000) qx = 0.28125;
  else qx = fromWords(ix - 0x00200000, 0);
  const iz = 0.5 * z - qx;
  const a = one - qx;
  return a - (iz - (z * r - x * y));
}

const TWO_OVER_PI = [
  0xA2F983, 0x6E4E44, 0x1529FC, 0x2757D1, 0xF534DD, 0xC0DB62, 0x95993C,
  0x439041, 0xFE5163, 0xABDEBB, 0xC561B7, 0x246E3A, 0x424DD2, 0xE00649,
  0x2EEA09, 0xD1921C, 0xFE1DEB, 0x1CB129, 0xA73EE8, 0x8235F5, 0x2EBB44,
  0x84E99C, 0x7026B4, 0x5F7E41, 0x3991D6, 0x398353, 0x39F49C, 0x845F8B,
  0xBDF928, 0x3B1FF8, 0x97FFDE, 0x05980F, 0xEF2F11, 0x8B5A0A, 0x6D1F6D,
  0x367ECF, 0x27CB09, 0xB74F46, 0x3F669E, 0x5FEA2D, 0x7527BA, 0xC7EBE5,
  0xF17B3D, 0x0739F7, 0x8A5292, 0xEA6BFB, 0x5FB11F, 0x8D5D08, 0x560330,
  0x46FC7B, 0x6BABF0, 0xCFBC20, 0x9AF436, 0x1DA9E3, 0x91615E, 0xE61B08,
  0x659985, 0x5F14A0, 0x68408D, 0xFFD880, 0x4D7327, 0x310606, 0x1556CA,
  0x73A8C9, 0x60E27B, 0xC08C6B,
];

const NPIO2_HW = [
  0x3FF921FB, 0x400921FB, 0x4012D97C, 0x401921FB, 0x401F6A7A, 0x4022D97C,
  0x4025FDBB, 0x402921FB, 0x402C463A, 0x402F6A7A, 0x4031475C, 0x4032D97C,
  0x40346B9C, 0x4035FDBB, 0x40378FDB, 0x403921FB, 0x403AB41B, 0x403C463A,
  0x403DD85A, 0x403F6A7A, 0x40407E4C, 0x4041475C, 0x4042106C, 0x4042D97C,
  0x4043A28C, 0x40446B9C, 0x404534AC, 0x4045FDBB, 0x4046C6CB, 0x40478FDB,
  0x404858EB, 0x404921FB,
];

const PIO2 = [
  1.57079625129699707031e+00,
  7.54978941586159635335e-08,
  5.39030252995776476554e-15,
  3.28200341580791294123e-22,
  1.27065575308067607349e-29,
  1.22933308981111328932e-36,
  2.73370053816464559624e-44,
  2.16741683877804819444e-51,
];

function kernelRemPio2 (x: number[], y: number[], e0: number, nx: number, prec: number, ipio2: number[]): number {
  const initJk = [2, 3, 4, 6];
  const zero = 0.0;
  const one = 1.0;
  const two24 = 1.67772160000000000000e+07;
  const twon24 = 5.96046447753906250000e-08;

  const iq = new Array<number>(20).fill(0);
  const f = new Array<number>(20).fill(0);
  const fq = new Array<number>(20).fill(0);
  const q = new Array<number>(20).fill(0);
  let z: number; let fw: number;
  let i: number; let j: number; let k: number; let n: number; let ih: number; let carry: number;

  const jk = initJk[prec];
  const jp = jk;
  const jx = nx - 1;
  let jv = Math.trunc((e0 - 3) / 24);
  if (jv < 0) jv = 0;
  let q0 = e0 - 24 * (jv + 1);

  j = jv - jx;
  const m = jx + jk;
  for (i = 0; i <= m; i++, j++) f[i] = (j < 0) ? zero : ipio2[j];

  for (i = 0; i <= jk; i++) {
    for (j = 0, fw = 0.0; j <= jx; j++) fw += x[j] * f[jx + i - j];
    q[i] = fw;
  }

  let jz = jk;
  for (;;) { // recompute:
    for (i = 0, j = jz, z = q[jz]; j > 0; i++, j--) {
      fw = trunc32(twon24 * z);
      iq[i] = trunc32(z - two24 * fw);
      z = q[j - 1] + fw;
    }

    z = scalbn(z, q0);
    z -= 8.0 * Math.floor(z * 0.125);
    n = trunc32(z);
    z -= n;
    ih = 0;
    if (q0 > 0) {
      i = iq[jz - 1] >> (24 - q0);
      n += i;
      iq[jz - 1] -= i << (24 - q0);
      ih = iq[jz - 1] >> (23 - q0);
    } else if (q0 === 0) {
      ih = iq[jz - 1] >> 23;
    } else if (z >= 0.5) {
      ih = 2;
    }

    if (ih > 0) {
      n += 1;
      carry = 0;
      for (i = 0; i < jz; i++) {
        j = iq[i];
        if (carry === 0) {
          if (j !== 0) {
            carry = 1;
            iq[i] = 0x1000000 - j;
          }
        } else {
          iq[i] = 0xFFFFFF - j;
        }
      }
      if (q0 > 0) {
        switch (q0) {
          case 1: iq[jz - 1] &= 0x7FFFFF; break;
          case 2: iq[jz - 1] &= 0x3FFFFF; break;
          default: break;
        }
      }
      if (ih === 2) {
        z = one - z;
        if (carry !== 0) z -= scalbn(one, q0);
      }
    }

    if (z === zero) {
      j = 0;
      for (i = jz - 1; i >= jk; i--) j |= iq[i];
      if (j === 0) {
        for (k = 1; jk >= k && iq[jk - k] === 0; k++) { /* k = no. of terms needed */ }
        for (i = jz + 1; i <= jz + k; i++) {
          f[jx + i] = ipio2[jv + i];
          for (j = 0, fw = 0.0; j <= jx; j++) fw += x[j] * f[jx + i - j];
          q[i] = fw;
        }
        jz += k;
        continue; // goto recompute
      }
    }
    break;
  }

  if (z === 0.0) {
    jz -= 1;
    q0 -= 24;
    while (iq[jz] === 0) {
      jz--;
      q0 -= 24;
    }
  } else {
    z = scalbn(z, -q0);
    if (z >= two24) {
      fw = trunc32(twon24 * z);
      iq[jz] = trunc32(z - two24 * fw);
      jz += 1;
      q0 += 24;
      iq[jz] = fw;
    } else {
      iq[jz] = trunc32(z);
    }
  }

  fw = scalbn(one, q0);
  for (i = jz; i >= 0; i--) {
    q[i] = fw * iq[i];
    fw *= twon24;
  }

  for (i = jz; i >= 0; i--) {
    for (fw = 0.0, k = 0; k <= jp && k <= jz - i; k++) fw += PIO2[k] * q[i + k];
    fq[jz - i] = fw;
  }

  // prec is always 2 here (double precision)
  fw = 0.0;
  for (i = jz; i >= 0; i--) fw += fq[i];
  y[0] = (ih === 0) ? fw : -fw;
  fw = fq[0] - fw;
  for (i = 1; i <= jz; i++) fw += fq[i];
  y[1] = (ih === 0) ? fw : -fw;
  return n & 7;
}

function remPio2 (x: number, y: number[]): number {
  const half = 5.00000000000000000000e-01;
  const two24 = 1.67772160000000000000e+07;
  const invpio2 = 6.36619772367581382433e-01;
  const pio2_1 = 1.57079632673412561417e+00;
  const pio2_1t = 6.07710050650619224932e-11;
  const pio2_2 = 6.07710050630396597660e-11;
  const pio2_2t = 2.02226624879595063154e-21;
  const pio2_3 = 2.02226624871116645580e-21;
  const pio2_3t = 8.47842766036889956997e-32;

  let z = 0; let w: number; let t: number; let r: number; let fn: number;
  let i: number; let j: number; let n: number;
  const hx = highWord(x);
  const ix = hx & 0x7FFFFFFF;
  if (ix <= 0x3FE921FB) { y[0] = x; y[1] = 0; return 0; }
  if (ix < 0x4002D97C) {
    if (hx > 0) {
      z = x - pio2_1;
      if (ix !== 0x3FF921FB) {
        y[0] = z - pio2_1t;
        y[1] = (z - y[0]) - pio2_1t;
      } else {
        z -= pio2_2;
        y[0] = z - pio2_2t;
        y[1] = (z - y[0]) - pio2_2t;
      }
      return 1;
    }
    z = x + pio2_1;
    if (ix !== 0x3FF921FB) {
      y[0] = z + pio2_1t;
      y[1] = (z - y[0]) + pio2_1t;
    } else {
      z += pio2_2;
      y[0] = z + pio2_2t;
      y[1] = (z - y[0]) + pio2_2t;
    }
    return -1;
  }
  if (ix <= 0x413921FB) {
    t = Math.abs(x);
    n = trunc32(t * invpio2 + half);
    fn = n;
    r = t - fn * pio2_1;
    w = fn * pio2_1t;
    if (n < 32 && ix !== NPIO2_HW[n - 1]) {
      y[0] = r - w;
    } else {
      j = ix >> 20;
      y[0] = r - w;
      let high = highWord(y[0]) >>> 0;
      i = j - ((high >>> 20) & 0x7FF);
      if (i > 16) {
        t = r;
        w = fn * pio2_2;
        r = t - w;
        w = fn * pio2_2t - ((t - r) - w);
        y[0] = r - w;
        high = highWord(y[0]) >>> 0;
        i = j - ((high >>> 20) & 0x7FF);
        if (i > 49) {
          t = r;
          w = fn * pio2_3;
          r = t - w;
          w = fn * pio2_3t - ((t - r) - w);
          y[0] = r - w;
        }
      }
    }
    y[1] = (r - y[0]) - w;
    if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
    return n;
  }
  if (ix >= 0x7FF00000) { y[0] = y[1] = x - x; return 0; }
  // large arguments: z = scalbn(|x|, ilogb(x) - 23)
  const low = lowWord(x);
  z = setLowWord(z, low);
  const e0 = (ix >> 20) - 1046;
  z = setHighWord(z, ix - ((e0 << 20) | 0));
  const tx = [0, 0, 0];
  for (i = 0; i < 2; i++) {
    tx[i] = trunc32(z);
    z = (z - tx[i]) * two24;
  }
  tx[2] = z;
  let nx = 3;
  while (tx[nx - 1] === 0) nx--;
  n = kernelRemPio2(tx, y, e0, nx, 2, TWO_OVER_PI);
  if (hx < 0) { y[0] = -y[0]; y[1] = -y[1]; return -n; }
  return n;
}

const yBuf = [0, 0];

/** sin(x), bit-identical to Habitica's server (Node 20 / fdlibm). */
export function fdlibmSin (x: number): number {
  const ix = highWord(x) & 0x7FFFFFFF;
  if (ix <= 0x3FE921FB) return kernelSin(x, 0, 0);
  if (ix >= 0x7FF00000) return x - x;
  const n = remPio2(x, yBuf);
  switch (n & 3) {
    case 0: return kernelSin(yBuf[0], yBuf[1], 1);
    case 1: return kernelCos(yBuf[0], yBuf[1]);
    case 2: return -kernelSin(yBuf[0], yBuf[1], 1);
    default: return -kernelCos(yBuf[0], yBuf[1]);
  }
}

/** Startup self-test against sin() bit patterns recorded from Node 20 (Habitica's runtime). */
export function selfTest (): { ok: boolean, failures: number, checked: number } {
  let failures = 0;
  for (const [x, hi, lo] of SIN_VECTORS) {
    f64[0] = fdlibmSin(x);
    if ((u32[HI] >>> 0) !== hi || (u32[LO] >>> 0) !== lo) failures++;
  }
  return { ok: failures === 0, failures, checked: SIN_VECTORS.length };
}
