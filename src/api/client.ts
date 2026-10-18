/*
 * Minimal Habitica API v3 client. Follows Habitica's third-party rules
 * (github.com/HabitRPG/habitica/wiki/API-Usage-Guidelines):
 *   - every request carries x-client: "<tool author's User ID>-SidekickForHabitica"
 *   - no background loops: every call here is started by a tap, except a sync the player asked for
 *   - 429 responses are honoured (Retry-After) and never retried in a tight loop
 * The API token only ever goes to habitica.com (or a local test server in development builds).
 */

/**
 * The tool author's Habitica User ID, required in x-client so Habitica can tell which tool a request
 * comes from and whom to contact about it. It is Vlad's User ID (a public identifier, not a token),
 * set 2026-10-18 for the public release.
 */
export const AUTHOR_USER_ID = '429e9031-1e56-4478-82f0-769ee3a6ff0d';
export const APP_NAME = 'SidekickForHabitica';
export const HABITICA = 'https://habitica.com';

export interface Credentials { userId: string, apiToken: string }
/** How a request goes out: fetch(), except for the made-up account, whose requests are answered on the device (app/demo-account.ts). */
export type Send = (url: string, init: RequestInit) => Promise<Response>;

export class ApiError extends Error {
  constructor (message: string, public status: number, public code?: string) { super(message); }
}

export interface RateInfo { limit?: number, remaining?: number, reset?: string, /** after a 429: no requests before this time (ms) */ retryAt?: number }

/** A request that hasn't answered after this long is treated as a lost connection. */
const TIMEOUT_MS = 20_000;

export type Json = any; // Habitica responses are large and loosely typed; the model layer picks what it needs

export class HabiticaApi {
  rate: RateInfo = {};
  /** Habitica's server version, reported with every successful answer (server/middlewares/response.js) */
  appVersion?: string;
  private base: string;
  private client: string;

  constructor (private creds: Credentials, base: string = HABITICA, private send: Send = (url, init) => fetch(url, init)) {
    this.base = base.replace(/\/$/, '');
    this.client = HabiticaApi.clientFor(creds);
  }

  /** The x-client value for these credentials (the Android app stores it with the token, so there is one source). */
  static clientFor (creds: Credentials): string { return `${AUTHOR_USER_ID || creds.userId}-${APP_NAME}`; }

  private async call (method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<{ data: Json, message?: string }> {
    const headers: Record<string, string> = {
      'x-api-user': this.creds.userId,
      'x-api-key': this.creds.apiToken,
      'x-client': this.client,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';
    // after a 429 nothing goes out until Retry-After has passed, whoever asks (Habitica's rule; a request now would only be refused again)
    const wait = this.rate.retryAt ? Math.ceil((this.rate.retryAt - Date.now()) / 1000) : 0;
    if (wait > 0) throw new ApiError(`Habitica allows ${this.rate.limit ?? 30} requests a minute. Try again in ${wait} s.`, 429, 'rateLimited');
    let res: Response;
    const ctl = typeof AbortController === 'function' ? new AbortController() : undefined;
    const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : undefined;
    const lost = () => new ApiError('Could not reach Habitica. Check your connection.', 0, 'network');
    try {
      res = await this.send(`${this.base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store', signal: ctl?.signal });
    } catch {
      if (timer) clearTimeout(timer);
      throw lost();
    }
    // keep the last known window if a response carries no rate headers
    const lim = res.headers.get('x-ratelimit-limit');
    const rem = res.headers.get('x-ratelimit-remaining');
    if (lim !== null || rem !== null) {
      // a 429's wait still holds when a request sent alongside it answers later
      const retryAt = this.rate.retryAt && this.rate.retryAt > Date.now() ? this.rate.retryAt : undefined;
      this.rate = { limit: lim ? Number(lim) : this.rate.limit, remaining: rem ? Number(rem) : undefined, reset: res.headers.get('x-ratelimit-reset') || undefined, retryAt };
    }
    // the timeout also covers reading the body (a large answer can stall mid-way on a flaky connection)
    let json: Json = null;
    try {
      json = await res.json();
    } catch {
      if (ctl?.signal.aborted) throw lost();
      /* otherwise an empty or non-JSON body */
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (res.status === 429) {
      // Retry-After is in seconds and may be fractional
      const wait = Math.max(1, Math.ceil(Number(res.headers.get('retry-after')) || 60));
      this.rate = { ...this.rate, remaining: 0, retryAt: Date.now() + wait * 1000 };
      throw new ApiError(`Habitica allows ${this.rate.limit ?? 30} requests a minute. Try again in ${wait} s.`, 429, 'rateLimited');
    }
    if (!res.ok || !json || json.success === false) {
      throw new ApiError(json?.message || res.statusText || 'Request failed', res.status, json?.error);
    }
    if (typeof json.appVersion === 'string') this.appVersion = json.appVersion;
    return { data: json.data, message: json.message };
  }

  /**
   * The whole user. Deliberately without ?userFields: only the unfiltered response carries
   * needsCron and the computed stats (maxMP, toNextLevel) — see server/libs/user/index.js.
   */
  getUser () { return this.call('GET', '/api/v3/user').then(r => r.data); }
  getTasks () { return this.call('GET', '/api/v3/tasks/user').then(r => r.data as Json[]); }
  /** Ticked To-Dos (Habitica keeps them 30 days, 90 for subscribers), newest first; the plain task list leaves them out. */
  getCompletedTodos () { return this.call('GET', '/api/v3/tasks/user?type=completedTodos').then(r => r.data as Json[]); }
  getParty () { return this.call('GET', '/api/v3/groups/party').then(r => r.data).catch(e => { if (e.status === 404) return null; throw e; }); }
  /** Party members with their public stats (computed max MP included); a party has at most 30. */
  getPartyMembers () { return this.call('GET', '/api/v3/groups/party/members?includeAllPublicFields=true&limit=30').then(r => r.data as Json[]).catch(e => { if (e.status === 404) return []; throw e; }); }
  getSeasonalShop () { return this.call('GET', '/api/v3/shops/seasonal').then(r => r.data); }

  /** A new To-Do (a repeating To-Do coming back); only ever on a tap. */
  createTodo (body: { text: string, notes?: string, priority: number, checklist?: Array<{ text: string, completed: boolean }> }) {
    return this.call('POST', '/api/v3/tasks/user', { type: 'todo', ...body }).then(r => r.data);
  }
  score (taskId: string, direction: 'up' | 'down') { return this.call('POST', `/api/v3/tasks/${encodeURIComponent(taskId)}/score/${direction}`).then(r => r.data); }
  scoreChecklist (taskId: string, itemId: string) { return this.call('POST', `/api/v3/tasks/${encodeURIComponent(taskId)}/checklist/${encodeURIComponent(itemId)}/score`).then(r => r.data); }
  cast (spellId: string, targetId?: string) {
    const q = targetId ? `?targetId=${encodeURIComponent(targetId)}` : '';
    return this.call('POST', `/api/v3/user/class/cast/${encodeURIComponent(spellId)}${q}`, {}).then(r => r.data);
  }
  buyPotion () { return this.call('POST', '/api/v3/user/buy-health-potion').then(r => r.data); }
  buyGear (key: string) { return this.call('POST', `/api/v3/user/buy-gear/${encodeURIComponent(key)}`).then(r => r.data); }
  buyQuest (key: string) { return this.call('POST', `/api/v3/user/buy-quest/${encodeURIComponent(key)}`).then(r => r.data); }
  buySpecial (key: string) { return this.call('POST', `/api/v3/user/buy-special-spell/${encodeURIComponent(key)}`).then(r => r.data); }
  buyGems (quantity: number) { return this.call('POST', '/api/v3/user/purchase/gems/gem', { quantity }).then(r => r.data); }
  sell (type: string, key: string, amount: number) { return this.call('POST', `/api/v3/user/sell/${type}/${encodeURIComponent(key)}?amount=${amount}`).then(r => r.data); }
  equip (key: string) { return this.call('POST', `/api/v3/user/equip/equipped/${encodeURIComponent(key)}`).then(r => r.data); }
  /** Ride a mount, or get off it when it's the one ridden (Habitica toggles); answers with the account's items. */
  equipMount (key: string) { return this.call('POST', `/api/v3/user/equip/mount/${encodeURIComponent(key)}`).then(r => r.data); }
  allocate (stat: string) { return this.call('POST', `/api/v3/user/allocate?stat=${stat}`).then(r => r.data); }
  cron () { return this.call('POST', '/api/v3/cron').then(r => r.data); }
  revive () { return this.call('POST', '/api/v3/user/revive').then(r => r.data); }
}
