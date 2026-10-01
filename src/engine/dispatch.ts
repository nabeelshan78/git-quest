/**
 * The git command dispatcher: global options, aliases, option parsing,
 * routing to Engine A / Engine B / Remote handlers, editor resumption and
 * the simulated clock. Owned by the orchestrator.
 *
 * Import rule: handler modules (src/engine/a, src/engine/b, src/remote) must
 * NOT import this file or src/engine/index.ts (that would create a cycle).
 */
import { produce } from 'immer';
import { GIT_COMMANDS, SIMULATED_GIT_VERSION, allGitCommandNames } from '../shared/commandSpecs';
import { getList, isParseError, parseArgs, parseGlobalOptions } from '../shared/args';
import { CLOCK_STEP } from '../shared/constants';
import type { CommandResult } from '../shared/result';
import { fail, ok, stderr, stdout } from '../shared/result';
import type { World } from '../shared/types';
import { commandsA, editorHandlersA } from './a';
import { commandsB, editorHandlersB } from './b';
import { remoteCommands } from '../remote/commands';
import { findRepo, normalizeConfigKey, getConfig } from './core/repo';
import { resolvePath } from './core/paths';
import { dirExists } from './core/fs';
import type { CommandTable, EditorHandlerTable } from './types';

const TABLE: CommandTable = { ...commandsA, ...commandsB, ...remoteCommands };
const EDITOR_HANDLERS: EditorHandlerTable = { ...editorHandlersA, ...editorHandlersB };

/** Names of subcommands that currently have an implementation. */
export function implementedCommands(): string[] {
  return Object.keys(TABLE).sort();
}

function levenshtein(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

/** Git-style "did you mean" candidates for an unknown subcommand. */
export function similarCommands(name: string): string[] {
  const scored = allGitCommandNames()
    .filter((c) => !GIT_COMMANDS[c].hidden)
    .map((c) => ({ c, d: levenshtein(name, c) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(name.length / 3)))
    .sort((x, y) => x.d - y.d || x.c.localeCompare(y.c));
  if (!scored.length) return [];
  const best = scored[0].d;
  return scored.filter((x) => x.d === best).map((x) => x.c);
}

function splitAlias(value: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}

function tick(result: CommandResult): CommandResult {
  return { ...result, state: produce(result.state, (d) => void (d.clock += CLOCK_STEP)) };
}

function generalUsage(): string[] {
  return [
    'usage: git [-v | --version] [-h | --help] [-C <path>] [-c <name>=<value>]',
    '           <command> [<args>]',
    '',
    'These are common Git commands used in various situations:',
    '',
    ...allGitCommandNames()
      .filter((c) => !GIT_COMMANDS[c].hidden)
      .map((c) => `   ${c.padEnd(12)} ${GIT_COMMANDS[c].summary}`),
  ];
}

/**
 * Run `git <argv...>` on a machine. `argv` excludes the leading "git".
 * The simulated clock advances by CLOCK_STEP after every invocation.
 */
export function runGit(world: World, machineId: string, argv: string[]): CommandResult {
  return tick(runGitNoTick(world, machineId, argv, 0));
}

function runGitNoTick(world: World, machineId: string, argv: string[], depth: number): CommandResult {
  const machine = world.machines[machineId];
  if (!machine) return fail(world, 128, stderr(`fatal: unknown machine '${machineId}'`));
  const global = parseGlobalOptions(argv);
  if (global.error) return fail(world, 129, stderr(...global.error));
  if (global.options.version) return ok(world, stdout(SIMULATED_GIT_VERSION));
  const rest = global.rest;
  if (rest.length === 0) return fail(world, 1, stdout(...generalUsage()));
  if (global.options.help || rest[0] === 'help') {
    const topic = global.options.help ? rest[0] : rest[1];
    const spec = topic ? GIT_COMMANDS[topic] : undefined;
    if (spec) return ok(world, stdout(`NAME`, `    git-${spec.name} - ${spec.summary}`, '', 'SYNOPSIS', ...spec.usage.map((u) => `    ${u}`)));
    return ok(world, stdout(...generalUsage()));
  }

  // -C <path>: run as if started in <path>.
  let w = world;
  const originalCwd = machine.cwd;
  const cPath = global.options.C as string | undefined;
  if (cPath !== undefined) {
    const target = resolvePath(machine.cwd, machine.home, cPath);
    if (!dirExists(machine.fs, target)) return fail(world, 128, stderr(`fatal: cannot change to '${cPath}': No such file or directory`));
    w = produce(w, (d) => void (d.machines[machineId].cwd = target));
  }

  // -c name=value: temporary config for this command only.
  const overrides = getList({ options: global.options, positionals: [], paths: null, subcommand: null }, 'c');
  const saved: SavedConfig[] = [];
  if (overrides.length) {
    const root = findRepo(w, machineId)?.root ?? null;
    w = produce(w, (d) => {
      const m = d.machines[machineId];
      for (const o of overrides) {
        const eq = o.indexOf('=');
        const key = normalizeConfigKey(eq >= 0 ? o.slice(0, eq) : o);
        const value = eq >= 0 ? o.slice(eq + 1) : 'true';
        const local = root ? m.repos[root].config : null;
        saved.push({ key, root, global: m.globalConfig[key], local: local ? local[key] : undefined });
        m.globalConfig[key] = value;
        if (local) local[key] = value;
      }
    });
  }

  let name = rest[0];
  let args = rest.slice(1);
  // Aliases (alias.<name> in config); built-in commands cannot be overridden, as in git.
  if (!GIT_COMMANDS[name]) {
    const handle = findRepo(w, machineId);
    const alias = getConfig(w.machines[machineId], handle?.repo, `alias.${name}`);
    if (alias !== undefined) {
      if (alias.startsWith('!')) return fail(world, 1, stderr(`fatal: shell aliases are not supported in this simulator ('${name}')`));
      if (depth > 5) return fail(world, 128, stderr(`fatal: alias loop detected: expansion of '${name}' does not terminate`));
      const expanded = [...splitAlias(alias), ...args];
      const r = runGitNoTick(w, machineId, expanded, depth + 1);
      return restore(r, machineId, originalCwd, cPath !== undefined, saved);
    }
  }
  const spec = GIT_COMMANDS[name];
  const handler = TABLE[name];
  if (!spec || !handler) {
    const similar = similarCommands(name);
    const lines = [`git: '${name}' is not a git command. See 'git --help'.`];
    if (similar.length) lines.push('', similar.length === 1 ? 'The most similar command is' : 'The most similar commands are', ...similar.map((s) => `\t${s}`));
    return fail(world, 1, stderr(...lines));
  }
  if (args.includes('-h')) {
    return fail(world, 129, stdout(...spec.usage.map((u, i) => (i === 0 ? `usage: ${u}` : `   or: ${u}`))));
  }
  if (args.includes('--help')) {
    return ok(world, stdout(`NAME`, `    git-${spec.name} - ${spec.summary}`, '', 'SYNOPSIS', ...spec.usage.map((u) => `    ${u}`)));
  }
  const parsed = parseArgs(spec, args);
  if (isParseError(parsed)) return fail(world, parsed.exitCode, stderr(...parsed.lines));
  name = spec.name;
  args = [...args];
  const result = handler(w, { machineId, command: name, args: parsed, argv: args });
  return restore(result, machineId, originalCwd, cPath !== undefined, saved);
}

interface SavedConfig {
  key: string;
  root: string | null;
  global: string | undefined;
  local: string | undefined;
}

function restore(result: CommandResult, machineId: string, originalCwd: string, restoreCwd: boolean, saved: SavedConfig[]): CommandResult {
  if (!restoreCwd && saved.length === 0) return result;
  const state = produce(result.state, (d) => {
    const m = d.machines[machineId];
    if (!m) return;
    for (const s of [...saved].reverse()) {
      if (s.global === undefined) delete m.globalConfig[s.key];
      else m.globalConfig[s.key] = s.global;
      const repo = s.root ? m.repos[s.root] : undefined;
      if (repo) {
        if (s.local === undefined) delete repo.config[s.key];
        else repo.config[s.key] = s.local;
      }
    }
    if (restoreCwd) m.cwd = originalCwd;
  });
  return { ...result, state };
}

/**
 * Continue the command that opened the machine's pending editor.
 * `text` is the saved content, or null to abort (quit without saving).
 */
export function resumeEditor(world: World, machineId: string, text: string | null): CommandResult {
  const machine = world.machines[machineId];
  const request = machine?.editor;
  if (!machine || !request) return fail(world, 1, stderr('error: there is no editor waiting for input'));
  const handler = EDITOR_HANDLERS[request.resume.handler];
  const cleared = produce(world, (d) => void (d.machines[machineId].editor = null));
  if (!handler) return fail(cleared, 1, stderr(`error: unknown editor handler '${request.resume.handler}'`));
  const r = handler(cleared, request, text);
  return tick({ ...r, events: [{ type: 'editor.close', machine: machineId, saved: text !== null }, ...r.events] });
}
