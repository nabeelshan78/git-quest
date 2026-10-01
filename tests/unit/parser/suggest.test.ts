import { describe, it, expect } from 'vitest';
import { suggestCommand } from '../../../src/parser/suggest';

describe('suggestCommand', () => {
  it('suggests ls for lss', () => {
    const suggestions = suggestCommand('lss');
    expect(suggestions).toContain('ls');
  });

  it('suggests cd for cb', () => {
    const suggestions = suggestCommand('cb');
    expect(suggestions).toContain('cd');
  });

  it('suggests nothing for completely unrelated input', () => {
    const suggestions = suggestCommand('xyzxyzxyzxyz');
    expect(suggestions).toEqual([]);
  });

  it('suggests echo for ech', () => {
    const suggestions = suggestCommand('ech');
    expect(suggestions).toContain('echo');
  });

  it('suggests git for gti', () => {
    const suggestions = suggestCommand('gti');
    expect(suggestions).toContain('git');
  });
});
