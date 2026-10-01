/**
 * Pure derivation of what the world view shows: the three boxes (working
 * folder, staging area, repository), the remote box and folder trees.
 * Everything is computed from the World alone; events only drive motion.
 */
import { computeStatus } from '../../engine/a/status';
import { listDir } from '../../engine/core/fs';
import { join, normalize, resolvePath, tildify } from '../../engine/core/paths';
import { findRepo, listWorkTree } from '../../engine/core/repo';
import { hostedRepoForUrl } from '../../remote';
import type { LevelDefinition } from '../../shared/level';
import type { AbsPath, ChangeKind, HostedRepo, Machine, RepoState, StatusSummary, World } from '../../shared/types';

export type FileBadge = 'untracked' | 'modified' | 'deleted' | 'conflict' | 'staged' | 'ignored';

export interface WorkingFile {
  /** Repo-relative path. */
  path: string;
  badges: FileBadge[];
  /** False for files deleted from the working folder (still tracked or staged as deleted). */
  exists: boolean;
}

export interface StagingEntry {
  path: string;
  kind: ChangeKind | 'conflict';
  from?: string;
}

export interface RepoView {
  root: AbsPath;
  repo: RepoState;
  status: StatusSummary;
  working: WorkingFile[];
  staging: StagingEntry[];
  /** Files in the index that are the same as in the last commit. */
  unchangedInIndex: number;
}

/** The repository the world view shows: the one around the cwd, else the level's workdir, else the only repo. */
export function currentRepoRoot(world: World, machineId: string, workdir?: string): AbsPath | null {
  const machine = world.machines[machineId];
  if (!machine) return null;
  const handle = findRepo(world, machineId);
  if (handle && !handle.repo.bare) return handle.root;
  if (workdir) {
    const wd = resolvePath(machine.cwd, machine.home, workdir);
    if (machine.repos[wd] && !machine.repos[wd].bare) return wd;
  }
  const roots = Object.keys(machine.repos).filter((r) => !machine.repos[r].bare);
  return roots.length === 1 ? roots[0] : null;
}

function isIgnored(path: string, ignored: string[]): boolean {
  return ignored.some((ig) => {
    const p = ig.endsWith('/') ? ig.slice(0, -1) : ig;
    return path === p || path.startsWith(`${p}/`);
  });
}

export function deriveRepoView(world: World, machineId: string, root: AbsPath): RepoView | null {
  const machine = world.machines[machineId];
  const repo = machine?.repos[root];
  if (!machine || !repo || repo.bare) return null;
  const status = computeStatus(world, machineId, root);
  if (!status) return null;
  const work = listWorkTree(machine, root);

  const badges = new Map<string, Set<FileBadge>>();
  const add = (p: string, b: FileBadge) => {
    if (!badges.has(p)) badges.set(p, new Set());
    badges.get(p)!.add(b);
  };
  for (const p of Object.keys(work)) if (!badges.has(p)) badges.set(p, new Set());
  for (const s of status.staged) add(s.path, 'staged');
  for (const u of status.unstaged) add(u.path, u.kind === 'deleted' ? 'deleted' : 'modified');
  for (const p of status.untracked) add(p, 'untracked');
  for (const c of status.conflicted) add(c.path, 'conflict');
  for (const p of Object.keys(work)) if (isIgnored(p, status.ignored)) add(p, 'ignored');
  for (const s of status.staged) if (s.kind === 'deleted' && work[s.path] === undefined) add(s.path, 'deleted');

  const order: FileBadge[] = ['conflict', 'untracked', 'modified', 'deleted', 'staged', 'ignored'];
  const working: WorkingFile[] = [...badges.entries()]
    .map(([path, set]) => ({ path, exists: work[path] !== undefined, badges: order.filter((b) => set.has(b)) }))
    .filter((f) => f.exists || f.badges.length > 0)
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const staging: StagingEntry[] = [
    ...status.conflicted.map((c) => ({ path: c.path, kind: 'conflict' as const })),
    ...status.staged.map((s) => ({ path: s.path, kind: s.kind, from: s.from })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const changed = new Set(status.staged.map((s) => s.path));
  const unchangedInIndex = Object.keys(repo.index.entries).filter((p) => !changed.has(p)).length;
  return { root, repo, status, working, staging, unchangedInIndex };
}

// ---------------------------------------------------------------------------
// Folder trees (chapter 0 working folder, file tree panel)
// ---------------------------------------------------------------------------

export interface TreeNode {
  /** Absolute path. */
  path: string;
  /** Path relative to the tree root. */
  rel: string;
  name: string;
  isDir: boolean;
  depth: number;
}

export interface FolderTreeOptions {
  /** Include ".git" entries (as a closed folder). */
  showGitDir?: boolean;
  maxDepth?: number;
  maxEntries?: number;
}

/** Depth-first listing of a directory (folders first, then files, by name). */
export function folderTree(machine: Machine, root: AbsPath, options: FolderTreeOptions = {}): TreeNode[] {
  const maxDepth = options.maxDepth ?? 8;
  const maxEntries = options.maxEntries ?? 400;
  const out: TreeNode[] = [];
  const base = normalize(root);
  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;
    const entries = listDir(machine.fs, dir).sort((a, b) => (a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      if (out.length >= maxEntries) return;
      const path = join(dir, e.name);
      if (e.name === '.git') {
        if (options.showGitDir) out.push({ path, rel: path.slice(base === '/' ? 1 : base.length + 1), name: e.name, isDir: true, depth });
        continue;
      }
      out.push({ path, rel: path.slice(base === '/' ? 1 : base.length + 1), name: e.name, isDir: e.isDir, depth });
      if (e.isDir) walk(path, depth + 1);
    }
  };
  walk(base, 0);
  return out;
}

/** Root folder of the file tree panel: the repo around the cwd, else the cwd. */
export function fileTreeRoot(world: World, machineId: string): AbsPath | null {
  const machine = world.machines[machineId];
  if (!machine) return null;
  const handle = findRepo(world, machineId);
  if (handle && !handle.repo.bare && !handle.insideGitDir) return handle.root;
  return machine.cwd;
}

/** Root of the chapter-0 folder view: home when the cwd is inside it, else "/". */
export function folderViewRoot(machine: Machine): AbsPath {
  const cwd = normalize(machine.cwd);
  return cwd === machine.home || cwd.startsWith(`${machine.home}/`) ? machine.home : '/';
}

export function displayPath(machine: Machine, abs: AbsPath): string {
  return tildify(abs, machine.home);
}

// ---------------------------------------------------------------------------
// Remote box
// ---------------------------------------------------------------------------

export interface RemoteInfo {
  /** Remote name ("origin"), or null when shown without a connection. */
  name: string | null;
  url: string | null;
  hosted: HostedRepo | null;
}

/** Remotes configured in a repository: name -> url, in config order with origin first. */
export function remotesOf(repo: RepoState): { name: string; url: string }[] {
  const out: { name: string; url: string }[] = [];
  for (const [k, v] of Object.entries(repo.config)) {
    const m = /^remote\.(.+)\.url$/.exec(k);
    if (m) out.push({ name: m[1], url: v.split('\n')[0] });
  }
  return out.sort((a, b) => (a.name === 'origin' ? -1 : b.name === 'origin' ? 1 : a.name.localeCompare(b.name)));
}

/**
 * Remotes to show in the remote box. With no remote configured, the hosted
 * repos owned by the player (or all hosted repos) are shown "not connected".
 */
export function remoteCandidates(world: World, repo: RepoState | null): RemoteInfo[] {
  if (repo) {
    const remotes = remotesOf(repo);
    if (remotes.length) return remotes.map((r) => ({ name: r.name, url: r.url, hosted: hostedRepoForUrl(world, r.url) }));
  }
  const hosted = Object.values(world.hosted).sort((a, b) => {
    const av = a.owner === world.hub.viewer ? 0 : 1;
    const bv = b.owner === world.hub.viewer ? 0 : 1;
    return av - bv || a.id.localeCompare(b.id);
  });
  return hosted.map((h) => ({ name: null, url: null, hosted: h }));
}

// ---------------------------------------------------------------------------
// Panel visibility
// ---------------------------------------------------------------------------

export interface PanelVisibility {
  /** Full three boxes + graph; false = working folder only. */
  boxes: boolean;
  editor: boolean;
  remote: boolean;
  hub: boolean;
  terminalOnly: boolean;
}

export function panelVisibility(level: LevelDefinition | null, world: World, hasRepo: boolean): PanelVisibility {
  if (!level) {
    const hosted = Object.keys(world.hosted).length > 0;
    return { boxes: true, editor: true, remote: hosted || hasRemoteAnywhere(world), hub: true, terminalOnly: false };
  }
  const p = level.ui?.panels ?? {};
  const terminalOnly = level.ui?.terminalOnly ?? false;
  return {
    boxes: p.world ?? (level.chapter >= 1 || hasRepo),
    editor: p.editor ?? true,
    remote: p.remote ?? level.chapter >= 6,
    hub: p.hub ?? level.chapter >= 6,
    terminalOnly,
  };
}

function hasRemoteAnywhere(world: World): boolean {
  return Object.values(world.machines).some((m) => Object.values(m.repos).some((r) => remotesOf(r).length > 0));
}
