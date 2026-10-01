import { describe, it, expect } from 'vitest';
import { tokenize } from '../../../src/parser/tokenize';

describe('tokenize', () => {
  it('splits simple words', () => {
    const { tokens } = tokenize('git status');
    expect(tokens).toEqual([
      { value: 'git', kind: 'word' },
      { value: 'status', kind: 'word' },
    ]);
  });

  it('handles single quotes', () => {
    const { tokens } = tokenize("echo 'hello world'");
    expect(tokens.map((t) => t.value)).toEqual(['echo', 'hello world']);
  });

  it('handles double quotes', () => {
    const { tokens } = tokenize('echo "hello world"');
    expect(tokens.map((t) => t.value)).toEqual(['echo', 'hello world']);
  });

  it('handles double-quote escapes', () => {
    const { tokens } = tokenize('echo "say \\"hi\\""');
    expect(tokens[1].value).toBe('say "hi"');
  });

  it('handles backslash escape for space', () => {
    const { tokens } = tokenize('echo hello\\ world');
    expect(tokens[1].value).toBe('hello world');
  });

  it('recognizes > redirect', () => {
    const { tokens } = tokenize('echo hello > file.txt');
    expect(tokens).toEqual([
      { value: 'echo', kind: 'word' },
      { value: 'hello', kind: 'word' },
      { value: '>', kind: 'redirect-out' },
      { value: 'file.txt', kind: 'word' },
    ]);
  });

  it('recognizes >> redirect', () => {
    const { tokens } = tokenize('echo bye >> file.txt');
    expect(tokens[2]).toEqual({ value: '>>', kind: 'redirect-append' });
  });

  it('recognizes pipe', () => {
    const { tokens } = tokenize('ls | grep foo');
    expect(tokens[1]).toEqual({ value: '|', kind: 'pipe' });
  });

  it('recognizes semicolons', () => {
    const { tokens } = tokenize('pwd; ls');
    expect(tokens).toEqual([
      { value: 'pwd', kind: 'word' },
      { value: ';', kind: 'semicolon' },
      { value: 'ls', kind: 'word' },
    ]);
  });

  it('reports unterminated single quote', () => {
    const result = tokenize("echo 'hello");
    expect(result.error).toBe('Unterminated single quote');
  });

  it('reports unterminated double quote', () => {
    const result = tokenize('echo "hello');
    expect(result.error).toBe('Unterminated double quote');
  });

  it('handles empty input', () => {
    const { tokens } = tokenize('');
    expect(tokens).toEqual([]);
  });

  it('handles multiple spaces between words', () => {
    const { tokens } = tokenize('git   status');
    expect(tokens.map((t) => t.value)).toEqual(['git', 'status']);
  });

  it('handles \\n escape in double quotes', () => {
    const { tokens } = tokenize('echo "line1\\nline2"');
    expect(tokens[1].value).toBe('line1\nline2');
  });

  it('handles adjacent quoted and unquoted segments', () => {
    const { tokens } = tokenize('echo "hello"world');
    expect(tokens[1].value).toBe('helloworld');
  });
});
