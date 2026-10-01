/**
 * React hook: the current progress file, re-rendering on every change.
 */
import { useCallback, useSyncExternalStore } from 'react';
import type { ProgressApi, ProgressFile } from '../shared/progress';

export function useProgress(api: ProgressApi): ProgressFile {
  const subscribe = useCallback((onChange: () => void) => api.subscribe(() => onChange()), [api]);
  const getSnapshot = useCallback(() => api.get(), [api]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
