/**
 * Settings screen: theme, text size, motion, profile, progress export/import/reset.
 */
import { useCallback, useRef, useState } from 'react';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';
import { routeHref } from '../router';
import {
  ANIMATION_SPEEDS,
  FONT_SCALES,
  THEMES,
  useSettings,
  useSettingsStore,
} from '../state/settings';
import type { AnimationSpeed, ThemeSetting } from '../state/settings';
import { useProgress, useProgressApi } from '../state/progress';
import { deriveHandle, profileFromForm } from '../state/profile';
import { Modal } from '../components/Modal';

export function SettingsScreen() {
  const settings = useSettings();
  const updateSettings = useSettingsStore((s) => s.update);
  const resetSettings = useSettingsStore((s) => s.reset);
  const progress = useProgress();
  const progressApi = useProgressApi();

  const [profileName, setProfileName] = useState(progress.player.name);
  const [profileClassCode, setProfileClassCode] = useState(progress.player.classCode);
  const [profileSaved, setProfileSaved] = useState(false);
  const [exportStatus, setExportStatus] = useState('');
  const [importStatus, setImportStatus] = useState('');
  const [importError, setImportError] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [resetDone, setResetDone] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const onProfileSave = useCallback(() => {
    const patch = profileFromForm(profileName, profileClassCode);
    progressApi.setProfile(patch);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 2000);
  }, [profileName, profileClassCode, progressApi]);

  const onExport = useCallback(() => {
    try {
      const json = progressApi.exportFile();
      const csv = progressApi.exportCsv();
      downloadFile(`${progress.player.handle}.gitquest.json`, json, 'application/json');
      downloadFile(`${progress.player.handle}.gitquest.csv`, csv, 'text/csv');
      setExportStatus(fmt(STRINGS.settings.exported, { json: `${progress.player.handle}.gitquest.json`, csv: `${progress.player.handle}.gitquest.csv` }));
    } catch (e) {
      setExportStatus(String(e));
    }
  }, [progressApi, progress.player.handle]);

  const onImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = progressApi.importFile(reader.result as string);
      if (result.ok) {
        setImportStatus(STRINGS.settings.importOk);
        setImportError(false);
      } else {
        setImportStatus(fmt(STRINGS.settings.importFailed, { error: result.error }));
        setImportError(true);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [progressApi]);

  const onReset = useCallback(() => {
    progressApi.reset();
    resetSettings();
    setResetConfirm(false);
    setResetDone(true);
    setTimeout(() => setResetDone(false), 3000);
  }, [progressApi, resetSettings]);

  return (
    <div className="gq-settings-page" data-testid={TID.settingsPage}>
      <h1>{STRINGS.settings.title}</h1>

      {/* Appearance */}
      <section className="gq-settings-section">
        <h3>{STRINGS.settings.appearance}</h3>

        <div className="gq-settings-row">
          <label htmlFor="setting-theme">{STRINGS.settings.theme}</label>
          <select
            id="setting-theme"
            value={settings.theme}
            onChange={(e) => updateSettings({ theme: e.target.value as ThemeSetting })}
            data-testid={TID.settingTheme}
          >
            {THEMES.map((t) => (
              <option key={t} value={t}>{(STRINGS.settings.themes as Record<string, string>)[t]}</option>
            ))}
          </select>
        </div>

        <div className="gq-settings-row">
          <label htmlFor="setting-font-scale">{STRINGS.settings.fontScale}</label>
          <select
            id="setting-font-scale"
            value={settings.fontScale}
            onChange={(e) => updateSettings({ fontScale: Number(e.target.value) })}
            data-testid={TID.settingFontScale}
          >
            {FONT_SCALES.map((s, i) => (
              <option key={s} value={s}>{(STRINGS.settings.fontScales as string[])[i]}</option>
            ))}
          </select>
        </div>
      </section>

      {/* Motion */}
      <section className="gq-settings-section">
        <h3>{STRINGS.settings.motion}</h3>

        <div className="gq-settings-row">
          <label htmlFor="setting-speed">{STRINGS.settings.animationSpeed}</label>
          <select
            id="setting-speed"
            value={settings.animationSpeed}
            onChange={(e) => updateSettings({ animationSpeed: e.target.value as AnimationSpeed })}
            data-testid={TID.settingAnimationSpeed}
          >
            {ANIMATION_SPEEDS.map((s) => (
              <option key={s} value={s}>{(STRINGS.settings.speeds as Record<string, string>)[s]}</option>
            ))}
          </select>
        </div>

        <div className="gq-settings-check">
          <input
            type="checkbox"
            id="setting-reduced-motion"
            checked={settings.reducedMotion}
            onChange={(e) => updateSettings({ reducedMotion: e.target.checked })}
            data-testid={TID.settingReducedMotion}
          />
          <label htmlFor="setting-reduced-motion">{STRINGS.settings.reducedMotion}</label>
        </div>
      </section>

      {/* Accessibility */}
      <section className="gq-settings-section">
        <h3>{STRINGS.settings.accessibility}</h3>
        <div className="gq-settings-check">
          <input
            type="checkbox"
            id="setting-screen-reader"
            checked={settings.screenReader}
            onChange={(e) => updateSettings({ screenReader: e.target.checked })}
            data-testid={TID.settingScreenReader}
          />
          <label htmlFor="setting-screen-reader">{STRINGS.settings.screenReader}</label>
        </div>
        <p className="gq-small gq-muted">{STRINGS.settings.screenReaderHelp}</p>
      </section>

      {/* Profile */}
      <section className="gq-settings-section">
        <h3>{STRINGS.settings.profile}</h3>
        <div className="gq-settings-row">
          <label htmlFor="settings-name">{STRINGS.settings.profileName}</label>
          <input
            type="text"
            id="settings-name"
            value={profileName}
            onChange={(e) => { setProfileName(e.target.value); setProfileSaved(false); }}
            data-testid={TID.settingsProfileName}
            maxLength={60}
          />
        </div>
        <div className="gq-settings-row">
          <label htmlFor="settings-class-code">{STRINGS.settings.profileClassCode}</label>
          <input
            type="text"
            id="settings-class-code"
            value={profileClassCode}
            onChange={(e) => { setProfileClassCode(e.target.value); setProfileSaved(false); }}
            data-testid={TID.settingsProfileClassCode}
            maxLength={40}
          />
        </div>
        <p className="gq-small gq-muted">{fmt(STRINGS.settings.profileHandle, { handle: deriveHandle(profileName) })}</p>
        <button type="button" className="gq-btn gq-btn-sm" onClick={onProfileSave} data-testid={TID.settingsProfileSave}>
          {STRINGS.settings.profileSave}
        </button>
        {profileSaved && <p className="gq-settings-status">{STRINGS.settings.profileSaved}</p>}
      </section>

      {/* Progress */}
      <section className="gq-settings-section">
        <h3>{STRINGS.settings.progress}</h3>
        <p className="gq-small gq-muted">{STRINGS.settings.progressHelp}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className="gq-btn gq-btn-sm" onClick={onExport} data-testid={TID.settingsExport}>
            <Icon name="download" size={14} /> {STRINGS.settings.export}
          </button>
          <button type="button" className="gq-btn gq-btn-sm" onClick={onImport} data-testid={TID.settingsImport}>
            <Icon name="upload" size={14} /> {STRINGS.settings.import}
          </button>
          <input type="file" ref={fileInputRef} style={{ display: 'none' }} accept=".json,.gitquest.json" onChange={onFileSelected} />
        </div>
        {exportStatus && <p className="gq-settings-status" data-testid={TID.settingsExportStatus}>{exportStatus}</p>}
        {importStatus && <p className={`gq-settings-status ${importError ? 'gq-settings-status-error' : ''}`} data-testid={TID.settingsImportStatus}>{importStatus}</p>}

        <div style={{ marginTop: 12 }}>
          {!resetConfirm ? (
            <button type="button" className="gq-btn gq-btn-sm gq-btn-danger" onClick={() => setResetConfirm(true)} data-testid={TID.settingsReset}>
              {STRINGS.settings.reset}
            </button>
          ) : (
            <div className="gq-card" style={{ marginTop: 8 }}>
              <h4>{STRINGS.settings.resetConfirmTitle}</h4>
              <p className="gq-small">{STRINGS.settings.resetConfirmBody}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button type="button" className="gq-btn gq-btn-sm gq-btn-danger" onClick={onReset} data-testid={TID.settingsResetConfirm}>
                  {STRINGS.settings.resetConfirm}
                </button>
                <button type="button" className="gq-btn gq-btn-sm" onClick={() => setResetConfirm(false)}>
                  {STRINGS.common.cancel}
                </button>
              </div>
            </div>
          )}
          {resetDone && <p className="gq-settings-status" data-testid={TID.settingsResetStatus}>{STRINGS.settings.resetDone}</p>}
        </div>
      </section>

      {/* Keyboard shortcuts */}
      <section className="gq-settings-section" data-testid={TID.settingsShortcuts}>
        <h3>{STRINGS.settings.shortcuts}</h3>
        <table style={{ fontSize: '0.85em', borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {STRINGS.shortcuts.map((s, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{s.keys}</td>
                <td style={{ padding: '4px 8px' }}>{s.action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div style={{ marginTop: 16 }}>
        <a href={routeHref({ name: 'home' })} className="gq-btn">
          <Icon name="home" size={14} /> {STRINGS.common.backHome}
        </a>
      </div>
    </div>
  );
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
