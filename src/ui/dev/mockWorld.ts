/**
 * Dev/test tool: hand-built worlds for the mock session, made directly with
 * the engine core helpers (commits, branches, tags, a remote, a conflict,
 * a second laptop).
 */
import { produce } from 'immer';
import { copyObjectClosure, readTreeFlat, getCommit, writeBlob, writeObject, writeTreeFromFlat } from '../../engine/core/objects';
import type { FlatTreeEntry } from '../../engine/core/objects';
import { mkdirp, writeFile } from '../../engine/core/fs';
import { createEmptyRepo } from '../../engine/core/repo';
import { createHostedRepoRecord, createMachine, createWorld } from '../../engine/core/world';
import { CHARACTER_IDENTITIES, httpsUrl } from '../../shared/constants';
import type { Hash, Machine, RepoState, Signature, World } from '../../shared/types';

export type MockVariant = 'full' | 'chapter0' | 'conflict' | 'sandbox';

export const MOCK_REPO_ROOT = '/home/intern/festival';
export const MOCK_HOSTED_ID = 'lantern-labs/festival-site';

const BASE_TIME = 1767268800;

export function signature(name: string, email: string, timestamp: number): Signature {
  return { name, email, timestamp, timezone: '+0000' };
}

/** Write blobs, a tree and a commit for a full snapshot of files; returns the commit hash. */
export function writeSnapshotCommit(repo: RepoState, files: Record<string, string>, message: string, parents: Hash[], who: Signature): Hash {
  const flat: Record<string, FlatTreeEntry> = {};
  for (const [p, c] of Object.entries(files)) flat[p] = { hash: writeBlob(repo, c), mode: '100644' };
  const tree = writeTreeFromFlat(repo, flat);
  return writeObject(repo, { type: 'commit', tree, parents, author: who, committer: who, message: message.endsWith('\n') ? message : `${message}\n` });
}

/** Files of a commit (path -> content). */
export function filesOf(repo: RepoState, commit: Hash): Record<string, string> {
  const c = getCommit(repo, commit);
  if (!c) return {};
  const out: Record<string, string> = {};
  for (const [p, e] of Object.entries(readTreeFlat(repo, c.tree))) {
    const b = repo.objects[e.hash];
    out[p] = b && b.type === 'blob' ? b.content : '';
  }
  return out;
}

/** Point the index at a commit's snapshot. */
export function indexFromCommit(repo: RepoState, commit: Hash): void {
  const c = getCommit(repo, commit);
  repo.index = { entries: {}, conflicts: {} };
  if (!c) return;
  for (const [p, e] of Object.entries(readTreeFlat(repo, c.tree))) repo.index.entries[p] = { path: p, hash: e.hash, mode: e.mode };
}

function addRepo(machine: Machine, root: string, repo: RepoState): void {
  machine.repos[root] = repo;
  mkdirp(machine.fs, root);
  mkdirp(machine.fs, `${root}/.git`);
}

const HOME_HTML = '<h1>Riverside Lantern Festival</h1>\n<p>Welcome!</p>\n';
const MENU_HTML = '<h1>Menu</h1>\n<ul>\n  <li>Lantern cookies</li>\n</ul>\n';
const STYLE_CSS = 'body {\n  font-family: sans-serif;\n  color: #222;\n}\n';
const MAP_HTML = '<h1>Map</h1>\n<p>Stage by the river.</p>\n';

export function createMockWorld(variant: MockVariant, player: { name: string; email: string; handle: string }): World {
  const laptop = createMachine({
    globalConfig: variant === 'chapter0' ? {} : { 'user.name': player.name, 'user.email': player.email, 'init.defaultbranch': 'main' },
  });
  const world = createWorld({ machines: [laptop], hubViewer: player.handle, hubViewerName: player.name });

  return produce(world, (w) => {
    const m = w.machines.laptop;
    if (variant === 'chapter0') {
      for (const [p, c] of Object.entries({
        'festival/poster_final.txt': 'Lantern festival poster\n',
        'festival/poster_final_v2.txt': 'Lantern festival poster (v2)\n',
        'festival/poster_final_v2_REALLY_final.txt': 'Lantern festival poster (really final)\n',
        'festival/notes/todo.txt': 'Buy lanterns\n',
        'Desktop/readme.txt': 'Welcome to Lantern Labs\n',
      })) writeFile(m.fs, `${m.home}/${p}`, c);
      m.cwd = m.home;
      return;
    }

    const repo = createEmptyRepo();
    const me = (t: number) => signature(player.name, player.email, t);
    const ada = (t: number) => signature(CHARACTER_IDENTITIES.Ada.name, CHARACTER_IDENTITIES.Ada.email, t);
    const a = writeSnapshotCommit(repo, { 'index.html': HOME_HTML }, 'Add homepage', [], ada(BASE_TIME));
    const b = writeSnapshotCommit(repo, { 'index.html': HOME_HTML, 'menu.html': MENU_HTML }, 'Add menu page', [a], me(BASE_TIME + 60));
    const c = writeSnapshotCommit(repo, { 'index.html': HOME_HTML, 'menu.html': MENU_HTML, 'style.css': STYLE_CSS }, 'Style the menu', [b], me(BASE_TIME + 120));
    const d = writeSnapshotCommit(repo, { 'index.html': HOME_HTML, 'menu.html': MENU_HTML, 'map.html': MAP_HTML }, 'Draft map page', [b], me(BASE_TIME + 180));
    repo.refs['refs/heads/main'] = c;
    repo.refs['refs/heads/feature/map'] = d;
    repo.refs['refs/tags/v0.1'] = a;
    repo.refs['refs/remotes/origin/main'] = b;
    repo.config['remote.origin.url'] = httpsUrl(MOCK_HOSTED_ID);
    repo.config['remote.origin.fetch'] = '+refs/heads/*:refs/remotes/origin/*';
    repo.config['branch.main.remote'] = 'origin';
    repo.config['branch.main.merge'] = 'refs/heads/main';
    repo.head = { type: 'symbolic', ref: 'refs/heads/main' };
    indexFromCommit(repo, c);
    addRepo(m, MOCK_REPO_ROOT, repo);
    m.cwd = MOCK_REPO_ROOT;

    // Working folder: one modified file, one staged new file, one untracked file, an ignored file.
    const root = MOCK_REPO_ROOT;
    for (const [p, content] of Object.entries(filesOf(repo, c))) writeFile(m.fs, `${root}/${p}`, content);
    writeFile(m.fs, `${root}/index.html`, `${HOME_HTML}<p>Opening night: Friday</p>\n`);
    writeFile(m.fs, `${root}/poster.txt`, 'DRAFT poster\n');
    repo.index.entries['poster.txt'] = { path: 'poster.txt', hash: writeBlob(repo, 'DRAFT poster\n'), mode: '100644' };
    writeFile(m.fs, `${root}/notes.md`, '# Notes\n\n- Ask Sam about the map\n');
    writeFile(m.fs, `${root}/.gitignore`, 'secret.txt\n');
    writeFile(m.fs, `${root}/secret.txt`, 'password=lantern\n');
    repo.index.entries['.gitignore'] = { path: '.gitignore', hash: writeBlob(repo, 'secret.txt\n'), mode: '100644' };

    if (variant === 'conflict') {
      const theirs = writeBlob(repo, '<h1>About</h1>\n<p>Made by Sam.</p>\n');
      const ours = writeBlob(repo, '<h1>About</h1>\n<p>Made by the intern.</p>\n');
      const base = writeBlob(repo, '<h1>About</h1>\n');
      repo.index.conflicts['about.html'] = {
        path: 'about.html',
        base: { path: 'about.html', hash: base, mode: '100644' },
        ours: { path: 'about.html', hash: ours, mode: '100644' },
        theirs: { path: 'about.html', hash: theirs, mode: '100644' },
      };
      repo.special.MERGE_HEAD = [d];
      writeFile(m.fs, `${root}/about.html`, '<h1>About</h1>\n<<<<<<< HEAD\n<p>Made by the intern.</p>\n=======\n<p>Made by Sam.</p>\n>>>>>>> feature/map\n');
    }

    // The simulated GitHub: the team repo is one commit ahead (Sam pushed).
    const hosted = createHostedRepoRecord({ id: MOCK_HOSTED_ID, description: 'Website for the Riverside Lantern Festival', createdAt: BASE_TIME });
    copyObjectClosure(repo, hosted.repo, b);
    const sam = signature(CHARACTER_IDENTITIES.Sam.name, CHARACTER_IDENTITIES.Sam.email, BASE_TIME + 240);
    const e = writeSnapshotCommit(hosted.repo, { 'index.html': HOME_HTML.replace('Welcome!', 'Welcome, everyone!'), 'menu.html': MENU_HTML }, 'Fix welcome text', [b], sam);
    hosted.repo.refs['refs/heads/main'] = e;
    hosted.collaborators = ['lantern-labs', 'sam-codes', player.handle];
    hosted.issues.push({
      number: 1,
      title: 'Menu page is missing prices',
      body: 'Visitors keep asking how much the cookies cost.',
      author: 'priya-reviews',
      state: 'open',
      assignees: [],
      labels: ['bug'],
      comments: [],
      references: [],
      createdAt: BASE_TIME + 300,
    });
    hosted.nextNumber = 2;
    w.hosted[MOCK_HOSTED_ID] = hosted;

    if (variant === 'full' || variant === 'conflict') {
      const samLaptop = createMachine({ id: 'sam', label: "Sam's laptop", user: 'sam', host: 'sams-laptop', globalConfig: { 'user.name': CHARACTER_IDENTITIES.Sam.name, 'user.email': CHARACTER_IDENTITIES.Sam.email } });
      const clone = createEmptyRepo();
      copyObjectClosure(hosted.repo, clone, e);
      clone.refs['refs/heads/main'] = e;
      clone.refs['refs/remotes/origin/main'] = e;
      clone.config['remote.origin.url'] = httpsUrl(MOCK_HOSTED_ID);
      indexFromCommit(clone, e);
      const samRoot = '/home/sam/festival-site';
      addRepo(samLaptop, samRoot, clone);
      for (const [p, content] of Object.entries(filesOf(clone, e))) writeFile(samLaptop.fs, `${samRoot}/${p}`, content);
      samLaptop.cwd = samRoot;
      w.machines.sam = samLaptop;
    }
  });
}
