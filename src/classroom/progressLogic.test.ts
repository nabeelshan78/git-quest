import { describe, expect, it } from 'vitest';
import { PlayerProfileSchema, ProgressFileSchema } from '../shared/progress';
import {
  addUnique,
  applyAttemptStart,
  applyLevelResult,
  applyProfilePatch,
  createEmptyProgress,
  deriveHandle,
  mergeErrorCodes,
  msToSeconds,
  toCount,
} from './progressLogic';
import { levelResult } from './testing';

const empty = () => createEmptyProgress('id-1', '2026-09-01T10:00:00.000Z', 'test');

describe('createEmptyProgress', () => {
  it('is a valid progress file with the default handle and email', () => {
    const file = empty();
    expect(ProgressFileSchema.safeParse(file).success).toBe(true);
    expect(file.player).toMatchObject({ id: 'id-1', name: '', handle: 'intern', email: 'intern@lanternlabs.example', classCode: '' });
  });
});

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

  it('falls back to "intern" when the name has no usable letters', () => {
    const named = applyProfilePatch(empty(), { name: 'Ada' });
    const next = applyProfilePatch(named, { name: '李雷' });
    expect(next.player).toMatchObject({ name: '李雷', handle: 'intern', email: 'intern@lanternlabs.example' });
  });

  it('returns the same object when nothing changes', () => {
    const file = empty();
    expect(applyProfilePatch(file, { classCode: '' })).toBe(file);
  });
});

describe('applyAttemptStart and applyLevelResult', () => {
  it('never mutate their input', () => {
    const file = empty();
    const snapshot = JSON.stringify(file);
    const started = applyAttemptStart(file, '1.4', '2026-09-01T10:01:00.000Z');
    applyLevelResult(started, levelResult({ levelId: '1.4' }), '2026-09-01T10:02:00.000Z', true);
    expect(JSON.stringify(file)).toBe(snapshot);
    expect(started.levels['1.4'].attempts).toBe(1);
    expect(started.levels['1.4'].completed).toBe(false);
  });

  it('keep the file valid against the schema', () => {
    let file = applyAttemptStart(empty(), '2.4', '2026-09-01T10:01:00.000Z');
    file = applyLevelResult(file, levelResult({ levelId: '2.4', hintsRevealed: 3, errorCodes: { 'nothing-added': 2 } }), '2026-09-01T10:02:00.000Z', true);
    expect(ProgressFileSchema.safeParse(file).success).toBe(true);
  });

  it('do not set firstCompletedAt for an abandoned attempt', () => {
    const file = applyLevelResult(empty(), levelResult({ levelId: '3.1', completed: false, stars: 0 }), '2026-09-01T10:02:00.000Z', false);
    expect(file.levels['3.1']).toMatchObject({ completed: false, stars: 0, completions: 0, firstCompletedAt: null, bestTimeSec: null, bestCommands: null });
  });
});

describe('small helpers', () => {
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
