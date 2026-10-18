/*
 * The Stable's playground on the Stable screen: the engine (src/playground), the open playground's scene,
 * Habitica's sprites (src/stable/source.ts) and its residents, mounted on the stage that stable/host.ts hands
 * over, with the Stable's own toolbar and residents row (chrome.ts) around the meadow.
 *
 * Who lives where is the phone's own record (picks.ts). Until the player chooses anyone, the first playground
 * (the Meadow) is the account's current pet and mount. The sheets ship with the app and a new read only changes who can live
 * here (a pet raised into a mount, or released, leaves its playground). The one call to Habitica is a mount's
 * Ride or Get off (store.ride); when the mount the account rides lives in the open playground, the player's
 * avatar rides it (ride.ts), drawn from Habitica's avatar images like the Now screen's avatar. Otherwise the
 * avatar stands on foot by the stable's door, and the creatures come over to greet it now and then; while the
 * player rests in Habitica's Inn the stable dims and the herd sleeps by the door.
 *
 * Party members' creatures come to visit now and then (visitors.ts), from the party read the app already makes.
 *
 * Each creature living in a playground has a name (names.ts), shown over its head for a moment when it's tapped,
 * stroked, carried, found or moves in (nametag.ts).
 *
 * The toolbar's camera makes a postcard of the meadow as it stands (postcard.ts), to share through the phone.
 *
 * Play (toybox.ts, src/playground/play): each playground's own toy, the toy box's toys (the button beside full
 * screen), and a pet hiding behind the playground's hiding spot until it's found (again two minutes after each find).
 *
 * The scene reacts to the account (reactions.ts, spec §08) from the same reads: confetti for a crit landed in
 * the app, the boss's silhouette in the sky during a boss quest and breaking up in confetti once the quest is
 * won, a collection quest's finds lying in the grass (finds.ts) and bursting once it is won, the lantern lit
 * after a level-up, and the creatures gathered by the stable's door when HP is low.
 *
 * Habitica's feast days decorate the scene, the account's anniversary too, and on April Fools every pet shows as
 * Habitica's joke pet of the year, as Habitica itself shows it (calendar.ts). Names and lists keep the real pet.
 *
 * Once the stable is built, tapping it goes into the barn (barn.ts): a stage of its own over this one, which
 * stops while the barn is open; Back or the barn's arrow comes out again.
 */
import { ART, World, Herd, Creature, mountStage, type Interaction, type Resident, type RiderLayer, type Stage } from '../../playground';
import {
  AmbientLayer, BossLayer, FindsLayer, FireworksLayer, LanternLayer, SceneLayer, SparkleLayer, WeatherLayer, bossScale, withProps, ballPicture, NO_GROWTH, STABLE_STAGES, type GrowthMark,
} from '../../playground/scenes';
import { habiticaDay } from '../../engine';
import { HINT_STYLES, Hints, OWN_TOY, Play, SPOTS, type BoxToy, type HintStyle } from '../../playground/play';
import { stableSprites } from '../../stable/source';
import { natureOf } from '../../stable/natures';
import { spriteMeta } from '../../stable/sprites';
import findsData from '../../data/quest-finds.json';
import { store } from '../store';
import { native } from '../native';
import { SPRITES, backLayer, buzz, h, snackbar } from '../ui/dom';
import { BAR_H, ROW_H, makeChrome } from './chrome';
import {
  add, creatureName, currentOf, followHabitica, idOf, keep, keyOf, kindOf, known, loadStable, nameOf, owned, pgName, reconcile, saveStable, setSpot,
  type CreatureId, type Departure, type Pick, type Playground, type StableItems, type StableState,
} from './picks';
import { announcement, atLeast, growthOf, loadGrown, newSteps, openDailies, sameGrowth, saveGrown, trophyProgress } from './growth';
import { trophyName } from './trophies';
import { openBarn, type Barn } from './barn';
import type { StableContext, StableInsets, StableScene } from './host';
import { resting, riderOf, standingOf, type RiderPart } from './ride';
import { withSocial } from './social';
import { guestsOf, Visitors, type Guest } from './visitors';
import { called, loadNames, localDay, nameOf as ownName, rename, saveNames, type Names } from './names';
import { assign, residentIds } from './naming';
import { NameTagLayer, TAG_MS } from './nametag';
import { FIND_PICTURES, GLINTS, allFound, describeFinds, findsOf, type QuestFinds } from './finds';
import { pictureOf, showPostcard, type CardKind, type Picture } from './postcard';
import { almanacOf, hasLastWeek, lastWeekReady, markOffered } from '../almanac';
import { hiderFor, justFound, loadPlay, markFound, openToyBox, roundOf, savePlay, setToys, toysOut, TOY_NAMES, type PlayRec } from './toybox';
import {
  bossName, bossOf, bossShape, critToCelebrate, loadCelebrated, loadWins, noteWins, saveCelebrated, saveWins, winToCelebrate, worried,
} from './reactions';
import { foolPet, potionName, today, type Today } from './calendar';
import { SweetheartsLayer } from './sweethearts';
import type { Feast } from '../../playground/scenes/feasts';

/**
 * Habitica's avatar images, decoded once for the app's life (the same few each time); undefined = can't load.
 * In the APK the phone fetches them (native.avatarPicture), so the canvas stays readable and a postcard can carry
 * the rider; a browser loads them from Habitica's image server, which sends no CORS headers (postcard.ts copes).
 */
const avatarImages = new Map<string, Promise<HTMLImageElement | undefined>>();
function avatarImage (file: string): Promise<HTMLImageElement | undefined> {
  let p = avatarImages.get(file);
  if (!p) {
    const img = new Image();
    img.referrerPolicy = 'no-referrer';
    const fetched = native.avatarPicture;
    p = (fetched ? fetched(file) : Promise.resolve(`${SPRITES}${file}`))
      .then(src => { if (!src) throw new Error('no picture'); img.src = src; return img.decode(); })
      .then(() => img, () => { avatarImages.delete(file); return undefined; }); // offline: try again next time
    avatarImages.set(file, p);
  }
  return p;
}
/** The rider's pictures; an image that won't load (offline, or an old key) is left out, as on the Now screen. */
async function riderLayers (parts: readonly RiderPart[]): Promise<RiderLayer[]> {
  const imgs = await Promise.all(parts.map(p => avatarImage(p.file)));
  return parts.flatMap((p, i) => { const im = imgs[i]; return im ? [{ image: im, x: p.x, y: p.y, w: im.naturalWidth, h: im.naturalHeight }] : []; });
}

/**
 * The quest just won, and the party as read before the win: the party is read every 5 minutes, the counts with
 * every read, so until the party is read again its quest is still running and its boss stays out of the sky.
 * Kept for the app's life: the Stable screen is built again on each visit.
 */
let beaten: { key: string, party: unknown } | undefined;

/** The finds' pictures (public/stable/finds.png), loaded the first time a collection quest needs them. */
let findsSheet: HTMLImageElement | undefined;
let findsSheetReady: Promise<void> | undefined;
function loadFindsSheet (): Promise<void> {
  if (!findsSheetReady) {
    const img = new Image();
    img.src = `stable/finds.png?v=${findsData.images.slice(0, 7)}`;
    findsSheetReady = img.decode().then(() => { findsSheet = img; }, () => { findsSheetReady = undefined; });
  }
  return findsSheetReady;
}

/** What the finds layer shows for a quest's finds: a picture per find shown, a glint per find today. */
function findsShown (f: QuestFinds) {
  const pictures = f.finds.flatMap(x => {
    const c = FIND_PICTURES[x.key];
    return c ? Array.from({ length: x.shown }, () => ({ key: x.key, sx: c[0], sy: c[1], w: c[2], h: c[3] })) : [];
  });
  return { seed: f.quest, pictures, glints: Math.min(GLINTS, f.today) };
}

/** One stored pick as the herd's resident (with the spot it was dropped on); on April Fools a pet wears the year's joke (swap). */
export function residentOf (p: Pick, swap?: string): Resident | undefined {
  const kind = kindOf(p.id), m = spriteMeta(kind, keyOf(p.id));
  if (!m) return undefined;
  const fool = kind === 'pet' && swap ? spriteMeta('pet', foolPet(m.key, swap)) : undefined;
  return kind === 'pet'
    ? { id: p.id, sprite: (fool ?? m).key, kind, species: m.species, spot: p.spot, nature: natureOf(kind, m.key) }
    : { id: p.id, sprite: `mount:${m.key}`, head: `mount:${m.key}#head`, kind, species: m.species, spot: p.spot, nature: natureOf(kind, m.key) };
}

/** A playground's residents as the herd takes them: who can be drawn, with how they get on with each other (on
 * April Fools, `swap` gives the pets the day's other sheets; their natures stay their own). */
export const residentsFor = (picks: readonly Pick[], swap?: string): Resident[] =>
  withSocial(picks.map(p => residentOf(p, swap)).filter((r): r is Resident => !!r));

/** the feast in words, for TalkBack */
const FEAST_WORDS: Record<Feast, string> = {
  nye: 'New Year', birthday: 'Habitica\'s birthday', valentines: 'Valentine\'s', piDay: 'Pi Day', namingDay: 'Naming Day',
  habitoween: 'Habitoween', harvestFeast: 'the Harvest Feast', anniversary: 'your anniversary in Habitica',
};
/** the April Fools snackbar, once a day per app run */
let foolsTold = '';

/** "Ruby", "Ruby and Pip", "Ruby, Pip and Bao" */
const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** One open playground: its world on the stage. Switching playgrounds builds a new one. */
interface View {
  pg: number, scene: string, world: World, stage: Stage, herd: Herd, layer: SceneLayer, sparkle: SparkleLayer, who: string, rider: string,
  boss: BossLayer, lantern: LanternLayer, bossKey: string, worried: boolean, tags: NameTagLayer, visitors: Visitors, play: Play, hints: Hints,
  /** the feasts, anniversary and April Fools it shows (calendar.ts) */
  cal: Today, calKey: string,
  /** New Year's rockets in the sky and Valentine's hearts between pairs (Stable screen only) */
  fireworks: FireworksLayer, hearts: SweetheartsLayer,
  finds: FindsLayer, findsKey: string, findsNote: string | undefined,
}

/** The 4 x 4 ordered dither the switch dissolves through (one cell = one art pixel). */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const DISSOLVE_FRAMES = 10;
/** how long an empty playground's notice stays (Vlad, 2026-10-15), and its fade (--t-long) */
const HINT_MS = 7000, HINT_FADE_MS = 300;

export function mountPlayground (el: HTMLElement, ctx: StableContext): StableScene {
  const uid = () => store.snap?.userId;
  const items = () => store.raw?.items as StableItems | undefined;
  let state: StableState = loadStable(uid());
  let names: Names = loadNames(uid());
  let played: PlayRec = loadPlay(uid());
  let view: View | undefined;
  let shown = false;
  let live = true;
  let insets: StableInsets = ctx.insets;
  let dissolving: { cancel: () => void } | undefined;
  /** the lantern is lit for this visit: the level went up since the last one */
  let lit = false;
  /** who of the party could visit, worked out again only when the members are read again */
  let guestsFor: unknown, guestList: Guest[] = [];
  const guests = () => {
    const ms = store.partyMembers, me = uid();
    if (guestsFor !== ms) { guestsFor = ms; guestList = guestsOf(ms, me); }
    return guestList;
  };
  /** a postcard is open: the meadow stands still under it */
  let frozen = false;
  /** the quest won this visit, as TalkBack hears it ("your party beat The Basi-List") */
  let wonNote: string | undefined;
  /** inside the barn, and the history entry Back leaves it by */
  let barn: Barn | undefined;
  let barnBack: { close (): void, drop (): void } | undefined;

  const chrome = makeChrome(el, {
    state: () => state,
    items,
    commit,
    pet: id => { if (view?.play.hider?.id === id) { view.play.found(); return; } if (view?.herd.pet(id)) { tag(id); view.stage.invalidate(); } },
    // Find is hide and seek's way to give up: the hider comes out the same way as when tapped
    find: id => { if (view?.play.hider?.id === id) { view.play.found(); return; } view?.herd.find(id); tag(id); view?.stage.invalidate(); },
    names: () => names,
    rename: (id, name) => {
      names = rename(names, id, name, localDay());
      saveNames(uid(), names);
      chrome.render();
      describe();
      tag(id);
    },
    riding,
    look: () => store.connection,
    ride: (id, on) => { void ride(id, on); },
    postcard: () => postcard(),
    barn: () => enterBarn(),
    barnShut,
  });
  const hint = h('p', { class: 'stable-hint', hidden: true, 'data-k': 'stable-hint', role: 'status' });
  el.appendChild(hint);
  /** the empty playground's notice last shown this visit (playground and words): a read that changes neither doesn't bring it back */
  let told = '';
  let hintTimer = 0;
  /** the notice away now, and its countdown with it */
  function quiet () {
    window.clearTimeout(hintTimer);
    hint.hidden = true;
    hint.classList.remove('stable-hint-out');
  }
  /** the notice says how to bring creatures in for HINT_MS, then fades */
  function tell (text: string) {
    quiet();
    hint.textContent = text;
    hint.hidden = false;
    hintTimer = window.setTimeout(() => {
      if (ctx.reducedMotion()) { quiet(); return; }
      hint.classList.add('stable-hint-out');
      hintTimer = window.setTimeout(quiet, HINT_FADE_MS);
    }, HINT_MS);
  }

  /**
   * Keep a new arrangement (on the phone at once). With undo, a snackbar names it and can put the old one back.
   * Anyone moving into a playground for the first time gets a name; without another message, the snackbar says hello.
   */
  function commit (next: StableState, undo?: string) {
    const prev = state, who = uid();
    state = next;
    saveStable(who, state);
    const given = naming();
    if (live) refresh();
    // Undo also works after the Stable has closed: it puts the stored record back
    if (undo) snackbar(undo, { action: { label: 'Undo', run: () => { if (live) commit(prev); else saveStable(who, prev); } } });
    else if (given.length === 1) snackbar(`Say hello to ${called(names, given[0])}, your ${creatureName(given[0], true)}.`, { action: { label: 'Rename', run: () => chrome.openRename(given[0]) } });
    else if (given.length > 1) {
      const ns = given.map(id => called(names, id));
      snackbar(`Say hello to ${ns.length > 3 ? `${ns.slice(0, 2).join(', ')} and ${ns.length - 2} more` : list(ns)}.`);
    }
  }

  /** Name whoever lives in a playground and has no name yet (kept on the phone); returns who got one. */
  function naming () {
    const who = uid(), pets = items()?.pets;
    const r = assign(names, residentIds(state), who ?? '', localDay(), key => typeof pets?.[key] === 'number' && (pets[key] as number) > 0);
    if (r.names !== names) { names = r.names; saveNames(who, names); }
    return r.given;
  }

  /** its name over its head for a moment; the still picture redraws when it goes */
  function tag (id: CreatureId, ms = TAG_MS) {
    const v = view;
    if (!v || !v.tags.show(id, ms)) return;
    v.stage.invalidate();
    window.setTimeout(() => { if (view === v) v.stage.invalidate(); }, ms + 50);
  }

  /** the mount the latest read says the player rides, as a resident id (only one the Stable can draw) */
  function riding (): CreatureId | undefined {
    const m = items()?.currentMount;
    const id = m ? idOf('mount', m) : undefined;
    return id && known(id) ? id : undefined;
  }

  /**
   * Ride or Get off (§07): one call, sent by store.ride only when the latest read allows it; the snackbar says
   * what Habitica's reply reports. Undo is another such tap: the previous mount back on, or off again.
   */
  async function ride (id: CreatureId, on: boolean, undo = true) {
    const key = keyOf(id), prev = items()?.currentMount || '';
    // riding from the Stable makes the arrangement the player's own, so getting off doesn't send the mount away
    if (state.auto) { state = keep(state); saveStable(uid(), state); }
    const r = await store.ride(key, on);
    if (!live || r.now === undefined) return;
    // "the Desert Fox", or "Ruby the Desert Fox" once it has a name
    const name = (k: string) => { const id = idOf('mount', k), n = ownName(names, id); return `${n ? `${n} ` : ''}the ${creatureName(id)}`; };
    const again = (run: () => void) => (undo ? { action: { label: 'Undo', run } } : {});
    if (!r.sent) snackbar(r.now === key ? `You’re already riding ${name(key)}.` : `You’re not riding ${name(key)}.`);
    else if (on && r.now === key) snackbar(`You’re riding ${name(key)}.`, again(() => { void (prev ? ride(idOf('mount', prev), true, false) : ride(id, false, false)); }));
    else if (!on && !r.now) snackbar(`You got off ${name(key)}.`, again(() => { void ride(id, true, false); }));
    else snackbar(r.now ? `Habitica says you’re riding ${name(r.now)}.` : 'Habitica says you’re not riding any mount.');
  }

  /**
   * The postcard (postcard.ts): the meadow stops where it stands, a shutter blinks, and that very frame, without the
   * app's buttons and with Habitica's art credit, opens in a sheet to share. It moves again when the sheet closes.
   */
  function postcard (start: CardKind = 'plain') {
    const v = view;
    if (!v || frozen) return;
    frozen = true;
    v.stage.setShown(false);
    let pic: Picture, weeks: ReturnType<typeof almanacWeeks>;
    try {
      pic = pictureOf(v.world, v.herd);
      weeks = almanacWeeks();
    } catch (e) {
      console.warn('Stable: the postcard failed', e);
      frozen = false;
      v.stage.setShown(shown);
      snackbar('The postcard couldn’t be made. Try again.');
      return;
    }
    if (!ctx.reducedMotion()) {
      const flash = h('div', { class: 'pg-flash', 'aria-hidden': 'true' });
      el.appendChild(flash);
      window.setTimeout(() => flash.remove(), 400);
    }
    if (store.settings.haptics) buzz(8);
    showPostcard(pic, weeks, start, () => {
      frozen = false;
      if (live) view?.stage.setShown(shown);
    });
  }

  /** the weeks a postcard can carry: this one so far, and last week once it was counted */
  function almanacWeeks () {
    return { this: almanacOf('this'), last: hasLastWeek() ? almanacOf('last') : undefined };
  }

  /** once a week, the first visit after the week turns offers last week's almanac */
  function offerAlmanac () {
    if (!shown || !lastWeekReady()) return;
    markOffered();
    if (!almanacOf('last')) return;
    snackbar('Last week’s almanac is ready: a postcard of the week.', { action: { label: 'Show', run: () => postcard('last') } });
  }

  /** after each read: follow Habitica's current pet and mount, or drop who has left the account */
  function update () {
    const it = items();
    let next = followHabitica(state, it);
    const r = reconcile(next, owned(it), it);
    next = r.state;
    if (next !== state) { state = next; saveStable(uid(), state); }
    naming();
    if (r.gone.length) tellGone(r.gone);
    refresh();
    grow();
    react();
    rest();
    view?.visitors.sync();
    barn?.refresh();
  }

  /** resting in the Inn: the stable dims (the herd's sleep asks the latest read itself) */
  function rest () {
    const v = view, dim = resting(store.raw);
    if (!v || !!v.layer.options.dim === dim) return;
    v.layer.set({ dim });
    v.stage.invalidate();
    describe();
  }

  /**
   * Paint what the account has grown (never less than this phone has shown) in today's light, and name a
   * stage reached since the last time, once, while the Stable is on screen. The first record is made
   * silently: what had grown before is simply there.
   */
  function grow () {
    const v = view;
    if (!v) return;
    const raw = store.raw, who = uid(), rec = loadGrown(who), now = growthOf(raw, store.tasks);
    const g = rec ? atLeast(rec, now) : now, done = openDailies(store.tasks) === 0;
    if (!sameGrowth(g, v.layer.options.growth ?? NO_GROWTH) || done !== v.layer.options.dailiesDone) {
      v.layer.set({ growth: g, dailiesDone: done });
      v.stage.invalidate();
    }
    if (!raw || !who) return;
    if (!rec) { saveGrown(who, g); return; }
    if (!shown || sameGrowth(g, rec)) return;
    saveGrown(who, g);
    if (g.level > rec.level && !lit) { lit = true; v.lantern.lit = true; v.stage.invalidate(); describe(); }
    const steps = newSteps(rec, g, v.layer.options.scene);
    if (!steps.length) return;
    snackbar(announcement(steps));
    if (ctx.reducedMotion()) return;
    for (const part of new Set<GrowthMark>(steps.map(s => (s.part === 'plaques' ? 'stable' : s.part)))) v.sparkle.around(w => v.layer.mark(w, part));
  }

  function tellGone (gone: Departure[]) {
    const g = gone[0];
    const from = nameOf(state, g.from, 'its playground');
    if (gone.length === 1 && g.mount) {
      const mount = g.mount;
      snackbar(`${called(names, g.id)} grew into a mount. Add the mount?`, { action: { label: 'Add', run: () => {
        const next = add(state, g.from, mount);
        if (next) commit(next); else snackbar(`${nameOf(state, g.from, 'That playground')} is full, or the mount lives elsewhere already.`);
      } } });
    } else if (gone.length === 1) snackbar(`${ownName(names, g.id) ? `${ownName(names, g.id)} the ${creatureName(g.id, true)}` : creatureName(g.id, true)} left ${from}: it’s no longer in your Habitica stable.`);
    else snackbar(`${gone.length} creatures left their playgrounds: they’re no longer in your Habitica stable.`);
  }

  /** draw the open playground: a new world when it or its scene changed, else just its residents */
  function refresh () {
    const pg = currentOf(state);
    if (!view || view.pg !== pg.id || view.scene !== pg.scene) switchTo(pg);
    else residents(view, pg);
    chrome.render();
    note(pg);
    describe();
  }

  /** an empty playground says how to bring creatures in, once per playground and wording each visit */
  function note (pg = currentOf(state)) {
    if (pg.residents.length) { told = ''; quiet(); return; }
    const have = owned(items());
    const text = have && !have.size
      ? 'Your meadow is waiting. Pets hatch in Habitica from an egg and a hatching potion, and the ones you have move in here. Choose one in Habitica and it comes out here too.'
      : state.auto ? 'No pet or mount is out. Tap + below to choose who lives here, or choose one in Habitica and it comes to the meadow.'
        : `No one lives in ${pgName(pg)} yet. Tap + below to choose who lives here.`;
    if (`${pg.id}|${text}` === told || barn) return;
    told = `${pg.id}|${text}`;
    tell(text);
  }

  /** what the meadow shows, for TalkBack (it is one canvas) */
  function describe () {
    const v = view;
    if (!v) return;
    const pg = currentOf(state);
    const who = pg.residents.map(r => (ownName(names, r.id) ? `${ownName(names, r.id)} the ${creatureName(r.id, true)}` : creatureName(r.id, true)));
    const boss = v.boss.showing ? bossOf(store.party) : undefined;
    const notes: string[] = v.cal.feasts.map(f => (f === 'anniversary' ? `${v.cal.years} ${v.cal.years === 1 ? 'year' : 'years'} in Habitica today` : `decorated for ${FEAST_WORDS[f]}`));
    if (v.cal.swap) notes.push(`April Fools: every pet looks like a ${potionName(v.cal.swap)} pet today`);
    if (boss) notes.push(`${boss.name} crosses the sky`);
    if (v.findsNote) notes.push(v.findsNote);
    if (wonNote) notes.push(wonNote);
    if (lit) notes.push(`the lantern is lit: you reached level ${store.state?.lvl ?? 'a new level'}`);
    if (v.worried && who.length) notes.push('they gathered by the stable: your HP is low');
    if (v.herd.avatar) notes.push(resting(store.raw) ? 'you’re resting in the Inn, asleep by the stable' : 'you stand by the stable’s door');
    const guests = v.visitors.here();
    if (guests.length) notes.push(`${list(guests)} ${guests.length === 1 ? 'is' : 'are'} visiting`);
    if (v.play.hider) notes.push(`someone is hiding behind ${SPOTS[v.layer.options.scene].name}. Tap it to find them`);
    const toys = [TOY_NAMES[OWN_TOY[v.layer.options.scene]], ...v.play.out().map(k => TOY_NAMES[k])];
    notes.push(`toys: ${list(toys.map(t => t.toLowerCase()))}`);
    v.stage.canvas.setAttribute('aria-label', `${pgName(pg)}, ${who.length === 1 ? '1 creature' : `${who.length} creatures`}${who.length ? `: ${who.join(', ')}` : ''}${notes.map(n => `. ${n[0].toUpperCase()}${n.slice(1)}`).join('')}`);
  }

  /** the boss in the sky and the worried herd follow each read; a crit or a quest win not celebrated yet is, now */
  function react () {
    noteQuests();
    const v = view;
    if (!v) return;
    calendar(v);
    // a quest just won is over, whatever the last party read says
    const party = beaten && beaten.party === store.party && beaten.key === store.party?.quest?.key ? null : store.party;
    const b = bossOf(party), shape = b && bossShape(b.key);
    finds(v, party);
    const bossKey = shape ? `${b.key}:${b.hp}` : '';
    const low = worried(store.state?.hp);
    if (bossKey !== v.bossKey || low !== v.worried) {
      v.boss.set(shape ?? null, b ? bossScale(b.hp, b.max) : 1);
      v.bossKey = bossKey; v.worried = low;
      v.stage.invalidate();
      describe();
    }
    celebrate(v);
    cheer(v);
    offerAlmanac();
  }

  /** a collection quest's finds in the grass, and today's glinting */
  function finds (v: View, party: unknown) {
    const f = findsOf(party, store.raw), shown = f && findsShown(f);
    const key = shown ? `${f.quest}:${shown.pictures.map(p => p.key).join()}:${shown.glints}` : '';
    if (key === v.findsKey) return;
    v.findsKey = key;
    v.finds.set(shown ?? null);
    v.findsNote = f && describeFinds(f);
    if (shown) void loadFindsSheet().then(() => { if (view === v) v.stage.invalidate(); });
    v.stage.invalidate();
    describe();
  }

  /** the quests won since the last read (achievements.quests), kept on the phone until celebrated */
  function noteQuests () {
    const who = uid(), snap = store.snap;
    if (!who || !snap) return;
    const rec = loadWins(who), next = noteWins(rec, store.raw?.achievements?.quests, habiticaDay(Date.now(), snap.clock));
    if (!next || JSON.stringify(next) === JSON.stringify(rec)) return;
    saveWins(who, next);
    if (next.won && next.won !== rec?.won) beaten = { key: next.won.key, party: store.party };
  }

  /**
   * A quest won since the last visit (the same Habitica day), once: a boss breaks up in confetti, a collection
   * quest's finds burst. Relaxed passes it over for good, as it does a crit.
   */
  function cheer (v: View) {
    const who = uid(), snap = store.snap;
    if (!shown || !who || !snap) return;
    const rec = loadWins(who);
    if (!rec?.won) return;
    const key = winToCelebrate(rec, habiticaDay(Date.now(), snap.clock));
    saveWins(who, { counts: rec.counts });
    const shape = key && bossShape(key), found = key && allFound(key);
    if (!key || (!shape && !found) || store.relaxed) return;
    if (shape) { v.boss.beat(shape); v.bossKey = ''; wonNote = `your party beat ${bossName(key)}`; }
    if (found) {
      void loadFindsSheet().then(() => { if (view === v) v.stage.invalidate(); });
      v.finds.pop(v.world, findsShown(found));
      v.findsKey = ''; v.findsNote = undefined;
      wonNote = `your party finished ${found.name}`;
    }
    v.stage.invalidate();
    describe();
    // end-to-end builds only: which quest wins were celebrated
    if ((import.meta as any).env?.VITE_TEST_API) ((window as any).__stableWins ??= []).push(key);
  }

  /** a feast began or ended, or April Fools came or went, since the playground was built: dress it again */
  function calendar (v: View) {
    const cal = today(store.raw), key = JSON.stringify(cal);
    if (key !== v.calKey) {
      v.cal = cal; v.calKey = key;
      v.layer.set({ feasts: cal.feasts, years: cal.years });
      v.tags.all = cal.feasts.includes('namingDay');
      v.fireworks.on = cal.feasts.includes('nye');
      v.hearts.on = cal.feasts.includes('valentines');
      residents(v, currentOf(state));
      v.stage.invalidate();
      describe();
    }
    if (shown && cal.swap && foolsTold !== key && v.herd.creatures.some(c => kindOf(c.id) === 'pet')) {
      foolsTold = key;
      snackbar(`April Fools! Habitica shows every pet as a ${potionName(cal.swap)} pet today.`);
    }
  }

  /**
   * Confetti and a spinning hop for a crit landed in the app today, once, from the player's Habitica pet if it
   * lives here, else from anyone who does. Relaxed never mentions crits: the crit is passed over for good.
   */
  function celebrate (v: View) {
    const who = uid(), snap = store.snap;
    const home = v.herd.creatures.filter(c => !c.visitor);
    if (!shown || !who || !snap || !home.length) return;
    const at = critToCelebrate(store.journal, loadCelebrated(who), habiticaDay(Date.now(), snap.clock));
    if (at === undefined) return;
    saveCelebrated(who, at);
    if (store.relaxed) return;
    const pet = items()?.currentPet, mine = pet ? v.herd.byId(idOf('pet', pet)) : undefined;
    const id = (mine ?? v.world.rng.pick(home)).id;
    v.herd.celebrate(id);
    v.stage.invalidate();
    // end-to-end builds only: who celebrated which crit
    if ((import.meta as any).env?.VITE_TEST_API) ((window as any).__stableCrits ??= []).push(`${id}@${at}`);
  }

  function residents (v: View, pg: Playground) {
    const rs = residentsFor(pg.residents, v.cal.swap);
    // the pictures too: on April Fools the same creatures change sheets
    const key = rs.map(r => `${r.id}=${r.sprite}`).join(',');
    if (key !== v.who) {
      const before = v.who;
      v.who = key;
      v.rider = '';
      // load first, so a creature never stands there without its picture
      v.world.sprites.load(Herd.keys(rs)).catch(() => undefined).then(() => {
        if (!live || view !== v || v.who !== key) return;
        // who moved in says its name (not everyone when a playground opens, nor a crowd at once)
        const had = new Set(before ? v.herd.creatures.map(c => c.id) : rs.map(r => r.id));
        v.herd.set(rs);
        const come = rs.filter(r => !had.has(r.id));
        if (shown && come.length <= 3) for (const r of come) tag(r.id);
        // today's hider is already behind the spot when the playground opens
        if (!before) { const id = seeking(v); if (id) v.play.hide(id); }
        v.stage.invalidate();
        rider(v);
        describe();
        celebrate(v);
      });
    } else rider(v);
  }

  /**
   * The player's avatar on the ridden mount when it lives here, else on foot by the stable's door; redrawn when
   * the mount or the avatar changes (resting in the Inn changes its face).
   */
  function rider (v: View) {
    // the player's current pet walks beside the mount the player rides
    const pet = items()?.currentPet;
    v.herd.mine(pet ? idOf('pet', pet) : null);
    const r = riderOf(store.raw);
    const id = r && idOf('mount', r.mount);
    const here = !!id && !!v.herd.byId(id);
    const foot = here ? [] : standingOf(store.raw);
    const key = JSON.stringify(here ? ['ride', r] : ['foot', foot]);
    if (key === v.rider) return;
    v.rider = key;
    if (!here) v.herd.ride(null);
    riderLayers(here ? r!.parts : foot).then(layers => {
      if (!live || view !== v || v.rider !== key) return;
      if (here) { v.herd.stand(null); v.herd.ride(id!, layers); } else v.herd.stand(layers);
      v.stage.invalidate();
      describe();
    });
  }

  /** this round's hider in this playground, if it should be hiding (not just found, and it lives here) */
  function seeking (v: View): CreatureId | undefined {
    const who = uid(), now = new Date();
    if (!who || justFound(played, v.pg, now)) return undefined;
    // end-to-end builds: nobody hides unless a check asks (the other checks find everyone where they expect)
    if ((import.meta as any).env?.VITE_TEST_API && (window as any).__noHide) return undefined;
    const id = hiderFor(who, v.pg, roundOf(played, v.pg, localDay(now)), v.herd.creatures.map(c => c.id));
    return id && v.herd.byId(id) ? id : undefined;
  }

  /** Found: kept (the next round starts a little later), and it says its name. */
  function found (pg: number, id: CreatureId) {
    played = markFound(played, pg, new Date());
    savePlay(uid(), played);
    if (store.settings.haptics) buzz(8);
    tag(id);
    view?.stage.invalidate();
    describe();
  }

  /** the toy box: a toy taken out drops in from the sky, one put away flies back up; kept per playground */
  function openToys () {
    const v = view;
    if (!v) return;
    const pg = currentOf(state);
    openToyBox({
      place: pgName(pg), own: OWN_TOY[v.layer.options.scene], out: v.play.out(),
      toggle: (k: BoxToy, out: boolean) => {
        if (view !== v) return;
        if (out) v.play.add(k); else v.play.remove(k);
        played = setToys(played, v.pg, v.play.out());
        savePlay(uid(), played);
        v.stage.invalidate();
        describe();
      },
    });
  }

  /** how what a tap opens is marked (end-to-end builds can try the others) */
  function hintStyle (): HintStyle {
    const s = (import.meta as any).env?.VITE_TEST_API ? (window as any).__hintStyle : undefined;
    return HINT_STYLES.includes(s) ? s : 'line';
  }

  function build (pg: Playground): View {
    // a sprite source per playground: only the open one's sheets are kept (decoded sheets are cached in sprites.ts)
    const world = new World(withProps(stableSprites()), { seed: `stable:${uid() ?? ''}:${pg.id}` });
    const rec = loadGrown(uid()), now = growthOf(store.raw, store.tasks), cal = today(store.raw);
    const layer = new SceneLayer({ scene: pg.scene, growth: rec ? atLeast(rec, now) : now, dailiesDone: openDailies(store.tasks) === 0, dim: resting(store.raw), feasts: cal.feasts, years: cal.years });
    world.addLayer(layer);
    world.addLayer(new AmbientLayer(layer, 'back'));
    const finds = new FindsLayer(layer, () => findsSheet, () => ctx.reducedMotion());
    world.addLayer(finds);
    const boss = new BossLayer(layer, () => ctx.reducedMotion()), lantern = new LanternLayer(layer, () => ctx.reducedMotion());
    world.addLayer(boss); world.addLayer(lantern);
    const fireworks = new FireworksLayer(layer, () => ctx.reducedMotion());
    fireworks.on = cal.feasts.includes('nye');
    world.addLayer(fireworks);
    lantern.lit = lit;
    // what a tap opens, marked (play/hint.ts): drawn over the scene's picture, under everything standing on it
    const hints: Hints = new Hints({
      scene: layer, still: () => ctx.reducedMotion(), barn: () => (layer.options.growth?.level ?? 0) >= STABLE_STAGES[2],
      things: () => play.things(),
      twinkle: (x, y) => herd.emit({ kind: 'spark', x, y, t: 0, life: 32, col: '#FFF8E1' }),
    });
    hints.style = hintStyle();
    world.addLayer(hints);
    const weather = new WeatherLayer(layer);
    world.addLayer(new AmbientLayer(layer, 'front'));
    world.addLayer(weather);
    const herd = new Herd(world, {
      seed: `stable:${pg.id}`, weather: () => weather.kind(), extras: true,
      // the boss in the sky, while it is on screen: the bold face it
      boss: w => { const p = boss.place(w); return p && p.x + p.w > 0 && p.x * ART < w.w ? (p.x + p.w / 2) * ART : null; },
      ground: w => layer.walk(w), shadow: () => layer.shadow(), home: w => layer.door(w),
      spots: w => layer.spots(w), sky: () => ({ winter: layer.light().season === 'winter', moon: layer.moon() }),
      worried: () => worried(store.state?.hp),
      resting: () => resting(store.raw),
      haptic: () => { if (store.settings.haptics) buzz(8); },
      ball: { draw: ballPicture(layer, (g, img, x, y) => hints.image(g, world, img, x, y)) },
      onMoved: (id, spot) => { state = setSpot(state, id, spot); saveStable(uid(), state); },
    });
    const play: Play = new Play({
      world, herd, layer, scene: pg.scene, rng: world.rng.fork('play'), still: () => ctx.reducedMotion(), hints,
      seek: (): CreatureId | undefined => (view && view.play === play ? seeking(view) : undefined),
      onFound: id => found(pg.id, id),
      onHiding: () => { if (view?.play === play) describe(); },
    });
    play.setOut(toysOut(played, pg.id));
    const stage = mountStage(el, {
      world, minW: 480, minH: 640, maxScale: 8, label: pgName(pg),
      still: () => ctx.reducedMotion(), interaction: play.wrap(touchWithNames(herd)),
    });
    herd.attach(stage);
    const sparkle = new SparkleLayer();
    world.addLayer(sparkle);
    const visitors = new Visitors(herd, {
      guests,
      // the visitor's sheet and its rider's pictures first, so it never walks in without them
      arrive: async g => {
        await world.sprites.load(Herd.keys([g.resident])).catch(() => undefined);
        if (!world.sprites.get(g.resident.sprite) || (g.resident.head && !world.sprites.get(g.resident.head))) return false;
        const layers = g.rider.length ? await riderLayers(g.rider) : undefined;
        if (!live || view?.herd !== herd) return false;
        herd.visit(g.resident, layers);
        return true;
      },
      changed: () => { if (view?.herd === herd) describe(); },
    });
    world.addLayer(visitors);
    const tags = new NameTagLayer(herd, id => visitors.label(id) ?? ownName(names, id));
    // Naming Day: every name shows all day
    tags.all = cal.feasts.includes('namingDay');
    world.addLayer(tags);
    const hearts = new SweetheartsLayer(herd);
    hearts.on = cal.feasts.includes('valentines');
    world.addLayer(hearts);
    const v: View = { pg: pg.id, scene: pg.scene, world, stage, herd, layer, sparkle, who: '', rider: '', boss, lantern, bossKey: '', worried: false, tags, visitors, cal, calKey: JSON.stringify(cal), fireworks, hearts, finds, findsKey: '', findsNote: undefined, play, hints };
    applyInsets(v);
    stage.setShown(shown && !frozen && !barn);
    return v;
  }

  /** A trophy tapped: Habitica's name and line for its achievement; a signpost, how far the account is. */
  function trophySays (key: string, sign: boolean): string {
    const [name, text] = trophyName(key);
    if (!sign) return `${name}: ${text}`;
    const p = trophyProgress(store.raw).find(x => x.key === key);
    return p ? `${name}, halfway: ${p.have} of ${p.need} ${p.what}. The trophy stands here when it’s done.` : `${name}, halfway there.`;
  }

  /** why the barn can't be entered yet ('' once the stable is built) */
  function barnShut (): string {
    const at = STABLE_STAGES[2];
    return (view?.layer.options.growth?.level ?? 0) >= at ? '' : `Opens when the stable is built, at level ${at}`;
  }

  /** Into the barn: the playground stops under it, its toolbar and row give way to the barn's bar. */
  function enterBarn () {
    if (barn || !view) return;
    const shut = barnShut();
    if (shut) { snackbar(`The barn opens when your stable is built, at level ${STABLE_STAGES[2]}.`); return; }
    view.stage.setShown(false);
    el.classList.add('pg-in-barn');
    document.getElementById('app')?.classList.add('in-barn');
    quiet();
    barn = openBarn(el, {
      reducedMotion: () => ctx.reducedMotion(),
      pets: () => currentOf(state).residents.filter(r => kindOf(r.id) === 'pet').map(r => residentOf({ id: r.id })).filter((r): r is Resident => !!r),
      items,
      name: id => ownName(names, id),
      have: () => new Set(view?.layer.options.growth?.trophies ?? []),
      quests: () => view?.layer.options.growth?.quests ?? 0,
      stall: id => chrome.openStall(id),
      trophy: (key, earned) => snackbar(barnSays(key, earned)),
      plaques: () => { const n = view?.layer.options.growth?.quests ?? 0; snackbar(n ? `${n === 1 ? '1 quest' : `${n} different quests`} finished: a plaque for each.` : 'A plaque goes up here for each different quest you finish.'); },
      leave: () => barnBack?.close(),
      haptic: () => { if (store.settings.haptics) buzz(8); },
    }, uid() ?? '');
    applyInsets();
    barn.setShown(shown);
    barnBack = backLayer(leaveBarn);
  }

  /** Out of the barn (Back, its arrow, or the Stable going away): the playground carries on where it was. */
  function leaveBarn () {
    if (!barn) return;
    barn.destroy();
    barn = undefined; barnBack = undefined;
    el.classList.remove('pg-in-barn');
    document.getElementById('app')?.classList.remove('in-barn');
    view?.stage.setShown(shown && !frozen);
    applyInsets();
    refresh();
  }

  /** a trophy on the barn's wall: Habitica's words when earned, else how far the account is */
  function barnSays (key: string, earned: boolean): string {
    const [name, text] = trophyName(key);
    if (earned) return `${name}: ${text}`;
    const p = trophyProgress(store.raw).find(x => x.key === key);
    return p ? `${name}: ${p.have} of ${p.need} ${p.what} so far.` : `${name}: not yet.`;
  }

  /** The herd's touch, and a creature touched says its name: a tap or a stroke for a moment, a carry while it lasts. */
  function touchWithNames (herd: Herd): Interaction {
    const t = herd.interaction;
    let carried: string | undefined;
    const tags = () => (view?.herd === herd ? view.tags : undefined);
    const letGo = () => { if (carried) { tags()?.release(carried); tag(carried); carried = undefined; } };
    return {
      ...t,
      tap: (p, s) => {
        t.tap?.(p, s);
        if (p.hit instanceof Creature) { tag(p.hit.id); return; }
        // the avatar on foot stands by the door: a tap on it calls a creature over, it doesn't open the barn
        if (p.hit) return;
        const v = view, spot = v?.herd === herd ? v.layer.trophyAt(v.world, p.x, p.y) : undefined;
        if (spot) snackbar(trophySays(spot.key, spot.sign));
        else if (v?.herd === herd && v.layer.houseAt(v.world, p.x, p.y)) enterBarn();
      },
      dragStart: (p, long, s) => { t.dragStart?.(p, long, s); if (!long && p.hit instanceof Creature) tag(p.hit.id); },
      longPress: (p, s) => {
        t.longPress?.(p, s);
        if (p.hit instanceof Creature) { carried = p.hit.id; tags()?.hold(carried); s.invalidate(); }
      },
      longPressEnd: (p, c, s) => { t.longPressEnd?.(p, c, s); letGo(); },
      dragEnd: (p, c, s) => { t.dragEnd?.(p, c, s); letGo(); },
    };
  }

  function switchTo (pg: Playground) {
    const old = view;
    dissolving?.cancel();
    const shot = old && shown && !barn && !ctx.reducedMotion() ? snapshot(old.stage) : undefined;
    old?.play.destroy();
    old?.stage.destroy();
    view = build(pg);
    residents(view, pg);
    react();
    view.visitors.sync();
    if (shot) dissolve(shot, view.stage);
    expose();
  }

  /** the old meadow as it was on screen, over the new one until the dither has eaten it */
  function snapshot (s: Stage): HTMLCanvasElement | undefined {
    if (!s.canvas.width || !s.canvas.height) return undefined;
    const c = document.createElement('canvas');
    c.className = 'pg-dissolve';
    c.width = s.canvas.width; c.height = s.canvas.height;
    c.getContext('2d')!.drawImage(s.canvas, 0, 0);
    return c;
  }
  function dissolve (c: HTMLCanvasElement, s: Stage) {
    el.insertBefore(c, s.canvas.nextSibling);
    const g = c.getContext('2d')!;
    const cell = Math.max(1, s.fit.scale * 3);
    const pat = document.createElement('canvas');
    pat.width = pat.height = cell * 4;
    const pg = pat.getContext('2d')!;
    let f = 0, raf = 0, last = 0;
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (t - last < 1000 / 30 - 1) return;
      last = t; f++;
      // cells whose threshold is under this frame's share go clear; each frame clears a superset of the last
      const thr = Math.ceil(16 * f / DISSOLVE_FRAMES);
      pg.clearRect(0, 0, pat.width, pat.height);
      BAYER.forEach((b, i) => { if (b < thr) pg.fillRect((i % 4) * cell, (i >> 2) * cell, cell, cell); });
      g.globalCompositeOperation = 'destination-out';
      g.save(); g.translate(s.fit.offX, s.fit.offY);
      g.fillStyle = g.createPattern(pat, 'repeat')!;
      g.fillRect(-s.fit.offX, -s.fit.offY, c.width, c.height);
      g.restore();
      if (f >= DISSOLVE_FRAMES) cancel();
    };
    const cancel = () => { cancelAnimationFrame(raf); c.remove(); if (dissolving === d) dissolving = undefined; };
    const d = { cancel };
    dissolving = d;
    raf = requestAnimationFrame(step);
  }

  /** the chrome's toolbar and row cover the meadow's top and bottom too, except in full screen where they slide away */
  function applyInsets (v = view) {
    el.classList.toggle('pg-full', insets.full);
    el.style.setProperty('--pg-top', `${insets.top}px`);
    el.style.setProperty('--pg-bottom', `${insets.bottom}px`);
    const top = insets.full ? insets.top : insets.top + BAR_H, bottom = insets.full ? insets.bottom : insets.bottom + ROW_H;
    v?.stage.setInsets({ top, bottom });
    // the barn keeps its bar (and its arrow out) in full screen too
    barn?.setInsets(insets.top + BAR_H, insets.bottom);
    hint.style.top = `${top + 16}px`;
  }

  // end-to-end builds only: the parts the browser checks look at
  const expose = () => {
    if (!(import.meta as any).env?.VITE_TEST_API || !view) return;
    (window as any).__stablePg = { stage: view.stage, world: view.world, herd: view.herd, scene: view.layer, sparkle: view.sparkle, boss: view.boss, lantern: view.lantern, visitors: view.visitors, fireworks: view.fireworks, hearts: view.hearts, finds: view.finds, play: view.play, hints: view.hints, hint, state: () => state,
      played: () => played,
      // the crit journal as the store holds it, and today's Habitica day: a test lands a crit by adding an entry
      journal: () => store.journal, today: () => store.snap && habiticaDay(Date.now(), store.snap.clock) };
  };

  const off = store.on(update);
  update();

  return {
    show: () => { shown = true; if (barn) barn.setShown(true); else view?.stage.setShown(!frozen); note(); grow(); react(); },
    hide: () => {
      shown = false; dissolving?.cancel(); view?.stage.setShown(false); barn?.setShown(false);
      // the next visit tells an empty playground again
      told = ''; quiet();
      // the visit is over: the lantern was lit for this one, and the boss beaten in it is gone
      lit = false; wonNote = undefined;
      if (view) view.lantern.lit = false;
    },
    insets: i => { insets = i; applyInsets(); },
    toys: openToys,
    destroy: () => {
      live = false; off(); dissolving?.cancel();
      barnBack?.drop(); barn?.destroy(); barn = undefined; document.getElementById('app')?.classList.remove('in-barn');
      view?.play.destroy(); view?.stage.destroy(); chrome.destroy(); quiet(); hint.remove();
    },
  };
}
