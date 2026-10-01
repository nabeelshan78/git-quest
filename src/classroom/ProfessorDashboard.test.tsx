// @vitest-environment jsdom
import { act, cleanup, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TID } from '../shared/testids';
import { STRINGS } from '../strings';
import { downloadAllProgress, downloadProgress } from './download';
import { ProfessorDashboard } from './ProfessorDashboard';
import { createProgressStore } from './store';
import { MemoryStorage, TINY_CHAPTERS, levelResult } from './testing';
import { useProgress } from './useProgress';

afterEach(() => cleanup());

describe('ProfessorDashboard', () => {
  it('explains how to collect and read the files', () => {
    render(<ProfessorDashboard />);
    const page = screen.getByTestId(TID.dashboard);
    const text = STRINGS.classroom.professorPage;
    expect(screen.getByRole('heading', { level: 1, name: text.title })).toBeTruthy();
    for (const title of [text.collectTitle, text.readTitle, text.jsonTitle, text.privacyTitle]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeTruthy();
    }
    for (const step of [...text.collectSteps, ...text.readSteps, ...text.jsonSteps]) {
      expect(page.textContent).toContain(step);
    }
    expect(page.textContent).toContain(text.privacyBody);
    expect(screen.getByRole('link', { name: text.backLink }).getAttribute('href')).toBe('#/');
  });

  it('labels each section by its heading for screen readers', () => {
    render(<ProfessorDashboard />);
    const regions = screen.getAllByRole('region');
    expect(regions.map((r) => r.getAttribute('aria-labelledby')).every((id) => id && document.getElementById(id))).toBe(true);
    expect(screen.getByRole('main').getAttribute('aria-labelledby')).toBeTruthy();
  });
});

describe('useProgress', () => {
  it('re-renders with the latest progress', () => {
    const store = createProgressStore(new MemoryStorage());
    const { result } = renderHook(() => useProgress(store));
    expect(result.current.levels).toEqual({});
    act(() => store.recordResult(levelResult({ levelId: '1.1' })));
    expect(result.current.levels['1.1'].completed).toBe(true);
    expect(result.current).toBe(store.get());
  });
});

describe('downloadProgress', () => {
  const now = new Date(2026, 8, 30, 14, 0);

  function storeWithAda() {
    const store = createProgressStore(new MemoryStorage(), { chapters: TINY_CHAPTERS });
    store.setProfile({ name: 'Ada Lovelace' });
    return store;
  }

  it('saves the JSON file with the handle and date in its name', () => {
    const store = storeWithAda();
    const download = vi.fn();
    expect(downloadProgress(store, 'json', { download, now })).toBe('ada-lovelace-2026-09-30.gitquest.json');
    expect(download).toHaveBeenCalledWith('ada-lovelace-2026-09-30.gitquest.json', expect.stringContaining('"checksum"'), 'application/json');
  });

  it('saves both files', () => {
    const store = storeWithAda();
    const download = vi.fn();
    expect(downloadAllProgress(store, { download, now })).toEqual(['ada-lovelace-2026-09-30.gitquest.json', 'ada-lovelace-2026-09-30.gitquest.csv']);
    const [, csvText, csvType] = download.mock.calls[1] as [string, string, string];
    expect(csvText).toContain('Name,Ada Lovelace');
    expect(csvType).toBe('text/csv;charset=utf-8');
  });

  it('downloads through a temporary link by default', () => {
    const store = storeWithAda();
    const createObjectURL = vi.fn(() => 'blob:progress');
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.useFakeTimers();
    try {
      downloadProgress(store, 'csv', { now });
      expect(click).toHaveBeenCalledTimes(1);
      expect(createObjectURL).toHaveBeenCalledTimes(1);
      expect(document.querySelector('a[download]')).toBeNull();
      vi.runAllTimers();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:progress');
    } finally {
      vi.useRealTimers();
      click.mockRestore();
    }
  });
});
