/**
 * Factories for worlds and machines.
 */
import type { HostedRepo, HubState, HubUser, Machine, World } from '../../shared/types';
import { CHARACTER_IDENTITIES, CHARACTER_LOGINS, DEFAULT_CLOCK, DEFAULT_HOME, DEFAULT_HOST, DEFAULT_USER, MAIN_MACHINE_ID } from '../../shared/constants';
import { emptyFs, mkdirp } from './fs';
import { normalize } from './paths';
import { createEmptyRepo } from './repo';

export interface MachineOptions {
  id?: string;
  label?: string;
  user?: string;
  host?: string;
  home?: string;
  cwd?: string;
  globalConfig?: Record<string, string>;
}

export function createMachine(options: MachineOptions = {}): Machine {
  const user = options.user ?? DEFAULT_USER;
  const home = normalize(options.home ?? (user === DEFAULT_USER ? DEFAULT_HOME : `/home/${user}`));
  const cwd = normalize(options.cwd ?? home);
  const fs = emptyFs();
  mkdirp(fs, home);
  mkdirp(fs, cwd);
  mkdirp(fs, '/tmp');
  return {
    id: options.id ?? MAIN_MACHINE_ID,
    label: options.label ?? 'Your laptop',
    user,
    host: options.host ?? DEFAULT_HOST,
    home,
    cwd,
    fs,
    globalConfig: { ...(options.globalConfig ?? {}) },
    repos: {},
    editor: null,
    history: [],
    ssh: { keys: [], knownHosts: [] },
    env: { HOME: home, USER: user, SHELL: '/bin/bash', PATH: '/usr/local/bin:/usr/bin:/bin' },
  };
}

export const CHARACTER_USERS: HubUser[] = [
  { login: CHARACTER_LOGINS.Ada, name: CHARACTER_IDENTITIES.Ada.name, color: '#0072B2' },
  { login: CHARACTER_LOGINS.Sam, name: CHARACTER_IDENTITIES.Sam.name, color: '#E69F00' },
  { login: CHARACTER_LOGINS.Priya, name: CHARACTER_IDENTITIES.Priya.name, color: '#009E73' },
  { login: CHARACTER_LOGINS.Leo, name: CHARACTER_IDENTITIES.Leo.name, color: '#CC79A7' },
  { login: 'lantern-labs', name: 'Lantern Labs', color: '#D55E00' },
  { login: 'festival-bot', name: 'Festival Bot', color: '#56B4E9', bot: true },
];

export function createHub(viewer: string = DEFAULT_USER, viewerName = 'Intern'): HubState {
  const users: Record<string, HubUser> = {};
  for (const u of CHARACTER_USERS) users[u.login] = u;
  users[viewer] = { login: viewer, name: viewerName, color: '#009E73' };
  return { viewer, users, sshKeys: [], tokens: [], requireAuth: false, notifications: [], nextId: 1 };
}

export interface WorldOptions {
  clock?: number;
  machines?: Machine[];
  hubViewer?: string;
  hubViewerName?: string;
}

export function createWorld(options: WorldOptions = {}): World {
  const machines = options.machines ?? [createMachine()];
  const record: Record<string, Machine> = {};
  for (const m of machines) record[m.id] = m;
  return {
    version: 1,
    clock: options.clock ?? DEFAULT_CLOCK,
    machines: record,
    activeMachine: machines[0].id,
    hosted: {},
    hub: createHub(options.hubViewer, options.hubViewerName),
  };
}

export interface HostedRepoOptions {
  id: string;
  description?: string;
  visibility?: 'public' | 'private';
  defaultBranch?: string;
  forkOf?: string | null;
  createdAt: number;
}

/** A new, empty hosted repository record (bare repo, no commits, default settings). */
export function createHostedRepoRecord(options: HostedRepoOptions): HostedRepo {
  const [owner, name] = options.id.split('/');
  const defaultBranch = options.defaultBranch ?? 'main';
  return {
    id: options.id,
    owner,
    name,
    description: options.description ?? '',
    visibility: options.visibility ?? 'public',
    repo: createEmptyRepo({ bare: true, initialBranch: defaultBranch }),
    defaultBranch,
    forkOf: options.forkOf ?? null,
    collaborators: [owner],
    protection: {},
    issues: [],
    pulls: [],
    releases: [],
    labels: [
      { name: 'bug', color: '#D55E00', description: 'Something is not working' },
      { name: 'enhancement', color: '#0072B2', description: 'New feature or request' },
      { name: 'good first issue', color: '#009E73', description: 'Good for newcomers' },
      { name: 'documentation', color: '#56B4E9', description: 'Improvements to docs' },
    ],
    workflows: [],
    runs: [],
    pages: null,
    settings: { allowMergeCommit: true, allowSquashMerge: true, allowRebaseMerge: true, deleteBranchOnMerge: false },
    nextNumber: 1,
    nextId: 1,
    stars: 0,
    createdAt: options.createdAt,
  };
}
