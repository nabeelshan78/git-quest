/**
 * Pure progress updates. Every function returns a new ProgressFile and never
 * mutates its input. The store (./store.ts) adds persistence and listeners.
 */
import { PROGRESS_FORMAT, PROGRESS_VERSION } from '../shared/progress';
import type { LevelProgress, LevelResult, PlayerProfile, ProgressFile } from '../shared/progress';

export const DEFAULT_HANDLE = 'intern';
export const EMAIL_DOMAIN = 'lanternlabs.example';
/** Same rule as PlayerProfileSchema.handle. */
export const HANDLE_PATTERN = /^[a-z0-9][a-z0-9-]{0,38}$/;
export const HANDLE_MAX_LENGTH = 39;
export const NAME_MAX_LENGTH = 80;
export const CLASS_CODE_MAX_LENGTH = 40;

/**
 * Simulated-GitHub handle from a display name: lower case, letters, digits
 * and single hyphens, at most 39 characters. Falls back to "intern".
 */
export function deriveHandle(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, HANDLE_MAX_LENGTH)
    .replace(/-+$/, '');
  return HANDLE_PATTERN.test(slug) ? slug : DEFAULT_HANDLE;
}

export function defaultEmail(handle: string): string {
  return `${handle}@${EMAIL_DOMAIN}`;
}

/** Non-negative whole number (bad input becomes 0). */
export function toCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

/** Milliseconds to seconds with one decimal (bad input becomes 0). */
export function msToSeconds(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 100) / 10 : 0;
}

function minOrNull(previous: number | null, value: number): number {
  return previous === null ? value : Math.min(previous, value);
}

function clampTier(value: number): number {
  return Math.min(3, toCount(value));
}

export function createEmptyProgress(id: string, nowIso: string, appVersion: string): ProgressFile {
  return {
    format: PROGRESS_FORMAT,
    version: PROGRESS_VERSION,
    exportedAt: nowIso,
    appVersion,
    player: {
      id,
      name: '',
      handle: DEFAULT_HANDLE,
      email: defaultEmail(DEFAULT_HANDLE),
      classCode: '',
      createdAt: nowIso,
    },
    levels: {},
    glossary: [],
    badges: [],
    sandboxMinutes: 0,
  };
}

export function emptyLevelProgress(levelId: string): LevelProgress {
  return {
    levelId,
    completed: false,
    stars: 0,
    attempts: 0,
    completions: 0,
    timeSpentSec: 0,
    bestTimeSec: null,
    bestCommands: null,
    hintsUsed: 0,
    maxHintTier: 0,
    commandsTyped: 0,
    errors: 0,
    errorCodes: {},
    rewinds: 0,
    firstCompletedAt: null,
    lastPlayedAt: null,
  };
}

export type ProfilePatch = Partial<Omit<PlayerProfile, 'id' | 'createdAt'>>;

/**
 * Apply a profile change. When the name changes and no handle is given, the
 * handle is derived from the new name. The email follows the handle while it
 * is still the automatic `<handle>@lanternlabs.example` (or empty).
 */
export function applyProfilePatch(file: ProgressFile, patch: ProfilePatch): ProgressFile {
  const prev = file.player;
  const name = typeof patch.name === 'string' ? patch.name.trim().slice(0, NAME_MAX_LENGTH) : prev.name;
  let handle = prev.handle;
  if (typeof patch.handle === 'string') {
    handle = HANDLE_PATTERN.test(patch.handle) ? patch.handle : deriveHandle(patch.handle);
  } else if (name !== prev.name) {
    handle = deriveHandle(name);
  }
  let email = prev.email;
  if (typeof patch.email === 'string' && patch.email.trim() !== '') {
    email = patch.email.trim();
  } else if (typeof patch.email === 'string' || email === '' || email === defaultEmail(prev.handle)) {
    email = defaultEmail(handle);
  }
  const classCode = typeof patch.classCode === 'string' ? patch.classCode.trim().slice(0, CLASS_CODE_MAX_LENGTH) : prev.classCode;
  if (name === prev.name && handle === prev.handle && email === prev.email && classCode === prev.classCode) return file;
  return { ...file, player: { ...prev, name, handle, email, classCode } };
}

/** A level attempt began: counts the attempt now so a closed tab still records it. */
export function applyAttemptStart(file: ProgressFile, levelId: string, nowIso: string): ProgressFile {
  const prev = file.levels[levelId] ?? emptyLevelProgress(levelId);
  return {
    ...file,
    levels: { ...file.levels, [levelId]: { ...prev, attempts: prev.attempts + 1, lastPlayedAt: nowIso } },
  };
}

export function mergeErrorCodes(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [code, times] of Object.entries(b)) {
    const n = toCount(times);
    if (n === 0) continue;
    out[code] = (out[code] ?? 0) + n;
  }
  return out;
}

/**
 * Record the end of an attempt (completed or abandoned).
 * `attemptCounted` is true when applyAttemptStart already counted it.
 * Stars, completion and best results never get worse; totals are summed.
 */
export function applyLevelResult(file: ProgressFile, result: LevelResult, nowIso: string, attemptCounted: boolean): ProgressFile {
  const prev = file.levels[result.levelId] ?? emptyLevelProgress(result.levelId);
  const seconds = msToSeconds(result.timeMs);
  const commands = toCount(result.commandsUsed);
  const done = result.completed === true;
  const hints = clampTier(result.hintsRevealed);
  const next: LevelProgress = {
    ...prev,
    completed: prev.completed || done,
    stars: Math.max(prev.stars, done ? clampTier(result.stars) : 0),
    attempts: attemptCounted ? prev.attempts : prev.attempts + 1,
    completions: prev.completions + (done ? 1 : 0),
    timeSpentSec: Math.round((prev.timeSpentSec + seconds) * 10) / 10,
    bestTimeSec: done ? minOrNull(prev.bestTimeSec, seconds) : prev.bestTimeSec,
    bestCommands: done ? minOrNull(prev.bestCommands, commands) : prev.bestCommands,
    hintsUsed: prev.hintsUsed + hints,
    maxHintTier: Math.max(prev.maxHintTier, hints),
    commandsTyped: prev.commandsTyped + toCount(result.commandsTyped),
    errors: prev.errors + toCount(result.errors),
    errorCodes: mergeErrorCodes(prev.errorCodes, result.errorCodes ?? {}),
    rewinds: prev.rewinds + toCount(result.rewinds),
    firstCompletedAt: prev.firstCompletedAt ?? (done ? nowIso : null),
    lastPlayedAt: nowIso,
  };
  return { ...file, levels: { ...file.levels, [result.levelId]: next } };
}

/** `list` plus new items in order, or null when nothing would change. */
export function addUnique(list: string[], items: string[]): string[] | null {
  const seen = new Set(list);
  const out = [...list];
  for (const item of items) {
    if (typeof item !== 'string' || item === '' || seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.length === list.length ? null : out;
}
