/**
 * Reading and writing exported progress files (pure, no DOM).
 *
 * `parseProgressFile` turns any text into either a valid ProgressFile or a
 * machine-readable error. `describeParseError` turns that error into a kind,
 * plain-English sentence (text lives in the `classroom` section of src/strings.ts).
 */
import { PROGRESS_FILE_EXTENSION, PROGRESS_FORMAT, PROGRESS_VERSION, ProgressFileSchema } from '../shared/progress';
import type { ProgressFile } from '../shared/progress';
import { STRINGS, fmt } from '../strings';
import { checksumStatus, withChecksum } from './checksum';

/** Files bigger than this are refused before parsing (a real one is far smaller). */
export const MAX_PROGRESS_FILE_BYTES = 5 * 1024 * 1024;

/** File extension of the CSV export. */
export const PROGRESS_CSV_EXTENSION = '.gitquest.csv';

/** U+FEFF byte-order mark (some editors add it when saving). */
const BOM_CODE = 0xfeff;

export type ParseError =
  | { code: 'empty' }
  | { code: 'tooLarge' }
  | { code: 'notJson' }
  | { code: 'notProgress' }
  | { code: 'newerVersion'; version: number }
  | { code: 'olderVersion'; version: number }
  | { code: 'damaged'; detail: string }
  /** The checksum is missing or does not match: the file was edited after export. */
  | { code: 'checksum' };

export type ParseResult = { ok: true; file: ProgressFile } | { ok: false; error: ParseError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validate text as an exported Git Quest progress file. Never throws.
 * The file must carry a checksum that matches its content.
 */
export function parseProgressFile(text: string): ParseResult {
  const source = typeof text === 'string' ? text : '';
  const trimmed = (source.charCodeAt(0) === BOM_CODE ? source.slice(1) : source).trim();
  if (trimmed === '') return { ok: false, error: { code: 'empty' } };
  if (trimmed.length > MAX_PROGRESS_FILE_BYTES) return { ok: false, error: { code: 'tooLarge' } };
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: { code: 'notJson' } };
  }
  if (!isRecord(data) || data.format !== PROGRESS_FORMAT) return { ok: false, error: { code: 'notProgress' } };
  if (typeof data.version === 'number' && data.version !== PROGRESS_VERSION) {
    return data.version > PROGRESS_VERSION
      ? { ok: false, error: { code: 'newerVersion', version: data.version } }
      : { ok: false, error: { code: 'olderVersion', version: data.version } };
  }
  const parsed = ProgressFileSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? issue.path.map(String).join('.') : 'file';
    return { ok: false, error: { code: 'damaged', detail: where } };
  }
  if (checksumStatus(parsed.data) !== 'ok') return { ok: false, error: { code: 'checksum' } };
  return { ok: true, file: parsed.data };
}

/** A friendly sentence for a parse error. */
export function describeParseError(error: ParseError): string {
  const text = STRINGS.classroom.importError;
  switch (error.code) {
    case 'newerVersion':
    case 'olderVersion':
      return fmt(text[error.code], { version: error.version });
    case 'damaged':
      return fmt(text.damaged, { detail: error.detail });
    default:
      return text[error.code];
  }
}

/** Pretty JSON for download, with a fresh `exportedAt` and checksum. */
export function serializeProgressFile(file: ProgressFile, exportedAt: string): string {
  return JSON.stringify(withChecksum({ ...file, exportedAt }), null, 2);
}

/** Local calendar date "YYYY-MM-DD" (used in download file names). */
export function localDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Suggested download name, e.g. "ada-lovelace-2026-09-30.gitquest.json" (or ".gitquest.csv"). */
export function progressFileName(file: ProgressFile, date: string, format: 'json' | 'csv' = 'json'): string {
  return `${file.player.handle}-${date.slice(0, 10)}${format === 'csv' ? PROGRESS_CSV_EXTENSION : PROGRESS_FILE_EXTENSION}`;
}
