# Git & GitHub — From Scratch, Plus This Project's Workflow

*Stage 10. Git remembers every version of every file, locally. GitHub hosts a copy and adds collaboration (pull requests).*

## 1. The mental model

Your project has three "places" a change can be:

```
working tree          staging area           history (commits)
(files as you edit)   (what goes into        (permanent snapshots)
                       the NEXT commit)
        │   git add   →      │      git commit  →
        ◄───── git restore ───┘ ◄──── git revert / reset ───┘
```

- **Working tree** — the files in front of you, messy and free.
- **Staging** — you *choose* what the next snapshot contains. Half-done work stays out.
- **Commit** — an immutable snapshot with a message. Commits form a chain; a **branch** is a movable label on that chain.

## 2. The ten commands you need

```bash
git status               # what changed, what's staged — run this constantly
git diff                 # unstaged changes, line by line (add --staged for queued ones)
git log --oneline -10    # recent history
git add <file>           # stage a file (or -A for everything)
git restore <file>       # throw away uncommitted changes to a file (destructive!)
git commit -m "type(scope): what and why"
git switch -c fix/my-bug # create + move to a new branch
git switch dev           # back to dev
git merge --no-ff other  # merge another branch into this one
git push origin dev      # upload; --follow-tags also pushes annotated tags
git pull                 # download + integrate others' work
```

Safety net: any commit is reachable by `git reflog` even after "disasters". Before risky operations, `git status` + a fresh commit = nothing can be truly lost.

## 3. Reading diffs — the core review skill

```
-const limit = 20
+const limit = 50
```
`-` old, `+` new. Read diffs hunk by hunk and ask: does each change *support the stated goal*? Anything unrelated should be its own commit (this repo's rule: one commit, one concern).

## 4. This repository's workflow (from GIT_WORKFLOW.md — the binding version)

```
main      stable, tagged releases only
dev       integration — all work merges here first
fix/*     short-lived branches off dev
```

```bash
# start
git switch dev && git pull
git switch -c fix/liked-count-off-by-one

# work → test → commit (conventional commits)
git commit -m "fix(likes): liked count now matches the library list"

# merge back (no-ff keeps a merge commit so history shows the feature)
git switch dev && git merge --no-ff fix/liked-count-off-by-one
git push origin dev
git branch -d fix/liked-count-off-by-one
```

**Commits follow Conventional Commits:** `type(scope): summary`. Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `style`, `perf`. The body (blank line after the summary) explains *why*; real examples live one `git log` away — read five before writing your first.

**Releases:** version files bump together (`api/pyproject.toml`, `web/package.json`, `web/src/lib/constants.ts`, `api/app/main.py`), dev merges to main with `--no-ff`, and the release gets an **annotated tag** `v2.MILESTONE.PHASE` whose message is the release summary. Push tags explicitly: `git push origin main dev --follow-tags`.

## 5. Tags, remotes, and the stuff that bites beginners

```bash
git tag -a v2.17.10 -m "v2.17.10 — theme" -m "- bullet"   # annotated tag (has message)
git push origin v2.17.10                                   # tags don't push themselves
git remote -v                                              # where origin points
git fetch origin                                           # download without merging
git log dev..origin/dev --oneline                          # what do THEY have that I lack
```

Two classics:
- **Behind before push** → `git pull`, resolve, push.
- **Committed to the wrong branch** → `git switch dev && git merge <wrong-branch>` … or before pushing: `git branch -f dev HEAD` while on the right branch. Ask before `reset`/`rebase` on shared branches.

## 6. Merge conflicts without fear

A conflict = both sides edited the same lines. Git marks the file:

```
<<<<<<< HEAD
const limit = 50
=======
const limit = 100
>>>>>>> feature
```

You edit the file to what should be true, then `git add <file>` and `git commit` (or `git merge --continue`). The project's own release process produced exactly this in `openapi.json` once — the resolution is documented in its commit message: *generated files resolve to the freshly generated side*.

## 7. Pull requests on GitHub

A PR says: "here's a branch; review and merge it into `dev`." A good PR in this repo: small scope, description with the *why*, tests included, docs updated if behavior changed, all gates green (CI runs pytest, tsc, eslint, build). Reviewers comment → you push more commits → the PR updates automatically → approve → squash or merge per maintainer.

## 8. Inspecting history like a detective

```bash
git log --oneline --graph -15          # branchy picture
git log -p --follow web/src/hooks/player.hook.ts   # file's full evolution
git blame web/src/lib/constants.ts     # who last touched each line
git show v2.17.10                      # a release tag's message + diff
git bisect start                       # binary-search the commit that broke something
```

**Exercise:** `git log --oneline --grep="guest" -i`. The guest-first policy has been removed and restored; read the two commits' messages and diff summaries. You've just learned a chunk of this project's history from git alone.

## Exercises

1. Make a scratch branch, edit a comment in `README.md`, commit with a proper conventional message, `git log --oneline -3`, then `git switch dev && git branch -D <branch>`. Nothing published, nothing lost.
2. Deliberately create a conflict: edit the same line in two branches, merge. Resolve it. Delete both branches. (Best 20-minute exercise in git.)
3. Find the most recent tag: `git tag -l --sort=-creatordate | head -3`. `git show` it. What did that phase deliver?
4. Why does this repo tag with `-a` instead of lightweight tags? (Hint: `git show v2.17.10` — what extra data did the annotation carry?)
