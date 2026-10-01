/**
 * Terminal colour themes. Some unlock with stars (cosmetic only); the
 * readable defaults and the high-contrast theme are always available.
 * Every role colour has at least 4.5:1 contrast against its background.
 */
import type { ITheme } from '@xterm/xterm';

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
  id: string;
  dark: boolean;
  xterm: ITheme;
  roles: TerminalRoles;
}

function theme(id: string, dark: boolean, bg: string, fg: string, cursor: string, selection: string, roles: TerminalRoles): TerminalTheme {
  return {
    id,
    dark,
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

export const TERMINAL_THEMES: TerminalTheme[] = [
  theme('lantern', true, '#1c1b22', '#f3ede2', '#f5c36b', '#4a4458', {
    user: '#8fd694',
    path: '#8cc4ff',
    branch: '#f5c36b',
    stderr: '#ff9b8a',
    ada: '#7fd8e8',
    system: '#b3adbf',
    dialogue: '#efb3e3',
    hint: '#c9c3d3',
  }),
  theme('paper', false, '#fbf8f1', '#2a2622', '#8a5a00', '#e3d9c4', {
    user: '#2f6a2f',
    path: '#1c56a0',
    branch: '#7d5200',
    stderr: '#a8231b',
    ada: '#00636f',
    system: '#5a5560',
    dialogue: '#86346f',
    hint: '#4f4a55',
  }),
  theme('contrast', true, '#000000', '#ffffff', '#ffff00', '#555555', {
    user: '#7cfc00',
    path: '#87cefa',
    branch: '#ffd700',
    stderr: '#ff7b7b',
    ada: '#00ffff',
    system: '#e6e6e6',
    dialogue: '#ff99ff',
    hint: '#ffffff',
  }),
  theme('river', true, '#0f2230', '#e6f1f7', '#7fdbca', '#2b4a60', {
    user: '#9be29b',
    path: '#9fd0ff',
    branch: '#ffd27f',
    stderr: '#ffa69e',
    ada: '#7fdbca',
    system: '#b4c6d3',
    dialogue: '#f0b7e8',
    hint: '#c7d6e0',
  }),
  theme('festival', true, '#2a1630', '#fbe9d6', '#ffb347', '#5b3a63', {
    user: '#a8e6a1',
    path: '#a9cfff',
    branch: '#ffb347',
    stderr: '#ffa3a3',
    ada: '#8be9fd',
    system: '#d2bcd8',
    dialogue: '#ffc6f0',
    hint: '#e2d0e6',
  }),
  theme('aurora', true, '#0d1b1e', '#dff7ef', '#8affc1', '#24464c', {
    user: '#8affc1',
    path: '#9ad4ff',
    branch: '#ffe08a',
    stderr: '#ff9e9e',
    ada: '#7ee8fa',
    system: '#a9c9c1',
    dialogue: '#e7b6ff',
    hint: '#bfdcd4',
  }),
  theme('golden', true, '#231a0b', '#ffeec2', '#ffd166', '#4d3b18', {
    user: '#b8e986',
    path: '#a8d0ff',
    branch: '#ffd166',
    stderr: '#ffa08a',
    ada: '#8fe3e8',
    system: '#d6c49a',
    dialogue: '#f6b8d8',
    hint: '#e8d7ad',
  }),
];

export function terminalThemeById(id: string): TerminalTheme {
  return TERMINAL_THEMES.find((t) => t.id === id) ?? TERMINAL_THEMES[0];
}
