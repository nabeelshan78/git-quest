/**
 * Public API of the command-line layer: shell builtins, quoting, chaining,
 * redirection, git dispatch, allowed-command lists, completion, help.
 *
 * Keeps the same exported signatures as the foundation stub so that other
 * workstreams (UI, level runner) continue to work.
 */
import { produce } from 'immer';
import { runGit } from '../engine';
import type { CommandResult, ExecutedCommand, OutputLine } from '../shared/result';
import { ok, fail, stderr } from '../shared/result';
import type { CompletionResult } from '../shared/session';
import type { World } from '../shared/types';
import { worldChanged } from '../shared/compare';
import { tokenize as fullTokenize, type Token } from './tokenize';
import { isShellCommand, runShellCommand } from './shell';
import { suggestCommand } from './suggest';
import { completeLine as doComplete } from './complete';

export { tokenize as tokenizeFull } from './tokenize';
export type { Token, TokenizeResult } from './tokenize';

export interface RunLineOptions {
  /** Command prefixes allowed in the level (e.g. "git status", "ls"); null/undefined = everything. */
  allowed?: string[] | null;
}

/** Always-allowed command prefixes (docs/CONTENT_GUIDE.md). */
const ALWAYS_ALLOWED = [
  'clear',
  'help',
  'history',
  'pwd',
  'ls',
  'cat',
  'git status',
  'git log',
  'git diff',
  'git show',
  'git help',
];

/** Backward-compatible simple tokenizer: returns just words (no operators). */
export function tokenize(line: string): string[] {
  const { tokens } = fullTokenize(line);
  return tokens.filter((t) => t.kind === 'word').map((t) => t.value);
}

// ---------------------------------------------------------------------------
// Allowed-command filtering
// ---------------------------------------------------------------------------

function isAllowed(line: string, allowed: string[] | null | undefined): boolean {
  if (allowed == null) return true;

  const trimmed = line.trim();

  // --help is always allowed
  if (trimmed.endsWith('--help') || trimmed.endsWith('-h')) return true;

  // Check always-allowed prefixes
  for (const prefix of ALWAYS_ALLOWED) {
    if (trimmed === prefix || trimmed.startsWith(prefix + ' ')) return true;
  }

  // Check level-specific allowed prefixes
  for (const prefix of allowed) {
    if (trimmed === prefix || trimmed.startsWith(prefix + ' ')) return true;
  }

  return false;
}

function blockedMessage(allowed: string[]): OutputLine[] {
  const brief = allowed.slice(0, 6).join(', ');
  return stderr(`That command isn't available in this level. Try: ${brief}`);
}

// ---------------------------------------------------------------------------
// Single command execution (no chaining)
// ---------------------------------------------------------------------------

function runSingle(
  world: World,
  machineId: string,
  tokens: Token[],
): CommandResult {
  // Separate words from redirections
  const words: string[] = [];
  let redirect: { target: string; append: boolean } | undefined;

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.kind === 'redirect-out' || t.kind === 'redirect-append') {
      const nextWord = tokens[i + 1];
      if (!nextWord || nextWord.kind !== 'word') {
        return fail(world, 2, stderr('bash: syntax error near unexpected token `newline\''));
      }
      redirect = { target: nextWord.value, append: t.kind === 'redirect-append' };
      i++; // skip the filename
      continue;
    }
    if (t.kind === 'pipe') {
      return fail(world, 1, stderr('Pipes are not supported in this terminal. Try running each command separately.'));
    }
    if (t.kind === 'word') {
      words.push(t.value);
    }
  }

  if (words.length === 0) {
    return ok(world);
  }

  const [program, ...argv] = words;

  // Git dispatch
  if (program === 'git') {
    const r = runGit(world, machineId, argv);
    return r;
  }

  // Shell commands
  if (isShellCommand(program)) {
    return runShellCommand(world, machineId, program, argv, redirect);
  }

  // Unknown command — suggest similar
  const suggestions = suggestCommand(program);
  if (suggestions.length > 0) {
    const suggestionText = suggestions.length === 1
      ? `\n\nDid you mean '${suggestions[0]}'?`
      : `\n\nDid you mean one of these?\n${suggestions.map((s) => `  ${s}`).join('\n')}`;
    return fail(world, 127, stderr(`bash: ${program}: command not found${suggestionText}`));
  }

  return fail(world, 127, stderr(`bash: ${program}: command not found`));
}

// ---------------------------------------------------------------------------
// runLine: main entry point
// ---------------------------------------------------------------------------

/** Run one typed line on a machine, handling chaining with `;`, `&&`, `||`. */
export function runLine(
  world: World,
  machineId: string,
  line: string,
  options: RunLineOptions = {},
): CommandResult {
  const trimmed = line.trim();

  // Empty line
  if (!trimmed) {
    return { state: world, events: [], output: [], exitCode: 0, executed: [] };
  }

  // Add to history
  world = produce(world, (draft) => {
    draft.machines[machineId].history.push(trimmed);
  });

  // Check allowed commands
  if (!isAllowed(trimmed, options.allowed)) {
    return {
      state: world,
      events: [],
      output: blockedMessage(options.allowed ?? []),
      exitCode: 1,
      executed: [],
    };
  }

  // Tokenize
  const { tokens, error } = fullTokenize(trimmed);
  if (error) {
    return {
      state: world,
      events: [],
      output: stderr(`bash: ${error}`),
      exitCode: 2,
      executed: [],
    };
  }

  // Split into segments separated by `;`, `&&`, `||`
  const segments = splitByOperators(tokens);
  if (segments.length === 0) {
    return { state: world, events: [], output: [], exitCode: 0, executed: [] };
  }

  let currentWorld = world;
  const allOutput: OutputLine[] = [];
  const allExecuted: ExecutedCommand[] = [];
  const allEvents: import('../shared/events').GameEvent[] = [];
  let lastExitCode = 0;

  for (const seg of segments) {
    if (seg.tokens.length === 0) continue;

    // Handle && and || chaining
    if (seg.operator === '&&' && lastExitCode !== 0) continue;
    if (seg.operator === '||' && lastExitCode === 0) continue;

    const wordsBefore = currentWorld;
    const r = runSingle(currentWorld, machineId, seg.tokens);

    // Build program + argv for ExecutedCommand
    const words = seg.tokens.filter((t) => t.kind === 'word').map((t) => t.value);
    const [program, ...argv] = words.length > 0 ? words : [''];

    allOutput.push(...r.output);
    allEvents.push(...r.events);
    lastExitCode = r.exitCode;
    allExecuted.push({
      program,
      argv,
      exitCode: r.exitCode,
      changed: worldChanged(wordsBefore, r.state),
    });
    currentWorld = r.state;
  }

  return {
    state: currentWorld,
    events: allEvents,
    output: allOutput,
    exitCode: lastExitCode,
    executed: allExecuted,
  };
}

/** Tab completion for a partial line. */
export function completeLine(world: World, machineId: string, line: string): CompletionResult {
  return doComplete(world, machineId, line);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface Segment {
  /** The operator that preceded this segment: null for the first, ';', '&&', or '||' for the rest. */
  operator: null | ';' | '&&' | '||';
  tokens: Token[];
}

function splitByOperators(tokens: Token[]): Segment[] {
  const result: Segment[] = [];
  let current: Token[] = [];
  let pendingOp: Segment['operator'] = null;
  for (const t of tokens) {
    if (t.kind === 'semicolon' || t.kind === 'and' || t.kind === 'or') {
      if (current.length > 0) {
        result.push({ operator: pendingOp, tokens: current });
        current = [];
      }
      pendingOp = t.kind === 'semicolon' ? ';' : t.kind === 'and' ? '&&' : '||';
    } else {
      current.push(t);
    }
  }
  if (current.length > 0) {
    result.push({ operator: pendingOp, tokens: current });
  }
  return result;
}
