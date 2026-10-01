/**
 * Typo suggestion for unknown shell commands using Levenshtein distance.
 */
import { SHELL_COMMAND_NAMES } from './shell';

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array<number>(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[m][n];
}

/**
 * Return suggestions for an unknown command, sorted by distance.
 * Includes both shell commands and "git" itself.
 */
export function suggestCommand(name: string): string[] {
  const all = [...SHELL_COMMAND_NAMES, 'git'];
  const maxDist = Math.max(2, Math.floor(name.length / 3));
  const scored = all
    .map((c) => ({ c, d: levenshtein(name, c) }))
    .filter((x) => x.d <= maxDist && x.d > 0)
    .sort((a, b) => a.d - b.d || a.c.localeCompare(b.c));
  if (scored.length === 0) return [];
  const best = scored[0].d;
  return scored.filter((x) => x.d === best).map((x) => x.c);
}
