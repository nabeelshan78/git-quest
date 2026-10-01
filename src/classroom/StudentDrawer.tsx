/**
 * Per-student detail drawer: every level with stars, time, hints and errors.
 * A modal dialog: focus moves inside, Tab stays inside, Escape closes.
 */
import { useEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { studentLevelRows, summarizeStudent } from './aggregate';
import type { Curriculum, StudentRecord } from './aggregate';
import { formatDateTime, formatDuration } from './format';
import type { Translate } from './progressFile';
import { ChecksumBadge, chapterLabel } from './StudentTable';
import { DASH_TID } from './testids';

interface StudentDrawerProps {
  record: StudentRecord;
  curriculum: Curriculum;
  onClose: () => void;
  onRemove: (id: string) => void;
  translate: Translate;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function Stars({ stars }: { stars: number }) {
  const { t } = useTranslation('classroom');
  return (
    <span className="gqd-stars">
      <span aria-hidden="true">{'★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars))}</span>
      <span className="gqd-sr-only">{t('drawer.starsText', { count: stars })}</span>
    </span>
  );
}

export function StudentDrawer({ record, curriculum, onClose, onRemove, translate }: StudentDrawerProps) {
  const { t, i18n } = useTranslation('classroom');
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const summary = summarizeStudent(record, curriculum);
  const rows = studentLevelRows(record, curriculum);
  const titleId = `gqd-drawer-title-${record.id}`;

  useEffect(() => {
    closeRef.current?.focus();
  }, [record.id]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const player = record.file.player;
  const facts: [string, string][] = [
    [t('drawer.levels'), t('table.outOf', { value: summary.levelsCompleted, total: curriculum.totalLevels })],
    [t('drawer.stars'), t('table.outOf', { value: summary.totalStars, total: curriculum.maxStars })],
    [t('drawer.bosses'), t('table.outOf', { value: summary.bossesCompleted, total: summary.bosses.length })],
    [t('drawer.chapter'), chapterLabel(summary, curriculum, translate)],
    [t('drawer.time'), formatDuration(summary.totalTimeSec, translate)],
    [t('drawer.hints'), t('drawer.hintsValue', { hints: summary.hintsUsed, count: summary.hint3Levels })],
    [t('drawer.errors'), String(summary.errors)],
    [t('drawer.challenges'), t('table.outOf', { value: summary.challengesCompleted, total: summary.bosses.length })],
    [t('drawer.daily'), t('drawer.dailyValue', { streak: summary.dailyStreak, count: summary.dailyDays })],
    [t('drawer.sandbox'), formatDuration(summary.sandboxMinutes * 60, translate)],
    [t('drawer.lastPlayed'), formatDateTime(summary.lastPlayedAt, i18n.language, translate)],
    [t('drawer.exportedAt'), formatDateTime(summary.exportedAt, i18n.language, translate)],
    [t('drawer.source'), summary.sourceName || t('format.none')],
  ];

  return (
    <div className="gqd-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className="gqd-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-testid={DASH_TID.drawer}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="gqd-drawer-head">
          <div>
            <h2 id={titleId}>{summary.displayName}</h2>
            <p className="gqd-muted">
              {t('drawer.subtitle', { handle: player.handle, classCode: player.classCode || t('table.noClassCode') })}
            </p>
          </div>
          <button ref={closeRef} type="button" className="gqd-button" data-testid={DASH_TID.drawerClose} onClick={onClose}>
            {t('drawer.close')}
          </button>
        </header>

        <div className="gqd-drawer-body">
          <p>
            <ChecksumBadge status={summary.checksum} /> <span className="gqd-muted">{t(`checksum.${summary.checksum}Help`)}</span>
          </p>
          <dl className="gqd-facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>

          {curriculum.chapters.map((ch) => {
            const chRows = rows.filter((r) => r.level.chapter === ch.number);
            const done = chRows.filter((r) => r.status === 'completed').length;
            return (
              <table key={ch.number} className="gqd-table gqd-table-compact">
                <caption>{t('drawer.chapterCaption', { number: ch.number, title: ch.title, done, total: chRows.length })}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t('drawer.level')}</th>
                    <th scope="col">{t('drawer.status')}</th>
                    <th scope="col">{t('drawer.stars')}</th>
                    <th scope="col" className="gqd-numcol">
                      {t('drawer.time')}
                    </th>
                    <th scope="col" className="gqd-numcol">
                      {t('drawer.attempts')}
                    </th>
                    <th scope="col">{t('drawer.hints')}</th>
                    <th scope="col">{t('drawer.errors')}</th>
                    <th scope="col">{t('drawer.challenge')}</th>
                  </tr>
                </thead>
                <tbody>
                  {chRows.map(({ level, progress, status }) => {
                    const codes = progress ? Object.entries(progress.errorCodes).sort((a, b) => b[1] - a[1]) : [];
                    return (
                      <tr key={level.id}>
                        <th scope="row">
                          <span className="gqd-level-id">{level.id}</span> {level.title}
                          {level.boss && <span className="gqd-tag">{t('stuck.bossTag')}</span>}
                        </th>
                        <td>
                          <span className={`gqd-status gqd-status-${status}`}>{t(`drawer.status_${status}`)}</span>
                        </td>
                        <td>{progress?.completed ? <Stars stars={progress.stars} /> : <span className="gqd-muted">{t('format.none')}</span>}</td>
                        <td className="gqd-numcol">{progress ? formatDuration(progress.timeSpentSec, translate) : t('format.none')}</td>
                        <td className="gqd-numcol">{progress ? progress.attempts : t('format.none')}</td>
                        <td>
                          {progress
                            ? t('drawer.hintCell', { hints: progress.hintsUsed, tier: progress.maxHintTier })
                            : t('format.none')}
                        </td>
                        <td>
                          {progress && progress.errors > 0 ? (
                            <>
                              {progress.errors}{' '}
                              {codes.length > 0 && (
                                <span className="gqd-muted">
                                  ({codes.slice(0, 3).map(([code, n]) => `${code} ×${n}`).join(', ')})
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="gqd-muted">{progress ? '0' : t('format.none')}</span>
                          )}
                        </td>
                        <td>
                          {progress?.challenge
                            ? progress.challenge.completed
                              ? t('drawer.challengeDone', { time: formatDuration(progress.challenge.bestTimeSec, translate) })
                              : t('drawer.challengeTried')
                            : <span className="gqd-muted">{t('format.none')}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            );
          })}

          <p>
            <button type="button" className="gqd-button gqd-button-danger" data-testid={DASH_TID.drawerRemove} onClick={() => onRemove(record.id)}>
              {t('drawer.remove')}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
