# Chapter 3 — The Web and the Client–Server Model

*Part I · Foundations*

---

Rheoson is, structurally, two programs that never share memory: one runs in a browser or WebView, one runs on a server or a phone's own Linux environment. Everything between them is HTTP. This chapter covers that boundary — the request/response cycle, JSON, URLs, the division of responsibilities, databases, and the configuration glue that lets the same code run on a laptop, a phone, and a cloud server.

## 3.1 Clients and servers

A **client** is a program that sends requests; a **server** is a program that listens for them and answers. The words describe roles, not machines — the same laptop runs both during development (Vite's dev server and the browser), and the Android app is simultaneously a native shell and a web client.

The split of labor is the field's most durable division:

| | Frontend (`web/`) | Backend (`api/`) |
|---|---|---|
| Runs in | browser / WebView | a Python process |
| Written in | TypeScript, React | Python, FastAPI |
| Owns | what is seen and interacted with | data, truth, and long work |
| Trust level | zero — anything sent to it can be forged | absolute — it is the only thing with keys and disks |

The trust asymmetry drives real decisions here: the backend re-verifies every identity claim (Chapter 9), never trusts a price or a path or a permission the frontend asserts, and treats frontend input as unvalidated until a schema says otherwise. A practical corollary: anything computed only in the frontend (a total, a flag, an "isAdmin") is decoration until the backend confirms it.

## 3.2 HTTP

**HTTP** (HyperText Transfer Protocol) is the request/response convention both sides speak. A client opens a connection, sends a request, gets one response, done. The protocol's two halves:

**Request** — a method, a path, headers, sometimes a body:

```
POST /api/playlists HTTP/1.1
Host: rheoson-api-9e4c.onrender.com
Content-Type: application/json
Authorization: Bearer eyJhbGciOi…

{"title": "Late night drives"}
```

**Response** — a status, headers, usually a body:

```
HTTP/1.1 201 Created
Content-Type: application/json

{"id": "pl_9f2c", "title": "Late night drives", "trackIds": []}
```

**Methods** name the intent. The codebase uses five, and their mapping to actions is consistent enough to serve as documentation:

| Method | Meaning | Rheoson example |
|---|---|---|
| GET | read, never change anything | `/api/tracks`, `/api/search?q=` |
| POST | create, or an action | `/api/downloads` (start a job) |
| PATCH | partial update | `/api/playlists/{id}` (rename) |
| PUT | full replace of a subresource | `/api/auth/me/preferences` |
| DELETE | remove | `/api/tracks/{id}/like` |

**Status codes** summarize the outcome. Three families cover nearly everything: `2xx` succeeded (200 OK, 201 Created, 204 No Content); `4xx` the client erred (400 bad input, 401 unauthenticated, 403 unauthorized, 404 missing, 429 rate-limited); `5xx` the server erred (500, 502 — the code the stream route returns when every yt-dlp attempt fails). Reading a 401 as "no valid identity presented" versus a 403's "identity valid, permission absent" is a distinction the API maintains deliberately, and Chapter 9's auth section leans on it.

**Headers** are key/value metadata. Three appear constantly: `Content-Type` (what the body is — `application/json`, `audio/mp4`), `Authorization` (the identity token), and the `Range` family (`Range`, `Content-Range`, `Accept-Ranges`) that makes audio seekable — Chapter 9's streaming section is built on them.

**Statelessness** is the property that shapes everything else. HTTP itself remembers nothing: every request must carry whatever identity and context the server needs. That is why tokens travel on every call (Section 3.4) and why the backend can run as many workers as it likes without session affinity — a property Chapter 18 exploits.

## 3.3 JSON

**JSON** (JavaScript Object Notation) is the text format in which structured data crosses the boundary. It maps cleanly onto the objects of Chapter 2 — objects, arrays, strings, numbers, booleans, null — and nothing more. That "nothing more" matters: dates become strings, binary becomes base64 text or a URL, and there is no comment syntax, so structural meaning lives entirely in the data.

Every arrow in the Chapter 1 trace that crosses the boundary carries JSON. The frontend's API modules parse it (`await res.json()`); FastAPI produces it automatically from Python dicts and Pydantic models. One of the codebase's past bugs is instructive: an endpoint once returned an *HTML page* where the client expected JSON, and the failure surfaced as a cryptic parse error far from the cause — the response's `Content-Type` header (`text/html` versus `application/json`) would have identified it instantly. "Check the status, then the Content-Type, then the body" is the fixed order for diagnosing any API surprise.

## 3.4 URLs

A **URL** locates a resource:

```
https://rheoson-api-9e4c.onrender.com/api/tracks/liked?hydrate=true
└─┬──┘ └────────────┬─────────────────────┘└───────┬────────┘└───┬───┘
scheme            host                            path         query
```

- **scheme** — how to talk (`https`: encrypted HTTP)
- **host** — which machine and port
- **path** — which resource, hierarchical
- **query** — modifiers, after `?`, separated by `&`

The backend's path conventions are worth internalizing early, because they are the API's table of contents: `/api/{noun}` for collections, `/api/{noun}/{id}` for one, `/api/{noun}/{id}/{subresource}` for things inside one, verbs-in-a-noun for actions (`/api/downloads/{id}/cancel`, `/api/tracks/{id}/like`). Queries carry options, never identity — identity rides in the `Authorization` header.

Two URL-related security notes that surface later: the *host* is chosen by configuration, not hardcoded — the entire "API unreachable" class of bugs in this project's history came from that choice going wrong in a build (Chapter 18); and a URL that reaches the backend as *input* (a YouTube link to resolve or download) is untrusted data in the most literal sense — Chapter 9's hardening section covers what the backend does with it.

## 3.5 Frontend and backend in one breath

The two programs, and their standard conversation:

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│ Frontend                    │         │ Backend                      │
│                             │         │                              │
│ component                   │         │  router        service       │
│   │ calls                   │  HTTP   │    │             │           │
│   ▼                         │ ──────► │    ▼             ▼           │
│ api/tracks.ts ──────────────┼─────────┼──► validate → work → persist │
│   │ awaits JSON             │ ◄────── │        │                     │
│   ▼                         │         │        ▼                     │
│ store (Zustand)             │         │  MongoDB / disk files        │
│   │ state changes           │         │                              │
│   ▼                         │         │                              │
│ React re-renders            │         │  (also: Socket.IO push ──►)  │
└─────────────────────────────┘         └──────────────────────────────┘
```

One line on that diagram is not HTTP and changes the experience fundamentally: the arrow from backend to frontend labeled Socket.IO. HTTP only allows the client to ask; when a download's progress changes at 80%, the frontend has no reason to poll. The backend therefore holds a second, *persistent* connection (a WebSocket) over which it **pushes** events — `download:progress`, `download:done` — the moment they happen. Request/response for问答, push for immediacy; Chapter 9 details both.

## 3.6 Databases

A **database** is a program that stores data durably and answers questions about it quickly. The frontend never talks to it directly; it is the backend's private memory.

Rheoson uses **MongoDB**, a *document* database: instead of tables and rows, collections of JSON-like documents that may differ in shape. A user, a taste profile, a listening event — each a document in a named collection, queried by field. Chapter 10 teaches the query language and tabulates every collection; the concept to hold now is the contrast with *relational* databases (tables, fixed columns, SQL joins), which the project chose against because its per-user data is naturally document-shaped.

Not everything belongs in a database, and knowing where each kind of state lives is core codebase literacy. A track's metadata is *derived* from files on disk; liked tracks and playlists are small, single-writer, and live as JSON files; in-flight download progress is per-connection and lives in memory, pushed over Socket.IO. The rule of thumb the codebase follows: *durable, queryable, multi-entity → MongoDB; per-user small state → JSON sidecar; ephemeral → memory + push*. Chapter 10 formalizes it.

## 3.7 Environment variables

Programs differ per environment not in code but in **configuration**: where the database is, which origins may call in, what the secrets are. The convention is **environment variables** — named values provided by the shell or a file, read at startup, never committed to Git.

The backend reads a file `api/.env` at startup (pydantic-settings turns each line into typed settings in `api/app/core/config.py`):

```bash
MUSIC_DIR=/home/lethabo/Rheoson/music
MONGODB_URL=mongodb+srv://…
CLERK_SECRET_KEY=sk_test_…
CORS_ORIGINS=["https://rheoson.onrender.com","capacitor://localhost"]
```

Three rules carry real weight here, each learned from a real incident in this project's history:

1. **One key per line.** A paste that ran two keys together (`…JACLERK_SECRET_KEY=…`) silently produced garbage credentials, and auth "mysteriously" failed. Formatting is correctness.
2. **Backend keys never go in frontend files.** Anything without a `VITE_` prefix is invisible to Vite — pasting `CORS_ORIGINS` into `web/.env` does nothing except mislead.
3. **Secrets are gitignored.** The repository tracks `.env.example` templates (documented, no real values) and ignores `.env` itself. A secret that reaches a commit must be rotated, not deleted — history remembers.

The frontend's equivalent is build-time rather than runtime: `VITE_API_URL` and `VITE_CLERK_PUBLISHABLE_KEY` are baked into the bundle when `npm run build` runs, which is why changing the API host means rebuilding — and why the build verifies the value is present (Chapter 12).

## 3.8 Build tools and package managers

Source code is not deployable by itself; a toolchain assembles it.

**Package managers** install libraries. The frontend uses **npm**: `package.json` declares direct dependencies, `package-lock.json` pins exact versions so every install is reproducible, `npm install` materializes them into `node_modules/` (gitignored — rebuilt from the lockfile). The backend uses **uv**: `pyproject.toml` declares dependencies, `uv.lock` pins them, `uv sync` creates a virtual environment. Declared-versus-locked is the same idea in both worlds: *what we use* versus *exactly which bytes, this commit*.

**Build tools** compile and bundle. Vite takes `web/src`, type-checks, tree-shakes, bundles into hashed files under `dist/`, and injects the PWA service worker. The output is static: any file server can host it, which is precisely what the Android WebView and the web hosts do. Python needs no build for development, but Docker packages it into an image — a filesystem snapshot plus a start command — which is how production runs it (Chapter 18).

**Why a dev server at all?** Vite's dev mode serves the source directly with instant reloads and one more job of lasting importance here: a **proxy**. The dev frontend calls `/api` on its own origin, and Vite forwards it to `127.0.0.1:8000`, sidestepping the browser's cross-origin rules during development. Production has no proxy — which is why the API base URL is absolute there. That one difference explains most "works in dev, not in prod" reports this codebase has ever had.

## 3.9 Putting the chapter together

The full path of a search, in the vocabulary now established:

1. Input in the search page; React state updates (Chapter 7).
2. A debounced effect (awaiting an async function, Chapter 2) calls `searchApi.search(q)` (Chapter 4's modules).
3. Vite's proxy (dev) or the absolute API URL (prod) delivers `GET /api/search?q=…` (this chapter).
4. FastAPI validates the query parameter, fans the query out to YouTube Music concurrently (`Promise.all`'s Python twin, Chapter 2), and returns JSON.
5. The query hook stores the result; React re-renders the results grid.
6. In parallel, the backend pre-warms stream URLs for the top results so the first tap plays sooner (Chapter 9).

Each sentence is load-bearing, and each names a chapter that turns it into practice.

## Exercises

1. For each, state the method and status the API should return: renaming a playlist that exists; renaming one that does not; requesting the liked list with no token; deleting another person's playlist when playlists are user-scoped.
2. Decode this URL into its four parts and say what each does: `https://api.example.com/api/downloads/batch?limit=20`.
3. In `web/src/lib/constants.ts`, find how `API_BASE` differs between dev and prod, and explain the mechanism Vite uses to make that possible.
4. The chapter claims "the frontend never talks to MongoDB directly." Find the code that proves it: which layer in `api/` is the only one to import the database client?
5. A teammate reports "search returns HTML instead of JSON." Using Section 3.3's fixed order, list the three things to check, in order, before opening any code.
