/**
 * SHARED CONTRACT — declarative specs for every git subcommand the game supports.
 *
 * The parser (src/parser) uses these for option parsing, --help text, tab
 * completion and typo suggestions. Engine handlers receive `ParsedArgs`
 * produced from these specs (see ./args.ts).
 *
 * Ownership: each entry names its owning workstream. An owner MAY add new
 * options to its own entries (never remove or rename existing ones). All
 * other changes go through the orchestrator.
 */

export type OptionKind =
  /** --flag / -f → true; --no-flag → false (when negatable). */
  | 'flag'
  /** Takes a required value: -m msg, -mmsg, --message msg, --message=msg. */
  | 'value'
  /** Value only when attached: --porcelain or --porcelain=v1. Bare → true. */
  | 'optionalValue'
  /** Repeatable flag counted: -v → 1, -vv → 2. */
  | 'count'
  /** Repeatable value collected into a string[]: -m a -m b. */
  | 'list';

export interface OptionSpec {
  /** Canonical key used in ParsedArgs.options. */
  name: string;
  /** Long spellings without dashes; the first is the primary one. */
  long?: string[];
  /** Single-letter short spelling without the dash. */
  short?: string;
  kind: OptionKind;
  /** Accept --no-<long> (sets false). */
  negatable?: boolean;
  /** Placeholder in help text, e.g. "<message>". */
  valueName?: string;
  /** One short, beginner-friendly sentence. */
  description: string;
}

export type CommandOwner = 'engine-a' | 'engine-b' | 'remote';

export interface CommandSpec {
  name: string;
  owner: CommandOwner;
  /** One-line summary for help and completion. */
  summary: string;
  /** Usage lines without the leading "usage: ". */
  usage: string[];
  options: OptionSpec[];
  /** For commands like `git stash pop`, `git remote add`, `git bisect good`. */
  subcommands?: Record<string, SubcommandSpec>;
  /** Subcommand used when none is given (e.g. "push" for stash, "list" for remote). */
  defaultSubcommand?: string;
  /** `git log -3` → options[numericOption] = "3". */
  numericOption?: string;
  /** Hidden from help/completion but still accepted. */
  hidden?: boolean;
}

export interface SubcommandSpec {
  name: string;
  summary: string;
  usage: string[];
  options: OptionSpec[];
  aliases?: string[];
}

const flag = (name: string, long: string | string[] | undefined, short: string | undefined, description: string, negatable = false): OptionSpec => ({
  name,
  long: long === undefined ? undefined : Array.isArray(long) ? long : [long],
  short,
  kind: 'flag',
  negatable,
  description,
});
const value = (name: string, long: string | string[] | undefined, short: string | undefined, valueName: string, description: string): OptionSpec => ({
  name,
  long: long === undefined ? undefined : Array.isArray(long) ? long : [long],
  short,
  kind: 'value',
  valueName,
  description,
});
const optional = (name: string, long: string | string[] | undefined, short: string | undefined, valueName: string, description: string): OptionSpec => ({
  name,
  long: long === undefined ? undefined : Array.isArray(long) ? long : [long],
  short,
  kind: 'optionalValue',
  valueName,
  description,
});
const list = (name: string, long: string | string[] | undefined, short: string | undefined, valueName: string, description: string): OptionSpec => ({
  name,
  long: long === undefined ? undefined : Array.isArray(long) ? long : [long],
  short,
  kind: 'list',
  valueName,
  description,
});
const count = (name: string, long: string | undefined, short: string, description: string): OptionSpec => ({
  name,
  long: long ? [long] : undefined,
  short,
  kind: 'count',
  description,
});

const quiet = flag('quiet', 'quiet', 'q', 'Print less output.');

export const GIT_COMMANDS: Record<string, CommandSpec> = {
  // ------------------------------------------------------------------ Engine A
  init: {
    name: 'init',
    owner: 'engine-a',
    summary: 'Create an empty Git repository or reinitialize an existing one',
    usage: ['git init [-q | --quiet] [--bare] [-b <branch-name> | --initial-branch=<branch-name>] [<directory>]'],
    options: [quiet, flag('bare', 'bare', undefined, 'Create a repository with no working folder.'), value('initial-branch', 'initial-branch', 'b', '<branch-name>', 'Name of the first branch.')],
  },
  config: {
    name: 'config',
    owner: 'engine-a',
    summary: 'Get and set repository or global options',
    usage: ['git config [<file-option>] <name> [<value>]', 'git config [<file-option>] --get <name>', 'git config [<file-option>] --unset <name>', 'git config [<file-option>] -l | --list'],
    options: [
      flag('global', 'global', undefined, 'Use your personal settings file (~/.gitconfig).'),
      flag('local', 'local', undefined, 'Use this repository’s settings file (.git/config).'),
      flag('list', 'list', 'l', 'List all settings.'),
      flag('get', 'get', undefined, 'Show the value of a setting.'),
      flag('get-all', 'get-all', undefined, 'Show every value of a setting.'),
      flag('unset', 'unset', undefined, 'Remove a setting.'),
      flag('add', 'add', undefined, 'Add a new value without replacing old ones.'),
      flag('show-origin', 'show-origin', undefined, 'Show which file each setting comes from.'),
    ],
  },
  status: {
    name: 'status',
    owner: 'engine-a',
    summary: 'Show the working tree status',
    usage: ['git status [<options>] [--] [<pathspec>...]'],
    options: [
      flag('short', 'short', 's', 'Give the output in the short format.'),
      flag('branch', 'branch', 'b', 'Show branch information, even in short format.'),
      flag('long', 'long', undefined, 'Give the output in the long format (default).'),
      optional('porcelain', 'porcelain', undefined, '<version>', 'Machine-readable output.'),
      optional('untracked-files', 'untracked-files', 'u', '<mode>', 'Show untracked files (all, normal, no).'),
      flag('ignored', 'ignored', undefined, 'Show ignored files as well.'),
    ],
  },
  add: {
    name: 'add',
    owner: 'engine-a',
    summary: 'Add file contents to the index',
    usage: ['git add [<options>] [--] <pathspec>...'],
    options: [
      flag('all', ['all', 'no-ignore-removal'], 'A', 'Stage every change, including new and deleted files.'),
      flag('update', 'update', 'u', 'Stage changes to files git already tracks (not new files).'),
      flag('dry-run', 'dry-run', 'n', 'Show what would be added without doing it.'),
      flag('verbose', 'verbose', 'v', 'Show each file as it is added.'),
      flag('force', 'force', 'f', 'Allow adding files that .gitignore ignores.'),
    ],
  },
  commit: {
    name: 'commit',
    owner: 'engine-a',
    summary: 'Record changes to the repository',
    usage: ['git commit [-a | --all] [--amend] [-m <msg>] [--allow-empty] [--author=<author>] [--] [<pathspec>...]'],
    options: [
      list('message', 'message', 'm', '<msg>', 'Use this text as the commit message.'),
      flag('all', 'all', 'a', 'Stage all modified tracked files before committing.'),
      flag('amend', 'amend', undefined, 'Replace the last commit with a new one (handled by Engine B).'),
      flag('edit', 'edit', 'e', 'Open the editor to change the message.', true),
      flag('allow-empty', 'allow-empty', undefined, 'Allow a commit with no changes.'),
      flag('allow-empty-message', 'allow-empty-message', undefined, 'Allow an empty commit message.'),
      value('author', 'author', undefined, '<author>', 'Override the author, e.g. "Sam Lee <sam@example.com>".'),
      value('file', 'file', 'F', '<file>', 'Read the commit message from a file.'),
      flag('verbose', 'verbose', 'v', 'Show the diff in the editor.'),
      flag('dry-run', 'dry-run', undefined, 'Show what would be committed.'),
      flag('only', 'only', 'o', 'Commit only the given paths.'),
      quiet,
    ],
  },
  log: {
    name: 'log',
    owner: 'engine-a',
    summary: 'Show commit logs',
    usage: ['git log [<options>] [<revision-range>] [[--] <path>...]'],
    numericOption: 'max-count',
    options: [
      flag('oneline', 'oneline', undefined, 'One line per commit: short ID and message.'),
      flag('graph', 'graph', undefined, 'Draw the branch structure as a text graph.'),
      flag('all', 'all', undefined, 'Show commits from every branch, not just the current one.'),
      value('max-count', 'max-count', 'n', '<number>', 'Show at most this many commits.'),
      optional('decorate', 'decorate', undefined, '<format>', 'Show branch and tag names next to commits.'),
      flag('no-decorate', 'no-decorate', undefined, 'Hide branch and tag names.'),
      optional('pretty', ['pretty', 'format'], undefined, '<format>', 'Choose the output format, e.g. --format="%h %s".'),
      flag('abbrev-commit', 'abbrev-commit', undefined, 'Show short commit IDs.'),
      flag('stat', 'stat', undefined, 'Show which files changed and how much.'),
      flag('patch', 'patch', 'p', 'Show the full changes of each commit.'),
      flag('name-only', 'name-only', undefined, 'Show only the names of changed files.'),
      flag('name-status', 'name-status', undefined, 'Show names and kinds of changed files.'),
      list('author', 'author', undefined, '<pattern>', 'Only commits by a matching author.'),
      list('grep', 'grep', undefined, '<pattern>', 'Only commits whose message matches.'),
      flag('reverse', 'reverse', undefined, 'Show oldest commits first.'),
      flag('first-parent', 'first-parent', undefined, 'Follow only the first parent of merge commits.'),
      flag('merges', 'merges', undefined, 'Only merge commits.'),
      flag('no-merges', 'no-merges', undefined, 'Hide merge commits.'),
    ],
  },
  diff: {
    name: 'diff',
    owner: 'engine-a',
    summary: 'Show changes between commits, commit and working tree, etc',
    usage: ['git diff [<options>] [<commit>] [--] [<path>...]', 'git diff [<options>] --staged [<commit>] [--] [<path>...]', 'git diff [<options>] <commit> <commit> [--] [<path>...]'],
    options: [
      flag('staged', ['staged', 'cached'], undefined, 'Compare the staging area with the last commit.'),
      flag('stat', 'stat', undefined, 'Show a summary of changed files.'),
      flag('name-only', 'name-only', undefined, 'Show only the names of changed files.'),
      flag('name-status', 'name-status', undefined, 'Show names and kinds of changed files.'),
      value('unified', 'unified', 'U', '<n>', 'Lines of context around each change.'),
      optional('color', 'color', undefined, '<when>', 'Colour the output (ignored in the simulator).'),
    ],
  },
  restore: {
    name: 'restore',
    owner: 'engine-a',
    summary: 'Restore working tree files',
    usage: ['git restore [<options>] [--source=<tree>] [--staged] [--worktree] [--] <pathspec>...'],
    options: [
      value('source', 'source', 's', '<tree>', 'Take the file from this commit instead.'),
      flag('staged', 'staged', 'S', 'Restore the staging area (un-stage).'),
      flag('worktree', 'worktree', 'W', 'Restore the working folder (default).'),
      flag('ours', 'ours', undefined, 'During a conflict, take our version.'),
      flag('theirs', 'theirs', undefined, 'During a conflict, take their version.'),
      quiet,
    ],
  },
  rm: {
    name: 'rm',
    owner: 'engine-a',
    summary: 'Remove files from the working tree and from the index',
    usage: ['git rm [-f | --force] [-n] [-r] [--cached] [-q] [--] <pathspec>...'],
    options: [
      flag('cached', 'cached', undefined, 'Stop tracking the file but keep it in your folder.'),
      flag('recursive', undefined, 'r', 'Remove folders and everything in them.'),
      flag('force', 'force', 'f', 'Remove even if the file has changes.'),
      flag('dry-run', 'dry-run', 'n', 'Show what would be removed.'),
      quiet,
    ],
  },
  mv: {
    name: 'mv',
    owner: 'engine-a',
    summary: 'Move or rename a file, a directory, or a symlink',
    usage: ['git mv [<options>] <source>... <destination>'],
    options: [
      flag('force', 'force', 'f', 'Overwrite the destination if it exists.'),
      flag('dry-run', 'dry-run', 'n', 'Show what would happen.'),
      flag('skip-errors', undefined, 'k', 'Skip moves that would fail.'),
      flag('verbose', 'verbose', 'v', 'Report each move.'),
    ],
  },
  show: {
    name: 'show',
    owner: 'engine-a',
    summary: 'Show various types of objects',
    usage: ['git show [<options>] [<object>...]'],
    options: [
      flag('stat', 'stat', undefined, 'Show a summary of changed files.'),
      flag('name-only', 'name-only', undefined, 'Show only the names of changed files.'),
      flag('name-status', 'name-status', undefined, 'Show names and kinds of changed files.'),
      flag('oneline', 'oneline', undefined, 'Short ID and message on one line.'),
      optional('pretty', ['pretty', 'format'], undefined, '<format>', 'Choose the output format.'),
      flag('no-patch', 'no-patch', 's', 'Do not show the changes.'),
      flag('abbrev-commit', 'abbrev-commit', undefined, 'Show short commit IDs.'),
    ],
  },
  branch: {
    name: 'branch',
    owner: 'engine-a',
    summary: 'List, create, or delete branches',
    usage: ['git branch [<options>] [-r | -a] [--merged] [--no-merged]', 'git branch [<options>] <branch-name> [<start-point>]', 'git branch (-m | -M) [<old-branch>] <new-branch>', 'git branch (-d | -D) <branch-name>...'],
    options: [
      flag('delete', 'delete', 'd', 'Delete a branch (only if it is merged).'),
      flag('force-delete', undefined, 'D', 'Delete a branch even if it is not merged.'),
      flag('move', 'move', 'm', 'Rename a branch.'),
      flag('force-move', undefined, 'M', 'Rename a branch even if the new name exists.'),
      flag('all', 'all', 'a', 'List local and remote-tracking branches.'),
      flag('remotes', 'remotes', 'r', 'List remote-tracking branches.'),
      count('verbose', 'verbose', 'v', 'Show the last commit (-vv also shows upstream).'),
      flag('list', 'list', 'l', 'List branches.'),
      flag('show-current', 'show-current', undefined, 'Print the name of the current branch.'),
      flag('force', 'force', 'f', 'Reset an existing branch to a new start point.'),
      value('set-upstream-to', 'set-upstream-to', 'u', '<upstream>', 'Set the branch this branch tracks.'),
      flag('unset-upstream', 'unset-upstream', undefined, 'Stop tracking an upstream branch.'),
      optional('merged', 'merged', undefined, '<commit>', 'List branches already merged into HEAD.'),
      optional('no-merged', 'no-merged', undefined, '<commit>', 'List branches not merged yet.'),
      optional('contains', 'contains', undefined, '<commit>', 'List branches that contain a commit.'),
      flag('track', 'track', 't', 'Set up tracking for the new branch.', true),
    ],
  },
  switch: {
    name: 'switch',
    owner: 'engine-a',
    summary: 'Switch branches',
    usage: ['git switch [<options>] <branch>', 'git switch [<options>] -c <new-branch> [<start-point>]', 'git switch [<options>] --detach [<start-point>]'],
    options: [
      value('create', 'create', 'c', '<branch>', 'Create a new branch and switch to it.'),
      value('force-create', 'force-create', 'C', '<branch>', 'Create or reset a branch and switch to it.'),
      flag('detach', 'detach', 'd', 'Visit a commit without a branch (detached HEAD).'),
      flag('discard-changes', 'discard-changes', undefined, 'Throw away local changes.'),
      flag('force', 'force', 'f', 'Same as --discard-changes.'),
      flag('track', 'track', 't', 'Set up tracking for the new branch.', true),
      flag('guess', 'guess', undefined, 'Create a local branch from a matching remote branch (default on).', true),
      value('orphan', 'orphan', undefined, '<new-branch>', 'Create a branch with no history.'),
      quiet,
    ],
  },
  checkout: {
    name: 'checkout',
    owner: 'engine-a',
    summary: 'Switch branches or restore working tree files',
    usage: ['git checkout [<options>] <branch>', 'git checkout [<options>] -b <new-branch> [<start-point>]', 'git checkout [<options>] [<tree-ish>] -- <pathspec>...'],
    options: [
      value('branch', undefined, 'b', '<branch>', 'Create a new branch and switch to it.'),
      value('force-branch', undefined, 'B', '<branch>', 'Create or reset a branch and switch to it.'),
      flag('detach', 'detach', undefined, 'Visit a commit without a branch.'),
      flag('force', 'force', 'f', 'Throw away local changes.'),
      flag('track', 'track', 't', 'Set up tracking for the new branch.', true),
      flag('guess', 'guess', undefined, 'Create a local branch from a matching remote branch (default on).', true),
      flag('ours', 'ours', undefined, 'During a conflict, take our version.'),
      flag('theirs', 'theirs', undefined, 'During a conflict, take their version.'),
      value('orphan', 'orphan', undefined, '<new-branch>', 'Create a branch with no history.'),
      quiet,
    ],
  },
  merge: {
    name: 'merge',
    owner: 'engine-a',
    summary: 'Join two or more development histories together',
    usage: ['git merge [<options>] [<commit>...]', 'git merge --abort', 'git merge --continue'],
    options: [
      flag('ff', 'ff', undefined, 'Fast-forward when possible (default).', true),
      flag('ff-only', 'ff-only', undefined, 'Only merge if it can fast-forward.'),
      list('message', 'message', 'm', '<message>', 'Message for the merge commit.'),
      flag('edit', 'edit', 'e', 'Open the editor for the merge message.', true),
      flag('squash', 'squash', undefined, 'Combine the changes without making a merge commit.'),
      flag('commit', 'commit', undefined, 'Make the merge commit (default).', true),
      flag('abort', 'abort', undefined, 'Stop the merge and go back to before it started.'),
      flag('continue', 'continue', undefined, 'Finish a merge after fixing conflicts.'),
      flag('quit', 'quit', undefined, 'Forget the merge in progress, keep files as they are.'),
      flag('allow-unrelated-histories', 'allow-unrelated-histories', undefined, 'Merge histories with no common commit.'),
      quiet,
    ],
  },
  revert: {
    name: 'revert',
    owner: 'engine-a',
    summary: 'Revert some existing commits',
    usage: ['git revert [--[no-]edit] [-n] [-m <parent-number>] <commit>...', 'git revert (--continue | --skip | --abort | --quit)'],
    options: [
      flag('edit', 'edit', 'e', 'Open the editor for the message (default).', true),
      flag('no-commit', 'no-commit', 'n', 'Undo the changes but do not commit yet.'),
      value('mainline', 'mainline', 'm', '<parent-number>', 'For merge commits: which parent to keep.'),
      flag('continue', 'continue', undefined, 'Continue after fixing conflicts.'),
      flag('skip', 'skip', undefined, 'Skip the current commit.'),
      flag('abort', 'abort', undefined, 'Cancel the revert.'),
      flag('quit', 'quit', undefined, 'Forget the revert in progress.'),
    ],
  },

  // ------------------------------------------------------------------ Engine B
  reset: {
    name: 'reset',
    owner: 'engine-b',
    summary: 'Reset current HEAD to the specified state',
    usage: ['git reset [--soft | --mixed | --hard] [-q] [<commit>]', 'git reset [-q] [<tree-ish>] [--] <pathspec>...'],
    options: [
      flag('soft', 'soft', undefined, 'Move the branch only; keep staging area and files.'),
      flag('mixed', 'mixed', undefined, 'Move the branch and reset the staging area (default).'),
      flag('hard', 'hard', undefined, 'Move the branch and reset staging area AND files. Changes are lost!'),
      quiet,
    ],
  },
  stash: {
    name: 'stash',
    owner: 'engine-b',
    summary: 'Stash the changes in a dirty working directory away',
    usage: ['git stash list', 'git stash show [-p] [<stash>]', 'git stash drop [-q] [<stash>]', 'git stash pop [--index] [-q] [<stash>]', 'git stash apply [--index] [-q] [<stash>]', 'git stash [push [-u | --include-untracked] [-m <message>]]', 'git stash clear'],
    defaultSubcommand: 'push',
    options: [],
    subcommands: {
      push: {
        name: 'push',
        summary: 'Save your changes and clean the working folder',
        usage: ['git stash [push [-u | --include-untracked] [-m <message>] [--] [<pathspec>...]]'],
        options: [
          value('message', 'message', 'm', '<message>', 'Describe the stash.'),
          flag('include-untracked', 'include-untracked', 'u', 'Also stash new (untracked) files.'),
          quiet,
        ],
      },
      list: { name: 'list', summary: 'List stashes', usage: ['git stash list'], options: [] },
      show: { name: 'show', summary: 'Show the changes in a stash', usage: ['git stash show [-p] [<stash>]'], options: [flag('patch', 'patch', 'p', 'Show the full changes.'), flag('stat', 'stat', undefined, 'Show a summary (default).')] },
      pop: { name: 'pop', summary: 'Apply a stash and remove it from the list', usage: ['git stash pop [--index] [-q] [<stash>]'], options: [flag('index', 'index', undefined, 'Also restore the staging area.'), quiet] },
      apply: { name: 'apply', summary: 'Apply a stash and keep it in the list', usage: ['git stash apply [--index] [-q] [<stash>]'], options: [flag('index', 'index', undefined, 'Also restore the staging area.'), quiet] },
      drop: { name: 'drop', summary: 'Delete a stash', usage: ['git stash drop [-q] [<stash>]'], options: [quiet] },
      clear: { name: 'clear', summary: 'Delete all stashes', usage: ['git stash clear'], options: [] },
    },
  },
  reflog: {
    name: 'reflog',
    owner: 'engine-b',
    summary: 'Manage reflog information',
    usage: ['git reflog [show] [<log-options>] [<ref>]'],
    defaultSubcommand: 'show',
    numericOption: 'max-count',
    options: [],
    subcommands: {
      show: {
        name: 'show',
        summary: 'Show the reflog (where HEAD has been)',
        usage: ['git reflog [show] [-n <number>] [<ref>]'],
        options: [value('max-count', 'max-count', 'n', '<number>', 'Show at most this many entries.'), flag('all', 'all', undefined, 'Show reflogs of all refs.'), flag('oneline', 'oneline', undefined, 'One line per entry (default).'), optional('pretty', ['pretty', 'format'], undefined, '<format>', 'Choose the output format.')],
      },
    },
  },

  // ------------------------------------------------------------------ Remote
  remote: {
    name: 'remote',
    owner: 'remote',
    summary: 'Manage set of tracked repositories',
    usage: ['git remote [-v | --verbose]', 'git remote add <name> <url>', 'git remote rename <old> <new>', 'git remote remove <name>', 'git remote set-url <name> <newurl>', 'git remote get-url <name>', 'git remote show <name>'],
    defaultSubcommand: 'list',
    options: [count('verbose', 'verbose', 'v', 'Show the URL of each remote.')],
    subcommands: {
      list: { name: 'list', summary: 'List remotes', usage: ['git remote [-v]'], options: [count('verbose', 'verbose', 'v', 'Show the URL of each remote.')] },
      add: { name: 'add', summary: 'Add a remote', usage: ['git remote add [-f] <name> <url>'], options: [flag('fetch', undefined, 'f', 'Fetch right after adding.')] },
      remove: { name: 'remove', summary: 'Remove a remote', usage: ['git remote remove <name>'], options: [], aliases: ['rm'] },
      rename: { name: 'rename', summary: 'Rename a remote', usage: ['git remote rename <old> <new>'], options: [] },
      'set-url': { name: 'set-url', summary: 'Change the URL of a remote', usage: ['git remote set-url <name> <newurl>'], options: [] },
      'get-url': { name: 'get-url', summary: 'Print the URL of a remote', usage: ['git remote get-url <name>'], options: [] },
      show: { name: 'show', summary: 'Show information about a remote', usage: ['git remote show <name>'], options: [] },
      prune: { name: 'prune', summary: 'Delete stale remote-tracking branches', usage: ['git remote prune <name>'], options: [] },
    },
  },
  clone: {
    name: 'clone',
    owner: 'remote',
    summary: 'Clone a repository into a new directory',
    usage: ['git clone [<options>] [--] <repo> [<dir>]'],
    options: [value('branch', 'branch', 'b', '<name>', 'Check out this branch instead of the default.'), value('origin', 'origin', 'o', '<name>', 'Use this name instead of "origin".'), quiet],
  },
  fetch: {
    name: 'fetch',
    owner: 'remote',
    summary: 'Download objects and refs from another repository',
    usage: ['git fetch [<options>] [<repository> [<refspec>...]]', 'git fetch --all'],
    options: [flag('all', 'all', undefined, 'Fetch all remotes.'), flag('prune', 'prune', 'p', 'Remove remote-tracking branches that no longer exist.'), count('verbose', 'verbose', 'v', 'Show more detail.'), quiet],
  },
  pull: {
    name: 'pull',
    owner: 'remote',
    summary: 'Fetch from and integrate with another repository or a local branch',
    usage: ['git pull [<options>] [<repository> [<refspec>...]]'],
    options: [
      flag('ff', 'ff', undefined, 'Fast-forward when possible.', true),
      flag('ff-only', 'ff-only', undefined, 'Only update if it can fast-forward.'),
      flag('edit', 'edit', 'e', 'Edit the merge message.', true),
      count('verbose', 'verbose', 'v', 'Show more detail.'),
      quiet,
    ],
  },
  push: {
    name: 'push',
    owner: 'remote',
    summary: 'Update remote refs along with associated objects',
    usage: ['git push [<options>] [<repository> [<refspec>...]]'],
    options: [
      flag('set-upstream', 'set-upstream', 'u', 'Remember this remote branch as the upstream.'),
      flag('delete', 'delete', 'd', 'Delete the remote branch.'),
      count('verbose', 'verbose', 'v', 'Show more detail.'),
      quiet,
    ],
  },
};

/** Top-level git options accepted before the subcommand. */
export const GIT_GLOBAL_OPTIONS: OptionSpec[] = [
  value('C', undefined, 'C', '<path>', 'Run as if git was started in <path>.'),
  list('c', undefined, 'c', '<name>=<value>', 'Set a config value for this command only.'),
  flag('version', 'version', 'v', 'Print the git version.'),
  flag('help', 'help', 'h', 'Show help.'),
  flag('no-pager', 'no-pager', 'P', 'Do not page output.'),
];

/** Version string printed by `git --version`. */
export const SIMULATED_GIT_VERSION = 'git version 2.52.0';

export function allGitCommandNames(): string[] {
  return Object.keys(GIT_COMMANDS);
}
