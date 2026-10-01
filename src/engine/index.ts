/**
 * Public engine API. UI, parser and level runner import from here.
 * (Handler modules in src/engine/a, src/engine/b and src/remote must import
 * from src/engine/core and sibling files instead, to avoid import cycles.)
 */
export { runGit, resumeEditor, implementedCommands, similarCommands } from './dispatch';
export { computeStatus } from './a/status';
export * from './core';
export type { GitContext, GitHandler, CommandTable, EditorResumeHandler, EditorHandlerTable } from './types';
