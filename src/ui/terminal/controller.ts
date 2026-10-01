/**
 * Draws the transcript and the editable input line into a terminal.
 *
 * The transcript is written incrementally (new entries are appended; any
 * other change re-renders everything). Below it sits the "live area": the
 * prompt with the line being typed, Ada's demo typing, or git's "waiting for
 * your editor" hint. The live area is redrawn from string lengths and the
 * terminal width, so it works with xterm's asynchronous writes.
 */
import type { TerminalEntry } from '../../shared/session';
import type { LineState } from './lineEditor';
import type { TerminalRoles } from './themes';
import { RESET, colorPrompt, crlf, fg, formatEntry, visibleLength } from './transcript';
import type { TranscriptLabels } from './transcript';

export interface TermLike {
  readonly cols: number;
  write(data: string): void;
  /** Clear the screen and scrollback and reset modes. */
  reset(): void;
}

export type LiveMode =
  | { kind: 'input'; prompt: string; line: LineState }
  | { kind: 'typing'; prompt: string; text: string }
  | { kind: 'waiting'; text: string }
  | { kind: 'none' };

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

export class TerminalController {
  private renderedIds: number[] = [];
  private entries: TerminalEntry[] = [];
  private extras: { afterId: number | null; text: string }[] = [];
  private live: LiveMode = { kind: 'none' };
  private liveDrawn = false;
  private rowsAboveCursor = 0;
  private roles: TerminalRoles;
  private labels: TranscriptLabels;

  constructor(
    private readonly term: TermLike,
    options: { roles: TerminalRoles; labels: TranscriptLabels },
  ) {
    this.roles = options.roles;
    this.labels = options.labels;
  }

  private cols(): number {
    return Math.max(10, this.term.cols || 80);
  }

  setStyle(roles: TerminalRoles, labels: TranscriptLabels): void {
    this.roles = roles;
    this.labels = labels;
    this.rerender();
  }

  /** Show exactly these entries (already filtered for the machine and Ctrl+L). */
  sync(entries: TerminalEntry[]): void {
    const prev = this.renderedIds;
    const isAppend =
      entries.length >= prev.length && (prev.length === 0 || (entries[0].id === prev[0] && entries[prev.length - 1].id === prev[prev.length - 1]));
    this.entries = entries;
    if (!isAppend) {
      this.extras = this.extras.filter((x) => x.afterId === null || entries.some((e) => e.id === x.afterId));
      this.rerender();
      return;
    }
    const fresh = entries.slice(prev.length);
    if (!fresh.length) return;
    this.clearLive();
    let out = '';
    for (const e of fresh) out += `${formatEntry(e, this.roles, this.labels)}\r\n`;
    this.term.write(out);
    this.renderedIds = entries.map((e) => e.id);
    this.drawLive();
  }

  /** Print text that is not part of the transcript (completion lists, ^C) above the live area. */
  printExtra(text: string): void {
    this.clearLive();
    const afterId = this.renderedIds.length ? this.renderedIds[this.renderedIds.length - 1] : null;
    this.extras.push({ afterId, text });
    this.term.write(`${crlf(text)}\r\n`);
    this.drawLive();
  }

  /** Freeze the current live line into the scrollback (Ctrl+C, empty Enter). */
  commitLive(suffix = ''): void {
    if (this.live.kind !== 'input') return;
    const text = `${colorPrompt(this.live.prompt, this.roles)} ${this.live.line.buffer}${suffix}`;
    this.clearLive();
    const afterId = this.renderedIds.length ? this.renderedIds[this.renderedIds.length - 1] : null;
    this.extras.push({ afterId, text });
    this.term.write(`${text}\r\n`);
    this.drawLive();
  }

  setLive(mode: LiveMode): void {
    this.clearLive();
    this.live = mode;
    this.drawLive();
  }

  /** Clear the visible screen (Ctrl+L / `clear`), keeping only the live line. */
  clearScreen(entries: TerminalEntry[]): void {
    this.extras = [];
    this.entries = entries;
    this.rerender();
  }

  rerender(): void {
    this.term.reset();
    this.liveDrawn = false;
    this.rowsAboveCursor = 0;
    let out = '';
    const extrasAt = (id: number | null) => {
      for (const x of this.extras) if (x.afterId === id) out += `${crlf(x.text)}\r\n`;
    };
    extrasAt(null);
    for (const e of this.entries) {
      out += `${formatEntry(e, this.roles, this.labels)}\r\n`;
      extrasAt(e.id);
    }
    if (out) this.term.write(out);
    this.renderedIds = this.entries.map((e) => e.id);
    this.drawLive();
  }

  private clearLive(): void {
    if (!this.liveDrawn) return;
    let s = '';
    if (this.rowsAboveCursor > 0) s += `\x1b[${this.rowsAboveCursor}A`;
    s += '\r\x1b[J';
    this.term.write(s);
    this.liveDrawn = false;
    this.rowsAboveCursor = 0;
  }

  /** Write `text` of visible length `len`, then move the cursor to visible offset `target`. */
  private writeLive(text: string, len: number, target: number, showCursor: boolean): void {
    const cols = this.cols();
    let s = (showCursor ? SHOW_CURSOR : HIDE_CURSOR) + text;
    // When the text ends exactly at the right edge, the cursor waits to wrap; force the wrap now.
    if (len > 0 && len % cols === 0) s += ' \b';
    const endRow = Math.floor(len / cols);
    const targetRow = Math.floor(target / cols);
    const targetCol = target % cols;
    if (endRow > targetRow) s += `\x1b[${endRow - targetRow}A`;
    s += `\x1b[${targetCol + 1}G`;
    this.term.write(s);
    this.rowsAboveCursor = targetRow;
    this.liveDrawn = true;
  }

  private drawLive(): void {
    const live = this.live;
    switch (live.kind) {
      case 'none':
        this.term.write(HIDE_CURSOR);
        return;
      case 'input': {
        const promptText = `${colorPrompt(live.prompt, this.roles)} `;
        const promptLen = visibleLength(live.prompt) + 1;
        const len = promptLen + live.line.buffer.length;
        this.writeLive(promptText + live.line.buffer, len, promptLen + live.line.cursor, true);
        return;
      }
      case 'typing': {
        const promptText = `${colorPrompt(live.prompt, this.roles)} `;
        const promptLen = visibleLength(live.prompt) + 1;
        const len = promptLen + live.text.length;
        this.writeLive(promptText + live.text, len, len, true);
        return;
      }
      case 'waiting': {
        const len = live.text.length;
        this.writeLive(`${fg(this.roles.hint)}${live.text}${RESET}`, len, len, false);
        return;
      }
    }
  }
}
