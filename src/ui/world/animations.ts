/**
 * Pure mapping from engine events to world-view animations.
 *
 * index.stage      working    -> staging
 * index.unstage    staging    -> working
 * index.remove     working    -> staging   (a staged deletion)
 * commit.create    staging    -> repository
 * worktree.update  repository -> working   (checkout, restore, reset, merge)
 * transfer.push    repository -> remote
 * transfer.fetch   remote     -> repository
 * transfer.clone   remote     -> repository
 * transfer.rejected repository -> remote, bounced
 * merge.conflict   pulse on the working folder
 */
import type { GameEvent } from '../../shared/events';
import type { MachineId, RepoLocation } from '../../shared/types';

export type BoxId = 'working' | 'staging' | 'repository' | 'remote';

export type AnimationVariant = 'file' | 'delete' | 'commit' | 'transfer' | 'rejected' | 'conflict';

/** Caption keys (world namespace) for slow, labelled animations. */
export type CaptionKey = 'stage' | 'unstage' | 'remove' | 'commit' | 'checkout' | 'push' | 'fetch' | 'clone' | 'rejected' | 'conflict';

export interface WorldAnimation {
  /** Unique within one batch. */
  key: string;
  kind: 'glide' | 'pulse';
  from: BoxId;
  to: BoxId;
  /** Text on the moving chip (a file path, a commit subject, a branch). */
  label: string;
  variant: AnimationVariant;
  caption: CaptionKey;
  /** Delay before this animation starts, in "steps" (multiplied by the stagger time). */
  step: number;
}

export const MAX_CHIPS_PER_EVENT = 4;

function isLocalOn(repo: RepoLocation, machine: MachineId): boolean {
  return repo.kind === 'local' && repo.machine === machine;
}

function refShort(ref: string): string {
  return ref.replace(/^refs\/(heads|tags|remotes)\//, '');
}

function chips(paths: string[]): string[] {
  if (paths.length <= MAX_CHIPS_PER_EVENT) return paths;
  return [...paths.slice(0, MAX_CHIPS_PER_EVENT - 1), `+${paths.length - (MAX_CHIPS_PER_EVENT - 1)}`];
}

function firstLine(message: string): string {
  const s = message.split('\n')[0].trim();
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}

/**
 * Animations for the events of one action, as seen from `machine` (the
 * machine whose world view is on screen). Events on other machines or only
 * on the hosted side do not glide between local boxes.
 */
export function eventsToAnimations(events: GameEvent[], machine: MachineId): WorldAnimation[] {
  const out: WorldAnimation[] = [];
  let step = 0;
  const push = (a: Omit<WorldAnimation, 'key' | 'step'>, i = 0) => out.push({ ...a, key: `${out.length}-${a.kind}-${a.label}`, step: step + i });
  for (const e of events) {
    const before = out.length;
    switch (e.type) {
      case 'index.stage':
        if (!isLocalOn(e.repo, machine)) break;
        chips(e.paths).forEach((p, i) => push({ kind: 'glide', from: 'working', to: 'staging', label: p, variant: 'file', caption: 'stage' }, i));
        break;
      case 'index.unstage':
        if (!isLocalOn(e.repo, machine)) break;
        chips(e.paths).forEach((p, i) => push({ kind: 'glide', from: 'staging', to: 'working', label: p, variant: 'file', caption: 'unstage' }, i));
        break;
      case 'index.remove':
        if (!isLocalOn(e.repo, machine)) break;
        chips(e.paths).forEach((p, i) => push({ kind: 'glide', from: 'working', to: 'staging', label: p, variant: 'delete', caption: 'remove' }, i));
        break;
      case 'commit.create':
        if (!isLocalOn(e.repo, machine) || e.kind === 'stash') break;
        push({ kind: 'glide', from: 'staging', to: 'repository', label: firstLine(e.message), variant: 'commit', caption: 'commit' });
        break;
      case 'worktree.update': {
        if (!isLocalOn(e.repo, machine)) break;
        const paths = [...e.written, ...e.deleted];
        chips(paths).forEach((p, i) => push({ kind: 'glide', from: 'repository', to: 'working', label: p, variant: e.deleted.includes(p) ? 'delete' : 'file', caption: 'checkout' }, i));
        break;
      }
      case 'transfer.push':
        if (!isLocalOn(e.repo, machine)) break;
        push({ kind: 'glide', from: 'repository', to: 'remote', label: e.updates.map((u) => refShort(u.ref)).join(', ') || e.hosted, variant: 'transfer', caption: 'push' });
        break;
      case 'transfer.fetch':
        if (!isLocalOn(e.repo, machine)) break;
        push({ kind: 'glide', from: 'remote', to: 'repository', label: e.updates.map((u) => refShort(u.ref)).join(', ') || e.remote, variant: 'transfer', caption: 'fetch' });
        break;
      case 'transfer.clone':
        if (e.machine !== machine) break;
        push({ kind: 'glide', from: 'remote', to: 'repository', label: e.hosted, variant: 'transfer', caption: 'clone' });
        break;
      case 'transfer.rejected':
        if (!isLocalOn(e.repo, machine)) break;
        push({ kind: 'glide', from: 'repository', to: 'remote', label: refShort(e.ref), variant: 'rejected', caption: 'rejected' });
        break;
      case 'merge.conflict':
        if (!isLocalOn(e.repo, machine)) break;
        push({ kind: 'pulse', from: 'working', to: 'working', label: chips(e.paths).join(', '), variant: 'conflict', caption: 'conflict' });
        break;
      default:
        break;
    }
    if (out.length > before) step = Math.max(...out.map((a) => a.step)) + 1;
  }
  return out;
}

/** Total duration of a batch in milliseconds (for pacing Ada's demo). */
export function batchDuration(anims: WorldAnimation[], glideMs: number, staggerMs: number): number {
  if (!anims.length) return 0;
  return Math.max(...anims.map((a) => a.step)) * staggerMs + glideMs;
}
