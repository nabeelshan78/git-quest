/**
 * Public API of the classroom module (progress saving, export/import,
 * professor dashboard data).
 * @stub-owner classroom — the Classroom workstream implements these,
 * keeping the signatures. The dashboard page component is
 * `ProfessorDashboard` in ./ProfessorDashboard.tsx.
 */
import type { ProgressApi } from '../shared/progress';

/** Minimal storage interface (localStorage satisfies it; tests pass an in-memory one). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createProgressStore(_storage?: StorageLike): ProgressApi {
  throw new Error('createProgressStore is not available yet');
}
