/*
 * Pet picking (src/app/stable/picks.ts): who lives in which playground, as the Stable design spec §06 says.
 * One creature in one playground at a time, at most 10 residents and one playground per scene, the first playground following
 * Habitica's current pet and mount until the player chooses, departures after a read, and the stored record.
 */
import {
  MAX_PLAYGROUNDS, MAX_RESIDENTS, add, addPlayground, changeScene, choose, creatureName, currentOf, deletePlayground, pgName,
  followHabitica, freeScenes, freshState, loadStable, moveTo, normalize, open, outInHabitica, owned, reconcile, remove, saveStable,
  setSpot, whereIs, type StableState,
} from '../src/app/stable/picks';
import { allSprites, spriteMeta } from '../src/stable/sprites';
import { mayToggle, resting, riderOf, standingOf } from '../src/app/stable/ride';
import { guestsOf, writableName } from '../src/app/stable/visitors';
import { memberFromApi } from '../src/app/model';
import { avatarLayers } from '../src/app/avatar';

let checks = 0, failures = 0;
const check = (name: string, ok: boolean, extra = '') => { checks++; if (!ok) { failures++; console.log(`FAIL  ${name}${extra ? `  ${extra}` : ''}`); } };
const ids = (s: StableState, pg: number) => s.playgrounds.find(p => p.id === pg)!.residents.map(r => r.id).join(',');
const byIdSpot = (s: StableState, pg: number, i: number) => !!s.playgrounds.find(p => p.id === pg)!.residents[i].spot;

// a fake localStorage for the stored record
const mem = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, String(v)); }, removeItem: (k: string) => { mem.delete(k); } };

const items = {
  currentPet: 'Wolf-Base', currentMount: 'Dragon-Red',
  pets: { 'Wolf-Base': 5, 'Fox-Desert': 10, 'Dragon-Golden': -1, 'Deer-Base': 0, 'NotACreature-Base': 5 },
  mounts: { 'Dragon-Red': true, 'Dragon-Golden': true, 'Horse-Base': null, 'Wolf-Base': true },
};

// what the account owns
{
  const have = owned(items)!;
  check('owned: pets above 0 and mounts set to true', [...have].sort().join() === 'mount:Dragon-Golden,mount:Dragon-Red,mount:Wolf-Base,pet:Fox-Desert,pet:NotACreature-Base,pet:Wolf-Base', [...have].join());
  check('owned: a raised (-1) or released (0) pet and a released mount are not offered', !have.has('pet:Dragon-Golden') && !have.has('pet:Deer-Base') && !have.has('mount:Horse-Base'));
  check('owned: unknown when the read has no pets or mounts', owned({ currentPet: 'Wolf-Base' }) === undefined && owned(undefined) === undefined);
  check('out in Habitica: only creatures the catalogue can draw', outInHabitica({ currentPet: 'NotACreature-Base', currentMount: 'Dragon-Red' }).join() === 'mount:Dragon-Red');
  check('names: potion then egg, mounts say so', creatureName('pet:Fox-Desert') === 'Desert Fox' && creatureName('mount:Dragon-Red', true) === 'Red Dragon mount', creatureName('pet:Fox-Desert'));
}

// first open: the Meadow follows Habitica until the player chooses
let s = freshState();
check('first open: one playground, the Meadow', s.playgrounds.length === 1 && pgName(currentOf(s)) === 'Meadow' && currentOf(s).scene === 'meadow' && s.auto);
s = followHabitica(s, items);
check('first open: the current pet and mount move in', ids(s, 1) === 'pet:Wolf-Base,mount:Dragon-Red');
s = setSpot(s, 'pet:Wolf-Base', { x: 0.25, y: 0.5 });
const s2 = followHabitica(s, { ...items, currentMount: '' });
check('following Habitica: a change of mount follows, the pet keeps its spot', ids(s2, 1) === 'pet:Wolf-Base' && s2.playgrounds[0].residents[0].spot?.x === 0.25);
check('following Habitica: nothing changed is the same state', followHabitica(s, items) === s);
check('following Habitica: departures are not reported while following', reconcile(s, owned(items), items).gone.length === 0);

// choosing
let r = choose(s, 1, ['pet:Wolf-Base', 'pet:Fox-Desert', 'mount:Dragon-Red']);
s = r.state;
check('choosing: the arrangement becomes the player\'s own', !s.auto && ids(s, 1) === 'pet:Wolf-Base,pet:Fox-Desert,mount:Dragon-Red' && r.moved.length === 0);
check('choosing: who stays keeps their spot', s.playgrounds[0].residents[0].spot?.x === 0.25);
check('choosing: Habitica no longer decides', followHabitica(s, { ...items, currentPet: 'Fox-Desert' }) === s);
const many = allSprites('pet').slice(0, 14).map(m => `pet:${m.key}`);
check('choosing: at most 10 live in one playground', choose(s, 1, many).state.playgrounds[0].residents.length === MAX_RESIDENTS);
check('choosing: unknown creatures are left out', !choose(s, 1, ['pet:NotACreature-Base']).state.playgrounds[0].residents.length);

// playgrounds
const two = addPlayground(s, 'lake')!;
check('new playground: opened at once, named after its scene, next id', two.current === 2 && pgName(currentOf(two)) === 'Lakeside' && currentOf(two).scene === 'lake' && two.next === 3);
check('new playground: only scenes not in use are offered', freeScenes(two).join() === 'pine,cove,bamboo,marsh,mushroom');
check('new playground: never a scene twice', addPlayground(two, 'lake') === undefined && addPlayground(two, 'meadow') === undefined);
let full: StableState = two;
for (const sc of freeScenes(two)) full = addPlayground(full, sc)!;
check('new playground: one per scene, 7 at most', MAX_PLAYGROUNDS === 7 && full.playgrounds.length === 7 && !freeScenes(full).length && new Set(full.playgrounds.map(p => p.scene)).size === 7);

// one playground per creature: choosing moves
r = choose(two, 2, ['pet:Fox-Desert', 'mount:Wolf-Base']);
s = r.state;
check('moving by choosing: it leaves its old playground', ids(s, 1) === 'pet:Wolf-Base,mount:Dragon-Red' && ids(s, 2) === 'pet:Fox-Desert,mount:Wolf-Base');
check('moving by choosing: reported with where it came from', r.moved.length === 1 && r.moved[0].id === 'pet:Fox-Desert' && r.moved[0].from === 1, JSON.stringify(r.moved));
check('one playground per creature', s.playgrounds.flatMap(p => p.residents.map(x => x.id)).length === new Set(s.playgrounds.flatMap(p => p.residents.map(x => x.id))).size);
check('undo is the old state, untouched', ids(two, 1) === 'pet:Wolf-Base,pet:Fox-Desert,mount:Dragon-Red' && ids(two, 2) === '');
check('where it lives', whereIs(s, 'pet:Fox-Desert')?.id === 2 && whereIs(s, 'pet:Deer-Base') === undefined);

// the sheet's Move and Remove
const moved = moveTo(s, 'pet:Wolf-Base', 2)!;
check('Move: to the other playground, at its end', ids(moved, 1) === 'mount:Dragon-Red' && ids(moved, 2) === 'pet:Fox-Desert,mount:Wolf-Base,pet:Wolf-Base');
check('Move: not to where it lives, not into a full playground', moveTo(s, 'pet:Wolf-Base', 1) === undefined && moveTo(choose(s, 2, many).state, 'mount:Dragon-Red', 2) === undefined);
check('Remove: it leaves the Stable\'s playgrounds', ids(remove(s, 'pet:Fox-Desert'), 2) === 'mount:Wolf-Base' && !whereIs(remove(s, 'pet:Fox-Desert'), 'pet:Fox-Desert'));

// editing, switching, deleting
{
  const ch = changeScene(s, 2, 'mushroom')!;
  check('change scene: the playground takes the scene and its name, residents and spots stay', currentOf(ch).scene === 'mushroom' && pgName(currentOf(ch)) === 'Mushroom glade' && ids(ch, 2) === ids(s, 2) && ch.current === 2 && !ch.auto);
  check('change scene: never to a scene another playground has', changeScene(s, 2, 'meadow') === undefined && changeScene(s, 9, 'marsh') === undefined);
  check('change scene: the old scene is free again', freeScenes(ch).includes('lake') && !freeScenes(ch).includes('mushroom'));
}
check('switching: open another playground', open(s, 1).current === 1 && open(s, 9) === s);
const del = deletePlayground(s, 2)!;
check('delete: its residents leave, the open one moves to a neighbour', del.playgrounds.length === 1 && del.current === 1 && !whereIs(del, 'pet:Fox-Desert'));
check('delete: never the last one', deletePlayground(del, 1) === undefined);
check('delete: ids are never reused, and its scene is free again', addPlayground(del, 'lake')!.current === 3);

// after a read: who left the account leaves its playground
{
  const st = choose(choose(freshState(), 1, ['pet:Wolf-Base', 'pet:Dragon-Golden', 'pet:Fox-Desert']).state, 1, ['pet:Wolf-Base', 'pet:Dragon-Golden', 'pet:Fox-Desert']).state;
  const now = { ...items, pets: { ...items.pets, 'Fox-Desert': 0 } };
  const out = reconcile(st, owned(now), now);
  check('a read: raised and released pets leave', ids(out.state, 1) === 'pet:Wolf-Base' && out.gone.length === 2, JSON.stringify(out.gone));
  const raised = out.gone.find(g => g.id === 'pet:Dragon-Golden');
  check('a read: a pet raised into a mount offers the mount', raised?.mount === 'mount:Dragon-Golden' && !out.gone.find(g => g.id === 'pet:Fox-Desert')?.mount);
  const back = add(out.state, 1, 'mount:Dragon-Golden');
  check('a read: Add puts the mount where the pet lived', !!back && ids(back, 1) === 'pet:Wolf-Base,mount:Dragon-Golden');
  check('a read: Add refuses a creature that lives elsewhere', add(back!, 1, 'mount:Dragon-Golden') === undefined);
  check('a read without pets and mounts changes nothing', reconcile(st, owned({ currentPet: 'Wolf-Base' })).state === st);
}

// storage: per account, checked on the way in
{
  const mineS = choose(followHabitica(freshState(), items), 1, ['pet:Fox-Desert']).state;
  saveStable('user-a', mineS);
  saveStable('user-b', freshState());
  check('stored: per account', ids(loadStable('user-a'), 1) === 'pet:Fox-Desert' && ids(loadStable('user-b'), 1) === '' && !loadStable('user-a').auto && loadStable('user-b').auto);
  check('stored: nothing for an unknown account', loadStable('user-c').playgrounds.length === 1 && loadStable(undefined).auto);
  const bad = normalize({ auto: false, current: 7, next: 1, playgrounds: [
    { id: 4, name: '', scene: 'volcano', residents: [{ id: 'pet:Wolf-Base', spot: { x: 3, y: -1 } }, { id: 'pet:Wolf-Base' }, { id: 'pet:NotACreature-Base' }, null] },
    { id: 4, name: 'dup', scene: 'lake', residents: [] },
    { id: 5, name: 'Lake', scene: 'lake', residents: [{ id: 'pet:Wolf-Base' }, { id: 'mount:Dragon-Red' }] },
  ] });
  check('stored: a broken record is repaired, not trusted', bad.playgrounds.length === 2 && bad.current === 4 && bad.next === 6 && bad.playgrounds[0].scene === 'meadow' && pgName(bad.playgrounds[0]) === 'Meadow' && !('name' in bad.playgrounds[0])
    && ids(bad, 4) === 'pet:Wolf-Base' && bad.playgrounds[0].residents[0].spot?.x === 1 && bad.playgrounds[0].residents[0].spot?.y === 0 && ids(bad, 5) === 'mount:Dragon-Red', JSON.stringify(bad));
  // records from before one playground per scene: custom names, the same scene twice, up to 8
  const pets = allSprites('pet').map(m => `pet:${m.key}`);
  const raw = { auto: false, current: 6, next: 9, playgrounds: [
    { id: 1, name: 'Home meadow', scene: 'meadow', residents: pets.slice(0, 4).map(id => ({ id, spot: { x: 0.5, y: 0.5 } })) },
    { id: 2, name: 'Snow den', scene: 'pine', residents: [] },
    { id: 3, name: 'Meadow two', scene: 'meadow', residents: pets.slice(4, 8).map(id => ({ id, spot: { x: 0.2, y: 0.2 } })) },
    { id: 6, name: 'Meadow three', scene: 'meadow', residents: pets.slice(8, 13).map(id => ({ id })) },
    { id: 7, name: 'Pines again', scene: 'pine', residents: pets.slice(13, 15).map(id => ({ id })) },
  ] };
  const old = normalize(raw);
  const all = old.playgrounds.flatMap(p => p.residents.map(r => r.id));
  check('old record: names dropped, each scene once', old.playgrounds.every(p => !('name' in p)) && new Set(old.playgrounds.map(p => p.scene)).size === old.playgrounds.length, JSON.stringify(old.playgrounds.map(p => [p.id, p.scene])));
  check('old record: a duplicate folds into the first of its scene while there is room, in order', ids(old, 1) === pets.slice(0, 10).join() && ids(old, 2) === pets.slice(13, 15).join(), ids(old, 1));
  check('old record: the first playground keeps its spots, folded-in creatures lose theirs', byIdSpot(old, 1, 0) && !byIdSpot(old, 1, 4));
  check('old record: who doesn\'t fit keeps their playground, moved to a free scene', ids(old, 6) === pets.slice(10, 13).join() && old.playgrounds.find(p => p.id === 6)!.scene === 'lake');
  check('old record: no creature lost or doubled, at most 10 each', all.length === 15 && new Set(all).size === 15 && old.playgrounds.every(p => p.residents.length <= MAX_RESIDENTS));
  check('old record: the open playground stays open, a folded one opens where it went', old.current === 6 && normalize({ ...raw, current: 7 }).current === 2
    && normalize({ auto: false, current: 3, playgrounds: [{ id: 1, scene: 'meadow', residents: [] }, { id: 3, name: 'x', scene: 'meadow', residents: [] }] }).current === 1);
  const eight = normalize({ auto: false, current: 1, playgrounds: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: `P${i}`, scene: 'meadow', residents: pets.slice(i * 10, i * 10 + 10).map(id => ({ id })) })) });
  check('old record: eight full meadows become seven scenes; who has no scene left leaves the Stable', eight.playgrounds.length === 7 && new Set(eight.playgrounds.map(p => p.scene)).size === 7
    && eight.playgrounds.every(p => p.residents.length === 10) && eight.next === 9);
  check('stored: garbage gives a fresh Stable', normalize('nope').auto && normalize(null).playgrounds.length === 1 && normalize({ playgrounds: [] }).playgrounds.length === 1);
}

// riding (§07): the toggle guard and where the avatar sits on the mount
{
  check('ride: sent only when not on that mount', mayToggle('', 'Wolf-Base', true) && mayToggle('Dragon-Red', 'Wolf-Base', true) && !mayToggle('Wolf-Base', 'Wolf-Base', true) && mayToggle(undefined, 'Wolf-Base', true));
  check('get off: sent only when on that mount', mayToggle('Wolf-Base', 'Wolf-Base', false) && !mayToggle('', 'Wolf-Base', false) && !mayToggle('Dragon-Red', 'Wolf-Base', false));
  const u = { preferences: { skin: '915533', shirt: 'blue', size: 'slim', hair: { color: 'red', base: 3, bangs: 1 } }, items: { currentMount: 'Wolf-Base', currentPet: 'Fox-Desert', gear: { equipped: { weapon: 'weapon_warrior_1', armor: 'armor_base_0' } } }, stats: { class: 'warrior', buffs: {} } };
  const r = riderOf(u)!, m = spriteMeta('mount', 'Wolf-Base')!;
  const all = avatarLayers(u), avatar = all.filter(l => l.part === 'avatar');
  check('ride: the rider is the avatar layers only (no mount, pet or background), in Habitica\u2019s order', !!r && r.mount === 'Wolf-Base' && r.parts.map(p => p.file).join() === avatar.map(l => l.file).join() && r.parts.some(p => p.file === 'skin_915533.png') && r.parts[r.parts.length - 1].file === 'weapon_warrior_1.png', JSON.stringify(r));
  // avatar.vue: the mount's image at (24, 18), the avatar at (24, 0) when riding; the bundled cell starts at m.at inside that image
  check('ride: placed from the mount image\u2019s corner, less the crop', !!m.at && r.parts.every((p, i) => p.x === avatar[i].x - 24 - m.at!.x && p.y === avatar[i].y - 18 - m.at!.y) && r.parts[0].x === -12 && r.parts[0].y === -48, JSON.stringify([m.at, r.parts[0]]));
  const k = riderOf({ ...u, items: { ...u.items, currentMount: 'Kangaroo-Base' } })!, km = spriteMeta('mount', 'Kangaroo-Base')!;
  check('ride: Kangaroo mounts get Habitica\u2019s 24 px offset', k.parts[0].y === 24 - 18 - km.at!.y, JSON.stringify([km.at, k.parts[0]]));
  check('ride: nothing to draw when riding nothing, an unknown mount, or the invisible one', !riderOf({ ...u, items: { ...u.items, currentMount: '' } }) && !riderOf({ ...u, items: { ...u.items, currentMount: 'Nope-Base' } }) && !riderOf({ ...u, items: { ...u.items, currentMount: 'Aether-Invisible' } }));
  const bad = allSprites('mount').filter(s => !s.at || s.at.x < 0 || s.at.y < 0 || s.at.x + s.w > 135 || s.at.y + s.h > 135);
  check('ride: every mount knows where its cell sat in Habitica\u2019s image (inside a 135 px box)', !bad.length, bad.slice(0, 5).map(s => s.key).join());
}

/* ---- the avatar on foot (idea 8) */
{
  const u = { preferences: { size: 'slim', skin: '915533', shirt: 'blue', hair: { color: 'red', base: 3, bangs: 1 } }, items: { currentMount: 'Wolf-Base', currentPet: 'Fox-Base', gear: { equipped: { weapon: 'weapon_warrior_1' } } }, stats: { class: 'warrior', buffs: {} } };
  const s = standingOf(u);
  check('on foot: the avatar’s own layers only, no mount or pet, placed from under its feet', s.length > 4 && !s.some(p => /Mount_|Pet-|background/.test(p.file)) && s.every(p => p.x === -57 && p.y === -83), JSON.stringify(s.slice(0, 2)));
  const zz = standingOf({ ...u, preferences: { ...u.preferences, sleep: true } });
  check('on foot in the Inn: Habitica’s sleeping face and Zzz', resting({ preferences: { sleep: true } }) && !resting(u) && zz.some(p => p.file === 'zzz.png') && zz.some(p => p.file === 'skin_915533_sleep.png'));
  check('on foot: a snowball shows as Habitica shows it', standingOf({ ...u, stats: { class: 'rogue', buffs: { snowball: true } } }).some(p => p.file === 'avatar_snowball_rogue.png'));
  check('on foot: nothing without a read', standingOf(undefined).length === 0);
}

/* ---- party visitors (idea 9) */
{
  const raw = (id: string, name: string, pet: string, mount: string, extra: object = {}) => ({ _id: id, profile: { name }, stats: { class: 'mage', lvl: 20, hp: 50, mp: 1, maxMP: 9, buffs: { seafoam: true, str: 4 } }, flags: { classSelected: true }, preferences: { size: 'broad', skin: 'ddc994', sleep: false, language: 'ro', dayStart: 3 }, items: { currentPet: pet, currentMount: mount, gear: { equipped: { head: 'head_wizard_1' }, costume: {}, owned: { x: true } }, food: { Meat: 3 } }, auth: { local: { email: 'secret@example.com' } }, ...extra });
  const m = memberFromApi(raw('a', 'Ana', 'Fox-Golden', ''));
  check('member: keeps the current pet and mount and the avatar’s look, nothing else of theirs', m.pet === 'Fox-Golden' && m.mount === undefined && m.look.preferences.skin === 'ddc994' && m.look.preferences.language === undefined && m.look.preferences.dayStart === undefined
    && m.look.stats.buffs.seafoam === true && m.look.stats.buffs.str === undefined && m.look.items.gear.owned === undefined && !JSON.stringify(m).includes('secret') && !JSON.stringify(m).includes('Meat'), JSON.stringify(m.look));
  const ms = [raw('me', 'Me', 'Wolf-Base', ''), raw('a', 'Ana', 'Fox-Golden', ''), raw('b', 'Bo \u{1F43A} the Brave Wanderer', 'Cactus-Base', 'Wolf-Red'), raw('c', 'Cy', '', ''), raw('d', 'Di', 'NoSuch-Pet', 'NoSuch-Mount'), raw('e', '\u{1F43A}\u{1F43A}', 'Wolf-Base', ''), raw('f', 'Fen', 'Fox-CottonCandyPink', '')].map(memberFromApi);
  const gs = guestsOf(ms, 'me');
  check('guests: everyone else with a pet or mount the Stable can draw, a mount before a pet', gs.map(g => g.id).join() === 'visitor:a:pet:Fox-Golden,visitor:b:mount:Wolf-Red,visitor:e:pet:Wolf-Base,visitor:f:pet:Fox-CottonCandyPink', gs.map(g => g.id).join());
  check('guests: never a resident’s id, always marked as visiting', gs.every(g => g.resident.visitor && g.resident.id === g.id && g.id.startsWith('visitor:')));
  check('guests: a mount comes with its rider, its member’s avatar (a starfish here, as Habitica shows it)', gs[1].resident.head === 'mount:Wolf-Red#head' && gs[1].rider.some(p => p.file === 'seafoam_star.png') && gs[0].rider.length === 0);
  check('guests: the tag says whose it is, in letters the meadow can write', gs.map(g => g.label).join('|') === "Ana's Golden Fox|Bo the Brave's Red Wolf|A friend's Base Wolf|Fen's pet", gs.map(g => g.label).join('|'));
  check('guests: a name trimmed to 12 letters, accents kept', writableName('Ștefănescu-Ionescu') === 'Ștefănescu-I' && writableName('  ') === 'A friend');
}

if (failures) { console.log(`FAIL  picks: ${failures} of ${checks} checks failed`); process.exit(1); }
console.log(`PASS  picks: ${checks} checks`);
