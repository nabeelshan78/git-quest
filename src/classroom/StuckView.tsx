/**
 * "Where the class is stuck": per-level completion, time, hint and error
 * statistics, with the levels that most needed hint 3 listed first.
 */
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { stuckLevels } from './aggregate';
import type { LevelSortKey, LevelStat, SortState } from './aggregate';
import { formatDecimal, formatDuration, formatPercent } from './format';
import { SortHeader } from './SortHeader';
import { DASH_TID } from './testids';
import type { Translate } from './progressFile';

interface StuckViewProps {
  /** Statistics for every level, already sorted for the table. */
  stats: LevelStat[];
  sort: SortState<LevelSortKey>;
  onSort: (key: LevelSortKey) => void;
  showUnstarted: boolean;
  onShowUnstartedChange: (value: boolean) => void;
  translate: Translate;
}

function Meter({ rate, label }: { rate: number | null; label: string }) {
  const width = rate === null ? 0 : Math.round(Math.max(0, Math.min(1, rate)) * 100);
  return (
    <span className="gqd-meter-cell">
      <span className="gqd-num">{label}</span>
      <span className="gqd-meter" aria-hidden="true">
        <span className="gqd-meter-fill" style={{ width: `${width}%` }} />
      </span>
    </span>
  );
}

export function StuckView({ stats, sort, onSort, showUnstarted, onShowUnstartedChange, translate }: StuckViewProps) {
  const { t } = useTranslation('classroom');
  const checkboxId = useId();
  const worst = stuckLevels(stats, 5);
  const flagged = stats.filter((s) => s.highHintUse).length;
  const rows = showUnstarted ? stats : stats.filter((s) => s.started > 0);
  const header = (key: LevelSortKey, label: string, className?: string) => (
    <SortHeader sortKey={key} label={label} sort={sort} onSort={onSort} className={className} />
  );

  return (
    <div className="gqd-stuck">
      <section aria-labelledby="gqd-attention-title" className="gqd-card">
        <h3 id="gqd-attention-title">{t('stuck.attentionTitle')}</h3>
        <p className="gqd-muted">{t('stuck.attentionIntro')}</p>
        {worst.length === 0 ? (
          <p>{t('stuck.noHintData')}</p>
        ) : (
          <ol className="gqd-attention" data-testid={DASH_TID.stuckList}>
            {worst.map((s) => (
              <li key={s.levelId}>
                {t('stuck.sentence', { percent: Math.round((s.hint3Rate ?? 0) * 100), level: s.levelId, title: s.title })}{' '}
                <span className="gqd-muted">{t('stuck.sentenceDetail', { count: s.hint3, started: s.started })}</span>
                {s.highHintUse && (
                  <span className="gqd-badge gqd-badge-critical">
                    <span aria-hidden="true">⚠ </span>
                    {t('stuck.highHintUse')}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
        {flagged > 0 && <p>{t('stuck.flaggedSummary', { count: flagged })}</p>}
      </section>

      <div className="gqd-toolbar">
        <input
          id={checkboxId}
          type="checkbox"
          checked={showUnstarted}
          data-testid={DASH_TID.showUnstarted}
          onChange={(e) => onShowUnstartedChange(e.target.checked)}
        />
        <label htmlFor={checkboxId}>{t('stuck.showUnstarted')}</label>
      </div>

      <div className="gqd-table-wrap" role="region" aria-labelledby="gqd-levels-caption" tabIndex={0}>
        <table className="gqd-table" data-testid={DASH_TID.levelTable}>
          <caption id="gqd-levels-caption">
            {t('stuck.caption', { count: rows.length })} <span className="gqd-muted">{t('stuck.captionHelp')}</span>
          </caption>
          <thead>
            <tr>
              {header('level', t('stuck.level'))}
              <th scope="col" className="gqd-numcol">
                {t('stuck.started')}
              </th>
              {header('completed', t('stuck.completed'))}
              {header('median', t('stuck.medianTime'), 'gqd-numcol')}
              {header('hint3', t('stuck.hint3'))}
              {header('attempts', t('stuck.avgAttempts'), 'gqd-numcol')}
              {header('errors', t('stuck.errors'))}
              <th scope="col">{t('stuck.flag')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8}>{t('stuck.noRows')}</td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.levelId} data-testid={DASH_TID.levelRow(s.levelId)} className={s.highHintUse ? 'gqd-row-flagged' : undefined}>
                <th scope="row">
                  <span className="gqd-level-id">{s.levelId}</span> {s.title}
                  {s.boss && <span className="gqd-tag">{t('stuck.bossTag')}</span>}
                </th>
                <td className="gqd-numcol">{t('table.outOf', { value: s.started, total: s.students })}</td>
                <td>
                  <Meter rate={s.completedRate} label={formatPercent(s.completedRate, translate)} />
                </td>
                <td className="gqd-numcol">{formatDuration(s.medianTimeSec, translate)}</td>
                <td>
                  <Meter rate={s.hint3Rate} label={formatPercent(s.hint3Rate, translate)} />
                </td>
                <td className="gqd-numcol">{formatDecimal(s.avgAttempts, translate)}</td>
                <td>
                  {s.topErrors.length === 0 ? (
                    <span className="gqd-muted">{t('format.none')}</span>
                  ) : (
                    <ul className="gqd-errors">
                      {s.topErrors.map((e) => (
                        <li key={e.code}>
                          <code>{e.code}</code> {t('stuck.errorTimes', { count: e.count })}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  {s.highHintUse ? (
                    <span className="gqd-badge gqd-badge-critical">
                      <span aria-hidden="true">⚠ </span>
                      {t('stuck.highHintUse')}
                    </span>
                  ) : (
                    <span className="gqd-muted">{t('format.none')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
