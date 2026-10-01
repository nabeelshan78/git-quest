/**
 * Pathspecs (git's pathspec.c + match_pathspec_item in dir.c).
 *
 * A pathspec is relative to the cwd inside the repository. "." matches
 * everything below the cwd, "dir" matches "dir/..." recursively, and
 * wildcards match across "/" (`git add '*.txt'` matches "css/a.txt").
 * Magic: ":/" or ":(top)" (from the root), ":!x" / ":^x" / ":(exclude)x",
 * ":(glob)", ":(literal)", ":(icase)".
 */
import { normalize } from '../core/paths';
import { simpleLength, wildmatch } from './wildmatch';

export interface PathspecItem {
  /** As typed. */
  original: string;
  /** Normalised repo-relative match string ("" = everything). */
  match: string;
  nowildcardLen: number;
  exclude: boolean;
  icase: boolean;
  glob: boolean;
}

export interface Pathspec {
  items: PathspecItem[];
  /** True when no pathspec was given at all (matches everything). */
  empty: boolean;
}

export type MatchKind = 0 | 'exact' | 'recursive' | 'fnmatch';

export class PathspecError extends Error {}

/**
 * Parse pathspec arguments. `prefix` is the cwd relative to the root ("" or "dir/sub").
 * Throws PathspecError with git's fatal message (without "fatal: ") for paths outside the repo.
 */
export function parsePathspec(args: string[], prefix: string, root: string): Pathspec {
  const items: PathspecItem[] = [];
  for (const original of args) {
    let elt = original;
    let top = false;
    let exclude = false;
    let icase = false;
    let glob = false;
    let literal = false;
    if (elt.startsWith(':') && elt.length > 1) {
      if (elt[1] === '(') {
        const close = elt.indexOf(')');
        if (close > 0) {
          for (const m of elt.slice(2, close).split(',')) {
            if (m === 'top') top = true;
            else if (m === 'exclude') exclude = true;
            else if (m === 'icase') icase = true;
            else if (m === 'glob') glob = true;
            else if (m === 'literal') literal = true;
            else throw new PathspecError(`Invalid pathspec magic '${m}' in '${original}'`);
          }
          elt = elt.slice(close + 1);
        }
      } else {
        let i = 1;
        while (i < elt.length && ':/!^'.includes(elt[i])) {
          if (elt[i] === ':') {
            i++;
            break;
          }
          if (elt[i] === '/') top = true;
          else exclude = true;
          i++;
        }
        elt = elt.slice(i);
      }
    }
    const base = top ? '' : prefix;
    const joined = base ? `${base}/${elt}` : elt;
    const trailingSlash = elt.endsWith('/') && elt.length > 1;
    let norm = normalize(`/${joined}`).slice(1);
    if (normalize(`/${joined}`) === '/') norm = '';
    // Detect escaping the work tree ("../x" from the root).
    if (escapesRoot(joined)) throw new PathspecError(`${original}: '${original}' is outside repository at '${root}'`);
    if (trailingSlash && norm) norm += '/';
    // The cwd prefix part is always literal (git: nowildcard_len >= prefixlen).
    let prefixLen = 0;
    if (base) {
      const segs = base.split('/');
      for (let k = segs.length; k > 0; k--) {
        const pre = `${segs.slice(0, k).join('/')}/`;
        if (norm.startsWith(pre)) {
          prefixLen = pre.length;
          break;
        }
      }
    }
    const nowildcardLen = literal ? norm.length : Math.max(simpleLength(norm), prefixLen);
    items.push({ original, match: norm, nowildcardLen: Math.min(nowildcardLen, norm.length), exclude, icase, glob });
  }
  // All items excluding: add an implicit "." (relative to the cwd).
  if (items.length && items.every((i) => i.exclude)) {
    items.push({ original: '.', match: prefix, nowildcardLen: prefix.length, exclude: false, icase: false, glob: false });
  }
  return { items, empty: args.length === 0 };
}

function escapesRoot(rel: string): boolean {
  let depth = 0;
  for (const seg of rel.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      depth--;
      if (depth < 0) return true;
    } else depth++;
  }
  return false;
}

function strEq(a: string, b: string, icase: boolean): boolean {
  return icase ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** git's match_pathspec_item. `isDir` enables DO_MATCH_DIRECTORY ("dir/" matching the directory "dir"). */
export function matchItem(item: PathspecItem, name: string, isDir = false): MatchKind {
  const match = item.match;
  const matchlen = match.length;
  if (!match) return 'recursive';
  if (matchlen <= name.length && strEq(match, name.slice(0, matchlen), item.icase)) {
    if (matchlen === name.length) return 'exact';
    if (match[matchlen - 1] === '/' || name[matchlen] === '/') return 'recursive';
  } else if (isDir && match[matchlen - 1] === '/' && name.length === matchlen - 1 && strEq(match.slice(0, -1), name, item.icase)) return 'exact';
  if (item.nowildcardLen < matchlen) {
    const pre = item.nowildcardLen;
    if (pre > 0 && !strEq(match.slice(0, pre), name.slice(0, pre), item.icase)) return 0;
    if (wildmatch(match.slice(pre), name.slice(pre), { pathname: item.glob, casefold: item.icase })) return 'fnmatch';
  }
  return 0;
}

/**
 * Does `name` match the pathspec? Returns the index of the first positive
 * item that matched (for "did not match" bookkeeping), or -1.
 */
export function matchPathspec(ps: Pathspec, name: string, isDir = false): number {
  if (ps.empty) return 0;
  let hit = -1;
  for (let i = 0; i < ps.items.length; i++) {
    const it = ps.items[i];
    if (it.exclude) continue;
    if (matchItem(it, name, isDir)) {
      hit = i;
      break;
    }
  }
  if (hit < 0) return -1;
  for (const it of ps.items) if (it.exclude && matchItem(it, name, isDir)) return -1;
  return hit;
}

/** All positive items that match `name` (to mark several items as "seen"). */
export function matchingItems(ps: Pathspec, name: string, isDir = false): number[] {
  if (ps.empty) return [];
  for (const it of ps.items) if (it.exclude && matchItem(it, name, isDir)) return [];
  const out: number[] = [];
  ps.items.forEach((it, i) => {
    if (!it.exclude && matchItem(it, name, isDir)) out.push(i);
  });
  return out;
}

/** True when the item is a plain path without wildcards (git treats it as a literal path). */
export function isLiteral(item: PathspecItem): boolean {
  return item.nowildcardLen >= item.match.length;
}
