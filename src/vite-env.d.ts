/// <reference types="vite/client" />
declare const __APP_VERSION__: string;
declare const __BUILD_DATE__: string;

/** Habitica's game code and the habitica.com stand-in, for the made-up account (vite.config.ts habiticaGame()). */
declare module 'virtual:habitica-game' {
  const H: unknown;
  export default H;
  export interface MockAnswer { status: number, headers: Record<string, string>, body: string }
  export function createMock (H: unknown, o?: { rate?: number, cls?: string, level?: number }): {
    handle (r: { method: string, path: string, headers?: Record<string, string>, body?: string }): Promise<MockAnswer>
  };
  export const USER_ID: string;
  export const API_TOKEN: string;
}
