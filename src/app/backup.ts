/*
 * Back up and restore (Settings → Account): what the app keeps only on this phone, in one file the player saves
 * where they like and opens on the next phone. Android backups stay off (AndroidManifest allowBackup="false") so
 * the token never leaves the phone; this file never holds it either, nor the User ID or the saved copy of the
 * account the app opens with: only what the app itself made. The account is named by a one-way tag of its User ID, so a file from
 * another account brings the settings and the Stable's names and playgrounds, but not that account's journal and
 * crit records, growth, week record or links to its To-Dos.
 */
import { store } from './store';
import { native } from './native';
import { forBackup, fromBackup, replaceAll, repeats } from './repeats';
import { loadNames, normalizeNames, saveNames } from './stable/names';
import { loadStable, normalize as normalizeStable, saveStable } from './stable/picks';
import { loadPlay, normalizePlay, savePlay } from './stable/toybox';
import { atLeast, loadGrown, normalizeGrown, saveGrown } from './stable/growth';
import { almanacForBackup, restoreAlmanac } from './almanac';
import type { CritRecords, JournalEntry } from '../engine';

const APP = 'Sidekick for Habitica';
/** what backups made before the rename (2026-10-17) carry */
const OLD_APP = 'Habitica Oracle';
const KIND = 'backup';
const VERSION = 1;

export interface BackupFile {
  app: string, kind: string, v: number
  /** when it was made (ISO) and by which version */
  made: string, version: string
  /** a one-way tag of the account's User ID (accountTag); missing where the browser can't make one */
  account?: string
  settings: unknown, record: unknown, journal: JournalEntry[], repeats: unknown[]
  /** the crit records kept with the journal (they outlive its oldest entries) */
  records?: CritRecords
  stable: { names: unknown, playgrounds: unknown, play: unknown, growth?: unknown }
  /** the weekly almanac's record of what the account had at each week's start and latest read */
  almanac?: unknown
}

/** 16 hex digits of SHA-256 over the User ID: the same account gives the same tag; the tag doesn't give the ID back. */
export async function accountTag (userId: string): Promise<string | undefined> {
  try {
    const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`habitica-oracle:${userId}`) /* the old name stays: backups from before the rename keep their tag */);
    return Array.prototype.map.call(new Uint8Array(d).subarray(0, 8), (b: number) => b.toString(16).padStart(2, '0')).join('');
  } catch { return undefined; }
}

/** The file's contents for the logged-in account. */
export async function makeBackup (now = new Date()): Promise<BackupFile> {
  const uid = store.creds?.userId;
  return {
    app: APP, kind: KIND, v: VERSION, made: now.toISOString(), version: __APP_VERSION__,
    account: uid ? await accountTag(uid) : undefined,
    settings: store.settings,
    record: store.record,
    journal: store.journal,
    records: store.records,
    repeats: repeats.available ? await forBackup() : [],
    stable: { names: loadNames(uid), playgrounds: loadStable(uid), play: loadPlay(uid), growth: loadGrown(uid) },
    almanac: almanacForBackup(uid),
  };
}

export const backupName = (now = new Date()) => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `sidekick-backup-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
};

/** Read a file's text: a backup, or why it isn't one. */
export function parseBackup (text: string): BackupFile | string {
  let v: Partial<BackupFile>;
  try { v = JSON.parse(text); } catch { return 'This file isn’t a Sidekick backup.'; }
  if (!v || typeof v !== 'object' || (v.app !== APP && v.app !== OLD_APP) || v.kind !== KIND) return 'This file isn’t a Sidekick backup.';
  if (typeof v.v !== 'number' || v.v > VERSION) return 'This backup was made by a newer Sidekick. Update the app, then restore it.';
  return v as BackupFile;
}

/** What a backup holds, in words, for the sheet that asks before restoring. */
export function describe (b: BackupFile, same: boolean): string[] {
  const reps = Array.isArray(b.repeats) ? b.repeats.length : 0;
  const names = b.stable?.names && typeof b.stable.names === 'object' ? Object.keys(b.stable.names).length : 0;
  const crits = Array.isArray(b.journal) ? b.journal.length : 0;
  const out = [
    `${reps} repeating To-Do${reps === 1 ? '' : 's'}`,
    `${names} pet and mount name${names === 1 ? '' : 's'}, your playgrounds and toys`,
    'your settings',
  ];
  if (same) out.splice(2, 0, `${crits} crit${crits === 1 ? '' : 's'} in the journal`);
  return out;
}

/** Whether the file was made on the logged-in account (true when either side can't tell). */
export async function sameAccount (b: BackupFile): Promise<boolean> {
  const uid = store.creds?.userId;
  if (!uid || !b.account) return true;
  const tag = await accountTag(uid);
  return !tag || tag === b.account;
}

const isEntry = (e: Partial<JournalEntry> | null): e is JournalEntry => !!e && typeof e.at === 'number' && typeof e.day === 'number' && typeof e.text === 'string' && typeof e.mult === 'number' &&
  ['exp', 'gp', 'mp', 'dmg'].every(k => typeof (e as Record<string, unknown>)[k] === 'number');

/**
 * Put a backup in place of what this phone keeps for the logged-in account. Returns what couldn't come along
 * (repeating To-Dos, the journal and the almanac need "Remember on this device").
 */
export async function restoreBackup (b: BackupFile): Promise<{ skipped: string[] }> {
  const uid = store.creds?.userId;
  const skipped: string[] = [];
  if (!uid) return { skipped: ['everything (nobody is logged in)'] };
  const same = await sameAccount(b);
  const st = b.stable && typeof b.stable === 'object' ? b.stable : {} as BackupFile['stable'];
  saveNames(uid, normalizeNames(st.names));
  saveStable(uid, normalizeStable(st.playgrounds));
  savePlay(uid, normalizePlay(st.play));
  const grown = same ? normalizeGrown(st.growth) : undefined;
  if (grown) { const had = loadGrown(uid); saveGrown(uid, had ? atLeast(had, grown) : grown); }
  const journal = same && Array.isArray(b.journal) ? b.journal.filter(isEntry) : undefined;
  if (journal?.length && !store.remember) skipped.push('the crit journal');
  // the week record is account data, kept on the device only with “Remember on this device” (almanac.ts)
  if (same && b.almanac && !store.remember) skipped.push('the weekly almanac');
  if (same && b.almanac && store.remember) restoreAlmanac(uid, b.almanac);
  store.adoptBackup({ settings: b.settings, record: b.record, journal: journal?.length && store.remember ? journal : undefined, records: b.records });
  const reps = fromBackup(b.repeats, same);
  if (reps.length && !await replaceAll(reps)) skipped.push('repeating To-Dos');
  return { skipped };
}

/** Hand the file to the player: Android's save dialog on the phone, a download on the website. False if they cancelled. */
export async function saveBackupFile (b: BackupFile): Promise<boolean> {
  const text = JSON.stringify(b, null, 1);
  const name = backupName(new Date(b.made));
  if (native.available) return native.saveFile(name, text);
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return true;
}

/** Ask for a file (the system's file picker) and read it as text; undefined if none was chosen. */
export function pickFile (): Promise<string | undefined> {
  return new Promise(resolve => {
    // one left from a picker the player closed without choosing (no event says so)
    document.querySelectorAll('input[data-k="restore-file"]').forEach(x => x.remove());
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('data-k', 'restore-file');
    input.style.display = 'none';
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.remove();
      if (!f || f.size > 20e6) { resolve(undefined); return; }
      const r = new FileReader();
      r.onload = () => resolve(typeof r.result === 'string' ? r.result : undefined);
      r.onerror = () => resolve(undefined);
      r.readAsText(f);
    });
    document.body.appendChild(input);
    input.click();
  });
}
