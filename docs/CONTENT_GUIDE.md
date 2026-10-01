# Content guide — writing Git Quest levels

For the two content workstreams (Chapters 0–4 and 5–8). Read
`docs/SCOPE.md` (the level list: 9 chapters, 58 levels — it overrides the
SPEC curriculum), `CLAUDE.md` ("Writing for beginners"), `docs/SPEC.md`
(story, characters, "Level design and game mechanics"),
`content/chapters.json` (exact ids and titles), `docs/ARCHITECTURE.md` and
the schema `src/shared/level.ts` (every field is commented) before writing.

## The story

**Lantern Labs** is a tiny team building the website for the **Riverside
Lantern Festival**. The player is the new intern. The festival is in a
few weeks; the site must be ready. Every command is introduced because the
team needs it right now.

| Character | Hub login | Commit identity | Role |
| --- | --- | --- | --- |
| Ada | `ada-lantern` | Ada Okafor `<ada@lanternlabs.example>` | Mentor. Explains in 2–3 sentences, shows once, steps back. Her help fades. |
| Sam | `sam-codes` | Sam Lee `<sam@lanternlabs.example>` | Fast teammate. Pushes without warning, edits your lines. Kind, always rushing. |
| Priya | `priya-reviews` | Priya Natarajan `<priya@lanternlabs.example>` | Reviewer. Specific, friendly PR comments. |
| You | `{{player.handle}}` | `{{player.name}} <{{player.email}}>` | The intern. |

Tone: warm, low pressure, a little funny. Mistakes get a friendly line and
a rewind, never "game over". Speakers used: `Ada`, `Sam`, `Priya`,
`Narrator`, `You` (`Leo` exists in the schema but the open-source chapter
is out of scope).

## Writing rules (hard)

- Players know nothing about git or terminals. **Sentences under 20 words.**
- Explain every term the first time it appears (in the story or the recap).
- **One new idea per level.** Story beats under 30 seconds of reading
  (about 3–6 short lines).
- Hints: 1) a nudge (a question pointing at the right box/idea),
  2) the concept (what the command does), 3) the exact command(s).
- Recap: one line, starts with the command or idea, e.g.
  "`git restore --staged <file>` takes a file out of the staging area. Your edits stay safe."
- No lorem ipsum, no placeholders, no TODOs.
- Boss levels: a realistic incident, no step-by-step guidance in the story,
  needs every skill from the chapter, `boss: true`.
- About **1 in 3 levels has a `predict` card** (before the key command:
  "What will the graph look like after `git merge feature`?").

## The festival project (keep it consistent)

Main folder: `~/festival` (workdir for most levels). Hosted repo (from
Chapter 6): `lantern-labs/festival-site`. Use only the commands in scope
(`docs/SCOPE.md`): no rebase, cherry-pick, tag, bisect, blame, force push
or forks. Typical files:

```
index.html      <h1>Riverside Lantern Festival</h1> ...
menu.html       food stalls and prices
schedule.html   the timetable (lantern launch at 21:00)
map.html        where the stages are
css/style.css   colours (lantern orange #E69F00), fonts
README.md       what the site is and how to edit it
poster.txt      a draft poster text (often the file you must NOT commit)
notes.txt       personal scratch notes
```

Keep file contents short (a few lines). Use realistic but tiny HTML/CSS.
The same files evolve across chapters (e.g. the schedule's launch time,
a broken logo `<img src="logo.png">`, a typo "Lantren").

## How a level file is built

One file per level: `content/levels/chNN/<id>.json`, with
`"$schema": "../../level.schema.json"`. ids and titles exactly as in
`content/chapters.json`.

### Setup

`setup.steps` run in order through the real engine and shell before the
player starts, so any command you can type works here. Useful steps:

- `{ "run": "git init" }`, `{ "run": "git switch -c feature" }`
- `{ "files": { "index.html": "<h1>Festival</h1>\n" } }` — paths relative to the machine's current directory (`setup.machine.cwd`, default home; use `{ "run": "cd festival" }` or `"cwd"` in `setup.machine`)
- `{ "commit": { "message": "Add homepage", "files": { "index.html": "...", "old.txt": null } } }` — writes/deletes files, `git add -A`, commits; `"author": "Sam Lee <sam@lanternlabs.example>"` for teammates' commits
- `{ "hosted": { "id": "lantern-labs/festival-site", "fromLocal": {} } }` — copy the local repo (workdir) to the simulated GitHub and add it as `origin` (with upstream tracking when `setUpstream: true`)
- `{ "teammate": { "type": "push", "actor": "Sam", ... } }` — a teammate commit straight on the hosted repo
- `{ "hub": { "type": "createIssue", "actor": "sam-codes", ... } }`
- `{ "machineAdd": { "id": "laptop2", "label": "Second laptop" } }`

`setup.machine.identity` defaults to true: `user.name`/`user.email` are
preset from the player's profile. Level 1.1 sets it to false (the player
configures git). Levels that need `git pull` on divergent history set
`"globalConfig": { "pull.rebase": "false" }` (modern git refuses
otherwise; Chapter 6 explains why).

### Goals

`goal.items` is the checklist the player sees. Each item has `text` and
`checks` (all must pass). Checks look at **final state only**; any correct
solution passes. Prefer several precise checks, e.g. commit only the menu:

```json
{ "text": "Commit only the menu page", "checks": [
  { "type": "commit", "messageContains": "menu", "changesExactly": ["menu.html"] }
]},
{ "text": "Leave the draft poster uncommitted", "checks": [
  { "type": "untracked", "path": "poster.txt" }
]}
```

Read-only commands (`pwd`, `git status`, `git log`) change nothing, so
use a **question** (`questions` + `{ "type": "answered", "question": "q1" }`)
that the output answers. `ranCommand` exists but use it sparingly.

### Par, allowed commands, help fading

- `par` = number of **state-changing** commands in a good solution
  (read-only commands like status/log/diff/ls/cat are free). Use `null`
  for story/quiz-only levels.
- `allowedCommands`: prefixes like `["git add", "git commit", "git restore"]`.
  Always allowed anyway: `clear`, `help`, `history`, `pwd`, `ls`, `cat`,
  `whoami`, `git status`, `git log`, `git diff`, `git show`, `git help`,
  any `--help`. Use `null` (everything) for bosses and later chapters.
- Scaffolding fades: early levels of a concept use `demo` (Ada types it),
  then `ui.actionButtons` (click types the command), then typing with
  hints, then bosses with nothing. Action buttons fade out from mid
  Chapter 2.

### Predict cards and pictures

```json
"predict": {
  "trigger": "git merge",
  "question": "You are on main. What will the graph look like after git merge feature?",
  "choices": [
    { "text": "main moves forward to C", "picture": { "kind": "graph",
      "commits": [ { "id": "A", "parents": [] }, { "id": "B", "parents": ["A"] }, { "id": "C", "parents": ["B"] } ],
      "branches": { "main": "C", "feature": "C" }, "head": "main" } },
    { "text": "A new merge commit appears", "picture": { "kind": "graph",
      "commits": [ { "id": "A", "parents": [] }, { "id": "B", "parents": ["A"] }, { "id": "C", "parents": ["B"] }, { "id": "M", "parents": ["B", "C"] } ],
      "branches": { "main": "M", "feature": "C" }, "head": "main" } }
  ],
  "answer": 0,
  "explanation": "main had no new commits, so git just slides the main label forward. That is a fast-forward."
}
```

`boxes` pictures show the three areas: `{ "kind": "boxes", "working": ["poster.txt"], "staging": ["menu.html"], "repository": ["index.html"] }`.

### Reference solution

`solution` must reach every goal **within par and with no hints**; the
automated tests play it headlessly (`npm run test:levels`) and in the
browser (Playwright). Steps: `{ "run": "git add menu.html" }`,
`{ "edit": { "path": "index.html", "content": "..." } }` (editor panel),
`{ "editor": { "action": "save", "content": "..." } }` (when git opens an
editor), `{ "hub": { ... } }` (a click on the simulated GitHub),
`{ "answer": { "question": "q1", "choice": 2 } }`, `{ "story": "read" }`,
`{ "switchMachine": "laptop2" }`. Predict cards are answered automatically.

### Teammates

```json
"teammates": [ { "id": "sam-pushes", "when": { "on": "event", "event": "transfer.push" },
  "actions": [
    { "type": "say", "speaker": "Sam", "text": "Oops, I just pushed a schedule fix too!" },
    { "type": "push", "actor": "Sam", "repo": "lantern-labs/festival-site", "branch": "main",
      "message": "Fix launch time", "files": { "schedule.html": "..." } }
  ] } ]
```

`actor` for `push` is the character name (`Sam`) or hub login; commits use
the character's identity.

### Glossary and cheat card

Each content workstream owns `content/glossary/chNN.json` for its
chapters: an array of `{ "id": "staging-area", "term": "Staging area",
"definition": "...", "chapter": 2, "command": "git add" }`. Levels unlock
terms with `"glossary": ["staging-area"]` and add cheat-card entries with
`"cheatSheet": [{ "command": "git add <file>", "summary": "Put a file in the staging area" }]`.

## Validating your work

- `npx vitest run tests/levels` — schema validation and headless
  solution playthroughs for every level.
- Play it: `npm run dev`, open `http://localhost:5173/#/play/2.5`.
