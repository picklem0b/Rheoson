# Chapter 1 — What a Program Is

*Part I · Foundations*

---

Before any code, three questions worth answering precisely: what a program actually is, how the text in a file becomes a running process, and what happens between a tap in the Rheoson app and a song playing. Everything else in this handbook builds on those three answers.

## 1.1 Source code

A **program** is a sequence of instructions a computer executes. The instructions are written by people as **source code** — plain text files containing a programming language. Nothing about a source file is special: it can be opened with any text editor, read like a document, and edited freely.

The repository holds two programs written in two languages:

- `web/` — the frontend, written in **TypeScript**, a superset of JavaScript
- `api/` — the backend, written in **Python**

A third artifact, the Android app, is not source code at all. It is produced *from* the frontend by a build tool — Chapter 12 covers that process.

## 1.2 From text to running process

Computers execute only machine instructions. Every programming language sits somewhere on the spectrum between translating everything up front and translating as it runs:

- A **compiled** language (C, Go, Rust) translates the whole program to machine code before it runs. The translator is called a **compiler**, and its output runs directly on the processor.
- An **interpreted** language (Python, JavaScript) is read and executed line by line by another program called an **interpreter**. No separate compile step exists; the interpreter *is* the machine that runs the code.

TypeScript complicates the picture in a useful way. Browsers cannot execute TypeScript — they execute JavaScript. Before the frontend ships, a **transpiler** (the TypeScript compiler, `tsc`) converts the `.ts` and `.tsx` files into plain JavaScript. Transpiling is compiling between two languages of the same abstraction level: the output is JavaScript, not machine code. The type annotations exist only for the humans and the compiler; they vanish from the output.

So the Rheoson frontend actually runs three transformations deep:

```
web/src/**/*.tsx   →  Vite + tsc  →  dist/ JavaScript  →  browser executes
     (TypeScript)         (build)        (bundled)         (interpreter)
```

The backend skips all of this. Python is interpreted directly:

```
api/app/**/*.py  →  python (CPython interpreter) executes it
```

Running either program therefore means asking an interpreter to start reading it. `uvicorn app.main:socket_app` tells the Python interpreter: load the module `app/main.py`, find the object `socket_app` inside it, and serve network traffic with it. Chapter 9 unpacks that object; the point here is that "run the backend" is nothing more than a Python process executing a file.

## 1.3 Processes

A running program is a **process** — the operating system's unit of execution, with its own memory, its own open files, and its own lifetime. One laptop can run dozens of processes at once; the OS switches between them thousands of times a second.

Two properties of processes shape this codebase directly:

**Processes are isolated.** One process cannot read another's memory. That is why the frontend and backend are separate programs that communicate only through network messages rather than sharing variables — and it is why a backend crash never corrupts browser state, and vice versa.

**Processes die.** Power loss, crashes, deploys, and OS pressure all terminate processes. Anything a process holds *only in memory* is lost when it dies. The download service keeps its job table in a plain dictionary (`api/app/services/download_service.py`); a restart erases it, which is precisely why completed and failed jobs are additionally persisted to disk. "In memory" versus "on disk" recurs throughout this handbook, and Chapter 10 tabulates every piece of Rheoson state on that axis.

## 1.4 Files, directories, and paths

Source code, configuration, downloaded music, cached artwork — all are files organized into **directories** (folders), addressed by **paths**.

Two path styles matter:

- An **absolute path** starts at the filesystem root: `/home/lethabo/Rheoson/api/app/main.py`. It means the same thing regardless of where a command runs from.
- A **relative path** starts from the current working directory: from inside `api/`, the same file is `app/main.py`.

A leading `..` means "the parent directory," so from `api/app/` the repository root is `../..`. The project root is the directory containing `.git`, `CLAUDE.md`, and the two program folders — every path in this handbook is relative to it unless marked otherwise.

Rheoson leans on paths so heavily that several are configuration. `MUSIC_DIR` — where downloads land and the library scans — defaults to a Termux path on Android and `/tmp/Rheoson/music` on Render. Chapter 3 explains how a file outside the code sets that value.

## 1.5 Errors

Programs fail constantly, and the engineering skill is not avoiding failure but handling and diagnosing it. Errors surface in three distinct ways, and telling them apart is half of debugging (Chapter 15).

**Syntax errors** — the text does not parse. A missing bracket, an unclosed string. The interpreter or compiler refuses to start and points at the line. Nothing ran; nothing can be broken at runtime yet.

**Exceptions (runtime errors)** — the program started, ran, and hit an instruction it cannot execute: dividing by zero, opening a missing file, reading a property of `undefined`. Execution jumps out of the current function, up through callers, until something handles it or the process dies with a **stack trace** — the list of functions that were active when the error occurred, innermost first.

**Logic errors** — the program runs to completion and produces the wrong answer. No error appears anywhere. A shuffled queue that plays the same track twice, a duration formatted as `4500:50`. These are the hardest to find, and tests (Chapter 16) exist mostly to catch them.

Rheoson defines its own exception hierarchy on the backend (`api/app/core/exceptions.py`, rooted at `RheosonException`) so that known, expected failures — a track that no longer resolves, a search service outage — travel through the code as named types rather than anonymous strings. Chapter 6 shows how Python does this; Chapter 4 shows the JavaScript equivalent.

## 1.6 A request, end to end

With those pieces in place, the app's central transaction can be traced in full. A listener taps a track in the Android app.

```
1. Tap → React component calls a function in web/src/api/tracks.ts
2. That function builds an HTTP request:
     GET https://<api-host>/api/tracks/dQw4w9WgXcQ
3. The request travels the network to the backend process
4. FastAPI matches the URL to a route function in api/app/routers/track_router.py
5. The router asks services and caches for the data, then returns a dict
6. FastAPI converts the dict to JSON and sends an HTTP response
7. The frontend parses the JSON and stores the result in React state
8. React re-renders: the player bar shows the track
9. Separately, the audio itself arrives via GET /api/stream/{id}/audio
```

Every numbered step is a chapter of this handbook: steps 1–3 are Chapters 3, 4, and 7; steps 4–6 are Chapter 9; step 8 is Chapter 7. The URL in step 2 is worth pausing on — it names a *scheme* (`https`), a *host* (`rheoson-api-9e4c.onrender.com` in production, `127.0.0.1:8000` in development), a *path* (`/api/tracks/`), and an *identifier* (`dQw4w9WgXcQ`, a YouTube video ID). Most debugging questions reduce to "which step in that chain is wrong?" before anything else.

## 1.7 How to read code

Reading code is a skill distinct from writing it, and most professional time is spent reading. A workable method:

1. **Read the names first.** File names, function names, variable names. `download_service.py`, `enqueue_download()`, `_jobs` — the naming is the outline.
2. **Find the entry point.** For a route, the decorator line (`@router.post(...)`); for a React component, the exported function; for a module, what other files import from it.
3. **Follow one path, not every path.** Trace a single realistic call from entry to exit, ignoring branches until the main path is clear.
4. **Run it.** A breakpoint or a well-placed log line answers in a minute what an hour of reading may not.

Exercises built on this method run through the whole handbook, and Chapter 19 turns it into a pattern catalogue.

## Exercises

1. Classify each as compiled, transpiled, or interpreted at runtime: the `api/` backend; the code a browser executes from `web/dist/`; the `.tsx` files in the editor.
2. Name the four parts of `https://rheoson-api-9e4c.onrender.com/api/health`.
3. Explain, in process terms, why a finished download list survives a server restart but an in-flight one does not.
4. Open `api/app/main.py` and find the object `socket_app`. What type is it, and what does the name suggest it wraps?
5. Trace, without running anything: what file handles the request `GET /api/lyrics/{id}`, and what service does it call?
