/**
 * The player's Habitica avatar, layered the way Habitica's own client draws it
 * (website/client/src/components/avatar.vue at the rules.ts tag): background, mount body, visual buff or the avatar
 * (chair, back, skin, shirt, head, armour, back collar, hair, body, eyewear, head gear, head accessory, flower,
 * shield, weapon), sleep, mount head, pet. Every layer is one of Habitica's own images at its natural size, placed
 * at Habitica's origin: the background fills the 141×147 box; avatar layers start at (24, 24), or (24, 0) when riding,
 * with the 24 px Kangaroo offset; mounts at (24, 18) (sprites.css: "accommodates 105x123 box"); the pet bottom-left
 * (its image's height decides where its top is, so the renderer anchors it to the bottom).
 * Pure: the Stable's riding and the Now screen's avatarView (ui/avatar.ts) both draw from it.
 */
import type { Json } from '../api/client';

export const AVATAR_W = 141;
export const AVATAR_H = 147;

/** file: the image under Habitica's asset path; x, y: its top-left in Habitica px (the pet: bottom-left, `bottom`). */
export interface AvatarLayer { name: string, file: string, x: number, y: number, bottom?: boolean, part: 'background' | 'mount' | 'avatar' | 'buff' | 'pet' | 'sleep' }

/**
 * Images Habitica's sprites.css draws from another file or with a margin (backer and contributor gear, animated
 * creatures and backgrounds): class -> [file, margin-left, margin-top]. tests/avatar.test.ts checks this table against
 * that stylesheet at the rules.ts tag; everything else is <class>.png at no offset (spritesmith-main.css).
 */
const SPECIAL: Record<string, [string, number?, number?]> = {
  weapon_special_0: ['BackerOnly-Weapon-DarkSoulsBlade.gif', -3, -18],
  head_special_0: ['BackerOnly-Equip-ShadeHelmet.gif', -3, -18],
  slim_armor_special_0: ['BackerOnly-Equip-ShadeArmor.gif'],
  broad_armor_special_0: ['BackerOnly-Equip-ShadeArmor.gif'],
  shield_special_0: ['BackerOnly-Shield-TormentedSkull.gif'],
  weapon_special_critical: ['weapon_special_critical.gif', -12, 12],
  weapon_special_1: ['weapon_special_1.png', -12],
  slim_armor_special_1: ['ContributorOnly-Equip-CrystalArmor.gif'],
  broad_armor_special_1: ['ContributorOnly-Equip-CrystalArmor.gif'],
  head_special_1: ['ContributorOnly-Equip-CrystalHelmet.gif', 0, 3],
  back_special_heroicAureole: ['back_special_heroicAureole.gif'],
  slim_armor_special_ks2019: ['BackerOnly-Equip-MythicGryphonArmor.gif'],
  broad_armor_special_ks2019: ['BackerOnly-Equip-MythicGryphonArmor.gif'],
  eyewear_special_ks2019: ['BackerOnly-Equip-MythicGryphonVisor.gif'],
  head_special_ks2019: ['BackerOnly-Equip-MythicGryphonHelm.gif'],
  shield_special_ks2019: ['BackerOnly-Equip-MythicGryphonShield.gif'],
  weapon_special_ks2019: ['BackerOnly-Equip-MythicGryphonGlaive.gif'],
  'Pet-Wolf-Cerberus': ['BackerOnly-Pet-CerberusPup.gif'],
  'Pet-Gryphon-Gryphatrice': ['BackerOnly-Pet-Gryphatrice.gif'],
  'Pet-Gryphatrice-Jubilant': ['Pet-Gryphatrice-Jubilant.gif'],
  'Mount_Head_Gryphon-Gryphatrice': ['BackerOnly-Mount-Head-Gryphatrice.gif'],
  'Mount_Body_Gryphon-Gryphatrice': ['BackerOnly-Mount-Body-Gryphatrice.gif'],
  'Mount_Head_Dragon-Hydra': ['Mount_Head_Dragon-Hydra.gif'],
  'Mount_Body_Dragon-Hydra': ['Mount_Body_Dragon-Hydra.gif'],
  background_airship: ['background_airship.gif'],
  background_clocktower: ['background_clocktower.gif'],
  background_steamworks: ['background_steamworks.gif'],
};
export const AVATAR_SPECIAL = SPECIAL;

/** Defaults are Habitica's own (website/server/models/user/schema.js), for a preference a read leaves out. */
const DEF = { size: 'slim', skin: '915533', shirt: 'blue', chair: 'none', hair: { color: 'red', base: 3, bangs: 1, beard: 0, mustache: 0, flower: 1 } };

/** Gear keys Habitica draws nothing for: the empty slot of each type. */
const empty = (k?: string) => !k || /_base_0$/.test(k);

/** fool: April Fools' joke potion (stable/calendar.ts foolsSwap): the pet shows as Habitica shows it that day, no pet as its Wolf */
export function avatarLayers (u: Json, opts: { avatarOnly?: boolean, background?: boolean, fool?: (pet: string | undefined) => string } = {}): AvatarLayer[] {
  const p = u?.preferences || {};
  const items = u?.items || {};
  const buffs = u?.stats?.buffs || {};
  const cls = u?.stats?.class || 'warrior';
  const size = p.size || DEF.size;
  const hair = { ...DEF.hair, ...(p.hair || {}) };
  const gear: Json = (p.costume ? items.gear?.costume : items.gear?.equipped) || {};
  const mount: string | undefined = opts.avatarOnly ? undefined : items.currentMount || undefined;
  const pet: string | undefined = opts.avatarOnly ? undefined : opts.fool ? opts.fool(items.currentPet || undefined) : items.currentPet || undefined;
  const top = mount ? 0 : 24;
  const kangaroo = mount?.includes('Kangaroo') ? 24 : 0;
  const out: AvatarLayer[] = [];
  const put = (name: string, part: AvatarLayer['part'], x: number, y: number, bottom?: boolean) => {
    const sp = SPECIAL[name];
    out.push({ name, file: sp ? sp[0] : `${name}.png`, x: x + (sp?.[1] ?? 0), y: y + (sp?.[2] ?? 0), bottom, part });
  };
  const at = (name: string, part: AvatarLayer['part'], dy = 0) => put(name, part, 24, top + dy);
  if (p.background && opts.background !== false) put(`background_${p.background}`, 'background', 0, 0);
  // the Invisible Aether mount has no image: the avatar still sits as when riding
  const drawn = mount && mount !== 'Aether-Invisible';
  if (drawn) put(`Mount_Body_${mount}`, 'mount', 24, 18);
  const visual: Record<string, string> = { snowball: `avatar_snowball_${cls}`, spookySparkles: 'ghost', shinySeed: `avatar_floral_${cls}`, seafoam: 'seafoam_star' };
  const buff = Object.keys(visual).find(k => buffs[k]);
  if (buff) at(visual[buff], 'buff');
  if (hair.flower) at(`hair_flower_${hair.flower}`, 'avatar', kangaroo);
  if (!buff) {
    const layer = (name: string | undefined) => { if (name) at(name, 'avatar', kangaroo); };
    layer(p.chair && p.chair !== 'none' ? `chair_${p.chair}` : undefined);
    layer(empty(gear.back) ? undefined : gear.back);
    layer(`skin_${p.skin || DEF.skin}${p.sleep ? '_sleep' : ''}`);
    layer(`${size}_shirt_${p.shirt || DEF.shirt}`);
    layer('head_0');
    layer(empty(gear.armor) ? undefined : `${size}_${gear.armor}`);
    layer(empty(gear.back_collar) ? undefined : gear.back_collar);
    for (const slot of ['bangs', 'base', 'mustache', 'beard'] as const) layer(hair[slot] ? `hair_${slot}_${hair[slot]}_${hair.color}` : undefined);
    for (const slot of ['body', 'eyewear', 'head', 'headAccessory'] as const) layer(empty(gear[slot]) ? undefined : gear[slot]);
    layer(hair.flower ? `hair_flower_${hair.flower}` : undefined);
    layer(empty(gear.shield) ? undefined : gear.shield);
    layer(empty(gear.weapon) ? undefined : gear.weapon);
  }
  if (p.sleep) put('zzz', 'sleep', 24, top);
  if (drawn) put(`Mount_Head_${mount}`, 'mount', 24, 18);
  if (pet) put(`Pet-${pet}`, 'pet', 0, 0, true);
  return out;
}
