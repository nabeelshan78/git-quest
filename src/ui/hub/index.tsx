/**
 * Simulated code-hosting website panel ("CodeHub").
 *
 * Generic design on purpose: no GitHub name, logo or Octocat anywhere.
 * Reads straight from `snapshot.world.hosted` and dispatches player actions
 * through `session.hubAction`, so every change flows through the same engine
 * path a scripted teammate uses.
 */
import { useMemo, useState } from 'react';
import { getCommit, readCommitFiles, shortHash } from '../../engine/core/objects';
import { diffTexts, splitRecords } from '../../engine/a/xdiff';
import type { GameSession, SessionSnapshot } from '../../shared/session';
import type { HostedRepo, Issue, PullRequest, RepoState } from '../../shared/types';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';

export interface HubPanelProps {
  session: GameSession;
  snapshot: SessionSnapshot;
  /** Initial page, e.g. "lantern-labs/festival-site/pulls" (from level.ui.hubPage). */
  initialPage?: string;
}

type Tab = 'code' | 'issues' | 'pulls';

interface Route {
  tab: Tab;
  /** Issue or PR number when looking at one. */
  number: number | null;
}

function parseInitialPage(page: string | undefined, repoIds: string[]): { repo: string | null; route: Route } {
  const fallback: Route = { tab: 'code', number: null };
  if (!page) return { repo: repoIds[0] ?? null, route: fallback };
  const parts = page.split('/').filter(Boolean);
  const repo = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  const rest = parts.slice(2);
  let tab: Tab = 'code';
  if (rest[0] === 'issues') tab = 'issues';
  else if (rest[0] === 'pulls' || rest[0] === 'pull') tab = 'pulls';
  const n = rest[1] ? Number.parseInt(rest[1], 10) : NaN;
  return {
    repo: repo && repoIds.includes(repo) ? repo : (repoIds[0] ?? null),
    route: { tab, number: Number.isFinite(n) ? n : null },
  };
}

export function HubPanel({ session, snapshot, initialPage }: HubPanelProps) {
  const hosted = snapshot.world.hosted;
  const repoIds = useMemo(() => Object.keys(hosted).sort(), [hosted]);
  const initial = useMemo(() => parseInitialPage(initialPage, repoIds), [initialPage, repoIds]);

  const [repoId, setRepoId] = useState<string | null>(initial.repo);
  const [route, setRoute] = useState<Route>(initial.route);

  // The level may create the repo mid-play, and a chosen repo can disappear.
  // Fall back during render rather than storing it, so there is no state
  // update in the render phase.
  const activeId = repoId && hosted[repoId] ? repoId : (repoIds[0] ?? null);
  const repo = activeId ? hosted[activeId] : undefined;
  const viewer = snapshot.world.hub.viewer;

  if (!repo) {
    return (
      <section className="gq-hub" data-testid={TID.hubPanel} aria-label={STRINGS.hub.siteName}>
        <div className="gq-hub-empty" data-testid={TID.hubEmpty}>
          <Icon name="cloud" size={28} />
          <p>{STRINGS.hub.empty}</p>
          <p className="gq-small gq-muted">{STRINGS.hub.emptyHint}</p>
        </div>
      </section>
    );
  }

  const openIssues = repo.issues.filter((i) => i.state === 'open').length;
  const openPulls = repo.pulls.filter((p) => p.state === 'open').length;

  const go = (tab: Tab, number: number | null = null) => setRoute({ tab, number });

  return (
    <section className="gq-hub" data-testid={TID.hubPanel} aria-label={STRINGS.hub.siteName}>
      <header className="gq-hub-header">
        <div className="gq-hub-brand">
          <Icon name="cloud" size={16} />
          <span className="gq-hub-site">{STRINGS.hub.siteName}</span>
        </div>
        <div className="gq-hub-repo" data-testid={TID.hubRepoName}>
          {repo.owner}<span className="gq-muted">/</span><strong>{repo.name}</strong>
          {repo.visibility === 'private' && <span className="gq-hub-chip">private</span>}
        </div>
        {repoIds.length > 1 && (
          <select
            className="gq-hub-repo-select"
            value={activeId ?? ''}
            onChange={(e) => { setRepoId(e.target.value); go('code'); }}
            aria-label="Repository"
          >
            {repoIds.map((id) => <option key={id} value={id}>{id}</option>)}
          </select>
        )}
      </header>

      <nav className="gq-hub-nav" role="tablist">
        <button
          type="button" role="tab" className="gq-hub-tab" aria-selected={route.tab === 'code'}
          onClick={() => go('code')} data-testid={TID.hubNavCode}
        >
          <Icon name="code" size={14} /> {STRINGS.hub.navCode}
        </button>
        <button
          type="button" role="tab" className="gq-hub-tab" aria-selected={route.tab === 'issues'}
          onClick={() => go('issues')} data-testid={TID.hubNavIssues}
        >
          <Icon name="issue" size={14} /> {STRINGS.hub.navIssues}
          {openIssues > 0 && <span className="gq-hub-count">{openIssues}</span>}
        </button>
        <button
          type="button" role="tab" className="gq-hub-tab" aria-selected={route.tab === 'pulls'}
          onClick={() => go('pulls')} data-testid={TID.hubNavPulls}
        >
          <Icon name="pr" size={14} /> {STRINGS.hub.navPulls}
          {openPulls > 0 && <span className="gq-hub-count">{openPulls}</span>}
        </button>
      </nav>

      <div className="gq-hub-body">
        {route.tab === 'code' && <CodeView repo={repo} />}
        {route.tab === 'issues' && (
          route.number === null
            ? <IssueList repo={repo} onOpen={(n) => go('issues', n)} session={session} />
            : <IssueDetail repo={repo} number={route.number} viewer={viewer} session={session} onBack={() => go('issues')} />
        )}
        {route.tab === 'pulls' && (
          route.number === null
            ? <PullList repo={repo} onOpen={(n) => go('pulls', n)} session={session} />
            : <PullDetail repo={repo} number={route.number} viewer={viewer} session={session} onBack={() => go('pulls')} />
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Code tab
// ---------------------------------------------------------------------------

function branchNames(repo: RepoState): string[] {
  return Object.keys(repo.refs)
    .filter((r) => r.startsWith('refs/heads/'))
    .map((r) => r.slice('refs/heads/'.length))
    .sort();
}

function CodeView({ repo }: { repo: HostedRepo }) {
  const branches = useMemo(() => branchNames(repo.repo), [repo.repo]);
  const [branch, setBranch] = useState(repo.defaultBranch);
  const active = branches.includes(branch) ? branch : (branches[0] ?? repo.defaultBranch);

  const { files, tip } = useMemo(() => {
    const hash = repo.repo.refs[`refs/heads/${active}`];
    if (!hash) return { files: {} as Record<string, string>, tip: null };
    return { files: readCommitFiles(repo.repo, hash), tip: getCommit(repo.repo, hash) ?? null };
  }, [repo.repo, active]);

  const paths = Object.keys(files).sort();
  const readme = paths.find((p) => p.toLowerCase() === 'readme.md');

  return (
    <div className="gq-hub-code">
      <div className="gq-hub-toolbar">
        <label className="gq-small gq-muted" htmlFor="hub-branch">{STRINGS.hub.branchLabel}</label>
        <select
          id="hub-branch" className="gq-hub-branch" value={active}
          onChange={(e) => setBranch(e.target.value)} data-testid={TID.hubBranchPicker}
        >
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <span className="gq-small gq-muted">{fmt(STRINGS.hub.fileCount, { n: paths.length })}</span>
      </div>

      {tip && (
        <div className="gq-hub-tipcommit gq-small">
          <code>{shortHash(repo.repo.refs[`refs/heads/${active}`] ?? '')}</code>
          {' '}{tip.message.split('\n')[0]}
          <span className="gq-muted"> — {tip.author.name}</span>
        </div>
      )}

      {paths.length === 0 ? (
        <p className="gq-muted gq-small">{STRINGS.hub.noFiles}</p>
      ) : (
        <ul className="gq-hub-filelist">
          {paths.map((p) => (
            <li key={p} data-testid={TID.hubFileRow(p)}>
              <Icon name="file" size={14} /> <span className="gq-hub-filename">{p}</span>
            </li>
          ))}
        </ul>
      )}

      {readme && (
        <div className="gq-hub-readme" data-testid={TID.hubReadme}>
          <div className="gq-hub-readme-head">{STRINGS.hub.readmeTitle}</div>
          <pre>{files[readme]}</pre>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Issues
// ---------------------------------------------------------------------------

function IssueList({ repo, onOpen, session }: { repo: HostedRepo; onOpen: (n: number) => void; session: GameSession }) {
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const submit = () => {
    if (!title.trim()) return;
    session.hubAction({ type: 'createIssue', repo: repo.id, title: title.trim(), body: body.trim() || undefined });
    setTitle(''); setBody(''); setCreating(false);
  };

  return (
    <div className="gq-hub-list">
      <div className="gq-hub-toolbar">
        <span className="gq-small gq-muted">
          {fmt(STRINGS.hub.openCount, { n: repo.issues.filter((i) => i.state === 'open').length })}
        </span>
        <button type="button" className="gq-btn gq-btn-sm gq-btn-primary" onClick={() => setCreating(!creating)} data-testid={TID.hubNewIssueButton}>
          {STRINGS.hub.newIssue}
        </button>
      </div>

      {creating && (
        <div className="gq-hub-form">
          <label className="gq-small" htmlFor="hub-issue-title">{STRINGS.hub.issueTitleLabel}</label>
          <input id="hub-issue-title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid={TID.hubNewIssueTitle} />
          <label className="gq-small" htmlFor="hub-issue-body">{STRINGS.hub.issueBodyLabel}</label>
          <textarea id="hub-issue-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} data-testid={TID.hubNewIssueBody} />
          <button type="button" className="gq-btn gq-btn-sm gq-btn-primary" onClick={submit} data-testid={TID.hubNewIssueSubmit}>
            {STRINGS.hub.createIssue}
          </button>
        </div>
      )}

      {repo.issues.length === 0 ? (
        <p className="gq-muted gq-small">{STRINGS.hub.issuesEmpty}</p>
      ) : (
        <ul className="gq-hub-rows">
          {[...repo.issues].reverse().map((i) => (
            <li key={i.number} data-testid={TID.hubIssueRow(i.number)}>
              <button type="button" className="gq-hub-row" onClick={() => onOpen(i.number)}>
                <Icon name={i.state === 'open' ? 'issue' : 'check'} size={14} />
                <span className="gq-hub-row-title">{i.title}</span>
                <span className="gq-small gq-muted">#{i.number}</span>
                {i.labels.map((l) => <span key={l} className="gq-hub-chip">{l}</span>)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function IssueDetail({
  repo, number, viewer, session, onBack,
}: { repo: HostedRepo; number: number; viewer: string; session: GameSession; onBack: () => void }) {
  const issue: Issue | undefined = repo.issues.find((i) => i.number === number);
  const [draft, setDraft] = useState('');
  if (!issue) return <BackOnly onBack={onBack} />;

  const addComment = () => {
    if (!draft.trim()) return;
    session.hubAction({ type: 'commentIssue', repo: repo.id, number, body: draft.trim() });
    setDraft('');
  };

  return (
    <div className="gq-hub-detail">
      <button type="button" className="gq-btn gq-btn-sm" onClick={onBack} data-testid={TID.hubBack}>
        <Icon name="arrow-left" size={14} /> {STRINGS.hub.back}
      </button>

      <h3 data-testid={TID.hubIssueTitle}>{issue.title} <span className="gq-muted">#{issue.number}</span></h3>
      <div className="gq-hub-meta gq-small">
        <span className={`gq-hub-state gq-hub-state-${issue.state}`}>
          {issue.state === 'open' ? STRINGS.hub.issueStateOpen : STRINGS.hub.issueStateClosed}
        </span>
        {' '}{fmt(STRINGS.hub.issueOpenedBy, { n: issue.number, author: issue.author })}
      </div>

      {issue.body && <div className="gq-hub-comment" data-testid={TID.hubIssueBody}><pre>{issue.body}</pre></div>}

      {issue.comments.map((c) => (
        <div key={c.id} className="gq-hub-comment" data-testid={TID.hubIssueComment(c.id)}>
          <div className="gq-hub-comment-head gq-small"><strong>{c.author}</strong></div>
          <pre>{c.body}</pre>
        </div>
      ))}

      {issue.state === 'open' && (
        <div className="gq-hub-form">
          <textarea
            rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
            placeholder={STRINGS.hub.commentPlaceholder} aria-label={STRINGS.hub.commentPlaceholder}
            data-testid={TID.hubIssueCommentBox}
          />
          <div className="gq-hub-form-actions">
            <button type="button" className="gq-btn gq-btn-sm gq-btn-primary" onClick={addComment} data-testid={TID.hubIssueCommentSubmit}>
              {STRINGS.hub.comment}
            </button>
            <button
              type="button" className="gq-btn gq-btn-sm"
              onClick={() => session.hubAction({ type: 'closeIssue', repo: repo.id, number })}
              data-testid={TID.hubIssueClose}
            >
              {STRINGS.hub.closeIssue}
            </button>
          </div>
        </div>
      )}
      {viewer && issue.assignees.includes(viewer) && (
        <p className="gq-small gq-muted">Assigned to you.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pull requests
// ---------------------------------------------------------------------------

function PullList({ repo, onOpen, session }: { repo: HostedRepo; onOpen: (n: number) => void; session: GameSession }) {
  const branches = useMemo(() => branchNames(repo.repo), [repo.repo]);
  const [creating, setCreating] = useState(false);
  const other = branches.find((b) => b !== repo.defaultBranch) ?? repo.defaultBranch;
  const [head, setHead] = useState(other);
  const [base, setBase] = useState(repo.defaultBranch);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const submit = () => {
    if (!title.trim() || head === base) return;
    session.hubAction({ type: 'openPullRequest', repo: repo.id, head, base, title: title.trim(), body: body.trim() || undefined });
    setTitle(''); setBody(''); setCreating(false);
  };

  return (
    <div className="gq-hub-list">
      <div className="gq-hub-toolbar">
        <span className="gq-small gq-muted">
          {fmt(STRINGS.hub.openCount, { n: repo.pulls.filter((p) => p.state === 'open').length })}
        </span>
        <button type="button" className="gq-btn gq-btn-sm gq-btn-primary" onClick={() => setCreating(!creating)} data-testid={TID.hubNewPullButton}>
          {STRINGS.hub.newPull}
        </button>
      </div>

      {creating && (
        <div className="gq-hub-form">
          <label className="gq-small" htmlFor="hub-pull-head">{STRINGS.hub.pullHeadLabel}</label>
          <select id="hub-pull-head" value={head} onChange={(e) => setHead(e.target.value)} data-testid={TID.hubNewPullHead}>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <label className="gq-small" htmlFor="hub-pull-base">{STRINGS.hub.pullBaseLabel}</label>
          <select id="hub-pull-base" value={base} onChange={(e) => setBase(e.target.value)} data-testid={TID.hubNewPullBase}>
            {branches.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
          <label className="gq-small" htmlFor="hub-pull-title">{STRINGS.hub.issueTitleLabel}</label>
          <input id="hub-pull-title" value={title} onChange={(e) => setTitle(e.target.value)} data-testid={TID.hubNewPullTitle} />
          <label className="gq-small" htmlFor="hub-pull-body">{STRINGS.hub.issueBodyLabel}</label>
          <textarea id="hub-pull-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} data-testid={TID.hubNewPullBody} />
          <button type="button" className="gq-btn gq-btn-sm gq-btn-primary" onClick={submit} data-testid={TID.hubNewPullSubmit}>
            {STRINGS.hub.createPull}
          </button>
        </div>
      )}

      {repo.pulls.length === 0 ? (
        <p className="gq-muted gq-small">{STRINGS.hub.pullsEmpty}</p>
      ) : (
        <ul className="gq-hub-rows">
          {[...repo.pulls].reverse().map((p) => (
            <li key={p.number} data-testid={TID.hubPullRow(p.number)}>
              <button type="button" className="gq-hub-row" onClick={() => onOpen(p.number)}>
                <Icon name="pr" size={14} />
                <span className="gq-hub-row-title">{p.title}</span>
                <span className="gq-small gq-muted">#{p.number}</span>
                <span className={`gq-hub-state gq-hub-state-${p.state}`}>{pullStateLabel(p.state)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function pullStateLabel(state: PullRequest['state']): string {
  if (state === 'merged') return STRINGS.hub.pullStateMerged;
  if (state === 'closed') return STRINGS.hub.pullStateClosed;
  return STRINGS.hub.pullStateOpen;
}

function PullDetail({
  repo, number, viewer, session, onBack,
}: { repo: HostedRepo; number: number; viewer: string; session: GameSession; onBack: () => void }) {
  const pr = repo.pulls.find((p) => p.number === number);
  const [tab, setTab] = useState<'conversation' | 'files'>('conversation');
  const [draft, setDraft] = useState('');
  const [replies, setReplies] = useState<Record<number, string>>({});
  if (!pr) return <BackOnly onBack={onBack} />;

  const headSha = pr.state === 'open' ? repo.repo.refs[`refs/heads/${pr.head.branch}`] : pr.headSha;
  const baseSha = repo.repo.refs[`refs/heads/${pr.base}`];
  const headBranchGone = !repo.repo.refs[`refs/heads/${pr.head.branch}`];

  const addComment = () => {
    if (!draft.trim()) return;
    session.hubAction({ type: 'commentPullRequest', repo: repo.id, number, body: draft.trim() });
    setDraft('');
  };

  const sendReply = (commentId: number) => {
    const text = (replies[commentId] ?? '').trim();
    if (!text) return;
    session.hubAction({ type: 'replyReviewComment', repo: repo.id, number, commentId, body: text });
    setReplies((r) => ({ ...r, [commentId]: '' }));
  };

  return (
    <div className="gq-hub-detail">
      <button type="button" className="gq-btn gq-btn-sm" onClick={onBack} data-testid={TID.hubBack}>
        <Icon name="arrow-left" size={14} /> {STRINGS.hub.back}
      </button>

      <h3 data-testid={TID.hubPullTitle}>{pr.title} <span className="gq-muted">#{pr.number}</span></h3>
      <div className="gq-hub-meta gq-small">
        <span className={`gq-hub-state gq-hub-state-${pr.state}`} data-testid={TID.hubPullState} data-state={pr.state}>
          {pullStateLabel(pr.state)}
        </span>
        {' '}<code>{fmt(STRINGS.hub.pullWants, { head: pr.head.branch, base: pr.base })}</code>
        <span className="gq-muted"> — {pr.author}</span>
      </div>

      <nav className="gq-hub-subnav" role="tablist">
        <button
          type="button" role="tab" aria-selected={tab === 'conversation'} className="gq-hub-tab"
          onClick={() => setTab('conversation')} data-testid={TID.hubPullTabConversation}
        >
          {STRINGS.hub.tabConversation}
        </button>
        <button
          type="button" role="tab" aria-selected={tab === 'files'} className="gq-hub-tab"
          onClick={() => setTab('files')} data-testid={TID.hubPullTabFiles}
        >
          {STRINGS.hub.tabFiles}
        </button>
      </nav>

      {tab === 'files' ? (
        <PullDiff repo={repo.repo} baseSha={baseSha} headSha={headSha} reviewComments={pr.reviewComments} />
      ) : (
        <>
          {pr.body && <div className="gq-hub-comment"><pre>{pr.body}</pre></div>}

          {pr.reviews.map((r) => (
            <div key={r.id} className={`gq-hub-review gq-hub-review-${r.state.toLowerCase()}`} data-testid={TID.hubReview(r.id)}>
              <div className="gq-hub-comment-head gq-small">
                <Icon name={r.state === 'APPROVED' ? 'check' : r.state === 'CHANGES_REQUESTED' ? 'alert' : 'comment'} size={14} />
                {' '}<strong>{r.author}</strong>{' '}
                {r.state === 'APPROVED' ? STRINGS.hub.reviewApproved
                  : r.state === 'CHANGES_REQUESTED' ? STRINGS.hub.reviewChangesRequested
                  : STRINGS.hub.reviewCommented}
              </div>
              {r.body && <pre>{r.body}</pre>}
            </div>
          ))}

          {pr.reviewComments.filter((c) => c.inReplyTo === undefined).map((c) => (
            <div key={c.id} className="gq-hub-comment gq-hub-review-comment" data-testid={TID.hubReviewComment(c.id)}>
              <div className="gq-hub-comment-head gq-small">
                <strong>{c.author}</strong>{' '}
                <span className="gq-muted">{fmt(STRINGS.hub.reviewOn, { path: c.path, line: c.line })}</span>
              </div>
              <pre>{c.body}</pre>
              {pr.reviewComments.filter((r) => r.inReplyTo === c.id).map((r) => (
                <div key={r.id} className="gq-hub-reply" data-testid={TID.hubReviewComment(r.id)}>
                  <div className="gq-hub-comment-head gq-small"><strong>{r.author}</strong></div>
                  <pre>{r.body}</pre>
                </div>
              ))}
              {pr.state === 'open' && (
                <div className="gq-hub-form">
                  <textarea
                    rows={2} value={replies[c.id] ?? ''}
                    onChange={(e) => setReplies((m) => ({ ...m, [c.id]: e.target.value }))}
                    placeholder={STRINGS.hub.replyPlaceholder} aria-label={STRINGS.hub.replyPlaceholder}
                    data-testid={TID.hubReviewReplyBox(c.id)}
                  />
                  <button
                    type="button" className="gq-btn gq-btn-sm" onClick={() => sendReply(c.id)}
                    data-testid={TID.hubReviewReplySubmit(c.id)}
                  >
                    {STRINGS.hub.reply}
                  </button>
                </div>
              )}
            </div>
          ))}

          {pr.comments.map((c) => (
            <div key={c.id} className="gq-hub-comment">
              <div className="gq-hub-comment-head gq-small"><strong>{c.author}</strong></div>
              <pre>{c.body}</pre>
            </div>
          ))}

          {pr.state === 'open' && (
            <div className="gq-hub-form">
              <textarea
                rows={3} value={draft} onChange={(e) => setDraft(e.target.value)}
                placeholder={STRINGS.hub.commentPlaceholder} aria-label={STRINGS.hub.commentPlaceholder}
                data-testid={TID.hubPullCommentBox}
              />
              <button type="button" className="gq-btn gq-btn-sm" onClick={addComment} data-testid={TID.hubPullCommentSubmit}>
                {STRINGS.hub.comment}
              </button>
            </div>
          )}

          <div className="gq-hub-merge">
            {pr.state === 'merged' ? (
              <>
                <p className="gq-small">{fmt(STRINGS.hub.mergedBy, { author: pr.merged?.by ?? pr.author })}</p>
                {headBranchGone ? (
                  <p className="gq-small gq-muted">{STRINGS.hub.branchDeleted}</p>
                ) : (
                  <button
                    type="button" className="gq-btn gq-btn-sm"
                    onClick={() => session.hubAction({ type: 'deleteBranch', repo: repo.id, branch: pr.head.branch })}
                    data-testid={TID.hubDeleteBranchButton}
                  >
                    {STRINGS.hub.deleteBranch}
                  </button>
                )}
              </>
            ) : pr.state === 'closed' ? (
              <p className="gq-small gq-muted">{STRINGS.hub.mergeBlockedClosed}</p>
            ) : (
              <>
                <button
                  type="button" className="gq-btn gq-btn-primary" data-testid={TID.hubMergeButton}
                  onClick={() => session.hubAction({ type: 'mergePullRequest', repo: repo.id, number, method: 'merge' })}
                >
                  <Icon name="merge" size={14} /> {STRINGS.hub.merge}
                </button>
                <p className="gq-small gq-muted">{fmt(STRINGS.hub.mergeNote, { base: pr.base })}</p>
                <p className="gq-small gq-muted">{STRINGS.hub.squashNote}</p>
              </>
            )}
          </div>
        </>
      )}
      {viewer === pr.author && pr.state === 'open' && (
        <p className="gq-small gq-muted">This is your pull request.</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// PR diff ("Files changed")
// ---------------------------------------------------------------------------

interface DiffLine {
  kind: ' ' | '+' | '-';
  text: string;
  /** Line number in the new file, for anchoring review comments. */
  newLine: number | null;
}

function buildDiffLines(before: string, after: string): DiffLine[] {
  const a = splitRecords(before);
  const b = splitRecords(after);
  const { changes } = diffTexts(before, after);
  const out: DiffLine[] = [];
  let ai = 0;
  let bi = 0;
  for (const ch of changes) {
    while (ai < ch.i1) {
      out.push({ kind: ' ', text: a[ai], newLine: bi + 1 });
      ai++; bi++;
    }
    for (let k = 0; k < ch.chg1; k++) {
      out.push({ kind: '-', text: a[ai], newLine: null });
      ai++;
    }
    for (let k = 0; k < ch.chg2; k++) {
      out.push({ kind: '+', text: b[bi], newLine: bi + 1 });
      bi++;
    }
  }
  while (ai < a.length) {
    out.push({ kind: ' ', text: a[ai], newLine: bi + 1 });
    ai++; bi++;
  }
  return out;
}

function PullDiff({
  repo, baseSha, headSha, reviewComments,
}: {
  repo: RepoState;
  baseSha: string | undefined;
  headSha: string | undefined;
  reviewComments: PullRequest['reviewComments'];
}) {
  const files = useMemo(() => {
    if (!headSha) return [];
    const after = readCommitFiles(repo, headSha);
    const before = baseSha ? readCommitFiles(repo, baseSha) : {};
    const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
    return paths
      .filter((p) => (before[p] ?? '') !== (after[p] ?? ''))
      .map((p) => ({ path: p, lines: buildDiffLines(before[p] ?? '', after[p] ?? '') }));
  }, [repo, baseSha, headSha]);

  if (files.length === 0) return <p className="gq-muted gq-small">{STRINGS.hub.noDiff}</p>;

  return (
    <div className="gq-hub-diff">
      <p className="gq-small gq-muted">{fmt(STRINGS.hub.filesChangedCount, { n: files.length })}</p>
      {files.map((f) => (
        <div key={f.path} className="gq-hub-diff-file" data-testid={TID.hubPullDiff(f.path)}>
          <div className="gq-hub-diff-head">{f.path}</div>
          <table className="gq-hub-diff-table">
            <tbody>
              {f.lines.map((l, i) => {
                const anchored = l.newLine === null
                  ? []
                  : reviewComments.filter((c) => c.path === f.path && c.line === l.newLine && c.inReplyTo === undefined);
                return (
                  <tr key={i} className={`gq-diff-${l.kind === '+' ? 'add' : l.kind === '-' ? 'del' : 'ctx'}`}>
                    <td className="gq-hub-diff-num">{l.newLine ?? ''}</td>
                    <td className="gq-hub-diff-sign">{l.kind}</td>
                    <td className="gq-hub-diff-text">
                      <span>{l.text.replace(/\n$/, '')}</span>
                      {anchored.map((c) => (
                        <div key={c.id} className="gq-hub-inline-comment" data-testid={TID.hubReviewComment(c.id)}>
                          <strong>{c.author}</strong> {c.body}
                        </div>
                      ))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}

function BackOnly({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="gq-btn gq-btn-sm" onClick={onBack} data-testid={TID.hubBack}>
      <Icon name="arrow-left" size={14} /> {STRINGS.hub.back}
    </button>
  );
}
