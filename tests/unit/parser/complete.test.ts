import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createWorld, createMachine } from '../../../src/engine/core/world';
import { writeFile, mkdirp } from '../../../src/engine/core/fs';
import { createEmptyRepo } from '../../../src/engine/core/repo';
import { completeLine } from '../../../src/parser';

function makeWorld() {
  const m = createMachine({ user: 'intern', host: 'laptop' });
  return createWorld({ machines: [m] });
}

const MID = 'laptop';

describe('completeLine', () => {
  it('completes command names', () => {
    const r = completeLine(makeWorld(), MID, 'pw');
    expect(r.candidates).toContain('pwd');
  });

  it('completes git subcommands', () => {
    const r = completeLine(makeWorld(), MID, 'git sta');
    expect(r.candidates).toContain('status');
    expect(r.candidates).toContain('stash');
  });

  it('completes file paths', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/home/intern/readme.md', '');
      writeFile(d.machines[MID].fs, '/home/intern/readme2.md', '');
    });
    const r = completeLine(w, MID, 'cat read');
    expect(r.candidates.length).toBeGreaterThanOrEqual(2);
  });

  it('completes branch names for git switch', () => {
    const w = produce(makeWorld(), (d) => {
      const repo = createEmptyRepo({ initialBranch: 'main' });
      repo.refs['refs/heads/main'] = 'abc123';
      repo.refs['refs/heads/feature'] = 'def456';
      d.machines[MID].repos['/home/intern'] = repo;
      d.machines[MID].cwd = '/home/intern';
    });
    const r = completeLine(w, MID, 'git switch f');
    expect(r.candidates).toContain('feature');
  });

  it('returns empty for no matches', () => {
    const r = completeLine(makeWorld(), MID, 'zzzzz');
    expect(r.candidates).toEqual([]);
  });

  it('shows all commands for empty input', () => {
    const r = completeLine(makeWorld(), MID, '');
    expect(r.candidates.length).toBeGreaterThan(5);
    expect(r.candidates).toContain('git');
    expect(r.candidates).toContain('pwd');
  });
});
