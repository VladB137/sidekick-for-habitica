/*
 * The weekly almanac's counting (almanac.ts), kept apart from the app so tests can run it: what the account had
 * at a read, what changed between two reads, and the week-by-week record the phone keeps.
 */
import { weekOf } from '../engine';

type Json = any;

/** What the account had: pets alive and raised, mounts, each quest's wins, the longest Daily streak. */
export interface Owned { alive: string[], raised: string[], mounts: string[], quests: Record<string, number>, streak: number }
/** A week being counted: since `from` (a Habitica day), from `start` up to the latest read `end`; `streak` the longest seen. */
export interface Ledger { week: number, from: number, start: Owned, end: Owned, streak: number }
/** What a week brought, frozen when the next week began */
export interface Tally { week: number, from: number, hatched: number, raised: number, quests: string[], streak: number }
export interface Rec { cur?: Ledger, last?: Tally, offered?: number }

/** What a read says the account has (undefined: a read without the stable). */
export function ownedOf (raw: Json, dailyStreaks: number[]): Owned | undefined {
  const pets = raw?.items?.pets, mounts = raw?.items?.mounts;
  if (!pets || typeof pets !== 'object') return undefined;
  const alive: string[] = [], raised: string[] = [];
  for (const k of Object.keys(pets)) { const n = pets[k]; if (typeof n === 'number' && n > 0) alive.push(k); else if (n === -1) raised.push(k); }
  const quests: Record<string, number> = {}, q = raw?.achievements?.quests;
  if (q && typeof q === 'object') for (const k of Object.keys(q)) if (typeof q[k] === 'number' && q[k] > 0) quests[k] = q[k];
  return {
    alive, raised, quests,
    mounts: mounts && typeof mounts === 'object' ? Object.keys(mounts).filter(k => mounts[k] === true) : [],
    streak: dailyStreaks.reduce((a, b) => Math.max(a, b || 0), 0),
  };
}

/** What changed from `a` to `b`: pets hatched (new, or hatched again after being raised), mounts raised, quests won. */
export function changes (a: Owned, b: Owned): { hatched: number, raised: number, quests: string[] } {
  const had = new Set([...a.alive, ...a.raised]), wasRaised = new Set(a.raised), mounts = new Set(a.mounts);
  const hatched = b.alive.filter(k => !had.has(k) || wasRaised.has(k)).length + b.raised.filter(k => !had.has(k)).length;
  const quests: string[] = [];
  for (const k of Object.keys(b.quests)) for (let i = a.quests[k] || 0; i < b.quests[k]; i++) quests.push(k);
  return { hatched, raised: b.mounts.filter(k => !mounts.has(k)).length, quests };
}

/**
 * The record after a read on Habitica day `today`. A new week freezes the last one's tally (only if it was the
 * week before) and counts on from that week's latest read, so what happened between two reads isn't lost.
 */
export function noteRead (rec: Rec, now: Owned, today: number): Rec {
  const week = weekOf(today), cur = rec.cur;
  if (!cur) return { ...rec, cur: { week, from: today, start: now, end: now, streak: now.streak } };
  if (cur.week === week) return { ...rec, cur: { ...cur, end: now, streak: Math.max(cur.streak, now.streak) } };
  if (cur.week > week) return rec; // the phone's clock went back: keep counting the newer week
  const prev = cur.week === week - 7;
  const last = prev ? { week: cur.week, from: cur.from, ...changes(cur.start, cur.end), streak: cur.streak } : undefined;
  const start = prev ? cur.end : now;
  return { ...rec, last, cur: { week, from: prev ? week : today, start, end: now, streak: Math.max(start.streak, now.streak) } };
}

