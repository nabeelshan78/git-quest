/**
 * Side sheet with everything about one commit: message, author, short and
 * full id, parents and the complete snapshot of files at that commit (a
 * commit is a full snapshot, not a list of changes).
 */
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getCommit, readCommitFiles, shortHash, subjectOf } from '../../engine/core/objects';
import type { RepoState } from '../../shared/types';
import { TID } from '../../shared/testids';
import { Modal } from '../components/Modal';
import { Icon } from '../components/Icon';

export interface CommitSheetProps {
  repo: RepoState;
  commitId: string;
  /** Where the repo lives, e.g. "Your laptop" or "GitHub (remote)". */
  where: string;
  onClose: () => void;
  onSelect: (id: string) => void;
}

export function formatCommitDate(timestamp: number, language: string): string {
  try {
    return new Intl.DateTimeFormat(language, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(new Date(timestamp * 1000));
  } catch {
    return new Date(timestamp * 1000).toISOString();
  }
}

export function CommitSheet({ repo, commitId, where, onClose, onSelect }: CommitSheetProps) {
  const { t, i18n } = useTranslation('world');
  const commit = getCommit(repo, commitId);
  const files = useMemo(() => (commit ? readCommitFiles(repo, commitId) : {}), [repo, commitId, commit]);
  const branches = Object.entries(repo.refs)
    .filter(([ref, h]) => h === commitId && (ref.startsWith('refs/heads/') || ref.startsWith('refs/remotes/') || ref.startsWith('refs/tags/')))
    .map(([ref]) => ref.replace(/^refs\/(heads|remotes|tags)\//, ''));

  if (!commit) {
    return (
      <Modal title={t('sheet.missingTitle')} onEscape={onClose} placement="side" testId={TID.commitSheet}>
        <p>{t('sheet.missing')}</p>
        <button type="button" className="gq-btn" onClick={onClose} data-testid={TID.commitSheetClose}>
          {t('common:close')}
        </button>
      </Modal>
    );
  }
  const paths = Object.keys(files).sort();
  const body = commit.message.replace(/\n+$/, '');
  return (
    <Modal title={subjectOf(commit.message) || t('sheet.noMessage')} onEscape={onClose} placement="side" testId={TID.commitSheet} dataAttrs={{ 'data-commit': commitId }}>
      <button type="button" className="gq-icon-btn gq-sheet-close" onClick={onClose} aria-label={t('common:close')} data-testid={TID.commitSheetClose}>
        <Icon name="close" />
      </button>
      <p className="gq-muted">{t('sheet.where', { where })}</p>
      <dl className="gq-facts">
        <dt>{t('sheet.shortId')}</dt>
        <dd>
          <code>{shortHash(commitId)}</code>
        </dd>
        <dt>{t('sheet.fullId')}</dt>
        <dd>
          <code className="gq-break">{commitId}</code>
        </dd>
        <dt>{t('sheet.author')}</dt>
        <dd>
          {commit.author.name} &lt;{commit.author.email}&gt;
        </dd>
        <dt>{t('sheet.date')}</dt>
        <dd>{formatCommitDate(commit.author.timestamp, i18n.language)}</dd>
        <dt>{t('sheet.parents')}</dt>
        <dd>
          {commit.parents.length === 0 ? (
            t('sheet.noParents')
          ) : (
            <ul className="gq-inline-list">
              {commit.parents.map((p) => (
                <li key={p}>
                  <button type="button" className="gq-link-btn" onClick={() => onSelect(p)}>
                    <code>{shortHash(p)}</code>
                    {getCommit(repo, p) ? ` ${subjectOf(getCommit(repo, p)!.message)}` : ''}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {commit.parents.length > 1 && <p className="gq-muted gq-small">{t('sheet.mergeNote')}</p>}
        </dd>
        {branches.length > 0 && (
          <>
            <dt>{t('sheet.labels')}</dt>
            <dd>{branches.join(', ')}</dd>
          </>
        )}
      </dl>
      {body.includes('\n') && (
        <>
          <h3 className="gq-sheet-h">{t('sheet.message')}</h3>
          <pre className="gq-pre">{body}</pre>
        </>
      )}
      <h3 className="gq-sheet-h">{t('sheet.snapshot', { count: paths.length })}</h3>
      <p className="gq-muted gq-small">{t('sheet.snapshotNote')}</p>
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
