/**
 * Public API of the remote simulator.
 * @stub-owner remote — the Remote workstream implements these (same signatures).
 */
import type { HostedRepoSetup, TeammateAction } from '../shared/level';
import type { CommandResult } from '../shared/result';
import { fail, stderr } from '../shared/result';
import { parseHubUrl } from '../shared/constants';
import type { AbsPath, HostedRepo, MachineId, World } from '../shared/types';

export { remoteCommands } from './commands';

export type TeammatePushAction = Extract<TeammateAction, { type: 'push' }>;

/**
 * Create a hosted repo from a level setup step. The level runner resolves
 * `setup.fromLocal.repoPath` to an absolute path before calling; when it is
 * absent, `defaults.repoPath` on `defaults.machine` is used.
 */
export function setupHostedRepo(world: World, _setup: HostedRepoSetup, _defaults: { machine: MachineId; repoPath: AbsPath }): CommandResult {
  return fail(world, 1, stderr('setupHostedRepo is not available yet'));
}

/** A teammate commits straight onto a hosted branch (as if pushed from their laptop). */
export function applyTeammatePush(world: World, _action: TeammatePushAction): CommandResult {
  return fail(world, 1, stderr('applyTeammatePush is not available yet'));
}

/** The hosted repo a remote URL points at, or null. */
export function hostedRepoForUrl(world: World, url: string): HostedRepo | null {
  const parsed = parseHubUrl(url);
  return parsed ? (world.hosted[parsed.id] ?? null) : null;
}
