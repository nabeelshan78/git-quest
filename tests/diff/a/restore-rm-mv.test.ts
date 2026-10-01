/**
 * Differential tests: git restore, git rm, git mv
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git restore', () => {
  it('restores --staged (unstages)', () => {
    run({
      name: 'restore-staged',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'original\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'changed\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['restore', '--staged', 'f.txt'] },
      ],
    });
  });

  it('restores work tree from index', () => {
    run({
      name: 'restore-worktree',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'original\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'dirty\n' } },
        { git: ['restore', 'f.txt'] },
      ],
    });
  });

  it('restores from a source commit', () => {
    run({
      name: 'restore-source',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'v1\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'v1'] },
        { write: { 'f.txt': 'v2\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'v2'] },
        { git: ['restore', '--source=HEAD~1', 'f.txt'] },
      ],
    });
  });

  it('restores both staged and worktree', () => {
    run({
      name: 'restore-both',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'original\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'staged\n' } },
        { git: ['add', 'f.txt'] },
        { write: { 'f.txt': 'dirty\n' } },
        { git: ['restore', '--staged', '--worktree', 'f.txt'] },
      ],
    });
  });
});

describe('git rm', () => {
  it('removes a tracked file', () => {
    run({
      name: 'rm-basic',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['rm', 'f.txt'] },
      ],
    });
  });

  it('removes with --cached (keep in work tree)', () => {
    run({
      name: 'rm-cached',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['rm', '--cached', 'f.txt'] },
      ],
    });
  });
});

describe('git mv', () => {
  it('renames a file', () => {
    run({
      name: 'mv-basic',
      steps: [
        { git: ['init'] },
        { write: { 'old.txt': 'data\n' } },
        { git: ['add', 'old.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['mv', 'old.txt', 'new.txt'] },
      ],
    });
  });

  it('moves a file into a directory', () => {
    run({
      name: 'mv-to-dir',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { mkdir: ['sub'] },
        { git: ['mv', 'f.txt', 'sub/'] },
      ],
    });
  });
});
