/**
 * Public API of the simulated GitHub (pure state logic; UI lives in src/ui/hub).
 * @stub-owner hub — the Mock GitHub workstream implements these (same signatures).
 */
import type { GameEvent } from '../shared/events';
import type { HubAction } from '../shared/level';
import type { CommandResult } from '../shared/result';
import { fail, ok, stderr } from '../shared/result';
import type { World } from '../shared/types';

/** Apply one action on the simulated GitHub. `action.actor` defaults to world.hub.viewer. */
export function applyHubAction(world: World, action: HubAction): CommandResult {
  return fail(world, 1, stderr(`hub action '${action.type}' is not available yet`));
}

/**
 * React to events from git commands and other hub actions: start workflow
 * runs on push, update pull requests, close issues mentioned with
 * "Fixes #n" on the default branch, redeploy Pages. Must be idempotent for
 * events it has already handled.
 */
export function reactToEvents(world: World, _events: GameEvent[]): CommandResult {
  return ok(world);
}
