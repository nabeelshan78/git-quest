/**
 * Dev screen: mock session for UI development (only in dev builds).
 */
import { useEffect, useRef, useState } from 'react';
import type { GameSession, SessionSnapshot } from '../../shared/session';
import { TID } from '../../shared/testids';
import { STRINGS } from '../../strings';
import { TerminalPanel } from '../terminal/Terminal';
import { WorldView } from '../world/WorldView';
import { FileEditor, GitEditor } from '../editor/FileEditor';
import { navigate, routeHref } from '../router';
import { createMockSession, MOCK_PLAYER } from '../dev/mockSession';
import { MOCK_VARIANTS } from '../dev/mockWorld';
import type { MockVariant } from '../dev/mockWorld';

export function DevScreen({ variant: variantParam }: { variant: string | null }) {
  const variant = (variantParam && MOCK_VARIANTS.includes(variantParam as MockVariant)
    ? variantParam
    : null) as MockVariant | null;

  if (!variant) {
    return (
      <div style={{ maxWidth: 600, margin: '40px auto', padding: '24px 16px' }} data-testid={TID.devPage}>
        <h1>{STRINGS.dev.title}</h1>
        <p className="gq-muted">{STRINGS.dev.intro}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 16 }}>
          {MOCK_VARIANTS.map((v) => (
            <a key={v} href={routeHref({ name: 'dev', variant: v })} className="gq-btn">
              {(STRINGS.dev.variants as Record<string, string>)[v] ?? v}
            </a>
          ))}
        </div>
      </div>
    );
  }

  return <DevPlay variant={variant} />;
}

function DevPlay({ variant }: { variant: MockVariant }) {
  const sessionRef = useRef<GameSession | null>(null);
  const [snapshot, setSnapshot] = useState<SessionSnapshot | null>(null);

  useEffect(() => {
    let disposed = false;
    const session = createMockSession({
      variant,
      player: MOCK_PLAYER,
    });
    sessionRef.current = session;
    setSnapshot(session.getSnapshot());
    const unsub = session.subscribe((snap) => { if (!disposed) setSnapshot(snap); });
    return () => { disposed = true; unsub(); session.dispose(); };
  }, [variant]);

  if (!snapshot || !sessionRef.current) return <div style={{ padding: 24 }}>{STRINGS.common.loading}</div>;

  const session = sessionRef.current;

  return (
    <>
      <nav className="gq-topbar">
        <a href={routeHref({ name: 'dev', variant: null })} className="gq-topbar-brand">
          Dev: {(STRINGS.dev.variants as Record<string, string>)[variant] ?? variant}
        </a>
      </nav>
      {snapshot.editor && <GitEditor session={session} snapshot={snapshot} />}
      <div className="gq-play">
        <div className="gq-play-mission" style={{ padding: 12 }}>
          <h3>Goals</h3>
          {snapshot.goals.map((g, i) => (
            <div key={i} style={{ padding: 2 }}>
              {g.done ? '[x]' : '[ ]'} {g.text}
            </div>
          ))}
          <h3 style={{ marginTop: 12 }}>Phase: {snapshot.phase}</h3>
          <p className="gq-small gq-muted">Commands: {snapshot.commandsUsed} / par {snapshot.par}</p>
        </div>
        <div className="gq-play-world">
          <WorldView session={session} snapshot={snapshot} />
        </div>
        <div className="gq-play-files">
          <FileEditor session={session} snapshot={snapshot} />
        </div>
        <div className="gq-play-terminal">
          <TerminalPanel session={session} snapshot={snapshot} />
        </div>
      </div>
    </>
  );
}
