/**
 * Differential tests: git reflog
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git reflog', () => {
  it('shows HEAD reflog after commits', () => {
    run({
      name: 'reflog-basic',
      compare: { reflog: true },
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'second'] },
      ],
    });
  });

  it('shows reflog after reset', () => {
    run({
      name: 'reflog-reset',
      compare: { reflog: true },
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
    });
  });

  it('shows reflog after branch switch', () => {
    run({
      name: 'reflog-switch',
      compare: { reflog: true },
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { git: ['branch', 'feature'] },
        { git: ['switch', 'feature'] },
        { write: { 'b.txt': 'feature\n' } },
        { git: ['add', 'b.txt'] },
        { git: ['commit', '-m', 'feature commit'] },
        { git: ['switch', 'main'] },
      ],
    });
  });
});
