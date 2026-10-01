/**
 * The commit graph: custom SVG with a pure lane layout, sticky-note branch
 * labels, a "You are here" HEAD pin, tags, dashed remote-tracking labels and
 * merge commits. Colours come from the colour-blind-safe Okabe–Ito palette
 * and are always paired with text. New commits pop in; labels slide.
 */
import { motion } from 'motion/react';
import { useEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { BRANCH_COLORS } from '../../shared/constants';
import { textOn } from '../components/Avatar';
import { edgePath, laneX, layoutGraph, rowY } from './layout';
import type { GraphGeometry } from './layout';
import { branchColorIndex, commitOwners, headCommitId, labelsByCommit } from './model';
import type { GraphInput, GraphLabel } from './model';

export interface CommitGraphProps {
  graph: GraphInput;
  variant?: 'full' | 'mini';
  /** Accessible name of the graph group. */
  label: string;
  onSelect?: (id: string) => void;
  selectedId?: string | null;
  /** data-testid prefix for commit nodes: "<prefix>-<short id>". */
  testIdPrefix?: string;
  /** Show the HEAD pin (off for remote graphs). */
  showHead?: boolean;
}

const GEOMETRY: Record<'full' | 'mini', GraphGeometry & { r: number; font: number; charW: number; labelH: number; gap: number }> = {
  full: { laneWidth: 22, rowHeight: 36, padX: 18, padY: 20, r: 7, font: 12, charW: 7.3, labelH: 20, gap: 5 },
  mini: { laneWidth: 18, rowHeight: 28, padX: 14, padY: 16, r: 6, font: 11, charW: 6.7, labelH: 18, gap: 4 },
};

export function colorFor(index: number | undefined): string {
  return BRANCH_COLORS[(index ?? 0) % BRANCH_COLORS.length];
}

interface PlacedLabel {
  key: string;
  label: GraphLabel | { kind: 'head-pin' };
  x: number;
  y: number;
  width: number;
  text: string;
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function CommitGraph({ graph, variant = 'full', label, onSelect, selectedId, testIdPrefix = 'commit-node', showHead = true }: CommitGraphProps) {
  const { t } = useTranslation('world');
  const g = GEOMETRY[variant];
  const layout = useMemo(() => layoutGraph(graph.commits, { primaryTip: graph.primary ? graph.branches[graph.primary] : null }), [graph]);
  const owners = useMemo(() => commitOwners(graph), [graph]);
  const colors = useMemo(() => branchColorIndex(graph), [graph]);
  const labels = useMemo(() => labelsByCommit(graph), [graph]);
  const byId = useMemo(() => new Map(graph.commits.map((c) => [c.id, c])), [graph]);
  const headId = showHead ? headCommitId(graph) : null;

  // Commits seen in earlier renders; new ones pop in.
  const known = useRef<Set<string> | null>(null);
  const isNew = (id: string) => known.current !== null && !known.current.has(id);
  useEffect(() => {
    known.current = new Set(graph.commits.map((c) => c.id));
  }, [graph]);

  const labelsX = g.padX + Math.max(1, layout.laneCount) * g.laneWidth - g.laneWidth / 2 + g.r + 8;
  const placed: PlacedLabel[] = [];
  const rowEnd: Record<string, number> = {};
  for (const c of layout.commits) {
    let x = labelsX;
    const y = rowY(c.row, g);
    const list = labels[c.id] ?? [];
    for (const l of list) {
      if (l.kind === 'branch' && l.current && showHead) {
        const text = variant === 'mini' ? t('graph.headShort') : t('graph.youAreHere');
        const width = text.length * g.charW + 26;
        placed.push({ key: 'head-pin', label: { kind: 'head-pin' }, x, y, width, text });
        x += width + g.gap;
      }
      if (l.kind === 'head-detached') {
        if (!showHead) continue;
        const text = variant === 'mini' ? t('graph.headShort') : t('graph.youAreHereDetached');
        const width = text.length * g.charW + 26;
        placed.push({ key: 'head-pin', label: l, x, y, width, text });
        x += width + g.gap;
        continue;
      }
      const text = l.name;
      const width = text.length * g.charW + (l.kind === 'tag' ? 26 : 14);
      placed.push({ key: `${l.kind}:${l.name}`, label: l, x, y, width, text });
      x += width + g.gap;
    }
    rowEnd[c.id] = x;
  }

  const subjectMax = variant === 'mini' ? 0 : 34;
  const maxRowEnd = Math.max(labelsX, ...Object.values(rowEnd));
  const subjectWidth = subjectMax ? Math.max(...graph.commits.map((c) => `${c.short} ${truncate(c.subject, subjectMax)}`.length), 0) * (g.charW - 0.4) + 10 : 0;
  const width = Math.ceil(maxRowEnd + subjectWidth + g.padX);
  const height = Math.ceil(g.padY * 2 + Math.max(0, layout.rowCount - 1) * g.rowHeight);

  const nodeColor = (id: string) => colorFor(colors[owners[id] ?? ''] ?? (layout.index[id]?.lane ?? 0));
  const interactive = variant === 'full' && !!onSelect;
  const spring = { type: 'spring' as const, stiffness: 260, damping: 28 };

  return (
    <svg className={`gq-graph gq-graph-${variant}`} width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={label}>
      <g className="gq-graph-edges" aria-hidden="true">
        {layout.edges.map((e) => (
          <path
            key={`${e.from}-${e.to}`}
            d={edgePath(e, g)}
            fill="none"
            stroke={e.merge ? nodeColor(e.to) : nodeColor(e.from)}
            strokeWidth={variant === 'mini' ? 2 : 2.5}
            strokeDasharray={e.merge ? '5 3' : undefined}
            strokeLinecap="round"
          />
        ))}
      </g>
      <g className="gq-graph-nodes">
        {layout.commits.map((c) => {
          const commit = byId.get(c.id)!;
          const cx = laneX(c.lane, g);
          const cy = rowY(c.row, g);
          const merge = commit.parents.length > 1;
          const isHead = c.id === headId;
          const fill = nodeColor(c.id);
          const aria = t(merge ? 'graph.mergeCommitLabel' : 'graph.commitLabel', { id: commit.short, subject: commit.subject || commit.short });
          return (
            <motion.g
              key={c.id}
              className={`gq-commit${isHead ? ' gq-commit-head' : ''}${selectedId === c.id ? ' gq-commit-selected' : ''}`}
              initial={isNew(c.id) ? { x: cx, y: cy, scale: 0.2, opacity: 0 } : false}
              animate={{ x: cx, y: cy, scale: 1, opacity: 1 }}
              transition={spring}
              data-testid={`${testIdPrefix}-${commit.short}`}
              data-commit={c.id}
              data-head={isHead ? 'true' : undefined}
              {...(interactive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': aria,
                    onClick: () => onSelect!(c.id),
                    onKeyDown: (ev: KeyboardEvent) => {
                      if (ev.key === 'Enter' || ev.key === ' ') {
                        ev.preventDefault();
                        onSelect!(c.id);
                      }
                    },
                  }
                : { 'aria-label': aria, role: 'img' })}
            >
              <circle className="gq-commit-focus" r={g.r + 6} fill="none" />
              {isHead && <circle className="gq-commit-head-ring" r={g.r + 4} fill="none" strokeWidth="2" />}
              <circle r={g.r} fill={fill} className="gq-commit-dot" strokeWidth="2" />
              {merge && <circle r={g.r - 3.5} fill="none" stroke={textOn(fill)} strokeWidth="1.5" />}
              {variant === 'mini' && (
                <text className="gq-commit-mini-id" x={0} y={g.r + 11} textAnchor="middle" fontSize={9}>
                  {commit.short}
                </text>
              )}
            </motion.g>
          );
        })}
      </g>
      <g className="gq-graph-labels" aria-hidden="true">
        {placed.map((p) => (
          <motion.g key={p.key} initial={false} animate={{ x: p.x, y: p.y }} transition={spring} className={`gq-label gq-label-${p.label.kind}`}>
            <LabelShape p={p} geometry={g} color={labelColor(p, colors)} />
          </motion.g>
        ))}
      </g>
      {subjectMax > 0 && (
        <g className="gq-graph-subjects" aria-hidden="true">
          {layout.commits.map((c) => {
            const commit = byId.get(c.id)!;
            return (
              <motion.text key={c.id} initial={false} animate={{ x: rowEnd[c.id] + 2, y: rowY(c.row, g) + 4 }} transition={spring} fontSize={g.font} className="gq-commit-subject">
                <tspan className="gq-commit-short">{commit.short}</tspan> {truncate(commit.subject, subjectMax)}
              </motion.text>
            );
          })}
        </g>
      )}
    </svg>
  );
}

function labelColor(p: PlacedLabel, colors: Record<string, number>): string {
  if (p.label.kind === 'branch' || p.label.kind === 'remote') return colorFor(colors[p.label.name]);
  return 'var(--accent)';
}

function LabelShape({ p, geometry: g, color }: { p: PlacedLabel; geometry: (typeof GEOMETRY)['full']; color: string }) {
  const h = g.labelH;
  const y = -h / 2;
  switch (p.label.kind) {
    case 'head-pin':
    case 'head-detached':
      return (
        <>
          <rect x={0} y={y} width={p.width} height={h} rx={h / 2} className="gq-pin-bg" />
          <path transform={`translate(5 ${y + 2}) scale(0.68)`} d="M12 2a6 6 0 0 0-6 6c0 4.5 6 12 6 12s6-7.5 6-12a6 6 0 0 0-6-6zm0 8.5A2.5 2.5 0 1 1 12 5.5a2.5 2.5 0 0 1 0 5z" className="gq-pin-icon" />
          <text x={22} y={4} fontSize={g.font} className="gq-pin-text">
            {p.text}
          </text>
        </>
      );
    case 'branch':
      return (
        <>
          <rect x={0} y={y} width={p.width} height={h} rx={3} fill={color} className={`gq-sticky${p.label.current ? ' gq-sticky-current' : ''}`} transform="rotate(-1.5)" />
          <text x={7} y={4} fontSize={g.font} fill={textOn(color)} className="gq-label-text" fontWeight={p.label.current ? 700 : 600}>
            {p.text}
          </text>
        </>
      );
    case 'remote':
      return (
        <>
          <rect x={0} y={y} width={p.width} height={h} rx={3} fill="var(--panel)" stroke={color} strokeWidth="2" strokeDasharray="4 3" />
          <text x={7} y={4} fontSize={g.font} className="gq-label-text gq-label-remote-text">
            {p.text}
          </text>
        </>
      );
    case 'tag':
      return (
        <>
          <path d={`M 0 ${y + h / 2} L 8 ${y} H ${p.width} V ${y + h} H 8 Z`} className="gq-tag-bg" />
          <circle cx={8} cy={0} r={2} className="gq-tag-hole" />
          <text x={15} y={4} fontSize={g.font} className="gq-label-text gq-tag-text">
            {p.text}
          </text>
        </>
      );
  }
}
