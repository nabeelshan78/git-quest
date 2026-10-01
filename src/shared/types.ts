/**
 * FROZEN CONTRACT — engine and world state types.
 *
 * Everything the game simulates lives in one immutable, JSON-serialisable
 * `World` value. Commands never mutate a World; they return a new one
 * (use immer's `produce`). No Map/Set/class instances anywhere in here, so
 * snapshots can be stored for rewind and compared structurally.
 *
 * Only the orchestrator may change this file.
 */

/** 40-char lowercase hex SHA-1 object id, computed exactly like real git. */
export type Hash = string;

/** Absolute POSIX path on a simulated machine, e.g. "/home/intern/festival". */
export type AbsPath = string;

/** Path relative to a repository's work tree root, POSIX separators, no leading "./". */
export type RepoPath = string;

export type MachineId = string;

/** "owner/name" id of a repository hosted on the simulated GitHub. */
export type HostedRepoId = string;

// ---------------------------------------------------------------------------
// Git objects (mirrors git's real object model)
// ---------------------------------------------------------------------------

export type FileMode = '100644' | '100755' | '040000' | '120000' | '160000';

export interface Signature {
  name: string;
  email: string;
  /** Unix seconds. */
  timestamp: number;
  /** Timezone offset exactly as git writes it, e.g. "+0000". */
  timezone: string;
}

export interface BlobObject {
  type: 'blob';
  /** File content. The simulator only models text files (UTF-8). */
  content: string;
}

export interface TreeEntry {
  mode: FileMode;
  name: string;
  hash: Hash;
}

export interface TreeObject {
  type: 'tree';
  /** Sorted in git order (see core/objects.ts `sortTreeEntries`). */
  entries: TreeEntry[];
}

export interface CommitObject {
  type: 'commit';
  tree: Hash;
  parents: Hash[];
  author: Signature;
  committer: Signature;
  /** Full message as stored by git, normally ending with "\n". */
  message: string;
}

export interface TagObject {
  type: 'tag';
  object: Hash;
  objectType: 'commit' | 'tree' | 'blob' | 'tag';
  tag: string;
  tagger: Signature;
  /** Full message as stored by git, normally ending with "\n". */
  message: string;
}

export type GitObject = BlobObject | TreeObject | CommitObject | TagObject;
export type GitObjectType = GitObject['type'];

// ---------------------------------------------------------------------------
// Index (staging area)
// ---------------------------------------------------------------------------

export interface IndexEntry {
  path: RepoPath;
  hash: Hash;
  mode: FileMode;
}

/** Unmerged path during a conflict: git's index stages 1 (base), 2 (ours), 3 (theirs). */
export interface ConflictEntry {
  path: RepoPath;
  base?: IndexEntry;
  ours?: IndexEntry;
  theirs?: IndexEntry;
}

export interface IndexState {
  /** Stage-0 entries keyed by path. */
  entries: Record<RepoPath, IndexEntry>;
  /** Unmerged paths keyed by path. A path is never in both `entries` and `conflicts`. */
  conflicts: Record<RepoPath, ConflictEntry>;
}

// ---------------------------------------------------------------------------
// Refs, HEAD, reflog
// ---------------------------------------------------------------------------

export type HeadState =
  | { type: 'symbolic'; ref: string } // e.g. "refs/heads/main" (branch may not exist yet: unborn)
  | { type: 'detached'; hash: Hash };

export interface ReflogEntry {
  /** Previous value; ZERO_HASH when the ref did not exist. */
  old: Hash;
  new: Hash;
  who: Signature;
  /** e.g. "commit (initial): Add homepage", "checkout: moving from main to feature". */
  message: string;
}

// ---------------------------------------------------------------------------
// In-progress operations
// ---------------------------------------------------------------------------

export interface SequencerState {
  /** Multi-commit revert in progress. */
  kind: 'revert';
  todo: Hash[];
  done: Hash[];
  options: Record<string, unknown>;
}

/**
 * Special refs / state files living in .git (MERGE_HEAD, ORIG_HEAD...).
 * Kept outside `refs` because they are not under refs/.
 */
export interface SpecialRefs {
  ORIG_HEAD?: Hash;
  MERGE_HEAD?: Hash[];
  REVERT_HEAD?: Hash;
  FETCH_HEAD?: { hash: Hash; description: string; forMerge: boolean }[];
  AUTO_MERGE?: Hash;
}

// ---------------------------------------------------------------------------
// Editor requests (git opening $EDITOR)
// ---------------------------------------------------------------------------

export type EditorPurpose =
  | 'commit-message' // git commit without -m, revert, amend
  | 'merge-message' // committing a merge after resolving conflicts
  | 'other';

/**
 * Pending editor: git is "waiting for your editor to close the file".
 * The command that opened it is suspended; `resumeEditor` continues it.
 */
export interface EditorRequest {
  purpose: EditorPurpose;
  /** Path of the file git opened, as git names it, e.g. ".git/COMMIT_EDITMSG". */
  file: string;
  /** Initial text shown in the editor (includes git's "#" comment lines). */
  initialContent: string;
  /** Which command opened it, for display: e.g. "git commit". */
  command: string;
  /** Machine + repo the editor belongs to. */
  machine: MachineId;
  workTree: AbsPath;
  /** Opaque, JSON-serialisable continuation data for the owning command. */
  resume: { handler: string; data: Record<string, unknown> };
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface RepoState {
  /** True for repositories on the simulated GitHub and `git init --bare`. */
  bare: boolean;
  /** Content-addressed object store. */
  objects: Record<Hash, GitObject>;
  /** Full ref names -> hash: "refs/heads/main", "refs/tags/v1.0", "refs/remotes/origin/main", "refs/stash". */
  refs: Record<string, Hash>;
  /** Symbolic refs other than HEAD, e.g. "refs/remotes/origin/HEAD" -> "refs/remotes/origin/main". */
  symrefs: Record<string, string>;
  head: HeadState;
  /** Reflogs by ref name, oldest first: "HEAD", "refs/heads/main", "refs/stash"... */
  reflog: Record<string, ReflogEntry[]>;
  index: IndexState;
  /**
   * Repository-local config (.git/config) as flat "section.key" / "section.sub.key" -> value,
   * e.g. "remote.origin.url", "branch.main.remote", "branch.main.merge", "core.bare".
   * Multi-valued keys store values joined by "\n".
   */
  config: Record<string, string>;
  special: SpecialRefs;
  /** Content of .git/MERGE_MSG while a merge/revert is stopped. */
  mergeMsg?: string;
  sequencer?: SequencerState;
  /** Content of .git/info/exclude style extra ignore rules (rarely used). */
  infoExclude?: string;
}

// ---------------------------------------------------------------------------
// Machines (a laptop with a filesystem, shell and repositories)
// ---------------------------------------------------------------------------

export interface FsState {
  /** Absolute file path -> text content. */
  files: Record<AbsPath, string>;
  /**
   * Every directory that exists, including all ancestors of every file.
   * Invariant maintained by core/fs.ts helpers.
   */
  dirs: Record<AbsPath, true>;
}

export interface Machine {
  id: MachineId;
  /** Shown on terminal tabs, e.g. "Your laptop". */
  label: string;
  /** Shell user, e.g. "intern". */
  user: string;
  /** Hostname in the prompt, e.g. "laptop". */
  host: string;
  home: AbsPath;
  cwd: AbsPath;
  fs: FsState;
  /** ~/.gitconfig as flat keys ("user.name", "alias.co", "pull.rebase"...). */
  globalConfig: Record<string, string>;
  /**
   * Repositories on this machine keyed by work tree root (or by git dir for bare repos).
   * A directory D is a repo iff repos[D] exists; D/.git is then listed in fs.dirs.
   */
  repos: Record<AbsPath, RepoState>;
  /** Pending editor opened by a git command on this machine. */
  editor: EditorRequest | null;
  /** Shell history, most recent last. */
  history: string[];
  /** Simulated ~/.ssh keys and credentials. */
  ssh: { keys: SshKeyPair[]; knownHosts: string[] };
  /** Shell environment variables. */
  env: Record<string, string>;
}

export interface SshKeyPair {
  /** e.g. "~/.ssh/id_ed25519" (absolute path). */
  privatePath: AbsPath;
  publicPath: AbsPath;
  type: 'ed25519' | 'rsa';
  /** Public key text, e.g. "ssh-ed25519 AAAA... you@example.com". */
  publicKey: string;
  comment: string;
}

// ---------------------------------------------------------------------------
// Simulated GitHub
// ---------------------------------------------------------------------------

export interface HubUser {
  login: string;
  name: string;
  /** Hex colour for the generated avatar. */
  color: string;
  bot?: boolean;
}

export interface HubComment {
  id: number;
  author: string;
  body: string;
  createdAt: number;
}

export interface Issue {
  number: number;
  title: string;
  body: string;
  author: string;
  state: 'open' | 'closed';
  stateReason?: 'completed' | 'not_planned';
  assignees: string[];
  labels: string[];
  comments: HubComment[];
  /** Commits (hash) and PRs (number) that mention this issue. */
  references: { kind: 'commit' | 'pull'; ref: string; by: string; at: number; closes: boolean }[];
  createdAt: number;
  closedAt?: number;
  closedBy?: { kind: 'user' | 'commit' | 'pull'; ref: string };
}

export interface ReviewComment {
  id: number;
  author: string;
  path: RepoPath;
  line: number;
  body: string;
  commit: Hash;
  createdAt: number;
  /** id of the comment this replies to, if any. */
  inReplyTo?: number;
  resolved?: boolean;
}

export interface Review {
  id: number;
  author: string;
  state: 'APPROVED' | 'CHANGES_REQUESTED' | 'COMMENTED' | 'DISMISSED';
  body: string;
  commit: Hash;
  submittedAt: number;
}

export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface PullRequest {
  number: number;
  title: string;
  body: string;
  author: string;
  /** Head branch (always in the same repo; forks are out of scope). */
  head: { repo: HostedRepoId; branch: string };
  base: string;
  state: 'open' | 'closed' | 'merged';
  draft: boolean;
  requestedReviewers: string[];
  reviews: Review[];
  comments: HubComment[];
  reviewComments: ReviewComment[];
  labels: string[];
  assignees: string[];
  createdAt: number;
  /** Head commit when the PR was merged/closed (while open, read the live branch). */
  headSha?: Hash;
  /** Base commit the PR was opened against (for diffs). */
  baseSha?: Hash;
  merged?: { by: string; at: number; method: MergeMethod; commit: Hash };
  closedAt?: number;
}

export interface HostedRepo {
  id: HostedRepoId;
  owner: string;
  name: string;
  description: string;
  visibility: 'public' | 'private';
  /** Bare repository holding the actual git data. */
  repo: RepoState;
  defaultBranch: string;
  collaborators: string[];
  issues: Issue[];
  pulls: PullRequest[];
  labels: { name: string; color: string; description: string }[];
  settings: {
    allowMergeCommit: boolean;
    allowSquashMerge: boolean;
    allowRebaseMerge: boolean;
    deleteBranchOnMerge: boolean;
  };
  /** Shared counter for issue + PR numbers, like GitHub. */
  nextNumber: number;
  /** Counter for comment/review ids. */
  nextId: number;
  createdAt: number;
}

export interface HubState {
  /** Login of the player on the simulated GitHub. */
  viewer: string;
  users: Record<string, HubUser>;
  /** SSH public keys registered to the viewer's account. */
  sshKeys: { id: number; title: string; key: string; addedAt: number }[];
  /** Personal access tokens created by the viewer. */
  tokens: { id: number; name: string; scopes: string[]; token: string; createdAt: number }[];
  /** When true, pushes need working credentials (an SSH key or token registered on the hub). */
  requireAuth: boolean;
  notifications: { id: number; text: string; repo?: HostedRepoId; at: number; read: boolean }[];
  nextId: number;
}

// ---------------------------------------------------------------------------
// World
// ---------------------------------------------------------------------------

export interface World {
  version: 1;
  /** Simulated wall clock in unix seconds; used for every timestamp git writes. */
  clock: number;
  machines: Record<MachineId, Machine>;
  /** Machine the terminal is attached to. */
  activeMachine: MachineId;
  /** Repositories on the simulated GitHub. */
  hosted: Record<HostedRepoId, HostedRepo>;
  hub: HubState;
}

// ---------------------------------------------------------------------------
// Derived views (computed by the engine for UI and goal checks)
// ---------------------------------------------------------------------------

export type ChangeKind = 'added' | 'modified' | 'deleted' | 'renamed' | 'typechange';

export interface StatusSummary {
  /** Work tree root of the repo. */
  root: AbsPath;
  branch: string | null; // null when detached
  detachedAt: Hash | null;
  unborn: boolean; // no commits yet on the current branch
  head: Hash | null;
  upstream: { name: string; ahead: number; behind: number; gone: boolean } | null;
  /** HEAD vs index. */
  staged: { path: RepoPath; kind: ChangeKind; from?: RepoPath }[];
  /** Index vs work tree (tracked files only). */
  unstaged: { path: RepoPath; kind: ChangeKind }[];
  untracked: RepoPath[];
  ignored: RepoPath[];
  conflicted: { path: RepoPath; kind: 'both modified' | 'both added' | 'deleted by us' | 'deleted by them' | 'added by us' | 'added by them' | 'both deleted' }[];
  inProgress: null | 'merge' | 'revert';
  clean: boolean; // no staged, unstaged, conflicted (untracked files allowed)
}

/** Where a repository lives. */
export type RepoLocation =
  | { kind: 'local'; machine: MachineId; root: AbsPath }
  | { kind: 'hosted'; id: HostedRepoId };
