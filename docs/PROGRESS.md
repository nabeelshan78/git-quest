# Progress

Resuming? Read this file, then `docs/ARCHITECTURE.md`. Do not restart
finished work. Each workstream works on its own branch (`ws/<name>`) and
is merged into `main` when its tests pass.

## Status

| # | Workstream | Branch | Status | Notes |
| --- | --- | --- | --- | --- |
| 0 | Foundation (orchestrator) | main | done | scaffold, contracts, core data layer, harness, CI |
| 1 | Engine A | ws/engine-a | in progress | batch 1 |
| 2 | Engine B | ws/engine-b | not started | after Engine A |
| 3 | Remote | ws/remote | not started | after Engine A |
| 4 | Parser | ws/parser | in progress | batch 1 (relaunched twice: content-filter error, then usage limit) |
| 5 | UI | ws/ui | in progress | batch 1 |
| 6 | Mock GitHub | ws/hub | not started | after Engine A |
| 7 | Level runner | ws/levels | not started | after Engine A + Parser |
| 8a | Content ch 0–3 | ws/content-0-3 | not started | after runner |
| 8b | Content ch 4–7 | ws/content-4-7 | not started | after runner |
| 8c | Content ch 8–11 | ws/content-8-11 | not started | after runner |
| 9 | Classroom | ws/classroom | in progress | batch 1; store, aggregation, CSV, dashboard committed |
| 10 | QA (e2e) | ws/qa | not started | after UI + content |
| 11 | Beginner review | — | not started | after everything |

## Batches (2–4 subagents in parallel)

1. Engine A, Parser, UI, Classroom
2. Engine B, Remote, Mock GitHub, Level runner
3. Content 0–3, Content 4–7, Content 8–11
4. QA, integration fixes
5. Beginner playthrough review → fixes → second review

## Log

- Foundation: Vite + React + TS strict, ESLint, Vitest, Playwright,
  GitHub Pages workflow; contracts in `src/shared`; engine core (SHA-1,
  objects, trees, refs, reflog, fs, repo discovery) with hash tests
  against real git; dispatcher; differential harness; level schema +
  `content/chapters.json` (91 levels).
- Batch 1 started (Engine A, Parser, UI, Classroom). All four were stopped
  by an API usage limit and resumed after it reset. Agents now commit
  often so work survives interruptions.
- Added `docs/CONTENT_GUIDE.md` and the `startRebase` hook
  (`src/engine/b/rebase.ts`) for Remote's `pull --rebase`.
