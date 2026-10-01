/**
 * Generated demo students so a professor can preview the dashboard before
 * any real files arrive. Deterministic for a given seed and date.
 */
import type { LevelProgress, ProgressFile } from '../shared/progress';
import type { Curriculum } from './aggregate';
import { verifyChecksum, withChecksum } from './checksum';
import { createEmptyProgress, deriveHandle, defaultEmail } from './progressLogic';

/** Small deterministic random generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SAMPLE_NAMES = [
  'Alex Rivera',
  'Bao Tran',
  'Chloé Dubois',
  'Dev Patel',
  'Emeka Obi',
  'Fatima Zahra',
  'Grace Kim',
  'Hiro Tanaka',
  'Isabel Souza',
  'Jonas Berg',
  'Kavya Rao',
  'Liam Murphy',
];

/** How far each demo student got (levels started, in curriculum order). */
const SAMPLE_DEPTHS = [91, 80, 67, 58, 49, 41, 34, 27, 19, 12, 62, 45];

export const SAMPLE_CLASS_CODES = ['DEMO-101-A', 'DEMO-101-B'];

/** Levels the demo class finds hard (more hints and errors). */
const HARD_LEVELS = new Set(['2.5', '3.4', '5.3', '5.6', '6.7', '7.8', '9.4', '10.3', '10.6']);

const SAMPLE_ERRORS = [
  'nothing-added-to-commit',
  'not-a-git-repository',
  'pathspec-did-not-match',
  'merge-conflict',
  'push-rejected',
  'detached-head',
  'unmerged-paths',
  'unknown-command',
];

export interface SampleOptions {
  /** Number of demo students (1-12, default 10). */
  count?: number;
  seed?: number;
  /** "Today" for the demo (export dates are a few days before it). */
  now?: Date;
}

function pick<T>(rand: () => number, items: T[]): T {
  return items[Math.floor(rand() * items.length) % items.length];
}

/** Demo progress files. The last student's file was edited after export (checksum warning). */
export function generateSampleClass(curriculum: Curriculum, options: SampleOptions = {}): ProgressFile[] {
  const count = Math.max(1, Math.min(SAMPLE_NAMES.length, options.count ?? 10));
  const seed = options.seed ?? 2026;
  const now = options.now ?? new Date();
  const files: ProgressFile[] = [];
  const day = 86_400_000;
  const start = now.getTime() - 42 * day;

  for (let i = 0; i < count; i++) {
    const rand = seededRandom(seed * 31 + i * 7919);
    const name = SAMPLE_NAMES[i];
    const handle = deriveHandle(name);
    const skill = 0.25 + rand() * 0.7;
    const depth = Math.min(curriculum.totalLevels, SAMPLE_DEPTHS[i]);
    const createdAt = new Date(start + rand() * 2 * day).toISOString();
    const base = createEmptyProgress(`demo-${String(i + 1).padStart(4, '0')}-${handle}`, createdAt, 'demo');
    const levels: Record<string, LevelProgress> = {};
    const span = now.getTime() - 2 * day - new Date(createdAt).getTime();

    for (let idx = 0; idx < depth; idx++) {
      const level = curriculum.levels[idx];
      const hard = HARD_LEVELS.has(level.id);
      const difficulty = 0.2 + (hard ? 0.45 : 0) + (level.boss ? 0.25 : 0);
      const struggle = difficulty * (1.3 - skill);
      const completed = idx < depth - 1 || rand() < 0.4;
      const attempts = 1 + Math.floor(rand() * struggle * 4);
      let maxHintTier = 0;
      for (const threshold of [0.15, 0.3, 0.45]) if (rand() < struggle * 1.2 && rand() > threshold) maxHintTier++;
      if (hard && rand() < struggle) maxHintTier = 3;
      const hintsUsed = maxHintTier + (maxHintTier > 0 && attempts > 1 ? Math.floor(rand() * 2) : 0);
      const errors = Math.floor(rand() * struggle * 7);
      const errorCodes: Record<string, number> = {};
      for (let e = 0; e < errors; e++) {
        const code = pick(rand, SAMPLE_ERRORS);
        errorCodes[code] = (errorCodes[code] ?? 0) + 1;
      }
      const time = Math.round((90 + rand() * 180) * (1 + difficulty * 2) * (1.4 - skill) * attempts);
      const stars = !completed ? 0 : maxHintTier >= 3 ? 1 : maxHintTier === 2 || rand() < struggle ? 2 : 3;
      const playedAt = new Date(new Date(createdAt).getTime() + (span * (idx + 1)) / Math.max(depth, 1)).toISOString();
      const challengeDone = level.boss && completed && skill > 0.7 && rand() < 0.6;
      levels[level.id] = {
        levelId: level.id,
        completed,
        stars,
        attempts,
        completions: completed ? 1 + (rand() < 0.1 ? 1 : 0) : 0,
        timeSpentSec: time,
        bestTimeSec: completed ? Math.round(time / attempts) : null,
        bestCommands: completed ? 1 + Math.floor(rand() * 6) : null,
        hintsUsed,
        maxHintTier,
        commandsTyped: 2 + Math.floor(rand() * 10) + errors,
        errors,
        errorCodes,
        rewinds: Math.floor(rand() * struggle * 3),
        firstCompletedAt: completed ? playedAt : null,
        lastPlayedAt: playedAt,
        challenge: challengeDone ? { completed: true, bestTimeSec: Math.round(time * 0.6), bestCommands: 4 + Math.floor(rand() * 5) } : null,
      };
    }

    const exportedAt = new Date(now.getTime() - (1 + rand() * 3) * day).toISOString();
    const streak = Math.floor(rand() * 5);
    const history = Array.from({ length: streak }, (_, d) => ({
      date: new Date(now.getTime() - (streak - d + 1) * day).toISOString().slice(0, 10),
      levels: [curriculum.levels[d % curriculum.levels.length].id],
      completed: 1,
    }));
    const file: ProgressFile = {
      ...base,
      exportedAt,
      player: {
        ...base.player,
        name,
        handle,
        email: defaultEmail(handle),
        classCode: SAMPLE_CLASS_CODES[i % SAMPLE_CLASS_CODES.length],
      },
      levels,
      glossary: [],
      badges: depth >= 30 ? ['first-commit'] : [],
      daily: { streak, lastDate: history.at(-1)?.date ?? null, history },
      sandboxMinutes: Math.round(rand() * 40),
    };
    let signed = withChecksum(file);
    if (i === count - 1 && count > 1) {
      // Demo of a hand-edited file: hints wiped and stars raised after export, so the checksum no longer matches.
      const edited = { ...signed.levels };
      for (const id of Object.keys(edited)) {
        edited[id] = { ...edited[id], stars: edited[id].completed ? 3 : 0, hintsUsed: 0, maxHintTier: 0 };
      }
      signed = { ...signed, levels: edited };
      if (verifyChecksum(signed)) signed = { ...signed, checksum: '00000000' };
    }
    files.push(signed);
  }
  return files;
}
