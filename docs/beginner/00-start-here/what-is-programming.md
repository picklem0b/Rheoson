# What Is Programming?

*Absolute zero assumed. Everything here is explained with Rheoson as the running example.*

## 1. What programming is

A computer is a very fast, very obedient, very literal machine. It does exactly what it is told — nothing more, nothing less, and nothing clever. **Programming is writing down instructions so precisely that a machine can follow them.**

Those instructions are called a **program**. Rheoson is a program: when you tap a song, some instructions run that find the song's audio, send it over the network, and tell your device to make sound. Millions of small instructions, written by people, executing in order.

## 2. What source code is

Computers only truly understand raw electrical signals represented as numbers (machine code). Nobody writes that. Instead we write **source code** — human-readable text in a programming language — and other programs translate it into machine instructions.

Open any file in this repository and you're looking at source code. For example, `web/src/lib/formatters.ts` contains a small function that converts `213` seconds into `"3:33"`:

```ts
export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
```

That is source code: text, written by a person, that a computer will translate and run every time a track duration needs showing.

**Source code is just text.** You can read it, edit it with any text editor, and — this is the important part — *break it and fix it* without fear. Git (see [10](../10-git/git-and-github.md)) remembers every version, so nothing is ever truly lost.

## 3. Files, folders, directories, paths

Code lives in **files**, files live in **folders** (also called **directories**), and a **path** is a file's address.

```
Rheoson/                        ← the repository root (the top folder)
├── api/                        ← backend code (Python)
│   └── app/
│       ├── main.py             ← backend entry point
│       └── routers/
│           └── track_router.py ← "get me all tracks" lives here
└── web/                        ← frontend code (TypeScript)
    └── src/
        ├── pages/
        │   └── home/Home.tsx   ← the Home screen
        └── lib/
            └── formatters.ts   ← the duration function above
```

- `web/src/lib/formatters.ts` is a **relative path** — it starts at the repository root.
- `/root/Rheoson/web/src` is an **absolute path** — it starts at the disk's root.
- `.` means "this folder", `..` means "the folder above".

**Exercise:** find `formatDuration` in `web/src/lib/formatters.ts` and write down its path relative to the repository root. Then find one file in `api/app/services/` and one in `web/src/store/`.

## 4. The four ideas underneath everything

### Variables — a labeled box for a value

```ts
let plays = 0          // a box labeled "plays" containing the number 0
plays = plays + 1      // open the box, add 1, put it back. plays is now 1
```

`let` means the value can change. In this codebase you'll see the modern versions `const` (cannot be reassigned) used everywhere, and rarely `let`:

```ts
const MAX_QUERY_LEN = 200   // a constant — this never changes while running
```

### Functions — a reusable recipe

```ts
function greet(name) {
  return "Hello, " + name
}
greet("Lethabo")   // → "Hello, Lethabo"
```

A function takes **parameters** (here: `name`), does something, and hands back a **return value**. The `formatDuration(213)` example above takes a number, returns a string. When you see `something(...)` with parentheses, a function is being *called* (run).

### Conditions — decisions

```ts
if (track.isDownloaded) {
  playFromDisk(track)
} else {
  streamFromInternet(track)
}
```

The player bar does exactly this shape of thing on every tap: is the file already on the device? Then play it locally (instant). Otherwise, stream it.

### Loops — doing something many times

```ts
for (const track of tracks) {
  console.log(track.title)
}
```

The library screen loops over every track in your collection to draw a row for each one.

## 5. Kinds of values (data types)

| Type | Example | Used in Rheoson for |
|---|---|---|
| **string** (text) | `"Never Gonna Give You Up"` | titles, artist names, URLs |
| **number** | `212.5` | durations (seconds), volume (0–1) |
| **boolean** (true/false) | `true` | `isPlaying`, `isDownloaded`, `isLiked` |
| **array** (ordered list) | `["a", "b", "c"]` | the play queue, search results |
| **object** (labeled boxes together) | `{ title: "x", duration: 212 }` | a Track — see below |

A whole track is one object with nested objects inside:

```ts
{
  id: "dQw4w9WgXcQ",
  title: "Never Gonna Give You Up",
  duration: 213,
  isDownloaded: false,
  artist: { id: "UCuAX...", name: "Rick Astley" },   // object inside object
  album:  { title: "Whenever You Need Somebody", trackCount: 10 },
}
```

Arrays of objects are the bread and butter of this app: the queue is an array of track objects; search returns an array of track objects; your library is an array of track objects.

## 6. Frontend vs backend, client vs server

Two programs cooperate to make Rheoson work:

- The **frontend** (`web/`) is what you see and touch — the screens, buttons, the player. It runs *on your device* inside the app or browser. Also called the **client**.
- The **backend** (`api/`) is a program running on a computer somewhere else (your phone via Termux, or a rented server). It owns the music files, the search, the downloads. It is the **server**.

They talk over **HTTP** — the same protocol your browser uses for every website. The frontend sends a *request* ("give me search results for *adele*"), the backend sends back a *response* (a list of tracks as JSON). This is an **API** conversation, and [06](../06-backend/api-guide.md) documents every such conversation Rheoson's two halves can have.

```
Frontend (React, on your device)          Backend (FastAPI, on a server)
        │                                        │
        │  GET /api/search?q=adele               │
        │ ─────────────────────────────────────► │  asks YouTube Music
        │                                        │  scans local files
        │  ◄─────── [{title: ...}, {title: ...}] │
        │      JSON list of tracks               │
```

## 7. JSON — how data travels

**JSON** (JavaScript Object Notation) is text that describes data. It looks exactly like the object notation above, which is not a coincidence — it was borrowed from JavaScript and became the universal exchange format of the web. When the backend answers a search, the body of the response is JSON text; the frontend turns that text back into objects it can use.

## 8. Environment variables — configuration without code

Some settings differ per machine: where music files live, secret API keys, whether we're in development or production. These are provided as **environment variables** — named values set outside the code. Rheoson reads them in `api/app/core/config.py` and `web/src/lib/constants.ts`. That's why there are `.env` files (never committed — they hold secrets) and `.env.example` files (committed templates showing *which* variables exist).

## 9. Build tools and package managers

Modern apps are assembled from hundreds of published libraries ("packages"). A **package manager** downloads them:

- `npm` — for the frontend. `web/package.json` lists them; `npm install` fetches them.
- `uv` / `pip` — for the backend. `api/pyproject.toml` lists them.

A **build tool** (Vite, for `web/`) takes the source code and produces the optimized files that actually ship — that's what `npm run build` does, and why its output lands in `web/dist/`.

## 10. Where you are on the map

You now know: programs are text instructions; they live in files; values live in variables; functions are recipes; code makes decisions and loops; the frontend and backend talk over HTTP using JSON; configuration comes from environment variables; libraries are managed by package managers.

Every folder in this course builds on exactly these ideas. Next: [01 — Variables, Functions & Data](../01-programming-basics/variables-functions-data.md), where each idea gets deeper treatment with real code from this repository.

## Practice

1. Open `web/src/lib/formatters.ts` and read `formatDuration("seconds")`. What does `formatDuration(61)` return? (Trace it by hand.)
2. Find the file that contains the string `"Invalid or expired token"` (`grep -r "Invalid or expired" api/app`). Is it frontend or backend? Front of house or back of house?
3. In your own words: what is the difference between `web/` and `api/`? One sentence.
