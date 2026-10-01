/**
 * Public API of the classroom module (progress saving, export/import,
 * professor dashboard data).
 * @stub-owner classroom — minimal foundation version so other workstreams
 * can run. The Classroom workstream replaces it completely, keeping the
 * signatures. The dashboard page component is `ProfessorDashboard` in
 * ./ProfessorDashboard.tsx.
 */
import { PROGRESS_FORMAT, PROGRESS_STORAGE_KEY, PROGRESS_VERSION, ProgressFileSchema } from '../shared/progress';
import type { LevelResult, ProgressApi, ProgressFile } from '../shared/progress';

/** Minimal storage interface (localStorage satisfies it; tests pass an in-memory one). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function emptyProgress(): ProgressFile {
  return {
    format: PROGRESS_FORMAT,
    version: PROGRESS_VERSION,
    exportedAt: new Date(0).toISOString(),
    appVersion: '0.1.0',
    player: { id: 'local', name: '', handle: 'intern', email: 'intern@lanternlabs.example', classCode: '', createdAt: new Date(0).toISOString() },
    levels: {},
    glossary: [],
    badges: [],
    sandboxMinutes: 0,
  };
}

export function createProgressStore(storage?: StorageLike): ProgressApi {
  let state = emptyProgress();
  try {
    const raw = storage?.getItem(PROGRESS_STORAGE_KEY);
    if (raw) state = ProgressFileSchema.parse(JSON.parse(raw));
  } catch {
    state = emptyProgress();
  }
  const listeners = new Set<(p: ProgressFile) => void>();
  const set = (next: ProgressFile) => {
    state = next;
    storage?.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(state));
    for (const l of listeners) l(state);
  };
  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setProfile: (patch) => set({ ...state, player: { ...state.player, ...patch } }),
    recordAttemptStart: () => undefined,
    recordResult(result: LevelResult) {
      const prev = state.levels[result.levelId];
      const stars = Math.max(prev?.stars ?? 0, result.completed ? result.stars : 0);
      set({
        ...state,
        levels: {
          ...state.levels,
          [result.levelId]: {
            levelId: result.levelId,
            completed: (prev?.completed ?? false) || result.completed,
            stars,
            attempts: (prev?.attempts ?? 0) + 1,
            completions: (prev?.completions ?? 0) + (result.completed ? 1 : 0),
            timeSpentSec: (prev?.timeSpentSec ?? 0) + result.timeMs / 1000,
            bestTimeSec: prev?.bestTimeSec ?? null,
            bestCommands: prev?.bestCommands ?? null,
            hintsUsed: (prev?.hintsUsed ?? 0) + result.hintsRevealed,
            maxHintTier: Math.max(prev?.maxHintTier ?? 0, result.hintsRevealed),
            commandsTyped: (prev?.commandsTyped ?? 0) + result.commandsTyped,
            errors: (prev?.errors ?? 0) + result.errors,
            errorCodes: { ...(prev?.errorCodes ?? {}) },
            rewinds: (prev?.rewinds ?? 0) + result.rewinds,
            firstCompletedAt: prev?.firstCompletedAt ?? null,
            lastPlayedAt: null,
          },
        },
      });
    },
    unlockGlossary: (ids) => set({ ...state, glossary: [...new Set([...state.glossary, ...ids])] }),
    awardBadge: (id) => set({ ...state, badges: [...new Set([...state.badges, id])] }),
    addSandboxMinutes: (m) => set({ ...state, sandboxMinutes: state.sandboxMinutes + m }),
    exportFile: () => JSON.stringify(state, null, 2),
    exportCsv: () => ['level,completed,stars', ...Object.values(state.levels).map((l) => `${l.levelId},${l.completed},${l.stars}`)].join('\n'),
    importFile(text) {
      const parsed = ProgressFileSchema.safeParse(JSON.parse(text));
      if (!parsed.success) return { ok: false, error: 'This is not a Git Quest progress file.' };
      set(parsed.data);
      return { ok: true };
    },
    reset: () => set(emptyProgress()),
  };
}
