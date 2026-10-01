/**
 * The live progress store used by the game (implements ProgressApi).
 *
 * Progress is saved in the browser under PROGRESS_STORAGE_KEY after every
 * change. Damaged saved data is copied to CORRUPT_BACKUP_KEY and the player
 * starts fresh; nothing here ever throws because of storage problems.
 */
import i18n from '../i18n';
import { PROGRESS_STORAGE_KEY, ProgressFileSchema } from '../shared/progress';
import type { LevelResult, ProgressApi, ProgressFile } from '../shared/progress';
import { version as packageVersion } from '../../package.json';
import { describeParseError, parseProgressFile, serializeProgressFile } from './progressFile';
import type { Translate } from './progressFile';
import {
  addUnique,
  applyAttemptStart,
  applyDaily,
  applyLevelResult,
  applyProfilePatch,
  createEmptyProgress,
} from './progressLogic';
import type { ProfilePatch } from './progressLogic';

/** Minimal storage interface (localStorage satisfies it; tests pass an in-memory one). */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const APP_VERSION: string = packageVersion;

const translate: Translate = (key, options) => String(i18n.t(key, options));

/** Where damaged saved progress is copied before starting fresh. */
export const CORRUPT_BACKUP_KEY = `${PROGRESS_STORAGE_KEY}.corrupt-backup`;

/**
 * new        – nothing was saved yet (first launch)
 * loaded     – saved progress was read
 * recovered  – saved progress was damaged; it was backed up and a fresh start was made
 * unavailable – the browser blocked storage; progress lives in memory only
 */
export type LoadStatus = 'new' | 'loaded' | 'recovered' | 'unavailable';

export interface ProgressStoreOptions {
  /** Clock (tests inject a fixed one). */
  now?: () => Date;
  /** Player id generator (defaults to crypto.randomUUID with a fallback). */
  createId?: () => string;
  appVersion?: string;
}

export interface ResetOptions {
  /** Keep the name, class code and player id (default true). */
  keepProfile?: boolean;
}

/** ProgressApi plus a few extras for settings screens and tests. */
export interface ProgressStore extends ProgressApi {
  /** Clears levels, glossary, badges, daily practice and sandbox time. */
  reset(options?: ResetOptions): void;
  /** How the saved progress was found when the store was created. */
  getLoadStatus(): LoadStatus;
  /** True when the most recent save to browser storage failed (e.g. storage full). */
  hasSaveError(): boolean;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** A random UUID. Uses crypto.randomUUID when available. */
export function generatePlayerId(): string {
  const c: Crypto | undefined = typeof globalThis.crypto === 'object' ? globalThis.crypto : undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === 'function') {
    c.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const h = hex(bytes);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function safeGet(storage: StorageLike | undefined, key: string): { ok: true; value: string | null } | { ok: false } {
  if (!storage) return { ok: true, value: null };
  try {
    return { ok: true, value: storage.getItem(key) };
  } catch {
    return { ok: false };
  }
}

function safeSet(storage: StorageLike | undefined, key: string, value: string): boolean {
  if (!storage) return true;
  try {
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readSaved(raw: string): ProgressFile | null {
  try {
    const parsed = ProgressFileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function createProgressStore(storage?: StorageLike, options: ProgressStoreOptions = {}): ProgressStore {
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? generatePlayerId;
  const appVersion = options.appVersion ?? APP_VERSION;
  const nowIso = () => now().toISOString();
  const fresh = (): ProgressFile => createEmptyProgress(createId(), nowIso(), appVersion);

  let state: ProgressFile;
  let loadStatus: LoadStatus;
  const saved = safeGet(storage, PROGRESS_STORAGE_KEY);
  if (!saved.ok) {
    state = fresh();
    loadStatus = 'unavailable';
  } else if (saved.value === null) {
    state = fresh();
    loadStatus = 'new';
  } else {
    const file = readSaved(saved.value);
    if (file) {
      state = file;
      loadStatus = 'loaded';
    } else {
      safeSet(storage, CORRUPT_BACKUP_KEY, saved.value);
      state = fresh();
      loadStatus = 'recovered';
    }
  }

  let saveError = false;
  const persist = () => {
    saveError = !safeSet(storage, PROGRESS_STORAGE_KEY, JSON.stringify(state));
  };
  if (loadStatus !== 'loaded' && loadStatus !== 'unavailable') persist();

  const listeners = new Set<(p: ProgressFile) => void>();
  /** Level ids whose attempt start was counted and whose result has not arrived yet. */
  const openAttempts = new Set<string>();

  const commit = (next: ProgressFile) => {
    if (next === state) return;
    state = { ...next, exportedAt: nowIso() };
    persist();
    for (const listener of [...listeners]) listener(state);
  };

  return {
    get: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    setProfile(patch: ProfilePatch) {
      commit(applyProfilePatch(state, patch));
    },
    recordAttemptStart(levelId: string) {
      if (!levelId) return;
      openAttempts.add(levelId);
      commit(applyAttemptStart(state, levelId, nowIso()));
    },
    recordResult(result: LevelResult) {
      if (!result || !result.levelId) return;
      const counted = openAttempts.delete(result.levelId);
      commit(applyLevelResult(state, result, nowIso(), counted));
    },
    recordDaily(date: string, levelIds: string[], completed: number) {
      commit(applyDaily(state, date, levelIds, completed));
    },
    unlockGlossary(termIds: string[]) {
      const glossary = addUnique(state.glossary, termIds);
      if (glossary) commit({ ...state, glossary });
    },
    awardBadge(badgeId: string) {
      const badges = addUnique(state.badges, [badgeId]);
      if (badges) commit({ ...state, badges });
    },
    addSandboxMinutes(minutes: number) {
      if (!Number.isFinite(minutes) || minutes <= 0) return;
      commit({ ...state, sandboxMinutes: Math.round((state.sandboxMinutes + minutes) * 100) / 100 });
    },
    exportFile() {
      return serializeProgressFile({ ...state, appVersion }, nowIso());
    },
    importFile(text: string) {
      const parsed = parseProgressFile(typeof text === 'string' ? text : '');
      if (!parsed.ok) return { ok: false as const, error: describeParseError(parsed.error, translate) };
      openAttempts.clear();
      commit(parsed.file);
      return { ok: true as const };
    },
    reset(resetOptions: ResetOptions = {}) {
      const keepProfile = resetOptions.keepProfile ?? true;
      const blank = fresh();
      openAttempts.clear();
      commit(keepProfile ? { ...blank, player: state.player } : blank);
    },
    getLoadStatus: () => loadStatus,
    hasSaveError: () => saveError,
  };
}
