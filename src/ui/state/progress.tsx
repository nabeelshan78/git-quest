/**
 * React access to the progress store (src/classroom).
 */
import { createContext, useContext, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { createProgressStore } from '../../classroom';
import type { ProgressApi, ProgressFile } from '../../shared/progress';
import { safeStorage } from './storage';

let defaultStore: ProgressApi | null = null;

/** The app-wide store backed by localStorage (created on first use). */
export function getDefaultProgressStore(): ProgressApi {
  defaultStore ??= createProgressStore(safeStorage());
  return defaultStore;
}

const ProgressContext = createContext<ProgressApi | null>(null);

export function ProgressProvider({ store, children }: { store: ProgressApi; children: ReactNode }) {
  return <ProgressContext.Provider value={store}>{children}</ProgressContext.Provider>;
}

export function useProgressApi(): ProgressApi {
  const ctx = useContext(ProgressContext);
  return ctx ?? getDefaultProgressStore();
}

export function useProgress(): ProgressFile {
  const api = useProgressApi();
  return useSyncExternalStore(
    (cb) => {
      const off = api.subscribe(() => cb());
      return () => void off();
    },
    api.get,
    api.get,
  );
}
