import { describe, it, expect } from 'vitest';
import { createWorld, createMachine } from '../engine/core/world';
import { buildSandboxWorld } from '../levels/sandboxPresets';
import { runLine } from '../parser';
import { findRepo } from '../engine/core/repo';
import { readCommitFiles } from '../engine/core/objects';
import {
  BUNDLE_FORMAT,
  bundleBranchName,
  createBundle,
  describeBundleError,
  importBundle,
  parseBundle,
  serializeBundle,
} from './bundle';
import type { World } from '../shared/types';

function freshWorld(user: string): World {
  const machine = createMachine({ id: 'laptop', user, home: `/home/${user}`, globalConfig: { 'user.name': user, 'user.email': `${user}@e.example` } });
  return createWorld({ machines: [machine] });
}

function run(world: World, line: string): World {
  const r = runLine(world, 'laptop', line);
  if (r.exitCode !== 0) {
    throw new Error(`"${line}" failed: ${r.output.map((l) => l.text).join('\n')}`);
  }
  return r.state;
}

/** A repo with one shared commit, then one commit only this author has. */
function authorWorld(user: string, extraFile: string, extraContent: string, message: string): World {
  let w = freshWorld(user);
  w = run(w, 'mkdir project');
  w = run(w, 'cd project');
  w = run(w, 'git init');
  w = run(w, 'echo "shared line" > notes.txt');
  w = run(w, 'git add notes.txt');
  w = run(w, 'git commit -m "Shared start"');
  w = run(w, `echo "${extraContent}" > ${extraFile}`);
  w = run(w, `git add ${extraFile}`);
  w = run(w, `git commit -m "${message}"`);
  return w;
}

describe('repo bundles', () => {
  it('round-trips through serialize and parse', () => {
    const w = authorWorld('ada', 'map.html', 'Map here', 'Add map');
    const made = createBundle(w, 'laptop', { name: 'Ada', handle: 'ada' }, '2026-01-01T00:00:00Z');
    expect(made.ok).toBe(true);
    if (!made.ok) return;

    const text = serializeBundle(made.bundle);
    const parsed = parseBundle(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bundle.format).toBe(BUNDLE_FORMAT);
    expect(parsed.bundle.author.handle).toBe('ada');
    expect(parsed.bundle.branch).toBe('main');
    expect(parsed.bundle.tip).toBe(made.bundle.tip);
    expect(Object.keys(parsed.bundle.objects).length).toBe(Object.keys(made.bundle.objects).length);
  });

  it('includes every object reachable from the tip', () => {
    const w = authorWorld('ada', 'map.html', 'Map here', 'Add map');
    const made = createBundle(w, 'laptop', { name: 'Ada', handle: 'ada' }, 'now');
    if (!made.ok) throw new Error('expected a bundle');
    // 2 commits + 2 trees + 2 blobs minimum
    expect(Object.keys(made.bundle.objects).length).toBeGreaterThanOrEqual(6);
    expect(made.bundle.objects[made.bundle.tip].type).toBe('commit');
  });

  it('refuses a repo with no commits', () => {
    let w = freshWorld('ada');
    w = run(w, 'mkdir empty');
    w = run(w, 'cd empty');
    w = run(w, 'git init');
    const made = createBundle(w, 'laptop', { name: 'Ada', handle: 'ada' }, 'now');
    expect(made.ok).toBe(false);
    if (!made.ok) expect(made.reason).toBe('no-commits');
  });

  it('refuses when there is no repository', () => {
    const w = freshWorld('ada');
    const made = createBundle(w, 'laptop', { name: 'Ada', handle: 'ada' }, 'now');
    expect(made.ok).toBe(false);
    if (!made.ok) expect(made.reason).toBe('no-repo');
  });

  it('lands a classmate branch without touching the importer', () => {
    const adaWorld = authorWorld('ada', 'map.html', 'Map here', 'Add map');
    const made = createBundle(adaWorld, 'laptop', { name: 'Ada', handle: 'ada' }, 'now');
    if (!made.ok) throw new Error('expected a bundle');

    // Sam starts from the same shared commit but wrote something else.
    let samWorld = freshWorld('sam');
    samWorld = run(samWorld, 'mkdir project');
    samWorld = run(samWorld, 'cd project');
    samWorld = run(samWorld, 'git init');
    samWorld = run(samWorld, 'echo "shared line" > notes.txt');
    samWorld = run(samWorld, 'git add notes.txt');
    samWorld = run(samWorld, 'git commit -m "Shared start"');

    const before = findRepo(samWorld, 'laptop')!;
    const beforeHead = before.repo.refs['refs/heads/main'];

    const imported = importBundle(samWorld, 'laptop', made.bundle);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    const after = findRepo(imported.world, 'laptop')!;
    // Sam's own branch did not move and HEAD is still on main.
    expect(after.repo.refs['refs/heads/main']).toBe(beforeHead);
    expect(after.repo.head).toEqual({ type: 'symbolic', ref: 'refs/heads/main' });
    // Ada's work is reachable on its own branch.
    expect(after.repo.refs['refs/heads/classmate/ada']).toBe(made.bundle.tip);
    expect(imported.branch).toBe('classmate/ada');
    // Working folder untouched: no map.html yet.
    expect(after.machine.fs.files['/home/sam/project/map.html']).toBeUndefined();
  });

  /**
   * Two students on the shared `team-up` base. This is the real path: the base
   * commit is byte-identical for both, which is what makes the merge legal.
   */
  function student(name: string, handle: string): World {
    return buildSandboxWorld('team-up', {
      id: handle, name, handle, email: `${handle}@e.example`, classCode: '', createdAt: '2026-01-01T00:00:00Z',
    });
  }

  it('two students on the shared base have the same starting commit', () => {
    const a = findRepo(student('Ada', 'ada'), 'laptop')!;
    const b = findRepo(student('Sam', 'sam'), 'laptop')!;
    expect(a.repo.refs['refs/heads/main']).toBe(b.repo.refs['refs/heads/main']);
  });

  it('the imported branch can be merged, producing a real combined history', () => {
    let adaWorld = student('Ada', 'ada');
    adaWorld = run(adaWorld, 'echo "Map here" > map.html');
    adaWorld = run(adaWorld, 'git add map.html');
    adaWorld = run(adaWorld, 'git commit -m "Add map"');
    const made = createBundle(adaWorld, 'laptop', { name: 'Ada', handle: 'ada' }, 'now');
    if (!made.ok) throw new Error('expected a bundle');

    let samWorld = student('Sam', 'sam');
    samWorld = run(samWorld, 'echo "Food list" > food.html');
    samWorld = run(samWorld, 'git add food.html');
    samWorld = run(samWorld, 'git commit -m "Add food"');

    const imported = importBundle(samWorld, 'laptop', made.bundle);
    if (!imported.ok) throw new Error('expected an import');

    const merged = run(imported.world, `git merge ${bundleBranchName(made.bundle)} --no-edit`);
    const handle = findRepo(merged, 'laptop')!;
    const files = readCommitFiles(handle.repo, handle.repo.refs['refs/heads/main']);
    // Both people's work is present after the merge.
    expect(Object.keys(files).sort()).toEqual(['food.html', 'index.html', 'map.html', 'notes.txt']);
  });

  it('a conflicting bundle produces a genuine conflict the importer must resolve', () => {
    let adaWorld = student('Ada', 'ada');
    adaWorld = run(adaWorld, 'echo "Ada says lanterns" > notes.txt');
    adaWorld = run(adaWorld, 'git add notes.txt');
    adaWorld = run(adaWorld, 'git commit -m "Ada idea"');
    const made = createBundle(adaWorld, 'laptop', { name: 'Ada', handle: 'ada' }, 'now');
    if (!made.ok) throw new Error('expected a bundle');

    let samWorld = student('Sam', 'sam');
    samWorld = run(samWorld, 'echo "Sam says fireworks" > notes.txt');
    samWorld = run(samWorld, 'git add notes.txt');
    samWorld = run(samWorld, 'git commit -m "Sam idea"');

    const imported = importBundle(samWorld, 'laptop', made.bundle);
    if (!imported.ok) throw new Error('expected an import');

    const result = runLine(imported.world, 'laptop', `git merge ${bundleBranchName(made.bundle)}`);
    expect(result.exitCode).not.toBe(0);
    const handle = findRepo(result.state, 'laptop')!;
    expect(Object.keys(handle.repo.index.conflicts)).toContain('notes.txt');
    const text = handle.machine.fs.files[`${handle.root}/notes.txt`];
    expect(text).toContain('<<<<<<<');
    expect(text).toContain('Ada says lanterns');
    expect(text).toContain('Sam says fireworks');
  });

  it('rejects a hand-edited bundle', () => {
    const w = authorWorld('ada', 'map.html', 'Map here', 'Add map');
    const made = createBundle(w, 'laptop', { name: 'Ada', handle: 'ada' }, 'now');
    if (!made.ok) throw new Error('expected a bundle');
    const tampered = serializeBundle(made.bundle).replace('"Add map', '"Tampered map');
    const parsed = parseBundle(tampered);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.kind).toBe('checksum');
  });

  it('rejects a progress file with a clear message', () => {
    const parsed = parseBundle(JSON.stringify({ format: 'git-quest-progress', version: 1 }));
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.kind).toBe('wrong-format');
      expect(describeBundleError(parsed.error)).toContain('progress file');
    }
  });

  it('rejects junk', () => {
    expect(parseBundle('not json at all').ok).toBe(false);
    expect(parseBundle('[]').ok).toBe(false);
  });
});
