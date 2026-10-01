/**
 * CSV export for the Professor Dashboard (pure, no DOM).
 * RFC 4180 quoting, CRLF line ends and a UTF-8 byte-order mark so Excel
 * opens accented names correctly. Text cells that a spreadsheet would run
 * as a formula (=, +, -, @) are prefixed with an apostrophe.
 */
import type { Curriculum, LevelStat, StudentSummary } from './aggregate';
import type { Translate } from './progressFile';

export const CSV_BOM = String.fromCharCode(0xfeff);
export type CsvCell = string | number | boolean | null | undefined;

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: CsvCell): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : '';
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) || text !== text.trim() ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Rows to CSV text (with BOM unless `bom` is false). */
export function toCsv(rows: CsvCell[][], bom = true): string {
  return (bom ? CSV_BOM : '') + rows.map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** Round to `digits` decimals; null stays null. */
export function round(value: number | null, digits = 1): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

const percent = (rate: number | null) => round(rate === null ? null : rate * 100, 1);
const minutes = (seconds: number | null) => round(seconds === null ? null : seconds / 60, 1);

/** Class summary: one row per student, with per-boss and per-chapter columns. */
export function classSummaryRows(summaries: StudentSummary[], curriculum: Curriculum, t: Translate): CsvCell[][] {
  const header: CsvCell[] = [
    t('classroom:csv.name'),
    t('classroom:csv.handle'),
    t('classroom:csv.classCode'),
    t('classroom:csv.studentId'),
    t('classroom:csv.levelsCompleted'),
    t('classroom:csv.levelsTotal'),
    t('classroom:csv.stars'),
    t('classroom:csv.starsTotal'),
    t('classroom:csv.bossesCompleted'),
    t('classroom:csv.bossesTotal'),
    ...curriculum.bosses.map((b) => t('classroom:csv.bossColumn', { chapter: b.chapter, level: b.id })),
    ...curriculum.chapters.map((c) => t('classroom:csv.chapterColumn', { chapter: c.number, total: c.levels.length })),
    t('classroom:csv.currentChapter'),
    t('classroom:csv.finished'),
    t('classroom:csv.timeMinutes'),
    t('classroom:csv.hintsUsed'),
    t('classroom:csv.hint3Levels'),
    t('classroom:csv.attempts'),
    t('classroom:csv.errors'),
    t('classroom:csv.challenges'),
    t('classroom:csv.dailyStreak'),
    t('classroom:csv.sandboxMinutes'),
    t('classroom:csv.lastPlayed'),
    t('classroom:csv.exportedAt'),
    t('classroom:csv.checksum'),
    t('classroom:csv.sourceFile'),
  ];
  const rows = summaries.map((s): CsvCell[] => [
    s.name,
    s.handle,
    s.classCode,
    s.id,
    s.levelsCompleted,
    curriculum.totalLevels,
    s.totalStars,
    curriculum.maxStars,
    s.bossesCompleted,
    curriculum.bosses.length,
    ...curriculum.bosses.map((b) => s.bosses.find((x) => x.levelId === b.id)?.completed === true),
    ...curriculum.chapters.map((c) => s.chapters.find((x) => x.chapter === c.number)?.completed ?? 0),
    s.currentChapter,
    s.finished,
    minutes(s.totalTimeSec),
    s.hintsUsed,
    s.hint3Levels,
    s.attempts,
    s.errors,
    s.challengesCompleted,
    s.dailyStreak,
    round(s.sandboxMinutes, 1),
    s.lastPlayedAt,
    s.exportedAt,
    t(`classroom:checksum.${s.checksum}`),
    s.sourceName,
  ]);
  return [header, ...rows];
}

/** Per-level statistics: one row per curriculum level. */
export function levelStatsRows(stats: LevelStat[], t: Translate): CsvCell[][] {
  const header: CsvCell[] = [
    t('classroom:csv.chapter'),
    t('classroom:csv.level'),
    t('classroom:csv.title'),
    t('classroom:csv.boss'),
    t('classroom:csv.students'),
    t('classroom:csv.started'),
    t('classroom:csv.completed'),
    t('classroom:csv.completedPercent'),
    t('classroom:csv.medianMinutes'),
    t('classroom:csv.hint3Students'),
    t('classroom:csv.hint3Percent'),
    t('classroom:csv.avgAttempts'),
    t('classroom:csv.avgHints'),
    t('classroom:csv.errors'),
    t('classroom:csv.topErrors'),
    t('classroom:csv.highHintUse'),
  ];
  const rows = stats.map((s): CsvCell[] => [
    s.chapter,
    s.levelId,
    s.title,
    s.boss,
    s.students,
    s.started,
    s.completed,
    percent(s.completedRate),
    minutes(s.medianTimeSec),
    s.hint3,
    percent(s.hint3Rate),
    round(s.avgAttempts, 2),
    round(s.avgHints, 2),
    s.errors,
    s.topErrors.map((e) => `${e.code} (${e.count})`).join('; '),
    s.highHintUse,
  ]);
  return [header, ...rows];
}

export function classSummaryCsv(summaries: StudentSummary[], curriculum: Curriculum, t: Translate): string {
  return toCsv(classSummaryRows(summaries, curriculum, t));
}

export function levelStatsCsv(stats: LevelStat[], t: Translate): string {
  return toCsv(levelStatsRows(stats, t));
}

/** Download file name, e.g. "gitquest-class-summary-cpsc-101-2026-09-30.csv". */
export function csvFileName(kind: 'class-summary' | 'level-stats', classCode: string | null, date: string): string {
  const code = classCode ? `-${classCode.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}` : '';
  return `gitquest-${kind}${code}-${date.slice(0, 10)}.csv`;
}
