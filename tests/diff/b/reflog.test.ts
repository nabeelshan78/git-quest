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

  // `<ref>@{n}` is the syntax the reflog rescue lesson depends on, so it is
  // checked against real git rather than trusted.
  it('resolves HEAD@{1} after a reset, recovering the lost commit', () => {
    run({
      name: 'reflog-at-syntax-reset',
      compare: { reflog: true, origHead: true },
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'b.txt': 'second\n' } },
        { git: ['add', 'b.txt'] },
        { git: ['commit', '-m', 'second'] },
        { git: ['reset', '--hard', 'HEAD~1'] },
        { check: true },
        { git: ['reset', '--hard', 'HEAD@{1}'] },
      ],
    });
  });

  it('resolves HEAD@{0} as the current commit', () => {
    run({
      name: 'reflog-at-zero',
      compare: { reflog: true },
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        // --no-decorate so both sides agree: the engine decorates by default
        // (it models an interactive terminal), real git piped does not.
        { git: ['log', '--oneline', '--no-decorate', 'HEAD@{0}'], output: true },
      ],
    });
  });

  it('resolves HEAD@{n} across branch switches', () => {
    run({
      name: 'reflog-at-switch',
      compare: { reflog: true },
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'v1\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { git: ['switch', '-c', 'feature'] },
        { write: { 'b.txt': 'feature\n' } },
        { git: ['add', 'b.txt'] },
        { git: ['commit', '-m', 'feature commit'] },
        { git: ['switch', 'main'] },
        { git: ['log', '--oneline', '--no-decorate', 'HEAD@{1}'], output: true },
      ],
    });
  });
});
