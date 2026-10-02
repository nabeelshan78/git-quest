/**
 * Sandbox screen: preset picker, then a free-play terminal with world view.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameSession, SessionSnapshot } from '../../shared/session';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { TerminalPanel } from '../terminal/Terminal';
import { WorldView } from '../world/WorldView';
import { FileEditor, GitEditor } from '../editor/FileEditor';
import { HubPanel } from '../hub/index';
import { navigate, routeHref } from '../router';
import type { SandboxPreset } from '../router';
import { useAppStatus } from '../state/appStatus';
import { useProgress } from '../state/progress';
import { createMockSession } from '../dev/mockSession';

export function SandboxScreen({ preset }: { preset: SandboxPreset | null }) {
  if (!preset) return <SandboxPicker />;
  return <SandboxPlay key={preset} preset={preset} />;
}

function SandboxPicker() {
  const presets = STRINGS.sandbox.presets as Record<string, { name: string; description: string }>;
  return (
    <div className="gq-sandbox-picker" data-testid={TID.sandboxPage}>
      <h1>{STRINGS.sandbox.title}</h1>
      <p className="gq-muted">{STRINGS.sandbox.intro}</p>
      <div className="gq-sandbox-presets" style={{ marginTop: 16 }}>
        {(['empty', 'festival', 'festival-with-remote'] as const).map((p) => (
          <button
            key={p}
            type="button"
            className="gq-sandbox-preset"
            onClick={() => navigate({ name: 'sandbox', preset: p })}
            data-testid={TID.sandboxPreset(p)}
          >
            <h3>{presets[p].name}</h3>
            <p>{presets[p].description}</p>
          </button>
        ))}
      </div>
      <div style={{ marginTop: 16 }}>
        <a href={routeHref({ name: 'home' })} className="gq-btn">
          <Icon name="home" size={14} /> {STRINGS.common.backHome}
        </a>
      </div>
    </div>
  );
}

function SandboxPlay({ preset }: { preset: SandboxPreset }) {
  const progress = useProgress();
  const appStatus = useAppStatus();
  const sessionRef = useRef<GameSession | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);
  const [viewTab, setViewTab] = useState<'world' | 'hub'>('world');

  useEffect(() => {
    let disposed = false;
    const variant = preset === 'empty' ? 'chapter0' : 'full';
    const session = createMockSession({
      variant: variant === 'chapter0' ? 'sandbox' : 'full',
      mode: 'sandbox',
      player: {
        ...progress.player,
        id: progress.player.id || 'player',
        createdAt: progress.player.createdAt || new Date().toISOString(),
      },
    });
    sessionRef.current = session;
    setSnapshot(session.getSnapshot());
    const unsub = session.subscribe((snap) => { if (!disposed) setSnapshot(snap); });
    appStatus.set({ phase: 'play', ready: true, level: null });
    return () => { disposed = true; unsub(); session.dispose(); appStatus.clear(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset]);

  if (!snapshot || !sessionRef.current) {
    return <div style={{ padding: 24 }}>{STRINGS.common.loading}</div>;
  }

  const session = sessionRef.current;

  return (
    <>
      {/* Top bar */}
      <nav className="gq-topbar" data-testid={TID.topBar}>
        <a href={routeHref({ name: 'home' })} className="gq-topbar-brand" data-testid={TID.homeButton}>
          <Logo size={20} />
        </a>
        <span className="gq-topbar-title">
          {fmt(STRINGS.topBar.sandboxLabel, { preset: (STRINGS.sandbox.presets as Record<string, { name: string }>)[preset]?.name ?? preset })}
        </span>
        <div className="gq-topbar-actions">
          <button type="button" className="gq-icon-btn" onClick={() => session.restart()} data-testid={TID.sandboxRestart} aria-label={STRINGS.mission.sandboxStartOver}>
            <Icon name="restart" />
          </button>
          <a href={routeHref({ name: 'sandbox', preset: null })} className="gq-icon-btn" aria-label={STRINGS.mission.sandboxChange}>
            <Icon name="sandbox" />
          </a>
          <a href={routeHref({ name: 'home' })} className="gq-icon-btn" aria-label={STRINGS.topBar.home} data-testid={TID.homeButton}>
            <Icon name="home" />
          </a>
        </div>
      </nav>

      {snapshot.editor && <GitEditor session={session} snapshot={snapshot} />}

      <div className="gq-play" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="gq-play-world" style={{ gridColumn: '1 / 2' }}>
          <div className="gq-tabs" role="tablist" aria-label={STRINGS.world.tabsLabel}>
            <button type="button" role="tab" className="gq-tab" aria-selected={viewTab === 'world'} onClick={() => setViewTab('world')} data-testid={TID.worldTab}>
              {STRINGS.world.tabWorld}
            </button>
            <button type="button" role="tab" className="gq-tab" aria-selected={viewTab === 'hub'} onClick={() => setViewTab('hub')} data-testid={TID.hubTab}>
              {STRINGS.world.tabHub}
            </button>
          </div>
          {viewTab === 'world' ? (
            <WorldView session={session} snapshot={snapshot} />
          ) : (
            <HubPanel session={session} snapshot={snapshot} />
          )}
        </div>
        <div className="gq-play-files" style={{ gridColumn: '2 / 3' }}>
          <FileEditor session={session} snapshot={snapshot} />
        </div>
        <div className="gq-play-terminal" style={{ gridColumn: '1 / -1' }}>
          <TerminalPanel session={session} snapshot={snapshot} />
        </div>
      </div>
    </>
  );
}
