/**
 * Line diff: a faithful port of git's xdiff (xprepare.c, xdiffi.c) so hunks
 * come out exactly as `git diff` prints them — Myers' divide-and-conquer
 * middle snake, xdiff's discarding of unmatched lines, change-group
 * compaction and the indent heuristic (git's default since 2.14).
 *
 * Records are lines *including* their "\n" (a last line without newline is
 * a different record), exactly like xdiff.
 */

/** One change group, like xdiff's xdchange_t: lines [i1, i1+chg1) of A replaced by [i2, i2+chg2) of B. */
export interface Change {
  i1: number;
  i2: number;
  chg1: number;
  chg2: number;
}

export interface XdiffOptions {
  /** git diff uses the indent heuristic by default; merges do not. */
  indentHeuristic?: boolean;
}

/** Split text into xdiff records (each line keeps its "\n"). */
export function splitRecords(text: string): string[] {
  if (text === '') return [];
  const out: string[] = [];
  let start = 0;
  for (;;) {
    const nl = text.indexOf('\n', start);
    if (nl < 0) {
      if (start < text.length) out.push(text.slice(start));
      break;
    }
    out.push(text.slice(start, nl + 1));
    start = nl + 1;
    if (start >= text.length) break;
  }
  return out;
}

const XDL_MAX_EQLIMIT = 1024;
const XDL_SIMSCAN_WINDOW = 100;
const XDL_KPDIS_RUN = 4;
const XDL_MAX_COST_MIN = 256;
const XDL_HEUR_MIN_COST = 256;
const XDL_SNAKE_CNT = 20;
const XDL_K_HEUR = 4;
const XDL_LINE_MAX = 0x7fffffff;

function bogosqrt(n: number): number {
  let i = 1;
  while (n > 0) {
    i <<= 1;
    n >>= 2;
  }
  return i;
}

/** A file prepared for diffing (xdfile_t). */
export interface XdFile {
  recs: string[];
  /** Class id of each record (equal content <=> equal id). */
  ids: Int32Array;
  nrec: number;
  /** rchg[i + 1] is the "changed" flag of record i; rchg[0] and rchg[nrec + 1] are sentinels. */
  rchg: Uint8Array;
  dstart: number;
  dend: number;
  /** Records kept for the core algorithm (indices into recs) and their ids. */
  rindex: Int32Array;
  ha: Int32Array;
  nreff: number;
}

interface Env {
  xdf1: XdFile;
  xdf2: XdFile;
}

function prepareFile(recs: string[], classes: Map<string, number>): XdFile {
  const nrec = recs.length;
  const ids = new Int32Array(nrec);
  for (let i = 0; i < nrec; i++) {
    let id = classes.get(recs[i]);
    if (id === undefined) {
      id = classes.size;
      classes.set(recs[i], id);
    }
    ids[i] = id;
  }
  return { recs, ids, nrec, rchg: new Uint8Array(nrec + 2), dstart: 0, dend: nrec - 1, rindex: new Int32Array(nrec), ha: new Int32Array(nrec), nreff: 0 };
}

function cleanMmatch(dis: Uint8Array, i: number, s: number, e: number): boolean {
  if (i - s > XDL_SIMSCAN_WINDOW) s = i - XDL_SIMSCAN_WINDOW;
  if (e - i > XDL_SIMSCAN_WINDOW) e = i + XDL_SIMSCAN_WINDOW;
  let r: number;
  let rdis0 = 0;
  let rpdis0 = 1;
  for (r = 1; i - r >= s; r++) {
    if (!dis[i - r]) rdis0++;
    else if (dis[i - r] === 2) rpdis0++;
    else break;
  }
  if (rdis0 === 0) return false;
  let rdis1 = 0;
  let rpdis1 = 1;
  for (r = 1; i + r <= e; r++) {
    if (!dis[i + r]) rdis1++;
    else if (dis[i + r] === 2) rpdis1++;
    else break;
  }
  if (rdis1 === 0) return false;
  rdis1 += rdis0;
  rpdis1 += rpdis0;
  return rpdis1 * XDL_KPDIS_RUN < rpdis1 + rdis1;
}

function prepareEnv(a: string[], b: string[]): Env {
  const classes = new Map<string, number>();
  const xdf1 = prepareFile(a, classes);
  const xdf2 = prepareFile(b, classes);
  // Occurrence counts per class in each file (xdlclass_t len1/len2).
  const len1 = new Int32Array(classes.size);
  const len2 = new Int32Array(classes.size);
  for (let i = 0; i < xdf1.nrec; i++) len1[xdf1.ids[i]]++;
  for (let i = 0; i < xdf2.nrec; i++) len2[xdf2.ids[i]]++;

  // xdl_trim_ends
  let i = 0;
  const lim = Math.min(xdf1.nrec, xdf2.nrec);
  for (; i < lim; i++) if (xdf1.ids[i] !== xdf2.ids[i]) break;
  xdf1.dstart = xdf2.dstart = i;
  let j = 0;
  const lim2 = lim - i;
  for (; j < lim2; j++) if (xdf1.ids[xdf1.nrec - 1 - j] !== xdf2.ids[xdf2.nrec - 1 - j]) break;
  xdf1.dend = xdf1.nrec - j - 1;
  xdf2.dend = xdf2.nrec - j - 1;

  // xdl_cleanup_records
  const dis1 = new Uint8Array(xdf1.nrec + 1);
  const dis2 = new Uint8Array(xdf2.nrec + 1);
  let mlim = Math.min(bogosqrt(xdf1.nrec), XDL_MAX_EQLIMIT);
  for (let k = xdf1.dstart; k <= xdf1.dend; k++) {
    const nm = len2[xdf1.ids[k]];
    dis1[k] = nm === 0 ? 0 : nm >= mlim ? 2 : 1;
  }
  mlim = Math.min(bogosqrt(xdf2.nrec), XDL_MAX_EQLIMIT);
  for (let k = xdf2.dstart; k <= xdf2.dend; k++) {
    const nm = len1[xdf2.ids[k]];
    dis2[k] = nm === 0 ? 0 : nm >= mlim ? 2 : 1;
  }
  let nreff = 0;
  for (let k = xdf1.dstart; k <= xdf1.dend; k++) {
    if (dis1[k] === 1 || (dis1[k] === 2 && !cleanMmatch(dis1, k, xdf1.dstart, xdf1.dend))) {
      xdf1.rindex[nreff] = k;
      xdf1.ha[nreff] = xdf1.ids[k];
      nreff++;
    } else xdf1.rchg[k + 1] = 1;
  }
  xdf1.nreff = nreff;
  nreff = 0;
  for (let k = xdf2.dstart; k <= xdf2.dend; k++) {
    if (dis2[k] === 1 || (dis2[k] === 2 && !cleanMmatch(dis2, k, xdf2.dstart, xdf2.dend))) {
      xdf2.rindex[nreff] = k;
      xdf2.ha[nreff] = xdf2.ids[k];
      nreff++;
    } else xdf2.rchg[k + 1] = 1;
  }
  xdf2.nreff = nreff;
  return { xdf1, xdf2 };
}

interface Split {
  i1: number;
  i2: number;
  minLo: boolean;
  minHi: boolean;
}

interface AlgoEnv {
  mxcost: number;
  snakeCnt: number;
  heurMin: number;
}

/** Array with negative-index support for the K vectors. */
class KVec {
  private readonly a: Int32Array;
  constructor(
    size: number,
    private readonly off: number,
  ) {
    this.a = new Int32Array(size);
  }
  get(i: number): number {
    return this.a[i + this.off];
  }
  set(i: number, v: number): void {
    this.a[i + this.off] = v;
  }
}

function xdlSplit(ha1: Int32Array, off1: number, lim1: number, ha2: Int32Array, off2: number, lim2: number, kvdf: KVec, kvdb: KVec, needMin: boolean, spl: Split, xenv: AlgoEnv): void {
  const dmin = off1 - lim2;
  const dmax = lim1 - off2;
  const fmid = off1 - off2;
  const bmid = lim1 - lim2;
  const odd = ((fmid - bmid) & 1) !== 0;
  let fmin = fmid;
  let fmax = fmid;
  let bmin = bmid;
  let bmax = bmid;
  kvdf.set(fmid, off1);
  kvdb.set(bmid, lim1);
  for (let ec = 1; ; ec++) {
    let gotSnake = false;
    if (fmin > dmin) kvdf.set(--fmin - 1, -1);
    else ++fmin;
    if (fmax < dmax) kvdf.set(++fmax + 1, -1);
    else --fmax;
    for (let d = fmax; d >= fmin; d -= 2) {
      let i1: number;
      if (kvdf.get(d - 1) >= kvdf.get(d + 1)) i1 = kvdf.get(d - 1) + 1;
      else i1 = kvdf.get(d + 1);
      const prev1 = i1;
      let i2 = i1 - d;
      for (; i1 < lim1 && i2 < lim2 && ha1[i1] === ha2[i2]; i1++, i2++);
      if (i1 - prev1 > xenv.snakeCnt) gotSnake = true;
      kvdf.set(d, i1);
      if (odd && bmin <= d && d <= bmax && kvdb.get(d) <= i1) {
        spl.i1 = i1;
        spl.i2 = i2;
        spl.minLo = spl.minHi = true;
        return;
      }
    }
    if (bmin > dmin) kvdb.set(--bmin - 1, XDL_LINE_MAX);
    else ++bmin;
    if (bmax < dmax) kvdb.set(++bmax + 1, XDL_LINE_MAX);
    else --bmax;
    for (let d = bmax; d >= bmin; d -= 2) {
      let i1: number;
      if (kvdb.get(d - 1) < kvdb.get(d + 1)) i1 = kvdb.get(d - 1);
      else i1 = kvdb.get(d + 1) - 1;
      const prev1 = i1;
      let i2 = i1 - d;
      for (; i1 > off1 && i2 > off2 && ha1[i1 - 1] === ha2[i2 - 1]; i1--, i2--);
      if (prev1 - i1 > xenv.snakeCnt) gotSnake = true;
      kvdb.set(d, i1);
      if (!odd && fmin <= d && d <= fmax && i1 <= kvdf.get(d)) {
        spl.i1 = i1;
        spl.i2 = i2;
        spl.minLo = spl.minHi = true;
        return;
      }
    }
    if (needMin) continue;
    if (gotSnake && ec > xenv.heurMin) {
      let best = 0;
      for (let d = fmax; d >= fmin; d -= 2) {
        const dd = d > fmid ? d - fmid : fmid - d;
        const i1 = kvdf.get(d);
        const i2 = i1 - d;
        const v = i1 - off1 + (i2 - off2) - dd;
        if (v > XDL_K_HEUR * ec && v > best && off1 + xenv.snakeCnt <= i1 && i1 < lim1 && off2 + xenv.snakeCnt <= i2 && i2 < lim2) {
          for (let k = 1; ha1[i1 - k] === ha2[i2 - k]; k++)
            if (k === xenv.snakeCnt) {
              best = v;
              spl.i1 = i1;
              spl.i2 = i2;
              break;
            }
        }
      }
      if (best > 0) {
        spl.minLo = true;
        spl.minHi = false;
        return;
      }
      best = 0;
      for (let d = bmax; d >= bmin; d -= 2) {
        const dd = d > bmid ? d - bmid : bmid - d;
        const i1 = kvdb.get(d);
        const i2 = i1 - d;
        const v = lim1 - i1 + (lim2 - i2) - dd;
        if (v > XDL_K_HEUR * ec && v > best && off1 < i1 && i1 <= lim1 - xenv.snakeCnt && off2 < i2 && i2 <= lim2 - xenv.snakeCnt) {
          for (let k = 0; ha1[i1 + k] === ha2[i2 + k]; k++)
            if (k === xenv.snakeCnt - 1) {
              best = v;
              spl.i1 = i1;
              spl.i2 = i2;
              break;
            }
        }
      }
      if (best > 0) {
        spl.minLo = false;
        spl.minHi = true;
        return;
      }
    }
    if (ec >= xenv.mxcost) {
      let fbest = -1;
      let fbest1 = -1;
      for (let d = fmax; d >= fmin; d -= 2) {
        let i1 = Math.min(kvdf.get(d), lim1);
        let i2 = i1 - d;
        if (lim2 < i2) {
          i1 = lim2 + d;
          i2 = lim2;
        }
        if (fbest < i1 + i2) {
          fbest = i1 + i2;
          fbest1 = i1;
        }
      }
      let bbest = XDL_LINE_MAX;
      let bbest1 = XDL_LINE_MAX;
      for (let d = bmax; d >= bmin; d -= 2) {
        let i1 = Math.max(off1, kvdb.get(d));
        let i2 = i1 - d;
        if (i2 < off2) {
          i1 = off2 + d;
          i2 = off2;
        }
        if (i1 + i2 < bbest) {
          bbest = i1 + i2;
          bbest1 = i1;
        }
      }
      if (lim1 + lim2 - bbest < fbest - (off1 + off2)) {
        spl.i1 = fbest1;
        spl.i2 = fbest - fbest1;
        spl.minLo = true;
        spl.minHi = false;
      } else {
        spl.i1 = bbest1;
        spl.i2 = bbest - bbest1;
        spl.minLo = false;
        spl.minHi = true;
      }
      return;
    }
  }
}

function recsCmp(env: Env, off1: number, lim1: number, off2: number, lim2: number, kvdf: KVec, kvdb: KVec, needMin: boolean, xenv: AlgoEnv): void {
  const { xdf1, xdf2 } = env;
  const ha1 = xdf1.ha;
  const ha2 = xdf2.ha;
  // Iterative over the right half to keep recursion shallow for long runs.
  for (;;) {
    for (; off1 < lim1 && off2 < lim2 && ha1[off1] === ha2[off2]; off1++, off2++);
    for (; off1 < lim1 && off2 < lim2 && ha1[lim1 - 1] === ha2[lim2 - 1]; lim1--, lim2--);
    if (off1 === lim1) {
      for (; off2 < lim2; off2++) xdf2.rchg[xdf2.rindex[off2] + 1] = 1;
      return;
    }
    if (off2 === lim2) {
      for (; off1 < lim1; off1++) xdf1.rchg[xdf1.rindex[off1] + 1] = 1;
      return;
    }
    const spl: Split = { i1: 0, i2: 0, minLo: false, minHi: false };
    xdlSplit(ha1, off1, lim1, ha2, off2, lim2, kvdf, kvdb, needMin, spl, xenv);
    recsCmp(env, off1, spl.i1, off2, spl.i2, kvdf, kvdb, spl.minLo, xenv);
    off1 = spl.i1;
    off2 = spl.i2;
    needMin = spl.minHi;
  }
}

function doDiff(a: string[], b: string[]): Env {
  const env = prepareEnv(a, b);
  const n1 = env.xdf1.nreff;
  const n2 = env.xdf2.nreff;
  const ndiags = n1 + n2 + 3;
  const kvdf = new KVec(ndiags + 2, n2 + 1);
  const kvdb = new KVec(ndiags + 2, n2 + 1);
  let mxcost = bogosqrt(ndiags);
  if (mxcost < XDL_MAX_COST_MIN) mxcost = XDL_MAX_COST_MIN;
  recsCmp(env, 0, n1, 0, n2, kvdf, kvdb, false, { mxcost, snakeCnt: XDL_SNAKE_CNT, heurMin: XDL_HEUR_MIN_COST });
  return env;
}

// ---------------------------------------------------------------------------
// Change compaction (xdl_change_compact) with the indent heuristic
// ---------------------------------------------------------------------------

interface Group {
  start: number;
  end: number;
}

const rc = (x: XdFile, i: number): number => x.rchg[i + 1];
const setRc = (x: XdFile, i: number, v: number): void => void (x.rchg[i + 1] = v);

function groupInit(x: XdFile, g: Group): void {
  g.start = g.end = 0;
  while (rc(x, g.end)) g.end++;
}

function groupNext(x: XdFile, g: Group): boolean {
  if (g.end === x.nrec) return false;
  g.start = g.end + 1;
  for (g.end = g.start; rc(x, g.end); g.end++);
  return true;
}

function groupPrevious(x: XdFile, g: Group): boolean {
  if (g.start === 0) return false;
  g.end = g.start - 1;
  for (g.start = g.end; rc(x, g.start - 1); g.start--);
  return true;
}

function groupSlideDown(x: XdFile, g: Group): boolean {
  if (g.end < x.nrec && x.ids[g.start] === x.ids[g.end]) {
    setRc(x, g.start++, 0);
    setRc(x, g.end++, 1);
    while (rc(x, g.end)) g.end++;
    return true;
  }
  return false;
}

function groupSlideUp(x: XdFile, g: Group): boolean {
  if (g.start > 0 && x.ids[g.start - 1] === x.ids[g.end - 1]) {
    setRc(x, --g.start, 1);
    setRc(x, --g.end, 0);
    while (rc(x, g.start - 1)) g.start--;
    return true;
  }
  return false;
}

const MAX_INDENT = 200;
const MAX_BLANKS = 20;
const START_OF_FILE_PENALTY = 1;
const END_OF_FILE_PENALTY = 21;
const TOTAL_BLANK_WEIGHT = -30;
const POST_BLANK_WEIGHT = 6;
const RELATIVE_INDENT_PENALTY = -4;
const RELATIVE_INDENT_WITH_BLANK_PENALTY = 10;
const RELATIVE_OUTDENT_PENALTY = 24;
const RELATIVE_OUTDENT_WITH_BLANK_PENALTY = 17;
const RELATIVE_DEDENT_PENALTY = 23;
const RELATIVE_DEDENT_WITH_BLANK_PENALTY = 17;
const INDENT_WEIGHT = 60;
const INDENT_HEURISTIC_MAX_SLIDING = 100;

function isSpace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\v' || c === '\f';
}

function getIndent(rec: string): number {
  let ret = 0;
  for (let i = 0; i < rec.length; i++) {
    const c = rec[i];
    if (!isSpace(c)) return ret;
    if (c === ' ') ret += 1;
    else if (c === '\t') ret += 8 - (ret % 8);
    if (ret >= MAX_INDENT) return MAX_INDENT;
  }
  return -1;
}

interface SplitMeasurement {
  endOfFile: boolean;
  indent: number;
  preBlank: number;
  preIndent: number;
  postBlank: number;
  postIndent: number;
}

function measureSplit(x: XdFile, split: number, indents: Int32Array): SplitMeasurement {
  const m: SplitMeasurement = { endOfFile: false, indent: -1, preBlank: 0, preIndent: -1, postBlank: 0, postIndent: -1 };
  if (split >= x.nrec) {
    m.endOfFile = true;
    m.indent = -1;
  } else {
    m.indent = indents[split];
  }
  for (let i = split - 1; i >= 0; i--) {
    m.preIndent = indents[i];
    if (m.preIndent !== -1) break;
    m.preBlank += 1;
    if (m.preBlank === MAX_BLANKS) {
      m.preIndent = 0;
      break;
    }
  }
  for (let i = split + 1; i < x.nrec; i++) {
    m.postIndent = indents[i];
    if (m.postIndent !== -1) break;
    m.postBlank += 1;
    if (m.postBlank === MAX_BLANKS) {
      m.postIndent = 0;
      break;
    }
  }
  return m;
}

interface SplitScore {
  effectiveIndent: number;
  penalty: number;
}

function scoreAddSplit(m: SplitMeasurement, s: SplitScore): void {
  if (m.preIndent === -1 && m.preBlank === 0) s.penalty += START_OF_FILE_PENALTY;
  if (m.endOfFile) s.penalty += END_OF_FILE_PENALTY;
  const postBlank = m.indent === -1 ? 1 + m.postBlank : 0;
  const totalBlank = m.preBlank + postBlank;
  s.penalty += TOTAL_BLANK_WEIGHT * totalBlank;
  s.penalty += POST_BLANK_WEIGHT * postBlank;
  const indent = m.indent !== -1 ? m.indent : m.postIndent;
  const anyBlanks = totalBlank !== 0;
  s.effectiveIndent += indent;
  if (indent === -1) {
    /* no adjustment */
  } else if (m.preIndent === -1) {
    /* no adjustment */
  } else if (indent > m.preIndent) {
    s.penalty += anyBlanks ? RELATIVE_INDENT_WITH_BLANK_PENALTY : RELATIVE_INDENT_PENALTY;
  } else if (indent === m.preIndent) {
    /* no adjustment */
  } else if (m.postIndent !== -1 && m.postIndent > indent) {
    s.penalty += anyBlanks ? RELATIVE_OUTDENT_WITH_BLANK_PENALTY : RELATIVE_OUTDENT_PENALTY;
  } else {
    s.penalty += anyBlanks ? RELATIVE_DEDENT_WITH_BLANK_PENALTY : RELATIVE_DEDENT_PENALTY;
  }
}

function scoreCmp(s1: SplitScore, s2: SplitScore): number {
  const cmpIndents = (s1.effectiveIndent > s2.effectiveIndent ? 1 : 0) - (s1.effectiveIndent < s2.effectiveIndent ? 1 : 0);
  return INDENT_WEIGHT * cmpIndents + (s1.penalty - s2.penalty);
}

function changeCompact(x: XdFile, xo: XdFile, indentHeuristic: boolean): void {
  const g: Group = { start: 0, end: 0 };
  const go: Group = { start: 0, end: 0 };
  let indents: Int32Array | null = null;
  groupInit(x, g);
  groupInit(xo, go);
  for (;;) {
    if (g.end !== g.start) {
      let groupsize: number;
      let earliestEnd: number;
      let endMatchingOther: number;
      do {
        groupsize = g.end - g.start;
        endMatchingOther = -1;
        while (groupSlideUp(x, g)) if (!groupPrevious(xo, go)) throw new Error('group sync broken sliding up');
        earliestEnd = g.end;
        if (go.end > go.start) endMatchingOther = g.end;
        for (;;) {
          if (!groupSlideDown(x, g)) break;
          if (!groupNext(xo, go)) throw new Error('group sync broken sliding down');
          if (go.end > go.start) endMatchingOther = g.end;
        }
      } while (groupsize !== g.end - g.start);

      if (g.end === earliestEnd) {
        /* no shifting was possible */
      } else if (endMatchingOther !== -1) {
        while (go.end === go.start) {
          if (!groupSlideUp(x, g)) throw new Error('match disappeared');
          if (!groupPrevious(xo, go)) throw new Error('group sync broken sliding to match');
        }
      } else if (indentHeuristic) {
        if (!indents) {
          indents = new Int32Array(x.nrec);
          for (let i = 0; i < x.nrec; i++) indents[i] = getIndent(x.recs[i]);
        }
        let shift = earliestEnd;
        if (g.end - groupsize - 1 > shift) shift = g.end - groupsize - 1;
        if (g.end - INDENT_HEURISTIC_MAX_SLIDING > shift) shift = g.end - INDENT_HEURISTIC_MAX_SLIDING;
        let bestShift = -1;
        let bestScore: SplitScore = { effectiveIndent: 0, penalty: 0 };
        for (; shift <= g.end; shift++) {
          const score: SplitScore = { effectiveIndent: 0, penalty: 0 };
          scoreAddSplit(measureSplit(x, shift, indents), score);
          scoreAddSplit(measureSplit(x, shift - groupsize, indents), score);
          if (bestShift === -1 || scoreCmp(score, bestScore) <= 0) {
            bestScore = { ...score };
            bestShift = shift;
          }
        }
        while (g.end > bestShift) {
          if (!groupSlideUp(x, g)) throw new Error('best shift unreached');
          if (!groupPrevious(xo, go)) throw new Error('group sync broken sliding to blank line');
        }
      }
    }
    if (!groupNext(x, g)) break;
    if (!groupNext(xo, go)) throw new Error('group sync broken moving to next group');
  }
}

function buildScript(x1: XdFile, x2: XdFile): Change[] {
  const out: Change[] = [];
  let i1 = x1.nrec;
  let i2 = x2.nrec;
  const r1 = (i: number) => (i >= -1 && i <= x1.nrec ? x1.rchg[i + 1] : 0);
  const r2 = (i: number) => (i >= -1 && i <= x2.nrec ? x2.rchg[i + 1] : 0);
  for (; i1 >= 0 || i2 >= 0; i1--, i2--) {
    if (r1(i1 - 1) || r2(i2 - 1)) {
      const l1 = i1;
      for (; r1(i1 - 1); i1--);
      const l2 = i2;
      for (; r2(i2 - 1); i2--);
      out.push({ i1, i2, chg1: l1 - i1, chg2: l2 - i2 });
    }
  }
  return out.reverse();
}

export interface DiffResult {
  a: string[];
  b: string[];
  changes: Change[];
}

/** Diff two record arrays like xdl_diff (do_diff + compaction of both sides + build_script). */
export function diffRecords(a: string[], b: string[], opts: XdiffOptions = {}): DiffResult {
  const env = doDiff(a, b);
  const ih = opts.indentHeuristic ?? true;
  changeCompact(env.xdf1, env.xdf2, ih);
  changeCompact(env.xdf2, env.xdf1, ih);
  return { a, b, changes: buildScript(env.xdf1, env.xdf2) };
}

/** Diff two texts. */
export function diffTexts(a: string, b: string, opts: XdiffOptions = {}): DiffResult {
  return diffRecords(splitRecords(a), splitRecords(b), opts);
}

/** Count added and deleted lines (for --stat / numstat). */
export function countChanges(changes: Change[]): { added: number; deleted: number } {
  let added = 0;
  let deleted = 0;
  for (const c of changes) {
    added += c.chg2;
    deleted += c.chg1;
  }
  return { added, deleted };
}
