# TypeScript in Practice — How This Repo Uses Types

*Stage 3. Companion to [02](../02-javascript/fundamentals.md) §8–9. This page is about the *working habits* of types here: where they live, what they protect, and what you must do when you change a shape.*

## 1. Where types live in this project

```
web/src/types/            ← shared shapes (Track, DownloadJob, Playlist…)
  ├── track.types         ← Track, Artist, Album
  ├── download.types      ← DownloadJob, DownloadStatus, FileNaming
  ├── openapi.json        ← the API contract, generated FROM the backend
  └── api-generated.ts    ← TypeScript generated from that contract
```

Two sources of truth, deliberately kept in sync:

1. **Hand-written** types in `web/src/types/*.types` describe data the frontend owns.
2. **Generated** types in `api-generated.ts` describe what the backend actually sends — produced from `api/scripts/export_openapi.py` output. If the backend changes a response, the backend tests fail the snapshot and `npx openapi-typescript` regenerates this file.

**Review habit:** when a diff touches an API response shape, expect three artifacts in the same PR: backend schema, regenerated `api-generated.ts`, and any frontend component that reads the changed field.

## 2. The one type that rules the frontend: `Track`

```ts
interface Track {
  id: string            // YouTube videoId (11 chars) OR md5 of a local file path
  title: string
  artist: Artist        // { id, name, imageUrl?, genres? }
  album: Album
  artworkUrl: string
  duration: number      // seconds
  streamUrl?: string    // ? = optional: may be absent
  isDownloaded: boolean
  isLiked: boolean
}
```

Read it as a contract with the backend. Every field you access on a track in UI code is checked against this — misspell `t.isDownloded` and the build fails. That failure *is* the value of TypeScript: the mistake costs seconds now instead of a blank row in production.

## 3. Unions beat booleans for states

A component that can be `loading | ready | error` should not hold three booleans (they can lie: `loading=true, error=true`?). This repo encodes such states as unions:

```ts
type DownloadStatus = 'queued' | 'downloading' | 'done' | 'error' | …
```

and maps them to UI with a lookup table:

```ts
// web/src/pages/downloads/components/DownloadRow.tsx (abridged)
const STATUS_CONFIG: Record<DownloadStatus, { label: string; color: string; icon: ReactNode }> = {
  queued:      { label: 'Queued',      color: 'surface', icon: <Download /> },
  done:        { label: 'Done',        color: 'success', icon: <CheckCircle2 /> },
  …
}
const cfg = STATUS_CONFIG[job.status] ?? STATUS_CONFIG.queued
```

**Why this is good:** add a status to the union and `tsc` lists every table you must update. That's the compiler writing your TODO list.

## 4. Optional fields and the drift guard pattern

Data that crossed a storage boundary (localStorage, an old cache, an older server) can be *older* than the current type. The codebase's defense is copy-then-default:

```ts
// web/src/pages/downloads/components/DownloadRow.tsx
const job = {
  ...jobProp,
  title: jobProp.title ?? 'Untitled',
  status: jobProp.status ?? 'queued',
  progress: typeof jobProp.progress === 'number' ? jobProp.progress : 0,
}
```

Types say what *should* exist; runtime guards say what to do when reality disagrees. Both are needed — types vanish at runtime, but the data was written by a build whose types were different.

## 5. Narrowing — the compiler following your logic

```ts
if (job.status === 'error') {
  show(job.error)        // OK: only 'error' jobs have a meaningful error
}
```

Inside the `if`, TypeScript *narrows* the union and allows what it refused outside. The same happens with `typeof x === 'string'`, `Array.isArray(x)`, and `in` checks. When the compiler complains "possibly undefined" and you *know* it can't be, the fix is usually a narrowing check — not `!` (the non-null assertion), which silences the compiler without checking anything. Search this repo for `!.` and you'll find it used only where an invariant is genuinely guaranteed.

## 6. Type-only imports

```ts
import type { Track } from '@/types/track.types'
```

`import type` is erased at build time — it exists purely for the compiler. Use it when a file needs the shape but not the runtime value; the ESLint config enforces this so bundles stay lean.

## 7. The env contract — `vite-env.d.ts`

```ts
// web/src/vite-env.d.ts (abridged)
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
}
```

Every environment variable the frontend reads is declared here. Consequence: `import.meta.env.VITE_API_URLL` is a *build error*, not a silent `undefined` in production. This file was added after a deployment shipped with a typo'd env var — that's the level of mistake this project makes the compiler catch on purpose.

## 8. When types and runtime disagree — contract tests

Because types vanish at runtime, the project also pins the *behavior*:

- Backend: `tests/test_guest_policy.py` pins which endpoints serve guests vs require accounts.
- Frontend: `web/src/__tests__/apiTarget.test.ts` pins how the API origin is chosen per platform.

Types catch shape mistakes; tests catch behavior mistakes. You need both, and [12](../12-testing/how-testing-works.md) teaches the second.

## Exercises

1. Add `spotifyId?: string` to the `Track` interface in a scratch branch. Run `npx tsc --noEmit`. Nothing should fail — optional additions are safe. Now *remove* `duration` and run it again: read the error list; that is every consumer the compiler found for you. Revert.
2. Find `STATUS_CONFIG` in `DownloadRow.tsx`. Add a fake status to the union (`'paused'`) without touching the table and run tsc. Copy the compiler's complaint into your notes — that error message is the pattern worth memorizing.
3. Why does `vite-env.d.ts` mark variables `readonly`? One sentence.
4. In `web/src/lib/apiTarget.ts`, identify every union type and where narrowing happens.
