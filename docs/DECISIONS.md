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
15. **Authentication (6.7).** Explained and simulated: the player creates
    a personal access token on the simulated GitHub and/or generates a
    simulated SSH key (`ssh-keygen`, never real key material), adds it on
    the simulated GitHub and switches the remote URL to SSH. No
    interactive password prompt is simulated.
16. **Leaving the simulator (8.6)** is not a boss: Chapter 8's boss is
    8.5; 8.6 covers installing git, running the same commands in a real
    terminal, and the final-project brief from `docs/PROFESSOR_GUIDE.md`.
17. **Merge options on the simulated GitHub** (merge commit, squash,
    rebase-and-merge) stay in scope as buttons; the `git rebase` command
    does not.
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
