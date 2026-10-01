/**
 * Public API of the classroom module: the browser progress store, progress
 * file export/import, the React hook for the UI, and the pure aggregation
 * and CSV helpers behind the Professor Dashboard.
 *
 * The dashboard page component is `ProfessorDashboard` in
 * ./ProfessorDashboard.tsx (rendered by the UI at #/professor).
 *
 * Typical UI use:
 *   const progress = createProgressStore(window.localStorage);
 *   const file = useProgress(progress);          // re-renders on change
 *   downloadProgress(progress);                  // "Export progress" button
 */
export { createProgressStore, generatePlayerId, APP_VERSION, CORRUPT_BACKUP_KEY } from './store';
export type { LoadStatus, ProgressStore, ProgressStoreOptions, ResetOptions, StorageLike } from './store';
export { useProgress } from './useProgress';
export { canonicalJson, checksumStatus, computeChecksum, fnv1a32, verifyChecksum, withChecksum } from './checksum';
export type { ChecksumStatus } from './checksum';
export { describeParseError, parseProgressFile, progressFileName, serializeProgressFile, MAX_PROGRESS_FILE_BYTES } from './progressFile';
export type { ParseError, ParseResult, Translate } from './progressFile';
export {
  applyDaily,
  applyLevelResult,
  applyProfilePatch,
  createEmptyProgress,
  currentStreak,
  defaultEmail,
  deriveHandle,
  DEFAULT_HANDLE,
  DAILY_HISTORY_LIMIT,
  EMAIL_DOMAIN,
} from './progressLogic';
export type { ProfilePatch } from './progressLogic';
export { downloadProgress, downloadText } from './download';
export type { DownloadFn } from './download';
export {
  buildCurriculum,
  classCodes,
  classOverview,
  filterRecords,
  levelStats,
  makeRecord,
  mergeRecord,
  stuckLevels,
  summarizeStudent,
  ALL_CLASSES,
  HIGH_HINT_RATE,
} from './aggregate';
export type { Curriculum, LevelStat, StudentRecord, StudentSummary } from './aggregate';
export { classSummaryCsv, levelStatsCsv, toCsv } from './csv';
export { generateSampleClass } from './sampleData';
