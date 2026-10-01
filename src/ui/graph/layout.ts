/**
 * Pure lane layout for commit graphs.
 *
 * Rows run top to bottom, newest first (like `git log --graph`). Children
 * always come before their parents. The first-parent chain of the primary
 * branch (usually main) stays straight in lane 0, so the picture is stable
 * while other branches come and go.
 *
 * Each edge records the lane it travels in (`viaLane`): it leaves the child,
 * bends into `viaLane` on the next row, runs straight down, and bends into
 * the parent on the parent's row.
 */

export interface LayoutCommitInput {
  id: string;
  parents: string[];
  /** Larger = newer. Ties are broken by input order (later input = newer). */
  timestamp: number;
}

export interface LaidOutCommit {
  id: string;
  row: number;
  lane: number;
}

export interface LaidOutEdge {
  from: string;
  to: string;
  fromRow: number;
  fromLane: number;
  toRow: number;
  toLane: number;
  viaLane: number;
  /** True for the second and later parents of a merge commit. */
  merge: boolean;
}

export interface GraphLayout {
  commits: LaidOutCommit[];
  edges: LaidOutEdge[];
  laneCount: number;
  rowCount: number;
  index: Record<string, LaidOutCommit>;
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Topological order, children before parents, newest first among ready commits. */
export function topoOrder(commits: LayoutCommitInput[]): string[] {
  const byId = new Map<string, LayoutCommitInput>();
  const inputIndex = new Map<string, number>();
  commits.forEach((c, i) => {
    if (!byId.has(c.id)) {
      byId.set(c.id, c);
      inputIndex.set(c.id, i);
    }
  });
  const pendingChildren = new Map<string, number>();
  for (const c of byId.values()) pendingChildren.set(c.id, 0);
  for (const c of byId.values()) {
    for (const p of unique(c.parents)) if (byId.has(p) && p !== c.id) pendingChildren.set(p, (pendingChildren.get(p) ?? 0) + 1);
  }
  const ready: string[] = [...byId.keys()].filter((id) => pendingChildren.get(id) === 0);
  const newer = (a: string, b: string) => {
    const ca = byId.get(a)!;
    const cb = byId.get(b)!;
    if (ca.timestamp !== cb.timestamp) return ca.timestamp > cb.timestamp;
    return inputIndex.get(a)! > inputIndex.get(b)!;
  };
  const out: string[] = [];
  const emitted = new Set<string>();
  while (ready.length) {
    let best = 0;
    for (let i = 1; i < ready.length; i++) if (newer(ready[i], ready[best])) best = i;
    const id = ready.splice(best, 1)[0];
    out.push(id);
    emitted.add(id);
    for (const p of unique(byId.get(id)!.parents)) {
      if (!byId.has(p) || p === id) continue;
      const n = (pendingChildren.get(p) ?? 0) - 1;
      pendingChildren.set(p, n);
      if (n === 0) ready.push(p);
    }
  }
  // Defensive: anything left (only possible with malformed cycles) goes last.
  for (const id of byId.keys()) if (!emitted.has(id)) out.push(id);
  return out;
}

/** The first-parent chain starting at `tip` (restricted to known commits). */
export function firstParentChain(commits: LayoutCommitInput[], tip: string | null | undefined): Set<string> {
  const byId = new Map(commits.map((c) => [c.id, c]));
  const chain = new Set<string>();
  let cur = tip ?? null;
  while (cur && byId.has(cur) && !chain.has(cur)) {
    chain.add(cur);
    cur = byId.get(cur)!.parents.find((p) => byId.has(p)) ?? null;
  }
  return chain;
}

function firstFree(lanes: (string | null)[], from: number): number {
  for (let i = from; i < lanes.length; i++) if (lanes[i] === null) return i;
  return Math.max(lanes.length, from);
}

export function layoutGraph(commits: LayoutCommitInput[], options: { primaryTip?: string | null } = {}): GraphLayout {
  const byId = new Map<string, LayoutCommitInput>();
  for (const c of commits) if (!byId.has(c.id)) byId.set(c.id, c);
  const order = topoOrder(commits);
  const primary = firstParentChain([...byId.values()], options.primaryTip);
  const reserveZero = primary.size > 0;
  const lanes: (string | null)[] = [];
  if (reserveZero) lanes[0] = options.primaryTip!;

  const placed: LaidOutCommit[] = [];
  const index: Record<string, LaidOutCommit> = {};
  const pendingEdges: { from: string; to: string; via: number; merge: boolean }[] = [];

  order.forEach((id, row) => {
    const c = byId.get(id)!;
    const expecting: number[] = [];
    lanes.forEach((v, i) => {
      if (v === id) expecting.push(i);
    });
    let lane: number;
    if (primary.has(id)) lane = 0;
    else if (expecting.length) lane = Math.min(...expecting);
    else lane = firstFree(lanes, reserveZero ? 1 : 0);
    for (const i of expecting) lanes[i] = null;
    lanes[lane] = null;
    const node = { id, row, lane };
    placed.push(node);
    index[id] = node;

    const parents = unique(c.parents).filter((p) => byId.has(p) && p !== id);
    parents.forEach((p, k) => {
      let via: number;
      if (k === 0) {
        if (lane === 0 && primary.has(id)) {
          via = 0;
          lanes[0] = p;
        } else {
          const existing = lanes.indexOf(p);
          if (existing >= 0) via = existing;
          else {
            via = lane;
            lanes[lane] = p;
          }
        }
      } else {
        const existing = lanes.indexOf(p);
        if (existing >= 0) via = existing;
        else {
          via = firstFree(lanes, reserveZero ? 1 : 0);
          lanes[via] = p;
        }
      }
      pendingEdges.push({ from: id, to: p, via, merge: k > 0 });
    });
    while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
  });

  const edges: LaidOutEdge[] = pendingEdges.map((e) => {
    const a = index[e.from];
    const b = index[e.to];
    return { from: e.from, to: e.to, fromRow: a.row, fromLane: a.lane, toRow: b.row, toLane: b.lane, viaLane: e.via, merge: e.merge };
  });
  const laneCount = Math.max(0, ...placed.map((p) => p.lane + 1), ...edges.map((e) => e.viaLane + 1));
  return { commits: placed, edges, laneCount, rowCount: placed.length, index };
}

export interface GraphGeometry {
  laneWidth: number;
  rowHeight: number;
  padX: number;
  padY: number;
}

export function laneX(lane: number, g: GraphGeometry): number {
  return g.padX + lane * g.laneWidth;
}

export function rowY(row: number, g: GraphGeometry): number {
  return g.padY + row * g.rowHeight;
}

function bend(x1: number, y1: number, x2: number, y2: number): string {
  if (x1 === x2) return `L ${x2} ${y2}`;
  const my = (y1 + y2) / 2;
  return `C ${x1} ${my} ${x2} ${my} ${x2} ${y2}`;
}

/** SVG path data for an edge. */
export function edgePath(e: LaidOutEdge, g: GraphGeometry): string {
  const x1 = laneX(e.fromLane, g);
  const y1 = rowY(e.fromRow, g);
  const x2 = laneX(e.toLane, g);
  const y2 = rowY(e.toRow, g);
  if (e.toRow <= e.fromRow + 1) return `M ${x1} ${y1} ${bend(x1, y1, x2, y2)}`;
  const xv = laneX(e.viaLane, g);
  const yTop = rowY(e.fromRow + 1, g);
  const yBottom = rowY(e.toRow - 1, g);
  let d = `M ${x1} ${y1} ${bend(x1, y1, xv, yTop)}`;
  if (yBottom > yTop) d += ` L ${xv} ${yBottom}`;
  d += ` ${bend(xv, yBottom, x2, y2)}`;
  return d;
}
