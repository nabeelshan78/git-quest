/**
 * Shared plumbing for Engine A command handlers: opening the repository a
 * command runs in, output helpers and small utilities.
 */
import type { GameEvent } from '../../shared/events';
import type { CommandResult, OutputLine } from '../../shared/result';
import type { AbsPath, Machine, RepoLocation, RepoState, World } from '../../shared/types';
import { NOT_A_REPO, findRepo } from '../core/repo';

/** A repository opened for a command, plus where it lives. */
export interface RepoCtx {
  world: World;
  machineId: string;
  machine: Machine;
  root: AbsPath;
  repo: RepoState;
  /** cwd relative to the work tree root ("" at the root). */
  prefix: string;
  loc: RepoLocation;
}

/** Collects output lines and events while a command runs. */
export class Out {
  lines: OutputLine[] = [];
  events: GameEvent[] = [];
  out(...texts: string[]): this {
    for (const t of texts) for (const l of t.split('\n')) this.lines.push({ stream: 'stdout', text: l });
    return this;
  }
  err(...texts: string[]): this {
    for (const t of texts) for (const l of t.split('\n')) this.lines.push({ stream: 'stderr', text: l });
    return this;
  }
  /** Append text that may end with "\n"; the trailing newline does not create an empty line. */
  outText(text: string): this {
    if (text === '') return this;
    return this.out(text.endsWith('\n') ? text.slice(0, -1) : text);
  }
  errText(text: string): this {
    if (text === '') return this;
    return this.err(text.endsWith('\n') ? text.slice(0, -1) : text);
  }
  ev(...events: GameEvent[]): this {
    this.events.push(...events);
    return this;
  }
  result(state: World, exitCode = 0): CommandResult {
    return { state, events: this.events, output: this.lines, exitCode };
  }
}

export function localLoc(machineId: string, root: AbsPath): RepoLocation {
  return { kind: 'local', machine: machineId, root };
}

/** Open the repository containing the machine's cwd, or return git's "not a git repository" error. */
export function openRepo(world: World, machineId: string): RepoCtx | CommandResult {
  const h = findRepo(world, machineId);
  if (!h) return { state: world, events: [], output: [{ stream: 'stderr', text: `fatal: ${NOT_A_REPO}` }], exitCode: 128 };
  return { world, machineId, machine: h.machine, root: h.root, repo: h.repo, prefix: h.prefix, loc: localLoc(machineId, h.root) };
}

/** Like openRepo but also requires a work tree (not a bare repo, not inside .git). */
export function openWorkTree(world: World, machineId: string): RepoCtx | CommandResult {
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const h = findRepo(world, machineId);
  if (r.repo.bare || h?.insideGitDir) return { state: world, events: [], output: [{ stream: 'stderr', text: 'fatal: this operation must be run in a work tree' }], exitCode: 128 };
  return r;
}

export function isResult(x: unknown): x is CommandResult {
  return typeof x === 'object' && x !== null && 'exitCode' in x && 'output' in x;
}

export function fatalResult(world: World, message: string, code = 128): CommandResult {
  return { state: world, events: [], output: message.split('\n').map((text) => ({ stream: 'stderr' as const, text })), exitCode: code };
}

export function errorResult(world: World, lines: string[], code = 1, stream: 'stdout' | 'stderr' = 'stderr'): CommandResult {
  return { state: world, events: [], output: lines.flatMap((l) => l.split('\n')).map((text) => ({ stream, text })), exitCode: code };
}

/** Standard git message when a revision/path argument cannot be resolved. */
export function ambiguousArgument(arg: string): string {
  return `fatal: ambiguous argument '${arg}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`;
}

/** English plural helper used by many messages. */
export function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many;
}

/** Quote a path the way git does with core.quotePath=true (C-style, octal for non-ASCII). */
export function quotePath(path: string): string {
  let needs = false;
  const bytes = new TextEncoderLite().encode(path);
  let out = '';
  for (const b of bytes) {
    if (b === 0x22) {
      out += '\\"';
      needs = true;
    } else if (b === 0x5c) {
      out += '\\\\';
      needs = true;
    } else if (b === 0x07) {
      out += '\\a';
      needs = true;
    } else if (b === 0x08) {
      out += '\\b';
      needs = true;
    } else if (b === 0x09) {
      out += '\\t';
      needs = true;
    } else if (b === 0x0a) {
      out += '\\n';
      needs = true;
    } else if (b === 0x0b) {
      out += '\\v';
      needs = true;
    } else if (b === 0x0c) {
      out += '\\f';
      needs = true;
    } else if (b === 0x0d) {
      out += '\\r';
      needs = true;
    } else if (b < 0x20 || b >= 0x7f) {
      out += `\\${b.toString(8).padStart(3, '0')}`;
      needs = true;
    } else out += String.fromCharCode(b);
  }
  return needs ? `"${out}"` : path;
}

/** Minimal UTF-8 encoder (no dependency on the global TextEncoder typing). */
class TextEncoderLite {
  encode(s: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < s.length; i++) {
      let c = s.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
        const c2 = s.charCodeAt(i + 1);
        if (c2 >= 0xdc00 && c2 <= 0xdfff) {
          c = 0x10000 + ((c - 0xd800) << 10) + (c2 - 0xdc00);
          i++;
        }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
      else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
      else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    }
    return out;
  }
}

/**
 * Path relative to `prefix` (the cwd inside the repo, "" at the root), as git
 * prints it in status and friends. Port of git's `relative_path()`.
 */
export function relativeToPrefix(path: string, prefix: string): string {
  const pre = prefix && !prefix.endsWith('/') ? `${prefix}/` : prefix;
  const inLen = path.length;
  const prefixLen = pre.length;
  if (!inLen) return './';
  if (!prefixLen) return path;
  let i = 0;
  let j = 0;
  let inOff = 0;
  let prefixOff = 0;
  while (i < prefixLen && j < inLen && pre[i] === path[j]) {
    if (pre[i] === '/') {
      while (pre[i] === '/') i++;
      while (path[j] === '/') j++;
      prefixOff = i;
      inOff = j;
    } else {
      i++;
      j++;
    }
  }
  if (i >= prefixLen && prefixOff < prefixLen) {
    if (j >= inLen) inOff = inLen;
    else if (path[j] === '/') {
      while (path[j] === '/') j++;
      inOff = j;
    } else i = prefixOff;
  } else if (j >= inLen && inOff < inLen) {
    if (pre[i] === '/') {
      while (pre[i] === '/') i++;
      inOff = inLen;
    }
  }
  const rest = path.slice(inOff);
  if (i >= prefixLen) return rest.length ? rest : './';
  let sb = '';
  while (i < prefixLen) {
    if (pre[i] === '/') {
      sb += '../';
      while (pre[i] === '/') i++;
      continue;
    }
    i++;
  }
  if (pre[prefixLen - 1] !== '/') sb += '../';
  return sb + rest;
}

/** git's quote_path(): relative to the cwd prefix, C-quoted; `quoteSpaces` also quotes names with spaces (short status). */
export function displayPath(path: string, prefix: string, quoteSpaces = false): string {
  const rel = relativeToPrefix(path, prefix);
  const q = quotePath(rel);
  if (quoteSpaces && rel.includes(' ') && !q.startsWith('"')) return `"${q}"`;
  return q;
}
