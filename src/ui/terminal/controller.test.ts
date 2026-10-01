import { describe, expect, it } from 'vitest';
import type { TerminalEntry } from '../../shared/session';
import { TerminalController } from './controller';
import type { TermLike } from './controller';
import { EMPTY_LINE } from './lineEditor';
import { TERMINAL_THEMES } from './themes';
import { colorPrompt, entriesForMachine, formatEntry, visibleLength } from './transcript';

class FakeTerm implements TermLike {
  cols = 40;
  writes: string[] = [];
  resets = 0;
  write(data: string) {
    this.writes.push(data);
  }
  reset() {
    this.resets++;
    this.writes = [];
  }
  get text() {
    // eslint-disable-next-line no-control-regex
    return this.writes.join('').replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '');
  }
}

const roles = TERMINAL_THEMES[0].roles;
const labels = { ada: 'Ada:' };
const e = (id: number, kind: TerminalEntry['kind'], text: string, extra: Partial<TerminalEntry> = {}): TerminalEntry => ({ id, kind, text, ...extra });

describe('transcript formatting', () => {
  it('measures visible length without escape codes', () => {
    expect(visibleLength('\x1b[1m\x1b[38;2;1;2;3mabc\x1b[0m')).toBe(3);
  });

  it('colours a bash-style prompt and keeps unknown prompts as they are', () => {
    const p = colorPrompt('intern@laptop:~/festival (main)$', roles);
    expect(visibleLength(p)).toBe('intern@laptop:~/festival (main)$'.length);
    expect(p).not.toBe('intern@laptop:~/festival (main)$');
    expect(colorPrompt('>>>', roles)).toBe('>>>');
  });

  it('formats each entry kind', () => {
    expect(formatEntry(e(1, 'input', 'git status', { prompt: 'a@b:~$' }), roles, labels)).toContain('git status');
    expect(formatEntry(e(2, 'stdout', 'one\ntwo'), roles, labels)).toBe('one\r\ntwo');
    expect(formatEntry(e(3, 'stderr', 'fatal: x'), roles, labels)).toContain('\x1b[38;2;');
    expect(formatEntry(e(4, 'ada', 'Try git add.'), roles, labels)).toContain('Ada:');
    expect(formatEntry(e(5, 'dialogue', 'Hi!', { speaker: 'Sam' }), roles, labels)).toContain('Sam:');
    expect(formatEntry(e(6, 'system', 'Rewound.'), roles, labels)).toContain('Rewound.');
  });

  it('filters entries for one machine', () => {
    const entries = [e(1, 'stdout', 'a', { machine: 'laptop' }), e(2, 'stdout', 'b', { machine: 'sam' }), e(3, 'ada', 'c')];
    expect(entriesForMachine(entries, 'laptop').map((x) => x.id)).toEqual([1, 3]);
  });
});

describe('TerminalController', () => {
  it('appends new entries incrementally without resetting', () => {
    const term = new FakeTerm();
    const c = new TerminalController(term, { roles, labels });
    c.sync([e(1, 'stdout', 'first')]);
    c.sync([e(1, 'stdout', 'first'), e(2, 'stdout', 'second')]);
    expect(term.resets).toBe(0);
    expect(term.text).toContain('first');
    expect(term.text).toContain('second');
    expect(term.text.indexOf('first')).toBeLessThan(term.text.indexOf('second'));
  });

  it('re-renders everything when earlier entries change (rewind / restart)', () => {
    const term = new FakeTerm();
    const c = new TerminalController(term, { roles, labels });
    c.sync([e(1, 'stdout', 'old')]);
    c.sync([e(7, 'stdout', 'new')]);
    expect(term.resets).toBe(1);
    expect(term.text).toContain('new');
    expect(term.text).not.toContain('old');
  });

  it('draws the prompt and the typed line, and redraws on edits', () => {
    const term = new FakeTerm();
    const c = new TerminalController(term, { roles, labels });
    c.setLive({ kind: 'input', prompt: 'a@b:~$', line: { ...EMPTY_LINE, buffer: 'git', cursor: 3 } });
    expect(term.text).toContain('a@b:~$ git');
    c.setLive({ kind: 'input', prompt: 'a@b:~$', line: { ...EMPTY_LINE, buffer: 'git st', cursor: 6 } });
    // The second draw starts by clearing the old live line.
    expect(term.writes.some((w) => w.includes('\r\x1b[J'))).toBe(true);
    expect(term.writes[term.writes.length - 1]).toContain('git st');
  });

  it('moves the cursor up when the line wraps and the cursor is earlier', () => {
    const term = new FakeTerm();
    term.cols = 10;
    const c = new TerminalController(term, { roles, labels });
    // prompt "$" + space = 2 chars; 18 typed chars => 20 chars => exactly 2 rows.
    c.setLive({ kind: 'input', prompt: '$', line: { ...EMPTY_LINE, buffer: 'abcdefghijklmnopqr', cursor: 0 } });
    const last = term.writes[term.writes.length - 1];
    expect(last).toContain(' \b');
    expect(last).toContain('\x1b[2A');
    expect(last).toContain('\x1b[3G');
  });

  it('keeps extra lines (like ^C) until a full re-render', () => {
    const term = new FakeTerm();
    const c = new TerminalController(term, { roles, labels });
    c.sync([e(1, 'stdout', 'hello')]);
    c.setLive({ kind: 'input', prompt: '$', line: { ...EMPTY_LINE, buffer: 'oops', cursor: 4 } });
    c.commitLive('^C');
    expect(term.text).toContain('oops^C');
    c.rerender();
    expect(term.text).toContain('oops^C');
    c.clearScreen([]);
    expect(term.text).not.toContain('hello');
  });

  it('shows the waiting hint without an editable prompt', () => {
    const term = new FakeTerm();
    const c = new TerminalController(term, { roles, labels });
    c.setLive({ kind: 'waiting', text: 'hint: Waiting for your editor to close the file...' });
    expect(term.text).toContain('Waiting for your editor');
    expect(term.writes.join('')).toContain('\x1b[?25l');
    c.setLive({ kind: 'none' });
    expect(term.writes[term.writes.length - 2]).toContain('\x1b[J');
  });
});
