/**
 * Optional memory of the imported class in the professor's own browser
 * (localStorage). Nothing is uploaded anywhere.
 */
import { ProgressFileSchema } from '../shared/progress';
import { makeRecord } from './aggregate';
import type { StudentRecord } from './aggregate';
import type { StorageLike } from './store';

export const CLASSROOM_STORAGE_KEY = 'gitquest.classroom.v1';
export const CLASSROOM_REMEMBER_KEY = 'gitquest.classroom.remember.v1';
const SAVED_FORMAT = 'git-quest-classroom';

interface SavedStudent {
  sourceName: string;
  sample: boolean;
  file: unknown;
}

/** Students remembered in this browser (invalid entries are skipped). */
export function loadSavedClass(storage: StorageLike | null | undefined): StudentRecord[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(CLASSROOM_STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { format?: unknown; students?: unknown };
    if (data.format !== SAVED_FORMAT || !Array.isArray(data.students)) return [];
    const out: StudentRecord[] = [];
    for (const item of data.students as SavedStudent[]) {
      const parsed = ProgressFileSchema.safeParse(item?.file);
      if (!parsed.success) continue;
      if (out.some((r) => r.id === parsed.data.player.id)) continue;
      out.push(makeRecord(parsed.data, typeof item.sourceName === 'string' ? item.sourceName : '', item.sample === true));
    }
    return out;
  } catch {
    return [];
  }
}

/** Remember the class. Returns false when the browser refused (e.g. storage full). */
export function saveClass(storage: StorageLike | null | undefined, records: StudentRecord[]): boolean {
  if (!storage) return true;
  try {
    if (records.length === 0) {
      storage.removeItem(CLASSROOM_STORAGE_KEY);
      return true;
    }
    const students: SavedStudent[] = records.map((r) => ({ sourceName: r.sourceName, sample: r.sample, file: r.file }));
    storage.setItem(CLASSROOM_STORAGE_KEY, JSON.stringify({ format: SAVED_FORMAT, version: 1, students }));
    return true;
  } catch {
    return false;
  }
}

export function clearSavedClass(storage: StorageLike | null | undefined): void {
  try {
    storage?.removeItem(CLASSROOM_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was saved, so nothing to clear.
  }
}

/** Remember imported files in this browser? Default: yes. */
export function loadRememberPreference(storage: StorageLike | null | undefined): boolean {
  try {
    return storage?.getItem(CLASSROOM_REMEMBER_KEY) !== '0';
  } catch {
    return true;
  }
}

export function saveRememberPreference(storage: StorageLike | null | undefined, remember: boolean): void {
  try {
    storage?.setItem(CLASSROOM_REMEMBER_KEY, remember ? '1' : '0');
  } catch {
    // Storage blocked: the choice applies to this visit only.
  }
}
