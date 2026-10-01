/**
 * Engine B command table.
 */
import type { CommandTable, EditorHandlerTable } from '../types';
import {
  stashHandler,
  commitHandler,
  amendEditorResume,
  resetHandler,
  reflogHandler,
} from './commands';

export const commandsB: CommandTable = {
  commit: commitHandler,
  stash: stashHandler,
  reset: resetHandler,
  reflog: reflogHandler,
};

export const editorHandlersB: EditorHandlerTable = {
  amend: amendEditorResume,
};

// Re-export amendCommit so Engine A's commit handler can delegate to it
export { amendCommit } from './commands';
