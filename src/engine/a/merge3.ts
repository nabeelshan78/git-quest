/**
 * Three-way line merge producing git-identical conflict files — a port of
 * xdiff/xmerge.c at the level git's merge machinery uses (XDL_MERGE_ZEALOUS,
 * "merge" conflict style, 7-character markers).
 *
 *   <<<<<<< HEAD
 *   our lines
 *   =======
 *   their lines
 *   >>>>>>> feature
 */
import type { Change } from './xdiff';
import { diffRecords, splitRecords } from './xdiff';

export interface Merge3Options {
  /** Label after "<<<<<<<", e.g. "HEAD". */
  ours: string;
  /** Label after ">>>>>>>", e.g. "feature". */
  theirs: string;
  /** Label for the base in diff3 style (unused in the default style). */
  base?: string;
  /** -X ours / -X theirs / union: resolve conflicting hunks automatically. */
  favor?: 'ours' | 'theirs' | 'union';
  /** Conflict style; "diff3" also prints the base section. */
  style?: 'merge' | 'diff3';
  /** Merge level; git merges use "zealous", `git merge-file` uses "zealous_alnum". */
  level?: 'zealous' | 'zealous_alnum';
  markerSize?: number;
}

export interface Merge3Result {
  text: string;
  /** Number of conflict hunks left (0 = clean). */
  conflicts: number;
}

interface XMerge {
  mode: number; // 0 conflict, 1 ours, 2 theirs, 3 both, 4 identical change
  i0: number;
  chg0: number;
  i1: number;
  chg1: number;
  i2: number;
  chg2: number;
}

function appendMerge(list: XMerge[], mode: number, i0: number, chg0: number, i1: number, chg1: number, i2: number, chg2: number): void {
  const m = list[list.length - 1];
  if (m && (i1 <= m.i1 + m.chg1 || i2 <= m.i2 + m.chg2)) {
    if (mode !== m.mode) m.mode = 0;
    m.chg0 = i0 + chg0 - m.i0;
    m.chg1 = i1 + chg1 - m.i1;
    m.chg2 = i2 + chg2 - m.i2;
  } else list.push({ mode, i0, chg0, i1, chg1, i2, chg2 });
}

function cmpLines(r1: string[], i1: number, r2: string[], i2: number, count: number): boolean {
  for (let i = 0; i < count; i++) if (r1[i1 + i] !== r2[i2 + i]) return false;
  return true;
}

function lineHasAlnum(s: string): boolean {
  return /[A-Za-z0-9]/.test(s);
}

/** Merge three texts. */
export function merge3(base: string, ours: string, theirs: string, opts: Merge3Options): Merge3Result {
  const r0 = splitRecords(base);
  const r1 = splitRecords(ours);
  const r2 = splitRecords(theirs);
  const d1 = diffRecords(r0, r1, { indentHeuristic: false });
  const d2 = diffRecords(r0, r2, { indentHeuristic: false });
  if (!d1.changes.length) return { text: theirs, conflicts: 0 };
  if (!d2.changes.length) return { text: ours, conflicts: 0 };
  return doMerge(r0, r1, r2, d1.changes, d2.changes, opts);
}

function doMerge(r0: string[], r1: string[], r2: string[], s1: Change[], s2: Change[], opts: Merge3Options): Merge3Result {
  const changes: XMerge[] = [];
  let a = 0;
  let b = 0;
  const style = opts.style ?? 'merge';
  while (a < s1.length && b < s2.length) {
    const x1 = s1[a];
    const x2 = s2[b];
    if (x1.i1 + x1.chg1 < x2.i1) {
      appendMerge(changes, 1, x1.i1, x1.chg1, x1.i2, x1.chg2, x2.i2 - x2.i1 + x1.i1, x1.chg1);
      a++;
      continue;
    }
    if (x2.i1 + x2.chg1 < x1.i1) {
      appendMerge(changes, 2, x2.i1, x2.chg1, x1.i2 - x1.i1 + x2.i1, x2.chg1, x2.i2, x2.chg2);
      b++;
      continue;
    }
    if (x1.i1 !== x2.i1 || x1.chg1 !== x2.chg1 || x1.chg2 !== x2.chg2 || !cmpLines(r1, x1.i2, r2, x2.i2, x1.chg2)) {
      const off = x1.i1 - x2.i1;
      const ffo = off + x1.chg1 - x2.chg1;
      let i0 = x1.i1;
      let i1 = x1.i2;
      let i2 = x2.i2;
      if (off > 0) {
        i0 -= off;
        i1 -= off;
      } else i2 += off;
      let chg0 = x1.i1 + x1.chg1 - i0;
      let chg1 = x1.i2 + x1.chg2 - i1;
      let chg2 = x2.i2 + x2.chg2 - i2;
      if (ffo < 0) {
        chg0 -= ffo;
        chg1 -= ffo;
      } else chg2 += ffo;
      appendMerge(changes, 0, i0, chg0, i1, chg1, i2, chg2);
    }
    const e1 = x1.i1 + x1.chg1;
    const e2 = x2.i1 + x2.chg1;
    if (e1 >= e2) b++;
    if (e2 >= e1) a++;
  }
  for (; a < s1.length; a++) {
    const x1 = s1[a];
    appendMerge(changes, 1, x1.i1, x1.chg1, x1.i2, x1.chg2, x1.i1 + r2.length - r0.length, x1.chg1);
  }
  for (; b < s2.length; b++) {
    const x2 = s2[b];
    appendMerge(changes, 2, x2.i1, x2.chg1, x2.i1 + r1.length - r0.length, x2.chg1, x2.i2, x2.chg2);
  }

  let list = changes;
  if (style !== 'diff3') {
    list = refineConflicts(r1, r2, list);
    simplifyNonConflicts(r1, list, opts.level === 'zealous_alnum');
  }
  return fillBuffer(r0, r1, r2, list, opts);
}

/** Split conflicts where both sides share lines (xdl_refine_conflicts). */
function refineConflicts(r1: string[], r2: string[], list: XMerge[]): XMerge[] {
  const out: XMerge[] = [];
  for (const m of list) {
    if (m.mode || m.chg1 === 0 || m.chg2 === 0) {
      out.push(m);
      continue;
    }
    const t1 = r1.slice(m.i1, m.i1 + m.chg1);
    const t2 = r2.slice(m.i2, m.i2 + m.chg2);
    // xdiff diffs the raw text of the two regions.
    const d = diffRecords(splitRecords(t1.join('')), splitRecords(t2.join('')), { indentHeuristic: false });
    if (!d.changes.length) {
      out.push({ ...m, mode: 4 });
      continue;
    }
    const i1 = m.i1;
    const i2 = m.i2;
    d.changes.forEach((x, idx) => {
      if (idx === 0) out.push({ ...m, i1: x.i1 + i1, chg1: x.chg1, i2: x.i2 + i2, chg2: x.chg2 });
      else out.push({ mode: 0, i0: m.i0, chg0: m.chg0, i1: x.i1 + i1, chg1: x.chg1, i2: x.i2 + i2, chg2: x.chg2 });
    });
  }
  return out;
}

/** Merge conflicts separated by 3 or fewer lines (xdl_simplify_non_conflicts). */
function simplifyNonConflicts(r1: string[], list: XMerge[], ifNoAlnum: boolean): void {
  let k = 0;
  while (k + 1 < list.length) {
    const m = list[k];
    const next = list[k + 1];
    const begin = m.i1 + m.chg1;
    const end = next.i1;
    const between = r1.slice(begin, end);
    if (m.mode !== 0 || next.mode !== 0 || (end - begin > 3 && (!ifNoAlnum || between.some(lineHasAlnum)))) {
      k++;
    } else {
      m.chg1 = next.i1 + next.chg1 - m.i1;
      m.chg2 = next.i2 + next.chg2 - m.i2;
      list.splice(k + 1, 1);
    }
  }
}

function copyRecs(recs: string[], i: number, count: number, addNl: boolean): string {
  if (count < 1) return '';
  let s = recs.slice(i, i + count).join('');
  if (addNl && !s.endsWith('\n')) s += '\n';
  return s;
}

function fillBuffer(r0: string[], r1: string[], r2: string[], list: XMerge[], opts: Merge3Options): Merge3Result {
  const size = opts.markerSize ?? 7;
  const favor = opts.favor === 'ours' ? 1 : opts.favor === 'theirs' ? 2 : opts.favor === 'union' ? 3 : 0;
  let out = '';
  let i = 0;
  let conflicts = 0;
  for (const m of list) {
    if (favor && !m.mode) m.mode = favor;
    if (m.mode === 0) {
      conflicts++;
      out += copyRecs(r1, i, m.i1 - i, false);
      out += `${'<'.repeat(size)}${opts.ours ? ` ${opts.ours}` : ''}\n`;
      out += copyRecs(r1, m.i1, m.chg1, true);
      if (opts.style === 'diff3') {
        out += `${'|'.repeat(size)}${opts.base ? ` ${opts.base}` : ''}\n`;
        out += copyRecs(r0, m.i0, m.chg0, true);
      }
      out += `${'='.repeat(size)}\n`;
      out += copyRecs(r2, m.i2, m.chg2, true);
      out += `${'>'.repeat(size)}${opts.theirs ? ` ${opts.theirs}` : ''}\n`;
    } else if (m.mode & 3) {
      out += copyRecs(r1, i, m.i1 - i, false);
      if (m.mode & 1) out += copyRecs(r1, m.i1, m.chg1, (m.mode & 2) !== 0);
      if (m.mode & 2) out += copyRecs(r2, m.i2, m.chg2, false);
    } else continue;
    i = m.i1 + m.chg1;
  }
  out += copyRecs(r1, i, r1.length - i, false);
  return { text: out, conflicts };
}
