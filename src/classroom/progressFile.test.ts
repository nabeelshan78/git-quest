import { describe, expect, it } from 'vitest';
import { STRINGS } from '../strings';
import { verifyChecksum } from './checksum';
import { describeParseError, localDate, parseProgressFile, progressFileName, serializeProgressFile } from './progressFile';
import { makeProgressFile } from './testing';

describe('serializeProgressFile and parseProgressFile', () => {
  it('round-trips with a fresh exportedAt and checksum', () => {
    const file = makeProgressFile({ id: 'p1', name: 'Ada', levels: { '1.1': { completed: true, stars: 2 } }, sign: false });
    const text = serializeProgressFile(file, '2026-09-30T12:00:00.000Z');
    const parsed = parseProgressFile(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.file.exportedAt).toBe('2026-09-30T12:00:00.000Z');
      expect(verifyChecksum(parsed.file)).toBe(true);
      expect(parsed.file.levels['1.1'].stars).toBe(2);
    }
  });

  it('reports where a damaged file breaks the format', () => {
    const file = makeProgressFile({ id: 'p1', levels: { '1.1': { stars: 3 } } });
    const broken = JSON.parse(JSON.stringify(file)) as { levels: Record<string, { stars: number }> };
    broken.levels['1.1'].stars = 9;
    const parsed = parseProgressFile(JSON.stringify(broken));
    expect(parsed).toEqual({ ok: false, error: { code: 'damaged', detail: 'levels.1.1.stars' } });
  });

  it('refuses a file whose checksum does not match', () => {
    const file = makeProgressFile({ id: 'p1', name: 'Ada' });
    const edited = { ...file, player: { ...file.player, name: 'Grace' } };
    expect(parseProgressFile(JSON.stringify(edited))).toEqual({ ok: false, error: { code: 'checksum' } });
  });
});

describe('describeParseError', () => {
  it('fills in the placeholders', () => {
    expect(describeParseError({ code: 'newerVersion', version: 3 })).toContain('format 3');
    expect(describeParseError({ code: 'damaged', detail: 'player.name' })).toContain('"player.name"');
  });

  it('has a message for every error', () => {
    for (const code of ['empty', 'tooLarge', 'notJson', 'notProgress', 'checksum'] as const) {
      expect(describeParseError({ code })).toBe(STRINGS.classroom.importError[code]);
    }
  });
});

describe('file names', () => {
  it('uses the handle and the local date', () => {
    const file = makeProgressFile({ id: 'p1', name: 'Ada Lovelace' });
    expect(progressFileName(file, '2026-09-30')).toBe('ada-lovelace-2026-09-30.gitquest.json');
    expect(progressFileName(file, '2026-09-30', 'csv')).toBe('ada-lovelace-2026-09-30.gitquest.csv');
  });

  it('formats a local calendar date', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });
});
