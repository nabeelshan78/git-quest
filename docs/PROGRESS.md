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
| 1 | Engine A | ws/engine-a | in progress | fresh agent: all 17 commands + differential tests |
| 2 | Engine B (stash, amend, reset, reflog) | ws/engine-b | not started | after Engine A |
| 3 | Remote (remote, clone, fetch, pull, push, teammates) | ws/remote | not started | after Engine A |
| 4 | Parser | ws/parser | in progress | fresh agent: shell commands, tokenizer, completion |
| 5 | UI | ws/ui | in progress | fresh agent: React components, xterm.js, all screens |
| 6 | Mock GitHub (repo, issues, PRs, reviews, merge buttons) | ws/hub | not started | after Engine A |
| 7 | Level runner | ws/levels | not started | after Engine A + Parser |
| 8a | Content ch 0–4 (32 levels) | ws/content-0-4 | not started | after runner |
| 8b | Content ch 5–8 (26 levels) | ws/content-5-8 | not started | after runner |
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
