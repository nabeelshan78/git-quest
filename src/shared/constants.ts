/**
 * FROZEN CONTRACT — shared constants.
 * Only the orchestrator may change this file.
 */

export const ZERO_HASH = '0000000000000000000000000000000000000000';

/** 2026-01-01T12:00:00Z — default start of the simulated clock. */
export const DEFAULT_CLOCK = 1767268800;

/** Seconds the simulated clock advances after every git command (see engine dispatch). */
export const CLOCK_STEP = 60;

export const DEFAULT_TIMEZONE = '+0000';

export const DEFAULT_BRANCH = 'main';

export const MAIN_MACHINE_ID = 'laptop';
export const DEFAULT_USER = 'intern';
export const DEFAULT_HOST = 'laptop';
export const DEFAULT_HOME = '/home/intern';

/** Host name used in simulated remote URLs. Remote URLs look exactly like real ones. */
export const HUB_HOST = 'github.com';
export const HUB_DISPLAY_NAME = 'GitHub (simulated)';

/** The team organisation in the story and its main repository. */
export const TEAM_ORG = 'lantern-labs';
export const TEAM_REPO = 'festival-site';

/** Hub logins of the story characters. */
export const CHARACTER_LOGINS = {
  Ada: 'ada-lantern',
  Sam: 'sam-codes',
  Priya: 'priya-reviews',
  Leo: 'leo-maps',
} as const;

/** Commit identities of the story characters (for --author and teammate commits). */
export const CHARACTER_IDENTITIES = {
  Ada: { name: 'Ada Okafor', email: 'ada@lanternlabs.example' },
  Sam: { name: 'Sam Lee', email: 'sam@lanternlabs.example' },
  Priya: { name: 'Priya Natarajan', email: 'priya@lanternlabs.example' },
  Leo: { name: 'Leo Martins', email: 'leo@openmaps.example' },
} as const;

export function httpsUrl(repoId: string): string {
  return `https://${HUB_HOST}/${repoId}.git`;
}

export function sshUrl(repoId: string): string {
  return `git@${HUB_HOST}:${repoId}.git`;
}

export function pagesUrl(owner: string, name: string): string {
  return `https://${owner}.github.io/${name}/`;
}

const HOST_RE = HUB_HOST.replace(/\./g, '\\.');
const HTTPS_RE = new RegExp(`^https?://(?:[^@/]+@)?${HOST_RE}/([^/\\s]+)/([^/\\s]+?)(?:\\.git)?/?$`);
const SCP_RE = new RegExp(`^git@${HOST_RE}:([^/\\s]+)/([^/\\s]+?)(?:\\.git)?$`);
const SSH_RE = new RegExp(`^ssh://git@${HOST_RE}/([^/\\s]+)/([^/\\s]+?)(?:\\.git)?/?$`);

/**
 * Parse a simulated remote URL into a hosted repo id ("owner/name").
 * Accepts https://github.com/owner/name(.git), git@github.com:owner/name(.git),
 * ssh://git@github.com/owner/name(.git). Returns null for anything else.
 */
export function parseHubUrl(url: string): { id: string; protocol: 'https' | 'ssh' } | null {
  const https = HTTPS_RE.exec(url);
  if (https) return { id: `${https[1]}/${https[2]}`, protocol: 'https' };
  const scp = SCP_RE.exec(url);
  if (scp) return { id: `${scp[1]}/${scp[2]}`, protocol: 'ssh' };
  const ssh = SSH_RE.exec(url);
  if (ssh) return { id: `${ssh[1]}/${ssh[2]}`, protocol: 'ssh' };
  return null;
}

/** Colour-blind-safe palette (Okabe–Ito) for branch lanes; always paired with text labels. */
export const BRANCH_COLORS = ['#0072B2', '#E69F00', '#009E73', '#CC79A7', '#56B4E9', '#D55E00', '#F0E442', '#000000'] as const;
