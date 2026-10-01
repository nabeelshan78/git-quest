import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { createEmptyRepo, hashBlob, hashObject, writeBlob, writeTreeFromFlat, EMPTY_TREE_HASH, sha1, utf8Encode } from '../../src/engine/core';

const dir = mkdtempSync(join(tmpdir(), 'gq-hash-'));
const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: join(dir, 'gitconfig'), HOME: dir, GIT_AUTHOR_DATE: '1767268800 +0000', GIT_COMMITTER_DATE: '1767268800 +0000', GIT_AUTHOR_NAME: 'Test User', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test User', GIT_COMMITTER_EMAIL: 'test@example.com' };
writeFileSync(join(dir, 'gitconfig'), '[core]\n\tautocrlf = false\n\tfileMode = false\n[init]\n\tdefaultBranch = main\n');
const git = (args: string[], input?: string) => {
  const r = spawnSync('git', args, { cwd: dir, env, input, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r.stdout.trim();
};
git(['init', '-q']);

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe('core object hashing matches real git', () => {
  it('sha1 of empty input', () => {
    expect(sha1(new Uint8Array())).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });

  it.each(['', 'hello\n', 'no newline', 'caf\u00e9 \u2615 \ud83c\udf89\n', 'x'.repeat(1000)])('blob %#', (content) => {
    writeFileSync(join(dir, 'blob.txt'), content);
    expect(hashBlob(content)).toBe(git(['hash-object', 'blob.txt']));
  });

  it('empty tree', () => {
    expect(hashObject({ type: 'tree', entries: [] })).toBe(EMPTY_TREE_HASH);
  });

  it('nested trees and a commit', () => {
    const files: Record<string, string> = { 'index.html': '<h1>Festival</h1>\n', 'css/style.css': 'body {}\n', 'css-old.txt': 'x\n', 'a/b/c.txt': 'deep\n', 'z.md': '# Z\n' };
    for (const [p, c] of Object.entries(files)) {
      mkdirSync(join(dir, p, '..'), { recursive: true });
      writeFileSync(join(dir, p), c);
    }
    git(['add', ...Object.keys(files)]);
    const realTree = git(['write-tree']);
    const repo = createEmptyRepo();
    const flat: Record<string, { hash: string; mode: '100644' }> = {};
    for (const [p, c] of Object.entries(files)) flat[p] = { hash: writeBlob(repo, c), mode: '100644' };
    const tree = writeTreeFromFlat(repo, flat);
    expect(tree).toBe(realTree);

    const realCommit = git(['commit-tree', realTree, '-m', 'Add homepage']);
    const sig = { name: 'Test User', email: 'test@example.com', timestamp: 1767268800, timezone: '+0000' };
    const commit = hashObject({ type: 'commit', tree, parents: [], author: sig, committer: sig, message: 'Add homepage\n' });
    expect(commit).toBe(realCommit);

    const realChild = git(['commit-tree', realTree, '-p', realCommit, '-m', 'Second']);
    expect(hashObject({ type: 'commit', tree, parents: [commit], author: sig, committer: sig, message: 'Second\n' })).toBe(realChild);
  });

  it('utf8 encoding of astral characters', () => {
    expect([...utf8Encode('\ud83c\udf89')]).toEqual([0xf0, 0x9f, 0x8e, 0x89]);
  });
});
