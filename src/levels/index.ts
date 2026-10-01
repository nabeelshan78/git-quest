/**
 * Public API of the level runner.
 */
import type { GameSession, SessionOptions } from '../shared/session';
import { GameSessionImpl } from './session';

export { loadLevels, getLevel, getChapters, getGlossary, levelOrder } from './content';
export { playSolution } from './playSolution';
export { translateError, getErrorEntries } from './errors';
export { computeStars, projectStars } from './scoring';
export { evaluateGoals, allGoalsMet } from './goals';
export type { GoalContext } from './goals';
export { runSetup, substituteTemplates, substituteLevel } from './setup';

/** Create a playable session for a level (or the sandbox). */
export function createSession(options: SessionOptions): GameSession {
  return new GameSessionImpl(options);
}
