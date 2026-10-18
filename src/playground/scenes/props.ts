/* Hand-authored props, a few per scene, painted into the still scene. Each is a small picture in art pixels
 * ('.' empty) or a short painter, placed at a fixed spot: x is a fraction of the open ground (left of the
 * stable), y a fraction of the ground band (or, when negative, art pixels above the horizon). */
import { dot, rect, stamp, type Paint } from './pixels';
import type { SceneId } from './palettes';

export interface PropLook { T: (c: string) => string, night: boolean, snow: boolean }
export interface Prop { id: string, x: number, y: number, paint (c: Paint, x: number, y: number, l: PropLook): void }

/** a stamped picture whose bottom row sits on (x, y), centred on x */
export const pic = (rows: readonly string[], colours: Record<string, string>, opts: { glow?: string, mirror?: boolean, snowRow?: number } = {}) =>
  (c: Paint, x: number, y: number, l: PropLook) => {
    const tone: Record<string, string> = {};
    // glowing parts keep their own colour at night
    for (const k in colours) tone[k] = l.night && opts.glow?.includes(k) ? colours[k] : l.T(colours[k]);
    const x0 = x - Math.floor(rows[0].length / 2), y0 = y - rows.length + 1;
    stamp(c, rows, x0, y0, tone, opts.mirror);
    if (l.snow && opts.snowRow !== undefined) {
      const row = rows[opts.snowRow];
      for (let i = 0; i < row.length; i++) if (row[i] !== '.') dot(c, x0 + i, y0 + opts.snowRow - 1, l.T('#F2F6FA'));
    }
  };

const HAY = pic([
  '.hhhhhh.',
  'hHhhhhHh',
  'hhhhhhhh',
  'hHhhhhHh',
  '.dddddd.',
], { h: '#E3C565', H: '#C9A63F', d: '#9C7E2E' }, { snowRow: 0 });

const CART = pic([
  'w........',
  '.wbbbbbbb',
  '..bBBBBBb',
  '..bbbbbbb',
  '...o...o.',
  '..ooo.ooo',
  '...o...o.',
], { w: '#7B5A3A', b: '#7B5A3A', B: '#A1774F', o: '#4E3A26' }, { snowRow: 1 });

const ROWBOAT = pic([
  'b.........b',
  'bBBBBBBBBBb',
  '.bbbbbbbbb.',
], { b: '#6B4F33', B: '#A1774F' });

const REEDS = (c: Paint, x: number, y: number, l: PropLook) => {
  for (const [dx, h] of [[0, 5], [2, 7], [3, 4], [5, 6]] as const) {
    rect(c, x + dx, y - h, 1, h + 1, l.T('#4F8E3F'));
    rect(c, x + dx, y - h - 1, 1, 2, l.T('#8C6B3E'));
  }
};

const STUMP = pic([
  '.ttttt.',
  'tRRrRRt',
  'tTTTTTt',
  'TTTTTTT',
], { t: '#C9A26B', R: '#E0C08A', r: '#B08A55', T: '#6B4325' }, { snowRow: 0 });

const LOGS = pic([
  '..LLLLLLLO',
  '.LllllllLO',
  'LLLLLLLLO.',
  'LllllllLO.',
], { L: '#6B4325', l: '#8A5A33', O: '#C9A26B' }, { snowRow: 0 });

const STARFISH = pic([
  '..s..',
  'sssss',
  '.sSs.',
  's...s',
], { s: '#F28C5A', S: '#FFB38A' });

const SHELLS = (c: Paint, x: number, y: number, l: PropLook) => {
  for (const [dx, dy, col] of [[0, 0, '#FFF1E6'], [5, 2, '#F8D7C4'], [9, -1, '#FFFFFF'], [14, 1, '#F8D7C4']] as const) {
    rect(c, x + dx, y + dy, 2, 1, l.T(col)); dot(c, x + dx, y + dy - 1, l.T(col));
  }
};

const LANTERN = (c: Paint, x: number, y: number, l: PropLook) => {
  const T = l.T;
  rect(c, x, y - 8, 4, 8, T('#9AA4A8')); rect(c, x - 1, y - 10, 6, 2, T(l.snow ? '#F2F6FA' : '#7A8488'));
  rect(c, x + 1, y - 6, 2, 2, l.night ? '#FFD86B' : T('#E8E0C0')); rect(c, x - 1, y - 1, 6, 1, T('#5B6468'));
};

const ROCKS = (c: Paint, x: number, y: number, l: PropLook) => {
  for (const [dx, dy, w] of [[0, 0, 5], [6, 1, 3], [-4, 2, 3]] as const) {
    rect(c, x + dx, y + dy - 1, w, 1, l.T(l.snow ? '#F2F6FA' : '#9AA4A8')); rect(c, x + dx - 1, y + dy, w + 2, 1, l.T('#6E777B'));
  }
};

const LOG = pic([
  '.LLLLLLLLL.',
  'LllmllllllO',
  '.LLLLLLmLL.',
], { L: '#4E3A26', l: '#6B5440', m: '#7DA34A', O: '#A08060' }, { snowRow: 0 });

const CATTAILS = (c: Paint, x: number, y: number, l: PropLook) => {
  for (const [dx, h] of [[0, 7], [2, 9], [4, 6]] as const) {
    rect(c, x + dx, y - h, 1, h + 1, l.T('#6B7A3A'));
    rect(c, x + dx, y - h - 2, 1, 3, l.T('#8A5A2E'));
  }
};

const CRYSTALS = pic([
  '...c....',
  '..cCc.c.',
  '..cCcCcc',
  'c.cCcCcC',
  'cCcCcCcC',
], { c: '#7CF5E8', C: '#2EC4B6' }, { glow: 'cC' });

const FAIRY_RING = (c: Paint, x: number, y: number, l: PropLook) => {
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, px = x + Math.round(Math.cos(a) * 9), py = y + Math.round(Math.sin(a) * 3);
    dot(c, px, py, l.T('#E8DCC4'));
    rect(c, px - 1, py - 1, 3, 1, l.night ? '#FFE66D' : l.T('#FFB627'));
  }
};

export const PROPS: Record<SceneId, Prop[]> = {
  meadow: [{ id: 'hay', x: 0.62, y: 0.3, paint: HAY }, { id: 'cart', x: 0.82, y: 0.12, paint: CART }],
  lake: [{ id: 'rowboat', x: 0.9, y: -3, paint: ROWBOAT }, { id: 'reeds', x: 0.05, y: 0.08, paint: REEDS }, { id: 'reeds2', x: 0.7, y: 0.95, paint: REEDS }],
  pine: [{ id: 'stump', x: 0.7, y: 0.3, paint: STUMP }, { id: 'logs', x: 0.88, y: 0.1, paint: LOGS }, { id: 'rocks', x: 0.45, y: 0.95, paint: ROCKS }],
  cove: [{ id: 'starfish', x: 0.55, y: 0.6, paint: STARFISH }, { id: 'shells', x: 0.08, y: 0.4, paint: SHELLS }, { id: 'rowboat', x: 0.8, y: 0.18, paint: ROWBOAT }],
  bamboo: [{ id: 'lantern', x: 0.66, y: 0.15, paint: LANTERN }, { id: 'rocks', x: 0.9, y: 0.9, paint: ROCKS }],
  marsh: [{ id: 'log', x: 0.6, y: 0.4, paint: LOG }, { id: 'cattails', x: 0.85, y: 0.15, paint: CATTAILS }, { id: 'cattails2', x: 0.12, y: 0.95, paint: CATTAILS }],
  mushroom: [{ id: 'crystals', x: 0.85, y: 0.2, paint: CRYSTALS }, { id: 'ring', x: 0.6, y: 0.85, paint: FAIRY_RING }],
};
