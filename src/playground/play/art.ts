/* The pictures of the toys and the hiding spots, drawn on the scenes' 3x grid in art pixels (rows of characters
 * or small painters, like the scenes' props) and toned like the scene around them (night, dusk, morning haze).
 * Each is painted once per light at art size, then shown 3 times bigger without smoothing. */
import { ART, disc, dither, dot, oval, rect, stamp, type Paint } from '../scenes/pixels';
import { surface, type Surface } from '../scenes/layer';
import type { SceneId } from '../scenes/palettes';
import type { Ctx } from '../world';

export type Tone = (c: string) => string;
type Painter = (c: Paint, t: Tone) => void;
export interface Picture { w: number, h: number, paint: Painter }

const rows = (r: readonly string[], col: Record<string, string>): Picture => ({
  w: r[0].length, h: r.length,
  paint: (c, t) => { const k: Record<string, string> = {}; for (const n in col) k[n] = t(col[n]); stamp(c, r, 0, 0, k); },
});

/* ---- the toy box's toys */
export const FRISBEE = rows(['...ppppp...', '.pPPPPPPPp.', 'pwwwwwwwwwp', '.ppppppppp.'], { p: '#E53935', P: '#EF9A9A', w: '#FFFFFF' });
export const STICK = rows(['..........t.', 'sSsssssssSst', '.ssssSsssss.'], { s: '#8A5A33', S: '#6B4325', t: '#4E8F35' });
export const KITE = rows([
  '.....y.....', '....yYy....', '...yyYyy...', '..yyyYyyy..', '.yyyyYyyyy.', 'kkkkkKkkkkk',
  '.tttttTttt.', '..tttTttt..', '...ttTtt...', '....tTt....', '.....t.....',
], { y: '#FFC400', Y: '#7B5A3A', k: '#00796B', K: '#7B5A3A', t: '#009688', T: '#7B5A3A' });
export const BALL = rows(['..ooo..', '.orrwo.', 'orrrwwo', 'orrwwbo', 'oyywwbo', '.oyybo.', '..ooo..'], { o: '#3A2A2A', r: '#EF5350', w: '#FFFFFF', b: '#42A5F5', y: '#FFCA28' });

/* ---- each playground's own toy */
export const HAY_PILE: Picture = { w: 22, h: 10, paint: (c, t) => {
  oval(c, 11, 7, 10, 4, t('#C9A63F')); oval(c, 10, 5, 8, 4, t('#E3C565')); oval(c, 9, 4, 5, 2, t('#F0D98A'));
  for (const [x, y] of [[4, 6], [8, 3], [13, 4], [16, 6], [11, 7], [6, 8], [18, 8]]) dot(c, x, y, t('#9C7E2E'));
  for (const [x, y] of [[2, 4], [19, 3], [12, 1]]) { dot(c, x, y, t('#E3C565')); dot(c, x + 1, y - 1, t('#E3C565')); }
  rect(c, 2, 9, 18, 1, t('#9C7E2E'));
} };
export const STONES: Picture = { w: 14, h: 5, paint: (c, t) => {
  for (const [x, y, w] of [[0, 3, 5], [5, 3, 4], [9, 3, 5], [2, 1, 4], [7, 1, 5], [5, 0, 3]] as const) {
    rect(c, x, y, w, 1, t('#B0BEC5')); rect(c, x, y + 1, w, 1, t('#78909C'));
  }
} };
export const STONE = rows(['.ss.', 'sSSs'], { s: '#90A4AE', S: '#CFD8DC' });
const CONE_ROWS = ['.cc.', 'cCcc', 'cccC', '.cc.'], CONE_COL = { c: '#8D5A2B', C: '#C68A4E' };
export const CONE = rows(CONE_ROWS, CONE_COL);
export const CONE_PILE: Picture = { w: 12, h: 6, paint: (c, t) => {
  const k: Record<string, string> = {}; for (const n in CONE_COL) k[n] = t(CONE_COL[n as keyof typeof CONE_COL]);
  for (const [x, y] of [[0, 2], [4, 2], [8, 2], [2, 0], [6, 0]] as const) stamp(c, CONE_ROWS, x, y, k);
} };
export const TOP: Picture[] = [
  rows(['...h...', '.rrrrr.', 'rwwrrrr', '.rrrrr.', '...g...'], { h: '#5B4632', r: '#C0392B', w: '#F2D7A6', g: '#5B4632' }),
  rows(['...h...', '.rrrrr.', 'rrrrwwr', '.rrrrr.', '...g...'], { h: '#5B4632', r: '#C0392B', w: '#F2D7A6', g: '#5B4632' }),
];
/** the top tipped over */
export const TOP_DOWN = rows(['..rrr..', '.rrwrr.', 'hrrrrrg', '.rrrrr.'], { h: '#5B4632', r: '#C0392B', w: '#F2D7A6', g: '#5B4632' });
export const BUBBLE_POT = rows(['...w....', '..w.w...', '...w....', '...l....', '.oooooo.', 'oOOOOOOo', 'oooooooo', '.oooooo.'], { w: '#B3E5FC', l: '#8A5A33', o: '#7A6B42', O: '#9C8A5A' });
export const BUBBLE = rows(['.bbb.', 'bw..b', 'b...b', 'b...b', '.bbb.'], { b: '#B3E5FC', w: '#FFFFFF' });
/** the bouncy cap, at rest and squashed */
export const CAP: Picture[] = [0, 1].map(sq => ({ w: 22, h: 12, paint: (c: Paint, t: Tone) => {
  const top = sq ? 2 : 0;
  rect(c, 8, 6 + top / 2, 6, 6 - top / 2, t('#F2E6D0')); rect(c, 8, 11, 6, 1, t('#D8C8AC'));
  oval(c, 11, 4 + top, 10, 4 - sq, t('#7B1FA2')); oval(c, 11, 3 + top, 8, 2, t('#AB47BC'));
  for (const [x, y] of [[5, 4], [11, 2], [16, 4], [8, 5], [14, 6]]) dot(c, x, y + top, t('#F3E5F5'));
} }));
/** the sandcastle's steps: a mound, a tower, a castle with its flag */
export const SANDCASTLE: Picture[] = [0, 1, 2].map(stage => ({ w: 24, h: 20, paint: (c: Paint, t: Tone) => {
  const S = t('#E6C98A'), D = t('#C9A86A'), K = t('#A88850');
  if (stage === 0) { oval(c, 12, 17, 9, 3, D); oval(c, 11, 16, 7, 2, S); oval(c, 10, 15, 4, 1, t('#F0D9A6')); return; }
  rect(c, 3, 10, 18, 9, S); rect(c, 3, 17, 18, 2, D);
  for (let i = 3; i < 21; i += 3) rect(c, i, 9, 2, 1, S);
  rect(c, 10, 14, 4, 5, K); rect(c, 11, 13, 2, 1, K);
  if (stage === 2) {
    rect(c, 1, 5, 5, 14, S); rect(c, 18, 5, 5, 14, S); rect(c, 1, 17, 5, 2, D); rect(c, 18, 17, 5, 2, D);
    for (const x of [1, 3, 5, 18, 20, 22]) rect(c, x, 4, 1, 1, S);
    rect(c, 3, 8, 1, 2, K); rect(c, 20, 8, 1, 2, K);
    rect(c, 20, 0, 1, 4, t('#5B4632')); rect(c, 21, 0, 3, 2, t('#E53935'));
  } else { rect(c, 9, 5, 6, 5, S); rect(c, 9, 4, 1, 1, S); rect(c, 11, 4, 2, 1, S); rect(c, 14, 4, 1, 1, S); }
  for (let i = 1; i < 24; i += 2) dot(c, i, 19, D);
} }));

/* ---- the hiding spots: one per scene, 32 x 18, solid from `solid` rows down */
export const SPOT_W = 32, SPOT_H = 18;
export const SPOTS: Record<SceneId, { name: string, solid: number, pic: Picture }> = {
  meadow: { name: 'the bush', solid: 4, pic: { w: SPOT_W, h: SPOT_H, paint: (c, t) => {
    for (const [x, y, r] of [[8, 11, 6], [16, 8, 8], [24, 11, 6], [12, 13, 5], [21, 13, 5]]) disc(c, x, y, r, t('#4E8F35'));
    for (const [x, y, r] of [[7, 9, 3], [15, 5, 4], [23, 9, 3]]) disc(c, x, y, r, t('#6FAE47'));
    dither(c, 3, 14, 26, 3, t('#3A7228'), 2); rect(c, 4, 17, 24, 1, t('#2F5E22'));
    for (const [x, y] of [[10, 10], [19, 7], [25, 13], [14, 14], [6, 13]]) { dot(c, x, y, t('#D8344A')); dot(c, x + 1, y - 1, t('#FF8A9A')); }
  } } },
  lake: { name: 'the reeds', solid: 6, pic: { w: SPOT_W, h: SPOT_H, paint: (c, t) => {
    for (let i = 0; i < 28; i++) { const h = 9 + ((i * 7) % 9); rect(c, 2 + i, 18 - h, 1, h, t(i % 3 ? '#4F8E3F' : '#3C7531')); }
    for (const i of [4, 11, 17, 24]) { const h = 9 + ((i * 7) % 9); rect(c, 2 + i, 18 - h - 3, 1, 3, t('#8C6B3E')); }
    dither(c, 1, 14, 30, 4, t('#2F6A2A'), 2);
  } } },
  pine: { name: 'the boulders', solid: 5, pic: { w: SPOT_W, h: SPOT_H, paint: (c, t) => {
    oval(c, 11, 11, 10, 7, t('#7A8488')); oval(c, 9, 9, 6, 4, t('#9AA4A8')); oval(c, 24, 13, 7, 5, t('#6E777B')); oval(c, 23, 11, 4, 2, t('#8C969A'));
    for (let i = 0; i < 6; i++) { rect(c, 18 + i, 16 - i, 1, 1, t('#3E7A3A')); rect(c, 18 - i, 16 - i, 1, 1, t('#3E7A3A')); }
    rect(c, 1, 17, 30, 1, t('#4E5658'));
  } } },
  cove: { name: 'the dune grass', solid: 7, pic: { w: SPOT_W, h: SPOT_H, paint: (c, t) => {
    oval(c, 16, 15, 15, 5, t('#E8D19A')); oval(c, 14, 14, 9, 3, t('#F2E0B0'));
    for (let i = 0; i < 26; i++) { const h = 6 + ((i * 5) % 8); rect(c, 3 + i, 13 - h, 1, h, t(i % 2 ? '#8FA85A' : '#6E8A44')); }
    dither(c, 2, 17, 28, 1, t('#C9B07A'), 3);
  } } },
  bamboo: { name: 'the bamboo', solid: 4, pic: { w: SPOT_W, h: SPOT_H, paint: (c, t) => {
    for (let i = 0; i < 9; i++) { const x = 2 + i * 3 + (i % 2), h = 14 + (i % 3) * 2; rect(c, x, 18 - h, 2, h, t(i % 2 ? '#5FA04A' : '#4C8A3B')); for (let k = 18 - h + 3; k < 18; k += 4) rect(c, x, k, 2, 1, t('#2F6A2A')); }
    for (const [x, y] of [[4, 4], [12, 2], [20, 5], [27, 3], [8, 7], [24, 8]]) { rect(c, x, y, 4, 1, t('#6FB85A')); rect(c, x + 1, y + 1, 3, 1, t('#4C8A3B')); }
  } } },
  marsh: { name: 'the tussock', solid: 7, pic: { w: SPOT_W, h: SPOT_H, paint: (c, t) => {
    oval(c, 16, 15, 14, 4, t('#5E6B32'));
    for (let i = 0; i < 28; i++) { const h = 7 + ((i * 11) % 7); rect(c, 2 + i, 15 - h, 1, h, t(i % 2 ? '#7A8A42' : '#66763A')); }
    for (const [x, h] of [[7, 16], [15, 17], [23, 15]]) { rect(c, x, 18 - h, 1, h, t('#6B7A3A')); rect(c, x, 18 - h - 3, 1, 4, t('#8A5A2E')); }
  } } },
  mushroom: { name: 'the mossy log', solid: 6, pic: { w: SPOT_W, h: SPOT_H, paint: (c, t) => {
    rect(c, 2, 9, 28, 8, t('#5B4632')); rect(c, 2, 9, 28, 2, t('#7DA34A')); dither(c, 2, 11, 28, 2, t('#6B9440'), 2); oval(c, 29, 13, 2, 4, t('#A08060'));
    for (const [x, w, cap] of [[6, 7, '#D7263D'], [15, 9, '#C2185B'], [24, 6, '#D7263D']] as const) {
      rect(c, x + Math.floor(w / 2) - 1, 2, 2, 7, t('#F2E6D0')); oval(c, x + Math.floor(w / 2), 2, Math.ceil(w / 2), 2, t(cap));
      dot(c, x + 1, 1, t('#FFF8EE')); dot(c, x + w - 2, 2, t('#FFF8EE'));
    }
  } } },
};

/* ---- painting */
const cache = new WeakMap<Picture, Map<string, { img: Surface, mask: Uint8Array | null }>>();

/** The picture in this light, 3 x its art size, and which world pixels of it are painted. */
export function look (p: Picture, tone: Tone, light: string) {
  let m = cache.get(p);
  if (!m) { m = new Map(); cache.set(p, m); }
  let hit = m.get(light);
  if (!hit) {
    const small = surface(p.w, p.h);
    const sg = small.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    p.paint(sg as unknown as Paint, tone);
    let mask: Uint8Array | null = null;
    try {
      const d = sg.getImageData(0, 0, p.w, p.h).data;
      mask = new Uint8Array(p.w * p.h);
      for (let i = 0; i < mask.length; i++) mask[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    } catch { mask = null; }
    const img = surface(p.w * ART, p.h * ART);
    const g = img.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    g.imageSmoothingEnabled = false;
    g.drawImage(small, 0, 0, img.width, img.height);
    hit = { img, mask };
    m.set(light, hit);
  }
  return hit;
}

/** Draw it with its top-left at world (x, y), snapped to the art grid. */
export function draw (g: Ctx, p: Picture, tone: Tone, light: string, x: number, y: number) {
  const { img } = look(p, tone, light);
  g.drawImage(img, 0, 0, img.width, img.height, Math.round(x / ART) * ART, Math.round(y / ART) * ART, img.width, img.height);
}

/** Is world (x, y) on a painted pixel of it, drawn with its top-left at (x0, y0)? */
export function on (p: Picture, tone: Tone, light: string, x0: number, y0: number, x: number, y: number, slack = 0) {
  const ax = Math.floor((x - Math.round(x0 / ART) * ART) / ART), ay = Math.floor((y - Math.round(y0 / ART) * ART) / ART);
  if (ax < -slack || ay < -slack || ax >= p.w + slack || ay >= p.h + slack) return false;
  if (slack) return true;
  const { mask } = look(p, tone, light);
  return !mask || !!mask[ay * p.w + ax];
}
