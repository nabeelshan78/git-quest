import { describe, expect, it } from 'vitest';
import { getChapters } from '../levels/content';
import { CSV_BOM, csvCell, progressCsvRows, progressToCsv, toCsv } from './csv';
import { TINY_CHAPTERS, makeProgressFile } from './testing';

/** Minimal RFC 4180 reader, used to check that the output parses back to the same cells. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

describe('csvCell', () => {
  it('leaves plain text and numbers alone', () => {
    expect(csvCell('Ada Lovelace')).toBe('Ada Lovelace');
    expect(csvCell(42)).toBe('42');
    expect(csvCell(0)).toBe('0');
  });

  it('writes null, undefined and non-finite numbers as empty cells', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('quotes commas, quotes, line breaks and edge spaces', () => {
    expect(csvCell('Lovelace, Ada')).toBe('"Lovelace, Ada"');
    expect(csvCell('the "best" intern')).toBe('"the ""best"" intern"');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(' padded ')).toBe('" padded "');
  });

  it('stops spreadsheets from running a cell as a formula', () => {
    expect(csvCell('=SUM(A1:A9)')).toBe("'=SUM(A1:A9)");
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@cmd')).toBe("'@cmd");
  });
});

describe('toCsv', () => {
  it('starts with a UTF-8 byte-order mark and uses CRLF line ends', () => {
    const text = toCsv([['a', 1], ['b', 2]]);
    expect(text.startsWith(CSV_BOM)).toBe(true);
    expect(text).toBe(`${CSV_BOM}a,1\r\nb,2\r\n`);
  });

  it('can leave the byte-order mark out', () => {
    expect(toCsv([['x']], false)).toBe('x\r\n');
  });
});

describe('progress CSV', () => {
  const file = makeProgressFile({
    id: 'p1',
    name: 'Chloé "Clo" Dubois, Jr.',
    classCode: 'CPSC-101',
    levels: {
      '1.1': {
        completed: true,
        stars: 3,
        attempts: 2,
        completions: 1,
        timeSpentSec: 125.6,
        hintsUsed: 4,
        maxHintTier: 3,
        errors: 5,
        firstCompletedAt: '2026-09-10T09:30:00.000Z',
      },
    },
  });

  it('identifies the student in the header rows', () => {
    const rows = progressCsvRows(file, TINY_CHAPTERS, '2026-09-30T12:00:00.000Z');
    expect(rows.slice(0, 5)).toEqual([
      ['Name', 'Chloé "Clo" Dubois, Jr.'],
      ['Handle', 'chloe-clo-dubois-jr'],
      ['Class code', 'CPSC-101'],
      ['Exported at', '2026-09-30T12:00:00.000Z'],
      [],
    ]);
  });

  it('has the documented columns', () => {
    const rows = progressCsvRows(file, TINY_CHAPTERS, '2026-09-30T12:00:00.000Z');
    expect(rows[5]).toEqual([
      'Level',
      'Title',
      'Completed',
      'Stars',
      'Attempts',
      'Completions',
      'Time spent (seconds)',
      'Hints used',
      'Highest hint tier',
      'Errors',
      'First completed at',
    ]);
  });

  it('lists every level in chapter order, with zeros for levels not played', () => {
    const rows = progressCsvRows(file, TINY_CHAPTERS, '2026-09-30T12:00:00.000Z').slice(6);
    expect(rows).toEqual([
      ['0.1', 'Where am I?', 'no', 0, 0, 0, 0, 0, 0, 0, null],
      ['1.1', 'Tell git who you are', 'yes', 3, 2, 1, 126, 4, 3, 5, '2026-09-10T09:30:00.000Z'],
      ['1.2', 'Boss: start the "festival", repo', 'no', 0, 0, 0, 0, 0, 0, 0, null],
    ]);
  });

  it('leaves out levels that are not in the curriculum', () => {
    const extra = makeProgressFile({ id: 'p2', levels: { '9.9': { completed: true } } });
    const ids = progressCsvRows(extra, TINY_CHAPTERS, '2026-09-30T12:00:00.000Z')
      .slice(6)
      .map((r) => r[0]);
    expect(ids).toEqual(['0.1', '1.1', '1.2']);
  });

  it('parses back to the same cells (quoting round trip)', () => {
    const text = progressToCsv(file, TINY_CHAPTERS, '2026-09-30T12:00:00.000Z');
    expect(text.startsWith(CSV_BOM)).toBe(true);
    const parsed = parseCsv(text.slice(1));
    const expected = progressCsvRows(file, TINY_CHAPTERS, '2026-09-30T12:00:00.000Z').map((row) => row.map((c) => (c === null || c === undefined ? '' : String(c))));
    expect(parsed).toEqual(expected.map((row) => (row.length === 0 ? [''] : row)));
  });

  it('covers all levels of content/chapters.json in order', () => {
    const chapters = getChapters();
    const rows = progressCsvRows(file, chapters, '2026-09-30T12:00:00.000Z').slice(6);
    const order = [...chapters.chapters].sort((a, b) => a.number - b.number).flatMap((c) => c.levels.map((l) => l.id));
    expect(rows.map((r) => r[0])).toEqual(order);
    const bosses = chapters.chapters.flatMap((c) => c.levels.filter((l) => l.boss)).map((l) => l.title);
    for (const title of bosses) expect(title.startsWith('Boss:')).toBe(true);
  });
});
