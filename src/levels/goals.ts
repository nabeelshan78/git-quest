/**
 * Evaluate GoalCheck items against a World to determine which goals are met.
 */
import type { BaseGoalCheck, GoalCheck, GoalItem, ContentMatcher } from '../shared/level';
import type { GoalItemStatus } from '../shared/session';
import type { World, MachineId, RepoState, Hash } from '../shared/types';
import { findRepo, headCommit, readRef, dwimRef, branchNames, currentBranch, getConfig } from '../engine/core/repo';
import { fileExists, dirExists, readFile } from '../engine/core/fs';
import { normalize, resolvePath, join } from '../engine/core/paths';
import { getCommit, getObject, readCommitFiles, peel } from '../engine/core/objects';
import { computeStatus } from '../engine/a/status';

// ---------------------------------------------------------------------------
// Types for session context
// ---------------------------------------------------------------------------

export interface GoalContext {
  world: World;
  /** Default machine for checks without a machine field. */
  defaultMachine: MachineId;
  /** Default repo path (the level's workdir). */
  defaultRepoPath: string;
  /** The level's initial working directory for resolving goal-check paths. */
  levelWorkdir: string;
  /** Questions that have been answered correctly (by question id). */
  answeredQuestions: Set<string>;
  /** Whether the player has read the story. */
  storyRead: boolean;
  /** Commands the player has run, for ranCommand checks. command -> count. */
  commandsRun: Map<string, number>;
}

// ---------------------------------------------------------------------------
// Evaluate a single GoalItem
// ---------------------------------------------------------------------------

export function evaluateGoals(items: GoalItem[], ctx: GoalContext): GoalItemStatus[] {
  return items.map((item) => ({
    text: item.text,
    done: item.checks.every((check) => evaluateCheck(check, ctx)),
  }));
}

export function allGoalsMet(items: GoalItem[], ctx: GoalContext): boolean {
  return items.every((item) => item.checks.every((check) => evaluateCheck(check, ctx)));
}

// ---------------------------------------------------------------------------
// Evaluate a GoalCheck (can be base, not, anyOf, allOf)
// ---------------------------------------------------------------------------

function evaluateCheck(check: GoalCheck, ctx: GoalContext): boolean {
  if (check.type === 'not') {
    return !evaluateBaseCheck(check.check, ctx);
  }
  if (check.type === 'anyOf') {
    return check.checks.some((c) => evaluateBaseCheck(c, ctx));
  }
  if (check.type === 'allOf') {
    return check.checks.every((c) => evaluateBaseCheck(c, ctx));
  }
  return evaluateBaseCheck(check as BaseGoalCheck, ctx);
}

// ---------------------------------------------------------------------------
// Resolve machine and repo for a check
// ---------------------------------------------------------------------------

function getMachine(ctx: GoalContext, machineId?: string) {
  return ctx.world.machines[machineId ?? ctx.defaultMachine];
}

function getRepo(ctx: GoalContext, machineId?: string, repoPath?: string): { repo: RepoState; root: string } | null {
  const mid = machineId ?? ctx.defaultMachine;
  const machine = ctx.world.machines[mid];
  const handle = findRepo(ctx.world, mid, repoPath && machine ? resolvePath(machine.cwd, machine.home, repoPath) : undefined);
  if (!handle) return null;
  return { repo: handle.repo, root: handle.root };
}

function resolveCheckPath(ctx: GoalContext, path: string, machineId?: string): string {
  const machine = getMachine(ctx, machineId);
  if (!machine) return path;
  return resolvePath(ctx.levelWorkdir, machine.home, path);
}

// ---------------------------------------------------------------------------
// Content matching
// ---------------------------------------------------------------------------

function matchContent(content: string, matcher: ContentMatcher): boolean {
  if (matcher.equals !== undefined && content !== matcher.equals) return false;
  if (matcher.contains !== undefined) {
    const needles = Array.isArray(matcher.contains) ? matcher.contains : [matcher.contains];
    for (const needle of needles) {
      if (!content.includes(needle)) return false;
    }
  }
  if (matcher.notContains !== undefined) {
    const needles = Array.isArray(matcher.notContains) ? matcher.notContains : [matcher.notContains];
    for (const needle of needles) {
      if (content.includes(needle)) return false;
    }
  }
  if (matcher.matches !== undefined) {
    const re = new RegExp(matcher.matches, 'm');
    if (!re.test(content)) return false;
  }
  return true;
}

function matchMessage(msg: string, check: {
  messageContains?: string | string[];
  messageNotContains?: string | string[];
  messageMatches?: string;
  messageEquals?: string;
}): boolean {
  if (check.messageEquals !== undefined && msg.trim() !== check.messageEquals.trim()) return false;
  if (check.messageContains !== undefined) {
    const needles = Array.isArray(check.messageContains) ? check.messageContains : [check.messageContains];
    const lower = msg.toLowerCase();
    for (const needle of needles) {
      if (!lower.includes(needle.toLowerCase())) return false;
    }
  }
  if (check.messageNotContains !== undefined) {
    const needles = Array.isArray(check.messageNotContains) ? check.messageNotContains : [check.messageNotContains];
    const lower = msg.toLowerCase();
    for (const needle of needles) {
      if (lower.includes(needle.toLowerCase())) return false;
    }
  }
  if (check.messageMatches !== undefined) {
    const re = new RegExp(check.messageMatches);
    if (!re.test(msg)) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Resolve a revision in a repo
// ---------------------------------------------------------------------------

function resolveRev(repo: RepoState, name: string): Hash | null {
  if (name === 'HEAD' || name === '@') return headCommit(repo);
  // HEAD~N, branch~N etc.
  const ancestorMatch = /^(.+?)([~^])(\d*)$/.exec(name);
  if (ancestorMatch) {
    const baseName = ancestorMatch[1];
    const op = ancestorMatch[2];
    const n = ancestorMatch[3] === '' ? 1 : parseInt(ancestorMatch[3], 10);
    let hash = resolveRev(repo, baseName);
    if (!hash) return null;
    for (let i = 0; i < n; i++) {
      const c = getCommit(repo, hash);
      if (!c || c.parents.length === 0) return null;
      hash = op === '^' && i === 0 ? c.parents[Math.min(n, c.parents.length) - 1] : c.parents[0];
      if (op === '^') return hash;
    }
    return hash;
  }
  const full = dwimRef(repo, name);
  if (full) {
    const h = readRef(repo, full);
    if (h) return peel(repo, h);
  }
  if (/^[0-9a-f]{4,40}$/.test(name)) {
    if (name.length === 40 && repo.objects[name]) return name;
    const matches = Object.keys(repo.objects).filter((h) => h.startsWith(name));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

// ---------------------------------------------------------------------------
// Walk commits
// ---------------------------------------------------------------------------

function walkCommits(repo: RepoState, startHash: Hash, visitor: (hash: Hash, msg: string, parents: Hash[]) => boolean): void {
  const visited = new Set<Hash>();
  const queue = [startHash];
  while (queue.length > 0) {
    const hash = queue.shift()!;
    if (visited.has(hash)) continue;
    visited.add(hash);
    const commit = getCommit(repo, hash);
    if (!commit) continue;
    if (!visitor(hash, commit.message, commit.parents)) return;
    for (const p of commit.parents) queue.push(p);
  }
}

function isAncestor(repo: RepoState, ancestor: Hash, descendant: Hash): boolean {
  if (ancestor === descendant) return true;
  let found = false;
  walkCommits(repo, descendant, (hash) => {
    if (hash === ancestor) { found = true; return false; }
    return true;
  });
  return found;
}

/** Files changed between two commits (or from empty to a commit). */
function changedFiles(repo: RepoState, fromHash: Hash | null, toHash: Hash): string[] {
  const toCommit = getCommit(repo, toHash);
  if (!toCommit) return [];
  const toFiles = readCommitFiles(repo, toHash);
  const fromFiles = fromHash ? readCommitFiles(repo, fromHash) : {};
  const changed: string[] = [];
  for (const path of Object.keys(toFiles)) {
    if (fromFiles[path] !== toFiles[path]) changed.push(path);
  }
  for (const path of Object.keys(fromFiles)) {
    if (!(path in toFiles)) changed.push(path);
  }
  return [...new Set(changed)].sort();
}

// ---------------------------------------------------------------------------
// Evaluate a single base check
// ---------------------------------------------------------------------------

function evaluateBaseCheck(check: BaseGoalCheck, ctx: GoalContext): boolean {
  switch (check.type) {
    // --- filesystem checks ---
    case 'cwd': {
      const machine = getMachine(ctx, check.machine);
      if (!machine) return false;
      const expected = resolveCheckPath(ctx, check.path, check.machine);
      return normalize(machine.cwd) === expected;
    }
    case 'dirExists': {
      const machine = getMachine(ctx, check.machine);
      if (!machine) return false;
      return dirExists(machine.fs, resolveCheckPath(ctx, check.path, check.machine));
    }
    case 'dirMissing': {
      const machine = getMachine(ctx, check.machine);
      if (!machine) return false;
      return !dirExists(machine.fs, resolveCheckPath(ctx, check.path, check.machine));
    }
    case 'fileExists': {
      const machine = getMachine(ctx, check.machine);
      if (!machine) return false;
      return fileExists(machine.fs, resolveCheckPath(ctx, check.path, check.machine));
    }
    case 'fileMissing': {
      const machine = getMachine(ctx, check.machine);
      if (!machine) return false;
      return !fileExists(machine.fs, resolveCheckPath(ctx, check.path, check.machine));
    }
    case 'fileContent': {
      const machine = getMachine(ctx, check.machine);
      if (!machine) return false;
      const content = readFile(machine.fs, resolveCheckPath(ctx, check.path, check.machine));
      if (content === undefined) return false;
      return matchContent(content, check);
    }

    // --- repository checks ---
    case 'repoExists': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      return r !== null;
    }
    case 'repoMissing': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      return r === null;
    }
    case 'configValue': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      const machine = getMachine(ctx, check.machine);
      if (!machine) return false;
      const scope = check.scope ?? 'any';
      let value: string | undefined;
      if (scope === 'global') {
        value = machine.globalConfig[check.key];
      } else if (scope === 'local' && r) {
        value = r.repo.config[check.key];
      } else {
        value = getConfig(machine, r?.repo, check.key);
      }
      if (check.exists !== undefined) return check.exists ? value !== undefined : value === undefined;
      if (value === undefined) return false;
      if (check.equals !== undefined) return value === check.equals;
      if (check.matches !== undefined) return new RegExp(check.matches).test(value);
      return true;
    }

    // --- staging checks ---
    case 'staged': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const status = computeStatus(ctx.world, check.machine ?? ctx.defaultMachine, r.root);
      if (!status) return false;
      const isStagedItem = status.staged.some((s) => s.path === check.path);
      if (!isStagedItem) return false;
      if (check.content) {
        // Check content of the staged version
        const entry = r.repo.index.entries[check.path];
        if (!entry) return false;
        const obj = getObject(r.repo, entry.hash);
        if (!obj || obj.type !== 'blob') return false;
        return matchContent(obj.content, check.content);
      }
      return true;
    }
    case 'notStaged': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const status = computeStatus(ctx.world, check.machine ?? ctx.defaultMachine, r.root);
      if (!status) return false;
      return !status.staged.some((s) => s.path === check.path);
    }
    case 'tracked': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      return check.path in r.repo.index.entries;
    }
    case 'untracked': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const status = computeStatus(ctx.world, check.machine ?? ctx.defaultMachine, r.root);
      if (!status) return false;
      return status.untracked.includes(check.path);
    }
    case 'modified': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const status = computeStatus(ctx.world, check.machine ?? ctx.defaultMachine, r.root);
      if (!status) return false;
      return status.unstaged.some((s) => s.path === check.path);
    }
    case 'unmodified': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const status = computeStatus(ctx.world, check.machine ?? ctx.defaultMachine, r.root);
      if (!status) return false;
      return !status.unstaged.some((s) => s.path === check.path);
    }
    case 'ignored': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const status = computeStatus(ctx.world, check.machine ?? ctx.defaultMachine, r.root);
      if (!status) return false;
      return status.ignored.includes(check.path);
    }
    case 'clean': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const status = computeStatus(ctx.world, check.machine ?? ctx.defaultMachine, r.root);
      if (!status) return false;
      if (status.staged.length > 0 || status.unstaged.length > 0 || status.conflicted.length > 0) return false;
      if (!check.allowUntracked && status.untracked.length > 0) return false;
      return true;
    }

    // --- commit checks ---
    case 'commitCount': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const ref = check.ref ?? 'HEAD';
      const hash = resolveRev(r.repo, ref);
      if (!hash) return check.equals === 0 || (check.max !== undefined && check.max >= 0);
      let count = 0;
      walkCommits(r.repo, hash, () => { count++; return true; });
      if (check.equals !== undefined && count !== check.equals) return false;
      if (check.min !== undefined && count < check.min) return false;
      if (check.max !== undefined && count > check.max) return false;
      return true;
    }
    case 'commit': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const ref = check.ref ?? 'HEAD';
      const hash = resolveRev(r.repo, ref);
      if (!hash) return false;
      const commit = getCommit(r.repo, hash);
      if (!commit) return false;
      if (!matchMessage(commit.message, check)) return false;
      if (check.parents !== undefined && commit.parents.length !== check.parents) return false;
      if (check.authorName !== undefined && commit.author.name !== check.authorName) return false;
      if (check.changes || check.changesExactly) {
        const parentHash = commit.parents.length > 0 ? commit.parents[0] : null;
        const changed = changedFiles(r.repo, parentHash, hash);
        if (check.changes) {
          for (const path of check.changes) {
            if (!changed.includes(path)) return false;
          }
        }
        if (check.changesExactly) {
          const expected = [...check.changesExactly].sort();
          if (changed.length !== expected.length) return false;
          for (let i = 0; i < changed.length; i++) {
            if (changed[i] !== expected[i]) return false;
          }
        }
      }
      return true;
    }
    case 'commitExists': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const on = check.on ?? 'HEAD';
      let startHashes: Hash[] = [];
      if (on === '--all') {
        startHashes = Object.values(r.repo.refs);
      } else {
        const h = resolveRev(r.repo, on);
        if (h) startHashes = [h];
      }
      let matchCount = 0;
      const visited = new Set<Hash>();
      for (const start of startHashes) {
        walkCommits(r.repo, start, (hash, msg, parents) => {
          if (visited.has(hash)) return true;
          visited.add(hash);
          const commit = getCommit(r.repo, hash);
          if (!commit) return true;
          if (!matchMessage(msg, check)) return true;
          if (check.parents !== undefined && parents.length !== check.parents) return true;
          if (check.changes || check.changesExactly) {
            const parentHash = parents.length > 0 ? parents[0] : null;
            const changed = changedFiles(r.repo, parentHash, hash);
            if (check.changes) {
              for (const path of check.changes) {
                if (!changed.includes(path)) return true;
              }
            }
            if (check.changesExactly) {
              const expected = [...check.changesExactly].sort();
              if (changed.length !== expected.length) return true;
              for (let j = 0; j < changed.length; j++) {
                if (changed[j] !== expected[j]) return true;
              }
            }
          }
          matchCount++;
          return true;
        });
      }
      if (matchCount === 0) return false;
      if (check.count) {
        if (check.count.equals !== undefined && matchCount !== check.count.equals) return false;
        if (check.count.min !== undefined && matchCount < check.count.min) return false;
        if (check.count.max !== undefined && matchCount > check.count.max) return false;
      }
      return true;
    }
    case 'noCommitMatching': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return true;
      const on = check.on ?? 'HEAD';
      let startHashes: Hash[] = [];
      if (on === '--all') {
        startHashes = Object.values(r.repo.refs);
      } else {
        const h = resolveRev(r.repo, on);
        if (h) startHashes = [h];
      }
      let found = false;
      const visited = new Set<Hash>();
      for (const start of startHashes) {
        walkCommits(r.repo, start, (hash, msg) => {
          if (visited.has(hash)) return true;
          visited.add(hash);
          if (matchMessage(msg, check)) { found = true; return false; }
          return true;
        });
        if (found) break;
      }
      return !found;
    }
    case 'fileInCommit': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const ref = check.ref ?? 'HEAD';
      const hash = resolveRev(r.repo, ref);
      if (!hash) return false;
      const files = readCommitFiles(r.repo, hash);
      if (check.absent) return !(check.path in files);
      if (!(check.path in files)) return false;
      return matchContent(files[check.path], check);
    }

    // --- branch checks ---
    case 'branchExists': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      return branchNames(r.repo).includes(check.name);
    }
    case 'branchMissing': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      return !branchNames(r.repo).includes(check.name);
    }
    case 'currentBranch': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      return currentBranch(r.repo) === check.name;
    }
    case 'detachedHead': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const isDetached = r.repo.head.type === 'detached';
      return check.value ? isDetached : !isDetached;
    }
    case 'refsEqual': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const a = resolveRev(r.repo, check.a);
      const b = resolveRev(r.repo, check.b);
      return a !== null && b !== null && a === b;
    }
    case 'refsDiffer': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const a = resolveRev(r.repo, check.a);
      const b = resolveRev(r.repo, check.b);
      return a !== null && b !== null && a !== b;
    }
    case 'isAncestor': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const anc = resolveRev(r.repo, check.ancestor);
      const desc = resolveRev(r.repo, check.descendant);
      if (!anc || !desc) return false;
      return isAncestor(r.repo, anc, desc);
    }
    case 'notAncestor': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const anc = resolveRev(r.repo, check.ancestor);
      const desc = resolveRev(r.repo, check.descendant);
      if (!anc || !desc) return false;
      return !isAncestor(r.repo, anc, desc);
    }
    case 'linearHistory': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const ref = check.ref ?? 'HEAD';
      const hash = resolveRev(r.repo, ref);
      if (!hash) return true;
      let linear = true;
      walkCommits(r.repo, hash, (_, __, parents) => {
        if (parents.length > 1) { linear = false; return false; }
        return true;
      });
      return linear;
    }
    case 'noOperationInProgress': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      return !r.repo.special.MERGE_HEAD && !r.repo.special.REVERT_HEAD;
    }
    case 'operationInProgress': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      if (check.operation === 'merge') return !!r.repo.special.MERGE_HEAD;
      if (check.operation === 'revert') return !!r.repo.special.REVERT_HEAD;
      return false;
    }
    case 'conflicted': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      return check.path in r.repo.index.conflicts;
    }
    case 'noConflicts': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      return Object.keys(r.repo.index.conflicts).length === 0;
    }
    case 'noConflictMarkers': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const machine = getMachine(ctx, check.machine);
      if (!machine) return false;
      const paths = check.paths ?? Object.keys(r.repo.index.entries);
      for (const path of paths) {
        const absPath = join(r.root, path);
        const content = readFile(machine.fs, absPath);
        if (content === undefined) continue;
        if (/^<{7}\s/m.test(content) || /^={7}$/m.test(content) || /^>{7}\s/m.test(content)) return false;
      }
      return true;
    }
    case 'stashCount': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const stashLog = r.repo.reflog['refs/stash'] ?? [];
      const count = stashLog.length;
      if (check.equals !== undefined && count !== check.equals) return false;
      if (check.min !== undefined && count < check.min) return false;
      if (check.max !== undefined && count > check.max) return false;
      return true;
    }

    // --- remote checks ---
    case 'remoteExists': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const url = r.repo.config[`remote.${check.name}.url`];
      if (!url) return false;
      if (check.url !== undefined && url !== check.url) return false;
      if (check.urlMatches !== undefined && !new RegExp(check.urlMatches).test(url)) return false;
      return true;
    }
    case 'remoteMissing': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      return !r.repo.config[`remote.${check.name}.url`];
    }
    case 'upstream': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const remote = r.repo.config[`branch.${check.branch}.remote`];
      if (remote !== check.remote) return false;
      if (check.remoteBranch) {
        const merge = r.repo.config[`branch.${check.branch}.merge`];
        const expected = `refs/heads/${check.remoteBranch}`;
        if (merge !== expected) return false;
      }
      return true;
    }

    // --- hosted repo checks ---
    case 'hostedRepoExists': {
      const hosted = ctx.world.hosted[check.repo];
      if (!hosted) return false;
      if (check.visibility && hosted.visibility !== check.visibility) return false;
      return true;
    }
    case 'hostedBranch': {
      const hosted = ctx.world.hosted[check.repo];
      if (!hosted) return false;
      const branchRef = `refs/heads/${check.branch}`;
      const branchHash = hosted.repo.refs[branchRef];
      if (check.exists === false) return !branchHash;
      if (check.exists === true || check.exists === undefined) {
        if (!branchHash) return false;
      }
      if (!branchHash) return false;
      if (check.equalsLocal) {
        const r = getRepo(ctx, check.machine, check.repoPath);
        if (!r) return false;
        const localHash = resolveRev(r.repo, check.equalsLocal);
        if (localHash !== branchHash) return false;
      }
      if (check.messageContains || check.messageNotContains || check.messageMatches) {
        // Find a commit reachable from the branch that matches
        let found = false;
        walkCommits(hosted.repo, branchHash, (_, msg) => {
          if (matchMessage(msg, check)) { found = true; return false; }
          return true;
        });
        if (!found) return false;
      }
      return true;
    }
    case 'hostedFile': {
      const hosted = ctx.world.hosted[check.repo];
      if (!hosted) return false;
      const branch = check.branch ?? hosted.defaultBranch;
      const branchRef = `refs/heads/${branch}`;
      const branchHash = hosted.repo.refs[branchRef];
      if (!branchHash) return false;
      const files = readCommitFiles(hosted.repo, branchHash);
      if (check.absent) return !(check.path in files);
      if (!(check.path in files)) return false;
      return matchContent(files[check.path], check);
    }
    case 'hostedCommitCount': {
      const hosted = ctx.world.hosted[check.repo];
      if (!hosted) return false;
      const branch = check.branch ?? hosted.defaultBranch;
      const branchRef = `refs/heads/${branch}`;
      const branchHash = hosted.repo.refs[branchRef];
      if (!branchHash) return check.equals === 0;
      let count = 0;
      walkCommits(hosted.repo, branchHash, () => { count++; return true; });
      if (check.equals !== undefined && count !== check.equals) return false;
      if (check.min !== undefined && count < check.min) return false;
      if (check.max !== undefined && count > check.max) return false;
      return true;
    }
    case 'trackingUpToDate': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const trackingRef = `refs/remotes/${check.remote}/${check.branch}`;
      const trackingHash = r.repo.refs[trackingRef];
      if (!trackingHash) return false;
      // Find the hosted repo via remote config
      const url = r.repo.config[`remote.${check.remote}.url`];
      if (!url) return false;
      // Find the hosted repo
      for (const hosted of Object.values(ctx.world.hosted)) {
        const branchRef = `refs/heads/${check.branch}`;
        if (hosted.repo.refs[branchRef] === trackingHash) return true;
      }
      return false;
    }
    case 'inSync': {
      const r = getRepo(ctx, check.machine, check.repoPath);
      if (!r) return false;
      const localRef = `refs/heads/${check.branch}`;
      const localHash = r.repo.refs[localRef];
      if (!localHash) return false;
      const remote = check.remote ?? 'origin';
      const remoteBranch = check.remoteBranch ?? check.branch;
      const url = r.repo.config[`remote.${remote}.url`];
      if (!url) return false;
      for (const hosted of Object.values(ctx.world.hosted)) {
        const branchRef = `refs/heads/${remoteBranch}`;
        if (hosted.repo.refs[branchRef] === localHash) return true;
      }
      return false;
    }

    // --- issue/PR checks ---
    case 'issue': {
      const hosted = ctx.world.hosted[check.repo];
      if (!hosted) return false;
      let issues = hosted.issues;
      if (check.number !== undefined) issues = issues.filter((i) => i.number === check.number);
      if (check.titleContains) issues = issues.filter((i) => i.title.toLowerCase().includes(check.titleContains!.toLowerCase()));
      if (check.state) issues = issues.filter((i) => i.state === check.state);
      if (check.assignee) issues = issues.filter((i) => i.assignees.includes(check.assignee!));
      if (check.label) issues = issues.filter((i) => i.labels.includes(check.label!));
      if (check.commentBy) issues = issues.filter((i) => i.comments.some((c) => c.author === check.commentBy));
      if (check.referenced !== undefined) {
        issues = issues.filter((i) => check.referenced ? i.references.length > 0 : i.references.length === 0);
      }
      if (check.count) {
        if (check.count.equals !== undefined && issues.length !== check.count.equals) return false;
        if (check.count.min !== undefined && issues.length < check.count.min) return false;
        if (check.count.max !== undefined && issues.length > check.count.max) return false;
        return true;
      }
      return issues.length > 0;
    }
    case 'pullRequest': {
      const hosted = ctx.world.hosted[check.repo];
      if (!hosted) return false;
      let prs = hosted.pulls;
      if (check.number !== undefined) prs = prs.filter((p) => p.number === check.number);
      if (check.head) prs = prs.filter((p) => p.head.branch === check.head);
      if (check.base) prs = prs.filter((p) => p.base === check.base);
      if (check.titleContains) prs = prs.filter((p) => p.title.toLowerCase().includes(check.titleContains!.toLowerCase()));
      if (check.state) prs = prs.filter((p) => p.state === check.state);
      if (check.approved !== undefined) {
        prs = prs.filter((p) => {
          const hasApproval = p.reviews.some((r) => r.state === 'APPROVED');
          return check.approved ? hasApproval : !hasApproval;
        });
      }
      if (check.repliedToReview !== undefined) {
        prs = prs.filter((p) => {
          const authorReplied = p.reviewComments.some((c) => c.author === p.author && c.inReplyTo !== undefined);
          return check.repliedToReview ? authorReplied : !authorReplied;
        });
      }
      if (check.commentBy) prs = prs.filter((p) => p.comments.some((c) => c.author === check.commentBy));
      if (check.minCommits !== undefined) {
        // Count commits on head not in base
        prs = prs.filter((p) => {
          const headRef = `refs/heads/${p.head.branch}`;
          const baseRef = `refs/heads/${p.base}`;
          const headHash = hosted.repo.refs[headRef];
          const baseHash = hosted.repo.refs[baseRef];
          if (!headHash || !baseHash) return false;
          let count = 0;
          const baseCommits = new Set<Hash>();
          walkCommits(hosted.repo, baseHash, (h) => { baseCommits.add(h); return true; });
          walkCommits(hosted.repo, headHash, (h) => {
            if (!baseCommits.has(h)) count++;
            return true;
          });
          return count >= check.minCommits!;
        });
      }
      if (check.count) {
        if (check.count.equals !== undefined && prs.length !== check.count.equals) return false;
        if (check.count.min !== undefined && prs.length < check.count.min) return false;
        if (check.count.max !== undefined && prs.length > check.count.max) return false;
        return true;
      }
      return prs.length > 0;
    }

    // --- session checks ---
    case 'answered':
      return ctx.answeredQuestions.has(check.question);
    case 'storyRead':
      return ctx.storyRead;
    case 'ranCommand': {
      const count = ctx.commandsRun.get(check.command) ?? 0;
      return count >= (check.times ?? 1);
    }

    default:
      return false;
  }
}
