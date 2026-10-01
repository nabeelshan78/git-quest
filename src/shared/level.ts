/**
 * FROZEN CONTRACT — level file format.
 *
 * One JSON file per level in content/levels/chNN/<id>.json. The zod schema
 * below is the single source of truth: `npm run schema` generates
 * content/level.schema.json from it, and tests validate every level file
 * against that JSON Schema.
 *
 * Template strings: any string in a level may contain {{player.name}},
 * {{player.email}} or {{player.handle}}; the level runner substitutes them
 * from the player's profile before the level starts.
 *
 * Paths in goal checks, setup `files` and solution `edit` steps are relative
 * to the level's `workdir` (default "~") unless they start with "/" or "~".
 *
 * Only the orchestrator may change this file.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Basic pieces
// ---------------------------------------------------------------------------

export const SpeakerSchema = z.enum(['Ada', 'Sam', 'Priya', 'Leo', 'Narrator', 'You']);

export const DialogueLineSchema = z.strictObject({
  speaker: SpeakerSchema,
  text: z.string().min(1),
  mood: z.enum(['neutral', 'happy', 'excited', 'worried', 'thinking', 'proud']).optional(),
});

/** Matches file content. All given conditions must hold. */
export const ContentMatcherSchema = z.strictObject({
  equals: z.string().optional(),
  contains: z.union([z.string(), z.array(z.string())]).optional(),
  notContains: z.union([z.string(), z.array(z.string())]).optional(),
  /** JavaScript regular expression source, tested with the "m" flag. */
  matches: z.string().optional(),
});

/** Matches a commit message. All given conditions must hold. Case-insensitive for contains. */
const MessageMatch = {
  messageContains: z.union([z.string(), z.array(z.string())]).optional(),
  messageNotContains: z.union([z.string(), z.array(z.string())]).optional(),
  /** Regex source tested against the full message. */
  messageMatches: z.string().optional(),
  messageEquals: z.string().optional(),
};

const Count = z.strictObject({
  equals: z.number().int().optional(),
  min: z.number().int().optional(),
  max: z.number().int().optional(),
});

/** Selects a local repository. Defaults: the level's main machine and `workdir`. */
const RepoSel = {
  machine: z.string().optional(),
  repoPath: z.string().optional(),
};

/** Small picture for predict cards and questions. */
export const PictureSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('graph'),
    /** Commits oldest first. `id` is a short label like "A" or "C3". */
    commits: z.array(
      z.strictObject({
        id: z.string(),
        parents: z.array(z.string()),
        label: z.string().optional(),
      }),
    ),
    /** Branch name -> commit id. */
    branches: z.record(z.string(), z.string()),
    /** Branch name, or a commit id when detached. */
    head: z.string(),
    /** Optional remote-tracking / remote branches drawn dashed, e.g. {"origin/main": "B"}. */
    remoteBranches: z.record(z.string(), z.string()).optional(),
    tags: z.record(z.string(), z.string()).optional(),
  }),
  z.strictObject({
    kind: z.literal('boxes'),
    working: z.array(z.string()),
    staging: z.array(z.string()),
    repository: z.array(z.string()),
  }),
  z.strictObject({
    kind: z.literal('text'),
    /** Monospace text such as a file with conflict markers or command output. */
    text: z.string(),
  }),
]);

export const ChoiceSchema = z.strictObject({
  text: z.string().min(1),
  picture: PictureSchema.optional(),
});

/**
 * Shown before a key command runs: "What will the graph look like after this?"
 * A wrong guess is never punished.
 */
export const PredictCardSchema = z.strictObject({
  /**
   * The card appears the first time the player runs a command starting with
   * this text (compared after trimming and collapsing spaces), e.g. "git merge".
   */
  trigger: z.string().min(1),
  question: z.string().min(1),
  choices: z.array(ChoiceSchema).min(2).max(3),
  /** Index into `choices`. */
  answer: z.number().int().min(0),
  explanation: z.string().min(1),
});

/** A multiple-choice question inside the mission panel (used for goals on read-only commands). */
export const QuestionSchema = z.strictObject({
  id: z.string().min(1),
  prompt: z.string().min(1),
  choices: z.array(ChoiceSchema).min(2).max(4),
  answer: z.number().int().min(0),
  explanation: z.string().min(1),
});

// ---------------------------------------------------------------------------
// Hub (simulated GitHub) actions — shared by setup, teammates, solutions, UI
// ---------------------------------------------------------------------------

const Actor = { actor: z.string().optional() }; // hub login; default = the player (hub.viewer)
const RepoId = z.string().min(3); // "owner/name"

export const HubActionSchema = z.discriminatedUnion('type', [
  z.strictObject({ type: z.literal('createRepo'), ...Actor, owner: z.string().optional(), name: z.string(), description: z.string().optional(), visibility: z.enum(['public', 'private']).optional(), readme: z.boolean().optional(), gitignore: z.string().optional(), license: z.string().optional() }),
  z.strictObject({ type: z.literal('editFile'), ...Actor, repo: RepoId, branch: z.string().optional(), path: z.string(), content: z.string(), message: z.string() }),
  z.strictObject({ type: z.literal('createBranch'), ...Actor, repo: RepoId, branch: z.string(), from: z.string().optional() }),
  z.strictObject({ type: z.literal('deleteBranch'), ...Actor, repo: RepoId, branch: z.string() }),
  z.strictObject({ type: z.literal('createIssue'), ...Actor, repo: RepoId, title: z.string(), body: z.string().optional(), labels: z.array(z.string()).optional(), assignees: z.array(z.string()).optional() }),
  z.strictObject({ type: z.literal('commentIssue'), ...Actor, repo: RepoId, number: z.number().int(), body: z.string() }),
  z.strictObject({ type: z.literal('assignIssue'), ...Actor, repo: RepoId, number: z.number().int(), assignees: z.array(z.string()) }),
  z.strictObject({ type: z.literal('labelIssue'), ...Actor, repo: RepoId, number: z.number().int(), labels: z.array(z.string()) }),
  z.strictObject({ type: z.literal('closeIssue'), ...Actor, repo: RepoId, number: z.number().int(), reason: z.enum(['completed', 'not_planned']).optional() }),
  z.strictObject({ type: z.literal('reopenIssue'), ...Actor, repo: RepoId, number: z.number().int() }),
  z.strictObject({ type: z.literal('openPullRequest'), ...Actor, repo: RepoId, head: z.string(), base: z.string().optional(), title: z.string(), body: z.string().optional(), draft: z.boolean().optional(), reviewers: z.array(z.string()).optional() }),
  z.strictObject({ type: z.literal('commentPullRequest'), ...Actor, repo: RepoId, number: z.number().int(), body: z.string() }),
  z.strictObject({ type: z.literal('requestReviewers'), ...Actor, repo: RepoId, number: z.number().int(), reviewers: z.array(z.string()) }),
  z.strictObject({
    type: z.literal('reviewPullRequest'),
    ...Actor,
    repo: RepoId,
    number: z.number().int(),
    event: z.enum(['approve', 'request_changes', 'comment']),
    body: z.string().optional(),
    comments: z.array(z.strictObject({ path: z.string(), line: z.number().int(), body: z.string() })).optional(),
  }),
  z.strictObject({ type: z.literal('replyReviewComment'), ...Actor, repo: RepoId, number: z.number().int(), commentId: z.number().int().optional(), body: z.string() }),
  z.strictObject({ type: z.literal('resolveReviewThread'), ...Actor, repo: RepoId, number: z.number().int(), commentId: z.number().int().optional() }),
  z.strictObject({ type: z.literal('mergePullRequest'), ...Actor, repo: RepoId, number: z.number().int(), method: z.literal('merge').optional(), title: z.string().optional(), message: z.string().optional(), deleteBranch: z.boolean().optional() }),
  z.strictObject({ type: z.literal('closePullRequest'), ...Actor, repo: RepoId, number: z.number().int() }),
  z.strictObject({ type: z.literal('reopenPullRequest'), ...Actor, repo: RepoId, number: z.number().int() }),
]);

// ---------------------------------------------------------------------------
// Scripted teammates
// ---------------------------------------------------------------------------

export const TeammateActionSchema = z.discriminatedUnion('type', [
  /** Commit straight onto a hosted branch as a teammate (as if they pushed from their laptop). */
  z.strictObject({
    type: z.literal('push'),
    actor: z.string(),
    repo: RepoId,
    branch: z.string(),
    /** Create `branch` from this branch first if it does not exist. */
    from: z.string().optional(),
    message: z.string(),
    /** path -> new content, or null to delete. */
    files: z.record(z.string(), z.string().nullable()),
  }),
  z.strictObject({ type: z.literal('hub'), action: HubActionSchema }),
  z.strictObject({ type: z.literal('say'), speaker: SpeakerSchema, text: z.string() }),
  /** Run a shell line on another machine (e.g. Sam's laptop). */
  z.strictObject({ type: z.literal('run'), machine: z.string(), line: z.string() }),
]);

export const TeammateTriggerSchema = z.discriminatedUnion('on', [
  z.strictObject({ on: z.literal('start') }),
  z.strictObject({
    on: z.literal('event'),
    /** A GameEvent `type`, e.g. "transfer.push", "hub.pr.open". */
    event: z.string(),
    /** Fire on the nth matching event (default 1). */
    count: z.number().int().min(1).optional(),
    /** Shallow match on top-level event fields, e.g. {"remote": "origin"}. */
    where: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
  }),
  /** When goal item #index (0-based) first becomes done. */
  z.strictObject({ on: z.literal('goal'), item: z.number().int().min(0) }),
  /** After this many state-changing commands. */
  z.strictObject({ on: z.literal('commands'), count: z.number().int().min(1) }),
]);

export const TeammateScriptSchema = z.strictObject({
  id: z.string(),
  when: TeammateTriggerSchema,
  actions: z.array(TeammateActionSchema).min(1),
});

// ---------------------------------------------------------------------------
// Goal checks (state-based; never inspect the exact commands typed)
// ---------------------------------------------------------------------------

const BaseCheckSchema = z.discriminatedUnion('type', [
  // --- files and shell ---
  z.strictObject({ type: z.literal('cwd'), path: z.string(), machine: z.string().optional() }),
  z.strictObject({ type: z.literal('dirExists'), path: z.string(), machine: z.string().optional() }),
  z.strictObject({ type: z.literal('dirMissing'), path: z.string(), machine: z.string().optional() }),
  z.strictObject({ type: z.literal('fileExists'), path: z.string(), machine: z.string().optional() }),
  z.strictObject({ type: z.literal('fileMissing'), path: z.string(), machine: z.string().optional() }),
  z.strictObject({ type: z.literal('fileContent'), path: z.string(), machine: z.string().optional(), ...ContentMatcherSchema.shape }),
  // --- local repository ---
  z.strictObject({ type: z.literal('repoExists'), ...RepoSel }),
  z.strictObject({ type: z.literal('repoMissing'), ...RepoSel }),
  z.strictObject({ type: z.literal('configValue'), key: z.string(), scope: z.enum(['global', 'local', 'any']).optional(), equals: z.string().optional(), matches: z.string().optional(), exists: z.boolean().optional(), ...RepoSel }),
  /** Index differs from HEAD for path (new, modified or deleted in the staging area). Optional content check on the staged version. */
  z.strictObject({ type: z.literal('staged'), path: z.string(), content: ContentMatcherSchema.optional(), ...RepoSel }),
  /** Index equals HEAD for path. */
  z.strictObject({ type: z.literal('notStaged'), path: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('tracked'), path: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('untracked'), path: z.string(), ...RepoSel }),
  /** Work tree differs from index for a tracked path. */
  z.strictObject({ type: z.literal('modified'), path: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('unmodified'), path: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('ignored'), path: z.string(), ...RepoSel }),
  /** Nothing staged, nothing modified, no conflicts. Untracked files fail unless allowUntracked. */
  z.strictObject({ type: z.literal('clean'), allowUntracked: z.boolean().optional(), ...RepoSel }),
  z.strictObject({ type: z.literal('commitCount'), ref: z.string().optional(), ...Count.shape, ...RepoSel }),
  /** The commit at `ref` (default HEAD) satisfies every given condition. */
  z.strictObject({
    type: z.literal('commit'),
    ref: z.string().optional(),
    ...MessageMatch,
    parents: z.number().int().optional(),
    /** Paths changed relative to the first parent must include these. */
    changes: z.array(z.string()).optional(),
    /** Paths changed relative to the first parent must be exactly these. */
    changesExactly: z.array(z.string()).optional(),
    authorName: z.string().optional(),
    ...RepoSel,
  }),
  /** Some commit reachable from `on` (default HEAD; "--all" = any ref) matches. `count` constrains how many match. */
  z.strictObject({
    type: z.literal('commitExists'),
    on: z.string().optional(),
    ...MessageMatch,
    parents: z.number().int().optional(),
    changes: z.array(z.string()).optional(),
    changesExactly: z.array(z.string()).optional(),
    count: Count.optional(),
    ...RepoSel,
  }),
  z.strictObject({ type: z.literal('noCommitMatching'), on: z.string().optional(), ...MessageMatch, ...RepoSel }),
  /** File content inside the snapshot of `ref` (default HEAD). `absent: true` means the file is not in that snapshot. */
  z.strictObject({ type: z.literal('fileInCommit'), ref: z.string().optional(), path: z.string(), absent: z.boolean().optional(), ...ContentMatcherSchema.shape, ...RepoSel }),
  z.strictObject({ type: z.literal('branchExists'), name: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('branchMissing'), name: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('currentBranch'), name: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('detachedHead'), value: z.boolean(), ...RepoSel }),
  /** Two local revisions resolve to the same commit, e.g. "main" and "origin/main". */
  z.strictObject({ type: z.literal('refsEqual'), a: z.string(), b: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('refsDiffer'), a: z.string(), b: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('isAncestor'), ancestor: z.string(), descendant: z.string(), ...RepoSel }),
  z.strictObject({ type: z.literal('notAncestor'), ancestor: z.string(), descendant: z.string(), ...RepoSel }),
  /** No merge commits reachable from ref (default HEAD). */
  z.strictObject({ type: z.literal('linearHistory'), ref: z.string().optional(), ...RepoSel }),
  z.strictObject({ type: z.literal('noOperationInProgress'), ...RepoSel }),
  z.strictObject({ type: z.literal('operationInProgress'), operation: z.enum(['merge', 'revert']), ...RepoSel }),
  z.strictObject({ type: z.literal('conflicted'), path: z.string(), ...RepoSel }),
  /** No unmerged paths in the index. */
  z.strictObject({ type: z.literal('noConflicts'), ...RepoSel }),
  /** No "<<<<<<<", "=======", ">>>>>>>" marker lines in the given work tree files (default: all tracked files). */
  z.strictObject({ type: z.literal('noConflictMarkers'), paths: z.array(z.string()).optional(), ...RepoSel }),
  z.strictObject({ type: z.literal('stashCount'), ...Count.shape, ...RepoSel }),
  z.strictObject({ type: z.literal('remoteExists'), name: z.string(), url: z.string().optional(), urlMatches: z.string().optional(), ...RepoSel }),
  z.strictObject({ type: z.literal('remoteMissing'), name: z.string(), ...RepoSel }),
  /** branch.<branch>.remote / .merge are set. */
  z.strictObject({ type: z.literal('upstream'), branch: z.string(), remote: z.string(), remoteBranch: z.string().optional(), ...RepoSel }),
  // --- simulated GitHub ---
  z.strictObject({ type: z.literal('hostedRepoExists'), repo: RepoId, visibility: z.enum(['public', 'private']).optional() }),
  z.strictObject({
    type: z.literal('hostedBranch'),
    repo: RepoId,
    branch: z.string(),
    exists: z.boolean().optional(),
    /** Local revision (on the level's main machine/repo) the hosted branch must equal. */
    equalsLocal: z.string().optional(),
    /** A commit reachable from the hosted branch must match this message. */
    ...MessageMatch,
    ...RepoSel,
  }),
  z.strictObject({ type: z.literal('hostedFile'), repo: RepoId, branch: z.string().optional(), path: z.string(), absent: z.boolean().optional(), ...ContentMatcherSchema.shape }),
  z.strictObject({ type: z.literal('hostedCommitCount'), repo: RepoId, branch: z.string().optional(), ...Count.shape }),
  /** Local refs/remotes/<remote>/<branch> equals the hosted branch (the player fetched). */
  z.strictObject({ type: z.literal('trackingUpToDate'), remote: z.string(), branch: z.string(), ...RepoSel }),
  /** Local branch equals the hosted branch of its remote (pushed and pulled). */
  z.strictObject({ type: z.literal('inSync'), branch: z.string(), remote: z.string().optional(), remoteBranch: z.string().optional(), ...RepoSel }),
  z.strictObject({
    type: z.literal('issue'),
    repo: RepoId,
    number: z.number().int().optional(),
    titleContains: z.string().optional(),
    state: z.enum(['open', 'closed']).optional(),
    assignee: z.string().optional(),
    label: z.string().optional(),
    commentBy: z.string().optional(),
    referenced: z.boolean().optional(),
    count: Count.optional(),
  }),
  z.strictObject({
    type: z.literal('pullRequest'),
    repo: RepoId,
    number: z.number().int().optional(),
    head: z.string().optional(),
    base: z.string().optional(),
    titleContains: z.string().optional(),
    state: z.enum(['open', 'closed', 'merged']).optional(),
    approved: z.boolean().optional(),
    /** The author of the PR replied to at least one review comment or review. */
    repliedToReview: z.boolean().optional(),
    commentBy: z.string().optional(),
    /** Minimum number of commits on the head branch not in base. */
    minCommits: z.number().int().optional(),
    count: Count.optional(),
  }),
  // --- session (understanding checks) ---
  /** The question with this id was answered correctly. */
  z.strictObject({ type: z.literal('answered'), question: z.string() }),
  /** The player finished reading the story (clicked through to the end). */
  z.strictObject({ type: z.literal('storyRead') }),
  /**
   * The player ran this read-only command (program + optional subcommand, e.g. "pwd", "git log").
   * Only for commands that change nothing; state-changing goals must use state checks.
   */
  z.strictObject({ type: z.literal('ranCommand'), command: z.string(), times: z.number().int().min(1).optional() }),
]);

export const GoalCheckSchema = z.union([
  BaseCheckSchema,
  z.strictObject({ type: z.literal('not'), check: BaseCheckSchema }),
  z.strictObject({ type: z.literal('anyOf'), checks: z.array(BaseCheckSchema).min(1) }),
  z.strictObject({ type: z.literal('allOf'), checks: z.array(BaseCheckSchema).min(1) }),
]);

export const GoalItemSchema = z.strictObject({
  /** Checklist text shown to the player, e.g. "Commit only the menu page". */
  text: z.string().min(1),
  /** All checks must pass for the item to be ticked. */
  checks: z.array(GoalCheckSchema).min(1),
});

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

export const MachineSetupSchema = z.strictObject({
  id: z.string(),
  label: z.string().optional(),
  user: z.string().optional(),
  host: z.string().optional(),
  home: z.string().optional(),
  cwd: z.string().optional(),
  globalConfig: z.record(z.string(), z.string()).optional(),
  /** Preset user.name / user.email from the player profile (default true). */
  identity: z.boolean().optional(),
});

export const HostedRepoSetupSchema = z.strictObject({
  /** "owner/name". */
  id: RepoId,
  description: z.string().optional(),
  visibility: z.enum(['public', 'private']).optional(),
  defaultBranch: z.string().optional(),
  /** Copy every branch of this local repo to the hosted repo and add it as `remoteName` (default "origin"). */
  fromLocal: z.strictObject({ machine: z.string().optional(), repoPath: z.string().optional(), remoteName: z.string().optional(), setUpstream: z.boolean().optional() }).optional(),
  /** Seed files for an otherwise empty repo: one initial commit on the default branch. */
  initialFiles: z.record(z.string(), z.string()).optional(),
  initialMessage: z.string().optional(),
  initialAuthor: z.string().optional(),
  collaborators: z.array(z.string()).optional(),
  labels: z.array(z.strictObject({ name: z.string(), color: z.string(), description: z.string().optional() })).optional(),
});

export const SetupStepSchema = z.union([
  /** Run a shell line (git or shell builtins). Setup fails if it exits non-zero unless expectFail. */
  z.strictObject({ run: z.string(), machine: z.string().optional(), expectFail: z.boolean().optional() }),
  /** Write files (paths relative to the machine's current directory unless absolute or ~). Parent folders are created. */
  z.strictObject({ files: z.record(z.string(), z.string()), machine: z.string().optional() }),
  z.strictObject({ delete: z.array(z.string()), machine: z.string().optional() }),
  z.strictObject({ mkdir: z.array(z.string()), machine: z.string().optional() }),
  /**
   * Shorthand: write/delete files, `git add -A`, then `git commit -m message`
   * (with --author when author is given, e.g. "Sam Lee <sam@lanternlabs.example>").
   */
  z.strictObject({
    commit: z.strictObject({
      message: z.string(),
      files: z.record(z.string(), z.string().nullable()).optional(),
      author: z.string().optional(),
    }),
    machine: z.string().optional(),
  }),
  z.strictObject({ hosted: HostedRepoSetupSchema }),
  z.strictObject({ teammate: TeammateActionSchema }),
  z.strictObject({ hub: HubActionSchema }),
  z.strictObject({ machineAdd: MachineSetupSchema }),
  z.strictObject({ switchMachine: z.string() }),
  z.strictObject({ advanceClock: z.number().int().min(0) }),
]);

export const LevelSetupSchema = z.strictObject({
  /** Main machine options; id is always "laptop". */
  machine: MachineSetupSchema.omit({ id: true }).optional(),
  hub: z
    .strictObject({
      users: z.array(z.strictObject({ login: z.string(), name: z.string(), color: z.string().optional(), bot: z.boolean().optional() })).optional(),
    })
    .optional(),
  /** Unix seconds for the simulated clock at the start of setup. */
  clock: z.number().int().optional(),
  steps: z.array(SetupStepSchema),
  /** Directory the terminal starts in after setup (default: `workdir`). */
  cwd: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Reference solution
// ---------------------------------------------------------------------------

export const SolutionStepSchema = z.union([
  /** Type a line into the terminal and press Enter. */
  z.strictObject({ run: z.string() }),
  /** Open a file in the editor panel, replace its content, save. Creates the file if missing. */
  z.strictObject({ edit: z.strictObject({ path: z.string(), content: z.string() }) }),
  /** Respond to an editor that git opened (commit message, merge message...). */
  z.strictObject({ editor: z.strictObject({ action: z.enum(['save', 'abort']), content: z.string().optional() }) }),
  /** Do something on the simulated GitHub panel. */
  z.strictObject({ hub: HubActionSchema }),
  /** Answer a question in the mission panel. */
  z.strictObject({ answer: z.strictObject({ question: z.string(), choice: z.number().int().min(0) }) }),
  /** Click through the story to the end. */
  z.strictObject({ story: z.literal('read') }),
  z.strictObject({ switchMachine: z.string() }),
]);

// ---------------------------------------------------------------------------
// UI options
// ---------------------------------------------------------------------------

export const LevelUiSchema = z.strictObject({
  panels: z
    .strictObject({
      /** The three boxes + graph (default: true once a repo exists or from chapter 1). */
      world: z.boolean().optional(),
      /** Files + editor panel (default true). */
      editor: z.boolean().optional(),
      /** The simulated GitHub website panel (default: chapter >= 6). */
      hub: z.boolean().optional(),
      /** The fourth box: the remote repository graph (default: chapter >= 6). */
      remote: z.boolean().optional(),
    })
    .optional(),
  /** Initial hub page, e.g. "lantern-labs/festival-site/pulls". */
  hubPage: z.string().optional(),
  /** Stage-2 scaffolding: buttons that type a command for the player. */
  actionButtons: z.array(z.strictObject({ label: z.string(), command: z.string() })).optional(),
  /** Plain terminal only (chapter 11 "leaving the simulator"). */
  terminalOnly: z.boolean().optional(),
  /** Slow, labelled animations (the "watch" stage). */
  slowAnimations: z.boolean().optional(),
  /** Which panel gets keyboard focus first. */
  focus: z.enum(['terminal', 'hub', 'editor', 'mission']).optional(),
});

// ---------------------------------------------------------------------------
// Level
// ---------------------------------------------------------------------------

export const LevelSchema = z.strictObject({
  $schema: z.string().optional(),
  /** "<chapter>.<number>", e.g. "2.5". Must match content/chapters.json. */
  id: z.string().regex(/^[0-8]\.[1-9]$/),
  chapter: z.number().int().min(0).max(8),
  number: z.number().int().min(1),
  title: z.string().min(1),
  /** The one new idea this level teaches, in a few words. */
  concept: z.string().min(1),
  boss: z.boolean().optional(),
  /** Short story beats shown in the mission panel (under 30 seconds of reading). */
  story: z.array(DialogueLineSchema).min(1),
  /** Main folder of the level; relative paths resolve here. Default "~". */
  workdir: z.string().optional(),
  setup: LevelSetupSchema,
  /** Ada's demonstration (the "watch" stage): lines typed and animated before the player acts. Not counted for par. */
  demo: z.strictObject({ lines: z.array(z.string()).min(1), captions: z.array(z.string()).optional() }).optional(),
  goal: z.strictObject({ items: z.array(GoalItemSchema).min(1) }),
  /** State-changing commands in a 3-star solution; null when the level has no command goal. */
  par: z.number().int().min(0).nullable(),
  /** Command prefixes allowed in this level (e.g. "git status", "ls"); null allows everything. */
  allowedCommands: z.array(z.string()).nullable(),
  /** 1) a nudge, 2) the concept, 3) the exact command. */
  hints: z.tuple([z.string().min(1), z.string().min(1), z.string().min(1)]),
  predict: PredictCardSchema.nullable(),
  questions: z.array(QuestionSchema).optional(),
  /** One-line recap shown on the win screen and added to the glossary. */
  recap: z.string().min(1),
  /** Glossary term ids (content/glossary/*.json) unlocked by this level. */
  glossary: z.array(z.string()).optional(),
  /** Entries added to the command cheat card when the level is completed. */
  cheatSheet: z.array(z.strictObject({ command: z.string(), summary: z.string() })).optional(),
  teammates: z.array(TeammateScriptSchema).optional(),
  /** Lines shown after the goal is reached. */
  success: z.array(DialogueLineSchema).optional(),
  ui: LevelUiSchema.optional(),
  /** Reference solution: must reach every goal within par with no hints. */
  solution: z.array(SolutionStepSchema).min(1),
});

export type Speaker = z.infer<typeof SpeakerSchema>;
export type DialogueLine = z.infer<typeof DialogueLineSchema>;
export type ContentMatcher = z.infer<typeof ContentMatcherSchema>;
export type Picture = z.infer<typeof PictureSchema>;
export type Choice = z.infer<typeof ChoiceSchema>;
export type PredictCard = z.infer<typeof PredictCardSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type HubAction = z.infer<typeof HubActionSchema>;
export type HubActionType = HubAction['type'];
export type TeammateAction = z.infer<typeof TeammateActionSchema>;
export type TeammateTrigger = z.infer<typeof TeammateTriggerSchema>;
export type TeammateScript = z.infer<typeof TeammateScriptSchema>;
export type GoalCheck = z.infer<typeof GoalCheckSchema>;
export type BaseGoalCheck = z.infer<typeof BaseCheckSchema>;
export type GoalItem = z.infer<typeof GoalItemSchema>;
export type MachineSetup = z.infer<typeof MachineSetupSchema>;
export type HostedRepoSetup = z.infer<typeof HostedRepoSetupSchema>;
export type SetupStep = z.infer<typeof SetupStepSchema>;
export type LevelSetup = z.infer<typeof LevelSetupSchema>;
export type SolutionStep = z.infer<typeof SolutionStepSchema>;
export type LevelUi = z.infer<typeof LevelUiSchema>;
export type LevelDefinition = z.infer<typeof LevelSchema>;

// ---------------------------------------------------------------------------
// Chapters index (content/chapters.json) and glossary (content/glossary/*.json)
// ---------------------------------------------------------------------------

export const ChaptersFileSchema = z.strictObject({
  $schema: z.string().optional(),
  chapters: z.array(
    z.strictObject({
      number: z.number().int().min(0).max(8),
      title: z.string(),
      stage: z.enum(['laptop', 'github', 'graduation']),
      summary: z.string(),
      levels: z.array(z.strictObject({ id: z.string(), title: z.string(), concept: z.string(), boss: z.boolean().optional() })),
    }),
  ),
});

export const GlossaryFileSchema = z.array(
  z.strictObject({
    id: z.string().regex(/^[a-z0-9-]+$/),
    term: z.string(),
    definition: z.string(),
    chapter: z.number().int().min(0).max(8),
    command: z.string().optional(),
    related: z.array(z.string()).optional(),
  }),
);

export type ChaptersFile = z.infer<typeof ChaptersFileSchema>;
export type ChapterInfo = ChaptersFile['chapters'][number];
export type GlossaryEntry = z.infer<typeof GlossaryFileSchema>[number];
