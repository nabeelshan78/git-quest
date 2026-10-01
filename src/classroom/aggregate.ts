/**
 * Pure class-level aggregation for the Professor Dashboard: the curriculum
 * index, importing and de-duplicating students, per-student summaries,
 * per-level "where the class is stuck" statistics, filters and sorting.
 * No React, no DOM.
 */
import type { ChaptersFile } from '../shared/level';
import type { LevelProgress, ProgressFile } from '../shared/progress';
import { checksumStatus } from './checksum';
import type { ChecksumStatus } from './checksum';

// ---------------------------------------------------------------------------
// Curriculum
// ---------------------------------------------------------------------------

export interface CurriculumLevel {
  id: string;
  title: string;
  concept: string;
  chapter: number;
  boss: boolean;
  /** Position in curriculum order (0-based). */
  order: number;
}

export interface CurriculumChapter {
  number: number;
  title: string;
  levels: CurriculumLevel[];
  /** The chapter's boss level (null if the chapter has none). */
  boss: CurriculumLevel | null;
}

export interface Curriculum {
  chapters: CurriculumChapter[];
  levels: CurriculumLevel[];
  byId: Map<string, CurriculumLevel>;
  bosses: CurriculumLevel[];
  totalLevels: number;
  maxStars: number;
}

export function buildCurriculum(file: ChaptersFile): Curriculum {
  const levels: CurriculumLevel[] = [];
  const chapters: CurriculumChapter[] = [];
  for (const ch of [...file.chapters].sort((a, b) => a.number - b.number)) {
    const chLevels = ch.levels.map((l) => {
      const level: CurriculumLevel = { id: l.id, title: l.title, concept: l.concept, chapter: ch.number, boss: l.boss === true, order: levels.length };
      levels.push(level);
      return level;
    });
    chapters.push({ number: ch.number, title: ch.title, levels: chLevels, boss: chLevels.find((l) => l.boss) ?? null });
  }
  return {
    chapters,
    levels,
    byId: new Map(levels.map((l) => [l.id, l])),
    bosses: levels.filter((l) => l.boss),
    totalLevels: levels.length,
    maxStars: levels.length * 3,
  };
}

// ---------------------------------------------------------------------------
// Imported students
// ---------------------------------------------------------------------------

export interface StudentRecord {
  /** player.id — the de-duplication key. */
  id: string;
  file: ProgressFile;
  /** File name it was imported from (or "sample"). */
  sourceName: string;
  checksum: ChecksumStatus;
  /** Generated demo data. */
  sample: boolean;
}

export function makeRecord(file: ProgressFile, sourceName: string, sample = false): StudentRecord {
  return { id: file.player.id, file, sourceName, checksum: checksumStatus(file), sample };
}

/**
 * added            – a new student
 * replaced         – a newer file for a student already loaded
 * olderSkipped     – the loaded file for this student is newer, kept it
 * duplicateSkipped – the same export is already loaded
 */
export type MergeOutcome = 'added' | 'replaced' | 'olderSkipped' | 'duplicateSkipped';

function timeOf(iso: string | null | undefined): number {
  if (!iso) return Number.NEGATIVE_INFINITY;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
}

/** Add one student, keeping only the newest export (by exportedAt) per player id. */
export function mergeRecord(records: StudentRecord[], incoming: StudentRecord): { records: StudentRecord[]; outcome: MergeOutcome } {
  const index = records.findIndex((r) => r.id === incoming.id);
  if (index < 0) return { records: [...records, incoming], outcome: 'added' };
  const existing = records[index];
  const a = timeOf(existing.file.exportedAt);
  const b = timeOf(incoming.file.exportedAt);
  if (b > a) {
    const next = [...records];
    next[index] = incoming;
    return { records: next, outcome: 'replaced' };
  }
  return { records, outcome: b === a ? 'duplicateSkipped' : 'olderSkipped' };
}

// ---------------------------------------------------------------------------
// Per-student summary
// ---------------------------------------------------------------------------

export function isStarted(p: LevelProgress | undefined): boolean {
  return !!p && (p.attempts > 0 || p.completed);
}

export function normalizeClassCode(code: string): string {
  return code.trim().toUpperCase();
}

export interface BossStatus {
  chapter: number;
  levelId: string;
  completed: boolean;
}

export interface ChapterProgress {
  chapter: number;
  completed: number;
  total: number;
}

export interface StudentSummary {
  id: string;
  name: string;
  /** Name, or the handle when the student left the name empty. */
  displayName: string;
  handle: string;
  classCode: string;
  /** Upper-case, trimmed class code used for grouping and filters. */
  classKey: string;
  levelsCompleted: number;
  levelsStarted: number;
  totalStars: number;
  bossesCompleted: number;
  bosses: BossStatus[];
  chapters: ChapterProgress[];
  /** Chapter the student is working on; null before the first level. */
  currentChapter: number | null;
  /** Every curriculum level completed. */
  finished: boolean;
  totalTimeSec: number;
  hintsUsed: number;
  /** Levels where the student opened the exact-command hint (tier 3). */
  hint3Levels: number;
  attempts: number;
  errors: number;
  challengesCompleted: number;
  lastPlayedAt: string | null;
  exportedAt: string;
  checksum: ChecksumStatus;
  sourceName: string;
  sample: boolean;
  dailyStreak: number;
  dailyDays: number;
  sandboxMinutes: number;
  glossaryTerms: number;
}

export function summarizeStudent(record: StudentRecord, curriculum: Curriculum): StudentSummary {
  const { file } = record;
  const levels = file.levels;
  let levelsCompleted = 0;
  let levelsStarted = 0;
  let totalStars = 0;
  let totalTimeSec = 0;
  let hintsUsed = 0;
  let hint3Levels = 0;
  let attempts = 0;
  let errors = 0;
  let challengesCompleted = 0;
  let lastPlayed = Number.NEGATIVE_INFINITY;
  let lastPlayedAt: string | null = null;
  let highestStarted: number | null = null;

  for (const level of curriculum.levels) {
    const p = levels[level.id];
    if (!p) continue;
    if (p.completed) levelsCompleted++;
    if (isStarted(p)) {
      levelsStarted++;
      highestStarted = highestStarted === null ? level.chapter : Math.max(highestStarted, level.chapter);
    }
    totalStars += p.stars;
    totalTimeSec += p.timeSpentSec;
    hintsUsed += p.hintsUsed;
    if (p.maxHintTier >= 3) hint3Levels++;
    attempts += p.attempts;
    errors += p.errors;
    if (p.challenge?.completed) challengesCompleted++;
    const t = timeOf(p.lastPlayedAt);
    if (t > lastPlayed) {
      lastPlayed = t;
      lastPlayedAt = p.lastPlayedAt;
    }
  }

  const bosses = curriculum.bosses.map((b) => ({ chapter: b.chapter, levelId: b.id, completed: levels[b.id]?.completed === true }));
  const chapters = curriculum.chapters.map((ch) => ({
    chapter: ch.number,
    completed: ch.levels.filter((l) => levels[l.id]?.completed).length,
    total: ch.levels.length,
  }));
  const finished = curriculum.totalLevels > 0 && levelsCompleted === curriculum.totalLevels;

  let currentChapter = highestStarted;
  if (currentChapter !== null && !finished) {
    const idx = chapters.findIndex((c) => c.chapter === currentChapter);
    const ch = chapters[idx];
    if (ch && ch.completed === ch.total && idx + 1 < chapters.length) currentChapter = chapters[idx + 1].chapter;
  }

  const name = file.player.name.trim();
  return {
    id: record.id,
    name,
    displayName: name || file.player.handle,
    handle: file.player.handle,
    classCode: file.player.classCode.trim(),
    classKey: normalizeClassCode(file.player.classCode),
    levelsCompleted,
    levelsStarted,
    totalStars,
    bossesCompleted: bosses.filter((b) => b.completed).length,
    bosses,
    chapters,
    currentChapter,
    finished,
    totalTimeSec: Math.round(totalTimeSec),
    hintsUsed,
    hint3Levels,
    attempts,
    errors,
    challengesCompleted,
    lastPlayedAt,
    exportedAt: file.exportedAt,
    checksum: record.checksum,
    sourceName: record.sourceName,
    sample: record.sample,
    dailyStreak: file.daily.streak,
    dailyDays: file.daily.history.length,
    sandboxMinutes: file.sandboxMinutes,
    glossaryTerms: file.glossary.length,
  };
}

export interface ClassOverview {
  students: number;
  avgLevelsCompleted: number | null;
  avgBossesCompleted: number | null;
  finished: number;
  checksumWarnings: number;
}

export function classOverview(summaries: StudentSummary[]): ClassOverview {
  const n = summaries.length;
  const avg = (f: (s: StudentSummary) => number) => (n === 0 ? null : summaries.reduce((sum, s) => sum + f(s), 0) / n);
  return {
    students: n,
    avgLevelsCompleted: avg((s) => s.levelsCompleted),
    avgBossesCompleted: avg((s) => s.bossesCompleted),
    finished: summaries.filter((s) => s.finished).length,
    checksumWarnings: summaries.filter((s) => s.checksum !== 'ok').length,
  };
}

// ---------------------------------------------------------------------------
// Per-level statistics ("where the class is stuck")
// ---------------------------------------------------------------------------

/** A level is flagged when at least this share of the students who tried it opened hint 3. */
export const HIGH_HINT_RATE = 0.5;
/** ...and at least this many students tried it (or the whole class, if smaller). */
export const HIGH_HINT_MIN_STUDENTS = 3;
export const TOP_ERROR_COUNT = 3;

export interface ErrorCount {
  code: string;
  /** Times hit across the class. */
  count: number;
  /** Students who hit it at least once. */
  students: number;
}

export interface LevelStat {
  levelId: string;
  title: string;
  chapter: number;
  boss: boolean;
  order: number;
  /** Students in the (filtered) class. */
  students: number;
  started: number;
  completed: number;
  /** Share of all students who completed it (0-1), null with no students. */
  completedRate: number | null;
  /** Median seconds spent, over students who started it. */
  medianTimeSec: number | null;
  /** Students who opened hint tier 3. */
  hint3: number;
  /** Share of students who started it that opened hint tier 3 (0-1). */
  hint3Rate: number | null;
  avgAttempts: number | null;
  avgHints: number | null;
  errors: number;
  topErrors: ErrorCount[];
  highHintUse: boolean;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function levelStats(records: StudentRecord[], curriculum: Curriculum): LevelStat[] {
  const students = records.length;
  const minStudents = Math.max(1, Math.min(HIGH_HINT_MIN_STUDENTS, students));
  return curriculum.levels.map((level) => {
    const played: LevelProgress[] = [];
    let completed = 0;
    for (const r of records) {
      const p = r.file.levels[level.id];
      if (!p) continue;
      if (p.completed) completed++;
      if (isStarted(p)) played.push(p);
    }
    const started = played.length;
    const hint3 = played.filter((p) => p.maxHintTier >= 3).length;
    const errorTotals = new Map<string, ErrorCount>();
    let errors = 0;
    for (const p of played) {
      errors += p.errors;
      for (const [code, times] of Object.entries(p.errorCodes)) {
        if (times <= 0) continue;
        const e = errorTotals.get(code) ?? { code, count: 0, students: 0 };
        e.count += times;
        e.students += 1;
        errorTotals.set(code, e);
      }
    }
    const topErrors = [...errorTotals.values()]
      .sort((a, b) => b.count - a.count || b.students - a.students || a.code.localeCompare(b.code))
      .slice(0, TOP_ERROR_COUNT);
    const hint3Rate = started === 0 ? null : hint3 / started;
    return {
      levelId: level.id,
      title: level.title,
      chapter: level.chapter,
      boss: level.boss,
      order: level.order,
      students,
      started,
      completed,
      completedRate: students === 0 ? null : completed / students,
      medianTimeSec: median(played.map((p) => p.timeSpentSec)),
      hint3,
      hint3Rate,
      avgAttempts: started === 0 ? null : played.reduce((s, p) => s + p.attempts, 0) / started,
      avgHints: started === 0 ? null : played.reduce((s, p) => s + p.hintsUsed, 0) / started,
      errors,
      topErrors,
      highHintUse: hint3Rate !== null && hint3Rate >= HIGH_HINT_RATE && started >= minStudents,
    };
  });
}

/** Levels where most students needed the exact command, worst first. */
export function stuckLevels(stats: LevelStat[], limit = 5): LevelStat[] {
  return stats
    .filter((s) => s.hint3 > 0 && s.hint3Rate !== null)
    .sort((a, b) => (b.hint3Rate ?? 0) - (a.hint3Rate ?? 0) || b.started - a.started || a.order - b.order)
    .slice(0, limit);
}

/** One row per curriculum level for a student's detail view. */
export interface StudentLevelRow {
  level: CurriculumLevel;
  progress: LevelProgress | null;
  status: 'completed' | 'started' | 'notStarted';
}

export function studentLevelRows(record: StudentRecord, curriculum: Curriculum): StudentLevelRow[] {
  return curriculum.levels.map((level) => {
    const progress = record.file.levels[level.id] ?? null;
    const status = progress?.completed ? 'completed' : isStarted(progress ?? undefined) ? 'started' : 'notStarted';
    return { level, progress, status };
  });
}

// ---------------------------------------------------------------------------
// Filters and sorting
// ---------------------------------------------------------------------------

/** Filter value meaning "every class code". */
export const ALL_CLASSES = '*';

export interface StudentFilter {
  /** A normalized class code, '' for students without one, or ALL_CLASSES. */
  classCode: string;
  /** Matches the name or handle, ignoring case and accents. */
  search: string;
}

function fold(text: string): string {
  return text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

export function matchesFilter(record: StudentRecord, filter: StudentFilter): boolean {
  if (filter.classCode !== ALL_CLASSES && normalizeClassCode(record.file.player.classCode) !== filter.classCode) return false;
  const q = fold(filter.search);
  if (q === '') return true;
  return fold(record.file.player.name).includes(q) || record.file.player.handle.includes(q);
}

export function filterRecords(records: StudentRecord[], filter: StudentFilter): StudentRecord[] {
  return records.filter((r) => matchesFilter(r, filter));
}

/** Distinct normalized class codes, sorted ('' = no class code, listed last). */
export function classCodes(records: StudentRecord[]): string[] {
  const codes = [...new Set(records.map((r) => normalizeClassCode(r.file.player.classCode)))];
  return codes.sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b, undefined, { numeric: true })));
}

export type SortDirection = 'asc' | 'desc';
export type SortValue = string | number | null;

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

/** Sort state after choosing column `key`: toggles the direction, or starts with the column's default. */
export function nextSort<K extends string>(current: SortState<K>, key: K, defaultDirection: (key: K) => SortDirection): SortState<K> {
  if (current.key === key) return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
  return { key, direction: defaultDirection(key) };
}

/** Text columns start A to Z; number columns start with the largest. */
export function defaultStudentDirection(key: StudentSortKey): SortDirection {
  return key === 'name' || key === 'classCode' || key === 'checksum' ? 'asc' : 'desc';
}

export function defaultLevelDirection(key: LevelSortKey): SortDirection {
  return key === 'level' ? 'asc' : key === 'completed' ? 'asc' : 'desc';
}

/** Stable sort; null values always go last. Strings compare naturally, ignoring case. */
export function sortBy<T>(items: T[], value: (item: T) => SortValue, direction: SortDirection): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return items
    .map((item, index) => ({ item, index, v: value(item) }))
    .sort((a, b) => {
      if (a.v === null || b.v === null) {
        if (a.v === b.v) return a.index - b.index;
        return a.v === null ? 1 : -1;
      }
      let c: number;
      if (typeof a.v === 'number' && typeof b.v === 'number') c = a.v - b.v;
      else c = String(a.v).localeCompare(String(b.v), undefined, { sensitivity: 'base', numeric: true });
      return c !== 0 ? c * sign : a.index - b.index;
    })
    .map((x) => x.item);
}

export type StudentSortKey = 'name' | 'classCode' | 'levels' | 'stars' | 'bosses' | 'chapter' | 'time' | 'hints' | 'lastPlayed' | 'checksum';

const CHECKSUM_ORDER: Record<ChecksumStatus, number> = { mismatch: 0, missing: 1, ok: 2 };

export function studentSortValue(s: StudentSummary, key: StudentSortKey): SortValue {
  switch (key) {
    case 'name':
      return s.displayName;
    case 'classCode':
      return s.classKey === '' ? null : s.classKey;
    case 'levels':
      return s.levelsCompleted;
    case 'stars':
      return s.totalStars;
    case 'bosses':
      return s.bossesCompleted;
    case 'chapter':
      return s.finished ? 100 : s.currentChapter;
    case 'time':
      return s.totalTimeSec;
    case 'hints':
      return s.hintsUsed;
    case 'lastPlayed': {
      const t = timeOf(s.lastPlayedAt);
      return Number.isFinite(t) ? t : null;
    }
    case 'checksum':
      return CHECKSUM_ORDER[s.checksum];
  }
}

export type LevelSortKey = 'level' | 'completed' | 'median' | 'hint3' | 'attempts' | 'errors';

export function levelSortValue(s: LevelStat, key: LevelSortKey): SortValue {
  switch (key) {
    case 'level':
      return s.order;
    case 'completed':
      return s.completedRate;
    case 'median':
      return s.medianTimeSec;
    case 'hint3':
      return s.hint3Rate;
    case 'attempts':
      return s.avgAttempts;
    case 'errors':
      return s.errors;
  }
}
