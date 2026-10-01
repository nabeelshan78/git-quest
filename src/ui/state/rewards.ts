/**
 * Stars, badges and cosmetic unlocks (pure). Stars never unlock content.
 */
import type { ChaptersFile, LevelDefinition } from '../../shared/level';
import type { ProgressFile } from '../../shared/progress';

export function totalStars(progress: ProgressFile): number {
  let n = 0;
  for (const l of Object.values(progress.levels)) n += l.stars;
  return n;
}

export function completedIds(progress: ProgressFile): Set<string> {
  return new Set(
    Object.values(progress.levels)
      .filter((l) => l.completed)
      .map((l) => l.levelId),
  );
}

/** First level in curriculum order that is not completed yet (null when all are done). */
export function suggestedNextLevel(progress: ProgressFile, order: string[]): string | null {
  const done = completedIds(progress);
  return order.find((id) => !done.has(id)) ?? null;
}

/** The level after `id` in curriculum order, or null at the end. */
export function nextLevelId(id: string, order: string[]): string | null {
  const i = order.indexOf(id);
  return i >= 0 && i + 1 < order.length ? order[i + 1] : null;
}

export interface ChapterProgress {
  number: number;
  completed: number;
  total: number;
  stars: number;
  maxStars: number;
}

export function chapterProgress(progress: ProgressFile, chapters: ChaptersFile): ChapterProgress[] {
  return chapters.chapters.map((c) => {
    let completed = 0;
    let stars = 0;
    for (const l of c.levels) {
      const p = progress.levels[l.id];
      if (p?.completed) completed++;
      stars += p?.stars ?? 0;
    }
    return { number: c.number, completed, total: c.levels.length, stars, maxStars: c.levels.length * 3 };
  });
}

// ---------------------------------------------------------------------------
// Terminal themes (cosmetic rewards)
// ---------------------------------------------------------------------------

/** Stars needed for each terminal theme. Accessibility themes are always free. */
export const TERMINAL_THEME_UNLOCKS: { id: string; stars: number }[] = [
  { id: 'lantern', stars: 0 },
  { id: 'paper', stars: 0 },
  { id: 'contrast', stars: 0 },
  { id: 'river', stars: 15 },
  { id: 'festival', stars: 45 },
  { id: 'aurora', stars: 90 },
  { id: 'golden', stars: 180 },
];

export function starsNeededForTheme(id: string): number {
  return TERMINAL_THEME_UNLOCKS.find((t) => t.id === id)?.stars ?? 0;
}

export function isThemeUnlocked(id: string, stars: number): boolean {
  return stars >= starsNeededForTheme(id);
}

// ---------------------------------------------------------------------------
// Badges
// ---------------------------------------------------------------------------

export type BadgeKind = 'first-level' | 'chapter' | 'stars' | 'challenge' | 'daily' | 'sandbox';

export interface BadgeDef {
  id: string;
  kind: BadgeKind;
  /** Chapter number for chapter badges; star count / streak / minutes for the others. */
  value: number;
}

const STAR_MILESTONES = [25, 100, 200, 273];

export function badgeDefinitions(chapters: ChaptersFile): BadgeDef[] {
  return [
    { id: 'first-level', kind: 'first-level', value: 1 },
    ...chapters.chapters.map((c) => ({ id: `chapter-${c.number}`, kind: 'chapter' as const, value: c.number })),
    ...STAR_MILESTONES.map((n) => ({ id: `stars-${n}`, kind: 'stars' as const, value: n })),
    { id: 'challenge-1', kind: 'challenge', value: 1 },
    { id: 'daily-3', kind: 'daily', value: 3 },
    { id: 'sandbox-15', kind: 'sandbox', value: 15 },
  ];
}

export function isBadgeEarned(badge: BadgeDef, progress: ProgressFile, chapters: ChaptersFile): boolean {
  const done = completedIds(progress);
  switch (badge.kind) {
    case 'first-level':
      return done.size >= 1;
    case 'chapter': {
      const ch = chapters.chapters.find((c) => c.number === badge.value);
      return !!ch && ch.levels.length > 0 && ch.levels.every((l) => done.has(l.id));
    }
    case 'stars':
      return totalStars(progress) >= badge.value;
    case 'challenge':
      return Object.values(progress.levels).filter((l) => l.challenge?.completed).length >= badge.value;
    case 'daily':
      return progress.daily.streak >= badge.value;
    case 'sandbox':
      return progress.sandboxMinutes >= badge.value;
  }
}

/** Badges whose condition holds but which are not recorded yet. */
export function newlyEarnedBadges(progress: ProgressFile, chapters: ChaptersFile): string[] {
  const have = new Set(progress.badges);
  return badgeDefinitions(chapters)
    .filter((b) => !have.has(b.id) && isBadgeEarned(b, progress, chapters))
    .map((b) => b.id);
}

/** Cheat-card entries from completed levels, in curriculum order, without duplicates. */
export function cheatSheetFor(progress: ProgressFile, levels: LevelDefinition[]): { command: string; summary: string; levelId: string }[] {
  const done = completedIds(progress);
  const seen = new Set<string>();
  const out: { command: string; summary: string; levelId: string }[] = [];
  for (const l of levels) {
    if (!done.has(l.id)) continue;
    for (const e of l.cheatSheet ?? []) {
      if (seen.has(e.command)) continue;
      seen.add(e.command);
      out.push({ ...e, levelId: l.id });
    }
  }
  return out;
}
