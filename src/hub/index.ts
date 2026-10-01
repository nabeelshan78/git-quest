/**
 * Public API of the simulated GitHub (pure state logic; UI lives in src/ui/hub).
 */
import { produce } from 'immer';
import type { GameEvent } from '../shared/events';
import type { HubAction } from '../shared/level';
import type { CommandResult } from '../shared/result';
import { fail, ok, stderr } from '../shared/result';
import type {
  Hash,
  HostedRepo,
  HostedRepoId,
  HubComment,
  Issue,
  PullRequest,
  Review,
  ReviewComment,
  World,
} from '../shared/types';
import {
  writeObject,
  writeBlob,
  writeTreeFromFlat,
  readTreeFlat,
  getCommit,
} from '../engine/core/objects';
import type { FlatTreeEntry } from '../engine/core/objects';
import { headCommit } from '../engine/core/repo';
import { createHostedRepoRecord } from '../engine/core/world';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHosted(world: World, repoId: string): HostedRepo | undefined {
  return world.hosted[repoId];
}

function actor(world: World, a: string | undefined): string {
  return a ?? world.hub.viewer;
}

function now(world: World): number {
  return world.clock;
}

function findIssue(hosted: HostedRepo, num: number): Issue | undefined {
  return hosted.issues.find((i) => i.number === num);
}

function findPR(hosted: HostedRepo, num: number): PullRequest | undefined {
  return hosted.pulls.find((p) => p.number === num);
}

/** Extract issue numbers from "Fixes #N" / "Closes #N" / "Resolves #N". */
function extractFixedIssueNumbers(text: string): number[] {
  const re = /(?:fix(?:es|ed)?|close[sd]?|resolve[sd]?)\s+#(\d+)/gi;
  const nums: number[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    nums.push(parseInt(m[1], 10));
  }
  return [...new Set(nums)];
}

/** Resolve a revision name in a hosted (bare) repo. */
function resolveHostedRev(hosted: HostedRepo, name: string): Hash | null {
  const repo = hosted.repo;
  if (name === 'HEAD') return headCommit(repo);
  const branchRef = `refs/heads/${name}`;
  if (repo.refs[branchRef]) return repo.refs[branchRef];
  if (repo.refs[name]) return repo.refs[name];
  if (/^[0-9a-f]{40}$/.test(name) && repo.objects[name]) return name;
  return null;
}

// ---------------------------------------------------------------------------
// applyHubAction
// ---------------------------------------------------------------------------

/** Apply one action on the simulated GitHub. `action.actor` defaults to world.hub.viewer. */
export function applyHubAction(world: World, action: HubAction): CommandResult {
  const who = actor(world, (action as { actor?: string }).actor);
  const ts = now(world);

  switch (action.type) {
    // ===== Repository actions =====
    case 'createRepo': {
      const owner = action.owner ?? who;
      const id = `${owner}/${action.name}` as HostedRepoId;
      if (world.hosted[id]) {
        return fail(world, 1, stderr(`Repository ${id} already exists`));
      }
      const newWorld = produce(world, (draft) => {
        const hosted = createHostedRepoRecord({
          id,
          description: action.description ?? '',
          visibility: action.visibility ?? 'public',
          createdAt: ts,
        });
        if (action.readme || action.gitignore || action.license) {
          const files: Record<string, string> = {};
          if (action.readme) files['README.md'] = `# ${action.name}\n\n${action.description ?? ''}\n`;
          if (action.gitignore) files['.gitignore'] = action.gitignore;
          if (action.license) files['LICENSE'] = action.license;
          const flat: Record<string, FlatTreeEntry> = {};
          for (const [path, content] of Object.entries(files)) {
            const blobHash = writeBlob(hosted.repo, content);
            flat[path] = { mode: '100644', hash: blobHash };
          }
          const treeHash = writeTreeFromFlat(hosted.repo, flat);
          const sig = { name: owner, email: `${owner}@users.noreply.github.com`, timestamp: ts, timezone: '+0000' };
          const commitObj = { type: 'commit' as const, tree: treeHash, parents: [] as string[], author: sig, committer: sig, message: 'Initial commit\n' };
          const commitHash = writeObject(hosted.repo, commitObj);
          hosted.repo.refs[`refs/heads/${hosted.defaultBranch}`] = commitHash;
        }
        if (!hosted.collaborators.includes(who)) hosted.collaborators.push(who);
        draft.hosted[id] = hosted;
      });
      return ok(newWorld, [], [{ type: 'hub.repo.create', repo: id, by: who }]);
    }

    case 'editFile': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const branch = action.branch ?? hosted.defaultBranch;
      const branchRef = `refs/heads/${branch}`;
      const parentHash = hosted.repo.refs[branchRef];
      if (!parentHash) return fail(world, 1, stderr(`Branch '${branch}' not found`));

      let commitHash = '';
      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const parent = getCommit(h.repo, parentHash);
        if (!parent) return;
        const existing = readTreeFlat(h.repo, parent.tree);
        const blobHash = writeBlob(h.repo, action.content);
        existing[action.path] = { mode: '100644', hash: blobHash };
        const treeHash = writeTreeFromFlat(h.repo, existing);
        const sig = { name: who, email: `${who}@users.noreply.github.com`, timestamp: ts, timezone: '+0000' };
        const commitObj = { type: 'commit' as const, tree: treeHash, parents: [parentHash], author: sig, committer: sig, message: `${action.message}\n` };
        commitHash = writeObject(h.repo, commitObj);
        h.repo.refs[branchRef] = commitHash;
      });
      if (!commitHash) commitHash = newWorld.hosted[repoId].repo.refs[branchRef]!;
      return ok(newWorld, [], [{ type: 'hub.file.edit', repo: repoId, branch, path: action.path, commit: commitHash, by: who }]);
    }

    case 'createBranch': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const from = action.from ?? hosted.defaultBranch;
      const sourceHash = resolveHostedRev(hosted, from);
      if (!sourceHash) return fail(world, 1, stderr(`Reference '${from}' not found`));
      const branchRef = `refs/heads/${action.branch}`;
      if (hosted.repo.refs[branchRef]) return fail(world, 1, stderr(`Branch '${action.branch}' already exists`));

      const newWorld = produce(world, (draft) => {
        draft.hosted[repoId].repo.refs[branchRef] = sourceHash;
      });
      return ok(newWorld);
    }

    case 'deleteBranch': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const branchRef = `refs/heads/${action.branch}`;
      if (!hosted.repo.refs[branchRef]) return fail(world, 1, stderr(`Branch '${action.branch}' not found`));
      if (action.branch === hosted.defaultBranch) return fail(world, 1, stderr(`Cannot delete the default branch`));

      const newWorld = produce(world, (draft) => {
        delete draft.hosted[repoId].repo.refs[branchRef];
      });
      return ok(newWorld, [], [{ type: 'hub.branch.delete', repo: repoId, branch: action.branch, by: who }]);
    }

    // ===== Issue actions =====
    case 'createIssue': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));

      let num = 0;
      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        num = h.nextNumber++;
        const issue: Issue = {
          number: num,
          title: action.title,
          body: action.body ?? '',
          author: who,
          state: 'open',
          assignees: action.assignees ?? [],
          labels: action.labels ?? [],
          comments: [],
          references: [],
          createdAt: ts,
        };
        h.issues.push(issue);
      });
      return ok(newWorld, [], [{ type: 'hub.issue.open', repo: repoId, number: num, by: who }]);
    }

    case 'closeIssue': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const issue = findIssue(hosted, action.number);
      if (!issue) return fail(world, 1, stderr(`Issue #${action.number} not found`));
      if (issue.state === 'closed') return fail(world, 1, stderr(`Issue #${action.number} is already closed`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const i = h.issues.find((x) => x.number === action.number)!;
        i.state = 'closed';
        i.stateReason = action.reason ?? 'completed';
        i.closedAt = ts;
        i.closedBy = { kind: 'user', ref: who };
      });
      return ok(newWorld, [], [{ type: 'hub.issue.update', repo: repoId, number: action.number, by: who, change: 'close' }]);
    }

    case 'reopenIssue': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const issue = findIssue(hosted, action.number);
      if (!issue) return fail(world, 1, stderr(`Issue #${action.number} not found`));
      if (issue.state === 'open') return fail(world, 1, stderr(`Issue #${action.number} is already open`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const i = h.issues.find((x) => x.number === action.number)!;
        i.state = 'open';
        delete i.stateReason;
        delete i.closedAt;
        delete i.closedBy;
      });
      return ok(newWorld, [], [{ type: 'hub.issue.update', repo: repoId, number: action.number, by: who, change: 'reopen' }]);
    }

    case 'commentIssue': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      // commentIssue works for both issues and PRs (GitHub treats them the same)
      const issue = findIssue(hosted, action.number);
      const pr = findPR(hosted, action.number);
      if (!issue && !pr) return fail(world, 1, stderr(`Issue/PR #${action.number} not found`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const comment: HubComment = { id: h.nextId++, author: who, body: action.body, createdAt: ts };
        if (issue) {
          const i = h.issues.find((x) => x.number === action.number)!;
          i.comments.push(comment);
        } else {
          const p = h.pulls.find((x) => x.number === action.number)!;
          p.comments.push(comment);
        }
      });
      const eventType = issue ? 'hub.issue.update' : 'hub.pr.update';
      return ok(newWorld, [], [{ type: eventType, repo: repoId, number: action.number, by: who, change: 'comment' } as GameEvent]);
    }

    case 'assignIssue': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const issue = findIssue(hosted, action.number);
      if (!issue) return fail(world, 1, stderr(`Issue #${action.number} not found`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const i = h.issues.find((x) => x.number === action.number)!;
        i.assignees = action.assignees;
      });
      return ok(newWorld, [], [{ type: 'hub.issue.update', repo: repoId, number: action.number, by: who, change: 'assign' }]);
    }

    case 'labelIssue': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const issue = findIssue(hosted, action.number);
      if (!issue) return fail(world, 1, stderr(`Issue #${action.number} not found`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const i = h.issues.find((x) => x.number === action.number)!;
        i.labels = action.labels;
      });
      return ok(newWorld, [], [{ type: 'hub.issue.update', repo: repoId, number: action.number, by: who, change: 'label' }]);
    }

    // ===== Pull Request actions =====
    case 'openPullRequest': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const base = action.base ?? hosted.defaultBranch;
      const headRef = `refs/heads/${action.head}`;
      const baseRef = `refs/heads/${base}`;
      if (!hosted.repo.refs[headRef]) return fail(world, 1, stderr(`Branch '${action.head}' not found`));
      if (!hosted.repo.refs[baseRef]) return fail(world, 1, stderr(`Branch '${base}' not found`));

      let num = 0;
      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        num = h.nextNumber++;
        const baseSha = h.repo.refs[baseRef]!;
        const pr: PullRequest = {
          number: num,
          title: action.title,
          body: action.body ?? '',
          author: who,
          head: { repo: repoId, branch: action.head },
          base,
          state: 'open',
          draft: action.draft ?? false,
          requestedReviewers: action.reviewers ?? [],
          reviews: [],
          comments: [],
          reviewComments: [],
          labels: [],
          assignees: [],
          createdAt: ts,
          baseSha,
        };
        h.pulls.push(pr);
      });
      return ok(newWorld, [], [{ type: 'hub.pr.open', repo: repoId, number: num, by: who }]);
    }

    case 'commentPullRequest': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const pr = findPR(hosted, action.number);
      if (!pr) return fail(world, 1, stderr(`Pull request #${action.number} not found`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const p = h.pulls.find((x) => x.number === action.number)!;
        const comment: HubComment = { id: h.nextId++, author: who, body: action.body, createdAt: ts };
        p.comments.push(comment);
      });
      return ok(newWorld, [], [{ type: 'hub.pr.update', repo: repoId, number: action.number, by: who, change: 'comment' }]);
    }

    case 'requestReviewers': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const pr = findPR(hosted, action.number);
      if (!pr) return fail(world, 1, stderr(`Pull request #${action.number} not found`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const p = h.pulls.find((x) => x.number === action.number)!;
        for (const r of action.reviewers) {
          if (!p.requestedReviewers.includes(r)) p.requestedReviewers.push(r);
        }
      });
      return ok(newWorld, [], [{ type: 'hub.pr.update', repo: repoId, number: action.number, by: who, change: 'reviewers' }]);
    }

    case 'reviewPullRequest': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const pr = findPR(hosted, action.number);
      if (!pr) return fail(world, 1, stderr(`Pull request #${action.number} not found`));

      const headRef = `refs/heads/${pr.head.branch}`;
      const headSha = hosted.repo.refs[headRef] ?? '';
      const stateMap = { approve: 'APPROVED', request_changes: 'CHANGES_REQUESTED', comment: 'COMMENTED' } as const;

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const p = h.pulls.find((x) => x.number === action.number)!;
        const review: Review = {
          id: h.nextId++,
          author: who,
          state: stateMap[action.event],
          body: action.body ?? '',
          commit: headSha,
          submittedAt: ts,
        };
        p.reviews.push(review);
        p.requestedReviewers = p.requestedReviewers.filter((r) => r !== who);

        if (action.comments) {
          for (const c of action.comments) {
            const rc: ReviewComment = {
              id: h.nextId++,
              author: who,
              path: c.path,
              line: c.line,
              body: c.body,
              commit: headSha,
              createdAt: ts,
            };
            p.reviewComments.push(rc);
          }
        }
      });
      return ok(newWorld, [], [{ type: 'hub.pr.review', repo: repoId, number: action.number, by: who, state: stateMap[action.event] }]);
    }

    case 'replyReviewComment': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const pr = findPR(hosted, action.number);
      if (!pr) return fail(world, 1, stderr(`Pull request #${action.number} not found`));

      let commentId = 0;
      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const p = h.pulls.find((x) => x.number === action.number)!;
        const headRef = `refs/heads/${p.head.branch}`;
        const headSha = h.repo.refs[headRef] ?? '';
        const parentComment = action.commentId != null
          ? p.reviewComments.find((c) => c.id === action.commentId)
          : p.reviewComments[p.reviewComments.length - 1];
        commentId = h.nextId++;
        const rc: ReviewComment = {
          id: commentId,
          author: who,
          path: parentComment?.path ?? '',
          line: parentComment?.line ?? 0,
          body: action.body,
          commit: headSha,
          createdAt: ts,
          inReplyTo: parentComment?.id,
        };
        p.reviewComments.push(rc);
      });
      return ok(newWorld, [], [{ type: 'hub.pr.reviewComment', repo: repoId, number: action.number, by: who, commentId }]);
    }

    case 'resolveReviewThread': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const pr = findPR(hosted, action.number);
      if (!pr) return fail(world, 1, stderr(`Pull request #${action.number} not found`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const p = h.pulls.find((x) => x.number === action.number)!;
        if (action.commentId != null) {
          const comment = p.reviewComments.find((c) => c.id === action.commentId);
          if (comment) comment.resolved = true;
          for (const c of p.reviewComments) {
            if (c.inReplyTo === action.commentId) c.resolved = true;
          }
        } else {
          for (const c of p.reviewComments) {
            if (!c.resolved) c.resolved = true;
          }
        }
      });
      return ok(newWorld);
    }

    case 'mergePullRequest': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const pr = findPR(hosted, action.number);
      if (!pr) return fail(world, 1, stderr(`Pull request #${action.number} not found`));
      if (pr.state !== 'open') return fail(world, 1, stderr(`Pull request #${action.number} is not open`));

      const headRef = `refs/heads/${pr.head.branch}`;
      const baseRef = `refs/heads/${pr.base}`;
      const headSha = hosted.repo.refs[headRef];
      const baseSha = hosted.repo.refs[baseRef];
      if (!headSha || !baseSha) return fail(world, 1, stderr(`Branch refs not found for PR #${action.number}`));

      const mergeTitle = action.title ?? `Merge pull request #${action.number} from ${pr.head.branch}`;
      const mergeBody = action.message ?? pr.title;
      const mergeMessage = `${mergeTitle}\n\n${mergeBody}\n`;

      let mergeHash = '';
      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const headCommitObj = getCommit(h.repo, headSha);
        if (!headCommitObj) return;

        const sig = { name: who, email: `${who}@users.noreply.github.com`, timestamp: ts, timezone: '+0000' };
        const mergeCommit = {
          type: 'commit' as const,
          tree: headCommitObj.tree,
          parents: [baseSha, headSha],
          author: sig,
          committer: sig,
          message: mergeMessage,
        };
        mergeHash = writeObject(h.repo, mergeCommit);
        h.repo.refs[baseRef] = mergeHash;

        const p = h.pulls.find((x) => x.number === action.number)!;
        p.state = 'merged';
        p.headSha = headSha;
        p.merged = { by: who, at: ts, method: 'merge', commit: mergeHash };

        // Handle "Fixes #N" in PR body
        const fixedIssues = extractFixedIssueNumbers(p.body);
        for (const issueNum of fixedIssues) {
          const issue = h.issues.find((i) => i.number === issueNum);
          if (issue && issue.state === 'open') {
            issue.state = 'closed';
            issue.stateReason = 'completed';
            issue.closedAt = ts;
            issue.closedBy = { kind: 'pull', ref: String(action.number) };
            issue.references.push({
              kind: 'pull',
              ref: String(action.number),
              by: who,
              at: ts,
              closes: true,
            });
          }
        }

        if (action.deleteBranch) {
          delete h.repo.refs[headRef];
        }
      });

      if (!mergeHash) mergeHash = newWorld.hosted[repoId].repo.refs[baseRef]!;
      const events: GameEvent[] = [
        { type: 'hub.pr.merge', repo: repoId, number: action.number, by: who, method: 'merge', commit: mergeHash },
      ];
      if (action.deleteBranch) {
        events.push({ type: 'hub.branch.delete', repo: repoId, branch: pr.head.branch, by: who });
      }
      return ok(newWorld, [], events);
    }

    case 'closePullRequest': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const pr = findPR(hosted, action.number);
      if (!pr) return fail(world, 1, stderr(`Pull request #${action.number} not found`));
      if (pr.state !== 'open') return fail(world, 1, stderr(`Pull request #${action.number} is not open`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const p = h.pulls.find((x) => x.number === action.number)!;
        p.state = 'closed';
        const hRef = `refs/heads/${p.head.branch}`;
        p.headSha = h.repo.refs[hRef];
        p.closedAt = ts;
      });
      return ok(newWorld, [], [{ type: 'hub.pr.update', repo: repoId, number: action.number, by: who, change: 'close' }]);
    }

    case 'reopenPullRequest': {
      const repoId = action.repo as HostedRepoId;
      const hosted = getHosted(world, repoId);
      if (!hosted) return fail(world, 1, stderr(`Repository ${repoId} not found`));
      const pr = findPR(hosted, action.number);
      if (!pr) return fail(world, 1, stderr(`Pull request #${action.number} not found`));
      if (pr.state !== 'closed') return fail(world, 1, stderr(`Pull request #${action.number} is not closed`));

      const newWorld = produce(world, (draft) => {
        const h = draft.hosted[repoId];
        const p = h.pulls.find((x) => x.number === action.number)!;
        p.state = 'open';
        delete p.headSha;
        delete p.closedAt;
      });
      return ok(newWorld, [], [{ type: 'hub.pr.update', repo: repoId, number: action.number, by: who, change: 'reopen' }]);
    }

    default:
      return fail(world, 1, stderr(`hub action '${(action as { type: string }).type}' is not available yet`));
  }
}

// ---------------------------------------------------------------------------
// reactToEvents
// ---------------------------------------------------------------------------

/**
 * React to events from git commands and other hub actions: update pull
 * requests on push, close issues mentioned with "Fixes #n" on the default
 * branch.
 */
export function reactToEvents(world: World, events: GameEvent[]): CommandResult {
  let w = world;
  const allEvents: GameEvent[] = [];

  for (const event of events) {
    if (event.type === 'transfer.push') {
      const repoId = event.hosted as HostedRepoId;
      const hosted = w.hosted[repoId];
      if (!hosted) continue;

      w = produce(w, (draft) => {
        const h = draft.hosted[repoId];
        // Update PRs whose head branch was pushed
        for (const pr of h.pulls) {
          if (pr.state !== 'open') continue;
          const headRef = `refs/heads/${pr.head.branch}`;
          for (const update of event.updates) {
            if (update.ref === headRef && update.to) {
              allEvents.push({
                type: 'hub.pr.update',
                repo: repoId,
                number: pr.number,
                by: w.hub.viewer,
                change: 'push',
              });
            }
          }
        }

        // Close issues from "Fixes #N" in commits pushed to default branch
        const defaultRef = `refs/heads/${h.defaultBranch}`;
        for (const update of event.updates) {
          if (update.ref === defaultRef && update.to) {
            const commit = getCommit(h.repo, update.to);
            if (commit) {
              const fixedIssues = extractFixedIssueNumbers(commit.message);
              for (const issueNum of fixedIssues) {
                const issue = h.issues.find((i) => i.number === issueNum);
                if (issue && issue.state === 'open') {
                  issue.state = 'closed';
                  issue.stateReason = 'completed';
                  issue.closedAt = w.clock;
                  issue.closedBy = { kind: 'commit', ref: update.to };
                  issue.references.push({
                    kind: 'commit',
                    ref: update.to,
                    by: w.hub.viewer,
                    at: w.clock,
                    closes: true,
                  });
                  allEvents.push({
                    type: 'hub.issue.update',
                    repo: repoId,
                    number: issue.number,
                    by: w.hub.viewer,
                    change: 'close',
                  });
                }
              }
            }
          }
        }
      });
    }
  }

  return { state: w, events: allEvents, output: [], exitCode: 0 };
}
