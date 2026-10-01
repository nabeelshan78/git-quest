/**
 * Git object serialisation and hashing — byte-identical to real git, so
 * commit ids match real git when author, committer and dates match.
 */
import type { BlobObject, CommitObject, FileMode, GitObject, Hash, RepoState, Signature, TagObject, TreeEntry, TreeObject } from '../../shared/types';
import { concatBytes, hexToBytes, sha1, utf8Encode, utf8Length } from './sha1';

export const EMPTY_TREE_HASH = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

/** "Name <email> 1767268800 +0000" */
export function formatSignature(sig: Signature): string {
  return `${sig.name} <${sig.email}> ${sig.timestamp} ${sig.timezone}`;
}

/** Git compares tree entry names as bytes, treating directories as if they end with "/". */
export function treeEntrySortKey(e: TreeEntry): string {
  return e.mode === '040000' ? `${e.name}/` : e.name;
}

function compareBytewise(a: string, b: string): number {
  const ab = utf8Encode(a);
  const bb = utf8Encode(b);
  const n = Math.min(ab.length, bb.length);
  for (let i = 0; i < n; i++) if (ab[i] !== bb[i]) return ab[i] - bb[i];
  return ab.length - bb.length;
}

export function sortTreeEntries(entries: TreeEntry[]): TreeEntry[] {
  return [...entries].sort((x, y) => compareBytewise(treeEntrySortKey(x), treeEntrySortKey(y)));
}

/** Compare repo paths the way git orders index entries (bytewise). */
export function comparePaths(a: string, b: string): number {
  return compareBytewise(a, b);
}

function treeModeBytes(mode: FileMode): string {
  return mode === '040000' ? '40000' : mode;
}

/** Raw object body (without the "<type> <size>\0" header). */
export function serializeBody(obj: GitObject): Uint8Array {
  switch (obj.type) {
    case 'blob':
      return utf8Encode(obj.content);
    case 'tree': {
      const parts: Uint8Array[] = [];
      for (const e of sortTreeEntries(obj.entries)) {
        parts.push(utf8Encode(`${treeModeBytes(e.mode)} ${e.name}\0`));
        parts.push(hexToBytes(e.hash));
      }
      return concatBytes(parts);
    }
    case 'commit': {
      let s = `tree ${obj.tree}\n`;
      for (const p of obj.parents) s += `parent ${p}\n`;
      s += `author ${formatSignature(obj.author)}\n`;
      s += `committer ${formatSignature(obj.committer)}\n`;
      s += `\n${obj.message}`;
      return utf8Encode(s);
    }
    case 'tag': {
      const s = `object ${obj.object}\ntype ${obj.objectType}\ntag ${obj.tag}\ntagger ${formatSignature(obj.tagger)}\n\n${obj.message}`;
      return utf8Encode(s);
    }
  }
}

export function hashObject(obj: GitObject): Hash {
  if (obj.type === 'blob') {
    // Fast path: avoid building the body twice for large blobs.
    const header = utf8Encode(`blob ${utf8Length(obj.content)}\0`);
    return sha1(concatBytes([header, utf8Encode(obj.content)]));
  }
  const body = serializeBody(obj);
  const header = utf8Encode(`${obj.type} ${body.length}\0`);
  return sha1(concatBytes([header, body]));
}

export function hashBlob(content: string): Hash {
  return hashObject({ type: 'blob', content });
}

/** Size in bytes as `git cat-file -s` reports it. */
export function objectSize(obj: GitObject): number {
  return obj.type === 'blob' ? utf8Length(obj.content) : serializeBody(obj).length;
}

// ---------------------------------------------------------------------------
// Typed readers
// ---------------------------------------------------------------------------

export function getObject(repo: RepoState, hash: Hash): GitObject | undefined {
  return repo.objects[hash];
}

export function getCommit(repo: RepoState, hash: Hash): CommitObject | undefined {
  const o = repo.objects[hash];
  return o && o.type === 'commit' ? o : undefined;
}

export function getTree(repo: RepoState, hash: Hash): TreeObject | undefined {
  const o = repo.objects[hash];
  return o && o.type === 'tree' ? o : undefined;
}

export function getBlob(repo: RepoState, hash: Hash): BlobObject | undefined {
  const o = repo.objects[hash];
  return o && o.type === 'blob' ? o : undefined;
}

export function getTag(repo: RepoState, hash: Hash): TagObject | undefined {
  const o = repo.objects[hash];
  return o && o.type === 'tag' ? o : undefined;
}

/** Follow annotated tags until a non-tag object. */
export function peel(repo: RepoState, hash: Hash): Hash {
  let h = hash;
  for (let i = 0; i < 20; i++) {
    const o = repo.objects[h];
    if (!o || o.type !== 'tag') return h;
    h = o.object;
  }
  return h;
}

/** First line of a commit/tag message. */
export function subjectOf(message: string): string {
  const firstPara = message.split(/\n\s*\n/)[0] ?? '';
  return firstPara.split('\n').map((l) => l.trim()).join(' ').trim();
}

export function shortHash(hash: Hash, length = 7): string {
  return hash.slice(0, length);
}

// ---------------------------------------------------------------------------
// Writers (for use inside immer `produce` on a RepoState draft)
// ---------------------------------------------------------------------------

/** Store an object and return its hash. Idempotent. */
export function writeObject(repo: RepoState, obj: GitObject): Hash {
  const h = hashObject(obj);
  if (!repo.objects[h]) repo.objects[h] = obj;
  return h;
}

export function writeBlob(repo: RepoState, content: string): Hash {
  return writeObject(repo, { type: 'blob', content });
}

export interface FlatTreeEntry {
  hash: Hash;
  mode: FileMode;
}

/** Build nested tree objects from a flat path map; returns the root tree hash. */
export function writeTreeFromFlat(repo: RepoState, flat: Record<string, FlatTreeEntry>): Hash {
  const build = (prefix: string, paths: string[]): Hash => {
    const files: TreeEntry[] = [];
    const dirs = new Map<string, string[]>();
    for (const p of paths) {
      const rel = p.slice(prefix.length);
      const slash = rel.indexOf('/');
      if (slash < 0) {
        const e = flat[p];
        files.push({ mode: e.mode, name: rel, hash: e.hash });
      } else {
        const d = rel.slice(0, slash);
        const list = dirs.get(d) ?? [];
        list.push(p);
        dirs.set(d, list);
      }
    }
    for (const [d, list] of dirs) {
      files.push({ mode: '040000', name: d, hash: build(`${prefix}${d}/`, list) });
    }
    return writeObject(repo, { type: 'tree', entries: sortTreeEntries(files) });
  };
  return build('', Object.keys(flat));
}

/** Flatten a tree into path -> { hash, mode } (files only). */
export function readTreeFlat(repo: RepoState, treeHash: Hash, prefix = ''): Record<string, FlatTreeEntry> {
  const out: Record<string, FlatTreeEntry> = {};
  const tree = getTree(repo, treeHash);
  if (!tree) return out;
  for (const e of tree.entries) {
    const p = `${prefix}${e.name}`;
    if (e.mode === '040000') Object.assign(out, readTreeFlat(repo, e.hash, `${p}/`));
    else out[p] = { hash: e.hash, mode: e.mode };
  }
  return out;
}

/** Files of a commit's snapshot: path -> content. */
export function readCommitFiles(repo: RepoState, commitHash: Hash): Record<string, string> {
  const c = getCommit(repo, commitHash);
  if (!c) return {};
  const flat = readTreeFlat(repo, c.tree);
  const out: Record<string, string> = {};
  for (const [p, e] of Object.entries(flat)) out[p] = getBlob(repo, e.hash)?.content ?? '';
  return out;
}

/** Copy an object and everything it references from one store to another (fetch/push/clone). */
export function copyObjectClosure(from: RepoState, to: RepoState, hash: Hash): number {
  let copied = 0;
  const stack = [hash];
  while (stack.length) {
    const h = stack.pop()!;
    if (to.objects[h]) continue;
    const o = from.objects[h];
    if (!o) continue;
    to.objects[h] = o;
    copied++;
    if (o.type === 'commit') stack.push(o.tree, ...o.parents);
    else if (o.type === 'tree') for (const e of o.entries) stack.push(e.hash);
    else if (o.type === 'tag') stack.push(o.object);
  }
  return copied;
}
