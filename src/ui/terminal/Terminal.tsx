/**
 * Terminal component: renders xterm.js and integrates with the controller
 * and line editor. Handles input, history, tab completion and screen reader output.
 */
import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { GameSession, SessionSnapshot } from '../../shared/session';
import { TID } from '../../shared/testids';
import { STRINGS } from '../../strings';
import { useSettings, resolveTheme, prefersDarkScheme } from '../state/settings';
import { announce } from '../state/announcer';
import { TerminalController } from './controller';
import { EMPTY_LINE, lineReducer, parseTerminalInput } from './lineEditor';
import type { LineState } from './lineEditor';
import { terminalThemeFor } from './themes';
import { entriesForMachine } from './transcript';

export interface TerminalProps {
  session: GameSession;
  snapshot: SessionSnapshot;
}

export function TerminalPanel({ session, snapshot }: TerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const ctrlRef = useRef<TerminalController | null>(null);
  const lineRef = useRef<LineState>(EMPTY_LINE);
  const settings = useSettings();
  const machine = snapshot.world.activeMachine;
  const theme = terminalThemeFor(resolveTheme(settings.theme, prefersDarkScheme()));

  // Screen reader buffer for the last few outputs
  const [srText, setSrText] = useState('');

  // Initialize xterm
  useEffect(() => {
    if (!containerRef.current) return;
    const xterm = new XTerminal({
      fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', Consolas, monospace",
      fontSize: 14,
      theme: theme.xterm,
      cursorBlink: true,
      cursorStyle: 'block',
      allowProposedApi: true,
      scrollback: 5000,
      convertEol: false,
    });
    const fit = new FitAddon();
    xterm.loadAddon(fit);
    xterm.open(containerRef.current);
    fit.fit();
    xtermRef.current = xterm;
    fitRef.current = fit;

    const ctrl = new TerminalController(xterm, {
      roles: theme.roles,
      labels: { ada: STRINGS.terminal.adaPrefix },
    });
    ctrlRef.current = ctrl;

    // Handle resize
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* fit may throw if detached */ } });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      ctrlRef.current = null;
      fitRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update theme
  useEffect(() => {
    const xterm = xtermRef.current;
    const ctrl = ctrlRef.current;
    if (xterm) xterm.options.theme = theme.xterm;
    if (ctrl) ctrl.setStyle(theme.roles, { ada: STRINGS.terminal.adaPrefix });
  }, [theme]);

  // Sync transcript entries
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    const entries = entriesForMachine(snapshot.transcript, machine);
    ctrl.sync(entries);

    // Screen reader: announce latest new entries
    if (entries.length > 0) {
      const last = entries[entries.length - 1];
      if (last.kind === 'stdout' || last.kind === 'stderr' || last.kind === 'ada') {
        setSrText(last.text);
        if (settings.screenReader) announce(last.text);
      }
    }
  }, [snapshot.transcript, machine, settings.screenReader]);

  // Update live area (prompt + input line)
  useEffect(() => {
    const ctrl = ctrlRef.current;
    if (!ctrl) return;
    const waiting = snapshot.editor != null;
    const prompt = snapshot.prompt;
    if (waiting) {
      ctrl.setLive({ kind: 'waiting', text: STRINGS.gitEditor.waiting });
    } else if (snapshot.phase === 'demo') {
      ctrl.setLive({ kind: 'none' });
    } else {
      ctrl.setLive({ kind: 'input', prompt, line: lineRef.current });
    }
  }, [snapshot.prompt, snapshot.editor, snapshot.phase]);

  // Handle xterm input
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;

    const disposable = xterm.onData((data: string) => {
      if (snapshot.editor || snapshot.pendingPredict) return;

      const keys = parseTerminalInput(data);
      for (const key of keys) {
        if (key.type === 'enter') {
          const line = lineRef.current.buffer;
          lineRef.current = EMPTY_LINE;
          const ctrl = ctrlRef.current;
          if (ctrl) ctrl.setLive({ kind: 'input', prompt: snapshot.prompt, line: EMPTY_LINE });
          session.run(line);
          return;
        }
        if (key.type === 'interrupt') {
          lineRef.current = EMPTY_LINE;
          const ctrl = ctrlRef.current;
          if (ctrl) ctrl.setLive({ kind: 'input', prompt: snapshot.prompt, line: EMPTY_LINE });
          return;
        }
        if (key.type === 'clearScreen') {
          xtermRef.current?.reset();
          const ctrl = ctrlRef.current;
          if (ctrl) {
            ctrl.sync([]);
            ctrl.setLive({ kind: 'input', prompt: snapshot.prompt, line: lineRef.current });
          }
          return;
        }
        if (key.type === 'tab') {
          const result = session.complete(lineRef.current.buffer);
          if (result.line !== lineRef.current.buffer) {
            lineRef.current = { ...lineRef.current, buffer: result.line, cursor: result.line.length };
          }
          const ctrl = ctrlRef.current;
          if (ctrl) ctrl.setLive({ kind: 'input', prompt: snapshot.prompt, line: lineRef.current });
          return;
        }
        if (key.type === 'up') {
          lineRef.current = lineReducer(lineRef.current, { type: 'historyUp', history: session.history() });
        } else if (key.type === 'down') {
          lineRef.current = lineReducer(lineRef.current, { type: 'historyDown', history: session.history() });
        } else if (key.type === 'edit') {
          lineRef.current = lineReducer(lineRef.current, key.action);
        }
      }
      const ctrl = ctrlRef.current;
      if (ctrl) ctrl.setLive({ kind: 'input', prompt: snapshot.prompt, line: lineRef.current });
    });

    return () => disposable.dispose();
  }, [session, snapshot.prompt, snapshot.editor, snapshot.pendingPredict]);

  return (
    <div className="gq-terminal-wrap" data-testid={TID.terminal}>
      {/* Machine tabs */}
      {Object.keys(snapshot.world.machines).length > 1 && (
        <div className="gq-terminal-tabs" role="tablist" aria-label={STRINGS.terminal.machinesLabel}>
          {Object.values(snapshot.world.machines).map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              className="gq-terminal-tab"
              aria-selected={m.id === machine}
              onClick={() => session.switchMachine(m.id)}
              data-testid={TID.machineTab(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
      <div
        className="gq-terminal-body"
        ref={containerRef}
        aria-label={STRINGS.terminal.label}
        role="application"
      />
      {/* Screen reader output */}
      {settings.screenReader && (
        <div className="gq-terminal-sr" role="log" aria-live="polite" aria-atomic="false">
          {srText}
        </div>
      )}
    </div>
  );
}
