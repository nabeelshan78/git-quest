import { describe, expect, it } from 'vitest';
import { EMPTY_LINE, commonPrefix, lineReducer, parseTerminalInput } from './lineEditor';
import type { LineAction, LineState } from './lineEditor';

const run = (actions: LineAction[], start: LineState = EMPTY_LINE) => actions.reduce(lineReducer, start);
const typed = (text: string) => run([{ type: 'insert', text }]);

describe('lineReducer', () => {
  it('inserts text at the cursor', () => {
    const s = run([{ type: 'insert', text: 'git st' }, { type: 'left' }, { type: 'left' }, { type: 'insert', text: 'X' }]);
    expect(s.buffer).toBe('git Xst');
    expect(s.cursor).toBe(5);
  });

  it('moves left and right within bounds', () => {
    let s = run([{ type: 'left' }]);
    expect(s.cursor).toBe(0);
    s = run([{ type: 'right' }, { type: 'right' }], typed('a'));
    expect(s.cursor).toBe(1);
  });

  it('supports home and end', () => {
    const s = run([{ type: 'home' }], typed('git log'));
    expect(s.cursor).toBe(0);
    expect(run([{ type: 'end' }], s).cursor).toBe(7);
  });

  it('backspace and delete remove the right characters', () => {
    const s = typed('abc');
    expect(run([{ type: 'backspace' }], s).buffer).toBe('ab');
    const mid = run([{ type: 'left' }, { type: 'left' }, { type: 'delete' }], s);
    expect(mid.buffer).toBe('ac');
    expect(mid.cursor).toBe(1);
    expect(run([{ type: 'home' }, { type: 'backspace' }], s).buffer).toBe('abc');
    expect(run([{ type: 'delete' }], s).buffer).toBe('abc');
  });

  it('deletes the previous word and kills to start / end', () => {
    const s = typed('git commit -m');
    expect(run([{ type: 'deleteWordBack' }], s).buffer).toBe('git commit ');
    const mid = run([{ type: 'wordLeft' }], s);
    expect(mid.cursor).toBe(11);
    expect(run([{ type: 'killToEnd' }], mid).buffer).toBe('git commit ');
    expect(run([{ type: 'killToStart' }], mid).buffer).toBe('-m');
    expect(run([{ type: 'home' }, { type: 'wordRight' }], s).cursor).toBe(3);
  });

  it('browses history up and down and restores the draft', () => {
    const history = ['git init', 'git status'];
    let s = typed('git a');
    s = lineReducer(s, { type: 'historyUp', history });
    expect(s.buffer).toBe('git status');
    s = lineReducer(s, { type: 'historyUp', history });
    expect(s.buffer).toBe('git init');
    s = lineReducer(s, { type: 'historyUp', history });
    expect(s.buffer).toBe('git init');
    s = lineReducer(s, { type: 'historyDown', history });
    expect(s.buffer).toBe('git status');
    s = lineReducer(s, { type: 'historyDown', history });
    expect(s.buffer).toBe('git a');
    expect(s.historyIndex).toBeNull();
    expect(lineReducer(s, { type: 'historyDown', history })).toBe(s);
  });

  it('ignores history when it is empty', () => {
    const s = typed('x');
    expect(lineReducer(s, { type: 'historyUp', history: [] })).toBe(s);
  });

  it('turns pasted tabs and newlines into spaces and sets / clears lines', () => {
    expect(typed('a\tb').buffer).toBe('a b');
    const s = lineReducer(EMPTY_LINE, { type: 'set', line: 'git add .' });
    expect(s.cursor).toBe(9);
    expect(lineReducer(s, { type: 'clear' })).toEqual(EMPTY_LINE);
  });
});

describe('parseTerminalInput', () => {
  it('groups printable characters into one insert', () => {
    expect(parseTerminalInput('git')).toEqual([{ type: 'edit', action: { type: 'insert', text: 'git' } }]);
  });

  it('recognises Enter, Tab, Backspace, Ctrl+C and Ctrl+L', () => {
    expect(parseTerminalInput('\r').map((k) => k.type)).toEqual(['enter']);
    expect(parseTerminalInput('\t').map((k) => k.type)).toEqual(['tab']);
    expect(parseTerminalInput('\x7f')).toEqual([{ type: 'edit', action: { type: 'backspace' } }]);
    expect(parseTerminalInput('\x03').map((k) => k.type)).toEqual(['interrupt']);
    expect(parseTerminalInput('\x0c').map((k) => k.type)).toEqual(['clearScreen']);
  });

  it('recognises arrow keys, Home, End and Delete escape sequences', () => {
    expect(parseTerminalInput('\x1b[A')).toEqual([{ type: 'up' }]);
    expect(parseTerminalInput('\x1b[B')).toEqual([{ type: 'down' }]);
    expect(parseTerminalInput('\x1b[D')).toEqual([{ type: 'edit', action: { type: 'left' } }]);
    expect(parseTerminalInput('\x1b[C')).toEqual([{ type: 'edit', action: { type: 'right' } }]);
    expect(parseTerminalInput('\x1b[H')).toEqual([{ type: 'edit', action: { type: 'home' } }]);
    expect(parseTerminalInput('\x1bOF')).toEqual([{ type: 'edit', action: { type: 'end' } }]);
    expect(parseTerminalInput('\x1b[3~')).toEqual([{ type: 'edit', action: { type: 'delete' } }]);
    expect(parseTerminalInput('\x1b[1;5D')).toEqual([{ type: 'edit', action: { type: 'wordLeft' } }]);
  });

  it('splits a pasted multi-line text into lines and Enters', () => {
    const keys = parseTerminalInput('git add .\r\ngit status\n');
    expect(keys.map((k) => k.type)).toEqual(['edit', 'enter', 'edit', 'enter']);
  });

  it('skips unknown escape sequences and other control characters', () => {
    expect(parseTerminalInput('a\x1b[15~b\x07c')).toEqual([
      { type: 'edit', action: { type: 'insert', text: 'a' } },
      { type: 'edit', action: { type: 'insert', text: 'bc' } },
    ]);
  });
});

describe('commonPrefix', () => {
  it('finds the longest shared start', () => {
    expect(commonPrefix(['status', 'stash', 'show'])).toBe('s');
    expect(commonPrefix(['commit', 'commit-tree'])).toBe('commit');
    expect(commonPrefix([])).toBe('');
  });
});
