# Chapter 13 — Working in the Terminal

*Part IV · Engineering Practice*

---

Development here happens in a terminal more often than in an IDE — especially on the primary target, Termux, where the terminal *is* the machine. This chapter teaches the Unix basics as they apply to this repository, then the repository-specific commands that come up daily. Every command is safe to run on a scratch copy; a few are marked, because they change things.

## 13.1 Where am I and what is here

```bash
pwd                     # print working directory — the answer to "where am I?"
ls                      # list files
ls -la                  # … long form, including hidden files like .env and .git
cd api                  # move into api/
cd ..                   # up one level
cd ~                    # home — Termux lands here
```

Hidden files (the dot-prefixed ones) are configuration: `.env` (secrets), `.gitignore` (what Git skips), `.git/` (the repository itself). `ls` hides them by default, which is why "the file isn't there" is sometimes "the file is hidden."

## 13.2 Reading and searching

```bash
cat README.md           # print a whole file
less api/app/main.py    # page through a long file (q quits, / searches)
head -20 f / tail -20 f # first/last 20 lines — logs especially
grep -rn "MAX_CONCURRENT_DOWNLOADS" api/   # find text: -r recursive, -n line numbers
find . -name "*.test.ts"                   # find files by name/pattern
```

`grep` is the single most-used tool in code review. Two forms worth memorizing beyond the basics: `grep -rn "pattern" --include="*.py"` scopes by type, and `grep -rn -B2 -A6 "pattern"` shows context around a match — the difference between a hit and an understanding.

**Pipes and redirects** compose commands — the terminal's core idea:

```bash
grep -rn "TODO" api/ | wc -l          # count matches
cat api.logs | grep -i error | tail -50  # last 50 error lines of a log
grep -rn "emit_download" api/app > findings.txt   # write output to a file
```

The left side's output becomes the right side's input. Nearly every investigation in this codebase is two or three pipes long.

## 13.3 Files: create, copy, move, remove

```bash
mkdir -p docs/new-chapter          # -p creates parents, never errors if it exists
cp a b                             # copy
cp -r api/tests /tmp/tests-backup  # recursive — directories
mv draft.md final.md               # move or rename
rm file.txt                        # delete a file
rm -r old-dir                      # delete a directory   ⚠ no undo
```

The warning on `rm` is not decoration: the terminal has no trash can. The working rule — check with `ls` what a glob will match *before* running `rm -r` on it. `mv` and `cp` also silently overwrite, so renames of tracked files go through `git mv`/`git rm` (14.3) to keep history intact.

## 13.4 Processes

```bash
ps aux | grep uvicorn              # is the backend running?
kill -15 <pid>                     # ask politely to stop (SIGTERM)
kill -9 <pid>                      # force — last resort, skips cleanup
```

The backend in dev runs with `--reload`, which watches files and restarts on save; a stuck reload usually means a syntax error, visible in its output. A process that "won't die" often has children — `pkill -f uvicorn` matches the whole command line and is the honest tool here.

## 13.5 Environment variables

```bash
echo $MUSIC_DIR                    # read one
export ENV=development             # set for this shell and children
printenv | grep -i mongodb         # list what matches
```

Two distinctions that prevent real confusion in this repo: a variable set with `export` lives only in that shell (a new terminal starts clean), and variables in `api/.env` are read by the *application* at startup, not by the shell — the two systems do not see each other. Loading the `.env` into a shell for debugging is possible (`set -a; source api/.env; set +a`) but exposes secrets to shell history; prefer reading specific keys by name.

## 13.6 The repository's daily commands

The sequences that recur; each is explained fully in its own chapter (noted in parentheses).

```bash
# — run the app (Ch. 18) —
cd api && uv run uvicorn app.main:socket_app --reload
cd web && npm run dev

# — verify changes (Ch. 16) —
cd api && uv run pytest -q                    # backend suite
cd web && npx vitest run                      # frontend suite
cd web && npx tsc --noEmit                    # types
cd web && npm run build                       # production build + verify gate

# — search the code (this chapter) —
grep -rn "formatDuration" web/src --include="*.tsx" | wc -l

# — inspect what changed (Ch. 14) —
git status && git diff --stat

# — regenerate API types after schema changes (Ch. 17) —
cd api && uv run python scripts/export_openapi.py
```

The backend *must* be started with `socket_app` as the target — Chapter 9.1 explains the failure mode when `app` is used instead, and the symptom (working REST, dead WebSocket) is worth associating with the cause now.

## 13.7 On Termux specifically

The primary deployment target is Termux on Android, which changes a few practical defaults: storage lives under `/data/data/com.termux/files/home`, Python packages install with `uv sync` into a project virtual environment (never system-wide), and long-running processes are kept alive by tools like `termux-wake-lock` — the backend on a phone dies with the terminal session otherwise. Downloads land in `MUSIC_DIR`, which points into the user's music storage; checking the value from the backend's perspective (its `.env`) rather than the shell's avoids the "where did my download go" mystery — the variable the shell sees and the variable the application reads are not guaranteed to match.

## Exercises

1. Without opening an editor, find every file that references `invalidate_track_index` and count them — one command.
2. A teammate says "the backend is down." Give the two-command investigation: first *is there a process*, then *what does its log's last error say*.
3. Explain the difference between `export ENV=dev` and adding `ENV=dev` to `api/.env` — who sees what, and when.
4. What does `grep -rn "Range" api/app/routers/stream_router.py -B1 -A3 | less` show, and why is `less` useful on that output specifically?
5. Construct the pipeline: list the ten largest files under `web/src` by line count. (Two commands, one pipe; `wc -l` and `sort -n` are the pieces.)
