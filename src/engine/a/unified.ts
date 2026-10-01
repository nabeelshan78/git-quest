/**
 * Unified diff hunks exactly as git prints them (port of xdiff/xemit.c):
 * hunk grouping with `context` lines, "@@ -a,b +c,d @@ funcname" headers
 * using git's default function-name rule, and
 * "\ No newline at end of file" markers.
 */
import type { Change, DiffResult } from './xdiff';
import { diffTexts } from './xdiff';

export interface HunkOptions {
  /** Lines of context (git default 3). */
  context?: number;
  /** Extra lines allowed between hunks before they merge (--inter-hunk-context). */
  interHunk?: number;
}

/** git's default funcname rule (xemit.c def_ff): a line starting with a letter, "_" or "$". */
function funcLine(rec: string): string | null {
  if (!rec.length) return null;
  const c = rec[0];
  if (!(/[A-Za-z]/.test(c) || c === '_' || c === '$')) return null;
  let line = rec;
  // Records keep "\n"; the C code copies at most 80 bytes then trims trailing whitespace.
  const bytes = utf8Bytes(line);
  if (bytes.length > 80) line = decodeUtf8Prefix(line, 80);
  return line.replace(/[ \t\n\r\v\f]+$/, '');
}

function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0, 0x80);
    else if (c < 0x10000) out.push(0xe0, 0x80, 0x80);
    else out.push(0xf0, 0x80, 0x80, 0x80);
  }
  return out;
}

function decodeUtf8Prefix(s: string, maxBytes: number): string {
  let n = 0;
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const len = c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    if (n + len > maxBytes) break;
    n += len;
    out += ch;
  }
  return out;
}

/** Find the last change atom to include in the hunk that starts at index `from` (xdl_get_hunk). */
function getHunkEnd(changes: Change[], from: number, maxCommon: number): number {
  let last = from;
  for (let k = from + 1; k < changes.length; k++) {
    const prev = changes[k - 1];
    const distance = changes[k].i1 - (prev.i1 + prev.chg1);
    if (distance > maxCommon) break;
    last = k;
  }
  return last;
}

function recLine(prefix: string, rec: string, out: string[]): void {
  if (rec.endsWith('\n')) out.push(prefix + rec.slice(0, -1));
  else {
    out.push(prefix + rec);
    out.push('\\ No newline at end of file');
  }
}

function hunkHeader(s1: number, c1: number, s2: number, c2: number, func: string): string {
  let h = `@@ -${c1 ? s1 : s1 - 1}`;
  if (c1 !== 1) h += `,${c1}`;
  h += ` +${c2 ? s2 : s2 - 1}`;
  if (c2 !== 1) h += `,${c2}`;
  h += ' @@';
  if (func) h += ` ${func}`;
  return h;
}

/** Emit hunk lines (headers and body) for a diff result. Empty when the texts are equal. */
export function emitHunks(d: DiffResult, opts: HunkOptions = {}): string[] {
  const ctx = opts.context ?? 3;
  const maxCommon = 2 * ctx + (opts.interHunk ?? 0);
  const { a, b, changes } = d;
  const out: string[] = [];
  let funclinePrev = -1;
  let func = '';
  let k = 0;
  while (k < changes.length) {
    const first = changes[k];
    const lastIdx = getHunkEnd(changes, k, maxCommon);
    const last = changes[lastIdx];
    let s1 = Math.max(first.i1 - ctx, 0);
    let s2 = Math.max(first.i2 - ctx, 0);
    let lctx = ctx;
    lctx = Math.min(lctx, a.length - (last.i1 + last.chg1));
    lctx = Math.min(lctx, b.length - (last.i2 + last.chg2));
    const e1 = last.i1 + last.chg1 + lctx;
    const e2 = last.i2 + last.chg2 + lctx;
    // Function line: search backwards in the old file from s1-1 down to the previous search start.
    for (let l = s1 - 1; l !== funclinePrev && l >= 0 && l < a.length; l--) {
      const f = funcLine(a[l]);
      if (f !== null) {
        func = f;
        break;
      }
    }
    funclinePrev = s1 - 1;
    out.push(hunkHeader(s1 + 1, e1 - s1, s2 + 1, e2 - s2, func));
    for (; s2 < first.i2; s2++) recLine(' ', b[s2], out);
    s1 = first.i1;
    s2 = first.i2;
    for (let j = k; ; j++) {
      const ch = changes[j];
      for (; s1 < ch.i1 && s2 < ch.i2; s1++, s2++) recLine(' ', b[s2], out);
      for (s1 = ch.i1; s1 < ch.i1 + ch.chg1; s1++) recLine('-', a[s1], out);
      for (s2 = ch.i2; s2 < ch.i2 + ch.chg2; s2++) recLine('+', b[s2], out);
      if (j === lastIdx) break;
      s1 = ch.i1 + ch.chg1;
      s2 = ch.i2 + ch.chg2;
    }
    for (s2 = last.i2 + last.chg2; s2 < e2; s2++) recLine(' ', b[s2], out);
    k = lastIdx + 1;
  }
  return out;
}

/** Convenience: unified hunks between two texts. */
export function unifiedHunks(a: string, b: string, opts: HunkOptions = {}): string[] {
  return emitHunks(diffTexts(a, b), opts);
}
