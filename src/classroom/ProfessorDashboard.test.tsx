// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import { TID } from '../shared/testids';
import { CLASSROOM_STORAGE_KEY } from './classStorage';
import { ProfessorDashboard } from './ProfessorDashboard';
import { serializeProgressFile } from './progressFile';
import { DASH_TID } from './testids';
import { MemoryStorage, makeProgressFile } from './testing';
import type { FileSpec } from './testing';

afterEach(() => cleanup());

const NOW = () => new Date('2026-09-30T12:00:00.000Z');

function progressFile(spec: FileSpec, fileName = `${spec.id}.gitquest.json`): File {
  const file = makeProgressFile(spec);
  return new File([serializeProgressFile(file, spec.exportedAt ?? file.exportedAt)], fileName, { type: 'application/json' });
}

function setup(storage: MemoryStorage | null = new MemoryStorage()) {
  const onDownload = vi.fn();
  const view = render(<ProfessorDashboard storage={storage} now={NOW} onDownload={onDownload} />);
  return { onDownload, storage, ...view };
}

async function upload(files: File[]) {
  const input = screen.getByTestId(TID.dashboardImport);
  await act(async () => {
    fireEvent.change(input, { target: { files } });
  });
}

const ADA: FileSpec = {
  id: 'ada',
  name: 'Ada Lovelace',
  classCode: 'CPSC-101-A',
  levels: {
    '0.6': { completed: true, stars: 3, timeSpentSec: 300, lastPlayedAt: '2026-09-20T10:00:00.000Z' },
    '1.6': { completed: true, stars: 2, timeSpentSec: 400 },
    '5.3': { completed: true, stars: 1, timeSpentSec: 900, maxHintTier: 3, hintsUsed: 3, errorCodes: { 'merge-conflict': 2 }, errors: 2 },
  },
};
const BAO: FileSpec = {
  id: 'bao',
  name: 'Bao Tran',
  classCode: 'CPSC-101-B',
  levels: {
    '0.6': { completed: true, stars: 3 },
    '5.3': { completed: false, maxHintTier: 3, hintsUsed: 3, attempts: 2 },
  },
};
const CHLOE: FileSpec = { id: 'chloe', name: 'Chloé Dubois', classCode: 'cpsc-101-a', levels: { '0.1': { completed: true, stars: 3 } } };

function rowNames(): string[] {
  const table = screen.getByTestId(DASH_TID.studentTable);
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('rowheader')[0].querySelector('button')?.textContent ?? '');
}

describe('ProfessorDashboard', () => {
  it('shows the title, the privacy promise and an empty state', () => {
    setup();
    expect(screen.getByTestId(TID.dashboard)).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: 'Professor Dashboard' })).toBeTruthy();
    expect(screen.getByText(/Nothing is uploaded to any server/)).toBeTruthy();
    expect(screen.getByText('No students yet')).toBeTruthy();
    expect(screen.getByTestId(TID.dashboardImport).getAttribute('multiple')).not.toBeNull();
  });

  it('imports several valid files at once', async () => {
    setup();
    await upload([progressFile(ADA), progressFile(BAO)]);
    expect(await screen.findByText('Added Ada Lovelace.')).toBeTruthy();
    expect(screen.getByText('Added Bao Tran.')).toBeTruthy();
    expect(rowNames()).toEqual(['Ada Lovelace', 'Bao Tran']);
    const ada = screen.getByTestId(DASH_TID.studentRow('ada'));
    expect(within(ada).getByText('3 / 91')).toBeTruthy();
    expect(within(ada).getByText('Boss levels completed in chapters 0, 1.')).toBeTruthy();
  });

  it('lists a kind error for each wrong file and keeps the good ones', async () => {
    setup();
    const notes = new File(['my notes'], 'notes.txt', { type: 'text/plain' });
    const other = new File(['{"hello": "world"}'], 'package.json', { type: 'application/json' });
    const empty = new File([''], 'empty.gitquest.json', { type: 'application/json' });
    await upload([notes, progressFile(ADA), other, empty]);
    const notices = await screen.findByTestId(DASH_TID.notices);
    await within(notices).findByText('Added Ada Lovelace.');
    const items = within(notices).getAllByRole('listitem').map((li) => li.textContent ?? '');
    expect(items.find((x) => x.includes('notes.txt'))).toMatch(/not a Git Quest progress file/);
    expect(items.find((x) => x.includes('package.json'))).toMatch(/not a Git Quest progress file/);
    expect(items.find((x) => x.includes('empty.gitquest.json'))).toMatch(/empty/);
    expect(rowNames()).toEqual(['Ada Lovelace']);
  });

  it('keeps only the newest file per student', async () => {
    setup();
    await upload([progressFile({ ...ADA, exportedAt: '2026-09-10T00:00:00.000Z', levels: {} }, 'ada-old.gitquest.json')]);
    await upload([progressFile({ ...ADA, exportedAt: '2026-09-20T00:00:00.000Z' }, 'ada-new.gitquest.json')]);
    expect(await screen.findByText('Updated Ada Lovelace with this newer file.')).toBeTruthy();
    await upload([progressFile({ ...ADA, exportedAt: '2026-09-15T00:00:00.000Z', levels: {} }, 'ada-mid.gitquest.json')]);
    expect(await screen.findByText('Skipped. A newer file for Ada Lovelace is already loaded.')).toBeTruthy();
    expect(rowNames()).toEqual(['Ada Lovelace']);
    expect(within(screen.getByTestId(DASH_TID.studentRow('ada'))).getByText('3 / 91')).toBeTruthy();
  });

  it('flags a file edited after export', async () => {
    setup();
    const file = makeProgressFile(BAO);
    const edited = { ...file, levels: { ...file.levels, '5.3': { ...file.levels['5.3'], completed: true, stars: 3 } } };
    await upload([new File([JSON.stringify(edited)], 'bao.gitquest.json')]);
    expect(await screen.findByText(/was changed after it was exported/)).toBeTruthy();
    expect(within(screen.getByTestId(DASH_TID.studentRow('bao'))).getByText('Edited after export')).toBeTruthy();
  });

  it('filters by class code (ignoring case) and searches by name', async () => {
    setup();
    await upload([progressFile(ADA), progressFile(BAO), progressFile(CHLOE)]);
    await screen.findByText('Added Chloé Dubois.');
    fireEvent.change(screen.getByTestId(DASH_TID.classFilter), { target: { value: 'CPSC-101-A' } });
    expect(rowNames()).toEqual(['Ada Lovelace', 'Chloé Dubois']);
    expect(screen.getByTestId(DASH_TID.shownCount).textContent).toBe('Showing 2 of 3 students.');
    fireEvent.change(screen.getByTestId(DASH_TID.search), { target: { value: 'chloe' } });
    expect(rowNames()).toEqual(['Chloé Dubois']);
    fireEvent.change(screen.getByTestId(DASH_TID.classFilter), { target: { value: '*' } });
    fireEvent.change(screen.getByTestId(DASH_TID.search), { target: { value: 'nobody' } });
    expect(screen.getByText('No students match these filters.')).toBeTruthy();
  });

  it('sorts columns with buttons and announces the order', async () => {
    setup();
    await upload([progressFile(BAO), progressFile(CHLOE), progressFile(ADA)]);
    await screen.findByText('Added Ada Lovelace.');
    expect(rowNames()).toEqual(['Ada Lovelace', 'Bao Tran', 'Chloé Dubois']);
    const levels = screen.getByTestId(DASH_TID.sortButton('levels'));
    fireEvent.click(levels);
    expect(levels.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(rowNames()).toEqual(['Ada Lovelace', 'Bao Tran', 'Chloé Dubois']);
    fireEvent.click(levels);
    expect(levels.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(rowNames()[2]).toBe('Ada Lovelace');
    fireEvent.click(screen.getByTestId(DASH_TID.sortButton('name')));
    fireEvent.click(screen.getByTestId(DASH_TID.sortButton('name')));
    expect(rowNames()).toEqual(['Chloé Dubois', 'Bao Tran', 'Ada Lovelace']);
    expect(screen.getByTestId(DASH_TID.sortButton('levels')).closest('th')?.getAttribute('aria-sort')).toBe('none');
  });

  it('downloads a class summary CSV for the students shown', async () => {
    const { onDownload } = setup();
    await upload([progressFile(ADA), progressFile(BAO)]);
    await screen.findByText('Added Bao Tran.');
    fireEvent.change(screen.getByTestId(DASH_TID.classFilter), { target: { value: 'CPSC-101-A' } });
    fireEvent.click(screen.getByTestId(TID.dashboardCsv));
    expect(onDownload).toHaveBeenCalledTimes(1);
    const [name, content, mime] = onDownload.mock.calls[0] as [string, string, string];
    expect(name).toBe('gitquest-class-summary-cpsc-101-a-2026-09-30.csv');
    expect(mime).toContain('text/csv');
    expect(content.charCodeAt(0)).toBe(0xfeff);
    const lines = content.slice(1).trim().split('\r\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain('Boss ch 11 (11.8)');
    expect(lines[1].startsWith('Ada Lovelace,ada-lovelace,CPSC-101-A,ada,3,91,6,273,2,12,1,1,0')).toBe(true);
  });

  it('downloads per-level statistics', async () => {
    const { onDownload } = setup();
    await upload([progressFile(ADA), progressFile(BAO)]);
    await screen.findByText('Added Bao Tran.');
    fireEvent.click(screen.getByTestId(DASH_TID.csvLevels));
    const [name, content] = onDownload.mock.calls[0] as [string, string];
    expect(name).toBe('gitquest-level-stats-2026-09-30.csv');
    const lines = content.slice(1).trim().split('\r\n');
    expect(lines).toHaveLength(92);
    expect(lines.find((l) => l.startsWith('5,5.3,'))).toContain('Resolve and finish,0,2,2,1,50');
  });

  it('shows where the class is stuck', async () => {
    setup();
    await upload([progressFile(ADA), progressFile(BAO)]);
    await screen.findByText('Added Bao Tran.');
    fireEvent.click(screen.getByTestId(DASH_TID.tabStuck));
    expect(screen.getByTestId(DASH_TID.tabStuck).getAttribute('aria-selected')).toBe('true');
    const list = screen.getByTestId(DASH_TID.stuckList);
    expect(within(list).getByText(/100% of students opened hint 3 on level 5.3 \(Resolve and finish\)\./)).toBeTruthy();
    const row = screen.getByTestId(DASH_TID.levelRow('5.3'));
    expect(within(row).getAllByText('High hint use').length).toBeGreaterThan(0);
    expect(within(row).getByText('merge-conflict')).toBeTruthy();
    expect(screen.queryByTestId(DASH_TID.levelRow('11.8'))).toBeNull();
    fireEvent.click(screen.getByTestId(DASH_TID.showUnstarted));
    expect(screen.getByTestId(DASH_TID.levelRow('11.8'))).toBeTruthy();
  });

  it('moves between tabs with the arrow keys', async () => {
    setup();
    await upload([progressFile(ADA)]);
    await screen.findByText('Added Ada Lovelace.');
    const studentsTab = screen.getByTestId(DASH_TID.tabStudents);
    studentsTab.focus();
    fireEvent.keyDown(studentsTab, { key: 'ArrowRight' });
    expect(screen.getByTestId(DASH_TID.tabStuck).getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(screen.getByTestId(DASH_TID.tabStuck));
  });

  it('opens a student drawer with every level and closes it with Escape', async () => {
    setup();
    await upload([progressFile(ADA)]);
    await screen.findByText('Added Ada Lovelace.');
    const nameButton = screen.getByRole('button', { name: 'Ada Lovelace' });
    fireEvent.click(nameButton);
    const drawer = screen.getByRole('dialog', { name: 'Ada Lovelace' });
    expect(drawer.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(screen.getByTestId(DASH_TID.drawerClose));
    expect(within(drawer).getAllByRole('table')).toHaveLength(12);
    const levelRows = within(drawer).getAllByRole('row').filter((r) => within(r).queryAllByRole('rowheader').length > 0);
    expect(levelRows).toHaveLength(91);
    expect(within(drawer).getByText('Chapter 5: Merge conflicts (1 of 6 completed)')).toBeTruthy();
    fireEvent.keyDown(drawer, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(nameButton));
  });

  it('removes one student from the drawer', async () => {
    setup();
    await upload([progressFile(ADA), progressFile(BAO)]);
    await screen.findByText('Added Bao Tran.');
    fireEvent.click(screen.getByRole('button', { name: 'Bao Tran' }));
    fireEvent.click(screen.getByTestId(DASH_TID.drawerRemove));
    expect(rowNames()).toEqual(['Ada Lovelace']);
  });

  it('loads a sample class and replaces it with real files', async () => {
    setup();
    fireEvent.click(screen.getByTestId(DASH_TID.sample));
    expect(screen.getByText('Loaded 10 demo students.')).toBeTruthy();
    expect(screen.getByText(/You are looking at demo students/)).toBeTruthy();
    expect(rowNames()).toHaveLength(10);
    expect(screen.getAllByText('Edited after export').length).toBeGreaterThan(0);
    await upload([progressFile(ADA)]);
    expect(await screen.findByText('Removed 10 demo students because you imported real files.')).toBeTruthy();
    expect(rowNames()).toEqual(['Ada Lovelace']);
    expect(screen.queryByText(/You are looking at demo students/)).toBeNull();
  });

  it('clears everything after confirmation', async () => {
    setup();
    await upload([progressFile(ADA)]);
    await screen.findByText('Added Ada Lovelace.');
    fireEvent.click(screen.getByTestId(DASH_TID.clear));
    expect(screen.getByText('Remove 1 student from this dashboard?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(rowNames()).toEqual(['Ada Lovelace']);
    fireEvent.click(screen.getByTestId(DASH_TID.clear));
    fireEvent.click(screen.getByTestId(DASH_TID.clearConfirm));
    expect(screen.getByText('No students yet')).toBeTruthy();
  });

  it('remembers the class in this browser and forgets it on request', async () => {
    const storage = new MemoryStorage();
    setup(storage);
    await upload([progressFile(ADA)]);
    await screen.findByText('Added Ada Lovelace.');
    expect(storage.getItem(CLASSROOM_STORAGE_KEY)).toContain('Ada Lovelace');
    cleanup();
    setup(storage);
    expect(rowNames()).toEqual(['Ada Lovelace']);
    fireEvent.click(screen.getByTestId(DASH_TID.remember));
    expect(storage.getItem(CLASSROOM_STORAGE_KEY)).toBeNull();
    cleanup();
    setup(storage);
    expect(screen.getByText('No students yet')).toBeTruthy();
  });

  it('imports files dropped on the drop zone', async () => {
    setup();
    const zone = screen.getByTestId(DASH_TID.dropZone);
    fireEvent.dragOver(zone, { dataTransfer: { files: [], dropEffect: 'none' } });
    expect(zone.className).toContain('gqd-drop-active');
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer: { files: [progressFile(CHLOE)] } });
    });
    expect(await screen.findByText('Added Chloé Dubois.')).toBeTruthy();
    expect(zone.className).not.toContain('gqd-drop-active');
  });

  it('works when browser storage is unavailable', async () => {
    setup(null);
    await upload([progressFile(ADA)]);
    expect(await screen.findByText('Added Ada Lovelace.')).toBeTruthy();
  });
});
