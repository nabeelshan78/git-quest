/**
 * Differential tests: git commit --amend
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git commit --amend', () => {
  it('amends the last commit message', () => {
    run({
      name: 'amend-message',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'initial'] },
        { git: ['commit', '--amend', '-m', 'amended message'] },
      ],
    });
  });

  it('amends with new staged changes', () => {
    run({
      name: 'amend-staged',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'initial'] },
        { write: { 'b.txt': 'extra\n' } },
        { git: ['add', 'b.txt'] },
        { git: ['commit', '--amend', '-m', 'initial with b'] },
      ],
    });
  });

  it('amends with modified file', () => {
    run({
      name: 'amend-modified',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'initial'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '--amend', '-m', 'updated a'] },
      ],
    });
  });

  it('preserves original author on amend', () => {
    run({
      name: 'amend-author',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'initial'] },
        { git: ['commit', '--amend', '-m', 'same author'] },
      ],
    });
  });
});
