/* The forest: one tree painter per scene, procedural and seeded, in art pixels. age runs from a sapling
 * (about 0.06) to old (1); the giant tree (100 check-ins) is drawn at 1.25. Old broadleaf trees get moss. */
import { NATURE, type TreeKind } from './palettes';
import { disc, dot, oval, rect, type Paint, type Rand } from './pixels';

export interface TreeLook {
  /** the light of the moment */
  T: (c: string) => string;
  night: boolean;
  snow: boolean;
  autumn: boolean;
}

type Blob = [x: number, y: number, r: number];

function oak (c: Paint, x: number, base: number, age: number, R: Rand, L: TreeLook): Blob[] {
  const { T } = L, leaf = L.autumn ? NATURE.autumn : NATURE.leaf;
  const h = Math.round(4 + age * 22), tw = age > 0.65 ? 3 : age > 0.3 ? 2 : 1, blobs: Blob[] = [];
  for (let y = 0; y < h; y++) for (let i = 0; i < tw; i++) dot(c, x + i, base - y, T(NATURE.trunk[i === 0 ? 0 : i === tw - 1 ? 2 : 1]));
  const nb = Math.round(1 + age * 4);
  for (let b = 0; b < nb; b++) {
    const sy = base - Math.round(h * (0.45 + R() * 0.45)), dir = R() < 0.5 ? -1 : 1, len = Math.round(2 + age * 6 * (0.6 + R() * 0.5));
    let bx = x + (dir > 0 ? tw - 1 : 0), by = sy;
    for (let k = 0; k < len; k++) { bx += dir; if (R() < 0.6) by -= 1; dot(c, bx, by, T(NATURE.trunk[1])); }
    blobs.push([bx, by, Math.round(2 + age * 4 + R() * 1.5)]);
  }
  blobs.push([x + (tw >> 1), base - h, Math.round(2 + age * 5)]);
  for (const [bx, by, r] of blobs) disc(c, bx, by, r + 1, T(NATURE.outline));
  for (const [bx, by, r] of blobs) disc(c, bx, by, r, T(leaf[2]));
  for (const [bx, by, r] of blobs) disc(c, bx - 1, by - 1, Math.max(1, r - 1), T(leaf[1]));
  for (const [bx, by, r] of blobs) if (r > 2) disc(c, bx - Math.ceil(r / 2), by - Math.ceil(r / 2), Math.max(1, (r >> 1) - 1), T(leaf[0]));
  if (L.snow) for (const [bx, by, r] of blobs) rect(c, bx - Math.max(1, r - 2), by - r, Math.max(1, r - 2) * 2 + 1, 1, T(NATURE.snowCap));
  if (age > 1.1) for (let i = 0; i < 3 + age * 5; i++) {
    const [bx, by, r] = blobs[(R() * blobs.length) | 0];
    dot(c, bx + Math.round((R() - 0.5) * r * 1.4), by + Math.round(R() * r * 0.8), T(NATURE.moss));
  }
  return blobs;
}

function willow (c: Paint, x: number, base: number, age: number, R: Rand, L: TreeLook) {
  const blobs = oak(c, x, base, age, R, L), leaf = L.autumn ? NATURE.autumn : NATURE.leaf;
  for (const [bx, by, r] of blobs) for (let i = -r; i <= r; i += 2) {
    const len = 2 + Math.round(R() * (3 + age * 5));
    for (let k = 0; k < len; k++) dot(c, bx + i, by + Math.round(r * 0.5) + k, L.T(k === len - 1 ? leaf[1] : leaf[2]));
  }
}

function pine (c: Paint, x: number, base: number, age: number, _R: Rand, L: TreeLook) {
  const { T } = L, h = Math.round(8 + age * 26), w = Math.round(3 + age * 8);
  rect(c, x, base - 3, 2, 4, T(NATURE.trunk[1]));
  const tiers = Math.max(2, Math.round(2 + age * 3));
  for (let t = 0; t < tiers; t++) {
    const top = base - 3 - Math.round(h * (1 - t / tiers)), bot = base - 2 - Math.round(h * (tiers - t - 1) / tiers * 0.78), tw = Math.round(w * (0.55 + 0.45 * (t + 1) / tiers));
    for (let y = top; y <= bot; y++) {
      const hw = Math.round((y - top) / Math.max(1, bot - top) * tw);
      rect(c, x - hw, y, hw * 2 + 2, 1, T(NATURE.outline));
      rect(c, x + 1 - hw, y, hw * 2, 1, T(y - top < 2 ? NATURE.leaf[1] : NATURE.leaf[3]));
      if (hw > 1) rect(c, x + 1 - hw, y, Math.max(1, hw - 1), 1, T(NATURE.leaf[2]));
      if (L.snow && y - top < 2) rect(c, x + 1 - hw, y, hw * 2, 1, T(NATURE.snowCap));
    }
  }
}

function palm (c: Paint, x: number, base: number, age: number, R: Rand, L: TreeLook) {
  const { T } = L, h = Math.round(8 + age * 20), lean = R() < 0.5 ? -1 : 1;
  let tx = x, ty = base;
  for (let y = 0; y < h; y++) {
    tx = x + Math.round(lean * (y * y) / (h * 3)); ty = base - y;
    dot(c, tx, ty, T(y % 3 ? NATURE.trunk[0] : NATURE.trunk[2])); dot(c, tx + 1, ty, T(NATURE.trunk[1]));
  }
  const fr = Math.round(4 + age * 7);
  for (const [dx, dy] of [[-1, 0], [1, 0], [-1, -0.6], [1, -0.6], [-0.6, 0.5], [0.6, 0.5]]) for (let k = 0; k < fr; k++) {
    const px = tx + Math.round(dx * k), py = ty + Math.round(dy * k + (k * k) / (fr * 1.6));
    dot(c, px, py - 1, T(NATURE.outline)); dot(c, px, py, T(NATURE.leaf[k % 3 ? 1 : 2]));
  }
  // coconuts
  if (age > 0.5) { dot(c, tx, ty + 1, T('#6B4325')); dot(c, tx + 1, ty + 1, T('#6B4325')); }
}

function bamboo (c: Paint, x: number, base: number, age: number, R: Rand, L: TreeLook) {
  const { T } = L, n = 1 + Math.round(age * 3);
  for (let k = 0; k < n; k++) {
    const sx = x + k * 3 - n, h = Math.round(10 + age * 34 + R() * 6), seg = 5 + Math.round(R() * 2);
    for (let y = 0; y < h; y++) {
      const node = y % seg === 0;
      dot(c, sx, base - y, T(node ? '#3E6B2A' : '#8CC152')); dot(c, sx + 1, base - y, T(node ? '#2E5520' : '#6AA03C'));
    }
    for (let y = seg; y < h; y += seg) if (R() < 0.7) {
      const d = R() < 0.5 ? -1 : 1;
      for (let i = 1; i <= 3 + Math.round(age * 2); i++) dot(c, sx + (d > 0 ? 1 : 0) + d * i, base - y - Math.floor(i / 2), T(L.snow && i === 1 ? NATURE.snowCap : i % 2 ? '#5FAE4E' : '#4E9A3F'));
    }
  }
}

function cypress (c: Paint, x: number, base: number, age: number, R: Rand, L: TreeLook) {
  // bald cypress: a trunk flaring into buttresses at the water line, a crown of three soft tiers, hanging moss
  const { T } = L, h = Math.round(8 + age * 18), bark = ['#5A4A3A', '#463A2E'];
  for (let y = 0; y < h; y++) {
    const flare = y < 3 ? 3 - y : 0, w = 2 + (age > 0.9 ? 1 : 0) + flare * 2;
    rect(c, x - (w >> 1), base - y, w, 1, T(y % 4 ? bark[0] : bark[1]));
  }
  if (age > 0.5) for (const d of [-4, 4]) { rect(c, x + d, base - 1, 1, 2, T(bark[1])); dot(c, x + d, base - 2, T(bark[0])); }
  const cw = Math.round(3 + age * 7), th = Math.max(2, Math.round(1 + age * 2)), top = base - h;
  const tiers = [[0, cw], [-(th + 1), Math.round(cw * 0.75)], [-(th * 2 + 2), Math.round(cw * 0.45)]];
  for (const [dy, w] of tiers) oval(c, x, top + dy, w + 1, th + 1, T('#24301F'));
  for (const [dy, w] of tiers) {
    oval(c, x, top + dy, w, th, T(L.snow ? NATURE.snowCap : '#4E6B3E'));
    rect(c, x - w + 1, top + dy - th + 1, Math.max(1, w), 1, T(L.snow ? NATURE.snowCap : '#6B8A52'));
    rect(c, x - w + 1, top + dy + th, w * 2 - 1, 1, T('#3F5A33'));
  }
  for (let i = -cw + 1; i < cw; i += 2) if (R() < 0.55) {
    const len = 2 + Math.round(R() * (3 + age * 5));
    for (let k = 1; k <= len; k++) dot(c, x + i, top + th + k, T(k === len ? '#9FB08A' : '#7E8F6B'));
  }
}

/** Fly agaric (Amanita muscaria): a white stem on a bulb with a skirt ring, a red cap with white warts.
 * Young ones are domed; old ones open out flatter. The warts glow faintly at night. */
export const AMANITA = { cap: '#D7263D', capHi: '#F25C54', capLo: '#A11D2E', wart: '#FFF8EE', stem: '#F4EEDF', stemLo: '#D9CFBC', gill: '#EADBC2', line: '#2A1F33' };
function amanita (c: Paint, x: number, base: number, age: number, R: Rand, L: TreeLook) {
  const { T } = L, A = AMANITA;
  const h = Math.round(4 + age * 10), r = Math.round(4 + age * 7), sw = Math.max(2, Math.round(1.5 + age * 2));
  const sx = x - (sw >> 1);
  // the bulb at the foot, then the stem with its shaded side
  oval(c, x, base - 1, (sw >> 1) + 2, 1, T(A.line)); oval(c, x, base - 1, (sw >> 1) + 1, 1, T(A.stem));
  rect(c, sx - 1, base - h, sw + 2, h - 1, T(A.line));
  rect(c, sx, base - h, sw, h - 1, T(A.stem)); rect(c, sx + sw - 1, base - h, 1, h - 1, T(A.stemLo));
  // the skirt ring under the cap
  const ry = base - h + Math.max(2, Math.round(h * 0.28));
  rect(c, sx - 1, ry, sw + 2, 1, T(A.stem)); rect(c, sx - 1, ry + 1, sw + 2, 1, T(A.stemLo));
  // the cap: domed while young, opening flatter with age
  const capH = Math.max(2, Math.round(r * (age > 1 ? 0.55 : 0.75))), top = base - h;
  for (let y = 0; y <= capH + 1; y++) {
    const hw = Math.round((r + 1) * Math.sqrt(Math.max(0, 1 - (y * y) / ((capH + 1.5) ** 2))));
    rect(c, x - hw - 1, top - y, hw * 2 + 3, 1, T(A.line));
  }
  for (let y = 0; y <= capH; y++) {
    const hw = Math.round(r * Math.sqrt(Math.max(0, 1 - (y * y) / ((capH + 0.5) ** 2))));
    rect(c, x - hw, top - y, hw * 2 + 1, 1, T(y === 0 ? A.capLo : A.cap));
    // light from the upper left
    if (y > capH / 2 && hw > 1) rect(c, x - hw, top - y, Math.max(1, hw >> 1), 1, T(A.capHi));
  }
  rect(c, x - r + 1, top + 1, r * 2 - 1, 1, T(A.gill));
  // warts
  const warts = 3 + Math.round(age * 5);
  for (let i = 0; i < warts; i++) {
    const yy = 1 + Math.round(R() * (capH - 1)), lim = Math.round(r * Math.sqrt(Math.max(0, 1 - (yy * yy) / ((capH + 0.5) ** 2)))) - 1;
    if (lim < 1) continue;
    const xx = x + Math.round((R() * 2 - 1) * lim);
    rect(c, xx, top - yy, age > 0.6 && R() < 0.5 ? 2 : 1, 1, L.night ? '#E6E1F2' : T(A.wart));
  }
  if (L.snow) rect(c, x - Math.max(1, r - 2), top - capH, Math.max(1, r - 2) * 2 + 1, 1, T(NATURE.snowCap));
}

/** Far-off trees along the horizon, in the scene's own kind, faded toward the sky: the forest beyond the
 * meadow. Scenery only; the account's trees grow in front of it. */
export function treeline (c: Paint, W: number, gT: number, kind: TreeKind, col: string, hi: string, R: Rand) {
  if (kind === 'pine') {
    for (let x = -3; x < W; x += 4 + ((R() * 4) | 0)) {
      const h = 7 + ((R() * 8) | 0), hw = Math.max(2, h >> 2);
      for (let y = 0; y < h; y++) { const w = Math.round((y / h) * hw); rect(c, x - w, gT - h + y, w * 2 + 1, 1, col); }
      dot(c, x, gT - h, hi);
    }
    return;
  }
  if (kind === 'cypress') {
    for (let x = 0; x < W; x += 7 + ((R() * 6) | 0)) {
      const h = 8 + ((R() * 6) | 0), w = 3 + ((R() * 3) | 0);
      rect(c, x, gT - h, 1, h, col); rect(c, x - w, gT - h - 1, w * 2 + 1, 2, col); rect(c, x - w + 1, gT - h - 2, w * 2 - 1, 1, hi);
    }
    return;
  }
  if (kind === 'shroom') {
    for (let x = 2; x < W; x += 9 + ((R() * 8) | 0)) {
      const h = 6 + ((R() * 12) | 0), r = 3 + ((R() * 4) | 0);
      rect(c, x, gT - h, 2, h, hi);
      for (let y = 0; y <= 2; y++) { const hw = Math.round(r * Math.sqrt(1 - (y * y) / 9)); rect(c, x + 1 - hw, gT - h - y, hw * 2, 1, col); }
      dot(c, x, gT - h - 1, hi);
    }
    return;
  }
  // broadleaf crowns: an uneven run of rounded tops
  let prev = 0;
  for (let x = 0; x < W; x++) {
    const t = 5 + Math.round(2.5 * Math.sin(x / 6.3) + 1.6 * Math.sin(x / 2.7 + 1) + 1.2 * Math.sin(x / 13));
    rect(c, x, gT - t, 1, t + 1, col);
    if (t > prev || x % 5 === 0) dot(c, x, gT - t, hi);
    prev = t;
  }
}

export const TREES: Record<TreeKind, (c: Paint, x: number, base: number, age: number, R: Rand, L: TreeLook) => void> = {
  oak, willow, pine, palm, bamboo, cypress, shroom: amanita,
};
