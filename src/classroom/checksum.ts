/**
 * Checksum of a progress file: FNV-1a (32-bit, hex) of the canonical JSON
 * of the file without its `checksum` field. Canonical JSON sorts object keys
 * recursively, so key order never changes the digest.
 *
 * This only discourages hand-editing of exported files. It is not security:
 * anyone who reads this code can compute a valid checksum.
 */
import type { ProgressFile } from '../shared/progress';

export type ChecksumStatus = 'ok' | 'mismatch' | 'missing';

/** JSON with object keys sorted recursively. `undefined` members are dropped like JSON.stringify does. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    const text = JSON.stringify(value);
    return text === undefined ? 'null' : text;
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined || typeof item === 'function' ? 'null' : canonicalJson(item))).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of Object.keys(record).sort()) {
    const member = record[key];
    if (member === undefined || typeof member === 'function') continue;
    parts.push(`${JSON.stringify(key)}:${canonicalJson(member)}`);
  }
  return `{${parts.join(',')}}`;
}

const encoder = new TextEncoder();

/** FNV-1a 32-bit hash of the UTF-8 bytes of `text`, as 8 lower-case hex digits. */
export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (const byte of encoder.encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Checksum of a progress file (its own `checksum` field is ignored). */
export function computeChecksum(file: ProgressFile): string {
  const { checksum: _ignored, ...rest } = file;
  return fnv1a32(canonicalJson(rest));
}

/** True when the file carries a checksum and it matches its content. */
export function verifyChecksum(file: ProgressFile): boolean {
  return typeof file.checksum === 'string' && file.checksum === computeChecksum(file);
}

/** 'ok', 'mismatch' (the file was changed after export) or 'missing'. */
export function checksumStatus(file: ProgressFile): ChecksumStatus {
  if (typeof file.checksum !== 'string' || file.checksum === '') return 'missing';
  return verifyChecksum(file) ? 'ok' : 'mismatch';
}

/** A copy of the file with a fresh checksum. */
export function withChecksum(file: ProgressFile): ProgressFile {
  const { checksum: _ignored, ...rest } = file;
  return { ...rest, checksum: computeChecksum(file) };
}
