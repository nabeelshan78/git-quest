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
/** Daily practice history keeps this many most recent days. */
export const DAILY_HISTORY_LIMIT = 60;

const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

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
    daily: { streak: 0, lastDate: null, history: [] },
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
    challenge: null,
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
  const name = patch.name !== undefined ? patch.name.trim().slice(0, NAME_MAX_LENGTH) : prev.name;
  let handle = prev.handle;
  if (patch.handle !== undefined) {
    handle = HANDLE_PATTERN.test(patch.handle) ? patch.handle : deriveHandle(patch.handle);
  } else if (name !== prev.name) {
    handle = deriveHandle(name);
  }
  let email = prev.email;
  if (patch.email !== undefined && patch.email.trim() !== '') {
    email = patch.email.trim();
  } else if (patch.email !== undefined || email === '' || email === defaultEmail(prev.handle)) {
    email = defaultEmail(handle);
  }
  const classCode = patch.classCode !== undefined ? patch.classCode.trim().slice(0, CLASS_CODE_MAX_LENGTH) : prev.classCode;
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
 * Story and daily results update the level's stats; challenge results
 * update only its `challenge` record (and undo the counted story attempt).
 */
export function applyLevelResult(file: ProgressFile, result: LevelResult, nowIso: string, attemptCounted: boolean): ProgressFile {
  const prev = file.levels[result.levelId] ?? emptyLevelProgress(result.levelId);
  const seconds = msToSeconds(result.timeMs);
  const commands = toCount(result.commandsUsed);
  let next: LevelProgress;
  if (result.mode === 'challenge') {
    const before = prev.challenge ?? { completed: false, bestTimeSec: null, bestCommands: null };
    const challenge = result.completed
      ? { completed: true, bestTimeSec: minOrNull(before.bestTimeSec, seconds), bestCommands: minOrNull(before.bestCommands, commands) }
      : before;
    next = {
      ...prev,
      attempts: attemptCounted ? Math.max(0, prev.attempts - 1) : prev.attempts,
      lastPlayedAt: nowIso,
      challenge,
    };
  } else {
    const done = result.completed;
    next = {
      ...prev,
      completed: prev.completed || done,
      stars: Math.max(prev.stars, done ? clampTier(result.stars) : 0),
      attempts: attemptCounted ? prev.attempts : prev.attempts + 1,
      completions: prev.completions + (done ? 1 : 0),
      timeSpentSec: Math.round((prev.timeSpentSec + seconds) * 10) / 10,
      bestTimeSec: done ? minOrNull(prev.bestTimeSec, seconds) : prev.bestTimeSec,
      bestCommands: done ? minOrNull(prev.bestCommands, commands) : prev.bestCommands,
      hintsUsed: prev.hintsUsed + clampTier(result.hintsRevealed),
      maxHintTier: Math.max(prev.maxHintTier, clampTier(result.hintsRevealed)),
      commandsTyped: prev.commandsTyped + toCount(result.commandsTyped),
      errors: prev.errors + toCount(result.errors),
      errorCodes: mergeErrorCodes(prev.errorCodes, result.errorCodes ?? {}),
      rewinds: prev.rewinds + toCount(result.rewinds),
      firstCompletedAt: prev.firstCompletedAt ?? (done ? nowIso : null),
      lastPlayedAt: nowIso,
    };
  }
  return { ...file, levels: { ...file.levels, [result.levelId]: next } };
}

/** Day number of a "YYYY-MM-DD" date (UTC), or null when it is not a real date. */
export function dayNumber(date: string): number | null {
  const m = DATE_PATTERN.exec(date);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const check = new Date(ms);
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null;
  return Math.round(ms / DAY_MS);
}

/**
 * Record a daily practice session. A day with at least one completed puzzle
 * extends the streak when it follows the last practice day, or restarts it
 * at 1 after a gap. Replaying the same day merges into that day's entry.
 * A date before the last practice day only updates history.
 */
export function applyDaily(file: ProgressFile, date: string, levelIds: string[], completed: number): ProgressFile {
  const day = dayNumber(date);
  if (day === null) return file;
  const done = toCount(completed);
  const history = [...file.daily.history];
  const index = history.findIndex((h) => h.date === date);
  if (index >= 0) {
    const old = history[index];
    history[index] = { date, levels: [...new Set([...old.levels, ...levelIds])], completed: Math.max(old.completed, done) };
  } else {
    history.push({ date, levels: [...new Set(levelIds)], completed: done });
  }
  history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const trimmed = history.slice(-DAILY_HISTORY_LIMIT);

  let { streak, lastDate } = file.daily;
  const lastDay = lastDate === null ? null : dayNumber(lastDate);
  if (done > 0) {
    if (lastDay === null || day > lastDay) {
      streak = lastDay !== null && day - lastDay === 1 ? streak + 1 : 1;
      lastDate = date;
    } else if (day === lastDay && streak === 0) {
      streak = 1;
    }
  }
  return { ...file, daily: { streak, lastDate, history: trimmed } };
}

/**
 * The streak to show today: the saved streak while the last practice day is
 * today or yesterday, otherwise 0 (the streak was broken).
 */
export function currentStreak(daily: ProgressFile['daily'], today: string): number {
  const now = dayNumber(today);
  const last = daily.lastDate === null ? null : dayNumber(daily.lastDate);
  if (now === null || last === null) return 0;
  return now - last <= 1 ? daily.streak : 0;
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
