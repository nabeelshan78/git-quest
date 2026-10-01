/**
 * Public API of the classroom module: the browser progress store, the
 * "Export my progress" files (JSON with checksum, CSV), import, the React
 * hook for the UI and the page for professors.
 *
 * The professor page component is `ProfessorDashboard` in
 * ./ProfessorDashboard.tsx (rendered by the UI at #/professor).
 *
 * Typical UI use:
 *   const progress = createProgressStore(window.localStorage);
 *   const file = useProgress(progress);          // re-renders on change
 *   downloadAllProgress(progress);               // "Export my progress" button (JSON + CSV)
 */
export { createProgressStore, generatePlayerId, APP_VERSION, CORRUPT_BACKUP_KEY } from './store';
export type { LoadStatus, ProgressStore, ProgressStoreOptions, ResetOptions, StorageLike } from './store';
export { useProgress } from './useProgress';
export { canonicalJson, checksumStatus, computeChecksum, fnv1a32, verifyChecksum, withChecksum } from './checksum';
export type { ChecksumStatus } from './checksum';
export {
  describeParseError,
  localDate,
  parseProgressFile,
  progressFileName,
  serializeProgressFile,
  MAX_PROGRESS_FILE_BYTES,
  PROGRESS_CSV_EXTENSION,
} from './progressFile';
export type { ParseError, ParseResult } from './progressFile';
export { progressCsvRows, progressToCsv, toCsv, csvCell, CSV_BOM } from './csv';
export type { CsvCell } from './csv';
export { applyProfilePatch, createEmptyProgress, defaultEmail, deriveHandle, DEFAULT_HANDLE, EMAIL_DOMAIN } from './progressLogic';
export type { ProfilePatch } from './progressLogic';
export { downloadAllProgress, downloadProgress, downloadText } from './download';
export type { DownloadFn, DownloadOptions, ExportFormat } from './download';
