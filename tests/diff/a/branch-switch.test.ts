/**
 * Differential tests: git branch, git switch, git checkout
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git branch', () => {
  it('creates a branch', () => {
    run({
      name: 'branch-create',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['branch', 'feature'] },
      ],
    });
  });

  it('deletes a branch', () => {
    run({
      name: 'branch-delete',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['branch', 'feature'] },
        { git: ['branch', '-d', 'feature'] },
      ],
    });
  });

  it('creates a branch from a start point', () => {
    run({
      name: 'branch-start-point',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'v1\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'f.txt': 'v2\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'second'] },
        { git: ['branch', 'old', 'HEAD~1'] },
      ],
    });
  });
});

describe('git switch', () => {
  it('switches to an existing branch', () => {
    run({
      name: 'switch-existing',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['branch', 'feature'] },
        { git: ['switch', 'feature'] },
      ],
      compare: { reflog: true },
    });
  });

  it('creates and switches with -c', () => {
    run({
      name: 'switch-create',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['switch', '-c', 'feature'] },
      ],
      compare: { reflog: true },
    });
  });

  it('updates work tree when switching', () => {
    run({
      name: 'switch-worktree',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'main\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'on main'] },
        { git: ['switch', '-c', 'feature'] },
        { write: { 'f.txt': 'feature\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'on feature'] },
        { git: ['switch', 'main'] },
      ],
      compare: { reflog: true },
    });
  });

  it('detached HEAD', () => {
    run({
      name: 'switch-detach',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'v1\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'f.txt': 'v2\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'second'] },
        { git: ['switch', '--detach', 'HEAD~1'] },
      ],
      compare: { reflog: true },
    });
  });
});

describe('git checkout', () => {
  it('switches branch', () => {
    run({
      name: 'checkout-branch',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['branch', 'feature'] },
        { git: ['checkout', 'feature'] },
      ],
      compare: { reflog: true },
    });
  });

  it('creates and switches with -b', () => {
    run({
      name: 'checkout-b',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['checkout', '-b', 'feature'] },
      ],
      compare: { reflog: true },
    });
  });

  it('restores files with -- pathspec', () => {
    run({
      name: 'checkout-file',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'original\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'modified\n' } },
        { git: ['checkout', '--', 'f.txt'] },
      ],
    });
  });
});
