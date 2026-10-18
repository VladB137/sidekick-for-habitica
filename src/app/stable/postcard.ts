/*
 * The Stable postcard (stable ideas §14): the open playground as it stands, without the app's buttons, on a white
 * card with Habitica's art credit written under it (the art is CC BY-NC-SA 3.0, so every copy has to name it),
 * offered through Android's share sheet; a browser saves it, or shares it where the browser can share files.
 * The app uploads nothing, and the picture holds only what the playground shows: the scene, the creatures and a
 * name over a head if one is showing, the player's avatar (riding, or on foot by the door) and visiting friends.
 *
 * The avatar's pictures come from Habitica's image server, which sends no CORS headers: in a browser they make the
 * canvas unreadable, so the postcard is painted again without the avatar (in the saddle or on foot by the door, and
 * a visiting friend's) and says so. The APK gets those pictures through the phone (native.avatarPicture), so there
 * the avatar stays on.
 *
 * The weekly almanac (almanac.ts) is the same postcard with the week written on it: a ribbon over the picture naming
 * the week, and the week's numbers on the card under it, above the credit. The sheet switches between the plain
 * picture, this week and last week; the frame stays the one the camera took.
 */
import type { Herd, World } from '../../playground';
import type { Almanac, Which } from '../almanac';
import { native } from '../native';
import { h, ripple, sheet, snackbar } from '../ui/dom';

/** the credit written on every postcard, one line each */
export const POSTCARD_CREDIT = [
  'Pet, mount and avatar art © HabitRPG, Inc., CC BY-NC-SA 3.0, from Habitica.',
  'Made with Sidekick for Habitica, not affiliated with or endorsed by Habitica.',
] as const;
/** the shared file's name: nothing about the account in it */
export const POSTCARD_FILE = 'stable-postcard.png';
/** the picture's width at least (image pixels), in whole image pixels per world pixel */
const MIN_W = 1080;
/** the image's longest side at most (the phone refuses bigger) */
const MAX_SIDE = 4096;
const PAPER = '#FAFAFA';
const INK = 'rgba(0,0,0,0.6)';
const FONT = "Roboto, 'Helvetica Neue', Arial, sans-serif";
/** the almanac's words, in the app's own font and outline colour */
const AL_FONT = "Nunito, 'Helvetica Neue', Arial, sans-serif";
const AL_INK = '#241A10';
const RIBBON = '#FFFBF2';

export interface Postcard {
  /** PNG data URL */
  url: string
  w: number
  h: number
  /** the browser couldn't copy the avatar's pictures, so the avatar isn't on it */
  riderLeftOut: boolean
}

/** the world as it stands, at world pixels: a fresh canvas, never the stage's (which may be unreadable) */
function paintWorld (world: World): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = world.w; c.height = world.h;
  world.draw(c.getContext('2d')!);
  return c;
}

/** whether a canvas can be read back (no picture from a server without CORS on it) */
function readable (c: HTMLCanvasElement): boolean {
  try { c.getContext('2d')!.getImageData(0, 0, 1, 1); return true; } catch { return false; }
}

/** The frame a postcard is made from, at world pixels. */
export interface Picture { pic: HTMLCanvasElement, riderLeftOut: boolean }

/**
 * This world now, as a picture. Synchronous, so it shows the very frame on screen (a name over a head
 * included); the rider is left out only when the browser can't copy its pictures.
 */
export function pictureOf (world: World, herd: Herd): Picture {
  let pic = paintWorld(world), riderLeftOut = false;
  if (!readable(pic)) {
    // a browser: the avatar's pictures can't be copied, so the same frame without the riders and the avatar on foot
    const ridden = herd.creatures.filter(c => c.rider);
    const kept = ridden.map(c => c.rider), av = herd.avatar, standing = av?.layers;
    try {
      for (const c of ridden) c.rider = undefined;
      if (av) av.layers = [];
      pic = paintWorld(world);
    } finally {
      ridden.forEach((c, i) => { c.rider = kept[i]; });
      if (av && standing) av.layers = standing;
    }
    riderLeftOut = true;
  }
  return { pic, riderLeftOut };
}

/** a rounded rectangle's path (CanvasRenderingContext2D.roundRect is Chrome 99) */
function roundPath (g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/** The postcard of this world now, plain or with a week's almanac on it. */
export const paintPostcard = (world: World, herd: Herd, almanac?: Almanac): Postcard => cardOf(pictureOf(world, herd), almanac);

/** The card around a picture: the picture, the almanac if any, and the credit. */
export function cardOf ({ pic, riderLeftOut }: Picture, almanac?: Almanac): Postcard {
  // whole image pixels per world pixel: at least MIN_W wide, unless the card (credit and margins about a fifth of
  // the width more) would pass the longest side the phone takes
  let k = Math.max(1, Math.ceil(MIN_W / pic.width));
  while (k > 1 && (pic.height * k + pic.width * k * 0.2 > MAX_SIDE || pic.width * k * 1.1 > MAX_SIDE)) k--;
  const W = pic.width * k, H = pic.height * k;
  const pad = Math.round(W * 0.04);
  const out = document.createElement('canvas');
  const g = out.getContext('2d')!;
  // the credit's size: as large as fits the card's width, from about 2.6% of it down to 12 px
  let fs = Math.max(12, Math.round(W * 0.026));
  const fits = () => { g.font = `400 ${fs}px ${FONT}`; return POSTCARD_CREDIT.every(l => g.measureText(l).width <= W); };
  while (fs > 12 && !fits()) fs--;
  const lineH = Math.round(fs * 1.45);
  // the almanac's lines: as large as fits, from about 4% of the width down to 14 px
  const lines = almanac?.lines ?? [];
  let as = Math.max(14, Math.round(W * 0.04));
  const lineW = (l: { bold: string, rest: string }) => {
    g.font = `800 ${as}px ${AL_FONT}`; const b = g.measureText(l.bold).width;
    g.font = `600 ${as}px ${AL_FONT}`; return b + g.measureText(l.rest).width;
  };
  while (as > 14 && lines.some(l => lineW(l) > W)) as--;
  const alH = Math.round(as * 1.5);
  let ns = Math.max(12, Math.round(as * 0.72));
  const noteFits = () => { g.font = `600 ${ns}px ${AL_FONT}`; return !almanac?.note || g.measureText(almanac.note).width <= W; };
  while (ns > 12 && !noteFits()) ns--;
  const block = lines.length ? Math.round(pad * 0.8) + alH * lines.length + (almanac?.note ? Math.round(ns * 1.6) : 0) : 0;
  out.width = W + 2 * pad;
  out.height = H + pad + block + Math.round(pad * 0.7) + lineH * POSTCARD_CREDIT.length + Math.round(pad * 0.6);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, out.width, out.height);
  g.imageSmoothingEnabled = false;
  g.drawImage(pic, 0, 0, pic.width, pic.height, pad, pad, W, H);
  g.textBaseline = 'top';
  if (almanac) {
    // the ribbon over the picture's top left: "Almanac · Last week, 6–12 Oct"
    const rs = Math.max(14, Math.round(W * 0.036)), bw = Math.max(2, Math.round(W * 0.003));
    const head = 'Almanac', sep = ` · ${almanac.title}`;
    g.font = `800 ${rs}px ${AL_FONT}`; const hw = g.measureText(head).width;
    g.font = `600 ${rs}px ${AL_FONT}`; const sw = g.measureText(sep).width;
    const px = Math.round(rs * 0.7), rh = Math.round(rs * 1.9), rx = pad + Math.round(pad * 0.5), ry = pad + Math.round(pad * 0.5);
    const rw = Math.min(W - pad, Math.round(hw + sw + 2 * px));
    roundPath(g, rx, ry, rw, rh, rh / 2);
    g.fillStyle = RIBBON; g.fill();
    g.lineWidth = bw; g.strokeStyle = AL_INK; g.stroke();
    g.fillStyle = AL_INK;
    const ty = ry + Math.round((rh - rs * 1.2) / 2);
    g.font = `800 ${rs}px ${AL_FONT}`; g.fillText(head, rx + px, ty);
    g.font = `600 ${rs}px ${AL_FONT}`; g.fillText(sep, rx + px + hw, ty);
    // the week's numbers under the picture
    let y = pad + H + Math.round(pad * 0.8);
    for (const l of lines) {
      g.font = `800 ${as}px ${AL_FONT}`; g.fillText(l.bold, pad, y);
      const bwid = g.measureText(l.bold).width;
      g.font = `600 ${as}px ${AL_FONT}`; g.fillText(l.rest, pad + bwid, y);
      y += alH;
    }
    if (almanac.note) { g.font = `600 ${ns}px ${AL_FONT}`; g.fillStyle = INK; g.fillText(almanac.note, pad, y + Math.round(ns * 0.3)); }
  }
  g.font = `400 ${fs}px ${FONT}`;
  g.fillStyle = INK;
  POSTCARD_CREDIT.forEach((l, i) => g.fillText(l, pad, pad + H + block + Math.round(pad * 0.7) + i * lineH));
  return { url: out.toDataURL('image/png'), w: out.width, h: out.height, riderLeftOut };
}

/** a data URL as a file, for the browser's own share */
function fileOf (url: string): File | undefined {
  try {
    const bin = atob(url.slice(url.indexOf(',') + 1)), bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new File([bytes], POSTCARD_FILE, { type: 'image/png' });
  } catch { return undefined; }
}

/** how this device hands the postcard on (the one showing when tapped): Android's share sheet, the browser's share, or a download */
function howToSend (current: () => Postcard): { label: string, send: () => Promise<void> } {
  const share = native.sharePicture;
  if (share) {
    return { label: 'Share', send: async () => { if (!(await share(current().url))) snackbar('Your phone couldn’t open its share sheet. Try again.'); } };
  }
  const file = fileOf(current().url), nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (file && typeof nav.share === 'function' && nav.canShare?.({ files: [file] })) {
    return { label: 'Share', send: async () => { const f = fileOf(current().url); if (f) await nav.share({ files: [f] }).catch(() => undefined); } };
  }
  return { label: 'Save', send: async () => {
    const a = h('a', { href: current().url, download: POSTCARD_FILE, hidden: true });
    document.body.appendChild(a);
    a.click();
    a.remove();
  } };
}

/** What the sheet can put on the card: the plain picture, or a week's almanac. */
export type CardKind = 'plain' | Which;
const KIND_LABEL: Record<CardKind, string> = { plain: 'Picture only', this: 'This week', last: 'Last week' };

/**
 * The postcard's preview and its one action (Share on the phone), with a choice of almanac when there is one.
 * Closing it in any way (Close, Back, the scrim, after Share) calls done.
 */
export function showPostcard (picture: Picture, weeks: Partial<Record<Which, Almanac>>, start: CardKind, done: () => void) {
  const kinds = (['plain', 'this', 'last'] as CardKind[]).filter(k => k === 'plain' || weeks[k as Which]);
  let kind: CardKind = kinds.includes(start) ? start : 'plain';
  let card = cardOf(picture, kind === 'plain' ? undefined : weeks[kind]);
  const how = howToSend(() => card);
  const img = h('img', { class: 'postcard-pic', src: card.url, alt: '', 'data-k': 'postcard-pic' });
  const describe = () => {
    const a = kind === 'plain' ? undefined : weeks[kind];
    img.alt = a ? `Your postcard: the playground as it is now, with the almanac of ${a.title.charAt(0).toLowerCase()}${a.title.slice(1)} (${a.lines.map(l => `${l.bold}${l.rest}`).join('; ')}) and Habitica’s art credit`
      : 'Your postcard: the playground as it is now, with Habitica’s art credit under it';
  };
  describe();
  const chips = kinds.length > 1 ? h('div', { class: 'rp-chips postcard-kinds', role: 'radiogroup', 'aria-label': 'On the postcard', 'data-k': 'postcard-kinds' }) : null;
  const drawChips = () => chips?.replaceChildren(...kinds.map(k => ripple(h('button', {
    class: `rp-chip small ${k === kind ? 'on' : ''}`, type: 'button', role: 'radio', 'aria-checked': k === kind ? 'true' : 'false', 'data-k': `postcard-${k}`,
    on: { click: () => pick(k) },
  }, KIND_LABEL[k]))));
  function pick (k: CardKind) {
    if (k === kind) return;
    kind = k;
    card = cardOf(picture, k === 'plain' ? undefined : weeks[k]);
    img.src = card.url;
    describe();
    drawChips();
  }
  drawChips();
  const body = h('div', { class: 'postcard' },
    chips,
    img,
    h('p', { class: 'small muted', 'data-k': 'postcard-note' }, native.sharePicture
      ? 'Your phone’s share sheet sends it where you choose. Habitica’s art credit is written on it, as its licence asks.'
      : 'Habitica’s art credit is written on it, as its licence asks.'),
    picture.riderLeftOut ? h('p', { class: 'small muted', 'data-k': 'postcard-rider' }, 'Your avatar isn’t on it: this browser can’t copy Habitica’s avatar pictures. In the Android app it’s there.') : null,
  );
  sheet('Postcard', body, [
    { label: 'Close', run: () => undefined },
    { label: how.label, primary: true, run: how.send },
  ], { onClose: done, k: 'postcard' });
}
