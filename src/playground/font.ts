/* A pixel font for words in the scene (a creature's name), drawn as art pixels like the hearts and the Zzz:
 * the same on every WebView (canvas text is antialiased and hinted differently by each Chromium and phone, and a
 * web font has to load before a canvas may use it), and simple to draw anywhere that can fill rectangles.
 *
 * A cell is 8 art pixels tall: rows 0-1 accents, 2-6 capitals and ascenders (lower case 3-6), 7 the descender
 * and the marks below (ș, ț, ç). Accented letters are built from their base letter and Unicode's combining
 * marks (NFD), so ă, â, î, ș, ț and the rest of Latin-1 and Latin Extended-A come out of one small table. */
import { ART } from './particles';

export const FONT_ROWS = 8;

/** a glyph: its top row, then its rows of '#' (painted) and '.' (not), all the same width */
type Glyph = [number, ...string[]];

const G: Record<string, Glyph> = {
  a: [3, '##.', '.##', '#.#', '.##'], b: [2, '#..', '#..', '##.', '#.#', '##.'], c: [3, '.##', '#..', '#..', '.##'],
  d: [2, '..#', '..#', '.##', '#.#', '.##'], e: [3, '.#.', '###', '#..', '.##'], f: [2, '.##', '.#.', '###', '.#.', '.#.'],
  g: [3, '.##', '#.#', '.##', '..#', '##.'], h: [2, '#..', '#..', '##.', '#.#', '#.#'], i: [1, '#', '.', '#', '#', '#', '#'],
  j: [1, '.#', '..', '.#', '.#', '.#', '.#', '#.'], k: [2, '#..', '#.#', '##.', '#.#', '#.#'], l: [2, '#', '#', '#', '#', '#'],
  m: [3, '####.', '#.#.#', '#.#.#', '#.#.#'], n: [3, '##.', '#.#', '#.#', '#.#'], o: [3, '.#.', '#.#', '#.#', '.#.'],
  p: [3, '##.', '#.#', '##.', '#..', '#..'], q: [3, '.##', '#.#', '.##', '..#', '..#'], r: [3, '#.#', '##.', '#..', '#..'],
  s: [3, '.##', '#..', '..#', '##.'], t: [2, '.#.', '###', '.#.', '.#.', '..#'], u: [3, '#.#', '#.#', '#.#', '.##'],
  v: [3, '#.#', '#.#', '#.#', '.#.'], w: [3, '#...#', '#.#.#', '#.#.#', '.#.#.'], x: [3, '#.#', '.#.', '.#.', '#.#'],
  y: [3, '#.#', '#.#', '.##', '..#', '##.'], z: [3, '###', '..#', '#..', '###'],
  A: [2, '.#.', '#.#', '###', '#.#', '#.#'], B: [2, '##.', '#.#', '##.', '#.#', '##.'], C: [2, '.##', '#..', '#..', '#..', '.##'],
  D: [2, '##.', '#.#', '#.#', '#.#', '##.'], E: [2, '###', '#..', '##.', '#..', '###'], F: [2, '###', '#..', '##.', '#..', '#..'],
  G: [2, '.##', '#..', '#.#', '#.#', '.##'], H: [2, '#.#', '#.#', '###', '#.#', '#.#'], I: [2, '###', '.#.', '.#.', '.#.', '###'],
  J: [2, '..#', '..#', '..#', '#.#', '.#.'], K: [2, '#.#', '#.#', '##.', '#.#', '#.#'], L: [2, '#..', '#..', '#..', '#..', '###'],
  M: [2, '#...#', '##.##', '#.#.#', '#...#', '#...#'], N: [2, '#..#', '##.#', '#.##', '#..#', '#..#'], O: [2, '.#.', '#.#', '#.#', '#.#', '.#.'],
  P: [2, '##.', '#.#', '##.', '#..', '#..'], Q: [2, '.#.', '#.#', '#.#', '##.', '.##'], R: [2, '##.', '#.#', '##.', '#.#', '#.#'],
  S: [2, '.##', '#..', '.#.', '..#', '##.'], T: [2, '###', '.#.', '.#.', '.#.', '.#.'], U: [2, '#.#', '#.#', '#.#', '#.#', '.##'],
  V: [2, '#.#', '#.#', '#.#', '#.#', '.#.'], W: [2, '#...#', '#...#', '#.#.#', '##.##', '#...#'], X: [2, '#.#', '#.#', '.#.', '#.#', '#.#'],
  Y: [2, '#.#', '#.#', '.#.', '.#.', '.#.'], Z: [2, '###', '..#', '.#.', '#..', '###'],
  '0': [2, '###', '#.#', '#.#', '#.#', '###'], '1': [2, '.#.', '##.', '.#.', '.#.', '###'], '2': [2, '##.', '..#', '.#.', '#..', '###'],
  '3': [2, '##.', '..#', '.#.', '..#', '##.'], '4': [2, '#.#', '#.#', '###', '..#', '..#'], '5': [2, '###', '#..', '##.', '..#', '##.'],
  '6': [2, '.##', '#..', '##.', '#.#', '.#.'], '7': [2, '###', '..#', '.#.', '.#.', '.#.'], '8': [2, '.#.', '#.#', '.#.', '#.#', '.#.'],
  '9': [2, '.#.', '#.#', '.##', '..#', '##.'],
  'ı': [3, '#', '#', '#', '#'], 'ȷ': [3, '.#', '.#', '.#', '.#', '#.'],
  'ł': [2, '.#.', '.#.', '.##', '##.', '.#.'], 'Ł': [2, '.#..', '.#..', '.##.', '##..', '.###'],
  ' ': [2, '..'], "'": [2, '#', '#'], '-': [4, '##'], '.': [6, '#'],
};

/** combining marks: their rows and whether they go above (else below) */
const MARKS: Record<string, { rows: string[], above: boolean, right?: boolean }> = {
  '\u0300': { rows: ['#.', '.#'], above: true },          // grave
  '\u0301': { rows: ['.#', '#.'], above: true },          // acute
  '\u0302': { rows: ['.#.', '#.#'], above: true },        // circumflex
  '\u0303': { rows: ['.#.#', '#.#.'], above: true },      // tilde
  '\u0304': { rows: ['###'], above: true },               // macron
  '\u0306': { rows: ['#.#', '.#.'], above: true },        // breve (as small as a caron: ă still differs from â)
  '\u0307': { rows: ['#'], above: true },                 // dot above
  '\u0308': { rows: ['#.#'], above: true },               // diaeresis
  '\u030A': { rows: ['##', '##'], above: true },          // ring
  '\u030B': { rows: ['.#.#', '#.#.'], above: true },      // double acute
  '\u030C': { rows: ['#.#', '.#.'], above: true },        // caron
  '\u0326': { rows: ['.#.'], above: false },              // comma below (ș, ț)
  '\u0327': { rows: ['.#.'], above: false },              // cedilla
  '\u0328': { rows: ['..#'], above: false, right: true }, // ogonek
};

/** dotted letters lose their dot under an accent above */
const DOTLESS: Record<string, string> = { i: 'ı', j: 'ȷ' };

interface Cell { w: number, px: [number, number][] }

const cache = new Map<string, Cell | null>();

/** One character as painted art pixels (x, y in the cell), or null when the font can't write it. */
function cell (ch: string): Cell | null {
  let c = cache.get(ch);
  if (c !== undefined) return c;
  c = build(ch === '’' ? "'" : ch);
  cache.set(ch, c);
  return c;
}

function build (ch: string): Cell | null {
  const own = G[ch];
  if (own) return paint([[own, 0]], own[1].length);
  const parts = [...ch.normalize('NFD')];
  if (parts.length < 2) return null;
  const marks = parts.slice(1).map(m => MARKS[m]);
  if (marks.some(m => !m)) return null;
  const base = G[marks.some(m => m.above) ? DOTLESS[parts[0]] ?? parts[0] : parts[0]];
  if (!base) return null;
  const bw = base[1].length;
  const w = Math.max(bw, ...marks.map(m => m.rows[0].length));
  const glyphs: [Glyph, number][] = [[base, Math.floor((w - bw) / 2)]];
  let top = base[0];
  for (const m of marks) {
    const mw = m.rows[0].length;
    const x = m.right ? Math.floor((w - bw) / 2) + bw - mw : Math.floor((w - mw) / 2);
    if (m.above) {
      // a row clear of the letter where there's room (lower case), else touching it (capitals)
      const first = Math.max(0, top - 1 - m.rows.length);
      glyphs.push([[first, ...m.rows], x]);
      top = first;
    } else glyphs.push([[FONT_ROWS - 1, ...m.rows], x]);
  }
  return paint(glyphs, w);
}

function paint (glyphs: [Glyph, number][], w: number): Cell {
  const px: [number, number][] = [];
  for (const [[top, ...rows], ox] of glyphs) {
    for (let r = 0; r < rows.length; r++) for (let i = 0; i < rows[r].length; i++) if (rows[r][i] === '#') px.push([ox + i, top + r]);
  }
  return { w, px };
}

/** The text as the font writes it: every character it can't write is reported (names keep to what it can). */
export function unwritable (text: string): string[] {
  return [...new Set([...text.normalize('NFC')].filter(ch => !cell(ch)))];
}

/** width in art pixels, one art pixel between letters */
export function textWidth (text: string): number {
  const cs = [...text.normalize('NFC')].map(cell).filter((c): c is Cell => !!c);
  return cs.reduce((a, c) => a + c.w, 0) + Math.max(0, cs.length - 1);
}

/** The rows the text paints, first and last (0..7): a label can hug its letters. */
export function textRows (text: string): [number, number] {
  let lo = FONT_ROWS, hi = -1;
  for (const ch of text.normalize('NFC')) for (const [, r] of cell(ch)?.px ?? []) { lo = Math.min(lo, r); hi = Math.max(hi, r); }
  return hi < 0 ? [2, 6] : [lo, hi];
}

/** Write text with its top-left at (x, y), world pixels, `px` world pixels to an art pixel; characters it can't write are skipped. */
export function drawText (g: { fillStyle: string | CanvasGradient | CanvasPattern, fillRect (x: number, y: number, w: number, h: number): void }, text: string, x: number, y: number, colour: string, px = ART) {
  g.fillStyle = colour;
  let cx = x;
  for (const ch of text.normalize('NFC')) {
    const c = cell(ch);
    if (!c) continue;
    for (const [i, r] of c.px) g.fillRect(cx + i * px, y + r * px, px, px);
    cx += (c.w + 1) * px;
  }
}
