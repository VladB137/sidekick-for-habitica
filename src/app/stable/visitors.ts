/*
 * Party visitors (idea 9, 2026-10-15): now and then a party member's creature walks into the open playground
 * from one side, mixes with the herd for a minute or two, and walks out again; at most two at a time, everyone
 * in the party getting a turn. A member riding a mount comes on it, with their avatar in the saddle; otherwise
 * their current pet comes. A tap shows whose it is ("Ana's Golden Fox").
 *
 * Nothing is asked of Habitica for this: the party's members are already read with the party, at most every
 * 5 minutes (store.ts), and Habitica's reply carries each member's public items and avatar look (publicFields,
 * website/server/models/user/index.js at the rules.ts tag). Other players' names and looks are kept in memory
 * only, never stored, and never reach the widget or the wallpaper. No visitors arrive from bedtime to morning
 * or while the player rests in the Inn; those visiting then head home. With reduced motion the first two simply
 * stand in the meadow.
 */
import type { Json } from '../../api/client';
import type { Herd, Layer, Resident, World } from '../../playground';
import { unwritable } from '../../playground/font';
import { spriteMeta } from '../../stable/sprites';
import type { PartyMember } from '../model';
import { MAX_NAME } from './names';
import { creatureName, idOf } from './picks';
import { riderOf, type RiderPart } from './ride';

/** at most this many visitors at once */
export const MAX_VISITORS = 2;
/** ticks (30 a second): the first one comes 3 to 8 s after the playground opens, the next 20 to 70 s after
 * that, and each stays 1 to 2 minutes */
const FIRST = [90, 240] as const, GAP = [600, 2100] as const, STAY = [1800, 3600] as const;
/** a tag longer than this says "Ana's mount" instead of the creature's whole name */
const LONG_TAG = 24;

/** One party member's creature, ready to visit. */
export interface Guest {
  /** the visiting creature's id in the herd (never a resident's) */
  id: string;
  /** the member's Habitica user id */
  member: string;
  /** what its tag says: "Ana's Golden Fox" */
  label: string;
  resident: Resident;
  /** the member's avatar in the saddle, on a mount */
  rider: RiderPart[];
}

/** A member's name as the meadow's font can write it, at most 12 letters; "A friend" when nothing is left. */
export function writableName (name: string): string {
  const kept = [...name.normalize('NFC')].filter(ch => !unwritable(ch).length).join('').replace(/\s+/g, ' ').trim();
  return [...kept].slice(0, MAX_NAME).join('').trim() || 'A friend';
}

/**
 * Who could visit: every other member whose current mount (ridden, with their avatar on it) or else current pet
 * the Stable can draw. In the party's order, which is Habitica's.
 */
export function guestsOf (members: readonly PartyMember[], me: string | undefined): Guest[] {
  const out: Guest[] = [];
  for (const m of members) {
    if (!m.id || m.id === me) continue;
    const kind = m.mount && spriteMeta('mount', m.mount) ? 'mount' : m.pet && spriteMeta('pet', m.pet) ? 'pet' : undefined;
    if (!kind) continue;
    const key = (kind === 'mount' ? m.mount : m.pet)!, meta = spriteMeta(kind, key)!, cid = idOf(kind, key);
    const id = `visitor:${m.id}:${cid}`, who = writableName(m.name);
    const full = `${who}'s ${creatureName(cid)}`;
    const resident: Resident = kind === 'pet'
      ? { id, sprite: meta.key, kind, species: meta.species, visitor: true }
      : { id, sprite: `mount:${meta.key}`, head: `mount:${meta.key}#head`, kind, species: meta.species, visitor: true };
    out.push({
      id, member: m.id, label: [...full].length > LONG_TAG ? `${who}'s ${kind}` : full, resident,
      rider: kind === 'mount' ? riderOf(m.look as Json)?.parts ?? [] : [],
    });
  }
  return out;
}

export interface VisitorOptions {
  /** who could visit now */
  guests: () => readonly Guest[];
  /** bring this one in (load its pictures, add it to the herd); false when it couldn't come */
  arrive: (g: Guest) => Promise<boolean>;
  /** someone arrived or left (for TalkBack) */
  changed?: () => void;
}

/** The visits' timetable, as a layer of the open playground's world: it draws nothing. */
export class Visitors implements Layer {
  readonly id = 'visitors';
  readonly depth = 'back' as const;
  private readonly rng;
  /** when the next one may come (world tick) */
  private next: number;
  /** who is here and when they leave (world tick) */
  private stays = new Map<string, number>();
  /** on the way in (pictures loading) */
  private loading = new Set<string>();
  /** members who came, the latest last: the others go first */
  private recent: string[] = [];
  private labels = new Map<string, string>();

  constructor (private herd: Herd, private o: VisitorOptions) {
    this.rng = herd.world.rng.fork('visitors');
    this.next = this.rng.int(FIRST[0], FIRST[1]);
  }

  /** a visitor's tag, by its id in the herd */
  label (id: string): string | undefined { return this.labels.get(id); }

  /** who is visiting now: tags, in the order they came */
  here (): string[] {
    return this.herd.creatures.filter(c => c.visitor && !c.leaving).map(c => this.labels.get(c.id) ?? '').filter(Boolean);
  }

  update (w: World) {
    const t = w.tick, guests = this.o.guests(), ids = new Set(guests.map(g => g.id)), night = this.herd.night();
    let changed = false;
    for (const [id, until] of this.stays) {
      const c = this.herd.byId(id);
      if (!c) { this.stays.delete(id); changed = true; continue; }
      if (!c.leaving && (t >= until || night || !ids.has(id))) this.herd.leave(id);
    }
    if (changed) this.o.changed?.();
    if (t < this.next || night || this.stays.size + this.loading.size >= MAX_VISITORS) return;
    this.next = t + this.rng.int(GAP[0], GAP[1]);
    const free = guests.filter(g => !this.stays.has(g.id) && !this.loading.has(g.id) && !this.herd.byId(g.id));
    if (!free.length) return;
    // whoever came longest ago (or never) first
    const rank = (g: Guest) => this.recent.indexOf(g.member);
    const first = Math.min(...free.map(rank));
    this.bring(this.rng.pick(free.filter(g => rank(g) === first)), this.rng.int(STAY[0], STAY[1]));
  }

  draw () { /* the visitors draw themselves, as the herd's creatures */ }

  /** After each read in the still picture: the first two just stand in the meadow (none at night). */
  sync () {
    if (!this.herd.still()) return;
    const gs = this.herd.night() ? [] : this.o.guests().slice(0, MAX_VISITORS), want = new Set(gs.map(g => g.id));
    for (const c of [...this.herd.creatures]) if (c.visitor && !want.has(c.id)) { this.herd.leave(c.id); this.stays.delete(c.id); }
    for (const g of gs) if (!this.herd.byId(g.id) && !this.loading.has(g.id)) this.bring(g, Infinity);
    this.o.changed?.();
  }

  private bring (g: Guest, stay: number) {
    this.loading.add(g.id);
    this.labels.set(g.id, g.label);
    this.recent = [...this.recent.filter(m => m !== g.member), g.member];
    this.o.arrive(g).then(ok => ok, () => false).then(ok => {
      this.loading.delete(g.id);
      if (!ok) return;
      this.stays.set(g.id, this.herd.world.tick + stay);
      this.o.changed?.();
    });
  }
}
