# Decisions and assumptions

Scope: `docs/SCOPE.md` (9 chapters, 58 levels) overrides the curriculum
and feature lists in `docs/SPEC.md`. Defaults from `CLAUDE.md`: the
realistic Lantern Labs festival-website story; no backend (progress in
the browser, an "Export my progress" JSON/CSV file for students to
submit); desktop/laptop browsers. All interface text is plain English in
one file (`src/strings.ts`); light and dark themes only.

Every other assumption made while building is listed here.

## Architecture

1. **Single immutable `World` value.** All machines, repositories, the
   simulated GitHub and the clock live in one JSON-serialisable object.
   Rewind is a stack of previous worlds; immer gives structural sharing
   and freezes results so accidental mutation throws.
2. **Real git object model and hashes.** Blobs, trees, commits and tags
   are serialised byte-for-byte like git and hashed with SHA-1, so with
   fixed identity and dates the engine's commit ids equal real git's.
   Differential tests compare hashes directly.
3. **Simulated clock.** Every git command advances `world.clock` by 60
   seconds. Tests set real git's `GIT_AUTHOR_DATE`/`GIT_COMMITTER_DATE`
   to the same value. Timezone is always `+0000`.
4. **Filesystem model.** Each machine has a flat `path → text` file map
   plus a directory set. Only text files are simulated (images are
   represented by short text placeholders). File modes are always
   `100644`; symlinks and executable bits are out of scope.
5. **`.git` is virtual.** The `.git` directory exists in the directory
   set (so `ls -a` shows it) but its contents live in `RepoState`.
6. **Editor support.** Commands that open `$EDITOR` in real git open the
   in-game editor (commit message, merge message after a conflict,
   revert message, amend). `git merge` creating a merge commit does not open an editor
   (equivalent to `GIT_MERGE_AUTOEDIT=no`) to keep beginners moving.
7. **Pure logic split from UI.** `src/hub` holds the simulated GitHub's
   state logic so it can be tested without React; `src/ui/hub` holds its
   components. (CLAUDE.md lists only `src/ui/hub` for the Mock GitHub
   workstream; the logic folder is an addition.)
8. **Option specs are data.** All supported git options live in
   `src/shared/commandSpecs.ts`, shared by the parser (help, completion,
   typos) and the engine (`ParsedArgs`).

## Product

9. **Mock GitHub naming.** The panel is titled "GitHub (simulated)" with
   its own lantern logo and a generic design. Remote URLs use
   `github.com` so commands transfer to the real service unchanged. No
   GitHub logo, Octocat or copied interface.
10. **Level file format.** The spec's example format is refined: setup is
    an ordered list of steps; goals are checklist items each with one or
    more state checks; levels carry a reference `solution` used by
    automated tests. The JSON Schema is generated from zod
    (`npm run schema`).
11. **Goals on read-only commands.** Commands like `pwd`, `git status`
    and `git log` change no state, so their levels use either a question
    the player answers (preferred) or a `ranCommand` check. State-changing
    goals always check final state only.
12. **Par counts state-changing commands only.** Read-only commands
    (`status`, `log`, `diff`, `ls`, `cat`...) are free so students are
    never discouraged from looking. Editor-panel saves do not count.
13. **Stars.** 3 = no tier-2/3 hint and within par; each tier-2/3 hint or
    going over par removes one star; minimum 1. Rewinds are free.
14. **Player identity.** On first launch the student enters a display
    name (and optional class code). Levels after 1.1 preset
    `user.name`/`user.email` from this profile via `{{player.name}}` /
    `{{player.email}}`; the simulated GitHub handle is derived from it.
15. **Signing in (6.7).** A concept level only: real GitHub asks you to
    sign in (once, through the browser, on a real computer); in the game
    sign-in is automatic. There are no SSH keys, tokens or credential
    checks in the simulator.
16. **Leaving the simulator (8.6)** is not a boss: Chapter 8's boss is
    8.5; 8.6 covers installing git, running the same commands in a real
    terminal, and the final-project brief from `docs/PROFESSOR_GUIDE.md`.
17. **One merge button.** The simulated GitHub has a single green "Merge
    pull request" button that creates a merge commit. Squash and rebase
    merges are explained in one sentence. Its other pages are limited to
    the repo page (files + README), issues and pull requests with review
    comments.
18. **Pull reconciliation.** The engine reproduces modern git's refusal
    to pull divergent branches without `pull.rebase` configured; levels
    that need `git pull` on divergent history preset
    `pull.rebase=false` (and Chapter 6 explains it).
19. **Sound** is not included (the spec lists it only as a polish item).
20. **Scope cut (docs/SCOPE.md).** Removed from contracts and plans:
    rebase, cherry-pick, bisect, blame and tag commands; force pushes;
    forks and upstream remotes; Actions, Pages, protected branches and
    releases on the simulated GitHub; daily practice; challenge levels;
    i18n; extra themes. `git clean`, `cat-file`, `ls-files`, `rev-parse`
    and `check-ignore` are also out of scope as commands (the engine
    still parses revisions internally).

## Curriculum rebuild (2026-10)

An audit found the engine was far ahead of the curriculum: 24 of 58
levels were pure multiple-choice quizzes, students typed only 79 git
commands across the whole game, and Chapters 6 and 7 — the entire
GitHub and teamwork half — required no commands at all because the
simulated-GitHub panel had never been implemented beyond a stub.
Nine in-scope commands (`diff`, `checkout`, `remote`, `clone`, `fetch`,
`pull`, `push`, `reset`, `reflog`) were never typed by a student.

21. **The simulated site is built, not stubbed.** `src/ui/hub/` renders
    the repo page (branch picker, file list, README), issues with
    comments, and pull requests with a real computed diff, review
    threads anchored to lines, replies, the merge button and branch
    deletion. Every action dispatches through `session.hubAction`, the
    same engine path scripted teammates use, so nothing is faked in the
    UI layer.
22. **Generic branding.** The site is called "CodeHub" and uses its own
    icons. The GitHub name, logo and Octocat appear nowhere; a test
    asserts the panel's text never matches /github/i or /octocat/i.
23. **Chapters 6 and 7 are hands-on.** Both chapters now drive real
    commands and real site actions. Only three levels in the game remain
    deliberately quiz-shaped: 0.1 (why version control, before any tool
    exists), 6.7 (sign-in, which is automatic here by design) and the
    concept questions inside otherwise hands-on levels.
24. **Scripted teammates actually run.** The `teammates` array in the
    level schema was never wired into the runner, so no level could use
    it. `GameSessionImpl.runTeammateScripts` now fires `start`,
    `commands`, `goal` and `event` triggers, each script once, with
    `say`, `push`, `hub` and `run` actions. Level 6.6's rejected push
    happens because a teammate really pushed first, not because the
    level staged it.
25. **`<ref>@{n}` is implemented** in `engine/core/repo.ts` and shared by
    all three revision resolvers, because the reflog rescue lesson (8.4)
    depends on `HEAD@{1}`. It is covered by differential tests against
    real git rather than trusted.
26. **Classmate repo bundles (`src/classroom/bundle.ts`).** A student
    exports their repository as one JSON file; a classmate imports it and
    the incoming commits land on a `classmate/<handle>` branch, which the
    importer merges themselves. Chosen over live multiplayer deliberately:
    it is asynchronous and one-way, so nobody is ever blocked by a partner
    who is slow, absent or on another timezone, and it needs no backend,
    no accounts and no personal data. CRDTs were rejected outright —
    they exist to make conflicts disappear, which would delete the lesson.
27. **The `team-up` sandbox preset writes its base commits with a fixed
    identity** (`Lantern Labs <team@lanternlabs.example>`) and the fixed
    clock, so every student's starting commit has the same hash. Without
    that shared ancestor, exchanged bundles fail with "refusing to merge
    unrelated histories".
28. **The sandbox runs the real engine.** It previously used the
    development mock session; it now uses `createSession` with a
    `sandboxPreset`, so sandbox behaviour matches levels exactly.
29. **Documented misconceptions are targeted directly** (Isomöttönen &
    Cochez, *Challenges and Confusions in Learning Version Control with
    Git*): 2.1 makes the student `git add` a file that already existed to
    break the "add creates the file" reading and asks what `add` did;
    2.3 compares `git diff` with `git diff --staged` on genuinely
    different states; 5.1 has the student cause a conflict on purpose;
    7.6 states that re-cloning to escape a conflict is the wrong move,
    which the paper found was students' actual coping strategy.
30. **Profile before play.** Levels and the sandbox build their world
    from the player's identity at mount time. The profile dialog used to
    render over a already-mounted level, baking in an empty `user.name`
    and making every setup commit fail silently. Session-creating routes
    now wait for a name, and `runSetup` falls back to a placeholder
    identity rather than committing with an empty one.
