/**
 * Engine A command table — all Engine A handlers registered here.
 */
import type { CommandTable, EditorHandlerTable } from '../types';
import {
  initHandler,
  configHandler,
  statusHandler,
  addHandler,
  commitHandler,
  commitEditorResume,
  logHandler,
  diffHandler,
  restoreHandler,
  rmHandler,
  mvHandler,
  showHandler,
  branchHandler,
  switchHandler,
  checkoutHandler,
  mergeHandler,
  revertHandler,
  revertEditorResume,
} from './commands';

export const commandsA: CommandTable = {
  init: initHandler,
  config: configHandler,
  status: statusHandler,
  add: addHandler,
  commit: commitHandler,
  log: logHandler,
  diff: diffHandler,
  restore: restoreHandler,
  rm: rmHandler,
  mv: mvHandler,
  show: showHandler,
  branch: branchHandler,
  switch: switchHandler,
  checkout: checkoutHandler,
  merge: mergeHandler,
  revert: revertHandler,
};

export const editorHandlersA: EditorHandlerTable = {
  commit: commitEditorResume,
  revert: revertEditorResume,
};
