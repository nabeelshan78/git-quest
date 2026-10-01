import { describe, expect, it } from 'vitest';
import { runScenario } from './harness';

describe('differential harness', () => {
  it('compares working files when no repository exists', () => {
    const r = runScenario({ name: 'files only', steps: [{ write: { 'a.txt': 'hello\n', 'dir/b.txt': 'b\n' } }, { rm: ['a.txt'] }, { mkdir: ['empty'] }] });
    expect(r.mismatches).toEqual([]);
  });
});
