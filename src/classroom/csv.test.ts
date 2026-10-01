import { describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { getChapters } from '../levels/content';
import { buildCurriculum, levelStats, makeRecord, summarizeStudent } from './aggregate';
import { CSV_BOM, classSummaryCsv, classSummaryRows, csvCell, csvFileName, levelStatsCsv, levelStatsRows, round, toCsv } from './csv';
import type { Translate } from './progressFile';
import { makeProgressFile } from './testing';

const t: Translate = (key, options) => String(i18n.t(key, options));
const curriculum = buildCurriculum(getChapters());

/** Minimal RFC 4180 parser for checking our own output. */
function parseCsv(text: string): string[][] {
  const body = text.startsWith(CSV_BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (quoted) {
      if (ch === '"' && body[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\r' && body[i + 1] === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      i++;
    } else cell += ch;
  }
  return rows;
}

describe('csvCell and toCsv', () => {
  it('quotes commas, quotes and line breaks', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(' padded ')).toBe('" padded "');
  });

  it('writes numbers, booleans and empty values', () => {
    expect(csvCell(3.5)).toBe('3.5');
    expect(csvCell(true)).toBe('1');
    expect(csvCell(false)).toBe('0');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(Number.NaN)).toBe('');
  });

  it('neutralises spreadsheet formulas in text', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+1')).toBe("'+1");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('-2')).toBe("'-2");
    expect(csvCell(-2)).toBe('-2');
  });

  it('starts with a UTF-8 BOM and uses CRLF line ends', () => {
    const text = toCsv([
      ['a', 'b'],
      [1, 'Chloé'],
    ]);
    expect(text.charCodeAt(0)).toBe(0xfeff);
    expect(text).toBe(`${CSV_BOM}a,b\r\n1,Chloé\r\n`);
    expect(toCsv([['x']], false)).toBe('x\r\n');
  });

  it('round() keeps nulls', () => {
    expect(round(1.26, 1)).toBe(1.3);
    expect(round(null)).toBeNull();
  });
});

describe('class summary CSV', () => {
  const files = [
    makeProgressFile({
      id: 'p1',
      name: 'Doe, Jane "JD"',
      classCode: 'CPSC-101',
      levels: { '0.6': { completed: true, stars: 3, timeSpentSec: 600 }, '1.1': { completed: true, stars: 2, maxHintTier: 3, hintsUsed: 3 } },
    }),
    makeProgressFile({ id: 'p2', name: 'Émile', classCode: 'CPSC-101' }),
  ];
  const summaries = files.map((f) => summarizeStudent(makeRecord(f, `${f.player.id}.gitquest.json`), curriculum));
  const rows = classSummaryRows(summaries, curriculum, t);
  const header = rows[0] as string[];

  it('has one row per student plus a header', () => {
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.length === header.length)).toBe(true);
  });

  it('has a column per boss level and per chapter', () => {
    expect(header.filter((h) => h.startsWith('Boss ch '))).toHaveLength(12);
    expect(header).toContain('Boss ch 0 (0.6)');
    expect(header).toContain('Boss ch 11 (11.8)');
    expect(header.filter((h) => /^Ch \d+ levels completed/.test(h))).toHaveLength(12);
  });

  it('writes the right values', () => {
    const col = (name: string) => header.indexOf(name);
    const jane = rows[1];
    expect(jane[col('Name')]).toBe('Doe, Jane "JD"');
    expect(jane[col('Levels completed')]).toBe(2);
    expect(jane[col('Levels total')]).toBe(91);
    expect(jane[col('Stars')]).toBe(5);
    expect(jane[col('Boss levels completed')]).toBe(1);
    expect(jane[col('Boss ch 0 (0.6)')]).toBe(true);
    expect(jane[col('Boss ch 1 (1.6)')]).toBe(false);
    expect(jane[col('Ch 0 levels completed (of 6)')]).toBe(1);
    expect(jane[col('Ch 1 levels completed (of 6)')]).toBe(1);
    expect(jane[col('Time played (minutes)')]).toBe(10);
    expect(jane[col('Levels with hint 3 opened')]).toBe(1);
    expect(jane[col('Checksum')]).toBe('OK');
  });

  it('survives a parse round trip with quoting intact', () => {
    const parsed = parseCsv(classSummaryCsv(summaries, curriculum, t));
    expect(parsed).toHaveLength(3);
    expect(parsed[1][0]).toBe('Doe, Jane "JD"');
    expect(parsed[2][0]).toBe('Émile');
    expect(parsed[1]).toHaveLength(parsed[0].length);
  });
});

describe('level statistics CSV', () => {
  const records = [
    makeRecord(makeProgressFile({ id: 'a', levels: { '5.3': { completed: true, timeSpentSec: 120, maxHintTier: 3, errorCodes: { 'merge-conflict': 2 }, errors: 2 } } }), 'a'),
    makeRecord(makeProgressFile({ id: 'b', levels: { '5.3': { completed: false, timeSpentSec: 240, maxHintTier: 3 } } }), 'b'),
  ];
  const stats = levelStats(records, curriculum);

  it('has one row per level', () => {
    const rows = levelStatsRows(stats, t);
    expect(rows).toHaveLength(92);
    expect(rows[0][1]).toBe('Level');
  });

  it('writes percentages, minutes and top errors', () => {
    const parsed = parseCsv(levelStatsCsv(stats, t));
    const header = parsed[0];
    const row = parsed.find((r) => r[1] === '5.3')!;
    const col = (name: string) => row[header.indexOf(name)];
    expect(col('Title')).toBe('Resolve and finish');
    expect(col('Completed (% of students)')).toBe('50');
    expect(col('Median time (minutes)')).toBe('3');
    expect(col('Opened hint 3 (% of students who started)')).toBe('100');
    expect(col('Top errors')).toBe('merge-conflict (2)');
    expect(col('High hint use')).toBe('1');
    expect(parsed.find((r) => r[1] === '0.1')![header.indexOf('High hint use')]).toBe('0');
  });
});

describe('csvFileName', () => {
  it('includes the kind, class code and date', () => {
    expect(csvFileName('class-summary', 'CPSC 101/A', '2026-09-30T12:00:00Z')).toBe('gitquest-class-summary-cpsc-101-a-2026-09-30.csv');
    expect(csvFileName('level-stats', null, '2026-09-30')).toBe('gitquest-level-stats-2026-09-30.csv');
  });
});
