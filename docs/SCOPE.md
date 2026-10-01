SCOPE CHANGE. Read this carefully, then continue working autonomously.

We are cutting the game to a smaller version so it finishes faster with fewer bugs. Keep all good work already done. Do not delete committed work that is still in scope.

FIRST, before anything else:
1. Create docs/SCOPE.md containing this whole message. It is now the source of truth for scope and overrides the curriculum and feature lists in docs/SPEC.md.
2. Add this line under "# Priority" in CLAUDE.md: "docs/SCOPE.md overrides docs/SPEC.md and this file on scope, level list and features."
3. Change "all 12 chapters, all 91 levels" in CLAUDE.md to "all 9 chapters, all 58 levels in docs/SCOPE.md".
4. Update docs/PROGRESS.md with the new plan and commit.

NEW LEVEL LIST (58 levels, 9 chapters). Use the matching story and details from SPEC.md.
Ch0 Terminal (5): why version control; pwd, ls, cd; mkdir, touch; cat, echo; boss.
Ch1 First repo (6): git config; init; status; first add + commit; log; boss.
Ch2 Three areas (8): three boxes; add file / add .; diff and diff --staged; restore --staged; restore; .gitignore; rm and mv; boss.
Ch3 Time travel (6): log --oneline and hashes, show; HEAD; switch --detach; restore --source; revert; boss.
Ch4 Branches (7): why branches + branch; switch and switch -c (and checkout -b); two paths; fast-forward merge; three-way merge; branch -d; boss.
Ch5 Merge conflicts (5): why conflicts happen; reading markers; resolve and commit; merge --abort; boss (multi-file conflict).
Ch6 GitHub (8): git vs GitHub + first repo and README; remote add, remote -v; push -u; clone; fetch vs pull, origin/main; push rejected then pull; HTTPS token vs SSH (explained, simulated); boss.
Ch7 Teamwork (7): issues + one branch per task; first pull request; code review; update the PR; merge options + delete branch + update local main; conflicts in a PR; boss.
Ch8 Rescue and graduation (6): stash and stash pop; commit --amend; reset --soft/--mixed/--hard; reflog to recover lost work; boss; leaving the simulator (install git, same commands in a real terminal, final project brief).

COMMANDS IN SCOPE: init, config, status, add, commit (incl. --amend), log, show, diff, restore, rm, mv, branch, switch, checkout, merge (+ conflicts, --abort), revert, remote, clone, fetch, pull, push, stash, reset, reflog. Plus shell: pwd, ls, cd, mkdir, touch, cat, echo.

REMOVED (stop any work on these; do not build them):
rebase, interactive rebase, cherry-pick, bisect, blame, tag, force-with-lease, forks and upstream, the open-source chapter, GitHub Actions and Pages simulation, protected branches, daily practice, challenge levels, i18n/translations (keep all text in one plain English strings file), extra themes (light and dark only), the full Professor Dashboard page.

KEEP: world view (three boxes + animated commit graph + GitHub panel), terminal, file editor, rewind, glossary, sandbox, hints (3 tiers), stars and par, predict cards (about 1 in 3 levels), error translator (about 25 entries), mock GitHub (repo page, issues, pull requests, review comments, merge buttons), progress saved in the browser.

CLASSROOM, simplified: progress save, plus an "Export my progress" button that downloads a JSON or CSV file the student can submit. Write a short docs/PROFESSOR_GUIDE.md. If dashboard code is already committed and working, keep it but do not extend it; otherwise drop it.

WORKSTREAM CHANGES:
- Engine A: continue as planned (including the diff work in progress).
- Engine B: only stash, commit --amend, reset, reflog.
- Remote: multiple repos, remote, clone, fetch, pull, push, scripted teammates. No forks, no force push.
- Content: 2 subagents instead of 3, Chapters 0-4 and Chapters 5-8.
- Tell every running subagent about this scope change now, so none of them builds removed features.

All testing rules in CLAUDE.md still apply: differential tests vs real git for every in-scope command, and a Playwright test per level. The Final Definition of Done now means all 58 levels in docs/SCOPE.md.

Continue autonomously until done. Do not ask me for approval.

---

SMALL SCOPE CORRECTION: keep it beginner-simple. Do not stop or restart running agents. Add these rules to docs/SCOPE.md, commit, and apply them to all batch 2 work (Remote, Mock GitHub, level runner, content) and to any level already written.

1. Level 6.7 becomes a short concept level only. Ada explains in plain words that real GitHub asks you to sign in, and that on a real computer this happens once through the browser. In the game, sign-in is automatic. No SSH keys, no tokens, no key files, no git remote set-url, no requireAuth. End with 2 simple check questions. Remove any SSH or token features from the Remote and Mock GitHub work.

2. Level 7.5: the mock GitHub has one green "Merge pull request" button. Squash and rebase merges get one sentence of explanation and no practice.

3. Level 8.3: teach only "undo my last commit but keep my changes" with git reset --soft HEAD~1. Mention git reset --hard in one sentence as dangerous; do not practice it. The engine may still support it.

4. Level 8.4 (reflog): keep it very simple, one scenario where a commit seems lost and reflog brings it back.

5. Mock GitHub stays minimal: repo page with files and README, issues, pull requests with review comments, and the merge button. No settings pages, no branch rules, no keys or tokens pages, no Actions, no Pages.

6. General rule for all content: if something is not needed for a beginner to use git alone and open a simple pull request with a teammate, explain it in one sentence or leave it out.

Level count stays 58. Continue autonomously until all 58 levels are done.
