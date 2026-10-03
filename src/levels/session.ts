/**
 * GameSession implementation — the core level runner.
 */
import type {
  CompletionResult,
  GameSession,
  LevelPhase,
  PendingPredict,
  QuestionStatus,
  SessionMode,
  SessionOptions,
  SessionSnapshot,
  TerminalEntry,
} from '../shared/session';
import type { LevelDefinition, DialogueLine, HubAction, TeammateTrigger } from '../shared/level';
import type { LevelResult } from '../shared/progress';
import type { EditorRequest, MachineId, World } from '../shared/types';
import type { GameEvent } from '../shared/events';
import { runLine, completeLine as parserComplete } from '../parser';
import { applyHubAction, reactToEvents } from '../hub/index';
import { applyTeammatePush } from '../remote/index';
import { resumeEditor } from '../engine';
import { runSetup, substituteLevel } from './setup';
import { buildSandboxWorld } from './sandboxPresets';
import {
  createBundle,
  describeBundleError,
  importBundle as importBundleIntoWorld,
  parseBundle,
  serializeBundle,
} from '../classroom/bundle';
import { evaluateGoals, allGoalsMet } from './goals';
import type { GoalContext } from './goals';
import { translateError } from './errors';
import { computeStars, projectStars } from './scoring';
import { worldChanged } from '../shared/compare';
import { findRepo, currentBranch, headCommit } from '../engine/core/repo';
import { resolvePath, dirname } from '../engine/core/paths';
import { writeFile as fsWriteFile, mkdirp } from '../engine/core/fs';
import { produce } from 'immer';

// ---------------------------------------------------------------------------
// Prompt generation
// ---------------------------------------------------------------------------

function buildPrompt(world: World, machineId: string): string {
  const machine = world.machines[machineId];
  if (!machine) return '$ ';
  const handle = findRepo(world, machineId);
  let cwd = machine.cwd;
  // Replace home with ~
  if (cwd.startsWith(machine.home)) {
    cwd = '~' + cwd.slice(machine.home.length);
  }
  let branch = '';
  if (handle) {
    const b = currentBranch(handle.repo);
    if (b) {
      branch = ` (${b})`;
    } else {
      const h = headCommit(handle.repo);
      branch = h ? ` (${h.slice(0, 7)}...)` : '';
    }
  }
  return `${machine.user}@${machine.host}:${cwd}${branch}$ `;
}

// ---------------------------------------------------------------------------
// Session class
// ---------------------------------------------------------------------------

let entryIdCounter = 0;

export class GameSessionImpl implements GameSession {
  private mode: SessionMode;
  private level: LevelDefinition | null;
  private phase: LevelPhase;
  private world: World;
  private initialWorld: World;
  private levelWorkdir: string = '/home/intern';
  private rewindStack: World[] = [];
  private transcript: TerminalEntry[] = [];
  private dialogue: DialogueLine[] = [];
  private storyRead = false;
  private commandsUsed = 0;
  private commandsTyped = 0;
  private hintsRevealed: 0 | 1 | 2 | 3 = 0;
  private revealedHints: string[] = [];
  private pendingPredict: PendingPredict | null = null;
  private editor: EditorRequest | null = null;
  private lastEvents: GameEvent[] = [];
  private eventSeq = 0;
  private answeredQuestions = new Set<string>();
  private questionStatuses: QuestionStatus[] = [];
  private commandsRun = new Map<string, number>();
  private errors = 0;
  private errorCodes: Record<string, number> = {};
  private rewinds = 0;
  private startTime: number;
  private nowFn: () => number;
  private onResult?: (result: LevelResult) => void;
  private listeners = new Set<(snapshot: SessionSnapshot) => void>();
  private disposed = false;
  private result: LevelResult | null = null;
  private predictUsed = false;
  /** Teammate script ids that have already fired (each fires once). */
  private firedTeammates = new Set<string>();
  /** Every engine event so far, for teammate `on: "event"` triggers. */
  private seenEvents: GameEvent[] = [];

  constructor(options: SessionOptions) {
    this.mode = options.mode;
    this.nowFn = options.now ?? Date.now;
    this.startTime = this.nowFn();
    this.onResult = options.onResult;

    if (options.mode === 'story' && options.level) {
      this.level = substituteLevel(options.level, options.player);
      // Run setup
      const { world, errors } = runSetup(this.level, options.player);
      this.world = world;
      this.initialWorld = world;
      this.levelWorkdir = world.machines[world.activeMachine]?.cwd ?? '/home/intern';
      if (errors.length > 0) {
        for (const err of errors) {
          this.addTranscript('system', err);
        }
      }

      // Populate dialogue from story
      this.dialogue = [...this.level.story];

      // Set up questions
      if (this.level.questions) {
        this.questionStatuses = this.level.questions.map((q) => ({
          question: q,
          chosen: null,
          correct: false,
        }));
      }

      // Determine initial phase
      if (this.level.story.length > 0) {
        this.phase = 'intro';
      } else if (this.level.demo) {
        this.phase = 'demo';
      } else {
        this.phase = 'play';
      }
    } else {
      // Sandbox mode
      this.level = null;
      this.phase = 'play';
      this.world = buildSandboxWorld(options.sandboxPreset, options.player);
      this.levelWorkdir = this.world.machines[this.world.activeMachine]?.cwd ?? '/home/intern';
      this.initialWorld = this.world;
    }
  }

  // -----------------------------------------------------------------------
  // Snapshot
  // -----------------------------------------------------------------------

  getSnapshot(): SessionSnapshot {
    const goalCtx = this.makeGoalContext();
    const goals = this.level ? evaluateGoals(this.level.goal.items, goalCtx) : [];

    return {
      mode: this.mode,
      level: this.level,
      phase: this.phase,
      world: this.world,
      goals,
      questions: this.questionStatuses,
      dialogue: [...this.dialogue],
      storyRead: this.storyRead,
      commandsUsed: this.commandsUsed,
      commandsTyped: this.commandsTyped,
      par: this.level?.par ?? null,
      hintsRevealed: this.hintsRevealed,
      hints: [...this.revealedHints],
      projectedStars: projectStars(this.commandsUsed, this.level?.par ?? null, this.hintsRevealed),
      pendingPredict: this.pendingPredict,
      editor: this.editor,
      transcript: [...this.transcript],
      prompt: buildPrompt(this.world, this.world.activeMachine),
      canRewind: this.rewindStack.length > 0,
      lastEvents: this.lastEvents,
      eventSeq: this.eventSeq,
      demoLines: this.level?.demo?.lines ?? [],
      result: this.result,
      elapsedMs: this.nowFn() - this.startTime,
    };
  }

  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    if (this.disposed) return;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }

  // -----------------------------------------------------------------------
  // Command execution
  // -----------------------------------------------------------------------

  run(line: string, options?: { source?: 'typed' | 'button' | 'demo' }): void {
    if (this.disposed) return;
    const source = options?.source ?? 'typed';

    // Check if editor is pending
    if (this.editor) {
      this.addTranscript('stderr', 'An editor is open. Save or close it first.');
      this.notify();
      return;
    }

    // Check if predict card is pending
    if (this.pendingPredict) {
      this.addTranscript('stderr', 'Answer the predict card first.');
      this.notify();
      return;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      this.addTranscript('input', '', { prompt: buildPrompt(this.world, this.world.activeMachine) });
      this.notify();
      return;
    }

    // Check if predict card should trigger
    if (this.level?.predict && this.phase === 'play' && !this.pendingPredict && !this.predictUsed) {
      const trigger = this.level.predict.trigger.trim().replace(/\s+/g, ' ');
      const normalizedLine = trimmed.replace(/\s+/g, ' ');
      if (normalizedLine.startsWith(trigger)) {
        // Show predict card
        this.pendingPredict = {
          card: this.level.predict,
          command: line,
          chosen: null,
        };
        // Record the input
        this.addTranscript('input', trimmed, { prompt: buildPrompt(this.world, this.world.activeMachine) });
        this.notify();
        return;
      }
    }

    this.executeCommand(trimmed, source);
  }

  private executeCommand(line: string, _source: string): void {
    const machineId = this.world.activeMachine;
    const prevWorld = this.world;

    // Track command in prompt
    this.addTranscript('input', line, { prompt: buildPrompt(this.world, machineId) });

    // Run through parser
    const result = runLine(this.world, machineId, line, {
      allowed: this.level?.allowedCommands ?? null,
    });

    // Check if world changed (for par counting)
    const changed = worldChanged(prevWorld, result.state);

    if (changed) {
      // Save rewind state
      this.rewindStack.push(prevWorld);
      this.commandsUsed++;
    }
    this.commandsTyped++;

    // Track ranCommand — store both the full command and prefix forms
    // so goals can match "cat notes.txt", "cat", "git status", or "git"
    const normalized = line.trim().replace(/\s+/g, ' ');
    this.commandsRun.set(normalized, (this.commandsRun.get(normalized) ?? 0) + 1);
    const words = normalized.split(' ');
    if (words[0] === 'git' && words.length > 1) {
      const sub = `git ${words[1]}`;
      if (sub !== normalized) this.commandsRun.set(sub, (this.commandsRun.get(sub) ?? 0) + 1);
    }
    if (words.length > 0) {
      const prog = words[0];
      if (prog !== normalized) this.commandsRun.set(prog, (this.commandsRun.get(prog) ?? 0) + 1);
    }

    // Apply result
    this.world = result.state;
    this.lastEvents = result.events;
    this.eventSeq++;

    // Check for editor
    const machine = this.world.machines[machineId];
    if (machine?.editor) {
      this.editor = machine.editor;
    }

    // Add output to transcript
    for (const line of result.output) {
      this.addTranscript(line.stream === 'stderr' ? 'stderr' : 'stdout', line.text);
    }

    // Error translation
    if (result.exitCode !== 0) {
      this.errors++;
      const outputText = result.output.map((l) => l.text).join('\n');
      const translation = translateError(outputText);
      if (translation) {
        this.errorCodes[translation.id] = (this.errorCodes[translation.id] ?? 0) + 1;
        this.addTranscript('ada', translation.message);
      }
    }

    // React to events (hub)
    if (result.events.length > 0) {
      const hubResult = reactToEvents(this.world, result.events);
      this.world = hubResult.state;
      if (hubResult.events.length > 0) {
        this.lastEvents = [...this.lastEvents, ...hubResult.events];
      }
      this.seenEvents.push(...result.events, ...hubResult.events);
    }

    // Check goals
    this.checkCompletion();
    this.notify();
  }

  complete(line: string): CompletionResult {
    try {
      return parserComplete(this.world, this.world.activeMachine, line);
    } catch {
      return { candidates: [], line };
    }
  }

  history(): string[] {
    const machine = this.world.machines[this.world.activeMachine];
    return machine?.history ?? [];
  }

  // -----------------------------------------------------------------------
  // File editor
  // -----------------------------------------------------------------------

  saveFile(path: string, content: string): void {
    if (this.disposed) return;
    const machineId = this.world.activeMachine;
    const machine = this.world.machines[machineId];
    if (!machine) return;

    const absPath = resolvePath(machine.cwd, machine.home, path);

    const prevWorld = this.world;
    this.world = produce(this.world, (draft) => {
      const m = draft.machines[machineId];
      mkdirp(m.fs, dirname(absPath));
      fsWriteFile(m.fs, absPath, content);
    });

    if (worldChanged(prevWorld, this.world)) {
      this.rewindStack.push(prevWorld);
      this.lastEvents = [{ type: 'fs.write', machine: machineId, path: absPath, created: true }];
      this.eventSeq++;
    }

    this.checkCompletion();
    this.notify();
  }

  submitEditor(text: string | null): void {
    if (this.disposed || !this.editor) return;

    const machineId = this.editor.machine;
    const prevWorld = this.world;

    if (text === null) {
      // Abort
      this.world = produce(this.world, (draft) => {
        draft.machines[machineId].editor = null;
      });
      this.addTranscript('system', 'Editor closed (aborted).');
      this.editor = null;
    } else {
      // Resume the command with the edited content
      try {
        const result = resumeEditor(this.world, machineId, text);
        this.world = result.state;
        this.lastEvents = result.events;
        this.eventSeq++;
        for (const line of result.output) {
          this.addTranscript(line.stream === 'stderr' ? 'stderr' : 'stdout', line.text);
        }
      } catch {
        this.world = produce(this.world, (draft) => {
          draft.machines[machineId].editor = null;
        });
        this.addTranscript('system', 'Editor closed.');
      }
      this.editor = null;
    }

    if (worldChanged(prevWorld, this.world)) {
      this.rewindStack.push(prevWorld);
      this.commandsUsed++;
    }

    this.checkCompletion();
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Predict cards
  // -----------------------------------------------------------------------

  answerPredict(choice: number): void {
    if (!this.pendingPredict) return;
    this.pendingPredict.chosen = choice;
    this.notify();
  }

  continuePredict(): void {
    if (!this.pendingPredict || this.pendingPredict.chosen === null) return;
    const command = this.pendingPredict.command;
    // Clear the predict card's trigger so it does not fire again
    this.predictUsed = true;
    this.pendingPredict = null;
    // Execute the held command
    this.executeCommand(command.trim(), 'typed');
  }

  answerQuestion(questionId: string, choice: number): void {
    const qs = this.questionStatuses.find((q) => q.question.id === questionId);
    if (!qs) return;
    qs.chosen = choice;
    qs.correct = choice === qs.question.answer;
    if (qs.correct) {
      this.answeredQuestions.add(questionId);
    }
    this.checkCompletion();
    this.notify();
  }

  markStoryRead(): void {
    this.storyRead = true;
    if (this.phase === 'intro') {
      if (this.level?.demo) {
        this.phase = 'demo';
      } else {
        this.phase = 'play';
      }
    }
    this.checkCompletion();
    this.notify();
  }

  finishDemo(): void {
    if (this.phase === 'demo') {
      this.phase = 'play';
    }
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Hints
  // -----------------------------------------------------------------------

  revealHint(): string | null {
    if (!this.level || this.hintsRevealed >= 3) return null;
    const hint = (this.level.hints as readonly string[])[this.hintsRevealed];
    if (hint === undefined) return null;
    this.hintsRevealed = (this.hintsRevealed + 1) as 0 | 1 | 2 | 3;
    this.revealedHints.push(hint);
    this.notify();
    return hint;
  }

  // -----------------------------------------------------------------------
  // Rewind / restart
  // -----------------------------------------------------------------------

  rewind(): void {
    if (this.rewindStack.length === 0) return;
    this.world = this.rewindStack.pop()!;
    this.commandsUsed = Math.max(0, this.commandsUsed - 1);
    this.rewinds++;
    // Remove the last input + its output from transcript
    // Find the last input entry and remove everything after it
    for (let i = this.transcript.length - 1; i >= 0; i--) {
      if (this.transcript[i].kind === 'input') {
        this.transcript = this.transcript.slice(0, i);
        break;
      }
    }
    this.lastEvents = [];
    this.eventSeq++;
    this.editor = null;
    this.pendingPredict = null;
    if (this.phase === 'complete') {
      this.phase = 'play';
      this.result = null;
    }
    this.notify();
  }

  restart(): void {
    this.world = this.initialWorld;
    this.rewindStack = [];
    this.transcript = [];
    this.commandsUsed = 0;
    this.commandsTyped = 0;
    this.hintsRevealed = 0;
    this.revealedHints = [];
    this.pendingPredict = null;
    this.predictUsed = false;
    this.editor = null;
    this.lastEvents = [];
    this.eventSeq++;
    this.errors = 0;
    this.errorCodes = {};
    this.rewinds = 0;
    this.answeredQuestions.clear();
    this.commandsRun.clear();
    this.firedTeammates.clear();
    this.seenEvents = [];
    this.result = null;
    this.storyRead = false;
    if (this.level?.questions) {
      this.questionStatuses = this.level.questions.map((q) => ({
        question: q,
        chosen: null,
        correct: false,
      }));
    }
    if (this.level?.story && this.level.story.length > 0) {
      this.dialogue = [...this.level.story];
      this.phase = 'intro';
    } else if (this.level?.demo) {
      this.phase = 'demo';
    } else {
      this.phase = 'play';
    }
    this.startTime = this.nowFn();
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Hub / machines
  // -----------------------------------------------------------------------

  hubAction(action: HubAction): void {
    if (this.disposed) return;
    const prevWorld = this.world;
    const result = applyHubAction(this.world, action);
    this.world = result.state;
    this.lastEvents = result.events;
    this.eventSeq++;

    if (result.exitCode !== 0) {
      for (const line of result.output) {
        this.addTranscript(line.stream === 'stderr' ? 'stderr' : 'stdout', line.text);
      }
    }

    if (worldChanged(prevWorld, this.world)) {
      this.rewindStack.push(prevWorld);
      this.commandsUsed++;
    }

    // React to events
    if (result.events.length > 0) {
      const hubResult = reactToEvents(this.world, result.events);
      this.world = hubResult.state;
      if (hubResult.events.length > 0) {
        this.lastEvents = [...this.lastEvents, ...hubResult.events];
      }
      this.seenEvents.push(...result.events, ...hubResult.events);
    }

    this.checkCompletion();
    this.notify();
  }

  switchMachine(id: MachineId): void {
    if (!this.world.machines[id]) return;
    const previousMachine = this.world.activeMachine;
    this.world = produce(this.world, (draft) => {
      draft.activeMachine = id;
    });
    this.lastEvents = [{ type: 'machine.switch', from: previousMachine, to: id }];
    this.eventSeq++;
    this.notify();
  }

  // -----------------------------------------------------------------------
  // Completion check
  // -----------------------------------------------------------------------

  private checkCompletion(): void {
    if (this.phase === 'complete' || !this.level) return;
    if (this.phase !== 'play') return;

    // Scripted teammates may act before goals are judged, and their work can
    // itself complete or block a goal, so run them first and re-read the world.
    this.runTeammateScripts();

    const goalCtx = this.makeGoalContext();
    if (allGoalsMet(this.level.goal.items, goalCtx)) {
      this.phase = 'complete';
      const stars = computeStars(this.commandsUsed, this.level.par, this.hintsRevealed);
      this.result = {
        levelId: this.level.id,
        mode: 'story',
        completed: true,
        stars,
        commandsUsed: this.commandsUsed,
        commandsTyped: this.commandsTyped,
        par: this.level.par,
        hintsRevealed: this.hintsRevealed,
        errors: this.errors,
        errorCodes: this.errorCodes,
        rewinds: this.rewinds,
        timeMs: this.nowFn() - this.startTime,
        recap: this.level.recap,
      };
      // Add success dialogue
      if (this.level.success) {
        this.dialogue = [...this.dialogue, ...this.level.success];
      }
      this.onResult?.(this.result);
    }
  }

  // -----------------------------------------------------------------------
  // Classmate repo bundles (asynchronous, no backend)
  // -----------------------------------------------------------------------

  exportBundle(author: { name: string; handle: string }): string | null {
    const made = createBundle(this.world, this.world.activeMachine, author, new Date(this.nowFn()).toISOString());
    if (!made.ok) return null;
    return serializeBundle(made.bundle);
  }

  importBundle(text: string): { ok: true; branch: string } | { ok: false; error: string } {
    const parsed = parseBundle(text);
    if (!parsed.ok) return { ok: false, error: describeBundleError(parsed.error) };

    const prevWorld = this.world;
    const landed = importBundleIntoWorld(this.world, this.world.activeMachine, parsed.bundle);
    if (!landed.ok) {
      return { ok: false, error: 'Open a repository first, then import a classmate bundle into it.' };
    }

    this.world = landed.world;
    this.rewindStack.push(prevWorld);
    this.addTranscript(
      'system',
      `Imported ${parsed.bundle.author.name}'s work as branch ${landed.branch}. Merge it with: git merge ${landed.branch}`,
    );
    this.eventSeq++;
    this.checkCompletion();
    this.notify();
    return { ok: true, branch: landed.branch };
  }

  /**
   * Fire scripted-teammate actions whose trigger has become true. Each script
   * runs at most once. A teammate acting is what makes events like a rejected
   * push happen for a real reason instead of a staged one.
   */
  private runTeammateScripts(): void {
    const scripts = this.level?.teammates;
    if (!scripts || scripts.length === 0) return;

    for (const script of scripts) {
      if (this.firedTeammates.has(script.id)) continue;
      if (!this.teammateTriggerMet(script.when)) continue;
      this.firedTeammates.add(script.id);

      for (const action of script.actions) {
        if (action.type === 'say') {
          this.dialogue = [...this.dialogue, { speaker: action.speaker, text: action.text }];
          this.addTranscript('system', `${action.speaker}: ${action.text}`);
          continue;
        }
        const before = this.world;
        let result;
        if (action.type === 'push') {
          result = applyTeammatePush(this.world, action);
        } else if (action.type === 'hub') {
          result = applyHubAction(this.world, action.action);
        } else {
          result = runLine(this.world, action.machine, action.line);
        }
        if (result.exitCode === 0) {
          this.world = result.state;
          if (result.events.length > 0) {
            this.lastEvents = [...this.lastEvents, ...result.events];
            this.eventSeq++;
            // Let the hub react (e.g. a PR notices its branch moved).
            const reacted = reactToEvents(this.world, result.events);
            this.world = reacted.state;
            if (reacted.events.length > 0) this.lastEvents = [...this.lastEvents, ...reacted.events];
            this.seenEvents.push(...result.events, ...reacted.events);
          }
        } else {
          this.world = before;
        }
      }
    }
  }

  private teammateTriggerMet(when: TeammateTrigger): boolean {
    switch (when.on) {
      case 'start':
        return true;
      case 'commands':
        return this.commandsUsed >= when.count;
      case 'goal': {
        if (!this.level) return false;
        const items = this.level.goal.items;
        if (when.item >= items.length) return false;
        const states = evaluateGoals(items, this.makeGoalContext());
        return states[when.item]?.done === true;
      }
      case 'event': {
        const needed = when.count ?? 1;
        let seen = 0;
        for (const ev of this.seenEvents) {
          if (ev.type !== when.event) continue;
          if (when.where) {
            const rec = ev as unknown as Record<string, unknown>;
            let ok = true;
            for (const [k, v] of Object.entries(when.where)) {
              if (rec[k] !== v) { ok = false; break; }
            }
            if (!ok) continue;
          }
          seen++;
          if (seen >= needed) return true;
        }
        return false;
      }
      default:
        return false;
    }
  }

  private makeGoalContext(): GoalContext {
    const machine = this.world.machines[this.world.activeMachine];
    const handle = findRepo(this.world, this.world.activeMachine);
    return {
      world: this.world,
      defaultMachine: this.world.activeMachine,
      defaultRepoPath: handle?.root ?? machine?.cwd ?? '/home/intern',
      levelWorkdir: this.levelWorkdir,
      answeredQuestions: this.answeredQuestions,
      storyRead: this.storyRead,
      commandsRun: this.commandsRun,
    };
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  private addTranscript(
    kind: TerminalEntry['kind'],
    text: string,
    extra?: { prompt?: string; speaker?: string },
  ): void {
    this.transcript.push({
      id: ++entryIdCounter,
      kind,
      text,
      prompt: extra?.prompt,
      speaker: extra?.speaker,
      machine: this.world.activeMachine,
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.result && this.level) {
      // Report abandoned attempt
      const result: LevelResult = {
        levelId: this.level.id,
        mode: 'story',
        completed: false,
        stars: 0,
        commandsUsed: this.commandsUsed,
        commandsTyped: this.commandsTyped,
        par: this.level.par,
        hintsRevealed: this.hintsRevealed,
        errors: this.errors,
        errorCodes: this.errorCodes,
        rewinds: this.rewinds,
        timeMs: this.nowFn() - this.startTime,
        recap: this.level.recap,
      };
      this.onResult?.(result);
    }
    this.listeners.clear();
  }
}
