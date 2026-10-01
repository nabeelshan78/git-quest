/**
 * FROZEN CONTRACT — every event a command can emit.
 *
 * Events describe *what happened* so the UI can animate it (a file gliding
 * into the staging box, a branch label sliding along the graph...). The UI
 * must still render correctly from `World` alone; events only drive motion.
 * Emit events in the order things happen.
 *
 * Only the orchestrator may change this file.
 */
import type {
  AbsPath,
  EditorRequest,
  Hash,
  HeadState,
  HostedRepoId,
  MachineId,
  MergeMethod,
  RepoLocation,
  RepoPath,
} from './types';

export type CommitKind =
  | 'initial'
  | 'normal'
  | 'amend'
  | 'merge'
  | 'squash-merge'
  | 'revert'
  | 'stash'
  | 'hub' // created on the simulated GitHub (web edit, PR merge, teammate)
  | 'teammate';

export type RefUpdateReason =
  | 'commit'
  | 'branch'
  | 'reset'
  | 'merge'
  | 'revert'
  | 'fetch'
  | 'push'
  | 'pull'
  | 'clone'
  | 'stash'
  | 'hub'
  | 'other';

export interface RefChange {
  ref: string; // full ref name
  from: Hash | null; // null = created
  to: Hash | null; // null = deleted
  forced?: boolean;
}

export type GameEvent =
  // ----- filesystem / shell -----
  | { type: 'fs.write'; machine: MachineId; path: AbsPath; created: boolean }
  | { type: 'fs.delete'; machine: MachineId; path: AbsPath; dir: boolean }
  | { type: 'fs.mkdir'; machine: MachineId; path: AbsPath }
  | { type: 'fs.move'; machine: MachineId; from: AbsPath; to: AbsPath }
  | { type: 'shell.cd'; machine: MachineId; from: AbsPath; to: AbsPath }
  | { type: 'shell.clear'; machine: MachineId }
  | { type: 'shell.openEditor'; machine: MachineId; path: AbsPath } // `nano file`, `code file`
  | { type: 'machine.switch'; from: MachineId; to: MachineId }
  // ----- repository lifecycle -----
  | { type: 'repo.init'; machine: MachineId; root: AbsPath; bare: boolean; reinit: boolean }
  | { type: 'config.set'; machine: MachineId; scope: 'global' | 'local'; key: string; value: string | null }
  // ----- index -----
  | { type: 'index.stage'; repo: RepoLocation; paths: RepoPath[] } // path content copied into the staging area
  | { type: 'index.unstage'; repo: RepoLocation; paths: RepoPath[] } // staging area reset to HEAD for these paths
  | { type: 'index.remove'; repo: RepoLocation; paths: RepoPath[] } // removed from the index (git rm)
  | { type: 'index.rename'; repo: RepoLocation; from: RepoPath; to: RepoPath }
  // ----- work tree updates made by git (checkout/restore/reset/merge) -----
  | { type: 'worktree.update'; repo: RepoLocation; written: RepoPath[]; deleted: RepoPath[]; reason: string }
  // ----- history -----
  | { type: 'commit.create'; repo: RepoLocation; hash: Hash; parents: Hash[]; message: string; kind: CommitKind; branch: string | null }
  | { type: 'ref.update'; repo: RepoLocation; change: RefChange; reason: RefUpdateReason }
  | { type: 'head.move'; repo: RepoLocation; from: HeadState; to: HeadState }
  | { type: 'head.detached'; repo: RepoLocation; hash: Hash }
  // ----- merge / conflicts / sequencer -----
  | { type: 'merge.fastForward'; repo: RepoLocation; from: Hash; to: Hash }
  | { type: 'merge.start'; repo: RepoLocation; ours: Hash; theirs: Hash; base: Hash | null }
  | { type: 'merge.conflict'; repo: RepoLocation; paths: RepoPath[]; operation: 'merge' | 'revert' | 'stash' | 'pull' }
  | { type: 'merge.resolved'; repo: RepoLocation; path: RepoPath }
  | { type: 'merge.complete'; repo: RepoLocation; hash: Hash }
  | { type: 'merge.abort'; repo: RepoLocation; operation: 'merge' | 'revert' }
  | { type: 'stash.push'; repo: RepoLocation; hash: Hash; message: string }
  | { type: 'stash.apply'; repo: RepoLocation; hash: Hash; dropped: boolean }
  | { type: 'stash.drop'; repo: RepoLocation; hash: Hash }
  // ----- editor -----
  | { type: 'editor.open'; request: EditorRequest }
  | { type: 'editor.close'; machine: MachineId; saved: boolean }
  // ----- remotes / transfer -----
  | { type: 'remote.add'; repo: RepoLocation; name: string; url: string }
  | { type: 'remote.remove'; repo: RepoLocation; name: string }
  | { type: 'remote.setUrl'; repo: RepoLocation; name: string; url: string }
  | { type: 'transfer.clone'; hosted: HostedRepoId; machine: MachineId; root: AbsPath }
  | { type: 'transfer.fetch'; repo: RepoLocation; remote: string; hosted: HostedRepoId; updates: RefChange[]; objects: number }
  | { type: 'transfer.push'; repo: RepoLocation; remote: string; hosted: HostedRepoId; updates: RefChange[]; objects: number }
  | { type: 'transfer.rejected'; repo: RepoLocation; remote: string; hosted: HostedRepoId; ref: string; reason: 'non-fast-forward' | 'fetch-first' | 'auth' | 'not-found' | 'other' }
  // ----- simulated GitHub -----
  | { type: 'hub.repo.create'; repo: HostedRepoId; by: string }
  | { type: 'hub.repo.settings'; repo: HostedRepoId; by: string }
  | { type: 'hub.file.edit'; repo: HostedRepoId; branch: string; path: RepoPath; commit: Hash; by: string }
  | { type: 'hub.branch.delete'; repo: HostedRepoId; branch: string; by: string }
  | { type: 'hub.issue.open'; repo: HostedRepoId; number: number; by: string }
  | { type: 'hub.issue.update'; repo: HostedRepoId; number: number; by: string; change: 'assign' | 'label' | 'close' | 'reopen' | 'comment' | 'reference' }
  | { type: 'hub.pr.open'; repo: HostedRepoId; number: number; by: string }
  | { type: 'hub.pr.update'; repo: HostedRepoId; number: number; by: string; change: 'comment' | 'push' | 'close' | 'reopen' | 'reviewers' }
  | { type: 'hub.pr.review'; repo: HostedRepoId; number: number; by: string; state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' }
  | { type: 'hub.pr.reviewComment'; repo: HostedRepoId; number: number; by: string; commentId: number }
  | { type: 'hub.pr.merge'; repo: HostedRepoId; number: number; by: string; method: MergeMethod; commit: Hash }
  | { type: 'hub.ssh.add'; title: string }
  | { type: 'hub.token.create'; name: string }
  // ----- story / teammates -----
  | { type: 'teammate.action'; actor: string; summary: string }
  | { type: 'dialogue'; speaker: string; text: string }
  // ----- errors (optional; the translator mostly works on output text) -----
  | { type: 'git.error'; code: string; message: string };

export type GameEventType = GameEvent['type'];
