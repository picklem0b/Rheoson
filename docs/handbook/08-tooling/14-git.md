# Chapter 14 — Git and GitHub

*Part IV · Engineering Practice*

---

Git records the history of the codebase; GitHub hosts that history and coordinates the collaboration around it. This chapter teaches Git from zero, then documents the workflow this project actually uses — which is stricter than the defaults, and load-bearing for releases.

## 14.1 The mental model

Git takes **snapshots**, not diffs. A **commit** is a named snapshot of the whole tree plus a parent pointer — a node in a graph, which is why "history" can branch and merge. Three areas matter:

```
working tree  ──git add──►  staging area  ──git commit──►  repository
(what you see)              (what ships next)              (permanent history)
```

The staging area is the feature beginners skip and professionals live by: it lets a commit contain *chosen* changes, so unrelated edits never share a commit.

## 14.2 Daily commands

```bash
git status                  # what changed, what is staged — run it constantly
git diff                    # unstaged changes, line by line
git diff --staged           # what the next commit will contain
git log --oneline -10       # recent history, one line per commit
git show <commit>           # one commit in full
git blame <file>            # who last touched each line (and why, via the commit)
```

`git status` → `git diff` → `git add <paths>` → `git commit` is the loop. Committing *paths* rather than `-A` is the staging discipline in practice.

## 14.3 Commits done right

A commit is a unit of *change with one reason*. The project follows **Conventional Commits** — `type(scope): subject` with an optional body — and the types map to review categories: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

```
fix(downloads): stop foreground service crash when stopping from background

startService() throws IllegalStateException on Android 12+ when called
while the app is backgrounded. Route the stop through the plugin's
existing handle and guard on service state first.
```

The subject says what changed; the body says *why* — the reasoning that a `git blame` six months later cannot reconstruct from the diff. A commit that needs the word "and" in its subject twice is two commits.

## 14.4 Branches

A **branch** is a movable label on a commit — parallel history that costs nothing to create:

```bash
git switch -c fix/queue-shuffle    # create and move to a branch
git switch main                    # return
git branch -d fix/queue-shuffle    # delete after merge
```

This repository runs two permanent branches: `main` (what releases are built from — the APK CI and the cloud deploys track it) and `dev` (where work integrates). Work happens on short-lived branches off `dev`, merged back when the gates pass (16.5). Naming is free-form but descriptive; the branch's name should make a `git branch --list` scan meaningful.

## 14.5 Remotes, push, pull

A **remote** is another copy of the repository — `origin`, here, the GitHub host:

```bash
git fetch origin          # learn what the remote has (changes nothing local)
git pull                  # fetch + merge remote work into the current branch
git push                  # send local commits to the remote
```

The rule that prevents the most pain: **fetch and look before push.** A rejected push means the remote advanced; `git log --oneline main..origin/main` shows what arrived, and a plain `git merge origin/main` reconciles it. This project's history includes exactly that situation (remote PR merges versus a local release merge) resolved cleanly by merging rather than rewriting.

## 14.6 Merge conflicts

A conflict means both sides edited the same lines since their common ancestor, and Git refuses to guess:

```
<<<<<<< HEAD
cached_seconds = 30
=======
cached_seconds = 120
>>>>>>> feature/cache-tuning
```

Resolution is editing the file to the *intended* result (one side, both, or a new answer), deleting the markers, and `git add`-ing the file. The project has one resolution rule with a documented reason: generated files (`openapi.json`, lockfiles, the generated API types) resolve to the output of *running the generator*, not to either side's text — merging two generated files by hand plants stale content that outlives the conflict. Mid-conflict, `git merge --abort` returns to the pre-merge state; it is always available and always safe.

## 14.7 Rebase, revert, and the safety rules

```bash
git rebase dev            # replay the branch's commits onto dev's tip — linear history
git revert <commit>       # new commit that undoes <commit> — safe on shared history
git reset --hard <commit> # move branch and ERASE working changes   ⚠ destructive
```

Rebase rewrites history, which is why it is confined to *unpushed* local work here; revert is the tool for anything that exists on the remote. The three rules stated once, absolutely: never rewrite pushed history; never reset without a moment's thought about what is uncommitted; and when in doubt, a new branch is free — commit the experiment somewhere before changing anything.

## 14.8 Tags and releases

A **tag** marks a commit as permanently meaningful — every release here is an *annotated* tag:

```bash
git tag -a v2.17.12 -m "v2.17.12 — streaming cold-start fix

- relay Range requests end-to-end so seeking works on first play
- enable durable stream cache by default
- restore the in-app update banner"
git push origin main dev --follow-tags     # branches AND their tags
```

The project's versioning is `v2.MILESTONE.PHASE`: milestone is the product era, phase is one completed, tested batch of work — each phase ships as its own annotated tag with a subject naming the theme and a bullet body naming the changes (`GIT_WORKFLOW.md` is the contract). Version numbers live in five files that must move together (`api/pyproject.toml`, `web/package.json`, `web/src/lib/constants.ts`, `api/app/main.py`, plus the lockfile refresh); Chapter 17.9 sequences the whole release. Tags exist only locally until pushed — `--follow-tags` on every push is a project rule, not a suggestion, because an unpushed tag is an unshipped release.

## 14.9 Pull requests

A PR is a proposed merge with review attached. The mechanics here: branch off `dev`, commit in logical units, push the branch, open the PR *into `dev`* with a description that states the problem, the approach, and how it was verified. Reviews use GitHub's interface; the reviewer's job is Chapter 20's checklist, not style preferences (the linter owns style). A PR with a clean diff, green gates, and a body a stranger could follow is the finished artifact this whole part of the handbook aims at.

## Exercises

1. Stage deliberately: make three unrelated edits in the working tree, then produce three separate commits using path-scoped `git add`. Show the `git log --oneline` result.
2. Construct a conflict on purpose (edit the same line on two branches), resolve it per 14.6, and write down what felt different from reading about it.
3. Find the five version files for a release bump. Which one does `npm install --package-lock-only` refresh, and why is that step not optional?
4. A teammate pushed a tag but the APK CI did not run. Using 14.8, name the two most likely causes and the command that diagnoses each.
5. Explain to a Chapter 3 reader why `git revert` is safe on shared history while `reset --hard` is not.
