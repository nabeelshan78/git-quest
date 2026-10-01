/**
 * Public API of the level runner.
 * @stub-owner levels — the Level runner workstream implements createSession
 * and the helpers below, keeping these signatures.
 */
import type { LevelDefinition } from '../shared/level';
import type { ProgressFile } from '../shared/progress';
import type { GameSession, SessionOptions } from '../shared/session';

export { loadLevels, getLevel, getChapters, getGlossary, levelOrder } from './content';

/** Create a playable session for a level (or the sandbox). */
export function createSession(_options: SessionOptions): GameSession {
  throw new Error('createSession is not available yet');
}

/**
 * Pick the daily-practice levels (3 short puzzles from chapters the player
 * has completed) deterministically from the date ("YYYY-MM-DD").
 */
export function pickDailyLevels(_date: string, _progress: ProgressFile, _levels: LevelDefinition[]): string[] {
  return [];
}
