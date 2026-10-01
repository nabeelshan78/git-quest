/**
 * The terminal's line editor (pure): a reducer over the current input line
 * plus a parser that turns xterm `onData` strings into editor actions.
 */

export interface LineState {
  buffer: string;
  /** Cursor position in characters, 0..buffer.length. */
  cursor: number;
  /** Index into history while browsing with Up/Down; null when editing a fresh line. */
  historyIndex: number | null;
  /** The line being typed before browsing history started. */
  draft: string;
}

export const EMPTY_LINE: LineState = { buffer: '', cursor: 0, historyIndex: null, draft: '' };

export type LineAction =
  | { type: 'insert'; text: string }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'wordLeft' }
  | { type: 'wordRight' }
  | { type: 'home' }
  | { type: 'end' }
  | { type: 'backspace' }
  | { type: 'delete' }
  | { type: 'deleteWordBack' }
  | { type: 'killToStart' }
  | { type: 'killToEnd' }
  | { type: 'historyUp'; history: string[] }
  | { type: 'historyDown'; history: string[] }
  | { type: 'set'; line: string }
  | { type: 'clear' };

function wordStartBefore(s: string, pos: number): number {
  let i = pos;
  while (i > 0 && s[i - 1] === ' ') i--;
  while (i > 0 && s[i - 1] !== ' ') i--;
  return i;
}

function wordEndAfter(s: string, pos: number): number {
  let i = pos;
  while (i < s.length && s[i] === ' ') i++;
  while (i < s.length && s[i] !== ' ') i++;
  return i;
}

export function lineReducer(state: LineState, action: LineAction): LineState {
  const { buffer, cursor } = state;
  switch (action.type) {
    case 'insert': {
      const text = action.text.replace(/[\r\n\t]/g, ' ');
      if (!text) return state;
      return { ...state, buffer: buffer.slice(0, cursor) + text + buffer.slice(cursor), cursor: cursor + text.length };
    }
    case 'left':
      return cursor > 0 ? { ...state, cursor: cursor - 1 } : state;
    case 'right':
      return cursor < buffer.length ? { ...state, cursor: cursor + 1 } : state;
    case 'wordLeft':
      return { ...state, cursor: wordStartBefore(buffer, cursor) };
    case 'wordRight':
      return { ...state, cursor: wordEndAfter(buffer, cursor) };
    case 'home':
      return { ...state, cursor: 0 };
    case 'end':
      return { ...state, cursor: buffer.length };
    case 'backspace':
      if (cursor === 0) return state;
      return { ...state, buffer: buffer.slice(0, cursor - 1) + buffer.slice(cursor), cursor: cursor - 1 };
    case 'delete':
      if (cursor >= buffer.length) return state;
      return { ...state, buffer: buffer.slice(0, cursor) + buffer.slice(cursor + 1) };
    case 'deleteWordBack': {
      const start = wordStartBefore(buffer, cursor);
      return { ...state, buffer: buffer.slice(0, start) + buffer.slice(cursor), cursor: start };
    }
    case 'killToStart':
      return { ...state, buffer: buffer.slice(cursor), cursor: 0 };
    case 'killToEnd':
      return { ...state, buffer: buffer.slice(0, cursor) };
    case 'historyUp': {
      const h = action.history;
      if (!h.length) return state;
      const idx = state.historyIndex === null ? h.length - 1 : Math.max(0, state.historyIndex - 1);
      const draft = state.historyIndex === null ? buffer : state.draft;
      const line = h[idx];
      return { buffer: line, cursor: line.length, historyIndex: idx, draft };
    }
    case 'historyDown': {
      const h = action.history;
      if (state.historyIndex === null) return state;
      const idx = state.historyIndex + 1;
      if (idx >= h.length) return { buffer: state.draft, cursor: state.draft.length, historyIndex: null, draft: '' };
      const line = h[idx];
      return { ...state, buffer: line, cursor: line.length, historyIndex: idx };
    }
    case 'set':
      return { ...state, buffer: action.line, cursor: action.line.length };
    case 'clear':
      return EMPTY_LINE;
  }
}

/** Keys the terminal panel handles outside the reducer. */
export type TerminalKey =
  | { type: 'edit'; action: LineAction }
  | { type: 'up' }
  | { type: 'down' }
  | { type: 'enter' }
  | { type: 'tab' }
  | { type: 'interrupt' }
  | { type: 'clearScreen' };

const ESCAPES: Record<string, TerminalKey> = {
  '\x1b[A': { type: 'up' },
  '\x1bOA': { type: 'up' },
  '\x1b[B': { type: 'down' },
  '\x1bOB': { type: 'down' },
  '\x1b[C': { type: 'edit', action: { type: 'right' } },
  '\x1bOC': { type: 'edit', action: { type: 'right' } },
  '\x1b[D': { type: 'edit', action: { type: 'left' } },
  '\x1bOD': { type: 'edit', action: { type: 'left' } },
  '\x1b[H': { type: 'edit', action: { type: 'home' } },
  '\x1bOH': { type: 'edit', action: { type: 'home' } },
  '\x1b[1~': { type: 'edit', action: { type: 'home' } },
  '\x1b[7~': { type: 'edit', action: { type: 'home' } },
  '\x1b[F': { type: 'edit', action: { type: 'end' } },
  '\x1bOF': { type: 'edit', action: { type: 'end' } },
  '\x1b[4~': { type: 'edit', action: { type: 'end' } },
  '\x1b[8~': { type: 'edit', action: { type: 'end' } },
  '\x1b[3~': { type: 'edit', action: { type: 'delete' } },
  '\x1b[1;5D': { type: 'edit', action: { type: 'wordLeft' } },
  '\x1b[1;5C': { type: 'edit', action: { type: 'wordRight' } },
  '\x1bb': { type: 'edit', action: { type: 'wordLeft' } },
  '\x1bf': { type: 'edit', action: { type: 'wordRight' } },
};

const CONTROLS: Record<string, TerminalKey> = {
  '\r': { type: 'enter' },
  '\n': { type: 'enter' },
  '\t': { type: 'tab' },
  '\x7f': { type: 'edit', action: { type: 'backspace' } },
  '\b': { type: 'edit', action: { type: 'backspace' } },
  '\x03': { type: 'interrupt' },
  '\x0c': { type: 'clearScreen' },
  '\x01': { type: 'edit', action: { type: 'home' } },
  '\x05': { type: 'edit', action: { type: 'end' } },
  '\x02': { type: 'edit', action: { type: 'left' } },
  '\x06': { type: 'edit', action: { type: 'right' } },
  '\x15': { type: 'edit', action: { type: 'killToStart' } },
  '\x0b': { type: 'edit', action: { type: 'killToEnd' } },
  '\x17': { type: 'edit', action: { type: 'deleteWordBack' } },
  '\x04': { type: 'edit', action: { type: 'delete' } },
  '\x10': { type: 'up' },
  '\x0e': { type: 'down' },
};

/** Length of an unknown escape sequence starting at `i` (CSI "ESC [ params final", SS3 "ESC O x", or "ESC x"). */
function unknownEscapeLength(data: string, i: number): number {
  const next = data[i + 1];
  if (next === undefined) return 1;
  if (next === 'O') return Math.min(3, data.length - i);
  if (next !== '[') return 2;
  let j = i + 2;
  while (j < data.length) {
    const c = data.charCodeAt(j);
    j++;
    if (c >= 0x40 && c <= 0x7e) break;
  }
  return j - i;
}

/** Parse one xterm `onData` string (a key press or a paste) into keys, in order. */
export function parseTerminalInput(data: string): TerminalKey[] {
  const out: TerminalKey[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'edit', action: { type: 'insert', text } });
    text = '';
  };
  let i = 0;
  while (i < data.length) {
    const ch = data[i];
    if (ch === '\x1b') {
      flush();
      let matched = false;
      for (const len of [6, 4, 3, 2]) {
        const seq = data.slice(i, i + len);
        if (ESCAPES[seq]) {
          out.push(ESCAPES[seq]);
          i += len;
          matched = true;
          break;
        }
      }
      if (!matched) i += unknownEscapeLength(data, i);
      continue;
    }
    if (ch === '\r' && data[i + 1] === '\n') {
      flush();
      out.push({ type: 'enter' });
      i += 2;
      continue;
    }
    if (CONTROLS[ch]) {
      flush();
      out.push(CONTROLS[ch]);
      i++;
      continue;
    }
    const code = ch.charCodeAt(0);
    if (code < 0x20) {
      i++;
      continue;
    }
    text += ch;
    i++;
  }
  flush();
  return out;
}

/** Longest common prefix of strings ("" for none). */
export function commonPrefix(xs: string[]): string {
  if (!xs.length) return '';
  let p = xs[0];
  for (const x of xs.slice(1)) {
    let i = 0;
    while (i < p.length && i < x.length && p[i] === x[i]) i++;
    p = p.slice(0, i);
  }
  return p;
}
