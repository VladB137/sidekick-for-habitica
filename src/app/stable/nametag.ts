/* A creature's name over its head for a moment (Vlad, 2026-10-15: names show on tap): after a tap, a stroke,
 * Find in the meadow or Pet on its sheet, while it's carried, and when it moves in. Written in the scene's pixel
 * font (src/playground/font.ts) on a small dark plate, so it looks the same on every WebView. One front layer
 * reading where the herd stands: the herd itself, and so the wallpaper's copy of it, doesn't change. */
import { ART, type Creature, type Ctx, type Herd, type Layer, type Sprite, type World } from '../../playground';
import { drawText, textRows, textWidth } from '../../playground/font';

/** how long a name shows, ms */
export const TAG_MS = 2500;
const PLATE = 'rgba(24,32,28,0.8)';
const INK = '#FFFFFF';

/** a sprite's painted pixels: first row, first and last column (unmirrored) */
const bounds = new WeakMap<Sprite, { top: number, left: number, right: number }>();
function painted (s: Sprite) {
  let b = bounds.get(s);
  if (!b) {
    b = { top: 0, left: 0, right: s.w - 1 };
    if (s.mask) {
      let top = s.h, left = s.w, right = -1;
      for (let y = 0; y < s.h; y++) for (let x = 0; x < s.w; x++) if (s.mask[y * s.w + x]) { top = Math.min(top, y); left = Math.min(left, x); right = Math.max(right, x); }
      if (right >= 0) b = { top, left, right };
    }
    bounds.set(s, b);
  }
  return b;
}

export class NameTagLayer implements Layer {
  readonly id = 'name-tags';
  readonly depth = 'front' as const;
  /** who shows a name, and until when (performance.now ms; Infinity while carried) */
  private until = new Map<string, number>();
  /** every name shows, all the time (Habitica's Naming Day) */
  all = false;

  constructor (private herd: Herd, private nameOf: (id: string) => string, private now: () => number = () => performance.now()) {}

  /** Show its name for a moment (longer if it already shows). False when it has none to show (Habitica's name kept). */
  show (id: string, ms = TAG_MS): boolean {
    if (!this.nameOf(id) || !this.herd.byId(id)) return false;
    this.until.set(id, Math.max(this.until.get(id) ?? 0, this.now() + ms));
    return true;
  }
  /** carried: the name stays until it's let go, then for a moment more */
  hold (id: string) { if (this.show(id)) this.until.set(id, Infinity); }
  release (id: string) { if (this.until.get(id) === Infinity) this.until.set(id, this.now() + TAG_MS); }

  /** who shows a name now (tests, TalkBack) */
  showing (): string[] {
    const t = this.now();
    if (this.all) return this.herd.creatures.filter(c => this.nameOf(c.id)).map(c => c.id);
    return [...this.until].filter(([id, u]) => u > t && this.nameOf(id) && this.herd.byId(id)).map(([id]) => id);
  }

  draw (g: Ctx, w: World) {
    const t = this.now();
    for (const [id, u] of [...this.until]) {
      if (u <= t) { this.until.delete(id); continue; }
      const c = this.herd.byId(id), name = this.nameOf(id);
      if (c && name && !this.all) this.tag(g, w, c, name);
    }
    if (this.all) for (const c of this.herd.creatures) { const name = this.nameOf(c.id); if (name) this.tag(g, w, c, name); }
  }

  /** the plate's box over this creature, world pixels */
  place (w: World, c: Creature, name: string) {
    const f = c.frame(w);
    const [r0, r1] = textRows(name);
    const pw = (textWidth(name) + 4) * ART, ph = (r1 - r0 + 3) * ART;
    if (!f) return null;
    const s = f.s, p = painted(s);
    const head = c.head ? w.sprites.get(c.head) : undefined;
    const hp = head && head.w === s.w ? painted(head) : p;
    // the picture's resting height in the still picture, its real height in motion (as the creature draws itself)
    const lift = this.herd.still() ? (c.st === 'held' ? 0 : c.base) + (c.stillPose()?.lift ?? 0) * ART : Math.round(c.lift / ART) * ART;
    const top = c.y - s.anchor.y - lift;
    let paintTop = top + Math.min(p.top, hp.top);
    if (c.rider?.length) paintTop = Math.min(paintTop, top + Math.min(...c.rider.map(l => l.y)));
    const l = Math.min(p.left, hp.left), r = Math.max(p.right, hp.right);
    const mid = f.flipped ? f.left + s.w - 1 - (l + r) / 2 : f.left + (l + r) / 2;
    const x = Math.round(Math.max(ART, Math.min(w.w - pw - ART, mid - pw / 2)) / ART) * ART;
    const y = Math.round(Math.max(w.insets.top + ART, paintTop - 2 * ART - ph) / ART) * ART;
    return { x, y, w: pw, h: ph, r0 };
  }

  private tag (g: Ctx, w: World, c: Creature, name: string) {
    const b = this.place(w, c, name);
    if (!b) return;
    // a plate with its corners cut by one art pixel
    g.fillStyle = PLATE;
    g.fillRect(b.x + ART, b.y, b.w - 2 * ART, b.h);
    g.fillRect(b.x, b.y + ART, ART, b.h - 2 * ART);
    g.fillRect(b.x + b.w - ART, b.y + ART, ART, b.h - 2 * ART);
    drawText(g, name, b.x + 2 * ART, b.y + ART - b.r0 * ART, INK);
  }
}
