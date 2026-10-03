/**
 * Engine B — git stash, commit --amend, reset, reflog.
 *
 * Every handler is a pure function `(World, GitContext) => CommandResult`.
 * State mutations use immer `produce`. Output matches real git's wording.
 */
import { produce } from 'immer';
import { hasFlag, getString, getList } from '../../shared/args';
import { ZERO_HASH } from '../../shared/constants';
import type { CommitKind, RefUpdateReason } from '../../shared/events';
import type { CommandResult } from '../../shared/result';
import { fatal, ok, fail, stdout, stderr } from '../../shared/result';
import type {
  AbsPath, CommitObject, Hash,
  Machine, RepoState, Signature, World,
} from '../../shared/types';
import {
  getBlob, getCommit, hashBlob, peel, readTreeFlat, shortHash,
  subjectOf, writeBlob, writeObject, writeTreeFromFlat,
} from '../core/objects';
import type { FlatTreeEntry } from '../core/objects';
import {
  absOf, configuredIdentity, currentBranch,
  dwimRef, headCommit, listWorkTree, readRef, resolveReflogRev,
  signatureFor, updateRef, appendReflog,
} from '../core/repo';
import {
  deleteFile, writeFile,
} from '../core/fs';
import type { GitContext, GitHandler, EditorResumeHandler } from '../types';
import { Out, openRepo, openWorkTree, isResult, localLoc, fatalResult } from '../a/context';
import { countChanges, diffTexts } from '../a/xdiff';

// =========================================================================
// Helpers (shared with engine A but not exported — reimplemented here)
// =========================================================================

function sig(world: World, machine: Machine, repo: RepoState | undefined): Signature {
  return signatureFor(world, machine, repo);
}

/** Resolve a revision name: branch, tag, HEAD, HEAD~n, hash prefix, etc. */
function resolveRev(repo: RepoState, name: string): Hash | null {
  if (name === 'HEAD' || name === '@') {
    return headCommit(repo);
  }
  const fromReflog = resolveReflogRev(repo, name);
  if (fromReflog !== undefined) return fromReflog;
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
    const matches = Object.keys(repo.objects).filter(h => h.startsWith(name));
    if (matches.length === 1) return matches[0];
  }
  return null;
}

/** Build a flat index map. */
function indexFlat(repo: RepoState): Record<string, FlatTreeEntry> {
  const out: Record<string, FlatTreeEntry> = {};
  for (const e of Object.values(repo.index.entries)) {
    out[e.path] = { hash: e.hash, mode: e.mode };
  }
  return out;
}

/** HEAD's tree as flat map, empty if unborn. */
function headFlat(repo: RepoState): Record<string, FlatTreeEntry> {
  const h = headCommit(repo);
  if (!h) return {};
  const c = getCommit(repo, h);
  return c ? readTreeFlat(repo, c.tree) : {};
}

/** Requires identity configured. */
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
// git commit (wrapper that intercepts --amend, delegates rest to Engine A)
// =========================================================================

import { commitHandler as commitHandlerA } from '../a/commands';

export const commitHandler: GitHandler = (world, ctx) => {
  if (hasFlag(ctx.args, 'amend')) {
    return amendCommit(world, ctx);
  }
  return commitHandlerA(world, ctx);
};

// =========================================================================
// git stash
// =========================================================================

/**
 * Parse a stash reference like "stash@{0}" or just "0" into an index.
 * Returns null if it doesn't parse as a stash ref.
 */
function parseStashRef(arg: string): number | null {
  const m = /^stash@\{(\d+)\}$/.exec(arg);
  if (m) return parseInt(m[1], 10);
  const n = parseInt(arg, 10);
  if (!isNaN(n) && String(n) === arg && n >= 0) return n;
  return null;
}

/**
 * Get the stash entry list (reflog of refs/stash), newest first.
 * In git, the stash reflog is stored newest-last, but stash@{0} is the newest.
 */
function getStashList(repo: RepoState): { hash: Hash; message: string }[] {
  const reflog = repo.reflog['refs/stash'];
  if (!reflog || reflog.length === 0) return [];
  // reflog is oldest-first, stash@{0} = newest = last entry
  return [...reflog].reverse().map(e => ({ hash: e.new, message: e.message }));
}

export const stashHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const sub = args.subcommand ?? 'push';

  switch (sub) {
    case 'push': return stashPush(world, machineId, args);
    case 'pop': return stashPop(world, machineId, args);
    case 'apply': return stashApply(world, machineId, args, false);
    case 'list': return stashList(world, machineId);
    case 'drop': return stashDrop(world, machineId, args);
    case 'show': return stashShow(world, machineId, args);
    case 'clear': return stashClear(world, machineId);
    default: return fatal(world, `Unknown stash subcommand: ${sub}`);
  }
};

function stashPush(world: World, machineId: string, args: import('../../shared/args').ParsedArgs): CommandResult {
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine } = r;
  const o = new Out();

  const identity = requireIdentity(world, machine, repo);
  if (isResult(identity)) return identity;
  const who = identity as Signature;

  const head = headCommit(repo);
  if (!head) return fatal(world, 'You do not have the initial commit yet');

  const headObj = getCommit(repo, head)!;
  const includeUntracked = hasFlag(args, 'include-untracked');
  const message = getString(args, 'message');

  // Check if there are changes to stash
  const workFiles = listWorkTree(machine, root);
  const headTree = readTreeFlat(repo, headObj.tree);

  // Check index changes vs HEAD
  const idxFlat = indexFlat(repo);
  let hasIndexChanges = false;
  for (const p of new Set([...Object.keys(idxFlat), ...Object.keys(headTree)])) {
    if (idxFlat[p]?.hash !== headTree[p]?.hash || idxFlat[p]?.mode !== headTree[p]?.mode) {
      hasIndexChanges = true;
      break;
    }
  }

  // Check worktree changes vs index
  let hasWorktreeChanges = false;
  for (const [p, entry] of Object.entries(repo.index.entries)) {
    const content = workFiles[p];
    if (content === undefined) {
      hasWorktreeChanges = true;
      break;
    }
    if (hashBlob(content) !== entry.hash) {
      hasWorktreeChanges = true;
      break;
    }
  }

  // Check for untracked files
  let hasUntracked = false;
  if (includeUntracked) {
    for (const p of Object.keys(workFiles)) {
      if (!repo.index.entries[p]) {
        hasUntracked = true;
        break;
      }
    }
  }

  if (!hasIndexChanges && !hasWorktreeChanges && !hasUntracked) {
    return ok(world, stdout('No local changes to save'));
  }

  const branch = currentBranch(repo) ?? 'HEAD';
  const headSubject = subjectOf(headObj.message);
  const stashMsg = message
    ? `On ${branch}: ${message}`
    : `WIP on ${branch}: ${shortHash(head)} ${headSubject}`;

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];

    // 1. Create an index commit (tree = current index state)
    const indexTree = writeTreeFromFlat(rep, idxFlat);
    const indexCommit: CommitObject = {
      type: 'commit',
      tree: indexTree,
      parents: [head],
      author: who,
      committer: who,
      message: `index on ${branch}: ${shortHash(head)} ${headSubject}\n`,
    };
    const indexCommitHash = writeObject(rep, indexCommit);

    // 2. Create a worktree commit (tree = current working tree state for tracked files)
    const wtFlat: Record<string, FlatTreeEntry> = {};
    for (const [p, entry] of Object.entries(rep.index.entries)) {
      const content = workFiles[p];
      if (content !== undefined) {
        const blobHash = writeBlob(rep, content);
        wtFlat[p] = { hash: blobHash, mode: entry.mode };
      }
      // If content is undefined, file was deleted in worktree — don't include
    }
    // Also include index entries for files not in worktree (deleted) — skip them
    const wtTree = writeTreeFromFlat(rep, wtFlat);

    const parents = [head, indexCommitHash];

    // 3. If includeUntracked, create untracked files commit
    if (includeUntracked) {
      const untrackedFlat: Record<string, FlatTreeEntry> = {};
      for (const [p, content] of Object.entries(workFiles)) {
        if (!rep.index.entries[p]) {
          const blobHash = writeBlob(rep, content);
          untrackedFlat[p] = { hash: blobHash, mode: '100644' };
        }
      }
      if (Object.keys(untrackedFlat).length > 0) {
        const untrackedTree = writeTreeFromFlat(rep, untrackedFlat);
        const untrackedCommit: CommitObject = {
          type: 'commit',
          tree: untrackedTree,
          parents: [head],
          author: who,
          committer: who,
          message: `untracked files on ${branch}: ${shortHash(head)} ${headSubject}\n`,
        };
        const untrackedHash = writeObject(rep, untrackedCommit);
        parents.push(untrackedHash);
      }
    }

    // 4. Create the stash commit (worktree state)
    const stashCommit: CommitObject = {
      type: 'commit',
      tree: wtTree,
      parents,
      author: who,
      committer: who,
      message: stashMsg,
    };
    const stashHash = writeObject(rep, stashCommit);

    // 5. Update refs/stash with reflog
    const oldStash = rep.refs['refs/stash'] ?? ZERO_HASH;
    rep.refs['refs/stash'] = stashHash;
    appendReflog(rep, 'refs/stash', {
      old: oldStash,
      new: stashHash,
      who,
      message: stashMsg,
    });

    // 6. Reset working tree and index to HEAD
    const headFlatEntries = readTreeFlat(rep, headObj.tree);
    // Reset index to HEAD
    rep.index.entries = {};
    for (const [p, entry] of Object.entries(headFlatEntries)) {
      rep.index.entries[p] = { path: p, hash: entry.hash, mode: entry.mode };
    }
    rep.index.conflicts = {};

    // Reset worktree to HEAD
    // Delete files that are not in HEAD
    for (const p of Object.keys(workFiles)) {
      const abs = absOf(root, p);
      if (!headFlatEntries[p]) {
        if (includeUntracked || repo.index.entries[p]) {
          deleteFile(m.fs, abs);
        }
      }
    }
    // Write HEAD files
    for (const [p, entry] of Object.entries(headFlatEntries)) {
      const blob = getBlob(rep, entry.hash);
      if (blob) writeFile(m.fs, absOf(root, p), blob.content);
    }
  });

  o.out(`Saved working directory and index state ${stashMsg}`);
  const loc = localLoc(machineId, root);
  o.ev({ type: 'stash.push', repo: loc, hash: state.machines[machineId].repos[root].refs['refs/stash'], message: stashMsg });
  return o.result(state);
}

function stashApply(world: World, machineId: string, args: import('../../shared/args').ParsedArgs, isDrop: boolean): CommandResult {
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine } = r;
  const o = new Out();

  const idx = args.positionals.length > 0 ? parseStashRef(args.positionals[0]) : 0;
  if (idx === null) return fatal(world, `'${args.positionals[0]}' is not a valid stash reference`);

  const stashes = getStashList(repo);
  if (idx >= stashes.length) {
    return fail(world, 1, stderr(`error: stash@{${idx}} is not a valid reference`));
  }

  const stash = stashes[idx];
  const stashCommit = getCommit(repo, stash.hash);
  if (!stashCommit) return fatal(world, 'stash commit not found');

  // The stash commit's tree is the worktree state
  const stashTree = readTreeFlat(repo, stashCommit.tree);
  // The index commit is the second parent
  const indexCommitHash = stashCommit.parents[1];
  const indexCommit = indexCommitHash ? getCommit(repo, indexCommitHash) : null;
  const indexTree = indexCommit ? readTreeFlat(repo, indexCommit.tree) : null;

  // Parent (base) commit tree
  const baseHash = stashCommit.parents[0];
  const baseCommit = getCommit(repo, baseHash);
  const baseTree = baseCommit ? readTreeFlat(repo, baseCommit.tree) : {};

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];

    // Apply worktree changes: for each file in stash tree that differs from base, apply
    for (const p of new Set([...Object.keys(stashTree), ...Object.keys(baseTree)])) {
      const stashEntry = stashTree[p];
      const baseEntry = baseTree[p];
      if (stashEntry?.hash !== baseEntry?.hash) {
        if (stashEntry) {
          const blob = getBlob(rep, stashEntry.hash);
          if (blob) writeFile(m.fs, absOf(root, p), blob.content);
        } else {
          // File was deleted in stash
          deleteFile(m.fs, absOf(root, p));
        }
      }
    }

    // Apply untracked files if 3rd parent exists
    if (stashCommit.parents.length >= 3) {
      const untrackedHash = stashCommit.parents[2];
      const untrackedCommit = getCommit(rep, untrackedHash);
      if (untrackedCommit) {
        const untrackedTree = readTreeFlat(rep, untrackedCommit.tree);
        for (const [p, entry] of Object.entries(untrackedTree)) {
          const blob = getBlob(rep, entry.hash);
          if (blob) writeFile(m.fs, absOf(root, p), blob.content);
        }
      }
    }

    // Note: by default, `git stash apply` does NOT restore index state.
    // It only restores worktree changes. The --index flag restores index too.
    if (hasFlag(args, 'index') && indexTree) {
      rep.index.entries = {};
      for (const [p, entry] of Object.entries(indexTree)) {
        rep.index.entries[p] = { path: p, hash: entry.hash, mode: entry.mode };
      }
    }

    // Drop if this is pop
    if (isDrop) {
      dropStashEntry(rep, idx, sig(world, machine, rep));
    }
  });

  if (!hasFlag(args, 'quiet')) {
    o.out(`On branch ${currentBranch(repo) ?? '(no branch)'}`);
    // Simplified output
    o.out('Changes not staged for commit:');
    o.out('  (use "git add <file>..." to update what will be committed)');
    o.out('  (use "git restore <file>..." to discard changes in working directory)');
    o.out('');

    // List modified files
    const newWorkFiles = listWorkTree(state.machines[machineId], root);
    const currentIndex = state.machines[machineId].repos[root].index.entries;
    for (const p of Object.keys(currentIndex).sort()) {
      const content = newWorkFiles[p];
      if (content === undefined) {
        o.out(`\tdeleted:    ${p}`);
      } else if (hashBlob(content) !== currentIndex[p].hash) {
        o.out(`\tmodified:   ${p}`);
      }
    }
    o.out('');
    o.out('no changes added to commit (use "git add" and/or "git commit -a")');
  }

  const loc = localLoc(machineId, root);
  o.ev({ type: 'stash.apply', repo: loc, hash: stash.hash, dropped: isDrop });
  return o.result(state);
}

function stashPop(world: World, machineId: string, args: import('../../shared/args').ParsedArgs): CommandResult {
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { repo } = r;

  const idx = args.positionals.length > 0 ? parseStashRef(args.positionals[0]) : 0;
  if (idx === null) return fatal(world, `'${args.positionals[0]}' is not a valid stash reference`);

  const stashes = getStashList(repo);
  if (idx >= stashes.length) {
    return fail(world, 1, stderr(`error: stash@{${idx}} is not a valid reference`));
  }

  // Apply first, then drop
  const applyResult = stashApply(world, machineId, args, true);
  if (applyResult.exitCode !== 0) return applyResult;

  const quiet = hasFlag(args, 'quiet');
  if (!quiet) {
    const stash = stashes[idx];
    const stashRef = `stash@{${idx}}`;
    // "Dropped refs/stash@{0} (hash)" appended to apply output
    const finalOutput = [...applyResult.output, { stream: 'stdout' as const, text: `Dropped refs/${stashRef} (${stash.hash})` }];
    return { ...applyResult, output: finalOutput };
  }
  return applyResult;
}

function stashList(world: World, machineId: string): CommandResult {
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { repo } = r;
  const o = new Out();

  const stashes = getStashList(repo);
  for (let i = 0; i < stashes.length; i++) {
    const msg = stashes[i].message;
    o.out(`stash@{${i}}: ${msg}`);
  }
  return o.result(world);
}

function dropStashEntry(repo: RepoState, idx: number, _who: Signature): void {
  const reflog = repo.reflog['refs/stash'];
  if (!reflog) return;
  // reflog is oldest-first, stash@{0} = last entry, stash@{n} = reflog[reflog.length - 1 - n]
  const reflogIdx = reflog.length - 1 - idx;
  if (reflogIdx < 0 || reflogIdx >= reflog.length) return;

  reflog.splice(reflogIdx, 1);

  if (reflog.length === 0) {
    delete repo.refs['refs/stash'];
    delete repo.reflog['refs/stash'];
  } else {
    // refs/stash points to the newest stash (last reflog entry)
    repo.refs['refs/stash'] = reflog[reflog.length - 1].new;
  }
}

function stashDrop(world: World, machineId: string, args: import('../../shared/args').ParsedArgs): CommandResult {
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine } = r;
  const o = new Out();

  const idx = args.positionals.length > 0 ? parseStashRef(args.positionals[0]) : 0;
  if (idx === null) return fatal(world, `'${args.positionals[0]}' is not a valid stash reference`);

  const stashes = getStashList(repo);
  if (idx >= stashes.length) {
    return fail(world, 1, stderr(`error: stash@{${idx}} is not a valid reference`));
  }

  const stash = stashes[idx];
  const who = sig(world, machine, repo);

  const state = produce(world, d => {
    const rep = d.machines[machineId].repos[root];
    dropStashEntry(rep, idx, who);
  });

  if (!hasFlag(args, 'quiet')) {
    o.out(`Dropped refs/stash@{${idx}} (${stash.hash})`);
  }

  const loc = localLoc(machineId, root);
  o.ev({ type: 'stash.drop', repo: loc, hash: stash.hash });
  return o.result(state);
}

function stashShow(world: World, machineId: string, args: import('../../shared/args').ParsedArgs): CommandResult {
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { repo } = r;
  const o = new Out();

  const idx = args.positionals.length > 0 ? parseStashRef(args.positionals[0]) : 0;
  if (idx === null) return fatal(world, `'${args.positionals[0]}' is not a valid stash reference`);

  const stashes = getStashList(repo);
  if (idx >= stashes.length) {
    return fail(world, 1, stderr(`error: stash@{${idx}} is not a valid reference`));
  }

  const stash = stashes[idx];
  const stashCommit = getCommit(repo, stash.hash);
  if (!stashCommit) return fatal(world, 'stash commit not found');

  // Compare stash worktree tree with parent (base) tree
  const baseHash = stashCommit.parents[0];
  const baseCommit = getCommit(repo, baseHash);
  const baseTree = baseCommit ? readTreeFlat(repo, baseCommit.tree) : {};
  const stashTree = readTreeFlat(repo, stashCommit.tree);

  const showPatch = hasFlag(args, 'patch');

  // Stat summary
  const allPaths = new Set([...Object.keys(baseTree), ...Object.keys(stashTree)]);
  let filesChanged = 0;
  let insertions = 0;
  let deletions = 0;
  for (const p of allPaths) {
    const oh = baseTree[p]?.hash;
    const nh = stashTree[p]?.hash;
    if (oh !== nh) {
      filesChanged++;
      const oldContent = oh ? (getBlob(repo, oh)?.content ?? '') : '';
      const newContent = nh ? (getBlob(repo, nh)?.content ?? '') : '';
      const counts = countChanges(diffTexts(oldContent, newContent).changes);
      insertions += counts.added;
      deletions += counts.deleted;

      if (!showPatch) {
        const ins = nh ? counts.added : 0;
        const del = oh ? counts.deleted : 0;
        const bar = '+'.repeat(Math.min(ins, 40)) + '-'.repeat(Math.min(del, 40));
        const total = ins + del;
        o.out(` ${p.padEnd(30)} | ${String(total).padStart(3)} ${bar}`);
      }
    }
  }

  if (!showPatch) {
    const parts = [`${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`];
    if (insertions > 0) parts.push(`${insertions} insertion${insertions !== 1 ? 's' : ''}(+)`);
    if (deletions > 0) parts.push(`${deletions} deletion${deletions !== 1 ? 's' : ''}(-)`);
    o.out(` ${parts.join(', ')}`);
  }

  return o.result(world);
}

function stashClear(world: World, machineId: string): CommandResult {
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { root } = r;

  const state = produce(world, d => {
    const rep = d.machines[machineId].repos[root];
    delete rep.refs['refs/stash'];
    delete rep.reflog['refs/stash'];
  });

  return ok(state);
}

// =========================================================================
// git commit --amend
// =========================================================================

export function amendCommit(world: World, ctx: GitContext): CommandResult {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine } = r;
  const o = new Out();

  const identity = requireIdentity(world, machine, repo);
  if (isResult(identity)) return identity;
  const committer: Signature = identity as Signature;

  const head = headCommit(repo);
  if (!head) {
    return fatal(world, 'You have nothing to amend.');
  }

  const headObj = getCommit(repo, head)!;

  // Check for conflicts
  if (Object.keys(repo.index.conflicts).length > 0) {
    return fail(world, 128, stderr(
      'error: Committing is not possible because you have unmerged files.',
      'hint: Fix them up in the work tree, and then use \'git add <file>\'',
      'hint: as appropriate to mark resolution and make a commit.',
      'fatal: Exiting because of an unresolved conflict.'
    ));
  }

  // Build tree from current index
  const flat = indexFlat(repo);
  let treeHash: Hash = '';
  const state2 = produce(world, d => {
    const rep = d.machines[machineId].repos[root];
    treeHash = writeTreeFromFlat(rep, flat);
  });
  treeHash = treeHash!;

  // Keep original author, use current committer
  const author = headObj.author;

  const messages = getList(args, 'message');
  if (messages.length === 0) {
    // Open editor with old message
    const branch = currentBranch(repo);
    const initial = `${headObj.message.replace(/\n$/, '')}\n\n# Please enter the commit message for your changes. Lines starting\n# with '#' will be ignored, and an empty message aborts the commit.\n#\n# On branch ${branch ?? '(detached)'}\n# Date:      ${new Date(author.timestamp * 1000).toUTCString()}\n#\n# Changes to be committed:\n`;
    const editorState = produce(state2, d => {
      d.machines[machineId].editor = {
        purpose: 'commit-message',
        file: '.git/COMMIT_EDITMSG',
        initialContent: initial,
        command: 'git commit --amend',
        machine: machineId,
        workTree: root,
        resume: {
          handler: 'amend',
          data: { author, committer, treeHash, parents: headObj.parents, head },
        },
      };
    });
    o.ev({ type: 'editor.open', request: editorState.machines[machineId].editor! });
    return o.result(editorState);
  }

  const message = messages.join('\n\n');
  return doAmend(state2, machineId, root, author, committer, treeHash, headObj.parents, head, message);
}

function doAmend(
  world: World, machineId: string, root: AbsPath,
  author: Signature, committer: Signature,
  treeHash: Hash, parents: Hash[], oldHead: Hash,
  rawMessage: string,
): CommandResult {
  const o = new Out();
  // Strip comment lines and trim
  const msg = rawMessage.split('\n').filter(l => !l.startsWith('#')).join('\n').replace(/^\s+/, '').replace(/\s+$/, '');
  if (!msg) {
    return fail(world, 1, stderr('Aborting commit due to empty commit message.'));
  }

  const message = msg.endsWith('\n') ? msg : `${msg}\n`;

  let commitHash: Hash = '';
  const state = produce(world, d => {
    const m = d.machines[machineId];
    const repo = m.repos[root];

    const commitObj: CommitObject = {
      type: 'commit',
      tree: treeHash,
      parents,
      author,
      committer,
      message,
    };
    commitHash = writeObject(repo, commitObj);

    // Update HEAD ref to point to new commit
    const reason = `commit (amend): ${subjectOf(message)}`;
    if (repo.head.type === 'symbolic') {
      updateRef(repo, repo.head.ref, commitHash, committer, reason);
    } else {
      repo.head = { type: 'detached', hash: commitHash };
      if (!repo.bare) {
        if (!repo.reflog.HEAD) repo.reflog.HEAD = [];
        repo.reflog.HEAD.push({ old: oldHead, new: commitHash, who: committer, message: reason });
      }
    }
  });

  const repo = state.machines[machineId].repos[root];
  const branch = currentBranch(repo);
  const subject = subjectOf(message);
  const branchDisplay = branch ?? `(${shortHash(commitHash)})`;

  // Count files changed
  const newFlat = readTreeFlat(repo, treeHash);
  const parentHash = parents.length > 0 ? parents[0] : null;
  const oldFlat = parentHash ? readTreeFlat(repo, getCommit(repo, parentHash)!.tree) : {};
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

  o.out(`[${branchDisplay} ${shortHash(commitHash)}] ${subject}`);
  if (filesChanged > 0) {
    const parts = [`${filesChanged} file${filesChanged !== 1 ? 's' : ''} changed`];
    if (insertions > 0) parts.push(`${insertions} insertion${insertions !== 1 ? 's' : ''}(+)`);
    if (deletions > 0) parts.push(`${deletions} deletion${deletions !== 1 ? 's' : ''}(-)`);
    o.out(` ${parts.join(', ')}`);
  }

  const loc = localLoc(machineId, root);
  o.ev({ type: 'commit.create', repo: loc, hash: commitHash, parents, message, kind: 'amend' as CommitKind, branch });
  return o.result(state);
}

export const amendEditorResume: EditorResumeHandler = (world, request, text) => {
  if (text === null) {
    return fail(world, 1, stderr('Aborting commit due to empty commit message.'));
  }
  const { author, committer, treeHash, parents, head } = request.resume.data as Record<string, unknown>;
  return doAmend(world, request.machine, request.workTree, author as Signature, committer as Signature, treeHash as Hash, parents as Hash[], head as Hash, text);
};

// =========================================================================
// git reset
// =========================================================================

export const resetHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo, machine } = r;
  const o = new Out();

  const who = sig(world, machine, repo);
  const soft = hasFlag(args, 'soft');
  const hard = hasFlag(args, 'hard');
  const mixed = hasFlag(args, 'mixed');
  const quiet = hasFlag(args, 'quiet');

  // Determine mode
  const modeCount = (soft ? 1 : 0) + (hard ? 1 : 0) + (mixed ? 1 : 0);
  if (modeCount > 1) {
    return fail(world, 1, stderr('error: --soft, --mixed, and --hard are mutually exclusive'));
  }
  const mode: 'soft' | 'mixed' | 'hard' = soft ? 'soft' : hard ? 'hard' : 'mixed';

  // Check for path form: `git reset [<commit>] -- <paths>` or `git reset -- <paths>`
  const hasPaths = args.paths !== null && args.paths.length > 0;

  if (hasPaths) {
    // Path form: unstage specific files
    return resetPaths(world, machineId, root, repo, args);
  }

  // Commit form: git reset [--soft|--mixed|--hard] [<commit>]
  const commitArg = args.positionals[0];
  let targetHash: Hash;
  if (commitArg) {
    const resolved = resolveRev(repo, commitArg);
    if (!resolved) {
      return fatal(world, `ambiguous argument '${commitArg}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
    }
    targetHash = resolved;
  } else {
    const h = headCommit(repo);
    if (!h) return fatal(world, 'Failed to resolve \'HEAD\' as a valid ref.');
    targetHash = h;
  }

  const currentHead = headCommit(repo);
  const targetCommit = getCommit(repo, targetHash);
  if (!targetCommit) return fatal(world, `not a commit: ${targetHash}`);

  const targetTree = readTreeFlat(repo, targetCommit.tree);

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const rep = m.repos[root];

    // Set ORIG_HEAD before moving HEAD
    if (currentHead) {
      rep.special.ORIG_HEAD = currentHead;
    }

    // Move HEAD
    const reason = `reset: moving to ${commitArg ?? shortHash(targetHash)}`;
    if (rep.head.type === 'symbolic') {
      updateRef(rep, rep.head.ref, targetHash, who, reason);
    } else {
      rep.head = { type: 'detached', hash: targetHash };
      if (!rep.bare) {
        appendReflog(rep, 'HEAD', {
          old: currentHead ?? ZERO_HASH,
          new: targetHash,
          who,
          message: reason,
        });
      }
    }

    // Mixed or Hard: reset index
    if (mode === 'mixed' || mode === 'hard') {
      rep.index.entries = {};
      for (const [p, entry] of Object.entries(targetTree)) {
        rep.index.entries[p] = { path: p, hash: entry.hash, mode: entry.mode };
      }
      rep.index.conflicts = {};
    }

    // Hard: also reset worktree
    if (mode === 'hard') {
      // Remove all tracked files
      const workFiles = listWorkTree(m, root);
      for (const p of Object.keys(workFiles)) {
        // Only reset tracked files (files that were in the old index or HEAD)
        if (repo.index.entries[p] || headFlat(repo)[p]) {
          deleteFile(m.fs, absOf(root, p));
        }
      }
      // Write target tree files
      for (const [p, entry] of Object.entries(targetTree)) {
        const blob = getBlob(rep, entry.hash);
        if (blob) writeFile(m.fs, absOf(root, p), blob.content);
      }
    }

    // Clear merge state
    delete rep.special.MERGE_HEAD;
    delete rep.mergeMsg;
    delete rep.special.REVERT_HEAD;
    delete rep.sequencer;
  });

  if (!quiet && mode === 'mixed') {
    // Show "Unstaged changes after reset:" if there are worktree modifications
    const newRepo = state.machines[machineId].repos[root];
    const newWorkFiles = listWorkTree(state.machines[machineId], root);
    let hasChanges = false;
    for (const [p, entry] of Object.entries(newRepo.index.entries)) {
      const content = newWorkFiles[p];
      if (content === undefined) {
        if (!hasChanges) { o.out('Unstaged changes after reset:'); hasChanges = true; }
        o.out(`D\t${p}`);
      } else if (hashBlob(content) !== entry.hash) {
        if (!hasChanges) { o.out('Unstaged changes after reset:'); hasChanges = true; }
        o.out(`M\t${p}`);
      }
    }
  }

  const loc = localLoc(machineId, root);
  if (currentHead !== targetHash) {
    const change = { ref: repo.head.type === 'symbolic' ? repo.head.ref : 'HEAD', from: currentHead, to: targetHash };
    o.ev({ type: 'ref.update', repo: loc, change, reason: 'reset' as RefUpdateReason });
  }
  o.ev({ type: 'head.move', repo: loc, from: repo.head, to: state.machines[machineId].repos[root].head });

  return o.result(state);
}

function resetPaths(
  world: World, machineId: string, root: AbsPath,
  repo: RepoState, args: import('../../shared/args').ParsedArgs,
): CommandResult {
  const o = new Out();
  const paths = args.paths ?? [];

  // Determine tree-ish: positionals[0] if it resolves, otherwise HEAD
  let treeish = 'HEAD';
  let pathList = [...paths];
  if (args.positionals.length > 0) {
    const resolved = resolveRev(repo, args.positionals[0]);
    if (resolved) {
      treeish = args.positionals[0];
      // remaining positionals are also paths
      pathList = [...args.positionals.slice(1), ...paths];
    } else {
      // positional[0] is a path too
      pathList = [...args.positionals, ...paths];
    }
  }

  const targetHash = resolveRev(repo, treeish);
  if (!targetHash) return fatal(world, `Failed to resolve '${treeish}' as a valid ref.`);

  const targetCommit = getCommit(repo, targetHash);
  const targetTree = targetCommit ? readTreeFlat(repo, targetCommit.tree) : {};

  const state = produce(world, d => {
    const rep = d.machines[machineId].repos[root];

    for (const p of pathList) {
      if (targetTree[p]) {
        // Reset this file in the index to the target version
        rep.index.entries[p] = { path: p, hash: targetTree[p].hash, mode: targetTree[p].mode };
      } else {
        // File not in target: remove from index
        delete rep.index.entries[p];
      }
      // Remove from conflicts if present
      delete rep.index.conflicts[p];
    }
  });

  const loc = localLoc(machineId, root);
  o.ev({ type: 'index.unstage', repo: loc, paths: pathList });
  return o.result(state);
}

// =========================================================================
// git reflog
// =========================================================================

export const reflogHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { repo } = r;
  const o = new Out();

  const maxCountStr = getString(args, 'max-count');
  const maxCount = maxCountStr ? parseInt(maxCountStr, 10) : undefined;

  // Determine which ref to show
  let refName = 'HEAD';
  if (args.positionals.length > 0) {
    refName = args.positionals[0];
  }

  // Resolve the ref name
  let fullRef: string;
  if (refName === 'HEAD') {
    fullRef = 'HEAD';
  } else {
    // Try refs/heads/<name> first, then the name as-is
    const candidate = `refs/heads/${refName}`;
    if (repo.reflog[candidate]) {
      fullRef = candidate;
    } else if (repo.reflog[refName]) {
      fullRef = refName;
    } else {
      // Try dwim
      const dwim = dwimRef(repo, refName);
      fullRef = dwim ?? refName;
    }
  }

  const entries = repo.reflog[fullRef];
  if (!entries || entries.length === 0) {
    return fatal(world, `ambiguous argument '${refName}': unknown revision or path not in the working tree.\nUse '--' to separate paths from revisions, like this:\n'git <command> [<revision>...] -- [<file>...]'`);
  }

  // Display name for the entries
  const displayRef = fullRef === 'HEAD' ? 'HEAD' : (fullRef.startsWith('refs/heads/') ? fullRef.slice('refs/heads/'.length) : fullRef);

  // Show entries newest-first
  const reversed = [...entries].reverse();
  const limit = maxCount !== undefined ? Math.min(maxCount, reversed.length) : reversed.length;
  for (let i = 0; i < limit; i++) {
    const e = reversed[i];
    o.out(`${shortHash(e.new)} ${displayRef}@{${i}}: ${e.message}`);
  }

  return o.result(world);
};
