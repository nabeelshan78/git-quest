/**
 * POSIX path helpers for simulated machines. All machine paths are absolute
 * and normalised ("/home/intern/festival"), never ending with "/" except "/".
 */

export function normalize(p: string): string {
  const abs = p.startsWith('/');
  const parts: string[] = [];
  for (const seg of p.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length && parts[parts.length - 1] !== '..') parts.pop();
      else if (!abs) parts.push('..');
      continue;
    }
    parts.push(seg);
  }
  const joined = parts.join('/');
  return abs ? `/${joined}` : joined || '.';
}

export function join(...parts: string[]): string {
  return normalize(parts.filter((p) => p !== '').join('/'));
}

export function dirname(p: string): string {
  const n = normalize(p);
  if (n === '/') return '/';
  const i = n.lastIndexOf('/');
  if (i < 0) return '.';
  if (i === 0) return '/';
  return n.slice(0, i);
}

export function basename(p: string): string {
  const n = normalize(p);
  if (n === '/') return '/';
  return n.slice(n.lastIndexOf('/') + 1);
}

/** Resolve a user-typed path against cwd and home ("~", "~/x", relative, absolute). */
export function resolvePath(cwd: string, home: string, p: string): string {
  if (p === '~') return normalize(home);
  if (p.startsWith('~/')) return normalize(`${home}/${p.slice(2)}`);
  if (p.startsWith('/')) return normalize(p);
  return normalize(`${cwd}/${p}`);
}

/** True when `child` is `parent` or inside it. */
export function isWithin(parent: string, child: string): boolean {
  if (parent === '/') return child.startsWith('/');
  return child === parent || child.startsWith(`${parent}/`);
}

/** Relative path from directory `from` to `to` (both absolute). */
export function relative(from: string, to: string): string {
  const a = normalize(from).split('/').filter(Boolean);
  const b = normalize(to).split('/').filter(Boolean);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const up = a.slice(i).map(() => '..');
  const rel = [...up, ...b.slice(i)].join('/');
  return rel === '' ? '.' : rel;
}

/** Display a path the way a shell prompt does: home becomes "~". */
export function tildify(p: string, home: string): string {
  if (p === home) return '~';
  if (p.startsWith(`${home}/`)) return `~${p.slice(home.length)}`;
  return p;
}

/** All ancestor directories of an absolute path, from "/" down to (but excluding) the path. */
export function ancestors(p: string): string[] {
  const n = normalize(p);
  const out = ['/'];
  const segs = n.split('/').filter(Boolean);
  for (let i = 1; i < segs.length; i++) out.push(`/${segs.slice(0, i).join('/')}`);
  return n === '/' ? [] : out;
}
