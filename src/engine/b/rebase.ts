/**
 * Rebase entry point shared with the Remote workstream (`git pull --rebase`).
 * @stub-owner engine-b — Engine B implements this (same signature) together
 * with `git rebase`, `--continue`, `--skip`, `--abort` and `-i`.
 */
import { fail, stderr } from '../../shared/result';
import type { CommandResult } from '../../shared/result';
import type { Hash, World } from '../../shared/types';

export interface StartRebaseOptions {
  /** Commits reachable from `upstream` are not replayed. */
  upstream: Hash;
  /** Where replayed commits go (default: `upstream`). */
  onto?: Hash;
  /** Name used in messages, e.g. "main" or "origin/main". */
  upstreamName: string;
  /** Reflog action prefix: "rebase" (default) or "pull --rebase". */
  reflogAction?: string;
  /** Open the todo editor first (git rebase -i). */
  interactive?: boolean;
}

/** Rebase the current branch (or detached HEAD) of the repo at the machine's cwd. */
export function startRebase(world: World, _machineId: string, _options: StartRebaseOptions): CommandResult {
  return fail(world, 128, stderr('fatal: rebase is not available yet'));
}
