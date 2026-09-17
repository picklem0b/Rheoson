# Terminal & Linux — Working on Rheoson from a Shell

*Stage 9. The terminal is a text window where you type commands to the OS. Slower to learn than clicking, but everything in this repo (tests, git, servers, devices) is driven from it.*

## 1. The absolute basics

You type a **command**, press Enter, the shell runs it and prints output. The prompt shows where you are:

```bash
pwd                 # print working directory — "where am I?"
ls                  # list files here
ls -la              # …including hidden ones (.env hides itself with a dot)
cd web              # change directory → into web/
cd ..               # up one level
cd ~                # home directory
```

**Exercise:** open a terminal in the repository root. `pwd`. `ls`. `cd api && ls`. You're looking at the backend. `cd ..` back.

## 2. Files and folders

```bash
mkdir notes                 # make directory
cp a.txt b.txt              # copy
cp -r web/src /tmp/backup   # copy a whole folder recursively
mv old.txt new.txt          # move or rename
rm file.txt                 # delete (no trash can!)
rm -r folder/               # delete folder + contents (careful)
cat notes.txt               # print a file
less big.log                # page through a file (q to quit, /text to search)
```

Golden rule: **`rm` has no undo.** If a command will delete, read it twice. This is why the project's cleanup scripts use `git mv` — git remembers.

## 3. Reading and searching — the daily drivers

```bash
grep -rn "Invalid or expired" api/app
#    -r recursive   -n line numbers    → api/app/core/deps.py:71

grep -rn "usePlayerStore" web/src --include="*.tsx" | wc -l
# pipes | send output to the next command — wc -l counts lines

find web/src -name "*.test.ts"          # find files by name
find . -name "*.tsx" | xargs grep -l "useState" | head
```

`grep` is how you navigate a codebase you don't know: search for a string you can see on screen (an error message, a button label) and you're within one file of the cause.

**Exercise:** the app shows "Authentication required". Find every file involved using only grep. (You'll need the `-i` flag — why?)

## 4. Pipes and redirects

```bash
command1 | command2        # pipe: output of 1 becomes input of 2
command > file.txt         # redirect output INTO a file (overwrites)
command >> file.txt        # append instead
command 2> errors.txt      # redirect the error stream
npm test 2>&1 | tail -20   # merge errors into output, show last 20 lines
```

## 5. Environment variables

```bash
export RHEOSON_API_TARGET=http://127.0.0.1:9000   # set for this session
echo $RHEOSON_API_TARGET                           # read
env | grep RHEOSON                                 # see all that match
```

These are the same variables `.env` files hold (see [00 §8](../00-start-here/what-is-programming.md)). In this project you'll most often use `VITE_*` (frontend build) and the API's settings via `api/.env`.

## 6. Processes

```bash
ps aux | grep uvicorn      # is the backend running?
kill 12345                 # stop process 12345 (from ps output)
Ctrl+C                     # stop the foreground process (the polite way)
```

If port 8000 is "already in use", an old server is alive: `ps aux | grep uvicorn`, `kill <pid>`.

## 7. The commands you'll actually run here

```bash
# ── backend ────────────────────────────────────────────
cd api
uv sync                                        # install python deps
uv run uvicorn app.main:socket_app --reload    # run server (auto-restarts on edit)
uv run pytest -q                               # run all backend tests
uv run python scripts/export_openapi.py        # regenerate the API contract

# ── frontend ───────────────────────────────────────────
cd web
npm install                                    # install node deps
npm run dev                                    # dev server on :3000 (proxies /api)
npm test -- --run                              # unit tests once
npx tsc --noEmit                               # typecheck (CI gate)
npx eslint src                                 # lint (CI gate)
npm run build                                  # production build → dist/
npm run verify                                 # build-guard checks

# ── full stack on device (Termux/Android) ─────────────
RHEOSON_DEV_URL=http://<LAN-IP>:3000 npx cap run android
```

Memorize the four you'll use hourly: `uv run pytest -q`, `npm run dev`, `npx tsc --noEmit`, `npm test -- --run`.

## 8. A tiny real workflow

```bash
# 1. see what's changed
git status --short
git diff                        # unstaged changes, line by line

# 2. run the gates before committing (CONTRIBUTING.md requires it)
cd api && uv run pytest -q
cd ../web && npx tsc --noEmit && npm test -- --run

# 3. commit (see 10-git for the full story)
git add api/app/routers/track_router.py
git commit -m "fix(tracks): clamp trending limit to 50"
```

## 9. When something goes wrong

- `command not found` → not installed, or not on PATH. Check `which command`.
- `Permission denied` → maybe `chmod +x script.sh`; never `sudo` your way around project files.
- `EADDRINUSE :8000` → old process still listening (§6).
- Terminal "frozen" → you're probably inside `less` or a crashed REPL: `q`, or `Ctrl+C`, or `:q!`.

## Exercises

1. Count the TypeScript files in the repo: `find . -name "*.ts" -not -path "*/node_modules/*" | wc -l`.
2. Find the biggest file in `api/app/services/`: `ls -S api/app/services/ | head -3`. Open the top one and read only its imports — which other modules does it depend on?
3. Pipe drill: `grep -rn "TODO" web/src | wc -l`. Then exclude tests: add `--include="*.ts" --include="*.tsx"` and compare.
4. Start the backend, then from a second terminal: `curl -s http://127.0.0.1:8000/api/health | head -c 200`. You've just spoken HTTP to a server you started.
