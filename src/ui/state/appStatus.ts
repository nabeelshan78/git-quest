/**
 * Status shown on the app root for tests and styling:
 * data-phase, data-ready, data-level.
 */
import { create } from 'zustand';
import type { LevelPhase } from '../../shared/session';

export interface AppStatus {
  phase: LevelPhase | null;
  ready: boolean;
  level: string | null;
}

interface AppStatusStore extends AppStatus {
  set(patch: Partial<AppStatus>): void;
  clear(): void;
}

export const useAppStatus = create<AppStatusStore>()((set) => ({
  phase: null,
  ready: false,
  level: null,
  set: (patch) => set(patch),
  clear: () => set({ phase: null, ready: false, level: null }),
}));
