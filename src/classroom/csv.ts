/**
 * CSV export of one student's progress ("Export my progress"), pure, no DOM.
 *
 * Layout: a few header rows that identify the student, an empty row, then a
 * table with one row per level in curriculum order (content/chapters.json).
 * RFC 4180 quoting, CRLF line ends and a UTF-8 byte-order mark so Excel
 * opens accented names correctly. Text cells that a spreadsheet would run
 * as a formula (=, +, -, @) are prefixed with an apostrophe.
 */
import type { ChaptersFile } from '../shared/level';
import type { LevelProgress, ProgressFile } from '../shared/progress';
import { STRINGS } from '../strings';
import { emptyLevelProgress } from './progressLogic';

export const CSV_BOM = String.fromCharCode(0xfeff);
export type CsvCell = string | number | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV field, quoted when needed. */
export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text (with a byte-order mark unless `bom` is false). */
export function toCsv(rows: CsvCell[][], bom = true): string {
  return (bom ? CSV_BOM : '') + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Header rows, an empty row, the column names, then one row per curriculum level. */
export function progressCsvRows(file: ProgressFile, chapters: ChaptersFile, exportedAt: string): CsvCell[][] {
  const t = STRINGS.classroom.csv;
  const rows: CsvCell[][] = [
    [t.name, file.player.name],
    [t.handle, file.player.handle],
    [t.classCode, file.player.classCode],
    [t.exportedAt, exportedAt],
    [],
    [t.levelId, t.title, t.completed, t.stars, t.attempts, t.completions, t.timeSpentSec, t.hintsUsed, t.maxHintTier, t.errors, t.firstCompletedAt],
  ];
  const ordered = [...chapters.chapters].sort((a, b) => a.number - b.number);
  for (const chapter of ordered) {
    for (const level of chapter.levels) {
      const p: LevelProgress = file.levels[level.id] ?? emptyLevelProgress(level.id);
      rows.push([
        level.id,
        level.title,
        p.completed ? t.yes : t.no,
        p.stars,
        p.attempts,
        p.completions,
        Math.round(p.timeSpentSec),
        p.hintsUsed,
        p.maxHintTier,
        p.errors,
        p.firstCompletedAt,
      ]);
    }
  }
  return rows;
}

/** The student's progress as CSV text (UTF-8 with BOM, CRLF). */
export function progressToCsv(file: ProgressFile, chapters: ChaptersFile, exportedAt: string): string {
  return toCsv(progressCsvRows(file, chapters, exportedAt));
}
