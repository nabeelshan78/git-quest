/**
 * `git commit --amend`. Engine A's commit handler delegates here when
 * --amend is given.
 * @stub-owner engine-b — Engine B implements this.
 */
import { fail, stderr } from '../../shared/result';
import type { CommandResult } from '../../shared/result';
import type { World } from '../../shared/types';
import type { GitContext } from '../types';

export function amendCommit(world: World, _ctx: GitContext): CommandResult {
  return fail(world, 128, stderr('fatal: --amend is not available yet'));
}
