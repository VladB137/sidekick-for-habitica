/* The stable building, in each scene's own style, grown by level: 1 a fence, 5 a shelter, 10 the scene's
 * building, 15 a banner on it, 20 the hall with lanterns (the last stage). Quest plaques hang on its wall. */
import type { HouseStyle } from './palettes';
import { NATURE } from './palettes';
import { dot, oval, rect, type Paint } from './pixels';

interface HouseLook {
  wall: string; wall2: string; roof: string; roof2: string; trim: string;
  roofShape: 'gable' | 'steep' | 'thatch' | 'pagoda' | 'cap';
  stilts?: number; logs?: boolean; snowRoof?: boolean; canes?: boolean;
}

export const HOUSES: Record<HouseStyle, HouseLook> = {
  barn: { wall: '#B5533C', wall2: '#8E3F2D', roof: '#5D4037', roof2: '#3E2A24', trim: '#F5E6C8', roofShape: 'gable' },
  boathouse: { wall: '#6E8FA6', wall2: '#557286', roof: '#2F5B4E', roof2: '#21443A', trim: '#E8EEF2', roofShape: 'gable', stilts: 4 },
  cabin: { wall: '#8A5A33', wall2: '#6B4325', roof: '#4E3019', roof2: '#3A2312', trim: '#D9B88A', roofShape: 'steep', logs: true, snowRoof: true },
  hut: { wall: '#D8B46A', wall2: '#B8924A', roof: '#E6C35C', roof2: '#B8962E', trim: '#8A6A2E', roofShape: 'thatch', canes: true },
  pagoda: { wall: '#C0392B', wall2: '#962D22', roof: '#2E3B3F', roof2: '#1E2829', trim: '#F2D7A6', roofShape: 'pagoda' },
  stilt: { wall: '#7B6E58', wall2: '#5E5444', roof: '#9C8A5A', roof2: '#7A6B42', trim: '#C7B98E', roofShape: 'thatch', stilts: 6 },
  shroom: { wall: '#F2E6D0', wall2: '#D8C8AC', roof: '#D7263D', roof2: '#A11D2E', trim: '#8C5A3C', roofShape: 'cap' },
};

/** the level stages, lowest first (Vlad, 15 Oct: lower; they were 1, 10, 25, 40, 50) */
export const STABLE_STAGES = [1, 5, 10, 15, 20] as const;
const [, SHELTER, BUILDING, BANNER, HALL] = STABLE_STAGES;

export interface HouseOpts {
  style: HouseStyle;
  level: number;
  /** different quests finished (plaques: up to 6 on the wall) */
  quests: number;
  /** windows and lanterns lit */
  night: boolean;
  snow: boolean;
}

/** Paints the stable with its left edge at x0 (the fence runs on to the right edge W) and its foot on gy.
 * Returns where its door is (art pixels), for creatures heading home at dusk, and once it is a building the
 * middle of its roof's ridge and the roof's width. */
export function paintHouse (c: Paint, x0: number, gy: number, W: number, T: (c: string) => string, o: HouseOpts): { x: number, y: number, roof?: { x: number, y: number, w: number } } {
  const H = HOUSES[o.style], lvl = o.level, wood = T(NATURE.wood), wood2 = T(NATURE.wood2);
  // the fence (from level 1); the mushroom house has a ring of tiny toadstools instead
  if (o.style !== 'shroom') {
    for (let x = x0 - 8; x < W; x += 5) rect(c, x, gy - 6, 1, 7, wood2);
    rect(c, x0 - 8, gy - 5, W - x0 + 8, 1, wood); rect(c, x0 - 8, gy - 2, W - x0 + 8, 1, wood);
    if (o.snow) for (let x = x0 - 8; x < W; x += 5) dot(c, x, gy - 7, T(NATURE.snowCap));
  } else for (let x = x0 - 8; x < W; x += 4) { rect(c, x, gy - 3, 2, 3, T('#D8C8AC')); rect(c, x, gy - 4, 2, 1, T('#D7263D')); }
  const door: { x: number, y: number, roof?: { x: number, y: number, w: number } } = { x: x0 + 16, y: gy + 2 };
  if (lvl >= SHELTER && lvl < BUILDING) {
    // a lean-to shelter with a feed trough
    rect(c, x0 + 6, gy - 12, 1, 12, wood2); rect(c, x0 + 24, gy - 16, 1, 16, wood2);
    for (let i = 0; i < 22; i++) { dot(c, x0 + 4 + i, gy - 13 - Math.floor(i / 5), T(H.roof)); dot(c, x0 + 4 + i, gy - 14 - Math.floor(i / 5), T(o.snow ? NATURE.snowCap : H.roof2)); }
    rect(c, x0 + 10, gy - 3, 8, 3, T('#E0C068'));
    return door;
  }
  if (lvl < BUILDING) return door;
  const hall = lvl >= HALL, bw = hall ? 32 : 28, bh = hall ? 22 : 16, lift = H.stilts || 0, bx = x0 + 2, by = gy - lift;
  if (lift) {
    for (const px of [bx + 1, bx + bw - 3, bx + Math.round(bw / 2)]) rect(c, px, by, 2, lift, T(NATURE.post));
    rect(c, bx - 4, by - 1, bw + 8, 1, T('#6B4F33'));
  }
  rect(c, bx - 1, by - bh - 1, bw + 2, bh + 1, T('#1F1A16'));
  rect(c, bx, by - bh, bw, bh, T(H.wall)); rect(c, bx + bw - 4, by - bh, 4, bh, T(H.wall2));
  if (H.logs) for (let y = by - bh + 2; y < by; y += 3) rect(c, bx, y, bw, 1, T(H.wall2));
  if (H.canes) for (let x = bx + 2; x < bx + bw; x += 3) rect(c, x, by - bh, 1, bh, T(H.wall2));
  const top = by - bh, snowRoof = H.snowRoof || o.snow;
  if (H.roofShape === 'gable' || H.roofShape === 'steep') {
    const k = H.roofShape === 'steep' ? 0.9 : 0.6;
    for (let i = 0; i <= bw / 2 + 1; i++) rect(c, bx - 2 + i, top - i * k - 1, bw + 4 - i * 2, Math.ceil(k), T(i < 2 ? '#1F1A16' : i % 3 ? H.roof : H.roof2));
    if (snowRoof) for (let i = 2; i <= bw / 2; i++) rect(c, bx - 2 + i, top - i * k - 1, 2, 1, T(NATURE.snowCap));
  } else if (H.roofShape === 'thatch') {
    for (let i = 0; i <= bw / 2 + 3; i++) rect(c, bx - 5 + i, top - i * 0.7, bw + 10 - i * 2, 1, T(snowRoof && i > bw / 2 ? NATURE.snowCap : i % 2 ? H.roof : H.roof2));
  } else if (H.roofShape === 'pagoda') {
    for (const [yy, ww] of [[top, bw + 10], [top - 7, bw - 2]]) {
      const l = bx + bw / 2 - ww / 2;
      rect(c, l, yy - 2, ww, 2, T(H.roof)); dot(c, l - 1, yy - 3, T(H.roof)); dot(c, bx + bw / 2 + ww / 2, yy - 3, T(H.roof));
      rect(c, l + 2, yy - 4, ww - 4, 2, T(snowRoof ? NATURE.snowCap : H.roof2));
    }
    rect(c, bx + 6, top - 7, bw - 12, 3, T(H.wall)); rect(c, bx + bw / 2 - 1, top - 14, 2, 3, T('#E8C04A'));
  } else {
    const r = Math.round(bw / 2) + 4, cx = bx + bw / 2;
    for (let y = 0; y <= r * 0.8; y++) {
      const hw = Math.round(r * Math.sqrt(1 - (y * y) / ((r * 0.8 + 0.5) ** 2)));
      rect(c, cx - hw - 1, top - y, hw * 2 + 2, 1, T('#2A1F33')); rect(c, cx - hw, top - y, hw * 2, 1, T(y < 3 ? H.roof2 : H.roof));
    }
    for (const [dx, dy] of [[-7, 4], [3, 7], [8, 3], [-2, 10]]) rect(c, cx + dx, top - dy, 2, 2, T('#FFF4E8'));
  }
  // door and windows
  if (H.roofShape === 'cap') { oval(c, bx + bw / 2, by - 4, 3, 4, T(H.trim)); rect(c, bx + bw / 2 - 3, by - 1, 7, 1, T(H.trim)); }
  else {
    const dx = bx + bw / 2 - 4;
    rect(c, dx, by - 10, 8, 10, T(H.roof2)); rect(c, dx, by - 10, 8, 1, T(H.trim)); rect(c, dx, by - 10, 1, 10, T(H.trim)); rect(c, dx + 7, by - 10, 1, 10, T(H.trim));
  }
  door.x = bx + bw / 2; door.y = gy + 2;
  const ridge = H.roofShape === 'pagoda' ? 14 : H.roofShape === 'cap' ? Math.round((Math.round(bw / 2) + 4) * 0.8)
    : H.roofShape === 'thatch' ? Math.round((bw / 2 + 3) * 0.7) : Math.round((bw / 2 + 1) * (H.roofShape === 'steep' ? 0.9 : 0.6)) + 1;
  door.roof = { x: bx + bw / 2, y: top - ridge, w: bw };
  const win = o.night ? '#FFD86B' : T('#FFE9A8');
  rect(c, bx + 3, by - bh + 4, 4, 4, win); rect(c, bx + bw - 8, by - bh + 4, 4, 4, win);
  if (hall) {
    rect(c, bx + 3, by - bh + 11, 4, 3, win); rect(c, bx + bw - 8, by - bh + 11, 4, 3, win);
    for (const lx of [bx - 3, bx + bw + 2]) { rect(c, lx, by - 8, 1, 8, T('#3A2E22')); rect(c, lx - 1, by - 11, 3, 3, o.night ? '#FFC94A' : T('#E8B23A')); }
  }
  const q = Math.min(6, Math.max(0, o.quests | 0));
  for (let i = 0; i < q; i++) rect(c, bx + 2 + (i % 3) * 3, by - 7 + Math.floor(i / 3) * 3, 2, 2, T('#E8C04A'));
  if (lvl >= BANNER) {
    // the app's own banner: Teal 500 and 700 with an Amber star
    const fx = bx + bw - 2, fy = top - (H.roofShape === 'pagoda' ? 16 : 14);
    rect(c, fx, fy, 1, 14, T(NATURE.wood2)); rect(c, fx + 1, fy + 1, 6, 4, T('#009688')); rect(c, fx + 1, fy + 3, 6, 2, T('#00796B')); dot(c, fx + 4, fy + 2, T('#FFC400'));
  }
  return door;
}
