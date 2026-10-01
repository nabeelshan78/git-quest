/**
 * Differential tests: git remote, clone, fetch, pull, push.
 *
 * Tests avoid nested repos inside /repo. Each test uses a single repo
 * at /repo plus the hosted repo. For fetch/pull where the remote must
 * be ahead, we directly mutate the hosted repo with produce().
 */
import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { runScenario, type Scenario } from '../harness';
import { runGit } from '../../../src/engine';
import { createHostedRepoRecord, createMachine, createWorld } from '../../../src/engine/core';
import { writeFile, mkdirp } from '../../../src/engine/core/fs';
import { writeBlob, writeTreeFromFlat, writeObject, readTreeFlat, getCommit } from '../../../src/engine/core/objects';
import { outputText } from '../../../src/shared/result';
import { setupHostedRepo, applyTeammatePush } from '../../../src/remote';
import type { World, CommitObject } from '../../../src/shared/types';

function run(scenario: Scenario) {
  const result = runScenario(scenario);
  if (result.mismatches.length > 0) {
    throw new Error(`Mismatches:\n${result.mismatches.join('\n')}`);
  }
}

function setupWorld(): World {
  const machine = createMachine({
    id: 'laptop',
    user: 'tester',
    home: '/home/tester',
    cwd: '/repo',
    globalConfig: { 'user.name': 'Test User', 'user.email': 'test@example.com', 'init.defaultbranch': 'main' },
  });
  return createWorld({ machines: [machine] });
}

function gitSeq(world: World, ...commands: string[][]): World {
  let w = world;
  for (const cmd of commands) {
    const result = runGit(w, 'laptop', cmd);
    if (result.exitCode !== 0) {
      throw new Error(`git ${cmd.join(' ')} failed (${result.exitCode}): ${outputText(result.output)}`);
    }
    w = result.state;
  }
  return w;
}

/** Add a commit on a hosted repo's branch. */
function pushToHosted(w: World, repoId: string, branch: string, files: Record<string, string>, message: string): World {
  return produce(w, d => {
    const hosted = d.hosted[repoId].repo;
    const parentHash = hosted.refs[`refs/heads/${branch}`];
    const parent = getCommit(hosted, parentHash)!;
    const flat = { ...readTreeFlat(hosted, parent.tree) };
    for (const [path, content] of Object.entries(files)) {
      const hash = writeBlob(hosted, content);
      flat[path] = { hash, mode: '100644' };
    }
    const treeHash = writeTreeFromFlat(hosted, flat);
    const sig = { name: 'Teammate', email: 'team@example.com', timestamp: d.clock, timezone: '+0000' };
    const commitHash = writeObject(hosted, {
      type: 'commit',
      tree: treeHash,
      parents: [parentHash],
      author: sig,
      committer: sig,
      message: message.endsWith('\n') ? message : message + '\n',
    });
    hosted.refs[`refs/heads/${branch}`] = commitHash;
  });
}

// ---------------------------------------------------------------------------
// git remote (differential)
// ---------------------------------------------------------------------------

describe('git remote', () => {
  it('adds and lists a remote (name only)', () => {
    run({
      name: 'remote-add',
      steps: [
        { git: ['init'] },
        { git: ['remote', 'add', 'origin', 'https://github.com/test/repo.git'] },
        { git: ['remote'], output: true },
      ],
      compare: { config: ['remote.origin.url', 'remote.origin.fetch'] },
    });
  });

  it('removes a remote', () => {
    run({
      name: 'remote-remove',
      steps: [
        { git: ['init'] },
        { git: ['remote', 'add', 'origin', 'https://github.com/test/repo.git'] },
        { git: ['remote', 'remove', 'origin'] },
        { git: ['remote'], output: true },
      ],
    });
  });

  it('renames a remote', () => {
    run({
      name: 'remote-rename',
      steps: [
        { git: ['init'] },
        { git: ['remote', 'add', 'origin', 'https://github.com/test/repo.git'] },
        { git: ['remote', 'rename', 'origin', 'upstream'] },
        { git: ['remote'], output: true },
      ],
      compare: { config: ['remote.upstream.url', 'remote.upstream.fetch'] },
    });
  });

  it('errors on duplicate remote name', () => {
    run({
      name: 'remote-duplicate',
      steps: [
        { git: ['init'] },
        { git: ['remote', 'add', 'origin', 'https://github.com/test/repo.git'] },
        { git: ['remote', 'add', 'origin', 'https://github.com/test/other.git'], exitCode: 'zero-or-not' },
      ],
    });
  });
});

// ---------------------------------------------------------------------------
// git push (differential)
// ---------------------------------------------------------------------------

describe('git push', () => {
  it('pushes new commits to remote', () => {
    run({
      name: 'push-ff',
      steps: [
        { hosted: 'test/repo' },
        { git: ['init'] },
        { write: { 'a.txt': 'hello\n' } },
        { git: ['add', 'a.txt'] },
        { git: ['commit', '-m', 'First'] },
        { git: ['remote', 'add', 'origin', 'https://github.com/test/repo.git'] },
        { git: ['push', '-u', 'origin', 'main'] },
        { check: true },
        { write: { 'b.txt': 'world\n' } },
        { git: ['add', 'b.txt'] },
        { git: ['commit', '-m', 'Second'] },
        { git: ['push'] },
      ],
      compare: { config: ['branch.main.remote', 'branch.main.merge'] },
    });
  });
});

// ---------------------------------------------------------------------------
// git clone (engine-only)
// ---------------------------------------------------------------------------

describe('git clone (engine)', () => {
  it('clones a repo with commits and sets up remote tracking', () => {
    let w = setupWorld();
    w = produce(w, d => {
      d.hosted['test/repo'] = createHostedRepoRecord({ id: 'test/repo', createdAt: d.clock });
    });
    w = gitSeq(w, ['init']);
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/README.md', '# Hello\n'); });
    w = gitSeq(w,
      ['add', 'README.md'],
      ['commit', '-m', 'Initial commit'],
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      ['push', '-u', 'origin', 'main'],
    );
    w = produce(w, d => { mkdirp(d.machines.laptop.fs, '/work'); d.machines.laptop.cwd = '/work'; });
    const cloneResult = runGit(w, 'laptop', ['clone', 'https://github.com/test/repo.git']);
    expect(cloneResult.exitCode).toBe(0);
    w = cloneResult.state;

    const repo = w.machines.laptop.repos['/work/repo'];
    expect(repo).toBeDefined();
    expect(repo.config['remote.origin.url']).toBe('https://github.com/test/repo.git');
    expect(repo.config['branch.main.remote']).toBe('origin');
    expect(repo.config['branch.main.merge']).toBe('refs/heads/main');
    expect(w.machines.laptop.fs.files['/work/repo/README.md']).toBe('# Hello\n');
  });

  it('clones with -b option', () => {
    let w = setupWorld();
    w = produce(w, d => {
      d.hosted['test/repo'] = createHostedRepoRecord({ id: 'test/repo', createdAt: d.clock });
    });
    w = gitSeq(w, ['init']);
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/a.txt', 'hello\n'); });
    w = gitSeq(w,
      ['add', 'a.txt'], ['commit', '-m', 'Initial'],
      ['switch', '-c', 'dev'],
    );
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/b.txt', 'dev\n'); });
    w = gitSeq(w,
      ['add', 'b.txt'], ['commit', '-m', 'Dev commit'],
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      ['push', '-u', 'origin', 'main'],
      ['push', '-u', 'origin', 'dev'],
    );
    w = produce(w, d => { mkdirp(d.machines.laptop.fs, '/work'); d.machines.laptop.cwd = '/work'; });
    const result = runGit(w, 'laptop', ['clone', '-b', 'dev', 'https://github.com/test/repo.git']);
    expect(result.exitCode).toBe(0);
    w = result.state;
    const repo = w.machines.laptop.repos['/work/repo'];
    expect(repo).toBeDefined();
    expect(repo.head).toEqual({ type: 'symbolic', ref: 'refs/heads/dev' });
    expect(w.machines.laptop.fs.files['/work/repo/b.txt']).toBe('dev\n');
  });
});

// ---------------------------------------------------------------------------
// git fetch (engine-only)
// ---------------------------------------------------------------------------

describe('git fetch (engine)', () => {
  it('fetches new commits from remote', () => {
    let w = setupWorld();
    w = produce(w, d => {
      d.hosted['test/repo'] = createHostedRepoRecord({ id: 'test/repo', createdAt: d.clock });
    });
    w = gitSeq(w, ['init']);
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/a.txt', 'hello\n'); });
    w = gitSeq(w,
      ['add', 'a.txt'], ['commit', '-m', 'First'],
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      ['push', '-u', 'origin', 'main'],
    );
    const headBefore = w.machines.laptop.repos['/repo'].refs['refs/heads/main'];

    // Simulate teammate push
    w = pushToHosted(w, 'test/repo', 'main', { 'b.txt': 'teammate file\n' }, 'Teammate commit');

    // Fetch
    const fetchResult = runGit(w, 'laptop', ['fetch']);
    expect(fetchResult.exitCode).toBe(0);
    w = fetchResult.state;

    const repo = w.machines.laptop.repos['/repo'];
    expect(repo.refs['refs/heads/main']).toBe(headBefore);
    expect(repo.refs['refs/remotes/origin/main']).not.toBe(headBefore);
    const originMain = repo.refs['refs/remotes/origin/main'];
    const commit = repo.objects[originMain];
    expect(commit).toBeDefined();
    expect(commit!.type).toBe('commit');
  });
});

// ---------------------------------------------------------------------------
// git pull (engine-only)
// ---------------------------------------------------------------------------

describe('git pull (engine)', () => {
  it('fast-forwards on pull', () => {
    let w = setupWorld();
    w = produce(w, d => {
      d.hosted['test/repo'] = createHostedRepoRecord({ id: 'test/repo', createdAt: d.clock });
    });
    w = gitSeq(w, ['init']);
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/a.txt', 'hello\n'); });
    w = gitSeq(w,
      ['add', 'a.txt'], ['commit', '-m', 'First'],
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      ['push', '-u', 'origin', 'main'],
    );
    w = pushToHosted(w, 'test/repo', 'main', { 'b.txt': 'teammate\n' }, 'Teammate push');

    const pullResult = runGit(w, 'laptop', ['pull']);
    expect(pullResult.exitCode).toBe(0);
    w = pullResult.state;

    const repo = w.machines.laptop.repos['/repo'];
    expect(repo.refs['refs/heads/main']).toBe(repo.refs['refs/remotes/origin/main']);
    expect(w.machines.laptop.fs.files['/repo/b.txt']).toBe('teammate\n');
  });

  it('creates a merge commit on diverged pull', () => {
    let w = setupWorld();
    w = produce(w, d => {
      d.hosted['test/repo'] = createHostedRepoRecord({ id: 'test/repo', createdAt: d.clock });
    });
    w = gitSeq(w, ['init']);
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/a.txt', 'hello\n'); });
    w = gitSeq(w,
      ['add', 'a.txt'], ['commit', '-m', 'First'],
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      ['push', '-u', 'origin', 'main'],
    );
    w = pushToHosted(w, 'test/repo', 'main', { 'b.txt': 'from teammate\n' }, 'Teammate commit');

    // Make a local commit (touches c.txt, no conflict)
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/c.txt', 'local\n'); });
    w = gitSeq(w, ['add', 'c.txt'], ['commit', '-m', 'Local commit']);

    const pullResult = runGit(w, 'laptop', ['pull']);
    expect(pullResult.exitCode).toBe(0);
    w = pullResult.state;

    const repo = w.machines.laptop.repos['/repo'];
    const headHash = repo.refs['refs/heads/main'];
    const headObj = repo.objects[headHash] as CommitObject;
    expect(headObj).toBeDefined();
    expect(headObj.type).toBe('commit');
    expect(headObj.parents.length).toBe(2);
    expect(w.machines.laptop.fs.files['/repo/b.txt']).toBe('from teammate\n');
    expect(w.machines.laptop.fs.files['/repo/c.txt']).toBe('local\n');
  });
});

// ---------------------------------------------------------------------------
// git push rejection (engine-only)
// ---------------------------------------------------------------------------

describe('git push rejection (engine)', () => {
  it('rejects non-fast-forward push', () => {
    let w = setupWorld();
    w = produce(w, d => {
      d.hosted['test/repo'] = createHostedRepoRecord({ id: 'test/repo', createdAt: d.clock });
    });
    w = gitSeq(w, ['init']);
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/a.txt', 'hello\n'); });
    w = gitSeq(w,
      ['add', 'a.txt'], ['commit', '-m', 'First'],
      ['remote', 'add', 'origin', 'https://github.com/test/repo.git'],
      ['push', '-u', 'origin', 'main'],
    );
    w = pushToHosted(w, 'test/repo', 'main', { 'b.txt': 'teammate\n' }, 'Teammate push');

    // Make a local commit (diverge from remote)
    w = produce(w, d => { writeFile(d.machines.laptop.fs, '/repo/c.txt', 'local\n'); });
    w = gitSeq(w, ['add', 'c.txt'], ['commit', '-m', 'Local commit']);

    const pushResult = runGit(w, 'laptop', ['push']);
    expect(pushResult.exitCode).not.toBe(0);
    expect(outputText(pushResult.output)).toContain('rejected');
  });
});

// ---------------------------------------------------------------------------
// Teammate simulation (engine-only)
// ---------------------------------------------------------------------------

describe('teammate simulation (engine)', () => {
  it('setupHostedRepo creates a hosted repo with initial files', () => {
    let w = setupWorld();
    const result = setupHostedRepo(w, {
      id: 'test/repo',
      initialFiles: { 'README.md': '# Hello\n' },
      initialMessage: 'Initial commit',
    }, { machine: 'laptop', repoPath: '/repo' });
    expect(result.exitCode).toBe(0);
    w = result.state;

    const hosted = w.hosted['test/repo'];
    expect(hosted).toBeDefined();
    expect(hosted.repo.refs['refs/heads/main']).toBeDefined();
  });

  it('applyTeammatePush creates a commit on the hosted repo', () => {
    let w = setupWorld();
    const setupResult = setupHostedRepo(w, {
      id: 'test/repo',
      initialFiles: { 'README.md': '# Hello\n' },
      initialMessage: 'Initial commit',
    }, { machine: 'laptop', repoPath: '/repo' });
    expect(setupResult.exitCode).toBe(0);
    w = setupResult.state;

    const pushResult = applyTeammatePush(w, {
      type: 'push',
      actor: 'Sam',
      repo: 'test/repo',
      branch: 'main',
      message: 'Add feature',
      files: { 'feature.txt': 'new feature\n' },
    });
    expect(pushResult.exitCode).toBe(0);
    w = pushResult.state;

    const hosted = w.hosted['test/repo'].repo;
    const mainHash = hosted.refs['refs/heads/main'];
    const commit = hosted.objects[mainHash] as CommitObject;
    expect(commit).toBeDefined();
    expect(commit.type).toBe('commit');
    expect(commit.message).toContain('Add feature');
    expect(commit.parents.length).toBe(1);
  });
});
