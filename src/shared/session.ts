/**
 * FROZEN CONTRACT — the game session API between the UI and the level runner.
 *
 * src/levels implements `GameSession` (createSession). src/ui renders a
 * `SessionSnapshot` and calls the methods below; it never calls the engine
 * directly except for pure read-only helpers (status, graph data).
 *
 * Only the orchestrator may change this file.
 */
import type { GameEvent } from './events';
import type { DialogueLine, HubAction, LevelDefinition, PredictCard, Question } from './level';
import type { LevelResult, PlayerProfile } from './progress';
import type { EditorRequest, MachineId, World } from './types';

export type SessionMode = 'story' | 'sandbox' | 'daily' | 'challenge';

/**
 * intro    – story beats are showing; the terminal already accepts input
 * demo     – Ada's demo lines are running (UI types them out, then calls finishDemo)
 * play     – normal play
 * complete – all goal items done; win screen
 */
export type LevelPhase = 'intro' | 'demo' | 'play' | 'complete';

export interface TerminalEntry {
  id: number;
  kind: 'input' | 'stdout' | 'stderr' | 'ada' | 'system' | 'dialogue';
  text: string;
  /** For input lines: the prompt shown before the command, e.g. "intern@laptop:~/festival (main)$". */
  prompt?: string;
  /** For dialogue lines. */
  speaker?: string;
  machine?: MachineId;
}

export interface GoalItemStatus {
  text: string;
  done: boolean;
}

export interface QuestionStatus {
  question: Question;
  /** Index chosen last, or null if unanswered. */
  chosen: number | null;
  correct: boolean;
}

export interface PendingPredict {
  card: PredictCard;
  /** The command line that is held until the player continues. */
  command: string;
  /** null until the player picks. */
  chosen: number | null;
}

export interface SessionSnapshot {
  mode: SessionMode;
  /** Level with templates substituted; null in sandbox. */
  level: LevelDefinition | null;
  phase: LevelPhase;
  world: World;
  goals: GoalItemStatus[];
  questions: QuestionStatus[];
  /** Story lines plus teammate/dialogue lines added during play. */
  dialogue: DialogueLine[];
  storyRead: boolean;
  /** State-changing commands so far (counts toward par). */
  commandsUsed: number;
  /** Every command line typed so far. */
  commandsTyped: number;
  par: number | null;
  hintsRevealed: 0 | 1 | 2 | 3;
  /** Hints revealed so far, in order. */
  hints: string[];
  /** Stars the player would get if the level were completed now. */
  projectedStars: 1 | 2 | 3;
  pendingPredict: PendingPredict | null;
  /** Editor opened by git (commit message, rebase todo); the terminal waits until it is closed. */
  editor: EditorRequest | null;
  transcript: TerminalEntry[];
  /** Shell prompt for the active machine, e.g. "intern@laptop:~/festival (main)$". */
  prompt: string;
  canRewind: boolean;
  /** Events from the most recent action, for animation. */
  lastEvents: GameEvent[];
  /** Increments on every action so the UI can detect fresh events. */
  eventSeq: number;
  /** Lines Ada will type during the demo phase. */
  demoLines: string[];
  /** Set when phase === 'complete'. */
  result: LevelResult | null;
  /** Challenge mode: seconds left (null otherwise). */
  timeLeftSec: number | null;
  /** Milliseconds since the level started. */
  elapsedMs: number;
}

export interface CompletionResult {
  /** Candidate completions for the current word. */
  candidates: string[];
  /** The full line after applying the longest common completion. */
  line: string;
}

export interface GameSession {
  getSnapshot(): SessionSnapshot;
  /** Called after every change; returns an unsubscribe function. */
  subscribe(listener: (snapshot: SessionSnapshot) => void): () => void;

  /** Run one typed line. `source` is "button" for action buttons and "demo" for Ada's demo. */
  run(line: string, options?: { source?: 'typed' | 'button' | 'demo' }): void;
  /** Tab completion for a partial line. */
  complete(line: string): CompletionResult;
  /** Previous / next entries of shell history for the active machine. */
  history(): string[];

  /** Save a file from the editor panel (path absolute, "~/..." or relative to the active machine's cwd). */
  saveFile(path: string, content: string): void;
  /** Close the git-opened editor: save with text, or abort with null. */
  submitEditor(text: string | null): void;

  /** Choose an answer on the pending predict card (shows the explanation). */
  answerPredict(choice: number): void;
  /** Dismiss the answered predict card and run the held command. */
  continuePredict(): void;
  answerQuestion(questionId: string, choice: number): void;
  markStoryRead(): void;
  /** Called by the UI when it has finished typing out the demo lines. */
  finishDemo(): void;

  /** Reveal the next hint tier; returns its text or null if all are shown. */
  revealHint(): string | null;
  /** Undo the most recent state-changing action. */
  rewind(): void;
  /** Restart the level from its starting state. */
  restart(): void;

  /** Perform an action on the simulated GitHub as the player. */
  hubAction(action: HubAction): void;
  switchMachine(id: MachineId): void;

  /** Stop timers and report an abandoned attempt if not completed. */
  dispose(): void;
}

export interface SessionOptions {
  mode: SessionMode;
  /** Required unless mode === 'sandbox'. */
  level?: LevelDefinition;
  player: PlayerProfile;
  /** Sandbox only: start with a sample project and a simulated GitHub repo. */
  sandboxPreset?: 'empty' | 'festival' | 'festival-with-remote';
  /** Called once when the level is completed or the attempt is abandoned. */
  onResult?: (result: LevelResult) => void;
  /** Wall-clock source (tests inject a fake). Defaults to Date.now. */
  now?: () => number;
}
