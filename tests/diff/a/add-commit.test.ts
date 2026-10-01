/**
 * Differential tests: git add, git commit
 */
import { describe, it, expect } from 'vitest';
import { runScenario, type Scenario } from '../harness';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

describe('git add', () => {
  it('stages a single file', () => {
    run({
      name: 'add-single',
      steps: [
        { git: ['init'] },
        { write: { 'hello.txt': 'Hello World\n' } },
        { git: ['add', 'hello.txt'] },
      ],
    });
  });

  it('stages multiple files', () => {
    run({
      name: 'add-multiple',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'aaa\n', 'b.txt': 'bbb\n' } },
        { git: ['add', 'a.txt', 'b.txt'] },
      ],
    });
  });

  it('stages all with -A', () => {
    run({
      name: 'add-all',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'aaa\n', 'b.txt': 'bbb\n', 'sub/c.txt': 'ccc\n' } },
        { git: ['add', '-A'] },
      ],
    });
  });

  it('stages with dot', () => {
    run({
      name: 'add-dot',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'aaa\n', 'dir/b.txt': 'bbb\n' } },
        { git: ['add', '.'] },
      ],
    });
  });

  it('stages modification', () => {
    run({
      name: 'add-modify',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'first\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'second\n' } },
        { git: ['add', 'f.txt'] },
      ],
    });
  });

  it('stages deletion with -A', () => {
    run({
      name: 'add-delete',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'content\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { rm: ['f.txt'] },
        { git: ['add', '-A'] },
      ],
    });
  });
});

describe('git commit', () => {
  it('creates initial commit', () => {
    run({
      name: 'commit-initial',
      steps: [
        { git: ['init'] },
        { write: { 'hello.txt': 'Hello\n' } },
        { git: ['add', 'hello.txt'] },
        { git: ['commit', '-m', 'initial commit'] },
      ],
      compare: { reflog: true },
    });
  });

  it('creates second commit', () => {
    run({
      name: 'commit-second',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'a\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'first'] },
        { write: { 'b.txt': 'b\n' } },
        { git: ['add', 'b.txt'] },
        { git: ['commit', '-m', 'second'] },
      ],
      compare: { reflog: true },
    });
  });

  it('commit with -a stages tracked changes', () => {
    run({
      name: 'commit-all',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'first\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'init'] },
        { write: { 'f.txt': 'changed\n' } },
        { git: ['commit', '-a', '-m', 'update'] },
      ],
    });
  });

  it('commit nothing fails', () => {
    run({
      name: 'commit-nothing',
      steps: [
        { git: ['init'] },
        { write: { 'f.txt': 'data\n' } },
        { git: ['add', 'f.txt'] },
        { git: ['commit', '-m', 'first'] },
        { git: ['commit', '-m', 'empty'], exitCode: 'zero-or-not' },
      ],
    });
  });

  it('commit with editor', () => {
    run({
      name: 'commit-editor',
      steps: [
        { git: ['init'] },
        { write: { 'a.txt': 'content\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit'], editor: 'Editor message\n' },
      ],
    });
  });
});
