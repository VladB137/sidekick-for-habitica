// Minimal PNG and GIF codecs for the sprite generator (no dependencies).
// decodePng: 1/2/4/8-bit grey, RGB, palette, grey+alpha, RGBA, Adam7 interlace; ancillary chunks are ignored
// (several Habitica sprites carry Photoshop XMP chunks with bad CRCs). encodePng: palette when it fits, else RGBA.
// decodeGif: every frame composited to full RGBA canvases, with delays.
import { inflateSync, deflateSync } from 'node:zlib';

const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32 (buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }

/** @returns {{ w: number, h: number, px: Uint8Array }} RGBA, 4 bytes per pixel */
export function decodePng (buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let o = 8; let ihdr; let plte; let trns; const idat = [];
  while (o < buf.length) {
    const n = buf.readUInt32BE(o); const type = buf.toString('latin1', o + 4, o + 8);
    const data = buf.subarray(o + 8, o + 8 + n);
    const critical = type[0] === type[0].toUpperCase();
    if (critical && crc32(buf.subarray(o + 4, o + 8 + n)) !== buf.readUInt32BE(o + 8 + n)) throw new Error(`bad CRC in ${type}`);
    if (type === 'IHDR') ihdr = data; else if (type === 'PLTE') plte = data; else if (type === 'tRNS') trns = data; else if (type === 'IDAT') idat.push(data); else if (type === 'IEND') break;
    o += 12 + n;
  }
  const w = ihdr.readUInt32BE(0); const h = ihdr.readUInt32BE(4);
  const depth = ihdr[8]; const ct = ihdr[9]; const interlace = ihdr[12];
  if (depth === 16) throw new Error('16-bit PNG not supported');
  const chans = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct];
  const bpp = Math.max(1, (chans * depth) >> 3);
  const raw = inflateSync(Buffer.concat(idat));
  const px = new Uint8Array(w * h * 4);
  const passes = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  let p = 0;
  for (const [x0, y0, dx, dy] of passes) {
    const pw = Math.ceil((w - x0) / dx); const ph = Math.ceil((h - y0) / dy);
    if (pw <= 0 || ph <= 0) continue;
    const stride = Math.ceil((pw * chans * depth) / 8);
    let prev = new Uint8Array(stride);
    for (let y = 0; y < ph; y++) {
      const f = raw[p++]; const line = Uint8Array.from(raw.subarray(p, p + stride)); p += stride;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? line[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
        if (f === 1) line[i] += a; else if (f === 2) line[i] += b; else if (f === 3) line[i] += (a + b) >> 1;
        else if (f === 4) { const q = a + b - c; const pa = Math.abs(q - a); const pb = Math.abs(q - b); const pc = Math.abs(q - c); line[i] += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      }
      prev = line;
      for (let x = 0; x < pw; x++) {
        const sample = k => { // k-th sample of this pixel
          const bit = (x * chans + k) * depth;
          if (depth === 8) return line[bit >> 3];
          return (line[bit >> 3] >> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        };
        const q = ((y0 + y * dy) * w + x0 + x * dx) * 4;
        const scale = ct === 3 ? 1 : 255 / ((1 << depth) - 1);
        if (ct === 3) { const i = sample(0); px[q] = plte[i * 3]; px[q + 1] = plte[i * 3 + 1]; px[q + 2] = plte[i * 3 + 2]; px[q + 3] = trns && i < trns.length ? trns[i] : 255; }
        else if (ct === 0 || ct === 4) { const g = sample(0) * scale; px[q] = px[q + 1] = px[q + 2] = g; px[q + 3] = ct === 4 ? sample(1) * scale : 255; }
        else { px[q] = sample(0) * scale; px[q + 1] = sample(1) * scale; px[q + 2] = sample(2) * scale; px[q + 3] = ct === 6 ? sample(3) * scale : 255; }
      }
    }
  }
  // fully transparent pixels carry no colour
  for (let i = 0; i < px.length; i += 4) if (px[i + 3] === 0) px[i] = px[i + 1] = px[i + 2] = 0;
  return { w, h, px };
}

function chunk (type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, 'latin1'); Buffer.from(data).copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Filters each row with the type that minimises the sum of absolute values (the usual heuristic). */
function filterRows (rows, bpp) {
  const out = []; let prev = new Uint8Array(rows[0].length);
  for (const line of rows) {
    let best; let bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const o = new Uint8Array(line.length + 1); o[0] = f; let score = 0;
      for (let i = 0; i < line.length; i++) {
        const a = i >= bpp ? line[i - bpp] : 0; const b = prev[i]; const c = i >= bpp ? prev[i - bpp] : 0;
        let pred = 0;
        if (f === 1) pred = a; else if (f === 2) pred = b; else if (f === 3) pred = (a + b) >> 1;
        else if (f === 4) { const q = a + b - c; const pa = Math.abs(q - a); const pb = Math.abs(q - b); const pc = Math.abs(q - c); pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        const v = (line[i] - pred) & 255; o[i + 1] = v; score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = o; }
    }
    out.push(best); prev = line;
  }
  return Buffer.concat(out);
}

/** Lossless; palette PNG (with tRNS) when there are at most 256 RGBA colours. */
export function encodePng ({ w, h, px }) {
  const colours = new Map();
  for (let i = 0; i < px.length && colours.size <= 256; i += 4) {
    const k = ((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0;
    if (!colours.has(k)) colours.set(k, colours.size);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  const parts = [Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])];
  let data;
  if (colours.size <= 256) {
    // transparent entries first so tRNS stays short
    const keys = [...colours.keys()].sort((a, b) => (a & 255) - (b & 255));
    const index = new Map(keys.map((k, i) => [k, i]));
    const depth = keys.length <= 2 ? 1 : keys.length <= 4 ? 2 : keys.length <= 16 ? 4 : 8;
    ihdr[8] = depth; ihdr[9] = 3;
    const plte = Buffer.alloc(keys.length * 3); const alphas = keys.map(k => k & 255);
    keys.forEach((k, i) => { plte[i * 3] = k >>> 24; plte[i * 3 + 1] = (k >>> 16) & 255; plte[i * 3 + 2] = (k >>> 8) & 255; });
    let last = alphas.length; while (last > 0 && alphas[last - 1] === 255) last--;
    const rows = [];
    for (let y = 0; y < h; y++) {
      const line = new Uint8Array(Math.ceil((w * depth) / 8));
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const v = index.get(((px[i] << 24) | (px[i + 1] << 16) | (px[i + 2] << 8) | px[i + 3]) >>> 0);
        const bit = x * depth; line[bit >> 3] |= v << (8 - depth - (bit & 7));
      }
      rows.push(line);
    }
    data = depth === 8 ? filterRows(rows, 1) : Buffer.concat(rows.map(r => Buffer.concat([Buffer.from([0]), r])));
    parts.push(chunk('IHDR', ihdr), chunk('PLTE', plte));
    if (last) parts.push(chunk('tRNS', Buffer.from(alphas.slice(0, last))));
  } else {
    ihdr[8] = 8; ihdr[9] = 6;
    const rows = []; for (let y = 0; y < h; y++) rows.push(px.subarray(y * w * 4, (y + 1) * w * 4));
    data = filterRows(rows, 4);
    parts.push(chunk('IHDR', ihdr));
  }
  parts.push(chunk('IDAT', deflateSync(data, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0)));
  return Buffer.concat(parts);
}

/** @returns {{ w: number, h: number, frames: { px: Uint8Array, ms: number }[] }} */
export function decodeGif (buf) {
  if (buf.toString('latin1', 0, 3) !== 'GIF') throw new Error('not a GIF');
  const w = buf.readUInt16LE(6); const h = buf.readUInt16LE(8); const flags = buf[10];
  let o = 13; let gct = null;
  if (flags & 0x80) { const n = 3 << ((flags & 7) + 1); gct = buf.subarray(o, o + n); o += n; }
  const canvas = new Uint8Array(w * h * 4); const frames = [];
  let gce = { delay: 10, transparent: -1, disposal: 0 };
  while (o < buf.length) {
    const b = buf[o++];
    if (b === 0x3b) break;
    if (b === 0x21) {
      const label = buf[o++];
      if (label === 0xf9) { const p = buf[o + 1]; gce = { disposal: (p >> 2) & 7, delay: buf.readUInt16LE(o + 2), transparent: p & 1 ? buf[o + 4] : -1 }; }
      while (buf[o]) o += buf[o] + 1; o++;
      continue;
    }
    if (b !== 0x2c) throw new Error('bad GIF block');
    const fx = buf.readUInt16LE(o); const fy = buf.readUInt16LE(o + 2); const fw = buf.readUInt16LE(o + 4); const fh = buf.readUInt16LE(o + 6); const f = buf[o + 8]; o += 9;
    let ct = gct; if (f & 0x80) { const n = 3 << ((f & 7) + 1); ct = buf.subarray(o, o + n); o += n; }
    const interlaced = f & 0x40;
    const minCode = buf[o++]; const blocks = [];
    while (buf[o]) { blocks.push(buf.subarray(o + 1, o + 1 + buf[o])); o += buf[o] + 1; } o++;
    const data = Buffer.concat(blocks);
    // LZW
    const out = new Uint8Array(fw * fh); let op = 0;
    const clear = 1 << minCode; const eoi = clear + 1;
    let size = minCode + 1; let dict = []; let prev = null; let bit = 0;
    const reset = () => { dict = []; for (let i = 0; i < clear; i++) dict[i] = [i]; dict[clear] = []; dict[eoi] = null; size = minCode + 1; prev = null; };
    reset();
    while (bit + size <= data.length * 8) {
      let code = 0; for (let i = 0; i < size; i++, bit++) code |= ((data[bit >> 3] >> (bit & 7)) & 1) << i;
      if (code === clear) { reset(); continue; }
      if (code === eoi) break;
      let entry = dict[code];
      if (entry === undefined) entry = prev.concat(prev[0]);
      for (const v of entry) if (op < out.length) out[op++] = v;
      if (prev) dict.push(prev.concat(entry[0]));
      prev = entry;
      if (dict.length === 1 << size && size < 12) size++;
    }
    const rowOf = interlaced
      ? (() => { const order = []; for (const [s, d] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = s; y < fh; y += d) order.push(y); return r => order[r]; })()
      : r => r;
    const before = gce.disposal === 3 ? canvas.slice() : null;
    for (let r = 0; r < fh; r++) for (let x = 0; x < fw; x++) {
      const v = out[r * fw + x]; if (v === gce.transparent) continue;
      const cx = fx + x; const cy = fy + rowOf(r); if (cx >= w || cy >= h) continue;
      const q = (cy * w + cx) * 4; canvas[q] = ct[v * 3]; canvas[q + 1] = ct[v * 3 + 1]; canvas[q + 2] = ct[v * 3 + 2]; canvas[q + 3] = 255;
    }
    frames.push({ px: canvas.slice(), ms: (gce.delay || 10) * 10 });
    if (gce.disposal === 2) for (let r = 0; r < fh; r++) canvas.fill(0, ((fy + r) * w + fx) * 4, ((fy + r) * w + fx + fw) * 4);
    else if (before) canvas.set(before);
    gce = { delay: 10, transparent: -1, disposal: 0 };
  }
  return { w, h, frames };
}
