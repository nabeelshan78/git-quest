import { describe, it, expect } from 'vitest';
import { produce } from 'immer';
import { createWorld, createMachine } from '../../../src/engine/core/world';
import { writeFile, mkdirp } from '../../../src/engine/core/fs';
import { runShellCommand } from '../../../src/parser/shell';
import { outputText } from '../../../src/shared/result';

function makeWorld() {
  const m = createMachine({ user: 'intern', host: 'laptop' });
  return createWorld({ machines: [m] });
}

const MID = 'laptop';

describe('pwd', () => {
  it('prints the current directory', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'pwd', []);
    expect(r.exitCode).toBe(0);
    expect(outputText(r.output)).toContain('/home/intern');
  });
});

describe('ls', () => {
  it('lists directory contents', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/home/intern/a.txt', 'hello');
      writeFile(d.machines[MID].fs, '/home/intern/b.txt', 'world');
    });
    const r = runShellCommand(w, MID, 'ls', []);
    expect(r.exitCode).toBe(0);
    const out = outputText(r.output);
    expect(out).toContain('a.txt');
    expect(out).toContain('b.txt');
  });

  it('errors on nonexistent directory', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'ls', ['/nope']);
    expect(r.exitCode).toBe(2);
  });

  it('lists a specific path', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/tmp/hello.txt', 'hi');
    });
    const r = runShellCommand(w, MID, 'ls', ['/tmp']);
    expect(r.exitCode).toBe(0);
    expect(outputText(r.output)).toContain('hello.txt');
  });

  it('shows hidden files with -a', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/home/intern/.hidden', '');
      writeFile(d.machines[MID].fs, '/home/intern/visible', '');
    });
    const r = runShellCommand(w, MID, 'ls', ['-a']);
    expect(r.exitCode).toBe(0);
    const out = outputText(r.output);
    expect(out).toContain('.hidden');
    expect(out).toContain('visible');
  });
});

describe('cd', () => {
  it('changes directory', () => {
    const w = produce(makeWorld(), (d) => {
      mkdirp(d.machines[MID].fs, '/home/intern/project');
    });
    const r = runShellCommand(w, MID, 'cd', ['project']);
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].cwd).toBe('/home/intern/project');
  });

  it('cd with no args goes home', () => {
    const w = produce(makeWorld(), (d) => {
      d.machines[MID].cwd = '/tmp';
    });
    const r = runShellCommand(w, MID, 'cd', []);
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].cwd).toBe('/home/intern');
  });

  it('errors on nonexistent directory', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'cd', ['nope']);
    expect(r.exitCode).toBe(1);
  });

  it('supports ~ shortcut', () => {
    const w = produce(makeWorld(), (d) => {
      d.machines[MID].cwd = '/tmp';
    });
    const r = runShellCommand(w, MID, 'cd', ['~']);
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].cwd).toBe('/home/intern');
  });

  it('supports ..', () => {
    const w = produce(makeWorld(), (d) => {
      mkdirp(d.machines[MID].fs, '/home/intern/a/b');
      d.machines[MID].cwd = '/home/intern/a/b';
    });
    const r = runShellCommand(w, MID, 'cd', ['..']);
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].cwd).toBe('/home/intern/a');
  });
});

describe('mkdir', () => {
  it('creates a directory', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'mkdir', ['newdir']);
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].fs.dirs['/home/intern/newdir']).toBe(true);
  });

  it('creates nested directories with -p', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'mkdir', ['-p', 'a/b/c']);
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].fs.dirs['/home/intern/a/b/c']).toBe(true);
  });

  it('errors without operand', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'mkdir', []);
    expect(r.exitCode).toBe(1);
  });
});

describe('touch', () => {
  it('creates an empty file', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'touch', ['file.txt']);
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].fs.files['/home/intern/file.txt']).toBe('');
  });

  it('does not overwrite existing file', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/home/intern/file.txt', 'content');
    });
    const r = runShellCommand(w, MID, 'touch', ['file.txt']);
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].fs.files['/home/intern/file.txt']).toBe('content');
  });

  it('errors without operand', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'touch', []);
    expect(r.exitCode).toBe(1);
  });
});

describe('cat', () => {
  it('prints file contents', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/home/intern/file.txt', 'hello world');
    });
    const r = runShellCommand(w, MID, 'cat', ['file.txt']);
    expect(r.exitCode).toBe(0);
    expect(outputText(r.output)).toBe('hello world');
  });

  it('errors on missing file', () => {
    const w = makeWorld();
    const r = runShellCommand(w, MID, 'cat', ['nope.txt']);
    expect(r.exitCode).toBe(1);
  });

  it('concatenates multiple files', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/home/intern/a.txt', 'A');
      writeFile(d.machines[MID].fs, '/home/intern/b.txt', 'B');
    });
    const r = runShellCommand(w, MID, 'cat', ['a.txt', 'b.txt']);
    expect(r.exitCode).toBe(0);
    expect(outputText(r.output)).toContain('A');
    expect(outputText(r.output)).toContain('B');
  });
});

describe('echo', () => {
  it('prints text', () => {
    const r = runShellCommand(makeWorld(), MID, 'echo', ['hello', 'world']);
    expect(r.exitCode).toBe(0);
    expect(outputText(r.output)).toBe('hello world');
  });

  it('writes to file with redirect', () => {
    const r = runShellCommand(makeWorld(), MID, 'echo', ['content'], { target: 'out.txt', append: false });
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].fs.files['/home/intern/out.txt']).toBe('content\n');
  });

  it('appends to file with append redirect', () => {
    const w = produce(makeWorld(), (d) => {
      writeFile(d.machines[MID].fs, '/home/intern/out.txt', 'first\n');
    });
    const r = runShellCommand(w, MID, 'echo', ['second'], { target: 'out.txt', append: true });
    expect(r.exitCode).toBe(0);
    expect(r.state.machines[MID].fs.files['/home/intern/out.txt']).toBe('first\nsecond\n');
  });
});

describe('clear', () => {
  it('returns a shell.clear event', () => {
    const r = runShellCommand(makeWorld(), MID, 'clear', []);
    expect(r.exitCode).toBe(0);
    expect(r.events).toContainEqual({ type: 'shell.clear', machine: MID });
  });
});

describe('help', () => {
  it('lists available commands', () => {
    const r = runShellCommand(makeWorld(), MID, 'help', []);
    expect(r.exitCode).toBe(0);
    expect(outputText(r.output)).toContain('pwd');
    expect(outputText(r.output)).toContain('git');
  });
});

describe('history', () => {
  it('shows command history', () => {
    const w = produce(makeWorld(), (d) => {
      d.machines[MID].history = ['ls', 'pwd', 'git status'];
    });
    const r = runShellCommand(w, MID, 'history', []);
    expect(r.exitCode).toBe(0);
    const out = outputText(r.output);
    expect(out).toContain('ls');
    expect(out).toContain('pwd');
    expect(out).toContain('git status');
  });
});
