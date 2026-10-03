/**
 * Repository discovery, refs, reflog and config helpers.
 * Readers take plain state; writers mutate drafts inside immer `produce`.
 */
import type { AbsPath, Hash, HeadState, Machine, ReflogEntry, RepoState, Signature, World } from '../../shared/types';
import { ZERO_HASH } from '../../shared/constants';
import { filesUnder } from './fs';
import { dirname, isWithin, join, normalize } from './paths';

export function createEmptyRepo(options: { bare?: boolean; initialBranch?: string } = {}): RepoState {
  const branch = options.initialBranch ?? 'main';
  return {
    bare: options.bare ?? false,
    objects: {},
    refs: {},
    symrefs: {},
    head: { type: 'symbolic', ref: `refs/heads/${branch}` },
    reflog: {},
    index: { entries: {}, conflicts: {} },
    config: options.bare
      ? { 'core.repositoryformatversion': '0', 'core.filemode': 'true', 'core.bare': 'true' }
      : { 'core.repositoryformatversion': '0', 'core.filemode': 'true', 'core.bare': 'false', 'core.logallrefupdates': 'true' },
    special: {},
  };
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

export interface RepoHandle {
  machine: Machine;
  /** Work tree root (the key in machine.repos). */
  root: AbsPath;
  repo: RepoState;
  /** cwd relative to root ("" at the root), POSIX. */
  prefix: string;
  /** True when cwd is inside the .git directory itself. */
  insideGitDir: boolean;
}

/** Find the repository containing `cwd` (default: the machine's cwd), walking up like git. */
export function findRepo(world: World, machineId: string, cwd?: AbsPath): RepoHandle | null {
  const machine = world.machines[machineId];
  if (!machine) return null;
  let dir = normalize(cwd ?? machine.cwd);
  let insideGitDir = false;
  const gitIdx = dir.split('/').indexOf('.git');
  if (gitIdx > 0) {
    insideGitDir = true;
    dir = dir.split('/').slice(0, gitIdx).join('/') || '/';
  }
  if (!dir.startsWith('/')) return null;
  for (;;) {
    const repo = machine.repos[dir];
    if (repo) {
      const cwdN = normalize(cwd ?? machine.cwd);
      const prefix = insideGitDir || cwdN === dir ? '' : cwdN.slice(dir === '/' ? 1 : dir.length + 1);
      return { machine, root: dir, repo, prefix, insideGitDir };
    }
    if (dir === '/') return null;
    dir = dirname(dir);
  }
}

/** "fatal: not a git repository (or any of the parent directories): .git" */
export const NOT_A_REPO = 'not a git repository (or any of the parent directories): .git';

/**
 * Tracked-or-not files of a work tree: repo path -> content.
 * Excludes .git and anything inside nested repositories.
 */
export function listWorkTree(machine: Machine, root: AbsPath): Record<string, string> {
  const out: Record<string, string> = {};
  const nested = Object.keys(machine.repos).filter((r) => r !== root && isWithin(root, r));
  for (const abs of filesUnder(machine.fs, root)) {
    const rel = abs.slice(root === '/' ? 1 : root.length + 1);
    if (rel === '.git' || rel.startsWith('.git/') || rel.split('/').includes('.git')) continue;
    if (nested.some((n) => isWithin(n, abs))) continue;
    out[rel] = machine.fs.files[abs];
  }
  return out;
}

/** Absolute path of a repo-relative path. */
export function absOf(root: AbsPath, repoPath: string): AbsPath {
  return join(root, repoPath);
}

/** Repo-relative path of an absolute path, or null if outside the work tree. */
export function repoPathOf(root: AbsPath, abs: AbsPath): string | null {
  const n = normalize(abs);
  if (!isWithin(root, n)) return null;
  if (n === root) return '';
  return n.slice(root === '/' ? 1 : root.length + 1);
}

// ---------------------------------------------------------------------------
// HEAD and refs (readers)
// ---------------------------------------------------------------------------

/** Branch short name if HEAD is symbolic ("main"), else null. */
export function currentBranch(repo: RepoState): string | null {
  return repo.head.type === 'symbolic' && repo.head.ref.startsWith('refs/heads/') ? repo.head.ref.slice('refs/heads/'.length) : null;
}

/** Commit hash HEAD points at, or null when unborn. */
export function headCommit(repo: RepoState): Hash | null {
  if (repo.head.type === 'detached') return repo.head.hash;
  return readRef(repo, repo.head.ref);
}

/**
 * Resolve git's reflog revision syntax `<ref>@{n}`: where `<ref>` pointed n
 * moves ago. Returns undefined when `name` is not that syntax, so callers can
 * fall through to their other rules; returns null when it is but cannot
 * resolve.
 *
 * Reflogs are stored oldest-first, so `@{0}` is the newest entry's new value
 * and `@{n}` is the old value of the entry n from the end — matching real git.
 */
export function resolveReflogRev(repo: RepoState, name: string): Hash | null | undefined {
  const m = /^(.*)@\{(\d+)\}$/.exec(name);
  if (!m) return undefined;
  const refName = m[1] === '' || m[1] === '@' ? 'HEAD' : m[1];
  const n = Number.parseInt(m[2], 10);

  const full = refName === 'HEAD' ? 'HEAD' : (dwimRef(repo, refName) ?? `refs/heads/${refName}`);
  const log = repo.reflog[full] ?? (full === 'HEAD' ? repo.reflog.HEAD : undefined);
  if (!log || log.length === 0) return null;

  if (n === 0) return log[log.length - 1].new;
  const entry = log[log.length - n];
  if (!entry) return null;
  return entry.old === ZERO_HASH ? null : entry.old;
}

/** Read a full ref name, following symrefs. */
export function readRef(repo: RepoState, ref: string): Hash | null {
  let r = ref;
  for (let i = 0; i < 10; i++) {
    if (r === 'HEAD') return headCommit(repo);
    const sym = repo.symrefs[r];
    if (sym) {
      r = sym;
      continue;
    }
    return repo.refs[r] ?? null;
  }
  return null;
}

/**
 * Expand a short ref name to a full ref name using git's DWIM order:
 * <name>, refs/<name>, refs/tags/<name>, refs/heads/<name>, refs/remotes/<name>, refs/remotes/<name>/HEAD.
 */
export function dwimRef(repo: RepoState, name: string): string | null {
  const candidates = [name, `refs/${name}`, `refs/tags/${name}`, `refs/heads/${name}`, `refs/remotes/${name}`, `refs/remotes/${name}/HEAD`];
  for (const c of candidates) {
    if (c === 'HEAD') return 'HEAD';
    if (repo.refs[c] !== undefined || repo.symrefs[c] !== undefined) return c;
  }
  return null;
}

export function branchNames(repo: RepoState): string[] {
  return Object.keys(repo.refs)
    .filter((r) => r.startsWith('refs/heads/'))
    .map((r) => r.slice('refs/heads/'.length))
    .sort();
}

export function tagNames(repo: RepoState): string[] {
  return Object.keys(repo.refs)
    .filter((r) => r.startsWith('refs/tags/'))
    .map((r) => r.slice('refs/tags/'.length))
    .sort();
}

/** Remote-tracking refs as "origin/main". */
export function remoteBranchNames(repo: RepoState): string[] {
  return Object.keys(repo.refs)
    .filter((r) => r.startsWith('refs/remotes/'))
    .map((r) => r.slice('refs/remotes/'.length))
    .sort();
}

/** Should updates to this ref be logged? Mirrors core.logAllRefUpdates=true for non-bare repos. */
export function shouldLogRef(repo: RepoState, ref: string): boolean {
  if (ref === 'refs/stash') return true;
  if (repo.bare) return repo.reflog[ref] !== undefined;
  return ref === 'HEAD' || ref.startsWith('refs/heads/') || ref.startsWith('refs/remotes/') || ref.startsWith('refs/notes/') || repo.reflog[ref] !== undefined;
}

// ---------------------------------------------------------------------------
// Refs (writers, on drafts)
// ---------------------------------------------------------------------------

export function appendReflog(repo: RepoState, ref: string, entry: ReflogEntry): void {
  if (!repo.reflog[ref]) repo.reflog[ref] = [];
  repo.reflog[ref].push(entry);
}

/**
 * Set a ref and write reflog entries like git: the ref's own log, plus
 * HEAD's log when HEAD is a symbolic ref to it.
 */
export function updateRef(repo: RepoState, ref: string, newHash: Hash, who: Signature, message: string): void {
  const old = repo.refs[ref] ?? ZERO_HASH;
  repo.refs[ref] = newHash;
  if (shouldLogRef(repo, ref)) appendReflog(repo, ref, { old, new: newHash, who, message });
  if (repo.head.type === 'symbolic' && repo.head.ref === ref && !repo.bare) {
    appendReflog(repo, 'HEAD', { old, new: newHash, who, message });
  }
}

/** Delete a ref and its reflog (as `git branch -d` does). */
export function deleteRef(repo: RepoState, ref: string): void {
  delete repo.refs[ref];
  delete repo.reflog[ref];
  for (const [k, v] of Object.entries(repo.symrefs)) if (v === ref) delete repo.symrefs[k];
}

/**
 * Move HEAD (checkout/switch). Writes a HEAD reflog entry with `message`,
 * e.g. "checkout: moving from main to feature".
 */
export function setHead(repo: RepoState, head: HeadState, who: Signature, message: string): void {
  const old = headCommit(repo) ?? ZERO_HASH;
  repo.head = head;
  const now = headCommit(repo) ?? ZERO_HASH;
  if (!repo.bare) appendReflog(repo, 'HEAD', { old, new: now, who, message });
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/** Effective config value: repo-local wins over global. */
export function getConfig(machine: Machine | undefined, repo: RepoState | undefined, key: string): string | undefined {
  const k = normalizeConfigKey(key);
  if (repo && repo.config[k] !== undefined) return repo.config[k];
  return machine?.globalConfig[k];
}

/**
 * Git config keys are case-insensitive in the section and variable name but
 * case-sensitive in the subsection: "Branch.Main.Remote" -> "branch.Main.remote".
 */
export function normalizeConfigKey(key: string): string {
  const parts = key.split('.');
  if (parts.length < 2) return key.toLowerCase();
  const section = parts[0].toLowerCase();
  const name = parts[parts.length - 1].toLowerCase();
  const sub = parts.slice(1, -1).join('.');
  return sub ? `${section}.${sub}.${name}` : `${section}.${name}`;
}

/** Configured identity, or null when user.name / user.email are missing. */
export function configuredIdentity(machine: Machine, repo: RepoState | undefined): { name: string; email: string } | null {
  const name = getConfig(machine, repo, 'user.name');
  const email = getConfig(machine, repo, 'user.email');
  if (!name || !email) return null;
  return { name, email };
}

/** Signature for "now" using config identity, falling back like git does for reflogs. */
export function signatureFor(world: World, machine: Machine, repo: RepoState | undefined): Signature {
  const id = configuredIdentity(machine, repo);
  return {
    name: id?.name ?? machine.user,
    email: id?.email ?? `${machine.user}@${machine.host}.(none)`,
    timestamp: world.clock,
    timezone: '+0000',
  };
}
