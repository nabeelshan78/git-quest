/**
 * Differential tests: git merge, git revert
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git merge', () => {
  it('fast-forward merge', () => {
    run({
      name: 'merge-ff',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'base\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'base'] },
        { git: ['branch', 'feature'] },
        { git: ['switch', 'feature'] },
        { write: { 'g.txt': 'new\n' } },
        { git: ['add', 'g.txt'] },
        { git: ['commit', '-m', 'feature'] },
        { git: ['switch', 'main'] },
        { git: ['merge', 'feature'] },
      ],
      compare: { reflog: true, origHead: true },
    });
  });

  it('three-way merge (clean)', () => {
    run({
      name: 'merge-3way',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'base\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'base'] },
        { git: ['branch', 'feature'] },
        { write: { 'main.txt': 'main\n' } },
        { git: ['add', 'main.txt'] },
        { git: ['commit', '-m', 'main change'] },
        { git: ['switch', 'feature'] },
        { write: { 'feat.txt': 'feature\n' } },
        { git: ['add', 'feat.txt'] },
        { git: ['commit', '-m', 'feature change'] },
        { git: ['switch', 'main'] },
        { git: ['merge', 'feature'] },
      ],
      compare: { origHead: true },
    });
  });

  it('merge with conflict', () => {
    run({
      name: 'merge-conflict',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'base\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'base'] },
        { git: ['branch', 'feature'] },
        { write: { 'f.txt': 'main version\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'main'] },
        { git: ['switch', 'feature'] },
        { write: { 'f.txt': 'feature version\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'feature'] },
        { git: ['switch', 'main'] },
        { git: ['merge', 'feature'], exitCode: 'zero-or-not' },
        // Resolve conflict
        { write: { 'f.txt': 'resolved\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'merged'] },
      ],
      compare: { origHead: true },
    });
  });

  it('merge --abort', () => {
    run({
      name: 'merge-abort',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'base\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'base'] },
        { git: ['branch', 'feature'] },
        { write: { 'f.txt': 'main\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'main'] },
        { git: ['switch', 'feature'] },
        { write: { 'f.txt': 'feature\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'feature'] },
        { git: ['switch', 'main'] },
        { git: ['merge', 'feature'], exitCode: 'zero-or-not' },
        { git: ['merge', '--abort'] },
      ],
      compare: { origHead: true },
    });
  });

  it('merge --no-ff', () => {
    run({
      name: 'merge-no-ff',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'base\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'base'] },
        { git: ['branch', 'feature'] },
        { git: ['switch', 'feature'] },
        { write: { 'g.txt': 'new\n' } },
        { git: ['add', 'g.txt'] },
        { git: ['commit', '-m', 'feature'] },
        { git: ['switch', 'main'] },
        { git: ['merge', '--no-ff', 'feature', '-m', 'merge feature'] },
      ],
    });
  });
});

describe('git revert', () => {
  it('reverts a commit', () => {
    run({
      name: 'revert-basic',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'original\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'changed\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'change'] },
        { git: ['revert', '--no-edit', 'HEAD'] },
      ],
    });
  });

  it('reverts with --no-commit', () => {
    run({
      name: 'revert-no-commit',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'v1\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'v1'] },
        { write: { 'f.txt': 'v2\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'v2'] },
        { git: ['revert', '-n', 'HEAD'] },
      ],
    });
  });
});
