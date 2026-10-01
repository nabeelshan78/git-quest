import { describe, expect, it } from 'vitest';
import { applyHubAction, reactToEvents } from '../../../src/hub/index';
import { createWorld, createHostedRepoRecord } from '../../../src/engine/core/world';
import { writeBlob, writeTreeFromFlat, writeObject } from '../../../src/engine/core/objects';
import type { FlatTreeEntry } from '../../../src/engine/core/objects';
import type { World, HostedRepo } from '../../../src/shared/types';

function makeWorldWithRepo(): { world: World; repoId: string } {
  const world = createWorld({ hubViewer: 'intern', hubViewerName: 'Intern' });
  const hosted = createHostedRepoRecord({ id: 'org/repo', createdAt: 1000 });
  // Add an initial commit
  const blobHash = writeBlob(hosted.repo, 'hello\n');
  const flat: Record<string, FlatTreeEntry> = { 'README.md': { mode: '100644', hash: blobHash } };
  const treeHash = writeTreeFromFlat(hosted.repo, flat);
  const sig = { name: 'Test', email: 'test@test.com', timestamp: 1000, timezone: '+0000' };
  const commitHash = writeObject(hosted.repo, {
    type: 'commit', tree: treeHash, parents: [], author: sig, committer: sig, message: 'Initial commit\n',
  });
  hosted.repo.refs['refs/heads/main'] = commitHash;
  const w = { ...world, hosted: { 'org/repo': hosted } };
  return { world: w, repoId: 'org/repo' };
}

describe('Hub Actions', () => {
  describe('createIssue', () => {
    it('creates an issue and assigns a number', () => {
      const { world, repoId } = makeWorldWithRepo();
      const result = applyHubAction(world, {
        type: 'createIssue', repo: repoId, title: 'Bug report', body: 'Something is broken',
      });
      expect(result.exitCode).toBe(0);
      const hosted = result.state.hosted[repoId];
      expect(hosted.issues).toHaveLength(1);
      expect(hosted.issues[0].title).toBe('Bug report');
      expect(hosted.issues[0].state).toBe('open');
      expect(hosted.issues[0].number).toBe(1);
      expect(result.events).toHaveLength(1);
      expect(result.events[0].type).toBe('hub.issue.open');
    });
  });

  describe('closeIssue / reopenIssue', () => {
    it('closes and reopens an issue', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createIssue', repo: repoId, title: 'Issue' });
      r = applyHubAction(r.state, { type: 'closeIssue', repo: repoId, number: 1 });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].issues[0].state).toBe('closed');

      r = applyHubAction(r.state, { type: 'reopenIssue', repo: repoId, number: 1 });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].issues[0].state).toBe('open');
    });

    it('fails to close an already closed issue', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createIssue', repo: repoId, title: 'Issue' });
      r = applyHubAction(r.state, { type: 'closeIssue', repo: repoId, number: 1 });
      r = applyHubAction(r.state, { type: 'closeIssue', repo: repoId, number: 1 });
      expect(r.exitCode).toBe(1);
    });
  });

  describe('commentIssue', () => {
    it('adds a comment to an issue', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createIssue', repo: repoId, title: 'Issue' });
      r = applyHubAction(r.state, { type: 'commentIssue', repo: repoId, number: 1, body: 'A comment' });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].issues[0].comments).toHaveLength(1);
      expect(r.state.hosted[repoId].issues[0].comments[0].body).toBe('A comment');
    });
  });

  describe('assignIssue', () => {
    it('assigns users to an issue', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createIssue', repo: repoId, title: 'Issue' });
      r = applyHubAction(r.state, { type: 'assignIssue', repo: repoId, number: 1, assignees: ['intern'] });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].issues[0].assignees).toEqual(['intern']);
    });
  });

  describe('labelIssue', () => {
    it('sets labels on an issue', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createIssue', repo: repoId, title: 'Issue' });
      r = applyHubAction(r.state, { type: 'labelIssue', repo: repoId, number: 1, labels: ['bug', 'enhancement'] });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].issues[0].labels).toEqual(['bug', 'enhancement']);
    });
  });

  describe('openPullRequest', () => {
    it('creates a PR with head and base branches', () => {
      const { world, repoId } = makeWorldWithRepo();
      // Create a feature branch
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feature', from: 'main' });
      r = applyHubAction(r.state, {
        type: 'openPullRequest', repo: repoId, head: 'feature', base: 'main', title: 'Add feature',
      });
      expect(r.exitCode).toBe(0);
      const hosted = r.state.hosted[repoId];
      expect(hosted.pulls).toHaveLength(1);
      expect(hosted.pulls[0].title).toBe('Add feature');
      expect(hosted.pulls[0].state).toBe('open');
      expect(hosted.pulls[0].head.branch).toBe('feature');
      expect(hosted.pulls[0].base).toBe('main');
    });

    it('fails if head branch does not exist', () => {
      const { world, repoId } = makeWorldWithRepo();
      const r = applyHubAction(world, {
        type: 'openPullRequest', repo: repoId, head: 'nonexistent', title: 'Bad PR',
      });
      expect(r.exitCode).toBe(1);
    });
  });

  describe('reviewPullRequest', () => {
    it('adds an approval review', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feat' });
      r = applyHubAction(r.state, { type: 'openPullRequest', repo: repoId, head: 'feat', title: 'PR' });
      const prNum = r.state.hosted[repoId].pulls[0].number;
      r = applyHubAction(r.state, {
        type: 'reviewPullRequest', actor: 'reviewer', repo: repoId, number: prNum, event: 'approve', body: 'LGTM',
      });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].pulls[0].reviews).toHaveLength(1);
      expect(r.state.hosted[repoId].pulls[0].reviews[0].state).toBe('APPROVED');
    });

    it('adds inline review comments', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feat' });
      r = applyHubAction(r.state, { type: 'openPullRequest', repo: repoId, head: 'feat', title: 'PR' });
      const prNum = r.state.hosted[repoId].pulls[0].number;
      r = applyHubAction(r.state, {
        type: 'reviewPullRequest', actor: 'reviewer', repo: repoId, number: prNum, event: 'request_changes',
        comments: [{ path: 'file.txt', line: 1, body: 'Fix this' }],
      });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].pulls[0].reviewComments).toHaveLength(1);
    });
  });

  describe('replyReviewComment', () => {
    it('replies to a review comment', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feat' });
      r = applyHubAction(r.state, { type: 'openPullRequest', repo: repoId, head: 'feat', title: 'PR' });
      const prNum = r.state.hosted[repoId].pulls[0].number;
      r = applyHubAction(r.state, {
        type: 'reviewPullRequest', actor: 'reviewer', repo: repoId, number: prNum, event: 'comment',
        comments: [{ path: 'file.txt', line: 1, body: 'Question' }],
      });
      const commentId = r.state.hosted[repoId].pulls[0].reviewComments[0].id;
      r = applyHubAction(r.state, {
        type: 'replyReviewComment', repo: repoId, number: prNum, commentId, body: 'Answer',
      });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].pulls[0].reviewComments).toHaveLength(2);
      expect(r.state.hosted[repoId].pulls[0].reviewComments[1].inReplyTo).toBe(commentId);
    });
  });

  describe('resolveReviewThread', () => {
    it('resolves a review thread', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feat' });
      r = applyHubAction(r.state, { type: 'openPullRequest', repo: repoId, head: 'feat', title: 'PR' });
      const prNum = r.state.hosted[repoId].pulls[0].number;
      r = applyHubAction(r.state, {
        type: 'reviewPullRequest', actor: 'reviewer', repo: repoId, number: prNum, event: 'comment',
        comments: [{ path: 'file.txt', line: 1, body: 'Fix' }],
      });
      const commentId = r.state.hosted[repoId].pulls[0].reviewComments[0].id;
      r = applyHubAction(r.state, { type: 'resolveReviewThread', repo: repoId, number: prNum, commentId });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].pulls[0].reviewComments[0].resolved).toBe(true);
    });
  });

  describe('mergePullRequest', () => {
    it('merges a PR and creates a merge commit', () => {
      const { world, repoId } = makeWorldWithRepo();
      // Create feature branch with a new commit
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feature' });
      r = applyHubAction(r.state, {
        type: 'editFile', repo: repoId, branch: 'feature', path: 'new.txt', content: 'new', message: 'Add new file',
      });
      r = applyHubAction(r.state, { type: 'openPullRequest', repo: repoId, head: 'feature', title: 'Add new file' });
      const prNumber = r.state.hosted[repoId].pulls[0].number;

      r = applyHubAction(r.state, { type: 'mergePullRequest', repo: repoId, number: prNumber });
      expect(r.exitCode).toBe(0);

      const hosted = r.state.hosted[repoId];
      const pr = hosted.pulls[0];
      expect(pr.state).toBe('merged');
      expect(pr.merged).toBeDefined();
      expect(pr.merged!.method).toBe('merge');

      // The merge commit should be on the base branch
      const mainHash = hosted.repo.refs['refs/heads/main'];
      const mainCommit = hosted.repo.objects[mainHash!];
      expect(mainCommit).toBeDefined();
      expect((mainCommit as any).parents).toHaveLength(2);
    });

    it('closes issues referenced with Fixes #N', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createIssue', repo: repoId, title: 'Bug' });
      r = applyHubAction(r.state, { type: 'createBranch', repo: repoId, branch: 'fix' });
      r = applyHubAction(r.state, {
        type: 'editFile', repo: repoId, branch: 'fix', path: 'fix.txt', content: 'fix', message: 'Fix bug',
      });
      r = applyHubAction(r.state, {
        type: 'openPullRequest', repo: repoId, head: 'fix', title: 'Fix', body: 'Fixes #1',
      });
      const prNum = r.state.hosted[repoId].pulls[0].number;
      r = applyHubAction(r.state, { type: 'mergePullRequest', repo: repoId, number: prNum });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].issues[0].state).toBe('closed');
    });

    it('deletes the head branch when requested', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feat' });
      r = applyHubAction(r.state, {
        type: 'editFile', repo: repoId, branch: 'feat', path: 'f.txt', content: 'x', message: 'add',
      });
      r = applyHubAction(r.state, { type: 'openPullRequest', repo: repoId, head: 'feat', title: 'PR' });
      const prNum = r.state.hosted[repoId].pulls[0].number;
      r = applyHubAction(r.state, { type: 'mergePullRequest', repo: repoId, number: prNum, deleteBranch: true });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].repo.refs['refs/heads/feat']).toBeUndefined();
    });

    it('fails to merge a closed PR', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feat' });
      r = applyHubAction(r.state, { type: 'openPullRequest', repo: repoId, head: 'feat', title: 'PR' });
      r = applyHubAction(r.state, { type: 'closePullRequest', repo: repoId, number: 2 });
      r = applyHubAction(r.state, { type: 'mergePullRequest', repo: repoId, number: 2 });
      expect(r.exitCode).toBe(1);
    });
  });

  describe('deleteBranch', () => {
    it('deletes a branch', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'to-delete' });
      expect(r.state.hosted[repoId].repo.refs['refs/heads/to-delete']).toBeDefined();
      r = applyHubAction(r.state, { type: 'deleteBranch', repo: repoId, branch: 'to-delete' });
      expect(r.exitCode).toBe(0);
      expect(r.state.hosted[repoId].repo.refs['refs/heads/to-delete']).toBeUndefined();
    });

    it('cannot delete the default branch', () => {
      const { world, repoId } = makeWorldWithRepo();
      const r = applyHubAction(world, { type: 'deleteBranch', repo: repoId, branch: 'main' });
      expect(r.exitCode).toBe(1);
    });
  });

  describe('editFile', () => {
    it('creates a commit on a branch', () => {
      const { world, repoId } = makeWorldWithRepo();
      const r = applyHubAction(world, {
        type: 'editFile', repo: repoId, path: 'new.txt', content: 'content', message: 'Add new file',
      });
      expect(r.exitCode).toBe(0);
      expect(r.events[0].type).toBe('hub.file.edit');
    });
  });

  describe('closePullRequest / reopenPullRequest', () => {
    it('closes and reopens a PR', () => {
      const { world, repoId } = makeWorldWithRepo();
      let r = applyHubAction(world, { type: 'createBranch', repo: repoId, branch: 'feat' });
      r = applyHubAction(r.state, { type: 'openPullRequest', repo: repoId, head: 'feat', title: 'PR' });
      const prNum = r.state.hosted[repoId].pulls[0].number;
      r = applyHubAction(r.state, { type: 'closePullRequest', repo: repoId, number: prNum });
      expect(r.state.hosted[repoId].pulls[0].state).toBe('closed');
      r = applyHubAction(r.state, { type: 'reopenPullRequest', repo: repoId, number: prNum });
      expect(r.state.hosted[repoId].pulls[0].state).toBe('open');
    });
  });
});

describe('reactToEvents', () => {
  it('returns the world unchanged when no events match', () => {
    const { world } = makeWorldWithRepo();
    const result = reactToEvents(world, []);
    expect(result.state).toBe(world);
  });
});
