/**
 * Differential test harness: runs the same scenario in real git (in a temp
 * folder, fixed identity and dates) and in the engine, then compares refs,
 * HEAD, index, working files, in-progress state and optionally output.
 *
 * Because author, committer and dates are identical, commit hashes must
 * match exactly. Owned by Engine A; Engine B and Remote may extend it
 * (additively) for their needs.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { produce } from 'immer';
import { runGit, resumeEditor } from '../../src/engine';
import { createHostedRepoRecord, createMachine, createWorld, deleteFile, findRepo, listWorkTree, mkdirp, resolvePath, writeFile } from '../../src/engine/core';
import type { OutputLine } from '../../src/shared/result';
import type { RepoState, World } from '../../src/shared/types';

export const TEST_NAME = 'Test User';
export const TEST_EMAIL = 'test@example.com';
export const ENGINE_ROOT = '/repo';
const ENGINE_HOME = '/home/tester';

export type Step =
  /** Run git with these args in both. `output: true` also compares stdout/stderr text. */
  | { git: string[]; output?: boolean; editor?: string; sequenceEditor?: string; exitCode?: 'exact' | 'zero-or-not' }
  /** Write files (relative to the current directory). */
  | { write: Record<string, string> }
  | { rm: string[] }
  | { mkdir: string[] }
  /** Change directory, relative to the sandbox root ("." = the repo folder). */
  | { cd: string }
  /** Create an empty bare hosted repo "owner/name" reachable as https://github.com/owner/name.git. */
  | { hosted: string }
  /** Compare state now (in addition to the automatic check at the end). */
  | { check: true };

export interface CompareOptions {
  /** Compare HEAD reflog messages (default false). */
  reflog?: boolean;
  /** Config keys to compare in the local repo config. */
  config?: string[];
  /** Compare ORIG_HEAD (default false). */
  origHead?: boolean;
}

export interface Scenario {
  name: string;
  steps: Step[];
  compare?: CompareOptions;
  /** Extra global config for both sides, e.g. { "pull.rebase": "false" }. */
  globalConfig?: Record<string, string>;
}

export interface ScenarioResult {
  mismatches: string[];
  world: World;
  realRoot: string;
  log: string[];
}

function posix(p: string): string {
  return p.replace(/\\/g, '/');
}

function normalizeText(text: string, realSandbox: string): string {
  let t = text.replace(/\r\n/g, '\n');
  const sb = posix(realSandbox);
  // Real git prints absolute paths in a few places (init, clone); map them to the engine's.
  t = t.split(`${sb}/hub/`).join('https://github.com/');
  t = t.split(`file://${sb}/hub/`).join('https://github.com/');
  t = t.split(`${sb}/repo`).join(ENGINE_ROOT);
  t = t.split(sb).join('');
  return t.replace(/\n+$/, '');
}

function engineOutput(lines: OutputLine[], stream: 'stdout' | 'stderr'): string {
  return lines
    .filter((l) => l.stream === stream)
    .map((l) => l.text)
    .join('\n')
    .replace(/\n+$/, '');
}

class RealGit {
  readonly sandbox: string;
  readonly home: string;
  cwd: string;
  constructor(globalConfig: Record<string, string>) {
    this.sandbox = posix(mkdtempSync(join(tmpdir(), 'gq-diff-')));
    this.home = `${this.sandbox}/home`;
    mkdirSync(this.home, { recursive: true });
    mkdirSync(`${this.sandbox}/repo`, { recursive: true });
    mkdirSync(`${this.sandbox}/hub`, { recursive: true });
    this.cwd = `${this.sandbox}/repo`;
    const cfg = {
      'user.name': TEST_NAME,
      'user.email': TEST_EMAIL,
      'init.defaultBranch': 'main',
      'core.autocrlf': 'false',
      'core.safecrlf': 'false',
      'core.fileMode': 'false',
      'core.symlinks': 'false',
      'core.ignorecase': 'false',
      'core.pager': 'cat',
      'color.ui': 'false',
      'advice.detachedHead': 'true',
      'protocol.file.allow': 'always',
      [`url.file://${this.sandbox}/hub/.insteadOf`]: 'https://github.com/',
      ...globalConfig,
    };
    const lines: string[] = [];
    const sections = new Map<string, string[]>();
    for (const [k, v] of Object.entries(cfg)) {
      const m = /^url\.(.*)\.insteadOf$/.exec(k);
      const [section, name] = m ? [`url "${m[1]}"`, 'insteadOf'] : [k.slice(0, k.lastIndexOf('.')), k.slice(k.lastIndexOf('.') + 1)];
      const sec = section.includes(' ') ? section : section.replace(/^([^.]+)\.(.+)$/, '$1 "$2"');
      const list = sections.get(sec) ?? [];
      list.push(`\t${name} = ${v}`);
      sections.set(sec, list);
    }
    for (const [s, l] of sections) lines.push(`[${s}]`, ...l);
    writeFileSync(`${this.home}/.gitconfig`, `${lines.join('\n')}\n`);
  }

  env(clock: number, editor?: string, sequenceEditor?: string): NodeJS.ProcessEnv {
    const date = `${clock} +0000`;
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: this.home,
      USERPROFILE: this.home,
      GIT_CONFIG_GLOBAL: `${this.home}/.gitconfig`,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_DATE: date,
      GIT_TERMINAL_PROMPT: '0',
      GIT_PAGER: 'cat',
      PAGER: 'cat',
      LANG: 'C',
      LC_ALL: 'C',
      LANGUAGE: 'C',
      TERM: 'dumb',
      GIT_EDITOR: editor ?? 'true',
      GIT_SEQUENCE_EDITOR: sequenceEditor ?? editor ?? 'true',
      GIT_MERGE_AUTOEDIT: 'no',
    };
    delete env.GIT_DIR;
    delete env.GIT_WORK_TREE;
    delete env.GIT_INDEX_FILE;
    return env;
  }

  run(args: string[], clock: number, opts: { editor?: string; sequenceEditor?: string; cwd?: string } = {}) {
    const r = spawnSync('git', args, { cwd: opts.cwd ?? this.cwd, env: this.env(clock, opts.editor, opts.sequenceEditor), encoding: 'utf8' });
    return { stdout: r.stdout ?? '', stderr: r.stderr ?? '', status: r.status ?? -1 };
  }

  /** Editor command that replaces the edited file with `content`. */
  editorFor(content: string, name: string): string {
    const file = `${this.sandbox}/editor-${name}-${Math.random().toString(36).slice(2)}.txt`;
    writeFileSync(file, content);
    return `cp '${file}'`;
  }
}

function realTreeFiles(dir: string, base = dir, out: Record<string, string> = {}): Record<string, string> {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === '.git') continue;
    const p = `${dir}/${name}`;
    if (statSync(p).isDirectory()) realTreeFiles(p, base, out);
    else out[p.slice(base.length + 1)] = readFileSync(p, 'utf8');
  }
  return out;
}

function engineRepo(world: World): { repo: RepoState; root: string } | null {
  const h = findRepo(world, 'laptop', ENGINE_ROOT);
  return h ? { repo: h.repo, root: h.root } : null;
}

function compareState(world: World, real: RealGit, clock: number, compare: CompareOptions, label: string): string[] {
  const out: string[] = [];
  const repoDir = `${real.sandbox}/repo`;
  const realIsRepo = existsSync(`${repoDir}/.git`);
  const eng = engineRepo(world);
  if (realIsRepo !== !!eng) {
    out.push(`${label}: repository exists — real: ${realIsRepo}, engine: ${!!eng}`);
    return out;
  }
  // Working files (compare even without a repo).
  const machine = world.machines.laptop;
  const engFiles = eng ? listWorkTree(machine, eng.root) : listWorkTree(machine, ENGINE_ROOT);
  const realFiles = realTreeFiles(repoDir);
  for (const p of new Set([...Object.keys(engFiles), ...Object.keys(realFiles)])) {
    if (engFiles[p] !== realFiles[p]) out.push(`${label}: work file ${p} — real: ${JSON.stringify(realFiles[p])}, engine: ${JSON.stringify(engFiles[p])}`);
  }
  if (!eng) return out;
  const { repo } = eng;
  const g = (args: string[]) => real.run(args, clock, { cwd: repoDir });

  // Refs.
  const realRefs: Record<string, string> = {};
  for (const line of g(['for-each-ref', '--format=%(refname) %(objectname)']).stdout.split('\n')) {
    if (!line.trim()) continue;
    const [ref, hash] = line.trim().split(' ');
    realRefs[ref] = hash;
  }
  const engRefs: Record<string, string> = { ...repo.refs };
  for (const [sym, target] of Object.entries(repo.symrefs)) if (repo.refs[target]) engRefs[sym] = repo.refs[target];
  for (const r of new Set([...Object.keys(realRefs), ...Object.keys(engRefs)])) {
    if (realRefs[r] !== engRefs[r]) out.push(`${label}: ref ${r} — real: ${realRefs[r] ?? '(none)'}, engine: ${engRefs[r] ?? '(none)'}`);
  }
  // HEAD.
  const sym = g(['symbolic-ref', '-q', 'HEAD']);
  const realHead = sym.status === 0 ? `ref:${sym.stdout.trim()}` : `detached:${g(['rev-parse', '-q', '--verify', 'HEAD']).stdout.trim()}`;
  const engHead = repo.head.type === 'symbolic' ? `ref:${repo.head.ref}` : `detached:${repo.head.hash}`;
  if (realHead !== engHead) out.push(`${label}: HEAD — real: ${realHead}, engine: ${engHead}`);
  // Index.
  const realIndex = g(['ls-files', '-s'])
    .stdout.split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .sort();
  const engIndex: string[] = [];
  for (const e of Object.values(repo.index.entries)) engIndex.push(`${e.mode} ${e.hash} 0\t${e.path}`);
  for (const c of Object.values(repo.index.conflicts)) {
    if (c.base) engIndex.push(`${c.base.mode} ${c.base.hash} 1\t${c.path}`);
    if (c.ours) engIndex.push(`${c.ours.mode} ${c.ours.hash} 2\t${c.path}`);
    if (c.theirs) engIndex.push(`${c.theirs.mode} ${c.theirs.hash} 3\t${c.path}`);
  }
  engIndex.sort();
  if (realIndex.join('\n') !== engIndex.join('\n')) out.push(`${label}: index —\n  real:   ${realIndex.join('\n          ')}\n  engine: ${engIndex.join('\n          ')}`);
  // In-progress operations.
  const gitDir = `${repoDir}/.git`;
  const flags: [string, boolean, boolean][] = [
    ['MERGE_HEAD', existsSync(`${gitDir}/MERGE_HEAD`), !!repo.special.MERGE_HEAD],
    ['CHERRY_PICK_HEAD', existsSync(`${gitDir}/CHERRY_PICK_HEAD`), !!repo.special.CHERRY_PICK_HEAD],
    ['REVERT_HEAD', existsSync(`${gitDir}/REVERT_HEAD`), !!repo.special.REVERT_HEAD],
    ['rebase in progress', existsSync(`${gitDir}/rebase-merge`) || existsSync(`${gitDir}/rebase-apply`), !!repo.rebase],
    ['bisect in progress', existsSync(`${gitDir}/BISECT_START`), !!repo.bisect],
  ];
  for (const [name, r, e] of flags) if (r !== e) out.push(`${label}: ${name} — real: ${r}, engine: ${e}`);
  if (repo.special.MERGE_HEAD && existsSync(`${gitDir}/MERGE_HEAD`)) {
    const realMH = readFileSync(`${gitDir}/MERGE_HEAD`, 'utf8').trim().split('\n');
    if (realMH.join(',') !== repo.special.MERGE_HEAD.join(',')) out.push(`${label}: MERGE_HEAD — real: ${realMH}, engine: ${repo.special.MERGE_HEAD}`);
  }
  if (compare.origHead) {
    const realOrig = existsSync(`${gitDir}/ORIG_HEAD`) ? readFileSync(`${gitDir}/ORIG_HEAD`, 'utf8').trim() : undefined;
    if (realOrig !== repo.special.ORIG_HEAD) out.push(`${label}: ORIG_HEAD — real: ${realOrig}, engine: ${repo.special.ORIG_HEAD}`);
  }
  if (compare.reflog) {
    const realLog = g(['reflog', 'show', '--format=%H %gs', 'HEAD']).stdout.split('\n').filter(Boolean);
    const engLog = [...(repo.reflog.HEAD ?? [])].reverse().map((e) => `${e.new} ${e.message}`);
    if (realLog.join('\n') !== engLog.join('\n')) out.push(`${label}: HEAD reflog —\n  real:   ${realLog.join('\n          ')}\n  engine: ${engLog.join('\n          ')}`);
  }
  for (const key of compare.config ?? []) {
    const r = g(['config', '--local', '--get', key]);
    const realVal = r.status === 0 ? r.stdout.trim() : undefined;
    if (realVal !== repo.config[key]) out.push(`${label}: config ${key} — real: ${realVal}, engine: ${repo.config[key]}`);
  }
  if (out.length) {
    out.push(`${label}: real history:\n${g(['log', '--all', '--format=%H %P %s']).stdout}`);
  }
  return out;
}

/** Fresh engine world matching the real sandbox layout. */
export function createTestWorld(globalConfig: Record<string, string> = {}): World {
  const machine = createMachine({
    id: 'laptop',
    user: 'tester',
    home: ENGINE_HOME,
    cwd: ENGINE_ROOT,
    globalConfig: { 'user.name': TEST_NAME, 'user.email': TEST_EMAIL, 'init.defaultbranch': 'main', ...globalConfig },
  });
  return createWorld({ machines: [machine] });
}

export function runScenario(scenario: Scenario): ScenarioResult {
  const real = new RealGit(scenario.globalConfig ?? {});
  let world = createTestWorld(scenario.globalConfig);
  const mismatches: string[] = [];
  const log: string[] = [];
  const compare = scenario.compare ?? {};
  try {
    scenario.steps.forEach((step, i) => {
      const label = `[${scenario.name}] step ${i + 1}`;
      if ('git' in step) {
        const clock = world.clock;
        const editor = step.editor !== undefined ? real.editorFor(step.editor, 'msg') : undefined;
        const seqEditor = step.sequenceEditor !== undefined ? real.editorFor(step.sequenceEditor, 'todo') : undefined;
        const r = real.run(step.git, clock, { editor, sequenceEditor: seqEditor });
        let e = runGit(world, 'laptop', step.git);
        // If the engine opened an editor, answer it the way the real editor did.
        let guard = 0;
        while (e.state.machines.laptop.editor && guard++ < 10) {
          const req = e.state.machines.laptop.editor;
          const content = req.purpose === 'rebase-todo' ? (step.sequenceEditor ?? req.initialContent) : (step.editor ?? req.initialContent);
          const out = e.output;
          const after = e.state.clock;
          // Real git used one fixed date for the whole command, so resume at the original clock.
          const resumed = resumeEditor(produce(e.state, (d) => void (d.clock = clock)), 'laptop', content);
          e = { ...resumed, output: [...out, ...resumed.output], state: produce(resumed.state, (d) => void (d.clock = after)) };
        }
        world = e.state;
        log.push(`$ git ${step.git.join(' ')}  (real ${r.status}, engine ${e.exitCode})`);
        const exitMode = step.exitCode ?? 'exact';
        const exitOk = exitMode === 'exact' ? r.status === e.exitCode : (r.status === 0) === (e.exitCode === 0);
        if (!exitOk) mismatches.push(`${label} git ${step.git.join(' ')}: exit code — real: ${r.status}, engine: ${e.exitCode}\n  real stdout: ${r.stdout}\n  real stderr: ${r.stderr}\n  engine: ${e.output.map((l) => `[${l.stream}] ${l.text}`).join('\n          ')}`);
        if (step.output) {
          for (const stream of ['stdout', 'stderr'] as const) {
            const rv = normalizeText(stream === 'stdout' ? r.stdout : r.stderr, real.sandbox);
            const ev = engineOutput(e.output, stream);
            if (rv !== ev) mismatches.push(`${label} git ${step.git.join(' ')}: ${stream} differs\n--- real ---\n${rv}\n--- engine ---\n${ev}\n------------`);
          }
        }
      } else if ('write' in step) {
        for (const [p, content] of Object.entries(step.write)) {
          const abs = `${real.cwd}/${p}`;
          mkdirSync(abs.slice(0, abs.lastIndexOf('/')), { recursive: true });
          writeFileSync(abs, content);
        }
        world = produce(world, (d) => {
          const m = d.machines.laptop;
          for (const [p, content] of Object.entries(step.write)) writeFile(m.fs, resolvePath(m.cwd, m.home, p), content);
        });
      } else if ('rm' in step) {
        for (const p of step.rm) rmSync(`${real.cwd}/${p}`, { recursive: true, force: true });
        world = produce(world, (d) => {
          const m = d.machines.laptop;
          for (const p of step.rm) deleteFile(m.fs, resolvePath(m.cwd, m.home, p));
        });
      } else if ('mkdir' in step) {
        for (const p of step.mkdir) mkdirSync(`${real.cwd}/${p}`, { recursive: true });
        world = produce(world, (d) => {
          const m = d.machines.laptop;
          for (const p of step.mkdir) mkdirp(m.fs, resolvePath(m.cwd, m.home, p));
        });
      } else if ('cd' in step) {
        real.cwd = posix(join(`${real.sandbox}/repo`, step.cd));
        world = produce(world, (d) => {
          const m = d.machines.laptop;
          const target = resolvePath(ENGINE_ROOT, m.home, step.cd);
          mkdirp(m.fs, target);
          m.cwd = target;
        });
        mkdirSync(real.cwd, { recursive: true });
      } else if ('hosted' in step) {
        const dir = `${real.sandbox}/hub/${step.hosted}`;
        mkdirSync(dir, { recursive: true });
        real.run(['init', '--bare', '-q', '-b', 'main', `${dir}.git`], world.clock, { cwd: real.sandbox });
        rmSync(dir, { recursive: true, force: true });
        world = produce(world, (d) => {
          d.hosted[step.hosted] = createHostedRepoRecord({ id: step.hosted, createdAt: d.clock });
        });
      } else if ('check' in step) {
        mismatches.push(...compareState(world, real, world.clock, compare, `[${scenario.name}] step ${i + 1} check`));
      }
    });
    mismatches.push(...compareState(world, real, world.clock, compare, `[${scenario.name}] end`));
  } finally {
    if (!process.env.GQ_KEEP_SANDBOX) rmSync(real.sandbox, { recursive: true, force: true });
  }
  return { mismatches, world, realRoot: real.sandbox, log };
}
