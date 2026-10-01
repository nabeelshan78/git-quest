/**
 * Differential tests: git reset
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git reset', () => {
  it('mixed reset (default) moves HEAD and resets index', () => {
    run({
      name: 'reset-mixed',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'second'] },
        { git: ['reset', 'HEAD~1'] },
      ],
      compare: { origHead: true },
    });
  });

  it('soft reset moves HEAD only', () => {
    run({
      name: 'reset-soft',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'second'] },
        { git: ['reset', '--soft', 'HEAD~1'] },
      ],
      compare: { origHead: true },
    });
  });

  it('hard reset moves HEAD, resets index and worktree', () => {
    run({
      name: 'reset-hard',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'second'] },
        { git: ['reset', '--hard', 'HEAD~1'] },
      ],
      compare: { origHead: true },
    });
  });

  it('reset with path unstages files', () => {
    run({
      name: 'reset-path',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['reset', '--', 'a.txt'] },
      ],
    });
  });

  it('reset to specific commit', () => {
    run({
      name: 'reset-commit',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'second'] },
        { write: { 'a.txt': 'v3\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'third'] },
        { git: ['reset', '--mixed', 'HEAD~2'] },
      ],
      compare: { origHead: true },
    });
  });

  it('hard reset with new files', () => {
    run({
      name: 'reset-hard-new-files',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'b.txt': 'new\n' } },
        { git: ['add', 'b.txt'] },
        { git: ['commit', '-m', 'add b'] },
        { git: ['reset', '--hard', 'HEAD~1'] },
      ],
      compare: { origHead: true },
    });
  });

  it('reset without commit arg resets to HEAD', () => {
    run({
      name: 'reset-head',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['reset'] },
      ],
    });
  });
});
