# Git Quest — architecture, contracts and ownership

Read this before working on any workstream. `docs/SPEC.md` is the product
spec; `CLAUDE.md` holds the rules. This file explains how the code fits
together and who owns what.

## Layers

```
            src/ui (React)  ── src/ui/hub (simulated GitHub website)
                 │  renders SessionSnapshot, calls GameSession methods
                 ▼
            src/levels  (level runner: createSession, goal checks, hints,
                 │        stars, predict cards, error translator, daily)
                 ▼
            src/parser  (runLine: shell builtins, quoting, &&, >, git dispatch,
                 │       allowed-command lists, completion, help, typos)
                 ▼
   src/engine/dispatch.ts ── routes `git <cmd>` to handlers:
        src/engine/a/*   (Engine A)     src/engine/b/*  (Engine B)
        src/remote/*     (Remote: remote, clone, fetch, pull, push)
                 ▼
   src/engine/core  (git data model: objects, trees, refs, reflog, fs, repo discovery)
   src/hub          (simulated GitHub state logic: issues, PRs, reviews, merges, Actions, Pages)
   src/shared       (FROZEN contracts: types, events, results, level schema, progress, session API)
   src/classroom    (progress store, export/import, Professor Dashboard)
```

Everything except `src/ui`, `src/classroom` and `src/main.tsx` is **pure
TypeScript**: no React, no DOM, no `window`, `document`, `localStorage`,
`fetch`. `tsconfig.core.json` has no DOM lib and ESLint forbids those
globals there.

## The World

All simulated state is one immutable, JSON-serialisable `World`
(`src/shared/types.ts`):

- `machines` — laptops. Each has a filesystem (`fs.files` path → text,
  `fs.dirs`), `cwd`, `home`, `globalConfig` (~/.gitconfig as flat keys),
  `repos` (work tree root → `RepoState`), a pending `editor`, shell
  `history`, `ssh` keys.
- `RepoState` — real git data: `objects` (blob/tree/commit/tag, hashed
  exactly like git), `refs` (full names), `symrefs`, `head`, `reflog`,
  `index` (stage-0 `entries` + unmerged `conflicts`), `config`, `special`
  (MERGE_HEAD, ORIG_HEAD...), `rebase`, `sequencer`, `bisect`.
  The `.git` folder is represented by `fs.dirs[root + '/.git']` only; its
  contents live in `RepoState`, never in `fs.files`.
- `hosted` — repositories on the simulated GitHub (`HostedRepo` with a
  bare `RepoState`, issues, pulls, releases, protection, workflows, runs,
  pages).
- `hub` — viewer login, users, SSH keys, tokens, notifications.
- `clock` — unix seconds; every timestamp git writes uses `world.clock`.
  The dispatcher advances it by `CLOCK_STEP` (60 s) after every git command.

Commands are pure: `(world, ...) => CommandResult` where
`CommandResult = { state, events, output, exitCode, executed? }`
(`src/shared/result.ts`). Use immer's `produce` to build the new state.
Immer freezes results, so accidental mutation throws.

### Events

`src/shared/events.ts` lists every event. Emit them in order. The UI must
render correctly from `World` alone; events only drive animations (file
glides into staging, branch label slides, commit appears, push arrow...).

### Output

`output` lines are git's exact wording (stdout vs stderr as real git does,
e.g. `Switched to branch 'x'` goes to stderr). The plain-English line is
added separately by the error translator in `src/levels`.

## Contracts (frozen — only the orchestrator changes them)

| File | What |
| --- | --- |
| `src/shared/types.ts` | World, Machine, RepoState, HostedRepo, HubState, StatusSummary... |
| `src/shared/events.ts` | `GameEvent` union |
| `src/shared/result.ts` | `CommandResult`, `OutputLine`, helpers `ok/fail/fatal/stdout/stderr` |
| `src/shared/level.ts` | zod schema of level files → `content/level.schema.json` (`npm run schema`) |
| `src/shared/progress.ts` | progress file format, `LevelResult`, `ProgressApi` |
| `src/shared/session.ts` | `GameSession`, `SessionSnapshot`, `SessionOptions` (UI ↔ level runner) |
| `src/shared/constants.ts` | ids, default paths, URLs, colours |
| `src/shared/commandSpecs.ts` | every git subcommand's options (owners may ADD options to their own entries) |
| `src/shared/args.ts` | git-style option parsing → `ParsedArgs` |
| `src/shared/testids.ts` | `data-testid` values (UI and Hub may ADD ids) |
| `src/engine/types.ts` | `GitHandler`, `GitContext`, `CommandTable`, `EditorResumeHandler` |
| `src/engine/dispatch.ts` | dispatcher (global options, aliases, parse, route, clock, editor resume) |

If you need a contract change, do not edit the file: describe the change in
your final report (and work around it locally if you can). The
orchestrator applies it across all modules.

## Ownership

Each workstream edits **only** its own paths. Tests live next to code
(`*.test.ts`) in the owner's folder, plus the test folders listed.

| Workstream | Owns | Public API (keep these exports and signatures) |
| --- | --- | --- |
| Engine A | `src/engine/core/**` (may add helpers), `src/engine/a/**`, `tests/diff/harness.ts`, `tests/diff/a/**` | `commandsA`, `editorHandlersA` (a/index.ts); `computeStatus(world, machineId, root?)` (a/status.ts); revision parsing, diff, 3-way merge helpers for B and Remote |
| Engine B | `src/engine/b/**`, `tests/diff/b/**` | `commandsB`, `editorHandlersB` (b/index.ts); `amendCommit` (b/amend.ts) |
| Remote | `src/remote/**`, `tests/diff/remote/**` (may extend the harness additively) | `remoteCommands` (remote/commands.ts); `setupHostedRepo`, `applyTeammatePush`, `hostedRepoForUrl` (remote/index.ts) |
| Parser | `src/parser/**` | `runLine`, `completeLine`, `tokenize` + help, typo suggestions, shell builtins |
| UI | `src/ui/**` except `src/ui/hub/**`, `src/main.tsx`, `src/i18n/**`, `index.html`, `public/**` | the app |
| Mock GitHub | `src/hub/**`, `src/ui/hub/**` | `applyHubAction`, `reactToEvents` (hub/index.ts); `HubPanel` (ui/hub/index.tsx) |
| Level runner | `src/levels/**` (except `content.ts` which is shared), `content/dialogue/errors.json`, `tests/levels/**` (except schema.test.ts) | `createSession`, goal evaluation, `translateError`, stars, daily practice, headless `playSolution` |
| Content 0–3 / 4–7 / 8–11 | `content/levels/chNN/**` and `content/glossary/chNN.json` for their chapters | level JSON files |
| Classroom | `src/classroom/**`, `docs/PROFESSOR_GUIDE.md` | `createProgressStore`, `ProfessorDashboard`, aggregation + CSV |
| QA | `tests/e2e/**` | Playwright specs |

Files marked `@stub-owner <workstream>` are placeholders written in the
foundation step. The owner replaces them completely (and removes the
marker). No stubs may remain in the final build.

## Import rules

- `src/engine/a`, `src/engine/b` and `src/remote` must import from
  `src/engine/core/...` and sibling files, **never** from
  `src/engine/index.ts` or `src/engine/dispatch.ts` (import cycle).
- Engine B may import Engine A modules (e.g. `../a/merge`).
- Remote may import Engine A/B modules (e.g. merge for `pull`, rebase for
  `pull --rebase`).
- `src/hub` may import engine core and Engine A/B modules (PR merges use
  the same merge machinery).
- `src/levels` imports from `src/engine` (index), `src/parser`,
  `src/remote` (index), `src/hub` (index).
- `src/ui` imports `src/levels`, `src/classroom`, `src/shared`, and read-only
  helpers from `src/engine` (e.g. `computeStatus`, object readers).

## Git behaviour rules

- Default branch `main`; `init.defaultBranch` honoured.
- Teach `switch`/`restore`; support `checkout` fully too.
- Messages, advice hints and exit codes match real git 2.5x
  (`status` hints, `commit` summary line, detached HEAD advice, etc.).
- Commands that open an editor in real git (`commit` without `-m`,
  `merge` committing after conflicts with no `-m`, `revert` without
  `--no-edit`, `rebase -i`, reword/squash) set `machine.editor` to an
  `EditorRequest` and return; `resumeEditor(world, machine, text|null)`
  continues via the handler named in `request.resume.handler`.
  A plain `git merge` that creates a merge commit does NOT open an editor
  (as with `GIT_MERGE_AUTOEDIT=no`).
- `git pull` with divergent branches and no `pull.rebase`/`pull.ff`
  config fails exactly like real git ("fatal: Need to specify how to
  reconcile divergent branches."). Levels set `pull.rebase=false` in
  setup where needed.
- Simulated remote URLs look real: `https://github.com/owner/name.git`
  and `git@github.com:owner/name.git` (`parseHubUrl` in constants).

## Differential tests

`tests/diff/harness.ts` runs a scenario in real git (temp folder, fixed
identity `Test User <test@example.com>`, `GIT_AUTHOR_DATE` /
`GIT_COMMITTER_DATE` = the engine clock before each command, isolated
`HOME` and global config) and in the engine, then compares refs (hashes
must match exactly), HEAD, index (incl. conflict stages), working files,
in-progress operations and optionally output text, reflog, ORIG_HEAD and
config keys.

```ts
import { runScenario } from '../harness';
it('merge with conflict', () => {
  const r = runScenario({ name: 'conflict', steps: [
    { git: ['init'] }, { write: { 'a.txt': 'one\n' } }, { git: ['add', '.'] },
    { git: ['commit', '-m', 'first'], output: true },
  ]});
  expect(r.mismatches).toEqual([]);
});
```

Hosted repos: `{ hosted: 'owner/name' }` creates an empty bare repo
reachable at `https://github.com/owner/name.git` on both sides (real git
uses `url.<file://...>.insteadOf`).

Run: `npm run test:diff` (all) or `npx vitest run tests/diff/a`.

## Levels

Schema: `src/shared/level.ts` (read its comments). One file per level:
`content/levels/chNN/<id>.json`, e.g. `content/levels/ch02/2.5.json`. ids and
titles must match `content/chapters.json`. Validate with
`npx vitest run tests/levels`. Template strings `{{player.name}}`,
`{{player.email}}`, `{{player.handle}}` are substituted from the player's
profile.

Paths: setup `files` are relative to the machine's current directory;
fs goal checks and solution `edit` paths are relative to the level's
`workdir`; repo goal checks (`staged`, `tracked`...) take repo-relative
paths.

## Testing commands

| Command | What |
| --- | --- |
| `npm run typecheck` | all three tsconfigs |
| `npm run lint` | ESLint (purity rules for core folders) |
| `npm test` | Vitest: unit, differential, level validation + solutions |
| `npm run test:e2e` | Playwright (builds and serves the app) |
| `npm run build` | production build into `dist/` |

## URL parameters (UI)

- `#/` home / chapter map, `#/play/<levelId>`, `#/sandbox`, `#/daily`,
  `#/challenge/<levelId>`, `#/glossary`, `#/professor`, `#/settings`.
- `?test=1` — instant animations and demos, no first-launch dialog (a
  default profile "Test Player" / handle "tester" is used) — for Playwright.
