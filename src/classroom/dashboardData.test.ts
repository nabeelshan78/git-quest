import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { getChapters } from '../levels/content';
import { ProgressFileSchema } from '../shared/progress';
import { buildCurriculum, makeRecord, summarizeStudent } from './aggregate';
import { checksumStatus } from './checksum';
import {
  CLASSROOM_REMEMBER_KEY,
  CLASSROOM_STORAGE_KEY,
  clearSavedClass,
  loadRememberPreference,
  loadSavedClass,
  saveClass,
  saveRememberPreference,
} from './classStorage';
import { dashboardReducer, initialDashboardData } from './dashboardState';
import type { ImportItem } from './dashboardState';
import { formatDuration, formatPercent } from './format';
import { describeParseError, parseProgressFile, progressFileName, serializeProgressFile } from './progressFile';
import type { Translate } from './progressFile';
import { generateSampleClass, seededRandom } from './sampleData';
import { MemoryStorage, makeProgressFile } from './testing';

const t: Translate = (key, options) => String(i18n.t(key, options));
const curriculum = buildCurriculum(getChapters());
const now = new Date('2026-09-30T12:00:00.000Z');

describe('parseProgressFile', () => {
  it('accepts a file with a byte-order mark and surrounding spaces', () => {
    const text = serializeProgressFile(makeProgressFile({ id: 'p' }), '2026-09-30T00:00:00.000Z');
    const r = parseProgressFile(`${String.fromCharCode(0xfeff)}\n${text}  \n`);
    expect(r.ok).toBe(true);
  });

  it('names the damaged field', () => {
    const file = makeProgressFile({ id: 'p', levels: { '1.1': { stars: 3 } } });
    const broken = JSON.parse(JSON.stringify(file));
    broken.levels['1.1'].stars = 9;
    const r = parseProgressFile(JSON.stringify(broken));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual({ code: 'damaged', detail: 'levels.1.1.stars' });
      expect(describeParseError(r.error, t)).toContain('levels.1.1.stars');
    }
  });

  it('suggests a file name from the handle and date', () => {
    expect(progressFileName(makeProgressFile({ id: 'p', name: 'Ada Lovelace' }), '2026-09-30')).toBe('ada-lovelace-2026-09-30.gitquest.json');
  });
});

describe('generateSampleClass', () => {
  const files = generateSampleClass(curriculum, { now });

  it('creates valid, distinct demo students in two classes', () => {
    expect(files).toHaveLength(10);
    for (const f of files) expect(ProgressFileSchema.safeParse(f).success).toBe(true);
    expect(new Set(files.map((f) => f.player.id)).size).toBe(10);
    expect(new Set(files.map((f) => f.player.classCode)).size).toBe(2);
  });

  it('is deterministic for the same seed and date', () => {
    expect(generateSampleClass(curriculum, { now })).toEqual(files);
    expect(generateSampleClass(curriculum, { now, seed: 7 })).not.toEqual(files);
  });

  it('signs every file except one edited demo file', () => {
    const statuses = files.map(checksumStatus);
    expect(statuses.filter((s) => s === 'mismatch')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'ok')).toHaveLength(9);
  });

  it('spreads progress so the dashboard has something to show', () => {
    const summaries = files.map((f) => summarizeStudent(makeRecord(f, 'sample'), curriculum));
    const levels = summaries.map((s) => s.levelsCompleted);
    expect(Math.max(...levels)).toBeGreaterThan(80);
    expect(Math.min(...levels)).toBeLessThan(20);
    expect(summaries.some((s) => s.hint3Levels > 0)).toBe(true);
  });

  it('seededRandom stays in [0, 1)', () => {
    const r = seededRandom(1);
    for (let i = 0; i < 100; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('classStorage', () => {
  const records = [makeRecord(makeProgressFile({ id: 'a', name: 'Ada' }), 'a.gitquest.json'), makeRecord(makeProgressFile({ id: 'b' }), 'b.gitquest.json', true)];

  it('saves and loads the class', () => {
    const storage = new MemoryStorage();
    expect(saveClass(storage, records)).toBe(true);
    const loaded = loadSavedClass(storage);
    expect(loaded.map((r) => [r.id, r.sourceName, r.sample, r.checksum])).toEqual([
      ['a', 'a.gitquest.json', false, 'ok'],
      ['b', 'b.gitquest.json', true, 'ok'],
    ]);
  });

  it('skips invalid saved entries and ignores garbage', () => {
    const storage = new MemoryStorage();
    storage.setItem(CLASSROOM_STORAGE_KEY, JSON.stringify({ format: 'git-quest-classroom', students: [{ file: { nope: 1 } }, { sourceName: 'a', file: records[0].file }] }));
    expect(loadSavedClass(storage).map((r) => r.id)).toEqual(['a']);
    storage.setItem(CLASSROOM_STORAGE_KEY, 'not json');
    expect(loadSavedClass(storage)).toEqual([]);
  });

  it('removes the saved class when empty or cleared', () => {
    const storage = new MemoryStorage();
    saveClass(storage, records);
    saveClass(storage, []);
    expect(storage.getItem(CLASSROOM_STORAGE_KEY)).toBeNull();
    saveClass(storage, records);
    clearSavedClass(storage);
    expect(storage.getItem(CLASSROOM_STORAGE_KEY)).toBeNull();
  });

  it('reports a full storage', () => {
    const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); }, removeItem: () => undefined };
    expect(saveClass(full, records)).toBe(false);
  });

  it('remembers the preference, default on', () => {
    const storage = new MemoryStorage();
    expect(loadRememberPreference(storage)).toBe(true);
    saveRememberPreference(storage, false);
    expect(storage.getItem(CLASSROOM_REMEMBER_KEY)).toBe('0');
    expect(loadRememberPreference(storage)).toBe(false);
  });
});

describe('dashboardReducer', () => {
  const item = (id: string, exportedAt: string, name = id): ImportItem => ({
    sourceName: `${id}-${exportedAt.slice(0, 10)}.gitquest.json`,
    result: { ok: true, file: makeProgressFile({ id, name, exportedAt }) },
  });

  it('adds students, reports errors and de-duplicates in one batch', () => {
    const state = dashboardReducer(initialDashboardData(), {
      type: 'import',
      items: [
        item('a', '2026-09-10T00:00:00.000Z', 'Ada'),
        { sourceName: 'notes.txt', result: { ok: false, error: { code: 'notJson' } } },
        item('a', '2026-09-12T00:00:00.000Z', 'Ada'),
        item('a', '2026-09-11T00:00:00.000Z', 'Ada'),
        item('b', '2026-09-10T00:00:00.000Z', 'Bao'),
      ],
    });
    expect(state.records.map((r) => r.sourceName)).toEqual(['a-2026-09-12.gitquest.json', 'b-2026-09-10.gitquest.json']);
    expect(state.notices.map((n) => n.kind)).toEqual(['added', 'error', 'replaced', 'olderSkipped', 'added']);
  });

  it('warns about edited files', () => {
    const file = makeProgressFile({ id: 'e', name: 'Eve' });
    const edited = { ...file, badges: ['cheat'] };
    const state = dashboardReducer(initialDashboardData(), { type: 'import', items: [{ sourceName: 'e.json', result: { ok: true, file: edited } }] });
    expect(state.notices.map((n) => n.kind)).toEqual(['added', 'checksum']);
  });

  it('loads samples with one notice and removes them when real files arrive', () => {
    const samples: ImportItem[] = generateSampleClass(curriculum, { now, count: 3 }).map((file) => ({ sourceName: 'sample', result: { ok: true, file } }));
    let state = dashboardReducer(initialDashboardData(), { type: 'import', items: samples, sample: true });
    expect(state.records).toHaveLength(3);
    expect(state.records.every((r) => r.sample)).toBe(true);
    expect(state.notices).toEqual([{ kind: 'sampleLoaded', count: 3 }]);
    state = dashboardReducer(state, { type: 'import', items: [item('real', '2026-09-10T00:00:00.000Z')] });
    expect(state.records.map((r) => r.id)).toEqual(['real']);
    expect(state.notices[0]).toEqual({ kind: 'sampleRemoved', count: 3 });
  });

  it('removes one student, dismisses notices and clears everything', () => {
    let state = dashboardReducer(initialDashboardData(), { type: 'import', items: [item('a', '2026-09-10T00:00:00.000Z'), item('b', '2026-09-10T00:00:00.000Z')] });
    state = dashboardReducer(state, { type: 'remove', id: 'a' });
    expect(state.records.map((r) => r.id)).toEqual(['b']);
    state = dashboardReducer(state, { type: 'dismiss' });
    expect(state.notices).toEqual([]);
    state = dashboardReducer(state, { type: 'clear' });
    expect(state.records).toEqual([]);
  });
});

describe('format', () => {
  it('formats durations and percentages', () => {
    expect(formatDuration(45, t)).toBe('45 s');
    expect(formatDuration(600, t)).toBe('10 min');
    expect(formatDuration(3900, t)).toBe('1 h 05 min');
    expect(formatDuration(null, t)).toBe('–');
    expect(formatPercent(0.623, t)).toBe('62%');
    expect(formatPercent(null, t)).toBe('–');
  });
});
