/* Navigation entry points for views (main.ts owns the history handling). */
export type Route = 'now' | 'tasks' | 'plan' | 'stats' | 'settings' | 'history' | 'stable';
/** screens opened from a tab rather than from the bottom navigation, and the tab they belong to */
export const PARENT: Partial<Record<Route, Route>> = { history: 'stats' };
let impl: (r: Route) => void = r => { location.hash = `#${r}`; };
export const go = (r: Route) => impl(r);
let fullImpl: (on: boolean) => void = () => {};
/** The Stable full screen on (from anywhere; Back leaves it) or off. */
export const setStableFull = (on: boolean) => fullImpl(on);
export const setNavigator = (f: (r: Route) => void, full: (on: boolean) => void) => { impl = f; fullImpl = full; };
