import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { unifiedHunks } from './unified';
import { diffTexts, splitRecords } from './xdiff';
import { merge3 } from './merge3';

const dir = mkdtempSync(join(tmpdir(), 'gq-xdiff-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(dir, 'cfg'), HOME: dir, LANG: 'C', LC_ALL: 'C' };
writeFileSync(join(dir, 'cfg'), '[core]\n\tautocrlf = false\n');

function realHunks(a: string, b: string): string[] {
  writeFileSync(join(dir, 'a'), a);
  writeFileSync(join(dir, 'b'), b);
  const r = spawnSync('git', ['diff', '--no-index', '--no-color', 'a', 'b'], { cwd: dir, env, encoding: 'utf8' });
  const lines = r.stdout.replace(/\n$/, '').split('\n');
  const at = lines.findIndex((l) => l.startsWith('@@'));
  return at < 0 ? [] : lines.slice(at);
}

function realMerge(base: string, ours: string, theirs: string, extra: string[] = []): { text: string; conflicts: number } {
  writeFileSync(join(dir, 'base'), base);
  writeFileSync(join(dir, 'ours'), ours);
  writeFileSync(join(dir, 'theirs'), theirs);
  const r = spawnSync('git', ['merge-file', '-p', ...extra, '-L', 'HEAD', '-L', 'base', '-L', 'feature', 'ours', 'base', 'theirs'], { cwd: dir, env, encoding: 'utf8' });
  return { text: r.stdout, conflicts: r.status ?? -1 };
}

// Deterministic pseudo-random generator.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const VOCAB = ['a', 'b', 'c', '', '}', '{', '  x = 1;', '  y = 2;', 'function f() {', 'return;', '\tindent', 'end', '# title', 'body text'];

function randomText(r: () => number, n: number): string {
  const lines: string[] = [];
  for (let i = 0; i < n; i++) lines.push(VOCAB[Math.floor(r() * VOCAB.length)]);
  let t = lines.join('\n');
  if (r() < 0.85) t += '\n';
  return t;
}

function mutate(r: () => number, text: string): string {
  const lines = text.split('\n');
  const ops = 1 + Math.floor(r() * 4);
  for (let k = 0; k < ops; k++) {
    const pos = Math.floor(r() * (lines.length + 1));
    const op = r();
    if (op < 0.33) lines.splice(pos, 1);
    else if (op < 0.66) lines.splice(pos, 0, VOCAB[Math.floor(r() * VOCAB.length)]);
    else lines[Math.min(pos, lines.length - 1)] = VOCAB[Math.floor(r() * VOCAB.length)];
  }
  return lines.join('\n');
}

describe('xdiff port', () => {
  it('splits records keeping newlines', () => {
    expect(splitRecords('a\nb')).toEqual(['a\n', 'b']);
    expect(splitRecords('a\n')).toEqual(['a\n']);
    expect(splitRecords('')).toEqual([]);
  });

  it('simple change', () => {
    expect(diffTexts('a\nb\nc\n', 'a\nB\nc\n').changes).toEqual([{ i1: 1, i2: 1, chg1: 1, chg2: 1 }]);
  });

  it('matches git diff on hand-written cases', () => {
    const cases: [string, string][] = [
      ['hello\n', 'hello\nworld\n'],
      ['', 'new\n'],
      ['old\n', ''],
      ['no newline', 'no newline\n'],
      ['a\nb\nc\nd\ne\nf\ng\nh\ni\nj\nk\n', 'a\nB\nc\nd\ne\nf\ng\nh\ni\nJ\nk\n'],
      ['function a() {\n  one;\n}\n\nfunction b() {\n  two;\n}\n', 'function a() {\n  one;\n}\n\nfunction c() {\n  three;\n}\n\nfunction b() {\n  two;\n}\n'],
      ['x\n\ny\n', 'x\n\nnew\n\ny\n'],
      ['<html>\n<body>\n<h1>Hi</h1>\n</body>\n</html>\n', '<html>\n<body>\n<h1>Hi</h1>\n<p>Festival</p>\n</body>\n</html>\n'],
    ];
    for (const [a, b] of cases) expect(unifiedHunks(a, b)).toEqual(realHunks(a, b));
  });

  it('matches git diff on 150 random cases', () => {
    const r = rng(42);
    for (let i = 0; i < 150; i++) {
      const a = randomText(r, Math.floor(r() * 25));
      const b = r() < 0.5 ? mutate(r, a) : randomText(r, Math.floor(r() * 25));
      expect(unifiedHunks(a, b), JSON.stringify([a, b])).toEqual(realHunks(a, b));
    }
  });
});

describe('three-way line merge', () => {
  it('matches git merge-file on hand-written cases', () => {
    const cases: [string, string, string][] = [
      ['one\ntwo\nthree\n', 'one\n2\nthree\n', 'one\nTWO\nthree\n'],
      ['a\nb\nc\n', 'a\nB\nc\n', 'a\nb\nC\n'],
      ['a\nb\nc\nd\ne\n', 'A\nb\nc\nd\nE\n', 'a\nb\nX\nd\ne\n'],
      ['', 'ours\n', 'theirs\n'],
      ['x\n', 'x\ny', 'x\nz'],
      ['same\n', 'changed\n', 'changed\n'],
    ];
    for (const [base, ours, theirs] of cases) {
      const real = realMerge(base, ours, theirs);
      const mine = merge3(base, ours, theirs, { ours: 'HEAD', theirs: 'feature', level: 'zealous_alnum' });
      expect(mine.text, JSON.stringify([base, ours, theirs])).toBe(real.text);
      expect(mine.conflicts).toBe(real.conflicts);
    }
  });

  it('matches git merge-file on 150 random cases', () => {
    const r = rng(7);
    for (let i = 0; i < 150; i++) {
      const base = randomText(r, 3 + Math.floor(r() * 15));
      const ours = mutate(r, base);
      const theirs = mutate(r, base);
      const real = realMerge(base, ours, theirs);
      const mine = merge3(base, ours, theirs, { ours: 'HEAD', theirs: 'feature', level: 'zealous_alnum' });
      expect(mine.text, JSON.stringify([base, ours, theirs])).toBe(real.text);
      expect(mine.conflicts).toBe(real.conflicts);
    }
  });

  it('favours a side with -X ours / -X theirs', () => {
    const base = 'one\ntwo\nthree\n';
    const ours = 'one\n2\nthree\n';
    const theirs = 'one\nTWO\nthree\n';
    for (const [flag, favor] of [['--ours', 'ours'], ['--theirs', 'theirs']] as const) {
      const real = realMerge(base, ours, theirs, [flag]);
      const mine = merge3(base, ours, theirs, { ours: 'HEAD', theirs: 'feature', favor, level: 'zealous_alnum' });
      expect(mine.text).toBe(real.text);
      expect(mine.conflicts).toBe(0);
    }
  });
});
