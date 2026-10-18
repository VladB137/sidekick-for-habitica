/*
 * Who talks on Now (Vlad, 2026-10-17): the character standing in the meadow header and saying the speech bubble.
 * The player's avatar unless they choose one of their own pets or mounts in Settings (views/speaker.ts). A choice
 * the account doesn't own (released, raised into a mount, another account) shows the avatar instead and is kept,
 * so it comes back if the creature does.
 *
 * The avatar stands without its Habitica background: the meadow is its background here.
 *
 * The element is the same shape for both: a `.speaker` box with data-speaker = 'avatar' or the creature's id, the
 * picture inside it (`.avatar` for the avatar, `.speaker-art` holding a `.cpic` for a creature, mirrored so it
 * faces the bubble on its right). heroCharacter() gives it with its Speaker, for ui/talk.ts's talker().
 */
import { h } from './dom';
import { avatarView } from './avatar';
import { AVATAR_W, AVATAR_H } from '../avatar';
import { creaturePic } from './creature';
import { spriteMeta } from '../../stable/sprites';
import { keyOf, kindOf, known, owned, type CreatureId, type StableItems } from '../stable/picks';
import { called, calledFull, loadNames } from '../stable/names';
import { store } from '../store';
import type { Json } from '../../api/client';

/** 'avatar', or the creature: 'pet:Wolf-Base', 'mount:Wolf-Base' */
export type SpeakerId = 'avatar' | CreatureId;
/** who is talking, for what they say: `key` = Habitica's key ('Wolf-Shade'), `name` = what the app calls them */
export interface Speaker { kind: 'avatar' | 'pet' | 'mount', key?: string, name: string }

/**
 * Where the avatar stands in its AVATAR_W × AVATAR_H box: Habitica draws its 90 px body sprites at (24, 24), the
 * figure's opaque pixels spanning x 39–75 and down to y 84 of them (skin and shirt). A creature stands on the same
 * spot, so whatever places the avatar's box places the creature too.
 */
const FEET = { x: 24 + 57, y: 24 + 84 };
/**
 * CSS px per Habitica image px: a mount at the avatar's own scale, as Habitica draws one; a pet half as big again
 * (Vlad, 2026-10-17), as long as it still fits the avatar's box above its feet and across it.
 */
export const SPEAKER_SCALE = 1;
const PET_SCALE = 1.5;
const speakerScale = (m: { kind: 'pet' | 'mount', w: number, h: number }) =>
  m.kind === 'mount' ? SPEAKER_SCALE : Math.max(SPEAKER_SCALE, Math.min(PET_SCALE, (FEET.y - 4) / m.h, (AVATAR_W - 4) / m.w));

/** The chosen creature if the account owns it and the app can draw it, else the avatar. */
export function speakerOf (choice: string | undefined, items: StableItems | undefined): SpeakerId {
  if (!choice || !known(choice)) return 'avatar';
  return owned(items)?.has(choice) ? choice : 'avatar';
}

/** The talking character for the latest read, or an empty avatar box before there is one. */
export function speakerView (raw: Json | undefined = store.raw, choice = store.settings.speaker): HTMLElement {
  const who = speakerOf(choice, raw?.items as StableItems | undefined);
  if (who === 'avatar') {
    const el = raw ? avatarView(raw, 1, { avatarOnly: true, background: false, k: 'hero-avatar', mouth: true }) : h('div', { class: 'avatar', 'data-k': 'hero-avatar' });
    el.classList.add('speaker');
    el.dataset.speaker = 'avatar';
    return el;
  }
  const m = spriteMeta(kindOf(who), keyOf(who))!;
  return h('div', {
    class: `speaker creature ${m.kind}`, role: 'img', 'aria-label': calledFull(loadNames(store.snap?.userId), who),
    'data-k': 'hero-speaker', 'data-speaker': who, style: `width:${AVATAR_W}px;height:${AVATAR_H}px`,
  }, h('div', { class: `speaker-art ${m.facing === 'left' ? 'mirror' : ''}`.trim(), style: `left:${FEET.x}px;bottom:${AVATAR_H - FEET.y}px` },
    creaturePic(who, Math.max(m.w, m.h) * speakerScale(m))));
}

/** Now's character for the latest read and the chosen one: the element, and who it is. */
export function heroCharacter (raw: Json | undefined = store.raw, choice = store.settings.speaker): { el: HTMLElement, speaker: Speaker } {
  const who = speakerOf(choice, raw?.items as StableItems | undefined);
  const speaker: Speaker = who === 'avatar'
    ? { kind: 'avatar', name: store.snap?.name || 'you' }
    : { kind: kindOf(who), key: keyOf(who), name: called(loadNames(store.snap?.userId), who) };
  return { el: speakerView(raw, choice), speaker };
}

/** The avatar for a small square (Settings' row, the chooser's tile): its figure, not its box, centred where this goes. */
export function avatarFigure (raw: Json, scale: number, k: string): HTMLElement {
  const el = avatarView(raw, scale, { avatarOnly: true, background: false, k });
  // the figure's middle: x as FEET, y halfway up its 60 px (head_0 starts 24 px into the sprite)
  el.style.left = `${-FEET.x * scale}px`; el.style.top = `${-(FEET.y - 30) * scale}px`;
  return h('span', { class: 'avatar-figure' }, el);
}

/** "Your avatar", or "Ruby, Red Wolf mount": Settings' row and the chooser. */
export function speakerName (who: SpeakerId): string {
  return who === 'avatar' ? 'Your avatar' : calledFull(loadNames(store.snap?.userId), who);
}
