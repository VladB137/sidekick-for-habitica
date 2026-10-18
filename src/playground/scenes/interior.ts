/* Inside the stable (Stable idea 18): the barn the player walks into by tapping the stable once it is built.
 * The back wall holds the trophy shelves (every species-set achievement and the masters: earned ones in colour,
 * the rest as shapes in the wood), the pennant rack (a short pennant for each colour's pets, a swallowtail for
 * its mounts) and the quest plaque board (a plaque per different quest finished, smaller as they add up, so
 * there is no cap). Under it the row of stalls, one per mount the account has (stalls.ts scrolls them), and the
 * straw floor the playground's pets walk on. Lamplit at any hour. Art pixels, fillRect only, like the scenes. */
import { dither, dot, rect, type Paint } from './pixels';
import { COLOURS, MASTER_TROPHIES, SET_TROPHIES, type Box, type TrophySpot } from './trophies';
import { toner, type Light } from './palettes';
import { Rng } from '../rng';

/** the lamps' light, whatever the hour outside */
export const LAMPLIT: Light = { tod: 'day', season: 'summer', dailiesDone: true };
/** one stall's width, and the stall row's height from the beam's top to the floor, art px */
export const STALL_W = 46;
const STALL_H = 44, BEAM_H = 9;
/** the half doors' height: a mount's legs behind it, the rest of it over it */
export const DOOR_H = 10;
/** the wall's shelves, the rack and the board need this many rows above the beam */
const WALL_NEED = 68;
const SHELF_PITCH = 15, SHELF_W = 5 * SHELF_PITCH;

export interface InteriorOptions {
  /** the achievements earned */
  have: ReadonlySet<string>;
  /** different quests finished: a plaque each */
  quests: number;
}

export interface InteriorLayout {
  /** the stall row, art rows: the beam's top, the stalls' top, the half doors' top, the floor line where mounts stand */
  stalls: { beam: number, top: number, door: number, floor: number };
  /** where pets walk, art rows */
  floor: { top: number, bottom: number };
  /** every trophy on the shelves and the rack, earned or not (sign = not earned yet) */
  trophies: TrophySpot[];
  /** the quest plaque board */
  plaques: Box;
}

const WALL = ['#8A5A33', '#7A4E2B'], BEAM = '#4E3019', SHADOWED = '#5E3C21';

/** Where everything stands for a wall W x H art px whose rows top..H-bottom are on screen. */
function geometry (H: number, top: number, bottom: number) {
  const yBot = H - bottom;
  const room = yBot - top - STALL_H - WALL_NEED;
  const depth = Math.max(22, Math.round(22 + (room - 22) * 0.35));
  const floor = yBot - depth;
  return { floor, door: floor - DOOR_H, top: floor - STALL_H + BEAM_H, beam: floor - STALL_H, wall: floor - STALL_H - 2, yBot };
}

/** a hay bale, 11 x 6, top-left at (x, y) */
function bale (c: Paint, x: number, y: number, T: (c: string) => string) {
  rect(c, x, y, 11, 6, T('#D9B65A')); rect(c, x, y, 11, 1, T('#EBD07A')); rect(c, x, y + 5, 11, 1, T('#A8873C'));
  rect(c, x + 3, y, 1, 6, T('#8A6A2A')); rect(c, x + 7, y, 1, 6, T('#8A6A2A'));
  for (let i = 1; i < 10; i += 3) dot(c, x + i, y + 2 + (i % 2), T('#C49F45'));
}

/** a lamp hanging on its chain from row y0 to row y */
function lamp (c: Paint, x: number, y0: number, y: number, T: (c: string) => string) {
  dither(c, x - 10, y - 4, 21, 14, '#C98E4A', 1);
  rect(c, x, y0, 1, y - y0, T('#2E1C0E'));
  rect(c, x - 2, y, 5, 1, T('#3A2E22')); rect(c, x - 2, y + 1, 5, 4, '#FFD86B'); rect(c, x - 1, y + 2, 3, 2, '#FFF1B8'); rect(c, x - 2, y + 5, 5, 1, T('#3A2E22'));
}

/** The barn's still parts. The stalls are drawn over the stall row by paintStall and paintStallDoor. */
export function paintInterior (c: Paint, W: number, H: number, inset: { top: number, bottom: number }, o: InteriorOptions): InteriorLayout {
  const T = toner(LAMPLIT), g = geometry(H, inset.top, inset.bottom);
  // ---- the back wall: vertical planks, a ceiling beam where the screen starts
  rect(c, 0, 0, W, g.beam, T(WALL[0]));
  for (let x = 0; x < W; x += 7) { rect(c, x, 0, 1, g.beam, T(WALL[1])); if (x % 14 === 0) for (let y = 9; y < g.beam; y += 23) dot(c, x + 3, y, T(WALL[1])); }
  const ceil = Math.max(0, inset.top - 1);
  rect(c, 0, 0, W, ceil + 4, T(BEAM)); rect(c, 0, ceil + 4, W, 1, T('#2E1C0E'));

  const trophies: TrophySpot[] = [];
  const spot = (key: string, earned: boolean, x: number, y: number, w: number, h: number) =>
    trophies.push({ key, sign: !earned, x0: x - Math.ceil(w / 2) - 1, y0: y - h - 1, x1: x + Math.ceil(w / 2) + 1, y1: y + 2 });

  // ---- the trophy shelves, right: the masters on top, the sets five to a shelf below
  const sx = W - SHELF_W - 4;
  const shelfY = (k: number) => g.wall - 3 - (3 - k) * SHELF_PITCH;
  const board = (y: number) => { rect(c, sx - 2, y + 1, SHELF_W + 4, 2, T('#C9A26B')); rect(c, sx - 2, y + 3, SHELF_W + 4, 1, T('#6B4325')); };
  const shelf = (items: typeof SET_TROPHIES, y: number) => {
    items.forEach((t, i) => {
      const earned = o.have.has(t.key), x = Math.round(sx + SHELF_PITCH * (i + 0.5) + (5 - items.length) * SHELF_PITCH / 2);
      t.art.paint(c, x, y, { T: earned ? T : () => T(SHADOWED), night: false, snow: false });
      spot(t.key, earned, x, y, t.art.w, t.art.h);
    });
    board(y);
  };
  shelf(MASTER_TROPHIES, shelfY(0));
  for (let k = 0; k < 3; k++) shelf(SET_TROPHIES.slice(k * 5, k * 5 + 5), shelfY(k + 1));

  // ---- the pennant rack, left: a short pennant for a colour's pets, a swallowtail under it for its mounts
  const lw = sx - 10, step = Math.max(4, Math.min(6, Math.floor(lw / 10)));
  const rackY = shelfY(0) - 12, rackX = 4 + Math.floor((lw - step * 10 + 2) / 2);
  rect(c, rackX - 2, rackY, step * 10 + 1, 1, T('#3A2E22'));
  COLOURS.forEach(([, pet, mount, a, b], i) => {
    const x = rackX + i * step, p = o.have.has(pet), m = o.have.has(mount);
    const A = T(p ? a : SHADOWED), B = T(p ? b : SHADOWED);
    rect(c, x, rackY + 1, 3, 2, A); dot(c, x + 1, rackY + 3, A); dot(c, x + 2, rackY + 1, B);
    trophies.push({ key: pet, sign: !p, x0: x - 1, y0: rackY, x1: x + 4, y1: rackY + 4 });
    const A2 = T(m ? a : SHADOWED), B2 = T(m ? b : SHADOWED);
    rect(c, x, rackY + 5, 3, 4, A2); rect(c, x + 2, rackY + 5, 1, 4, B2); dot(c, x, rackY + 9, A2); dot(c, x + 2, rackY + 9, B2);
    trophies.push({ key: mount, sign: !m, x0: x - 1, y0: rackY + 4, x1: x + 4, y1: rackY + 11 });
  });

  // ---- the quest plaque board under the rack: plaques get smaller until all of them fit
  const bx = 4, by = rackY + 14, bw = lw, bh = Math.max(8, g.wall - 1 - by);
  rect(c, bx + Math.floor(bw / 2) - 1, rackY + 12, 3, 2, T('#3A2E22'));
  rect(c, bx, by, bw, bh, T('#3E2A1A')); rect(c, bx + 1, by + 1, bw - 2, bh - 2, T('#5A3A22'));
  const sizes: [number, number, number, number][] = [[4, 3, 6, 5], [3, 2, 4, 4], [2, 2, 3, 3], [1, 1, 2, 2]];
  const fits = (s: typeof sizes[number]) => Math.floor((bw - 4) / s[2]) * Math.floor((bh - 4) / s[3]);
  const [pw, ph, px, py] = sizes.find(s => fits(s) >= o.quests) ?? sizes[sizes.length - 1];
  const cols = Math.max(1, Math.floor((bw - 4) / px));
  for (let i = 0; i < fits([pw, ph, px, py]); i++) {
    const x = bx + 3 + (i % cols) * px, y = by + 3 + Math.floor(i / cols) * py;
    // a nail for each plaque still to come
    if (i >= o.quests) { dot(c, x + (pw >> 1), y + (ph >> 1), T('#46301C')); continue; }
    rect(c, x, y, pw, ph, T('#E8C04A'));
    if (pw > 2) { dot(c, x + 1, y + 1, T('#B8902A')); dot(c, x + pw - 1, y, T('#FFE9A8')); }
  }

  // ---- a lantern between the board and the shelves, its warm light on the planks
  const lx = sx - 5, ly = shelfY(1) - 6;
  dither(c, lx - 9, ly - 6, 19, 16, '#C98E4A', 1);
  rect(c, lx, ly - 4, 1, 3, T('#2E1C0E')); rect(c, lx - 2, ly - 1, 5, 1, T('#3A2E22'));
  rect(c, lx - 2, ly, 5, 4, '#FFD86B'); rect(c, lx - 1, ly + 1, 3, 2, '#FFF1B8'); rect(c, lx - 2, ly + 4, 5, 1, T('#3A2E22'));

  // ---- above the wall's things, a hayloft with bales where there is room, and lamps from the rafters
  const loft = rackY - 8, above = loft - (ceil + 5);
  if (above >= 20) {
    const rows = Math.max(1, Math.min(3, Math.floor((above - 14) / 6)));
    for (let x = 3, i = 0; x + 11 <= W - 2; x += 12, i++) {
      const n = Math.min(rows, [3, 2, 3, 1, 2, 3, 2, 1][i % 8]);
      for (let k = 0; k < n; k++) bale(c, x + (k % 2), loft - 6 * (k + 1), T);
    }
    rect(c, 0, loft, W, 3, T('#6B4325')); rect(c, 0, loft, W, 1, T('#A1774F')); rect(c, 0, loft + 3, W, 1, T('#2E1C0E'));
    for (const x of [Math.round(W * 0.3), Math.round(W * 0.7)]) rect(c, x, loft + 4, 2, 4, T('#4E3019'));
    const free = loft - 6 * rows - 2 - (ceil + 5);
    // the barn's frame between the ceiling and the loft: posts and cross braces in each bay
    if (free >= 24) {
      const y0 = ceil + 5, y1 = loft - 6 * rows - 2, bays = 3;
      for (let k = 0; k < bays; k++) {
        const x0 = Math.round(k * W / bays), x1 = Math.round((k + 1) * W / bays);
        for (let i = 0; i <= y1 - y0; i++) {
          const t = i / (y1 - y0);
          rect(c, Math.round(x0 + 3 + t * (x1 - x0 - 8)), y0 + i, 3, 1, T('#6B4325'));
          rect(c, Math.round(x1 - 6 - t * (x1 - x0 - 8)), y0 + i, 3, 1, T('#6B4325'));
        }
        rect(c, x0, y0, 3, y1 - y0, T('#4E3019')); rect(c, x0, y0, 1, y1 - y0, T('#6B4325'));
      }
      rect(c, 0, y1 - 2, W, 2, T('#4E3019'));
    }
    if (free >= 16) for (const x of [Math.round(W * 0.25), Math.round(W * 0.75)]) lamp(c, x, ceil + 5, ceil + 5 + Math.min(16, free - 10), T);
  }

  // ---- the stall row's back (stalls cover it where there are mounts) and its beam
  rect(c, 0, g.beam, W, g.floor - g.beam, T('#5A3A22'));
  for (let x = 0; x < W; x += 5) rect(c, x, g.top, 1, g.floor - g.top, T('#4E3019'));
  rect(c, 0, g.beam, W, BEAM_H, T(BEAM)); rect(c, 0, g.beam + BEAM_H - 1, W, 1, T('#2E1C0E')); rect(c, 0, g.beam, W, 1, T('#6B4325'));

  // ---- the straw floor
  rect(c, 0, g.floor, W, H - g.floor, T('#C9A24E'));
  const rng = new Rng('barn:straw'), R = () => rng.next();
  for (let i = 0; i < W * (H - g.floor) * 0.22; i++) {
    const x = Math.floor(R() * W), y = g.floor + 1 + Math.floor(R() * (H - g.floor - 1));
    rect(c, x, y, 2 + Math.floor(R() * 2), 1, T(R() < 0.6 ? '#B8903E' : '#E3C565'));
  }
  // a water trough by the stalls and a heap of loose hay
  const ty = g.floor + 4;
  rect(c, 6, ty, 20, 5, T('#6B4F33')); rect(c, 7, ty + 1, 18, 2, T('#5B9BD5')); rect(c, 7, ty + 1, 18, 1, T('#9CC8F0')); rect(c, 6, ty + 5, 20, 1, T('#4E3019'));
  for (let k = 0; k < 18; k++) { const hx = W - 26 + k, hh = Math.round(4 * Math.sin(Math.PI * k / 17)); rect(c, hx, ty + 5 - hh, 1, hh + 1, T(k % 3 ? '#D9B65A' : '#EBD07A')); }
  rect(c, 0, g.floor, W, 1, T('#3A2412'));
  return {
    stalls: { beam: g.beam, top: g.top, door: g.door, floor: g.floor },
    floor: { top: g.floor + 6, bottom: Math.max(g.floor + 7, g.yBot - 3) },
    trophies,
    plaques: { x0: bx, y0: by, x1: bx + bw, y1: by + bh },
  };
}

/** One stall's back and its left post, STALL_W wide, from the stalls' top to the floor line (h rows). */
export function paintStall (c: Paint, h: number) {
  const T = toner(LAMPLIT);
  rect(c, 0, 0, STALL_W, h, T('#5A3A22'));
  for (let x = 3; x < STALL_W; x += 5) rect(c, x, 0, 1, h, T('#4E3019'));
  // a hay rack at the back, and the manger's shadow
  rect(c, 8, 4, STALL_W - 16, 1, T('#3A2412'));
  for (let x = 9; x < STALL_W - 8; x += 3) rect(c, x, 5, 1, 4, T('#3A2412'));
  for (let x = 10; x < STALL_W - 9; x += 2) dot(c, x, 6 + (x % 3), T('#C9A24E'));
  rect(c, 0, 0, 2, h, T('#4E3019')); rect(c, 0, 0, 1, h, T('#6B4325'));
}

/** One stall's half door with its cross brace, STALL_W wide and DOOR_H rows (its post included). */
export function paintStallDoor (c: Paint) {
  const T = toner(LAMPLIT), h = DOOR_H, w = STALL_W - 3;
  rect(c, 2, 0, w, h, T('#A1774F'));
  for (let x = 2; x < 2 + w; x += 4) rect(c, x, 0, 1, h, T('#8A6440'));
  for (let k = 0; k < h; k++) {
    dot(c, 2 + Math.round((k / h) * (w - 1)), k, T('#6B4F33'));
    dot(c, 1 + w - Math.round((k / h) * (w - 1)), k, T('#6B4F33'));
  }
  rect(c, 2, 0, w, 1, T('#C9A26B')); rect(c, 2, h - 1, w, 1, T('#6B4F33'));
  rect(c, 0, 0, 2, h, T('#4E3019'));
}

/** a stall's post on its own (after the last stall) */
export function paintPost (c: Paint, h: number) {
  const T = toner(LAMPLIT);
  rect(c, 0, 0, 2, h, T('#4E3019')); rect(c, 0, 0, 1, h, T('#6B4325'));
}
