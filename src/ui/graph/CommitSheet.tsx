/**
 * Side sheet with everything about one commit: message, author, short and
 * full id, parents and the complete snapshot of files at that commit (a
 * commit is a full snapshot, not a list of changes).
 */
import { useMemo } from 'react';
import { getCommit, readCommitFiles, shortHash, subjectOf } from '../../engine/core/objects';
import type { RepoState } from '../../shared/types';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';

export interface CommitSheetProps {
  repo: RepoState;
  commitId: string;
  /** Where the repo lives, e.g. "your laptop" or "lantern-labs/festival-site". */
  where: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function formatCommitDate(timestamp: number): string {
  try {
    return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(timestamp * 1000));
  } catch {
    return new Date(timestamp * 1000).toISOString();
  }
}

/** Branch, remote-tracking and tag names pointing exactly at a commit. */
export function labelsAt(repo: RepoState, commitId: string): string[] {
  return Object.entries(repo.refs)
    .filter(([ref, h]) => h === commitId && (ref.startsWith('refs/heads/') || ref.startsWith('refs/remotes/') || ref.startsWith('refs/tags/')))
    .map(([ref]) => ref.replace(/^refs\/(heads|remotes|tags)\//, ''))
    .sort();
}

export function CommitSheet({ repo, commitId, where, onClose, onSelect }: CommitSheetProps) {
  const S = STRINGS.sheet;
  const commit = getCommit(repo, commitId);
  const files = useMemo(() => (commit ? readCommitFiles(repo, commitId) : {}), [repo, commitId, commit]);
  const labels = labelsAt(repo, commitId);

  const closeButton = (
    <button type="button" className="gq-icon-btn gq-sheet-close" onClick={onClose} aria-label={STRINGS.common.close} data-testid={TID.commitSheetClose}>
      <Icon name="close" />
    </button>
  );

  if (!commit) {
    return (
      <Modal title={S.missingTitle} onEscape={onClose} placement="side" testId={TID.commitSheet}>
        {closeButton}
        <p>{S.missing}</p>
      </Modal>
    );
  }
  const paths = Object.keys(files).sort();
  const body = commit.message.replace(/\n+$/, '');
  return (
    <Modal title={subjectOf(commit.message) || S.noMessage} onEscape={onClose} placement="side" testId={TID.commitSheet} dataAttrs={{ 'data-commit': commitId }}>
      {closeButton}
      <p className="gq-muted">{fmt(S.where, { where })}</p>
      <dl className="gq-facts">
        <dt>{S.shortId}</dt>
        <dd>
          <code>{shortHash(commitId)}</code>
        </dd>
        <dt>{S.fullId}</dt>
        <dd>
          <code className="gq-break">{commitId}</code>
        </dd>
        <dt>{S.author}</dt>
        <dd>
          {commit.author.name} &lt;{commit.author.email}&gt;
        </dd>
        <dt>{S.date}</dt>
        <dd>{formatCommitDate(commit.author.timestamp)}</dd>
        <dt>{S.parents}</dt>
        <dd>
          {commit.parents.length === 0 ? (
            S.noParents
          ) : (
            <ul className="gq-inline-list">
              {commit.parents.map((p) => {
                const parent = getCommit(repo, p);
                return (
                  <li key={p}>
                    <button type="button" className="gq-link-btn" onClick={() => onSelect(p)}>
                      <code>{shortHash(p)}</code>
                      {parent ? ` ${subjectOf(parent.message)}` : ''}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
          {commit.parents.length > 1 && <p className="gq-muted gq-small">{S.mergeNote}</p>}
        </dd>
        {labels.length > 0 && (
          <>
            <dt>{S.labels}</dt>
            <dd>{labels.join(', ')}</dd>
          </>
        )}
      </dl>
      {body.includes('\n') && (
        <>
          <h3 className="gq-sheet-h">{S.message}</h3>
          <pre className="gq-pre">{body}</pre>
        </>
      )}
      <h3 className="gq-sheet-h">{paths.length === 1 ? S.snapshotOne : fmt(S.snapshot, { count: paths.length })}</h3>
      <p className="gq-muted gq-small">{S.snapshotNote}</p>
      <ul className="gq-snapshot">
        {paths.map((p) => (
          <li key={p}>
            <details>
              <summary>
                <Icon name="file" size={14} /> {p}
              </summary>
              <pre className="gq-pre">{files[p]}</pre>
            </details>
          </li>
        ))}
      </ul>
    </Modal>
  );
}
