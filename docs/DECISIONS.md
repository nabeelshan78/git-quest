# Decisions and assumptions

Defaults from `CLAUDE.md` (not repeated as open questions): English UI in
i18next files; the realistic Lantern Labs festival-website story; no
backend (progress in the browser, exported progress files, Professor
Dashboard imports many files, CSV export); desktop/laptop browsers.

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
   in-game editor (commit message, rebase todo, reword/squash, revert
   message). `git merge` creating a merge commit does not open an editor
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
15. **Authentication (6.8).** The hands-on path is SSH: `ssh-keygen`,
    add the key on the simulated GitHub, switch the remote URL to SSH and
    push. Personal access tokens are created on the simulated GitHub and
    explained, but no interactive password prompt is simulated.
16. **Simulated Actions.** Workflows are enabled by the presence of their
    workflow file in the pushed commit; each step evaluates a
    deterministic rule (file exists/contains, no conflict markers).
    Real YAML is not executed.
17. **Final project (11.8).** In-game it is a dress-rehearsal boss that
    runs the whole issue → branch → PR → review → conflict → merge →
    release loop on the simulated GitHub, then presents the real GitHub
    Classroom brief from `docs/PROFESSOR_GUIDE.md`.
18. **Pull reconciliation.** The engine reproduces modern git's refusal
    to pull divergent branches without `pull.rebase` configured; levels
    that need `git pull` on divergent history preset
    `pull.rebase=false` (and Chapter 6 explains it).
19. **Challenge mode** is derived from each boss level (`challenge`
    block: time limit and optional stricter par), not separate files.
20. **Sound** is not included in version 1 (the spec lists it only as a
    polish item).
