/**
 * Turning transcript entries into terminal text (pure).
 */
import type { TerminalEntry } from '../../shared/session';
import type { TerminalRoles } from './themes';

export const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const ITALIC = '\x1b[3m';

export function fg(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return '';
  return `\x1b[38;2;${parseInt(m[1], 16)};${parseInt(m[2], 16)};${parseInt(m[3], 16)}m`;
}

/** Characters on screen, ignoring escape sequences. */
export function visibleLength(s: string): number {
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\x1b' && s[i + 1] === '[') {
      i += 2;
      while (i < s.length && !(s.charCodeAt(i) >= 0x40 && s.charCodeAt(i) <= 0x7e)) i++;
      continue;
    }
    n++;
  }
  return n;
}

/** Line breaks for xterm (no automatic CR). */
export function crlf(text: string): string {
  return text.replace(/\r?\n/g, '\r\n');
}

/**
 * Colour a bash-like prompt "user@host:~/path (branch)$": user@host green,
 * path blue, branch yellow. Unknown shapes are returned unchanged.
 */
export function colorPrompt(prompt: string, roles: TerminalRoles): string {
  const m = /^([^@\s:]+@[^:\s]+)(:)(\S*?)(\s\([^)]*\))?(\s?[$#>])$/.exec(prompt);
  if (!m) return prompt;
  const [, userHost, colon, path, branch, dollar] = m;
  return `${BOLD}${fg(roles.user)}${userHost}${RESET}${colon}${BOLD}${fg(roles.path)}${path}${RESET}${branch ? `${fg(roles.branch)}${branch}${RESET}` : ''}${dollar}`;
}

export interface TranscriptLabels {
  /** Prefix for Ada's plain-English lines, e.g. "Ada:". */
  ada: string;
}

export function formatEntry(entry: TerminalEntry, roles: TerminalRoles, labels: TranscriptLabels): string {
  const text = crlf(entry.text);
  switch (entry.kind) {
    case 'input':
      return `${entry.prompt ? `${colorPrompt(entry.prompt, roles)} ` : ''}${text}`;
    case 'stdout':
      return text;
    case 'stderr':
      return `${fg(roles.stderr)}${text.replace(/\r\n/g, `${RESET}\r\n${fg(roles.stderr)}`)}${RESET}`;
    case 'ada':
      return `${BOLD}${fg(roles.ada)}${labels.ada}${RESET} ${ITALIC}${fg(roles.ada)}${text.replace(/\r\n/g, `${RESET}\r\n${ITALIC}${fg(roles.ada)}`)}${RESET}`;
    case 'system':
      return `${fg(roles.system)}${text.replace(/\r\n/g, `${RESET}\r\n${fg(roles.system)}`)}${RESET}`;
    case 'dialogue':
      return `${BOLD}${fg(roles.dialogue)}${entry.speaker ?? ''}:${RESET} ${fg(roles.dialogue)}${text.replace(/\r\n/g, `${RESET}\r\n${fg(roles.dialogue)}`)}${RESET}`;
  }
}

/** Entries shown on a machine's terminal (entries without a machine show everywhere). */
export function entriesForMachine(entries: TerminalEntry[], machine: string): TerminalEntry[] {
  return entries.filter((e) => !e.machine || e.machine === machine);
}
