/**
 * Port of git's wildmatch.c, used for .gitignore patterns and pathspecs.
 *
 * Flags: `pathname` (WM_PATHNAME: "*" and "?" do not match "/", "**" rules
 * apply) and `casefold`.
 */

const WM_MATCH = 0;
const WM_NOMATCH = 1;
const WM_ABORT_ALL = -1;
const WM_ABORT_TO_STARSTAR = -2;

export interface WildFlags {
  pathname?: boolean;
  casefold?: boolean;
}

function isGlobSpecial(c: string): boolean {
  return c === '*' || c === '?' || c === '[' || c === '\\';
}

function lower(c: string, fold: boolean): string {
  return fold && c >= 'A' && c <= 'Z' ? c.toLowerCase() : c;
}

function classMatches(name: string, c: string): boolean | null {
  const code = c.charCodeAt(0);
  switch (name) {
    case 'alnum':
      return /[A-Za-z0-9]/.test(c);
    case 'alpha':
      return /[A-Za-z]/.test(c);
    case 'blank':
      return c === ' ' || c === '\t';
    case 'cntrl':
      return code < 32 || code === 127;
    case 'digit':
      return /[0-9]/.test(c);
    case 'graph':
      return code > 32 && code < 127;
    case 'lower':
      return /[a-z]/.test(c);
    case 'print':
      return code >= 32 && code < 127;
    case 'punct':
      return code > 32 && code < 127 && !/[A-Za-z0-9]/.test(c);
    case 'space':
      return c === ' ' || (code >= 9 && code <= 13);
    case 'upper':
      return /[A-Z]/.test(c);
    case 'xdigit':
      return /[0-9A-Fa-f]/.test(c);
    default:
      return null;
  }
}

function dowild(pat: string, pi0: number, text: string, ti0: number, flags: WildFlags): number {
  const fold = !!flags.casefold;
  const pathname = !!flags.pathname;
  let p = pi0;
  let t = ti0;
  const P = (i: number) => (i < pat.length ? pat[i] : '');
  const T = (i: number) => (i < text.length ? text[i] : '');
  for (; P(p) !== ''; t++, p++) {
    let pCh = P(p);
    let tCh = T(t);
    if (tCh === '' && pCh !== '*') return WM_ABORT_ALL;
    tCh = lower(tCh, fold);
    pCh = lower(pCh, fold);
    switch (pCh) {
      case '\\':
        p++;
        pCh = lower(P(p), fold);
        if (tCh !== pCh) return WM_NOMATCH;
        continue;
      case '?':
        if (pathname && tCh === '/') return WM_NOMATCH;
        continue;
      case '*': {
        let matchSlash: boolean;
        if (P(++p) === '*') {
          const prevP = p - 2;
          while (P(++p) === '*') {
            /* skip */
          }
          if ((prevP < 0 || P(prevP) === '/') && (P(p) === '' || P(p) === '/' || (P(p) === '\\' && P(p + 1) === '/'))) {
            if (P(p) === '/' && dowild(pat, p + 1, text, t, flags) === WM_MATCH) return WM_MATCH;
            matchSlash = true;
          } else matchSlash = false;
        } else matchSlash = !pathname;
        if (P(p) === '') {
          if (!matchSlash && text.indexOf('/', t) >= 0) return WM_NOMATCH;
          return WM_MATCH;
        } else if (!matchSlash && P(p) === '/') {
          const slash = text.indexOf('/', t);
          if (slash < 0) return WM_NOMATCH;
          t = slash;
          break; // the slash is consumed by the for loop
        }
        for (;;) {
          if (tCh === '') break;
          if (!isGlobSpecial(P(p))) {
            const want = lower(P(p), fold);
            while ((tCh = T(t)) !== '' && (matchSlash || tCh !== '/')) {
              tCh = lower(tCh, fold);
              if (tCh === want) break;
              t++;
            }
            if (tCh !== want) return matchSlash ? WM_ABORT_ALL : WM_ABORT_TO_STARSTAR;
          }
          const matched = dowild(pat, p, text, t, flags);
          if (matched !== WM_NOMATCH) {
            if (!matchSlash || matched !== WM_ABORT_TO_STARSTAR) return matched;
          } else if (!matchSlash && tCh === '/') return WM_ABORT_TO_STARSTAR;
          tCh = lower(T(++t), fold);
        }
        return WM_ABORT_ALL;
      }
      case '[': {
        pCh = P(++p);
        if (pCh === '^') pCh = '!';
        const negated = pCh === '!';
        if (negated) pCh = P(++p);
        let prevCh = '';
        let matched = false;
        do {
          if (pCh === '') return WM_ABORT_ALL;
          if (pCh === '\\') {
            pCh = P(++p);
            if (pCh === '') return WM_ABORT_ALL;
            if (tCh === pCh) matched = true;
          } else if (pCh === '-' && prevCh !== '' && P(p + 1) !== '' && P(p + 1) !== ']') {
            pCh = P(++p);
            if (pCh === '\\') {
              pCh = P(++p);
              if (pCh === '') return WM_ABORT_ALL;
            }
            if (tCh <= pCh && tCh >= prevCh) matched = true;
            else if (fold && tCh >= 'a' && tCh <= 'z') {
              const up = tCh.toUpperCase();
              if (up <= pCh && up >= prevCh) matched = true;
            }
            pCh = '';
          } else if (pCh === '[' && P(p + 1) === ':') {
            p += 2;
            const s = p;
            while (P(p) !== '' && P(p) !== ']') p++;
            pCh = P(p);
            if (pCh === '') return WM_ABORT_ALL;
            const len = p - s - 1;
            if (len < 0 || P(p - 1) !== ':') {
              p = s - 2;
              pCh = '[';
              if (tCh === pCh) matched = true;
              prevCh = pCh;
              pCh = P(++p);
              if (pCh === ']') break;
              continue;
            }
            const name = pat.slice(s, s + len);
            const r = classMatches(name, tCh);
            if (r === null) return WM_ABORT_ALL;
            if (r) matched = true;
            pCh = '';
          } else if (tCh === pCh) matched = true;
          prevCh = pCh;
          pCh = P(++p);
        } while (pCh !== ']');
        if (matched === negated || (pathname && tCh === '/')) return WM_NOMATCH;
        continue;
      }
      default:
        if (tCh !== pCh) return WM_NOMATCH;
        continue;
    }
  }
  return t < text.length ? WM_NOMATCH : WM_MATCH;
}

/** True when `text` matches the glob `pattern` (git wildmatch semantics). */
export function wildmatch(pattern: string, text: string, flags: WildFlags = {}): boolean {
  return dowild(pattern, 0, text, 0, flags) === WM_MATCH;
}

/** True when the string contains a glob special character (git's has_glob_specials / simple_length). */
export function hasGlobChars(s: string): boolean {
  return /[*?[\\]/.test(s);
}

/** Length of the leading part without glob special characters (git's simple_length). */
export function simpleLength(s: string): number {
  for (let i = 0; i < s.length; i++) if (isGlobSpecial(s[i])) return i;
  return s.length;
}
