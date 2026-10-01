/**
 * Derived working-tree status used by the UI (three boxes) and goal checks.
 * @stub-owner engine-a — foundation version (no .gitignore, no renames,
 * no upstream info). Engine A replaces it with the complete implementation
 * and keeps this exact signature.
 */
import type { AbsPath, StatusSummary, World } from '../../shared/types';
import { getCommit, hashBlob, readTreeFlat } from '../core/objects';
import { currentBranch, findRepo, headCommit, listWorkTree } from '../core/repo';

export function computeStatus(world: World, machineId: string, root?: AbsPath): StatusSummary | null {
  const machine = world.machines[machineId];
  if (!machine) return null;
  const handle = root ? (machine.repos[root] ? { root, repo: machine.repos[root] } : null) : findRepo(world, machineId);
  if (!handle || handle.repo.bare) return null;
  const { repo } = handle;
  const head = headCommit(repo);
  const commit = head ? getCommit(repo, head) : undefined;
  const headFlat = commit ? readTreeFlat(repo, commit.tree) : {};
  const index = repo.index.entries;
  const work = listWorkTree(machine, handle.root);

  const staged: StatusSummary['staged'] = [];
  for (const p of [...new Set([...Object.keys(headFlat), ...Object.keys(index)])].sort()) {
    if (repo.index.conflicts[p]) continue;
    const h = headFlat[p];
    const i = index[p];
    if (!h && i) staged.push({ path: p, kind: 'added' });
    else if (h && !i) staged.push({ path: p, kind: 'deleted' });
    else if (h && i && h.hash !== i.hash) staged.push({ path: p, kind: 'modified' });
  }
  const unstaged: StatusSummary['unstaged'] = [];
  for (const p of Object.keys(index).sort()) {
    if (work[p] === undefined) unstaged.push({ path: p, kind: 'deleted' });
    else if (hashBlob(work[p]) !== index[p].hash) unstaged.push({ path: p, kind: 'modified' });
  }
  const untracked = Object.keys(work)
    .filter((p) => !index[p] && !repo.index.conflicts[p])
    .sort();
  const conflicted = Object.keys(repo.index.conflicts)
    .sort()
    .map((path) => ({ path, kind: 'both modified' as const }));
  const inProgress: StatusSummary['inProgress'] = repo.special.MERGE_HEAD ? 'merge' : repo.special.REVERT_HEAD ? 'revert' : null;
  return {
    root: handle.root,
    branch: currentBranch(repo),
    detachedAt: repo.head.type === 'detached' ? repo.head.hash : null,
    unborn: head === null,
    head,
    upstream: null,
    staged,
    unstaged,
    untracked,
    ignored: [],
    conflicted,
    inProgress,
    clean: staged.length === 0 && unstaged.length === 0 && conflicted.length === 0,
  };
}
