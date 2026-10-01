/**
 * .gitignore engine — a port of the matching rules in git's dir.c:
 * per-directory .gitignore files (deeper files win), .git/info/exclude
 * (`repo.infoExclude`), the global excludes file (core.excludesFile or
 * ~/.config/git/ignore), negation, directory-only patterns, anchoring and
 * `**`. If a parent directory is excluded, everything inside it is too.
 */
import type { AbsPath, Machine, RepoState } from '../../shared/types';
import { getConfig } from '../core/repo';
import { join, resolvePath } from '../core/paths';
import { simpleLength, wildmatch } from './wildmatch';

export interface IgnorePattern {
  /** Pattern text without "!" and without the trailing "/". */
  pattern: string;
  negative: boolean;
  mustBeDir: boolean;
  noDir: boolean;
  endsWith: boolean;
  nowildcardLen: number;
  /** Directory of the .gitignore relative to the repo root, "" or "dir/sub/" (with trailing slash). */
  base: string;
  /** Source file as git prints it in `check-ignore -v`. */
  source: string;
  /** 1-based line number. */
  line: number;
}

/** Parse ignore-file text into patterns (git's add_patterns_from_buffer + parse_path_pattern). */
export function parseIgnoreFile(text: string, base: string, source: string): IgnorePattern[] {
  const out: IgnorePattern[] = [];
  const lines = text.split('\n');
  // A final line without "\n" is still read.
  for (let i = 0; i < lines.length; i++) {
    let entry = lines[i];
    if (i === lines.length - 1 && entry === '') break;
    if (entry === '' || entry.startsWith('#')) continue;
    if (entry.endsWith('\r')) entry = entry.slice(0, -1);
    entry = trimTrailingSpaces(entry);
    const p = parsePattern(entry);
    out.push({ ...p, base, source, line: i + 1 });
  }
  return out;
}

function trimTrailingSpaces(s: string): string {
  let lastSpace = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === ' ') {
      if (lastSpace < 0) lastSpace = i;
    } else if (c === '\\') {
      i++;
      if (i >= s.length) return s;
      lastSpace = -1;
    } else lastSpace = -1;
  }
  return lastSpace >= 0 ? s.slice(0, lastSpace) : s;
}

function parsePattern(raw: string): Omit<IgnorePattern, 'base' | 'source' | 'line'> {
  let p = raw;
  let negative = false;
  if (p.startsWith('!')) {
    negative = true;
    p = p.slice(1);
  }
  let mustBeDir = false;
  if (p.length && p.endsWith('/')) {
    p = p.slice(0, -1);
    mustBeDir = true;
  }
  const noDir = !p.includes('/');
  let nowildcardLen = simpleLength(p);
  if (nowildcardLen > p.length) nowildcardLen = p.length;
  const endsWith = p.startsWith('*') && simpleLength(p.slice(1)) === p.length - 1;
  return { pattern: p, negative, mustBeDir, noDir, endsWith, nowildcardLen };
}

function matchBasename(basename: string, pat: IgnorePattern): boolean {
  const { pattern, nowildcardLen } = pat;
  if (nowildcardLen === pattern.length) return pattern === basename;
  if (pat.endsWith) return basename.endsWith(pattern.slice(1));
  return wildmatch(pattern, basename, {});
}

function matchPathname(pathname: string, pat: IgnorePattern): boolean {
  let pattern = pat.pattern;
  let prefix = pat.nowildcardLen;
  if (pattern.startsWith('/')) {
    pattern = pattern.slice(1);
    prefix--;
  }
  const base = pat.base ? pat.base.slice(0, -1) : '';
  const baselen = base.length;
  if (pathname.length < baselen + 1 || (baselen && pathname[baselen] !== '/') || pathname.slice(0, baselen) !== base) return false;
  let name = baselen ? pathname.slice(baselen + 1) : pathname;
  if (prefix > 0) {
    if (prefix > name.length) return false;
    if (pattern.slice(0, prefix) !== name.slice(0, prefix)) return false;
    pattern = pattern.slice(prefix);
    name = name.slice(prefix);
    if (!pattern.length && !name.length) return true;
  }
  return wildmatch(pattern, name, { pathname: true });
}

function lastMatchingInList(pathname: string, basename: string, isDir: boolean, list: IgnorePattern[]): IgnorePattern | null {
  for (let i = list.length - 1; i >= 0; i--) {
    const pat = list[i];
    if (pat.mustBeDir && !isDir) continue;
    if (pat.noDir) {
      if (matchBasename(basename, pat)) return pat;
      continue;
    }
    if (matchPathname(pathname, pat)) return pat;
  }
  return null;
}

/**
 * Answers "is this path ignored?" for one repository. Parsed .gitignore
 * files are cached for the lifetime of the matcher (one command).
 */
export class IgnoreMatcher {
  private readonly dirLists = new Map<string, IgnorePattern[]>();
  private readonly fileLists: IgnorePattern[][];
  private readonly dirExcluded = new Map<string, IgnorePattern | null>();

  constructor(
    private readonly machine: Machine,
    private readonly root: AbsPath,
    repo: RepoState,
  ) {
    const lists: IgnorePattern[][] = [];
    // Lowest precedence first: global excludes file, then .git/info/exclude.
    const configured = getConfig(machine, repo, 'core.excludesfile');
    const globalPath = configured ? resolvePath(machine.cwd, machine.home, configured) : join(machine.home, '.config/git/ignore');
    const globalText = machine.fs.files[globalPath];
    if (globalText !== undefined) lists.push(parseIgnoreFile(globalText, '', configured ?? globalPath));
    if (repo.infoExclude) lists.push(parseIgnoreFile(repo.infoExclude, '', '.git/info/exclude'));
    this.fileLists = lists;
  }

  /** Patterns of the .gitignore in repo directory `dir` ("" = root). */
  private listFor(dir: string): IgnorePattern[] {
    let l = this.dirLists.get(dir);
    if (!l) {
      const base = dir ? `${dir}/` : '';
      const abs = join(this.root, `${base}.gitignore`);
      const text = this.machine.fs.files[abs];
      l = text === undefined ? [] : parseIgnoreFile(text, base, `${base}.gitignore`);
      this.dirLists.set(dir, l);
    }
    return l;
  }

  /** Match `path` against the lists of `dirs` (deepest first), then the file lists. */
  private matchLists(path: string, isDir: boolean, dirs: string[]): IgnorePattern | null {
    const basename = path.slice(path.lastIndexOf('/') + 1);
    for (let i = dirs.length - 1; i >= 0; i--) {
      const m = lastMatchingInList(path, basename, isDir, this.listFor(dirs[i]));
      if (m) return m;
    }
    for (let i = this.fileLists.length - 1; i >= 0; i--) {
      const m = lastMatchingInList(path, basename, isDir, this.fileLists[i]);
      if (m) return m;
    }
    return null;
  }

  /** The excluded ancestor directory pattern for `path`, if any parent directory is ignored. */
  private excludedParent(path: string): IgnorePattern | null {
    const parts = path.split('/');
    const dirs = [''];
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts.slice(0, i + 1).join('/');
      let m = this.dirExcluded.get(dir);
      if (m === undefined) {
        const r = this.matchLists(dir, true, dirs);
        m = r && !r.negative ? r : null;
        this.dirExcluded.set(dir, m);
      }
      if (m) return m;
      dirs.push(dir);
    }
    return null;
  }

  /**
   * The deciding pattern for `path` (repo-relative, no trailing slash), or
   * null when no pattern matches. A returned negative pattern means "not ignored".
   */
  match(path: string, isDir: boolean): IgnorePattern | null {
    const parent = this.excludedParent(path);
    if (parent) return parent;
    const parts = path.split('/');
    const dirs = [''];
    for (let i = 0; i < parts.length - 1; i++) dirs.push(parts.slice(0, i + 1).join('/'));
    return this.matchLists(path, isDir, dirs);
  }

  isIgnored(path: string, isDir = false): boolean {
    const m = this.match(path, isDir);
    return !!m && !m.negative;
  }
}

/** Print form of a pattern for `check-ignore -v`. */
export function patternDisplay(p: IgnorePattern): string {
  return `${p.negative ? '!' : ''}${p.pattern}${p.mustBeDir ? '/' : ''}`;
}
