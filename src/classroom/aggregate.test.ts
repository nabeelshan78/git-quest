import { describe, expect, it } from 'vitest';
import { getChapters } from '../levels/content';
import {
  ALL_CLASSES,
  buildCurriculum,
  classCodes,
  classOverview,
  defaultStudentDirection,
  filterRecords,
  levelSortValue,
  levelStats,
  makeRecord,
  median,
  mergeRecord,
  nextSort,
  sortBy,
  stuckLevels,
  studentLevelRows,
  studentSortValue,
  summarizeStudent,
} from './aggregate';
import type { StudentRecord } from './aggregate';
import { makeProgressFile } from './testing';
import type { FileSpec } from './testing';

const curriculum = buildCurriculum(getChapters());
const rec = (spec: FileSpec, source = `${spec.id}.gitquest.json`) => makeRecord(makeProgressFile(spec), source);

describe('buildCurriculum', () => {
  it('indexes all 91 levels, 12 chapters and 12 boss levels in order', () => {
    expect(curriculum.totalLevels).toBe(91);
    expect(curriculum.maxStars).toBe(273);
    expect(curriculum.chapters).toHaveLength(12);
    expect(curriculum.bosses.map((b) => b.id)).toEqual(['0.6', '1.6', '2.10', '3.7', '4.8', '5.6', '6.9', '7.10', '8.6', '9.8', '10.7', '11.8']);
    expect(curriculum.levels[0].id).toBe('0.1');
    expect(curriculum.byId.get('5.3')).toMatchObject({ chapter: 5, title: 'Resolve and finish', boss: false });
    expect(curriculum.chapters.every((c) => c.boss !== null)).toBe(true);
  });
});

describe('mergeRecord (de-duplication by player id)', () => {
  const older = rec({ id: 'p1', name: 'Ada', exportedAt: '2026-09-10T10:00:00.000Z' }, 'old.gitquest.json');
  const newer = rec({ id: 'p1', name: 'Ada', exportedAt: '2026-09-12T10:00:00.000Z' }, 'new.gitquest.json');

  it('adds new students', () => {
    const r = mergeRecord([], older);
    expect(r.outcome).toBe('added');
    expect(r.records).toHaveLength(1);
  });

  it('replaces a student with a newer export', () => {
    const r = mergeRecord([older], newer);
    expect(r.outcome).toBe('replaced');
    expect(r.records.map((x) => x.sourceName)).toEqual(['new.gitquest.json']);
  });

  it('keeps the newer export when an older one arrives', () => {
    const r = mergeRecord([newer], older);
    expect(r.outcome).toBe('olderSkipped');
    expect(r.records[0].sourceName).toBe('new.gitquest.json');
  });

  it('skips the same export twice', () => {
    const r = mergeRecord([older], { ...older, sourceName: 'copy.gitquest.json' });
    expect(r.outcome).toBe('duplicateSkipped');
    expect(r.records[0].sourceName).toBe('old.gitquest.json');
  });
});

describe('summarizeStudent', () => {
  const record = rec({
    id: 's1',
    name: '  Grace Kim ',
    classCode: 'cpsc-101',
    levels: {
      '0.1': { completed: true, stars: 3, timeSpentSec: 60, lastPlayedAt: '2026-09-02T10:00:00.000Z' },
      '0.6': { completed: true, stars: 2, timeSpentSec: 300, hintsUsed: 3, maxHintTier: 3, errors: 2, lastPlayedAt: '2026-09-03T10:00:00.000Z' },
      '1.6': { completed: true, stars: 1, timeSpentSec: 240, hintsUsed: 1, maxHintTier: 1, challenge: { completed: true, bestTimeSec: 100, bestCommands: 5 } },
      '2.1': { completed: false, attempts: 2, timeSpentSec: 120, lastPlayedAt: '2026-09-04T09:00:00.000Z' },
      '99.9': { completed: true, stars: 3, timeSpentSec: 999 },
    },
  });
  const s = summarizeStudent(record, curriculum);

  it('counts levels, stars, bosses, time and hints from curriculum levels only', () => {
    expect(s).toMatchObject({
      name: 'Grace Kim',
      displayName: 'Grace Kim',
      classKey: 'CPSC-101',
      levelsCompleted: 3,
      levelsStarted: 4,
      totalStars: 6,
      bossesCompleted: 2,
      totalTimeSec: 720,
      hintsUsed: 4,
      hint3Levels: 1,
      errors: 2,
      challengesCompleted: 1,
      lastPlayedAt: '2026-09-04T09:00:00.000Z',
      checksum: 'ok',
    });
  });

  it('marks each chapter boss with completed or not', () => {
    expect(s.bosses).toHaveLength(12);
    expect(s.bosses.filter((b) => b.completed).map((b) => b.chapter)).toEqual([0, 1]);
    expect(s.chapters.find((c) => c.chapter === 0)).toEqual({ chapter: 0, completed: 2, total: 6 });
  });

  it('uses the highest chapter started as the current chapter', () => {
    expect(s.currentChapter).toBe(2);
  });

  it('moves on to the next chapter once a chapter is complete', () => {
    const levels = Object.fromEntries(curriculum.chapters[0].levels.map((l) => [l.id, { completed: true, stars: 3 }]));
    expect(summarizeStudent(rec({ id: 'x', levels }), curriculum).currentChapter).toBe(1);
  });

  it('reports not started and finished students', () => {
    const fresh = summarizeStudent(rec({ id: 'n', name: '' }), curriculum);
    expect(fresh.currentChapter).toBeNull();
    expect(fresh.displayName).toBe('intern');
    const all = Object.fromEntries(curriculum.levels.map((l) => [l.id, { completed: true, stars: 3 }]));
    const done = summarizeStudent(rec({ id: 'f', levels: all }), curriculum);
    expect(done.finished).toBe(true);
    expect(done.bossesCompleted).toBe(12);
    expect(done.totalStars).toBe(273);
  });

  it('flags an edited file', () => {
    const file = makeProgressFile({ id: 'e', levels: { '1.1': { completed: true, stars: 1 } } });
    const edited = { ...file, levels: { '1.1': { ...file.levels['1.1'], stars: 3 } } };
    expect(summarizeStudent(makeRecord(edited, 'e.json'), curriculum).checksum).toBe('mismatch');
  });
});

describe('levelStats', () => {
  const records: StudentRecord[] = [
    rec({ id: 'a', levels: { '5.3': { completed: true, timeSpentSec: 100, attempts: 1, hintsUsed: 3, maxHintTier: 3, errors: 2, errorCodes: { 'merge-conflict': 2 } } } }),
    rec({ id: 'b', levels: { '5.3': { completed: true, timeSpentSec: 300, attempts: 3, hintsUsed: 3, maxHintTier: 3, errors: 1, errorCodes: { 'merge-conflict': 1 } } } }),
    rec({ id: 'c', levels: { '5.3': { completed: false, timeSpentSec: 200, attempts: 2, hintsUsed: 1, maxHintTier: 1, errors: 4, errorCodes: { 'unmerged-paths': 4 } } } }),
    rec({ id: 'd', levels: { '1.1': { completed: true, timeSpentSec: 50 } } }),
  ];
  const stats = levelStats(records, curriculum);
  const s53 = stats.find((s) => s.levelId === '5.3')!;

  it('has one row per curriculum level', () => {
    expect(stats).toHaveLength(91);
    expect(stats[0].levelId).toBe('0.1');
  });

  it('computes completion, median time, hint-3 rate and attempts', () => {
    expect(s53).toMatchObject({ students: 4, started: 3, completed: 2, hint3: 2, errors: 7 });
    expect(s53.completedRate).toBeCloseTo(0.5);
    expect(s53.medianTimeSec).toBe(200);
    expect(s53.hint3Rate).toBeCloseTo(2 / 3);
    expect(s53.avgAttempts).toBeCloseTo(2);
    expect(s53.avgHints).toBeCloseTo(7 / 3);
  });

  it('lists top error codes by count', () => {
    expect(s53.topErrors).toEqual([
      { code: 'unmerged-paths', count: 4, students: 1 },
      { code: 'merge-conflict', count: 3, students: 2 },
    ]);
  });

  it('flags very high hint use only with enough students', () => {
    expect(s53.highHintUse).toBe(true);
    const few = levelStats(
      [rec({ id: 'a', levels: { '2.5': { maxHintTier: 3 } } }), rec({ id: 'b' }), rec({ id: 'c' }), rec({ id: 'd' })],
      curriculum,
    ).find((s) => s.levelId === '2.5')!;
    expect(few.hint3Rate).toBe(1);
    expect(few.highHintUse).toBe(false);
  });

  it('leaves untouched levels empty instead of zero', () => {
    const untouched = stats.find((s) => s.levelId === '11.8')!;
    expect(untouched).toMatchObject({ started: 0, completed: 0, medianTimeSec: null, hint3Rate: null, avgAttempts: null, completedRate: 0 });
  });

  it('stuckLevels puts the highest hint-3 rate first', () => {
    const list = stuckLevels(stats);
    expect(list[0].levelId).toBe('5.3');
    expect(list.every((s) => s.hint3 > 0)).toBe(true);
  });

  it('median handles odd, even and empty lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('filters', () => {
  const records = [
    rec({ id: '1', name: 'Chloé Dubois', classCode: 'CPSC-101-A' }),
    rec({ id: '2', name: 'Bao Tran', classCode: 'cpsc-101-a ' }),
    rec({ id: '3', name: 'Dev Patel', classCode: 'CPSC-101-B' }),
    rec({ id: '4', name: 'Emeka Obi', classCode: '' }),
  ];

  it('lists class codes case-insensitively, with no code last', () => {
    expect(classCodes(records)).toEqual(['CPSC-101-A', 'CPSC-101-B', '']);
  });

  it('filters by class code', () => {
    expect(filterRecords(records, { classCode: 'CPSC-101-A', search: '' }).map((r) => r.id)).toEqual(['1', '2']);
    expect(filterRecords(records, { classCode: '', search: '' }).map((r) => r.id)).toEqual(['4']);
    expect(filterRecords(records, { classCode: ALL_CLASSES, search: '' })).toHaveLength(4);
  });

  it('searches names ignoring case and accents, and handles', () => {
    expect(filterRecords(records, { classCode: ALL_CLASSES, search: 'chloe' }).map((r) => r.id)).toEqual(['1']);
    expect(filterRecords(records, { classCode: ALL_CLASSES, search: 'TRAN' }).map((r) => r.id)).toEqual(['2']);
    expect(filterRecords(records, { classCode: ALL_CLASSES, search: 'dev-patel' }).map((r) => r.id)).toEqual(['3']);
    expect(filterRecords(records, { classCode: 'CPSC-101-B', search: 'bao' })).toHaveLength(0);
  });
});

describe('sorting', () => {
  it('sortBy is stable and puts nulls last in both directions', () => {
    const items = [
      { n: 'b', v: 2 },
      { n: 'a', v: null },
      { n: 'c', v: 2 },
      { n: 'd', v: 1 },
    ];
    expect(sortBy(items, (i) => i.v, 'asc').map((i) => i.n)).toEqual(['d', 'b', 'c', 'a']);
    expect(sortBy(items, (i) => i.v, 'desc').map((i) => i.n)).toEqual(['b', 'c', 'd', 'a']);
  });

  it('sorts names naturally, ignoring case', () => {
    const names = ['bob', 'Alice', 'student 10', 'student 9'];
    expect(sortBy(names, (n) => n, 'asc')).toEqual(['Alice', 'bob', 'student 9', 'student 10']);
  });

  it('sorts students by each column', () => {
    const summaries = [
      rec({ id: '1', name: 'Zed', levels: { '1.1': { completed: true, stars: 3 } } }),
      rec({ id: '2', name: 'Amy', levels: { '1.1': { completed: true, stars: 1 }, '1.2': { completed: true, stars: 1 } } }),
    ].map((r) => summarizeStudent(r, curriculum));
    expect(sortBy(summaries, (s) => studentSortValue(s, 'name'), 'asc').map((s) => s.name)).toEqual(['Amy', 'Zed']);
    expect(sortBy(summaries, (s) => studentSortValue(s, 'levels'), 'desc').map((s) => s.name)).toEqual(['Amy', 'Zed']);
    expect(sortBy(summaries, (s) => studentSortValue(s, 'stars'), 'desc').map((s) => s.name)).toEqual(['Zed', 'Amy']);
  });

  it('sorts levels by hint-3 rate with unplayed levels last', () => {
    const stats = levelStats([rec({ id: 'a', levels: { '2.2': { maxHintTier: 1 }, '3.3': { maxHintTier: 3 } } })], curriculum);
    const sorted = sortBy(stats, (s) => levelSortValue(s, 'hint3'), 'desc');
    expect(sorted.slice(0, 2).map((s) => s.levelId)).toEqual(['3.3', '2.2']);
  });

  it('nextSort toggles the same column and uses defaults for a new one', () => {
    const start = { key: 'name' as const, direction: 'asc' as const };
    expect(nextSort(start, 'name', defaultStudentDirection)).toEqual({ key: 'name', direction: 'desc' });
    expect(nextSort(start, 'levels', defaultStudentDirection)).toEqual({ key: 'levels', direction: 'desc' });
  });
});

describe('classOverview and studentLevelRows', () => {
  it('averages over students and counts checksum warnings', () => {
    const summaries = [
      rec({ id: '1', levels: { '0.1': { completed: true }, '0.6': { completed: true } } }),
      makeRecord(makeProgressFile({ id: '2', sign: false }), 'x'),
    ].map((r) => summarizeStudent(r, curriculum));
    expect(classOverview(summaries)).toEqual({ students: 2, avgLevelsCompleted: 1, avgBossesCompleted: 0.5, finished: 0, checksumWarnings: 1 });
    expect(classOverview([])).toMatchObject({ students: 0, avgLevelsCompleted: null });
  });

  it('gives every level a status for the drawer', () => {
    const rows = studentLevelRows(rec({ id: '1', levels: { '0.1': { completed: true }, '0.2': { completed: false, attempts: 1 } } }), curriculum);
    expect(rows).toHaveLength(91);
    expect(rows.slice(0, 3).map((r) => r.status)).toEqual(['completed', 'started', 'notStarted']);
  });
});
