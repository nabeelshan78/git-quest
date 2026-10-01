import { describe, expect, it } from 'vitest';
import { evaluateGoals, allGoalsMet } from '../../../src/levels/goals';
import type { GoalContext } from '../../../src/levels/goals';
import type { GoalItem } from '../../../src/shared/level';
import { createWorld, createMachine } from '../../../src/engine/core/world';
import { runLine } from '../../../src/parser/index';
import { MAIN_MACHINE_ID } from '../../../src/shared/constants';

function makeContext(overrides?: Partial<GoalContext>): GoalContext {
  const { produce } = require('immer');
  let world = createWorld();
  // Set user identity so commits work
  world = produce(world, (draft: any) => {
    draft.machines[MAIN_MACHINE_ID].globalConfig['user.name'] = 'Test User';
    draft.machines[MAIN_MACHINE_ID].globalConfig['user.email'] = 'test@example.com';
  });
  return {
    world,
    defaultMachine: MAIN_MACHINE_ID,
    defaultRepoPath: '/home/intern',
    answeredQuestions: new Set(),
    storyRead: false,
    commandsRun: new Map(),
    ...overrides,
  };
}

function initRepo(ctx: GoalContext): GoalContext {
  let result = runLine(ctx.world, MAIN_MACHINE_ID, 'git init');
  return { ...ctx, world: result.state };
}

describe('Goal Checks', () => {
  describe('storyRead', () => {
    it('returns false when story not read', () => {
      const ctx = makeContext();
      const items: GoalItem[] = [{ text: 'Read the story', checks: [{ type: 'storyRead' }] }];
      const result = evaluateGoals(items, ctx);
      expect(result[0].done).toBe(false);
    });

    it('returns true when story is read', () => {
      const ctx = makeContext({ storyRead: true });
      const items: GoalItem[] = [{ text: 'Read the story', checks: [{ type: 'storyRead' }] }];
      const result = evaluateGoals(items, ctx);
      expect(result[0].done).toBe(true);
    });
  });

  describe('answered', () => {
    it('checks if a question was answered', () => {
      const ctx = makeContext({ answeredQuestions: new Set(['q1']) });
      const items: GoalItem[] = [{ text: 'Answer q1', checks: [{ type: 'answered', question: 'q1' }] }];
      expect(evaluateGoals(items, ctx)[0].done).toBe(true);
    });
  });

  describe('ranCommand', () => {
    it('checks if a command was run', () => {
      const cmds = new Map([['pwd', 2]]);
      const ctx = makeContext({ commandsRun: cmds });
      const items: GoalItem[] = [{ text: 'Run pwd', checks: [{ type: 'ranCommand', command: 'pwd' }] }];
      expect(evaluateGoals(items, ctx)[0].done).toBe(true);
    });
  });

  describe('fileExists / fileMissing', () => {
    it('checks if a file exists', () => {
      const ctx = makeContext();
      // Write a file to the machine's fs
      const { produce } = require('immer');
      const world = produce(ctx.world, (draft: any) => {
        draft.machines[MAIN_MACHINE_ID].fs.files['/home/intern/test.txt'] = 'hello';
      });
      const ctx2 = { ...ctx, world };
      const items: GoalItem[] = [{ text: 'Create test.txt', checks: [{ type: 'fileExists', path: 'test.txt' }] }];
      expect(evaluateGoals(items, ctx2)[0].done).toBe(true);

      const items2: GoalItem[] = [{ text: 'No file', checks: [{ type: 'fileMissing', path: 'missing.txt' }] }];
      expect(evaluateGoals(items2, ctx2)[0].done).toBe(true);
    });
  });

  describe('fileContent', () => {
    it('checks file content with contains', () => {
      const { produce } = require('immer');
      const ctx = makeContext();
      const world = produce(ctx.world, (draft: any) => {
        draft.machines[MAIN_MACHINE_ID].fs.files['/home/intern/test.txt'] = 'hello world';
      });
      const ctx2 = { ...ctx, world };
      const items: GoalItem[] = [{
        text: 'Check content',
        checks: [{ type: 'fileContent', path: 'test.txt', contains: 'hello' }],
      }];
      expect(evaluateGoals(items, ctx2)[0].done).toBe(true);
    });
  });

  describe('repoExists / repoMissing', () => {
    it('checks repo existence', () => {
      const ctx = makeContext();
      const items: GoalItem[] = [{ text: 'No repo', checks: [{ type: 'repoMissing' }] }];
      expect(evaluateGoals(items, ctx)[0].done).toBe(true);

      const ctx2 = initRepo(ctx);
      const items2: GoalItem[] = [{ text: 'Has repo', checks: [{ type: 'repoExists' }] }];
      expect(evaluateGoals(items2, ctx2)[0].done).toBe(true);
    });
  });

  describe('branchExists / currentBranch', () => {
    it('checks branch existence and current branch', () => {
      let ctx = initRepo(makeContext());
      // Make an initial commit so refs exist
      let r = runLine(ctx.world, MAIN_MACHINE_ID, 'git commit --allow-empty -m "init"');
      ctx = { ...ctx, world: r.state };

      const items: GoalItem[] = [{ text: 'On main', checks: [{ type: 'currentBranch', name: 'main' }] }];
      expect(evaluateGoals(items, ctx)[0].done).toBe(true);

      const items2: GoalItem[] = [{ text: 'Branch exists', checks: [{ type: 'branchExists', name: 'main' }] }];
      expect(evaluateGoals(items2, ctx)[0].done).toBe(true);

      const items3: GoalItem[] = [{ text: 'Missing branch', checks: [{ type: 'branchMissing', name: 'feature' }] }];
      expect(evaluateGoals(items3, ctx)[0].done).toBe(true);
    });
  });

  describe('not / anyOf / allOf', () => {
    it('negates a check', () => {
      const ctx = makeContext();
      const items: GoalItem[] = [{
        text: 'Not read',
        checks: [{ type: 'not', check: { type: 'storyRead' } }],
      }];
      expect(evaluateGoals(items, ctx)[0].done).toBe(true);
    });

    it('anyOf passes when any check passes', () => {
      const ctx = makeContext({ storyRead: true });
      const items: GoalItem[] = [{
        text: 'Any',
        checks: [{ type: 'anyOf', checks: [{ type: 'storyRead' }, { type: 'answered', question: 'q1' }] }],
      }];
      expect(evaluateGoals(items, ctx)[0].done).toBe(true);
    });

    it('allOf fails when any check fails', () => {
      const ctx = makeContext({ storyRead: true });
      const items: GoalItem[] = [{
        text: 'All',
        checks: [{ type: 'allOf', checks: [{ type: 'storyRead' }, { type: 'answered', question: 'q1' }] }],
      }];
      expect(evaluateGoals(items, ctx)[0].done).toBe(false);
    });
  });

  describe('allGoalsMet', () => {
    it('returns true when all goals are met', () => {
      const ctx = makeContext({ storyRead: true });
      const items: GoalItem[] = [{ text: 'Read story', checks: [{ type: 'storyRead' }] }];
      expect(allGoalsMet(items, ctx)).toBe(true);
    });

    it('returns false when any goal is not met', () => {
      const ctx = makeContext();
      const items: GoalItem[] = [{ text: 'Read story', checks: [{ type: 'storyRead' }] }];
      expect(allGoalsMet(items, ctx)).toBe(false);
    });
  });
});
