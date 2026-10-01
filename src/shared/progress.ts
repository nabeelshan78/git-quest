/**
 * FROZEN CONTRACT — saved progress and the exported progress file.
 *
 * Progress lives in the browser (localStorage key PROGRESS_STORAGE_KEY).
 * Students export it ("Export my progress") as a `.gitquest.json` or CSV
 * file and submit it to their professor.
 *
 * Only the orchestrator may change this file.
 */
import { z } from 'zod';

export const PROGRESS_FORMAT = 'git-quest-progress';
export const PROGRESS_VERSION = 1;
export const PROGRESS_STORAGE_KEY = 'gitquest.progress.v1';
export const SETTINGS_STORAGE_KEY = 'gitquest.settings.v1';
export const PROGRESS_FILE_EXTENSION = '.gitquest.json';

export const PlayerProfileSchema = z.strictObject({
  /** Random id generated on first launch (not personal data). */
  id: z.string().min(1),
  /** Display name typed by the student. */
  name: z.string(),
  /** Lower-case handle used on the simulated GitHub, derived from the name (default "intern"). */
  handle: z.string().regex(/^[a-z0-9][a-z0-9-]{0,38}$/),
  /** Used for simulated commits; never sent anywhere. */
  email: z.string(),
  /** Class code given by the professor, may be empty. */
  classCode: z.string(),
  createdAt: z.string(),
});

export const LevelProgressSchema = z.strictObject({
  levelId: z.string(),
  completed: z.boolean(),
  /** Best stars earned (0 = not completed). */
  stars: z.number().int().min(0).max(3),
  attempts: z.number().int().min(0),
  completions: z.number().int().min(0),
  /** Total seconds spent in the level across attempts. */
  timeSpentSec: z.number().min(0),
  bestTimeSec: z.number().min(0).nullable(),
  /** Fewest state-changing commands in a completed attempt. */
  bestCommands: z.number().int().min(0).nullable(),
  /** Total hint reveals across attempts. */
  hintsUsed: z.number().int().min(0),
  /** Highest hint tier ever revealed (0-3). */
  maxHintTier: z.number().int().min(0).max(3),
  commandsTyped: z.number().int().min(0),
  errors: z.number().int().min(0),
  /** Error translator entry id -> times hit. */
  errorCodes: z.record(z.string(), z.number().int()),
  rewinds: z.number().int().min(0),
  firstCompletedAt: z.string().nullable(),
  lastPlayedAt: z.string().nullable(),
});

export const ProgressFileSchema = z.strictObject({
  format: z.literal(PROGRESS_FORMAT),
  version: z.literal(PROGRESS_VERSION),
  /** ISO time of export (or last save for the local copy). */
  exportedAt: z.string(),
  appVersion: z.string(),
  player: PlayerProfileSchema,
  levels: z.record(z.string(), LevelProgressSchema),
  /** Glossary term ids unlocked. */
  glossary: z.array(z.string()),
  /** Badge ids earned (cosmetic). */
  badges: z.array(z.string()),
  sandboxMinutes: z.number().min(0),
  /**
   * FNV-1a hex digest of the canonical JSON of this object without `checksum`
   * (see src/classroom). Discourages hand-editing; it is not security.
   */
  checksum: z.string().optional(),
});

export type PlayerProfile = z.infer<typeof PlayerProfileSchema>;
export type LevelProgress = z.infer<typeof LevelProgressSchema>;
export type ProgressFile = z.infer<typeof ProgressFileSchema>;

/** Reported by a game session when a level attempt ends (completed or abandoned). */
export interface LevelResult {
  levelId: string;
  mode: 'story';
  completed: boolean;
  stars: 0 | 1 | 2 | 3;
  /** State-changing commands (the par count). */
  commandsUsed: number;
  /** Every command line typed, including read-only ones. */
  commandsTyped: number;
  par: number | null;
  hintsRevealed: 0 | 1 | 2 | 3;
  errors: number;
  errorCodes: Record<string, number>;
  rewinds: number;
  timeMs: number;
  recap: string;
}

/** Live progress API (implemented in src/classroom, consumed by the UI). */
export interface ProgressApi {
  get(): ProgressFile;
  subscribe(listener: (progress: ProgressFile) => void): () => void;
  setProfile(patch: Partial<Omit<PlayerProfile, 'id' | 'createdAt'>>): void;
  recordAttemptStart(levelId: string): void;
  recordResult(result: LevelResult): void;
  unlockGlossary(termIds: string[]): void;
  awardBadge(badgeId: string): void;
  addSandboxMinutes(minutes: number): void;
  /** JSON text of the progress file with a fresh checksum ("Export my progress"). */
  exportFile(): string;
  /** The same progress as CSV: one row per level (for students to submit). */
  exportCsv(): string;
  /** Replace local progress with an exported file (after validation). */
  importFile(text: string): { ok: true } | { ok: false; error: string };
  reset(): void;
}
