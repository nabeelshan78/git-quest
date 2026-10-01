import { describe, expect, it } from 'vitest';
import { edgePath, firstParentChain, layoutGraph, topoOrder } from './layout';
import type { LayoutCommitInput } from './layout';

const c = (id: string, parents: string[], timestamp: number): LayoutCommitInput => ({ id, parents, timestamp });

function rowsAreTopological(commits: LayoutCommitInput[], order: string[]) {
  const pos = new Map(order.map((id, i) => [id, i]));
  for (const x of commits) for (const p of x.parents) if (pos.has(p)) expect(pos.get(x.id)!).toBeLessThan(pos.get(p)!);
}

describe('topoOrder', () => {
  it('puts newest first for a linear history', () => {
    expect(topoOrder([c('A', [], 1), c('B', ['A'], 2), c('C', ['B'], 3)])).toEqual(['C', 'B', 'A']);
  });

  it('always lists children before parents, even with odd timestamps', () => {
    const commits = [c('A', [], 5), c('B', ['A'], 1), c('C', ['B'], 9), c('D', ['A'], 2)];
    const order = topoOrder(commits);
    rowsAreTopological(commits, order);
    expect(order).toHaveLength(4);
  });

  it('breaks timestamp ties by input order (later input is newer)', () => {
    expect(topoOrder([c('A', [], 0), c('B', ['A'], 0), c('C', ['A'], 0)])).toEqual(['C', 'B', 'A']);
  });

  it('ignores parents outside the set and duplicate ids', () => {
    expect(topoOrder([c('B', ['X'], 2), c('B', ['X'], 2), c('C', ['B'], 3)])).toEqual(['C', 'B']);
  });
});

describe('firstParentChain', () => {
  it('follows first parents only', () => {
    const commits = [c('A', [], 1), c('F', ['A'], 2), c('B', ['A'], 3), c('M', ['B', 'F'], 4)];
    expect([...firstParentChain(commits, 'M')]).toEqual(['M', 'B', 'A']);
  });
  it('is empty for unknown tips', () => {
    expect(firstParentChain([c('A', [], 1)], 'nope').size).toBe(0);
    expect(firstParentChain([c('A', [], 1)], null).size).toBe(0);
  });
});

describe('layoutGraph', () => {
  it('lays a linear history out in one lane', () => {
    const l = layoutGraph([c('A', [], 1), c('B', ['A'], 2), c('C', ['B'], 3)], { primaryTip: 'C' });
    expect(l.laneCount).toBe(1);
    expect(l.commits.map((x) => [x.id, x.row, x.lane])).toEqual([
      ['C', 0, 0],
      ['B', 1, 0],
      ['A', 2, 0],
    ]);
    expect(l.edges.every((e) => e.viaLane === 0 && !e.merge)).toBe(true);
  });

  it('keeps the primary branch in lane 0 when another branch is newer', () => {
    // main: A-B-C ; feature: B-D (D newest)
    const commits = [c('A', [], 1), c('B', ['A'], 2), c('C', ['B'], 3), c('D', ['B'], 4)];
    const l = layoutGraph(commits, { primaryTip: 'C' });
    expect(l.index.C.lane).toBe(0);
    expect(l.index.B.lane).toBe(0);
    expect(l.index.A.lane).toBe(0);
    expect(l.index.D.lane).toBe(1);
    expect(l.laneCount).toBe(2);
    expect(l.index.D.row).toBe(0);
  });

  it('draws both parents of a merge commit', () => {
    const commits = [c('A', [], 1), c('F', ['A'], 2), c('B', ['A'], 3), c('M', ['B', 'F'], 4)];
    const l = layoutGraph(commits, { primaryTip: 'M' });
    const fromM = l.edges.filter((e) => e.from === 'M');
    expect(fromM.map((e) => [e.to, e.merge])).toEqual([
      ['B', false],
      ['F', true],
    ]);
    expect(l.index.F.lane).toBe(1);
    expect(l.index.M.lane).toBe(0);
    rowsAreTopological(commits, l.commits.map((x) => x.id));
  });

  it('routes a side branch in its own lane until it joins its parent', () => {
    // main: A-B-C-E ; feature: B-D
    const commits = [c('A', [], 1), c('B', ['A'], 2), c('C', ['B'], 3), c('D', ['B'], 4), c('E', ['C'], 5)];
    const l = layoutGraph(commits, { primaryTip: 'E' });
    const e = l.edges.find((x) => x.from === 'D')!;
    expect(e.to).toBe('B');
    expect(e.viaLane).toBe(1);
    expect(e.toLane).toBe(0);
    // No two commits share a cell.
    const cells = new Set(l.commits.map((x) => `${x.row}:${x.lane}`));
    expect(cells.size).toBe(l.commits.length);
  });

  it('works without a primary branch (detached history only)', () => {
    const l = layoutGraph([c('A', [], 1), c('B', ['A'], 2)]);
    expect(l.commits.map((x) => x.lane)).toEqual([0, 0]);
  });

  it('handles several roots and an empty graph', () => {
    expect(layoutGraph([]).laneCount).toBe(0);
    const l = layoutGraph([c('A', [], 1), c('Z', [], 2)], { primaryTip: 'A' });
    expect(l.index.A.lane).toBe(0);
    expect(l.index.Z.lane).toBe(1);
  });

  it('places commits that are newer than main (main behind a feature) beside lane 0', () => {
    // main at B; feature: B-C-D
    const commits = [c('A', [], 1), c('B', ['A'], 2), c('C', ['B'], 3), c('D', ['C'], 4)];
    const l = layoutGraph(commits, { primaryTip: 'B' });
    expect(l.index.D.lane).toBe(1);
    expect(l.index.C.lane).toBe(1);
    expect(l.index.B.lane).toBe(0);
    // After a fast-forward (main at D) everything is one straight line.
    const ff = layoutGraph(commits, { primaryTip: 'D' });
    expect(ff.laneCount).toBe(1);
  });
});

describe('edgePath', () => {
  const g = { laneWidth: 20, rowHeight: 30, padX: 10, padY: 10 };
  it('draws a straight line within one lane', () => {
    expect(edgePath({ from: 'B', to: 'A', fromRow: 0, fromLane: 0, toRow: 1, toLane: 0, viaLane: 0, merge: false }, g)).toBe('M 10 10 L 10 40');
  });
  it('bends into the via lane and back for long edges', () => {
    const d = edgePath({ from: 'D', to: 'B', fromRow: 0, fromLane: 1, toRow: 3, toLane: 0, viaLane: 1, merge: false }, g);
    expect(d.startsWith('M 30 10')).toBe(true);
    expect(d).toContain('L 30 70');
    expect(d.endsWith('10 100')).toBe(true);
  });
});
