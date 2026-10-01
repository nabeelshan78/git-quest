/**
 * Finding git conflict markers in a file (pure), for editor highlighting.
 */

export type ConflictLineKind = 'start' | 'ours' | 'base-marker' | 'base' | 'separator' | 'theirs' | 'end';

export interface ConflictLine {
  /** 1-based line number. */
  line: number;
  kind: ConflictLineKind;
}

const START = /^<{7}(?: |$)/;
const BASE = /^\|{7}(?: |$)/;
const SEP = /^={7}$/;
const END = /^>{7}(?: |$)/;

/** Classify every line inside conflict blocks. Lines outside conflicts are not listed. */
export function conflictLines(text: string): ConflictLine[] {
  const out: ConflictLine[] = [];
  const lines = text.split('\n');
  let state: 'none' | 'ours' | 'base' | 'theirs' = 'none';
  lines.forEach((raw, i) => {
    const l = raw.replace(/\r$/, '');
    const line = i + 1;
    if (START.test(l)) {
      state = 'ours';
      out.push({ line, kind: 'start' });
    } else if (state !== 'none' && BASE.test(l)) {
      state = 'base';
      out.push({ line, kind: 'base-marker' });
    } else if (state !== 'none' && SEP.test(l)) {
      state = 'theirs';
      out.push({ line, kind: 'separator' });
    } else if (state !== 'none' && END.test(l)) {
      state = 'none';
      out.push({ line, kind: 'end' });
    } else if (state === 'ours') out.push({ line, kind: 'ours' });
    else if (state === 'base') out.push({ line, kind: 'base' });
    else if (state === 'theirs') out.push({ line, kind: 'theirs' });
  });
  return out;
}

/** Number of conflict blocks (pairs of <<<<<<< ... >>>>>>>). */
export function conflictCount(text: string): number {
  return conflictLines(text).filter((l) => l.kind === 'start').length;
}

/** Editor language for a file name. */
export type EditorLanguage = 'html' | 'css' | 'javascript' | 'typescript' | 'markdown' | 'json' | 'plain';

export function languageFor(path: string): EditorLanguage {
  const name = path.toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : '';
  switch (ext) {
    case 'html':
    case 'htm':
    case 'svg':
      return 'html';
    case 'css':
      return 'css';
    case 'js':
    case 'mjs':
    case 'cjs':
    case 'jsx':
      return 'javascript';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'md':
    case 'markdown':
      return 'markdown';
    case 'json':
      return 'json';
    default:
      return 'plain';
  }
}
