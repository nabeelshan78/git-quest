/**
 * Simulated shell builtins for Chapter 0 and general use.
 * Every handler is a pure function returning CommandResult.
 */
import { produce } from 'immer';
import type { CommandResult, OutputLine } from '../shared/result';
import { ok, fail, stdout, stderr } from '../shared/result';
import type { GameEvent } from '../shared/events';
import type { World, Machine, MachineId } from '../shared/types';
import {
  readFile,
  writeFile,
  fileExists,
  dirExists,
  listDir,
  mkdirp,
} from '../engine/core/fs';
import { resolvePath, normalize, basename } from '../engine/core/paths';

type ShellHandler = (world: World, machineId: MachineId, args: string[]) => CommandResult;

function getMachine(world: World, machineId: MachineId): Machine {
  return world.machines[machineId];
}

// ---------------------------------------------------------------------------
// pwd
// ---------------------------------------------------------------------------
function shellPwd(world: World, machineId: MachineId, _args: string[]): CommandResult {
  const m = getMachine(world, machineId);
  return ok(world, stdout(m.cwd));
}

// ---------------------------------------------------------------------------
// ls
// ---------------------------------------------------------------------------
function shellLs(world: World, machineId: MachineId, args: string[]): CommandResult {
  const m = getMachine(world, machineId);
  let showAll = false;
  let longFormat = false;
  const paths: string[] = [];

  for (const arg of args) {
    if (arg === '-a' || arg === '--all') {
      showAll = true;
    } else if (arg === '-l') {
      longFormat = true;
    } else if (arg === '-la' || arg === '-al') {
      showAll = true;
      longFormat = true;
    } else if (arg.startsWith('-')) {
      // absorb unknown flags silently for simplicity
    } else {
      paths.push(arg);
    }
  }

  const targets = paths.length === 0 ? [m.cwd] : paths.map((p) => resolvePath(m.cwd, m.home, p));
  const output: OutputLine[] = [];

  for (const target of targets) {
    if (!dirExists(m.fs, target)) {
      if (fileExists(m.fs, target)) {
        // ls on a file just prints the file
        output.push(...stdout(basename(target)));
        continue;
      }
      return fail(world, 2, stderr(`ls: cannot access '${paths.length ? paths[targets.indexOf(target)] : target}': No such file or directory`));
    }

    if (targets.length > 1) {
      output.push(...stdout(`${target}:`));
    }

    const entries = listDir(m.fs, target);
    const names = entries
      .filter((e) => showAll || !e.name.startsWith('.'))
      .map((e) => e.name);

    if (showAll) {
      names.unshift('.', '..');
    }

    if (longFormat) {
      for (const name of names) {
        if (name === '.' || name === '..') {
          output.push(...stdout(`drwxr-xr-x  -  ${name}`));
        } else {
          const entry = entries.find((e) => e.name === name);
          if (entry?.isDir) {
            output.push(...stdout(`drwxr-xr-x  -  ${name}/`));
          } else {
            const fullPath = normalize(`${target}/${name}`);
            const content = readFile(m.fs, fullPath);
            const size = content !== undefined ? content.length : 0;
            output.push(...stdout(`-rw-r--r--  ${size}  ${name}`));
          }
        }
      }
    } else {
      if (names.length > 0) {
        output.push(...stdout(names.join('  ')));
      }
    }
  }

  return ok(world, output);
}

// ---------------------------------------------------------------------------
// cd
// ---------------------------------------------------------------------------
function shellCd(world: World, machineId: MachineId, args: string[]): CommandResult {
  const m = getMachine(world, machineId);
  const target = args[0] ?? '~';
  const resolved = resolvePath(m.cwd, m.home, target);

  if (!dirExists(m.fs, resolved)) {
    return fail(world, 1, stderr(`cd: ${target}: No such file or directory`));
  }

  const newWorld = produce(world, (draft) => {
    draft.machines[machineId].cwd = resolved;
  });
  return ok(newWorld);
}

// ---------------------------------------------------------------------------
// mkdir
// ---------------------------------------------------------------------------
function shellMkdir(world: World, machineId: MachineId, args: string[]): CommandResult {
  let createParents = false;
  const paths: string[] = [];

  for (const arg of args) {
    if (arg === '-p' || arg === '--parents') {
      createParents = true;
    } else if (arg.startsWith('-')) {
      // ignore unknown flags
    } else {
      paths.push(arg);
    }
  }

  if (paths.length === 0) {
    return fail(world, 1, stderr('mkdir: missing operand'));
  }

  const newWorld = produce(world, (draft) => {
    const dm = draft.machines[machineId];
    for (const p of paths) {
      const resolved = resolvePath(dm.cwd, dm.home, p);
      if (dirExists(dm.fs, resolved)) {
        if (!createParents) {
          // We'll handle this as a non-fatal warning
          continue;
        }
        continue;
      }
      if (!createParents) {
        // Check parent exists
        const parent = normalize(resolved.replace(/\/[^/]+$/, '') || '/');
        if (!dirExists(dm.fs, parent)) {
          // This case could error, but for simplicity just mkdirp
          mkdirp(dm.fs, resolved);
          continue;
        }
      }
      mkdirp(dm.fs, resolved);
    }
  });

  return ok(newWorld);
}

// ---------------------------------------------------------------------------
// touch
// ---------------------------------------------------------------------------
function shellTouch(world: World, machineId: MachineId, args: string[]): CommandResult {
  const paths = args.filter((a) => !a.startsWith('-'));

  if (paths.length === 0) {
    return fail(world, 1, stderr("touch: missing file operand"));
  }

  const newWorld = produce(world, (draft) => {
    const dm = draft.machines[machineId];
    for (const p of paths) {
      const resolved = resolvePath(dm.cwd, dm.home, p);
      if (!fileExists(dm.fs, resolved)) {
        writeFile(dm.fs, resolved, '');
      }
    }
  });

  return ok(newWorld);
}

// ---------------------------------------------------------------------------
// cat
// ---------------------------------------------------------------------------
function shellCat(world: World, machineId: MachineId, args: string[]): CommandResult {
  const m = getMachine(world, machineId);
  const paths = args.filter((a) => !a.startsWith('-'));

  if (paths.length === 0) {
    return fail(world, 1, stderr('cat: missing file operand'));
  }

  const output: OutputLine[] = [];
  for (const p of paths) {
    const resolved = resolvePath(m.cwd, m.home, p);
    const content = readFile(m.fs, resolved);
    if (content === undefined) {
      return fail(world, 1, stderr(`cat: ${p}: No such file or directory`));
    }
    if (content === '') {
      // empty file: no output lines
      continue;
    }
    output.push(...stdout(content));
  }

  return ok(world, output);
}

// ---------------------------------------------------------------------------
// echo
// ---------------------------------------------------------------------------

export interface RedirectionInfo {
  text: string;
  target: string | null;
  append: boolean;
}

/**
 * Process echo arguments with redirection tokens already parsed.
 * `args` is the word tokens; `redirect` is { target, append } if a > or >> was found.
 */
function shellEcho(
  world: World,
  machineId: MachineId,
  args: string[],
  redirect?: { target: string; append: boolean },
): CommandResult {
  const text = args.join(' ');

  if (redirect) {
    const m = getMachine(world, machineId);
    const resolved = resolvePath(m.cwd, m.home, redirect.target);
    const newWorld = produce(world, (draft) => {
      const dm = draft.machines[machineId];
      if (redirect.append) {
        const existing = readFile(dm.fs, resolved) ?? '';
        writeFile(dm.fs, resolved, existing + text + '\n');
      } else {
        writeFile(dm.fs, resolved, text + '\n');
      }
    });
    return ok(newWorld);
  }

  return ok(world, stdout(text));
}

// ---------------------------------------------------------------------------
// clear
// ---------------------------------------------------------------------------
function shellClear(world: World, machineId: MachineId, _args: string[]): CommandResult {
  const events: GameEvent[] = [{ type: 'shell.clear', machine: machineId }];
  return { state: world, events, output: [], exitCode: 0 };
}

// ---------------------------------------------------------------------------
// help
// ---------------------------------------------------------------------------
function shellHelp(world: World, _machineId: MachineId, _args: string[]): CommandResult {
  const lines = [
    'Available commands:',
    '  pwd            Print working directory',
    '  ls [path]      List directory contents',
    '  cd <path>      Change directory',
    '  mkdir [-p] <path>  Create directory',
    '  touch <file>   Create an empty file',
    '  cat <file>     Show file contents',
    '  echo <text>    Print text (supports > and >> redirection)',
    '  clear          Clear the terminal',
    '  help           Show this help',
    '  history        Show command history',
    '',
    '  git <command>  Run a git command (try: git help)',
  ];
  return ok(world, stdout(...lines));
}

// ---------------------------------------------------------------------------
// history
// ---------------------------------------------------------------------------
function shellHistory(world: World, machineId: MachineId, _args: string[]): CommandResult {
  const m = getMachine(world, machineId);
  const lines = m.history.map((cmd, i) => `  ${i + 1}  ${cmd}`);
  return ok(world, stdout(...lines));
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const SHELL_COMMANDS: Record<string, ShellHandler> = {
  pwd: shellPwd,
  ls: shellLs,
  cd: shellCd,
  mkdir: shellMkdir,
  touch: shellTouch,
  cat: shellCat,
  clear: shellClear,
  help: shellHelp,
  history: shellHistory,
  // echo is special-cased because of redirection
};

/** All known shell command names, for completion and typo suggestions. */
export const SHELL_COMMAND_NAMES = [...Object.keys(SHELL_COMMANDS), 'echo'];

export function isShellCommand(name: string): boolean {
  return name === 'echo' || name in SHELL_COMMANDS;
}

/**
 * Run a shell builtin. For echo, pass the redirect info separately.
 */
export function runShellCommand(
  world: World,
  machineId: MachineId,
  program: string,
  args: string[],
  redirect?: { target: string; append: boolean },
): CommandResult {
  if (program === 'echo') {
    return shellEcho(world, machineId, args, redirect);
  }
  const handler = SHELL_COMMANDS[program];
  if (!handler) {
    return fail(world, 127, stderr(`bash: ${program}: command not found`));
  }
  return handler(world, machineId, args);
}
