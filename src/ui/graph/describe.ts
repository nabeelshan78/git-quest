/**
 * Plain-text description of a commit graph for screen readers (pure).
 * Example: "4 commits. You are on branch main, at "Add menu" (a1b2c3d).
 * Branch feature points to "Draft map" (b2c3d4e)."
 */
import { STRINGS, fmt } from '../../strings';
import type { GraphInput } from './model';

const MAX_LABELS = 12;
const S = STRINGS.graphDesc;

export function describeGraph(g: GraphInput): string {
  const byId = new Map(g.commits.map((c) => [c.id, c]));
  const ref = (id: string) => {
    const c = byId.get(id);
    if (!c) return fmt(S.commitRefPlain, { id: id.length > 12 ? id.slice(0, 7) : id });
    return c.subject ? fmt(S.commitRef, { subject: c.subject, id: c.short }) : fmt(S.commitRefPlain, { id: c.short });
  };
  const parts: string[] = [];
  if (g.commits.length === 0) {
    parts.push(g.head.kind === 'branch' ? fmt(S.emptyOnBranch, { branch: g.head.name }) : S.empty);
    return parts.join(' ');
  }
  parts.push(g.commits.length === 1 ? S.countOne : fmt(S.count, { count: g.commits.length }));
  const merges = g.commits.filter((c) => c.parents.length > 1).length;
  if (merges) parts.push(merges === 1 ? S.mergesOne : fmt(S.merges, { count: merges }));

  if (g.head.kind === 'branch') {
    const tip = g.branches[g.head.name];
    parts.push(tip ? fmt(S.headOnBranch, { branch: g.head.name, commit: ref(tip) }) : fmt(S.headOnUnborn, { branch: g.head.name }));
  } else if (g.head.kind === 'detached') {
    parts.push(fmt(S.headDetached, { commit: ref(g.head.id) }));
  }

  const lines: string[] = [];
  const current = g.head.kind === 'branch' ? g.head.name : null;
  for (const name of Object.keys(g.branches).sort()) {
    if (name === current) continue;
    lines.push(fmt(S.branch, { name, commit: ref(g.branches[name]) }));
  }
  for (const name of Object.keys(g.remoteBranches).sort()) lines.push(fmt(S.remote, { name, commit: ref(g.remoteBranches[name]) }));
  for (const name of Object.keys(g.tags).sort()) lines.push(fmt(S.tag, { name, commit: ref(g.tags[name]) }));
  parts.push(...lines.slice(0, MAX_LABELS));
  if (lines.length > MAX_LABELS) parts.push(fmt(S.more, { count: lines.length - MAX_LABELS }));
  if (g.truncated) parts.push(fmt(S.truncated, { count: g.commits.length }));
  return parts.join(' ');
}
