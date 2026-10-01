/**
 * localStorage that never throws (private windows, disabled storage, tests).
 */
import type { StorageLike } from '../../classroom';

const memory = new Map<string, string>();

const memoryStorage: StorageLike = {
  getItem: (k) => memory.get(k) ?? null,
  setItem: (k, v) => void memory.set(k, v),
  removeItem: (k) => void memory.delete(k),
};

export function safeStorage(): StorageLike {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return memoryStorage;
    const ls = window.localStorage;
    return {
      getItem(k) {
        try {
          return ls.getItem(k);
        } catch {
          return memoryStorage.getItem(k);
        }
      },
      setItem(k, v) {
        try {
          ls.setItem(k, v);
        } catch {
          memoryStorage.setItem(k, v);
        }
      },
      removeItem(k) {
        try {
          ls.removeItem(k);
        } catch {
          memoryStorage.removeItem(k);
        }
      },
    };
  } catch {
    return memoryStorage;
  }
}
