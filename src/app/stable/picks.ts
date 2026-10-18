/*
 * Who lives where in the Stable (design spec §06, approved 2026-10-14): one playground per scene at most (7), each
 * named after its scene (Vlad, 2026-10-14: no renaming, no scene twice), with up to 10 residents, pets and mounts mixed. A creature lives in one playground at a
 * time; choosing it for another moves it there. Stored on this phone only (localStorage, next to the app's
 * settings), one record per Habitica account; nothing about the Stable is ever sent anywhere.
 *
 * Until the player chooses anyone, the first playground (the Meadow) is simply whoever is out in Habitica
 * (items.currentPet and currentMount of the latest read), as before pet picking existed. The first choice
 * (picker, Move, Remove, a new playground) makes the arrangement the player's own.
 *
 * Pure apart from load/save: every change returns a new state, so Undo is putting the old one back.
 */
import { SCENES, SCENE_IDS, type SceneId } from '../../playground/scenes/palettes';
import { spriteMeta } from '../../stable/sprites';
import { petName } from '../model';

/** one playground per scene */
export const MAX_PLAYGROUNDS = SCENE_IDS.length;
export const MAX_RESIDENTS = 10;

/** 'pet:Wolf-Base' or 'mount:Wolf-Base' */
export type CreatureId = string;
export interface Spot { x: number, y: number }
export interface Pick { id: CreatureId, spot?: Spot }
export interface Playground { id: number, scene: SceneId, residents: Pick[] }
/** A playground is called by its scene's name. */
export const pgName = (p: { scene: SceneId }) => SCENES[p.scene].name;
export interface StableState {
  /** still following Habitica's current pet and mount (nothing chosen yet) */
  auto: boolean;
  /** the open playground's id */
  current: number;
  /** the next playground id to hand out (ids are never reused, so a seed stays with its playground) */
  next: number;
  playgrounds: Playground[];
}

/** The part of a Habitica read the Stable looks at. */
export interface StableItems { currentPet?: string, currentMount?: string, pets?: Record<string, unknown>, mounts?: Record<string, unknown> }

export const kindOf = (id: CreatureId): 'pet' | 'mount' => (id.startsWith('mount:') ? 'mount' : 'pet');
export const keyOf = (id: CreatureId) => id.slice(id.indexOf(':') + 1);
export const idOf = (kind: 'pet' | 'mount', key: string): CreatureId => `${kind}:${key}`;
/** in the app's sprite catalogue (anything else can't be drawn, so it is never offered or shown) */
export const known = (id: CreatureId) => !!spriteMeta(kindOf(id), keyOf(id));

/** Habitica's name for it: "Base Wolf", "Base Wolf mount", "Red Tiger mount" (a Tiger Cub grown up) */
export function creatureName (id: CreatureId, withKind = false): string {
  const mount = kindOf(id) === 'mount';
  const n = petName(keyOf(id), mount);
  return withKind && mount ? `${n} mount` : n;
}

/** What the account owns: pets Habitica counts as pets (a number above 0: -1 is raised into a mount, 0 released) and mounts set to true. */
export function owned (items: StableItems | undefined): Set<CreatureId> | undefined {
  if (!items || (!items.pets && !items.mounts)) return undefined;
  const out = new Set<CreatureId>();
  for (const [k, v] of Object.entries(items.pets || {})) if (typeof v === 'number' && v > 0) out.add(idOf('pet', k));
  for (const [k, v] of Object.entries(items.mounts || {})) if (v === true) out.add(idOf('mount', k));
  return out;
}

/** Whoever is out in Habitica now, as the first playground shows them until the player chooses. */
export function outInHabitica (items: StableItems | undefined): CreatureId[] {
  const ids: CreatureId[] = [];
  if (items?.currentPet) ids.push(idOf('pet', items.currentPet));
  if (items?.currentMount) ids.push(idOf('mount', items.currentMount));
  return ids.filter(known);
}

export function freshState (): StableState {
  return { auto: true, current: 1, next: 2, playgrounds: [{ id: 1, scene: 'meadow', residents: [] }] };
}

const clone = (s: StableState): StableState => ({ ...s, playgrounds: s.playgrounds.map(p => ({ ...p, residents: p.residents.map(r => ({ ...r })) })) });
/** the player changed something: from now on the arrangement is theirs */
const mine = (s: StableState) => { const c = clone(s); c.auto = false; return c; };
/** The arrangement as it is now, as the player's own (riding from the Stable keeps the mount where it is). */
export const keep = (s: StableState) => (s.auto ? mine(s) : s);

export const currentOf = (s: StableState): Playground => s.playgrounds.find(p => p.id === s.current) ?? s.playgrounds[0];
export const byId = (s: StableState, id: number) => s.playgrounds.find(p => p.id === id);
/** a playground's name by id, or `or` when it's gone */
export const nameOf = (s: StableState, id: number, or: string) => { const p = byId(s, id); return p ? pgName(p) : or; };
/** the playground a creature lives in, if any */
export const whereIs = (s: StableState, id: CreatureId) => s.playgrounds.find(p => p.residents.some(r => r.id === id));

/** Habitica's current pet and mount into the first playground while nothing is chosen; spots already saved are kept. */
export function followHabitica (s: StableState, items: StableItems | undefined): StableState {
  if (!s.auto) return s;
  const ids = outInHabitica(items);
  const home = s.playgrounds[0];
  if (home.residents.map(r => r.id).join() === ids.join()) return s;
  const c = clone(s);
  c.playgrounds[0].residents = ids.map(id => home.residents.find(r => r.id === id) ?? { id });
  return c;
}

/** Someone who left a playground on a read: raised into a mount, or released in Habitica. */
export interface Departure { id: CreatureId, from: number, mount?: CreatureId }

/** Drop residents the account no longer owns (only after a read that lists pets and mounts). */
export function reconcile (s: StableState, have: Set<CreatureId> | undefined, items?: StableItems): { state: StableState, gone: Departure[] } {
  if (s.auto || !have) return { state: s, gone: [] };
  const gone: Departure[] = [];
  for (const p of s.playgrounds) for (const r of p.residents) {
    if (have.has(r.id)) continue;
    const raised = kindOf(r.id) === 'pet' && items?.pets?.[keyOf(r.id)] === -1;
    const mount = idOf('mount', keyOf(r.id));
    gone.push({ id: r.id, from: p.id, mount: raised && have.has(mount) && known(mount) ? mount : undefined });
  }
  if (!gone.length) return { state: s, gone };
  const c = clone(s);
  for (const p of c.playgrounds) p.residents = p.residents.filter(r => have.has(r.id));
  return { state: c, gone };
}

export interface Moved { id: CreatureId, from: number }

/**
 * The picker's Save: exactly these creatures live in the playground, in this order (at most 10). Any of them
 * living elsewhere moves here; spots of those who stay are kept.
 */
export function choose (s: StableState, pg: number, ids: readonly CreatureId[]): { state: StableState, moved: Moved[] } {
  const target = byId(s, pg);
  if (!target) return { state: s, moved: [] };
  const want = [...new Set(ids)].filter(known).slice(0, MAX_RESIDENTS);
  const c = mine(s);
  const moved: Moved[] = s.playgrounds.filter(p => p.id !== pg).flatMap(p => p.residents.filter(r => want.includes(r.id)).map(r => ({ id: r.id, from: p.id })));
  for (const p of c.playgrounds) if (p.id !== pg) p.residents = p.residents.filter(r => !want.includes(r.id));
  const t = byId(c, pg)!;
  t.residents = want.map(id => target.residents.find(r => r.id === id) ?? { id });
  return { state: c, moved };
}

/** Add one creature to a playground (a mount that grew from a pet there). False when it's full or it lives elsewhere. */
export function add (s: StableState, pg: number, id: CreatureId): StableState | undefined {
  const p = byId(s, pg);
  if (!p || p.residents.length >= MAX_RESIDENTS || whereIs(s, id) || !known(id)) return undefined;
  return choose(s, pg, [...p.residents.map(r => r.id), id]).state;
}

/** The creature sheet's Move: to another playground (with room), keeping nothing of its old spot. */
export function moveTo (s: StableState, id: CreatureId, to: number): StableState | undefined {
  const t = byId(s, to);
  const from = whereIs(s, id);
  if (!t || !from || from.id === to || t.residents.length >= MAX_RESIDENTS) return undefined;
  const c = mine(s);
  byId(c, from.id)!.residents = from.residents.filter(r => r.id !== id);
  byId(c, to)!.residents.push({ id });
  return c;
}

/** The creature sheet's Remove: it leaves the playground (it stays in the Habitica stable, of course). */
export function remove (s: StableState, id: CreatureId): StableState {
  const c = mine(s);
  for (const p of c.playgrounds) p.residents = p.residents.filter(r => r.id !== id);
  return c;
}

/** Where a creature was dropped (or nudged to): remembered so it stands there next time. */
export function setSpot (s: StableState, id: CreatureId, spot: Spot): StableState {
  const c = clone(s);
  for (const p of c.playgrounds) for (const r of p.residents) if (r.id === id) r.spot = { x: round(spot.x), y: round(spot.y) };
  return c;
}
const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;

/** the scenes no playground uses yet, in the scenes' order */
export const freeScenes = (s: StableState): SceneId[] => SCENE_IDS.filter(id => !s.playgrounds.some(p => p.scene === id));

/** A new playground in a scene not used yet, opened at once. Undefined when that scene is taken (so also at 7). */
export function addPlayground (s: StableState, scene: SceneId): StableState | undefined {
  if (!freeScenes(s).includes(scene)) return undefined;
  const c = mine(s);
  c.playgrounds.push({ id: c.next, scene, residents: [] });
  c.current = c.next;
  c.next++;
  return c;
}

/** Change scene: the playground becomes the other scene's, name and all, with its residents. Only to a scene not used yet. */
export function changeScene (s: StableState, pg: number, scene: SceneId): StableState | undefined {
  if (!byId(s, pg) || !freeScenes(s).includes(scene)) return undefined;
  const c = mine(s);
  byId(c, pg)!.scene = scene;
  return c;
}

/** Delete a playground (never the last one); its residents simply leave the Stable. The open one moves to a neighbour. */
export function deletePlayground (s: StableState, pg: number): StableState | undefined {
  const i = s.playgrounds.findIndex(p => p.id === pg);
  if (i < 0 || s.playgrounds.length <= 1) return undefined;
  const c = mine(s);
  c.playgrounds.splice(i, 1);
  if (c.current === pg) c.current = c.playgrounds[Math.min(i, c.playgrounds.length - 1)].id;
  return c;
}

export function open (s: StableState, pg: number): StableState {
  if (s.current === pg || !byId(s, pg)) return s;
  return { ...clone(s), current: pg };
}

/* ---- storage */

const KEY = 'critoracle:v2:stable';

/**
 * A stored state, checked field by field (an old or hand-edited record can't break the Stable).
 *
 * Records from before one-playground-per-scene may hold custom names and the same scene twice (up to 8). Names
 * are dropped (a playground is called by its scene). A later playground in a scene already seen folds into the
 * first one: its residents join it while there is room (10), in their order and without their old spots; any who
 * don't fit keep their playground, moved to the first scene nobody uses; with no scene left (only possible with
 * more than 70 creatures in one scene), they leave the Stable, as Remove does. Opening a folded playground opens
 * the one it joined.
 */
export function normalize (v: unknown): StableState {
  const s = v as Partial<StableState> | null;
  if (!s || !Array.isArray(s.playgrounds)) return freshState();
  const seen = new Set<CreatureId>();
  const pgs: Playground[] = [];
  const overflow: Playground[] = [];
  const into = new Map<number, number>();
  const ids = new Set<number>();
  for (const p of s.playgrounds) {
    if (!p || typeof p.id !== 'number' || ids.has(p.id)) continue;
    ids.add(p.id);
    const residents: Pick[] = [];
    for (const r of Array.isArray(p.residents) ? p.residents : []) {
      if (!r || typeof r.id !== 'string' || seen.has(r.id) || !known(r.id) || residents.length >= MAX_RESIDENTS) continue;
      seen.add(r.id);
      const sp = r.spot && typeof r.spot.x === 'number' && typeof r.spot.y === 'number' ? { x: round(r.spot.x), y: round(r.spot.y) } : undefined;
      residents.push(sp ? { id: r.id, spot: sp } : { id: r.id });
    }
    const scene: SceneId = SCENE_IDS.includes(p.scene as SceneId) ? p.scene as SceneId : 'meadow';
    const first = pgs.find(x => x.scene === scene);
    if (!first) { pgs.push({ id: p.id, scene, residents }); continue; }
    const room = MAX_RESIDENTS - first.residents.length;
    first.residents.push(...residents.slice(0, room).map(r => ({ id: r.id })));
    if (residents.length > room) overflow.push({ id: p.id, scene, residents: residents.slice(room) });
    else into.set(p.id, first.id);
  }
  for (const p of overflow) {
    const scene = SCENE_IDS.find(id => !pgs.some(x => x.scene === id));
    if (scene) pgs.push({ ...p, scene });
    else into.set(p.id, pgs[0].id);
  }
  if (!pgs.length) return freshState();
  const next = Math.max(typeof s.next === 'number' ? s.next : 0, ...[...ids].map(id => id + 1));
  const want = typeof s.current === 'number' ? into.get(s.current) ?? s.current : undefined;
  const current = pgs.some(p => p.id === want) ? want! : pgs[0].id;
  return { auto: s.auto !== false, current, next, playgrounds: pgs };
}

function readAll (): Record<string, unknown> {
  try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
}

/** This account's Stable as stored on the phone (a fresh one if none). */
export function loadStable (userId: string | undefined): StableState {
  return normalize(userId ? readAll()[userId] : undefined);
}

export function saveStable (userId: string | undefined, s: StableState) {
  if (!userId) return;
  const all = readAll();
  all[userId] = s;
  try { localStorage.setItem(KEY, JSON.stringify(all)); } catch { /* private mode or full */ }
}
