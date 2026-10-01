import { describe, expect, it } from 'vitest';
import { PlayerProfileSchema, ProgressFileSchema } from '../shared/progress';
import {
  addUnique,
  applyDaily,
  applyProfilePatch,
  createEmptyProgress,
  currentStreak,
  dayNumber,
  deriveHandle,
  DAILY_HISTORY_LIMIT,
  mergeErrorCodes,
  msToSeconds,
  toCount,
} from './progressLogic';

const empty = () => createEmptyProgress('id-1', '2026-09-01T10:00:00.000Z', 'test');

describe('deriveHandle', () => {
  it.each([
    ['Ada Lovelace', 'ada-lovelace'],
    ['  José  O’Brien ', 'jose-o-brien'],
    ['Chloé Dubois', 'chloe-dubois'],
    ['---Sam---', 'sam'],
    ['R2-D2', 'r2-d2'],
    ['李雷', 'intern'],
    ['', 'intern'],
    ['!!!', 'intern'],
  ])('%s -> %s', (name, handle) => {
    expect(deriveHandle(name)).toBe(handle);
  });

  it('limits handles to 39 characters without a trailing hyphen', () => {
    const handle = deriveHandle('Maximilian Alexander Constantine Bartholomew Worthington');
    expect(handle.length).toBeLessThanOrEqual(39);
    expect(handle.endsWith('-')).toBe(false);
    expect(PlayerProfileSchema.shape.handle.safeParse(handle).success).toBe(true);
  });

  it('always produces a handle the schema accepts', () => {
    for (const name of ['a', '9 lives', 'x'.repeat(100), 'Émile-Zoë', 'a--b', ' - ']) {
      expect(PlayerProfileSchema.shape.handle.safeParse(deriveHandle(name)).success).toBe(true);
    }
  });
});

describe('applyProfilePatch', () => {
  it('derives handle and email from a new name', () => {
    const next = applyProfilePatch(empty(), { name: 'Grace Hopper', classCode: ' CPSC-101 ' });
    expect(next.player).toMatchObject({ name: 'Grace Hopper', handle: 'grace-hopper', email: 'grace-hopper@lanternlabs.example', classCode: 'CPSC-101' });
  });

  it('keeps an email the player set themselves', () => {
    let file = applyProfilePatch(empty(), { name: 'Grace', email: 'grace@navy.example' });
    file = applyProfilePatch(file, { name: 'Grace Hopper' });
    expect(file.player.email).toBe('grace@navy.example');
    expect(file.player.handle).toBe('grace-hopper');
  });

  it('sanitises an explicit handle', () => {
    const next = applyProfilePatch(empty(), { handle: 'Not Valid!' });
    expect(next.player.handle).toBe('not-valid');
    expect(next.player.email).toBe('not-valid@lanternlabs.example');
  });

  it('returns the same object when nothing changes', () => {
    const file = empty();
    expect(applyProfilePatch(file, { classCode: '' })).toBe(file);
  });
});

describe('applyDaily', () => {
  it('counts consecutive days, including month and year boundaries', () => {
    let f = empty();
    for (const d of ['2026-12-30', '2026-12-31', '2027-01-01']) f = applyDaily(f, d, ['1.4'], 3);
    expect(f.daily.streak).toBe(3);
    expect(f.daily.lastDate).toBe('2027-01-01');
  });

  it('restarts the streak after a gap', () => {
    let f = applyDaily(empty(), '2026-09-01', ['1.4'], 3);
    f = applyDaily(f, '2026-09-02', ['1.5'], 3);
    f = applyDaily(f, '2026-09-05', ['2.1'], 2);
    expect(f.daily.streak).toBe(1);
    expect(f.daily.history.map((h) => h.date)).toEqual(['2026-09-01', '2026-09-02', '2026-09-05']);
  });

  it('merges a second session on the same day without changing the streak', () => {
    let f = applyDaily(empty(), '2026-09-01', ['1.4'], 1);
    f = applyDaily(f, '2026-09-01', ['1.5'], 3);
    expect(f.daily.streak).toBe(1);
    expect(f.daily.history).toEqual([{ date: '2026-09-01', levels: ['1.4', '1.5'], completed: 3 }]);
  });

  it('does not extend the streak when no puzzle was completed', () => {
    let f = applyDaily(empty(), '2026-09-01', ['1.4'], 2);
    f = applyDaily(f, '2026-09-02', ['1.5'], 0);
    expect(f.daily.streak).toBe(1);
    expect(f.daily.lastDate).toBe('2026-09-01');
    expect(f.daily.history).toHaveLength(2);
  });

  it('ignores an earlier date for the streak (clock changes)', () => {
    let f = applyDaily(empty(), '2026-09-10', ['1.4'], 2);
    f = applyDaily(f, '2026-09-09', ['1.5'], 2);
    expect(f.daily.streak).toBe(1);
    expect(f.daily.lastDate).toBe('2026-09-10');
  });

  it('caps history at the most recent days', () => {
    let f = empty();
    const start = Date.UTC(2026, 0, 1);
    for (let i = 0; i < DAILY_HISTORY_LIMIT + 15; i++) {
      f = applyDaily(f, new Date(start + i * 86_400_000).toISOString().slice(0, 10), ['1.4'], 1);
    }
    expect(f.daily.history).toHaveLength(DAILY_HISTORY_LIMIT);
    expect(f.daily.history[0].date).toBe(new Date(start + 15 * 86_400_000).toISOString().slice(0, 10));
    expect(f.daily.streak).toBe(DAILY_HISTORY_LIMIT + 15);
    expect(ProgressFileSchema.safeParse(f).success).toBe(true);
  });

  it('ignores invalid dates', () => {
    const f = empty();
    expect(applyDaily(f, '2026-02-30', ['1.4'], 1)).toBe(f);
    expect(applyDaily(f, 'yesterday', ['1.4'], 1)).toBe(f);
  });

  it('shows a broken streak as 0', () => {
    const f = applyDaily(applyDaily(empty(), '2026-09-01', ['1.4'], 1), '2026-09-02', ['1.5'], 1);
    expect(currentStreak(f.daily, '2026-09-02')).toBe(2);
    expect(currentStreak(f.daily, '2026-09-03')).toBe(2);
    expect(currentStreak(f.daily, '2026-09-04')).toBe(0);
  });
});

describe('small helpers', () => {
  it('dayNumber counts whole days', () => {
    expect((dayNumber('2026-03-01') ?? 0) - (dayNumber('2026-02-28') ?? 0)).toBe(1);
    expect(dayNumber('2026-13-01')).toBeNull();
  });

  it('toCount and msToSeconds clean bad numbers', () => {
    expect(toCount(Number.NaN)).toBe(0);
    expect(toCount(-4)).toBe(0);
    expect(toCount(2.6)).toBe(3);
    expect(msToSeconds(1234)).toBe(1.2);
    expect(msToSeconds(Number.POSITIVE_INFINITY)).toBe(0);
  });

  it('mergeErrorCodes sums counts and skips zero', () => {
    expect(mergeErrorCodes({ a: 1 }, { a: 2, b: 0, c: 1 })).toEqual({ a: 3, c: 1 });
  });

  it('addUnique keeps order and reports no change with null', () => {
    expect(addUnique(['a'], ['b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    expect(addUnique(['a'], ['a', ''])).toBeNull();
  });
});
