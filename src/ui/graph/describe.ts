/**
 * Plain-text description of a commit graph for screen readers (pure).
 * Example: "4 commits. HEAD is on main at 'Add menu' (a1b2c3d). Branch
 * feature points to 'Draft map' (b2c3d4e)."
 */
import type { GraphInput } from './model';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

const MAX_LABELS = 12;

export function describeGraph(g: GraphInput, t: Translate): string {
  const byId = new Map(g.commits.map((c) => [c.id, c]));
  const ref = (id: string) => {
    const c = byId.get(id);
    if (!c) return t('graphDesc.commitRefPlain', { id: id.length > 12 ? id.slice(0, 7) : id });
    return c.subject ? t('graphDesc.commitRef', { subject: c.subject, id: c.short }) : t('graphDesc.commitRefPlain', { id: c.short });
  };
  const parts: string[] = [];
  if (g.commits.length === 0) {
    parts.push(g.head.kind === 'branch' ? t('graphDesc.emptyOnBranch', { branch: g.head.name }) : t('graphDesc.empty'));
    return parts.join(' ');
  }
  parts.push(t('graphDesc.count', { count: g.commits.length }));
  const merges = g.commits.filter((c) => c.parents.length > 1).length;
  if (merges) parts.push(t('graphDesc.merges', { count: merges }));

  if (g.head.kind === 'branch') {
    const tip = g.branches[g.head.name];
    parts.push(tip ? t('graphDesc.headOnBranch', { branch: g.head.name, commit: ref(tip) }) : t('graphDesc.headOnUnborn', { branch: g.head.name }));
  } else if (g.head.kind === 'detached') {
    parts.push(t('graphDesc.headDetached', { commit: ref(g.head.id) }));
  }

  const lines: string[] = [];
  const current = g.head.kind === 'branch' ? g.head.name : null;
  for (const name of Object.keys(g.branches).sort()) {
    if (name === current) continue;
    lines.push(t('graphDesc.branch', { name, commit: ref(g.branches[name]) }));
  }
  for (const name of Object.keys(g.remoteBranches).sort()) lines.push(t('graphDesc.remote', { name, commit: ref(g.remoteBranches[name]) }));
  for (const name of Object.keys(g.tags).sort()) lines.push(t('graphDesc.tag', { name, commit: ref(g.tags[name]) }));
  parts.push(...lines.slice(0, MAX_LABELS));
  if (lines.length > MAX_LABELS) parts.push(t('graphDesc.more', { count: lines.length - MAX_LABELS }));
  if (g.truncated) parts.push(t('graphDesc.truncated', { count: g.commits.length }));
  return parts.join(' ');
}
