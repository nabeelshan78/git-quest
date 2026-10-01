import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createWorld, createMachine } from '../../../src/engine/core/world';
import { writeFile, mkdirp } from '../../../src/engine/core/fs';
import { runLine, tokenize } from '../../../src/parser';
import { outputText } from '../../../src/shared/result';

function makeWorld() {
  const m = createMachine({ user: 'intern', host: 'laptop' });
  return createWorld({ machines: [m] });
}

const MID = 'laptop';

describe('runLine routing', () => {
  it('returns empty result for empty input', () => {
    const r = runLine(makeWorld(), MID, '');
    expect(r.exitCode).toBe(0);
    expect(r.output).toEqual([]);
    expect(r.executed).toEqual([]);
  });

  it('routes shell commands', () => {
    const r = runLine(makeWorld(), MID, 'pwd');
    expect(r.exitCode).toBe(0);
    expect(outputText(r.output)).toContain('/home/intern');
  });

  it('returns command not found for unknown commands', () => {
    const r = runLine(makeWorld(), MID, 'foobar');
    expect(r.exitCode).toBe(127);
    expect(outputText(r.output, 'stderr')).toContain('command not found');
  });

  it('adds to history', () => {
    const r = runLine(makeWorld(), MID, 'pwd');
    expect(r.state.machines[MID].history).toContain('pwd');
  });

  it('handles semicolons for command chaining', () => {
    const w = produce(makeWorld(), (d) => {
      mkdirp(d.machines[MID].fs, '/home/intern/project');
    });
    const r = runLine(w, MID, 'pwd; ls');
    expect(r.exitCode).toBe(0);
    expect(r.executed!.length).toBe(2);
  });

  it('handles echo with redirect > via tokenizer', () => {
    const r = runLine(makeWorld(), MID, 'echo hello > out.txt');
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].fs.files['/home/intern/out.txt']).toBe('hello\n');
  });

  it('handles echo with redirect >> via tokenizer', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/home/intern/out.txt', 'first\n');
    });
    const r = runLine(w, MID, 'echo second >> out.txt');
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].fs.files['/home/intern/out.txt']).toBe('first\nsecond\n');
  });

  it('rejects pipes with friendly message', () => {
    const r = runLine(makeWorld(), MID, 'ls | grep foo');
    expect(r.exitCode).not.toBe(0);
    expect(outputText(r.output, 'stderr')).toContain('not supported');
  });
});

describe('allowed command filtering', () => {
  it('allows always-allowed commands', () => {
    const r = runLine(makeWorld(), MID, 'pwd', { allowed: ['git add'] });
    expect(r.exitCode).toBe(0);
  });

  it('allows git status always', () => {
    // git status needs a repo to not error, but the allowed check should pass
    const r = runLine(makeWorld(), MID, 'git status', { allowed: [] });
    // It should get past the allowed check (may fail in git for no repo, but
    // the output should NOT be the "not available" message)
    expect(outputText(r.output, 'stderr')).not.toContain("isn't available");
  });

  it('blocks disallowed commands', () => {
    const r = runLine(makeWorld(), MID, 'git add .', { allowed: ['git commit'] });
    expect(r.exitCode).toBe(1);
    expect(outputText(r.output, 'stderr')).toContain("isn't available");
  });

  it('allows --help on any command', () => {
    const r = runLine(makeWorld(), MID, 'git add --help', { allowed: [] });
    expect(outputText(r.output, 'stderr')).not.toContain("isn't available");
  });

  it('allows everything when allowed is null', () => {
    const r = runLine(makeWorld(), MID, 'pwd', { allowed: null });
    expect(r.exitCode).toBe(0);
  });
});

describe('typo suggestions', () => {
  it('suggests similar commands for typos', () => {
    const r = runLine(makeWorld(), MID, 'lss');
    expect(r.exitCode).toBe(127);
    expect(outputText(r.output, 'stderr')).toContain('ls');
  });
});

describe('backward-compatible tokenize', () => {
  it('returns just words', () => {
    const words = tokenize('echo "hello world" > file.txt');
    // The simple tokenizer returns all words including redirect targets
    expect(words).toContain('hello world');
    expect(words).toContain('echo');
  });
});
