/**
 * Repo bundles: the no-backend way for two students to collide.
 *
 * A student exports their repository as one JSON file and hands it to a
 * classmate over any channel. The classmate imports it, which lands the other
 * person's commits on a `classmate/<handle>` branch. Merging that branch
 * produces a real divergence the importer did not write and could not predict
 * — the one thing a single-player simulator cannot stage.
 *
 * Deliberately asynchronous and one-way: nobody is ever blocked waiting for a
 * partner, and an absent partner costs nothing.
 */
import { z } from 'zod';
import { produce } from 'immer';
import { copyObjectClosure } from '../engine/core/objects';
import { findRepo } from '../engine/core/repo';
import type { GitObject, Hash, MachineId, World } from '../shared/types';
import { canonicalJson, fnv1a32 } from './checksum';

export const BUNDLE_FORMAT = 'git-quest-bundle';
export const BUNDLE_VERSION = 1;
export const BUNDLE_FILE_EXTENSION = '.gitbundle.json';
/** Plenty for a teaching repo; refuses anything that looks like a different file. */
export const MAX_BUNDLE_BYTES = 2 * 1024 * 1024;

const SignatureSchema = z.strictObject({
  name: z.string(),
  email: z.string(),
  timestamp: z.number(),
  timezone: z.string(),
});

const TreeEntrySchema = z.strictObject({
  mode: z.enum(['100644', '100755', '040000', '120000', '160000']),
  name: z.string(),
  hash: z.string(),
});

const GitObjectSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('blob'), content: z.string() }),
  z.strictObject({ type: z.literal('tree'), entries: z.array(TreeEntrySchema) }),
  z.strictObject({
    type: z.literal('commit'),
    tree: z.string(),
    parents: z.array(z.string()),
    author: SignatureSchema,
    committer: SignatureSchema,
    message: z.string(),
  }),
  z.strictObject({
    type: z.literal('tag'),
    object: z.string(),
    objectType: z.enum(['commit', 'tree', 'blob', 'tag']),
    tag: z.string(),
    tagger: SignatureSchema,
    message: z.string(),
  }),
]);

export const BundleFileSchema = z.strictObject({
  format: z.literal(BUNDLE_FORMAT),
  version: z.literal(BUNDLE_VERSION),
  createdAt: z.string(),
  /** Who made it, for the branch name and the UI. Display only. */
  author: z.strictObject({
    name: z.string(),
    handle: z.string().regex(/^[a-z0-9][a-z0-9-]{0,38}$/),
  }),
  /** Branch the author was on when they exported. */
  branch: z.string(),
  /** Commit that branch pointed at. */
  tip: z.string(),
  /** Every object reachable from `tip`. */
  objects: z.record(z.string(), GitObjectSchema),
  checksum: z.string().optional(),
});

export type BundleFile = z.infer<typeof BundleFileSchema>;

export type BundleParseError =
  | { kind: 'too-big' }
  | { kind: 'not-json' }
  | { kind: 'wrong-format' }
  | { kind: 'wrong-version'; found: unknown }
  | { kind: 'invalid'; detail: string }
  | { kind: 'checksum' }
  | { kind: 'missing-tip' };

export type BundleParseResult = { ok: true; bundle: BundleFile } | { ok: false; error: BundleParseError };

function bundleChecksum(file: BundleFile): string {
  const { checksum: _checksum, ...rest } = file;
  return fnv1a32(canonicalJson(rest));
}

export function withBundleChecksum(file: BundleFile): BundleFile {
  return { ...file, checksum: bundleChecksum({ ...file, checksum: undefined }) };
}

/**
 * Build a bundle from a local repository: the current branch tip plus every
 * object reachable from it.
 */
export function createBundle(
  world: World,
  machineId: MachineId,
  author: { name: string; handle: string },
  now: string,
): { ok: true; bundle: BundleFile } | { ok: false; reason: 'no-repo' | 'no-commits' } {
  const handle = findRepo(world, machineId);
  if (!handle) return { ok: false, reason: 'no-repo' };
  const { repo } = handle;

  const branch = repo.head.type === 'symbolic'
    ? repo.head.ref.replace(/^refs\/heads\//, '')
    : 'detached';
  const tip = repo.head.type === 'detached' ? repo.head.hash : repo.refs[repo.head.ref];
  if (!tip) return { ok: false, reason: 'no-commits' };

  // Walk the closure from the tip, collecting objects.
  const objects: Record<Hash, GitObject> = {};
  const queue: Hash[] = [tip];
  const seen = new Set<Hash>();
  while (queue.length > 0) {
    const hash = queue.pop()!;
    if (seen.has(hash)) continue;
    seen.add(hash);
    const obj = repo.objects[hash];
    if (!obj) continue;
    objects[hash] = obj;
    if (obj.type === 'commit') {
      queue.push(obj.tree, ...obj.parents);
    } else if (obj.type === 'tree') {
      for (const e of obj.entries) queue.push(e.hash);
    } else if (obj.type === 'tag') {
      queue.push(obj.object);
    }
  }

  return {
    ok: true,
    bundle: withBundleChecksum({
      format: BUNDLE_FORMAT,
      version: BUNDLE_VERSION,
      createdAt: now,
      author: { name: author.name, handle: author.handle },
      branch,
      tip,
      objects,
    }),
  };
}

export function serializeBundle(bundle: BundleFile): string {
  return `${JSON.stringify(withBundleChecksum(bundle), null, 2)}\n`;
}

export function parseBundle(text: string): BundleParseResult {
  if (text.length > MAX_BUNDLE_BYTES) return { ok: false, error: { kind: 'too-big' } };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: { kind: 'not-json' } };
  }
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: { kind: 'not-json' } };

  const rec = raw as Record<string, unknown>;
  if (rec.format !== BUNDLE_FORMAT) return { ok: false, error: { kind: 'wrong-format' } };
  if (rec.version !== BUNDLE_VERSION) return { ok: false, error: { kind: 'wrong-version', found: rec.version } };

  const parsed = BundleFileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: { kind: 'invalid', detail: parsed.error.issues[0]?.message ?? 'bad shape' } };
  }
  const bundle = parsed.data;

  if (bundle.checksum !== undefined && bundle.checksum !== bundleChecksum(bundle)) {
    return { ok: false, error: { kind: 'checksum' } };
  }
  if (!bundle.objects[bundle.tip]) return { ok: false, error: { kind: 'missing-tip' } };

  return { ok: true, bundle };
}

export function describeBundleError(error: BundleParseError): string {
  switch (error.kind) {
    case 'too-big': return 'That file is too large to be a repo bundle.';
    case 'not-json': return 'That file is not a repo bundle.';
    case 'wrong-format': return 'That is not a Git Quest repo bundle. A progress file will not work here.';
    case 'wrong-version': return 'That bundle was made by a different version of Git Quest.';
    case 'invalid': return `That bundle is damaged (${error.detail}).`;
    case 'checksum': return 'That bundle was edited by hand, so it cannot be trusted.';
    case 'missing-tip': return 'That bundle is incomplete: its newest commit is missing.';
    default: return 'That bundle could not be read.';
  }
}

/** Branch a bundle lands on when imported. */
export function bundleBranchName(bundle: BundleFile): string {
  return `classmate/${bundle.author.handle}`;
}

/**
 * Land a classmate's commits in the importer's repository on their own branch.
 * Nothing of the importer's own work is touched: no files change, HEAD does not
 * move. The importer then merges the branch themselves, which is the lesson.
 */
export function importBundle(
  world: World,
  machineId: MachineId,
  bundle: BundleFile,
): { ok: true; world: World; branch: string } | { ok: false; reason: 'no-repo' } {
  const handle = findRepo(world, machineId);
  if (!handle) return { ok: false, reason: 'no-repo' };
  const root = handle.root;
  const branch = bundleBranchName(bundle);

  const next = produce(world, (draft) => {
    const repo = draft.machines[machineId].repos[root];
    // Stage the incoming objects into a scratch store, then copy the closure in
    // so the importer's object store only gains what `tip` actually needs.
    const incoming = { ...repo, objects: { ...bundle.objects } };
    copyObjectClosure(incoming, repo, bundle.tip);
    repo.refs[`refs/heads/${branch}`] = bundle.tip;
  });

  return { ok: true, world: next, branch };
}

export function bundleFileName(author: { handle: string }, date: string): string {
  return `${author.handle}-${date}${BUNDLE_FILE_EXTENSION}`;
}
