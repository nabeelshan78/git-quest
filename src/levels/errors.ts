/**
 * Error translator: map git error messages to plain English explanations.
 */

export interface ErrorEntry {
  id: string;
  /** Pattern to match in the error output. */
  pattern: RegExp;
  /** Plain English explanation. */
  message: string;
}

const ERROR_ENTRIES: ErrorEntry[] = [
  { id: 'not-a-repo', pattern: /fatal: not a git repository/, message: 'You need to be inside a git repository. Try running "git init" first.' },
  { id: 'nothing-to-commit', pattern: /nothing to commit/, message: 'There are no changes to commit. Make some changes to files first, then use "git add" to stage them.' },
  { id: 'no-changes-added', pattern: /no changes added to commit/, message: 'You have changes but they are not staged yet. Use "git add <file>" to stage your changes before committing.' },
  { id: 'pathspec-not-found', pattern: /error: pathspec '(.+)' did not match any file/, message: 'That file does not exist. Check the spelling and make sure the file is in the right folder.' },
  { id: 'unmerged-paths', pattern: /error: you need to resolve your current index first/, message: 'You have merge conflicts that need to be resolved. Open the conflicted files, fix them, and run "git add" on each one.' },
  { id: 'merge-conflict', pattern: /CONFLICT \(/, message: 'The merge created conflicts. Open the conflicted files, choose which changes to keep, remove the conflict markers, then "git add" each file.' },
  { id: 'already-on-branch', pattern: /Already on '(.+)'/, message: 'You are already on that branch. No need to switch.' },
  { id: 'branch-exists', pattern: /fatal: a branch named '(.+)' already exists/, message: 'A branch with that name already exists. Pick a different name or switch to it with "git switch".' },
  { id: 'branch-not-found', pattern: /error: (?:pathspec|refname) '(.+)' .* did not match/, message: 'That branch does not exist. Check the spelling with "git branch" to see all branches.' },
  { id: 'not-valid-object', pattern: /fatal: not a valid object name/, message: 'That reference does not exist. Make sure you have at least one commit, or check the branch/tag name.' },
  { id: 'checkout-conflict', pattern: /error: Your local changes .* would be overwritten/, message: 'You have uncommitted changes that would be lost. Commit or stash them before switching branches.' },
  { id: 'detached-head', pattern: /HEAD is now at/, message: 'You are in "detached HEAD" state. Any commits you make will not be on a branch. Use "git switch -c <name>" to create a branch here.' },
  { id: 'empty-commit-msg', pattern: /Aborting commit due to empty commit message/, message: 'The commit was cancelled because the message was empty. Every commit needs a message describing what changed.' },
  { id: 'no-upstream', pattern: /fatal: The current branch .* has no upstream branch/, message: 'This branch is not linked to a remote branch yet. Push with "git push -u origin <branch>" to set it up.' },
  { id: 'rejected-non-ff', pattern: /! \[rejected\].*non-fast-forward/, message: 'The remote has new commits you do not have yet. Run "git pull" first to get those changes, then push again.' },
  { id: 'fetch-first', pattern: /error:.*fetch first/, message: 'Someone else has pushed new commits. Run "git fetch" and then merge or rebase before pushing.' },
  { id: 'remote-exists', pattern: /fatal: remote .* already exists/, message: 'A remote with that name already exists. Use "git remote -v" to see your remotes.' },
  { id: 'remote-not-found', pattern: /fatal: No such remote/, message: 'That remote does not exist. Use "git remote add <name> <url>" to add one.' },
  { id: 'untracked-overwritten', pattern: /error: The following untracked working tree files would be overwritten/, message: 'Switching would overwrite files you have not tracked yet. Commit or delete them first.' },
  { id: 'nothing-to-merge', pattern: /Already up to date/, message: 'There is nothing new to merge. The branches already have the same commits.' },
  { id: 'merge-in-progress', pattern: /error: Merging is not possible because you have unmerged files/, message: 'A merge is in progress with conflicts. Resolve all conflicts first, then "git add" and "git commit".' },
  { id: 'no-merge-in-progress', pattern: /fatal: There is no merge to abort/, message: 'There is no merge in progress to abort.' },
  { id: 'stash-nothing', pattern: /No local changes to save/, message: 'There are no changes to stash. You can only stash uncommitted changes.' },
  { id: 'stash-empty', pattern: /No stash entries found/, message: 'The stash is empty. There is nothing to pop or apply.' },
  { id: 'cannot-delete-checked-out', pattern: /error: Cannot delete branch '(.+)' checked out/, message: 'You cannot delete the branch you are currently on. Switch to a different branch first.' },
  { id: 'not-fully-merged', pattern: /error: The branch '(.+)' is not fully merged/, message: 'That branch has commits not yet merged into the current branch. Use "git branch -D" to force-delete it (this will lose those commits).' },
  { id: 'no-tracking-info', pattern: /There is no tracking information/, message: 'Git does not know which remote branch to pull from. Use "git pull origin <branch>" or set up tracking.' },
  { id: 'ambiguous-argument', pattern: /fatal: ambiguous argument/, message: 'Git cannot tell if you mean a branch, a file, or a commit. Use "--" to separate paths from revisions.' },
  { id: 'permission-denied', pattern: /Permission denied/, message: 'You do not have permission to do that. Check your access rights.' },
  { id: 'did-you-mean', pattern: /git: '(.+)' is not a git command.*Did you mean/s, message: 'That is not a valid git command. Check the spelling.' },
];

/**
 * Translate git error output to a plain-English explanation.
 * Returns null if no matching entry is found.
 */
export function translateError(output: string): { id: string; message: string } | null {
  for (const entry of ERROR_ENTRIES) {
    if (entry.pattern.test(output)) {
      return { id: entry.id, message: entry.message };
    }
  }
  return null;
}

/** Get all error translator entries (for testing). */
export function getErrorEntries(): ErrorEntry[] {
  return [...ERROR_ENTRIES];
}
