// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createSession } from '../../levels';
import { TID } from '../../shared/testids';
import type { GameSession, SessionSnapshot } from '../../shared/session';
import { HubPanel } from './index';

const REPO = 'lantern-labs/festival-site';

afterEach(() => cleanup());

const player = {
  id: 'p', name: 'Test Player', handle: 'test-player',
  email: 't@e.example', classCode: '', createdAt: '2026-01-01T00:00:00Z',
};

/**
 * A real sandbox session driven only through the public GameSession API:
 * the `festival-with-remote` preset already hosts the repo, then the player
 * branches, commits and pushes, and the hub actions run through the engine.
 */
function sessionWithHub(): GameSession {
  const session = createSession({ mode: 'sandbox', sandboxPreset: 'festival-with-remote', player });

  session.run('git switch -c food-stalls');
  session.run('echo "<h2>Food</h2>" > food.html');
  session.run('git add food.html');
  session.run('git commit -m "Add food page"');
  session.run('git push -u origin food-stalls');

  session.hubAction({
    type: 'createIssue', actor: 'ada-okafor', repo: REPO,
    title: 'Add a food stalls page', body: 'Visitors keep asking.', assignees: ['test-player'],
  });
  session.hubAction({
    type: 'openPullRequest', repo: REPO,
    head: 'food-stalls', base: 'main', title: 'Add food stalls page', body: 'Closes #1.',
  });
  session.hubAction({
    type: 'reviewPullRequest', actor: 'ada-okafor', repo: REPO,
    number: 2, event: 'request_changes', body: 'One change please.',
    comments: [{ path: 'food.html', line: 1, body: 'Add the opening hours here.' }],
  });
  return session;
}

function snapshotOf(session: GameSession): SessionSnapshot {
  return session.getSnapshot();
}

describe('HubPanel (simulated code-hosting site)', () => {
  it('shows an empty state when nothing is hosted yet', () => {
    const session = createSession({ mode: 'sandbox', sandboxPreset: 'empty', player });
    render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    expect(screen.getByTestId(TID.hubEmpty)).toBeTruthy();
  });

  it('lists the repository files and renders the README', () => {
    const session = sessionWithHub();
    render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    expect(screen.getByTestId(TID.hubRepoName).textContent).toContain('festival-site');
    expect(screen.getByTestId(TID.hubFileRow('index.html'))).toBeTruthy();
    expect(screen.getByTestId(TID.hubFileRow('README.md'))).toBeTruthy();
    expect(screen.getByTestId(TID.hubReadme).textContent).toContain('festival website');
  });

  it('opens an issue from the list and shows its body', () => {
    const session = sessionWithHub();
    render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    fireEvent.click(screen.getByTestId(TID.hubNavIssues));
    fireEvent.click(screen.getByTestId(TID.hubIssueRow(1)).querySelector('button')!);
    expect(screen.getByTestId(TID.hubIssueTitle).textContent).toContain('food stalls');
    expect(screen.getByTestId(TID.hubIssueBody).textContent).toContain('Visitors keep asking');
  });

  it('commenting on an issue goes through the engine', () => {
    const session = sessionWithHub();
    const { rerender } = render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    fireEvent.click(screen.getByTestId(TID.hubNavIssues));
    fireEvent.click(screen.getByTestId(TID.hubIssueRow(1)).querySelector('button')!);

    fireEvent.change(screen.getByTestId(TID.hubIssueCommentBox), { target: { value: 'Starting on this.' } });
    fireEvent.click(screen.getByTestId(TID.hubIssueCommentSubmit));

    const after = snapshotOf(session);
    const issue = after.world.hosted[REPO].issues.find((i) => i.number === 1)!;
    expect(issue.comments.some((c) => c.body === 'Starting on this.' && c.author === 'test-player')).toBe(true);

    rerender(<HubPanel session={session} snapshot={after} />);
    expect(screen.getByTestId(TID.hubNavIssues)).toBeTruthy();
  });

  it('shows a pull request with its review and line comment', () => {
    const session = sessionWithHub();
    render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    fireEvent.click(screen.getByTestId(TID.hubNavPulls));
    fireEvent.click(screen.getByTestId(TID.hubPullRow(2)).querySelector('button')!);

    expect(screen.getByTestId(TID.hubPullTitle).textContent).toContain('Add food stalls page');
    expect(screen.getByTestId(TID.hubPullState).getAttribute('data-state')).toBe('open');
    const panel = screen.getByTestId(TID.hubPanel);
    expect(panel.textContent).toContain('requested changes');
    expect(panel.textContent).toContain('Add the opening hours here.');
  });

  it('shows the real diff of the branch under Files changed', () => {
    const session = sessionWithHub();
    render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    fireEvent.click(screen.getByTestId(TID.hubNavPulls));
    fireEvent.click(screen.getByTestId(TID.hubPullRow(2)).querySelector('button')!);
    fireEvent.click(screen.getByTestId(TID.hubPullTabFiles));

    const diff = screen.getByTestId(TID.hubPullDiff('food.html'));
    expect(diff.textContent).toContain('<h2>Food</h2>');
  });

  it('replying to a review comment reaches the engine', () => {
    const session = sessionWithHub();
    render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    fireEvent.click(screen.getByTestId(TID.hubNavPulls));
    fireEvent.click(screen.getByTestId(TID.hubPullRow(2)).querySelector('button')!);

    const pr = snapshotOf(session).world.hosted[REPO].pulls.find((p) => p.number === 2)!;
    const rootComment = pr.reviewComments.find((c) => c.inReplyTo === undefined)!;

    fireEvent.change(screen.getByTestId(TID.hubReviewReplyBox(rootComment.id)), { target: { value: 'Adding them now.' } });
    fireEvent.click(screen.getByTestId(TID.hubReviewReplySubmit(rootComment.id)));

    const after = snapshotOf(session).world.hosted[REPO].pulls.find((p) => p.number === 2)!;
    expect(after.reviewComments.some((c) => c.inReplyTo === rootComment.id && c.body === 'Adding them now.')).toBe(true);
  });

  it('the merge button merges the pull request into the base branch', () => {
    const session = sessionWithHub();
    const { rerender } = render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    fireEvent.click(screen.getByTestId(TID.hubNavPulls));
    fireEvent.click(screen.getByTestId(TID.hubPullRow(2)).querySelector('button')!);
    fireEvent.click(screen.getByTestId(TID.hubMergeButton));

    const after = snapshotOf(session);
    const hosted = after.world.hosted[REPO];
    expect(hosted.pulls.find((p) => p.number === 2)!.state).toBe('merged');

    rerender(<HubPanel session={session} snapshot={after} />);
    expect(screen.getByTestId(TID.hubPullState).getAttribute('data-state')).toBe('merged');
    // After merging, the branch can be deleted from the same screen.
    expect(screen.getByTestId(TID.hubDeleteBranchButton)).toBeTruthy();
  });

  it('never shows GitHub branding', () => {
    const session = sessionWithHub();
    render(<HubPanel session={session} snapshot={snapshotOf(session)} />);
    const text = screen.getByTestId(TID.hubPanel).textContent ?? '';
    expect(text).not.toMatch(/GitHub/i);
    expect(text).not.toMatch(/octocat/i);
  });
});
