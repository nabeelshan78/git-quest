/**
 * FROZEN CONTRACT — how git subcommand handlers plug into the dispatcher.
 * Only the orchestrator may change this file.
 */
import type { ParsedArgs } from '../shared/args';
import type { CommandResult } from '../shared/result';
import type { EditorRequest, MachineId, World } from '../shared/types';

export interface GitContext {
  machineId: MachineId;
  /** Subcommand name after alias expansion, e.g. "commit". */
  command: string;
  /** Parsed according to GIT_COMMANDS[command]. */
  args: ParsedArgs;
  /** Raw arguments after the subcommand. */
  argv: string[];
}

/** A git subcommand: pure function from world to result. Never mutate `world`. */
export type GitHandler = (world: World, ctx: GitContext) => CommandResult;

export type CommandTable = Record<string, GitHandler>;

/**
 * Continues a command that opened an editor (see EditorRequest.resume.handler).
 * `text` is the saved file content, or null when the player aborted.
 * The dispatcher has already cleared `machine.editor` in `world`.
 */
export type EditorResumeHandler = (world: World, request: EditorRequest, text: string | null) => CommandResult;

export type EditorHandlerTable = Record<string, EditorResumeHandler>;
