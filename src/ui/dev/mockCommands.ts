/**
 * Dev/test tool: a handful of simplified commands used by the mock session
 * while the real engine commands are not available (status, add, restore,
 * commit, switch, branch, log, push, fetch, ls, pwd, cd, cat, clear).
 * Output follows real git's wording closely enough for UI work.
 */
import { produce } from 'immer';
import { computeStatus } from '../../engine/a/status';
import { getCommit, hashBlob, readTreeFlat, shortHash, subjectOf, copyObjectClosure, writeBlob } from '../../engine/core/objects';
import { deleteFile, dirExists, fileExists, listDir, readFile, writeFile } from '../../engine/core/fs';
import { join, resolvePath, tildify } from '../../engine/core/paths';
import { currentBranch, findRepo, headCommit, listWorkTree } from '../../engine/core/repo';
import { tokenize } from '../../parser';
import type { GameEvent } from '../../shared/events';
import type { CommandResult, OutputLine } from '../../shared/result';
import { stderr, stdout } from '../../shared/result';
import type { EditorRequest, RepoState, World } from '../../shared/types';
import { hostedRepoForUrl } from '../../remote';
import { filesOf, indexFromCommit, signature, writeSnapshotCommit } from './mockWorld';

function res(state: World, output: OutputLine[], events: GameEvent[] = [], exitCode = 0): CommandResult {
  return { state, output, events, exitCode };
}

export function promptFor(world: World, machineId: string): string {
  const m = world.machines[machineId];
  const handle = findRepo(world, machineId);
  const branch = handle ? currentBranch(handle.repo) ?? (handle.repo.head.type === 'detached' ? shortHash(handle.repo.head.hash) : null) : null;
  return `${m.user}@${m.host}:${tildify(m.cwd, m.home)}${branch ? ` (${branch})` : ''}$`;
}

function statusText(world: World, machineId: string): string[] {
  const s = computeStatus(world, machineId);
  if (!s) return [];
  const lines: string[] = [s.branch ? `On branch ${s.branch}` : `HEAD detached at ${shortHash(s.detachedAt ?? '')}`];
  if (s.unborn) lines.push('', 'No commits yet');
  if (s.conflicted.length) {
    lines.push('', 'Unmerged paths:', '  (use "git add <file>..." to mark resolution)');
    for (const c of s.conflicted) lines.push(`\tboth modified:   ${c.path}`);
  }
  if (s.staged.length) {
    lines.push('', 'Changes to be committed:', '  (use "git restore --staged <file>..." to unstage)');
    for (const c of s.staged) lines.push(`\t${c.kind === 'added' ? 'new file' : c.kind}:   ${c.path}`);
  }
  if (s.unstaged.length) {
    lines.push('', 'Changes not staged for commit:', '  (use "git add <file>..." to update what will be committed)', '  (use "git restore <file>..." to discard changes in working directory)');
    for (const c of s.unstaged) lines.push(`\t${c.kind}:   ${c.path}`);
  }
  if (s.untracked.length) {
    lines.push('', 'Untracked files:', '  (use "git add <file>..." to include in what will be committed)');
    for (const p of s.untracked) lines.push(`\t${p}`);
  }
  if (!s.staged.length && !s.unstaged.length && !s.untracked.length && !s.conflicted.length) lines.push('nothing to commit, working tree clean');
  else if (!s.staged.length && !s.conflicted.length) lines.push('', 'no changes added to commit (use "git add" and/or "git commit -a")');
  return lines;
}

function makeCommit(world: World, machineId: string, message: string): CommandResult {
  const handle = findRepo(world, machineId)!;
  const status = computeStatus(world, machineId)!;
  if (!status.staged.length) return res(world, stdout(...statusText(world, machineId)), [], 1);
  const root = handle.root;
  let hash = '';
  const branch = currentBranch(handle.repo);
  const parent = headCommit(handle.repo);
  const state = produce(world, (w) => {
    const m = w.machines[machineId];
    const repo = m.repos[root];
    const files: Record<string, string> = {};
    for (const [p, e] of Object.entries(repo.index.entries)) {
      const b = repo.objects[e.hash];
      files[p] = b && b.type === 'blob' ? b.content : '';
    }
    const who = signature(m.globalConfig['user.name'] ?? m.user, m.globalConfig['user.email'] ?? `${m.user}@${m.host}`, w.clock);
    hash = writeSnapshotCommit(repo, files, message, parent ? [parent] : [], who);
    if (repo.head.type === 'symbolic') repo.refs[repo.head.ref] = hash;
    else repo.head = { type: 'detached', hash };
    w.clock += 60;
  });
  const loc = { kind: 'local' as const, machine: machineId, root };
  const events: GameEvent[] = [
    { type: 'commit.create', repo: loc, hash, parents: parent ? [parent] : [], message: `${message}\n`, kind: parent ? 'normal' : 'initial', branch },
    { type: 'ref.update', repo: loc, change: { ref: `refs/heads/${branch ?? 'HEAD'}`, from: parent, to: hash }, reason: 'commit' },
  ];
  const n = status.staged.length;
  return res(state, stdout(`[${branch ?? 'detached HEAD'} ${shortHash(hash)}] ${subjectOf(message)}`, ` ${n} file${n === 1 ? '' : 's'} changed`), events);
}

/** Resume a commit after the in-game editor closed. */
export function finishCommitFromEditor(world: World, machineId: string, text: string | null): CommandResult {
  const cleared = produce(world, (w) => void (w.machines[machineId].editor = null));
  const closeEvent: GameEvent = { type: 'editor.close', machine: machineId, saved: text !== null };
  if (text === null) return res(cleared, stderr('Aborting commit due to empty commit message.'), [closeEvent], 1);
  const message = text
    .split('\n')
    .filter((l) => !l.startsWith('#'))
    .join('\n')
    .trim();
  if (!message) return res(cleared, stderr('Aborting commit due to empty commit message.'), [closeEvent], 1);
  const r = makeCommit(cleared, machineId, message);
  return { ...r, events: [closeEvent, ...r.events] };
}

function checkoutBranch(world: World, machineId: string, root: string, branch: string, create: boolean): CommandResult {
  const repo = world.machines[machineId].repos[root];
  const ref = `refs/heads/${branch}`;
  if (!create && !repo.refs[ref]) return res(world, stderr(`fatal: invalid reference: ${branch}`), [], 128);
  if (create && repo.refs[ref]) return res(world, stderr(`fatal: a branch named '${branch}' already exists`), [], 128);
  const from = repo.head;
  const target = create ? headCommit(repo) : repo.refs[ref];
  const before = Object.keys(listWorkTree(world.machines[machineId], root));
  let written: string[] = [];
  let deleted: string[] = [];
  const state = produce(world, (w) => {
    const r = w.machines[machineId].repos[root];
    if (create && target) r.refs[ref] = target;
    r.head = { type: 'symbolic', ref };
    if (!create && target) {
      const files = filesOf(r, target);
      const tracked = Object.keys(r.index.entries);
      deleted = tracked.filter((p) => files[p] === undefined);
      for (const p of deleted) deleteFile(w.machines[machineId].fs, join(root, p));
      written = Object.keys(files).filter((p) => readFile(w.machines[machineId].fs, join(root, p)) !== files[p]);
      for (const p of written) writeFile(w.machines[machineId].fs, join(root, p), files[p]);
      indexFromCommit(r, target);
    }
  });
  const loc = { kind: 'local' as const, machine: machineId, root };
  const events: GameEvent[] = [{ type: 'head.move', repo: loc, from, to: { type: 'symbolic', ref } }];
  if (written.length || deleted.length) events.push({ type: 'worktree.update', repo: loc, written, deleted: deleted.filter((p) => before.includes(p)), reason: 'switch' });
  return res(state, stderr(create ? `Switched to a new branch '${branch}'` : `Switched to branch '${branch}'`), events);
}

function log(repo: RepoState, oneline: boolean): string[] {
  const lines: string[] = [];
  let cur = headCommit(repo);
  const decorate = (h: string) => {
    const out: string[] = [];
    if (repo.head.type === 'detached' && repo.head.hash === h) out.push('HEAD');
    for (const [k, v] of Object.entries(repo.refs).sort()) {
      if (v !== h) continue;
      if (k.startsWith('refs/heads/')) out.push(repo.head.type === 'symbolic' && repo.head.ref === k ? `HEAD -> ${k.slice(11)}` : k.slice(11));
      else if (k.startsWith('refs/remotes/')) out.push(k.slice(13));
      else if (k.startsWith('refs/tags/')) out.push(`tag: ${k.slice(10)}`);
    }
    out.sort((a, b) => (a.startsWith('HEAD') ? -1 : b.startsWith('HEAD') ? 1 : 0));
    return out.length ? ` (${out.join(', ')})` : '';
  };
  let guard = 0;
  while (cur && guard++ < 100) {
    const c = getCommit(repo, cur);
    if (!c) break;
    if (oneline) lines.push(`${shortHash(cur)}${decorate(cur)} ${subjectOf(c.message)}`);
    else lines.push(`commit ${cur}${decorate(cur)}`, `Author: ${c.author.name} <${c.author.email}>`, '', `    ${subjectOf(c.message)}`, '');
    cur = c.parents[0] ?? null;
  }
  return lines;
}

function isAncestor(repo: RepoState, ancestor: string, descendant: string): boolean {
  const stack = [descendant];
  const seen = new Set<string>();
  while (stack.length) {
    const h = stack.pop()!;
    if (h === ancestor) return true;
    if (seen.has(h)) continue;
    seen.add(h);
    const c = getCommit(repo, h);
    if (c) stack.push(...c.parents);
  }
  return false;
}

function push(world: World, machineId: string, root: string): CommandResult {
  const repo = world.machines[machineId].repos[root];
  const url = repo.config['remote.origin.url'];
  const hosted = url ? hostedRepoForUrl(world, url) : null;
  const branch = currentBranch(repo);
  const loc = { kind: 'local' as const, machine: machineId, root };
  if (!hosted || !branch) return res(world, stderr("fatal: 'origin' does not appear to be a git repository"), [], 128);
  const local = repo.refs[`refs/heads/${branch}`];
  const remote = hosted.repo.refs[`refs/heads/${branch}`];
  if (remote && remote !== local && !isAncestor(repo, remote, local)) {
    return res(
      world,
      stderr(
        `To ${url}`,
        ` ! [rejected]        ${branch} -> ${branch} (fetch first)`,
        `error: failed to push some refs to '${url}'`,
        'hint: Updates were rejected because the remote contains work that you do not',
        'hint: have locally. Integrate the remote changes (e.g. \'git pull ...\') before pushing again.',
      ),
      [{ type: 'transfer.rejected', repo: loc, remote: 'origin', hosted: hosted.id, ref: `refs/heads/${branch}`, reason: 'fetch-first' }],
      1,
    );
  }
  let objects = 0;
  const state = produce(world, (w) => {
    objects = copyObjectClosure(w.machines[machineId].repos[root], w.hosted[hosted.id].repo, local);
    w.hosted[hosted.id].repo.refs[`refs/heads/${branch}`] = local;
    w.machines[machineId].repos[root].refs[`refs/remotes/origin/${branch}`] = local;
  });
  return res(state, stderr(`To ${url}`, `   ${remote ? shortHash(remote) : '0000000'}..${shortHash(local)}  ${branch} -> ${branch}`), [
    { type: 'transfer.push', repo: loc, remote: 'origin', hosted: hosted.id, updates: [{ ref: `refs/heads/${branch}`, from: remote ?? null, to: local }], objects },
  ]);
}

function fetch(world: World, machineId: string, root: string): CommandResult {
  const repo = world.machines[machineId].repos[root];
  const url = repo.config['remote.origin.url'];
  const hosted = url ? hostedRepoForUrl(world, url) : null;
  if (!hosted) return res(world, stderr("fatal: 'origin' does not appear to be a git repository"), [], 128);
  const updates: { ref: string; from: string | null; to: string }[] = [];
  const state = produce(world, (w) => {
    const r = w.machines[machineId].repos[root];
    for (const [ref, hash] of Object.entries(hosted.repo.refs)) {
      if (!ref.startsWith('refs/heads/')) continue;
      const tracking = `refs/remotes/origin/${ref.slice(11)}`;
      if (r.refs[tracking] === hash) continue;
      copyObjectClosure(hosted.repo, r, hash);
      updates.push({ ref: tracking, from: r.refs[tracking] ?? null, to: hash });
      r.refs[tracking] = hash;
    }
  });
  const loc = { kind: 'local' as const, machine: machineId, root };
  const out = updates.length ? stderr(`From ${url}`, ...updates.map((u) => `   ${u.from ? shortHash(u.from) : '0000000'}..${shortHash(u.to)}  ${u.ref.slice(20)} -> ${u.ref.slice(13)}`)) : [];
  return res(state, out, updates.length ? [{ type: 'transfer.fetch', repo: loc, remote: 'origin', hosted: hosted.id, updates, objects: updates.length }] : []);
}

function git(world: World, machineId: string, args: string[]): CommandResult | null {
  const [cmd, ...rest] = args;
  const handle = findRepo(world, machineId);
  const needRepo = () => res(world, stderr('fatal: not a git repository (or any of the parent directories): .git'), [], 128);
  const loc = handle ? { kind: 'local' as const, machine: machineId, root: handle.root } : null;
  switch (cmd) {
    case 'status':
      return handle ? res(world, stdout(...statusText(world, machineId))) : needRepo();
    case 'add': {
      if (!handle || !loc) return needRepo();
      const work = listWorkTree(world.machines[machineId], handle.root);
      const all = rest.some((a) => a === '.' || a === '-A' || a === '--all');
      const paths = all ? Object.keys(work).filter((p) => p !== 'secret.txt') : rest.map((p) => resolvePath(world.machines[machineId].cwd, world.machines[machineId].home, p).slice(handle.root.length + 1));
      const missing = paths.find((p) => work[p] === undefined && !handle.repo.index.entries[p]);
      if (missing) return res(world, stderr(`fatal: pathspec '${missing}' did not match any files`), [], 128);
      const changed: string[] = [];
      const state = produce(world, (w) => {
        const r = w.machines[machineId].repos[handle.root];
        for (const p of paths) {
          if (work[p] === undefined) {
            delete r.index.entries[p];
            changed.push(p);
            continue;
          }
          const h = writeBlob(r, work[p]);
          if (r.index.entries[p]?.hash !== h || r.index.conflicts[p]) changed.push(p);
          delete r.index.conflicts[p];
          r.index.entries[p] = { path: p, hash: h, mode: '100644' };
        }
        if (!Object.keys(r.index.conflicts).length) delete r.special.MERGE_HEAD;
      });
      return res(state, [], changed.length ? [{ type: 'index.stage', repo: loc, paths: changed }] : []);
    }
    case 'restore': {
      if (!handle || !loc) return needRepo();
      const staged = rest.includes('--staged') || rest.includes('-S');
      const paths = rest.filter((a) => !a.startsWith('-'));
      if (!paths.length) return res(world, stderr('fatal: you must specify path(s) to restore'), [], 128);
      const head = headCommit(handle.repo);
      const headFlat = head ? readTreeFlat(handle.repo, getCommit(handle.repo, head)!.tree) : {};
      const state = produce(world, (w) => {
        const r = w.machines[machineId].repos[handle.root];
        for (const p of paths) {
          if (staged) {
            if (headFlat[p]) r.index.entries[p] = { path: p, hash: headFlat[p].hash, mode: headFlat[p].mode };
            else delete r.index.entries[p];
          } else {
            const e = r.index.entries[p];
            const b = e ? r.objects[e.hash] : undefined;
            if (b && b.type === 'blob') writeFile(w.machines[machineId].fs, join(handle.root, p), b.content);
          }
        }
      });
      return res(state, [], [staged ? { type: 'index.unstage', repo: loc, paths } : { type: 'worktree.update', repo: loc, written: paths, deleted: [], reason: 'restore' }]);
    }
    case 'commit': {
      if (!handle) return needRepo();
      const mi = rest.findIndex((a) => a === '-m' || a === '--message');
      if (mi >= 0 && rest[mi + 1] !== undefined) return makeCommit(world, machineId, rest[mi + 1]);
      const status = computeStatus(world, machineId)!;
      if (!status.staged.length) return res(world, stdout(...statusText(world, machineId)), [], 1);
      const request: EditorRequest = {
        purpose: 'commit-message',
        file: '.git/COMMIT_EDITMSG',
        initialContent: [
          '',
          '# Please enter the commit message for your changes. Lines starting',
          "# with '#' will be ignored, and an empty message aborts the commit.",
          '#',
          `# On branch ${status.branch ?? 'HEAD'}`,
          '# Changes to be committed:',
          ...status.staged.map((s) => `#\t${s.kind === 'added' ? 'new file' : s.kind}:   ${s.path}`),
          '#',
        ].join('\n'),
        command: 'git commit',
        machine: machineId,
        workTree: handle.root,
        resume: { handler: 'mock-commit', data: {} },
      };
      const state = produce(world, (w) => void (w.machines[machineId].editor = request));
      return res(state, [], [{ type: 'editor.open', request }]);
    }
    case 'switch':
    case 'checkout': {
      if (!handle) return needRepo();
      const create = rest[0] === '-c' || rest[0] === '-b';
      const name = create ? rest[1] : rest[0];
      if (!name) return res(world, stderr('fatal: missing branch or commit argument'), [], 128);
      return checkoutBranch(world, machineId, handle.root, name, create);
    }
    case 'branch': {
      if (!handle || !loc) return needRepo();
      if (!rest.length) {
        const cur = currentBranch(handle.repo);
        return res(world, stdout(...Object.keys(handle.repo.refs).filter((r) => r.startsWith('refs/heads/')).map((r) => r.slice(11)).sort().map((b) => `${b === cur ? '*' : ' '} ${b}`)));
      }
      const name = rest[0];
      const head = headCommit(handle.repo);
      if (!head) return res(world, stderr(`fatal: not a valid object name: 'main'`), [], 128);
      const state = produce(world, (w) => void (w.machines[machineId].repos[handle.root].refs[`refs/heads/${name}`] = head));
      return res(state, [], [{ type: 'ref.update', repo: loc, change: { ref: `refs/heads/${name}`, from: null, to: head }, reason: 'branch' }]);
    }
    case 'log':
      return handle ? res(world, stdout(...log(handle.repo, rest.includes('--oneline')))) : needRepo();
    case 'push':
      return handle ? push(world, machineId, handle.root) : needRepo();
    case 'fetch':
      return handle ? fetch(world, machineId, handle.root) : needRepo();
    default:
      return null;
  }
}

/** Run one line with the mock commands; null when the mock does not know the command. */
export function runMockLine(world: World, machineId: string, line: string): CommandResult | null {
  const words = tokenize(line);
  if (!words.length) return res(world, []);
  const [program, ...args] = words;
  const m = world.machines[machineId];
  switch (program) {
    case 'git':
      return git(world, machineId, args);
    case 'pwd':
      return res(world, stdout(m.cwd));
    case 'ls': {
      const target = resolvePath(m.cwd, m.home, args.find((a) => !a.startsWith('-')) ?? '.');
      if (!dirExists(m.fs, target)) return res(world, stderr(`ls: cannot access '${args[0]}': No such file or directory`), [], 2);
      const showAll = args.some((a) => a.startsWith('-') && a.includes('a'));
      const names = listDir(m.fs, target)
        .filter((e) => showAll || !e.name.startsWith('.'))
        .map((e) => (e.isDir ? `${e.name}/` : e.name));
      return res(world, names.length ? stdout(names.join('  ')) : []);
    }
    case 'cd': {
      const target = resolvePath(m.cwd, m.home, args[0] ?? '~');
      if (!dirExists(m.fs, target)) return res(world, stderr(`bash: cd: ${args[0]}: No such file or directory`), [], 1);
      const state = produce(world, (w) => void (w.machines[machineId].cwd = target));
      return res(state, [], [{ type: 'shell.cd', machine: machineId, from: m.cwd, to: target }]);
    }
    case 'cat': {
      const p = resolvePath(m.cwd, m.home, args[0] ?? '');
      if (!fileExists(m.fs, p)) return res(world, stderr(`cat: ${args[0] ?? ''}: No such file or directory`), [], 1);
      return res(world, stdout(...(readFile(m.fs, p) ?? '').replace(/\n$/, '').split('\n')));
    }
    case 'clear':
      return res(world, [], [{ type: 'shell.clear', machine: machineId }]);
    default:
      return null;
  }
}

/** Whether the working file differs from what is staged (for goal checks in the mock). */
export function isStagedLikeWork(world: World, machineId: string, path: string): boolean {
  const handle = findRepo(world, machineId);
  if (!handle) return false;
  const work = listWorkTree(world.machines[machineId], handle.root);
  const e = handle.repo.index.entries[path];
  return !!e && work[path] !== undefined && hashBlob(work[path]) === e.hash;
}
