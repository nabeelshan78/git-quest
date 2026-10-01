/**
 * Tab completion for the simulated shell.
 */
import type { CompletionResult } from '../shared/session';
import type { World } from '../shared/types';
import { allGitCommandNames } from '../shared/commandSpecs';
import { SHELL_COMMAND_NAMES } from './shell';
import { listDir, dirExists } from '../engine/core/fs';
import { resolvePath, dirname, basename } from '../engine/core/paths';
import { findRepo } from '../engine/core/repo';

/**
 * Compute tab completions for a partial command line.
 */
export function completeLine(world: World, machineId: string, line: string): CompletionResult {
  const m = world.machines[machineId];
  if (!m) return { candidates: [], line };

  const trimmed = line.trimStart();
  const words = splitSimple(trimmed);
  const trailingSpace = trimmed.length > 0 && trimmed.endsWith(' ');

  // No input yet: show all commands
  if (words.length === 0) {
    const all = [...SHELL_COMMAND_NAMES, 'git'].sort();
    return { candidates: all, line };
  }

  // Completing the first word (command name)
  if (words.length === 1 && !trailingSpace) {
    const partial = words[0];
    const all = [...SHELL_COMMAND_NAMES, 'git'].sort();
    const matches = all.filter((c) => c.startsWith(partial));
    if (matches.length === 1) {
      return { candidates: matches, line: matches[0] + ' ' };
    }
    const common = longestCommonPrefix(matches);
    return { candidates: matches, line: common || line };
  }

  const program = words[0];

  // git subcommand completion
  if (program === 'git') {
    if (words.length === 1 && trailingSpace) {
      // "git " — complete subcommand
      return { candidates: allGitCommandNames().sort(), line };
    }
    if (words.length === 2 && !trailingSpace) {
      // "git sw" — complete subcommand
      const partial = words[1];
      const matches = allGitCommandNames()
        .filter((c) => c.startsWith(partial))
        .sort();
      if (matches.length === 1) {
        return { candidates: matches, line: `git ${matches[0]} ` };
      }
      const common = longestCommonPrefix(matches);
      return { candidates: matches, line: common ? `git ${common}` : line };
    }

    // "git switch ..." or "git checkout ..." or "git merge ..." — complete branch names
    const subcommand = words[1];
    const branchCommands = ['switch', 'checkout', 'merge', 'rebase', 'branch'];
    if (branchCommands.includes(subcommand)) {
      const partial = trailingSpace ? '' : words[words.length - 1];
      // Don't complete flags
      if (partial.startsWith('-')) {
        return { candidates: [], line };
      }
      const branches = getBranchNames(world, machineId);
      const matches = branches.filter((b) => b.startsWith(partial)).sort();
      if (matches.length === 1) {
        const prefix = words.slice(0, -1).join(' ');
        const newLine = trailingSpace
          ? `${line}${matches[0]} `
          : `${prefix} ${matches[0]} `;
        return { candidates: matches, line: newLine };
      }
      const common = longestCommonPrefix(matches);
      if (common && common.length > partial.length) {
        const prefix = words.slice(0, -1).join(' ');
        return { candidates: matches, line: trailingSpace ? `${line}${common}` : `${prefix} ${common}` };
      }
      return { candidates: matches, line };
    }

    // For other git subcommands, complete file paths
    return completeFilePath(world, machineId, words, trailingSpace, line);
  }

  // For shell commands, complete file paths
  return completeFilePath(world, machineId, words, trailingSpace, line);
}

function completeFilePath(
  world: World,
  machineId: string,
  words: string[],
  trailingSpace: boolean,
  line: string,
): CompletionResult {
  const m = world.machines[machineId];
  const partial = trailingSpace ? '' : words[words.length - 1];

  // Don't complete flags
  if (partial.startsWith('-')) {
    return { candidates: [], line };
  }

  const resolved = resolvePath(m.cwd, m.home, partial || '.');
  const dir = partial.endsWith('/') || partial === '' ? resolved : dirname(resolved);
  const prefix = partial.endsWith('/') || partial === '' ? '' : basename(resolved);

  if (!dirExists(m.fs, dir)) {
    return { candidates: [], line };
  }

  const entries = listDir(m.fs, dir);
  const matches = entries
    .filter((e) => !e.name.startsWith('.') && e.name.startsWith(prefix))
    .map((e) => e.name + (e.isDir ? '/' : ''));

  if (matches.length === 0) {
    return { candidates: [], line };
  }

  // Build the completion prefix (the path up to but not including the basename)
  const pathPrefix = partial.includes('/')
    ? partial.slice(0, partial.lastIndexOf('/') + 1)
    : '';

  const fullMatches = matches.map((m) => pathPrefix + m);

  if (fullMatches.length === 1) {
    const wordsBefore = trailingSpace ? words : words.slice(0, -1);
    const newLine = wordsBefore.join(' ') + (wordsBefore.length ? ' ' : '') + fullMatches[0];
    return { candidates: fullMatches, line: newLine };
  }

  const common = longestCommonPrefix(fullMatches);
  if (common && common.length > partial.length) {
    const wordsBefore = trailingSpace ? words : words.slice(0, -1);
    const newLine = wordsBefore.join(' ') + (wordsBefore.length ? ' ' : '') + common;
    return { candidates: fullMatches, line: newLine };
  }

  return { candidates: fullMatches, line };
}

function getBranchNames(world: World, machineId: string): string[] {
  const handle = findRepo(world, machineId);
  if (!handle) return [];
  const branches: string[] = [];
  for (const ref of Object.keys(handle.repo.refs)) {
    if (ref.startsWith('refs/heads/')) {
      branches.push(ref.slice('refs/heads/'.length));
    }
  }
  return branches;
}

function splitSimple(line: string): string[] {
  return line.split(/\s+/).filter(Boolean);
}

function longestCommonPrefix(strings: string[]): string {
  if (strings.length === 0) return '';
  let prefix = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return '';
    }
  }
  return prefix;
}
