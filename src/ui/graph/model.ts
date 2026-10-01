/**
 * Graph input model shared by the repository graph, the remote graph and
 * predict-card pictures, plus builders from a RepoState and from a Picture.
 */
import { getCommit, peel, shortHash, subjectOf } from '../../engine/core/objects';
import type { Picture } from '../../shared/level';
import type { RepoState } from '../../shared/types';

export interface GraphCommit {
  id: string;
  /** What to show as the id ("a1b2c3d", or "C3" in pictures). */
  short: string;
  parents: string[];
  subject: string;
  timestamp: number;
  author?: string;
  /** Only reachable from the reflog (shown faded: "lost" but recoverable). */
  lost?: boolean;
}

export type GraphHead = { kind: 'branch'; name: string } | { kind: 'detached'; id: string } | { kind: 'none' };

export interface GraphInput {
  commits: GraphCommit[];
  /** Local branch name -> commit id. */
  branches: Record<string, string>;
  /** Remote-tracking (or, on a remote graph, nothing) "origin/main" -> commit id. Drawn dashed. */
  remoteBranches: Record<string, string>;
  tags: Record<string, string>;
  head: GraphHead;
  /** Branch kept straight in lane 0. */
  primary: string | null;
  /** True when some commits were left out because the history is long. */
  truncated: boolean;
}

export const MAX_GRAPH_COMMITS = 80;

const PRIMARY_CANDIDATES = ['main', 'master', 'trunk'];

export function pickPrimary(branches: Record<string, string>, head: GraphHead, defaultBranch?: string): string | null {
  if (defaultBranch && branches[defaultBranch]) return defaultBranch;
  for (const b of PRIMARY_CANDIDATES) if (branches[b]) return b;
  if (head.kind === 'branch' && branches[head.name]) return head.name;
  const names = Object.keys(branches).sort();
  return names[0] ?? null;
}

export interface RepoGraphOptions {
  /** Show the HEAD pin (false for hosted repositories). */
  includeHead?: boolean;
  defaultBranch?: string;
  maxCommits?: number;
  /** Extra commit ids to include (e.g. commits only the reflog remembers). */
  extraTips?: string[];
}

/** Build graph input from a repository: every commit reachable from branches, tags, remote-tracking refs and HEAD. */
export function graphFromRepo(repo: RepoState, options: RepoGraphOptions = {}): GraphInput {
  const includeHead = options.includeHead ?? true;
  const max = options.maxCommits ?? MAX_GRAPH_COMMITS;
  const branches: Record<string, string> = {};
  const remoteBranches: Record<string, string> = {};
  const tags: Record<string, string> = {};
  for (const [ref, hash] of Object.entries(repo.refs)) {
    if (ref.startsWith('refs/heads/')) branches[ref.slice(11)] = hash;
    else if (ref.startsWith('refs/remotes/')) {
      const name = ref.slice(13);
      if (!name.endsWith('/HEAD')) remoteBranches[name] = hash;
    } else if (ref.startsWith('refs/tags/')) tags[ref.slice(10)] = peel(repo, hash);
  }
  let head: GraphHead = { kind: 'none' };
  if (includeHead) {
    if (repo.head.type === 'detached') head = { kind: 'detached', id: repo.head.hash };
    else if (repo.head.ref.startsWith('refs/heads/')) head = { kind: 'branch', name: repo.head.ref.slice(11) };
  }

  const tips = [
    ...(head.kind === 'detached' ? [head.id] : []),
    ...Object.values(branches),
    ...Object.values(remoteBranches),
    ...Object.values(tags),
  ];
  const reachable = walk(repo, tips);
  const extra = options.extraTips?.length ? walk(repo, options.extraTips, reachable) : new Map<string, GraphCommit>();
  for (const c of extra.values()) c.lost = true;
  const all = [...reachable.values(), ...extra.values()].sort((a, b) => b.timestamp - a.timestamp);
  const truncated = all.length > max;
  const kept = truncated ? all.slice(0, max) : all;
  const keptIds = new Set(kept.map((c) => c.id));
  const commits = kept.map((c) => ({ ...c, parents: c.parents.filter((p) => keptIds.has(p)) }));

  return { commits, branches, remoteBranches, tags, head, primary: pickPrimary(branches, head, options.defaultBranch), truncated };
}

/** Breadth-first walk over commits from `tips`, skipping commits already in `skip`. */
function walk(repo: RepoState, tips: string[], skip?: Map<string, GraphCommit>): Map<string, GraphCommit> {
  const out = new Map<string, GraphCommit>();
  const queue = [...tips];
  while (queue.length) {
    const id = queue.shift()!;
    if (out.has(id) || skip?.has(id)) continue;
    const c = getCommit(repo, id);
    if (!c) continue;
    out.set(id, { id, short: shortHash(id), parents: c.parents, subject: subjectOf(c.message), timestamp: c.committer.timestamp, author: c.author.name });
    for (const p of c.parents) if (!out.has(p) && !skip?.has(p)) queue.push(p);
  }
  return out;
}

/** Commits the reflog remembers that no branch, tag or HEAD reaches any more. */
export function reflogOnlyTips(repo: RepoState): string[] {
  const tips = new Set<string>();
  for (const entries of Object.values(repo.reflog)) for (const e of entries) if (getCommit(repo, e.new)) tips.add(e.new);
  const live = [
    ...(repo.head.type === 'detached' ? [repo.head.hash] : []),
    ...Object.entries(repo.refs)
      .filter(([r]) => r !== 'refs/stash')
      .map(([, h]) => peel(repo, h)),
  ];
  const reachable = walk(repo, live);
  return [...tips].filter((h) => !reachable.has(h));
}

/** Build graph input from a predict-card / question picture. Picture commits are listed oldest first. */
export function graphFromPicture(picture: Extract<Picture, { kind: 'graph' }>): GraphInput {
  const ids = new Set(picture.commits.map((c) => c.id));
  const commits: GraphCommit[] = picture.commits.map((c, i) => ({
    id: c.id,
    short: c.id,
    parents: c.parents.filter((p) => ids.has(p)),
    subject: c.label ?? '',
    timestamp: i,
  }));
  const branches = { ...picture.branches };
  const head: GraphHead = branches[picture.head] !== undefined ? { kind: 'branch', name: picture.head } : ids.has(picture.head) ? { kind: 'detached', id: picture.head } : { kind: 'none' };
  return {
    commits,
    branches,
    remoteBranches: { ...(picture.remoteBranches ?? {}) },
    tags: { ...(picture.tags ?? {}) },
    head,
    primary: pickPrimary(branches, head),
    truncated: false,
  };
}

/** Commit id HEAD points at (null when unborn or not shown). */
export function headCommitId(g: GraphInput): string | null {
  if (g.head.kind === 'detached') return g.head.id;
  if (g.head.kind === 'branch') return g.branches[g.head.name] ?? null;
  return null;
}

export type GraphLabel =
  | { kind: 'branch'; name: string; current: boolean }
  | { kind: 'remote'; name: string }
  | { kind: 'tag'; name: string }
  | { kind: 'head-detached' };

/** Labels per commit id, in display order: detached HEAD, current branch, other branches, remote-tracking, tags. */
export function labelsByCommit(g: GraphInput): Record<string, GraphLabel[]> {
  const out: Record<string, GraphLabel[]> = {};
  const push = (id: string, l: GraphLabel) => (out[id] ??= []).push(l);
  if (g.head.kind === 'detached') push(g.head.id, { kind: 'head-detached' });
  const current = g.head.kind === 'branch' ? g.head.name : null;
  const branchNames = Object.keys(g.branches).sort((a, b) => (a === current ? -1 : b === current ? 1 : a.localeCompare(b)));
  for (const b of branchNames) push(g.branches[b], { kind: 'branch', name: b, current: b === current });
  for (const r of Object.keys(g.remoteBranches).sort()) push(g.remoteBranches[r], { kind: 'remote', name: r });
  for (const t of Object.keys(g.tags).sort()) push(g.tags[t], { kind: 'tag', name: t });
  return out;
}

/**
 * Stable colour index per branch: the primary branch gets 0, the others
 * follow in name order. Remote-tracking names reuse their branch's colour.
 */
export function branchColorIndex(g: GraphInput): Record<string, number> {
  const names = new Set([...Object.keys(g.branches), ...Object.keys(g.remoteBranches).map((r) => r.slice(r.indexOf('/') + 1))]);
  const ordered = [...names].sort((a, b) => (a === g.primary ? -1 : b === g.primary ? 1 : a.localeCompare(b)));
  const out: Record<string, number> = {};
  ordered.forEach((n, i) => (out[n] = i));
  for (const r of Object.keys(g.remoteBranches)) out[r] = out[r.slice(r.indexOf('/') + 1)] ?? 0;
  return out;
}

/**
 * Which branch "owns" each commit (for node colours): branches claim their
 * first-parent chains in colour order, so main's commits use main's colour.
 */
export function commitOwners(g: GraphInput): Record<string, string> {
  const byId = new Map(g.commits.map((c) => [c.id, c]));
  const colors = branchColorIndex(g);
  const owners: Record<string, string> = {};
  const branchOrder = Object.keys(g.branches).sort((a, b) => (colors[a] ?? 99) - (colors[b] ?? 99));
  const claim = (name: string, tip: string) => {
    let cur: string | undefined = tip;
    while (cur && byId.has(cur) && owners[cur] === undefined) {
      owners[cur] = name;
      cur = byId.get(cur)!.parents[0];
    }
  };
  for (const b of branchOrder) claim(b, g.branches[b]);
  for (const r of Object.keys(g.remoteBranches).sort()) claim(r, g.remoteBranches[r]);
  return owners;
}
