/**
 * Simulated filesystem helpers. Readers take plain FsState; writers mutate
 * an FsState *draft* and must be called inside immer's `produce`.
 *
 * Invariant: every ancestor directory of every file is listed in `dirs`.
 */
import type { FsState } from '../../shared/types';
import { ancestors, dirname, isWithin, normalize } from './paths';

export function emptyFs(): FsState {
  return { files: {}, dirs: { '/': true } };
}

export function fileExists(fs: FsState, path: string): boolean {
  return Object.prototype.hasOwnProperty.call(fs.files, normalize(path));
}

export function dirExists(fs: FsState, path: string): boolean {
  return fs.dirs[normalize(path)] === true;
}

export function readFile(fs: FsState, path: string): string | undefined {
  return fs.files[normalize(path)];
}

/** Direct children names of a directory (files and dirs), sorted. */
export function listDir(fs: FsState, dir: string): { name: string; isDir: boolean }[] {
  const d = normalize(dir);
  const prefix = d === '/' ? '/' : `${d}/`;
  const seen = new Map<string, boolean>();
  for (const p of Object.keys(fs.dirs)) {
    if (p !== d && p.startsWith(prefix)) {
      const rest = p.slice(prefix.length);
      if (!rest.includes('/')) seen.set(rest, true);
    }
  }
  for (const p of Object.keys(fs.files)) {
    if (p.startsWith(prefix)) {
      const rest = p.slice(prefix.length);
      if (!rest.includes('/')) seen.set(rest, false);
    }
  }
  return [...seen.entries()].map(([name, isDir]) => ({ name, isDir })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

/** All files under a directory (absolute paths), sorted. */
export function filesUnder(fs: FsState, dir: string): string[] {
  const d = normalize(dir);
  return Object.keys(fs.files)
    .filter((p) => isWithin(d, p) && p !== d)
    .sort();
}

// ----------------------------- writers (drafts) -----------------------------

export function mkdirp(fs: FsState, path: string): void {
  const p = normalize(path);
  for (const a of ancestors(p)) fs.dirs[a] = true;
  fs.dirs[p] = true;
}

/** Write a file, creating parent directories. Returns true if it was created. */
export function writeFile(fs: FsState, path: string, content: string): boolean {
  const p = normalize(path);
  const created = !Object.prototype.hasOwnProperty.call(fs.files, p);
  mkdirp(fs, dirname(p));
  fs.files[p] = content;
  return created;
}

export function deleteFile(fs: FsState, path: string): boolean {
  const p = normalize(path);
  if (!Object.prototype.hasOwnProperty.call(fs.files, p)) return false;
  delete fs.files[p];
  return true;
}

/** Remove a directory and everything inside it. */
export function deleteTree(fs: FsState, dir: string): void {
  const d = normalize(dir);
  for (const p of Object.keys(fs.files)) if (isWithin(d, p)) delete fs.files[p];
  for (const p of Object.keys(fs.dirs)) if (isWithin(d, p) && p !== '/') delete fs.dirs[p];
}

/**
 * Remove empty directories from `dir` upwards, stopping at (and keeping) `stopAt`.
 * Git does this after deleting the last file of a folder during checkout.
 */
export function pruneEmptyDirs(fs: FsState, dir: string, stopAt: string): void {
  let d = normalize(dir);
  const stop = normalize(stopAt);
  while (d !== stop && isWithin(stop, d)) {
    const prefix = `${d}/`;
    const hasChild = Object.keys(fs.files).some((p) => p.startsWith(prefix)) || Object.keys(fs.dirs).some((p) => p.startsWith(prefix));
    if (hasChild) return;
    delete fs.dirs[d];
    d = dirname(d);
  }
}

export function moveFile(fs: FsState, from: string, to: string): void {
  const f = normalize(from);
  const content = fs.files[f];
  if (content === undefined) return;
  delete fs.files[f];
  writeFile(fs, to, content);
}
