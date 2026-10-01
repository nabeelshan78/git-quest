# Mission
You are the lead engineer and orchestrator building Git Quest, a browser
game that teaches git and GitHub to complete beginners. docs/SPEC.md is
the source of truth. Read all of it first.

Build the COMPLETE game in this run: all 9 chapters, all 58 levels in docs/SCOPE.md,
every feature in the spec. Work autonomously. Do not stop to ask for
approval. Keep going until the Final Definition of Done below is met.

# Priority
docs/SCOPE.md overrides docs/SPEC.md and this file on scope, level list and features.
If this file and docs/SPEC.md disagree, this file wins. In the spec,
the "Instructions for the AI coding agent", "Starter CLAUDE.md",
"Decisions to confirm" and "Next steps" sections are notes for humans:
ignore them. Level counts, curriculum and features come from the spec.

# Defaults for open decisions (do not ask, use these)
- Language: English, with all UI text in i18next files so it can be
  translated later.
- Story: the realistic Lantern Labs festival-website story in the spec.
- No backend. Progress is saved in the browser. Students can export a
  progress file; the Professor Dashboard page imports many progress
  files and shows a class table with CSV export.
- Target: desktop and laptop browsers (Chrome, Edge, Firefox, Safari).
- Record every other assumption in docs/DECISIONS.md and continue.

# Orchestration
## Step 1 - Foundation (you alone, before any subagent starts)
- Scaffold the Vite + React + TypeScript (strict) project, folder
  structure, lint, Vitest, Playwright and a GitHub Actions workflow that
  tests and deploys to GitHub Pages.
- Write the shared contracts in src/shared/: engine state types, the
  command result type { state, events }, every event type, the level
  JSON schema (content/level.schema.json) and the progress file format.
- Commit. These contracts are frozen: only you may change them later,
  and only by updating every affected module in the same change.

## Step 2 - Parallel workstreams (use subagents)
Start one subagent per workstream. Give each its own git branch or git
worktree. Each subagent owns only its folders and must not edit others.
1. Engine A (src/engine): init, config, status, add, commit, log, diff,
   restore, rm, mv, show, branch, switch, checkout, merge + conflicts,
   revert. Differential tests first.
2. Engine B (src/engine, separate files): reset, rebase, rebase -i,
   cherry-pick, stash, reflog, blame, bisect, tag, amend.
   Differential tests first.
3. Remote (src/remote): multiple repos, remote, clone, fetch, pull,
   push, force-with-lease, forks, upstream, scripted teammates.
4. Parser (src/parser): argument parsing, flags, --help, typo
   suggestions, allowed-command lists, simulated shell commands for
   Chapter 0 (pwd, ls, cd, mkdir, touch, cat, echo).
5. UI (src/ui): screen layout, xterm.js terminal, world view with the
   three boxes and animated commit graph, file editor, rewind, glossary,
   sandbox, settings, themes, accessibility.
6. Mock GitHub (src/ui/hub): repo page, issues, pull requests, review
   comments, merge options, protected branches, forks, Actions and Pages
   (simulated). Own generic design.
7. Level runner (src/levels): setup, goal checks, hints, stars, par,
   predict cards, error translator (40+ entries), recap, daily practice.
8. Content (content/levels, content/dialogue): all 58 levels exactly as
   listed in docs/SCOPE.md. Split into 2 subagents: Chapters
   0-4 and 5-8. Each level has story, goal, par, 3-tier hints,
   recap, and a reference solution. About 1 in 3 levels has a predict
   card. Every boss level is a realistic incident.
9. Classroom (src/classroom): progress saving, export and import,
   Professor Dashboard page, docs/PROFESSOR_GUIDE.md with the 6-week plan,
   grading ideas and a GitHub Classroom final-project brief.
10. QA (tests/e2e): a Playwright test per level that plays its reference
   solution and reaches the win screen, plus full-chapter playthroughs.

Content and UI subagents may start at once, working against the frozen
contracts and using mocks where the engine is not ready yet.

## Step 3 - Integrate and verify (you)
- Merge workstreams into main as each one's tests pass. Resolve merge
  conflicts yourself. Run the full test suite after every merge.
- When a test fails, send the fix to the owning subagent or fix it
  yourself. Never skip, delete or weaken a test to make it pass.
- Then run a final review subagent that plays through all chapters as a
  total beginner and lists confusing text, missing hints and bugs. Fix
  everything it finds, then run it again.

# Technical rules (all agents)
- src/engine is pure TypeScript: no React, no DOM, no browser APIs.
  Commands never mutate input; they return { state, events }.
- Model git's real data: blobs, trees, commits, refs, index, HEAD, reflog.
- Differential tests: run the same commands in real git (temp folder,
  fixed author, email and dates) and in the engine; compare branches,
  commit graph, index and working files. Real git is installed here.
- Command output and errors match real git's wording. The plain-English
  line is added separately by the error translator.
- Default branch is main. Teach switch and restore first; support
  checkout too.
- Goals check the final state, never the exact commands typed.
- Accessibility: full keyboard play, colour-blind-safe colours plus
  labels, a text description of the graph for screen readers.
- Never copy GitHub's logo, the Octocat or GitHub's exact interface.
- No placeholder levels, no TODO stubs, no lorem ipsum in the final build.

# Writing for beginners (content agents)
- Players know nothing about git or terminals. Sentences under 20 words.
  Explain every term the first time it appears.
- One new idea per level. Story beats under 30 seconds of reading.
- Hints: 1) a nudge, 2) the concept, 3) the exact command.

# Progress and resuming
- Keep docs/PROGRESS.md current: each workstream's status, what is done,
  what is next. Commit often with clear messages.
- If the run is interrupted, read docs/PROGRESS.md and continue from
  where work stopped. Do not restart finished work.

# Final Definition of Done
- All 58 levels in docs/SCOPE.md exist, validate against the schema and pass their
  Playwright test.
- All differential tests pass; every command in the spec is covered.
- npm run typecheck, npm run lint, npm test and npm run test:e2e pass.
- npm run build succeeds and the GitHub Pages workflow is ready.
- No errors in the browser console during a full playthrough.
- README.md explains how to run, test, build and deploy.
- docs/PROFESSOR_GUIDE.md, docs/DECISIONS.md and docs/PROGRESS.md exist.
- Finish with a short report: what was built, test counts, known limits.