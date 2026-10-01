/**
 * Helpers for the classroom unit and component tests (not used by the app).
 */
import type { LevelProgress, LevelResult, ProgressFile } from '../shared/progress';
import { withChecksum } from './checksum';
import { createEmptyProgress, deriveHandle, defaultEmail, emptyLevelProgress } from './progressLogic';
import type { StorageLike } from './store';

/** In-memory StorageLike. */
export class MemoryStorage implements StorageLike {
  readonly data = new Map<string, string>();
  getItem(key: string): string | null {
    return this.data.has(key) ? (this.data.get(key) as string) : null;
  }
  setItem(key: string, value: string): void {
    this.data.set(key, String(value));
  }
  removeItem(key: string): void {
    this.data.delete(key);
  }
}

/** A clock that only moves when told to. */
export function fakeClock(start = '2026-09-01T10:00:00.000Z') {
  let t = Date.parse(start);
  return {
    now: () => new Date(t),
    advance(ms: number) {
      t += ms;
    },
    set(iso: string) {
      t = Date.parse(iso);
    },
  };
}

/** A LevelResult with sensible defaults. */
export function levelResult(partial: Partial<LevelResult> & { levelId: string }): LevelResult {
  return {
    mode: 'story',
    completed: true,
    stars: 3,
    commandsUsed: 2,
    commandsTyped: 4,
    par: 2,
    hintsRevealed: 0,
    errors: 0,
    errorCodes: {},
    rewinds: 0,
    timeMs: 60_000,
    recap: 'Recap.',
    ...partial,
  };
}

export interface FileSpec {
  id: string;
  name?: string;
  classCode?: string;
  exportedAt?: string;
  levels?: Record<string, Partial<LevelProgress>>;
  /** Sign the file (default true). */
  sign?: boolean;
}

/** A valid progress file for dashboard tests. */
export function makeProgressFile(spec: FileSpec): ProgressFile {
  const base = createEmptyProgress(spec.id, '2026-09-01T09:00:00.000Z', 'test');
  const name = spec.name ?? '';
  const handle = deriveHandle(name);
  const levels: Record<string, LevelProgress> = {};
  for (const [id, partial] of Object.entries(spec.levels ?? {})) {
    levels[id] = { ...emptyLevelProgress(id), attempts: 1, ...partial };
  }
  const file: ProgressFile = {
    ...base,
    exportedAt: spec.exportedAt ?? '2026-09-20T12:00:00.000Z',
    player: { ...base.player, name, handle, email: defaultEmail(handle), classCode: spec.classCode ?? '' },
    levels,
  };
  return spec.sign === false ? file : withChecksum(file);
}
