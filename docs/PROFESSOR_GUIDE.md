# Git Quest: Professor Guide

## What Git Quest is

Git Quest is a free browser game that teaches git and GitHub to complete
beginners. Students play an intern at Lantern Labs, a small team building a
festival website. They type real git commands into a simulated terminal and
watch their files move between the working folder, the staging area and the
repository. A simulated GitHub teaches pushing, pull requests and code review.

There are 58 short levels in 9 chapters. Each chapter ends with a **boss
level**: a realistic incident the student solves without step-by-step help.

## How students open it

- Share the game link (the GitHub Pages address where it is published).
  Nothing to install and no account to create.
- Use a laptop or desktop browser: Chrome, Edge, Firefox or Safari. Phones
  are not supported.
- On first launch the student types a display name and your **class code**
  (any short text you choose, for example `CPSC101-F26`).
- Progress is saved in that browser on that computer. A private window, a
  lab computer that wipes itself, or clearing browser data loses it. Tell
  students to export their progress (see below) at the end of each session;
  they can import the file again to continue on another computer.

## Privacy

- The game stores only a display name, a class code and level results. It
  has no login and no server: nothing leaves the student's browser until the
  student exports a file and gives it to you.
- Students may use a nickname. Collect the files through your learning
  platform so you know whose file is whose.
- Check your university's rules before collecting files (for example FERPA
  in the US or GDPR in Europe).

## 6-week plan

Each week: one short in-class activity (about 20 minutes) and homework that
ends with a boss level.

| Week | Chapters (levels) | In class | Homework |
| --- | --- | --- | --- |
| 1 | 0 Terminal, 1 First repository (11) | Demo `pwd`, `ls`, `cd`, then `git init`, `add`, `commit` live in Sandbox mode. | Finish the Chapter 1 boss (1.6). |
| 2 | 2 Three areas, 3 Time travel (14) | Show the three boxes in Sandbox: stage one file but not another, then commit. Ask "what is in the commit?" | Finish the Chapter 3 boss (3.6). |
| 3 | 4 Branches, 5 Merge conflicts (12) | Draw a commit graph; students predict it after a merge. Then two students edit the same line and see the conflict. | Finish the Chapter 5 boss (5.5). |
| 4 | 6 Hello, GitHub (8) | "Git is not GitHub": push from one laptop, pull on another. Show a rejected push and how to fix it. | Finish the Chapter 6 boss (6.8). |
| 5 | 7 Teamwork on GitHub (7) | Pairs walk each other through a pull request in the game: issue, branch, PR, review, merge button. | Finish the Chapter 7 boss (7.7). |
| 6 | 8 Rescue and graduation (6) | "Break it and rescue it" with `stash`, `commit --amend` and `reflog`. Install git and form final-project teams. | Finish the Chapter 8 boss (8.5) and level 8.6. Start the final project. |

## How students export and submit progress

1. In the game the student presses **Export my progress**.
2. The browser downloads two files named after the student's handle and the
   date, for example:
   - `ada-lovelace-2026-10-30.gitquest.csv`: a spreadsheet. The first rows
     show the name, handle, class code and export time. Then there is one
     row per level, in game order, with: completed, stars, attempts,
     completions, time spent (seconds), hints used, highest hint tier,
     errors and first completed at.
   - `ada-lovelace-2026-10-30.gitquest.json`: the full record, with a
     checksum.
3. The student uploads the files to an assignment in your learning platform
   (Canvas, Moodle, Google Classroom) or emails them.

Read the **CSV** in Excel, Google Sheets or LibreOffice. Boss level titles
start with "Boss:", so you can filter for them.

Keep the **JSON**. Its checksum stops matching if someone edits the file by
hand, and the game refuses to import an edited file. To spot-check a file,
open the game in a private browser window and import it there; the chapter
map then shows that student's progress. The checksum discourages casual
editing; it is not strong security.

The game also has a short page for professors at `<game link>#/professor`
that repeats these steps.

## Grading ideas

Use the boss levels as the main signal: they show what a student can do on
their own. Do not grade stars, hints or errors. Hints are there to help
students learn, and penalising them teaches students to guess.

A simple split:

- **Game progress, 40%.** 4 points for each of the 9 boss levels (0.5, 1.6,
  2.8, 3.6, 4.7, 5.5, 6.8, 7.7, 8.5) and 4 points for finishing level 8.6.
  Grade from the exported CSV (the "Completed" column).
- **Final project, 60%.** A team project on real GitHub (brief below).

Optional: give the same short "predict what happens" quiz before week 1 and
after week 6 to see how much students learned.

## Final project brief (GitHub Classroom)

**Goal.** In teams of 3 or 4, improve a small festival website on real
GitHub using the same workflow as in the game.

**Each student must:**

1. Open an **issue** that describes one task (for example "Add the Friday
   schedule") and assign it to themselves.
2. Create a **branch** for that task on their own computer and make at
   least two commits with clear messages.
3. Push the branch and open a **pull request** that says what changed and
   why, and links the issue (write `Closes #12` in the description).
4. **Review** a teammate's pull request: leave at least one useful comment,
   then approve it.
5. After approval, **merge** their own pull request with the green merge
   button, delete the branch, and pull the updated `main` on their computer.

**The team must** resolve one **merge conflict**. The starter repository has
a file that every student edits (for example `schedule.md`). When the second
pull request conflicts with `main`, that student brings `main` into their
branch (`git switch main`, `git pull`, `git switch <branch>`,
`git merge main`), fixes the conflict markers, commits, pushes, and merges
the pull request.

**Deliverables.**

- The team repository with every issue, pull request, review comment and
  the merged conflict fix visible on GitHub.
- A `TEAM.md` file listing each member's name, GitHub username, issue number
  and pull request number.

**Rubric (100 points, scaled to 60%).**

| Criterion | Points | Full marks when |
| --- | --- | --- |
| Issue | 10 | Clear title and description; assigned to the student. |
| Branch and commits | 20 | Work done on a branch, not on `main`; at least two commits with clear messages. |
| Pull request | 20 | Explains what and why; links the issue; updated after review if asked. |
| Code review | 20 | At least one useful comment on a teammate's pull request, then an approval. |
| Merge conflict | 20 | Conflict resolved; no `<<<<<<<` markers left; the site still opens. |
| Clean finish | 10 | Pull request merged with the button; branch deleted; `TEAM.md` complete. |

**Setup steps for the professor.**

1. Create a free GitHub organization for the course and a classroom at
   classroom.github.com.
2. Create a starter repository in the organization: a small website
   (`index.html`, `README.md`) and a `schedule.md` that every student will
   edit. Mark it as a template repository.
3. Create a **group assignment** from the template, with teams of 3 or 4
   and a deadline.
4. Share the invitation link. Each student signs in to GitHub, then creates
   or joins a team.
5. Students install git (level 8.6 explains how). The first `git push`
   opens a browser window to sign in to GitHub. If it does not, they install
   the GitHub CLI and run `gh auth login` once, choosing the browser option.
6. To grade, open each team repository and look at the **Issues** and
   **Pull requests** tabs; the commit graph is under **Insights → Network**.
