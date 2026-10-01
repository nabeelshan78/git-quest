import { describe, expect, it } from 'vitest';
import { translateError, getErrorEntries } from '../../../src/levels/errors';

describe('Error Translator', () => {
  it('translates "not a git repository"', () => {
    const result = translateError('fatal: not a git repository (or any of the parent directories): .git');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('not-a-repo');
    expect(result!.message).toContain('git repository');
  });

  it('translates "nothing to commit"', () => {
    const result = translateError('nothing to commit, working tree clean');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('nothing-to-commit');
  });

  it('translates "pathspec did not match"', () => {
    const result = translateError("error: pathspec 'nonexistent.txt' did not match any file(s) known to git");
    expect(result).not.toBeNull();
    expect(result!.id).toBe('pathspec-not-found');
  });

  it('translates merge conflicts', () => {
    const result = translateError('CONFLICT (content): Merge conflict in file.txt');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('merge-conflict');
  });

  it('translates "already on branch"', () => {
    const result = translateError("Already on 'main'");
    expect(result).not.toBeNull();
    expect(result!.id).toBe('already-on-branch');
  });

  it('translates branch already exists', () => {
    const result = translateError("fatal: a branch named 'feature' already exists");
    expect(result).not.toBeNull();
    expect(result!.id).toBe('branch-exists');
  });

  it('translates empty commit message', () => {
    const result = translateError('Aborting commit due to empty commit message.');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('empty-commit-msg');
  });

  it('translates no upstream branch', () => {
    const result = translateError("fatal: The current branch feature has no upstream branch.");
    expect(result).not.toBeNull();
    expect(result!.id).toBe('no-upstream');
  });

  it('translates rejected push (non-fast-forward)', () => {
    const result = translateError('! [rejected]        main -> main (non-fast-forward)');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('rejected-non-ff');
  });

  it('returns null for unknown errors', () => {
    const result = translateError('some unknown output');
    expect(result).toBeNull();
  });

  it('has at least 25 error entries', () => {
    const entries = getErrorEntries();
    expect(entries.length).toBeGreaterThanOrEqual(25);
  });

  it('every entry has a unique id', () => {
    const entries = getErrorEntries();
    const ids = entries.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
