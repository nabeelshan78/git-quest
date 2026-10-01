/**
 * The class table: one row per student, sortable columns.
 */
import { useTranslation } from 'react-i18next';
import type { Curriculum, SortState, StudentSortKey, StudentSummary } from './aggregate';
import { formatDateTime, formatDuration } from './format';
import { SortHeader } from './SortHeader';
import { DASH_TID } from './testids';
import type { Translate } from './progressFile';

interface StudentTableProps {
  summaries: StudentSummary[];
  curriculum: Curriculum;
  sort: SortState<StudentSortKey>;
  onSort: (key: StudentSortKey) => void;
  onOpen: (id: string, opener: HTMLElement) => void;
  translate: Translate;
}

export function ChecksumBadge({ status }: { status: StudentSummary['checksum'] }) {
  const { t } = useTranslation('classroom');
  if (status === 'ok') {
    return (
      <span className="gqd-badge gqd-badge-good">
        <span aria-hidden="true">✓ </span>
        {t('checksum.ok')}
      </span>
    );
  }
  return (
    <span className={status === 'mismatch' ? 'gqd-badge gqd-badge-critical' : 'gqd-badge gqd-badge-warning'} title={t(`checksum.${status}Help`)}>
      <span aria-hidden="true">⚠ </span>
      {t(`checksum.${status}`)}
    </span>
  );
}

export function chapterLabel(summary: StudentSummary, curriculum: Curriculum, t: Translate): string {
  if (summary.finished) return t('classroom:table.finished');
  if (summary.currentChapter === null) return t('classroom:table.notStarted');
  const ch = curriculum.chapters.find((c) => c.number === summary.currentChapter);
  return t('classroom:table.chapterShort', { number: summary.currentChapter, title: ch?.title ?? '' });
}

function BossMarks({ summary }: { summary: StudentSummary }) {
  const { t } = useTranslation('classroom');
  const done = summary.bosses.filter((b) => b.completed).map((b) => b.chapter);
  const description =
    done.length === 0 ? t('table.bossesNone') : t('table.bossesDone', { chapters: done.join(', '), count: done.length });
  return (
    <div className="gqd-bosses">
      <span className="gqd-num">
        {t('table.outOf', { value: summary.bossesCompleted, total: summary.bosses.length })}
      </span>
      <span className="gqd-boss-marks" aria-hidden="true">
        {summary.bosses.map((b) => (
          <span
            key={b.levelId}
            className={b.completed ? 'gqd-boss gqd-boss-done' : 'gqd-boss'}
            title={t(b.completed ? 'table.bossDoneTitle' : 'table.bossNotDoneTitle', { chapter: b.chapter, level: b.levelId })}
          >
            {b.chapter}
            {b.completed ? '✓' : '·'}
          </span>
        ))}
      </span>
      <span className="gqd-sr-only">{description}</span>
    </div>
  );
}

export function StudentTable({ summaries, curriculum, sort, onSort, onOpen, translate }: StudentTableProps) {
  const { t, i18n } = useTranslation('classroom');
  const header = (key: StudentSortKey, label: string, className?: string) => (
    <SortHeader sortKey={key} label={label} sort={sort} onSort={onSort} className={className} />
  );
  return (
    <div className="gqd-table-wrap" role="region" aria-labelledby="gqd-students-caption" tabIndex={0}>
      <table className="gqd-table" data-testid={DASH_TID.studentTable}>
        <caption id="gqd-students-caption">
          {t('table.caption', { count: summaries.length })} <span className="gqd-muted">{t('table.sortHint')}</span>
        </caption>
        <thead>
          <tr>
            {header('name', t('table.name'))}
            {header('classCode', t('table.classCode'))}
            {header('levels', t('table.levels'), 'gqd-numcol')}
            {header('stars', t('table.stars'), 'gqd-numcol')}
            {header('bosses', t('table.bosses'))}
            {header('chapter', t('table.chapter'))}
            {header('time', t('table.time'), 'gqd-numcol')}
            {header('hints', t('table.hints'), 'gqd-numcol')}
            {header('lastPlayed', t('table.lastPlayed'))}
            {header('checksum', t('table.checksum'))}
          </tr>
        </thead>
        <tbody>
          {summaries.map((s) => (
            <tr key={s.id} data-testid={DASH_TID.studentRow(s.id)}>
              <th scope="row">
                <button type="button" className="gqd-link" onClick={(e) => onOpen(s.id, e.currentTarget)}>
                  {s.displayName}
                </button>
                {s.sample && <span className="gqd-tag">{t('table.demoTag')}</span>}
              </th>
              <td>{s.classCode || <span className="gqd-muted">{t('table.noClassCode')}</span>}</td>
              <td className="gqd-numcol">{t('table.outOf', { value: s.levelsCompleted, total: curriculum.totalLevels })}</td>
              <td className="gqd-numcol">{s.totalStars}</td>
              <td>
                <BossMarks summary={s} />
              </td>
              <td>{chapterLabel(s, curriculum, translate)}</td>
              <td className="gqd-numcol">{formatDuration(s.totalTimeSec, translate)}</td>
              <td className="gqd-numcol">
                {s.hintsUsed}
                {s.hint3Levels > 0 && <span className="gqd-muted"> {t('table.hint3Levels', { count: s.hint3Levels })}</span>}
              </td>
              <td>{formatDateTime(s.lastPlayedAt, i18n.language, translate)}</td>
              <td>
                <ChecksumBadge status={s.checksum} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
