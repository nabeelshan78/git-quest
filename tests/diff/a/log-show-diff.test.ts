/**
 * Differential tests: git log, git show, git diff, git status
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git status', () => {
  it('shows clean status', () => {
    run({
      name: 'status-clean',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
      ],
    });
  });

  it('shows untracked and modified', () => {
    run({
      name: 'status-mixed',
      steps: [
        { git: ['init'] },
        { write: { 'tracked.txt': 'data\n' } },
        { git: ['add', 'tracked.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'tracked.txt': 'changed\n', 'new.txt': 'new\n' } },
        { git: ['add', 'tracked.txt'] },
      ],
    });
  });
});

describe('git log', () => {
  it('shows commit history', () => {
    run({
      name: 'log-basic',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'a\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'b.txt': 'b\n' } },
        { git: ['add', 'b.txt'] },
        { git: ['commit', '-m', 'second'] },
      ],
    });
  });
});

describe('git show', () => {
  it('shows a commit', () => {
    run({
      name: 'show-commit',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'initial'] },
      ],
    });
  });
});

describe('git diff', () => {
  it('compares index vs worktree', () => {
    run({
      name: 'diff-worktree',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'line1\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'line1\nline2\n' } },
      ],
    });
  });

  it('compares HEAD vs staged', () => {
    run({
      name: 'diff-staged',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'original\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'modified\n' } },
        { git: ['add', 'f.txt'] },
      ],
    });
  });
});
