/**
 * Runtime environment flags for the UI.
 *
 * `?test=1` (in the query string or in the hash query, e.g. `#/play/1.4?test=1`)
 * switches on test mode for the whole page lifetime: no first-launch dialog,
 * instant animations and demos, nothing that blocks input.
 */
import { createContext, useContext } from 'react';

export interface AppEnv {
  /** Playwright / automated test mode. */
  testMode: boolean;
  /** Vite dev server (enables the #/dev route). */
  dev: boolean;
}

export function detectTestMode(loc: { search: string; hash: string }): boolean {
  if (new URLSearchParams(loc.search).get('test') === '1') return true;
  const q = loc.hash.indexOf('?');
  return q >= 0 && new URLSearchParams(loc.hash.slice(q + 1)).get('test') === '1';
}

export function detectEnv(): AppEnv {
  const loc = typeof window !== 'undefined' ? window.location : { search: '', hash: '' };
  return { testMode: detectTestMode(loc), dev: import.meta.env.DEV };
}

export const AppEnvContext = createContext<AppEnv>({ testMode: false, dev: false });

export function useAppEnv(): AppEnv {
  return useContext(AppEnvContext);
}

/** The profile used automatically in test mode. */
export const TEST_PROFILE = { name: 'Test Player', handle: 'tester', email: 'test.player@example.com' } as const;
