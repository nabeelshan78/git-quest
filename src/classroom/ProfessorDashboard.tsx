/**
 * Professor Dashboard page (#/professor).
 *
 * The professor imports many students' `.gitquest.json` files. Everything is
 * read and computed in this browser; nothing is uploaded. Shows the class
 * table, "where the class is stuck", a per-student drawer and CSV exports.
 */
import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { getChapters } from '../levels/content';
import type { ChaptersFile } from '../shared/level';
import { TID } from '../shared/testids';
import {
  ALL_CLASSES,
  buildCurriculum,
  classCodes,
  classOverview,
  defaultLevelDirection,
  defaultStudentDirection,
  filterRecords,
  levelSortValue,
  levelStats,
  nextSort,
  normalizeClassCode,
  sortBy,
  studentSortValue,
  summarizeStudent,
} from './aggregate';
import type { LevelSortKey, SortState, StudentSortKey } from './aggregate';
import { clearSavedClass, loadRememberPreference, loadSavedClass, saveClass, saveRememberPreference } from './classStorage';
import { classSummaryCsv, csvFileName, levelStatsCsv } from './csv';
import { dashboardReducer, initialDashboardData } from './dashboardState';
import type { ImportItem, ImportNotice } from './dashboardState';
import { downloadText } from './download';
import type { DownloadFn } from './download';
import { formatDecimal, localDate } from './format';
import { MAX_PROGRESS_FILE_BYTES, describeParseError, parseProgressFile } from './progressFile';
import type { Translate } from './progressFile';
import { generateSampleClass } from './sampleData';
import type { StorageLike } from './store';
import { StuckView } from './StuckView';
import { StudentDrawer } from './StudentDrawer';
import { StudentTable } from './StudentTable';
import { DASH_TID } from './testids';
import './dashboard.css';

export interface ProfessorDashboardProps {
  /** Where to remember the imported class. Default: window.localStorage; null disables it. */
  storage?: StorageLike | null;
  /** Curriculum (default: content/chapters.json). */
  chapters?: ChaptersFile;
  now?: () => Date;
  /** How files are saved (default: a browser download). */
  onDownload?: DownloadFn;
}

type Tab = 'students' | 'stuck';

function browserStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

const defaultNow = () => new Date();

async function readText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('read failed'));
    reader.readAsText(file);
  });
}

async function readImportItem(file: File): Promise<ImportItem> {
  if (file.size > MAX_PROGRESS_FILE_BYTES) return { sourceName: file.name, result: { ok: false, error: { code: 'tooLarge' } } };
  try {
    return { sourceName: file.name, result: parseProgressFile(await readText(file)) };
  } catch {
    return { sourceName: file.name, result: { ok: false, error: { code: 'unreadable' } } };
  }
}

function noticeText(notice: ImportNotice, t: Translate): string {
  switch (notice.kind) {
    case 'error':
      return describeParseError(notice.error, t);
    case 'sampleLoaded':
    case 'sampleRemoved':
      return t(`classroom:notice.${notice.kind}`, { count: notice.count });
    default:
      return t(`classroom:notice.${notice.kind}`, { name: notice.name });
  }
}

function noticeTone(notice: ImportNotice): 'good' | 'info' | 'warning' | 'critical' {
  switch (notice.kind) {
    case 'added':
    case 'replaced':
    case 'sampleLoaded':
      return 'good';
    case 'error':
      return 'critical';
    case 'checksum':
      return 'warning';
    default:
      return 'info';
  }
}

const TONE_ICON = { good: '✓', info: 'ℹ', warning: '⚠', critical: '✗' } as const;

export function ProfessorDashboard({ storage: storageProp, chapters, now = defaultNow, onDownload = downloadText }: ProfessorDashboardProps = {}) {
  const { t } = useTranslation('classroom');
  const translate = useCallback<Translate>((key, options) => String(t(key, options)), [t]);
  const storage = useMemo(() => (storageProp === undefined ? browserStorage() : storageProp), [storageProp]);
  const curriculum = useMemo(() => buildCurriculum(chapters ?? getChapters()), [chapters]);

  const [remember, setRemember] = useState(() => loadRememberPreference(storage));
  const [data, dispatch] = useReducer(dashboardReducer, storage, (s: StorageLike | null) =>
    initialDashboardData(loadRememberPreference(s) ? loadSavedClass(s) : []),
  );
  const [saveFailed, setSaveFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [classFilter, setClassFilter] = useState<string>(ALL_CLASSES);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('students');
  const [studentSort, setStudentSort] = useState<SortState<StudentSortKey>>({ key: 'name', direction: 'asc' });
  const [levelSort, setLevelSort] = useState<SortState<LevelSortKey>>({ key: 'level', direction: 'asc' });
  const [showUnstarted, setShowUnstarted] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const openerRef = useRef<HTMLElement | null>(null);

  const ids = {
    input: useId(),
    remember: useId(),
    classFilter: useId(),
    search: useId(),
  };

  useEffect(() => {
    if (!remember) {
      clearSavedClass(storage);
      setSaveFailed(false);
      return;
    }
    setSaveFailed(!saveClass(storage, data.records));
  }, [data.records, remember, storage]);

  const codes = useMemo(() => classCodes(data.records), [data.records]);
  const activeClass = classFilter === ALL_CLASSES || codes.includes(classFilter) ? classFilter : ALL_CLASSES;
  const filtered = useMemo(() => filterRecords(data.records, { classCode: activeClass, search }), [data.records, activeClass, search]);
  const summaries = useMemo(() => filtered.map((r) => summarizeStudent(r, curriculum)), [filtered, curriculum]);
  const sortedSummaries = useMemo(
    () => sortBy(summaries, (s) => studentSortValue(s, studentSort.key), studentSort.direction),
    [summaries, studentSort],
  );
  const stats = useMemo(() => levelStats(filtered, curriculum), [filtered, curriculum]);
  const sortedStats = useMemo(() => sortBy(stats, (s) => levelSortValue(s, levelSort.key), levelSort.direction), [stats, levelSort]);
  const overview = useMemo(() => classOverview(summaries), [summaries]);
  const hasSamples = data.records.some((r) => r.sample);
  const selected = selectedId ? data.records.find((r) => r.id === selectedId) ?? null : null;

  const importFiles = useCallback(async (list: FileList | File[] | null) => {
    const files = list ? Array.from(list) : [];
    if (files.length === 0) return;
    setBusy(true);
    try {
      const items = await Promise.all(files.map(readImportItem));
      dispatch({ type: 'import', items });
    } finally {
      setBusy(false);
    }
  }, []);

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    void importFiles(files);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragging(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    void importFiles(e.dataTransfer ? e.dataTransfer.files : null);
  };

  const loadSample = () => {
    const files = generateSampleClass(curriculum, { now: now() });
    const items: ImportItem[] = files.map((file) => ({ sourceName: t('sample.sourceName'), result: parseProgressFile(JSON.stringify(file)) }));
    dispatch({ type: 'import', items, sample: true });
  };

  const clearAll = () => {
    setConfirmClear(false);
    setSelectedId(null);
    dispatch({ type: 'clear' });
  };

  const onRememberChange = (value: boolean) => {
    setRemember(value);
    saveRememberPreference(storage, value);
  };

  const openStudent = (id: string, opener: HTMLElement) => {
    openerRef.current = opener;
    setSelectedId(id);
  };
  const closeStudent = () => {
    setSelectedId(null);
    const opener = openerRef.current;
    if (opener) window.setTimeout(() => opener.isConnected && opener.focus(), 0);
  };
  const removeStudent = (id: string) => {
    setSelectedId(null);
    dispatch({ type: 'remove', id });
  };

  const exportClassCsv = () => {
    const date = localDate(now());
    const code = activeClass === ALL_CLASSES ? null : activeClass || null;
    onDownload(csvFileName('class-summary', code, date), classSummaryCsv(sortedSummaries, curriculum, translate), 'text/csv;charset=utf-8');
  };
  const exportLevelCsv = () => {
    const date = localDate(now());
    const code = activeClass === ALL_CLASSES ? null : activeClass || null;
    onDownload(csvFileName('level-stats', code, date), levelStatsCsv(stats, translate), 'text/csv;charset=utf-8');
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const next: Tab = e.key === 'Home' ? 'students' : e.key === 'End' ? 'stuck' : tab === 'students' ? 'stuck' : 'students';
    setTab(next);
    document.getElementById(`gqd-tab-${next}`)?.focus();
  };

  const countByClass = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.records) {
      const k = normalizeClassCode(r.file.player.classCode);
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [data.records]);

  const empty = data.records.length === 0;

  return (
    <main className="gqd" data-testid={TID.dashboard} aria-labelledby="gqd-title">
      <header className="gqd-header">
        <h1 id="gqd-title">{t('dashboardTitle')}</h1>
        <p className="gqd-lead">{t('intro')}</p>
        <p className="gqd-privacy">
          <strong>{t('privacy.title')}</strong> {t('privacy.body')}
        </p>
      </header>

      <section className="gqd-card" aria-labelledby="gqd-import-title">
        <h2 id="gqd-import-title">{t('import.title')}</h2>
        <div
          className={dragging ? 'gqd-drop gqd-drop-active' : 'gqd-drop'}
          data-testid={DASH_TID.dropZone}
          onDragEnter={onDragOver}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <p className="gqd-drop-text">{t('import.dropHint')}</p>
          <label htmlFor={ids.input} className="gqd-button gqd-button-primary gqd-file-label">
            {t('import.choose')}
          </label>
          <input
            id={ids.input}
            className="gqd-file-input"
            type="file"
            multiple
            accept=".json,application/json"
            data-testid={TID.dashboardImport}
            onChange={onInputChange}
          />
          <p className="gqd-muted">{t('import.help')}</p>
          {busy && <p role="status">{t('import.reading')}</p>}
        </div>
        <div className="gqd-toolbar">
          <button type="button" className="gqd-button" data-testid={DASH_TID.sample} onClick={loadSample}>
            {t('import.sample')}
          </button>
          {confirmClear && !empty ? (
            <span className="gqd-confirm" role="group" aria-label={t('import.clearConfirm', { count: data.records.length })}>
              <span>{t('import.clearConfirm', { count: data.records.length })}</span>
              <button type="button" className="gqd-button gqd-button-danger" data-testid={DASH_TID.clearConfirm} onClick={clearAll}>
                {t('import.clearYes')}
              </button>
              <button type="button" className="gqd-button" onClick={() => setConfirmClear(false)}>
                {t('import.clearNo')}
              </button>
            </span>
          ) : (
            <button type="button" className="gqd-button gqd-button-danger" data-testid={DASH_TID.clear} onClick={() => setConfirmClear(true)} disabled={empty}>
              {t('import.clear')}
            </button>
          )}
          <span className="gqd-check">
            <input
              id={ids.remember}
              type="checkbox"
              checked={remember}
              data-testid={DASH_TID.remember}
              onChange={(e) => onRememberChange(e.target.checked)}
            />
            <label htmlFor={ids.remember}>{t('import.remember')}</label>
          </span>
        </div>
        {saveFailed && (
          <p className="gqd-notice gqd-notice-warning" role="alert">
            <span aria-hidden="true">⚠ </span>
            {t('import.saveFailed')}
          </p>
        )}
        <div role="status" aria-live="polite" data-testid={DASH_TID.notices}>
          {data.notices.length > 0 && (
            <>
              <ul className="gqd-notices">
                {data.notices.map((n, i) => {
                  const tone = noticeTone(n);
                  return (
                    <li key={i} className={`gqd-notice gqd-notice-${tone}`}>
                      <span aria-hidden="true">{TONE_ICON[tone]} </span>
                      <span className="gqd-sr-only">{t(`notice.tone_${tone}`)} </span>
                      {'file' in n && n.file && <strong>{n.file}: </strong>}
                      {noticeText(n, translate)}
                    </li>
                  );
                })}
              </ul>
              <button type="button" className="gqd-button gqd-button-small" onClick={() => dispatch({ type: 'dismiss' })}>
                {t('import.dismiss')}
              </button>
            </>
          )}
        </div>
      </section>

      {hasSamples && (
        <p className="gqd-notice gqd-notice-info gqd-banner">
          <span aria-hidden="true">ℹ </span>
          {t('sample.banner')}
        </p>
      )}

      {empty ? (
        <section className="gqd-card gqd-empty" aria-labelledby="gqd-empty-title">
          <h2 id="gqd-empty-title">{t('empty.title')}</h2>
          <p>{t('empty.body')}</p>
        </section>
      ) : (
        <>
          <section className="gqd-card" aria-labelledby="gqd-filter-title">
            <h2 id="gqd-filter-title" className="gqd-sr-only">
              {t('filter.title')}
            </h2>
            <div className="gqd-filters">
              <div className="gqd-field">
                <label htmlFor={ids.classFilter}>{t('filter.classCode')}</label>
                <select
                  id={ids.classFilter}
                  value={activeClass}
                  data-testid={DASH_TID.classFilter}
                  onChange={(e) => setClassFilter(e.target.value)}
                >
                  <option value={ALL_CLASSES}>{t('filter.allClasses', { count: data.records.length })}</option>
                  {codes.map((code) => (
                    <option key={code || '(none)'} value={code}>
                      {t('filter.classOption', { code: code || t('table.noClassCode'), count: countByClass.get(code) ?? 0 })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="gqd-field">
                <label htmlFor={ids.search}>{t('filter.search')}</label>
                <input
                  id={ids.search}
                  type="search"
                  value={search}
                  placeholder={t('filter.searchPlaceholder')}
                  data-testid={DASH_TID.search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <p className="gqd-shown" data-testid={DASH_TID.shownCount} aria-live="polite">
                {t('filter.shown', { shown: filtered.length, count: data.records.length })}
              </p>
            </div>

            <dl className="gqd-tiles">
              <div className="gqd-tile">
                <dt>{t('overview.students')}</dt>
                <dd>{overview.students}</dd>
              </div>
              <div className="gqd-tile">
                <dt>{t('overview.avgLevels')}</dt>
                <dd>
                  {formatDecimal(overview.avgLevelsCompleted, translate)}{' '}
                  <span className="gqd-muted">{t('overview.ofTotal', { total: curriculum.totalLevels })}</span>
                </dd>
              </div>
              <div className="gqd-tile">
                <dt>{t('overview.avgBosses')}</dt>
                <dd>
                  {formatDecimal(overview.avgBossesCompleted, translate)}{' '}
                  <span className="gqd-muted">{t('overview.ofTotal', { total: curriculum.bosses.length })}</span>
                </dd>
              </div>
              <div className="gqd-tile">
                <dt>{t('overview.finished')}</dt>
                <dd>{overview.finished}</dd>
              </div>
              <div className="gqd-tile">
                <dt>{t('overview.checksumWarnings')}</dt>
                <dd>
                  {overview.checksumWarnings > 0 && <span aria-hidden="true">⚠ </span>}
                  {overview.checksumWarnings}
                </dd>
              </div>
            </dl>

            <div className="gqd-toolbar">
              <button
                type="button"
                className="gqd-button gqd-button-primary"
                data-testid={TID.dashboardCsv}
                onClick={exportClassCsv}
                disabled={filtered.length === 0}
              >
                {t('csv.downloadSummary')}
              </button>
              <button type="button" className="gqd-button" data-testid={DASH_TID.csvLevels} onClick={exportLevelCsv} disabled={filtered.length === 0}>
                {t('csv.downloadLevels')}
              </button>
              <span className="gqd-muted">{t('csv.help')}</span>
            </div>
          </section>

          <div className="gqd-tabs" role="tablist" aria-label={t('tabs.label')}>
            <button
              id="gqd-tab-students"
              type="button"
              role="tab"
              aria-selected={tab === 'students'}
              aria-controls="gqd-panel-students"
              tabIndex={tab === 'students' ? 0 : -1}
              data-testid={DASH_TID.tabStudents}
              onClick={() => setTab('students')}
              onKeyDown={onTabKey}
            >
              {t('tabs.students')}
            </button>
            <button
              id="gqd-tab-stuck"
              type="button"
              role="tab"
              aria-selected={tab === 'stuck'}
              aria-controls="gqd-panel-stuck"
              tabIndex={tab === 'stuck' ? 0 : -1}
              data-testid={DASH_TID.tabStuck}
              onClick={() => setTab('stuck')}
              onKeyDown={onTabKey}
            >
              {t('tabs.stuck')}
            </button>
          </div>

          <section id="gqd-panel-students" role="tabpanel" aria-labelledby="gqd-tab-students" hidden={tab !== 'students'} className="gqd-panel">
            {filtered.length === 0 ? (
              <p>{t('filter.noMatch')}</p>
            ) : (
              <StudentTable
                summaries={sortedSummaries}
                curriculum={curriculum}
                sort={studentSort}
                onSort={(key) => setStudentSort((s) => nextSort(s, key, defaultStudentDirection))}
                onOpen={openStudent}
                translate={translate}
              />
            )}
          </section>

          <section id="gqd-panel-stuck" role="tabpanel" aria-labelledby="gqd-tab-stuck" hidden={tab !== 'stuck'} className="gqd-panel">
            {tab === 'stuck' && (
              <StuckView
                stats={sortedStats}
                sort={levelSort}
                onSort={(key) => setLevelSort((s) => nextSort(s, key, defaultLevelDirection))}
                showUnstarted={showUnstarted}
                onShowUnstartedChange={setShowUnstarted}
                translate={translate}
              />
            )}
          </section>
        </>
      )}

      <footer className="gqd-footer">
        <p className="gqd-muted">{t('footer')}</p>
      </footer>

      {selected && (
        <StudentDrawer record={selected} curriculum={curriculum} onClose={closeStudent} onRemove={removeStudent} translate={translate} />
      )}
    </main>
  );
}
