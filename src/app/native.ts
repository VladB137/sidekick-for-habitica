/*
 * The Android app's native side (android/app/src/main/java/io/github/critoracle/SidekickPlugin.java).
 * In a browser `native.available` is false and nothing here runs: the website keeps its own storage.
 * In the APK the token lives in the Android Keystore instead of WebView storage, and every read is
 * handed to the notification, widget and Quick Settings tile so they show the same numbers.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { Nature, ParticleLook, Spot } from '../playground/behaviours/types';
import { demo } from './demo';

export interface NightGear {
  on: boolean
  /** 'auto': CON when Dailies are still open at the set hour (and not resting in the Inn), else INT */
  mode: 'auto' | 'int' | 'con'
  /** minutes after midnight, local time */
  swapAt: number
  backOn: boolean
  backAt: number
}
export interface NativeStatus {
  notification: boolean, notificationsAllowed: boolean, usageAccess: boolean, backgroundRefresh: boolean
  /** Android shows the app's notifications (permission, the app's switch, the verdict channel); missing on older APKs */
  notificationsEnabled?: boolean
  /** the Stable is the phone's live wallpaper; missing on an APK from before it */
  stableWallpaper?: boolean
  /** Android's settings name the Stable as the screen saver; missing on an APK from before it */
  stableDream?: boolean
  /** Habitica refused the remembered login on the phone (401); the app's next read clears it */
  authFailed?: boolean
  /** missing on an APK from before the night gear; `base` (JSON {slot: key}) only while night gear may be on */
  night?: NightGear & { phase: string, last: string, lastAt: number, base?: string }
}

interface SidekickPlugin {
  getCredentials (): Promise<{ userId?: string, apiToken?: string, client?: string }>
  setCredentials (o: { userId: string, apiToken: string, client: string }): Promise<void>
  setClient (o: { client: string }): Promise<void>
  clearCredentials (o?: { keepPlayerData: boolean }): Promise<void>
  reportRead (o: { user: string, at: number }): Promise<void>
  status (): Promise<NativeStatus>
  /** missing on an APK from before it */
  nextAutoAt? (): Promise<{ at: number }>
  /** missing on an APK from before it */
  clock? (): Promise<{ h24: boolean }>
  setNotification (o: { on: boolean }): Promise<{ on: boolean }>
  setBackgroundRefresh (o: { on: boolean }): Promise<void>
  openUsageAccess (): Promise<void>
  /** missing on an APK from before it */
  openNotificationSettings? (): Promise<void>
  setStatusBarColor (o: { color: string }): Promise<void>
  setNightGear (o: NightGear): Promise<void>
  setNightPlan (o: { plan: string }): Promise<void>
  repeatsGet (): Promise<{ json?: string }>
  repeatsSet (o: { json: string }): Promise<void>
  repeatsPermission (): Promise<{ granted: boolean }>
  addListener (event: 'repeatsChanged', fn: () => void): Promise<unknown>
  reportExtras (o: { tasks?: string, party?: string, partyAt?: number }): Promise<void>
  setLines (o: { lines: string }): Promise<void>
  takeRoute (): Promise<{ route?: string }>
  addListener (event: 'route', fn: (e: { route?: string }) => void): Promise<{ remove: () => void }>
  /** missing on an APK from before the Stable widget */
  stableWidget? (): Promise<{ placed: boolean, key?: string }>
  setStablePicture? (o: StablePictures): Promise<void>
  addListener (event: 'stableWidget', fn: () => void): Promise<unknown>
  /** missing on an APK from before the Stable wallpaper; `set` covers the screen saver too (same scenery), `dream` only it */
  stableWallpaper? (): Promise<{ set: boolean, dream?: boolean, key?: string, screen: { w: number, h: number } }>
  setStableScenery? (o: StableScenery): Promise<void>
  openStableWallpaper? (): Promise<void>
  /** missing on an APK from before the Stable screen saver */
  openStableDream? (): Promise<void>
  /** missing on an APK from before the Stable postcard */
  avatarPicture? (o: { file: string }): Promise<{ picture: string }>
  sharePicture? (o: { picture: string }): Promise<void>
  /** missing on an APK from before backups */
  saveFile? (o: { name: string, text: string }): Promise<{ saved: boolean }>
  /** missing on an APK from before it */
  openHabitica? (): Promise<{ app: boolean }>
  /** missing on an APK from before it */
  ready? (): Promise<void>
  addListener (event: 'stableWallpaper', fn: () => void): Promise<unknown>
}

/** The Stable widget's pictures (src/app/stable/still.ts): a PNG data URL per light of the day, and what they show. */
export interface StablePictures { key: string, dawn: string, day: string, dusk: string, night: string }

/** One light of the day for the Stable wallpaper: the scenery as a picture, the trees creatures walk behind, the shadow colour, the weather,
 * the scenery's critters and where shooting stars may cross (playground/scenes/ambient.ts Life). */
export interface SceneryLight { picture: string, shadow: string, weather: string | null, trees: { picture: string, left: number, top: number, foot: number }[], life: { critters: number[][], sky: number[] | null, bow: number[] | null } }
/** A creature on the Stable wallpaper: its picture (a mount's head separately) and what moves it (StableHerd.Look). */
export interface SceneryCreature {
  id: string, species: string, mount: boolean, gait?: string, facing: string, nocturnal: boolean, w: number, h: number, ax: number, spot?: { x: number, y: number },
  body: string, head?: string, rider?: SceneryRider[],
  /** how it gets on with the others here (src/app/stable/social.ts), so the phone's herd keeps the same company */
  temper?: string, bonds?: { id: string, kind: string }[],
  /** its species' ways (src/stable/natures.ts), run by the phone's herd as the app runs them */
  nature?: Nature,
  /** at home in the snow (Polar Pro); the player's current pet, which walks beside the ridden mount */
  cold?: boolean, yours?: boolean,
  /** its signature pair's part (creatures.ts Resident: lead, guard, orbit, pounce, flock, fold, meet, elder) */
  lead?: string, guard?: string, orbit?: string, pounce?: string, flock?: string[], fold?: string[], meet?: string, elder?: boolean,
}
/** One of the avatar's pictures on a ridden mount (stable/ride.ts RiderPart): the file under Habitica's image path, which the phone fetches itself, and its top-left from the cell's. */
export interface SceneryRider { file: string, x: number, y: number }
/** The Stable wallpaper's scenery (src/app/stable/scenery.ts), in world pixels; the phone moves the creatures and the weather. */
export interface StableScenery {
  key: string
  world: { w: number, h: number }
  band: { top: number, bottom: number }
  door: { x: number, y: number }
  /** the world's seed as rng.ts hashes it, and the herd's own seed: the same wandering as the Stable */
  seed: number
  herdSeed: string
  lights: Record<'dawn' | 'day' | 'dusk' | 'night', SceneryLight>
  creatures: SceneryCreature[]
  /** the scene's places creatures' natures go to, world pixels */
  spots: Spot[]
  /** the season and the moon the scenery was painted for (natures' conditions) */
  sky: { winter: boolean, moon: number }
  /** the looks of the particles those natures give off, by kind */
  particles: Record<string, ParticleLook>
  /** the player's avatar on foot by the door (ride.ts standingOf), when it rides nothing here; the phone fetches its pictures as a rider's */
  avatar?: SceneryRider[]
  /** resting in the Inn: the herd sleeps by the door and the day's light is dusk's */
  resting?: boolean
}

/** End-to-end test builds only (VITE_TEST_API is never set for releases): a stand-in for the Android side. */
const fake: SidekickPlugin | undefined = (import.meta as any).env?.VITE_TEST_API ? (globalThis as any).__fakeNative : undefined;
const android = !!fake || (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android');
const shell = fake || (android ? registerPlugin<SidekickPlugin>('Sidekick') : undefined);
// the made-up account (demo.ts) is the app without its Android side: nothing reaches the Keystore, the notification,
// widgets, tile, wallpaper or night gear; only the screen's own parts (status bar colour, start-up screen, Back) stay
const available = android && !demo;
const plugin = available ? shell : undefined;
const quiet = <T>(p: Promise<T> | undefined): Promise<T | undefined> => (p ? p.catch(() => undefined) : Promise.resolve(undefined));

export const native = {
  available,
  /** inside the Android app, the made-up account included (`available` is false there) */
  android,
  getCredentials: () => quiet(plugin?.getCredentials()),
  /** Resolves false when the Keystore refused (then nothing is remembered). */
  setCredentials: (userId: string, apiToken: string, client: string) =>
    plugin ? plugin.setCredentials({ userId, apiToken, client }).then(() => true, () => false) : Promise.resolve(false),
  setClient: (client: string) => quiet(plugin?.setClient({ client })),
  /** keepPlayerData: Habitica refused the token, the same player reconnects; the repeating To-Dos stay (paused) */
  clearCredentials: (keepPlayerData = false) => quiet(plugin?.clearCredentials({ keepPlayerData })),
  reportRead: (user: unknown, at: number) => { void quiet(plugin?.reportRead({ user: JSON.stringify(user), at })); },
  status: () => quiet(plugin?.status()),
  /** Earliest time (ms) for an automatic call, by the phone's count; 0 when unknown. */
  nextAutoAt: () => quiet(plugin?.nextAutoAt?.()).then(r => Number(r?.at) || 0),
  /** Android's 24-hour switch, or undefined (the website, an older APK) */
  hour24: () => quiet(plugin?.clock?.()).then(r => (typeof r?.h24 === 'boolean' ? r.h24 : undefined)),
  setNotification: (on: boolean) => quiet(plugin?.setNotification({ on })),
  setBackgroundRefresh: (on: boolean) => quiet(plugin?.setBackgroundRefresh({ on })),
  openUsageAccess: () => quiet(plugin?.openUsageAccess()),
  openNotificationSettings: () => quiet(plugin?.openNotificationSettings?.()),
  setStatusBarColor: (color: string) => { void quiet(shell?.setStatusBarColor({ color })); },
  setNightGear: (o: NightGear) => quiet(plugin?.setNightGear(o)),
  setNightPlan: (plan: string) => { void quiet(plugin?.setNightPlan({ plan })); },
  /** Repeating To-Dos live natively in the APK, so their reminders work without the app (src/app/repeats.ts). */
  repeatsGet: () => quiet(plugin?.repeatsGet()).then(r => r?.json),
  /** false when the phone didn't keep it (no remembered login, or the bridge failed) */
  repeatsSet: (json: string): Promise<boolean> => (plugin ? plugin.repeatsSet({ json }).then(() => true, () => false) : Promise.resolve(false)),
  repeatsPermission: () => quiet(plugin?.repeatsPermission()).then(r => !!r?.granted),
  onRepeatsChanged: (fn: () => void) => { void quiet(plugin?.addListener('repeatsChanged', fn)); },
  /** the Dailies and the party's quest from a full read, for the notification's lines */
  reportExtras: (tasks: unknown, party: unknown, partyAt: number) => { void quiet(plugin?.reportExtras({ tasks: JSON.stringify(tasks), party: party ? JSON.stringify(party) : undefined, partyAt })); },
  /** what the notification shows (lines.ts LinePrefs plus the widget choice) */
  setLines: (lines: unknown) => { void quiet(plugin?.setLines({ lines: JSON.stringify(lines) })); },
  /** Whether a Stable widget is on the home screen, and the key of the pictures the phone has. */
  stableWidget: () => quiet(plugin?.stableWidget?.()),
  /** false when the phone didn't keep them (no remembered login, an older APK, the bridge failed) */
  setStablePicture: (o: StablePictures): Promise<boolean> => (plugin?.setStablePicture ? plugin.setStablePicture(o).then(() => true, () => false) : Promise.resolve(false)),
  /** a Stable widget was just put on the home screen */
  onStableWidget: (fn: () => void) => { void quiet(plugin?.addListener('stableWidget', fn)); },
  /** Whether the Stable shows on the phone (the live wallpaper or the screen saver), the key of the scenery the phone has, and the screen size to paint for. */
  stableWallpaper: () => quiet(plugin?.stableWallpaper?.()),
  /** false when the phone didn't keep it (no remembered login, an older APK, the bridge failed) */
  setStableScenery: (o: StableScenery): Promise<boolean> => (plugin?.setStableScenery ? plugin.setStableScenery(o).then(() => true, () => false) : Promise.resolve(false)),
  /** Android's preview of the Stable wallpaper, where the player sets it; false on an older APK or without a picker */
  openStableWallpaper: (): Promise<boolean> => (plugin?.openStableWallpaper ? plugin.openStableWallpaper().then(() => true, () => false) : Promise.resolve(false)),
  /** Android's screen saver settings, where the player chooses the Stable; false on an older APK or without them */
  openStableDream: (): Promise<boolean> => (plugin?.openStableDream ? plugin.openStableDream().then(() => true, () => false) : Promise.resolve(false)),
  canOpenStableDream: () => !!plugin?.openStableDream,
  /**
   * One of the avatar's pictures as a data URL, fetched by the phone from Habitica's image server (no token), so a
   * canvas drawing it stays readable; undefined in a browser, on an older APK, or when the phone can't get it now.
   */
  avatarPicture: plugin?.avatarPicture ? (file: string) => quiet(plugin.avatarPicture!({ file })).then(r => r?.picture) : undefined,
  /** Android's share sheet for a postcard (a PNG data URL); false when it didn't open */
  sharePicture: plugin?.sharePicture ? (picture: string): Promise<boolean> => plugin.sharePicture!({ picture }).then(() => true, () => false) : undefined,
  /** Android's save dialog for a backup file (backup.ts); false when cancelled, refused, or on an older APK */
  saveFile: (name: string, text: string): Promise<boolean> => (plugin?.saveFile ? plugin.saveFile({ name, text }).then(r => !!r?.saved, () => false) : Promise.resolve(false)),
  /** Habitica's own app on its Settings screen, or the website's API page without the app; false on an older APK (then the link opens the website) */
  /** the first screen is drawn: the APK's "didn't start" screen (MainActivity) stands down */
  ready: () => { void quiet(shell?.ready?.()); },
  canOpenHabitica: () => !!plugin?.openHabitica,
  openHabitica: () => quiet(plugin?.openHabitica?.()),
  /** the Stable wallpaper or screen saver started showing (set, in Android's preview, dreaming) */
  onStableWallpaper: (fn: () => void) => { void quiet(plugin?.addListener('stableWallpaper', fn)); },
  /** The tab the notification's Tasks button asked for: once at start-up, then each time it is pressed. */
  onRoute: (fn: (route: string) => void) => {
    if (!plugin) return;
    void quiet(plugin.takeRoute()).then(r => { if (r?.route) fn(r.route); });
    void quiet(plugin.addListener('route', e => { if (e.route) fn(e.route); }));
  },
};

// Android Back: the web history first (sheets, then the way back to Now), then leave the app.
if (android) {
  void App.addListener('backButton', ({ canGoBack }) => { if (canGoBack) history.back(); else void App.exitApp(); });
}
