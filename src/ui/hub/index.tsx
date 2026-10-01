/**
 * Simulated GitHub website panel.
 * @stub-owner hub — the Mock GitHub workstream replaces this component,
 * keeping the export name and props.
 */
import type { GameSession, SessionSnapshot } from '../../shared/session';
import { TID } from '../../shared/testids';

export interface HubPanelProps {
  session: GameSession;
  snapshot: SessionSnapshot;
  /** Initial page, e.g. "lantern-labs/festival-site/pulls" (from level.ui.hubPage). */
  initialPage?: string;
}

export function HubPanel(_props: HubPanelProps) {
  return <section data-testid={TID.hubPanel} aria-label="GitHub (simulated)" />;
}
