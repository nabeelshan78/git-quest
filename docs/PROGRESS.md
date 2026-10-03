# Progress

Resuming? Read this file, then `docs/SCOPE.md` (scope source of truth),
then `docs/ARCHITECTURE.md`. Do not restart finished work. Each
workstream works on its own branch (`ws/<name>`) in a worktree under
`.claude/worktrees/` and is merged into `main` when its tests pass.

## Scope

**Reduced scope (docs/SCOPE.md):** 9 chapters, 58 levels. Removed:
rebase (incl. interactive), cherry-pick, bisect, blame, tag,
force-with-lease and force push, forks/upstream, the open-source chapter,
GitHub Actions and Pages, protected branches, daily practice, challenge
levels, i18n (one plain English strings file instead), extra themes
(light + dark only), the full Professor Dashboard page (kept only if the
committed code works; not extended).

## Status

| # | Workstream | Branch | Status | Notes |
| --- | --- | --- | --- | --- |
| 0 | Foundation (orchestrator) | main | done | scaffold, contracts, core data layer, harness, CI |
| 0b | Scope cut (orchestrator) | main | done | contracts, chapters.json (58 levels), strings file, docs |
| 1 | Engine A | ws/engine-a | **done** | merged to main (50 diff tests, 16 commands) |
| 2 | Engine B (stash, amend, reset, reflog) | ws/engine-b | **done** | merged (22 diff tests, 4 commands) |
| 3 | Remote (remote, clone, fetch, pull, push, teammates) | ws/remote | **done** | merged to main (13 tests, 5 commands) |
| 4 | Parser | ws/parser | **done** | merged to main (66 tests) |
| 5 | UI | ws/ui | **done** | merged to main (50 files, 8033 lines) |
| 6 | Mock GitHub (repo, issues, PRs, reviews, merge buttons) | ws/hub-levels | **done** | merged (hub actions, PR merge, reactToEvents) |
| 7 | Level runner | ws/hub-levels | **done** | merged (session, setup, goals, errors, scoring, playSolution) |
| 8a | Content ch 0–4 (32 levels) | ws/content-0-4 | **done** | merged |
| 8b | Content ch 5–8 (26 levels) | ws/content-5-8 | **done** | merged |
| 9 | Classroom (progress save, export JSON/CSV, short guide) | ws/classroom | **done** | merged to main (120 tests) |
| 10 | QA (e2e per level) | ws/qa | not started | after UI + content |
| 11 | Beginner review | — | not started | after everything |

## Batches (2–4 subagents in parallel)

1. Engine A, Parser, UI, Classroom (resume)
2. Engine B, Remote, Mock GitHub, Level runner
3. Content 0–4, Content 5–8
4. QA, integration fixes
5. Beginner playthrough review → fixes → second review

## Log

- Foundation: Vite + React + TS strict, ESLint, Vitest, Playwright,
  GitHub Pages workflow; contracts in `src/shared`; engine core (SHA-1,
  objects, trees, refs, reflog, fs, repo discovery) with hash tests
  against real git; dispatcher; differential harness; level schema +
  `content/chapters.json`.
- Batch 1 started (Engine A, Parser, UI, Classroom). All four were stopped
  by an API usage limit and resumed after it reset. Agents now commit
  often so work survives interruptions.
- Added `docs/CONTENT_GUIDE.md`.
- Scope cut to 9 chapters / 58 levels (`docs/SCOPE.md`); all agents
  paused by the user; contracts being reduced before resuming.
- Reduced contracts committed. Stopped agents' unfinished work was saved
  as WIP commits on their branches; fresh agents continue on those
  branches (Engine A, UI, Classroom) and Parser restarted.
- Scope correction (docs/SCOPE.md, second section): 6.7 is a concept
  level (sign-in is automatic; no SSH/tokens/auth), one "Merge pull
  request" button, 8.3 = `git reset --soft HEAD~1` only, 8.4 = one simple
  reflog rescue, minimal simulated GitHub. Contracts updated: no SSH keys,
  tokens, requireAuth or merge-settings; `MergeMethod` is 'merge' only.
- Classroom merged to main (120 tests, progress store, CSV export,
  professor guide). Old worktrees cleaned up.
- Batch 1 relaunched: Engine A (17 commands), Parser (shell + tokenizer),
  UI (React components) — all three running in parallel.
- Parser merged (66 tests). Engine A merged (50 differential tests, 16
  commands). 243 total tests on main.
- Batch 2 launched: Engine B, Remote, Mock GitHub, Level runner. UI still
  running from batch 1.
- All 5 agents hit rate limit (6:50pm reset). UI merged (8033 lines, 50
  files). Engine B/Remote/Hub/Levels had no commits (still reading).
- UI merged to main (282 tests, 24 files). Batch 2 relaunched: Engine B,
  Remote, Hub+Levels (combined). 3 agents running.
- Engine B merged (stash, amend, reset, reflog). Parser updated with &&/||
  chaining. All 58 level JSON files committed.
- Deep audit pass (2026-10-01):
  - Fixed session.ts: switchMachine event stale ID, predict card mutation,
    hints bounds check, predictUsed flag on restart, transcript/dialogue
    snapshot shallow copies.
  - Fixed goals.ts: resolveCheckPath using levelWorkdir instead of
    machine.cwd (goals were unchecking when player navigated).
  - Fixed engine lint breakages: hashBlob import restored in b/commands.ts,
    dryRunMv variable fixed in a/commands.ts, removed dead _headFlat.
  - Fixed all placeholder hints (27 levels had generic text, all replaced
    with proper 3-tier hints).
  - Added progress export/import with confirmation dialog to HomeScreen and
    SettingsScreen. Import replaces all progress after user confirms.
  - Fixed HomeScreen: per-level star display, ChapterCard progress prop bug.
  - Updated README with full instructions.
  - Fixed all 19 strict typecheck errors (unused vars, missing imports,
    readonly tuple casts, window cast, PlayerProfile unused import).
- Curriculum rebuild (2026-10-02). Audit found the engine was far ahead of
  the content: 24/58 levels were pure quizzes, students typed 79 commands in
  the whole game, and Chapters 6-7 (the GitHub half) required none because
  the hub panel was an 18-line stub. Nine in-scope commands were never typed.
  - Built the simulated site (`src/ui/hub/`): repo page with branch picker,
    file list and README; issues with comments; pull requests with a real
    computed diff, line-anchored review threads, replies, merge and branch
    delete. Generic "CodeHub" branding; a test asserts no GitHub/Octocat text.
  - Rewrote Chapters 6 and 7 (15 levels) as hands-on: remote add, push -u,
    clone to a second machine, fetch vs pull, a genuinely rejected push,
    issues, pull requests, review replies, merge, tidy-up, and a PR conflict.
  - Rewrote 2.1, 2.3, 5.1, 5.2, 8.3, 8.4, 8.5, 8.6 and extended 4.2.
  - Wired the `teammates` scripting system into the runner (it existed in the
    schema but no level could use it): start/commands/goal/event triggers.
  - Implemented `<ref>@{n}` revisions in the engine core + 3 differential
    tests against real git; needed by the reflog rescue level.
  - Added classmate repo bundles (`src/classroom/bundle.ts`) and the
    `team-up` sandbox preset with a fixed-identity shared base so two
    students' histories can actually merge. Async and backend-free.
  - Sandbox now runs the real engine instead of the development mock.
  - Fixed: levels rendered under the profile dialog with an empty
    `user.name`, so every setup commit failed silently in the browser.
  - Fixed: `fnv1a32` no longer needs `TextEncoder` (core has no DOM lib);
    verified byte-identical on 20k random strings incl. lone surrogates.
  - Fixed ch0 levels 0.3/0.4: same `workdir` + `mkdir`/`cd` double-nesting
    bug as ch4, and 0.3/0.5 now use `touch` as their story says.
  - Fixed the e2e runner, which had never actually passed: its exit code was
    being masked by a pipe. It used a CodeMirror selector for what is a plain
    textarea (so every `edit` level failed), never dismissed predict cards,
    and did not stop once a level was already won.
  - Result: 2/58 quiz-only levels, 152 commands typed, all 24 in-scope git
    commands and all 7 shell commands exercised.
    431 unit + 89 differential tests pass; full Playwright suite green.
  - Fixed infinite loop in findRepo when machine.cwd was not absolute
    (caused all ch1 tests to hang). Root cause: createMachine did not
    resolve ~ in cwd option; dirname of relative path never reaches /.
  - Fixed ch4 levels (4.1–4.7): removed broken machine.cwd + cd nesting
    pattern, using ~/festival workdir instead.
  - All 58 level solutions now pass. All typecheck, lint, and unit tests pass.
