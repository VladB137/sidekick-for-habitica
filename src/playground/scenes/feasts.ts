/* Habitica's calendar in the playground: decorations for the days Habitica itself celebrates (its repeating
 * events, website/common/script/content/constants/events.js at the tag) and for the account's own anniversary.
 * Painted into the still scene like the props, so the widget's pictures and the wallpaper's scenery carry them
 * with no change on the phone's side. Which feasts are on is the app's business (stable/calendar.ts); this only
 * draws them. Our own art, on the 3 x 3 art grid with the scenes' colours; nothing of Habitica's is drawn here.
 *
 * Where things go: the yard is the open ground just left of the stable's fence (a table, a sign, a pumpkin
 * patch), the fence carries garlands and balloons, and the sky gets fireworks or bats after dark. */
import { dot, rect, stamp, type Paint } from './pixels';
import { drawText, textWidth } from '../font';

export type Feast = 'nye' | 'birthday' | 'valentines' | 'piDay' | 'namingDay' | 'habitoween' | 'harvestFeast' | 'anniversary';
export const FEASTS: readonly Feast[] = ['nye', 'birthday', 'valentines', 'piDay', 'namingDay', 'habitoween', 'harvestFeast', 'anniversary'];

/** What a feast painter knows about the picture, art pixels. */
export interface FeastPlace {
  W: number;
  /** the horizon (first ground row) and the bottom of the part between the bars */
  gT: number;
  top: number;
  /** the stable's left edge (its fence starts 8 further left, on row gT + 3) */
  x0: number;
  /** the scene has a fence (the mushroom glade has a ring of toadstools) */
  fence: boolean;
  T: (c: string) => string;
  night: boolean;
  dusk: boolean;
  snow: boolean;
  /** years in Habitica, for the anniversary */
  years?: number;
}

const GLOW = '#FFD86B';
/** a colour that keeps its own light at night (candles, a lantern's face), else toned like the rest */
const lit = (p: FeastPlace, col: string) => (p.night ? col : p.T(col));

/* ---- shared pieces */

/** a little table with a cloth, centred on x, its feet on y; returns the row its top is on */
function table (c: Paint, p: FeastPlace, x: number, y: number, w: number, cloth: string, hem: string): number {
  const l = x - Math.floor(w / 2), t = y - 5;
  for (const lx of [l + 1, l + w - 2]) rect(c, lx, t + 2, 1, 4, p.T('#6B4325'));
  rect(c, l, t, w, 2, p.T(cloth));
  for (let i = 0; i < w; i += 2) dot(c, l + i, t + 2, p.T(hem));
  return t;
}

/** Flags on a string along the fence's top rail, sagging between posts; colours in turn. */
function bunting (c: Paint, p: FeastPlace, colours: string[]) {
  const y0 = p.gT + 3 - 7, x1 = p.x0 - 8, x2 = p.W;
  let k = 0;
  for (let px = x1; px < x2; px += 10) {
    for (let i = 0; i <= 10 && px + i < x2; i++) {
      const sag = Math.round(2 * Math.sin((i / 10) * Math.PI));
      dot(c, px + i, y0 + sag, p.T('#F4F1E6'));
      if (i % 3 === 1 && i < 10) {
        const col = p.T(colours[k++ % colours.length]);
        rect(c, px + i - 1, y0 + sag + 1, 3, 1, col); dot(c, px + i, y0 + sag + 2, col);
      }
    }
  }
}

/** a balloon on a string tied at (x, y), its body h pixels up */
function balloon (c: Paint, p: FeastPlace, x: number, y: number, h: number, col: string, heart = false) {
  for (let i = 1; i <= h; i++) dot(c, x + (i % 4 === 0 ? 1 : 0), y - i, p.T('#E8E4DA'));
  const by = y - h - 1;
  const rows = heart ? ['.c.c.', 'ccccc', 'cCccc', '.ccc.', '..c..'] : ['.ccc.', 'cCccc', 'ccccc', '.ccc.', '..c..'];
  stamp(c, rows, x - 2, by - 4, { c: p.T(col), C: p.T('#FFFFFF') });
}

/** a two-tier cake; candles on top (up to 9), lit */
function cake (c: Paint, p: FeastPlace, x: number, y: number, icing: string, sponge: string, candles: number) {
  const n = Math.max(1, Math.min(9, candles)), T = p.T;
  // the plate, the bottom tier, the top tier, icing drips
  rect(c, x - 6, y, 13, 1, T('#E8E4DA'));
  rect(c, x - 5, y - 4, 11, 4, T(sponge)); rect(c, x - 5, y - 5, 11, 1, T(icing));
  for (let i = -5; i <= 5; i += 2) dot(c, x + i, y - 4, T(icing));
  rect(c, x - 3, y - 8, 7, 3, T(sponge)); rect(c, x - 3, y - 9, 7, 1, T(icing));
  for (let i = -3; i <= 3; i += 2) dot(c, x + i, y - 8, T(icing));
  // candles across the top tier, spread as evenly as 7 columns allow
  for (let k = 0; k < n; k++) {
    const cx = n === 1 ? x : x - 3 + Math.round((k * 6) / (n - 1));
    dot(c, cx, y - 10, T('#F4F1FF')); dot(c, cx, y - 11, T('#F4F1FF'));
    dot(c, cx, y - 12, lit(p, GLOW));
  }
}

/** a round pie with a lattice top, in its tin; a π pressed in the crust on Pi Day */
function pie (c: Paint, p: FeastPlace, x: number, y: number, pi: boolean) {
  stamp(c, pi ? [
    '...ccccc...',
    '.ccCCCCCcc.',
    'cCCdddddCCc',
    'cCCCdCdCCCc',
    'rrrrrrrrrrr',
    '.ttttttttt.',
  ] : [
    '...ccccc...',
    '.cCcCcCcCc.',
    'cCcCcCcCcCc',
    'cfcfcfcfcfc',
    'rrrrrrrrrrr',
    '.ttttttttt.',
  ], x - 5, y - 5, { c: p.T('#D99A4E'), C: p.T('#F2C27A'), d: p.T('#8A4B16'), f: p.T('#8E2F3C'), r: p.T('#B8742E'), t: p.T('#9AA4A8') });
  // steam by day
  if (!p.night) for (const [dx, dy] of [[-2, 7], [-1, 8], [-2, 9], [2, 8], [3, 9], [2, 10]]) dot(c, x + dx, y - dy, p.T('#F4F8FA'));
}

function pumpkin (c: Paint, p: FeastPlace, x: number, y: number, face: boolean, small = false) {
  const T = p.T, o = T('#E8822B'), O = T('#C4621B');
  if (small) {
    stamp(c, ['..s..', '.ooo.', 'oOoOo', '.ooo.'], x - 2, y - 3, { s: T('#4F7A2A'), o, O });
    return;
  }
  stamp(c, ['...ss..', '.ooooo.', 'oOoooOo', 'ooOoOoo', 'oOoooOo', '.ooooo.'], x - 3, y - 5, { s: T('#4F7A2A'), o, O });
  if (!face) return;
  // the carved face: dark by day, candle-lit at night
  const f = p.night || p.dusk ? GLOW : T('#4A2410');
  dot(c, x - 2, y - 3, f); dot(c, x + 2, y - 3, f);
  rect(c, x - 2, y - 1, 5, 1, f); dot(c, x - 1, y - 2, f); dot(c, x + 1, y - 2, f);
}

/** confetti scattered on the ground in front of the fence, the same every time */
function confetti (c: Paint, p: FeastPlace, colours: string[], n: number) {
  for (let i = 0; i < n; i++) {
    const x = p.x0 - 34 + ((i * 37) % 44), y = p.gT + 6 + ((i * 13) % 7);
    dot(c, x, y, p.T(colours[i % colours.length]));
  }
}

/** a firework burst: 16 rays of dots falling away from the centre, the tips brightest, and a ring inside */
function burst (c: Paint, x: number, y: number, r: number, col: string, tip: string) {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (let s = 3; s <= r; s++) {
      if ((s + k) % 2) continue;
      // the far ends droop a little, as sparks fall
      const droop = Math.round(((s / r) ** 2) * 2);
      dot(c, x + Math.round(Math.cos(a) * s), y + Math.round(Math.sin(a) * s * 0.9) + droop, s >= r - 1 ? tip : col);
    }
  }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2; dot(c, x + Math.round(Math.cos(a) * 2), y + Math.round(Math.sin(a) * 2), tip); }
  dot(c, x, y, tip);
}

const BAT = ['b.....b', 'bb.b.bb', '.bbbbb.', '...b...'];

/** feasts that put something in the yard (a scene's own prop standing there makes room for it) */
const YARD: readonly Feast[] = ['birthday', 'anniversary', 'valentines', 'piDay', 'harvestFeast', 'habitoween', 'namingDay'];
/** The yard's middle, art pixels, for a stable whose left edge is x0; whether a feast uses it today. */
export const yardOf = (x0: number, gT: number) => ({ x: x0 - 22, y: gT + 6 });
export const usesYard = (feasts: readonly Feast[]) => feasts.some(f => YARD.includes(f));

/* ---- the feasts */

/** The sky's part (after the stars and the moon, before the hills): fireworks and bats after dark. */
export function paintFeastSky (c: Paint, feasts: readonly Feast[], p: FeastPlace) {
  const dark = p.night || p.dusk, sy = (t: number) => p.top + Math.round((p.gT - p.top) * t);
  if (feasts.includes('nye') && dark) {
    burst(c, Math.round(p.W * 0.26), sy(0.18), 11, '#FF6F91', '#FFF1F5');
    burst(c, Math.round(p.W * 0.56), sy(0.36), 9, '#FFC400', '#FFF6C8');
    burst(c, Math.round(p.W * 0.52), sy(0.1), 7, '#4FC3F7', '#E8F8FF');
    // a rocket on its way up
    for (let i = 0; i < 5; i++) dot(c, Math.round(p.W * 0.38), sy(0.48) + i * 2, i === 0 ? '#FFF6C8' : '#E8B23A');
  }
  if (feasts.includes('habitoween') && dark) {
    for (const [fx, fy] of [[0.7, 0.3], [0.86, 0.36], [0.6, 0.22]] as const) stamp(c, BAT, Math.round(p.W * fx), sy(fy), { b: '#1A1426' });
  }
}

/** The ground's part (after the stable and the forest): what stands in the yard and hangs on the fence. */
export function paintFeastGround (c: Paint, feasts: readonly Feast[], p: FeastPlace) {
  const { x: yx, y: yy } = yardOf(p.x0, p.gT), fenceY = p.gT + 3 - 5;
  for (const f of feasts) {
    if (f === 'birthday') {
      bunting(c, p, ['#FF6F91', '#FFC400', '#26A69A', '#4FC3F7']);
      const t = table(c, p, yx, yy, 15, '#F4F1FF', '#FF6F91');
      cake(c, p, yx, t - 1, '#FF8FB5', '#F2D7A6', 3);
      balloon(c, p, p.x0 - 6, fenceY, 12, '#FF6F91'); balloon(c, p, p.x0 - 1, fenceY, 15, '#FFC400'); balloon(c, p, p.x0 + 4, fenceY, 11, '#26A69A');
    } else if (f === 'anniversary') {
      bunting(c, p, ['#009688', '#FFC400', '#00796B']);
      const t = table(c, p, yx, yy, 15, '#E0F2F1', '#009688');
      cake(c, p, yx, t - 1, '#F4F1FF', '#C98B5A', p.years ?? 1);
      // a sign by the table with the years
      const label = `${Math.max(1, p.years ?? 1)} YR${(p.years ?? 1) === 1 ? '' : 'S'}`, w = textWidth(label) + 4, sx = yx - 12 - w, sy = yy - 13;
      for (const lx of [sx + 1, sx + w - 2]) rect(c, lx, sy + 8, 1, 6, p.T('#6B4325'));
      rect(c, sx, sy, w, 9, p.T('#00796B')); rect(c, sx, sy, w, 1, p.T('#009688'));
      drawText(c as never, label, sx + 2, sy - 1, p.T('#FFE08A'), 1);
    } else if (f === 'nye') {
      bunting(c, p, ['#FFC400', '#C9D3DC', '#FFC400', '#26A69A']);
      if (!(p.night || p.dusk)) confetti(c, p, ['#FF6F91', '#FFC400', '#4FC3F7', '#F4F1FF'], 18);
      // spent rockets stuck in the ground (snow or not)
      for (const dx of [-30, -26]) { rect(c, p.x0 + dx, yy - 6, 1, 6, p.T('#8A5A33')); rect(c, p.x0 + dx - 1, yy - 9, 3, 3, p.T(dx === -30 ? '#E53950' : '#26A69A')); }
    } else if (f === 'valentines') {
      // hearts along the fence's rail and three heart balloons tied to it
      for (let x = p.x0 - 6; x < p.W - 2; x += 6) stamp(c, ['r.r', 'rrr', '.r.'], x, fenceY - 1, { r: p.T(x % 12 < 6 ? '#E53950' : '#FF8FB5') });
      balloon(c, p, p.x0 - 8, fenceY, 13, '#E53950', true); balloon(c, p, p.x0 - 3, fenceY, 16, '#FF8FB5', true); balloon(c, p, p.x0 + 2, fenceY, 12, '#F4F1FF', true);
      // a rose bush by the yard
      stamp(c, ['.gRg.', 'gRgRg', 'ggRgg', '.ggg.'], yx - 2, yy - 3, { g: p.T('#3F8F4A'), R: p.T('#E53950') });
    } else if (f === 'piDay') {
      const t = table(c, p, yx, yy, 13, '#F4E6C8', '#B8742E');
      pie(c, p, yx, t - 1, true);
    } else if (f === 'harvestFeast') {
      const t = table(c, p, yx, yy, 13, '#F4E6C8', '#B5651D');
      pie(c, p, yx, t - 1, false);
      // corn stooks and a heap of pumpkins and gourds
      for (const sx of [yx - 14, yx + 12]) stamp(c, ['...y...', '..yYy..', '.yyYyy.', '.yYyYy.', '.yybyy.', 'yyYyYyy', 'yYyyyYy', 'YyyYyyY'], sx - 3, yy - 7, { y: p.T('#E3C565'), Y: p.T('#B8962E'), b: p.T('#8A5A2E') });
      pumpkin(c, p, yx - 6, yy + 4, false); pumpkin(c, p, yx + 1, yy + 5, false, true); pumpkin(c, p, yx + 6, yy + 4, false, true);
    } else if (f === 'habitoween') {
      pumpkin(c, p, yx - 6, yy, true); pumpkin(c, p, yx + 3, yy + 2, true); pumpkin(c, p, yx + 10, yy, false, true);
      // jack-o'-lanterns on two fence posts, and a bowl of candy
      if (p.fence) for (const fx of [p.x0 - 8, p.x0 + 2]) pumpkin(c, p, fx, fenceY - 2, true, false);
      stamp(c, ['.rgyb.', 'bbbbbb', '.bbbb.'], yx - 17, yy - 2, { r: p.T('#E53950'), g: p.T('#7DD87D'), y: p.T('#FFC400'), b: p.T('#5B4A6B') });
    } else if (f === 'namingDay') {
      // name tags show all day (the app's layer); here: a little cake and pennants
      bunting(c, p, ['#26A69A', '#F4F1FF', '#FFC400']);
      const t = table(c, p, yx, yy, 13, '#F4F1FF', '#26A69A');
      cake(c, p, yx, t - 1, '#FFE08A', '#F2D7A6', 1);
    }
  }
}
