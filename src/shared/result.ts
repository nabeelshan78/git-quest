/**
 * FROZEN CONTRACT — the result every command returns.
 *
 * Commands are pure functions `(world, ...) => CommandResult`. They never
 * mutate the input world. `state` is the new world (the same object when
 * nothing changed is allowed but not required).
 *
 * Only the orchestrator may change this file.
 */
import type { GameEvent } from './events';
import type { World } from './types';

export interface OutputLine {
  stream: 'stdout' | 'stderr';
  /** One line of text without the trailing newline. May be "" for blank lines. */
  text: string;
}

/** One program run inside a typed line (a line may chain several with && or ;). */
export interface ExecutedCommand {
  /** Program name: "git", "ls", "cd", ... */
  program: string;
  /** Arguments after the program name, after quote removal and expansion. */
  argv: string[];
  exitCode: number;
  /** True when the world changed (ignoring the clock). Used for par counting. */
  changed: boolean;
}

export interface CommandResult {
  state: World;
  events: GameEvent[];
  /** Terminal output in display order. */
  output: OutputLine[];
  /** 0 on success. Git uses 1 for most failures, 128 for fatal errors, 129 for usage errors. */
  exitCode: number;
  /** Filled in by the shell layer (src/parser); engine commands may leave it undefined. */
  executed?: ExecutedCommand[];
}

// ---------------------------------------------------------------------------
// Small helpers every module may use
// ---------------------------------------------------------------------------

export function ok(state: World, output: OutputLine[] = [], events: GameEvent[] = []): CommandResult {
  return { state, events, output, exitCode: 0 };
}

export function fail(state: World, exitCode: number, output: OutputLine[], events: GameEvent[] = []): CommandResult {
  return { state, events, output, exitCode };
}

export function stdout(...lines: string[]): OutputLine[] {
  return lines.flatMap((l) => l.split('\n')).map((text) => ({ stream: 'stdout' as const, text }));
}

export function stderr(...lines: string[]): OutputLine[] {
  return lines.flatMap((l) => l.split('\n')).map((text) => ({ stream: 'stderr' as const, text }));
}

/** Convenience for git's "fatal: ..." errors (exit code 128). */
export function fatal(state: World, message: string): CommandResult {
  return fail(state, 128, stderr(`fatal: ${message}`));
}

/** Join output lines back into text (used by tests and the error translator). */
export function outputText(output: OutputLine[], stream?: 'stdout' | 'stderr'): string {
  return output
    .filter((l) => !stream || l.stream === stream)
    .map((l) => l.text)
    .join('\n');
}
