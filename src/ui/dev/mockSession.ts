/**
 * Dev/test tool: a realistic in-memory GameSession.
 *
 * Used by the UI component tests and the dev-only `#/dev` route while the
 * real level runner (src/levels) is built in parallel. It runs lines with
 * `runLine` from src/parser and falls back to simplified mock commands for
 * anything the engine does not implement yet. It has a fake level with
 * story, goals, hints, a predict card, a question, action buttons, demo
 * lines, a git editor flow, two machines and a hosted repo.
 */
import { produce } from 'immer';
import { computeStatus } from '../../engine/a/status';
import { getCommit, readTreeFlat } from '../../engine/core/objects';
import { writeFile } from '../../engine/core/fs';
import { resolvePath } from '../../engine/core/paths';
import { findRepo, headCommit } from '../../engine/core/repo';
import { runLine } from '../../parser';
import { worldChanged } from '../../shared/compare';
import type { DialogueLine, HubAction, LevelDefinition } from '../../shared/level';
import type { LevelResult, PlayerProfile } from '../../shared/progress';
import { outputText } from '../../shared/result';
import type { CommandResult } from '../../shared/result';
import type { CompletionResult, GameSession, GoalItemStatus, LevelPhase, PendingPredict, QuestionStatus, SessionMode, SessionSnapshot, TerminalEntry } from '../../shared/session';
import type { GameEvent } from '../../shared/events';
import type { MachineId, World } from '../../shared/types';
import { finishCommitFromEditor, promptFor, runMockLine } from './mockCommands';
import { MOCK_REPO_ROOT, createMockWorld } from './mockWorld';
import type { MockVariant } from './mockWorld';

export const MOCK_PLAYER: PlayerProfile = {
  id: 'mock-player',
  name: 'Test Player',
  handle: 'tester',
  email: 'test.player@example.com',
  classCode: '',
  createdAt: '2026-01-01T00:00:00.000Z',
};

export function createMockLevel(variant: MockVariant = 'full'): LevelDefinition {
  if (variant === 'chapter0') {
    return {
      id: '0.3',
      chapter: 0,
      number: 3,
      title: 'Looking around',
      concept: 'ls, cd, cd ..',
      story: [
        { speaker: 'Ada', text: 'A terminal is a window where you type commands.', mood: 'happy' },
        { speaker: 'Ada', text: 'Type ls to list what is in this folder.' },
      ],
      setup: { steps: [] },
      goal: { items: [{ text: 'Go into the festival folder', checks: [{ type: 'cwd', path: '~/festival' }] }] },
      par: 1,
      allowedCommands: ['ls', 'cd', 'pwd'],
      hints: ['Which folder holds the festival files?', 'cd moves you into a folder.', 'cd festival'],
      predict: null,
      recap: 'ls lists files; cd moves you into a folder.',
      ui: { panels: { world: false } },
      solution: [{ run: 'cd festival' }],
    };
  }
  return {
    id: '6.4',
    chapter: 6,
    number: 4,
    title: 'Upload',
    concept: 'git push -u origin main',
    story: [
      { speaker: 'Ada', text: 'Your laptop and GitHub only sync when you ask them to.', mood: 'thinking' },
      { speaker: 'Sam', text: 'I already pushed a small fix this morning!', mood: 'excited' },
      { speaker: 'Ada', text: 'Stage the homepage, commit it, then look at both graphs.' },
    ],
    workdir: '~/festival',
    setup: { steps: [] },
    demo: { lines: ['git status'], captions: ['Ada checks which box each file is in.'] },
    goal: {
      items: [
        { text: 'Stage the homepage (index.html)', checks: [{ type: 'staged', path: 'index.html' }] },
        { text: 'Commit the homepage', checks: [{ type: 'commit', changes: ['index.html'] }] },
        { text: 'Answer Ada’s question', checks: [{ type: 'answered', question: 'boxes' }] },
      ],
    },
    par: 2,
    allowedCommands: null,
    hints: ['Which box does index.html need to reach first?', 'git add copies a file into the staging area.', 'git add index.html'],
    predict: {
      trigger: 'git commit',
      question: 'What will the graph look like after this commit?',
      choices: [
        { text: 'A new commit on top of main', picture: { kind: 'graph', commits: [{ id: 'A', parents: [] }, { id: 'B', parents: ['A'] }, { id: 'C', parents: ['B'] }], branches: { main: 'C' }, head: 'main' } },
        { text: 'A new branch appears', picture: { kind: 'graph', commits: [{ id: 'A', parents: [] }, { id: 'B', parents: ['A'] }, { id: 'C', parents: ['A'] }], branches: { main: 'B', feature: 'C' }, head: 'main' } },
        { text: 'Nothing changes', picture: { kind: 'text', text: 'nothing to commit, working tree clean' } },
      ],
      answer: 0,
      explanation: 'A commit adds a new snapshot on top of the current branch, and the branch label moves to it.',
    },
    questions: [
      {
        id: 'boxes',
        prompt: 'Which box holds the changes for your next commit?',
        choices: [{ text: 'Working folder' }, { text: 'Staging area' }, { text: 'Repository' }],
        answer: 1,
        explanation: 'The staging area holds exactly what the next commit will contain.',
      },
    ],
    recap: 'git push uploads your commits; GitHub only changes when you push.',
    glossary: ['push', 'remote'],
    cheatSheet: [
      { command: 'git add <file>', summary: 'Copy a file into the staging area' },
      { command: 'git commit -m "<message>"', summary: 'Save the staging area as a commit' },
    ],
    success: [{ speaker: 'Ada', text: 'Lovely. Now both graphs tell the same story.', mood: 'proud' }],
    ui: {
      panels: { remote: true, hub: true },
      actionButtons: [
        { label: 'Stage index.html', command: 'git add index.html' },
        { label: 'Check status', command: 'git status' },
      ],
      hubPage: 'lantern-labs/festival-site',
    },
    boss: false,
    solution: [{ run: 'git add index.html' }, { run: 'git commit -m "Update homepage"' }, { answer: { question: 'boxes', choice: 1 } }],
  };
}

export interface MockSessionOptions {
  variant?: MockVariant;
  mode?: SessionMode;
  level?: LevelDefinition;
  player?: PlayerProfile;
  onResult?: (result: LevelResult) => void;
  now?: () => number;
  /** Start in this phase (default "intro"). */
  phase?: LevelPhase;
}

/** A GameSession plus a log of method calls (for tests). */
export interface MockGameSession extends GameSession {
  readonly calls: { method: string; args: unknown[] }[];
  /** Replace the world directly (tests). */
  setWorld(world: World): void;
}

interface State {
  world: World;
  phase: LevelPhase;
  storyRead: boolean;
  dialogue: DialogueLine[];
  questions: QuestionStatus[];
  transcript: TerminalEntry[];
  commandsUsed: number;
  commandsTyped: number;
  hintsRevealed: 0 | 1 | 2 | 3;
  hints: string[];
  pendingPredict: PendingPredict | null;
  predictShown: boolean;
  lastEvents: GameEvent[];
  eventSeq: number;
  result: LevelResult | null;
  errors: number;
  rewinds: number;
  committed: boolean;
}

const ADA_TIPS: { match: RegExp; text: string }[] = [
  { match: /not a git repository/, text: 'This folder is not being tracked by git. Did you run git init, or are you in the wrong folder?' },
  { match: /failed to push some refs/, text: 'GitHub has commits you do not have yet. Run git pull, then push again.' },
  { match: /did not match any files/, text: 'Git cannot find that file. Check the spelling with ls.' },
  { match: /is not a git command|command not found/, text: 'That command is not available here. Try git status to see where things stand.' },
  { match: /nothing added to commit|no changes added to commit/, text: 'Nothing is in the staging area yet. Try git add first.' },
];

export function createMockSession(options: MockSessionOptions = {}): MockGameSession {
  const variant = options.variant ?? 'full';
  const mode: SessionMode = options.mode ?? (variant === 'sandbox' ? 'sandbox' : 'story');
  const player = options.player ?? MOCK_PLAYER;
  const level = mode === 'sandbox' ? null : (options.level ?? createMockLevel(variant));
  const now = options.now ?? (() => Date.now());
  const startedAt = now();
  const listeners = new Set<(s: SessionSnapshot) => void>();
  const calls: { method: string; args: unknown[] }[] = [];
  let nextEntryId = 1;
  let disposed = false;
  let reported = false;

  const initialState = (): State => {
    const world = createMockWorld(variant === 'sandbox' ? 'full' : variant, player);
    return {
      world,
      phase: options.phase ?? (mode === 'sandbox' ? 'play' : 'intro'),
      storyRead: mode === 'sandbox' || (options.phase ?? 'intro') !== 'intro',
      dialogue: level ? [...level.story] : [],
      questions: (level?.questions ?? []).map((q) => ({ question: q, chosen: null, correct: false })),
      transcript: [],
      commandsUsed: 0,
      commandsTyped: 0,
      hintsRevealed: 0,
      hints: [],
      pendingPredict: null,
      predictShown: false,
      lastEvents: [],
      eventSeq: 0,
      result: null,
      errors: 0,
      rewinds: 0,
      committed: false,
    };
  };

  let state = initialState();
  let undo: State[] = [];
  let snapshot: SessionSnapshot;

  const entry = (e: Omit<TerminalEntry, 'id'>): TerminalEntry => ({ ...e, id: nextEntryId++ });

  const goals = (s: State): GoalItemStatus[] => {
    if (!level) return [];
    return level.goal.items.map((item, i) => {
      let done: boolean;
      if (variant === 'chapter0') done = s.world.machines.laptop.cwd === '/home/intern/festival';
      else if (i === 0) {
        const st = computeStatus(s.world, 'laptop', MOCK_REPO_ROOT);
        done = (st?.staged.some((x) => x.path === 'index.html') ?? false) || s.committed;
      } else if (i === 1) done = s.committed;
      else done = s.questions.some((q) => q.question.id === 'boxes' && q.correct);
      return { text: item.text, done };
    });
  };

  const projectedStars = (s: State): 1 | 2 | 3 => {
    let stars = 3;
    if (s.hintsRevealed >= 2) stars -= s.hintsRevealed - 1;
    if (level?.par !== null && level?.par !== undefined && s.commandsUsed > level.par) stars -= 1;
    return Math.max(1, stars) as 1 | 2 | 3;
  };

  const buildSnapshot = (): SessionSnapshot => {
    const g = goals(state);
    return {
      mode,
      level,
      phase: state.phase,
      world: state.world,
      goals: g,
      questions: state.questions,
      dialogue: state.dialogue,
      storyRead: state.storyRead,
      commandsUsed: state.commandsUsed,
      commandsTyped: state.commandsTyped,
      par: level?.par ?? null,
      hintsRevealed: state.hintsRevealed,
      hints: state.hints,
      projectedStars: projectedStars(state),
      pendingPredict: state.pendingPredict,
      editor: state.world.machines[state.world.activeMachine]?.editor ?? null,
      transcript: state.transcript,
      prompt: promptFor(state.world, state.world.activeMachine),
      canRewind: undo.length > 0,
      lastEvents: state.lastEvents,
      eventSeq: state.eventSeq,
      demoLines: level?.demo?.lines ?? [],
      result: state.result,
      elapsedMs: now() - startedAt,
    };
  };

  const emit = () => {
    snapshot = buildSnapshot();
    for (const l of listeners) l(snapshot);
  };

  const resultFor = (completed: boolean): LevelResult => ({
    levelId: level?.id ?? 'sandbox',
    mode: 'story',
    completed,
    stars: completed ? projectedStars(state) : 0,
    commandsUsed: state.commandsUsed,
    commandsTyped: state.commandsTyped,
    par: level?.par ?? null,
    hintsRevealed: state.hintsRevealed,
    errors: state.errors,
    errorCodes: {},
    rewinds: state.rewinds,
    timeMs: now() - startedAt,
    recap: level?.recap ?? '',
  });

  const checkComplete = () => {
    if (!level || state.phase === 'complete') return;
    if (goals(state).every((g) => g.done)) {
      state = { ...state, phase: 'complete', result: resultFor(true), dialogue: [...state.dialogue, ...(level.success ?? [])] };
      if (!reported) {
        reported = true;
        options.onResult?.(state.result!);
      }
    }
  };

  const applyResult = (line: string, r: CommandResult, source: string) => {
    const machine = state.world.activeMachine;
    const out: TerminalEntry[] = r.output.map((o) => entry({ kind: o.stream, text: o.text, machine }));
    const text = outputText(r.output);
    const tip = r.exitCode !== 0 ? ADA_TIPS.find((t) => t.match.test(text)) : undefined;
    if (tip) out.push(entry({ kind: 'ada', text: tip.text }));
    const changed = worldChanged(state.world, r.state);
    if (changed) undo = [...undo, state];
    const wasCommitted = state.committed;
    let committed = state.committed;
    const head = findRepo(r.state, 'laptop');
    if (head && r.events.some((e) => e.type === 'commit.create')) {
      const h = headCommit(head.repo);
      const c = h ? getCommit(head.repo, h) : undefined;
      if (c && c.parents[0]) {
        const now = readTreeFlat(head.repo, c.tree)['index.html']?.hash;
        const before = readTreeFlat(head.repo, getCommit(head.repo, c.parents[0])!.tree)['index.html']?.hash;
        if (now !== before) committed = true;
      }
    }
    const history = source === 'demo' ? r.state : produce(r.state, (w) => void w.machines[machine].history.push(line));
    const dialogue = !wasCommitted && committed ? [...state.dialogue, { speaker: 'Sam' as const, text: 'Nice commit! Do not forget to push it.' }] : state.dialogue;
    const transcript = [...state.transcript, ...out];
    if (dialogue.length > state.dialogue.length) transcript.push(entry({ kind: 'dialogue', speaker: 'Sam', text: dialogue[dialogue.length - 1].text }));
    state = {
      ...state,
      world: history,
      transcript,
      dialogue,
      committed,
      commandsUsed: state.commandsUsed + (changed && source !== 'demo' ? 1 : 0),
      errors: state.errors + (r.exitCode !== 0 ? 1 : 0),
      lastEvents: r.events,
      eventSeq: state.eventSeq + 1,
    };
    checkComplete();
  };

  const execute = (line: string, source: string) => {
    const machine = state.world.activeMachine;
    let r = runLine(state.world, machine, line, { allowed: level?.allowedCommands ?? null });
    const text = outputText(r.output);
    if (r.exitCode === 127 || /is not a git command/.test(text)) r = runMockLine(state.world, machine, line) ?? r;
    applyResult(line, r, source);
  };

  const session: MockGameSession = {
    calls,
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    run(line, opts) {
      calls.push({ method: 'run', args: [line, opts] });
      if (disposed || state.pendingPredict || state.world.machines[state.world.activeMachine].editor) return;
      const machine = state.world.activeMachine;
      const source = opts?.source ?? 'typed';
      const input = entry({ kind: 'input', text: line, prompt: promptFor(state.world, machine), machine });
      state = { ...state, transcript: [...state.transcript, input], commandsTyped: state.commandsTyped + (source === 'demo' ? 0 : 1) };
      const norm = line.trim().replace(/\s+/g, ' ');
      if (level?.predict && !state.predictShown && norm.startsWith(level.predict.trigger)) {
        state = { ...state, predictShown: true, pendingPredict: { card: level.predict, command: line, chosen: null } };
        emit();
        return;
      }
      execute(line, source);
      emit();
    },
    complete(line): CompletionResult {
      calls.push({ method: 'complete', args: [line] });
      const words = ['git', 'status', 'add', 'commit', 'switch', 'branch', 'log', 'push', 'fetch', 'restore', 'ls', 'cd', 'pwd', 'cat'];
      const files = Object.keys(state.world.machines[state.world.activeMachine].fs.files)
        .filter((p) => p.startsWith(`${state.world.machines[state.world.activeMachine].cwd}/`))
        .map((p) => p.slice(state.world.machines[state.world.activeMachine].cwd.length + 1));
      const lastSpace = line.lastIndexOf(' ');
      const word = line.slice(lastSpace + 1);
      const pool = lastSpace < 0 ? words.slice(0, 1).concat(words.slice(9)) : line.startsWith('git ') && line.split(' ').length === 2 ? words : files;
      const candidates = pool.filter((w) => w.startsWith(word) && w !== word);
      if (candidates.length === 1) return { candidates, line: `${line.slice(0, lastSpace + 1)}${candidates[0]} ` };
      return { candidates, line };
    },
    history: () => [...state.world.machines[state.world.activeMachine].history],
    saveFile(path, content) {
      calls.push({ method: 'saveFile', args: [path, content] });
      const m = state.world.machines[state.world.activeMachine];
      const abs = resolvePath(m.cwd, m.home, path);
      const created = m.fs.files[abs] === undefined;
      state = {
        ...state,
        world: produce(state.world, (w) => void writeFile(w.machines[m.id].fs, abs, content)),
        lastEvents: [{ type: 'fs.write', machine: m.id, path: abs, created }],
        eventSeq: state.eventSeq + 1,
      };
      checkComplete();
      emit();
    },
    submitEditor(text) {
      calls.push({ method: 'submitEditor', args: [text] });
      const machine = state.world.activeMachine;
      if (!state.world.machines[machine].editor) return;
      applyResult('', finishCommitFromEditor(state.world, machine, text), 'editor');
      emit();
    },
    answerPredict(choice) {
      calls.push({ method: 'answerPredict', args: [choice] });
      if (!state.pendingPredict) return;
      state = { ...state, pendingPredict: { ...state.pendingPredict, chosen: choice } };
      emit();
    },
    continuePredict() {
      calls.push({ method: 'continuePredict', args: [] });
      const p = state.pendingPredict;
      if (!p || p.chosen === null) return;
      state = { ...state, pendingPredict: null };
      execute(p.command, 'typed');
      emit();
    },
    answerQuestion(questionId, choice) {
      calls.push({ method: 'answerQuestion', args: [questionId, choice] });
      state = {
        ...state,
        questions: state.questions.map((q) => (q.question.id === questionId ? { ...q, chosen: choice, correct: q.correct || choice === q.question.answer } : q)),
      };
      checkComplete();
      emit();
    },
    markStoryRead() {
      calls.push({ method: 'markStoryRead', args: [] });
      const hasDemo = (level?.demo?.lines.length ?? 0) > 0;
      state = { ...state, storyRead: true, phase: state.phase === 'intro' ? (hasDemo ? 'demo' : 'play') : state.phase };
      emit();
    },
    finishDemo() {
      calls.push({ method: 'finishDemo', args: [] });
      if (state.phase === 'demo') state = { ...state, phase: 'play' };
      emit();
    },
    revealHint() {
      calls.push({ method: 'revealHint', args: [] });
      if (!level || state.hintsRevealed >= 3) return null;
      const tier = (state.hintsRevealed + 1) as 1 | 2 | 3;
      const text = level.hints[tier - 1];
      state = { ...state, hintsRevealed: tier, hints: [...state.hints, text] };
      emit();
      return text;
    },
    rewind() {
      calls.push({ method: 'rewind', args: [] });
      const prev = undo[undo.length - 1];
      if (!prev) return;
      undo = undo.slice(0, -1);
      state = {
        ...prev,
        transcript: [...state.transcript, entry({ kind: 'system', text: 'Rewound one step.' })],
        hintsRevealed: state.hintsRevealed,
        hints: state.hints,
        rewinds: state.rewinds + 1,
        lastEvents: [],
        eventSeq: state.eventSeq + 1,
        commandsTyped: state.commandsTyped,
        questions: state.questions,
        storyRead: state.storyRead,
        phase: state.phase === 'complete' ? 'complete' : prev.phase === 'intro' && state.storyRead ? 'play' : prev.phase,
      };
      emit();
    },
    restart() {
      calls.push({ method: 'restart', args: [] });
      const seq = state.eventSeq;
      undo = [];
      reported = false;
      state = { ...initialState(), eventSeq: seq + 1 };
      emit();
    },
    hubAction(action: HubAction) {
      calls.push({ method: 'hubAction', args: [action] });
      state = { ...state, transcript: [...state.transcript, entry({ kind: 'system', text: `GitHub: ${action.type}` })], eventSeq: state.eventSeq + 1, lastEvents: [] };
      emit();
    },
    switchMachine(id: MachineId) {
      calls.push({ method: 'switchMachine', args: [id] });
      if (!state.world.machines[id] || state.world.activeMachine === id) return;
      const from = state.world.activeMachine;
      state = { ...state, world: produce(state.world, (w) => void (w.activeMachine = id)), lastEvents: [{ type: 'machine.switch', from, to: id }], eventSeq: state.eventSeq + 1 };
      emit();
    },
    dispose() {
      calls.push({ method: 'dispose', args: [] });
      if (disposed) return;
      disposed = true;
      if (!reported && level) {
        reported = true;
        options.onResult?.(resultFor(false));
      }
      listeners.clear();
    },
    setWorld(world) {
      state = { ...state, world, eventSeq: state.eventSeq + 1, lastEvents: [] };
      emit();
    },
  };
  snapshot = buildSnapshot();
  return session;
}
