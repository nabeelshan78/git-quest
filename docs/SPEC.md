# Git Quest — Research & Build Plan for a Beginner-to-Intermediate Git/GitHub Game

Sep 30, 2026 · @Nabeel Shan

## Instructions for the AI coding agent

This block tells Claude Code to build the whole game in one run, as an orchestrator directing parallel subagents, without stopping for approval. Save it as `CLAUDE.md` in an empty project folder and save this plan (exported as Markdown) as `docs/SPEC.md`. Then give Claude Code the one command at the end of the block. It replaces the shorter starter `CLAUDE.md` in the build plan section.

```markdown
# Mission
You are the lead engineer and orchestrator building Git Quest, a browser
game that teaches git and GitHub to complete beginners. docs/SPEC.md is
the source of truth. Read all of it first.

Build the COMPLETE game in this run: all 12 chapters, all 91 levels,
every feature in the spec. Work autonomously. Do not stop to ask for
approval. Keep going until the Final Definition of Done below is met.

# Priority
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
8. Content (content/levels, content/dialogue): all 91 levels exactly as
   listed in the spec's curriculum. Split into 3 subagents: Chapters
   0-3, 4-7, 8-11. Each level has story, goal, par, 3-tier hints,
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
- All 91 levels exist, validate against the schema and pass their
  Playwright test.
- All differential tests pass; every command in the spec is covered.
- npm run typecheck, npm run lint, npm test and npm run test:e2e pass.
- npm run build succeeds and the GitHub Pages workflow is ready.
- No errors in the browser console during a full playthrough.
- README.md explains how to run, test, build and deploy.
- docs/PROFESSOR_GUIDE.md, docs/DECISIONS.md and docs/PROGRESS.md exist.
- Finish with a short report: what was built, test counts, known limits.
```

The one command to type into Claude Code:

```text
Read CLAUDE.md and docs/SPEC.md, then build the complete Git Quest game as described, using subagents for the parallel workstreams. Do not stop until the Final Definition of Done is met.
```

## Executive summary

Build a free, browser-based game (working title **Git Quest**) that runs a simulated git engine with a live visual of files, the staging area, the commit graph and a mock GitHub, and takes a total beginner through 91 short levels in 12 chapters, ending with a real GitHub project.

The core idea is simple: every command the student types is instantly drawn as a picture. Beginners fail at git because they cannot see what it does. Git Quest makes the invisible parts visible, then slowly removes the training wheels until the student works in a plain terminal on real GitHub.

What makes it better than existing tools:

- **One journey, zero to intermediate.** No existing tool covers terminal basics, the staging area, branching, conflicts, GitHub pull requests, history rewriting and recovery in one path.
- **The three areas are always visible.** Working folder, staging area and repository are shown side by side. This is the single biggest source of beginner confusion, and the most popular branching game skips it.
- **Simulated teammates.** Fake coworkers push commits, open pull requests and cause merge conflicts, so students practise collaboration alone and safely.
- **Safe to break.** A rewind button undoes any mistake in the game, so students experiment without fear.
- **Built for a classroom.** Class codes, a professor dashboard, exportable progress, and a final graded assignment on real GitHub.
- **Zero install.** It opens from a link in any laptop browser and is hosted free on GitHub Pages.

Recommended build: TypeScript + React + Vite, a custom git simulation engine checked against real git by automated tests, xterm.js for the terminal, and levels written as data files. A first playable version (chapters 0–5) is realistic in 3–5 weeks for one developer working with an AI coding agent such as Claude Code; the full game in roughly 10–14 weeks.

**How this research was done.** I had no live web search in this session, so the landscape and research findings come from my training knowledge (reliable to mid-2026). Tool names and findings are well known, but before sharing with the professor, verify each tool's current status and any paper citations, since I can make mistakes with citations.

## Landscape: existing tools and the gap

No existing tool takes a total beginner all the way from "what is a terminal" to working on GitHub with a team. Each one is excellent at one slice. Git Quest should copy the best idea from each and fill the gaps between them.

| Tool | Format | Best idea to copy | Main gap for beginners |
| --- | --- | --- | --- |
| Learn Git Branching | Browser game, commit-graph levels | Animated commit graph; "par" score for fewest commands; sandbox mode | Hides files and the staging area entirely; no GitHub, pull requests or real conflicts |
| Oh My Git! | Desktop game (Godot), card-based | Shows working folder, staging area and commits together; runs real git underneath | Needs a download; quirky UI; thin on GitHub collaboration; check whether still maintained |
| GitHub Skills | Real GitHub repos guided by a bot | Real pull requests, issues, Actions and reviews | Not a game; slow feedback (waits on bots); assumes some git knowledge |
| Visualizing Git / Explain Git with D3 | Browser sandbox | Instant drawing of the graph after each command | No levels, goals or story |
| Githug, Git Katas, Git Exercises | Terminal exercise sets | Real git in a real terminal; good drills | No visuals; intimidating for beginners; some are outdated |
| Git-it (desktop app) | Guided tutorial app | Walks from install to first pull request | Deprecated; no visual model |
| git-sim | Command-line visualizer | Renders what a command will do before you run it | A tool, not a course |
| Pro Git book, Atlassian tutorials, "Oh Shit, Git!?" | Reading material | Accurate explanations; plain-English recovery recipes | Passive reading; no practice |
| MIT "Missing Semester" git lecture | Video + notes | Teaches git bottom-up from its data model | Too abstract as a first contact |

The gap Git Quest fills, in one line: the file-and-staging view of Oh My Git!, the graph animation of Learn Git Branching, and the collaboration of GitHub Skills, in one browser game with a story and a classroom dashboard.

These tools are from memory, not a live search, so check each one's current status before citing them.

## Why beginners struggle, and what the game must do about it

Beginners fail at git because its most important parts are invisible, and they build wrong mental pictures to fill the gap. Research on git's design (Santiago Perez De Rosso and Daniel Jackson at MIT, "What's Wrong with Git?", 2013, and follow-up work in 2016) points at the same trouble spots teachers report every semester.

### The misconceptions to design against

| Wrong belief | What is actually true | How Git Quest fixes it |
| --- | --- | --- |
| "Git and GitHub are the same thing." | Git is a tool on your computer; GitHub is a website that hosts git repositories. | Chapter 0–5 have no GitHub at all. GitHub arrives in Chapter 6 as a separate panel on screen. |
| "Saving a file saves it in git." | Git only records what you add and commit. | The working folder and repository are separate boxes; saving lights up only the first. |
| "git add is pointless." | The staging area lets you choose exactly what goes into the next commit. | Levels where you must commit only 2 of 5 changed files. |
| "A commit stores the changes." | A commit is a full snapshot, with a link to its parent. | Clicking a commit shows the whole project as it was at that moment. |
| "A branch is a copy of the folder." | A branch is a movable label pointing at one commit. | Branches are drawn as sticky-note labels that slide along the graph. |
| "HEAD is a mystery." | HEAD is "you are here": the branch or commit you have checked out. | A "You are here" pin is always on the graph. |
| "Detached HEAD means something broke." | You are looking at an old commit without a branch label. | A friendly level makes you detach on purpose, then rescue your work. |
| "My laptop and GitHub are always in sync." | They sync only when you push, pull or fetch. | Local and remote graphs sit side by side and visibly differ until you sync. |
| "Merge conflicts mean I did something wrong." | Conflicts are normal when two people edit the same lines. | Teammate characters cause conflicts on purpose, with a calm guide to resolving them. |
| "If I mess up, my work is gone." | Almost anything committed can be recovered (reflog). | A whole chapter on rescue, plus the in-game rewind button. |

### Learning principles the game must follow

1. **Make the invisible visible.** Every command animates its effect on files, staging area, graph and remote. This is the core feature, not decoration.
2. **One new idea per level.** Short levels (2–5 minutes) keep mental load low. Each level introduces at most one new command or concept.
3. **I do, we do, you do.** A concept is first demonstrated, then done with a hint, then done alone. Help fades as skill grows (called "scaffolding and fading" in teaching research).
4. **Predict before you run.** Before some commands, the student guesses the result by picking a picture. Guessing then checking makes ideas stick far better than just watching.
5. **Instant, kind feedback.** Git's own error messages are shown, then translated into plain English with a suggested next step.
6. **Safe failure.** Mistakes can be rewound at any time. Fear of breaking things is the top reason beginners avoid git.
7. **Real story, real reasons.** Every command is introduced because a character needs it ("we lost yesterday's version!"), never as a list to memorise.
8. **Spaced review.** Old skills come back in later levels and in short "daily practice" puzzles, so they are not forgotten.
9. **Bridge to reality.** The simulation looks and behaves like real git, and the last chapter moves to a real terminal and real GitHub so skills transfer.
10. **Multiple valid answers.** Levels check the final state, not the exact commands, so any correct solution passes. Stars reward efficient solutions.

## The game concept: story, screen and how it is played

The student plays a new intern at **Lantern Labs**, a tiny team building a website for a local community festival. Every git skill is learned because the team needs it right now: a lost file, a teammate's clashing edit, a broken launch the night before the festival.

### Characters

- **Ada, the mentor.** Explains each new idea in two or three sentences, shows it once, then steps back. Her help fades as the student improves.
- **Sam, the fast teammate.** Pushes code without warning and edits the same lines as you. Sam is the source of merge conflicts and "why is my push rejected?" moments.
- **Priya, the reviewer.** Leaves comments on your pull requests and asks for changes, teaching code review.
- **Leo, the open-source maintainer.** Appears in the late chapters, when you fork a public project and send your first contribution.

The tone is friendly and low-pressure. Mistakes lead to a funny line from a character and a rewind, never a "game over".

### The screen

One screen, always in the same layout, so students build a stable mental map:

- **Mission panel (left).** The story line, the goal as a checklist, and the Hint button.
- **World view (centre).** Three boxes side by side: *Working folder*, *Staging area*, *Repository (commit graph)*. From Chapter 6 a fourth box appears: *GitHub (remote)*, drawn as a second graph. Files glide between boxes as commands run.
- **Terminal (bottom).** A real-looking terminal where commands are typed. Git's real output appears, followed by a plain-English line from Ada.
- **Files and editor (right).** A small file tree and editor, so students edit real text and see the diffs git reports.
- **Top bar.** Chapter progress, stars, the Rewind button, the Glossary, and Sandbox mode.

&#91;embedded content: Git Quest screen layout · 5 fixed panels\]

The world view is the heart of the game: files move left to right as students run `git add` and `git commit`, and the GitHub box joins from Chapter 6.

### How a student plays one level

1. A short story beat sets up the problem (15–30 seconds of reading).
2. The goal appears as a checklist, for example "Commit only the menu page" and "Leave the draft poster uncommitted".
3. Early on, the student can click action buttons such as *Add file*. Each click types the matching command into the terminal, so the command is seen before it is typed by hand.
4. From mid-Chapter 2 the buttons fade out and the student types commands. Tab-completion and a command cheat card stay available.
5. At key moments a *Predict* card asks "What will the graph look like after this?" with 2–3 pictures to choose from.
6. Each command animates in the world view. Errors are explained kindly with a suggested fix.
7. The level ends when the final state matches the goal. The student gets 1–3 stars and a one-line recap of what they just learned, which is added to their Glossary.

### Modes

- **Story mode:** the main path of 91 levels.
- **Sandbox:** a free playground with the full visual, for experiments and for the professor to demo live in class.
- **Daily practice:** 3 short puzzles drawn from earlier chapters, for spaced review.
- **Challenge levels:** a timed or "fewest commands" version of each chapter's boss level, for fast learners.

## Curriculum: 91 levels in 12 chapters, from zero to intermediate

The path runs in four stages: **git on your own laptop** (Chapters 0–5), **GitHub and teamwork** (6–8), **power tools** (9–10) and **real-world graduation** (11). Each chapter ends with a boss level that mixes everything so far. A student who finishes can work confidently in a team on GitHub, which is solid intermediate level.

The game teaches the modern commands `git switch` and `git restore` first, and also shows `git checkout`, because students will meet it in older tutorials and on Stack Overflow. The default branch is `main`.

### Chapter 0 — Welcome and the terminal (no git yet)

Many true beginners have never used a terminal. Skipping this is the most common reason git courses lose people on day one.

1. **The final\_v2\_REALLY\_final problem** — why version control exists (story only, no typing)
2. **Where am I?** — what a terminal is; `pwd`
3. **Looking around** — `ls`, `cd`, `cd ..`
4. **Making things** — `mkdir`, `touch`
5. **Reading and writing** — `cat`, `echo "text" > file`
6. **Boss: tidy the festival folder** — use all five commands together

### Chapter 1 — Your first repository

1. **Tell git who you are** — `git config --global user.name` and `user.email`
2. **Start tracking** — `git init`; what the hidden `.git` folder is
3. **Ask git what is going on** — reading `git status` line by line
4. **Your first save point** — `git add` then `git commit -m`
5. **Look back** — `git log`
6. **Boss: start the festival repo** — three commits, clean status

### Chapter 2 — The three areas

1. **Three boxes** — working folder, staging area, repository
2. **Choose what to save** — `git add file`, `git add .`
3. **What did I change?** — `git diff`
4. **What am I about to commit?** — `git diff --staged`
5. **Oops, not that file** — `git restore --staged`
6. **Throw away an edit** — `git restore`
7. **Files git should ignore** — `.gitignore`
8. **Delete and rename** — `git rm`, `git mv`
9. **Messages people can read** — good commit messages
10. **Boss: one messy day, three clean commits** — stage selectively

### Chapter 3 — Time travel

1. **The story so far** — `git log --oneline --graph`
2. **Every commit has an ID** — hashes; `git show`
3. **You are here** — what `HEAD` means
4. **Visit the past** — `git switch --detach`; detached HEAD without fear
5. **Bring back an old file** — `git restore --source=<commit> file`
6. **Undo safely** — `git revert`
7. **Boss: the logo broke five commits ago** — find it and undo it

### Chapter 4 — Branches

1. **Why branches?** — try an idea without breaking main
2. **Branches are labels** — `git branch`
3. **Move between branches** — `git switch`, `git switch -c` (and `git checkout -b`)
4. **Two paths** — commits on two branches; the graph splits
5. **The easy merge** — fast-forward `git merge`
6. **The real merge** — three-way merge and merge commits
7. **Clean up** — `git branch -d`
8. **Boss: two features at once** — build, merge, delete

### Chapter 5 — Merge conflicts

1. **Why conflicts happen** — two edits to the same lines
2. **Reading the markers** — `<<<<<<<`, `=======`, `>>>>>>>`
3. **Resolve and finish** — edit, `git add`, `git commit`
4. **Back out** — `git merge --abort`
5. **Conflicts in several files** — work through them one by one
6. **Boss: Sam's midnight edits** — resolve a three-file conflict

### Chapter 6 — Hello, GitHub

1. **Git is not GitHub** — local tool vs hosting website
2. **Your first GitHub repo** — create it; README and Markdown basics
3. **Connect the two** — `git remote add origin`, `git remote -v`
4. **Upload** — `git push -u origin main`
5. **Download a project** — `git clone`
6. **Check vs bring in** — `git fetch` vs `git pull`; what `origin/main` is
7. **Push rejected!** — why, then pull and push again
8. **Proving it is you** — HTTPS with a personal access token vs SSH keys
9. **Boss: set up a second laptop** — clone, change, push, sync the first

### Chapter 7 — Teamwork on GitHub

1. **Issues** — report a bug, assign it, reference it in a commit
2. **The team workflow** — one branch per task (GitHub Flow)
3. **Your first pull request** — push a branch, open a PR
4. **Code review** — read Priya's comments, reply, request changes
5. **Update the PR** — push new commits to the same branch
6. **Ways to merge** — merge commit, squash, rebase-and-merge
7. **After the merge** — delete the branch, update local `main`
8. **Conflicts in a PR** — bring `main` into your branch and resolve
9. **Rules for main** — protected branches and required reviews
10. **Boss: festival launch sprint** — three PRs, one conflict, one review

### Chapter 8 — Open source and forks

1. **Fork vs clone** — your own copy on GitHub
2. **Two remotes** — `origin` and `upstream`
3. **Reading a project** — README, CONTRIBUTING, LICENSE
4. **Stay up to date** — sync your fork with upstream
5. **Your first contribution** — a PR to Leo's project
6. **Boss: fix a bug in a public project** — the full fork-to-merge loop

### Chapter 9 — Rewriting history

1. **Fix the last commit** — `git commit --amend`
2. **Three kinds of reset** — `--soft`, `--mixed`, `--hard`, shown on the three boxes
3. **Rebase vs merge** — `git rebase main`
4. **Tidy your commits** — `git rebase -i`: squash, reword, drop, reorder
5. **Copy one commit** — `git cherry-pick`
6. **The golden rule** — never rewrite history others already have
7. **Force push safely** — `git push --force-with-lease`
8. **Boss: clean up before review** — squash 6 messy commits into 2

### Chapter 10 — Rescue and detective tools

1. **Park your work** — `git stash`, `git stash pop`
2. **Git's secret diary** — `git reflog`
3. **Bring back a deleted branch** — reflog to the rescue
4. **Undo a bad reset** — recover "lost" commits
5. **Who wrote this line?** — `git blame`
6. **Find the bad commit fast** — `git bisect`
7. **Boss: the site is down at midnight** — bisect, revert, push

### Chapter 11 — Pro workflows and graduation

1. **Versions and releases** — `git tag`, GitHub Releases, semantic versioning
2. **Commit message conventions** — Conventional Commits
3. **Robots that check your work** — GitHub Actions runs tests on every PR (simulated)
4. **Put it online** — deploy the festival site with GitHub Pages
5. **Make git yours** — aliases and useful config
6. **Team strategies** — GitHub Flow, Git Flow and trunk-based development compared
7. **Leaving the simulator** — install git on your own computer; same commands, real terminal
8. **Final project** — a real team assignment on real GitHub, graded by the professor

Out of scope, offered as optional bonus reading: submodules, Git LFS, worktrees, hooks and sparse checkout. These are beyond the intermediate goal.

## Level design and game mechanics

Every level is a data file that describes a starting state, a goal state and some story, so new levels can be written without touching code. This is also what makes the game fast to build with AI agents: once the engine works, levels are mostly writing.

### How help fades within each concept

| Stage | What the student sees | Example (git add) |
| --- | --- | --- |
| 1. Watch | Ada runs the command; the animation plays slowly with labels | Ada types `git add menu.html`; the file glides to the staging box |
| 2. Click | An action button does it and shows the command it typed | Button "Stage menu.html" types the command for you |
| 3. Type with hints | Student types; the command card and tab-completion help | "Stage only the two finished pages" |
| 4. Type alone | No buttons, hints cost a star | Mixed into a boss level with no reminder |

### Hints

Three tiers, each revealed on request: a nudge ("Which box does the menu page need to reach?"), the concept ("`git add` moves changes to the staging area"), and the exact command. The first hint is free; later tiers reduce stars. The professor dashboard records hint use, which is a good signal of where the class struggles.

### Scoring

- **3 stars:** goal reached with no tier-2 or tier-3 hints, within the level's "par" command count.
- **2 stars:** goal reached with one extra hint or over par.
- **1 star:** goal reached any way at all. Everyone can finish every level.

Stars unlock cosmetic rewards (terminal themes, badges), never content. Nobody should be blocked from learning by a score.

### Goal checking

Levels check the **final state**, not the exact commands typed. For example: "`main` contains a commit whose message includes *menu*, `poster.png` is untracked, and the working folder is otherwise clean." This accepts every correct solution, including creative ones, and avoids the frustration of "right answer, wrong spelling".

### The error translator

The game shows git's real message, then one plain line from Ada. A lookup table maps the 40 or so most common beginner errors, for example:

| Git says | Ada says |
| --- | --- |
| `nothing added to commit but untracked files present` | You have new files, but none are in the staging area yet. Try `git add` first. |
| `fatal: not a git repository` | This folder is not being tracked by git. Did you run `git init`, or are you in the wrong folder? |
| `error: failed to push some refs` | GitHub has commits you don't have yet. Run `git pull`, then push again. |
| `You are in 'detached HEAD' state` | You are visiting an old commit. Look around freely; create a branch if you want to keep changes. |
| `CONFLICT (content): Merge conflict in index.html` | You and a teammate changed the same lines. Open the file and choose what to keep. |

### Predict cards

At about one level in three, before a key command runs, the game pauses and shows 2–3 small graph pictures: "Which one will you get?" A wrong guess is not punished; the animation then shows why. This is the cheapest, strongest learning feature in the game.

### Boss levels

Each chapter ends with a realistic incident that needs every skill from that chapter, with no step-by-step guidance. Bosses are what prove a skill has been learned, so the professor can use boss completion as the grading signal.

### Level file format (example)

```json
{
  "id": "2.5",
  "title": "Oops, not that file",
  "chapter": 2,
  "story": [
    { "speaker": "Ada", "text": "You staged the draft poster by accident. Let's take it back out without losing your edits." }
  ],
  "setup": {
    "commands": ["git init", "git add .", "git commit -m 'Add homepage'"],
    "files": { "menu.html": "<h1>Menu</h1>", "poster.txt": "DRAFT" },
    "afterSetup": ["git add menu.html poster.txt"]
  },
  "goal": {
    "checks": [
      { "type": "staged", "path": "menu.html" },
      { "type": "notStaged", "path": "poster.txt" },
      { "type": "fileContent", "path": "poster.txt", "equals": "DRAFT" }
    ],
    "description": ["menu.html is still staged", "poster.txt is unstaged but not deleted"]
  },
  "par": 1,
  "allowedCommands": ["git status", "git restore", "git diff", "git add"],
  "hints": [
    "Which box is poster.txt in right now? Which box should it be in?",
    "git restore can move a file out of the staging area with a special flag.",
    "git restore --staged poster.txt"
  ],
  "predict": null,
  "recap": "git restore --staged <file> un-stages a file. Your edits stay safe in the working folder."
}
```

## Technical architecture

Build a custom git simulation engine in TypeScript that copies git's real data model, and prove it matches real git with automated tests. This gives full control over teaching, instant speed in the browser, and no server costs.

### Choosing the git engine

| Option | How it works | Strengths | Weaknesses | Verdict |
| --- | --- | --- | --- | --- |
| **Custom simulation engine** | Our own TypeScript model of blobs, trees, commits, refs, index, HEAD and reflog | Every command we teach; friendly errors; step-by-step animation hooks; runs offline; tiny | We must make sure it behaves like real git | **Recommended** |
| isomorphic-git | A real git implementation in JavaScript, in the browser | Real git objects and hashes | Missing or partial commands we need (rebase, cherry-pick, some conflict handling — verify the current list); hard to animate step by step | Useful as a reference, not as the engine |
| Real git in a browser Linux VM (e.g. WebVM / CheerpX, v86) | A full Linux with real git, running in WebAssembly | 100% real behaviour | Large download, slow start, hard to visualise, hard to check goals | Consider only for the graduation chapter |
| Real git on a server (container per student) | Like the old Katacoda / Killercoda model | 100% real | Server cost, accounts, security, maintenance | Not worth it; use real GitHub for the capstone instead |

### How to keep the simulation honest

The main risk of a custom engine is teaching behaviour that real git does not have. Solve it with **differential testing**: a test script runs the same command sequence in the engine and in real git (in a temporary folder), then compares branches, commit parents, staging area and file contents. With fixed author names and dates, commit hashes can even match exactly. Hundreds of these scenario tests run automatically on every change, which also lets an AI agent check its own work.

### Recommended stack

| Part | Choice | Why |
| --- | --- | --- |
| Language | TypeScript | Type safety; AI agents write it very well |
| App framework | React + Vite | Fast, common, easy to host as static files |
| State | Zustand | Simple store for engine state, level state and UI |
| Terminal | xterm.js | The standard browser terminal (used by VS Code) |
| File editor | CodeMirror 6 | Light, supports showing conflict markers and diffs |
| Graph and animation | Custom SVG + Motion (formerly Framer Motion) | Git graphs need a custom lane layout; animations make commands visible |
| Tests | Vitest (engine and levels) + Playwright (full playthroughs in a browser) | Automated checks for every level |
| Translations | i18next | Lets the professor offer other languages later |
| Saved progress | localStorage / IndexedDB by default | Works with no accounts at all |
| Optional class backend | Supabase (database + login) | Class codes, progress sync and the professor dashboard |
| Hosting | GitHub Pages or Cloudflare Pages | Free static hosting |

### The main modules

1. **Engine** — pure logic with no UI: the repository model and every git command we teach. Each command returns the new state plus a list of "events" (file staged, commit created, branch moved) that drive the animations.
2. **Command parser** — turns typed text into commands and flags, gives `--help`, suggests fixes for typos (`git comit` → did you mean `git commit`?), and lets levels limit which commands are allowed.
3. **Remote simulator** — several repositories at once (your laptop, GitHub, a teammate's laptop, a fork) plus scripted teammate actions such as "after your first push, Sam pushes a change to the same line".
4. **Mock GitHub** — a simplified website view for issues, pull requests, reviews, forks and merge buttons. It should look generic, not copy GitHub's design or logo, while clearly teaching how GitHub works.
5. **Level runner** — loads a level file, builds the starting state, checks goals after each command, handles hints, stars and predict cards.
6. **UI shell** — the fixed screen layout, rewind (keep a stack of past states), glossary, sandbox, settings.
7. **Content** — level files, dialogue and glossary entries, kept separate from code so non-programmers (or the professor) can edit them.
8. **Progress and dashboard** — saves progress locally, optionally syncs to the class backend, and shows the professor a table of students, levels, time and hints.

&#91;embedded content: Git Quest architecture · engine at the centre\]

Typed commands flow down to the engine; its events flow up to the pictures; the level runner checks the resulting state; tests compare the engine with real git before every release.

## Where to build it, where it runs, and how the professor uses it

Build it on a normal laptop with VS Code and an AI coding agent, keep the code in a GitHub repository, and publish it free on GitHub Pages. Students open a link in their browser; nothing to install until the final chapter.

### Where it is built

- **Computer:** any Windows, macOS or Linux laptop with Node.js (current LTS) and git installed.
- **Editor and agent:** VS Code with Claude Code (terminal or desktop app). The agent writes code, runs the tests, and fixes what fails.
- **Code home:** a GitHub repository. Using git and GitHub to build a git game is itself a good example to show students.
- **Automatic deploy:** a GitHub Actions workflow builds the site and publishes it to GitHub Pages on every push to `main`.

### Where it runs

| Question | Answer |
| --- | --- |
| Devices | Laptops and desktops (Chrome, Edge, Firefox, Safari). Tablets with a keyboard work. Phones are not a target, since typing commands on a phone is painful. |
| Install | None. It is a website. It can also be installed as an offline app (a PWA) for poor Wi-Fi. |
| Accounts | Optional. Without login, progress saves in the browser. With a class code, progress syncs to the professor's dashboard. |
| Cost | Hosting is free on GitHub Pages or Cloudflare Pages. An optional Supabase backend is free at classroom scale; check current free-tier limits. |
| Privacy | Store only a display name, class code and level results. No grades or personal data inside the game. Check your university's rules (e.g. FERPA in the US, GDPR in Europe). |

### Suggested 6-week classroom plan

| Week | Chapters | In class (about 20 minutes) | Homework |
| --- | --- | --- | --- |
| 1 | 0–2 | Professor demos the three boxes live in Sandbox mode | Finish Chapter 2 boss |
| 2 | 3–4 | Predict-the-graph quiz using the game's pictures | Finish Chapter 4 boss |
| 3 | 5–6 | Live conflict: two students edit the same line | Finish Chapter 6 boss |
| 4 | 7–8 | Pair up: review each other's pull requests | Finish Chapter 8 boss |
| 5 | 9–10 | "Break it and rescue it" challenge | Finish Chapter 10 boss |
| 6 | 11 | Install git; start the real team project | Final project on real GitHub |

### How grading can work

- **Game progress (for example 40%):** boss levels completed, visible on the professor dashboard or via an exported CSV file.
- **Final project (for example 60%):** a team assignment on real GitHub created through **GitHub Classroom**. Each student must open an issue, work on a branch, open a pull request, review a teammate's pull request, resolve a conflict and tag a release. GitHub Classroom can auto-check parts of this.
- **Optional quiz:** the same 15-question concept test before and after, to measure learning (see the testing section).

The game can be linked from any learning platform (Canvas, Moodle, Google Classroom) as a plain web link. Deeper integration (LTI 1.3, which sends grades back automatically) is possible later but is significant work, so leave it out of version 1.

## Build plan with an AI coding agent

Build in seven phases, engine first and content last, with a hard test gate at the end of each phase. A playable first version (Chapters 0–5) lands around week 4–5, and the full game around week 10–14 for one developer working with Claude Code. These are estimates; your pace will depend on hours per week and how much playtesting you do.

| Phase | Weeks (approx.) | What gets built | Gate to move on |
| --- | --- | --- | --- |
| 0. Setup and spec | 0.5 | Repo, Vite + React + TypeScript project, `CLAUDE.md`, this plan saved as `docs/SPEC.md`, level file schema | Project builds and deploys an empty page to GitHub Pages |
| 1. Engine core | 1–2 | Repository model; `init`, `add`, `commit`, `status`, `log`, `diff`, `restore`, `rm`, `mv`, `branch`, `switch`, `checkout`, `merge` with conflicts, `revert`; differential test harness | 200+ scenario tests match real git |
| 2. Playable shell | 1 | Terminal, parser, three-box view, commit graph, animations, rewind, level runner | Chapter 1 playable start to finish |
| 3. Content: Chapters 0–5 | 1–2 | 43 levels, dialogue, hints, predict cards, error translator | **MVP pilot:** 5 real beginners finish Chapter 2 without outside help |
| 4. Remotes and mock GitHub | 2 | Multiple repos, `remote`, `push`, `pull`, `fetch`, `clone`; scripted teammates; issues, pull requests, reviews, forks; Chapters 6–8 | Tests match real git for remote scenarios; Chapter 7 boss playable |
| 5. Power tools | 1–2 | `reset`, `rebase` (incl. interactive), `cherry-pick`, `stash`, `reflog`, `blame`, `bisect`, `tag`; Chapters 9–10 | All engine commands covered by differential tests |
| 6. Classroom and graduation | 1–2 | Progress saving, class codes, professor dashboard, CSV export, Chapter 11, accessibility pass | Professor can run a full class dry run |
| 7. Pilot and polish | 2 | Fix what testers struggle with; sound, themes, performance | Pilot class finishes; post-test scores rise clearly |

### Rules that make AI agents build this well

1. **Give the agent the spec.** Save this document in the repo and point `CLAUDE.md` at it, so every session starts from the same plan.
2. **One module per subagent.** "Implement `git restore` with tests" is the right size for one subagent task; the orchestrator splits the whole game into such tasks.
3. **Tests first, especially for the engine.** Ask the agent to write the differential tests before the command, then make them pass. The tests are how you know the agent is right without reading every line.
4. **Keep the engine pure.** No UI code in the engine folder. This keeps it testable and lets the agent work on it safely.
5. **Let the agent play the game.** Playwright tests that type each level's solution and check the win screen catch broken levels automatically.
6. **Agent drafts levels, a human checks the teaching.** The agent can write level files quickly; you or the professor review story, hints and difficulty.
7. **Commit often and use branches.** Small commits make it easy to undo a bad agent change — and you practise what the game teaches.

### Starter `CLAUDE.md` for the repository

```markdown
# Git Quest

A browser game that teaches git and GitHub to total beginners.
Full design: docs/SPEC.md. Read it before starting any task.

## Structure
- src/engine/    Pure TypeScript git simulation. No React, no DOM.
- src/parser/    Command-line parsing, flags, help text, typo suggestions.
- src/remote/    Multi-repo simulation, scripted teammates.
- src/levels/    Level runner, goal checks, hints, scoring.
- src/ui/        React components (terminal, world view, mock GitHub).
- content/levels/ One JSON file per level (schema: content/level.schema.json).
- tests/diff/    Differential tests vs real git.

## Rules
- Every engine command needs differential tests against real git before it is done.
- Engine commands return { state, events }; never mutate state in place.
- Error messages must match real git's wording, then add a plain-English line.
- Default branch is main. Teach switch/restore first; support checkout too.
- Run `npm test` and `npm run test:e2e` before finishing any task.
- Keep beginner-facing text short: sentences under 20 words.
```

### Running it in one go

For a single autonomous run with subagents, use the full `CLAUDE.md` and the one command in the "Instructions for the AI coding agent" section at the top of this plan. The phases above then become the order the orchestrator follows, and each gate is checked automatically by the tests instead of by you.

## Testing, playtesting and measuring learning

The game is only "the best" if real beginners learn from it, so test three things: the engine is correct, the levels work, and students actually understand git afterwards.

### Three layers of testing

1. **Engine correctness:** differential tests against real git (see architecture). Target: every command scenario matches.
2. **Level health:** an automated playthrough of every level with its reference solution, plus checks that each level's hints are reachable and its par is achievable.
3. **Human playtesting:** the most important layer, and the one teams skip most often.

### How to run a playtest

- Recruit 5 people who truly know nothing about git. Five testers find most of the big usability problems.
- Sit behind them, ask them to think aloud, and **do not help**. Every time you want to help marks a design problem.
- Note where they pause for more than 20 seconds, what they type wrongly, and which hints they open.
- Fix the top three problems, then test again with new people. Repeat each phase.

### Built-in learning data

The game quietly records per level: attempts, time, hints used, commands typed and errors hit. The professor dashboard turns this into a "where the class is stuck" view, for example "62% of students opened hint 3 on level 5.3". Levels with very high hint use get rewritten.

### Measuring whether students learned

Give the same 15-question concept test before Chapter 0 and after Chapter 11. Use "predict the result" questions rather than "name the command", since they test understanding. Example questions:

- "You edit `a.txt` and run `git commit -m 'x'` without `git add`. What is in the new commit?"
- "Here is a graph with `main` and `feature`. Draw it after `git merge feature` while on `main`."
- "Your push was rejected. What happened, and what do you do?"

Also check transfer: in the final project on real GitHub, count how many students complete the full branch, pull request, review and merge cycle without help. That is the real proof the game worked.

## Risks, open decisions and next steps

The biggest risk is scope: 91 levels and a mock GitHub is a lot. Protect the project by shipping Chapters 0–5 first, piloting them, and only then building the rest.

| Risk | What could happen | How to prevent it |
| --- | --- | --- |
| Scope creep | The game is never finished | Ship the MVP (Chapters 0–5) first; freeze features per phase |
| Simulation drifts from real git | Students learn behaviour that does not exist | Differential tests against real git for every command |
| Students cannot move to real git | Skills stay inside the game | Real git output wording; Chapter 11 in a real terminal; final project on real GitHub |
| Too much reading | Beginners skim and get lost | Story beats under 30 seconds; sentences under 20 words; show, don't tell |
| Trademark issues | GitHub objects to a cloned look | Mock GitHub with its own generic design; no GitHub logo or Octocat; the name "GitHub" used only to describe the real service |
| Accessibility gaps | Some students cannot play | Keyboard-only play; colour-blind-safe branch colours plus labels; text description of the graph for screen readers |
| AI-generated bugs | Subtle errors in logic or levels | Tests-first workflow; automated playthroughs; human review of teaching content |

### Decisions to confirm with the professor

- **Language:** English only, or other languages too? (The stack supports translations.)
- **Accounts:** no-login mode only, or class codes with a dashboard from the start?
- **Operating system focus for Chapter 11:** which systems students use, so install guides match.
- **Time budget:** 6 weeks as planned, or compressed into 2–3 weeks?
- **Story setting:** the realistic "festival website" story, or a more playful fantasy theme?

### Next steps

- [ ] Share this plan with the professor and settle the five decisions above
- [ ] Create the GitHub repository and save this document as `docs/SPEC.md`
- [ ] Run Phase 0 with the first agent prompt
- [ ] Build the engine and differential tests (Phase 1)
- [ ] Make Chapter 1 playable and test it with 2–3 beginners
- [ ] Complete Chapters 0–5 and run the MVP pilot with 5 beginners
