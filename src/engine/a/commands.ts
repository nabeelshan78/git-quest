/**
 * Engine A — all git command handlers: init, config, status, add, commit,
 * log, diff, restore, rm, mv, show, branch, switch, checkout, merge, revert.
 *
 * Every handler is a pure function `(World, GitContext) => CommandResult`.
 * State mutations use immer `produce`. Output matches real git's wording.
 */
import { produce } from 'immer';
import { allArgs, getString, getList, hasFlag, isNegated } from '../../shared/args';
import { ZERO_HASH } from '../../shared/constants';
import type { CommitKind, GameEvent } from '../../shared/events';
import type { CommandResult } from '../../shared/result';
import { fatal, ok, fail, stdout, stderr } from '../../shared/result';
import type {
  AbsPath, CommitObject, ConflictEntry, FileMode, Hash,
  Machine, RepoLocation, RepoPath,
  RepoState, Signature, World,
} from '../../shared/types';
import {
  EMPTY_TREE_HASH, getBlob, getCommit, getObject,
  hashBlob, peel, readTreeFlat, shortHash,
  subjectOf, writeBlob, writeObject, writeTreeFromFlat,
} from '../core/objects';
import type { FlatTreeEntry } from '../core/objects';
import {
  absOf, branchNames, configuredIdentity, createEmptyRepo, currentBranch,
  deleteRef, dwimRef, findRepo, getConfig, headCommit, listWorkTree,
  NOT_A_REPO, normalizeConfigKey, readRef, remoteBranchNames,
  setHead, signatureFor, updateRef,
} from '../core/repo';
import {
  deleteFile, dirExists, mkdirp,
  pruneEmptyDirs, readFile, writeFile,
} from '../core/fs';
import { basename, dirname, join, resolvePath } from '../core/paths';
import type { GitHandler, EditorResumeHandler } from '../types';
import { Out, openRepo, openWorkTree, isResult, localLoc, fatalResult, displayPath } from './context';
import { IgnoreMatcher } from './ignore';
import { matchPathspec, parsePathspec, PathspecError, type Pathspec } from './pathspec';
import { merge3 } from './merge3';
import { emitHunks } from './unified';
import { diffTexts, countChanges } from './xdiff';
import { computeStatus } from './status';

// =========================================================================
// Helpers
// =========================================================================

function sig(world: World, machine: Machine, repo: RepoState | undefined): Signature {
  return signatureFor(world, machine, repo);
}

function parseSig(s: string): { name: string; email: string } | null {
  const m = /^(.+?)\s*<([^>]+)>/.exec(s);
  return m ? { name: m[1], email: m[2] } : null;
}

/** Resolve a revision name: branch, tag, HEAD, HEAD~n, hash prefix, etc. */
function resolveRev(repo: RepoState, name: string): Hash | null {
  if (name === 'HEAD' || name === '@') {
    return headCommit(repo);
  }
  // HEAD~N, branch~N, branch^N, tag~N etc.
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
      if (op === '^') return hash; // ^N means Nth parent directly
    }
    return hash;
  }
  // Full ref
  const full = dwimRef(repo, name);
  if (full) {
    const h = readRef(repo, full);
    if (h) return peel(repo, h);
  }
  // Hash prefix
  if (/^[0-9a-f]{4,40}$/.test(name)) {
    if (name.length === 40 && repo.objects[name]) return name;
    const matches = Object.keys(repo.objects).filter(h => h.startsWith(name));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

/** Resolve a tree-ish: commit (use its tree), tree directly. */
function resolveTreeish(repo: RepoState, name: string): Hash | null {
  const h = resolveRev(repo, name);
  if (!h) return null;
  const obj = getObject(repo, h);
  if (!obj) return null;
  if (obj.type === 'commit') return obj.tree;
  if (obj.type === 'tree') return h;
  if (obj.type === 'tag') return resolveTreeish(repo, obj.object);
  return null;
}

/** Build a flat index map from the current repo.index.entries. */
function indexFlat(repo: RepoState): Record<string, FlatTreeEntry> {
  const out: Record<string, FlatTreeEntry> = {};
  for (const e of Object.values(repo.index.entries)) {
    out[e.path] = { hash: e.hash, mode: e.mode };
  }
  return out;
}

/** Requires identity configured. Returns the signature or a fatal result. */
function requireIdentity(world: World, machine: Machine, repo: RepoState): Signature | CommandResult {
  const id = configuredIdentity(machine, repo);
  if (!id) {
    return fatalResult(world,
      `fatal: Author identity unknown\n\n*** Please tell me who you are.\n\nRun\n\n  git config --global user.email "you@example.com"\n  git config --global user.name "Your Name"\n\nto set your account's default identity.\nOmit --global to set the identity only in this repository.`
    );
  }
  return { ...id, timestamp: world.clock, timezone: '+0000' };
}

// =========================================================================
// git init
// =========================================================================

export const initHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const machine = world.machines[machineId];
  const o = new Out();
  const quiet = hasFlag(args, 'quiet');
  const bare = hasFlag(args, 'bare');
  const branchName = getString(args, 'initial-branch')
    ?? getConfig(machine, undefined, 'init.defaultbranch')
    ?? 'main';
  const dirArg = args.positionals[0];
  const target = dirArg ? resolvePath(machine.cwd, machine.home, dirArg) : machine.cwd;

  const reinit = !!machine.repos[target];
  const state = produce(world, d => {
    const m = d.machines[machineId];
    mkdirp(m.fs, target);
    if (!reinit) {
      m.repos[target] = createEmptyRepo({ bare, initialBranch: branchName });
      if (!bare) mkdirp(m.fs, join(target, '.git'));
    } else {
      // Reinit: update initial branch if unborn
      const repo = m.repos[target];
      if (repo.head.type === 'symbolic' && !repo.refs[repo.head.ref]) {
        repo.head = { type: 'symbolic', ref: `refs/heads/${branchName}` };
      }
    }
  });
  const gitDir = bare ? target : join(target, '.git');
  if (!quiet) {
    const prefix = reinit ? 'Reinitialized existing' : 'Initialized empty';
    const kindStr = bare ? 'bare ' : '';
    o.out(`${prefix} ${kindStr}Git repository in ${gitDir}/`);
  }
  o.ev({ type: 'repo.init', machine: machineId, root: target, bare, reinit });
  return o.result(state);
};

// =========================================================================
// git config
// =========================================================================

export const configHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const machine = world.machines[machineId];
  const o = new Out();
  const isGlobal = hasFlag(args, 'global');
  const isLocal = hasFlag(args, 'local');
  const isList = hasFlag(args, 'list');
  const isGet = hasFlag(args, 'get');
  const isUnset = hasFlag(args, 'unset');
  const showOrigin = hasFlag(args, 'show-origin');

  // Find repo (may not exist for --global)
  const handle = findRepo(world, machineId);
  const repo = handle?.repo;

  if (!isGlobal && !isLocal && !repo && !isList) {
    // Default is local, need a repo
    if (!handle) return fatal(world, NOT_A_REPO);
  }

  if (isList) {
    const lines: string[] = [];
    if (!isLocal) {
      for (const [k, v] of Object.entries(machine.globalConfig).sort()) {
        const prefix = showOrigin ? `file:${machine.home}/.gitconfig\t` : '';
        for (const val of v.split('\n')) lines.push(`${prefix}${k}=${val}`);
      }
    }
    if (!isGlobal && repo) {
      for (const [k, v] of Object.entries(repo.config).sort()) {
        const prefix = showOrigin ? `file:.git/config\t` : '';
        for (const val of v.split('\n')) lines.push(`${prefix}${k}=${val}`);
      }
    }
    return ok(world, stdout(...lines));
  }

  const positionals = args.positionals;
  if (positionals.length === 0) {
    return fail(world, 129, stderr('error: key does not contain a section: '));
  }

  const rawKey = positionals[0];
  const key = normalizeConfigKey(rawKey);
  if (!key.includes('.')) {
    return fail(world, 128, stderr(`error: key does not contain a section: ${rawKey}`));
  }

  if (isGet || (positionals.length === 1 && !isUnset)) {
    // Get mode
    const localVal = repo?.config[key];
    const globalVal = machine.globalConfig[key];
    let val: string | undefined;
    if (isLocal) val = localVal;
    else if (isGlobal) val = globalVal;
    else val = localVal ?? globalVal;
    if (val === undefined) return fail(world, 1, []);
    // Multi-value: last line
    const parts = val.split('\n');
    return ok(world, stdout(parts[parts.length - 1]));
  }

  if (isUnset) {
    const state = produce(world, d => {
      const m = d.machines[machineId];
      if (isGlobal) {
        delete m.globalConfig[key];
      } else {
        const h = findRepo(d, machineId);
        if (h) delete h.repo.config[key];
      }
    });
    return ok(state);
  }

  // Set mode: key value
  if (positionals.length < 2) {
    return fail(world, 129, stderr(`error: key does not contain a section: ${rawKey}`));
  }
  const value = positionals[1];
  const scope: 'global' | 'local' = isGlobal ? 'global' : 'local';
  const state = produce(world, d => {
    const m = d.machines[machineId];
    if (isGlobal) {
      m.globalConfig[key] = value;
    } else {
      const h = findRepo(d, machineId);
      if (h) h.repo.config[key] = value;
      else m.globalConfig[key] = value;
    }
  });
  o.ev({ type: 'config.set', machine: machineId, scope, key, value });
  return o.result(state);
};

// =========================================================================
// git status
// =========================================================================

export const statusHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const isShort = hasFlag(args, 'short');
  const showBranch = hasFlag(args, 'branch');

  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;

  const summary = computeStatus(world, machineId, r.root);
  if (!summary) return fatal(world, NOT_A_REPO);

  const o = new Out();
  const prefix = r.prefix;

  if (isShort) {
    if (showBranch) {
      if (summary.branch) {
        o.out(`## ${summary.branch}`);
      } else {
        o.out(`## HEAD (no branch)`);
      }
    }
    for (const s of summary.conflicted) {
      const xy = s.kind === 'both modified' ? 'UU' : s.kind === 'both added' ? 'AA' : s.kind === 'deleted by us' ? 'UD' : s.kind === 'deleted by them' ? 'DU' : s.kind === 'added by us' ? 'AU' : s.kind === 'added by them' ? 'UA' : 'UU';
      o.out(`${xy} ${displayPath(s.path, prefix)}`);
    }
    for (const s of summary.staged) {
      const x = s.kind === 'added' ? 'A' : s.kind === 'deleted' ? 'D' : s.kind === 'renamed' ? 'R' : 'M';
      const workMod = summary.unstaged.find(u => u.path === s.path);
      const y = workMod ? (workMod.kind === 'deleted' ? 'D' : 'M') : ' ';
      const path = s.from ? `${displayPath(s.from, prefix)} -> ${displayPath(s.path, prefix)}` : displayPath(s.path, prefix);
      o.out(`${x}${y} ${path}`);
    }
    for (const u of summary.unstaged) {
      if (summary.staged.some(s => s.path === u.path)) continue;
      const y = u.kind === 'deleted' ? 'D' : 'M';
      o.out(` ${y} ${displayPath(u.path, prefix)}`);
    }
    for (const p of summary.untracked) {
      o.out(`?? ${displayPath(p, prefix)}`);
    }
    return o.result(world);
  }

  // Long format
  if (summary.branch) {
    o.out(`On branch ${summary.branch}`);
  } else if (summary.detachedAt) {
    o.out(`HEAD detached at ${shortHash(summary.detachedAt)}`);
  }

  if (summary.unborn) {
    o.out('', 'No commits yet', '');
  }

  if (summary.inProgress === 'merge') {
    o.out('All conflicts fixed but you are still merging.');
    if (summary.conflicted.length === 0) {
      o.out('  (use "git commit" to conclude merge)');
    }
    o.out('');
  } else if (summary.inProgress === 'revert') {
    o.out('You are currently reverting commit ' + (r.repo.special.REVERT_HEAD ? shortHash(r.repo.special.REVERT_HEAD) : '') + '.');
    o.out('  (all conflicts fixed: run "git revert --continue")');
    o.out('  (use "git revert --skip" to skip this patch)');
    o.out('  (use "git revert --abort" to cancel the revert operation)');
    o.out('');
  }

  if (summary.conflicted.length > 0) {
    o.out('Unmerged paths:');
    o.out('  (use "git add <file>..." to mark resolution)');
    o.out('');
    for (const c of summary.conflicted) {
      o.out(`\t${c.kind}:   ${displayPath(c.path, prefix)}`);
    }
    o.out('');
  }

  if (summary.staged.length > 0) {
    const heading = summary.unborn ? 'Changes to be committed:' : 'Changes to be committed:';
    o.out(heading);
    o.out('  (use "git restore --staged <file>..." to unstage)');
    o.out('');
    for (const s of summary.staged) {
      const kind = s.kind === 'added' ? 'new file' : s.kind === 'deleted' ? 'deleted' : s.kind === 'renamed' ? 'renamed' : 'modified';
      const path = s.from ? `${displayPath(s.from, prefix)} -> ${displayPath(s.path, prefix)}` : displayPath(s.path, prefix);
      o.out(`\t${kind}:   ${path}`);
    }
    o.out('');
  }

  if (summary.unstaged.length > 0) {
    o.out('Changes not staged for commit:');
    o.out('  (use "git add <file>..." to update what will be committed)');
    o.out('  (use "git restore <file>..." to discard changes in working directory)');
    o.out('');
    for (const u of summary.unstaged) {
      const kind = u.kind === 'deleted' ? 'deleted' : 'modified';
      o.out(`\t${kind}:   ${displayPath(u.path, prefix)}`);
    }
    o.out('');
  }

  if (summary.untracked.length > 0) {
    o.out('Untracked files:');
    o.out('  (use "git add <file>..." to include in what will be committed)');
    o.out('');
    for (const p of summary.untracked) {
      o.out(`\t${displayPath(p, prefix)}`);
    }
    o.out('');
  }

  if (summary.clean && summary.untracked.length === 0 && summary.conflicted.length === 0 && !summary.inProgress) {
    if (summary.unborn) {
      o.out('nothing to commit (create a copy and use "git add" to track)');
    } else {
      o.out('nothing to commit, working tree clean');
    }
  } else if (summary.staged.length === 0 && summary.unstaged.length === 0 && summary.conflicted.length === 0 && summary.untracked.length > 0) {
    o.out('nothing added to commit but untracked files present (use "git add" to track)');
  }

  return o.result(world);
};

// =========================================================================
// git add
// =========================================================================

export const addHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine, prefix } = r;

  const addAll = hasFlag(args, 'all');
  const update = hasFlag(args, 'update');
  const dryRun = hasFlag(args, 'dry-run');
  const verbose = hasFlag(args, 'verbose');
  const force = hasFlag(args, 'force');

  const pathArgs = allArgs(args);
  if (!addAll && !update && pathArgs.length === 0) {
    return fail(world, 129, stderr(
      'Nothing specified, nothing added.',
      'Maybe you wanted to say \'git add .\'?'
    ));
  }

  let ps: Pathspec;
  try {
    const effectiveArgs = addAll || update ? ['.'] : pathArgs;
    ps = parsePathspec(effectiveArgs, prefix, root);
  } catch (e) {
    if (e instanceof PathspecError) return fatal(world, e.message);
    throw e;
  }

  const workFiles = listWorkTree(machine, root);
  const ignore = force ? null : new IgnoreMatcher(machine, root, repo);
  const staged: RepoPath[] = [];
  const o = new Out();

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];
    const idx = rep.index;

    // Stage work tree files that match
    for (const [rp, content] of Object.entries(workFiles)) {
      if (matchPathspec(ps, rp) < 0) continue;
      if (update && !idx.entries[rp] && !idx.conflicts[rp]) continue;
      if (ignore && ignore.isIgnored(rp)) continue;

      const blobHash = hashBlob(content);
      const existing = idx.entries[rp];
      if (existing && existing.hash === blobHash) {
        // Resolve conflict if present
        if (idx.conflicts[rp]) {
          delete idx.conflicts[rp];
          idx.entries[rp] = { path: rp, hash: blobHash, mode: '100644' };
          staged.push(rp);
        }
        continue;
      }
      if (!dryRun) {
        writeBlob(rep, content);
        delete idx.conflicts[rp];
        idx.entries[rp] = { path: rp, hash: blobHash, mode: existing?.mode ?? '100644' };
      }
      staged.push(rp);
      if (verbose) o.out(`add '${rp}'`);
    }

    // Handle deleted files: in index but not in work tree
    if (!dryRun) {
      for (const rp of Object.keys(idx.entries)) {
        if (matchPathspec(ps, rp) < 0) continue;
        if (workFiles[rp] !== undefined) continue;
        if (update || addAll) {
          delete idx.entries[rp];
          staged.push(rp);
        }
      }
    }

    // Resolve conflicts for files being added
    for (const rp of Object.keys(idx.conflicts)) {
      if (matchPathspec(ps, rp) < 0) continue;
      const content = workFiles[rp];
      if (content !== undefined) {
        const blobHash = hashBlob(content);
        writeBlob(rep, content);
        delete idx.conflicts[rp];
        idx.entries[rp] = { path: rp, hash: blobHash, mode: '100644' };
        if (!staged.includes(rp)) staged.push(rp);
      }
    }
  });

  if (staged.length > 0) {
    o.ev({ type: 'index.stage', repo: r.loc, paths: staged });
  }
  return o.result(state);
};

// =========================================================================
// git commit
// =========================================================================

export const commitHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine } = r;
  const o = new Out();

  if (hasFlag(args, 'amend')) {
    return fail(world, 1, stderr("error: --amend is handled by Engine B"));
  }

  const identity = requireIdentity(world, machine, repo);
  if (isResult(identity)) return identity;

  const allowEmpty = hasFlag(args, 'allow-empty');
  const commitAll = hasFlag(args, 'all');
  const authorStr = getString(args, 'author');

  let author: Signature = identity;
  if (authorStr) {
    const parsed = parseSig(authorStr);
    if (parsed) {
      author = { ...parsed, timestamp: world.clock, timezone: '+0000' };
    }
  }
  const committer: Signature = identity;

  // -a: stage modified tracked files
  let w = world;
  if (commitAll) {
    const workFiles = listWorkTree(machine, root);
    w = produce(world, d => {
      const m = d.machines[machineId];
      const rep = m.repos[root];
      for (const rp of Object.keys(rep.index.entries)) {
        const content = workFiles[rp];
        if (content === undefined) {
          delete rep.index.entries[rp];
        } else {
          const blobHash = hashBlob(content);
          if (blobHash !== rep.index.entries[rp].hash) {
            writeBlob(rep, content);
            rep.index.entries[rp] = { ...rep.index.entries[rp], hash: blobHash };
          }
        }
      }
    });
  }

  const repoAfterStage = w.machines[machineId].repos[root];
  const head = headCommit(repoAfterStage);

  // Check for conflicts
  if (Object.keys(repoAfterStage.index.conflicts).length > 0) {
    return fail(w, 128, stderr(
      'error: Committing is not possible because you have unmerged files.',
      'hint: Fix them up in the work tree, and then use \'git add <file>\'',
      'hint: as appropriate to mark resolution and make a commit.',
      'fatal: Exiting because of an unresolved conflict.'
    ));
  }

  // Build tree
  const flat = indexFlat(repoAfterStage);
  if (Object.keys(flat).length === 0 && !allowEmpty && !repoAfterStage.special.MERGE_HEAD) {
    // Nothing to commit (unborn with nothing staged)
    const branch = currentBranch(repoAfterStage);
    return fail(w, 1, stdout(
      `On branch ${branch ?? 'HEAD'}`,
      '',
      head ? 'nothing to commit, working tree clean' : 'nothing to commit'
    ));
  }

  // Check if anything changed from HEAD
  const headTree = head ? getCommit(repoAfterStage, head)?.tree ?? EMPTY_TREE_HASH : EMPTY_TREE_HASH;
  // Build commit tree from index
  let treeHash: Hash;
  const state2 = produce(w, d => {
    const rep = d.machines[machineId].repos[root];
    treeHash = writeTreeFromFlat(rep, flat);
  });
  treeHash = treeHash!;

  if (treeHash === headTree && !allowEmpty && !repoAfterStage.special.MERGE_HEAD) {
    const branch = currentBranch(repoAfterStage);
    return fail(w, 1, stdout(
      `On branch ${branch ?? 'HEAD'}`,
      'nothing to commit, working tree clean'
    ));
  }

  // Determine message
  const messages = getList(args, 'message');
  const isMerge = !!repoAfterStage.special.MERGE_HEAD;
  const mergeMsg = repoAfterStage.mergeMsg;

  if (messages.length === 0 && !isMerge) {
    // Open editor
    const branch = currentBranch(repoAfterStage);
    const initial = `\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.\n#\n# On branch ${branch ?? '(detached)'}\n`;
    const editorState = produce(state2, d => {
      d.machines[machineId].editor = {
        purpose: 'commit-message',
        file: '.git/COMMIT_EDITMSG',
        initialContent: initial,
        command: 'git commit',
        machine: machineId,
        workTree: root,
        resume: { handler: 'commit', data: { author, committer, treeHash, head, mergeHeads: [], allowEmpty } },
      };
    });
    o.ev({ type: 'editor.open', request: editorState.machines[machineId].editor! });
    return o.result(editorState);
  }

  const message = messages.length > 0 ? messages.join('\n\n') : (mergeMsg ?? '');
  return doCommit(state2, machineId, root, author, committer, treeHash, head,
    isMerge ? repoAfterStage.special.MERGE_HEAD! : [], message, allowEmpty, isMerge ? 'merge' : head ? 'normal' : 'initial');
};

function doCommit(
  world: World, machineId: string, root: AbsPath,
  author: Signature, committer: Signature,
  treeHash: Hash, head: Hash | null, mergeHeads: Hash[],
  rawMessage: string, _allowEmpty: boolean, kind: CommitKind,
): CommandResult {
  const o = new Out();
  // Strip comment lines and trim
  const msg = rawMessage.split('\n').filter(l => !l.startsWith('#')).join('\n').replace(/^\s+/, '').replace(/\s+$/, '');
  if (!msg && !hasFlag) {
    // Empty message
    return fail(world, 1, stderr('Aborting commit due to empty commit message.'));
  }
  if (!msg) {
    return fail(world, 1, stderr('Aborting commit due to empty commit message.'));
  }

  const parents = head ? [head, ...mergeHeads] : [];
  const message = msg.endsWith('\n') ? msg : `${msg}\n`;

  let commitHash: Hash = '';
  const state = produce(world, d => {
    const m = d.machines[machineId];
    const repo = m.repos[root];

    const commitObj = {
      type: 'commit' as const,
      tree: treeHash,
      parents,
      author,
      committer,
      message,
    };
    commitHash = writeObject(repo, commitObj);

    const reason = `commit${!head ? ' (initial)' : mergeHeads.length ? ' (merge)' : ''}: ${subjectOf(message)}`;
    if (repo.head.type === 'symbolic') {
      updateRef(repo, repo.head.ref, commitHash, committer, reason);
    } else {
      repo.head = { type: 'detached', hash: commitHash };
      if (!repo.bare) {
        if (!repo.reflog.HEAD) repo.reflog.HEAD = [];
        repo.reflog.HEAD.push({ old: head ?? ZERO_HASH, new: commitHash, who: committer, message: reason });
      }
    }

    // Clear merge state
    delete repo.special.MERGE_HEAD;
    delete repo.mergeMsg;
    delete repo.special.REVERT_HEAD;
    delete repo.sequencer;
  });

  const repo = state.machines[machineId].repos[root];
  const branch = currentBranch(repo);
  const subject = subjectOf(message);
  const isRoot = parents.length === 0;
  const branchDisplay = branch ? branch : `(${shortHash(repo.head.type === 'detached' ? repo.head.hash : commitHash)})`;

  // Count files changed
  const newFlat = readTreeFlat(repo, treeHash);
  const oldFlat = head ? readTreeFlat(repo, getCommit(repo, head)!.tree) : {};
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  for (const p of new Set([...Object.keys(newFlat), ...Object.keys(oldFlat)])) {
    const oh = oldFlat[p]?.hash;
    const nh = newFlat[p]?.hash;
    if (oh !== nh) {
      filesChanged++;
      const oldContent = oh ? (getBlob(repo, oh)?.content ?? '') : '';
      const newContent = nh ? (getBlob(repo, nh)?.content ?? '') : '';
      const counts = countChanges(diffTexts(oldContent, newContent).changes);
      insertions += counts.added;
      deletions += counts.deleted;
    }
  }

  const rootLabel = isRoot ? '(root-commit) ' : '';
  o.out(`[${branchDisplay} ${rootLabel}${shortHash(commitHash)}] ${subject}`);
  if (filesChanged > 0) {
    const parts = [`${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`];
    if (insertions > 0) parts.push(`${insertions} insertion${insertions !== 1 ? 's' : ''}(+)`);
    if (deletions > 0) parts.push(`${deletions} deletion${deletions !== 1 ? 's' : ''}(-)`);
    o.out(` ${parts.join(', ')}`);
  }

  const loc = localLoc(machineId, root);
  o.ev({ type: 'commit.create', repo: loc, hash: commitHash, parents, message, kind, branch });
  return o.result(state);
}

export const commitEditorResume: EditorResumeHandler = (world, request, text) => {
  if (text === null) {
    return fail(world, 1, stderr('Aborting commit due to empty commit message.'));
  }
  const { author, committer, treeHash, head, mergeHeads, allowEmpty } = request.resume.data as Record<string, unknown>;
  return doCommit(world, request.machine, request.workTree, author as Signature, committer as Signature, treeHash as Hash, head as Hash | null, mergeHeads as Hash[], text, allowEmpty as boolean, head ? 'normal' : 'initial');
};

// =========================================================================
// git log
// =========================================================================

export const logHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { repo } = r;
  const o = new Out();

  const oneline = hasFlag(args, 'oneline');
  hasFlag(args, 'graph');
  const showAll = hasFlag(args, 'all');
  const maxCountStr = getString(args, 'max-count');
  const maxCount = maxCountStr ? parseInt(maxCountStr, 10) : undefined;
  const showStat = hasFlag(args, 'stat');
  const showPatch = hasFlag(args, 'patch');
  const nameOnly = hasFlag(args, 'name-only');
  const nameStatus = hasFlag(args, 'name-status');
  const abbrevCommit = hasFlag(args, 'abbrev-commit');
  const noDecorate = hasFlag(args, 'no-decorate');
  const decorateOpt = getString(args, 'decorate') ?? (noDecorate ? 'no' : 'short');
  const prettyStr = getString(args, 'pretty');
  const reverse = hasFlag(args, 'reverse');

  // Collect start points
  let startHashes: Hash[] = [];
  if (showAll) {
    for (const h of Object.values(repo.refs)) {
      const peeled = peel(repo, h);
      if (getCommit(repo, peeled)) startHashes.push(peeled);
    }
  }
  // Positional args as start points
  for (const p of args.positionals) {
    const h = resolveRev(repo, p);
    if (h && getCommit(repo, h)) startHashes.push(h);
  }
  if (startHashes.length === 0) {
    const h = headCommit(repo);
    if (!h) return ok(world);
    startHashes = [h];
  }

  // Build decoration map
  const decorations: Record<string, string[]> = {};
  if (decorateOpt !== 'no') {
    for (const [ref, hash] of Object.entries(repo.refs)) {
      const peeled = peel(repo, hash);
      if (!decorations[peeled]) decorations[peeled] = [];
      let label: string;
      if (ref.startsWith('refs/heads/')) label = ref.slice('refs/heads/'.length);
      else if (ref.startsWith('refs/tags/')) label = `tag: ${ref.slice('refs/tags/'.length)}`;
      else if (ref.startsWith('refs/remotes/')) label = ref.slice('refs/remotes/'.length);
      else label = ref;
      decorations[peeled].push(label);
    }
    // Add HEAD
    const headH = headCommit(repo);
    if (headH) {
      const branch = currentBranch(repo);
      const headLabel = branch ? `HEAD -> ${branch}` : 'HEAD';
      if (!decorations[headH]) decorations[headH] = [];
      // Remove the branch from the list if HEAD points to it, since we show "HEAD -> branch"
      if (branch) {
        decorations[headH] = decorations[headH].filter(l => l !== branch);
      }
      decorations[headH].unshift(headLabel);
    }
  }

  // Topological walk
  const visited = new Set<Hash>();
  const commits: CommitObject[] = [];
  const commitHashes: Hash[] = [];
  const queue = [...new Set(startHashes)];
  while (queue.length > 0) {
    const h = queue.shift()!;
    if (visited.has(h)) continue;
    visited.add(h);
    const c = getCommit(repo, h);
    if (!c) continue;
    commits.push(c);
    commitHashes.push(h);
    for (const p of c.parents) queue.push(p);
  }

  // Sort by timestamp descending
  const indexed = commits.map((c, i) => ({ c, h: commitHashes[i] }));
  indexed.sort((a, b) => b.c.committer.timestamp - a.c.committer.timestamp);
  if (reverse) indexed.reverse();

  const limit = maxCount !== undefined ? Math.min(maxCount, indexed.length) : indexed.length;

  for (let i = 0; i < limit; i++) {
    const { c, h } = indexed[i];
    const decor = decorations[h];
    const decorStr = decor && decor.length > 0 && decorateOpt !== 'no' ? ` (${decor.join(', ')})` : '';
    const hashStr = (oneline || abbrevCommit) ? shortHash(h) : h;

    if (oneline) {
      o.out(`${hashStr}${decorStr} ${subjectOf(c.message)}`);
    } else if (prettyStr) {
      // Basic format support
      let fmt = prettyStr;
      fmt = fmt.replace(/%H/g, h);
      fmt = fmt.replace(/%h/g, shortHash(h));
      fmt = fmt.replace(/%s/g, subjectOf(c.message));
      fmt = fmt.replace(/%an/g, c.author.name);
      fmt = fmt.replace(/%ae/g, c.author.email);
      fmt = fmt.replace(/%cn/g, c.committer.name);
      fmt = fmt.replace(/%ce/g, c.committer.email);
      fmt = fmt.replace(/%d/g, decorStr);
      fmt = fmt.replace(/%D/g, decor ? decor.join(', ') : '');
      fmt = fmt.replace(/%n/g, '\n');
      fmt = fmt.replace(/%P/g, c.parents.join(' '));
      fmt = fmt.replace(/%p/g, c.parents.map(p => shortHash(p)).join(' '));
      fmt = fmt.replace(/%B/g, c.message.replace(/\n$/, ''));
      fmt = fmt.replace(/%b/g, c.message.replace(/^[^\n]*\n?/, '').replace(/\n$/, ''));
      fmt = fmt.replace(/%T/g, c.tree);
      fmt = fmt.replace(/%t/g, shortHash(c.tree));
      o.out(fmt);
    } else {
      o.out(`commit ${hashStr}${decorStr}`);
      if (c.parents.length > 1) {
        o.out(`Merge: ${c.parents.map(p => shortHash(p)).join(' ')}`);
      }
      o.out(`Author: ${c.author.name} <${c.author.email}>`);
      o.out(`Date:   ${formatDate(c.author.timestamp, c.author.timezone)}`);
      o.out('');
      for (const line of c.message.replace(/\n$/, '').split('\n')) {
        o.out(`    ${line}`);
      }
      o.out('');
    }

    if (showStat || nameOnly || nameStatus || showPatch) {
      // Diff against first parent (or empty tree)
      const parentTree = c.parents.length > 0 ? getCommit(repo, c.parents[0])?.tree ?? EMPTY_TREE_HASH : EMPTY_TREE_HASH;
      const oldFlat = readTreeFlat(repo, parentTree);
      const newFlat = readTreeFlat(repo, c.tree);
      emitDiffSummary(o, repo, oldFlat, newFlat, showStat, nameOnly, nameStatus, showPatch);
    }
  }

  return o.result(world);
};

function formatDate(timestamp: number, tz: string): string {
  const d = new Date(timestamp * 1000);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${days[d.getUTCDay()]} ${months[d.getUTCMonth()]} ${String(d.getUTCDate()).padStart(2)} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}:${String(d.getUTCSeconds()).padStart(2, '0')} ${d.getUTCFullYear()} ${tz}`;
}

// =========================================================================
// git diff
// =========================================================================

export const diffHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine } = r;
  const o = new Out();

  const staged = hasFlag(args, 'staged');
  const showStat = hasFlag(args, 'stat');
  const nameOnly = hasFlag(args, 'name-only');
  const nameStatus = hasFlag(args, 'name-status');
  const contextStr = getString(args, 'unified');
  const context = contextStr ? parseInt(contextStr, 10) : 3;

  // Collect commit args
  const commitArgs: Hash[] = [];
  const pathArgs: string[] = [];
  for (const p of args.positionals) {
    const h = resolveRev(repo, p);
    if (h) commitArgs.push(h);
    else pathArgs.push(p);
  }
  if (args.paths) pathArgs.push(...args.paths);

  let oldFlat: Record<string, FlatTreeEntry>;
  let newFlat: Record<string, FlatTreeEntry>;
  let newSource: 'index' | 'worktree' | 'tree';

  if (commitArgs.length >= 2) {
    // diff <commit1> <commit2>
    const t1 = getCommit(repo, commitArgs[0])?.tree;
    const t2 = getCommit(repo, commitArgs[1])?.tree;
    oldFlat = t1 ? readTreeFlat(repo, t1) : {};
    newFlat = t2 ? readTreeFlat(repo, t2) : {};
    newSource = 'tree';
  } else if (staged) {
    // diff --staged [<commit>]
    const base = commitArgs[0] ?? headCommit(repo);
    const baseTree = base ? getCommit(repo, base)?.tree : undefined;
    oldFlat = baseTree ? readTreeFlat(repo, baseTree) : {};
    newFlat = indexFlat(repo);
    newSource = 'index';
  } else if (commitArgs.length === 1) {
    // diff <commit> -- work tree
    const baseTree = getCommit(repo, commitArgs[0])?.tree;
    oldFlat = baseTree ? readTreeFlat(repo, baseTree) : {};
    // Work tree content
    const work = listWorkTree(machine, root);
    newFlat = {};
    for (const [rp, content] of Object.entries(work)) {
      if (repo.index.entries[rp] || oldFlat[rp]) {
        newFlat[rp] = { hash: hashBlob(content), mode: repo.index.entries[rp]?.mode ?? oldFlat[rp]?.mode ?? '100644' };
      }
    }
    newSource = 'worktree';
  } else {
    // diff (index vs work tree)
    oldFlat = indexFlat(repo);
    const work = listWorkTree(machine, root);
    newFlat = {};
    for (const rp of Object.keys(oldFlat)) {
      if (work[rp] !== undefined) {
        newFlat[rp] = { hash: hashBlob(work[rp]), mode: oldFlat[rp].mode };
      }
      // deleted files: not in newFlat
    }
    newSource = 'worktree';
  }

  // Filter by pathspec if any
  if (pathArgs.length > 0) {
    try {
      const ps = parsePathspec(pathArgs, r.prefix, root);
      const filterFlat = (flat: Record<string, FlatTreeEntry>) => {
        const out: Record<string, FlatTreeEntry> = {};
        for (const p of Object.keys(flat)) {
          if (matchPathspec(ps, p) >= 0) out[p] = flat[p];
        }
        return out;
      };
      oldFlat = filterFlat(oldFlat);
      newFlat = filterFlat(newFlat);
    } catch { /* ignore pathspec errors for diff */ }
  }

  if (showStat || nameOnly || nameStatus) {
    emitDiffSummary(o, repo, oldFlat, newFlat, showStat, nameOnly, nameStatus, false);
  } else {
    emitDiffPatches(o, repo, oldFlat, newFlat, machine, root, newSource, context);
  }

  return o.result(world);
};

function emitDiffSummary(
  o: Out, repo: RepoState,
  oldFlat: Record<string, FlatTreeEntry>,
  newFlat: Record<string, FlatTreeEntry>,
  showStat: boolean, nameOnly: boolean, nameStatus: boolean, showPatch: boolean,
): void {
  const allPaths = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])].sort();
  const changes: { path: string; kind: string; added: number; deleted: number }[] = [];

  for (const p of allPaths) {
    const oh = oldFlat[p]?.hash;
    const nh = newFlat[p]?.hash;
    if (oh === nh) continue;
    const kind = !oh ? 'A' : !nh ? 'D' : 'M';
    const oldContent = oh ? (getBlob(repo, oh)?.content ?? '') : '';
    const newContent = nh ? (getBlob(repo, nh)?.content ?? '') : '';
    const counts = countChanges(diffTexts(oldContent, newContent).changes);
    changes.push({ path: p, kind, added: counts.added, deleted: counts.deleted });
  }

  if (nameOnly) {
    for (const c of changes) o.out(c.path);
  } else if (nameStatus) {
    for (const c of changes) o.out(`${c.kind}\t${c.path}`);
  }

  if (showStat && changes.length > 0) {
    const maxName = Math.max(...changes.map(c => c.path.length));
    for (const c of changes) {
      const total = c.added + c.deleted;
      const bar = '+'.repeat(c.added) + '-'.repeat(c.deleted);
      o.out(` ${c.path.padEnd(maxName)} | ${String(total).padStart(3)} ${bar}`);
    }
    const totalFiles = changes.length;
    const totalIns = changes.reduce((s, c) => s + c.added, 0);
    const totalDel = changes.reduce((s, c) => s + c.deleted, 0);
    const parts = [`${totalFiles} file${totalFiles !== 1 ? 's' : ''} changed`];
    if (totalIns > 0) parts.push(`${totalIns} insertion${totalIns !== 1 ? 's' : ''}(+)`);
    if (totalDel > 0) parts.push(`${totalDel} deletion${totalDel !== 1 ? 's' : ''}(-)`);
    o.out(` ${parts.join(', ')}`);
  }

  if (showPatch) {
    emitDiffPatches(o, repo, oldFlat, newFlat, undefined, undefined, 'tree', 3);
  }
}

function emitDiffPatches(
  o: Out, repo: RepoState,
  oldFlat: Record<string, FlatTreeEntry>,
  newFlat: Record<string, FlatTreeEntry>,
  machine: Machine | undefined, root: AbsPath | undefined,
  newSource: 'index' | 'worktree' | 'tree',
  context: number,
): void {
  const allPaths = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])].sort();

  for (const p of allPaths) {
    const oh = oldFlat[p]?.hash;
    const nh = newFlat[p]?.hash;
    if (oh === nh) continue;

    const oldContent = oh ? (getBlob(repo, oh)?.content ?? '') : '';
    let newContent: string;
    if (newSource === 'worktree' && machine && root) {
      const abs = absOf(root, p);
      newContent = nh ? (readFile(machine.fs, abs) ?? '') : '';
    } else {
      newContent = nh ? (getBlob(repo, nh)?.content ?? '') : '';
    }

    const oldMode = oldFlat[p]?.mode ?? '100644';
    const newMode = newFlat[p]?.mode ?? '100644';

    // Diff header
    o.out(`diff --git a/${p} b/${p}`);
    if (!oh) {
      o.out(`new file mode ${newMode}`);
      o.out(`index 0000000..${shortHash(nh!)}`);
      o.out(`--- /dev/null`);
      o.out(`+++ b/${p}`);
    } else if (!nh) {
      o.out(`deleted file mode ${oldMode}`);
      o.out(`index ${shortHash(oh)}..0000000`);
      o.out(`--- a/${p}`);
      o.out(`+++ /dev/null`);
    } else {
      if (oldMode !== newMode) o.out(`old mode ${oldMode}`, `new mode ${newMode}`);
      o.out(`index ${shortHash(oh)}..${shortHash(nh)} ${newMode}`);
      o.out(`--- a/${p}`);
      o.out(`+++ b/${p}`);
    }

    const hunks = emitHunks(diffTexts(oldContent, newContent), { context });
    for (const h of hunks) o.out(h);
  }
}

// =========================================================================
// git restore
// =========================================================================

export const restoreHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine: _machine, prefix } = r;

  const restoreStaged = hasFlag(args, 'staged');
  const restoreWorktree = hasFlag(args, 'worktree') || !restoreStaged;
  const source = getString(args, 'source');
  const useOurs = hasFlag(args, 'ours');
  const useTheirs = hasFlag(args, 'theirs');

  const pathArgs = allArgs(args);
  if (pathArgs.length === 0) {
    return fail(world, 128, stderr('fatal: you must specify path(s) to restore'));
  }

  let ps: Pathspec;
  try {
    ps = parsePathspec(pathArgs, prefix, root);
  } catch (e) {
    if (e instanceof PathspecError) return fatal(world, e.message);
    throw e;
  }

  // Source tree
  let sourceFlat: Record<string, FlatTreeEntry> | null = null;
  if (source) {
    const treeHash = resolveTreeish(repo, source);
    if (!treeHash) return fatal(world, `Could not resolve '${source}'`);
    sourceFlat = readTreeFlat(repo, treeHash);
  }

  const o = new Out();
  const stagedPaths: string[] = [];
  const writtenPaths: string[] = [];
  const deletedPaths: string[] = [];

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];

    for (const p of [...Object.keys(rep.index.entries), ...Object.keys(rep.index.conflicts)]) {
      if (matchPathspec(ps, p) < 0) continue;

      // Handle conflict resolution with --ours/--theirs
      if (rep.index.conflicts[p] && (useOurs || useTheirs)) {
        const conflict = rep.index.conflicts[p];
        const entry = useOurs ? conflict.ours : conflict.theirs;
        if (entry) {
          delete rep.index.conflicts[p];
          rep.index.entries[p] = entry;
          const content = getBlob(rep, entry.hash)?.content ?? '';
          writeFile(m.fs, absOf(root, p), content);
          stagedPaths.push(p);
          writtenPaths.push(p);
        }
        continue;
      }

      if (restoreStaged) {
        const headTree = source
          ? sourceFlat
          : (() => {
              const h = headCommit(rep);
              return h ? readTreeFlat(rep, getCommit(rep, h)!.tree) : {};
            })();
        if (headTree && headTree[p]) {
          rep.index.entries[p] = { path: p, hash: headTree[p].hash, mode: headTree[p].mode };
          stagedPaths.push(p);
        } else if (headTree && !headTree[p]) {
          delete rep.index.entries[p];
          stagedPaths.push(p);
        }
      }

      if (restoreWorktree && !restoreStaged) {
        // Restore from index (or source)
        const entry = source && sourceFlat
          ? sourceFlat[p]
          : rep.index.entries[p];
        if (entry) {
          const content = getBlob(rep, entry.hash)?.content ?? '';
          writeFile(m.fs, absOf(root, p), content);
          writtenPaths.push(p);
        }
      } else if (restoreWorktree && restoreStaged) {
        // Also restore work tree to match what we just put in the index
        const entry = rep.index.entries[p];
        if (entry) {
          const content = getBlob(rep, entry.hash)?.content ?? '';
          writeFile(m.fs, absOf(root, p), content);
          writtenPaths.push(p);
        } else {
          deleteFile(m.fs, absOf(root, p));
          deletedPaths.push(p);
        }
      }
    }

    // Also check paths in sourceFlat that aren't in the index (restore from a different commit)
    if (source && sourceFlat && restoreWorktree) {
      for (const p of Object.keys(sourceFlat)) {
        if (matchPathspec(ps, p) < 0) continue;
        if (writtenPaths.includes(p)) continue;
        const content = getBlob(rep, sourceFlat[p].hash)?.content ?? '';
        writeFile(m.fs, absOf(root, p), content);
        writtenPaths.push(p);
        if (restoreStaged) {
          rep.index.entries[p] = { path: p, hash: sourceFlat[p].hash, mode: sourceFlat[p].mode };
          stagedPaths.push(p);
        }
      }
    }
  });

  if (stagedPaths.length > 0) {
    o.ev({ type: 'index.unstage', repo: r.loc, paths: stagedPaths });
  }
  if (writtenPaths.length > 0 || deletedPaths.length > 0) {
    o.ev({ type: 'worktree.update', repo: r.loc, written: writtenPaths, deleted: deletedPaths, reason: 'restore' });
  }
  return o.result(state);
};

// =========================================================================
// git rm
// =========================================================================

export const rmHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine: _machine, prefix } = r;

  const cached = hasFlag(args, 'cached');
  hasFlag(args, 'force');
  const dryRun = hasFlag(args, 'dry-run');
  const recursive = hasFlag(args, 'recursive');

  const pathArgs = allArgs(args);
  if (pathArgs.length === 0) {
    return fail(world, 129, stderr('usage: git rm [-f | --force] [-n] [-r] [--cached] [-q] [--] <pathspec>...'));
  }

  let ps: Pathspec;
  try {
    ps = parsePathspec(pathArgs, prefix, root);
  } catch (e) {
    if (e instanceof PathspecError) return fatal(world, e.message);
    throw e;
  }

  const o = new Out();
  const removed: string[] = [];

  // Find matching files
  const matchedPaths: string[] = [];
  for (const rp of Object.keys(repo.index.entries)) {
    if (matchPathspec(ps, rp) >= 0) matchedPaths.push(rp);
  }

  if (matchedPaths.length === 0) {
    // Check if pathspec has literal paths
    const arg0 = pathArgs[0];
    return fatal(world, `pathspec '${arg0}' did not match any files`);
  }

  // Check for directories
  if (!recursive) {
    for (const p of matchedPaths) {
      if (matchedPaths.some(other => other !== p && other.startsWith(`${p}/`))) {
        return fail(world, 1, stderr(`fatal: not removing '${p}' recursively without -r`));
      }
    }
  }

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];
    for (const rp of matchedPaths) {
      if (!dryRun) {
        delete rep.index.entries[rp];
        if (!cached) {
          deleteFile(m.fs, absOf(root, rp));
        }
      }
      removed.push(rp);
      o.out(`rm '${rp}'`);
    }
  });

  if (removed.length > 0) {
    o.ev({ type: 'index.remove', repo: r.loc, paths: removed });
  }
  return o.result(state);
};

// =========================================================================
// git mv
// =========================================================================

export const mvHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo: _repo, machine: _machine, prefix } = r;

  const dryRunMv = hasFlag(args, 'dry-run');
  hasFlag(args, 'force');
  const verbose = hasFlag(args, 'verbose');

  const positionals = allArgs(args);
  if (positionals.length < 2) {
    return fail(world, 129, stderr('usage: git mv [<options>] <source>... <destination>'));
  }

  const o = new Out();
  const dest = positionals[positionals.length - 1];
  const sources = positionals.slice(0, -1);

  // Resolve to repo paths
  const destRp = prefix ? `${prefix}/${dest}` : dest;
  const destAbs = absOf(root, destRp);

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];

    for (const src of sources) {
      const srcRp = prefix ? `${prefix}/${src}` : src;
      const srcAbs = absOf(root, srcRp);
      const destIsDir = dirExists(m.fs, destAbs);
      const cleanDestRp = destRp.endsWith('/') ? destRp.slice(0, -1) : destRp;
      const targetRp = sources.length > 1 || destIsDir
        ? `${cleanDestRp}/${basename(srcRp)}`
        : cleanDestRp;
      const targetAbs = absOf(root, targetRp);

      if (!rep.index.entries[srcRp]) {
        o.err(`fatal: bad source, source=${srcRp}, destination=${targetRp}`);
        continue;
      }

      if (!dryRunMv) {
        // Move in index
        const entry = rep.index.entries[srcRp];
        delete rep.index.entries[srcRp];
        rep.index.entries[targetRp] = { ...entry, path: targetRp };

        // Move in filesystem
        const content = m.fs.files[srcAbs];
        if (content !== undefined) {
          deleteFile(m.fs, srcAbs);
          writeFile(m.fs, targetAbs, content);
        }
      }

      if (verbose || !dryRunMv) {
        o.out(`Renaming ${srcRp} to ${targetRp}`);
      }
      o.ev({ type: 'index.rename', repo: r.loc, from: srcRp, to: targetRp });
    }
  });

  return o.result(state);
};

// =========================================================================
// git show
// =========================================================================

export const showHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { repo } = r;
  const o = new Out();

  const noPatch = hasFlag(args, 'no-patch');
  const showStat = hasFlag(args, 'stat');
  const nameOnly = hasFlag(args, 'name-only');
  const nameStatus = hasFlag(args, 'name-status');
  const oneline = hasFlag(args, 'oneline');
  getString(args, 'pretty');
  const abbrevCommit = hasFlag(args, 'abbrev-commit');

  const refs = args.positionals.length > 0 ? args.positionals : ['HEAD'];

  for (const ref of refs) {
    const h = resolveRev(repo, ref);
    if (!h) return fatal(world, `bad object ${ref}`);

    const obj = getObject(repo, h);
    if (!obj) return fatal(world, `bad object ${ref}`);

    if (obj.type === 'commit') {
      const c = obj;
      const hashStr = (oneline || abbrevCommit) ? shortHash(h) : h;

      if (oneline) {
        o.out(`${hashStr} ${subjectOf(c.message)}`);
      } else {
        o.out(`commit ${hashStr}`);
        if (c.parents.length > 1) o.out(`Merge: ${c.parents.map(p => shortHash(p)).join(' ')}`);
        o.out(`Author: ${c.author.name} <${c.author.email}>`);
        o.out(`Date:   ${formatDate(c.author.timestamp, c.author.timezone)}`);
        o.out('');
        for (const line of c.message.replace(/\n$/, '').split('\n')) {
          o.out(`    ${line}`);
        }
        o.out('');
      }

      if (!noPatch || showStat || nameOnly || nameStatus) {
        const parentTree = c.parents.length > 0 ? getCommit(repo, c.parents[0])?.tree ?? EMPTY_TREE_HASH : EMPTY_TREE_HASH;
        const oldFlat = readTreeFlat(repo, parentTree);
        const newFlat = readTreeFlat(repo, c.tree);
        if (noPatch) {
          emitDiffSummary(o, repo, oldFlat, newFlat, showStat, nameOnly, nameStatus, false);
        } else {
          emitDiffSummary(o, repo, oldFlat, newFlat, showStat, nameOnly, nameStatus, true);
          if (!showStat && !nameOnly && !nameStatus) {
            emitDiffPatches(o, repo, oldFlat, newFlat, undefined, undefined, 'tree', 3);
          }
        }
      }
    } else if (obj.type === 'blob') {
      o.outText(obj.content);
    } else if (obj.type === 'tree') {
      const tree = obj;
      for (const e of tree.entries) {
        const t = e.mode === '040000' ? 'tree' : 'blob';
        o.out(`${e.mode} ${t} ${e.hash}\t${e.name}`);
      }
    } else if (obj.type === 'tag') {
      o.out(`tag ${obj.tag}`);
      o.out(`Tagger: ${obj.tagger.name} <${obj.tagger.email}>`);
      o.out(`Date:   ${formatDate(obj.tagger.timestamp, obj.tagger.timezone)}`);
      o.out('');
      o.outText(obj.message);
    }
  }

  return o.result(world);
};

// =========================================================================
// git branch
// =========================================================================

export const branchHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine: _machine } = r;
  const o = new Out();

  const doDelete = hasFlag(args, 'delete') || hasFlag(args, 'force-delete');
  const forceDelete = hasFlag(args, 'force-delete');
  const doMove = hasFlag(args, 'move') || hasFlag(args, 'force-move');
  const forceMove = hasFlag(args, 'force-move');
  const showAll = hasFlag(args, 'all');
  const showRemotes = hasFlag(args, 'remotes');
  const showCurrent = hasFlag(args, 'show-current');
  const verbosity = args.options.verbose as number | undefined ?? 0;
  const setUpstreamTo = getString(args, 'set-upstream-to');
  const unsetUpstream = hasFlag(args, 'unset-upstream');
  const forceCreate = hasFlag(args, 'force');

  const positionals = args.positionals;
  const cur = currentBranch(repo);

  if (showCurrent) {
    if (cur) o.out(cur);
    return o.result(world);
  }

  if (doDelete) {
    if (positionals.length === 0) return fatal(world, 'branch name required');
    const state = produce(world, d => {
      const rep = d.machines[machineId].repos[root];
      for (const name of positionals) {
        const ref = `refs/heads/${name}`;
        if (!rep.refs[ref]) {
          o.err(`error: branch '${name}' not found.`);
          continue;
        }
        if (name === currentBranch(rep) && !forceDelete) {
          o.err(`error: Cannot delete branch '${name}' checked out at '${root}'`);
          continue;
        }
        if (!forceDelete) {
          // Check if merged into HEAD
          const head = headCommit(rep);
          if (head && !isAncestor(rep, rep.refs[ref], head)) {
            o.err(`error: The branch '${name}' is not fully merged.`);
            o.err(`If you are sure you want to delete it, run 'git branch -D ${name}'.`);
            continue;
          }
        }
        const hash = rep.refs[ref];
        deleteRef(rep, ref);
        o.out(`Deleted branch ${name} (was ${shortHash(hash)}).`);
        o.ev({ type: 'ref.update', repo: r.loc, change: { ref, from: hash, to: null }, reason: 'branch' });
      }
    });
    return o.result(state);
  }

  if (doMove) {
    let oldName: string;
    let newName: string;
    if (positionals.length >= 2) {
      oldName = positionals[0];
      newName = positionals[1];
    } else if (positionals.length === 1) {
      if (!cur) return fatal(world, 'No current branch.');
      oldName = cur;
      newName = positionals[0];
    } else {
      return fail(world, 129, stderr('usage: git branch (-m | -M) [<old-branch>] <new-branch>'));
    }

    const oldRef = `refs/heads/${oldName}`;
    const newRef = `refs/heads/${newName}`;
    if (!repo.refs[oldRef]) return fatal(world, `No branch named '${oldName}'.`);
    if (repo.refs[newRef] && !forceMove) return fatal(world, `A branch named '${newName}' already exists.`);

    const state = produce(world, d => {
      const rep = d.machines[machineId].repos[root];
      const hash = rep.refs[oldRef];
      rep.refs[newRef] = hash;
      delete rep.refs[oldRef];
      // Update HEAD if pointing to old branch
      if (rep.head.type === 'symbolic' && rep.head.ref === oldRef) {
        rep.head = { type: 'symbolic', ref: newRef };
      }
      // Copy reflog
      if (rep.reflog[oldRef]) {
        rep.reflog[newRef] = rep.reflog[oldRef];
        delete rep.reflog[oldRef];
      }
    });
    return o.result(state);
  }

  if (setUpstreamTo) {
    const branchName = positionals[0] ?? cur;
    if (!branchName) return fatal(world, 'No current branch.');
    const ref = `refs/heads/${branchName}`;
    if (!repo.refs[ref]) return fatal(world, `No branch named '${branchName}'.`);

    // Parse upstream as remote/branch
    const parts = setUpstreamTo.split('/');
    const remoteName = parts[0];
    const remoteBranch = parts.slice(1).join('/');

    const state = produce(world, d => {
      const rep = d.machines[machineId].repos[root];
      rep.config[`branch.${branchName}.remote`] = remoteName;
      rep.config[`branch.${branchName}.merge`] = `refs/heads/${remoteBranch}`;
    });
    o.out(`branch '${branchName}' set up to track '${setUpstreamTo}'.`);
    return o.result(state);
  }

  if (unsetUpstream) {
    const branchName = positionals[0] ?? cur;
    if (!branchName) return fatal(world, 'No current branch.');
    const state = produce(world, d => {
      const rep = d.machines[machineId].repos[root];
      delete rep.config[`branch.${branchName}.remote`];
      delete rep.config[`branch.${branchName}.merge`];
    });
    return o.result(state);
  }

  // Create or list
  if (positionals.length >= 1 && !hasFlag(args, 'list')) {
    const name = positionals[0];
    const startPoint = positionals[1];
    const ref = `refs/heads/${name}`;

    if (repo.refs[ref] && !forceCreate) {
      return fatal(world, `A branch named '${name}' already exists.`);
    }

    let startHash: Hash;
    if (startPoint) {
      const h = resolveRev(repo, startPoint);
      if (!h) return fatal(world, `Not a valid object name: '${startPoint}'.`);
      startHash = h;
    } else {
      const h = headCommit(repo);
      if (!h) return fatal(world, 'Not a valid object name: \'HEAD\'.');
      startHash = h;
    }

    const state = produce(world, d => {
      const rep = d.machines[machineId].repos[root];
      const committer = sig(world, d.machines[machineId], rep);
      updateRef(rep, ref, startHash, committer, `branch: Created from ${startPoint ?? 'HEAD'}`);
    });
    o.ev({ type: 'ref.update', repo: r.loc, change: { ref, from: null, to: startHash }, reason: 'branch' });
    return o.result(state);
  }

  // List mode
  const branches = branchNames(repo);
  const remotes = showAll || showRemotes ? remoteBranchNames(repo) : [];

  if (!showRemotes || showAll) {
    for (const b of branches) {
      const marker = b === cur ? '* ' : '  ';
      if (verbosity > 0) {
        const hash = repo.refs[`refs/heads/${b}`];
        const c = hash ? getCommit(repo, hash) : undefined;
        const subject = c ? ` ${subjectOf(c.message)}` : '';
        o.out(`${marker}${b} ${shortHash(hash ?? '')}${subject}`);
      } else {
        o.out(`${marker}${b}`);
      }
    }
  }

  if (showAll || showRemotes) {
    for (const rb of remotes) {
      if (verbosity > 0) {
        const hash = repo.refs[`refs/remotes/${rb}`];
        const c = hash ? getCommit(repo, hash) : undefined;
        const subject = c ? ` ${subjectOf(c.message)}` : '';
        o.out(`  remotes/${rb} ${shortHash(hash ?? '')}${subject}`);
      } else {
        o.out(`  remotes/${rb}`);
      }
    }
  }

  return o.result(world);
};

function isAncestor(repo: RepoState, candidate: Hash, of: Hash): boolean {
  const visited = new Set<Hash>();
  const queue = [of];
  while (queue.length > 0) {
    const h = queue.shift()!;
    if (h === candidate) return true;
    if (visited.has(h)) continue;
    visited.add(h);
    const c = getCommit(repo, h);
    if (c) queue.push(...c.parents);
  }
  return false;
}

// =========================================================================
// git switch
// =========================================================================

export const switchHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine: _machine } = r;
  const o = new Out();

  const createBranch = getString(args, 'create');
  const forceCreate = getString(args, 'force-create');
  const detach = hasFlag(args, 'detach');
  const orphan = getString(args, 'orphan');
  const quiet = hasFlag(args, 'quiet');
  const discard = hasFlag(args, 'discard-changes') || hasFlag(args, 'force');

  const branchArg = createBranch ?? forceCreate ?? orphan ?? args.positionals[0];
  const startPoint = createBranch || forceCreate
    ? args.positionals[0]
    : args.positionals[1];

  if (!branchArg && !detach) {
    return fail(world, 128, stderr('fatal: missing branch or commit argument'));
  }

  if (orphan) {
    return doOrphanSwitch(world, machineId, root, orphan, quiet, o, r.loc);
  }

  const creatingNew = !!(createBranch || forceCreate);
  const targetBranch = creatingNew ? (createBranch ?? forceCreate!) : branchArg;
  let targetHash: Hash;

  if (creatingNew) {
    const sp = startPoint ?? 'HEAD';
    const h = resolveRev(repo, sp);
    if (!h) return fatal(world, `Not a valid object name: '${sp}'.`);
    targetHash = h;
    const ref = `refs/heads/${targetBranch}`;
    if (repo.refs[ref] && !forceCreate) {
      return fatal(world, `A branch named '${targetBranch}' already exists.`);
    }
  } else if (detach) {
    const target = branchArg ?? 'HEAD';
    const h = resolveRev(repo, target);
    if (!h) return fatal(world, `Not a valid object name: '${target}'.`);
    targetHash = h;
    return doDetach(world, machineId, root, targetHash, discard, quiet, o, r.loc, target);
  } else {
    // Existing branch
    const ref = `refs/heads/${targetBranch}`;
    if (!repo.refs[ref]) {
      // DWIM: check remote tracking branches
      const remotes = remoteBranchNames(repo);
      const match = remotes.find(rb => {
        const parts = rb.split('/');
        return parts.slice(1).join('/') === targetBranch;
      });
      if (match) {
        // Auto-create local branch tracking remote
        const remoteRef = `refs/remotes/${match}`;
        targetHash = repo.refs[remoteRef];
        const remoteName = match.split('/')[0];
        const state = produce(world, d => {
          const rep = d.machines[machineId].repos[root];
          const committer = sig(world, d.machines[machineId], rep);
          updateRef(rep, ref, targetHash, committer, `branch: Created from ${match}`);
          rep.config[`branch.${targetBranch}.remote`] = remoteName;
          rep.config[`branch.${targetBranch}.merge`] = `refs/heads/${targetBranch}`;
        });
        return doCheckoutBranch(state, machineId, root, targetBranch, targetHash, discard, quiet, o, r.loc);
      }
      return fatal(world, `invalid reference: ${targetBranch}`);
    }
    targetHash = repo.refs[ref];
  }

  if (creatingNew) {
    const ref = `refs/heads/${targetBranch}`;
    const state = produce(world, d => {
      const rep = d.machines[machineId].repos[root];
      const committer = sig(world, d.machines[machineId], rep);
      updateRef(rep, ref, targetHash, committer, `branch: Created from ${startPoint ?? 'HEAD'}`);
    });
    o.ev({ type: 'ref.update', repo: r.loc, change: { ref, from: null, to: targetHash }, reason: 'branch' });
    return doCheckoutBranch(state, machineId, root, targetBranch, targetHash, discard, quiet, o, r.loc);
  }

  return doCheckoutBranch(world, machineId, root, targetBranch, targetHash, discard, quiet, o, r.loc);
};

function doOrphanSwitch(world: World, machineId: string, root: AbsPath, branchName: string, quiet: boolean, o: Out, _loc: RepoLocation): CommandResult {
  const state = produce(world, d => {
    const m = d.machines[machineId];
    const repo = m.repos[root];
    const committer = sig(world, m, repo);
    const from = repo.head;
    repo.head = { type: 'symbolic', ref: `refs/heads/${branchName}` };
    // Clear the index
    repo.index = { entries: {}, conflicts: {} };
    // Clear work tree
    const work = listWorkTree(m, root);
    for (const rp of Object.keys(work)) {
      deleteFile(m.fs, absOf(root, rp));
    }
    const desc = from.type === 'symbolic' ? from.ref.replace('refs/heads/', '') : shortHash(from.type === 'detached' ? from.hash : '');
    if (!repo.bare) {
      const old = headCommit(repo) ?? ZERO_HASH;
      repo.reflog.HEAD = repo.reflog.HEAD ?? [];
      repo.reflog.HEAD.push({ old, new: ZERO_HASH, who: committer, message: `checkout: moving from ${desc} to ${branchName}` });
    }
  });
  if (!quiet) o.out(`Switched to a new branch '${branchName}'`);
  return o.result(state);
}

function doDetach(world: World, machineId: string, root: AbsPath, hash: Hash, discard: boolean, quiet: boolean, o: Out, loc: RepoLocation, targetName?: string): CommandResult {
  const repo = world.machines[machineId].repos[root];
  const oldHead = headCommit(repo);
  const from = currentBranch(repo) ?? (oldHead ? shortHash(oldHead) : '');
  const toName = targetName ?? shortHash(hash);

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];
    const committer = sig(world, m, rep);
    setHead(rep, { type: 'detached', hash }, committer, `checkout: moving from ${from} to ${toName}`);
  });

  // Update worktree
  const final = updateWorktreeForCheckout(state, machineId, root, hash, discard, o, loc);
  if (!quiet) {
    o.out(`HEAD is now at ${shortHash(hash)} ${subjectOf(getCommit(final.state.machines[machineId].repos[root], hash)?.message ?? '')}`);
  }
  o.ev({ type: 'head.detached', repo: loc, hash });
  return { ...final, output: [...o.lines, ...final.output.filter(l => !o.lines.includes(l))], events: [...o.events, ...final.events.filter(e => !o.events.includes(e))] };
}

function doCheckoutBranch(world: World, machineId: string, root: AbsPath, branchName: string, targetHash: Hash, discard: boolean, quiet: boolean, o: Out, loc: RepoLocation): CommandResult {
  const repo = world.machines[machineId].repos[root];
  const cur = currentBranch(repo);
  const oldHead = headCommit(repo);
  const from = cur ?? (oldHead ? shortHash(oldHead) : '');

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];
    const committer = sig(world, m, rep);
    setHead(rep, { type: 'symbolic', ref: `refs/heads/${branchName}` }, committer, `checkout: moving from ${from} to ${branchName}`);
  });

  const final = updateWorktreeForCheckout(state, machineId, root, targetHash, discard, o, loc);
  if (!quiet) {
    if (cur === branchName) {
      o.out(`Already on '${branchName}'`);
    } else if (!repo.refs[`refs/heads/${branchName}`] || (repo.refs[`refs/heads/${branchName}`] !== targetHash && !cur)) {
      o.out(`Switched to a new branch '${branchName}'`);
    } else {
      o.out(`Switched to branch '${branchName}'`);
    }
  }
  o.ev({ type: 'head.move', repo: loc, from: repo.head, to: { type: 'symbolic', ref: `refs/heads/${branchName}` } });
  return o.result(final.state);
}

function updateWorktreeForCheckout(world: World, machineId: string, root: AbsPath, targetHash: Hash, discard: boolean, o: Out, loc: RepoLocation): CommandResult {
  const machine = world.machines[machineId];
  const repo = machine.repos[root];

  const targetCommit = getCommit(repo, targetHash);
  if (!targetCommit) return ok(world);
  const targetFlat = readTreeFlat(repo, targetCommit.tree);
  const currentFlat = indexFlat(repo);
  const workFiles = listWorkTree(machine, root);

  const written: string[] = [];
  const deleted: string[] = [];

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];

    // Update index and worktree to match target
    rep.index = { entries: {}, conflicts: {} };
    for (const [rp, entry] of Object.entries(targetFlat)) {
      rep.index.entries[rp] = { path: rp, hash: entry.hash, mode: entry.mode };
      const blob = getBlob(rep, entry.hash);
      if (blob) {
        const current = currentFlat[rp];
        const workContent = workFiles[rp];
        // Only write if different from what's already there
        if (!current || current.hash !== entry.hash || workContent === undefined || hashBlob(workContent) !== entry.hash) {
          if (!discard && workContent !== undefined && current && current.hash !== entry.hash && hashBlob(workContent) !== current.hash) {
            // Dirty file — would be overwritten. For now, overwrite (git does complex checks)
          }
          writeFile(m.fs, absOf(root, rp), blob.content);
          written.push(rp);
        }
      }
    }

    // Remove files from old tree not in new tree
    for (const rp of Object.keys(currentFlat)) {
      if (!targetFlat[rp]) {
        if (discard || !workFiles[rp] || hashBlob(workFiles[rp]) === currentFlat[rp].hash) {
          deleteFile(m.fs, absOf(root, rp));
          pruneEmptyDirs(m.fs, dirname(absOf(root, rp)), root);
          deleted.push(rp);
        }
      }
    }
  });

  if (written.length > 0 || deleted.length > 0) {
    o.ev({ type: 'worktree.update', repo: loc, written, deleted, reason: 'checkout' });
  }
  return ok(state);
}

// =========================================================================
// git checkout
// =========================================================================

export const checkoutHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine: _machine2, prefix } = r;
  const o = new Out();

  const createBranch = getString(args, 'branch');
  const forceCreateBranch = getString(args, 'force-branch');
  const detach = hasFlag(args, 'detach');
  const orphan = getString(args, 'orphan');
  const useOurs = hasFlag(args, 'ours');
  const useTheirs = hasFlag(args, 'theirs');
  const quiet = hasFlag(args, 'quiet');
  const force = hasFlag(args, 'force');

  // checkout -- <paths>: restore files (like git restore)
  if (args.paths && args.paths.length > 0) {
    // File checkout: restore from index or commit
    const treeish = args.positionals[0];
    const paths = args.paths;
    let sourceFlat: Record<string, FlatTreeEntry> | null = null;

    if (treeish) {
      const h = resolveTreeish(repo, treeish);
      if (h) sourceFlat = readTreeFlat(repo, h);
    }

    let ps: Pathspec;
    try {
      ps = parsePathspec(paths, prefix, root);
    } catch (e) {
      if (e instanceof PathspecError) return fatal(world, e.message);
      throw e;
    }

    const writtenPaths: string[] = [];
    const state = produce(world, d => {
      const m = d.machines[machineId];
      const rep = m.repos[root];

      for (const rp of [...Object.keys(rep.index.entries), ...Object.keys(rep.index.conflicts), ...(sourceFlat ? Object.keys(sourceFlat) : [])]) {
        if (matchPathspec(ps, rp) < 0) continue;

        if (rep.index.conflicts[rp] && (useOurs || useTheirs)) {
          const conflict = rep.index.conflicts[rp];
          const entry = useOurs ? conflict.ours : conflict.theirs;
          if (entry) {
            delete rep.index.conflicts[rp];
            rep.index.entries[rp] = entry;
            writeFile(m.fs, absOf(root, rp), getBlob(rep, entry.hash)?.content ?? '');
            writtenPaths.push(rp);
          }
          continue;
        }

        if (sourceFlat && sourceFlat[rp]) {
          // Restore from specified tree
          const e = sourceFlat[rp];
          rep.index.entries[rp] = { path: rp, hash: e.hash, mode: e.mode };
          writeFile(m.fs, absOf(root, rp), getBlob(rep, e.hash)?.content ?? '');
          writtenPaths.push(rp);
        } else if (rep.index.entries[rp]) {
          // Restore from index
          const content = getBlob(rep, rep.index.entries[rp].hash)?.content ?? '';
          writeFile(m.fs, absOf(root, rp), content);
          writtenPaths.push(rp);
        }
      }
    });

    if (writtenPaths.length > 0) {
      o.out(`Updated ${writtenPaths.length} path${writtenPaths.length !== 1 ? 's' : ''} from ${sourceFlat ? 'the index' : 'the index'}`);
    }
    return o.result(state);
  }

  // Branch checkout
  if (orphan) {
    return doOrphanSwitch(world, machineId, root, orphan, quiet, o, r.loc);
  }

  const branchName = createBranch ?? forceCreateBranch;
  if (branchName) {
    // Create and checkout
    const startPoint = args.positionals[0] ?? 'HEAD';
    const h = resolveRev(repo, startPoint);
    if (!h) return fatal(world, `Not a valid object name: '${startPoint}'.`);

    const ref = `refs/heads/${branchName}`;
    if (repo.refs[ref] && !forceCreateBranch) {
      return fatal(world, `A branch named '${branchName}' already exists.`);
    }

    const state = produce(world, d => {
      const rep = d.machines[machineId].repos[root];
      const committer = sig(world, d.machines[machineId], rep);
      updateRef(rep, ref, h, committer, `branch: Created from ${startPoint}`);
    });
    o.ev({ type: 'ref.update', repo: r.loc, change: { ref, from: null, to: h }, reason: 'branch' });
    return doCheckoutBranch(state, machineId, root, branchName, h, force, quiet, o, r.loc);
  }

  const target = args.positionals[0];
  if (!target) {
    // No args: show current branch
    const branch = currentBranch(repo);
    if (branch) o.out(`Already on '${branch}'`);
    return o.result(world);
  }

  if (detach) {
    const h = resolveRev(repo, target);
    if (!h) return fatal(world, `Not a valid object name: '${target}'.`);
    return doDetach(world, machineId, root, h, force, quiet, o, r.loc, target);
  }

  // Try as branch name first
  const ref = `refs/heads/${target}`;
  if (repo.refs[ref]) {
    return doCheckoutBranch(world, machineId, root, target, repo.refs[ref], force, quiet, o, r.loc);
  }

  // Try as tag or commit (detach)
  const h = resolveRev(repo, target);
  if (h) {
    // Check if it's a remote branch to DWIM
    const remotes = remoteBranchNames(repo);
    const match = remotes.find(rb => rb.split('/').slice(1).join('/') === target);
    if (match) {
      const remoteRef = `refs/remotes/${match}`;
      const targetHash = repo.refs[remoteRef];
      const remoteName = match.split('/')[0];
      const state = produce(world, d => {
        const rep = d.machines[machineId].repos[root];
        const committer = sig(world, d.machines[machineId], rep);
        updateRef(rep, ref, targetHash, committer, `branch: Created from ${match}`);
        rep.config[`branch.${target}.remote`] = remoteName;
        rep.config[`branch.${target}.merge`] = `refs/heads/${target}`;
      });
      o.ev({ type: 'ref.update', repo: r.loc, change: { ref, from: null, to: targetHash }, reason: 'branch' });
      return doCheckoutBranch(state, machineId, root, target, targetHash, force, quiet, o, r.loc);
    }

    return doDetach(world, machineId, root, h, force, quiet, o, r.loc, target);
  }

  // Try as file path
  const rp = prefix ? `${prefix}/${target}` : target;
  if (repo.index.entries[rp]) {
    const state = produce(world, d => {
      const m = d.machines[machineId];
      const rep = m.repos[root];
      const content = getBlob(rep, rep.index.entries[rp].hash)?.content ?? '';
      writeFile(m.fs, absOf(root, rp), content);
    });
    return o.result(state);
  }

  return fatal(world, `pathspec '${target}' did not match any file(s) known to git`);
};

// =========================================================================
// git merge
// =========================================================================

export const mergeHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine: _machine3 } = r;
  const o = new Out();

  const doAbort = hasFlag(args, 'abort');
  const doContinue = hasFlag(args, 'continue');
  const ffOnly = hasFlag(args, 'ff-only');
  const noFf = isNegated(args, 'ff');
  const squash = hasFlag(args, 'squash');
  const messages = getList(args, 'message');
  const quiet = hasFlag(args, 'quiet');
  const allowUnrelated = hasFlag(args, 'allow-unrelated-histories');

  if (doAbort) {
    return doMergeAbort(world, machineId, root, o, r.loc);
  }

  if (doContinue) {
    return doMergeContinue(world, machineId, root, o, r.loc);
  }

  const target = args.positionals[0];
  if (!target) {
    return fail(world, 129, stderr('usage: git merge [<options>] [<commit>...]'));
  }

  const targetHash = resolveRev(repo, target);
  if (!targetHash) return fatal(world, `'${target}' - not something we can merge`);

  const head = headCommit(repo);
  if (!head) return fatal(world, 'You are on a branch yet to be born');

  currentBranch(repo);

  // Check if already up to date
  if (isAncestor(repo, targetHash, head)) {
    if (!quiet) o.out('Already up to date.');
    return o.result(world);
  }

  // Check for fast-forward
  if (isAncestor(repo, head, targetHash)) {
    if (noFf) {
      // Force a merge commit
      return doThreeWayMerge(world, machineId, root, head, targetHash, target, messages, squash, quiet, allowUnrelated, o, r.loc);
    }
    // Fast-forward
    const state = produce(world, d => {
      const m = d.machines[machineId];
      const rep = m.repos[root];
      const committer = sig(world, m, rep);
      rep.special.ORIG_HEAD = head;
      if (rep.head.type === 'symbolic') {
        updateRef(rep, rep.head.ref, targetHash, committer, `merge ${target}: Fast-forward`);
      } else {
        rep.head = { type: 'detached', hash: targetHash };
      }
    });
    const final = updateWorktreeForCheckout(state, machineId, root, targetHash, false, o, r.loc);
    if (!quiet) {
      o.out('Updating ' + shortHash(head) + '..' + shortHash(targetHash));
      o.out('Fast-forward');
      // Show files changed
      const oldFlat = readTreeFlat(repo, getCommit(repo, head)!.tree);
      const newFlat = readTreeFlat(repo, getCommit(repo, targetHash)!.tree);
      const allPaths = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])].sort();
      let filesChanged = 0, insertions = 0, deletions = 0;
      for (const p of allPaths) {
        const oh = oldFlat[p]?.hash;
        const nh = newFlat[p]?.hash;
        if (oh !== nh) {
          filesChanged++;
          const oldC = oh ? (getBlob(repo, oh)?.content ?? '') : '';
          const newC = nh ? (getBlob(repo, nh)?.content ?? '') : '';
          const counts = countChanges(diffTexts(oldC, newC).changes);
          insertions += counts.added;
          deletions += counts.deleted;
        }
      }
      if (filesChanged > 0) {
        const parts = [`${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`];
        if (insertions > 0) parts.push(`${insertions} insertion${insertions !== 1 ? 's' : ''}(+)`);
        if (deletions > 0) parts.push(`${deletions} deletion${deletions !== 1 ? 's' : ''}(-)`);
        o.out(` ${parts.join(', ')}`);
      }
    }
    o.ev({ type: 'merge.fastForward', repo: r.loc, from: head, to: targetHash });
    return o.result(final.state);
  }

  if (ffOnly) {
    return fail(world, 128, stderr('fatal: Not possible to fast-forward, aborting.'));
  }

  // Three-way merge
  return doThreeWayMerge(world, machineId, root, head, targetHash, target, messages, squash, quiet, allowUnrelated, o, r.loc);
};

function findMergeBase(repo: RepoState, a: Hash, b: Hash): Hash | null {
  // BFS from both sides to find common ancestor
  const ancestorsA = new Set<Hash>();
  const queueA = [a];
  while (queueA.length > 0) {
    const h = queueA.shift()!;
    if (ancestorsA.has(h)) continue;
    ancestorsA.add(h);
    const c = getCommit(repo, h);
    if (c) queueA.push(...c.parents);
  }
  // BFS from b, first match in ancestorsA is the merge base
  const visited = new Set<Hash>();
  const queueB = [b];
  while (queueB.length > 0) {
    const h = queueB.shift()!;
    if (visited.has(h)) continue;
    visited.add(h);
    if (ancestorsA.has(h)) return h;
    const c = getCommit(repo, h);
    if (c) queueB.push(...c.parents);
  }
  return null;
}

function doThreeWayMerge(
  world: World, machineId: string, root: AbsPath,
  head: Hash, theirs: Hash, theirName: string,
  messages: string[], squash: boolean, quiet: boolean,
  allowUnrelated: boolean,
  o: Out, loc: RepoLocation,
): CommandResult {
  const repo = world.machines[machineId].repos[root];
  const base = findMergeBase(repo, head, theirs);

  if (!base && !allowUnrelated) {
    return fatal(world, 'refusing to merge unrelated histories');
  }

  const baseTree = base ? getCommit(repo, base)?.tree ?? EMPTY_TREE_HASH : EMPTY_TREE_HASH;
  const oursTree = getCommit(repo, head)!.tree;
  const theirsTree = getCommit(repo, theirs)!.tree;

  const baseFlat = readTreeFlat(repo, baseTree);
  const oursFlat = readTreeFlat(repo, oursTree);
  const theirsFlat = readTreeFlat(repo, theirsTree);

  const allPaths = [...new Set([...Object.keys(baseFlat), ...Object.keys(oursFlat), ...Object.keys(theirsFlat)])].sort();

  const conflictPaths: string[] = [];
  const mergedIndex: Record<string, { hash: Hash; mode: FileMode }> = {};
  const mergedFiles: Record<string, string> = {};
  const conflicts: Record<string, ConflictEntry> = {};

  const branch = currentBranch(repo) ?? 'HEAD';

  for (const p of allPaths) {
    const bEntry = baseFlat[p];
    const oEntry = oursFlat[p];
    const tEntry = theirsFlat[p];

    const bh = bEntry?.hash;
    const oh = oEntry?.hash;
    const th = tEntry?.hash;

    if (oh === th) {
      // Both sides same, use ours (or deleted on both)
      if (oEntry) mergedIndex[p] = { hash: oEntry.hash, mode: oEntry.mode };
      continue;
    }

    if (oh === bh) {
      // Only theirs changed
      if (tEntry) {
        mergedIndex[p] = { hash: tEntry.hash, mode: tEntry.mode };
        mergedFiles[p] = getBlob(repo, tEntry.hash)?.content ?? '';
      }
      // else: theirs deleted it, we keep it deleted
      continue;
    }

    if (th === bh) {
      // Only ours changed
      if (oEntry) {
        mergedIndex[p] = { hash: oEntry.hash, mode: oEntry.mode };
      }
      // else: ours deleted it
      continue;
    }

    // Both changed differently
    if (!oh && !th) continue; // both deleted from different base? shouldn't happen

    if (!oh && th && !bh) {
      // Both added: conflict
      mergedIndex[p] = { hash: th, mode: tEntry!.mode };
    } else if (oh && !th && bh) {
      // Deleted by theirs, modified by ours: conflict
    } else if (!oh && th && bh) {
      // Deleted by ours, modified by theirs: conflict
    }

    // Content conflict: try three-way merge
    const baseContent = bh ? (getBlob(repo, bh)?.content ?? '') : '';
    const oursContent = oh ? (getBlob(repo, oh)?.content ?? '') : '';
    const theirsContent = th ? (getBlob(repo, th)?.content ?? '') : '';

    const result = merge3(baseContent, oursContent, theirsContent, {
      ours: branch,
      theirs: theirName,
    });

    if (result.conflicts === 0) {
      // Clean merge
      const hash = hashBlob(result.text);
      mergedIndex[p] = { hash, mode: oEntry?.mode ?? tEntry?.mode ?? '100644' };
      mergedFiles[p] = result.text;
    } else {
      // Conflict
      conflictPaths.push(p);
      mergedFiles[p] = result.text;
      conflicts[p] = {
        path: p,
        base: bEntry ? { path: p, hash: bh!, mode: bEntry.mode } : undefined,
        ours: oEntry ? { path: p, hash: oh!, mode: oEntry.mode } : undefined,
        theirs: tEntry ? { path: p, hash: th!, mode: tEntry.mode } : undefined,
      };
    }
  }

  const message = messages.length > 0
    ? messages.join('\n\n')
    : `Merge branch '${theirName}'${branch !== 'main' ? ` into ${branch}` : ''}\n`;

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];

    // Store merged blobs
    for (const [_p, content] of Object.entries(mergedFiles)) {
      writeBlob(rep, content);
    }

    // Update index
    rep.index.entries = {};
    rep.index.conflicts = {};
    for (const [p, entry] of Object.entries(mergedIndex)) {
      if (!conflicts[p]) {
        rep.index.entries[p] = { path: p, hash: entry.hash, mode: entry.mode };
      }
    }
    // Add non-conflicted paths from oursFlat that weren't touched
    for (const [p, _entry] of Object.entries(oursFlat)) {
      if (!mergedIndex[p] && !conflicts[p] && !theirsFlat[p] && !baseFlat[p]) {
        // ours-only addition that wasn't in the merge
      }
      if (rep.index.entries[p] === undefined && !conflicts[p]) {
        // Keep from merged
      }
    }

    // Set conflicts
    for (const [p, conflict] of Object.entries(conflicts)) {
      rep.index.conflicts[p] = conflict;
    }

    // Write merged files to work tree
    for (const [rp, content] of Object.entries(mergedFiles)) {
      writeFile(m.fs, absOf(root, rp), content);
    }
    // Write non-conflicted files that changed
    for (const [rp, entry] of Object.entries(mergedIndex)) {
      if (!mergedFiles[rp] && !conflicts[rp]) {
        const blob = getBlob(rep, entry.hash);
        if (blob) writeFile(m.fs, absOf(root, rp), blob.content);
      }
    }
    // Delete files that were removed
    for (const rp of Object.keys(oursFlat)) {
      if (!mergedIndex[rp] && !conflicts[rp]) {
        deleteFile(m.fs, absOf(root, rp));
      }
    }

    if (conflictPaths.length > 0) {
      rep.special.MERGE_HEAD = [theirs];
      rep.mergeMsg = message;
      rep.special.ORIG_HEAD = head;
    } else {
      rep.special.ORIG_HEAD = head;
    }
  });

  o.ev({ type: 'merge.start', repo: loc, ours: head, theirs, base });

  if (conflictPaths.length > 0) {
    o.out(`Auto-merging ${conflictPaths[0]}`);
    o.out(`CONFLICT (content): Merge conflict in ${conflictPaths[0]}`);
    if (conflictPaths.length > 1) {
      for (let i = 1; i < conflictPaths.length; i++) {
        o.out(`Auto-merging ${conflictPaths[i]}`);
        o.out(`CONFLICT (content): Merge conflict in ${conflictPaths[i]}`);
      }
    }
    o.out('Automatic merge failed; fix conflicts and then commit the result.');
    o.ev({ type: 'merge.conflict', repo: loc, paths: conflictPaths, operation: 'merge' });
    return o.result(state, 1);
  }

  // Clean merge: create merge commit
  if (squash) {
    if (!quiet) o.out(`Squash commit -- not updating HEAD`);
    return o.result(state);
  }

  // Auto-commit
  const identity = requireIdentity(world, state.machines[machineId], state.machines[machineId].repos[root]);
  if (isResult(identity)) return identity;

  const flat = indexFlat(state.machines[machineId].repos[root]);
  let treeHash: Hash = '';
  const state2 = produce(state, d => {
    const rep = d.machines[machineId].repos[root];
    treeHash = writeTreeFromFlat(rep, flat);
  });

  const commitResult = doCommit(state2, machineId, root, identity, identity, treeHash, head, [theirs], message, false, 'merge');
  o.ev({ type: 'merge.complete', repo: loc, hash: '' /* filled by doCommit */ });
  return { ...commitResult, output: [...o.lines, ...commitResult.output], events: [...o.events, ...commitResult.events] };
};

function doMergeAbort(world: World, machineId: string, root: AbsPath, o: Out, loc: RepoLocation): CommandResult {
  const repo = world.machines[machineId].repos[root];
  if (!repo.special.MERGE_HEAD) {
    return fatal(world, 'There is no merge to abort (MERGE_HEAD missing).');
  }
  const origHead = repo.special.ORIG_HEAD ?? headCommit(repo)!;

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];
    const committer = sig(world, m, rep);

    // Reset to ORIG_HEAD
    if (rep.head.type === 'symbolic') {
      updateRef(rep, rep.head.ref, origHead, committer, `reset: moving to ${shortHash(origHead)}`);
    } else {
      rep.head = { type: 'detached', hash: origHead };
    }

    // Clear merge state (keep ORIG_HEAD, like real git)
    delete rep.special.MERGE_HEAD;
    delete rep.mergeMsg;
    rep.index.conflicts = {};
  });

  // Restore worktree to ORIG_HEAD
  const final = updateWorktreeForCheckout(state, machineId, root, origHead, true, o, loc);
  o.ev({ type: 'merge.abort', repo: loc, operation: 'merge' });
  return o.result(final.state);
}

function doMergeContinue(world: World, machineId: string, root: AbsPath, o: Out, loc: RepoLocation): CommandResult {
  const repo = world.machines[machineId].repos[root];
  if (!repo.special.MERGE_HEAD) {
    return fatal(world, 'There is no merge in progress (MERGE_HEAD missing).');
  }
  if (Object.keys(repo.index.conflicts).length > 0) {
    return fail(world, 128, stderr(
      'error: Committing is not possible because you have unmerged files.',
      'hint: Fix them up in the work tree, and then use \'git add <file>\'',
      'hint: as appropriate to mark resolution and make a commit.',
      'fatal: Exiting because of an unresolved conflict.'
    ));
  }
  // Create merge commit
  const head = headCommit(repo)!;
  const mergeHeads = repo.special.MERGE_HEAD!;
  const message = repo.mergeMsg ?? `Merge commit\n`;

  const identity = requireIdentity(world, world.machines[machineId], repo);
  if (isResult(identity)) return identity;

  const flat = indexFlat(repo);
  let treeHash: Hash = '';
  const state = produce(world, d => {
    const rep = d.machines[machineId].repos[root];
    treeHash = writeTreeFromFlat(rep, flat);
  });

  const result = doCommit(state, machineId, root, identity, identity, treeHash, head, mergeHeads, message, false, 'merge');
  o.ev({ type: 'merge.complete', repo: loc, hash: '' });
  return { ...result, output: [...o.lines, ...result.output], events: [...o.events, ...result.events] };
}

// =========================================================================
// git revert
// =========================================================================

export const revertHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine: _machine4 } = r;
  const o = new Out();

  const doAbort = hasFlag(args, 'abort');
  const doContinue = hasFlag(args, 'continue');
  const noCommit = hasFlag(args, 'no-commit');
  const noEdit = isNegated(args, 'edit');

  if (doAbort) {
    return doRevertAbort(world, machineId, root, o, r.loc);
  }

  if (doContinue) {
    return doRevertContinue(world, machineId, root, noEdit, o, r.loc);
  }

  const targets = args.positionals;
  if (targets.length === 0) {
    return fail(world, 129, stderr('usage: git revert [<options>] <commit-ish>...'));
  }

  // Resolve all targets
  const hashes: Hash[] = [];
  for (const t of targets) {
    const h = resolveRev(repo, t);
    if (!h) return fatal(world, `bad revision '${t}'`);
    hashes.push(h);
  }

  // Revert commits one by one
  let w = world;
  for (let i = 0; i < hashes.length; i++) {
    const result = doRevertOne(w, machineId, root, hashes[i], noCommit, noEdit, hashes.slice(i + 1), o, r.loc);
    w = result.state;
    if (result.exitCode !== 0) return result;
    // If editor was opened, return to wait
    if (w.machines[machineId].editor) return result;
  }

  return o.result(w);
};

function doRevertOne(
  world: World, machineId: string, root: AbsPath,
  commitHash: Hash, noCommit: boolean, noEdit: boolean,
  remaining: Hash[], o: Out, loc: RepoLocation,
): CommandResult {
  const repo = world.machines[machineId].repos[root];
  const commit = getCommit(repo, commitHash);
  if (!commit) return fatal(world, `bad object ${commitHash}`);

  const head = headCommit(repo);
  if (!head) return fatal(world, 'You are on a branch yet to be born');

  const parentHash = commit.parents[0];
  if (!parentHash) return fatal(world, 'Cannot revert a root commit');

  const parentTree = getCommit(repo, parentHash)?.tree ?? EMPTY_TREE_HASH;
  const commitTree = commit.tree;
  const headTree = getCommit(repo, head)!.tree;

  const baseFlat = readTreeFlat(repo, commitTree);
  const oursFlat = readTreeFlat(repo, headTree);
  const theirsFlat = readTreeFlat(repo, parentTree);

  const allPaths = [...new Set([...Object.keys(baseFlat), ...Object.keys(oursFlat), ...Object.keys(theirsFlat)])].sort();
  const conflictPaths: string[] = [];
  const mergedIndex: Record<string, { hash: Hash; mode: FileMode }> = {};
  const mergedFiles: Record<string, string> = {};
  const conflicts: Record<string, ConflictEntry> = {};

  const branch = currentBranch(repo) ?? 'HEAD';

  for (const p of allPaths) {
    const bEntry = baseFlat[p];
    const oEntry = oursFlat[p];
    const tEntry = theirsFlat[p];

    const bh = bEntry?.hash;
    const oh = oEntry?.hash;
    const th = tEntry?.hash;

    if (oh === th) {
      if (oEntry) mergedIndex[p] = { hash: oEntry.hash, mode: oEntry.mode };
      continue;
    }
    if (oh === bh) {
      if (tEntry) {
        mergedIndex[p] = { hash: tEntry.hash, mode: tEntry.mode };
        mergedFiles[p] = getBlob(repo, tEntry.hash)?.content ?? '';
      }
      continue;
    }
    if (th === bh) {
      if (oEntry) mergedIndex[p] = { hash: oEntry.hash, mode: oEntry.mode };
      continue;
    }

    const baseContent = bh ? (getBlob(repo, bh)?.content ?? '') : '';
    const oursContent = oh ? (getBlob(repo, oh)?.content ?? '') : '';
    const theirsContent = th ? (getBlob(repo, th)?.content ?? '') : '';

    const result = merge3(baseContent, oursContent, theirsContent, {
      ours: branch,
      theirs: `parent of ${shortHash(commitHash)}`,
    });

    if (result.conflicts === 0) {
      const hash = hashBlob(result.text);
      mergedIndex[p] = { hash, mode: oEntry?.mode ?? tEntry?.mode ?? '100644' };
      mergedFiles[p] = result.text;
    } else {
      conflictPaths.push(p);
      mergedFiles[p] = result.text;
      conflicts[p] = {
        path: p,
        base: bEntry ? { path: p, hash: bh!, mode: bEntry.mode } : undefined,
        ours: oEntry ? { path: p, hash: oh!, mode: oEntry.mode } : undefined,
        theirs: tEntry ? { path: p, hash: th!, mode: tEntry.mode } : undefined,
      };
    }
  }

  const message = `Revert "${subjectOf(commit.message)}"\n\nThis reverts commit ${commitHash}.\n`;

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];

    for (const [_p, content] of Object.entries(mergedFiles)) {
      writeBlob(rep, content);
    }

    rep.index.entries = {};
    rep.index.conflicts = {};
    for (const [p, entry] of Object.entries(mergedIndex)) {
      if (!conflicts[p]) {
        rep.index.entries[p] = { path: p, hash: entry.hash, mode: entry.mode };
      }
    }
    // Keep existing index entries that weren't part of the revert
    for (const [p, entry] of Object.entries(repo.index.entries)) {
      if (rep.index.entries[p] === undefined && !conflicts[p] && !mergedIndex[p]) {
        rep.index.entries[p] = entry;
      }
    }
    for (const [p, c] of Object.entries(conflicts)) {
      rep.index.conflicts[p] = c;
    }

    for (const [rp, content] of Object.entries(mergedFiles)) {
      writeFile(m.fs, absOf(root, rp), content);
    }
    for (const [rp, entry] of Object.entries(mergedIndex)) {
      if (!mergedFiles[rp] && !conflicts[rp]) {
        const blob = getBlob(rep, entry.hash);
        if (blob) writeFile(m.fs, absOf(root, rp), blob.content);
      }
    }
    for (const rp of Object.keys(oursFlat)) {
      if (!mergedIndex[rp] && !conflicts[rp]) {
        deleteFile(m.fs, absOf(root, rp));
      }
    }

    if (conflictPaths.length > 0) {
      rep.special.REVERT_HEAD = commitHash;
      rep.mergeMsg = message;
      rep.special.ORIG_HEAD = head;
      if (remaining.length > 0) {
        rep.sequencer = { kind: 'revert', todo: remaining, done: [], options: {} };
      }
    }
  });

  o.ev({ type: 'revert.start', repo: loc, hash: commitHash } as unknown as GameEvent);

  if (conflictPaths.length > 0) {
    for (const p of conflictPaths) {
      o.out(`CONFLICT (content): Merge conflict in ${p}`);
    }
    o.out('error: could not revert ' + shortHash(commitHash) + '... ' + subjectOf(commit.message));
    o.out('hint: After resolving the conflicts, mark the corrected paths');
    o.out('hint: by adding them to the index (using "git add").');
    o.out('hint: Then execute "git revert --continue".');
    o.ev({ type: 'merge.conflict', repo: loc, paths: conflictPaths, operation: 'revert' });
    return o.result(state, 1);
  }

  if (noCommit) {
    // Set REVERT_HEAD like real git does for --no-commit
    const stateWithRevertHead = produce(state, d => {
      const rep = d.machines[machineId].repos[root];
      rep.special.REVERT_HEAD = commitHash;
      rep.mergeMsg = message;
    });
    return o.result(stateWithRevertHead);
  }

  // Auto-commit the revert
  const identity = requireIdentity(world, state.machines[machineId], state.machines[machineId].repos[root]);
  if (isResult(identity)) return identity;

  if (!noEdit) {
    // Open editor
    const editorState = produce(state, d => {
      d.machines[machineId].editor = {
        purpose: 'commit-message',
        file: '.git/COMMIT_EDITMSG',
        initialContent: message,
        command: 'git revert',
        machine: machineId,
        workTree: root,
        resume: { handler: 'revert', data: { commitHash, remaining } },
      };
    });
    o.ev({ type: 'editor.open', request: editorState.machines[machineId].editor! });
    return o.result(editorState);
  }

  const flat = indexFlat(state.machines[machineId].repos[root]);
  let treeHash: Hash = '';
  const state2 = produce(state, d => {
    treeHash = writeTreeFromFlat(d.machines[machineId].repos[root], flat);
  });

  return doCommit(state2, machineId, root, identity, identity, treeHash, head, [], message, false, 'revert');
};

export const revertEditorResume: EditorResumeHandler = (world, request, text) => {
  if (text === null) {
    return fail(world, 1, stderr('Aborting revert due to empty commit message.'));
  }
  const { commitHash: _commitHash, remaining: _remaining } = request.resume.data as Record<string, unknown>;
  const repo = world.machines[request.machine].repos[request.workTree];
  const head = headCommit(repo)!;
  const identity = requireIdentity(world, world.machines[request.machine], repo);
  if (isResult(identity)) return identity;

  const flat = indexFlat(repo);
  let treeHash: Hash = '';
  const state = produce(world, d => {
    treeHash = writeTreeFromFlat(d.machines[request.machine].repos[request.workTree], flat);
  });

  return doCommit(state, request.machine, request.workTree, identity, identity, treeHash, head, [], text, false, 'revert');
};

function doRevertAbort(world: World, machineId: string, root: AbsPath, o: Out, loc: RepoLocation): CommandResult {
  const repo = world.machines[machineId].repos[root];
  if (!repo.special.REVERT_HEAD && !repo.sequencer) {
    return fatal(world, 'error: no revert in progress');
  }

  const origHead = repo.special.ORIG_HEAD ?? headCommit(repo)!;
  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];
    const committer = sig(world, m, rep);

    if (rep.head.type === 'symbolic') {
      updateRef(rep, rep.head.ref, origHead, committer, `reset: moving to ${shortHash(origHead)}`);
    } else {
      rep.head = { type: 'detached', hash: origHead };
    }

    delete rep.special.REVERT_HEAD;
    delete rep.special.ORIG_HEAD;
    delete rep.mergeMsg;
    delete rep.sequencer;
    rep.index.conflicts = {};
  });

  const final = updateWorktreeForCheckout(state, machineId, root, origHead, true, o, loc);
  o.ev({ type: 'merge.abort', repo: loc, operation: 'revert' });
  return o.result(final.state);
}

function doRevertContinue(world: World, machineId: string, root: AbsPath, noEdit: boolean, o: Out, loc: RepoLocation): CommandResult {
  const repo = world.machines[machineId].repos[root];
  if (!repo.special.REVERT_HEAD) {
    return fatal(world, 'error: no revert in progress');
  }
  if (Object.keys(repo.index.conflicts).length > 0) {
    return fail(world, 128, stderr(
      'error: Committing is not possible because you have unmerged files.',
      'hint: Fix them up in the work tree, and then use \'git add <file>\'',
      'hint: as appropriate to mark resolution and make a commit.',
      'fatal: Exiting because of an unresolved conflict.'
    ));
  }

  const head = headCommit(repo)!;
  const message = repo.mergeMsg ?? 'Revert\n';
  const identity = requireIdentity(world, world.machines[machineId], repo);
  if (isResult(identity)) return identity;

  const flat = indexFlat(repo);
  let treeHash: Hash = '';
  const state = produce(world, d => {
    treeHash = writeTreeFromFlat(d.machines[machineId].repos[root], flat);
  });

  const commitResult = doCommit(state, machineId, root, identity, identity, treeHash, head, [], message, false, 'revert');

  // Continue with remaining reverts if sequencer has todo items
  const newRepo = commitResult.state.machines[machineId].repos[root];
  if (newRepo.sequencer && newRepo.sequencer.todo.length > 0) {
    const remaining = [...newRepo.sequencer.todo];
    const nextHash = remaining.shift()!;
    const w2 = produce(commitResult.state, d => {
      const rep = d.machines[machineId].repos[root];
      delete rep.special.REVERT_HEAD;
      delete rep.mergeMsg;
      if (rep.sequencer) {
        rep.sequencer.todo = remaining;
      }
    });
    const nextResult = doRevertOne(w2, machineId, root, nextHash, false, noEdit, remaining, o, loc);
    return { ...nextResult, output: [...commitResult.output, ...o.lines, ...nextResult.output], events: [...commitResult.events, ...o.events, ...nextResult.events] };
  }

  // Clear sequencer
  const finalState = produce(commitResult.state, d => {
    const rep = d.machines[machineId].repos[root];
    delete rep.special.REVERT_HEAD;
    delete rep.special.ORIG_HEAD;
    delete rep.mergeMsg;
    delete rep.sequencer;
  });

  o.ev({ type: 'revert.complete', repo: loc, hash: '' } as unknown as GameEvent);
  return { ...commitResult, state: finalState, output: [...o.lines, ...commitResult.output], events: [...o.events, ...commitResult.events] };
}
