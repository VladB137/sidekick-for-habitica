/* Mood around a creature, never painted on it: hearts (a big one when you pet it, a little group of small ones
 * between two friends), Zzz, sparkles, dust, confetti and a sweat drop. Each
 * is a tiny hand-drawn mask in art pixels (3 x 3 world pixels), moves one art pixel at a time and leaves with a
 * 2-frame pop instead of fading. In the still picture (reduced motion) they appear where they start, stay
 * for their life and vanish; nothing travels. */
import { TICK_MS } from './frame';
import { particleLook } from './behaviours';
import type { Ctx } from './world';

/** world pixels per art pixel: Habitica's art is drawn at 3x, and so is ours */
export const ART = 3;

/** your petting's heart (Vlad, 2026-10-15: a bit bigger), 7 x 6, and the 5 x 5 it pops through */
const HEART = ['.##.##.', '#######', '#######', '.#####.', '..###..', '...#...'];
const HEART_M = ['.#.#.', '#####', '#####', '.###.', '..#..'];
/** a small heart: two friends together */
const HEART_S = ['#.#', '###', '.#.'];
const ZED = ['###', '.#.', '###'];
const SPARK = ['.#.', '###', '.#.'];
const DROP = ['.#.', '###', '###', '.#.'];

/** Drawn here; any other kind is a look from the behaviour modules (behaviours/fx.ts: 'dust', 'dirt', 'note'...). */
export type ParticleKind = 'heart' | 'tiny' | 'zed' | 'spark' | 'bit' | 'sweat';

export interface Particle {
  kind: ParticleKind | (string & {});
  /** top-left, world pixels (snapped to art pixels when drawn) */
  x: number; y: number;
  /** ticks lived and ticks to live */
  t: number; life: number;
  /** confetti velocity (world pixels a tick); for a behaviour's look, vx is its side (+1 or -1) */
  vx?: number; vy?: number;
  col?: string;
  /** whose heart it is: a creature shows at most 3 at once */
  owner?: string;
}

export const COLOURS = { heart: '#FF5C8A', heartShine: '#FFD1DE', zed: '#E8ECFF', dust: '#E9E2CF', amber: '#FFC400', sweat: '#7FC8F2', sweatShine: '#E6F6FF' };

const snap = (v: number) => Math.round(v / ART) * ART;

function mask (g: Ctx, m: string[], x: number, y: number, col: string) {
  g.fillStyle = col;
  for (let r = 0; r < m.length; r++) for (let i = 0; i < m[r].length; i++) if (m[r][i] === '#') g.fillRect(x + i * ART, y + r * ART, ART, ART);
}

/** Moves one tick. Rates are in art pixels: a heart rises 9 over its 36 ticks (1.2 s), a Z one every 8, a sweat
 * drop slides down one every 6. */
export function stepParticle (p: Particle) {
  p.t++;
  switch (p.kind) {
    case 'heart': case 'tiny': if (p.t % 4 === 0) p.y -= ART; break;
    case 'zed': if (p.t % 8 === 0) { p.y -= ART; if (p.t % 16 === 0) p.x += ART; } break;
    case 'bit': p.x += p.vx ?? 0; p.y += p.vy ?? 0; p.vy = (p.vy ?? 0) + 0.1 * ART; p.vx = (p.vx ?? 0) * 0.97; break;
    case 'sweat': if (p.t % 6 === 0) p.y += ART; break;
    default: {
      const l = particleLook(p.kind);
      for (const m of l?.move ?? []) {
        if (p.t < (m.from ?? 0) || p.t >= (m.to ?? Infinity) || p.t % m.every !== 0) continue;
        p.x += (m.dx ?? 0) * (p.vx ?? 1) * ART; p.y += (m.dy ?? 0) * ART;
      }
    }
  }
}

export function drawParticle (g: Ctx, p: Particle) {
  const x = snap(p.x), y = snap(p.y);
  // the last 2 frames are the pop: a smaller shape, then gone
  const pop = p.life - p.t <= 2;
  switch (p.kind) {
    case 'heart':
      // centred where the 5-wide heart was
      if (pop) mask(g, HEART_M, x, y + ART, COLOURS.heart);
      else { mask(g, HEART, x - ART, y, COLOURS.heart); g.fillStyle = COLOURS.heartShine; g.fillRect(x, y + ART, ART, ART); }
      break;
    case 'tiny':
      if (pop) { g.fillStyle = COLOURS.heart; g.fillRect(x + ART, y + ART, ART, ART); } else mask(g, HEART_S, x, y, COLOURS.heart);
      break;
    case 'zed': if (pop) { g.fillStyle = COLOURS.zed; g.fillRect(x + ART, y + ART, ART, ART); } else mask(g, ZED, x, y, COLOURS.zed); break;
    case 'spark': {
      const big = !pop && Math.floor(p.t / 4) % 2 === 0;
      if (big) mask(g, SPARK, x, y, p.col ?? '#FFFFFF');
      else { g.fillStyle = p.col ?? '#FFFFFF'; g.fillRect(x + ART, y + ART, ART, ART); }
      break;
    }
    case 'bit': g.fillStyle = p.col ?? COLOURS.amber; g.fillRect(x, y, ART, ART); break;
    case 'sweat': drawSweat(g, x, y, pop); break;
    default: {
      // a behaviour's look: its picture for this age (or its pop), sitting on (x, y), mirrored when sent back
      const l = particleLook(p.kind);
      if (!l) break;
      const rows = pop && l.pop ? l.pop : (l.frames.find(f => (f.until ?? Infinity) > p.t) ?? l.frames[l.frames.length - 1]).rows;
      const flip = !!l.mirror && (p.vx ?? 1) < 0, top = y - rows.length * ART;
      for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        for (let i = 0; i < row.length; i++) {
          const ch = row[flip ? row.length - 1 - i : i];
          if (ch === '.') continue;
          g.fillStyle = l.cols[ch];
          g.fillRect(x + i * ART, top + r * ART, ART, ART);
        }
      }
    }
  }
}

/** A heart's life: 1.2 s at 30 ticks a second. */
export const HEART_LIFE = Math.round(1200 / TICK_MS);

/** A sweat drop with its top-left at (x, y), world pixels on the art grid (the pop: one pixel). */
export function drawSweat (g: Ctx, x: number, y: number, pop = false) {
  if (pop) { g.fillStyle = COLOURS.sweat; g.fillRect(x + ART, y + 2 * ART, ART, ART); return; }
  mask(g, DROP, x, y, COLOURS.sweat);
  g.fillStyle = COLOURS.sweatShine; g.fillRect(x, y + ART, ART, ART);
}
