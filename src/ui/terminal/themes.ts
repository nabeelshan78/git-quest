/**
 * Terminal colours for the two app themes (light and dark only, per
 * docs/SCOPE.md). Every role colour has at least 4.5:1 contrast against the
 * terminal background.
 */
import type { ITheme } from '@xterm/xterm';
import type { ResolvedTheme } from '../state/settings';

export interface TerminalRoles {
  user: string;
  path: string;
  branch: string;
  stderr: string;
  ada: string;
  system: string;
  dialogue: string;
  hint: string;
}

export interface TerminalTheme {
  id: ResolvedTheme;
  xterm: ITheme;
  roles: TerminalRoles;
}

function theme(id: ResolvedTheme, bg: string, fg: string, cursor: string, selection: string, roles: TerminalRoles): TerminalTheme {
  return {
    id,
    roles,
    xterm: {
      background: bg,
      foreground: fg,
      cursor,
      cursorAccent: bg,
      selectionBackground: selection,
      red: roles.stderr,
      green: roles.user,
      yellow: roles.branch,
      blue: roles.path,
      cyan: roles.ada,
      magenta: roles.dialogue,
      brightBlack: roles.system,
    },
  };
}

export const TERMINAL_THEMES: Record<ResolvedTheme, TerminalTheme> = {
  dark: theme('dark', '#1c1b22', '#f3ede2', '#f5c36b', '#4a4458', {
    user: '#8fd694',
    path: '#8cc4ff',
    branch: '#f5c36b',
    stderr: '#ff9b8a',
    ada: '#7fd8e8',
    system: '#b3adbf',
    dialogue: '#efb3e3',
    hint: '#c9c3d3',
  }),
  light: theme('light', '#fbf8f1', '#2a2622', '#8a5a00', '#e3d9c4', {
    user: '#2f6a2f',
    path: '#1c56a0',
    branch: '#7d5200',
    stderr: '#a8231b',
    ada: '#00636f',
    system: '#5a5560',
    dialogue: '#86346f',
    hint: '#4f4a55',
  }),
};

export function terminalThemeFor(theme: ResolvedTheme): TerminalTheme {
  return TERMINAL_THEMES[theme];
}
