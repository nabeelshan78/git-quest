/**
 * Public API of the remote simulator.
 */
import { produce } from 'immer';
import type { HostedRepoSetup, TeammateAction } from '../shared/level';
import type { CommandResult } from '../shared/result';
import { fail, stderr } from '../shared/result';
import { httpsUrl, parseHubUrl, CHARACTER_IDENTITIES } from '../shared/constants';
import type {
  AbsPath, Hash, HostedRepo, MachineId,
  Signature, World,
} from '../shared/types';
import {
  getCommit,
  readTreeFlat, writeBlob, writeObject, writeTreeFromFlat,
} from '../engine/core/objects';
import type { FlatTreeEntry } from '../engine/core/objects';
import {
  createEmptyRepo, currentBranch,
} from '../engine/core/repo';
import type { GameEvent } from '../shared/events';

export { remoteCommands } from './commands';

export type TeammatePushAction = Extract<TeammateAction, { type: 'push' }>;

/**
 * Create a hosted repo from a level setup step. The level runner resolves
 * `setup.fromLocal.repoPath` to an absolute path before calling; when it is
 * absent, `defaults.repoPath` on `defaults.machine` is used.
 */
export function setupHostedRepo(
  world: World,
  setup: HostedRepoSetup,
  defaults: { machine: MachineId; repoPath: AbsPath },
): CommandResult {
  const repoId = setup.id;
  const defaultBranch = setup.defaultBranch ?? 'main';
  const events: GameEvent[] = [];

  const state = produce(world, d => {
    // Create the bare hosted repo
    const bareRepo = createEmptyRepo({ bare: true, initialBranch: defaultBranch });

    const hosted: HostedRepo = {
      id: repoId,
      owner: repoId.split('/')[0],
      name: repoId.split('/')[1],
      description: setup.description ?? '',
      visibility: setup.visibility ?? 'public',
      repo: bareRepo,
      defaultBranch,
      collaborators: setup.collaborators ?? [],
      issues: [],
      pulls: [],
      labels: (setup.labels ?? []).map(l => ({ name: l.name, color: l.color, description: l.description ?? '' })),
      nextNumber: 1,
      nextId: 1,
      createdAt: d.clock,
    };

    d.hosted[repoId] = hosted;
    const hostedRepo = d.hosted[repoId].repo;

    if (setup.fromLocal) {
      // Copy from local repo
      const machineId = setup.fromLocal.machine ?? defaults.machine;
      const repoPath = setup.fromLocal.repoPath ?? defaults.repoPath;
      const m = d.machines[machineId];
      if (!m) return;
      const localRepo = m.repos[repoPath];
      if (!localRepo) return;

      // Copy all objects
      for (const [hash, obj] of Object.entries(localRepo.objects)) {
        hostedRepo.objects[hash] = obj;
      }

      // Copy all branch refs
      for (const [ref, hash] of Object.entries(localRepo.refs)) {
        if (ref.startsWith('refs/heads/')) {
          hostedRepo.refs[ref] = hash;
        } else if (ref.startsWith('refs/tags/')) {
          hostedRepo.refs[ref] = hash;
        }
      }

      // Set up the remote on the local repo
      const remoteName = setup.fromLocal.remoteName ?? 'origin';
      const url = httpsUrl(repoId);
      localRepo.config[`remote.${remoteName}.url`] = url;
      localRepo.config[`remote.${remoteName}.fetch`] = `+refs/heads/*:refs/remotes/${remoteName}/*`;

      // Create remote-tracking refs in local
      for (const [ref, hash] of Object.entries(localRepo.refs)) {
        if (ref.startsWith('refs/heads/')) {
          const branch = ref.slice('refs/heads/'.length);
          localRepo.refs[`refs/remotes/${remoteName}/${branch}`] = hash;
        }
      }

      // Set up HEAD symref for remote
      localRepo.symrefs[`refs/remotes/${remoteName}/HEAD`] = `refs/remotes/${remoteName}/${defaultBranch}`;

      // Set up upstream tracking if requested
      if (setup.fromLocal.setUpstream !== false) {
        const branch = currentBranch(localRepo);
        if (branch) {
          localRepo.config[`branch.${branch}.remote`] = remoteName;
          localRepo.config[`branch.${branch}.merge`] = `refs/heads/${branch}`;
        }
      }
    } else if (setup.initialFiles) {
      // Create initial commit with the given files
      const authorName = setup.initialAuthor ?? 'Git Quest Setup';
      const authorEmail = 'setup@gitquest.example';

      // Try to find the author identity from CHARACTER_IDENTITIES
      let authorSig: Signature;
      const charEntry = Object.entries(CHARACTER_IDENTITIES).find(([key]) => key === authorName);
      if (charEntry) {
        authorSig = {
          name: charEntry[1].name,
          email: charEntry[1].email,
          timestamp: d.clock,
          timezone: '+0000',
        };
      } else {
        // Try matching by full name
        const charByName = Object.values(CHARACTER_IDENTITIES).find(v => v.name === authorName);
        if (charByName) {
          authorSig = { name: charByName.name, email: charByName.email, timestamp: d.clock, timezone: '+0000' };
        } else {
          authorSig = { name: authorName, email: authorEmail, timestamp: d.clock, timezone: '+0000' };
        }
      }

      // Write blob objects for each file
      const flat: Record<string, FlatTreeEntry> = {};
      for (const [path, content] of Object.entries(setup.initialFiles)) {
        const hash = writeBlob(hostedRepo, content);
        flat[path] = { hash, mode: '100644' };
      }

      // Build tree
      const treeHash = writeTreeFromFlat(hostedRepo, flat);

      // Build commit
      const message = setup.initialMessage ?? 'Initial commit\n';
      const commitHash = writeObject(hostedRepo, {
        type: 'commit',
        tree: treeHash,
        parents: [],
        author: authorSig,
        committer: authorSig,
        message: message.endsWith('\n') ? message : message + '\n',
      });

      // Set default branch ref
      hostedRepo.refs[`refs/heads/${defaultBranch}`] = commitHash;
    }
  });

  events.push({ type: 'hub.repo.create', repo: repoId, by: world.hub.viewer });

  return { state, events, output: [], exitCode: 0 };
}

/** A teammate commits straight onto a hosted branch (as if pushed from their laptop). */
export function applyTeammatePush(world: World, action: TeammatePushAction): CommandResult {
  const { actor, repo: repoId, branch, from, message, files } = action;
  const events: GameEvent[] = [];

  // Find author identity
  const charEntry = Object.entries(CHARACTER_IDENTITIES).find(([key]) => key === actor);
  let authorSig: Signature;
  if (charEntry) {
    authorSig = { name: charEntry[1].name, email: charEntry[1].email, timestamp: world.clock, timezone: '+0000' };
  } else {
    const charByName = Object.values(CHARACTER_IDENTITIES).find(v => v.name === actor);
    if (charByName) {
      authorSig = { name: charByName.name, email: charByName.email, timestamp: world.clock, timezone: '+0000' };
    } else {
      authorSig = { name: actor, email: `${actor.toLowerCase().replace(/\s+/g, '.')}@example.com`, timestamp: world.clock, timezone: '+0000' };
    }
  }

  const hosted = world.hosted[repoId];
  if (!hosted) return fail(world, 1, stderr(`Hosted repo '${repoId}' not found`));

  const branchRef = `refs/heads/${branch}`;
  let parentHash: Hash | null = hosted.repo.refs[branchRef] ?? null;

  // If branch doesn't exist and `from` is given, create it from another branch
  if (!parentHash && from) {
    const fromRef = `refs/heads/${from}`;
    parentHash = hosted.repo.refs[fromRef] ?? null;
  }

  if (!parentHash && !from) {
    // Branch doesn't exist and no from — check default branch
    const defaultRef = `refs/heads/${hosted.defaultBranch}`;
    parentHash = hosted.repo.refs[defaultRef] ?? null;
  }

  const state = produce(world, d => {
    const hostedRepo = d.hosted[repoId].repo;

    // Build the new tree: start from parent's tree if it exists, then apply changes
    let currentFlat: Record<string, FlatTreeEntry> = {};
    if (parentHash) {
      const parentCommit = getCommit(hostedRepo, parentHash);
      if (parentCommit) {
        currentFlat = { ...readTreeFlat(hostedRepo, parentCommit.tree) };
      }
    }

    // Apply file changes
    for (const [path, content] of Object.entries(files)) {
      if (content === null) {
        delete currentFlat[path];
      } else {
        const hash = writeBlob(hostedRepo, content);
        currentFlat[path] = { hash, mode: '100644' };
      }
    }

    // Write tree
    const treeHash = writeTreeFromFlat(hostedRepo, currentFlat);

    // Write commit
    const commitHash = writeObject(hostedRepo, {
      type: 'commit',
      tree: treeHash,
      parents: parentHash ? [parentHash] : [],
      author: authorSig,
      committer: authorSig,
      message: message.endsWith('\n') ? message : message + '\n',
    });

    // Update branch ref
    hostedRepo.refs[branchRef] = commitHash;
  });

  events.push({ type: 'teammate.action', actor, summary: `pushed to ${branch} on ${repoId}` });

  return { state, events, output: [], exitCode: 0 };
}

/** The hosted repo a remote URL points at, or null. */
export function hostedRepoForUrl(world: World, url: string): HostedRepo | null {
  const parsed = parseHubUrl(url);
  return parsed ? (world.hosted[parsed.id] ?? null) : null;
}
