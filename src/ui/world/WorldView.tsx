/**
 * World view: the three boxes (working, staging, repository), the remote box,
 * commit graph, folder view and animated file chips.
 */
import { useMemo, useState } from 'react';
import type { GameSession, SessionSnapshot } from '../../shared/session';
import type { AbsPath, MachineId } from '../../shared/types';
import { TID } from '../../shared/testids';
import { STRINGS, fmt } from '../../strings';
import { Icon } from '../components/Icon';
import { CommitGraph } from '../graph/CommitGraph';
import { CommitSheet } from '../graph/CommitSheet';
import { describeGraph } from '../graph/describe';
import { graphFromRepo, reflogOnlyTips } from '../graph/model';
import type { GraphInput } from '../graph/model';
import {
  currentRepoRoot,
  deriveRepoView,
  displayPath,
  folderTree,
  folderViewRoot,
  panelVisibility,
  remoteCandidates,
} from './derive';
import type { RepoView, StagingEntry, WorkingFile } from './derive';

export interface WorldViewProps {
  session: GameSession;
  snapshot: SessionSnapshot;
}

export function WorldView({ session, snapshot }: WorldViewProps) {
  const machine = snapshot.world.activeMachine;
  const m = snapshot.world.machines[machine];
  const repoRoot = useMemo(
    () => currentRepoRoot(snapshot.world, machine, snapshot.level?.workdir),
    [snapshot.world, machine, snapshot.level],
  );
  const repoView = useMemo(
    () => (repoRoot ? deriveRepoView(snapshot.world, machine, repoRoot) : null),
    [snapshot.world, machine, repoRoot],
  );
  const vis = useMemo(
    () => panelVisibility(snapshot.level, snapshot.world, repoRoot != null),
    [snapshot.level, snapshot.world, repoRoot],
  );

  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);
  const [showLost, setShowLost] = useState(false);

  const graph = useMemo<GraphInput | null>(() => {
    if (!repoView) return null;
    const extra = showLost ? reflogOnlyTips(repoView.repo) : [];
    return graphFromRepo(repoView.repo, { includeHead: true, extraTips: extra });
  }, [repoView, showLost]);

  const graphDesc = useMemo(() => (graph ? describeGraph(graph) : ''), [graph]);

  const remotes = useMemo(
    () => (vis.remote && repoView ? remoteCandidates(snapshot.world, repoView.repo) : []),
    [vis.remote, snapshot.world, repoView],
  );

  // Chapter 0: folder view instead of boxes
  if (!vis.boxes) {
    return (
      <section className="gq-world" data-testid={TID.worldView} aria-label={STRINGS.world.title}>
        <FolderView machine={m} machineId={machine} />
      </section>
    );
  }

  return (
    <section className="gq-world" data-testid={TID.worldView} aria-label={STRINGS.world.title}>
      {/* Three boxes */}
      <div className="gq-world-boxes">
        {/* Working folder */}
        <div className="gq-box" data-testid={TID.boxWorking}>
          <div className="gq-box-title">
            <Icon name="folder" size={14} /> {STRINGS.world.working}
          </div>
          {repoView ? (
            repoView.working.length > 0 ? (
              <WorkingFileList files={repoView.working} />
            ) : (
              <p className="gq-box-empty">{STRINGS.world.emptyFolder}</p>
            )
          ) : (
            <p className="gq-box-empty">{STRINGS.world.noRepo}</p>
          )}
        </div>

        {/* Staging area */}
        <div className="gq-box" data-testid={TID.boxStaging}>
          <div className="gq-box-title">
            <Icon name="plus" size={14} /> {STRINGS.world.staging}
          </div>
          {repoView ? (
            repoView.staging.length > 0 ? (
              <StagingList entries={repoView.staging} />
            ) : (
              <p className="gq-box-empty">
                {STRINGS.world.stagingEmpty}
                <br />
                <span className="gq-small">{STRINGS.world.stagingEmptyHint}</span>
              </p>
            )
          ) : null}
          {repoView && repoView.unchangedInIndex > 0 && (
            <p className="gq-small gq-muted" style={{ marginTop: 4 }}>
              {repoView.unchangedInIndex === 1
                ? STRINGS.world.stagingUnchangedOne
                : fmt(STRINGS.world.stagingUnchanged, { count: repoView.unchangedInIndex })}
            </p>
          )}
        </div>

        {/* Repository */}
        <div className="gq-box" data-testid={TID.boxRepository}>
          <div className="gq-box-title">
            <Icon name="save" size={14} /> {STRINGS.world.repository}
          </div>
          {graph && graph.commits.length > 0 ? (
            <CommitGraph
              graph={graph}
              variant="full"
              label={fmt(STRINGS.graph.label, { where: STRINGS.sheet.laptop })}
              onSelect={setSelectedCommit}
              selectedId={selectedCommit}
              labelTestIds
              showHead
            />
          ) : (
            <p className="gq-box-empty">
              {repoRoot ? STRINGS.world.noCommitsHint : STRINGS.world.noRepo}
            </p>
          )}
        </div>
      </div>

      {/* Remote box */}
      {vis.remote && remotes.length > 0 && (
        <div className="gq-box" data-testid={TID.boxRemote} style={{ marginBottom: 12 }}>
          <div className="gq-box-title">
            <Icon name="cloud" size={14} /> {STRINGS.world.remote}
          </div>
          {remotes.map((r, i) => (
            <RemoteBox key={i} remote={r} world={snapshot.world} />
          ))}
        </div>
      )}

      {/* Graph description for screen readers */}
      <div className="gq-sr-only" data-testid={TID.graphDescription}>
        {graphDesc}
      </div>

      {/* Commit sheet */}
      {selectedCommit && repoView && (
        <CommitSheet
          repo={repoView.repo}
          commitId={selectedCommit}
          where={STRINGS.sheet.laptop}
          onClose={() => setSelectedCommit(null)}
          onSelect={setSelectedCommit}
        />
      )}
    </section>
  );
}

function WorkingFileList({ files }: { files: WorkingFile[] }) {
  return (
    <div>
      {files.map((f) => (
        <div
          key={f.path}
          className="gq-chip"
          data-testid={TID.workingFile(f.path)}
          data-badges={f.badges.join(' ')}
          data-exists={f.exists}
        >
          <Icon name={f.exists ? 'file' : 'close'} size={12} />
          {f.path}
          {f.badges.map((b) => (
            <span key={b} className={`gq-chip-badge gq-badge-${b}`}>
              {(STRINGS.world.badges as Record<string, string>)[b] ?? b}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function StagingList({ entries }: { entries: StagingEntry[] }) {
  return (
    <div>
      {entries.map((e) => (
        <div
          key={e.path}
          className="gq-chip"
          data-testid={TID.stagingFile(e.path)}
          data-kind={e.kind}
        >
          <Icon name={e.kind === 'deleted' ? 'close' : 'file'} size={12} />
          {e.path}
          <span className={`gq-chip-badge gq-badge-${e.kind === 'conflict' ? 'conflict' : 'staged'}`}>
            {(STRINGS.world.kinds as Record<string, string>)[e.kind] ?? e.kind}
          </span>
        </div>
      ))}
    </div>
  );
}

function FolderView({ machine, machineId }: { machine: any; machineId: MachineId }) {
  const root = folderViewRoot(machine);
  const nodes = useMemo(() => folderTree(machine, root, { showGitDir: false }), [machine, root]);
  return (
    <div data-testid={TID.folderView}>
      <p className="gq-small gq-muted" style={{ marginBottom: 4 }}>
        {fmt(STRINGS.world.youAreIn, { path: displayPath(machine, machine.cwd) })}
      </p>
      <div className="gq-folder-view">
        {nodes.map((n) => (
          <div
            key={n.path}
            className="gq-folder-item"
            style={{ paddingLeft: n.depth * 16 + 4 }}
            data-testid={TID.folderItem(n.path)}
            data-path={n.path}
            data-cwd={n.path === machine.cwd ? 'true' : undefined}
          >
            <Icon name={n.isDir ? 'folder' : 'file'} size={14} />
            <span>{n.name}</span>
            {n.path === machine.cwd && (
              <span className="gq-small gq-muted"> ({STRINGS.world.youAreHere})</span>
            )}
          </div>
        ))}
        {nodes.length === 0 && <p className="gq-box-empty">{STRINGS.world.emptyFolder}</p>}
      </div>
    </div>
  );
}

function RemoteBox({ remote, world }: { remote: any; world: any }) {
  const [selectedCommit, setSelectedCommit] = useState<string | null>(null);

  if (!remote.hosted) {
    return (
      <div className="gq-small">
        {remote.name && <p>{fmt(STRINGS.world.remoteName, { name: remote.name })}</p>}
        {remote.url && <p className="gq-muted">{fmt(STRINGS.world.remoteUrl, { url: remote.url })}</p>}
        <p className="gq-muted">{fmt(STRINGS.world.remoteMissing, { name: remote.name ?? '?', url: remote.url ?? '?' })}</p>
      </div>
    );
  }

  const graph = graphFromRepo(remote.hosted.repo, { includeHead: false, defaultBranch: remote.hosted.defaultBranch });
  const desc = describeGraph(graph);

  return (
    <div className="gq-small">
      {remote.name && <p>{fmt(STRINGS.world.remoteName, { name: remote.name })}</p>}
      <p className="gq-muted">{remote.hosted.id}</p>
      {graph.commits.length > 0 ? (
        <>
          <CommitGraph
            graph={graph}
            variant="mini"
            label={fmt(STRINGS.graph.remoteLabel, { where: remote.hosted.id })}
            onSelect={setSelectedCommit}
            selectedId={selectedCommit}
            testIdPrefix="remote-commit-node"
            showHead={false}
          />
          <div className="gq-sr-only" data-testid={TID.remoteGraphDescription}>{desc}</div>
        </>
      ) : (
        <p className="gq-muted">{STRINGS.world.remoteEmpty}</p>
      )}
      {selectedCommit && (
        <CommitSheet
          repo={remote.hosted.repo}
          commitId={selectedCommit}
          where={remote.hosted.id}
          onClose={() => setSelectedCommit(null)}
          onSelect={setSelectedCommit}
        />
      )}
    </div>
  );
}
