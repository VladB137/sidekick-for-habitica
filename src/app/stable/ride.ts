/*
 * Riding (design spec §07), the Stable's one real Habitica action: POST /user/equip/mount/{key}. Habitica's equip
 * is a toggle (common/script/ops/equip.js: currentMount = currentMount === key ? '' : key), so the call is sent
 * only when the latest read says the player isn't on that mount (Ride) or is (Get off).
 *
 * The rider is the player's avatar from avatar.ts, the layers Habitica's avatar.vue draws between a mount's body
 * and its head, placed from the mount's own image the way avatar.vue places both. Pure: main bundle safe.
 */
import type { Json } from '../../api/client';
import { avatarLayers } from '../avatar';
import { spriteMeta } from '../../stable/sprites';

/** avatar.vue draws a mount's body and head from (24, 18) in the avatar's box */
const MOUNT_AT = { x: 24, y: 18 };

/** One of Habitica's avatar images (under ui/dom.ts SPRITES), its top-left from the top-left of the mount's cell. */
export interface RiderPart { file: string, x: number, y: number }

/**
 * The account's current mount and the avatar riding it, in the bundled sheet's coordinates (the cell is cropped
 * out of Habitica's image, so the crop's corner is taken off). Undefined when it rides nothing the Stable can draw.
 */
export function riderOf (u: Json): { mount: string, parts: RiderPart[] } | undefined {
  const mount: string | undefined = u?.items?.currentMount || undefined;
  const at = mount ? spriteMeta('mount', mount)?.at : undefined;
  if (!mount || !at) return undefined;
  const parts = avatarLayers(u).filter(l => l.part === 'avatar' || l.part === 'buff')
    .map(l => ({ file: l.file, x: l.x - MOUNT_AT.x - at.x, y: l.y - MOUNT_AT.y - at.y }));
  return { mount, parts };
}

/**
 * Where the avatar's body ends in Habitica's avatar box when it stands on foot: its pictures start at (24, 24)
 * and the body (skin and shirt, 90 x 90 images) fills columns 39 to 74 and rows down to 83 of them. The point
 * under its feet is the middle of the body, on its last row.
 */
const FOOT = { x: 24 + 57, y: 24 + 83 };

/**
 * The player's avatar on foot (idea 8), standing in the Stable when it rides nothing there: Habitica's avatar
 * pictures with no mount or pet, a visual buff (snowball, ghost, flower, starfish) as Habitica shows it, and
 * Habitica's own sleeping face and Zzz while resting in the Inn, each placed from the point under its feet.
 */
export function standingOf (u: Json): RiderPart[] {
  if (!u) return [];
  return avatarLayers(u, { avatarOnly: true }).filter(l => l.part === 'avatar' || l.part === 'buff' || l.part === 'sleep')
    .map(l => ({ file: l.file, x: l.x - FOOT.x, y: l.y - FOOT.y }));
}

/** Resting in Habitica's Inn (preferences.sleep): the herd sleeps by the door and the light dims. */
export const resting = (u: Json): boolean => !!u?.preferences?.sleep;

/** Whether a tap may send the toggle: Ride only when not on that mount, Get off only when on it (per the latest read). */
export function mayToggle (current: string | undefined, key: string, on: boolean): boolean {
  return on ? (current || '') !== key : (current || '') === key;
}
