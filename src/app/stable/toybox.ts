/*
 * Play in the Stable (Vlad, 2026-10-15): the toy box, and hide and seek's record. The toys and the hiding are the
 * engine's (src/playground/play); this is what the phone keeps and the toy box sheet.
 *
 * The toy box (the button beside full screen) holds the ball, the frisbee, the stick and the kite; any of them may be
 * out, chosen per playground, and the ball is out until put away (it always was). Each playground also has its own
 * toy that is always there (a hay pile in the Meadow, skipping stones by the lake...), shown in the sheet too.
 *
 * Hide and seek: one pet hides behind its playground's hiding spot, chosen by the account, the playground and the
 * round: the day's first, then a new round two minutes after each find (Vlad, 15 Oct: once a day was too rarely
 * seen). Nobody hides where only one creature lives, nor at night. When it was last found is kept per playground.
 * No counter, no streak.
 *
 * Kept on this phone only, one record per Habitica account, never sent anywhere.
 */
import { BOX_TOYS, TOY_ART, look, type BoxToy, type OwnToy } from '../../playground/play';
import { ART } from '../../playground/particles';
import { Rng } from '../../playground/rng';
import { h, icon, ripple, sheet, whenSettled } from '../ui/dom';
import { kindOf, type CreatureId } from './picks';

export interface PlayRec {
  /** the toy box's toys out, per playground id; none recorded = the ball */
  toys: Record<string, BoxToy[]>;
  /** when its hider was last found, per playground id (YYYY-MM-DDTHH:MM:SS, the phone's clock; an older record
   * holds the day only, read as its midnight) */
  found: Record<string, string>;
}

export const TOY_NAMES: Record<BoxToy | OwnToy, string> = {
  ball: 'Ball', frisbee: 'Frisbee', stick: 'Stick', kite: 'Kite',
  hay: 'Hay pile', stones: 'Skipping stones', cones: 'Pine cones', sandcastle: 'Sandcastle', top: 'Spinning top', bubbles: 'Bubble pot', cap: 'Bouncy cap',
};
/** what it does, in a line */
const TOY_LINES: Record<BoxToy | OwnToy, string> = {
  ball: 'Flick it. The nearest pet chases it and bumps it back.',
  frisbee: 'Flick it. Flyers catch it in the air, the others fetch it back to you.',
  stick: 'Flick it. A pet runs after it and brings it back in its mouth.',
  kite: 'It flies over the playground. Drag it about and the herd runs under it.',
  hay: 'Tap it. A pet runs over, dives in and pops out again.',
  stones: 'Tap them. A stone skips across the lake while pets watch from the shore.',
  cones: 'Tap them. A cone rolls out and pets bat it back to the pile.',
  sandcastle: 'Tap it. A pet digs and it grows; once it’s a castle, a pet stomps it flat.',
  top: 'Tap it. It spins about, pets follow it round, then it tips over.',
  bubbles: 'Tap it. Bubbles float up and pets hop to pop them.',
  cap: 'Tap it. A pet climbs on and bounces.',
};

/** the toy box's toys out in a playground */
export const toysOut = (rec: PlayRec, pg: number): BoxToy[] => rec.toys[pg] ?? ['ball'];

export function setToys (rec: PlayRec, pg: number, kinds: readonly BoxToy[]): PlayRec {
  return { ...rec, toys: { ...rec.toys, [pg]: BOX_TOYS.filter(k => kinds.includes(k)) } };
}

/** a new round of hide and seek starts this long after a find, ms */
export const HIDE_AGAIN = 2 * 60_000;

/** a moment as the record keeps it: YYYY-MM-DDTHH:MM:SS on the phone's clock */
export function stampOf (d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const STAMP = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d):(\d\d))?$/;
const timeOf = (s: string) => { const m = STAMP.exec(s)!; return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime(); };

/** its hider was found less than HIDE_AGAIN ago (either way, should the clock be set back): nobody hides yet */
export const justFound = (rec: PlayRec, pg: number, now: Date) => { const s = rec.found[pg]; return !!s && Math.abs(now.getTime() - timeOf(s)) < HIDE_AGAIN; };
export const markFound = (rec: PlayRec, pg: number, now: Date): PlayRec => ({ ...rec, found: { ...rec.found, [pg]: stampOf(now) } });
/** the round now, which picks the hider: the day (YYYY-MM-DD) until its first find, then each find today */
export const roundOf = (rec: PlayRec, pg: number, today: string): string => { const s = rec.found[pg]; return s && s.length > 10 && s.startsWith(today) ? s : today; };

/**
 * The round's hider among a playground's residents: a pet, chosen by the account, the playground and the round
 * (roundOf); none where fewer than two creatures live (there'd be nothing else to look at) or no pet does.
 */
export function hiderFor (uid: string, pg: number, round: string, residents: readonly CreatureId[]): CreatureId | undefined {
  if (residents.length < 2) return undefined;
  const pets = residents.filter(id => kindOf(id) === 'pet');
  return pets.length ? new Rng(`hide:${uid}:${pg}:${round}`).pick(pets) : undefined;
}

/* ---- storage */

const KEY = 'critoracle:v2:play';
const WHEN = /^\d{4}-\d\d-\d\d(T\d\d:\d\d:\d\d)?$/;

function readAll (): Record<string, unknown> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** A stored record, checked entry by entry (an old or hand-edited one can't break the Stable). */
export function normalizePlay (v: unknown): PlayRec {
  const out: PlayRec = { toys: {}, found: {} };
  if (!v || typeof v !== 'object') return out;
  const r = v as Partial<Record<keyof PlayRec, unknown>>;
  if (r.toys && typeof r.toys === 'object') {
    for (const [pg, ks] of Object.entries(r.toys as Record<string, unknown>)) {
      if (/^\d+$/.test(pg) && Array.isArray(ks)) out.toys[pg] = BOX_TOYS.filter(k => ks.includes(k));
    }
  }
  if (r.found && typeof r.found === 'object') {
    for (const [pg, d] of Object.entries(r.found as Record<string, unknown>)) if (/^\d+$/.test(pg) && typeof d === 'string' && WHEN.test(d)) out.found[pg] = d;
  }
  return out;
}

export function loadPlay (userId: string | undefined): PlayRec {
  return normalizePlay(userId ? readAll()[userId] : undefined);
}

export function savePlay (userId: string | undefined, rec: PlayRec) {
  if (!userId) return;
  const all = readAll();
  all[userId] = rec;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode or full */ }
}

/* ---- the toy box sheet */

/** A toy's picture at a whole number of device pixels per art pixel, as big as fits `box` CSS px across. */
export function toyPic (kind: BoxToy | OwnToy, box: number): HTMLElement {
  const p = TOY_ART[kind], dpr = window.devicePixelRatio || 1;
  const n = Math.max(1, Math.floor(box * dpr / Math.max(p.w, p.h)));
  const c = h('canvas', { class: 'toy-pic', 'aria-hidden': 'true', width: String(p.w * n), height: String(p.h * n) }) as HTMLCanvasElement;
  c.style.width = `${p.w * n / dpr}px`; c.style.height = `${p.h * n / dpr}px`;
  try {
    const g = c.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    // the day's colours: the sheet isn't in the playground's light
    const { img } = look(p, col => col, 'toy-box');
    g.drawImage(img as CanvasImageSource, 0, 0, p.w * ART, p.h * ART, 0, 0, c.width, c.height);
  } catch { /* no canvas: the row still reads */ }
  return c;
}

/**
 * The toy box: the four toys, each ticked while out (a tap takes it out, dropping in from the sky, or puts it
 * away), and the playground's own toy, always there.
 */
export function openToyBox (o: { place: string, own: OwnToy, out: readonly BoxToy[], toggle: (k: BoxToy, out: boolean) => void }) {
  let sh: ReturnType<typeof sheet> | undefined;
  const row = (k: BoxToy | OwnToy, end: Node | null) => [
    h('span', { class: 'toy-art' }, toyPic(k, 40)),
    h('span', { class: 'li-main' }, h('span', { class: 'li-title' }, TOY_NAMES[k]), h('span', { class: 'li-sub' }, TOY_LINES[k])),
    end,
  ];
  const body = h('div', { class: 'pg-sheet toy-box', 'data-k': 'toy-box' },
    h('ul', { class: 'list' }, BOX_TOYS.map(k => {
      const out = o.out.includes(k);
      return h('li', null, ripple(h('button', {
        class: 'li li-btn', type: 'button', role: 'checkbox', 'aria-checked': String(out), 'data-k': `toy-${k}`,
        on: { click: () => { sh?.close(); whenSettled(() => o.toggle(k, !out)); } },
      }, ...row(k, icon(out ? 'check_box' : 'check_box_outline_blank', out ? 'toy-check on' : 'toy-check')))));
    })),
    h('div', { class: 'toy-own-head li-sub' }, `Always in ${o.place}`),
    h('ul', { class: 'list' }, h('li', { class: 'li', 'data-k': `toy-own-${o.own}` }, ...row(o.own, null))));
  sh = sheet('Toy box', body, [], { k: 'toy-box-sheet' });
}
