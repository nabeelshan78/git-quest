import { describe, expect, it, vi } from 'vitest';
import { getChapters } from '../levels/content';
import { PROGRESS_STORAGE_KEY, ProgressFileSchema } from '../shared/progress';
import type { ProgressFile } from '../shared/progress';
import { STRINGS } from '../strings';
import { verifyChecksum, withChecksum } from './checksum';
import { CSV_BOM } from './csv';
import { CORRUPT_BACKUP_KEY, createProgressStore, generatePlayerId } from './store';
import type { ProgressStoreOptions, StorageLike } from './store';
import { MemoryStorage, TINY_CHAPTERS, fakeClock, levelResult } from './testing';

let counter = 0;
const ids = () => `player-${++counter}`;

function setup(storage: StorageLike = new MemoryStorage(), extra: ProgressStoreOptions = {}) {
  const clock = fakeClock();
  const store = createProgressStore(storage, { now: clock.now, createId: ids, appVersion: '9.9.9', ...extra });
  return { store, storage, clock };
}

function saved(storage: MemoryStorage): ProgressFile {
  return ProgressFileSchema.parse(JSON.parse(storage.getItem(PROGRESS_STORAGE_KEY) ?? 'null'));
}

describe('createProgressStore: loading and saving', () => {
  it('creates a valid profile on first use and saves it', () => {
    const storage = new MemoryStorage();
    const { store } = setup(storage);
    const p = store.get();
    expect(ProgressFileSchema.safeParse(p).success).toBe(true);
    expect(p.player.handle).toBe('intern');
    expect(p.player.email).toBe('intern@lanternlabs.example');
    expect(p.player.id).toMatch(/^player-/);
    expect(store.getLoadStatus()).toBe('new');
    expect(saved(storage).player.id).toBe(p.player.id);
  });

  it('saves under the contract storage key after every change', () => {
    const storage = new MemoryStorage();
    const { store } = setup(storage);
    store.recordResult(levelResult({ levelId: '1.1' }));
    expect(saved(storage).levels['1.1'].completed).toBe(true);
    store.unlockGlossary(['commit']);
    expect(saved(storage).glossary).toEqual(['commit']);
  });

  it('keeps the same player and progress across reloads', () => {
    const storage = new MemoryStorage();
    const first = setup(storage).store;
    first.setProfile({ name: 'Ada Lovelace', classCode: 'CPSC-101' });
    first.recordResult(levelResult({ levelId: '1.1' }));
    const second = setup(storage).store;
    expect(second.getLoadStatus()).toBe('loaded');
    expect(second.get().player).toEqual(first.get().player);
    expect(second.get().levels['1.1'].completed).toBe(true);
  });

  it('backs up corrupt JSON and starts fresh without throwing', () => {
    const storage = new MemoryStorage();
    storage.setItem(PROGRESS_STORAGE_KEY, '{"format": "git-quest-progress", oops');
    const { store } = setup(storage);
    expect(store.getLoadStatus()).toBe('recovered');
    expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe('{"format": "git-quest-progress", oops');
    expect(ProgressFileSchema.safeParse(saved(storage)).success).toBe(true);
  });

  it('backs up data that fails the schema', () => {
    const storage = new MemoryStorage();
    const bad = JSON.stringify({ format: 'git-quest-progress', version: 1, levels: 'nope' });
    storage.setItem(PROGRESS_STORAGE_KEY, bad);
    const { store } = setup(storage);
    expect(store.getLoadStatus()).toBe('recovered');
    expect(storage.getItem(CORRUPT_BACKUP_KEY)).toBe(bad);
    expect(store.get().levels).toEqual({});
  });

  it('keeps working in memory when storage throws', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
      removeItem: () => undefined,
    };
    const { store } = setup(broken);
    expect(store.getLoadStatus()).toBe('unavailable');
    expect(() => store.recordResult(levelResult({ levelId: '1.1' }))).not.toThrow();
    expect(store.get().levels['1.1'].completed).toBe(true);
    expect(store.hasSaveError()).toBe(true);
  });

  it('reports a failed save but keeps the progress in memory', () => {
    const storage = new MemoryStorage();
    const { store } = setup(storage);
    vi.spyOn(storage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    store.awardBadge('first-commit');
    expect(store.hasSaveError()).toBe(true);
    expect(store.get().badges).toEqual(['first-commit']);
  });

  it('works without any storage', () => {
    const store = createProgressStore();
    store.awardBadge('first-commit');
    expect(store.get().badges).toEqual(['first-commit']);
  });

  it('stamps exportedAt with the save time', () => {
    const { store, clock } = setup();
    clock.set('2026-09-05T08:00:00.000Z');
    store.unlockGlossary(['commit']);
    expect(store.get().exportedAt).toBe('2026-09-05T08:00:00.000Z');
  });
});

describe('player ids', () => {
  it('uses crypto.randomUUID when available', () => {
    const spy = vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('11111111-2222-4333-8444-555555555555');
    expect(generatePlayerId()).toBe('11111111-2222-4333-8444-555555555555');
    spy.mockRestore();
  });

  it('falls back to a v4-shaped id without randomUUID', () => {
    const own = Object.getOwnPropertyDescriptor(globalThis.crypto, 'randomUUID');
    Object.defineProperty(globalThis.crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
    try {
      const id = generatePlayerId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(generatePlayerId()).not.toBe(id);
    } finally {
      if (own) Object.defineProperty(globalThis.crypto, 'randomUUID', own);
      else Reflect.deleteProperty(globalThis.crypto, 'randomUUID');
    }
    expect(typeof globalThis.crypto.randomUUID).toBe('function');
  });

  it('gives every new player a random id by default', () => {
    const a = createProgressStore().get().player.id;
    const b = createProgressStore().get().player.id;
    expect(a).not.toBe(b);
  });
});

describe('setProfile', () => {
  it('derives the handle and email when the name changes', () => {
    const { store } = setup();
    store.setProfile({ name: 'Chloé Dubois' });
    expect(store.get().player).toMatchObject({ name: 'Chloé Dubois', handle: 'chloe-dubois', email: 'chloe-dubois@lanternlabs.example' });
  });

  it('stores the class code', () => {
    const { store } = setup();
    store.setProfile({ classCode: 'CPSC-101-F26' });
    expect(store.get().player.classCode).toBe('CPSC-101-F26');
  });

  it('does not notify listeners when nothing changes', () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.setProfile({ name: '' });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('recordAttemptStart and recordResult', () => {
  it('counts an attempt at start and does not double count the result', () => {
    const { store, clock } = setup();
    store.recordAttemptStart('2.5');
    expect(store.get().levels['2.5'].attempts).toBe(1);
    expect(store.get().levels['2.5'].lastPlayedAt).toBe(clock.now().toISOString());
    store.recordResult(levelResult({ levelId: '2.5' }));
    expect(store.get().levels['2.5'].attempts).toBe(1);
  });

  it('counts a result without a start as one attempt', () => {
    const { store } = setup();
    store.recordResult(levelResult({ levelId: '2.5', completed: false, stars: 0 }));
    store.recordResult(levelResult({ levelId: '2.5', completed: false, stars: 0 }));
    expect(store.get().levels['2.5'].attempts).toBe(2);
  });

  it('counts each start once when several starts come before their results', () => {
    const { store } = setup();
    store.recordAttemptStart('2.5');
    store.recordAttemptStart('2.5');
    store.recordResult(levelResult({ levelId: '2.5', completed: false, stars: 0 }));
    store.recordResult(levelResult({ levelId: '2.5' }));
    store.recordResult(levelResult({ levelId: '2.5' }));
    expect(store.get().levels['2.5'].attempts).toBe(3);
  });

  it('records a completed attempt fully', () => {
    const { store, clock } = setup();
    store.recordAttemptStart('1.4');
    clock.advance(90_000);
    store.recordResult(
      levelResult({ levelId: '1.4', stars: 2, commandsUsed: 3, commandsTyped: 7, hintsRevealed: 2, errors: 1, errorCodes: { 'nothing-added': 1 }, rewinds: 1, timeMs: 90_500 }),
    );
    expect(store.get().levels['1.4']).toEqual({
      levelId: '1.4',
      completed: true,
      stars: 2,
      attempts: 1,
      completions: 1,
      timeSpentSec: 90.5,
      bestTimeSec: 90.5,
      bestCommands: 3,
      hintsUsed: 2,
      maxHintTier: 2,
      commandsTyped: 7,
      errors: 1,
      errorCodes: { 'nothing-added': 1 },
      rewinds: 1,
      firstCompletedAt: '2026-09-01T10:01:30.000Z',
      lastPlayedAt: '2026-09-01T10:01:30.000Z',
    });
  });

  it('never lowers stars, completion or bests after a worse attempt', () => {
    const { store, clock } = setup();
    store.recordResult(levelResult({ levelId: '3.6', stars: 3, timeMs: 40_000, commandsUsed: 2 }));
    const first = store.get().levels['3.6'];
    clock.advance(60_000);
    store.recordResult(levelResult({ levelId: '3.6', completed: false, stars: 0, timeMs: 20_000, commandsUsed: 1 }));
    clock.advance(60_000);
    store.recordResult(levelResult({ levelId: '3.6', stars: 1, timeMs: 80_000, commandsUsed: 6 }));
    const p = store.get().levels['3.6'];
    expect(p).toMatchObject({ completed: true, stars: 3, bestTimeSec: 40, bestCommands: 2, attempts: 3, completions: 2, timeSpentSec: 140 });
    expect(p.firstCompletedAt).toBe(first.firstCompletedAt);
    expect(p.lastPlayedAt).toBe('2026-09-01T10:02:00.000Z');
  });

  it('improves bests with a better attempt', () => {
    const { store } = setup();
    store.recordResult(levelResult({ levelId: '4.5', stars: 1, timeMs: 100_000, commandsUsed: 5 }));
    store.recordResult(levelResult({ levelId: '4.5', stars: 3, timeMs: 30_000, commandsUsed: 2 }));
    expect(store.get().levels['4.5']).toMatchObject({ stars: 3, bestTimeSec: 30, bestCommands: 2 });
  });

  it('sums hints and keeps the highest tier', () => {
    const { store } = setup();
    store.recordResult(levelResult({ levelId: '5.3', completed: false, stars: 0, hintsRevealed: 3 }));
    store.recordResult(levelResult({ levelId: '5.3', hintsRevealed: 1, stars: 3 }));
    expect(store.get().levels['5.3']).toMatchObject({ hintsUsed: 4, maxHintTier: 3 });
  });

  it('merges error codes and sums typed commands, errors and rewinds', () => {
    const { store } = setup();
    store.recordResult(levelResult({ levelId: '6.6', completed: false, stars: 0, errors: 2, commandsTyped: 5, rewinds: 1, errorCodes: { 'push-rejected': 2 } }));
    store.recordResult(levelResult({ levelId: '6.6', errors: 3, commandsTyped: 6, rewinds: 2, errorCodes: { 'push-rejected': 1, 'not-a-repo': 2 } }));
    expect(store.get().levels['6.6']).toMatchObject({
      errors: 5,
      commandsTyped: 11,
      rewinds: 3,
      errorCodes: { 'push-rejected': 3, 'not-a-repo': 2 },
    });
  });

  it('adds abandoned attempts to the time spent', () => {
    const { store } = setup();
    store.recordResult(levelResult({ levelId: '2.3', completed: false, stars: 0, timeMs: 45_000 }));
    store.recordResult(levelResult({ levelId: '2.3', timeMs: 30_000 }));
    expect(store.get().levels['2.3']).toMatchObject({ timeSpentSec: 75, bestTimeSec: 30, completions: 1, attempts: 2 });
  });

  it('cleans impossible numbers instead of saving invalid data', () => {
    const storage = new MemoryStorage();
    const { store } = setup(storage);
    store.recordResult(levelResult({ levelId: '1.1', timeMs: Number.NaN, commandsTyped: -3, errors: 1.7 }));
    expect(store.get().levels['1.1']).toMatchObject({ timeSpentSec: 0, commandsTyped: 0, errors: 2 });
    expect(ProgressFileSchema.safeParse(saved(storage)).success).toBe(true);
  });

  it('ignores a result without a level id', () => {
    const { store } = setup();
    const before = store.get();
    store.recordResult(levelResult({ levelId: '' }));
    store.recordAttemptStart('');
    expect(store.get()).toBe(before);
  });
});

describe('glossary, badges, sandbox', () => {
  it('unlocks glossary terms once each', () => {
    const { store } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    store.unlockGlossary(['commit', 'branch']);
    store.unlockGlossary(['branch']);
    expect(store.get().glossary).toEqual(['commit', 'branch']);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('awards badges once each', () => {
    const { store } = setup();
    store.awardBadge('first-commit');
    store.awardBadge('first-commit');
    expect(store.get().badges).toEqual(['first-commit']);
  });

  it('adds sandbox minutes and ignores bad values', () => {
    const { store } = setup();
    store.addSandboxMinutes(2.5);
    store.addSandboxMinutes(-1);
    store.addSandboxMinutes(Number.NaN);
    store.addSandboxMinutes(1.25);
    expect(store.get().sandboxMinutes).toBe(3.75);
  });
});

describe('subscribe', () => {
  it('notifies with the new state and stops after unsubscribe', () => {
    const { store } = setup();
    const listener = vi.fn();
    const off = store.subscribe(listener);
    store.awardBadge('a');
    expect(listener).toHaveBeenCalledWith(store.get());
    off();
    store.awardBadge('b');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('exportFile and importFile', () => {
  it('exports pretty JSON with a fresh exportedAt and a valid checksum', () => {
    const { store, clock } = setup();
    store.setProfile({ name: 'Ada' });
    store.recordResult(levelResult({ levelId: '1.1' }));
    clock.set('2026-09-30T15:00:00.000Z');
    const text = store.exportFile();
    expect(text).toContain('\n  "format": "git-quest-progress"');
    const file = ProgressFileSchema.parse(JSON.parse(text));
    expect(file.exportedAt).toBe('2026-09-30T15:00:00.000Z');
    expect(file.appVersion).toBe('9.9.9');
    expect(file.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(verifyChecksum(file)).toBe(true);
  });

  it('does not change the saved progress when exporting', () => {
    const { store } = setup();
    const before = store.get();
    store.exportFile();
    store.exportCsv();
    expect(store.get()).toBe(before);
    expect(before.checksum).toBeUndefined();
  });

  it('round-trips through import into another browser', () => {
    const a = setup().store;
    a.setProfile({ name: 'Bao Tran', classCode: 'X1' });
    a.recordResult(levelResult({ levelId: '2.2', stars: 2 }));
    a.unlockGlossary(['staging-area']);
    a.addSandboxMinutes(4);
    const b = setup().store;
    expect(b.importFile(a.exportFile())).toEqual({ ok: true });
    const { exportedAt: _a, ...restB } = b.get();
    const { exportedAt: _b, ...restA } = a.get();
    expect(restB).toEqual(restA);
    expect(b.get().checksum).toBeUndefined();
  });

  it('accepts a file with a byte-order mark and Windows line ends', () => {
    const a = setup().store;
    a.recordResult(levelResult({ levelId: '1.2' }));
    const text = `${CSV_BOM}${a.exportFile().replace(/\n/g, '\r\n')}`;
    const b = setup().store;
    expect(b.importFile(text)).toEqual({ ok: true });
    expect(b.get().levels['1.2'].completed).toBe(true);
  });

  it('refuses a file that was edited after export', () => {
    const a = setup().store;
    a.recordResult(levelResult({ levelId: '1.1', stars: 1 }));
    const file = JSON.parse(a.exportFile()) as ProgressFile;
    file.levels['1.1'].stars = 3;
    const b = setup().store;
    const before = b.get();
    expect(b.importFile(JSON.stringify(file))).toEqual({ ok: false, error: STRINGS.classroom.importError.checksum });
    expect(b.get()).toBe(before);
  });

  it('refuses a file without a checksum', () => {
    const a = setup().store;
    const file = JSON.parse(a.exportFile()) as ProgressFile;
    delete file.checksum;
    const result = setup().store.importFile(JSON.stringify(file));
    expect(result).toEqual({ ok: false, error: STRINGS.classroom.importError.checksum });
  });

  it('accepts an edited file once its checksum is recomputed (the checksum is not security)', () => {
    const a = setup().store;
    a.recordResult(levelResult({ levelId: '1.1', stars: 1 }));
    const file = JSON.parse(a.exportFile()) as ProgressFile;
    file.levels['1.1'].stars = 3;
    const b = setup().store;
    expect(b.importFile(JSON.stringify(withChecksum(file)))).toEqual({ ok: true });
    expect(b.get().levels['1.1'].stars).toBe(3);
  });

  it.each([
    ['', /empty/i],
    ['   ', /empty/i],
    ['hello there', /not a Git Quest progress file/i],
    ['{"name": "something else"}', /not a Git Quest progress file/i],
    ['[1, 2, 3]', /not a Git Quest progress file/i],
    [JSON.stringify({ format: 'git-quest-progress', version: 7 }), /newer version.*format 7/i],
    [JSON.stringify({ format: 'git-quest-progress', version: 0 }), /old version.*format 0/i],
    [JSON.stringify({ format: 'git-quest-progress', version: 1, player: {} }), /damaged/i],
  ])('refuses %j with a friendly message', (text, message) => {
    const { store } = setup();
    const before = store.get();
    const result = store.importFile(text);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(message);
      expect(result.error).not.toMatch(/[{}]/);
    }
    expect(store.get()).toBe(before);
  });

  it('refuses a huge file before parsing it', () => {
    const { store } = setup();
    const result = store.importFile(`{"format":"git-quest-progress","pad":"${'x'.repeat(5 * 1024 * 1024)}"}`);
    expect(result).toEqual({ ok: false, error: STRINGS.classroom.importError.tooLarge });
  });

  it('notifies listeners after an import', () => {
    const a = setup().store;
    a.recordResult(levelResult({ levelId: '1.1' }));
    const b = setup().store;
    const listener = vi.fn();
    b.subscribe(listener);
    b.importFile(a.exportFile());
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('exportCsv', () => {
  it('uses the injected curriculum', () => {
    const { store, clock } = setup(new MemoryStorage(), { chapters: TINY_CHAPTERS });
    store.setProfile({ name: 'Ada Lovelace', classCode: 'CPSC-101' });
    store.recordResult(levelResult({ levelId: '1.1', stars: 2, hintsRevealed: 1, errors: 2, timeMs: 61_400 }));
    clock.set('2026-09-30T15:00:00.000Z');
    const csv = store.exportCsv();
    expect(csv.startsWith(CSV_BOM)).toBe(true);
    const lines = csv.slice(CSV_BOM.length).split('\r\n');
    expect(lines.slice(0, 4)).toEqual(['Name,Ada Lovelace', 'Handle,ada-lovelace', 'Class code,CPSC-101', 'Exported at,2026-09-30T15:00:00.000Z']);
    expect(lines.slice(6, 9)).toEqual([
      '0.1,Where am I?,no,0,0,0,0,0,0,0,',
      '1.1,Tell git who you are,yes,2,1,1,61,1,1,2,2026-09-01T10:00:00.000Z',
      '1.2,"Boss: start the ""festival"", repo",no,0,0,0,0,0,0,0,',
    ]);
  });

  it('defaults to content/chapters.json with one row per level in curriculum order', () => {
    const { store } = setup();
    const lines = store.exportCsv().slice(CSV_BOM.length).trimEnd().split('\r\n');
    const order = getChapters().chapters.flatMap((c) => c.levels.map((l) => l.id));
    expect(order.length).toBeGreaterThan(0);
    expect(lines.slice(6).map((line) => line.split(',')[0])).toEqual(order);
  });
});

describe('reset', () => {
  it('clears progress but keeps the profile by default', () => {
    const { store } = setup();
    store.setProfile({ name: 'Ada', classCode: 'C1' });
    store.recordResult(levelResult({ levelId: '1.1' }));
    store.unlockGlossary(['commit']);
    store.awardBadge('first-commit');
    store.addSandboxMinutes(3);
    const player = store.get().player;
    store.reset();
    expect(store.get().player).toEqual(player);
    expect(store.get().levels).toEqual({});
    expect(store.get().glossary).toEqual([]);
    expect(store.get().badges).toEqual([]);
    expect(store.get().sandboxMinutes).toBe(0);
  });

  it('can forget the profile too', () => {
    const { store } = setup();
    store.setProfile({ name: 'Ada' });
    const oldId = store.get().player.id;
    store.reset({ keepProfile: false });
    expect(store.get().player.name).toBe('');
    expect(store.get().player.id).not.toBe(oldId);
  });

  it('saves the reset progress', () => {
    const storage = new MemoryStorage();
    const { store } = setup(storage);
    store.recordResult(levelResult({ levelId: '1.1' }));
    store.reset();
    expect(saved(storage).levels).toEqual({});
  });
});
