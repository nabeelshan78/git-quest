/**
 * Differential tests: git init, git config
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git init', () => {
  it('creates a repo', () => {
    run({
      name: 'init-basic',
      steps: [{ git: ['init'] }],
    });
  });

  it('creates a repo with custom branch name', () => {
    run({
      name: 'init-branch',
      steps: [{ git: ['init', '-b', 'develop'] }],
    });
  });

  it('reinitializes an existing repo', () => {
    run({
      name: 'init-reinit',
      steps: [
        { git: ['init'] },
        { git: ['init'] },
      ],
    });
  });

  it('creates a repo quietly', () => {
    run({
      name: 'init-quiet',
      steps: [{ git: ['init', '-q'] }],
    });
  });
});

describe('git config', () => {
  it('sets and gets a value', () => {
    run({
      name: 'config-set-get',
      steps: [
        { git: ['init'] },
        { git: ['config', 'user.name', 'Alice'] },
        { git: ['config', 'user.name'], output: true },
      ],
    });
  });

  it('sets global config', () => {
    run({
      name: 'config-global',
      steps: [
        { git: ['init'] },
        { git: ['config', '--global', 'user.name', 'Bob'] },
        { git: ['config', '--global', 'user.name'], output: true },
      ],
    });
  });

  it('lists config', () => {
    run({
      name: 'config-list',
      steps: [
        { git: ['init'] },
        { git: ['config', 'test.key', 'hello'] },
      ],
      compare: { config: ['test.key'] },
    });
  });

  it('unsets config', () => {
    run({
      name: 'config-unset',
      steps: [
        { git: ['init'] },
        { git: ['config', 'test.key', 'hello'] },
        { git: ['config', '--unset', 'test.key'] },
      ],
      compare: { config: ['test.key'] },
    });
  });
});
