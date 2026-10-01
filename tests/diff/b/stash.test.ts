/**
 * Differential tests: git stash
 */
import { describe, it } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git stash', () => {
  it('saves and pops working directory changes', () => {
    run({
      name: 'stash-save-pop',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['stash'] },
        { check: true },
        { git: ['stash', 'pop'] },
      ],
    });
  });

  it('saves and applies without dropping', () => {
    run({
      name: 'stash-apply',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['stash'] },
        { git: ['stash', 'apply'] },
      ],
    });
  });

  it('stash list shows entries', () => {
    run({
      name: 'stash-list',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['stash'] },
        { write: { 'a.txt': 'v3\n' } },
        { git: ['stash'] },
      ],
    });
  });

  it('stash drop removes an entry', () => {
    run({
      name: 'stash-drop',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['stash'] },
        { write: { 'a.txt': 'v3\n' } },
        { git: ['stash'] },
        { git: ['stash', 'drop', '0'] },
      ],
    });
  });

  it('stash with custom message', () => {
    run({
      name: 'stash-message',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['stash', 'push', '-m', 'my stash'] },
      ],
    });
  });

  it('stash with staged changes', () => {
    run({
      name: 'stash-staged',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['stash'] },
      ],
    });
  });

  it('stash clear removes all', () => {
    run({
      name: 'stash-clear',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'a.txt': 'v2\n' } },
        { git: ['stash'] },
        { write: { 'a.txt': 'v3\n' } },
        { git: ['stash'] },
        { git: ['stash', 'clear'] },
      ],
    });
  });

  it('reports no changes to save', () => {
    run({
      name: 'stash-no-changes',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'init'] },
        { git: ['stash'] },
      ],
    });
  });
});
