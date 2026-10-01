/**
 * Public API of the command-line layer: shell builtins, quoting, chaining,
 * redirection, git dispatch, allowed-command lists, completion, help.
 * @stub-owner parser — foundation version (git only, simple quoting).
 * The Parser workstream replaces it, keeping these signatures.
 */
import { runGit } from '../engine';
import type { CommandResult } from '../shared/result';
import { fail, stderr } from '../shared/result';
import type { CompletionResult } from '../shared/session';
import type { World } from '../shared/types';
import { worldChanged } from '../shared/compare';

export interface RunLineOptions {
  /** Command prefixes allowed in the level (e.g. "git status", "ls"); null/undefined = everything. */
  allowed?: string[] | null;
}

/** Split a command line into words, honouring single and double quotes. */
export function tokenize(line: string): string[] {
  const out: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) out.push(m[1] !== undefined ? m[1].replace(/\\(.)/g, '$1') : (m[2] ?? m[3]));
  return out;
}

/** Run one typed line on a machine. */
export function runLine(world: World, machineId: string, line: string, _options: RunLineOptions = {}): CommandResult {
  const words = tokenize(line);
  if (words.length === 0) return { state: world, events: [], output: [], exitCode: 0, executed: [] };
  const [program, ...argv] = words;
  if (program !== 'git') return fail(world, 127, stderr(`${program}: command not found`));
  const r = runGit(world, machineId, argv);
  return { ...r, executed: [{ program, argv, exitCode: r.exitCode, changed: worldChanged(world, r.state) }] };
}

export function completeLine(_world: World, _machineId: string, line: string): CompletionResult {
  return { candidates: [], line };
}
