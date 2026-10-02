/**
 * Remote command table — remote, clone, fetch, pull, push.
 *
 * Every handler is a pure function `(World, GitContext) => CommandResult`.
 * State mutations use immer `produce`. Output matches real git's wording.
 */
import { produce } from 'immer';
import type { ParsedArgs } from '../shared/args';
import { getString, getCount, hasFlag, isNegated, parseArgs } from '../shared/args';
import { ZERO_HASH, parseHubUrl } from '../shared/constants';
import type { RefChange } from '../shared/events';
import { fatal, fail, stdout, stderr } from '../shared/result';
import type {
  Hash, Machine, RepoState, Signature, World, HostedRepo,
} from '../shared/types';
import {
  copyObjectClosure, getBlob, getCommit,
  readTreeFlat, shortHash,
} from '../engine/core/objects';
import {
  createEmptyRepo, currentBranch, headCommit,
  signatureFor,
} from '../engine/core/repo';
import {
  dirExists, filesUnder, mkdirp, writeFile,
} from '../engine/core/fs';
import { join, normalize } from '../engine/core/paths';
import type { GitHandler, CommandTable } from '../engine/types';
import { Out, openRepo, openWorkTree, isResult } from '../engine/a/context';
import { mergeHandler } from '../engine/a/commands';
import { GIT_COMMANDS } from '../shared/commandSpecs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sig(world: World, machine: Machine, repo: RepoState | undefined): Signature {
  return signatureFor(world, machine, repo);
}

/** Resolve a remote name to its URL. */
function remoteUrl(repo: RepoState, remoteName: string): string | undefined {
  return repo.config[`remote.${remoteName}.url`];
}

/** List all remote names configured in the repo. */
function remoteNames(repo: RepoState): string[] {
  const names = new Set<string>();
  for (const key of Object.keys(repo.config)) {
    const m = /^remote\.([^.]+)\.url$/.exec(key);
    if (m) names.add(m[1]);
  }
  return [...names].sort();
}

/** Find the hosted repo for a remote name. */
function resolveRemote(world: World, repo: RepoState, remoteName: string): { url: string; hosted: HostedRepo } | string {
  const url = remoteUrl(repo, remoteName);
  if (!url) return `fatal: '${remoteName}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`;
  const parsed = parseHubUrl(url);
  if (!parsed) return `fatal: '${url}' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.`;
  const hosted = world.hosted[parsed.id];
  if (!hosted) return `fatal: repository '${url}' not found`;
  return { url, hosted };
}

/** Get upstream info for a branch. */
function upstreamOf(repo: RepoState, branch: string): { remote: string; merge: string } | null {
  const remote = repo.config[`branch.${branch}.remote`];
  const merge = repo.config[`branch.${branch}.merge`];
  if (!remote || !merge) return null;
  return { remote, merge };
}

/** Is `candidate` an ancestor-or-equal of `of`? (BFS) */
function isAncestor(repo: RepoState, candidate: Hash, of: Hash): boolean {
  if (candidate === of) return true;
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

/** Append a reflog entry directly (for use inside produce). */
function appendReflogDirect(repo: RepoState, ref: string, entry: { old: Hash; new: Hash; who: Signature; message: string }): void {
  if (!repo.reflog[ref]) repo.reflog[ref] = [];
  repo.reflog[ref].push(entry);
}

/** Get the default remote (typically "origin"). */
function getDefaultRemote(repo: RepoState): string | undefined {
  const branch = currentBranch(repo);
  if (branch) {
    const remote = repo.config[`branch.${branch}.remote`];
    if (remote) return remote;
  }
  const names = remoteNames(repo);
  if (names.length === 1) return names[0];
  if (names.includes('origin')) return 'origin';
  return names[0];
}

// =========================================================================
// git remote
// =========================================================================

const remoteHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { root, repo } = r;
  const o = new Out();
  const loc = r.loc;
  const sub = args.subcommand ?? 'list';

  switch (sub) {
    case 'list': {
      const verbose = getCount(args, 'verbose');
      const names = remoteNames(repo);
      if (names.length === 0) return o.result(world);
      for (const name of names) {
        if (verbose > 0) {
          const url = remoteUrl(repo, name) ?? '';
          o.out(`${name}\t${url} (fetch)`);
          o.out(`${name}\t${url} (push)`);
        } else {
          o.out(name);
        }
      }
      return o.result(world);
    }

    case 'add': {
      const positionals = args.positionals;
      if (positionals.length < 2) {
        return fail(world, 129, stderr('usage: git remote add [-f] <name> <url>'));
      }
      const name = positionals[0];
      const url = positionals[1];

      if (remoteUrl(repo, name) !== undefined) {
        return fatal(world, `remote ${name} already exists.`);
      }

      const state = produce(world, d => {
        const rep = d.machines[machineId].repos[root];
        rep.config[`remote.${name}.url`] = url;
        rep.config[`remote.${name}.fetch`] = `+refs/heads/*:refs/remotes/${name}/*`;
      });

      o.ev({ type: 'remote.add', repo: loc, name, url });

      if (hasFlag(args, 'fetch')) {
        const fetchArgs: ParsedArgs = { options: {}, positionals: [name], paths: null, subcommand: null };
        const fetchResult = fetchHandler(state, { ...ctx, command: 'fetch', args: fetchArgs });
        return {
          ...fetchResult,
          output: [...o.lines, ...fetchResult.output],
          events: [...o.events, ...fetchResult.events],
        };
      }

      return o.result(state);
    }

    case 'remove':
    case 'rm': {
      const name = args.positionals[0];
      if (!name) return fail(world, 129, stderr('usage: git remote remove <name>'));
      if (remoteUrl(repo, name) === undefined) {
        return fatal(world, `No such remote: '${name}'`);
      }

      const state = produce(world, d => {
        const rep = d.machines[machineId].repos[root];
        for (const key of Object.keys(rep.config)) {
          if (key.startsWith(`remote.${name}.`)) delete rep.config[key];
        }
        for (const key of Object.keys(rep.config)) {
          if (key.endsWith('.remote') && rep.config[key] === name) {
            const branchSection = key.slice(0, key.lastIndexOf('.'));
            delete rep.config[key];
            delete rep.config[`${branchSection}.merge`];
          }
        }
        const prefix = `refs/remotes/${name}/`;
        for (const ref of Object.keys(rep.refs)) {
          if (ref.startsWith(prefix)) delete rep.refs[ref];
        }
        for (const ref of Object.keys(rep.symrefs)) {
          if (ref.startsWith(prefix)) delete rep.symrefs[ref];
        }
        for (const ref of Object.keys(rep.reflog)) {
          if (ref.startsWith(prefix)) delete rep.reflog[ref];
        }
      });

      o.ev({ type: 'remote.remove', repo: loc, name });
      return o.result(state);
    }

    case 'rename': {
      const positionals = args.positionals;
      if (positionals.length < 2) return fail(world, 129, stderr('usage: git remote rename <old> <new>'));
      const oldName = positionals[0];
      const newName = positionals[1];
      if (remoteUrl(repo, oldName) === undefined) {
        return fatal(world, `No such remote: '${oldName}'`);
      }
      if (remoteUrl(repo, newName) !== undefined) {
        return fatal(world, `remote ${newName} already exists.`);
      }

      const state = produce(world, d => {
        const rep = d.machines[machineId].repos[root];
        const oldPrefix = `remote.${oldName}.`;
        const newPrefix = `remote.${newName}.`;
        for (const key of Object.keys(rep.config)) {
          if (key.startsWith(oldPrefix)) {
            const suffix = key.slice(oldPrefix.length);
            rep.config[`${newPrefix}${suffix}`] = rep.config[key];
            delete rep.config[key];
          }
        }
        rep.config[`${newPrefix}fetch`] = `+refs/heads/*:refs/remotes/${newName}/*`;
        for (const key of Object.keys(rep.config)) {
          if (key.endsWith('.remote') && rep.config[key] === oldName) {
            rep.config[key] = newName;
          }
        }
        const oldRefPrefix = `refs/remotes/${oldName}/`;
        const newRefPrefix = `refs/remotes/${newName}/`;
        for (const ref of Object.keys(rep.refs)) {
          if (ref.startsWith(oldRefPrefix)) {
            const suffix = ref.slice(oldRefPrefix.length);
            rep.refs[`${newRefPrefix}${suffix}`] = rep.refs[ref];
            delete rep.refs[ref];
          }
        }
        for (const ref of Object.keys(rep.symrefs)) {
          if (ref.startsWith(oldRefPrefix)) {
            const suffix = ref.slice(oldRefPrefix.length);
            rep.symrefs[`${newRefPrefix}${suffix}`] = rep.symrefs[ref];
            delete rep.symrefs[ref];
          }
        }
        for (const ref of Object.keys(rep.reflog)) {
          if (ref.startsWith(oldRefPrefix)) {
            const suffix = ref.slice(oldRefPrefix.length);
            rep.reflog[`${newRefPrefix}${suffix}`] = rep.reflog[ref];
            delete rep.reflog[ref];
          }
        }
      });

      return o.result(state);
    }

    case 'set-url': {
      const positionals = args.positionals;
      if (positionals.length < 2) return fail(world, 129, stderr('usage: git remote set-url <name> <newurl>'));
      const name = positionals[0];
      const newUrl = positionals[1];
      if (remoteUrl(repo, name) === undefined) {
        return fatal(world, `No such remote '${name}'`);
      }

      const state = produce(world, d => {
        const rep = d.machines[machineId].repos[root];
        rep.config[`remote.${name}.url`] = newUrl;
      });

      o.ev({ type: 'remote.setUrl', repo: loc, name, url: newUrl });
      return o.result(state);
    }

    case 'get-url': {
      const name = args.positionals[0];
      if (!name) return fail(world, 129, stderr('usage: git remote get-url <name>'));
      const url = remoteUrl(repo, name);
      if (url === undefined) {
        return fatal(world, `No such remote '${name}'`);
      }
      o.out(url);
      return o.result(world);
    }

    case 'show': {
      const name = args.positionals[0];
      if (!name) return fail(world, 129, stderr('usage: git remote show <name>'));
      const resolved = resolveRemote(world, repo, name);
      if (typeof resolved === 'string') return fatal(world, resolved.replace(/^fatal: /, ''));
      const { url, hosted } = resolved;

      o.out(`* remote ${name}`);
      o.out(`  Fetch URL: ${url}`);
      o.out(`  Push  URL: ${url}`);
      o.out(`  HEAD branch: ${hosted.defaultBranch}`);

      const remoteBranches = Object.keys(hosted.repo.refs)
        .filter(r => r.startsWith('refs/heads/'))
        .map(r => r.slice('refs/heads/'.length))
        .sort();
      if (remoteBranches.length > 0) {
        o.out('  Remote branches:');
        for (const b of remoteBranches) {
          o.out(`    ${b} tracked`);
        }
      }

      const pullBranches: string[] = [];
      for (const key of Object.keys(repo.config)) {
        if (key.endsWith('.remote') && repo.config[key] === name) {
          const branch = key.replace(/^branch\./, '').replace(/\.remote$/, '');
          const merge = repo.config[`branch.${branch}.merge`];
          if (merge) pullBranches.push(branch);
        }
      }
      if (pullBranches.length > 0) {
        o.out(`  Local branch${pullBranches.length > 1 ? 'es' : ''} configured for 'git pull':`);
        for (const b of pullBranches.sort()) {
          const merge = repo.config[`branch.${b}.merge`];
          o.out(`    ${b} merges with remote ${merge?.replace('refs/heads/', '') ?? b}`);
        }
      }

      o.out(`  Local ref configured for 'git push':`);
      for (const b of pullBranches.sort()) {
        o.out(`    ${b} pushes to ${b} (${repo.refs[`refs/remotes/${name}/${b}`] === headCommit(repo) ? 'up to date' : 'fast-forwardable'})`);
      }

      return o.result(world);
    }

    case 'prune': {
      const name = args.positionals[0];
      if (!name) return fail(world, 129, stderr('usage: git remote prune <name>'));
      const resolved = resolveRemote(world, repo, name);
      if (typeof resolved === 'string') return fatal(world, resolved.replace(/^fatal: /, ''));
      const { hosted } = resolved;

      const state = produce(world, d => {
        const rep = d.machines[machineId].repos[root];
        const prefix = `refs/remotes/${name}/`;
        for (const ref of Object.keys(rep.refs)) {
          if (ref.startsWith(prefix)) {
            const remoteBranch = ref.slice(prefix.length);
            if (remoteBranch === 'HEAD') continue;
            if (!hosted.repo.refs[`refs/heads/${remoteBranch}`]) {
              o.out(` * [pruned] ${name}/${remoteBranch}`);
              delete rep.refs[ref];
            }
          }
        }
      });

      return o.result(state);
    }

    default:
      return fail(world, 129, stderr(`error: Unknown subcommand: ${sub}`));
  }
};

// =========================================================================
// git clone
// =========================================================================

const cloneHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const o = new Out();
  const machine = world.machines[machineId];
  if (!machine) return fatal(world, 'unknown machine');

  const url = args.positionals[0];
  if (!url) return fail(world, 129, stderr('usage: git clone [<options>] [--] <repo> [<dir>]'));

  const parsed = parseHubUrl(url);
  if (!parsed) return fatal(world, `repository '${url}' does not exist`);

  const hosted = world.hosted[parsed.id];
  if (!hosted) return fatal(world, `repository '${url}' not found`);

  const branchOpt = getString(args, 'branch');
  const originName = getString(args, 'origin') ?? 'origin';
  const quiet = hasFlag(args, 'quiet');

  const dirArg = args.positionals[1];
  const repoName = parsed.id.split('/')[1];
  const targetDir = dirArg
    ? normalize(dirArg.startsWith('/') ? dirArg : join(machine.cwd, dirArg))
    : join(machine.cwd, repoName);

  if (dirExists(machine.fs, targetDir)) {
    const contents = filesUnder(machine.fs, targetDir);
    if (contents.length > 0) {
      return fatal(world, `destination path '${dirArg ?? repoName}' already exists and is not an empty directory.`);
    }
  }

  const checkoutBranch = branchOpt ?? hosted.defaultBranch;
  const checkoutRef = `refs/heads/${checkoutBranch}`;
  const hostedCheckoutRef = hosted.repo.refs[checkoutRef];
  if (branchOpt && !hostedCheckoutRef) {
    return fatal(world, `Remote branch ${branchOpt} not found in upstream ${url}`);
  }

  if (!quiet) {
    o.out(`Cloning into '${dirArg ?? repoName}'...`);
  }

  const state = produce(world, d => {
    const m = d.machines[machineId];
    const hostedRepo = d.hosted[parsed!.id].repo;

    mkdirp(m.fs, targetDir);
    mkdirp(m.fs, join(targetDir, '.git'));

    const repo = createEmptyRepo({ initialBranch: checkoutBranch });
    m.repos[targetDir] = repo;
    const rep = m.repos[targetDir];

    // Copy all objects
    for (const [hash, obj] of Object.entries(hostedRepo.objects)) {
      if (!rep.objects[hash]) {
        rep.objects[hash] = obj;
      }
    }

    // Set up remote
    rep.config[`remote.${originName}.url`] = url;
    rep.config[`remote.${originName}.fetch`] = `+refs/heads/*:refs/remotes/${originName}/*`;

    // Copy refs as remote-tracking refs
    for (const [ref, hash] of Object.entries(hostedRepo.refs)) {
      if (ref.startsWith('refs/heads/')) {
        const branch = ref.slice('refs/heads/'.length);
        rep.refs[`refs/remotes/${originName}/${branch}`] = hash;
      } else if (ref.startsWith('refs/tags/')) {
        rep.refs[ref] = hash;
      }
    }

    // Set up HEAD symref for origin
    rep.symrefs[`refs/remotes/${originName}/HEAD`] = `refs/remotes/${originName}/${hosted!.defaultBranch}`;

    // Create local branch tracking the remote
    const targetHash = hostedCheckoutRef ?? hostedRepo.refs[`refs/heads/${hosted!.defaultBranch}`];
    if (targetHash) {
      const committer = sig(world, m, rep);
      rep.refs[`refs/heads/${checkoutBranch}`] = targetHash;
      rep.head = { type: 'symbolic', ref: `refs/heads/${checkoutBranch}` };

      rep.config[`branch.${checkoutBranch}.remote`] = originName;
      rep.config[`branch.${checkoutBranch}.merge`] = `refs/heads/${checkoutBranch}`;

      appendReflogDirect(rep, 'HEAD', {
        old: ZERO_HASH,
        new: targetHash,
        who: committer,
        message: `clone: from ${url}`,
      });
      appendReflogDirect(rep, `refs/heads/${checkoutBranch}`, {
        old: ZERO_HASH,
        new: targetHash,
        who: committer,
        message: `clone: from ${url}`,
      });

      // Checkout files into work tree
      const commit = getCommit(rep, targetHash);
      if (commit) {
        const flat = readTreeFlat(rep, commit.tree);
        for (const [path, entry] of Object.entries(flat)) {
          rep.index.entries[path] = { path, hash: entry.hash, mode: entry.mode };
          const blob = getBlob(rep, entry.hash);
          if (blob) writeFile(m.fs, join(targetDir, path), blob.content);
        }
      }
    }
  });

  const newRepo = state.machines[machineId].repos[targetDir];
  const objectCount = Object.keys(newRepo?.objects ?? {}).length;
  if (!quiet) {
    o.out(`remote: Enumerating objects: ${objectCount}, done.`);
    o.out(`remote: Counting objects: 100% (${objectCount}/${objectCount}), done.`);
    o.out(`remote: Total ${objectCount} (delta 0), reused ${objectCount} (delta 0), pack-reused 0`);
    o.out(`Receiving objects: 100% (${objectCount}/${objectCount}), done.`);
  }

  o.ev({ type: 'transfer.clone', hosted: parsed.id, machine: machineId, root: targetDir });

  return o.result(state);
};

// =========================================================================
// git fetch
// =========================================================================

const fetchHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { root, repo } = r;
  const o = new Out();
  const loc = r.loc;
  const quiet = hasFlag(args, 'quiet');
  const prune = hasFlag(args, 'prune');

  const fetchAll = hasFlag(args, 'all');
  let remotes: string[];

  if (fetchAll) {
    remotes = remoteNames(repo);
    if (remotes.length === 0) return o.result(world);
  } else {
    const remoteName = args.positionals[0] ?? getDefaultRemote(repo);
    if (!remoteName) {
      return fatal(world, 'No remote repository specified and no default remote configured.\nPlease specify which remote to fetch from.');
    }
    remotes = [remoteName];
  }

  let w = world;
  for (const remoteName of remotes) {
    const resolved = resolveRemote(w, w.machines[machineId].repos[root], remoteName);
    if (typeof resolved === 'string') {
      o.err(resolved);
      return o.result(w, 128);
    }
    const { url, hosted } = resolved;

    if (!quiet && fetchAll) {
      o.out(`Fetching ${remoteName}`);
    }

    const updates: RefChange[] = [];
    let objectCount = 0;

    w = produce(w, d => {
      const rep = d.machines[machineId].repos[root];
      const hostedRepo = d.hosted[hosted.id].repo;
      const committer = sig(world, d.machines[machineId], rep);

      // Copy objects from remote branches
      for (const [ref, hash] of Object.entries(hostedRepo.refs)) {
        if (ref.startsWith('refs/heads/')) {
          objectCount += copyObjectClosure(hostedRepo, rep, hash);
        }
      }
      // Copy tag objects
      for (const [ref, hash] of Object.entries(hostedRepo.refs)) {
        if (ref.startsWith('refs/tags/')) {
          objectCount += copyObjectClosure(hostedRepo, rep, hash);
        }
      }

      // Update remote-tracking refs
      for (const [ref, hash] of Object.entries(hostedRepo.refs)) {
        if (ref.startsWith('refs/heads/')) {
          const branch = ref.slice('refs/heads/'.length);
          const trackingRef = `refs/remotes/${remoteName}/${branch}`;
          const old = rep.refs[trackingRef] ?? null;
          if (old !== hash) {
            rep.refs[trackingRef] = hash;
            updates.push({ ref: trackingRef, from: old, to: hash });
            appendReflogDirect(rep, trackingRef, {
              old: old ?? ZERO_HASH,
              new: hash,
              who: committer,
              message: `fetch: ${old ? 'fast-forward' : 'storing head'}`,
            });
          }
        }
      }

      // Auto-follow tags
      for (const [ref, hash] of Object.entries(hostedRepo.refs)) {
        if (ref.startsWith('refs/tags/') && !rep.refs[ref]) {
          rep.refs[ref] = hash;
          updates.push({ ref, from: null, to: hash });
        }
      }

      // Prune stale remote-tracking refs
      if (prune) {
        const prefix = `refs/remotes/${remoteName}/`;
        for (const ref of Object.keys(rep.refs)) {
          if (ref.startsWith(prefix)) {
            const remoteBranch = ref.slice(prefix.length);
            if (remoteBranch === 'HEAD') continue;
            if (!hostedRepo.refs[`refs/heads/${remoteBranch}`]) {
              updates.push({ ref, from: rep.refs[ref], to: null });
              delete rep.refs[ref];
            }
          }
        }
      }

      // Update FETCH_HEAD
      const fetchHeadEntries: { hash: Hash; description: string; forMerge: boolean }[] = [];
      for (const [ref, hash] of Object.entries(hostedRepo.refs)) {
        if (ref.startsWith('refs/heads/')) {
          const branch = ref.slice('refs/heads/'.length);
          const curBranch = currentBranch(rep);
          const forMerge = curBranch !== null &&
            rep.config[`branch.${curBranch}.merge`] === ref &&
            rep.config[`branch.${curBranch}.remote`] === remoteName;
          fetchHeadEntries.push({
            hash,
            description: `branch '${branch}' of ${url}`,
            forMerge,
          });
        }
      }
      rep.special.FETCH_HEAD = fetchHeadEntries;
    });

    // Output
    if (!quiet && updates.length > 0) {
      o.out(`From ${url.replace(/\.git$/, '')}`);
      for (const u of updates) {
        if (u.to === null) {
          o.out(` - [deleted]         (none)     -> ${u.ref.replace('refs/remotes/', '')}`);
        } else if (u.from === null) {
          if (u.ref.startsWith('refs/tags/')) {
            o.out(` * [new tag]         ${u.ref.replace('refs/tags/', '')} -> ${u.ref.replace('refs/tags/', '')}`);
          } else {
            const remoteBranch = u.ref.replace(`refs/remotes/${remoteName}/`, '');
            o.out(` * [new branch]      ${remoteBranch} -> ${remoteName}/${remoteBranch}`);
          }
        } else {
          const remoteBranch = u.ref.replace(`refs/remotes/${remoteName}/`, '');
          o.out(`   ${shortHash(u.from)}..${shortHash(u.to!)}  ${remoteBranch} -> ${remoteName}/${remoteBranch}`);
        }
      }
    }

    o.ev({
      type: 'transfer.fetch',
      repo: loc,
      remote: remoteName,
      hosted: hosted.id,
      updates,
      objects: objectCount,
    });
  }

  return o.result(w);
};

// =========================================================================
// git pull
// =========================================================================

const pullHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openWorkTree(world, machineId);
  if (isResult(r)) return r;
  const { root, repo } = r;

  // Check for unmerged conflicts
  if (Object.keys(repo.index.conflicts).length > 0) {
    return fail(world, 128, stderr(
      'error: Pulling is not possible because you have unmerged files.',
      'hint: Fix them up in the work tree, and then use \'git add <file>\'',
      'hint: as appropriate to mark resolution and make a commit.',
      'fatal: Exiting because of an unresolved conflict.',
    ));
  }

  if (repo.special.MERGE_HEAD) {
    return fatal(world, 'You have not concluded your merge (MERGE_HEAD exists).\nPlease, commit your changes before you merge.\nAborting');
  }

  const remoteName = args.positionals[0] ?? getDefaultRemote(repo);
  const branch = currentBranch(repo);

  if (!remoteName) {
    if (!branch) {
      return fatal(world, 'You are not currently on a branch.\nPlease specify which branch you want to merge with.');
    }
    return fatal(world, `There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>`);
  }

  // Determine what to merge
  let mergeRef: string | undefined;
  if (args.positionals.length >= 2) {
    mergeRef = `refs/heads/${args.positionals[1]}`;
  } else if (branch) {
    const upstream = upstreamOf(repo, branch);
    if (upstream && upstream.remote === remoteName) {
      mergeRef = upstream.merge;
    }
  }

  if (!mergeRef && branch) {
    return fatal(world, `There is no tracking information for the current branch.\nPlease specify which branch you want to merge with.\nSee git-pull(1) for details.\n\n    git pull <remote> <branch>\n\nIf you wish to set tracking information for this branch you can do so with:\n\n    git branch --set-upstream-to=${remoteName}/<branch> ${branch}`);
  }

  if (!mergeRef) {
    return fatal(world, 'You are not currently on a branch.\nPlease specify which branch you want to merge with.');
  }

  // Step 1: Fetch
  const fetchArgs: ParsedArgs = { options: {}, positionals: [remoteName], paths: null, subcommand: null };
  if (hasFlag(args, 'quiet')) fetchArgs.options['quiet'] = true;
  const fetchResult = fetchHandler(world, { ...ctx, command: 'fetch', args: fetchArgs });
  if (fetchResult.exitCode !== 0) return fetchResult;

  const worldAfterFetch = fetchResult.state;
  const repoAfterFetch = worldAfterFetch.machines[machineId].repos[root];

  // Step 2: Determine what to merge
  const remoteBranchName = mergeRef.replace('refs/heads/', '');
  const trackingRef = `refs/remotes/${remoteName}/${remoteBranchName}`;
  const fetchedHash = repoAfterFetch.refs[trackingRef];

  if (!fetchedHash) {
    return fail(worldAfterFetch, 1, [
      ...fetchResult.output,
      ...stderr(`Your configuration specifies to merge with the ref '${mergeRef}'\nfrom the remote, but no such ref was fetched.`),
    ]);
  }

  const head = headCommit(repoAfterFetch);
  if (!head) {
    // Unborn branch: set branch to fetched commit and checkout
    const state = produce(worldAfterFetch, d => {
      const m = d.machines[machineId];
      const rep = m.repos[root];
      const committer = sig(worldAfterFetch, m, rep);

      if (rep.head.type === 'symbolic') {
        rep.refs[rep.head.ref] = fetchedHash;
        appendReflogDirect(rep, rep.head.ref, {
          old: ZERO_HASH,
          new: fetchedHash,
          who: committer,
          message: `pull: from ${remoteName}`,
        });
        appendReflogDirect(rep, 'HEAD', {
          old: ZERO_HASH,
          new: fetchedHash,
          who: committer,
          message: `pull: from ${remoteName}`,
        });
      }

      const commit = getCommit(rep, fetchedHash);
      if (commit) {
        const flat = readTreeFlat(rep, commit.tree);
        rep.index.entries = {};
        for (const [path, entry] of Object.entries(flat)) {
          rep.index.entries[path] = { path, hash: entry.hash, mode: entry.mode };
          const blob = getBlob(rep, entry.hash);
          if (blob) writeFile(m.fs, join(root, path), blob.content);
        }
      }
    });

    return {
      state,
      output: fetchResult.output,
      events: fetchResult.events,
      exitCode: 0,
    };
  }

  // Already up to date?
  if (isAncestor(repoAfterFetch, fetchedHash, head)) {
    return {
      state: worldAfterFetch,
      output: [...fetchResult.output, ...stdout('Already up to date.')],
      events: fetchResult.events,
      exitCode: 0,
    };
  }

  // Step 3: Merge via the merge handler
  const ffOnly = hasFlag(args, 'ff-only');
  const noFf = isNegated(args, 'ff');

  const mergeArgv: string[] = [trackingRef];
  if (ffOnly) mergeArgv.unshift('--ff-only');
  if (noFf) mergeArgv.unshift('--no-ff');

  const mergeSpec = GIT_COMMANDS['merge'];
  const mergeArgsResult = parseArgs(mergeSpec, mergeArgv);
  if ('error' in mergeArgsResult) {
    return fail(worldAfterFetch, 129, stderr(...mergeArgsResult.lines));
  }

  const mergeResult = mergeHandler(worldAfterFetch, {
    machineId,
    command: 'merge',
    args: mergeArgsResult,
    argv: mergeArgv,
  });

  return {
    state: mergeResult.state,
    output: [...fetchResult.output, ...mergeResult.output],
    events: [...fetchResult.events, ...mergeResult.events],
    exitCode: mergeResult.exitCode,
  };
};

// =========================================================================
// git push
// =========================================================================

const pushHandler: GitHandler = (world, ctx) => {
  const { machineId, args } = ctx;
  const r = openRepo(world, machineId);
  if (isResult(r)) return r;
  const { root, repo } = r;
  const o = new Out();
  const loc = r.loc;
  const quiet = hasFlag(args, 'quiet');
  const setUpstream = hasFlag(args, 'set-upstream');
  const doDelete = hasFlag(args, 'delete');

  let remoteName: string | undefined;
  let refspec: string | undefined;

  if (args.positionals.length >= 1) {
    remoteName = args.positionals[0];
  }
  if (args.positionals.length >= 2) {
    refspec = args.positionals[1];
  }

  const branch = currentBranch(repo);

  if (!remoteName) {
    if (branch) {
      const upstream = upstreamOf(repo, branch);
      if (upstream) {
        remoteName = upstream.remote;
      }
    }
    if (!remoteName) {
      remoteName = getDefaultRemote(repo);
    }
  }

  if (!remoteName) {
    return fatal(world, `No configured push destination.\nEither specify the URL from the command-line or configure a remote repository using\n\n    git remote add <name> <url>\n\nand then push using the remote name\n\n    git push <name>\n`);
  }

  const resolved = resolveRemote(world, repo, remoteName);
  if (typeof resolved === 'string') {
    o.err(resolved);
    return o.result(world, 128);
  }
  const { url, hosted } = resolved;

  let localBranch: string;
  let remoteBranch: string;

  if (doDelete && refspec) {
    remoteBranch = refspec;
    const remoteRef = `refs/heads/${remoteBranch}`;
    if (!hosted.repo.refs[remoteRef]) {
      return fail(world, 1, stderr(`error: unable to delete '${remoteBranch}': remote ref does not exist`));
    }

    const state = produce(world, d => {
      const hostedRepo = d.hosted[hosted.id].repo;
      delete hostedRepo.refs[remoteRef];
      const rep = d.machines[machineId].repos[root];
      delete rep.refs[`refs/remotes/${remoteName}/${remoteBranch}`];
    });

    if (!quiet) {
      o.out(`To ${url}`);
      o.out(` - [deleted]         ${remoteBranch}`);
    }

    return o.result(state);
  }

  if (refspec) {
    const colonIdx = refspec.indexOf(':');
    if (colonIdx >= 0) {
      localBranch = refspec.slice(0, colonIdx);
      remoteBranch = refspec.slice(colonIdx + 1);
    } else {
      localBranch = refspec;
      remoteBranch = refspec;
    }
  } else if (branch) {
    localBranch = branch;
    const upstream = upstreamOf(repo, branch);
    if (upstream && upstream.remote === remoteName) {
      remoteBranch = upstream.merge.replace('refs/heads/', '');
    } else {
      remoteBranch = branch;
    }
  } else {
    return fatal(world, 'You are not currently on a branch.\nTo push the history leading to the current (detached HEAD)\nstate now, use\n\n    git push origin HEAD:<name-of-remote-branch>\n');
  }

  const localRef = `refs/heads/${localBranch}`;
  const localHash = repo.refs[localRef];
  if (!localHash) {
    return fail(world, 1, stderr(`error: src refspec '${localBranch}' does not match any`));
  }

  // Check fast-forward
  const remoteRef = `refs/heads/${remoteBranch}`;
  const remoteHash = hosted.repo.refs[remoteRef] ?? null;

  if (remoteHash && !isAncestor(repo, remoteHash, localHash)) {
    if (!quiet) {
      o.out(`To ${url}`);
      o.err(` ! [rejected]        ${localBranch} -> ${remoteBranch} (non-fast-forward)`);
      o.err(`error: failed to push some refs to '${url}'`);
      o.err(`hint: Updates were rejected because the tip of your current branch is behind`);
      o.err(`hint: its remote counterpart. If you want to integrate the remote changes,`);
      o.err(`hint: use 'git pull' before pushing again.`);
      o.err(`hint: See the 'Note about fast-forwards' in 'git push --help' for details.`);
    }
    o.ev({
      type: 'transfer.rejected',
      repo: loc,
      remote: remoteName,
      hosted: hosted.id,
      ref: remoteRef,
      reason: 'non-fast-forward',
    });
    return o.result(world, 1);
  }

  // Do the push
  const updates: RefChange[] = [];
  let objectCount = 0;

  const state = produce(world, d => {
    const rep = d.machines[machineId].repos[root];
    const hostedRepo = d.hosted[hosted.id].repo;
    const committer = sig(world, d.machines[machineId], rep);

    objectCount = copyObjectClosure(rep, hostedRepo, localHash);

    const oldHash = hostedRepo.refs[remoteRef] ?? null;
    hostedRepo.refs[remoteRef] = localHash;
    updates.push({ ref: remoteRef, from: oldHash, to: localHash });

    // Update local remote-tracking ref
    const trackingRef = `refs/remotes/${remoteName}/${remoteBranch}`;
    rep.refs[trackingRef] = localHash;
    appendReflogDirect(rep, trackingRef, {
      old: oldHash ?? ZERO_HASH,
      new: localHash,
      who: committer,
      message: 'update by push',
    });

    if (setUpstream) {
      rep.config[`branch.${localBranch}.remote`] = remoteName!;
      rep.config[`branch.${localBranch}.merge`] = remoteRef;
    }
  });

  if (!quiet) {
    o.out(`To ${url}`);
    for (const u of updates) {
      if (u.from === null) {
        o.out(` * [new branch]      ${localBranch} -> ${remoteBranch}`);
      } else {
        o.out(`   ${shortHash(u.from)}..${shortHash(u.to!)}  ${localBranch} -> ${remoteBranch}`);
      }
    }
    if (setUpstream) {
      o.out(`branch '${localBranch}' set up to track '${remoteName}/${remoteBranch}'.`);
    }
  }

  o.ev({
    type: 'transfer.push',
    repo: loc,
    remote: remoteName,
    hosted: hosted.id,
    updates,
    objects: objectCount,
  });

  return o.result(state);
};

// =========================================================================
// Export command table
// =========================================================================

export const remoteCommands: CommandTable = {
  remote: remoteHandler,
  clone: cloneHandler,
  fetch: fetchHandler,
  pull: pullHandler,
  push: pushHandler,
};
